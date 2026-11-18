# Task Manifest: `paseo-bots` Workflow Subsystem Hardening & `wf-moadmin-closed-loop` Optimization

- **Workflow ID**: `wf-moadmin-closed-loop`
- **Status**: `COMPLETED` (`SETTLED`)
- **Active Stage**: `None` (All 7 stages passed & finalized)
- **Repository Root**: `multiagent-orchestration` (`paseo-bots/`, `paseo-bots-plugin-settings/`, `docs/`)
- **Diagnostics Log Path**: `/tmp/multiagent-orchestration.log` (optional runtime/test trace sink)

---

## 1. Objective

Comprehensively audit, harden, and improve:
1. **`paseo-bots/` Workflow Runtime, Session Blackboard, & Client UI**:
   - DAG scheduling, topological execution, `engine` routing (`auto` / `native` / `paseo-bot`), bounded retries (`maxRetries`), stage timeout/cancellation propagation, and failure settlement.
   - Session Blackboard (`TASK_MANIFEST.md` + `handoffs/`) and `<worker_handoff>` parsing, normalization, and upstream context propagation across direct and transitive DAG dependencies.
   - Client Management UI (`WorkflowsScreen.tsx`, `WorkflowEditor.tsx`, `WorkflowPipelinePreview.tsx`) and live Progress/Handoff Cards (`TaskCard.tsx`, `HandoffCard.tsx`) UX, validation, and state synchronization.
2. **`wf-moadmin-closed-loop` Definition & Stage Contracts**:
   - Stage prompt templates, `dependsOn` edges, engine selection, blackboard/manifest path alignment, and `<worker_handoff>` schema consistency in `paseo-bots-plugin-settings/bots.json` and `paseo-bots/shared/workflow-templates.ts`.

---

## 2. Resolved Friction Leads & Verified Changes

1. **Lead-1 (FIXED) — Duplicate `wf-` Session Blackboard Prefix**:
   - `paseo-bots/server/workflow-runner.ts` now deduplicates the `wf-` prefix when deriving fallback `teamSessionId` (`taskId.startsWith("wf-") ? taskId : \`wf-${taskId}\``).
2. **Lead-2 (FIXED) — Manifest Path Split & Bot Working Directory Drift**:
   - `buildStageBriefPrompt` (`paseo-bots/shared/workflows.ts`) and `runWorkflowDag` (`paseo-bots/server/workflow-runner.ts`) now inject explicit `- SESSION_BOARD` and `- TASK_MANIFEST` paths into `<task_brief>`, aligning stage workers even when team `cwd` is `null`.
3. **Lead-3 (FIXED) — Upstream Context & Cross-Hop Dependency Visibility**:
   - `wf-moadmin-closed-loop` in `paseo-bots-plugin-settings/bots.json` now declares `dependsOn: ["moadmin-plan", "mocode-impl"]` for `moci-verify` and `dependsOn: ["mocode-impl", "moadmin-review"]` for `modoc-writeback`, preserving the 7-layer DAG topology while exposing upstream DoD and `TOUCHED_FILES`.
4. **Lead-4 (FIXED) — `<worker_handoff>` Contract, Timeout Swallowing & `PARTIAL` Semantics**:
   - `defaultStageDispatcher` (`paseo-bots/server/workflow-runner.ts`) explicitly catches `waitForFinish(stageTimeoutMs)` timeouts / still-running states instead of swallowing them, and treats `PARTIAL` handoff status alongside `FAILED` / `BLOCKED` as non-passing for retry/failure propagation.
   - `parseWorkerHandoff` (`paseo-bots/shared/workflows.ts`) extracts all 6 canonical fields (`status`, `summary`, `touchedFiles`, `verificationProof`, `dodChecklist`, `openIssues`) and tolerates Markdown bolding and list markers.
5. **Lead-5 & Lead-6 (FIXED) — Client UI & `WorkflowsScreen` Live Execution Visualization**:
   - Added `workflowRunsRpc` (`bots.workflows.runs`) in `paseo-bots/shared/rpc.ts` and registered its handler in `paseo-bots/index.server.ts` returning `TaskCard[]` for workflow runs.
   - Added **Active & Recent Runs** section in `paseo-bots/client/WorkflowsScreen.tsx` (with `en.ts` / `zh-CN.ts` i18n keys), polling active runs every 4s, rendering live stage DAG progress via `TaskCardView`, and supporting one-click chat navigation via `openScreen(chatScreen(...))`.
6. **Lead-7 (FIXED) — Architecture Docs & Team/Personal Memory Consolidation**:
   - Updated `docs/paseo/paseo-bots-workflow-engine-and-routing.md` (`v1.1.0`), `docs/paseo/INDEX.md`, and `docs/README.md` with all runtime, blackboard, RPC/UI, and `version: 4` envelope facts.
   - Consolidated architectural invariants and `bots.json` `version: 4` envelope guidance into personal and team `MEMORY.md`.

---

## 3. Specialist Execution DAG & Scope Boundaries

| Stage ID | Specialist | Status | Authorized Write Scope | Audit Verdict |
|---|---|---|---|---|
| `moadmin-plan` | `bot-moadmin` | `DONE` | `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` | `PASS` |
| `modeep-recon` | `bot-modeep` | `DONE` | `None` (read-only recon) | `PASS` |
| `mocode-impl` | `bot-mocode` | `DONE` | `paseo-bots/**`, `paseo-bots-plugin-settings/bots.json` | `PASS` (10 authorized files) |
| `moci-verify` | `bot-moci` | `DONE` | `None` (read-only QA) | `PASS` (`86` files / `900` tests) |
| `moadmin-review` | `bot-moadmin` | `DONE` | `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` | `PASS` (Approved for doc write-back) |
| `modoc-writeback` | `bot-modoc` | `DONE` | `docs/**` (`3` doc files, zero code/config edits) | `PASS` (`DOC_VERIFY_OK`) |
| `moadmin-finalize` | `bot-moadmin` | `DONE` | `MEMORY.md` (personal + team), `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` | `PASS` (`SETTLED`) |

---

## 4. Acceptance Criteria (DoD Checklist)

- [x] **DoD-1 (Runtime & DAG Scheduling Hardening)**: Fixed double `wf-` session prefix, stage timeout swallowing, and `PARTIAL` status failure propagation in `workflow-runner.ts`; verified by `tests/workflow-runner.test.ts` (`5` tests passed).
- [x] **DoD-2 (Blackboard & `<worker_handoff>` Fidelity)**: Injected `SESSION_BOARD` and `TASK_MANIFEST` into `<task_brief>` and upgraded `parseWorkerHandoff` to 6-field markdown-tolerant extraction in `shared/workflows.ts`; verified by `tests/workflows.test.ts` (`11` tests passed).
- [x] **DoD-3 (Client UI & `TaskCard` Robustness)**: Added `bots.workflows.runs` RPC (`shared/rpc.ts`, `index.server.ts`) and live **Active & Recent Runs** DAG visualization + direct chat navigation on `WorkflowsScreen.tsx` (+ `en.ts`/`zh-CN.ts`); verified by `tsc --noEmit` and `tests/workflow-ui.test.ts` (`5` tests passed).
- [x] **DoD-4 (`wf-moadmin-closed-loop` Contract Optimization)**: Updated `wf-moadmin-closed-loop` in `paseo-bots-plugin-settings/bots.json` with cross-hop `dependsOn` edges, aligned `TASK_MANIFEST` guidance, and 6-field `<worker_handoff>` contract inside valid `{ "version": 4, "values": ... }` envelope (`botSettings.schema.parse` verified).
- [x] **DoD-5 (Zero-Regression Verification)**: `npm run typecheck` (`Exit_Code: 0`) and `npm test` (`86` files, `900` tests passed, `0` skipped, `0` `TODO` stubs, `0` hardcoded user paths) verified.
- [x] **DoD-6 (Documentation Write-Back & Stage Handoffs)**: Updated `docs/paseo/paseo-bots-workflow-engine-and-routing.md` (`v1.1.0`), `docs/paseo/INDEX.md`, and `docs/README.md` (`DOC_VERIFY_OK`, zero D7 violations); finalized personal + team `MEMORY.md` and settled task manifests across all 7 stages.
