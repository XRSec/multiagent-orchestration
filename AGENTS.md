<!--
Purpose: Root agent operational manual, execution contracts, and multi-agent governance rules.
Context: Paseo + Antigravity ACP multi-agent runtime.
Prerequisites: source .env before invoking credentials or protected gateways.
-->

IMPORTANT: Think and respond in Chinese. Bootstrap environment with `source .env` before invoking credentials or protected gateways.

Top-level layout: `paseo-bots/` (Paseo bots plugin), `paseo-agy-acp/` (Antigravity ACP adapter), `paseo-bots-plugin-settings/` (bot roster SSOT `bots.json`), `paseo-bots-plugin-data/` (shareable bot skills & workspace assets), `paseo-sidecar/` (standalone SidecarMCP control plane), `docs/` (specs & standards), `scripts/`, `.githooks/`, `.github/`.

## 1. Core Operating Disciplines (Strict Mandate)

1. **Act First, Explore Later**: Execute directly using known facts; never waste 10+ calls "understanding context".
2. **Strict Call Budgets**: Simple tasks <= 5 calls, medium <= 15 calls, complex <= 30 calls. At 30 calls, halt and consult operator.
3. **Refuse Archaeology**: Strictly deny requests to dig git logs, old tasks, or past session ruins. Operate on current living context only.
4. **No Loop / Repetition**: If the same tool (especially bash) repeats > 5 times consecutively without progress, STOP and rethink.
5. **Ask, Don't Guess**: If critical parameters are missing, ask 1 focused question rather than guessing across dozens of calls.
6. **One-Shot Operations**: Favor comprehensive batch commands over fragmented micro-steps.
7. **Safe Delete Invariant**: NEVER use `rm` or `rm -rf`. ALWAYS use universal safe delete (`SAFE_DELETE_BIN` fallback or Node `fs.rmSync`) for all file and folder deletions.
8. **Git Squash Before Push**: ALWAYS squash dirty unpushed commits into a single atomic commit before pushing.

### 1.1 Anti-Thrashing & Execution Acceleration Protocols
1. **Schema-First Probe**: NEVER write parsers or business handlers blind. Sample 1 record or query schema first before implementation to avoid 50+ edit-run thrashing loops.
2. **3-Fail Circuit Breaker**: If any tool (especially `edit_file` or `run_command`) fails 3 consecutive times on the same target, STOP immediately, inspect root causes or query the operator.
3. **Batch Over Interactive Ping-Pong**: For remote SSH, daemon diagnosis, or complex inspections, bundle commands into a one-shot probe script returning structured summaries rather than interactive step-by-step probing.

---

## 2. Standards & Skills Topology

1. **Runtime Skills Root**:
   - Runtime Antigravity skills reside under `~/.gemini/config/skills/` and bot-scoped Paseo skills under `~/.paseo/plugin-data/paseo-bots/shared/Bots/<bot-id>/skills/`.
   - Repository engineering and documentation standards live under `docs/` and govern all code and specs.

2. **Core Repository Standards**:
   - **Script Standards** ([docs/dev-rules/script-standards.md](docs/dev-rules/script-standards.md)):
     - **Line Budget**: `<= 500` normal; `500-800` requires one-line justification in header; `> 800` split into runner + modules (`./lib/`).
     - **Complexity**: Function length `<= 50` lines; cyclomatic complexity `<= 10`.
     - **Header Contract**: 3-4 lines declaring Purpose, Context, Usage, Prerequisites.
     - **Zero TTY Blocking**: Inputs via flags, env, or stdin only; no interactive prompts (`read -p`, `input()`).
     - **Exit Codes**: `0` OK, `1` error, `2` guardrail/hook violation (`TERM_BLOCK`), `124` timeout.
   - **Agent-First Docs & Axioms** ([docs/axioms/STANDING_ORDER.md](docs/axioms/STANDING_ORDER.md), [docs/standards/documentation-standards.md](docs/standards/documentation-standards.md)):
     - **Internal Artifacts**: Specs, skills, memory shards, protocols, and markdown rules MUST be authored in dense `en-US`.
     - **User Verbatim Preservation**: User-facing replies follow the user's natural language; quotes, names, and code identifiers MUST remain verbatim.
     - **Rule-First Density**: Lead with the rule, add a one-line rationale, add 1-2 examples only for edge cases; omit conversational filler.
     - **Zero Demo Code**: Never include sample or demonstration code in specs/skills unless defining strict output templates.
     - **Determinism by Code**: Enforce formats via schemas and host validation, not prose.
     - **No Machine-Specific Paths (D7)**: Never hardcode machine-specific absolute paths (e.g., user home directories).
     - **Index & Shards Topology**: Root definitions stay minimal; heavy schemas factor into shards; multi-step tasks track on-disk `.t3/TASK_MANIFEST.md`.

---

## 3. Paseo Bots Roster & Domain Boundaries

Authoritative SSOT: [paseo-bots-plugin-settings/bots.json](paseo-bots-plugin-settings/bots.json). All bots execute with CWD `.` via Antigravity (`agy`) native tools and Paseo runtime.

| Bot ID | Display Name | Provider / Model | CWD | Domain & Capabilities | Allowed Write Scope |
|---|---|---|---|---|---|
| `bot-moadmin` | **moAdmin** | `agy` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Taskforce director; subagent orchestration (`invoke_subagent`, `send_message`, `manage_subagents`), `.t3/TASK_MANIFEST.md` | None (Pure Orchestrator; delegates all file writes to specialist bots) |
| `bot-mocode` | **moCode** | `agy` / `gemini-4-hydrogen` | `.` | Fullstack developer & code architect; Antigravity native tools (`read_file`, `write_file`, `edit_file`, `run_command`) | `paseo-bots/`, `paseo-agy-acp/`, `scripts/`, `tools/`, `extensions/` |
| `bot-modoc` | **moDoc** | `agy` / `gemini-4-hydrogen` | `.` | Architecture scribe & documentation steward; Antigravity native tools | `docs/`, `*.md` |
| `bot-moci` | **MoCI** | `agy` / `gemini-4-hydrogen` | `.` | CI & QA gatekeeper; test execution, regression verification, 3-tier verdicts (`PASS`/`WARN`/`FAIL`) | `.github/`, `paseo-bots/`, `paseo-agy-acp/` (tests/reports only) |
| `bot-mogit` | **MoGit** | `agy` / `gemini-4-hydrogen` | `.` | SCM & git hygiene specialist; commit squashing, hooks, branch lifecycle | `.git/`, `.githooks/`, `scripts/`, `CHANGELOG.md` |
| `bot-modeep` | **MoDeep** | `agy` / `gemini-4-hydrogen` | `.` | Research scout & codebase reconnaissance (`read_file`, `search_web`) | `docs/research/` (read-only on code) |
| `bot-mo` | **Mo** | `agy` / `gemini-4-hydrogen` | `.` | Meta-toolsmith; agent scaffolding & skill creation | `paseo-bots-plugin-settings/`, `~/.gemini/config/agents/`, `~/.gemini/config/skills/` |
| `bot-rea` | **REA** | `agy` / `gemini-4-hydrogen` | `.` | Reverse engineering & security audit (`run_command`, `read_file`, CLI-first) | `docs/research/` (disallowed: `paseo-bots/`, `paseo-agy-acp/`, `.env`) |
| `bot-x` | **X 订阅官** | `agy` / `gemini-3.8-flash` | `.` | X (Twitter) intelligence & daily digest (`read-twitter` skill, `ego-browser`) | `./workspace/` (bot-scoped outputs) |
| `bot-xhs` | **小红书订阅官** | `agy` / `gemini-4-hydrogen` | `.` | Xiaohongshu feed & trend digest (`ego-browser`) | `./workspace/` (bot-scoped outputs) |
| `bot-github` | **GitHub** | `agy` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | GitHub PR, Issues & notifications monitor (`gh` CLI read-only queries) | `./workspace/` (bot-scoped outputs) |
| `bot-cleaner` | **会话提取官** | `agy` / `gemini-3.8-flash` | `.` | Multi-harness session telemetry & friction distiller | `./workspace/` (bot-scoped outputs) |
| `bot-analyst` | **工作流架构师** | `agy` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Execution ROI, anti-bloat diagnosis & skill/rule optimizer | `docs/`, `AGENTS.md`, `~/.gemini/config/skills/` |
| `bot-prism` | **Prism** | `agy` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Prism antidetect browser & fingerprint automation, CDP session control, structured page extraction | `./workspace/` (bot-scoped outputs) |

---

## 4. Multi-Agent Collaboration Protocol

1. **Single-Speaker Protocol**: Only one designated agent speaks per turn.
2. **Incremental Signal Only**: Deliver ONLY net-new findings in group or multi-agent exchanges.
3. **Native Silent Skip (`NO_REPLY`)**: When unmentioned or without incremental delta, output exact token `NO_REPLY` and exit.
4. **Bounded Autonomous Turns**: Maximum 20 autonomous turns per task (and `MAX_REPAIR_ROUNDS = 3` per subagent dispatch) before operator checkpoint confirmation.
5. **Orchestrated Dispatch**: `moAdmin` decomposes tasks into `.t3/TASK_MANIFEST.md` and dispatches specialist subagents via Paseo/ACP (`invoke_subagent`, `send_message`).
6. **Subagent ID Whitelist**: ALL subagents MUST use the standard `bot-` prefixed ID (e.g., `bot-mocode`, `bot-modeep`, `bot-moci`, `bot-mogit`). Legacy identifiers without prefix (`mocode`, `modeep`) are strictly forbidden.
7. **Swarm Gate**: NEVER invoke `swarm` for pure Q&A, architectural reviews, or single-file edits. Swarm is reserved for multi-worktree parallel coding or large-scale repo migrations.
8. **Paseo Plugin Host Axioms**:
   - `directory` mode plugins do not auto-install `node_modules`; dependencies must be resolved locally or bundled.
   - `PluginSettingsStore` uses memory caching with lazy disk persistence; do not rely on instantaneous external disk mutations.

---

## 5. Docs Knowledge Tree (Routing)

1. **Entry Point**: Doc catalogue and statuses: [docs/README.md](docs/README.md). Agent doc lookups route through [docs/INDEX.md](docs/INDEX.md); the read path and read cap are in [docs/_conventions.md](docs/_conventions.md) `[2.1.1]`.
2. **Write-Back**: The change that alters a fact edits the doc stating it, in the same commit.
3. **Doc Rules**: [docs/standards/documentation-standards.md](docs/standards/documentation-standards.md) binds every doc; [docs/_conventions.md](docs/_conventions.md) is its addendum.
4. **Paseo Configuration & Storage**: Session and bot storage topology is managed by Paseo + ACP; see [docs/paseo/paseo-bots-configuration-and-storage.md](docs/paseo/paseo-bots-configuration-and-storage.md).
