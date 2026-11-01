---
name: scaffold-partner
description: Create or update partner workspaces in ~/.multiagent-orchestration/partners/ enforcing STANDING_ORDER v3.0.0 tree schemas.
version: 1.0.0
parent_node: ../../PARTNER_MANUAL.md
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash(mkdir -p ~/.multiagent-orchestration/partners/*)
---

# [0] ROOT: SKILL SCAFFOLD-PARTNER

* **[1] CHILD ROUTING TABLE**
  * `- [STANDING_ORDER](~/.multiagent-orchestration/axioms/STANDING_ORDER.md) :: [LOAD_IF: ALWAYS]`

* **[2] I/O & GUARDRAIL CONTRACTS**
  * **[2.1] InputSchema**: `{ action: "CREATE" | "UPDATE", partner_id: string(kebab-case), role_spec: string, model: "claude-sonnet-4-6" | "claude-opus-4-6", mcp_servers: object, allowed_tools: string[], initial_memories: string[] }`
  * **[2.2] OutputSchema**: `{ partner_id: string, workspace_path: string, files_written: string[], validation_passed: boolean }`
  * **[2.3] Invariants**:
    * `[2.3.1]` Target path MUST match `~/.multiagent-orchestration/partners/<partner_id>/**`.
    * `[2.3.2]` NEVER write or modify files inside a symlinked read-only builtin partner unless `action == "UPDATE"` targets `./memories/**`.

* **[3] EXECUTION DECISION TREE**
  * **[3.1] Step-1 [VALIDATE TARGET]**: Check `~/.multiagent-orchestration/partners/<partner_id>/manifest.json` via Glob.
    * `├── IF (exists AND is_symlink AND action == "CREATE")` -> `TERM_BLOCK(code: 2, reason: "ERR_CANNOT_OVERWRITE_SYMLINKED_BUILTIN_PARTNER")`.
    * `└── ELSE` -> goto [3.2].
  * **[3.2] Step-2 [SCAFFOLD DIRECTORY TREE]**:
    * `EXEC Bash("mkdir -p ~/.multiagent-orchestration/partners/<partner_id>/{.claude/skills,memories/topics,workspace}")` -> verify exit_code == 0.
  * **[3.3] Step-3 [AUTHOR TREE ARTIFACTS IN en-US]**:
    * `[3.3.1]` Write `manifest.json`: Set id, name, model, summary_for_lead (<= 40 tokens), allowed_tools, and `"stateless_by_default": true`.
    * `[3.3.2]` Write `SOUL.md`: Serialize role, domain scope, and explicit prohibitions as `[0]..[3]` AST nodes per `STANDING_ORDER.md`.
    * `[3.3.3]` Write `CLAUDE.md`: Serialize tool SOPs and child skill routing pointers (<= 200 lines).
    * `[3.3.4]` Write `mcp.json`: Serialize MCP server configurations.
    * `[3.3.5]` Write `memories/MEMORY.md`: Convert `initial_memories[]` into indexed `en-US` nodes (<= 200 lines, <= 25,600 bytes).
  * **[3.4] Step-4 [SELF-AUDIT]**:
    * Verify 0 conversational tokens, 100% `en-US` locale, and line count limits across generated files -> `TERM_OK(OutputSchema)`.
