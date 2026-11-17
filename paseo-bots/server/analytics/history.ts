import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AnalysisStage, AnalyticsHistoryRecord, AnalyticsRunOutput, HarnessKind } from "../../shared/analytics";
import { pluginDataPath } from "../bot-home";

const MAX_HISTORY_RECORDS = 30;

function historyFilePath(baseDir = pluginDataPath()): string {
  return path.join(baseDir, "analytics-history.json");
}

export function listAnalyticsHistory(baseDir?: string): AnalyticsHistoryRecord[] {
  const file = historyFilePath(baseDir);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
    return Array.isArray(raw) ? (raw as AnalyticsHistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveAnalyticsRecord(
  meta: { harness: HarnessKind; stage: AnalysisStage },
  output: AnalyticsRunOutput,
  baseDir?: string,
): AnalyticsHistoryRecord {
  const file = historyFilePath(baseDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const record: AnalyticsHistoryRecord = {
    id: `ana-${Date.now()}-${randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    harness: meta.harness,
    stage: meta.stage,
    ...output,
  };
  const next = [record, ...listAnalyticsHistory(baseDir)].slice(0, MAX_HISTORY_RECORDS);
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return record;
}

export function deleteAnalyticsRecord(id: string, baseDir?: string): boolean {
  const file = historyFilePath(baseDir);
  const current = listAnalyticsHistory(baseDir);
  const next = current.filter((r) => r.id !== id);
  if (next.length === current.length) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8");
  return true;
}
