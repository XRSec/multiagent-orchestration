---
doc_id: MULTIAGENT_ORCHESTRATION_MEMORY_ROOT
version: 2.2.0
description: Core repository architectural invariants, topologies, and execution contracts.
type: REPO_MEMORY_AST
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: MULTIAGENT ORCHESTRATION ARCHITECTURAL MEMORY

## [1] SYSTEM TOPOLOGY & RUNTIME INVARIANTS
- [1.1] **Host Zero-Pollution Invariant**: Strictly forbid reading or writing any byte to `~/.claude/`. All system state, daemon registries, skills, and bot sandboxes reside exclusively in `~/.multiagent-orchestration/` (mirrored in project `Customizations/`).
- [1.2] **4-Pack Bot Sandbox Asset Contract**: Every Bot under `~/.multiagent-orchestration/agents/<BotName>/` (and `Customizations/agents/<BotName>/`) MUST maintain four orthogonal assets:
  - `profile.json`: Static identity (`id`, `name`, `role`, `title`, `avatarColor`, `capabilities`).
  - `capabilities.json`: Runtime provider routing (`providerId: "cpa"`, `modelChain`, `permissionLevel: "full"`, `mcpServers`, `skills`).
  - `workbench.json`: Allowed workspace paths, `defaultWorkingDir`, and environment variables.
  - `SOUL.md`: Domain persona, strict read/write scope boundaries, and operational protocols.
  - Isolated runtime configuration injected via `CLAUDE_CONFIG_DIR=<bot_dir>/claude_config` (`settingSources: []`, `strictMcpConfig: true`).
- [1.3] **Safe Delete Invariant**: Direct invocation of `rm` or `rm -rf` is strictly prohibited across all shells and agent tool calls. Mandatory trash wrapper: `/opt/xrsec/.env/rmfile <target>`.
- [1.4] **Test Process Hygiene**: Never invoke bare `vitest` (defaults to watch mode, spawning zombie processes). Always execute `npx vitest run` or `pnpm test`.

## [2] UNIFIED GATEWAY & TRANSPORT CONTRACT
- [2.1] **Single-Port Full-Duplex Gateway**: Backend HTTP REST and WebSocket server bind exclusively to `127.0.0.1:38080` (`ws://127.0.0.1:38080/gateway`, HTTP probe: `GET /health`). Frontend Vite server runs on `127.0.0.1:5173` and proxies `/api` and `/gateway` to `:38080`.
- [2.2] **Zero-SSE Mandate & Canonical Streaming Event Mapping**: Server-Sent Events (`EventSource` / `/api/events`) are completely eradicated. All real-time state broadcasts flow over WebSocket `push` envelopes (topics `session:<roomId>` and `direct:<sessionId>`) with REST hydration fallback:
  - **7 Daemon `agent:*` Push Events**: `agent:turn_start`, `agent:thinking`, `agent:tool_use`, `agent:tool_result`, `agent:text_delta`, `agent:turn_complete`, `agent:turn_interrupted`.
  - **12 Fine-Grained UI/Gateway Event Channels** (cross-mapped 1:1 from daemon stream frames & room lifecycle): `turn_start` (`<- agent:turn_start`), `text_delta` (`<- agent:text_delta`), `thinking_delta` (`<- agent:thinking`), `tool_start` / `tool_input_delta` (`<- agent:tool_use`), `tool_output_delta` / `tool_done` (`<- agent:tool_result`), `turn_done` (`<- agent:turn_complete` / `agent:turn_interrupted`), plus room/system channels `message_created`, `orchestration_phase`, `bot_status`, and `prompt_distill`.
- [2.3] **7-Type WebSocket Envelope Protocol**:
  - Handshake: `link-open` -> `link-accept` (`sessionId`, `resumed`, `lastSeq`).
  - RPC: `invoke` (`id`, `method`/`action`, `params`/`payload`) -> `invoke-result` (`id`, `ok`, `payload` | `error`).
  - Broadcast: `push` (`topic`/`channel`, `event`, `seq`, `timestamp`, `data`/`payload`).
  - Heartbeat & Backpressure: `ping` (every `pingIntervalMs: 15000` / `15s`) -> `pong` (`zombieTimeoutMs: 45000` / `45s` zombie eviction threshold; `maxBackpressureBytes: 67108864` / `64 MiB`).

## [3] MULTI-AGENT ORCHESTRATION & TURN QUOTA ENGINE
- [3.1] **7 Mo-Bots Domain Matrix** (Model routing via `Customizations/models.json`, provider `cpa`, fallback `gemini-3.8-flash`):
  - `moAdmin` (`bot_moadmin_director_03`): Orchestration Director & Dispatcher (`claude-opus-4-6`). Primary CWD: `.`. Allowed Write Scope: `groups/`, `Customizations/group/`, `docs/`, `logs/`. Zero business code edits.
  - `moCode` (`bot_mocode_engine_01`): Core Engine & Full-Stack Lead (`claude-opus-4-6`). Primary CWD: `.`. Allowed Write Scope: `src/`, `test/`, `poc/`, `scripts/`.
  - `moDoc` (`bot_modoc_scribe_02`): Scribe & Knowledge Asset Curator (`claude-sonnet-4-6`). Primary CWD: `docs/`. Allowed Write Scope: `docs/`, `*.md`.
  - `MoCI` (`bot_moci_sentinel_07`): QA & Verification Sentinel (`claude-sonnet-4-6`). Primary CWD: `test/`. Allowed Write Scope: `test/`, `logs/`, `reports/`, `coverage/`, `.github/`.
  - `MoGit` (`bot_mogit_scm_05`): SCM & Release Guardian (`claude-sonnet-4-6`). Primary CWD: `.`. Allowed Write Scope: `.git/`, release scripts, tags, changelogs.
  - `MoDeep` (`bot_modeep_scout_04`): Deep Research & Architecture Scout (`claude-opus-4-6`). Primary CWD: `./workspace/tmp/`. Allowed Write Scope: `docs/research/`, `poc/`, `./workspace/tmp/`, `./workspace/documents/`.
  - `Mo` (`bot_mo_meta_06`): Meta-Agent & Skill Creator (`claude-opus-4-6`). Primary CWD: `Customizations/`. Allowed Write Scope: `Customizations/skills/`, `Customizations/agents/<NewBot>/`.
- [3.2] **Unified Orchestration Spine & Two-Tier Autonomous Turn Quota**:
  - Unified Execution Path: `GatewayServer -> DaemonServer -> AgentOrchestrator -> ClaudeSdkRunner`, integrating `<group-Action>` (`talk`, `collaborate`, `finish`) dispatch with `BlackboardStore` (`data/blackboard_ssot.db`, `mcp__blackboard__*`) and `FastPath` / `PromptDistill` pre-flight distillation.
  - Tier 1 (`max_consecutive_steps: 5`): In single-speaker `talk` relay mode (`single_speaker_mode: true`), pauses after 5 consecutive bot-to-bot relay steps (`step >= 6` awaits human confirmation). Silent exit token: `NO_REPLY`.
  - Tier 2 (`max_turns_per_round: 10`, `max_circles_per_round: 3`): Hard anti-loop circuit breaker across all dispatch/collaborate rounds (`<group-Action>` tags: `talk`, `collaborate`, `finish`).
- [3.3] **Prompt Distill Pipeline**: Non-blocking pre-flight distillation via `ANTHROPIC_DEFAULT_HAIKU_MODEL` / `gemini-3.8-flash` (`timeoutMs: 30000`, `slidingWindowDepth: 2`, `decayLambda: 0.35`, `enable0msBypass: true`, prompt templates including `prompts/round2.md`), persisting state in `~/.multiagent-orchestration/state/prompt-distill`.

## [4] HYBRID STORAGE & DUAL-SQLITE TOPOLOGY
- [4.1] **Dual-SQLite WAL Engine (`node:sqlite` `DatabaseSync`)**:
  - `data/orchestrator.db`: Message timelines (`messages`), room metadata (`rooms`), `room_members`, `tasks`, `session_leases`, `idempotency_keys`, `audit_logs`, `bot_configs`, `blackboard_snapshots`.
  - `data/blackboard_ssot.db`: High-frequency KV state (`kv_store`), `bot_sessions`, `event_journal`.
  - Mandatory pragmas: `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`, `foreign_keys = ON`.
- [4.2] **Triple-Layer Group Persistence**: Each group room (`groups/<slug>/` & `Customizations/group/<slug>/`) maintains `room.json` (static topology & turn parameters), `GROUP_CHARTER.md` (routing laws & role boundaries), and `GROUP_MEMORY.md` (distilled consensus facts injected into system prompts).
- [4.3] **Session lifecycle, rewind, compaction**: see `docs/architecture/session-lifecycle-compaction-and-rewind-specs.md`. Schema owner is `src/storage/DatabaseSchema.ts`.

## [5] WEB STUDIO MENTAL MODEL INVARIANTS (`src/web`)
- [5.1] **Execution Visual Order (`Process First, Conclusion Last`)**: `ExecutionStatusCard` MUST be mounted strictly **ABOVE** the message text bubble in `GroupChatTimeline`.
- [5.2] **Live Telemetry & Zero Invalid Date**: `ActiveBotIndicator` tracks active bots in header; all timestamps pass through `safeFormatTimestamp` fallback guards (never rendering `Invalid Date`).
