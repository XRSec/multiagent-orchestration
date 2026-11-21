import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";
import { BOT_LABEL } from "./bot";

export const ASKED_BY_LABEL = "paseo-bots.asked-by";
export const ASKED_IN_LABEL = "paseo-bots.asked-in";
export const ASK_NOTIFY_LABEL = "paseo-bots.notify";
export const TIER_DEPTH_LABEL = "paseo-bots.tier-depth";
export const MAX_TIER_DEPTH = 3;

export function resolveTierDepth(labels?: Record<string, string>): 1 | 2 | 3 {
  const depth = labels?.[TIER_DEPTH_LABEL];
  if (depth === "1" || depth === "2" || depth === "3") {
    return Number(depth) as 1 | 2 | 3;
  }
  if (labels?.[ASKED_BY_LABEL]) {
    return 2;
  }
  return 1;
}

export const HANDOFF_REQUEST_METADATA = "paseo-bots.handoff-request";
export const HandoffRequestSchema = z.object({
  requesterBotId: z.string().min(1).max(200),
  requesterAgentId: z.string().min(1).max(200),
  notify: z.boolean(),
  /** Optional task line this delegation belongs to; absent on every card written before the field existed. */
  taskId: z.string().min(1).max(200).optional(),
});

/** Labels identify the delegating bot permanently; metadata routes a later request. */
export function handoffRequest(labels: Record<string, string> | undefined, metadata?: Readonly<Record<string, unknown>>) {
  if (!labels?.[BOT_LABEL] || !labels[ASKED_BY_LABEL]) return null;
  if (metadata?.[HANDOFF_REQUEST_METADATA] !== undefined) {
    const parsed = HandoffRequestSchema.safeParse(metadata[HANDOFF_REQUEST_METADATA]);
    return parsed.success && parsed.data.requesterBotId === labels[ASKED_BY_LABEL] ? parsed.data : null;
  }
  return labels[ASKED_IN_LABEL] ? { requesterBotId: labels[ASKED_BY_LABEL]!, requesterAgentId: labels[ASKED_IN_LABEL]!, notify: labels[ASK_NOTIFY_LABEL] === "true" } : null;
}

export const HandoffStatusSchema = z.object({
  state: z.enum(["running", "permission", "error", "finished", "archived"]),
  reply: z.string().max(6000),
  error: z.string().max(1000).nullable(),
  /** Echoed from the request metadata when the delegation carries one. */
  taskId: z.string().max(200).optional(),
});
export type HandoffStatus = z.infer<typeof HandoffStatusSchema>;
export const HandoffCardSchema = z.object({
  requesterBotId: z.string().min(1).max(200),
  requesterAgentId: z.string().min(1).max(200),
  targetBotId: z.string().min(1).max(200),
  targetAgentId: z.string().min(1).max(200),
  targetName: z.string().min(1).max(200),
  request: z.string().max(600),
  createdAt: z.string(),
  status: HandoffStatusSchema,
});
export type HandoffCard = z.infer<typeof HandoffCardSchema>;
export const HANDOFF_CARD = { kind: "bot-handoff", version: 1 } as const;

export const handoffStatusRpc = defineRpc({
  name: "bots.handoffs.status",
  input: z.object({ requesterAgentId: z.string().min(1).max(200), targetAgentId: z.string().min(1).max(200) }).strict(),
  output: z.object({ status: HandoffStatusSchema.nullable() }),
});

export function handoffSearchText(card: HandoffCard): string {
  return [card.targetName, card.request, card.status.reply, card.status.error ?? ""].join("\n");
}
