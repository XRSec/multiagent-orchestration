---
doc_id: PROJ-REPO-OVERVIEW
status: CURRENT
version: 1.1.0
last_verified: 2026-11-21
language: en-US
---

# Repository Overview & Physical Topology

Physical module layout, configuration-data separation, `$PASEO_HOME` link invariants, and active-versus-paused subsystem boundaries for `<projectRoot>`. Parent router: [../INDEX.md](../INDEX.md).

## 1. Dual-Core & Micro-Plugin Production Architecture

Treat `paseo-bots/` and `paseo-agy-acp/` as the dual active production cores, paired with decoupled micro-plugins `paseo-feed/` and `paseo-long-session/` communicating strictly via `@getpaseo/plugin` hooks and disk ledgers. Concentrating runtime changes on these four packages prevents architectural drift across experimental adapters.

| Path | Classification | Primary Responsibility & Key Entrypoints | Status |
| :--- | :--- | :--- | :--- |
| `paseo-bots/` | Production Core | Paseo multi-agent orchestration plugin: 15-bot roster (`shared/bot.ts`), Managed Seats (`server/bot-home.ts`), 3-tier task/workflow DAG engine (`server/workflow-runner.ts`, `server/tasks.ts`), L1–L3 Task Cards (`server/task-cards.ts`), Continuous Feed bridge (`server/feed-bridge.ts`), Routines (`server/routine-service.ts`), Analytics (`server/analytics/`), and React Native surfaces | `CURRENT` |
| `paseo-agy-acp/` | Production Core | Primary execution harness adapter (`index.server.ts`, `server/provider.ts`, `server/session.ts`): pairs `agy acp` stdio JSON-RPC (`server/transport.ts`) with `.system_generated` Brain observation (`server/brain-observer.ts`), `PASEO_AGY_BOT_PROMPT_FILE` injection, dual-clock watchdogs, turn journals (`server/turn-journal.ts`), and SQLite error forensics (`server/error-inspection.ts`) | `CURRENT` |
| `paseo-feed/` | Micro-Plugin | Standalone Continuous Feed plugin (`index.server.ts`, `index.client.tsx`, `server/store.ts`, `server/hydrator.ts`, `server/sync.ts`): unified `index.jsonl` pointer ledger, idempotent legacy channel migration, `"workflow"` source distillation, cold-start chat creation (`reason: "created"`), and `openAgent` deep-links | `CURRENT` |
| `paseo-long-session/` | Micro-Plugin | Standalone compaction & memory-sync micro-plugin (`index.server.ts`, `server/compaction.ts`, `shared/protocol.ts`): provider-agnostic 250K proactive `/compact` steering and SHA-256 `MEMORY.md` sync handshake (`LONG_SESSION_SYNC_METADATA`) | `CURRENT` |
| `paseo-bots-plugin-settings/` | Config SSOT | Version-controlled plugin configuration root: `bots.json` (schema v4), decoupled bot personas (`souls/*.md`), and external MCP server specs (`mcp-servers/*.json`) | `CURRENT` |
| `paseo-bots-plugin-data/` | Data SSOT | Version-controlled shareable workspace assets: curated library skills (`library/skills/`), bot homes (`shared/Bots/`), team homes (`shared/Teams/`), and shared presets (`shared/assets/`) | `CURRENT` |
| `docs/` | Knowledge Tree | Progressive-disclosure agent documentation (`docs/INDEX.md`, `project/`, `design/`, `research/`, `references/`) | `CURRENT` |
| `scripts/` & `.githooks/` | Repo Governance | Non-interactive maintenance and dispatch utilities (`scripts/check-paseo-bots-link.mjs`, `scripts/paseo-chief-dispatch.mjs`) and Git lifecycle hooks (`.githooks/post-merge`, `.githooks/post-rewrite`, `.githooks/pre-push`) | `CURRENT` |
| `tools/` | Auxiliary CLI | Standalone offline diagnostics and wrappers (`tools/agy-session-analyzer/`, `tools/agy-wrapper/`, `tools/gemini-exporter/`) decoupled from live plugin hot paths | `CURRENT` |
| `claude-code-mod/` | Offline Research | Prompt extraction, catalog generation, and upstream harness analysis (`claude-code-mod/build_prompt_tree.py`); never imported by runtime servers | `REFERENCE` |
| `paseo-sidecar/` | Paused Prototype | Standalone SidecarMCP cross-plugin control plane prototype; suspended due to multi-plugin lifecycle complexity | `EXPERIMENTAL` |

## 2. Configuration & Data Separation SSOT

Decouple declarative bot metadata from heavy markdown prompts, MCP schemas, and runtime session state. Keeping `bots.json` lean eliminates merge conflicts, preserves `PluginSettingsStore` memory-cache coherence, and version-controls reusable skills without tracking transient session logs.

### 2.1 Declarative Settings Plane (`paseo-bots-plugin-settings/`)
- **`bots.json` (Schema v4)**:
  - Governed by `stripSoulInSettings` and `stripLibraryInSettings` in `paseo-bots/shared/bot.ts`.
  - Stores bot IDs, provider/model bindings, `fallbackModels`, `providerConfigs`, `baseTools` capability allowlists, `skillIds`, `mcpServerIds`, `routines`, and `groups` (including team-scoped `workflows`).
  - Strips inline `soul` bodies and inline `library` objects upon save so `bots.json` retains lightweight ID references only.
- **`souls/<bot-id>.md`**:
  - Loaded on demand by `paseo-bots/server/souls.ts` (`bot-chief.md` and `bot-moadmin.md` through `bot-xhs.md`, 15 files total).
- **`mcp-servers/<mcp-id>.json`**:
  - Loaded by `paseo-bots/server/mcp-servers.ts` using `LibraryMcpServerSchema` (`mcp-mwjoz4yx3679.json` for `REA`, `mcp-mwjzbk2nd0jy.json` for `Prism`).

### 2.2 Shareable Data vs. Ephemeral Runtime State (`paseo-bots-plugin-data/` vs. `$PASEO_HOME`)
- **`paseo-bots-plugin-data/library/skills/<skill-id>/SKILL.md`**:
  - Shared skill catalog gated by SHA-256 `reviewedSha` (`skillNeedsReview` in `paseo-bots/shared/bot.ts`); modified skills require re-approval before injection into bot prompts.
- **`paseo-bots-plugin-data/shared/Bots/<bot-id>/`**:
  - Resolved via `botDataPath` (`paseo-bots/server/bot-home.ts`); holds bot-scoped `MEMORY.md`, private skills, and direct session boards (`sessions/<sessionId>/` via `directSessionBoardPath`).
- **`paseo-bots-plugin-data/shared/Teams/<TeamFolder>/`**:
  - Resolved via `teamHomePath` (`paseo-bots/server/bot-home.ts`); contains team `MEMORY.md`, per-bot Managed Seats (`agents/<bot-id>/` via `teamAgentSeatPath`), and isolated session blackboards (`sessions/<teamSessionId>/` via `teamSessionBoardPath`).
- **Non-Linked Runtime State (`$PASEO_HOME/plugin-data/paseo-bots/`)**:
  - Ephemeral task ledgers (`tasks/*.json` via `paseo-bots/server/tasks.ts`), file leases (`paseo-bots/server/leases.ts`), turn journals, and OAuth/media caches reside strictly inside local `$PASEO_HOME` outside Git version control.

## 3. `$PASEO_HOME` Three-Way Symlink Topology

Link `$PASEO_HOME` (`~/.paseo` when `PASEO_HOME` is unset) to `<projectRoot>` through exactly three directory symlinks (POSIX `ln -s`) or directory junctions (Windows `Junction`). This three-way split keeps configuration and shared knowledge Git-tracked in `<projectRoot>` while isolating high-churn runtime state inside `$PASEO_HOME`.

| Mapping ID (`LINK_MAPPINGS`) | Repository Source (`<projectRoot>/...`) | Runtime Target (`$PASEO_HOME/...`) |
| :--- | :--- | :--- |
| `plugin-settings` | `paseo-bots-plugin-settings` | `$PASEO_HOME/plugin-settings/paseo-bots` |
| `plugin-data-library` | `paseo-bots-plugin-data/library` | `$PASEO_HOME/plugin-data/paseo-bots/library` |
| `plugin-data-shared` | `paseo-bots-plugin-data/shared` | `$PASEO_HOME/plugin-data/paseo-bots/shared` |

### 3.1 Symlink Diagnostics & Verification (`scripts/check-paseo-bots-link.mjs`)
- Execute `node scripts/check-paseo-bots-link.mjs --strict` to validate all three mappings via `fs.lstatSync` and `fs.realpathSync` (`checkSingleLink` and `checkPaseoBotsLinks`).
- Diagnostic result codes emitted by `checkSingleLink`:
  - `OK`: Target exists as a symlink/junction and its resolved realpath matches `<projectRoot>` source.
  - `SOURCE_MISSING` / `PARENT_MISSING`: Repository source folder or `$PASEO_HOME` parent directory does not exist.
  - `TARGET_MISSING`: Symlink has not been created yet (`formatFixCommands` prints exact `ln -s` or `New-Item -ItemType Junction` remediation).
  - `TARGET_NOT_SYMLINK`: Paseo created a plain directory before linking; inspect and migrate contents before replacing with a symlink.
  - `TARGET_BROKEN_SYMLINK` / `TARGET_WRONG_TARGET`: Dangling link or link pointing to a stale clone path.

### 3.2 Paseo Plugin Host Axioms
1. **Manual Dependency Resolution in `directory` Mode**: Paseo does not auto-install `node_modules` for `directory`-mode plugins; run package installation and TypeScript builds explicitly inside `paseo-bots/` and `paseo-agy-acp/`.
2. **`PluginSettingsStore` Lazy Persistence**: Paseo caches `bots.json` in memory and flushes lazily; avoid concurrent raw disk overwrites while the Paseo daemon is mutating settings, and reload the plugin/daemon after out-of-band Git pulls.

## 4. Auxiliary Modules & Paused `paseo-sidecar/` Boundary

Enforce strict scope quarantine around non-core directories so agents never waste call budgets or introduce dead dependencies:

1. **`paseo-sidecar/` (`PAUSED / EXPERIMENTAL`)**:
   - `paseo-sidecar/` explored an external SidecarMCP bridge across heterogeneous third-party CLI/IDE harnesses.
   - Divergent external plugin lifecycles, brittle IPC state synchronization, and high tuning overhead led to pausing `paseo-sidecar/` in favor of the native `paseo-bots/` + `paseo-agy-acp/` dual-core stack.
   - **Hard Quarantine**: Agents MUST ignore `paseo-sidecar/` during searches, refactors, test runs, and architecture audits unless the user prompt explicitly requests changes inside `paseo-sidecar/`. NEVER add runtime imports from `paseo-bots/`, `paseo-agy-acp/`, `paseo-feed/`, or `paseo-long-session/` to `paseo-sidecar/`.
2. **`tools/`, `claude-code-mod/`, and `gemini-to-md/`**:
   - Keep `tools/*` (`agy-session-analyzer`, `agy-wrapper`, `gemini-exporter`) self-contained as operator CLI tools.
   - Keep `claude-code-mod/` and `gemini-to-md/` isolated as offline research and conversion workspaces without coupling production plugin bundles to them.

---

## 5. Runtime Path Formulas & Topology Verification

`paseo-bots/server/bot-home.ts` resolves every managed workspace path deterministically relative to `pluginDataPath()` (`$PASEO_HOME/plugin-data/paseo-bots`):

| Resolver Symbol (`server/bot-home.ts`) | Resolved Filesystem Path Formula | Purpose |
| :--- | :--- | :--- |
| `botsHomePath()` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Bots` | Root directory for all individual bot homes |
| `botDataPath(botId)` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Bots/<botId>` | Bot-scoped `MEMORY.md`, private skills, and `./workspace/` |
| `directSessionBoardPath(botId, sessionId)` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Bots/<botId>/sessions/<sessionId>` | Session Blackboard for 1:1 direct bot chats |
| `teamsHomePath()` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Teams` | Root directory for all team workspaces |
| `teamHomePath(groupId, groupName)` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Teams/<SanitizedNameOrGroupId>` | Team-shared `MEMORY.md` and team workspace root |
| `teamAgentSeatPath(groupId, botId, groupName)` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Teams/<Team>/agents/<botId>` | Isolated Managed Seat (`cwd`) for a bot operating inside a team |
| `teamSessionBoardPath(groupId, teamSessionId, groupName)` | `$PASEO_HOME/plugin-data/paseo-bots/shared/Teams/<Team>/sessions/<teamSessionId>` | Shared Session Blackboard (`TASK_MANIFEST.md`, `handoffFilePath` artifacts) |

### Read-Only Topology Audit (`<projectRoot>`)

```bash
# Verify production entrypoints, micro-plugins, and config/data SSOT roots exist
ls -d paseo-bots paseo-agy-acp paseo-feed paseo-long-session paseo-bots-plugin-settings paseo-bots-plugin-data

# Confirm zero forbidden runtime imports of paused paseo-sidecar inside active packages
grep -rn 'paseo-sidecar' paseo-bots paseo-agy-acp paseo-feed paseo-long-session || echo "QUARANTINE_OK"

# Verify $PASEO_HOME three-way symlink mappings
node scripts/check-paseo-bots-link.mjs
```
