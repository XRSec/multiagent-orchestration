/**
 * Purpose: Shared RPC, subscription, label, and data contracts for paseo-feed.
 * Context: Locked contract shared between WP1 server runtime and WP2 client UI.
 * Usage: Import schemas, inferred types, labels, and RPC/subscription definitions.
 * Prerequisites: @getpaseo/plugin and zod installed.
 */

import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

export const BOT_LABEL = "paseo-bots.bot";
export const TEAM_SESSION_LABEL = "paseo-bots.team-session";
export const SESSION_ROLE_LABEL = "paseo-bots.session-role";
export const ROUTINE_LABEL = "paseo-bots.routine";
export const SHADOW_SESSION_LABEL = "paseo-bots.shadow-session";
export const MEMORY_CURATION_LABEL = "paseo-bots.memory-curation";
export const ASKED_BY_LABEL = "paseo-bots.asked-by";
export const WORKFLOW_TASK_LABEL = "paseo-bots:workflow-task";
export const WORKFLOW_ID_LABEL = WORKFLOW_TASK_LABEL;
export const WORKFLOW_STAGE_LABEL = "paseo-bots:workflow-stage";
export const WORKFLOW_STAGE_ID_LABEL = WORKFLOW_STAGE_LABEL;
export const LIFECYCLE_MOUNT_LABEL = "paseo-bots.lifecycle-mount";
export const GLOBAL_ASSISTANT_LABEL = "paseo-bots.global-assistant";
export const LONG_SESSION_ENABLED_LABEL = "paseo-long-session.enabled";

export const ChannelKindSchema = z.enum(["bot", "team"]);
export type ChannelKind = z.infer<typeof ChannelKindSchema>;

export const FeedSourceSchema = z.enum(["dm", "team", "routine", "delegated", "workflow"]);
export type FeedSource = z.infer<typeof FeedSourceSchema>;

export const FeedChannelSchema = z.object({
  kind: ChannelKindSchema,
  id: z.string(),
  name: z.string(),
  subtitle: z.string(),
  pinned: z.boolean(),
  archived: z.boolean(),
  isGlobalAssistant: z.boolean().optional(),
  leadId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
  entryCount: z.number(),
  lastActivityAt: z.string().nullable(),
  lastPreview: z.string(),
  activeAgentId: z.string().nullable(),
});
export type FeedChannel = z.infer<typeof FeedChannelSchema>;

export const FeedPointerSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  turnId: z.string().nullable(),
  turnIndex: z.number(),
  botId: z.string(),
  botName: z.string(),
  teamIds: z.array(z.string()),
  agentTitle: z.string(),
  archived: z.boolean(),
  timestamp: z.string(),
  status: z.enum(["completed", "failed"]),
  errorMessage: z.string().nullable(),
  toolsCount: z.number(),
  source: FeedSourceSchema,
  workflowTaskId: z.string().optional(),
  workflowId: z.string().optional(),
  workflowStageId: z.string().optional(),
  workflowStageName: z.string().optional(),
  commandPreview: z.string(),
  replyPreview: z.string(),
});
export type FeedPointer = z.infer<typeof FeedPointerSchema>;

export const FeedEntrySchema = z.object({
  id: z.string(),
  channelKind: ChannelKindSchema,
  channelId: z.string(),
  botId: z.string(),
  botName: z.string(),
  teamId: z.string().nullable(),
  agentId: z.string(),
  agentTitle: z.string(),
  archived: z.boolean(),
  turnId: z.string().nullable(),
  timestamp: z.string(),
  command: z.string(),
  reply: z.string(),
  hydrated: z.boolean().optional(),
  status: z.enum(["completed", "failed"]),
  errorMessage: z.string().nullable(),
  toolsCount: z.number(),
  source: FeedSourceSchema,
  workflowTaskId: z.string().optional(),
  workflowId: z.string().optional(),
  workflowStageId: z.string().optional(),
  workflowStageName: z.string().optional(),
});
export type FeedEntry = z.infer<typeof FeedEntrySchema>;

export const FeedUpdateEventSchema = z.object({
  kind: z.enum(["entry_added", "agent_archived", "synced"]),
  channelKind: ChannelKindSchema.optional(),
  channelId: z.string().optional(),
  agentId: z.string().optional(),
  entry: FeedEntrySchema.optional(),
});
export type FeedUpdateEvent = z.infer<typeof FeedUpdateEventSchema>;

export const feedChannelsRpc = defineRpc({
  name: "feed.channels",
  input: z.object({ includeArchived: z.boolean().optional() }),
  output: z.object({ channels: z.array(FeedChannelSchema) }),
});

export const feedEntriesRpc = defineRpc({
  name: "feed.entries",
  input: z.object({
    channelKind: ChannelKindSchema,
    channelId: z.string(),
    limit: z.number().optional(),
    beforeCursor: z.string().optional(),
    humanOnly: z.boolean().optional(),
    sync: z.boolean().optional(),
  }),
  output: z.object({
    channel: FeedChannelSchema.nullable(),
    entries: z.array(FeedEntrySchema),
    hasOlder: z.boolean(),
    nextCursor: z.string().nullable(),
    totalPointers: z.number(),
    syncedAgents: z.number(),
  }),
});

export const feedSyncRpc = defineRpc({
  name: "feed.sync",
  input: z.object({
    channelKind: ChannelKindSchema.optional(),
    channelId: z.string().optional(),
    maxAgents: z.number().optional(),
  }),
  output: z.object({
    syncedAgents: z.number(),
    addedEntries: z.number(),
  }),
});

export const feedSendRpc = defineRpc({
  name: "feed.send",
  input: z.object({
    channelKind: ChannelKindSchema,
    channelId: z.string(),
    text: z.string(),
  }),
  output: z.object({
    ok: z.boolean(),
    agentId: z.string().nullable().optional(),
    reason: z.enum(["sent", "created", "no_active_chat", "channel_not_found", "error"]),
    message: z.string().optional(),
    error: z.string().optional(),
    lastArchivedAgentId: z.string().nullable().optional(),
  }),
});

export const feedUpdatesSub = defineSubscription({
  name: "feed.updates",
  input: z.object({
    channelKind: ChannelKindSchema.optional(),
    channelId: z.string().optional(),
  }),
  event: FeedUpdateEventSchema,
});

export function channelStorageKey(kind: ChannelKind, id: string): string {
  return `${kind}__${id.replace(/[^A-Za-z0-9._-]/g, "_")}`;
}
