---
doc_id: DOCS_SESSIONS
status: CURRENT
version: 1.3.0
last_verified: 2026-11-07
language: en-US
name: sessions
description: How bot sessions start, resume, carry context and stay isolated in code today.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [src/daemon/orchestrator/, src/daemon/blackboard/lifecycleHooks.ts, src/daemon/transport/DaemonServer.ts, src/storage/, src/web/server/controllers/]
---

# [0] ROOT: AGENT SESSIONS AND ISOLATION

## [1] ROUTES
- [1.1] [lifecycle-spec](architecture/session-lifecycle-compaction-and-rewind-specs.md) :: [LOAD_IF: owner design for resume, rewind, fork, compaction or crash recovery]
- [1.2] [efficiency-catalog](architecture/collaboration-efficiency-and-cache-memory-optimization.md) :: [LOAD_IF: prompt layout or cache design]
- [1.3] [session-policy-proposal](proposals/session-policy.md) :: [LOAD_IF: designing lanes, locks, loop units or isolation]

## [2] TERMS
- [2.1] **Session**: One SDK session id; its transcript lives under the creating `CLAUDE_CONFIG_DIR`.
- [2.2] **Scope**: The `sessions` row a runner resumes: `session_<room.id>` for a room, `directSessionId` for a DM.
- [2.3] **Run Words**: SDK turn = one tool-loop step; run = one `query()`; round = a human message plus the bot messages after it; step = one bot reply in a relay chain. Never write a bare "turn".

## [3] CURRENT BEHAVIOUR
- [3.1] **Resume Per Scope**: `AgentOrchestrator.getOrCreateRunner` caches runners per `<botId>::<scope>`, seeded from `sessions.sdk_session_id`; `ClaudeSdkRunner` passes `resume`, plus `resumeSessionAt` and `forkSession` after a rewind, and stores the rotated id; on "No conversation found" it clears the id by compare-and-swap and starts new with a handoff. Design: [1.1].
  - [3.1.1] **Blackboard Path**: Dormant ([review](operating-model/review.md) [4.1]); each `dispatchTurn` is a new `query()` with no resume.
  - [3.1.2] **Web Session Path**: `handlePostSessionMessage` builds a runner per message outside `AgentOrchestrator`, no `contextBundle` or hooks, resuming `PersistentSession.sdkSessionId` ([4.7]). `useSessions.forkSession` copies no id, so a fork starts new. Failures become fabricated replies.
  - [3.1.3] **Bot Chat Route**: `POST /api/bots/:id/chat` (`bots-controller.ts`) builds a runner per request, `SOUL.md` only, no resume, and fabricates a reply on error.
- [3.2] **Shared Room Row**: All bots in a room share one `sessions` row and one `sdk_session_id`; each bot's run overwrites it. A new runner for bot B can resume A's id under B's config dir, which [3.1] then resets.
- [3.3] **Context By Prompt**: `assembleTurnContext` appends directives, `SOUL.md`, the charter, the whole `GROUP_MEMORY.md` and a delta (last 30 messages, each cut to 600 code points) to the system prompt of the resumed session. The delta repeats the prompt message. Owner C1 ([1.2]) calls this placement cache-invalidating.
- [3.4] **Cursor First**: `handleChat` advances the member cursor before the run; a failed run still marks messages seen.
- [3.5] **Reply Text**: The runner stores the first text block of the first assistant message, `result` only when that is empty; the blackboard path stores `result.result`. `includePartialMessages` is unset: no stream events.
  - [3.5.1] **Canned Replies**: The runner answers an empty prompt, `NO_REPLY`, `Loop test...` or `Resume execution` without a model call.
- [3.6] **Room Id**: `getRoom` accepts slug or id, but messages, `session_id`, cursors and the sandbox key on the client's raw value while the runner scope uses `room.id`; the default is the slug, so one room can split into 2 streams.
- [3.7] **Injected Directives**: `settingSources: []`; `assembleTurnContext` injects `Customizations/AGENTS.md`, not root `AGENTS.md`.
- [3.8] **Direct Messages**: `DaemonServer` keys rooms on `roomId || directSessionId`. `addMessage` derives `session_id` from `room_id`, so DM rows land in `session_<roomId>` with that room's `GROUP_MEMORY.md`; the DM's sdk id row holds no messages, so DM rewind and handoff are empty.
- [3.9] **Abort**: `agent:abort` calls `abortExecution`, which interrupts every runner whose key contains the target id as a substring, so unrelated scopes can stop. No run registry exists.
- [3.10] **Room Auto-Create**: For a missing room, `handleChat` runs `createRoom` only for a DM, a `direct_*` id or the default `multiagent-orchestration` id, rewriting the tracked `groups/<slug>/room.json`, `GROUP_CHARTER.md` and `GROUP_MEMORY.md`; other unknown ids throw `ROOM_NOT_FOUND`. Nothing seeds rooms from `room.json`.

## [4] ISOLATION MATRIX
- [4.1] **Config Dir**: Room and DM chat use the bot record's `claude_config_dir`; web sessions use moAdmin's ([4.7]); the bot chat route uses `<botDir>/claude_config`; the blackboard path uses `Customizations/agents/<botId>/claude_config`, shared with the live bot.
  - [4.1.1] **MCP File**: Every run rewrites `<claudeConfigDir>/mcp.json`; tracked copies under `Bots/` and `Customizations/agents/` dirty the tree.
  - [4.1.2] **Transcripts**: Under each config dir's `projects/` (gitignored), inside the mounted project root, so bots can read each other's; resume and rewind depend on them.
- [4.2] **Cwd**: Each `<botId>::<scope>` runner gets `sandboxes/groups/<raw roomId>/<botId>`; chat never uses the bot workbench.
- [4.3] **Repo Access**: `permissionMode: 'bypassPermissions'`; chat mounts the project root; AGENTS.md §3 write scopes are unenforced ([doc-vs-code](operating-model/doc-vs-code.md) [2.2]). `dangerousCommandGuardHook` coverage: [doc-vs-code](operating-model/doc-vs-code.md) [2.3].
- [4.4] **Env**: Chat strips the `SENSITIVE_ENV_VARS_TO_STRIP` denylist; the blackboard path passes `process.env` whole and alone sets `CLAUDE_CODE_DISABLE_AUTO_MEMORY`.
- [4.5] **Settings**: `settingSources: []` plus inline `mcpServers` with `strictMcpConfig`; only `test/storage-runtime.test.ts` calls `validateBotIsolation`.
- [4.6] **Concurrency**: No lock per bot, room, scope or config dir. Many entry points build `AgentOrchestrator`s; web and bot chat routes build runners. `handleChat` never checks `isTurnRunning`: 2 messages to one runner run 2 queries on one id.
- [4.7] **Web Session Runner**: Config dir `Customizations/agents/moAdmin/claude_config`; cwd and mount = unchecked client `workingDir` plus the project root; `permissionLevel: 'full'`. `PUT` session merges the client body, so a client sets the resumed `sdkSessionId`.

## [5] DECISION PATH TODAY
- [5.1] **Runtime**: A message resumes its scope's session ([3.1]); rewind, fork and compaction follow [1.1] -> `TERM_OK`.
- [5.2] **Change Request**: Locks, lane granularity (per bot or per room row), loop units and isolation need an owner ruling on [1.3] -> `TERM_ESCALATE`.

## [6] DOC VS CODE
- [6.1] **Round Limit**: Cap = min(`maxTurnsPerRound` 10, `rooms.max_consecutive_steps`, set to 5 by `createRoom`); `room.json` limits are unread. The in-memory counter counts each `handleChat` whose unchecked `role` is not `user`; `role: 'user'` or a restart resets it.
- [6.2] **Config Dir Claim**: `MEMORY.md` [1.2] gives `<bot_dir>/claude_config` for every bot; false for web sessions and the blackboard path ([4.1]).
- [6.3] **Session Files**: The storage-and-runtime spec describes `session.json` and a `profile.json` canonical pointer; resume keys on `sessions.sdk_session_id`, `canonical_session_id` is only stored, and no code touches `session.json`.
- [6.4] **Host Paths**: `ClaudeSdkRunner` and `bots-controller.ts` hard-code host paths for the Claude executable and an MCP server; `session-storage.ts` seeds sessions with one as `workingDir`.
- [6.5] **Loop Units**: AGENTS.md §4.4, `MEMORY.md` [3.2] and `room.json` name different counters; no ruling ([1.3] [3.5]; owner M4 proposes a token budget).
- [6.6] **Primary CWD**: AGENTS.md §3 and `MEMORY.md` [3.1] give per-bot Primary CWDs; code uses [4.2]. No ruling ([1.3] [6.3]).
- [6.7] **Lifecycle Spec**: The spec passes `client_id` as user uuid; `executeTurn` never forwards it. With no live query, `previewRewindFiles` returns `canRewind: true`, no files. In a room the rewind anchor can be another bot's message ([3.2]).
