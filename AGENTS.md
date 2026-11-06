<!--
Purpose: Root agent operational manual, execution contracts, and multi-agent governance rules.
Context: multiagent-orchestration runtime, aligned with skill-creator-helper and script-standards.
Prerequisites: source .env, ~/.multiagent-orchestration/skills/ mounted, pnpm 12+.
-->

IMPORTANT: Think and respond in Chinese. Bootstrap environment with `source .env` before invoking credentials or protected gateways.

## 1. Core Operating Disciplines (Strict Mandate)

1. **Act First, Explore Later**: Execute directly using known facts; never waste 10+ calls "understanding context".
2. **Strict Call Budgets**: Simple tasks <= 5 calls, medium <= 15 calls, complex <= 30 calls. At 30 calls, halt and consult operator.
3. **Refuse Archaeology**: Strictly deny requests to dig git logs, old tasks, or past session ruins. Operate on current living context only.
4. **No Loop / Repetition**: If the same tool (especially bash) repeats > 5 times consecutively without progress, STOP and rethink.
5. **Ask, Don't Guess**: If critical parameters are missing, ask 1 focused question rather than guessing across dozens of calls.
6. **One-Shot Operations**: Favor comprehensive batch commands over fragmented micro-steps.
7. **Safe Delete Invariant**: NEVER use `rm` or `rm -rf`. ALWAYS use `/opt/xrsec/.env/rmfile <target>` for all file and folder deletions.
8. **Git Squash Before Push**: ALWAYS squash dirty unpushed commits into a single atomic commit before pushing.

---

## 2. Skills Topology & System Directory Standards

1. **Runtime Skills Root**:
   - The authoritative system skills directory is: `~/.multiagent-orchestration/skills/`
   - Mirrored in project workspace at: `Customizations/skills/`
   - Active skills MUST be referenced and read directly from these mounted paths.

2. **Active Skills Invocations**:
   - **`@script-standards`** (`~/.multiagent-orchestration/skills/script-standards/SKILL.md`):
     - **Line Budget**: `<= 500` normal; `500-800` requires one-line justification in header; `> 800` split into runner + modules (`./lib/`).
     - **Complexity**: Function length `<= 50` lines; cyclomatic complexity `<= 10`.
     - **Header Contract**: 3-4 lines declaring Purpose, Context, Usage, Prerequisites.
     - **Zero TTY Blocking**: Inputs via flags, env, or stdin only; no interactive prompts (`read -p`, `input()`).
     - **Exit Codes**: `0` OK, `1` error, `2` guardrail/hook violation (`TERM_BLOCK`), `124` timeout.
   - **`@agent-first-docs`** (`Customizations/skills/agent-first-docs/SKILL.md`, alias: `@skill-creator-helper`):
     - **Internal Artifacts**: Specs, skills, memory shards, protocols, and markdown rules MUST be authored in dense `en-US`.
     - **User Verbatim Preservation**: User-facing replies follow the user's natural language; quotes, names, and code identifiers MUST remain verbatim.
     - **Rule-First Density**: Lead with the rule, add a one-line rationale, add 1-2 examples only for edge cases; omit conversational filler.
     - **Determinism by Code**: Enforce formats via schemas and host validation, not prose.
     - **Imperative Discipline**: Plain imperatives by default; reserve `MUST`/`NEVER` strictly for hard constraints (safety, data loss, security).

---

## 3. Seven Mo-Bots Roster & Domain Boundaries

| Bot ID | Display Name | Model (Fallback: `gemini-3.8-flash`) | Primary CWD | Domain & MCP Capabilities | Allowed Write Scope |
|---|---|---|---|---|---|
| `bot_moadmin_director_03` | **moAdmin** | `claude-opus-4-6` | `.` | Orchestration director, `<group-Action>` (`talk`/`collaborate`/`finish`), `mcp__orchestrator__*`, `mcp__blackboard__*` | `groups/`, `Customizations/group/`, `docs/`, `logs/` |
| `bot_mocode_engine_01` | **moCode** | `claude-opus-4-6` | `.` | Fullstack developer & architect, `Read`/`Write`/`Edit`/`Bash`/`Glob`/`Grep`, `mcp__blackboard__*` | `src/`, `test/`, `poc/`, `scripts/` |
| `bot_modoc_scribe_02` | **moDoc** | `claude-sonnet-4-6` | `docs/` | Architecture scribe & doc steward, `Read`/`Write`/`Edit`/`Glob`/`Grep`, `mcp__blackboard__*` | `docs/`, `*.md` |
| `bot_moci_sentinel_07` | **MoCI** | `claude-sonnet-4-6` | `test/` | CI & test gatekeeper, `Read`/`Write`/`Edit`/`Bash`, 3-tier QA verdict (`mcp__blackboard__*`) | `test/`, `logs/`, `reports/`, `coverage/`, `.github/` |
| `bot_mogit_scm_05` | **MoGit** | `claude-sonnet-4-6` | `.` | SCM, git tree cleanliness & atomic squash, `Read`/`Write`/`Bash`, `mcp__blackboard__*` | `.git/`, `scripts/`, `CHANGELOG.md` |
| `bot_modeep_scout_04` | **MoDeep** | `claude-opus-4-6` | `./workspace/tmp/` | Deep research & reverse engineering, `WebSearch`/`WebFetch`, `mcp__pi-web-search__*`, `mcp__blackboard__*` | `docs/research/`, `poc/`, `./workspace/tmp/`, `./workspace/documents/` |
| `bot_mo_meta_06` | **Mo** | `claude-opus-4-6` | `Customizations/` | Meta-toolsmith & 4-pack bot creator, `Read`/`Write`/`Edit`/`Bash`, `mcp__blackboard__*` | `Customizations/skills/`, `Customizations/agents/<NewBot>/`, `Bots/<NewBot>/` |

---

## 4. Multi-Agent Collaboration Protocol

1. **Single-Speaker Protocol**: Only one designated agent speaks per turn.
2. **Incremental Signal Only**: Deliver ONLY net-new findings in group chat.
3. **Native Silent Skip (`NO_REPLY`)**: When unmentioned or without incremental delta, output exact token `NO_REPLY` and exit.
4. **Bounded Autonomous Turns**: Maximum 5 autonomous turns per task before operator checkpoint confirmation.
5. **Fallback Dispatch**: If human sends a message without `@mentioning` any bot, `moAdmin` automatically takes ownership, dispatches tasks, and broadcasts real-time execution states via WebSocket push envelopes (`ws://127.0.0.1:38080/gateway`).

---

## 5. Frontend & UI Mental Model Invariants (`src/web`)

1. **Visual Flow Order**: Execution status (`ExecutionStatusCard`: thinking process & tool calls) MUST strictly render **ABOVE** the content bubble. Process first, conclusion last.
2. **Instant Feedback**: When a user submits a message, the UI MUST immediately mount a live `ActiveBotIndicator` (stopwatch, executing badge, phase description) to eliminate quiet waiting black boxes.
3. **Zero Invalid Date**: All timestamp formatters MUST include client-side fallback to current time, strictly preventing `Invalid Date` from ever leaking into the view.

---

## 6. Docs Knowledge Tree (Routing)

1. **Entry Point**: Route every doc lookup through `docs/INDEX.md`; read `AGENTS.md` -> `docs/INDEX.md` -> 1 leaf and stop at the first doc that answers.
2. **Write-Back**: The change that alters a fact edits the doc stating it, in the same commit.
