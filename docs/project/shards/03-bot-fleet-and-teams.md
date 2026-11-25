---
doc_id: PROJ-BOT-FLEET-TEAMS
status: CURRENT
version: 1.1.0
last_verified: 2026-11-21
language: en-US
---

# 15-Bot Fleet Matrix, Teams & Closed-Loop Workflow

Authoritative runtime specification for the 15 production bots (1 Global L1 Assistant + 14 specialist/engineering bots), cross-provider capability mounts, 6 active teams, and the 7-stage `wf-moadmin-closed-loop` DAG defined in [../../../paseo-bots-plugin-settings/bots.json](../../../paseo-bots-plugin-settings/bots.json) and `paseo-bots-plugin-settings/souls/*.md`. Parent router: [../INDEX.md](../INDEX.md).

## 1. Roster & Capability Governance Invariants

1. **Mandatory `bot-` ID Prefix**: Every bot definition and subagent dispatch MUST use its canonical `bot-` prefixed identifier (`bot-moadmin`, `bot-mocode`, `bot-moci`, etc.); unprefixed legacy names (`mocode`, `modeep`) are forbidden (`AGENTS.md` §4.6).
2. **Decoupled Config & Persona SSOT**: Runtime provider, model, `fallbackModels`, `baseTools`, `mcpServerIds`, `skillIds`, `routines`, and `groups` resolve from `paseo-bots-plugin-settings/bots.json` (`version: 4`), while role system rules load from `paseo-bots-plugin-settings/souls/<bot-id>.md`.
3. **Fleet Default Profile**: Unless overridden on a bot entry, `bots.json` `values.defaults` binds `provider: "antigravity"`, `model: "gemini-4-hydrogen"`, `modeId: "full-access"`, `fallbackModels: ["gemini-3.8-flash"]`, and `contactBots: "allow"`.
4. **Cross-Provider Tool Resolution**: `resolveToolsForProvider` (`paseo-bots/shared/bot-tools.ts`) translates `baseTools` across `antigravity` / `agy` (`AGY_BASE_TOOLS`), `claude` (`CLAUDE_BASE_TOOLS`), and `codex` (`CODEX_BASE_TOOLS`) via `CAPABILITY_MAP` so role restrictions survive provider switches cleanly.

---

## 2. 15-Bot Production Fleet Matrix

### 2.0 Global L1 Personal Assistant (1 Bot)

| Bot ID | Display Name | Provider / Model (+ Fallback) | Tool, Lifecycle & Memory Bindings | Authorized Write Scope |
| :--- | :--- | :--- | :--- | :--- |
| `bot-chief` | **全局助理** | `antigravity` / `gemini-4-hydrogen` (`full-access`, fallback: `gemini-3.8-flash` `[high]`) | `isGlobalAssistant: true`, `pinned: true`, `baseTools: ["ask_question"]`, `contactBots: "allow"`; tagged with `GLOBAL_ASSISTANT_LABEL` and `LONG_SESSION_ENABLED_LABEL`; paired with `CompanionSessionManager` (`globalAssistantOnly: true`) and cross-team `list_teams` / `ask_bot` routing | **None** (Pure Global L1 Router; writes no repo files) |

### 2.1 Group A: Core Engineering & Orchestration (7 Bots)

| Bot ID | Display Name | Provider / Model (+ Fallback) | Tool, MCP & Skill Mounts | Authorized Write Scope |
| :--- | :--- | :--- | :--- | :--- |
| `bot-moadmin` | **moAdmin** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash` `[high]`); alt `claude` / `claude-fable-5` (`[ultracode]`, fallback: `claude-fable-5-1` `[low]`) | Explicit `baseTools`: `invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `manage_task`, `schedule`, `ask_question` (`claude`: `Task`, `TodoWrite`, `Skill`). Physically stripped of `read_file`, `edit_file`, `write_file`, `run_command` | **None** on repository code (Pure Orchestrator; manages blackboard `TASK_MANIFEST.md` & `MEMORY.md`) |
| `bot-mocode` | **moCode** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | Full `AGY_BASE_TOOLS` (`read_file`, `edit_file`, `write_file`, `run_command`, `manage_task`, `search_web`, etc.); `mcp: []`; `skills: []` | `paseo-bots/`, `paseo-agy-acp/`, `scripts/`, `tools/`, `extensions/` |
| `bot-modoc` | **moDoc** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | `AGY_BASE_TOOLS` constrained by `souls/bot-modoc.md` to documentation inspection and authoring without business-code execution | `docs/`, repository `*.md` |
| `bot-moci` | **MoCI** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | `AGY_BASE_TOOLS` (`run_command`, `read_file` for zero-trust test, typecheck, and lint execution); `mcp: []`; `skills: []` | `.github/`, test suites & QA reports in `paseo-bots/` and `paseo-agy-acp/` (never implementation files under review) |
| `bot-mogit` | **MoGit** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | `AGY_BASE_TOOLS` (`run_command` for worktree hygiene, commit squashing, branch lifecycle, and hook verification) | `.git/`, `.githooks/`, `scripts/`, `CHANGELOG.md` |
| `bot-modeep` | **MoDeep** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | Constrained by `souls/bot-modeep.md` to read-only codebase inspection and external reconnaissance (`read_file`, `search_web`); shares `x-research` skill (`paseo-bots-plugin-data/library/skills/x-research/`) when enabled | `docs/research/` (strictly read-only across all code directories) |
| `bot-mo` | **Mo** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | Meta-toolsmithing, agent definition scaffolding, and skill authoring tools | `paseo-bots-plugin-settings/`, `~/.gemini/config/agents/`, `~/.gemini/config/skills/` |

### 2.2 Group B: Domain Specialists (2 Bots)

| Bot ID | Display Name | Provider / Model (+ Fallback) | Tool, MCP & Skill Mounts | Authorized Write Scope |
| :--- | :--- | :--- | :--- | :--- |
| `bot-rea` | **REA** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | CLI-first binary analysis & vulnerability auditing (`run_command`, `read_file`) + MCP server `mcp-mwjoz4yx3679` (`REA`); `skills: []` | `docs/research/` (MUST NEVER write to `paseo-bots/`, `paseo-agy-acp/`, or `.env`) |
| `bot-prism` | **Prism** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash` `[high]`, `full-access`) | Antidetect browser profile, wallet popup, HAR, and DOM automation via MCP `mcp-mwjzbk2nd0jy` (`Prism`) + skill `prism` | Bot-scoped `./workspace/` inside Managed Seat |

### 2.3 Group C: Daily Intelligence & Monitoring (3 Bots)

| Bot ID | Display Name | Provider / Model (+ Fallback) | Skills & Scheduled Routines (`server/routine-service.ts`) | Authorized Write Scope |
| :--- | :--- | :--- | :--- | :--- |
| `bot-x` | **X 订阅官** | `antigravity` / `gemini-3.8-flash` `[high]` (`full-access`) | Skill `read-twitter` (`read_twitter.mjs` / `ego-browser`). Daily routine `rt-mwgwx6jpe57d` (`推特每日见闻`) at `09:00` (`weekdays: 0..6`) | Bot-scoped `./workspace/` (`twitter_feed.json` & Clustered briefings) |
| `bot-xhs` | **小红书订阅官** | `antigravity` / `gemini-4-hydrogen` (`full-access`) | Xiaohongshu feed, creator, and trend extraction via `ego-browser`; `routines: []` | Bot-scoped `./workspace/` |
| `bot-github` | **GitHub** | `antigravity` / `gemini-4-hydrogen` (fallback: `gemini-3.8-flash`, `full-access`) | Read-only `gh` CLI queries (`gh search prs`, `gh search issues`, `gh api notifications`). Daily routine `rt-github-daily` at `09:30` (`weekdays: 0..6`) | Bot-scoped `./workspace/` |

### 2.4 Group D: Session Telemetry & Workflow Optimization (2 Bots)

| Bot ID | Display Name | Provider / Model | Isolation & Analytics Pipeline Binding (`shared/analytics.ts`) | Authorized Write Scope |
| :--- | :--- | :--- | :--- | :--- |
| `bot-cleaner` | **会话提取官** | `antigravity` / `gemini-3.8-flash` `[medium]` (`modeId: "default"`) | `baseTools: []`, `contactBots: "off"`. Bound to `ANALYTICS_CLEAN_BOT_ID` to distill multi-harness (`agy` / `claude` / `pi`) transcripts into high-signal friction logs | Bot-scoped `./workspace/` & analytics history |
| `bot-analyst` | **工作流架构师** | `antigravity` / `gemini-3.8-flash` `[high]` (`modeId: "default"`) | `baseTools: []`, `contactBots: "off"` in headless pipeline (`ANALYTICS_ANALYZE_BOT_ID`); interactive sessions optimize routing, rules, and skills | `docs/`, `AGENTS.md`, `~/.gemini/config/skills/` (when invoked for rule/skill upgrades) |

---

## 3. 6 Active Teams (`bots.json` `values.groups`)

Teams allocate a shared workspace directory under `$PASEO_HOME/plugin-data/paseo-bots/shared/Teams/<TeamFolder>/` (`teamHomePath` in `paseo-bots/server/bot-home.ts`), govern role prompts (`paseo-bots/shared/groups.ts`), and scope declarative workflows.

| Team ID | Team Name | `leadId` | `memberIds` | Operational Topology & Rules |
| :--- | :--- | :--- | :--- | :--- |
| `team-mwgv59i8dfdv` | `multiagent-orchestration` | `bot-moadmin` | `bot-moadmin`, `bot-mocode`, `bot-modoc`, `bot-moci`, `bot-mogit`, `bot-modeep`, `bot-mo`, `bot-rea` | Core engineering taskforce mounted on `<projectRoot>`. Enforces `<task_brief>` / `<worker_handoff>` contract and hosts `wf-moadmin-closed-loop` |
| `team-mwgwx6jp60rn` | `X` | `bot-x` | `bot-x` | Dedicated X (Twitter) timeline, KOL tracking, and breaking-signal digest room |
| `team-mwgwx6jqk2iy` | `小红书` | `bot-xhs` | `bot-xhs` | Dedicated Xiaohongshu creator feed, keyword search, and trend digest room |
| `team-github` | `GitHub` | `bot-github` | `bot-github` | Dedicated GitHub PR review, assigned issue, and notification triage room |
| `team-intel-center` | `情报中心` | `null` | `bot-x`, `bot-xhs`, `bot-github` | Peer intelligence hub (`leadId: null`); specialists emit incremental platform-specific signals and cross-platform trend correlations |
| `team-mwibfqwrpcop` | `数据分析` | `null` | `bot-cleaner`, `bot-analyst` | Two-stage session telemetry workspace coupling transcript extraction (`bot-cleaner`) with workflow/skill optimization (`bot-analyst`) |

---

## 4. Flagship Workflow: `wf-moadmin-closed-loop`

Configured under `multiagent-orchestration` (`team-mwgv59i8dfdv`) and driven by `validateWorkflowDAG` (`paseo-bots/shared/workflows.ts`) and `runWorkflowDag` (`paseo-bots/server/workflow-runner.ts`), `wf-moadmin-closed-loop` executes a 7-stage closed-loop engineering DAG (`maxRetries: 2` per stage).

### 4.1 7-Stage Topological & Engine Specification

| Layer / Stage | Stage ID | `botId` | Declared `engine` -> Resolved | `dependsOn` | Mandatory Output Contract |
| :--- | :--- | :--- | :--- | :--- | :--- |
| L1 / Stage 1 | `moadmin-plan` | `bot-moadmin` | `paseo-bot` -> `paseo-bot` | `[]` | Initializes blackboard `TASK_MANIFEST.md` (and repo `.t3/TASK_MANIFEST.md`) with objective, scope paths, risk watchpoints, and itemized DoD |
| L2 / Stage 2 | `modeep-recon` | `bot-modeep` | `auto` -> `paseo-bot` (`contactBots: "allow"`) | `["moadmin-plan"]` | Samples live schemas/types, maps exact target files and breaking risks (`TOUCHED_FILES: None`) |
| L3 / Stage 3 | `mocode-impl` | `bot-mocode` | `auto` -> `paseo-bot` | `["moadmin-plan", "modeep-recon"]` | Applies minimal surgical code changes strictly inside scope; runs local build/syntax check; lists exact `TOUCHED_FILES` |
| L4 / Stage 4 | `moci-verify` | `bot-moci` | `auto` -> `paseo-bot` | `["moadmin-plan", "mocode-impl"]` | Runs independent test suites, typechecks, and linters; verifies every DoD item with `Exit_Code: 0`; emits `PASS` / `WARN` / `FAIL` |
| L5 / Stage 5 | `moadmin-review` | `bot-moadmin` | `paseo-bot` -> `paseo-bot` | `["moci-verify"]` | Audits Scope Diff, DoD Proof, and Integrity; fails stage with surgical instructions on defect or marks DoD items satisfied |
| L6 / Stage 6 | `modoc-writeback` | `bot-modoc` | `auto` -> `paseo-bot` | `["mocode-impl", "moadmin-review"]` | Writes back `en-US` architectural specs and router links matching verified code changes |
| L7 / Stage 7 | `moadmin-finalize` | `bot-moadmin` | `paseo-bot` -> `paseo-bot` | `["moadmin-review", "modoc-writeback"]` | Updates team/personal `MEMORY.md`, marks `TASK_MANIFEST.md` settled, and emits executive `zh-CN` delivery report |

### 4.2 Cross-Hop `dependsOn` Anti-Distortion Mechanism

Connect downstream verification and documentation stages directly to primary upstream sources via multi-parent `dependsOn` arrays (`buildStageBriefPrompt` in `paseo-bots/shared/workflows.ts`) rather than single-parent daisy chains:

1. **Zero-Trust QA (`moci-verify` <- `["moadmin-plan", "mocode-impl"]`)**:
   - `MoCI` receives the original unmodified DoD checklist and forbidden-path constraints directly from `moadmin-plan` alongside the implementation diff from `mocode-impl`.
   - Even if `moCode` omits a constraint or narrows scope in its `<worker_handoff>` summary, `MoCI` evaluates compliance against `moAdmin`'s primary contract, eliminating telephone-game drift.
2. **Dual-Anchored Implementation (`mocode-impl` <- `["moadmin-plan", "modeep-recon"]`)**:
   - `moCode` receives authoritative acceptance criteria from `moadmin-plan` and concrete symbol/schema findings from `modeep-recon` simultaneously.
3. **Fact-Anchored Write-Back (`modoc-writeback` <- `["mocode-impl", "moadmin-review"]`)**:
   - `moDoc` is gated on `moadmin-review` approval while reading exact `TOUCHED_FILES` and symbol changes directly from `mocode-impl`.

---

## 5. Cross-Provider Capability & Mode Mapping (`paseo-bots/shared/bot-tools.ts`)

When a bot switches providers or defines `providerConfigs` (such as `bot-moadmin` across `antigravity` and `claude`), `resolveToolsForProvider` and `resolveModeIdForProvider` translate canonical capabilities into native harness primitives and silently drop unsupported entries:

| Canonical Capability (`CANONICAL_CAPABILITIES`) | `antigravity` / `agy` / `agy-acp` (`AGY_BASE_TOOLS`) | `claude` (`CLAUDE_BASE_TOOLS`) | `codex` (`CODEX_BASE_TOOLS`) |
| :--- | :--- | :--- | :--- |
| `file_read` | `read_file` | `Read` | `read_file` |
| `file_edit` | `edit_file` | `Edit` | `edit_file` |
| `file_write` | `write_file` | `Write` | `write_file` |
| `file_search` | *(covered by native read/shell)* | `Glob`, `Grep` | *(none)* |
| `shell` | `run_command` | `Bash` | `exec` |
| `web_search` | `search_web` | `WebSearch` | `web_search` |
| `web_fetch` | *(none)* | `WebFetch` | *(none)* |
| `view_image` | *(multimodal content block)* | *(multimodal)* | `view_image` |
| `subagent_call` | `invoke_subagent` | `Task` | *(none -> routes via `paseo-bot`)* |
| `subagent_manage` | `define_subagent`, `manage_subagents`, `send_message` | *(none)* | *(none)* |
| `task_manage` | `manage_task` | `TodoWrite` | *(none)* |
| `skill` | *(native skill lookup)* | `Skill` | *(none)* |
| `schedule` | `schedule` | *(none)* | *(none)* |
| `ask_user` | `ask_question` | *(none)* | *(none)* |

- **Permission Mode Normalization (`PERMISSION_MODE_MAP`)**: Canonical `full_access` maps to `"full-access"` on `agy` and `codex`, and `"bypassPermissions"` on `claude`.
- **Engine Dispatch Guard (`INVOKE_SUBAGENT_TOOL`)**: Route 1 (`native`) retains `invoke_subagent` for harness-internal child subagents, whereas Route 2 (`paseo-bot`) and `codex` route multi-bot delegation through Paseo's persistent bot sessions (`resolveStepEngine` in `paseo-bots/shared/workflows.ts`).

---

## 6. Read-Only Roster & DAG Verification Commands

Run from `<projectRoot>` after any edit to `paseo-bots-plugin-settings/bots.json` or `souls/*.md`:

```bash
# Verify 15 active bots, canonical bot-* prefix, and 1:1 matching soul files
jq -r '.values.bots[].id' paseo-bots-plugin-settings/bots.json | while read -r id; do
  case "$id" in bot-*) ;; *) echo "BAD_PREFIX: $id" ;; esac
  [ -f "paseo-bots-plugin-settings/souls/${id}.md" ] || echo "MISSING_SOUL: $id"
done

# Inspect the 6 active teams and declared workflow stage counts
jq -r '.values.groups[] | "\(.id)\t\(.name)\tlead=\(.leadId)\tmembers=\(.memberIds|length)\tworkflows=\(.workflows|length)"' paseo-bots-plugin-settings/bots.json

# Verify wf-moadmin-closed-loop topological dependsOn edges
jq -r '.values.groups[] | select(.name=="multiagent-orchestration") | .workflows[0].stages[] | "\(.id) (\(.botId)) <- \(.dependsOn | join(","))"' paseo-bots-plugin-settings/bots.json
```
