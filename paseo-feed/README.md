<!--
Purpose: Architecture and operator reference for the @xrsec/paseo-feed standalone Paseo micro-plugin.
Context: Provides continuous virtual conversation feeds for pinned bots and teams via a single pointer index and LRU hydration.
Usage: Mounted as a Paseo plugin (id: paseo-feed) and optionally bridged by paseo-bots BotFeedPane.
Prerequisites: Paseo host >= 0.16.0 and ~/.paseo/plugin-settings/paseo-bots/bots.json (or PASEO_BOTS_SETTINGS_PATH).
-->

# Paseo Feeds (`@xrsec/paseo-feed`)

Standalone Paseo plugin (`id: paseo-feed`, `requirements.paseo >= 0.16.0`) maintaining continuous, distilled conversation streams for the Global Assistant, bots, and teams with Sentry-style task deep-links. Design spec: [../docs/design/paseo-feed/INDEX.md](../docs/design/paseo-feed/INDEX.md).

## 1. 4-Pillar Navigation & Dual-Entry Surfaces

| Entry Surface | Source Anchor | Behavior |
| :--- | :--- | :--- |
| **Standalone 4th Sidebar Pillar & Screen** | [index.client.tsx](index.client.tsx), [client/FeedSidebar.tsx](client/FeedSidebar.tsx), [client/FeedScreen.tsx](client/FeedScreen.tsx), [client/ChannelList.tsx](client/ChannelList.tsx) | Registers 1 clean sidebar pillar (`id: feeds`, `FeedSidebar`, label `Feed (助理)` with live activity badge via `summarizeSidebarActivity`, `SIDEBAR_POLL_MS = 30_000`, and `feedUpdatesSub`) alongside `paseo-bots`'s 3 pillars (`Bots`, `Team`, `Workflow`), plus Command Center item `open-feeds`. `FeedScreen` pairs `ChannelList` category tabs (`全部` / `助理` / `伙伴` / `团队` via `filterChannelsByCategory`) with a virtualized `<FlatList>` (`PAGE_SIZE = 20`, `LOAD_OLDER_SCROLL_THRESHOLD = 60`), `FeedMessageCard`, and `FeedComposer`. |
| **`paseo-bots` Fused Pane** | [../paseo-bots/client/BotFeedPane.tsx](../paseo-bots/client/BotFeedPane.tsx), [../paseo-bots/server/feed-bridge.ts](../paseo-bots/server/feed-bridge.ts), [../paseo-bots/shared/feed-view.ts](../paseo-bots/shared/feed-view.ts) | Calls `botFeedReadRpc` ([../paseo-bots/shared/rpc.ts](../paseo-bots/shared/rpc.ts)) backed by `readMergedBotFeed`, reading the unified `index.jsonl` pointer ledger, slicing cursor pages (`DEFAULT_LIMIT = 20`, `MAX_LIMIT = 500`) prior to selective timeline hydration (`TIMELINE_HYDRATE_TURNS = 50`, `distillTimelineToFeedEntries`), falling back read-only to legacy `channels/<kind>__<id>.jsonl` (`feedChannelFilePath`, `parseFeedJsonl`) when `index.jsonl` is absent, and rendering cursor lazy-loading (`FEED_PAGE_SIZE = 20`) with scroll-anchor preservation in `BotFeedPane`. |

## 2. Single Pointer Index, Dynamic LRU Hydration & Cursor Lazy-Loading

- **Unified Single Pointer Ledger & Legacy Migration**: Persist one lightweight `FeedPointerSchema` record per turn (`id`, `agentId`, `turnId`, `turnIndex`, `botId`, `botName`, `teamIds[]`, `agentTitle`, `archived`, `timestamp`, `status`, `errorMessage`, `toolsCount`, `source`, `commandPreview`, `replyPreview`, plus optional `workflowTaskId`, `workflowId`, `workflowStageId`, `workflowStageName`) in `~/.paseo/plugin-data/paseo-feed/index.jsonl` (`resolveFeedDataDir`, `indexFilePath` in [server/store.ts](server/store.ts)) with zero duplicated per-channel files. Previews are capped to `<= 120` chars via `previewSnippet` (`maxLen = 120` in [server/extractor.ts](server/extractor.ts)). On plugin load, `migrateLegacyChannelsToIndex` runs once under `LEGACY_CHANNELS_MIGRATION_MARKER` (`".legacy-channels-migrated-v1"`) with `UpsertPointersOptions.preserveExisting`, merging `channels/*.jsonl` into `index.jsonl` while leaving legacy files untouched and syncing `paseo-plugin.json` display title.
- **Atomic Ledger & Cursor Windowing**: Deduplicate by `id`, sort chronologically via `compareCursorKeys`, and rewrite via temp-file rename (`upsertPointers`, `readAllPointers`, `readChannelPointers`, `markAgentArchived`, `summarizeChannelPointers`, `getChannelSummary` in [server/store.ts](server/store.ts)). `readChannelPointers` defaults to `limit = 20` and paginates backward with `timestamp|id` cursors (`encodePointerCursor`, `decodePointerCursor`, returning `{ pointers, hasOlder, nextCursor, totalPointers }`).
- **Dynamic LRU Timeline Hydration**: `FeedHydrator` ([server/hydrator.ts](server/hydrator.ts)) hydrates only unique `agentId`s in the requested cursor slice (`timeline.refetch` with `direction: "tail"`, `projection: "projected"`, `wholeTurns: true`, `DEFAULT_TIMELINE_LIMIT = 40`) and preserves/backfills workflow metadata (`applyWorkflowMetaFallback`). The in-memory LRU holds up to `DEFAULT_MAX_ENTRIES = 128` agents: active sessions expire after `DEFAULT_ACTIVE_TTL_MS = 15_000` ms and invalidate on `handleTurnAfter` / `syncChannelFromPaseo`; archived sessions (`handleArchiveAfter` -> `markArchived`) remain sticky without TTL expiry until LRU eviction. Unavailable timelines degrade gracefully via `buildEntryFromPointer` to `commandPreview` / `replyPreview` with `hydrated: false` (`isPreviewOnlyEntry` in [client/feed-helpers.ts](client/feed-helpers.ts)).
- **Virtualized Cursor Lazy-Loading**: [client/FeedScreen.tsx](client/FeedScreen.tsx) renders entries in a `<FlatList>` (`PAGE_SIZE = 20`, `initialNumToRender = 10`, `maxToRenderPerBatch = 10`, `windowSize = 7`), provides `"打开会话 ↗"` header chat navigation (`resolveHeaderChatAgentId`), loading older pages on upward scroll (`shouldTriggerLoadOlder`) or via `StreamListHeader` and merging via `prependOlderEntries` and `resolvePaginationFromPage` ([client/feed-helpers.ts](client/feed-helpers.ts)).
- **Turn Extraction, Workflow Metadata & Filtering**: Hook `agent.turn.after` (`handleTurnAfter`) and `agent.archive.after` (`handleArchiveAfter`) in [index.server.ts](index.server.ts) and [server/sync.ts](server/sync.ts). Classify channels by `ChannelKindSchema` (`bot | team`) and turn origin by `FeedSourceSchema` (`dm | team | routine | delegated | workflow`) using `WORKFLOW_TASK_LABEL` and `WORKFLOW_STAGE_LABEL`. Distill timelines via `unwrapCompanionCommand`, `distillVisibleReply`, `extractWorkflowMeta`, `inferFeedSource`, `extractTurnsFromTimeline`, `buildPointerId`, and `buildPointerFromTurn` ([server/extractor.ts](server/extractor.ts)), excluding shadow and curation chats (`shouldIgnoreAgent` checking `SHADOW_SESSION_LABEL` and `MEMORY_CURATION_LABEL`) and excluding `"workflow"` turns from `humanOnly` filters.

## 3. Exported RPC & Subscription Contracts

Defined in [shared/protocol.ts](shared/protocol.ts) and bound in [index.server.ts](index.server.ts):

| Contract | Channel / Wire Name | Server Handler & Semantics |
| :--- | :--- | :--- |
| `feedChannelsRpc` | `feed.channels` | `listChannelsWithStats` — returns Global Assistant, bot, and team `FeedChannel` summaries from `index.jsonl` with optional `includeArchived`. |
| `feedEntriesRpc` | `feed.entries` | `readChannelPointers` + `FeedHydrator.hydratePointers` — returns `{ channel, entries, hasOlder, nextCursor, totalPointers, syncedAgents }`; supports `limit` (default `20`), `beforeCursor`, `humanOnly` (`dm \| team`), and optional `sync: true` (`syncChannelFromPaseo`). |
| `feedSyncRpc` | `feed.sync` | `syncChannelFromPaseo` — backfills pointers up to `maxAgents` (default `15`) across one or all active channels, invalidates touched hydrator entries, and broadcasts `synced`. |
| `feedSendRpc` | `feed.send` | `sendToFeedChannel` — routes outbound text to the channel's active Paseo agent (`reason: "sent"`), or cold-starts one via `resolveChannelLeadBot` ([server/roster.ts](server/roster.ts)) + `paseo.agents.create` with `BOT_LABEL`, `LIFECYCLE_MOUNT_LABEL`, optional `GLOBAL_ASSISTANT_LABEL`/`LONG_SESSION_ENABLED_LABEL`, and team `TEAM_SESSION_LABEL`/`SESSION_ROLE_LABEL` (`reason: "created"`, falling back to `"no_active_chat"` when `agents.create` is unavailable); rendered by `FeedComposer` via `resolveComposerNotice`. |
| `feedUpdatesSub` | `feed.updates` | Streams `FeedUpdateEvent` (`entry_added \| agent_archived \| synced`), optionally filtered by `channelKind` and `channelId`. |

## 4. Task Deep-Links, Workflow Badges & Header Chat Jumps (`openAgent`)

Distilled cards in [client/FeedMessageCard.tsx](client/FeedMessageCard.tsx) render workflow source badges (`"workflow"`, stage pills via `resolveWorkflowStageLabel`) and emit `onOpenTask`; [client/FeedScreen.tsx](client/FeedScreen.tsx) resolves `{ agentId, serverId }` via `resolveTaskJumpTarget` and `resolveHeaderChatAgentId` ([client/feed-helpers.ts](client/feed-helpers.ts)) to jump directly into Paseo agent timelines from card actions, `FeedComposer` `"created"` banners, or the stream header `"打开会话 ↗"` button.

## 5. Environment Overrides

| Variable | Default | Consumer |
| :--- | :--- | :--- |
| `PASEO_FEED_DATA_DIR` | `~/.paseo/plugin-data/paseo-feed` | `resolveFeedDataDir` ([server/store.ts](server/store.ts)), `feedDataDir` ([../paseo-bots/server/feed-bridge.ts](../paseo-bots/server/feed-bridge.ts)) |
| `PASEO_BOTS_SETTINGS_PATH` | `~/.paseo/plugin-settings/paseo-bots/bots.json` | `resolveBotsSettingsPath` ([server/roster.ts](server/roster.ts)) |

## 6. Verification

```bash
npm --prefix paseo-feed run typecheck && npm --prefix paseo-feed test
```
