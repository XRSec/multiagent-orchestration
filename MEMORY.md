---
doc_id: REPO-MEMORY-ROOT
status: CURRENT
version: 3.0.0
last_verified: 2026-11-18
language: en-US
---

# Multi-Agent Orchestration — Architectural Memory (Micro-Kernel)

Core invariants and runtime topology for the **Paseo + Antigravity ACP** multi-agent platform. Load domain shards via [docs/INDEX.md](docs/INDEX.md) when task scope requires deeper contracts.

## 1. Active Production Topology
- **Dual Production Cores**:
  - `paseo-bots/` (`@oliexe/paseo-bots`): Multi-agent orchestration plugin—Managed Seats, Session Blackboard, Six-Block Role-Aware Prompts, 3-Tier Router & Workflow DAG Engine, Task Pyramid, Same-Provider Fallback, Routines, and Session Analytics.
  - `paseo-agy-acp/` (`@fdkevin/paseo-agy-acp`): Active Antigravity (`agy acp`) protocol bridge—fuses ACP JSON-RPC stdio with local `.system_generated/` Brain observation, Reactive Wakeup guards, two-clock watchdogs, Shadow-Git checkpoints, and native session forking.
- **Configuration & Data SSOT** (symlinked to `$PASEO_HOME` via `scripts/check-paseo-bots-link.mjs`):
  - `paseo-bots-plugin-settings/`: `bots.json` (v4 envelope, **14 active bots**, **6 teams**, `wf-moadmin-closed-loop` 7-stage DAG), externalized `souls/<botId>.md` (`<= 24 KB`), and `mcp-servers/<id>.json`.
  - `paseo-bots-plugin-data/`: Shared `library/skills/` (`reviewedSha` gated) and managed runtime seats (`shared/Bots/<botId>/`, `shared/Teams/<team>/`).
- **Paused Exploration**: `paseo-sidecar/` (cross-runtime Byte-0 Meta-MCP & hook daemon) is **PAUSED / EXPERIMENTAL**. Ignore unless explicitly requested by the operator.

## 2. Hard System Invariants
- **Zero Target-Repo & Host Pollution**: Agent `cwd` MUST stay inside `$PASEO_HOME/plugin-data/paseo-bots/shared/` managed seats. External repositories mount strictly via `targetProjectDirs` (`_meta.antigravity.workspaceRoots` / `additionalDirectories`). Writing to `~/.claude*`, `~/.gemini/settings.json`, or `<projectRoot>/.mcp.json` is blocked by `assertInsideManagedDataDir` and `assertNotGlobalUserConfig`.
- **Host-Owned Determinism & Tool-Mount Isolation**: DAG progression, fan-out limits, lease locks (`leases.ts`), and task settlement (`settleTask`) are enforced by host TypeScript code, never LLM prose. Pure orchestrator `bot-moadmin` is physically stripped of file-write and shell tools in `bots.json` (`baseTools`).
- **Cache-Safe Prompt Assembly & Cold File Handoffs**: Freeze root tool schemas for the session lifetime (Byte-0 prefix immutability). Assemble system prompts dynamically per `SessionRoleKind` (`dm | team-lead | team-direct-specialist | dispatched-worker`). Persist full stage outputs to `handoffs/<stageId>-<botId>.md` and cap inline `<task_brief>` upstream excerpts at `2,000` chars.
- **Fail-Closed Turn Lifecycle & Steer Reality**: `paseo-agy-acp` keeps turns open across async subagents and Reactive Wakeups (`settleBrainTurn`), enforces 120s turn-silence / 600s tool-execution clocks, sweeps orphan `turn-journal` entries, and inspects SQLite `steps` (`step_type = 17`). Because `agy acp` is single-turn without `prompt.steer`, Paseo UI `steer` triggers `Interrupt & Replace` (`session/cancel`); use client `queue` for non-destructive follow-ups.
- **Safe Delete & Test Hygiene**: NEVER invoke `rm` or `rm -rf`; use `SAFE_DELETE_BIN` or Node `fs.rmSync`. Always run `vitest run` (never bare watch-mode `vitest`).

## 3. Fast Router
- Root operational rules & 14-bot roster -> [AGENTS.md](AGENTS.md)
- Master documentation router -> [docs/INDEX.md](docs/INDEX.md)
- Project governance, philosophy & standards -> [docs/project/INDEX.md](docs/project/INDEX.md)
- `paseo-agy-acp` bridge specifications -> [docs/design/paseo-agy-acp/INDEX.md](docs/design/paseo-agy-acp/INDEX.md)
- `paseo-bots` plugin specifications -> [docs/design/paseo-bots/INDEX.md](docs/design/paseo-bots/INDEX.md)
- Cross-runtime Agent patterns -> [docs/design/patterns/INDEX.md](docs/design/patterns/INDEX.md)
