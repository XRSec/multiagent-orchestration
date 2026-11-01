---
doc_id: NDJSON_POOL_SPEC
version: 2.0.0
type: SPECIFICATION_TREE
parent_node: ../../AGENTS.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: CLAUDE RUNTIME DRIVER & ENGINE SPECIFICATION

* **[1] ENGINE SELECTION & PROTOCOL HIERARCHY**
  * **[1.1] Primary Engine (Electron / Node.js Main Process)**:
    * Standard: `@anthropic-ai/claude-agent-sdk` (`v0.3.310+`).
    * Protocol: Programmatic `stdio` NDJSON driver encapsulating native Claude Code binary.
    * Credentials: Inherits local OAuth session from `~/.claude/` (Pro / Max subscription zero-cost reuse).
    * In-Memory Advantage: `PreToolUse` hooks and `nexus-orchestrator-mcp` run as in-process callbacks (`0` external hook scripts, `0` IPC socket latency).
  * **[1.2] Secondary Engine (Rust/Tauri or Go Host Fallback)**:
    * Standard: Bare CLI `claude -p --input-format stream-json --output-format stream-json`.
    * Protocol: Raw NDJSON piped through `claude-code-parser`.
  * **[1.3] Prohibited Protocols**:
    * PTY / TUI terminal emulation: Strictly banned (unstructured ANSI stream, zero reliable JSON barrier).
    * ACP (Agent Client Protocol): Banned (multi-engine compromise layer that strips Claude-native fork and in-flight hooks).

* **[2] IN-MEMORY STEERING & IN-PROCESS MCP ARCHITECTURE**
  * **[2.1] In-Memory PreToolUse Hook**:
    * Hook callback signature: `async (toolName, input) => { additionalContext?: string, updatedInput?: object, permissionDecision?: "allow" | "deny" | "defer" }`.
    * Mid-flight amendment: Host mutates steering state in RAM; next hook tick returns `additionalContext: "[STEERING_OVERRIDE]: ..."` within `<= 1ms`.
  * **[2.2] In-Process Orchestration MCP**:
    * The 3 orchestration tools (`dispatch_and_queue_partners`, `await_partner_queue`, `steer_or_repair_partner`) mount directly in host memory, bound directly to the active SQLite instance and ticket queue.
  * **[2.3] Method-Level Interruption**:
    * Hard interrupt triggers via `query.interrupt()` or `abortController.abort()` without process destruction.

* **[3] WATCHDOG & EXECUTION INVARIANTS**
  * **[3.1] Timeout Redline**: Maximum continuous silent execution: `30,000ms`.
  * **[3.2] Sandbox Isolation**: `cwd` strictly points to `~/.multiagent-orchestration/partners/<id>/`.
