/**
 * Purpose: List and load Paseo and local harness sessions for analytics selection.
 * Context: Server analytics module bridging Paseo agents/timelines and local harness logs.
 * Usage: Called by analyticsSessionsListRpc and runAnalytics when sessionIds are provided.
 * Prerequisites: PaseoApi instance for Paseo agent/timeline queries; local harness dirs optional.
 */
import type {
  AnalyticsSessionItem,
  AnalyticsSessionListInput,
  AnalyticsSessionListOutput,
  HarnessKind,
} from "../../shared/analytics";
import { BOT_LABEL } from "../../shared/bot";
import type { PaseoApi } from "../paseo";
import {
  POLLING_TOOLS,
  finalizeTurns,
  loadHarnessSessions,
  parseDateRange,
  pushToolSummary,
  type DateRange,
  type ExtractedSession,
  type HarnessDirs,
  type TurnAcc,
} from "./harnesses";

const UNBOUNDED_RANGE: DateRange = {
  start: new Date(0),
  end: new Date(8640000000000000),
  label: "all",
};

const MAX_TIMELINE_PAGES = 10;
const TIMELINE_PAGE_SIZE = 200;

function resolveListRange(input: AnalyticsSessionListInput): DateRange | null {
  if (input.from || input.to || input.days || input.hours) {
    return parseDateRange(input);
  }
  return null;
}

async function listPaseoSessions(
  paseo: PaseoApi,
  includeArchived: boolean,
  limit: number,
  range: DateRange | null,
): Promise<AnalyticsSessionItem[]> {
  const page = await paseo.agents.list({
    filter: { includeArchived, includeBackground: true },
    sort: [{ key: "updated_at", direction: "desc" }],
    page: { limit },
  });
  const items: AnalyticsSessionItem[] = [];
  for (const { agent } of page.entries) {
    const updatedMs = Date.parse(agent.updatedAt);
    if (range && Number.isFinite(updatedMs)) {
      if (updatedMs < range.start.getTime() || updatedMs > range.end.getTime()) continue;
    }
    const botId = agent.labels?.[BOT_LABEL];
    items.push({
      id: `paseo:${agent.id}`,
      source: "paseo",
      harness: "paseo",
      title: agent.title?.trim() || agent.id,
      ...(botId ? { botId } : {}),
      archived: Boolean(agent.archivedAt),
      updatedAt: agent.updatedAt,
    });
  }
  return items;
}

function listLocalHarnessSessions(
  harness: HarnessKind,
  limit: number,
  range: DateRange | null,
  dirs?: HarnessDirs,
): AnalyticsSessionItem[] {
  const extracted = loadHarnessSessions(harness, range ?? UNBOUNDED_RANGE, limit, dirs);
  return extracted.map((s) => {
    const firstUser = s.turns[0]?.user?.replace(/\s+/g, " ").trim() || "";
    return {
      id: `harness:${s.harness}:${s.sessionId}`,
      source: "harness",
      harness: s.harness,
      title: firstUser ? firstUser.slice(0, 80) : s.sessionId,
      archived: false,
      updatedAt: s.endTime.toISOString(),
      messageCount: s.turns.length,
    };
  });
}

export async function listAnalyticsSessions(
  input: AnalyticsSessionListInput,
  ctx: { paseo?: PaseoApi },
  dirs?: HarnessDirs,
): Promise<AnalyticsSessionListOutput> {
  const limit = input.limit ?? 100;
  const includeArchived = input.includeArchived ?? true;
  const harness = input.harness ?? "all";
  const range = resolveListRange(input);

  const [paseoItems, harnessItems] = await Promise.all([
    ctx.paseo && harness === "all"
      ? listPaseoSessions(ctx.paseo, includeArchived, limit, range).catch(() => [])
      : Promise.resolve([]),
    Promise.resolve(listLocalHarnessSessions(harness, limit, range, dirs)),
  ]);

  const merged = [...paseoItems, ...harnessItems].sort(
    (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
  );
  return { sessions: merged.slice(0, limit) };
}

type TimelinePage = Awaited<ReturnType<ReturnType<PaseoApi["agents"]["ref"]>["timeline"]["refetch"]>>;
type TimelineEntry = TimelinePage["entries"][number];

async function fetchPaseoTimelineEntries(paseo: PaseoApi, agentId: string): Promise<TimelineEntry[]> {
  const timeline = paseo.agents.ref(agentId).timeline;
  const all: TimelineEntry[] = [];
  const cursors = new Set<string>();
  let before: TimelinePage["startCursor"] | undefined;

  for (let i = 0; i < MAX_TIMELINE_PAGES; i++) {
    const page = await timeline.refetch({
      direction: before ? "before" : "tail",
      projection: "projected",
      limit: TIMELINE_PAGE_SIZE,
      ...(before ? { cursor: before } : {}),
    });
    if (page.error || !page.entries.length) break;
    all.unshift(...page.entries);
    if (!page.hasOlder || !page.startCursor) break;
    const key = JSON.stringify(page.startCursor);
    if (cursors.has(key)) break;
    cursors.add(key);
    before = page.startCursor;
  }
  return all;
}

function buildPaseoSession(agentId: string, entries: TimelineEntry[], maxSnippet = 600): ExtractedSession | null {
  const accs: TurnAcc[] = [];
  const counts: Record<string, number> = {};
  const skills = new Set<string>();
  let startTime: Date | null = null;
  let endTime: Date | null = null;
  let errorCount = 0;

  for (const entry of entries) {
    const ts = entry.timestamp ? new Date(entry.timestamp) : null;
    if (ts && !Number.isNaN(ts.getTime())) {
      if (!startTime || ts < startTime) startTime = ts;
      if (!endTime || ts > endTime) endTime = ts;
    }
    const item = entry.item as Record<string, unknown>;
    if (!item || typeof item.type !== "string") continue;

    if (item.type === "user_message" && typeof item.text === "string" && item.text.trim()) {
      accs.push({ turn: { user: item.text.trim().slice(0, maxSnippet), tools: [], telemetry: "", reply: "" }, thought: "", events: [], pendingIdx: 0 });
    } else if (item.type === "assistant_message" && typeof item.text === "string" && item.text.trim()) {
      const cur = accs[accs.length - 1];
      if (cur) cur.turn.reply = item.text.trim().slice(0, 1000);
    } else if (item.type === "tool_call") {
      const cur = accs[accs.length - 1];
      const name = typeof item.name === "string" ? item.name : typeof item.toolName === "string" ? item.toolName : "tool";
      const args = (item.input ?? item.args ?? item.arguments ?? {}) as Record<string, unknown>;
      pushToolSummary(cur?.turn, name, args, counts, skills);
      const isErr = item.status === "error" || item.status === "failed" || Boolean(item.error);
      if (isErr) errorCount++;
      if (cur && !POLLING_TOOLS.has(name)) {
        const outRaw = item.error ?? item.output ?? item.result;
        const output = typeof outRaw === "string" ? outRaw : outRaw !== undefined ? JSON.stringify(outRaw) : undefined;
        cur.events.push({ name, args, status: isErr ? "ERR" : "OK", ...(output !== undefined ? { output } : {}) });
      }
    } else if (item.type === "error") {
      errorCount++;
    }
  }

  if (accs.length === 0) return null;
  const fallback = new Date();
  return {
    harness: "paseo",
    sessionId: agentId,
    startTime: startTime ?? fallback,
    endTime: endTime ?? startTime ?? fallback,
    turns: finalizeTurns(accs),
    toolCounts: counts,
    skillsRead: [...skills],
    subagentsSpawned: [],
    errorCount,
  };
}

export async function loadSelectedSessions(
  sessionIds: string[],
  opts: { paseo?: PaseoApi; dirs?: HarnessDirs },
): Promise<ExtractedSession[]> {
  const out: ExtractedSession[] = [];
  const harnessCache = new Map<"agy" | "claude" | "pi", ExtractedSession[]>();

  for (const id of sessionIds) {
    if (id.startsWith("paseo:")) {
      if (!opts.paseo) continue;
      const agentId = id.slice("paseo:".length);
      if (!agentId) continue;
      const entries = await fetchPaseoTimelineEntries(opts.paseo, agentId).catch(() => []);
      const session = buildPaseoSession(agentId, entries);
      if (session) out.push(session);
    } else if (id.startsWith("harness:")) {
      const rest = id.slice("harness:".length);
      const sep = rest.indexOf(":");
      if (sep <= 0) continue;
      const h = rest.slice(0, sep);
      const sid = rest.slice(sep + 1);
      if (h !== "agy" && h !== "claude" && h !== "pi") continue;
      let pool = harnessCache.get(h);
      if (!pool) {
        pool = loadHarnessSessions(h, UNBOUNDED_RANGE, 500, opts.dirs);
        harnessCache.set(h, pool);
      }
      const match = pool.find((s) => s.sessionId === sid);
      if (match) out.push(match);
    }
  }

  return out.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());
}
