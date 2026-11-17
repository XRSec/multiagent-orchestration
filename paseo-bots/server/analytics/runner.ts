import { ANALYTICS_ANALYZE_BOT_ID, ANALYTICS_CLEAN_BOT_ID, type AnalyticsRunInput, type AnalyticsRunOutput } from "../../shared/analytics";
import { formatDigest, formatSessionBlock, loadHarnessSessions, parseDateRange, type ExtractedSession, type HarnessDirs } from "./harnesses";
import { askBot, type AnalyticsExecContext } from "./runtime";
import { loadSelectedSessions } from "./sessions";

/** Stage 1: the clean bot gets the distilled sessions in batches that fit `maxChars`. */
async function cleanInBatches(sessions: ExtractedSession[], maxChars: number, exec?: AnalyticsExecContext): Promise<string> {
  const batches: string[] = [];
  let current = "";
  for (const s of sessions) {
    const block = formatSessionBlock(s);
    if (current && current.length + block.length + 2 > maxChars) {
      batches.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) batches.push(current);
  const out: string[] = [];
  for (const b of batches) {
    out.push(await askBot(ANALYTICS_CLEAN_BOT_ID, b, exec));
  }
  return out.join("\n\n---\n\n");
}

export async function runAnalytics(input: AnalyticsRunInput, dirs?: HarnessDirs, exec?: AnalyticsExecContext): Promise<AnalyticsRunOutput> {
  const hasSelected = Boolean(input.sessionIds && input.sessionIds.length > 0);
  const sessions = hasSelected
    ? await loadSelectedSessions(input.sessionIds!, { paseo: exec?.paseo, dirs })
    : loadHarnessSessions(input.harness, parseDateRange(input), input.maxSessions, dirs);
  const range = hasSelected
    ? { start: sessions[0]?.startTime ?? new Date(), end: sessions[0]?.endTime ?? new Date(), label: `selected (${sessions.length})` }
    : parseDateRange(input);
  const byHarness: Record<string, number> = {};
  const skillsSet = new Set<string>();
  let turnCount = 0;

  for (const s of sessions) {
    byHarness[s.harness] = (byHarness[s.harness] ?? 0) + 1;
    turnCount += s.turns.length;
    for (const sk of s.skillsRead) skillsSet.add(sk);
  }

  const base = { rangeLabel: range.label, sessionCount: sessions.length, turnCount, byHarness, skillsDetected: [...skillsSet] };
  const digest = sessions.length ? formatDigest(sessions, range, input.maxChars) : `# No sessions found (${range.label})`;
  if (sessions.length === 0 || input.stage === "extract") return { ...base, digest, cleaned: null, report: null };

  const cleaned = await cleanInBatches(sessions, input.maxChars, exec);
  if (input.stage === "clean") return { ...base, digest, cleaned, report: null };

  const report = await askBot(ANALYTICS_ANALYZE_BOT_ID, cleaned, exec);
  return { ...base, digest, cleaned, report };
}
