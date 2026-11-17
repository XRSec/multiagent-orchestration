---
doc_id: PASEO-BOTS-CONFIG-STORAGE
status: CURRENT
version: 1.2.0
last_verified: 2026-11-16
language: en-US
---

# Paseo Bots Plugin Configuration, Envelope & Storage Topology Specification

## 1. Scope & System Architecture

This specification defines the physical persistence layout, configuration envelope, bot/team roster, and client mutation disciplines for the Paseo Bots plugin (`@oliexe/paseo-bots`) within the multiagent-orchestration system.

Primary codebase coordinates:
- Host settings source: `<projectRoot>/paseo-bots-plugin-settings/bots.json`
- Host runtime settings link: `~/.paseo/plugin-settings/paseo-bots` -> `<projectRoot>/paseo-bots-plugin-settings`
- Shareable plugin data source: `<projectRoot>/paseo-bots-plugin-data/` (`library/skills/`, `shared/Bots/`)
- Symlink / junction verifier: `<projectRoot>/scripts/check-paseo-bots-link.mjs` (invoked by `.githooks/post-merge` and `.githooks/post-rewrite`)
- Plugin schema definition: `<projectRoot>/paseo-bots/shared/bot.ts`, symbols `botSettings`, `resolveBotPlacement`, `resolveBotBaseTools`
- Canonical tool & permission mapping: `<projectRoot>/paseo-bots/shared/bot-tools.ts`
- Workspace & projects API: `<projectRoot>/paseo-bots/shared/chat.ts`, `projects.list` (`workdir` + `mounts`)
- Antigravity agent sync: `<projectRoot>/paseo-bots/server/agy-agents.ts`, symbols `syncAllBotsToAgy`, `listOrphanedAgyAgents`, `resolveOrphanedAgyAgent`
- Claude agent sync: `<projectRoot>/paseo-bots/server/claude-agents.ts` (`.claude/agents/<id>.md`)
- Change proposal engine: `<projectRoot>/paseo-bots/shared/changes.ts`, symbol `applyChanges`

---

## 2. Storage Topology & Outer Envelope Architecture

### 2.1 Directory Separation & Symlink Topology

Paseo separates plugin state into two directories under `$HOME/.paseo/` (overridable via `PASEO_HOME`):
1. `~/.paseo/plugin-settings/paseo-bots/`: Host-scoped plugin settings managed via `defineSettings`, containing `bots.json`.
2. `~/.paseo/plugin-data/paseo-bots/`: Shareable bot assets (`library/skills/`, `shared/Bots/`) and per-bot runtime workspaces. Runtime chat logs under `paseo-bots-plugin-data/shared/Bots/*/memory/log/` are gitignored.

To track configuration and shareable bot assets under version control, three directory mappings are linked between the repository and `$PASEO_HOME`:
- `<projectRoot>/paseo-bots-plugin-settings` <-> `~/.paseo/plugin-settings/paseo-bots`
- `<projectRoot>/paseo-bots-plugin-data/library` <-> `~/.paseo/plugin-data/paseo-bots/library`
- `<projectRoot>/paseo-bots-plugin-data/shared` <-> `~/.paseo/plugin-data/paseo-bots/shared`

`scripts/check-paseo-bots-link.mjs` (`LINK_MAPPINGS`, `checkSingleLink`) verifies these mappings cross-platform (`ln -s` on macOS/Linux; directory junctions via `mklink /J` or `New-Item -ItemType Junction` on Windows). Git hooks `.githooks/post-merge` and `.githooks/post-rewrite` (on `rebase`) run the verifier automatically after pulls and rebases.

### 2.2 Envelope Structure vs `botSettings.schema`

A structural distinction exists between the JSON payload stored on disk and the validation schema defined in the plugin codebase:

1. **Outer Envelope (Disk Persistence)**:
   Paseo host settings manager wraps all persisted settings files in a versioned envelope (currently `version: 4`, which added `mounts: []` default per bot):
   ```json
   {
     "version": 4,
     "values": {
       "bots": [ ... ],
       "history": [ ... ],
       "ui": { ... },
       "library": { ... },
       "groups": [ ... ]
     }
   }
   ```
2. **Inner Values Schema (`botSettings.schema`)**:
   Defined in `<projectRoot>/paseo-bots/shared/bot.ts` via `defineSettings`, `botSettings.schema` governs only the inner `values` object. The schema declares:
   - `bots`: `z.array(BotSchema).default([])` (includes `baseTools?: string[]`, `mounts: string[]` defaulting to `[]`, `cwd: string | null`, and bot-scoped `MEMORY.md`)
   - `history`: `z.array(HistoryEntrySchema).default([])`
   - `ui`: `BotListUiSchema.optional()`
   - `library`: `LibrarySchema.optional()` (currently holds `skills`, including `read-twitter`)
   - `defaults`: `BotDefaultsSchema.optional()`
   - `presets`: `z.array(PresetSchema).optional()`
   - `groups`: `z.array(BotGroupSchema).optional()` (supports team-scoped `cwd` and `mounts`; `resolveBotPlacement` resolves session placement in order `group.cwd -> bot.cwd -> ensureBotHome`)

Writing raw `values` directly to disk without the outer `{ "version": 4, "values": { ... } }` wrapper causes Paseo daemon startup parser failure and triggers automatic fallback reset.

### 2.3 Dual Agent Sync, Canonical Tool Mapping, Runtime I18n & Media Normalization

- **Canonical Capability & Permission Mapping (`paseo-bots/shared/bot-tools.ts`, `paseo-bots/shared/bot.ts`)**: `bot-tools.ts` defines canonical capabilities and permission mode mappings (e.g., `full_access` -> `full-access` on `agy` / `bypassPermissions` on `claude`). `bot.ts` performs dynamic runtime resolution (`resolveBotBaseTools`, `resolveBotPlacement`) per provider without cross-provider leakage.
- **Antigravity Agent Sync & Orphan Detection (`paseo-bots/server/agy-agents.ts`)**: `syncAllBotsToAgy` and `syncBotToAgyAgent` project active `agy` bots from `bots.json` into `~/.gemini/config/agents/*.md` using dynamic tool/permission mapping, writing front matter fields `managedBy: paseo-bots` and `botId`. `listOrphanedAgyAgents` and `resolveOrphanedAgyAgent` detect `managedBy: paseo-bots` files absent from active `agy` bots and delete or disable (`<fileName>.disabled`) them.
- **Claude Agent Sync (`paseo-bots/server/claude-agents.ts`)**: Projects active `claude` bots into `.claude/agents/<id>.md` using canonical capability and permission mode mappings.
- **Client Localization & Stream Scroll (`paseo-bots/client/`)**: `i18n/` (`en.ts`, `zh-CN.ts`) provides `en` and `zh-CN` UI localization; `chat/Stream.tsx` enforces initial scroll lock on stream mount.
- **ACP Media Placeholder Normalization (`paseo-agy-acp/server/`)**: `brain-io.ts`, `mapping.ts`, and `session.ts` normalize non-text media attachments to `[image]` placeholders in `history: 'replay'` and brain projection paths.

---

## 3. Bot Fleet & Team Organization

The current configuration hosts 11 active bots grouped across 5 teams. All agents default to the Antigravity provider (`provider: "agy"`) with `modeId: "full-access"`. Workspace mounts are team-scoped: individual bots remain at `cwd: null, mounts: []` (with bot-scoped `MEMORY.md`), while team `team-mwgv59i8dfdv` holds `<projectRoot>` in `mounts`.

### 3.1 Eleven-Bot Fleet Roster

| Bot ID | Display Name | Role / Focus | Provider | Model | Mode ID |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `bot-moadmin` | `moAdmin` | Multi-agent taskforce director & orchestrator | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-mocode` | `moCode` | Fullstack developer & code architect | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-modoc` | `moDoc` | Architecture scribe & documentation steward | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-moci` | `MoCI` | CI sentinel & automated test gatekeeper | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-mogit` | `MoGit` | SCM specialist & repository hygiene gatekeeper | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-modeep` | `MoDeep` | Codebase intelligence scout & deep research | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-mo` | `Mo` | Meta-toolsmith & subagent/skill generator | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-rea` | `REA` | Reverse engineering & security audit specialist | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-x` | `X 订阅官` | Real-time X (Twitter) intelligence & digest | `agy` | `gemini-3.8-flash` | `full-access` |
| `bot-xhs` | `小红书订阅官` | Xiaohongshu feed extraction & trend clustering | `agy` | `gemini-4-hydrogen` | `full-access` |
| `bot-github` | `GitHub` | GitHub PR, Issues & notifications monitor | `agy` | `gemini-4-hydrogen` | `full-access` |

#### Bot Configuration Specifics:
- **`moAdmin` (`bot-moadmin`)**:
  - Primary model `gemini-4-hydrogen`; `baseTools` scoped to orchestration tools (`invoke_subagent`, `define_subagent`, `manage_subagents`, `send_message`, `manage_task`, `schedule`, `ask_question`).
- **Worker Mo-Bots (`bot-mocode`, `bot-modoc`, `bot-moci`, `bot-mogit`, `bot-modeep`, `bot-mo`, `bot-rea`)**:
  - Unified on `provider: "agy"`, `model: "gemini-4-hydrogen"`, and `modeId: "full-access"`.
- **Subscription & Monitor Bots (`bot-x`, `bot-xhs`, `bot-github`)**:
  - `bot-x` (`X 订阅官`): Runs on `gemini-3.8-flash` with the `read-twitter` library skill (`paseo-bots-plugin-data/library/skills/read-twitter`) and `ego-browser`.
  - `bot-xhs` (`小红书订阅官`): Operates via `ego-browser` on `gemini-4-hydrogen`.
  - `bot-github` (`GitHub`): Monitors personal PRs, Issues, and watched repositories via `gh` CLI on `gemini-4-hydrogen`.

### 3.2 Five Team Groups

Teams are configured in the `groups` array of `bots.json`:

1. **`multiagent-orchestration`** (`team-mwgv59i8dfdv`):
   - Lead: `moAdmin` (`bot-moadmin`).
   - Members: All 8 Mo-Bots (`bot-moadmin`, `bot-mocode`, `bot-modoc`, `bot-moci`, `bot-mogit`, `bot-modeep`, `bot-mo`, `bot-rea`).
   - Workspace: Holds `<projectRoot>` in team `mounts` (individual bots stay at `cwd: null, mounts: []`).
   - Instructions: Governed by `AGENTS.md` operational invariants, including safe file deletion, dense en-US machine documentation, and single-speaker incremental signals.
2. **`X`** (`team-mwgwx6jp60rn`):
   - Lead: `X 订阅官` (`bot-x`).
   - Members: `["bot-x"]`.
   - Instructions: Governed by X timeline tracking, KOL clustering, and noise reduction.
3. **`小红书`** (`team-mwgwx6jqk2iy`):
   - Lead: `小红书订阅官` (`bot-xhs`).
   - Members: `["bot-xhs"]`.
   - Instructions: Governed by Xiaohongshu feed monitoring and inspiration digest generation via `ego-browser`.
4. **`GitHub`** (`team-github`):
   - Lead: `GitHub` (`bot-github`).
   - Members: `["bot-github"]`.
   - Instructions: Governed by personal PR, Issue, and watched-repo tracking.
5. **`情报中心`** (`team-intel-center`):
   - Lead: `null` (peer aggregation channel).
   - Members: `["bot-x", "bot-xhs", "bot-github"]`.
   - Instructions: Cross-platform intelligence aggregation; each specialist emits incremental signal only.

---

## 4. Client Quirk & Direct Mutation Discipline

### 4.1 Client Proposal Card Rendering Defect

The Paseo Bots plugin includes an automated agent tool `propose_changes` (`<projectRoot>/paseo-bots/shared/changes.ts`). Under designed workflow, bots propose configuration diffs (e.g., bot creation, model reassignment, team updates) which generate structured approval cards inside chat sessions.

In the current client implementation:
- The UI client does not render interactive `propose_changes` action cards within the chat bubble timeline.
- Users are unable to inspect diffs or click "Apply" to commit proposals via the chat interface.

### 4.2 Direct Schema-Validated Write Rule

Because interactive proposal cards do not render, programmatic or administrative reconfigurations must bypass `propose_changes` and apply directly to disk:
1. Load `<projectRoot>/paseo-bots-plugin-settings/bots.json`.
2. Extract and mutate the inner `values` object according to `botSettings.schema`.
3. Validate mutations using Zod (`BotSchema.parse`, `BotGroupSchema.parse`).
4. Write back the complete file preserving the outer `{ "version": 4, "values": values }` envelope.
5. Paseo host daemon detects file changes and reloads the active configuration without service disruption.

---

## 5. Conformance Table (D8)

| Component / Symbol | Coordinate | Status | Verification Command |
| :--- | :--- | :--- | :--- |
| Settings File | `<projectRoot>/paseo-bots-plugin-settings/bots.json` | CURRENT | `test -f paseo-bots-plugin-settings/bots.json` |
| Plugin Data Dir | `<projectRoot>/paseo-bots-plugin-data/shared/Bots` | CURRENT | `test -d paseo-bots-plugin-data/shared/Bots` |
| Symlink / Junctions | `scripts/check-paseo-bots-link.mjs`, `LINK_MAPPINGS` | CURRENT | `node scripts/check-paseo-bots-link.mjs` |
| Outer Envelope Version | `bots.json` field `version` = 4 | CURRENT | `grep -q '"version": 4' paseo-bots-plugin-settings/bots.json` |
| Fleet Count (11 Bots) | `bots.json` array `values.bots` | CURRENT | `node -e 'const d=JSON.parse(require("fs").readFileSync("paseo-bots-plugin-settings/bots.json","utf8"));console.log(d.values.bots.length)'` |
| Team Count (5 Teams) | `bots.json` array `values.groups` | CURRENT | `node -e 'const d=JSON.parse(require("fs").readFileSync("paseo-bots-plugin-settings/bots.json","utf8"));console.log(d.values.groups.length)'` |
| Agy Agent Sync | `<projectRoot>/paseo-bots/server/agy-agents.ts`, `syncAllBotsToAgy` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| Claude Agent Sync | `<projectRoot>/paseo-bots/server/claude-agents.ts` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| Canonical Tool Mapping | `<projectRoot>/paseo-bots/shared/bot-tools.ts` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| Inner Schema Def | `<projectRoot>/paseo-bots/shared/bot.ts`, symbol `botSettings` | CURRENT | `npm --prefix paseo-bots run typecheck` |
