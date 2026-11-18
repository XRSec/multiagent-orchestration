---
doc_id: PASEO-BOTS-SHARD-03-WORKFLOW-ENGINE-ROUTING
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Shard 03: Three-Tier Routing, Declarative Workflow DAG & Resilient Execution

Parent index: [../INDEX.md](../INDEX.md). Governs the 3-tier subagent routing model, Kahn DAG validation, parallel wave execution, cold-handoff protocol blocks (`<task_brief>`, `<worker_handoff>`, `<repair_brief>`), activity-driven heartbeat timeouts, orphan workflow reconciliation, and child stage chat archival.

## 1. Three-Tier Subagent & Workflow Routing

Route delegated work across three distinct execution tiers according to task determinism, statefulness, and provider capabilities (`resolveStepEngine` in `paseo-bots/shared/workflows.ts`, `toolsForEngine` in `paseo-bots/server/tools/index.ts`), because single-shot reconnaissance, stateful peer dialogue, and multi-stage pipelines require distinct context isolation and scheduling guarantees.

| Tier | Engine / Entry Tool | Execution Carrier & Tool Surface (`ENGINE_LABEL`) | Selection Rule (`resolveStepEngine`) |
| :--- | :--- | :--- | :--- |
| **Route 1** | `"native"` (`INVOKE_SUBAGENT_TOOL = "invoke_subagent"`) | Harness-native child subagent inside parent turn (`paseo-agy-acp` subagents or Claude `Task`). `toolsForEngine` strips `ask_bot` (`DISPATCH_ONLY_TOOLS`) while retaining `check_chat` and `search_chats`. | Explicit `engine: "native"`, or `engine: "auto"` when `provider !== "codex"`, `bot.playbooks` is empty, and `bot.contactBots === "off"`. |
| **Route 2** | `"paseo-bot"` (`ask_bot` -> `startChat`) | Resumable independent bot chat tagged with `ASKED_BY_LABEL`, `ASKED_IN_LABEL`, and `TEAM_SESSION_LABEL`; supports follow-up steering and `check_chat` inspection. | Explicit `engine: "paseo-bot"`, or `engine: "auto"` when `provider === "codex"` (no native subagent tool), `bot.playbooks.length > 0`, or `bot.contactBots !== "off"`. |
| **Route 3** | `run_workflow` (`runWorkflowTool` -> `runWorkflowDag`) | Host-scheduled declarative stage DAG (`WorkflowDefinitionSchema`, `1..50` stages) executing parallel topological waves with stage-level `skillIds` and `mcpServerIds` unions. | Triggered by `team-lead` via `run_workflow` MCP tool or by operator via `WorkflowsScreen`. |

When a stage declares `stage.skillIds`, `defaultStageDispatcher` (`paseo-bots/server/workflow-runner.ts`) sets `stageSeatKey = "<stageId>-<botId>"`, isolating merged `[...bot.skillIds, ...stage.skillIds]` symlinks under `<sessionBoardPath>/seats/<stageId>-<botId>` without mutating persistent seats or writing to `targetProjectDirs`.

## 2. Declarative DAG Schema, Kahn Validation & Wave Scheduling

Validate every `WorkflowDefinition` via `validateWorkflowDAG` (`paseo-bots/shared/workflows.ts`) prior to opening a run so malformed or cyclic graphs fail closed before allocating task records or spawning chats.

| Schema / Symbol | File Anchor | Constraints & Runtime Semantics |
| :--- | :--- | :--- |
| `WorkflowStageDefinitionSchema` | `paseo-bots/shared/workflows.ts` | `id` (`1..100`), `name` (`1..100`), `botId` (`1..100`), `prompt` (`<= 20,000`), `engine` (`auto \| native \| paseo-bot`), `dependsOn: string[]`, `maxRetries` (`0..10`, default `1`), optional `skillIds`, `mcpServerIds` |
| `WorkflowDefinitionSchema` | `paseo-bots/shared/workflows.ts` | `id`, `name`, `description` (`<= 1,000`), `stages` (`1..50` stages) |
| `TaskStageStateSchema` | `paseo-bots/shared/workflows.ts` | Resolved `engine` (`native \| paseo-bot`), `status` (`pending \| running \| done \| failed \| skipped`), `retries`, `maxRetries`, `error`, `output`, `handoffFilePath`, `chatId`, `startedAt`, `completedAt` |
| `WorkflowRunStateSchema` | `paseo-bots/shared/workflows.ts` | `workflowId`, `workflowName`, `status` (`running \| done \| failed`), `stages`, `currentStageIds`, `teamSessionId`, `sessionBoardPath`, `chatsArchivedAt` |

### Kahn Topological Validation & Parallel Wave Loop
1. **Graph Integrity (`validateWorkflowDAG`)**: Rejects empty stage arrays, blank/duplicate stage IDs, unknown `dependsOn` targets, self-dependencies, and cycles (via Kahn's zero-in-degree layer partitioning `layers: string[][]`, failing whenever `processedCount !== stages.length`).
2. **Wave Dispatch (`runWorkflowDag` in `paseo-bots/server/workflow-runner.ts`)**:
   - Registers `taskId` in `activeWorkflowTaskIds`, resolves `teamSessionId` and `sessionBoardPath`, provisions `handoffs/`, `artifacts/`, and `runs/`, and emits an initial live `TaskCard` (`publishWorkflowCard`).
   - Evaluates `readyStages(stages)` (`status === "pending"` with every `dependsOn` stage `"done"`), slices the wave to `task.budget?.fanout` when configured, and marks wave stages `"running"` (`WORKFLOW_TASK_LABEL`, `WORKFLOW_STAGE_LABEL`).
   - Acquires per-stage concurrency slots (`reserveMemberSlot`, retrying up to `MAX_SLOT_WAIT_ATTEMPTS = 20` at `SLOT_WAIT_MS = 500`) and executes the wave concurrently via `Promise.allSettled`.
   - Persists successful stage replies to `<sessionBoardPath>/handoffs/<stageId>-<botId>.md`, stamps `handoffFilePath`, updates `TaskRecord` via `updateTaskWorkflow`, and archives the finished stage chat immediately.
   - Stops the pipeline if any stage enters terminal `"failed"` (after exhausting `maxRetries`), marking all remaining `"pending"` stages `"skipped"` and settling via `settleAndPublish`.

## 3. Dual-End Cold-Handoff & Surgical Repair Templates

Synthesize self-contained stage prompts via `buildStageBriefPrompt` (`paseo-bots/shared/workflows.ts`), because worker stage sessions share zero conversational history with the orchestrator chat.

### 3.1 Attempt 1 Input: `<task_brief>` & `MAX_INLINE_UPSTREAM_CHARS = 2000`
Cap each upstream dependency's inline excerpt at `2,000` chars: prioritize extracting the closed `<worker_handoff>` block (if the block itself exceeds `2,000` chars, retain the head 30% and tail 70% so `VERIFICATION_PROOF` and `OPEN_ISSUES` are never clipped), fill any remaining budget with leading prose, and always append `Full upstream output saved at: <handoffFilePath>`.

```xml
<task_brief>
- WORKFLOW: <workflowName>
- STAGE_ID: <stage.id>
- STAGE_NAME: <stage.name>
- SESSION_BOARD: <sessionBoardPath>
- TASK_MANIFEST: <sessionBoardPath>/TASK_MANIFEST.md
- WORKFLOW_INPUT:
<userInput>
- UPSTREAM_CONTEXT:
### From "<depStageName>" (<depStageId>):
<distilledHandoffOrTruncatedOutput>
Full upstream output saved at: <sessionBoardPath>/handoffs/<depStageId>-<depBotId>.md
- SPECIFICATION:
<stage.prompt>
</task_brief>
```

### 3.2 Mandatory Worker Output: `<worker_handoff>`
Append `WORKER_PROTOCOL_SUFFIX` unless `<worker_handoff>` or `worker_protocol` is already present in the stage prompt, and validate worker output via `extractWorkerHandoffBlock` + `parseWorkerHandoff` (`paseo-bots/shared/workflows.ts`). `extractWorkerHandoffBlock` scans backwards from the last closing `</worker_handoff>` tag outside inline backticks so prose mentions of `` `<worker_handoff>` `` never swallow intermediate text. `parseWorkerHandoff` extracts 6 fields (`STATUS`, `SUMMARY`, `TOUCHED_FILES`, `VERIFICATION_PROOF`, `DOD_CHECKLIST`, `OPEN_ISSUES`); explicit `FAILED`, `BLOCKED`, or `PARTIAL` fails the stage and triggers retry evaluation, whereas replies without a block remain backward-compatible.

```xml
<worker_handoff>
STATUS: PASS | PARTIAL | BLOCKED | FAILED
SUMMARY: <1-3 concise bullets of changes/findings>
TOUCHED_FILES: <paths or "None">
VERIFICATION_PROOF: <command, exit code, and 3-10 line excerpt>
DOD_CHECKLIST: <optional checklist items>
OPEN_ISSUES: <None | exact blocker>
</worker_handoff>
```

### 3.3 Retry Input (`attempt > 1`): `<repair_brief>` & Single-Writer Drain
On stage retry (`retries < maxRetries`):
1. **In-Place Session Reuse**: Call `cancelAndDrainAgent` (`drainTimeoutMs = 15_000`, `pollIntervalMs = 100`) on `priorChatId` (`stageState.chatId`) to deny pending permissions (`interrupt: true`), cancel execution, and await non-running status. When `priorChatId` is unarchived and idle, send the retry prompt into `priorChatId` via `sendBotMessage` to retain KV cache and open file context.
2. **Fallback Fresh Session with Git Snapshot**: If `priorChatId` is archived or unusable, drain it first, capture `git status -s` and `git diff --stat` (`5,000` ms timeout) via `captureWorkspaceSnapshot`, inject them via `injectWorkspaceSnapshotToPrompt`, and spawn a new chat via `startChat`.

```xml
<repair_brief>
- WORKFLOW: <workflowName>
- STAGE_ID: <stage.id> (<stage.name>)
- ATTEMPT: <attempt>/<maxRetries + 1>
- PREVIOUS_FAILURE: <previousError>
- INSTRUCTION: Diagnose the failure above, apply only the minimal surgical fix required without rewriting working parts, and re-verify.
- WORKSPACE_GIT_STATUS:
```
<git status -s>
```
- WORKSPACE_GIT_DIFF:
```
<git diff --stat>
```
</repair_brief>
```

## 4. Heartbeat Timeouts, Backoff, Orphan Reconciliation & Auto-Archival

Guard stage execution and lifecycle cleanup through deterministic timers and startup sweeps in `paseo-bots/server/workflow-runner.ts`:

| Constant / Symbol | Value / Default | Operational Behavior |
| :--- | :--- | :--- |
| `DEFAULT_STALL_TIMEOUT_MS` | `120_000` (2 min) | `waitForStageWithHeartbeat` aborts stalled stages when subscription events, `agent.updatedAt`, `activeTurn`, and tail timeline entries show zero progress for 120 s |
| `DEFAULT_STAGE_HARD_TIMEOUT_MS` | `1_500_000` (25 min) | Absolute per-stage wall-clock ceiling regardless of heartbeat activity |
| `DEFAULT_BACKOFF_BASE_MS` / `MAX_BACKOFF_MS` | `1_000` / `30_000` | `computeBackoffMs` applies `base * 2^retryCount` strictly when `isTransientApiError` matches (`429`, `5xx`, `Transport not connected`, `rate limit`, provider reload races); skipped on timeouts and validation/handoff errors |
| `DEFAULT_ORPHAN_STALE_MS` | `600_000` (10 min) | `reconcileOrphanWorkflows` settles `status: "running"` tasks absent from `activeWorkflowTaskIds` (`staleAfterMs: 0` on startup; `10 min` on `workflowRunsRpc`). Rescues stages whose agent finished cleanly with a non-failing reply, fails remaining `"running"` stages (`ORPHAN_REASON`), and skips `"pending"` stages |
| `archiveWorkflowStageChats` | Terminal settlement | Archives unique child `stage.chatId` sessions (excluding `callerAgentId`) and stamps `chatsArchivedAt`; `archiveSettledWorkflowStageChats` retroactively cleans historical settled runs; `notifyWorkflowCallerOnSettle` wakes `callerAgentId` with `buildWorkflowCompletionSummary` |

## 5. Conformance Matrix

| Requirement | Primary Anchor | Verification Command |
| :--- | :--- | :--- |
| Kahn cycle detection & `resolveStepEngine` | `paseo-bots/shared/workflows.ts`, `validateWorkflowDAG` | `npm --prefix paseo-bots test -- shared/workflows` |
| Backtick-safe `<worker_handoff>` parser | `paseo-bots/shared/workflows.ts`, `extractWorkerHandoffBlock`, `parseWorkerHandoff` | `npm --prefix paseo-bots test -- shared/workflows` |
| Wave runner, heartbeat, reuse & orphan rescue | `paseo-bots/server/workflow-runner.ts`, `runWorkflowDag`, `reconcileOrphanWorkflows` | `npm --prefix paseo-bots test -- workflow-runner` |
