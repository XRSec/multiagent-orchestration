---
doc_id: PROJ-AGENT-PHILOSOPHY
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# 10 Core Agent Engineering Principles

Foundational systems-engineering laws governing `paseo-bots/` and `paseo-agy-acp/`. Every orchestration workflow, prompt template, context budget, and harness adapter conforms to these 10 code-anchored principles. Parent router: [../INDEX.md](../INDEX.md).

## Conformance Summary Matrix

| # | Principle | Primary Plane | Key Enforcement Module |
| :--- | :--- | :--- | :--- |
| 1 | Host-Owned Determinism over Prose Persuasion | `paseo-bots` | `server/workflow-runner.ts`, `server/tasks.ts`, `server/claude-agents.ts` |
| 2 | Physical Capability Isolation via Tool Mounting | `paseo-bots` | `paseo-bots-plugin-settings/bots.json`, `shared/bot-tools.ts`, `server/agy-agents.ts` |
| 3 | Managed Seat Sovereignty & Non-Polluting Target Mounts | `paseo-bots` | `server/bot-home.ts`, `server/chats.ts`, `shared/workflows.ts` |
| 4 | Byte-0 Cache Prefix Immutability & Tail Hydration | Both Cores | `server/prompt.ts`, `server/workflow-runner.ts`, `paseo-agy-acp/server/session.ts` |
| 5 | Anti-Context-Rot & Micro-Kernel Progressive Disclosure | Docs & `paseo-bots` | `docs/INDEX.md`, `shared/groups.ts`, `shared/bot.ts` |
| 6 | Continuity-Driven 3-Tier Routing & Pyramid Noise Isolation | `paseo-bots` | `shared/workflows.ts`, `server/tools/workflows.ts`, `server/task-cards.ts` |
| 7 | Dumb-Worker Self-Contained Briefs & Zero-Trust Proof | `paseo-bots` | `shared/workflows.ts`, `server/workflow-runner.ts` |
| 8 | Fail-Closed Turn Lifecycle & Cross-Plane Verification | `paseo-agy-acp` | `server/brain-observer.ts`, `server/turn-journal.ts`, `server/error-inspection.ts` |
| 9 | Deterministic Anti-Loop & Untrusted Peer Quarantine | `paseo-bots` | `AGENTS.md`, `server/scheduler.ts`, `server/relay.ts`, `server/handoffs.ts` |
| 10 | Scoped Same-Provider Fallback & Telemetry Flywheel | Both Cores | `server/chats.ts`, `shared/analytics.ts`, `server/memory-curator.ts` |

---

## 1. Host-Owned Determinism over Prose Persuasion
- **Rule**: Enforce DAG topological order, concurrency slots, directory sandboxes, and terminal task settlement in host TypeScript state machines rather than prompt instructions.
- **Rationale**: Deterministic host guards prevent hallucinated task completions, race conditions, and out-of-bounds disk writes when LLMs degrade under long-context pressure.
- **Anti-Pattern Rejected**: Telling an agent in prose to "wait for upstream stages, stay inside your directory, and mark the task done only after checking results."
- **Implemented Code Anchor**:
  - `paseo-bots/shared/workflows.ts`: `validateWorkflowDAG` (Kahn cycle/layer detection) and `readyStages`.
  - `paseo-bots/server/workflow-runner.ts`: `runWorkflowDag` and `reconcileOrphanWorkflows`.
  - `paseo-bots/server/tasks.ts`: `reserveMemberSlot`, `evaluateTask`, and `settleTask`.
  - `paseo-bots/server/claude-agents.ts`: `assertInsideManagedDataDir` (throws immediately on path traversal outside `$PASEO_HOME` managed roots).

## 2. Physical Capability Isolation via Tool Mounting
- **Rule**: Bound each bot's execution authority at process spawn by mounting only its role-authorized `baseTools`, `skillIds`, and `mcpServerIds`.
- **Rationale**: Stripping file-mutation and shell tools at the harness boundary makes unauthorized self-execution physically impossible rather than merely discouraged.
- **Anti-Pattern Rejected**: Spawning an orchestrator or research scout with full `write_file` and `run_command` grants while relying on persona text ("Do not write code yourself") to restrain it.
- **Implemented Code Anchor**:
  - `paseo-bots-plugin-settings/bots.json`: `bot-moadmin` `baseTools` mounts strictly `invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `manage_task`, `schedule`, and `ask_question` (`claude`: `Task`, `TodoWrite`, `Skill`), physically omitting `read_file`, `edit_file`, `write_file`, and `run_command`; `bot-cleaner` and `bot-analyst` mount `baseTools: []` with `contactBots: "off"`.
  - `paseo-bots/shared/bot-tools.ts`: `CAPABILITY_MAP` and `resolveToolsForProvider`.
  - `paseo-bots/server/agy-agents.ts` & `paseo-bots-plugin-settings/souls/`: `syncBotToAgyAgent` materializes native tool definitions while `souls/bot-modeep.md` and `souls/bot-modoc.md` strip code-execution privileges.

## 3. Managed Seat Sovereignty & Non-Polluting Target Mounts
- **Rule**: Lock every bot process `cwd` inside its Managed Seat under `$PASEO_HOME/plugin-data/paseo-bots/shared/`, attach external repositories strictly via `targetProjectDirs` (`additionalDirectories`), and pass bulky inter-stage artifacts via Session Blackboard files with inline excerpts capped at `<= 2000` characters.
- **Rationale**: Decoupling execution seats from target repositories prevents `.claude/`, `.agents/`, or scratch-file pollution in business repos and stops upstream transcripts from blowing up downstream context windows.
- **Anti-Pattern Rejected**: Launching multiple bots with `cwd` pointing directly into a target git worktree where generated tool configs overwrite each other, or pasting multi-kilobyte raw logs inline across workflow hops.
- **Implemented Code Anchor**:
  - `paseo-bots/server/bot-home.ts`: `ensureManagedSessionHome`, `teamAgentSeatPath`, `teamSessionBoardPath`, and `directSessionBoardPath`.
  - `paseo-bots/server/chats.ts` & `paseo-bots/server/prompt.ts`: `startChat` (`additionalDirectories: placement.targetProjectDirs`) and `loadTargetProjectRules`.
  - `paseo-bots/shared/workflows.ts`: `MAX_INLINE_UPSTREAM_CHARS = 2000` and `buildStageBriefPrompt` (writes full upstream output to `handoffFilePath` and preserves `<worker_handoff>` head/tail proof inside the 2000-char slice).

## 4. Byte-0 Cache Prefix Immutability & Tail Hydration
- **Rule**: Keep root tool schemas and static system-prompt prefixes byte-identical from Byte 0 across turns, appending dynamic workspace snapshots, recalled memories, and stage inputs strictly at the prompt tail or inside user-turn messages.
- **Rationale**: Mutating root tool lists or early system-prompt bytes invalidates upstream KV prompt caches, multiplying time-to-first-token and token billing on every turn.
- **Anti-Pattern Rejected**: Prepending live wall-clock timestamps, git diffs, or mid-session tool schema toggles into the system header on each turn.
- **Implemented Code Anchor**:
  - `paseo-bots/server/prompt.ts`: `systemPrompt` and `promptContext` (deterministic static block ordering with `MAX_PROJECT_RULES_BYTES = 16384`).
  - `paseo-bots/server/workflow-runner.ts`: `captureWorkspaceSnapshot` and `injectWorkspaceSnapshotToPrompt` (appends live git status/diff to the stage user prompt without altering the bot's cached system definition).
  - `paseo-agy-acp/server/session.ts`: `SessionManager` and `effectiveLaunch` (preserves warm ACP session processes across turns).

## 5. Anti-Context-Rot & Micro-Kernel Progressive Disclosure
- **Rule**: Bound always-loaded root instructions to `<= 150` discrete rules (model instruction-following degrades past ~64k tokens), cap index routers at `<= 80` lines with on-demand shards, gate specialized skills behind explicit review/selection, and expose workflow schemas solely to `team-lead`.
- **Rationale**: Progressive disclosure preserves attention heads for active problem-solving rather than diluting reasoning across irrelevant reference text and dormant tool catalogs.
- **Anti-Pattern Rejected**: Loading `900+`-line monolithic markdown manuals, every library skill body, and full workflow definitions into every specialist worker's startup context.
- **Implemented Code Anchor**:
  - `docs/INDEX.md` & `docs/project/INDEX.md`: Micro-kernel routers (`<= 55` lines) with `LOAD_IF` shard pointers.
  - `paseo-bots/shared/groups.ts`: `sessionRolePrompt` (`canSeeWorkflows` gates workflow catalog visibility strictly on `effectiveRole === "team-lead"`).
  - `paseo-bots/shared/bot.ts` & `paseo-bots/server/library.ts`: `skillNeedsReview` (`reviewedSha`) and selective per-bot `skillIds` mounting.

## 6. Continuity-Driven 3-Tier Execution Routing & Pyramid Noise Isolation
- **Rule**: Select dispatch tier by continuity requirement—Route 1 `native` (`invoke_subagent`) for stateless single-shot tasks, Route 2 `paseo-bot` (`ask_bot`) for stateful cross-turn specialist sessions, and Route 3 `run_workflow` for multi-stage DAGs—while keeping L3 worker tool chatter out of the L1 main chat via idempotent Task Cards.
- **Rationale**: Aligning runtime tier with state lifetime avoids persistent-session overhead on throwaway recon while shielding the operator timeline from hundreds of intermediate tool calls.
- **Anti-Pattern Rejected**: Emulating a 7-stage release pipeline via free-form group-chat banter, or streaming every worker `read_file` and `run_command` event into the primary team room.
- **Implemented Code Anchor**:
  - `paseo-bots/shared/workflows.ts`: `WorkflowStepEngineSchema` (`"auto" | "native" | "paseo-bot"`) and `resolveStepEngine`.
  - `paseo-bots/server/tools/workflows.ts`: `runWorkflowTool` and `startWorkflowExecution`.
  - `paseo-bots/server/task-cards.ts` & `paseo-bots/server/workflow-runner.ts`: `publishTaskCard`, `publishWorkflowCard`, `settleAndPublish`, and `archiveSettledWorkflowStageChats`.

## 7. Dumb-Worker Self-Contained Briefs & Zero-Trust Proof
- **Rule**: Assume every worker starts with zero implicit access to parent chat history; package every dispatch in a self-contained `<task_brief>` (or `<repair_brief>`) and require a structured `<worker_handoff>` backed by raw command exit codes and output excerpts.
- **Rationale**: Explicit input/output envelopes eliminate multi-hop context omission and force verifiable runtime proof before downstream stages proceed.
- **Anti-Pattern Rejected**: Delegating ambiguous prompts ("Apply the refactor discussed earlier") or accepting bare completion claims ("Everything is fixed and tested") without parsed exit codes.
- **Implemented Code Anchor**:
  - `paseo-bots/shared/workflows.ts`: `ORCHESTRATOR_WORKFLOW_PROTOCOL`, `WORKER_PROTOCOL_SUFFIX`, `buildStageBriefPrompt`, `extractWorkerHandoffBlock` (backtick-immune reverse parser), and `parseWorkerHandoff` (6 fields: `STATUS`, `SUMMARY`, `TOUCHED_FILES`, `VERIFICATION_PROOF`, `DOD_CHECKLIST`, `OPEN_ISSUES`).
  - `paseo-bots/server/workflow-runner.ts`: `waitForStageWithHeartbeat` and handoff status gating.

## 8. Fail-Closed Turn Lifecycle & Cross-Plane Verification
- **Rule**: Fuse JSON-RPC `session/prompt` responses with out-of-band `.system_generated` Brain file observation, enforce dual-clock watchdogs (`120s` stall / `600s` tool budget), record crash-safe turn journals, and inspect local SQLite (`step_type=17`) on upstream errors.
- **Rationale**: Un-heartbeated stdio RPC calls can hang silently or close prematurely during Reactive Wakeups; cross-checking disk artifacts guarantees fail-closed turn accounting and exact root-cause forensics.
- **Anti-Pattern Rejected**: Waiting forever on a dead ACP stdio promise, stranding running turns across daemon restarts, or surfacing opaque `"Internal error"` messages without reading upstream step tables.
- **Implemented Code Anchor**:
  - `paseo-agy-acp/server/brain-observer.ts` & `paseo-agy-acp/server/brain-projector.ts`: Real-time `.system_generated` Brain transcript observer and event projector.
  - `paseo-agy-acp/server/session.ts` & `paseo-agy-acp/server/mapping.ts`: `SessionManager` (120s/600s dual-clock watchdogs) and `appliesCarriedWakeup`.
  - `paseo-agy-acp/server/turn-journal.ts`: `beginTurnJournal`, `finishTurnJournal`, and `reconcileRunningTurns`.
  - `paseo-agy-acp/server/error-inspection.ts`: `readLastStepIndexFromDb`, `inspectConversationError` (`step_type=17`), and `buildTurnError`.

## 9. Deterministic Anti-Loop & Untrusted Peer Quarantine
- **Rule**: Enforce single-speaker turn ownership, advance monotonic sequence watermarks on `NO_REPLY` silent skips, ignore `@` mentions inside bot-generated replies, and isolate external webhook/peer payloads inside untrusted data blocks.
- **Rationale**: Advancing cursors deterministically and quarantining external text prevents exponential bot-to-bot echo storms and blocks indirect prompt-injection privilege escalation.
- **Anti-Pattern Rejected**: Scanning assistant output for `@bot-*` strings to trigger recursive replies, leaving unread cursors stuck on `NO_REPLY`, or splicing raw webhook bodies directly into system instructions.
- **Implemented Code Anchor**:
  - `AGENTS.md` (§4) & `paseo-bots-plugin-settings/bots.json`: Single-speaker mandate, `NO_REPLY` silent-skip contract, and `contactBots: "off"` isolation.
  - `paseo-bots/server/scheduler.ts` & `paseo-bots/server/relay.ts`: `Relay` (`readBody` byte cap) and untrusted webhook payload framing (`eventPrompt`).
  - `paseo-bots/server/handoffs.ts`: `registerHandoffs`, `publishHandoff`, and `handoffStatus`.

## 10. Scoped Same-Provider Fallback & Telemetry Flywheel
- **Rule**: Fail over transient capacity/rate errors (`429`, `503`, `RESOURCE_EXHAUSTED`) strictly across ordered `fallbackModels` within the same provider while failing fast on auth/schema faults (`401`, bad request), and pipe multi-harness transcripts through `bot-cleaner -> bot-analyst` to convert recurring friction into hardened rules and skills.
- **Rationale**: Staying within the active provider family preserves native tool names and mode semantics during failover, while systematic session mining compounds engineering velocity over time.
- **Anti-Pattern Rejected**: Switching from `agy` to `codex` mid-turn (breaking mounted tool schemas), retrying `401` credential errors in loops, or discarding failed session traces without structural root-cause distillation.
- **Implemented Code Anchor**:
  - `paseo-bots/server/chats.ts`: `runWithModelFallback` (ordered same-provider fallback execution).
  - `paseo-agy-acp/server/error-inspection.ts` & `paseo-bots/server/workflow-runner.ts`: `RETRYABLE_ERROR_TOKENS`, `isTransientApiError`, and `computeBackoffMs`.
  - `paseo-bots/shared/analytics.ts` & `paseo-bots/server/memory-curator.ts`: `ANALYTICS_CLEAN_BOT_ID` (`bot-cleaner`), `ANALYTICS_ANALYZE_BOT_ID` (`bot-analyst`), `AnalyticsRunInputSchema`, and automated memory curation.

---

## 11. Source-Anchored Quantitative Thresholds & Conformance Checks

All runtime bounds live in TypeScript constants (`D3`, `D5`); reference these symbols directly rather than duplicating raw literals in prompts:

| Constant Symbol | Value | Owner Module | Guarded Invariant |
| :--- | :--- | :--- | :--- |
| `MAX_INLINE_UPSTREAM_CHARS` | `2000` chars | `paseo-bots/shared/workflows.ts` | Caps inline inter-stage context; spills full output to `handoffFilePath` |
| `LIST_BUDGET_CHARS` | `2000` chars | `paseo-bots/server/tools/tasks.ts` | Bounds task-list MCP tool responses to prevent context bloat |
| `MAX_PROJECT_RULES_BYTES` | `16_384` bytes | `paseo-bots/server/prompt.ts` | Caps hydrated `AGENTS.md` / `CLAUDE.md` target-project rule injection |
| `DEFAULT_STALL_TIMEOUT_MS` | `120_000` ms (`2m`) | `paseo-bots/server/workflow-runner.ts` | Heartbeat stall timeout before stage cancellation/drain (`cancelAndDrainAgent`) |
| `DEFAULT_STAGE_HARD_TIMEOUT_MS` | `1_500_000` ms (`25m`) | `paseo-bots/server/workflow-runner.ts` | Hard wall-clock ceiling for any single workflow stage |
| `DEFAULT_ORPHAN_STALE_MS` | `600_000` ms (`10m`) | `paseo-bots/server/workflow-runner.ts` | Stale threshold for `reconcileOrphanWorkflows` recovery |
| `DEFAULT_BACKOFF_BASE_MS` / `MAX_BACKOFF_MS` | `1000` ms / `30_000` ms | `paseo-bots/server/workflow-runner.ts` | Exponential retry backoff bounds (`computeBackoffMs`) |
| `PRUNE_SETTLED_MS` | `604_800_000` ms (`7d`) | `paseo-bots/server/tasks.ts` | Retention window before settled task ledgers prune (`pruneSettled`) |
| `TOOL_TITLE_BUDGET` | `2000` chars | `paseo-agy-acp/server/tool-payload.ts` | Truncates oversized ACP tool call titles (`boundToolCallPayload`) |
| `TOOL_RAW_PAYLOAD_BUDGET` | `65_536` bytes (`64KB`) | `paseo-agy-acp/server/tool-payload.ts` | Caps raw ACP tool input/output JSON payloads |
| `TOOL_CONTENT_ITEMS_LIMIT` | `32` items | `paseo-agy-acp/server/tool-payload.ts` | Bounds content blocks per tool update |
| `EDIT_SNAPSHOT_MAX_BYTES` | `262_144` bytes (`256KB`) | `paseo-agy-acp/server/tool-payload.ts` | Caps pre/post file snapshots in `EditDiffTracker` (`synthesizeUnifiedDiff`) |
| `MAX_IMAGE_ATTACHMENT_BYTES` | `10_485_760` bytes (`10MB`) | `paseo-agy-acp/server/mapping.ts` | Per-image cap (`MAX_TOTAL_IMAGE_ATTACHMENT_BYTES = 50MB` per turn) |

### Re-Runnable Conformance Audit (`<projectRoot>`)

```bash
# Verify bot-moadmin physical tool isolation in bots.json (zero file/shell mutation tools)
jq -r '.values.bots[] | select(.id=="bot-moadmin") | .baseTools[]' paseo-bots-plugin-settings/bots.json

# Verify Managed Seat path-escape guard symbol presence
grep -rn 'export function assertInsideManagedDataDir' paseo-bots/server/claude-agents.ts

# Verify dual-plane Brain observer, turn journal, and SQLite error inspection modules
ls -1 paseo-agy-acp/server/brain-observer.ts paseo-agy-acp/server/turn-journal.ts paseo-agy-acp/server/error-inspection.ts
```
