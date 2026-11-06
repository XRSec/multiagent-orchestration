# DISPATCH RECEIPT: M4-WEB-WORKSPACE-MIGRATION-REGULATION

- **Receipt ID**: `RCPT-20261105-M4-WEB-REGULATION-02`
- **Timestamp**: `2026-11-05T13:10:00.000Z`
- **Dispatcher**: `moAdmin` (`bot_moadmin_director_03`, Taskforce Director & Orchestration Lead)
- **Assignee**: `moCode` (`bot_mocode_engine_01`, Core Full-Stack Engineer)
- **Workstream**: `M4: Web UI & Multi-Agent Group Chat Workspace Consolidation`
- **Status**: `DISPATCHED_CONFIRMED`

---

## 1. Architectural Announcement & Baseline Mandate

Per Human Operator Directive, the core frontend project structure is definitively consolidated:

1. **Sole Authoritative Workspace**:
   - Location: `src/web/` (Relative to `<projectRoot>`).
   - Package Name: `web` (Private workspace package in `pnpm-workspace.yaml`).
2. **Unified Execution Commands**:
   - Monorepo Root: `pnpm web:dev` (or `pnpm --filter web dev`)
   - Package Dir: `cd src/web && pnpm dev`
   - Build Verification: `pnpm web:build` (or `pnpm --filter web build`)
3. **Strict Zero-Access Boundary (Host & Legacy Quarantine)**:
   - All historical desktop pages launched via deprecated paths are permanently deleted.
   - **MANDATORY**: Agents (`moCode`, `moDoc`, `MoCI`, `MoGit`, `MoDeep`, `Mo`) are strictly forbidden from scanning, reading, modifying, or creating artifacts inside legacy paths (`extensions/multiagent-orchestration-old/`) or host `~/.claude/`.
4. **Target Feature Scope**:
   - Multi-agent group chat interface (`src/web/src/pages/bots/BotGroupChatPage.tsx`).
   - Human message submission and multi-bot reactive streaming over WebSocket (`/gateway`).
   - Message timeline with execution status card (`ExecutionStatusCard.tsx`) strictly mounted **ABOVE** the message content bubble (`Process First, Conclusion Last`).
   - Strict height limitation (`max-h-56` / `max-h-60`) with native scrollbar suppression (`.no-scrollbar`).

---

## 2. Agent Operational Directives

### Directive to `bot_mocode_engine_01` (moCode):
- Formally acknowledge receipt and accept the binding order (`接单确认`).
- Direct all future frontend refactoring, component extensions, and dev server validations exclusively into `src/web/`.
- Ensure all automated scripts, tests, and package configurations point solely to `src/web`.

### Directive to `bot_modoc_scribe_02` (moDoc):
- Align all architectural documentation (`docs/architecture/`, `PROJECT.md`) to reflect `src/web/` as the single frontend source of truth.

---

## 3. Governance Gates
- **Gate 1**: Zero cross-directory pollution into host `~/.claude/`.
- **Gate 2**: `pnpm web:build` passes with 0 type errors.
- **Gate 3**: Strict adherence to `.no-scrollbar` styling, container height ceilings, and `ExecutionStatusCard` above bubble placement.
