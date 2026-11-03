# Task Assignment: Agent Execution Engine & CLI REPL Architecture Survey

## Target
Read `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md`.
Investigate the codebase for agent runtime and CLI interaction capabilities:
- Inspect `apps/desktop/src/main/cli-pool/` and any other agent runner code to understand how Claude CLI / agent processes are spawned and communicated with.
- Inspect how partner configurations are passed to the CLI or Agent SDK (e.g. system prompt, `--system-prompt`, cwd, flags, stdin/stdout format).
- Investigate what package dependencies are installed (e.g., in root `package.json` or subpackages) that can be used for `scripts/cli-room.ts` (e.g. readline, tsx, chalk, etc.).
- Propose the concrete architecture for `scripts/cli-room.ts` that provides the lightweight REPL, room selection, @partner parsing, and agent process execution with streaming/reply display.
- Propose the automated headless test strategy for acceptance testing.
- Write your structured report to `.agents/teamwork/explorer_2/handoff.md`.
