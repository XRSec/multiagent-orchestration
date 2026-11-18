---
doc_id: PASEO-BOTS-SHARD-02-SEAT-BLACKBOARD-PROMPTS
status: CURRENT
version: 1.1.0
last_verified: 2026-11-19
language: en-US
---

# Shard 02: Managed Seats, Session Blackboard & Six-Block Prompt Assembly

Parent index: [../INDEX.md](../INDEX.md). Governs physical CWD placement (`ensureManagedSessionHome`), external repository attachment (`targetProjectDirs`), shared Session Blackboard artifacts, `TEAM_SESSION_LABEL` correlation, skill review SHA gating, and role-aware 6-block system prompt synthesis.

## 1. Managed Seat Physical Topology

Assign every bot process an isolated Managed Seat directory under `$PASEO_HOME/plugin-data/paseo-bots/` via `ensureManagedSessionHome` (`paseo-bots/server/bot-home.ts`), because isolating process CWDs keeps Paseo sidebar grouping deterministic and prevents concurrent bots from colliding on `.agents/` or `.claude/` runtime directories.

```text
$PASEO_HOME/plugin-data/paseo-bots/shared/
├── Bots/                                       (DM sidebar project root; stamped with PROJECT_ICON)
│   └── <botId>/                                (DM process CWD & permanent personal home)
│       ├── .agents/skills/<skillId>/SKILL.md   (Verified skill symlinks for DM chats)
│       ├── memory/
│       │   ├── MEMORY.md                       (Personal durable memory across DM & Team chats)
│       │   └── log/<YYYY-MM-DD>.md             (Daily turn journal; gitignored)
│       └── sessions/<sessionId>/               (Direct-chat Session Blackboard)
│           ├── handoffs/
│           ├── artifacts/
│           └── runs/<agentId>.{prompt.md,mcp.json}
└── Teams/
    └── <sanitizedTeamName>/                    (Team sidebar project root; sanitizeTeamFolderName)
        ├── icon.svg                            (PROJECT_ICON)
        ├── MEMORY.md                           (Team shared memory; injected up to 8,192 B)
        ├── agents/<botId>/                     (Team persistent seat CWD; teamAgentSeatPath)
        │   └── .agents/skills/<skillId>/       (Bot-default verified skill symlinks)
        └── sessions/<teamSessionId>/           (Shared Team Session Blackboard; teamSessionBoardPath)
            ├── TASK_MANIFEST.md                (Lead-owned task decomposition & DoD ledger)
            ├── handoffs/<stageId>-<botId>.md   (Full untruncated stage handoff outputs)
            ├── artifacts/                      (Scratch files, logs & intermediate diffs)
            ├── runs/<agentId>.prompt.md        (Immutable per-agent system prompt snapshot)
            ├── runs/<agentId>.mcp.json         (Immutable per-agent MCP server config)
            └── seats/<stageId>-<botId>/        (Ephemeral stage CWD when stage.skillIds overrides)
```

| `ManagedHomePaths` Field | DM Mode (`!groupId`) | Team Mode (`groupId`, default seat) | Stage Override (`groupId` + `stageSeatKey`) |
| :--- | :--- | :--- | :--- |
| `root` (`projectRoot`) | `shared/Bots` | `shared/Teams/<team>` | `shared/Teams/<team>` |
| `path` (Process CWD) | `shared/Bots/<botId>` | `shared/Teams/<team>/agents/<botId>` | `.../sessions/<teamSessionId>/seats/<stageId>-<botId>` |
| `botHomePath` | `shared/Bots/<botId>` | `shared/Bots/<botId>` | `shared/Bots/<botId>` |
| `teamRootPath` | `null` | `shared/Teams/<team>` | `shared/Teams/<team>` |
| `sessionBoardPath` | `shared/Bots/<botId>/sessions/<id>` | `shared/Teams/<team>/sessions/<id>` | `shared/Teams/<team>/sessions/<id>` |
| `runsPath` | `<sessionBoardPath>/runs` | `<sessionBoardPath>/runs` | `<sessionBoardPath>/runs` |

### External Repository Attachment (`targetProjectDirs`)
- **Deduplicated Resolution**: `resolveBotPlacement` (`paseo-bots/shared/chat.ts`) collects `[group.cwd, ...group.mounts, ...bot.mounts]` when a team is active (or `[bot.cwd, ...bot.mounts]` in DM), expands portable prefixes (`${REPO_ROOT}`, `${PASEO_WORKSPACE_ROOT}`, `~`) via `expandPortablePath` against `home.repoRootPath` (`resolveRepoRootPath` in `paseo-bots/server/bot-home.ts`) and `home.userHomePath`, and writes deduplicated host-native paths into `placement.targetProjectDirs` while leaving `placement.path = home.path`.
- **Pure Mount Plumbing**: `startChat` (`paseo-bots/server/chats.ts`) and `buildAgentConfig` (`paseo-bots/shared/bot.ts`) pass `targetProjectDirs` via `additionalDirectories` (Claude/Codex) and `_meta.antigravity.workspaceRoots` (`agy` / `agy-acp`). Agents edit source code and run git/tests directly inside `targetProjectDirs` while CWD-relative scratch writes land harmlessly in the Managed Seat.

## 2. Session Blackboard & `TEAM_SESSION_LABEL` Correlation

Pass multi-kilobyte plans, upstream stage outputs, and diffs by file path under `<sessionBoardPath>` rather than pasting raw blobs into chat messages, bounding context growth across multi-stage fan-out.

- **Label Correlation (`paseo-bots/shared/chat.ts`)**: `startChat` stamps every chat with `TEAM_SESSION_LABEL = "paseo-bots.team-session"` and `SESSION_ROLE_LABEL = "paseo-bots.session-role"`.
- **Unified `teamSessionId` Propagation**:
  1. Top-level chat creation allocates `teamSessionId = agentId` when no prior session label exists.
  2. Peer delegation (`ask_bot` via `ASKED_IN_LABEL`) reads `callerChat.labels[TEAM_SESSION_LABEL]` in `startChat` (`paseo-bots/server/chats.ts`) and inherits the caller's `teamSessionId`.
  3. Workflow execution (`runWorkflowDag` in `paseo-bots/server/workflow-runner.ts`) inherits `callerChat.labels[TEAM_SESSION_LABEL]` (falling back to `wf-<taskId>`), ensuring `ask_bot` turns and `run_workflow` stages read and write the exact same `TASK_MANIFEST.md`, `handoffs/`, and `artifacts/` directory.
- **Immutable Run Snapshots**: When `runsDir` is present, `systemPrompt` (`paseo-bots/server/prompt.ts`) invokes `writeSessionRunArtifacts` (`paseo-bots/server/claude-agents.ts`) to persist `<agentId>.prompt.md` and `<agentId>.mcp.json` inside `<sessionBoardPath>/runs/`, preventing concurrent stage launches from overwriting each other's `--mcp-config` or prompt files.

## 3. Main-Session De-Staticization & Role Resolution

Compute session role dynamically per chat via `resolveSessionRole` (`paseo-bots/shared/groups.ts`) instead of writing static subagent rosters or workflow catalogs into workspace config files, keeping main sessions lean and role-bounded.

| `SessionRoleKind` | Trigger Condition (`resolveSessionRole`) | Team Roster (`Block 3`) | Workflows Catalog | Role Mandate (`sessionRolePrompt`) |
| :--- | :--- | :--- | :--- | :--- |
| `dm` | `!group && !isWorkflowStage && !askedByBotId` | Omitted | Hidden | Act as direct personal assistant within granted tools |
| `team-lead` | `(group.leadId === botId \|\| botId === "bot-moadmin")` with `group` or `isWorkflowStage` | Included (`ROSTER_MAX = 40`) | Exposed (Team + Global) | Own `TASK_MANIFEST.md`, delegate via `ask_bot` / `run_workflow`, audit `<worker_handoff>`, cap repairs at 3 (`ORCHESTRATOR_WORKFLOW_PROTOCOL`) |
| `team-direct-specialist` | Non-lead member opened directly in a `group` (`!isWorkflowStage && !askedByBotId`) | Included | Hidden | Handle domain work directly; escalate cross-domain or workflow requests to `leadBot` via `ask_bot` |
| `dispatched-worker` | Non-lead bot with `isWorkflowStage === true` or `askedByBotId` set | Included (if teamed) | Hidden | Execute strictly within brief scope, run verification, end with `<worker_handoff>` (`WORKER_PROTOCOL_SUFFIX`) |

## 4. Six-Block System Prompt Assembly

Assemble every local chat's system prompt via `systemPrompt` -> `promptContext` (`paseo-bots/server/prompt.ts`) -> `promptSections` (`paseo-bots/shared/bot.ts`) in six ordered blocks so static persona/instructions anchor the KV-cache prefix while dynamic workspace/tool blocks sit at the tail:

| Block | Section Title(s) | Source & Deterministic Truncation / Gating Rules |
| :--- | :--- | :--- |
| **Block 1** | `Persona`, `Standing instructions`, `Memory`, `Recent work` | Loads `souls/<botId>.md` (`readBotSoul`). If `systemPromptMode === "replace"`, emits `soul` verbatim; else emits `Persona` + `BEGIN/END STANDING INSTRUCTIONS`. Injects `shared/Bots/<botId>/memory/MEMORY.md` (`injectedMemory`, 4 categories: `user`, `feedback`, `project`, `reference`) + 2-day `recentLogEntries`. |
| **Block 2** | `Session role` | Emits role-specific contract from `sessionRolePrompt(sessionRole, { bot, sessionBoardPath })`. |
| **Block 3** | `Team` | Omitted when `sessionRole === "dm"`. Emits `teamsPrompt`: teammate roster, read-only `group.instructions`, `shared/Teams/<team>/MEMORY.md` (truncated at `8,192` B), and—solely for `team-lead`—merged team + global workflows. |
| **Block 4** | `Workspace`, `Session blackboard` | Emits `Working directory`, `Mounted project paths`, and `Session blackboard` paths (`TASK_MANIFEST.md`, `handoffs/`), mandating file-path exchange over raw chat blobs. |
| **Block 5** | `Target projects` | Calls `loadTargetProjectRules` on each `targetProjectDirs` path: reads `<dir>/AGENTS.md` (fallback `<dir>/CLAUDE.md`) capped at `MAX_PROJECT_RULES_BYTES = 16_384`, wrapped in `<project_rules repo="...">` with a continuation read hint when `truncated === true`. |
| **Block 6** | `Skills`, `Playbooks`, `Connected apps`, `Bot tools`, `Paseo tools` | Filters `botSkills` by SHA-256 review (`skillSha(id) === skill.reviewedSha`; `reviewedSha === null` or mismatched hashes are blocked) and symlinks approved skills into `<seatDir>/.agents/skills/<id>/SKILL.md` (`syncSeatSkills` in `paseo-bots/server/library.ts`). Appends trigger-matched `selectPlaybooks`, Composio `botApps`, `botToolsPrompt`, and `PASEO_TOOLS_PROMPT`. |

### Background Memory Curation (`MemoryCurator`)
`MemoryCurator` (`paseo-bots/server/memory-curator.ts`) spawns background consolidation turns tagged with `MEMORY_CURATION_LABEL` to distill daily `MemoryJournal` (`paseo-bots/server/journal.ts`) entries into `MEMORY.md`. `archiveStaleMemoryCurationChats` (`paseo-bots/server/workflow-runner.ts`) sweeps idle curation chats so background maintenance never lingers in the active sidebar.

## 5. Conformance Matrix

| Requirement | Primary Anchor | Verification Command |
| :--- | :--- | :--- |
| Managed Seat & Blackboard provisioning | `paseo-bots/server/bot-home.ts`, `ensureManagedSessionHome` | `npm --prefix paseo-bots test -- bot-home` |
| `targetProjectDirs` deduplication & mounts | `paseo-bots/shared/chat.ts`, `resolveBotPlacement` | `npm --prefix paseo-bots test -- shared/chat` |
| Role resolution & lead-only workflow catalog | `paseo-bots/shared/groups.ts`, `resolveSessionRole`, `teamPrompt` | `npm --prefix paseo-bots test -- groups` |
| 6-block order, `16,384` B rules cap & `reviewedSha` | `paseo-bots/server/prompt.ts`, `loadTargetProjectRules`, `promptSections` | `npm --prefix paseo-bots test -- prompt` |
