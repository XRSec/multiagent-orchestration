# Task Manifest: `paseo-bots` UX & Stability Closed-Loop Optimization

- **Workflow ID**: `wf-moadmin-closed-loop`
- **Session ID**: `wf-2cf6cd8c`
- **Status**: `COMPLETED`
- **Active Stage**: `SETTLED` (All 7 stages `moadmin-plan` .. `moadmin-finalize` completed)
- **Target Scope**: `paseo-bots/` (code & tests), `docs/paseo/` (stage 6 write-back)

---

## 1. Objective

Deliver a full closed-loop UX and runtime stability upgrade in `paseo-bots/` across three mandatory deliverables:
1. **DoD-1 (High Priority) — Fix "Open Partner Chat" (`打开伙伴对话`) Navigation Bug**: Clicking "Open Partner Chat" from workflow stage UI (`TaskStageModal` / `TaskCard`) opens the stage's existing `stage.chatId` session instead of landing on a new blank chat session.
2. **DoD-2 — Orphan Workflow State Reconciliation on Process Restart**: Reconcile residual `status: "running"` workflow tasks and stages in disk `tasks/*.json` on plugin startup and/or task listing when no active in-memory workflow runner owns the task and staleness thresholds are exceeded, settling them to `failed` / `interrupted` and emitting updated card state so `TaskCard` never hangs indefinitely.
3. **DoD-3 — Structured Protocol Tag UI Cards & `<repair_brief>` Retry Session Reuse**:
   - **DoD-3A (Client Protocol Cards)**: Recognize `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` XML blocks in chat messages and render them as theme-aligned collapsible structured cards (`PASS` green, `PARTIAL` yellow, `BLOCKED` orange, `FAILED` red; expandable `VERIFICATION_PROOF` and `DOD_CHECKLIST`; `en` and `zh-CN` i18n) instead of raw plain-text XML.
   - **DoD-3B (Server Retry Session Reuse)**: Reuse a stage's existing usable `chatId` via `sendBotMessage` when `server/workflow-runner.ts` dispatches a `<repair_brief>` retry (preserving KV cache and conversation history), falling back to creating a new session only when the prior session is unavailable.

---

## 2. Target File Boundaries & Recon / Implementation Guide

> **Path Note**: Top-level plugin entrypoints reside at `paseo-bots/index.client.tsx` and `paseo-bots/index.server.ts` (not under `paseo-bots/client/index.client.tsx`).
> **Living-Context Check**: `bot-modeep` MUST first inspect `git status --short` and `git diff --stat` inside `paseo-bots/` to detect any existing uncommitted work so `bot-mocode` integrates cleanly without regressions.

### 2.1 DoD-1: Partner Chat Session Navigation
- **Primary Targets**:
  - `paseo-bots/client/chat/stream/TaskStageModal.tsx`
  - `paseo-bots/client/chat/stream/TaskCard.tsx`
  - `paseo-bots/index.client.tsx`, `paseo-bots/client/BotsSurfaceReady.tsx`, `paseo-bots/client/ChatPane.tsx`, `paseo-bots/client/navigation.ts`, `paseo-bots/client/screen-navigation.ts`, `paseo-bots/client/intent.ts`
- **Reference Patterns (Compare Against)**:
  - `paseo-bots/client/chat/stream/HandoffCard.tsx`
  - `paseo-bots/client/PaseoSidebar.tsx`
  - `paseo-bots/client/WorkflowsScreen.tsx`
- **Key Investigation Focus**:
  - Trace how `stage.chatId` and `stage.botId` flow from `TaskStageModal` / `TaskCard` through `onOpenChat` / `openScreen(chatScreen(...))` / surface intent state, and identify where `chatId` is dropped, mis-keyed, overwritten by default new-chat initialization, or missing bot-directory binding.

### 2.2 DoD-2: Orphan Workflow State Reconciliation
- **Primary Targets**:
  - `paseo-bots/index.server.ts`
  - `paseo-bots/server/tasks.ts`
  - `paseo-bots/server/task-cards.ts`
  - `paseo-bots/server/workflow-runner.ts`
  - `paseo-bots/shared/task-card.ts` (if terminal status/reason metadata requires alignment)
- **Key Design Guardrails**:
  - Track active in-process workflow runs in memory (e.g., active task registry in `workflow-runner.ts`).
  - Reconcile orphan `running` (and stale `issued`/`initializing` workflow stage) records during server startup initialization AND lazily when reading/listing running workflow tasks if no in-memory runner is active and `updatedAt` / `startedAt` exceeds a safe staleness window.
  - Persist settled terminal state (`failed` / `interrupted` with clear diagnostic summary) to disk `tasks/*.json` and refresh/publish `TaskCard` updates so connected UI surfaces reflect settlement immediately.
  - Never reap genuinely active in-memory runs.

### 2.3 DoD-3: Structured Protocol Cards & Retry `chatId` Reuse
- **DoD-3A Targets (Protocol Parsing & Collapsible UI Cards)**:
  - Shared parser/tokenizer: `paseo-bots/shared/workflows.ts` (or dedicated shared protocol parser module imported by client/tests) — segment message text into markdown prose vs. `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` blocks without corrupting fenced code blocks (` ``` `). Reuse/align with 6-field `parseWorkerHandoff`.
  - Stream UI & i18n: `paseo-bots/client/chat/stream/rows.tsx`, `paseo-bots/client/chat/stream/model.ts`, `paseo-bots/client/chat/stream/ProtocolCard.tsx` (new or colocated card component), `paseo-bots/client/Markdown.tsx` (if assistant/user text renders directly through Markdown), `paseo-bots/client/i18n/en.ts`, `paseo-bots/client/i18n/zh-CN.ts`.
  - Visual & Theme Contract: Align with `PluginTheme["colors"]` and `TaskCard` styling; map `PASS` -> green/success, `PARTIAL` -> yellow/warning, `BLOCKED` -> orange/caution, `FAILED` -> red/danger; provide collapsible disclosure for `VERIFICATION_PROOF` and `DOD_CHECKLIST` (plus brief sections for `<task_brief>` / `<repair_brief>`).
- **DoD-3B Targets (`<repair_brief>` Retry Session Reuse)**:
  - `paseo-bots/server/workflow-runner.ts` (and `paseo-bots/server/chats.ts` / `sendBotMessage` caller contract).
  - Pass prior attempt `chatId` into retry dispatch when `attempt > 1` (repair attempt); if `chatId` is non-empty and usable, send `<repair_brief>` via `sendBotMessage` on that existing `chatId` and await turn completion; if reusing `chatId` throws or session is unavailable, fall back cleanly to creating a fresh session and updating `stage.chatId`.

---

## 3. Specialist Execution DAG & Scope Matrix

| Stage ID | Specialist | Topology | Status | Authorized Write Scope | Output / Handoff Contract |
|---|---|---|---|---|---|
| `moadmin-plan` | `bot-moadmin` | Root | `DONE` | `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` | Atomic DAG, scope matrix, DoD checklist |
| `modeep-recon` | `bot-modeep` | `dependsOn: [moadmin-plan]` | `DONE` | `None` on repo; session `handoffs/modeep-recon-report.md` allowed | Exact root-cause line citations & signatures for DoD-1..3 |
| `mocode-impl` | `bot-mocode` | `dependsOn: [modeep-recon]` | `DONE` | `paseo-bots/{index.client.tsx,index.server.ts,client/**,server/**,shared/**,tests/**}` ONLY | Full implementation + unit/component tests + green `typecheck` & `vitest` |
| `moci-verify` | `bot-moci` | `dependsOn: [moadmin-plan, mocode-impl]` | `DONE` | `None` (Read-only QA gatekeeper) | Full `typecheck` + `vitest run` proof, stub/skip audit, diff boundary audit |
| `moadmin-review` | `bot-moadmin` | `dependsOn: [moci-verify]` | `DONE` | `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` | Zero-trust 3-gate audit (`PASS` / `<repair_brief>`) |
| `modoc-writeback` | `bot-modoc` | `dependsOn: [mocode-impl, moadmin-review]` | `DONE` | `docs/**` ONLY (`docs/paseo/paseo-bots-workflow-engine-and-routing.md`, indexes) | Synced architecture specs in `en-US` (`D7` compliant) |
| `moadmin-finalize` | `bot-moadmin` | `dependsOn: [modoc-writeback]` | `DONE` | `MEMORY.md` (personal + team), `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` | Distilled memory + final `zh-CN` executive report |

### Hard Guardrails (All Stages)
1. **Strict Scope Lock**: Zero edits outside stage-authorized paths (`DO NOT touch paseo-agy-acp/, paseo-bots-plugin-settings/, .env`).
2. **Safe Delete Invariant**: NEVER invoke `rm` or `rm -rf`; use `SAFE_DELETE_BIN` or Node `fs.rmSync` if deletion is ever required.
3. **Call Budgets & Anti-Thrashing**: `<= 15` medium / `<= 30` complex calls; Schema-First Probe before writing parsers; 3-Fail Circuit Breaker on repeated errors.
4. **Zero Silent Stubs**: No `TODO`, `FIXME`, `.skip` / `.only`, or mocked fake passes.
5. **6-Field `<worker_handoff>`**: Every stage MUST conclude with `STATUS`, `SUMMARY`, `TOUCHED_FILES`, `VERIFICATION_PROOF`, `DOD_CHECKLIST`, and `OPEN_ISSUES`.

---

## 4. Acceptance Criteria (DoD Checklist)

- [x] **DoD-1 ("Open Partner Chat" Navigation Fix)**: Clicking "Open Partner Chat" (`打开伙伴对话`) in `TaskStageModal` / `TaskCard` navigates directly to the stage's existing `stage.chatId` conversation rather than opening a blank chat; covered by unit/component tests (`tests/partner-chat-navigation.test.tsx`, `tests/workflow-ui.test.ts`).
- [x] **DoD-2 (Orphan Workflow State Reconciliation)**: Residual `status: "running"` workflow tasks/stages without an active in-memory runner (past staleness window or on plugin restart) automatically settle to `failed` / `interrupted`, persist to disk, and update `TaskCard` state; covered by unit tests (`reconcileOrphanWorkflows` in `tests/workflow-runner.test.ts`).
- [x] **DoD-3A (Structured Protocol Tag UI Cards)**: `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` XML blocks render in chat as collapsible themed cards (`PASS` green / `PARTIAL` yellow / `BLOCKED` orange / `FAILED` red) with expandable `VERIFICATION_PROOF` & `DOD_CHECKLIST` and `en` / `zh-CN` i18n; covered by parser & component tests (`tests/protocol-cards.test.tsx`).
- [x] **DoD-3B (`<repair_brief>` Retry Session Reuse)**: `server/workflow-runner.ts` reuses an existing stage `chatId` via `sendBotMessage` on `<repair_brief>` retries and falls back to creating a new session only when unavailable; covered by unit tests (`tests/workflow-runner.test.ts`).
- [x] **DoD-4 (Full Verification Gate)**: `npm --prefix paseo-bots run typecheck` and `npm --prefix paseo-bots test` (`vitest run`) both exit `0` (`88` files, `914` tests) with zero skipped tests and zero `TODO` stubs.
- [x] **DoD-5 (Documentation Write-Back)**: `docs/paseo/` specs updated to reflect orphan workflow reconciliation, retry `chatId` reuse, and structured protocol UI cards with zero machine-specific paths (`D7`).
