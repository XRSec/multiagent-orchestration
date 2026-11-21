---
doc_id: PASEO-BOTS-SHARD-01-CONFIG-STORAGE
status: CURRENT
version: 1.1.0
last_verified: 2026-11-21
language: en-US
---

# Shard 01: Configuration Envelope, Decoupled Assets & Zero-Pollution Storage

Parent index: [../INDEX.md](../INDEX.md). Defines the dual-directory persistence topology, `bots.json` v4 outer envelope contract, asset externalization budgets, runtime agent projection guards, and schema-validated mutation discipline for `@oliexe/paseo-bots`.

## 1. Dual-Directory Persistence & Three-Way Symlink Topology

Separate host settings from runtime workspaces across two distinct trees under `$PASEO_HOME` (defaulting to `~/.paseo/`), because Paseo's `PluginSettingsStore` caches settings in memory while bot workspaces undergo high-frequency filesystem I/O.

```text
$PASEO_HOME/
├── plugin-settings/paseo-bots/          <-> <repoRoot>/paseo-bots-plugin-settings
│   ├── bots.json                        (Outer v4 envelope + inner BotSettingsValues; < 75 KB)
│   ├── souls/<botId>.md                 (Decoupled standing instructions; <= 24,000 B each)
│   └── mcp-servers/<id>.json            (Decoupled LibraryMcpServer configs)
└── plugin-data/paseo-bots/              (Resolved by pluginDataPath in paseo-bots/server/bot-home.ts)
    ├── library/                         <-> <repoRoot>/paseo-bots-plugin-data/library
    │   └── skills/<skillId>/SKILL.md    (Shared skill library gated by reviewedSha)
    ├── shared/                          <-> <repoRoot>/paseo-bots-plugin-data/shared
    │   ├── assets/icons/                (Shared SVG/PNG brand icons & portrait assets)
    │   ├── Bots/<botId>/                (Personal DM seat & MEMORY.md; memory/log/ & sessions/ gitignored)
    │   └── Teams/<sanitizedTeam>/       (Team shared MEMORY.md; agents/ & sessions/ gitignored)
    ├── tasks/<safeId>.json              (Host-only TaskRecord files; non-versioned runtime state)
    ├── task-cards/<cardId>.json         (Outbox queue for pending timeline projections)
    └── leases/<sha256>.lock             (Cross-process O_EXCL lock files)
```

Maintain three bidirectional symlink/junction mappings (`LINK_MAPPINGS` in `scripts/check-paseo-bots-link.mjs`) so git commits track canonical bot settings and shareable skills without duplicating state:

| Mapping ID | Repository Source | Host Target (`$PASEO_HOME`) | Platform Link Primitive |
| :--- | :--- | :--- | :--- |
| `plugin-settings` | `paseo-bots-plugin-settings` | `plugin-settings/paseo-bots` | POSIX `ln -s` / Win32 Junction (`mklink /J`) |
| `plugin-data-library` | `paseo-bots-plugin-data/library` | `plugin-data/paseo-bots/library` | POSIX `ln -s` / Win32 Junction (`mklink /J`) |
| `plugin-data-shared` | `paseo-bots-plugin-data/shared` | `plugin-data/paseo-bots/shared` | POSIX `ln -s` / Win32 Junction (`mklink /J`) |

- **Automated Link Verification**: `.githooks/post-merge` and `.githooks/post-rewrite` execute `scripts/check-paseo-bots-link.mjs` (`checkPaseoBotsLinks`, `checkSingleLink`) to catch missing, broken, or misdirected links after pulls and rebases.
- **Legacy Directory Migration**: `migrateRenamedPluginData` (`paseo-bots/server/bot-home.ts`) synchronously moves legacy `$PASEO_HOME/plugin-data/paseo-bot` into `paseo-bots` once at startup and leaves a junction behind so historical sessions keep valid CWDs.

## 2. Outer Envelope vs Inner `botSettings.schema` Contract

Preserve the outer `{ "version": 4, "values": { ... } }` JSON wrapper whenever writing `bots.json` on disk, because Paseo's host settings manager unwraps `version` before validating `values` against `botSettings.schema` and resets unwrapped files on daemon startup.

- **Schema Anchor**: `botSettings` in `paseo-bots/shared/bot.ts` (`defineSettings({ id: "bots", scope: "host", version: 4, schema, migrate })`).
- **Deterministic Schema Migrations**:
  - `migrateV1` (v1 -> v2): Moves flat `instructions` and `avatarSeed` into `soul` and `avatar: { seed }`.
  - `migrateV2` (v2 -> v3): Deduplicates inline per-bot `mcpServers` and `skills` into shared `library`, rewriting bot fields to `mcpServerIds` and `skillIds` while preserving `alwaysAllow` tool grants.
  - `migrateV3` (v3 -> v4): Backfills `mounts: []` across all `bots` and `history` snapshots.

| Inner `values` Key | Zod Schema (`paseo-bots/shared/bot.ts`) | Persistence Purpose & Bounds |
| :--- | :--- | :--- |
| `bots` | `z.array(BotSchema).default([])` | Bot metadata, provider/model, `fallbackModels`, `baseTools`, `mcpServerIds`, `skillIds`, `routines`, `playbooks`, `cwd`, `mounts` |
| `groups` | `z.array(BotGroupSchema).optional()` | Team definitions (`leadId`, `memberIds`, `instructions`, team `cwd`, `mounts`, team `workflows`) |
| `workflows` | `z.array(WorkflowDefinitionSchema).optional()` | Global reusable Route 3 workflow DAG templates (`1..50` stages per workflow) |
| `defaults` | `BotDefaultsSchema.optional()` | Host-wide new-bot defaults (`provider`, `model`, `modeId`, `thinkingOptionId`, `fallbackModels`, `contactBots`) |
| `ui` | `BotListUiSchema.optional()` | Sidebar collapse state, `pinnedChats`, `chatOrder`, `chatSort`, `listWidth`/`panelWidth` (`320`), `language` (`auto \| en \| zh-CN`) |
| `history` | `z.array(HistoryEntrySchema).default([])` | Undo snapshots per bot (`HISTORY_PER_BOT = 20`, coalesced within `HISTORY_COALESCE_MS = 60_000`) |
| `presets` | `z.array(PresetSchema).optional()` | Reusable persona/playbook/skill starter templates (`presetFromBot`) |
| `bookmarks` | `z.array(MessageBookmarkSchema).optional()` | Host-local message references (`MAX_MESSAGE_BOOKMARKS`; excluded from bot/team exports) |
| `proposalDecisions` | `z.array(...).max(200).optional()` | Atomic acceptance/dismissal receipts paired with `proposalDecisionEpoch` |

For the authoritative 15-Bot and 6-Team production roster configured in `paseo-bots-plugin-settings/bots.json`, load [../../../project/shards/03-bot-fleet-and-teams.md](../../../project/shards/03-bot-fleet-and-teams.md). Do not duplicate fleet roster tables inside plugin design shards.

## 3. Asset Decoupling & 75 KB Configuration Budget

Keep `paseo-bots-plugin-settings/bots.json` strictly below the 75 KB file-size ceiling by externalizing prose instructions, MCP server definitions, and binary artwork, preventing `PluginSettingsStore` memory bloat and RPC hydration stalls.

1. **Decoupled Bot Souls (`souls/<botId>.md`)**:
   - Persist standing instructions in `$PASEO_HOME/plugin-settings/paseo-bots/souls/<botId>.md` via `readBotSoul`, `writeBotSoul`, and `resolveSoulsDir` (`paseo-bots/server/souls.ts`), exposed over `soulReadRpc` and `soulWriteRpc`.
   - Enforce `SOUL_MAX_BYTES = 24_000` (`paseo-bots/shared/bot.ts`).
   - Clear inline `bot.soul` to `""` in `bots.json` via `stripSoulInSettings` before persisting settings.
2. **Decoupled MCP Servers (`mcp-servers/<id>.json`)**:
   - Store shared `LibraryMcpServerSchema` entries (`stdio`, `http`, `sse`) as individual JSON files under `$PASEO_HOME/plugin-settings/paseo-bots/mcp-servers/<id>.json` via `readMcpServer`, `writeMcpServer`, `deleteMcpServer`, and `listAllMcpServers` (`paseo-bots/server/mcp-servers.ts`).
   - Strip inline `library` payloads from `bots.json` via `stripLibraryInSettings`; bots bind servers exclusively by ID (`bot.mcpServerIds`).
3. **Procedural Pixel Avatars & Zero Base64 Redline**:
   - NEVER store `data:image/...;base64,...` Data URLs inside `bots.json` (`avatar.imageUrl` or `logo.imageUrl`).
   - Use `imageUrl: null` with deterministic `seed`, `palette`, and `style` (`pixel | modern | orbital`), rendered offline on a 24x24 grid via `pixelAvatar` (`paseo-bots/shared/avatar.ts`, `paseo-bots/shared/pixel.ts`).
   - Isolate custom SVG/PNG brand icons and portrait galleries under `paseo-bots-plugin-data/shared/assets/icons/`; reference external artwork solely via `preset:` sentinels or immutable `https://` URLs matching `IMAGE_URL`.

## 4. Provider Projection & Zero-Pollution Redlines

Enforce dual filesystem boundary guards and canonical provider tool translation before writing any agent runtime file, so bot sessions never pollute external git repositories or global operator configs.

- **Canonical Capability & Mode Translation (`paseo-bots/shared/bot-tools.ts`)**:
  - `resolveToolsForProvider` maps canonical tool grants across `AGY_BASE_TOOLS` (`agy` / `agy-acp`), `CLAUDE_BASE_TOOLS` (`claude`), and `CODEX_BASE_TOOLS` (`codex`) without cross-provider leakage.
  - `resolveModeIdForProvider` maps canonical permission levels per runtime (e.g., `full-access` on `agy` vs `bypassPermissions` on `claude`).
- **Guard 1 — `assertNotGlobalUserConfig` (`paseo-bots/server/claude-agents.ts`)**: MUST throw immediately if any write targets `~/.claude`, `~/.claude.json`, `~/.claude/settings.json`, `~/.gemini/config/skills`, or `~/.gemini/settings.json`.
- **Guard 2 — `assertInsideManagedDataDir` (`paseo-bots/server/claude-agents.ts`)**: MUST verify via `path.relative` that every session run artifact and seat skill symlink resolves strictly inside `$PASEO_HOME/plugin-data/paseo-bots` (or explicit test override `PASEO_BOTS_DATA_DIR`), invoking `assertNotGlobalUserConfig` first.
- **Zero Target-Repository Writes**: NEVER write `.mcp.json`, `.claude/agents/`, or `.claude/skills/` into external code repositories (`targetProjectDirs`). Local Claude sessions (`syncBotToClaudeAgent`) scope `projectDir` to the bot's Managed Seat (`placement.path`), while per-session prompts and MCP configs write exclusively to `<sessionBoardPath>/runs/<agentId>.prompt.md` and `<agentId>.mcp.json` via `writeSessionRunArtifacts`.
- **Antigravity Agent Sync & Orphan Sweep (`paseo-bots/server/agy-agents.ts`)**: `syncBotToAgyAgent` and `syncAllBotsToAgy` project active `agy` bots into `~/.gemini/config/agents/<botId>.md` (`defaultAgyAgentsDir`, overridable via `AGY_AGENTS_DIR`) stamped with `managedBy: paseo-bots`. `listOrphanedAgyAgents` and `resolveOrphanedAgyAgent` (`agyOrphansListRpc` / `agyOrphanResolveRpc`) detect stale `managedBy: paseo-bots` files and delete or disable (`<fileName>.disabled`) them.

## 5. Direct Schema-Validated Mutation Discipline

Bypass the `propose_changes` chat tool (`paseo-bots/shared/changes.ts`) for administrative or scripted configuration updates, because current Paseo clients do not render interactive diff-approval cards for `propose_changes` in chat streams:

1. Read `paseo-bots-plugin-settings/bots.json` and extract outer `{ version: 4, values }`.
2. Write updated standing instructions to `souls/<botId>.md` (`<= 24,000` B) and MCP configs to `mcp-servers/<id>.json`, keeping `bot.soul = ""` in `bots.json`.
3. Validate `values` with `botSettings.schema.parse(values)` (and `validateWorkflowDAG` for workflows).
4. Write `{ "version": 4, "values": validatedValues }` atomically and confirm `bots.json` remains `< 75,000` bytes.

## 6. Conformance Matrix

| Requirement | Primary Anchor | Verification Command |
| :--- | :--- | :--- |
| 3-way symlink / junction integrity | `scripts/check-paseo-bots-link.mjs`, `LINK_MAPPINGS` | `node scripts/check-paseo-bots-link.mjs --strict` |
| Outer v4 envelope & `< 75 KB` budget | `paseo-bots/shared/bot.ts`, `botSettings` | `node -e 'const fs=require("fs"),s=fs.statSync("paseo-bots-plugin-settings/bots.json").size,d=JSON.parse(fs.readFileSync("paseo-bots-plugin-settings/bots.json","utf8"));if(d.version!==4\|\|s>=75000)process.exit(1);'` |
| Empty inline `soul` & zero `data:` avatars | `paseo-bots/server/souls.ts`, `stripSoulInSettings` | `node -e 'const d=JSON.parse(require("fs").readFileSync("paseo-bots-plugin-settings/bots.json","utf8"));for(const b of d.values.bots){if(b.soul\|\|String(b.avatar?.imageUrl\|\|"").startsWith("data:"))process.exit(1);}'` |
| Zero-pollution boundary guards | `paseo-bots/server/claude-agents.ts`, `assertInsideManagedDataDir` | `npm --prefix paseo-bots test -- claude-agents souls mcp-servers` |
