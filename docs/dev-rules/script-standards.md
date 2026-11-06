---
doc_id: SCRIPT_STANDARDS_SPEC
version: 1.0.0
type: SPECIFICATION_TREE
parent_node: ../../AGENTS.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: PRACTICAL SCRIPT STANDARDS & DEVELOPMENT CONVENTIONS

* **[1] CHILD ROUTING TABLE**
  * `- [AGENTS](../../AGENTS.md) :: [LOAD_IF: need_parent_charter]`
  * `- [STANDING_ORDER](../axioms/STANDING_ORDER.md) :: [LOAD_IF: ALWAYS]`

* **[2] I/O & LINE BUDGET CONTRACTS**
  * **[2.1] Quantified Line Limits**:
    * `[2.1.1]` Single script normal length budget: `<= 500` lines.
    * `[2.1.2]` Extended justification band: `500-800` lines (requires a one-line justification in the file header).
    * `[2.1.3]` Hard redline limit: `> 800` lines (MUST be refactored into modular sub-files under `scripts/<tool-name>/` or `./lib/`).
    * `[2.1.4]` Single function scope: `<= 50` lines; cyclomatic complexity `<= 10`.
  * **[2.2] Universal 3-4 Line Header Contract**:
    * Every script created or touched in this repository MUST start with a 3-4 line comment declaring:
      - Line 1: Purpose & capability summary.
      - Line 2: Context / triggering reason / background problem.
      - Line 3: Usage command with arguments.
      - Line 4: Prerequisites, environment variables, or binary dependencies.

* **[3] DETERMINISTIC EXECUTION & EXIT CODE DISCIPLINES**
  * **[3.1] Standard Exit Codes**:
    * `0`: SUCCESS (`TERM_OK`).
    * `1`: GENERAL_ERROR.
    * `2`: GUARDRAIL_OR_INPUT_VIOLATION (`TERM_BLOCK`, aligned with PreToolUse hook code 2).
    * `124`: TIMEOUT.
  * **[3.2] Language Runtime Standards**:
    * `[3.2.1] Bash (.sh)`: Line 2 MUST be `set -euo pipefail`. Must include error trap.
    * `[3.2.2] Node.js (.mjs, .ts)`: Native ES Modules only. Native `node:*` built-ins. Explicit uncaught exception handling.
    * `[3.2.3] Python (.py)`: Standard library first (Python 3.10+).

* **[4] MULTIAGENT-ORCHESTRATION DUAL-PLANE ISOLATION INVARIANTS**
  * **[4.1] Non-Interactive Execution**:
    * `0` interactive prompts (`read -p`, `input()`). Scripts MUST execute cleanly in headless CI and subagent pipelines.
  * **[4.2] Filesystem Sandbox Integrity**:
    * Repo tools in `scripts/**` MUST NOT mutate runtime sandbox `~/.multiagent-orchestration/` without explicit `link` command.
    * Partner-authored scripts MUST restrict scratchpad I/O strictly to `./workspace/` or OS temp.
  * **[4.3] Safe Deletion Invariant**:
    * NEVER use bare recursive `rm -rf`.
    * Route file deletions through `/opt/xrsec/.env/rmfile <target>`.
  * **[4.4] Secrets & Environment**:
    * Hardcoded credentials are strictly forbidden. Source `.env` explicitly in local tools (`[ -f .env ] && source .env`).

* **[5] BOY SCOUT REFACTORING LAW**
  * When editing existing scripts (e.g. `scripts/link-agents.mjs`), leave the file cleaner without performing unrequested disruptive rewrites.
