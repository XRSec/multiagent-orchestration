import { z } from "zod";

/** Fixed bots for the 2-bot pipeline (bots.json ids). */
export const ANALYTICS_CLEAN_BOT_ID = "bot-cleaner";
export const ANALYTICS_ANALYZE_BOT_ID = "bot-analyst";

export const HarnessKindSchema = z.enum(["all", "agy", "claude", "pi"]);
export type HarnessKind = z.infer<typeof HarnessKindSchema>;

export const AnalysisStageSchema = z.enum(["extract", "clean", "full"]);
export type AnalysisStage = z.infer<typeof AnalysisStageSchema>;

export const AnalyticsSessionItemSchema = z.object({
  id: z.string(),
  source: z.enum(["paseo", "harness"]),
  harness: z.enum(["paseo", "agy", "claude", "pi"]),
  title: z.string(),
  botId: z.string().optional(),
  archived: z.boolean(),
  updatedAt: z.string(),
  messageCount: z.number().int().optional(),
});
export type AnalyticsSessionItem = z.infer<typeof AnalyticsSessionItemSchema>;

export const AnalyticsSessionListInputSchema = z.object({
  includeArchived: z.boolean().optional(),
  harness: HarnessKindSchema.optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(90).optional(),
  hours: z.number().int().min(1).max(24 * 90).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type AnalyticsSessionListInput = z.infer<typeof AnalyticsSessionListInputSchema>;

export const AnalyticsSessionListOutputSchema = z.object({
  sessions: z.array(AnalyticsSessionItemSchema),
});
export type AnalyticsSessionListOutput = z.infer<typeof AnalyticsSessionListOutputSchema>;

export const AnalyticsRunInputSchema = z.object({
  harness: HarnessKindSchema.default("all"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  days: z.number().int().min(1).max(90).default(1),
  /** Rolling window ending now; takes precedence over date / from / to / days. */
  hours: z.number().int().min(1).max(24 * 90).optional(),
  stage: AnalysisStageSchema.default("full"),
  maxSessions: z.number().int().min(1).max(200).default(40),
  maxChars: z.number().int().min(2000).max(200_000).default(36_000),
  sessionIds: z.array(z.string()).max(100).optional(),
});
export type AnalyticsRunInput = z.infer<typeof AnalyticsRunInputSchema>;

export const AnalyticsRunOutputSchema = z.object({
  rangeLabel: z.string(),
  sessionCount: z.number().int(),
  turnCount: z.number().int(),
  byHarness: z.record(z.string(), z.number().int()),
  skillsDetected: z.array(z.string()),
  digest: z.string(),
  cleaned: z.string().nullable(),
  report: z.string().nullable(),
});
export type AnalyticsRunOutput = z.infer<typeof AnalyticsRunOutputSchema>;

export const AnalyticsHistoryRecordSchema = AnalyticsRunOutputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  harness: HarnessKindSchema,
  stage: AnalysisStageSchema,
});
export type AnalyticsHistoryRecord = z.infer<typeof AnalyticsHistoryRecordSchema>;
