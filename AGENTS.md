---
doc_id: MULTIAGENT_ORCHESTRATION_AGENTS_ROOT
version: 1.0.0
type: REPO_ARCHITECTURE_AST
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: MULTIAGENT-ORCHESTRATION DEVELOPMENT & DIRECTORY SPECIFICATION

* **[1] STANDING ORDER INHERITANCE**
  * **[1.1]** `- [STANDING_ORDER](./docs/axioms/STANDING_ORDER.md) :: [LOAD_IF: ALWAYS]`
  * **[1.2]** Every specification, skill, prompt template, and code comment inside this repository MUST conform to `STANDING_ORDER.md` (`100%` `en-US`, `0` examples, numbers-first, `[X.Y.Z]` tree topology).
  * **[1.3] 代码行数规范**: `- [SCRIPT_STANDARDS](./docs/dev-rules/script-standards.md) :: [LOAD_IF: ALWAYS]` (单文件 `<= 600` 行，`500` 行预警，`800` 行硬拆分)。

* **[2] PROJECT ARCHITECTURE & DUAL-PLANE ISOLATION**
  * **[2.1] Runtime Engine Hierarchy**:
    * **[2.1.1] Primary Driver (Electron Main)**: `@anthropic-ai/claude-agent-sdk` (programmatic stdio NDJSON, in-memory PreToolUse hooks, in-process MCP, zero third-party/Codex/Pi dependencies).
    * **[2.1.2] Secondary Driver (CLI Fallback)**: Native `claude` CLI (`v2.1.220+`) spawned via `--print --input-format stream-json --output-format stream-json --verbose --include-partial-messages`.
  * **[2.2] Plane Separation Invariants**:
    * **[2.2.1]** `Build-Time Plane`: `/apps/desktop/**`, `/packages/steering-hook/**`, `/scripts/**`, `/docs/**`.
    * **[2.2.2]** `Run-Time Asset Plane`: `/packages/runtime-assets/**` (symlinked at file granularity into `~/.multiagent-orchestration/`).
    * **[2.2.3]** `Naming Prohibition`: `NEVER` create a file named `CLAUDE.md` or a directory named `.claude` inside `/packages/runtime-assets/**`. Author partner manuals as `PARTNER_MANUAL.md`; `/scripts/link-agents.ts` maps `PARTNER_MANUAL.md -> ~/.multiagent-orchestration/partners/<id>/CLAUDE.md`.

* **[3] REPOSITORY DIRECTORY & MODULE ROUTING TREE**
  * **[3.1] Architecture Leaf Specs (Lazy Load)**:
    * `- [NDJSON_POOL_SPEC](./docs/dev-rules/ndjson-pool.md) :: [LOAD_IF: modifying apps/desktop/src/main/cli-pool/**]`
    * `- [ORCHESTRATOR_MCP_SPEC](./docs/dev-rules/orchestrator-mcp.md) :: [LOAD_IF: modifying apps/desktop/src/main/orchestrator/**]`
    * `- [IPC_SQLITE_SPEC](./docs/dev-rules/ipc-and-sqlite.md) :: [LOAD_IF: modifying apps/desktop/src/main/db/** or preload/**]`
    * `- [SCRIPT_STANDARDS_SPEC](./docs/dev-rules/script-standards.md) :: [LOAD_IF: authoring or modifying scripts/** or test runners]`
    * `- [WEB_PARSER_STUDIO_SPEC](./docs/dev-rules/web-parser-and-studio.md) :: [LOAD_IF: modifying apps/desktop/src/renderer/**]`
    * `- [BOT_GROUP_ORCHESTRATION_SPEC](./docs/dev-rules/bot-group-orchestration.md) :: [LOAD_IF: modifying group chat, partner storage, or multi-repo mounting]`
  * **[3.2] Core Directory Contracts**:
    * **[3.2.1]** `/apps/desktop/src/main/cli-pool/`: Manages `claude` child processes, parses UTF-8 NDJSON lines, dispatches `control_request (subtype: "interrupt")` frames over `stdin`, and enforces a `30,000ms` silent-stdout watchdog timer.
    * **[3.2.2]** `/apps/desktop/src/main/orchestrator/`: Implements the in-process `nexus-orchestrator-mcp` server bound exclusively to `lead-orchestrator` (`3` tools: `dispatch_and_queue_partners`, `await_partner_queue`, `steer_or_repair_partner`).
    * **[3.2.3]** `/apps/desktop/src/main/partners/`: Executes symlink verification, parses `manifest.json`, and injects the first `200` lines (`<= 25,600` bytes) of `~/.multiagent-orchestration/partners/<id>/memories/MEMORY.md`.
    * **[3.2.4]** `/apps/desktop/src/renderer/`: React UI (`@assistant-ui/react` + `shadcn/ui` `Trace` components) supporting explicit multi-message quoting (`<quoted_context>`), topic forking (`--resume <uuid> --fork-session`), and direct editing of partner `SOUL.md` / `MEMORY.md`.
    * **[3.2.5]** `/packages/steering-hook/`: Node.js `PreToolUse` script that queries the local orchestrator IPC mailbox; injects `[STEERING_OVERRIDE]` via `additionalContext` or exits with code `2` to abort invalidated tool calls.

* **[4] BUILD & LINK DECISION TREE**
  * **[4.1] IF (`modified_files` INTERSECTS `/packages/runtime-assets/**` OR `/docs/axioms/STANDING_ORDER.md`)**:
    * **[4.1.1]** Validate modified Markdown AST against `STANDING_ORDER.md` (`<= 200` lines for root files, `<= 40` tokens for frontmatter `description`).
    * **[4.1.2]** `EXEC Bash("pnpm agents:link")` -> verify `exit_code == 0` -> `TERM_OK`.
  * **[4.2] IF (`modified_files` INTERSECTS `/scripts/**`)**:
    * **[4.2.1]** Validate script line count (`<= 600` lines) and presence of 3-4 line self-doc header per `SCRIPT_STANDARDS_SPEC`.
    * **[4.2.2]** Verify zero unhandled exceptions and explicit exit codes -> `TERM_OK`.
  * **[4.3] IF (`modified_files` INTERSECTS `/apps/**` OR `/packages/steering-hook/**`)**:
    * **[4.3.1]** `EXEC Bash("pnpm typecheck && pnpm test")` -> IF `exit_code == 0` THEN `TERM_OK` ELSE `TERM_ESCALATE`.
