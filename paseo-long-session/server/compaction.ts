import type { PluginHandlerContext, PluginHookEvents } from "@getpaseo/plugin/server";
import {
  clampCompactThreshold,
  DEFAULT_COMPACT_THRESHOLD_TOKENS,
  DEFAULT_LONG_SESSION_SETTINGS,
  GLOBAL_ASSISTANT_LABEL,
  LONG_SESSION_ENABLED_LABEL,
  LONG_SESSION_SYNC_METADATA,
  LONG_SESSION_THRESHOLD_LABEL,
  LongSessionSyncStateSchema,
  MAX_COMPACT_THRESHOLD_TOKENS,
  MIN_COMPACT_THRESHOLD_TOKENS,
  type LongSessionSettings,
} from "../shared/protocol.ts";

export interface TimelineEntryLike {
  turnId?: string | null;
  item?: {
    type?: unknown;
    text?: unknown;
  };
}

export function isLongSessionEligible(
  agent: { provider: string; labels?: Readonly<Record<string, string>> },
  settings: Pick<LongSessionSettings, "enabledForAllAntigravity"> = DEFAULT_LONG_SESSION_SETTINGS,
): boolean {
  const labels = agent.labels ?? {};
  if (labels[LONG_SESSION_ENABLED_LABEL] === "true") return true;
  if (labels[GLOBAL_ASSISTANT_LABEL] === "true") return true;
  if (settings.enabledForAllAntigravity && (agent.provider === "antigravity" || agent.provider === "agy")) {
    return true;
  }
  return false;
}

function parseLabelThreshold(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  const rounded = Math.floor(parsed);
  if (rounded < MIN_COMPACT_THRESHOLD_TOKENS) return MIN_COMPACT_THRESHOLD_TOKENS;
  if (rounded > MAX_COMPACT_THRESHOLD_TOKENS) return MAX_COMPACT_THRESHOLD_TOKENS;
  return rounded;
}

export function resolveEffectiveThreshold(
  labels: Readonly<Record<string, string>> | undefined,
  settings: Partial<Pick<LongSessionSettings, "defaultThresholdTokens">> = DEFAULT_LONG_SESSION_SETTINGS,
): number {
  const labelOverride = parseLabelThreshold(labels?.[LONG_SESSION_THRESHOLD_LABEL]);
  if (labelOverride !== undefined) return labelOverride;
  if (typeof settings.defaultThresholdTokens === "number") {
    return clampCompactThreshold(settings.defaultThresholdTokens);
  }
  return DEFAULT_COMPACT_THRESHOLD_TOKENS;
}

export function isCompactionTurn(
  entries: readonly TimelineEntryLike[],
  turnId: string,
  compactCommand: string = DEFAULT_LONG_SESSION_SETTINGS.compactCommand,
): boolean {
  const cmdName = compactCommand.trim().replace(/^\//, "").split(/\s+/)[0] || "compact";
  const escaped = cmdName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cmdPattern = new RegExp(`^\\/${escaped}(?:\\s|$)`);

  return entries.some((entry) => {
    if (entry.turnId !== turnId) return false;
    const item = entry.item;
    if (!item || typeof item !== "object") return false;
    if (item.type === "compaction") return true;
    if (item.type === "user_message" && typeof item.text === "string") {
      return cmdPattern.test(item.text.trimStart());
    }
    return false;
  });
}

function supportsCompactCommand(commands: readonly { name: string; kind?: string }[], compactCommand: string): boolean {
  const cmdName = compactCommand.trim().replace(/^\//, "").split(/\s+/)[0] || "compact";
  return commands.some(({ name, kind }) => name === cmdName && kind === "command");
}

export async function handleTurnAfter(
  event: PluginHookEvents["agent.turn.after"],
  context: PluginHandlerContext,
  settings: LongSessionSettings = DEFAULT_LONG_SESSION_SETTINGS,
): Promise<void> {
  const { agent, outcome, turnId } = event;
  if (outcome.kind !== "completed" || !turnId) return;

  const session = context.paseo.agents.ref(agent.id);
  const refreshed = await session.refresh();
  const labels =
    refreshed?.agent?.labels ??
    (agent as { labels?: Readonly<Record<string, string>> }).labels;

  if (!isLongSessionEligible({ provider: agent.provider, labels }, settings)) return;

  const { entries } = await session.timeline.refetch({
    direction: "tail",
    limit: 1,
    wholeTurns: true,
  });

  if (entries.at(-1)?.turnId !== turnId || session.archivedAt || session.activeTurn) {
    return;
  }

  const compactCommand = settings.compactCommand?.trim() || DEFAULT_LONG_SESSION_SETTINGS.compactCommand;
  const typedEntries = entries as unknown as TimelineEntryLike[];

  if (isCompactionTurn(typedEntries, turnId, compactCommand)) {
    const rawMeta =
      refreshed?.agent?.metadata?.[LONG_SESSION_SYNC_METADATA] ??
      (session as { metadata?: Readonly<Record<string, unknown>> }).metadata?.[LONG_SESSION_SYNC_METADATA] ??
      agent.metadata?.[LONG_SESSION_SYNC_METADATA];
    const parsedPrev = LongSessionSyncStateSchema.safeParse(rawMeta);
    const prev = parsedPrev.success ? parsedPrev.data : { compactionCount: 0, lastSyncedMemoryHash: null };

    await session.setMetadata({
      [LONG_SESSION_SYNC_METADATA]: {
        pendingMemorySync: true,
        lastSyncedMemoryHash: prev.lastSyncedMemoryHash ?? null,
        compactedAtTurnId: turnId,
        compactedAt: new Date().toISOString(),
        compactionCount: prev.compactionCount + 1,
      },
    });
    return;
  }

  const threshold = resolveEffectiveThreshold(labels, settings);
  if ((session.lastUsage?.contextWindowUsedTokens ?? 0) < threshold) {
    return;
  }

  const { commands } = await session.commands();
  if (!supportsCompactCommand(commands, compactCommand)) {
    return;
  }

  // Re-verify usage and idle state after async commands() probe
  if (session.archivedAt || session.activeTurn) return;
  if ((session.lastUsage?.contextWindowUsedTokens ?? 0) < threshold) return;

  await session.send(compactCommand, {
    activeTurnBehavior: "steer",
    messageId: `long-session-compact:${turnId}`,
  });
}
