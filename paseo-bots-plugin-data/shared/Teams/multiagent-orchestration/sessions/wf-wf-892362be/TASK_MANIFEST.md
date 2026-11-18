# Task Manifest: Protocol Block UI Cards & Same-Stage Retry Session Reuse

- **Workflow**: `wf-moadmin-closed-loop`
- **Status**: `STAGE_1_PLANNED`
- **Active Stage**: `moadmin-plan` (`DONE`) -> `modeep-recon` (`NEXT`)
- **Target Package**: `paseo-bots/` (Workspace root: `.`)

---

## 1. Objective

1. **Structured Protocol Tag UI Cards (Core)**:
   - Detect `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` XML protocol blocks in the chat stream message rendering pipeline instead of rendering raw XML tags.
   - Render compact, collapsible/expandable structured cards strictly adhering to `@getpaseo/plugin` `PluginTheme["colors"]` semantic tokens and existing `TaskCard` / `HandoffCard` visual primitives:
     - `<worker_handoff>`: Top status badge (`PASS` green / `PARTIAL` yellow / `BLOCKED` orange / `FAILED` red) + `SUMMARY`; default collapsed view displays concise summary and `TOUCHED_FILES` tag pills; one-click expand/collapse reveals `VERIFICATION_PROOF` (command / `Exit_Code` / output excerpt), `DOD_CHECKLIST`, and `OPEN_ISSUES` (when non-empty / not `None`).
     - `<task_brief>` / `<repair_brief>`: Compact dispatch/repair contract card highlighting `TASK_ID` / `OBJECTIVE` (or `WORKFLOW` / `STAGE_ID` when present) and `FAILED_CRITERIA` (for `<repair_brief>`), keeping remaining contract sections collapsed by default with one-click expand/collapse.
   - Synchronize `en-US` (`paseo-bots/client/i18n/en.ts`) and `zh-CN` (`paseo-bots/client/i18n/zh-CN.ts`) locale strings.
   - Cover parser edge cases (fenced code block isolation so literal examples inside triple-backtick fences remain code, mixed prose + protocol blocks, streaming/unclosed or malformed tags) and card rendering/toggle behavior with unit and component tests.
2. **Same-Stage Retry Session Reuse (Hardening)**:
   - Harden `paseo-bots/server/workflow-runner.ts` so stage retries (attempts `2..N` with `<repair_brief>`) reuse an existing usable stage `chatId` via `sendBotMessage` to preserve KV cache and prior repair context, falling back cleanly to `createBotChat` (new session) only when no usable `chatId` exists or session reuse fails/errors.
   - Verify reuse vs. fallback behavior in `paseo-bots/tests/workflow-runner.test.ts`.

---

## 2. Specialist Execution DAG & Scope Boundaries

| Stage ID | Specialist | Topology | Authorized Read Scope | Authorized Write Scope |
|---|---|---|---|---|
| `moadmin-plan` | `bot-moadmin` | Stage 1 | `paseo-bots/` directory tree, `.t3/TASK_MANIFEST.md` | `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` |
| `modeep-recon` | `bot-modeep` | Stage 2 (`SEQUENTIAL`) | `paseo-bots/client/chat/**`, `paseo-bots/client/Markdown.tsx`, `paseo-bots/client/theme.ts`, `paseo-bots/client/i18n/**`, `paseo-bots/shared/workflows.ts`, `paseo-bots/server/workflow-runner.ts`, `paseo-bots/server/chats.ts`, `paseo-bots/tests/**`, `docs/**` | Session `handoffs/` report only (`ZERO` repo code/doc edits) |
| `mocode-impl` | `bot-mocode` | Stage 3 (`SEQUENTIAL`) | `modeep-recon` handoff + `paseo-bots/**` | `paseo-bots/shared/**`, `paseo-bots/client/**`, `paseo-bots/server/workflow-runner.ts`, `paseo-bots/tests/**` (`DO NOT` touch `paseo-agy-acp/`, `paseo-sidecar/`, or `bots.json`) |
| `moci-verify` | `bot-moci` | Stage 4 (`SEQUENTIAL`) | `paseo-bots/**` | `None` (read-only full test & typecheck execution) |
| `moadmin-review` | `bot-moadmin` | Stage 5 (`SEQUENTIAL`) | Stage handoffs, git diff, test outputs | `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` |
| `modoc-writeback` | `bot-modoc` | Stage 6 (`SEQUENTIAL`) | `paseo-bots/**`, `docs/**` | `docs/**` (`ZERO` code/config edits) |
| `moadmin-finalize` | `bot-moadmin` | Stage 7 (`SEQUENTIAL`) | Final handoffs, `MEMORY.md` | `MEMORY.md`, `.t3/TASK_MANIFEST.md`, session `TASK_MANIFEST.md` |

---

## 3. Downstream Stage Specifications & Architectural Contracts

### 3.1 `modeep-recon` (`bot-modeep`) Recon Checklist
1. **Chat Stream Interception Point**: Inspect `paseo-bots/client/chat/Stream.tsx`, `paseo-bots/client/chat/stream/model.ts`, `paseo-bots/client/chat/stream/rows.tsx`, `paseo-bots/client/Markdown.tsx`, `paseo-bots/client/chat/stream/TaskCard.tsx`, `paseo-bots/client/chat/stream/HandoffCard.tsx`, and `paseo-bots/client/chat/stream/ui.tsx`. Identify the exact message rendering seam (assistant/user/system message text blocks) where mixed prose + XML protocol tags should split into prose `Markdown` segments and structured protocol cards without breaking copy/search/bookmark behavior.
2. **Theme & Status Palette Mapping**: Document exact `PluginTheme["colors"]` tokens and helper styles used in `TaskCard.tsx` / `HandoffCard.tsx` / `client/theme.ts` for `PASS` (green/success), `PARTIAL` (yellow/warning), `BLOCKED` (orange/caution), and `FAILED` (red/danger) badges, card borders, surfaces, monospace proof blocks, and file pills.
3. **Protocol Block Parser Schema**: Inspect `parseWorkerHandoff`, `buildStageBriefPrompt`, and `buildStageRepairPrompt` in `paseo-bots/shared/workflows.ts` to list every emitted key across `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` (both workflow-generated keys and `moAdmin` standing-instruction keys).
4. **Same-Stage Retry Call Path**: Inspect `defaultStageDispatcher` and retry loop in `paseo-bots/server/workflow-runner.ts` plus `createBotChat` / `sendBotMessage` / `waitForChatIdle` signatures in `paseo-bots/server/chats.ts` (or injected dispatcher dependencies). Pinpoint how `chatId` is returned on failed Attempt 1, how Attempt 2+ receives `previousChatId`, and which failure conditions require falling back to a fresh session.

### 3.2 `mocode-impl` (`bot-mocode`) Implementation Guardrails
1. **Pure Segment Parser (`shared/`)**:
   - Extract mixed text into ordered segments (`markdown` vs. `task_brief` | `repair_brief` | `worker_handoff`).
   - Ignore `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` occurrences inside fenced code blocks (`` ``` `` or `~~~`) or inline code spans so documentation/prompt examples render as literal code.
   - Gracefully handle malformed, nested, or still-streaming unclosed tags without crashing or dropping surrounding prose.
   - Parse bullet/key-value fields (`- KEY: value`, bolded `**KEY**:`, and multiline blocks like `VERIFICATION_PROOF`, `DOD_CHECKLIST`, `TOUCHED_FILES`, `IMPLEMENTATION SPEC`, `SURGICAL_FIX_SPEC`) cleanly.
2. **Structured UI Cards (`client/chat/stream/`)**:
   - Use `@getpaseo/plugin` `PluginTheme["colors"]` tokens exclusively (zero raw hex literals outside theme helpers if avoidable; match `TaskCard.tsx` border, radius, typography, and interactive expand/collapse affordances).
   - `<worker_handoff>`: Header badge (`PASS` / `PARTIAL` / `BLOCKED` / `FAILED`) + concise `SUMMARY` + default-visible `TOUCHED_FILES` pill list (hide or render subtle empty state when `None`); collapsible detail drawer for `VERIFICATION_PROOF`, `DOD_CHECKLIST`, and `OPEN_ISSUES`.
   - `<task_brief>` & `<repair_brief>`: Compact contract header highlighting `TASK_ID` / `STAGE_ID` + `OBJECTIVE` (for `<task_brief>`) or `FAILED_CRITERIA` + `ROOT_CAUSE_DIAGNOSIS` summary (for `<repair_brief>`), with full contract fields collapsed by default and expandable in one click.
   - Add aligned `en-US` and `zh-CN` keys in `paseo-bots/client/i18n/en.ts` and `paseo-bots/client/i18n/zh-CN.ts`.
3. **Retry Session Reuse (`server/workflow-runner.ts`)**:
   - Thread prior attempt `chatId` into retry dispatch (`attempt > 1`).
   - In `defaultStageDispatcher` (and custom dispatcher contract where applicable), when `reuseChatId` is present and valid, invoke `sendBotMessage` on the existing chat session with the `<repair_brief>` prompt and await turn completion; if `sendBotMessage` throws or the session is unusable/missing, catch and fall back to creating a new chat session (`createBotChat`), recording the active `chatId` on the stage state/result.
   - Ensure response extraction on reused multi-turn chats reads the latest assistant turn output (not stale Attempt 1 output!).
4. **Tests (`tests/`)**:
   - Add unit tests for protocol block segmentation/parsing (mixed prose + XML, fenced code blocks, unclosed streaming tags, all 4 `<worker_handoff>` statuses, `<task_brief>` and `<repair_brief>` field extraction).
   - Add component/rendering tests for collapsed default state, status badge rendering, `TOUCHED_FILES` pills, and expand/collapse toggling.
   - Add `workflow-runner.test.ts` cases proving: (a) Attempt 2 reuses Attempt 1 `chatId` via `sendBotMessage` and reads the new turn's `<worker_handoff>`, and (b) Attempt 2 falls back to creating a new session when `sendBotMessage` throws or Attempt 1 produced no `chatId`.
   - Validate i18n key parity via `tests/i18n.test.ts`.

### 3.3 `moci-verify` (`bot-moci`) Verification Gate
- Run `npm --prefix paseo-bots run typecheck` and `npm --prefix paseo-bots test` (or `bun test` / package script equivalent per `paseo-bots/package.json`).
- Audit zero skipped tests (`.skip` / `todo`), zero `TODO`/`FIXME` stubs in touched files, and D7 compliance (zero hardcoded user home paths).

---

## 4. Risk Watchpoints

1. **Stale Assistant Message Extraction on Reused Session**: When reusing `chatId` on Attempt 2+, a naive helper that scans from the start or grabs the wrong transcript entry could re-parse Attempt 1's failed `<worker_handoff>`. `modeep-recon` and `mocode-impl` MUST verify that post-turn output extraction reads the latest assistant message appended after `sendBotMessage`.
2. **Code-Fence False Positives**: System prompts or `<task_brief>` instructions often embed literal `<worker_handoff>` templates inside fenced XML blocks (` ```xml ... ``` `). Segment parsing MUST strip/skip fenced code blocks before matching top-level protocol tags, and handle `<task_brief>` containing an inner fenced `<worker_handoff>` example without premature outer tag termination or inner card splitting.
3. **Streaming Partial Tags**: During live token streaming, an unclosed `<task_brief>` or `<worker_handoff>` block must either render cleanly or fall back without throwing runtime exceptions.
4. **Prime Invariants**: Zero `rm`/`rm -rf` (universal safe delete only), call budgets (`<= 15` medium / `<= 30` complex), 3-fail circuit breaker, and zero out-of-scope file mutations.

---

## 5. Acceptance Criteria (DoD Checklist)

- [ ] **DoD-1 (Protocol Segment Parser & Edge Cases)**: `<task_brief>`, `<repair_brief>`, and `<worker_handoff>` blocks parse accurately alongside surrounding Markdown prose while preserving fenced code blocks, inner template examples, and streaming/malformed inputs without regressions.
- [ ] **DoD-2 (Collapsible UI Cards & Theme Fidelity)**: Chat stream renders `<worker_handoff>` (4-color status badge, summary, `TOUCHED_FILES` tags, expandable `VERIFICATION_PROOF` / `DOD_CHECKLIST` / `OPEN_ISSUES`) and `<task_brief>` / `<repair_brief>` (highlighted `TASK_ID` / `OBJECTIVE` / `FAILED_CRITERIA`, collapsed details by default) strictly using `PluginTheme["colors"]` and `TaskCard` visual language.
- [ ] **DoD-3 (Bilingual i18n Parity)**: `paseo-bots/client/i18n/en.ts` and `paseo-bots/client/i18n/zh-CN.ts` include all new UI card labels and pass `i18n.test.ts`.
- [ ] **DoD-4 (Same-Stage Retry Session Reuse & Fallback)**: `paseo-bots/server/workflow-runner.ts` reuses existing usable stage `chatId` via `sendBotMessage` on retry attempts (`2..3`), extracts the latest assistant turn reply, and falls back to creating a new session when the prior session is unavailable or errors.
- [ ] **DoD-5 (Full QA Verification)**: `paseo-bots` typecheck and full test suite pass with `Exit_Code: 0`, zero skipped tests, zero `TODO` stubs, and zero hardcoded machine paths (D7).
- [ ] **DoD-6 (Documentation Write-Back & Closed-Loop Handoffs)**: `docs/` updated in `en-US` reflecting protocol tag UI cards and retry session reuse semantics; every workflow stage emits a valid `<worker_handoff>`.
