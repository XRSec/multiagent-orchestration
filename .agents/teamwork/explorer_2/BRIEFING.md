# BRIEFING — 2026-11-02T15:05:00Z

## Mission
Investigate agent execution engine & CLI REPL architecture for scripts/cli-room.ts

## 🔒 My Identity
- Archetype: explorer
- Roles: Teamwork explorer (instance 2)
- Working directory: /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/explorer_2
- Original parent: 6b30ea9e-f854-4e5d-a1e8-c198386ac545
- Milestone: Agent Execution Engine & CLI REPL Architecture Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Discipline: No Overthinking (calls <= 15)
- Never use rm, use /opt/xrsec/.env/rmfile
- SCRIPT_STANDARDS <= 600 lines
- Write only to /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/explorer_2/

## Current Parent
- Conversation ID: 6b30ea9e-f854-4e5d-a1e8-c198386ac545
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `apps/desktop/src/main/cli-pool/ClaudeProcessManager.mjs` (CLI NDJSON pool)
  - `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs` (Agent SDK programmatic driver)
  - `apps/desktop/src/main/cli-pool/SteeringController.mjs` (Dual-channel steering)
  - `src/core/claude-subprocess.mjs` (One-shot turn CLI runner)
  - `src/session/bot-group-service.mjs` (Cindy BotGroupService and room state machine)
  - `packages/runtime-assets/builtin-partners/` (Pre-existing partner assets)
  - `scripts/link-agents.mjs` (Dual-plane partner linker)
  - `docs/dev-rules/ndjson-pool.md` & `docs/dev-rules/bot-group-orchestration.md`
- **Key findings**:
  - Node v26.10.0 supports native TypeScript execution without transpilation or external loaders.
  - `/opt/homebrew/bin/claude` v2.1.309 is available and functioning.
  - `claude-code-parser` and `@anthropic-ai/claude-agent-sdk` are installed and directly importable.
  - `ClaudeProcessManager.mjs` manages long-running CLI sessions via stream-json NDJSON, layered system prompt assembly, and stdin control frames.
  - `BotGroupService` already encapsulates room creation, monotonic sequence allocation, client_id idempotency, and partner delta message tracking.
  - Built-in assets provide 4 of the 7 required partners (`doc-skill-keeper`, `lead-orchestrator`, `cindy-r`, `rea-partner`); 3 missing partners (`coder-core`, `coder-web`, `troubleshooter`) must be auto-completed in `~/.multiagent-orchestration/partners/`.
- **Unexplored areas**: None for this investigation phase.

## Key Decisions Made
- Architecture for `scripts/cli-room.ts`: Single-file modular CLI REPL (<= 600 lines) combining partner auto-readiness, BotGroupService persistence, mention parsing, and ClaudeProcessSession/subprocess execution.
- Headless testing strategy: CLI flags (`--headless`, `--test-mode`, `--room`, `--send`) allowing deterministic non-interactive automated test suites (`tests/test-cli-room.mjs`).

## Artifact Index
- DISPATCH.md — Task assignment
- BRIEFING.md — Persistent memory
- progress.md — Heartbeat & progress tracker
- handoff.md — Final structured report
