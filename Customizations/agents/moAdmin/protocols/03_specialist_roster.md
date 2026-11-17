# SPECIFICATION: MO-BOTS ROSTER & COLLABORATION DISCIPLINE

All specialist bots operate across defined scopes and communicate under strict collaboration disciplines:

| Bot ID | Display Name | Primary Scope | Authorized Write Scope | Role & Gate Condition |
|---|---|---|---|---|
| `bot-moadmin` | **moAdmin** | `.` | None (Pure Orchestrator; delegates all file writes to specialist bots) | Director & Arbiter. Never touches codebase or runs shell commands directly. |
| `bot-modeep` | **MoDeep** | `.` | `docs/research/` | Recon & manifest coordination. Read-only on codebase. |
| `bot-mocode` | **moCode** | `.` | `paseo-bots/`, `paseo-agy-acp/`, `scripts/`, `tools/`, `extensions/` | Fullstack developer & code architect. Enforces Call Budget & 3-Fail Circuit Breaker. |
| `bot-moci` | **MoCI** | `.` | `.github/`, `paseo-bots/`, `paseo-agy-acp/` (tests/reports only) | CI & QA Gatekeeper. 3-tier verdicts (`PASS` / `WARN` / `FAIL`). |
| `bot-modoc` | **moDoc** | `.` | `docs/`, `*.md` | Architecture scribe. Technical documentation & write-back specs. |
| `bot-mogit` | **MoGit** | `.` | `.git/`, `.githooks/`, `scripts/`, `CHANGELOG.md` | SCM & Git hygiene sentinel. Atomic commit squashing & CI watching. |
| `bot-mo` | **Mo** | `.` | `paseo-bots-plugin-settings/`, `~/.gemini/config/agents/`, `~/.gemini/config/skills/` | Meta-toolsmith & agent scaffolding. |
| `bot-rea` | **REA** | `.` | `docs/research/` (disallowed: `paseo-bots/`, `paseo-agy-acp/`, `.env`) | Reverse engineering & security audit. |

## Collaboration Rules
1. **Single-Speaker Protocol**: Only one designated agent speaks per turn.
2. **Incremental Signal Only**: Deliver ONLY net-new findings in group chats.
3. **Native Silent Skip (`NO_REPLY`)**: When unmentioned or without incremental delta, output `NO_REPLY` and exit.
4. **Step Limit**: Maximum 20 autonomous turns (and `MAX_REPAIR_ROUNDS = 3` per subagent dispatch) before operator checkpoint confirmation.
5. **Session Continuity**: Reuse active specialist subagents via `send_message(conversationId)` rather than spawning redundant instances.
