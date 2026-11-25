<!--
Purpose: Root agent operational manual, execution contracts, and multi-agent governance rules.
Context: Paseo + Antigravity ACP multi-agent runtime.
Prerequisites: source .env before invoking credentials or protected gateways.
-->

IMPORTANT: Think and respond in Chinese. Bootstrap environment with `source .env` before invoking credentials or protected gateways.

Top-level layout: `paseo-bots/` (Paseo bots plugin, active core), `paseo-agy-acp/` (Antigravity ACP adapter, active core), `paseo-feed/` (continuous virtual feed micro-plugin, active), `paseo-long-session/` (proactive compaction & memory sync micro-plugin, active), `paseo-bots-plugin-settings/` (bot roster SSOT `bots.json`, decoupled `souls/` & `mcp-servers/`), `paseo-bots-plugin-data/` (shareable bot skills incl. `x-research`, `read-twitter`, `prism` & managed seats), `docs/` (project & design shards), `scripts/`, `tools/`, `.githooks/`, `.github/`. (`paseo-sidecar/` is paused/experimental—ignore unless explicitly targeted.)

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
   - **Script & Git Standards** ([docs/project/shards/06-script-and-git-standards.md](docs/project/shards/06-script-and-git-standards.md)):
     - **Line Budget**: `<= 500` normal; `500-800` requires one-line justification in header; `> 800` split into runner + modules (`./lib/`).
     - **Complexity**: Function length `<= 50` lines; cyclomatic complexity `<= 10`.
     - **Header Contract**: 3-4 lines declaring Purpose, Context, Usage, Prerequisites.
     - **Zero TTY Blocking**: Inputs via flags, env, or stdin only; no interactive prompts (`read -p`, `input()`).
     - **Exit Codes**: `0` OK, `1` error, `2` guardrail/hook violation (`TERM_BLOCK`), `124` timeout.
   - **Agent-First Docs Standard** ([docs/project/shards/05-agent-first-docs-standard.md](docs/project/shards/05-agent-first-docs-standard.md)):
     - **Language Discipline**: Internal plane (docs, specs, skills, memories, manifests, code, commits) in dense `en-US` only; user plane replies in natural `zh-CN`; keep quotes, proper nouns, paths, and identifiers verbatim.
     - **Skills & Specs Are for Machines**: Written for LLMs/Agents, not humans. State the rule, then a 1-line reason; omit pleasantries and storytelling.
     - **Zero Demo Code**: Never include sample or demonstration code unless defining strict output templates.
     - **Determinism & Imperatives**: Enforce via schemas, numbers, and validators. Plain imperatives by default; reserve `MUST`/`NEVER` strictly for hard safety and system redlines.
     - **No Machine-Specific Paths (D7)**: Never hardcode machine-specific user paths; cite files and symbols, never line numbers (D4).
     - **Index & Shards Topology**: Micro-kernel `INDEX.md` (`<= 50-80` lines) routes on-demand `shards/*.md`; multi-step workflows track `.t3/TASK_MANIFEST.md` on disk.

---

## 3. Paseo Bots Roster & Domain Boundaries

Authoritative SSOT: [paseo-bots-plugin-settings/bots.json](paseo-bots-plugin-settings/bots.json). All bots execute with CWD `.` via Antigravity (`antigravity` built-in provider) native tools and Paseo runtime.

| Bot ID | Display Name | Provider / Model | CWD | Domain & Capabilities | Allowed Write Scope |
|---|---|---|---|---|---|
| `bot-chief` | **全局助理** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Global L1 personal assistant, Companion intent distillation, `paseo-long-session` auto-compact, cross-team routing (`ask_question` only) | None (Pure Global Router) |
| `bot-moadmin` | **moAdmin** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Taskforce director; subagent orchestration (`invoke_subagent`, `send_message`, `manage_subagents`), `.t3/TASK_MANIFEST.md` | None (Pure Orchestrator; delegates all file writes to specialist bots) |
| `bot-mocode` | **moCode** | `antigravity` / `gemini-4-hydrogen` | `.` | Fullstack developer & code architect; Antigravity native tools (`read_file`, `write_file`, `edit_file`, `run_command`) | `paseo-bots/`, `paseo-agy-acp/`, `scripts/`, `tools/`, `extensions/` |
| `bot-modoc` | **moDoc** | `antigravity` / `gemini-4-hydrogen` | `.` | Architecture scribe & documentation steward; Antigravity native tools | `docs/`, `*.md` |
| `bot-moci` | **MoCI** | `antigravity` / `gemini-4-hydrogen` | `.` | CI & QA gatekeeper; test execution, regression verification, 3-tier verdicts (`PASS`/`WARN`/`FAIL`) | `.github/`, `paseo-bots/`, `paseo-agy-acp/` (tests/reports only) |
| `bot-mogit` | **MoGit** | `antigravity` / `gemini-4-hydrogen` | `.` | SCM & git hygiene specialist; commit squashing, hooks, branch lifecycle | `.git/`, `.githooks/`, `scripts/`, `CHANGELOG.md` |
| `bot-modeep` | **MoDeep** | `antigravity` / `gemini-4-hydrogen` | `.` | Research scout & codebase reconnaissance (`read_file`, `search_web`) | `docs/research/` (read-only on code) |
| `bot-mo` | **Mo** | `antigravity` / `gemini-4-hydrogen` | `.` | Meta-toolsmith; agent scaffolding & skill creation | `paseo-bots-plugin-settings/`, `~/.gemini/config/agents/`, `~/.gemini/config/skills/` |
| `bot-rea` | **REA** | `antigravity` / `gemini-4-hydrogen` | `.` | Reverse engineering & security audit (`run_command`, `read_file`, CLI-first) | `docs/research/` (disallowed: `paseo-bots/`, `paseo-agy-acp/`, `.env`) |
| `bot-x` | **X 订阅官** | `antigravity` / `gemini-3.8-flash` | `.` | X (Twitter) intelligence & daily digest (`read-twitter` skill, `ego-browser`) | `./workspace/` (bot-scoped outputs) |
| `bot-xhs` | **小红书订阅官** | `antigravity` / `gemini-4-hydrogen` | `.` | Xiaohongshu feed & trend digest (`ego-browser`) | `./workspace/` (bot-scoped outputs) |
| `bot-github` | **GitHub** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | GitHub PR, Issues & notifications monitor (`gh` CLI read-only queries) | `./workspace/` (bot-scoped outputs) |
| `bot-cleaner` | **会话提取官** | `antigravity` / `gemini-3.8-flash` | `.` | Multi-harness session telemetry & friction distiller | `./workspace/` (bot-scoped outputs) |
| `bot-analyst` | **工作流架构师** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Execution ROI, anti-bloat diagnosis & skill/rule optimizer | `docs/`, `AGENTS.md`, `~/.gemini/config/skills/` |
| `bot-prism` | **Prism** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`) | `.` | Prism antidetect browser & fingerprint automation, CDP session control, structured page extraction | `./workspace/` (bot-scoped outputs) |

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

1. **Master Router & Catalogue**: Agent read-path starts at [docs/INDEX.md](docs/INDEX.md) (micro-kernel router); full status catalogue lives in [docs/README.md](docs/README.md).
2. **Two-Pillar Topology**:
   - **Project Docs** ([docs/project/INDEX.md](docs/project/INDEX.md)): Repository overview, 10 Agent engineering principles, 15-Bot & 6-Team matrix, delivery/verification gates, and authoring/script standards.
   - **Design Docs** ([docs/design/INDEX.md](docs/design/INDEX.md)): Active production specs for [paseo-agy-acp](docs/design/paseo-agy-acp/INDEX.md), [paseo-bots](docs/design/paseo-bots/INDEX.md), and [paseo-feed & paseo-long-session](docs/design/paseo-feed/INDEX.md), plus runtime-agnostic [Agent patterns](docs/design/patterns/INDEX.md).
3. **Same-Commit Write-Back**: Any change that alters an architectural or configuration fact updates its owning shard in the same commit ([docs/project/shards/05-agent-first-docs-standard.md](docs/project/shards/05-agent-first-docs-standard.md)).
