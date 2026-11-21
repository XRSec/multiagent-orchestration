import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const LONG_SESSION_ENABLED_LABEL = "paseo-long-session.enabled";
export const LONG_SESSION_THRESHOLD_LABEL = "paseo-long-session.threshold-tokens";
export const LONG_SESSION_SYNC_METADATA = "paseo-long-session.sync";
export const GLOBAL_ASSISTANT_LABEL = "paseo-bots.global-assistant";

export const DEFAULT_COMPACT_THRESHOLD_TOKENS = 250_000;
export const MIN_COMPACT_THRESHOLD_TOKENS = 50_000;
export const MAX_COMPACT_THRESHOLD_TOKENS = 1_000_000;

export const LongSessionSyncStateSchema = z.object({
  pendingMemorySync: z.boolean().default(false),
  lastSyncedMemoryHash: z.string().nullable().optional(),
  compactedAtTurnId: z.string().nullable().optional(),
  compactedAt: z.string().nullable().optional(),
  compactionCount: z.number().int().nonnegative().default(0),
});
export type LongSessionSyncState = z.infer<typeof LongSessionSyncStateSchema>;

export function clampCompactThreshold(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) {
    return DEFAULT_COMPACT_THRESHOLD_TOKENS;
  }
  const rounded = Math.floor(tokens);
  if (rounded < MIN_COMPACT_THRESHOLD_TOKENS) return MIN_COMPACT_THRESHOLD_TOKENS;
  if (rounded > MAX_COMPACT_THRESHOLD_TOKENS) return MAX_COMPACT_THRESHOLD_TOKENS;
  return rounded;
}

export const LongSessionSettingsSchema = z.object({
  defaultThresholdTokens: z
    .number()
    .int()
    .min(MIN_COMPACT_THRESHOLD_TOKENS)
    .max(MAX_COMPACT_THRESHOLD_TOKENS)
    .default(DEFAULT_COMPACT_THRESHOLD_TOKENS),
  enabledForAllAntigravity: z.boolean().default(false),
  compactCommand: z.string().trim().min(1).default("/compact"),
});
export type LongSessionSettings = z.infer<typeof LongSessionSettingsSchema>;

export const DEFAULT_LONG_SESSION_SETTINGS: LongSessionSettings = LongSessionSettingsSchema.parse({});

export const longSessionSettings = defineSettings({
  id: "long-session",
  scope: "host",
  version: 1,
  schema: LongSessionSettingsSchema,
});
