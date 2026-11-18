---
doc_id: PASEO-BOTS-TEAMWORK-SESSION-ARCH
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Paseo Bots Teamwork Seat Topology, Session Blackboard & Unified Prompt Assembly Specification

## 1. Scope, Problem Statement & Codebase Coordinates

This target specification defines the unified physical directory topology, per-agent teamwork seat isolation, per-session blackboard architecture, harness-agnostic session prompt/MCP/skill injection, and six-block role-aware prompt assembly for `paseo-bots` and `paseo-agy-acp`. It is structured into atomic, self-contained work packages (`WP-1` through `WP-6`) so lower-cost execution models can implement each slice deterministically without architectural guesswork.

Primary codebase coordinates:
- Managed storage paths & seat provisioning: `<projectRoot>/paseo-bots/server/bot-home.ts`, symbols `botsHomePath`, `teamsHomePath`, `teamHomePath`, `botDataPath`, `ensureBotHome`
- Placement resolution & session launch: `<projectRoot>/paseo-bots/shared/chat.ts`, symbols `BotPlacement`, `resolveBotPlacement`, `StartChatInput`, `startBotChat`
- Server chat entry & group resolution: `<projectRoot>/paseo-bots/server/chats.ts`, symbol `startChat`
- Prompt context & multi-layer assembly: `<projectRoot>/paseo-bots/server/prompt.ts`, symbols `promptContext`, `systemPrompt`; `<projectRoot>/paseo-bots/shared/bot.ts`, symbols `PromptContext`, `promptSections`, `composeSystemPrompt`, `buildAgentConfig`, `resolveAgyAgent`
- Team charter & roster formatting: `<projectRoot>/paseo-bots/shared/groups.ts`, symbols `teamPrompt`, `teamsPrompt`
- Skill symlinking & harness config projection: `<projectRoot>/paseo-bots/server/library.ts`, symbol `linkBotSkills`; `<projectRoot>/paseo-bots/server/claude-agents.ts`, symbols `assertNotGlobalUserConfig`, `syncClaudeMcpConfig`, `syncClaudeSkills`, `syncBotToClaudeAgent`; `<projectRoot>/paseo-bots/server/agy-agents.ts`, symbol `syncBotToAgyAgent`
- Antigravity ACP session adapter: `<projectRoot>/paseo-agy-acp/server/session.ts`, symbols `effectiveLaunch`, `sessionParams`
- Workflow DAG stage runner: `<projectRoot>/paseo-bots/server/workflow-runner.ts`, symbols `defaultStageDispatcher`, `runWorkflowDag`; `<projectRoot>/paseo-bots/shared/workflows.ts`, symbols `buildStageBriefPrompt`, `parseWorkerHandoff`

### 1.1 Architectural Defects in the Prior Implementation

1. **Inverted CWD Ownership (`resolveBotPlacement` in `shared/chat.ts`)**: Setting `group.cwd` to a target code repository moved the agent's process `cwd` out of Paseo's managed storage into the user's git tree. For Claude providers, `syncBotToClaudeAgent` then wrote `.mcp.json`, `.claude/agents/`, and `.claude/skills/` directly into the user's repository and unlinked unrecognized skill symlinks. Conversely, leaving `group.cwd` unset (`null`) caused agents to lose visibility into the target repository's `AGENTS.md` and `CLAUDE.md`.
2. **Static Global Agent Coupling on Antigravity (`resolveAgyAgent` in `shared/bot.ts`)**: Whenever `isAgyProvider(bot.provider)` held, `buildAgentConfig` set `providerOptions.agent = bot.id` and omitted `systemPrompt`. `paseo-agy-acp` launched `agy acp --agent <bot.id>`, reading a single global `$HOME/.gemini/config/agents/<bot.id>.md` file. One bot could not simultaneously participate in a direct chat, lead Team A, join Team B, and execute a workflow stage without concurrent sessions overwriting that single file.
3. **Flat Team Folder Collisions (`teamHomePath` in `server/bot-home.ts`)**: Sharing a single team directory across concurrent bots would cause `.agents/skills/` and `.claude/skills/` symlink synchronization for Bot A to collide with or delete skills needed by Bot B. Running two group chats or workflows simultaneously in the same team also lacked isolated per-session directories for `TASK_MANIFEST.md` and stage handoff files.
4. **Role-Blind Teamwork Prompt Assembly (`promptSections` in `shared/bot.ts` & `teamsPrompt` in `shared/groups.ts`)**: Prompt generation treated a bot identically whether it entered a team chat as the Chief Orchestrator (`leadId`), as a user-addressed specialist, or as a background worker dispatched via `ask_bot` or `run_workflow`.

---

## 2. Physical Directory Topology & Ownership Invariants

Process working directories (`cwd`) remain inside Paseo's managed `$PASEO_HOME/plugin-data/paseo-bots/shared/` hierarchy across direct chats, group chats, and workflow stages. External code repositories (`group.cwd`, `bot.cwd`, `mounts`) are attached strictly as mounted target workspaces.

```text
$PASEO_HOME/plugin-data/paseo-bots/shared/
├── Bots/                                         # Direct Mode (DM) project root
│   └── <botId>/                                  # DM CWD for <botId> (botHomePath)
│       ├── MEMORY.md                             # Bot personal long-term memory
│       ├── memory/log/                           # Bot daily conversation logs
│       ├── .agents/skills/<skillId>              # Symlinks -> native AGY skill discovery
│       ├── .claude/skills/<skillId>              # Symlinks -> native Claude skill discovery
│       └── sessions/
│           └── <sessionId>/
│               └── runs/
│                   ├── <agentId>.prompt.md       # Immutable prompt snapshot for CLI flags
│                   └── <agentId>.mcp.json        # Immutable per-run MCP config (--mcp-config)
│
└── Teams/                                        # Teamwork & Workflow root
    └── <sanitizedTeamFolder>/                    # Team project root (teamRootPath)
        ├── MEMORY.md                             # Team shared long-term memory
        ├── agents/                               # Per-agent teamwork seats (collision-free CWDs)
        │   ├── <leadBotId>/                      # Process CWD when <leadBotId> runs in this team
        │   │   ├── .agents/skills/<skillId>      # Symlinks for <leadBotId> skills only
        │   │   ├── .claude/skills/<skillId>      # Symlinks for <leadBotId> skills only
        │   │   └── .claude/agents/<memberId>.md  # Route 1 native subagent stubs (lead seat only)
        │   └── <memberBotId>/                    # Process CWD when <memberBotId> runs in this team
        │       ├── .agents/skills/<skillId>      # Symlinks for <memberBotId> skills only
        │       └── .claude/skills/<skillId>      # Symlinks for <memberBotId> skills only
        │
        └── sessions/                             # Per-conversation / per-workflow blackboards
            └── <teamSessionId>/                  # Shared Session Blackboard (sessionBoardPath)
                ├── TASK_MANIFEST.md              # Session SSOT task checklist & DAG ledger
                ├── handoffs/                     # File-backed worker/stage outputs
                │   └── <stageOrTurnId>-<botId>.md
                ├── artifacts/                    # Shared scratch reports, diffs, test excerpts
                ├── seats/                        # Ephemeral override seats (only when stage overrides skills)
                │   └── <stageId>-<botId>/
                └── runs/                         # Per-process immutable launch configs
                    ├── <agentId>.prompt.md
                    └── <agentId>.mcp.json
```

### 2.1 Boundary Guards

1. **Managed CWD Invariant**: `startBotChat` sets `cwd` to `Bots/<botId>` in direct mode and `Teams/<team>/agents/<botId>` (or `Teams/<team>/sessions/<teamSessionId>/seats/<stageId>-<botId>` when stage-level `skillIds` override the bot's baseline) in teamwork/workflow mode. Verify via unit test in `tests/bot-home-seats.test.ts`.
2. **Repository Cleanliness Guard (`assertInsideManagedDataDir`)**: File writers in `server/claude-agents.ts`, `server/agy-agents.ts`, and `server/library.ts` (`.mcp.json`, `mcp.json`, `.claude/skills/`, `.agents/skills/`, `.claude/agents/`, `.prompt.md`) validate that target paths resolve inside `$PASEO_HOME/plugin-data/paseo-bots/` (or an explicit test temp root), throwing an error if pointed at user home configs (`$HOME/.claude.json`, `$HOME/.claude/settings.json`, `$HOME/.gemini/config/skills`) or an external `targetProjectDir`. Verify via `npm --prefix paseo-bots test tests/seat-isolation.test.ts`.

---

## 3. Placement, Seat & Blackboard Contracts

### 3.1 Path Helper Signatures (`server/bot-home.ts`)

Add deterministic path builders and extend `ensureBotHome`:

```typescript
export interface ManagedHomePaths {
  /** Paseo sidebar grouping root: Bots/ for DM, Teams/<team>/ for teamwork. */
  root: string;
  /** Process CWD: Bots/<botId> for DM, Teams/<team>/agents/<botId> (or stage override seat) for teamwork. */
  path: string;
  /** Always Bots/<botId>, holding personal MEMORY.md regardless of DM or teamwork mode. */
  botHomePath: string;
  /** Teams/<team> when groupId is present, else null. */
  teamRootPath: string | null;
  /** Bots/<botId>/sessions/<sessionId> or Teams/<team>/sessions/<sessionId>. */
  sessionBoardPath: string;
  /** Directory under sessionBoardPath/runs for <agentId>.prompt.md and <agentId>.mcp.json. */
  runsPath: string;
}

export function teamAgentSeatPath(groupId: string, botId: string, groupName?: string): string;
export function teamSessionBoardPath(groupId: string, teamSessionId: string, groupName?: string): string;
export function directSessionBoardPath(botId: string, sessionId: string): string;

export async function ensureManagedSessionHome(input: {
  botId: string;
  sessionId: string;
  groupId?: string;
  groupName?: string;
  stageSeatKey?: string; // "<stageId>-<botId>" when stage.skillIds overrides bot.skillIds
}): Promise<ManagedHomePaths>;
```

### 3.2 Placement Resolution (`shared/chat.ts`)

Replace repository-hijacking `resolveBotPlacement` with managed-seat placement plus explicit `targetProjectDirs`:

```typescript
export interface BotPlacement {
  /** Managed CWD: Bots/<botId> (DM) or Teams/<team>/agents/<botId> (Teamwork). */
  path: string;
  /** Paseo project grouping root: Bots/ or Teams/<team>/. */
  projectRoot: string | null;
  /** Display title for Paseo project grouping. */
  projectTitle?: string | null;
  /** Personal home Bots/<botId> for personal MEMORY.md lookup. */
  botHomePath?: string;
  /** Team root Teams/<team> for team MEMORY.md lookup. */
  teamRootPath?: string | null;
  /** Shared session blackboard directory for this conversation or workflow run. */
  sessionBoardPath?: string;
  /** External code repositories attached from group.cwd, bot.cwd, and mounts (deduplicated). */
  targetProjectDirs: string[];
}
```

Resolution rules in `resolveBotPlacement(bot, group, home)`:
1. `path` equals `home.path`; `projectRoot` equals `home.root`; `projectTitle` equals `group?.name ?? null`.
2. `targetProjectDirs` collects non-empty deduplicated paths in order:
   - In teamwork mode (`group != null`): `[group.cwd, ...(group.mounts ?? []), ...(bot.mounts ?? [])]`.
   - In direct mode (`group == null`): `[bot.cwd, ...(bot.mounts ?? [])]`.
3. Backward-compatibility overload: if a legacy caller passes `{ path, root }` without `targetProjectDirs`, compute `targetProjectDirs` as above while keeping `path = home.path`.

### 3.3 Session Correlation Labels (`shared/chat.ts`)

Define label keys carried on `paseo.agents.create` so peer chats (`ask_bot`) and workflow stages (`run_workflow`) attach to the same teamwork blackboard as the initiating chat:

- `TEAM_SESSION_LABEL = "paseo-bots.team-session"`: UUID of `<teamSessionId>`. When an entry chat starts without this label, `startChat` mints `teamSessionId = agentId` and stamps `[TEAM_SESSION_LABEL]: teamSessionId`. When `ask_bot` or `run_workflow` spawns a child/stage chat from `callerAgentId`, it inherits the caller's `TEAM_SESSION_LABEL` (or `wf-<taskId>` for standalone headless workflow runs).
- `SESSION_ROLE_LABEL = "paseo-bots.session-role"`: `"dm" | "team-lead" | "team-direct-specialist" | "dispatched-worker"`.

---

## 4. Unified Session Launch Protocol Across Harnesses

### 4.1 Decoupling Main Sessions from Static `--agent <bot.id>` Files

1. **`shared/bot.ts` (`buildAgentConfig`)**:
   - Add option `useStaticAgyAgent?: boolean` (default `false`).
   - When `useStaticAgyAgent` is `false` (all Paseo-launched DM, Team Lead, Direct Specialist, `ask_bot`, and Workflow Stage sessions):
     - Always include `systemPrompt` and `systemPromptMode` on `BotAgentConfig`.
     - Do not set `providerOptions.agent = bot.id`; pass `providerOptions: { tools: effectiveBaseTools, additionalDirectories: targetProjectDirs }` when applicable.
2. **`paseo-agy-acp/server/session.ts`**:
   - When `config.providerOptions?.agent` is absent, `effectiveLaunch` spawns `agy acp` without `--agent`, and `sessionParams` delivers `config.systemPrompt` via `_meta.antigravity.systemPrompt.append` (or `.replace` when `config.systemPromptMode === "replace"`) alongside `mcpServers` and `cwd` (= managed seat path).
   - Forward `config.providerOptions?.additionalDirectories` (if non-empty) in `_meta.antigravity.workspaceRoots` (and retain `cwd` as primary root) so Antigravity file tools can access mounted `targetProjectDirs` without extra prompts.
3. **`server/claude-agents.ts` & `shared/bot.ts` (Claude Code)**:
   - Write per-run prompt file `<runsPath>/<agentId>.prompt.md` and per-run MCP file `<runsPath>/<agentId>.mcp.json`.
   - Pass `mcpConfigPath = <runsPath>/<agentId>.mcp.json`, `promptFilePath = <runsPath>/<agentId>.prompt.md`, `systemPromptFlag = resolveClaudeSystemPromptFlag(bot.systemPromptMode, true)`, and `additionalDirectories = [...targetProjectDirs, sessionBoardPath, botHomePath]` in `providerOptions`.
   - Stop writing `.mcp.json`, `.claude/skills/`, or `.claude/agents/` into any external `targetProjectDir`.
4. **Route 1 Native Subagent Stubs (`engine === "native"` or `engine === null`)**:
   - Only when a session runs in teamwork mode with `bot.id === group.leadId` and Route 1 native dispatch enabled:
     - Materialize teammate `.claude/agents/<memberId>.md` inside `Teams/<team>/agents/<leadId>/.claude/agents/` (for Claude leads) and teammate subagent stubs in `<leadSeatPath>/.agents/agents/<memberId>.md` (or `$HOME/.gemini/config/agents/<memberId>.md` strictly with worker-only static persona when AGY requires user-level discovery for `invoke_subagent`).
     - Because the lead's own session no longer uses `--agent <leadId>`, dynamic teamwork context on the lead is unaffected.

### 4.2 In-Seat Native Skill Symlinking (`server/library.ts`)

Add `syncSeatSkills(seatDir: string, skillIds: readonly string[]): Promise<Map<string, string>>`:
1. Call `assertInsideManagedDataDir(seatDir)`.
2. Ensure both `<seatDir>/.agents/skills` and `<seatDir>/.claude/skills` exist.
3. For each reviewed `skillId` in `skillIds`, create/update symlinks `<seatDir>/.agents/skills/<skillId>` and `<seatDir>/.claude/skills/<skillId>` pointing to `$PASEO_HOME/plugin-data/paseo-bots/library/skills/<skillId>`, returning `Map<skillId, "<seatDir>/.agents/skills/<skillId>/SKILL.md">`.
4. Prune stale symlinks inside `<seatDir>/.agents/skills` and `<seatDir>/.claude/skills` that are not in `skillIds`. Because each bot has its own `seatDir`, pruning never touches another bot's skills or any user repository symlink.

---

## 5. Six-Block Role-Aware Prompt Assembly Pipeline

### 5.1 Session Role Classification (`resolveSessionRole` in `shared/groups.ts`)

```typescript
export type SessionRoleKind =
  | "dm"
  | "team-lead"
  | "team-direct-specialist"
  | "dispatched-worker";

export function resolveSessionRole(input: {
  botId: string;
  group?: Pick<BotGroup, "id" | "leadId"> | null;
  askedByBotId?: string | null;
  isWorkflowStage?: boolean;
}): SessionRoleKind {
  if (input.isWorkflowStage || input.askedByBotId) return "dispatched-worker";
  if (!input.group) return "dm";
  if (input.group.leadId === input.botId) return "team-lead";
  return "team-direct-specialist";
}
```

### 5.2 Deterministic Six-Block Composition Order (`promptSections` in `shared/bot.ts`)

When `bot.systemPromptMode === "replace"` and `bot.soul.trim()` is non-empty, Block 1 emits raw `bot.soul.trim()` without the default persona wrapper, while Blocks 2–6 still append operational workspace, blackboard, project, and tool bindings unless explicitly disabled.

| Block | Section Title | Source & Injection Rules | Role-Specific Behavior |
| :--- | :--- | :--- | :--- |
| **1** | `Persona` & `Standing instructions` | `bot.name`, `bot.title`, `bot.description`, `souls/<botId>.md`, plus personal memory at `<botHomePath>/MEMORY.md` and `recentWork`. | Identical per `botId`; personal memory always points to `Bots/<botId>/MEMORY.md`. |
| **2** | `Session role` | Generated by `sessionRolePrompt(role, { bot, group, leadBot, sessionBoardPath })`. | - `"dm"`: Direct assistant contract.<br/>- `"team-lead"`: Chief Orchestrator contract (`ORCHESTRATOR_WORKFLOW_PROTOCOL`, maintain `<sessionBoardPath>/TASK_MANIFEST.md`, delegate code/test work, audit `<worker_handoff>` proofs, max 3 repair rounds).<br/>- `"team-direct-specialist"`: Domain-bounded specialist contract; answer in-scope requests directly and escalate cross-domain tasks to `<leadId>` via `ask_bot`.<br/>- `"dispatched-worker"`: `WORKER_PROTOCOL_SUFFIX` enforcing scope discipline, mandatory verification command execution, and `<worker_handoff>` output. |
| **3** | `Team` | `group.instructions` + team shared memory `<teamRootPath>/MEMORY.md` (trimmed to 8,192 B budget, design target) + teammate roster (`id`, `name`, `title`, `description`, excluding `bot.id`). | Omitted in `"dm"`. Available `Workflows` catalog and `run_workflow` usage instructions are included **only** when `role === "team-lead"`. |
| **4** | `Session blackboard` | Declares `Session blackboard: <sessionBoardPath>`, `Task manifest: <sessionBoardPath>/TASK_MANIFEST.md`, and `Handoff directory: <sessionBoardPath>/handoffs/`. | Included in all teamwork and workflow sessions. Instructs agents to exchange multi-kilobyte reports/diffs by file path under `sessionBoardPath` rather than pasting raw blobs into chat turns. |
| **5** | `Target projects` | Lists `targetProjectDirs` and embeds project governance rules loaded by `loadTargetProjectRules(targetProjectDirs)` from `<dir>/AGENTS.md` (fallback `<dir>/CLAUDE.md`). | Reads up to `MAX_PROJECT_RULES_BYTES = 16384` (design target) per repository, wrapped in `<project_rules repo="<dir>">...</project_rules>`. If truncated, appends `Read "<dir>/AGENTS.md" for remaining sections.` Directs all source edits and git/test commands to `<dir>` while keeping scratch files in `<sessionBoardPath>`. |
| **6** | `Skills`, `Playbooks`, `Connected apps`, `Bot tools`, `Paseo tools` | Active skills (`<seatDir>/.agents/skills/<id>/SKILL.md`), trigger-matched playbooks, Composio apps, and MCP tool guides. | Scoped strictly to `effectiveBot`'s granted skills and tools (merged with stage overrides when `role === "dispatched-worker"`). |

---

## 6. Workflow Engine Synergy (`server/workflow-runner.ts`)

The seat + blackboard + six-block prompt architecture directly upgrades Route 3 (`run_workflow` / `runWorkflowDag`) in four concrete ways:

1. **Shared Workflow Blackboard Binding**:
   - `startWorkflowExecution` (`server/tools/workflows.ts`) resolves `teamSessionId` from the caller chat's `TEAM_SESSION_LABEL` (or `"wf-" + taskId` when triggered outside a team chat) and stores `teamSessionId` and `sessionBoardPath` on `WorkflowRunState` (`shared/workflows.ts`).
   - Every stage dispatched by `defaultStageDispatcher` passes `teamSessionId` and `isWorkflowStage: true` to `startChat`, binding all stages in the DAG to the same `<sessionBoardPath>`.
2. **File-Backed Stage Handoffs (Context Diet for Cheap Models)**:
   - When Stage `S` completes, `runWorkflowDag` writes the full raw turn reply to `<sessionBoardPath>/handoffs/<stage.id>-<botId>.md` and stores `handoffFilePath` on `TaskStageState`.
   - When constructing downstream Stage `T`'s `<task_brief>` in `buildStageBriefPrompt`, upstream context injects **only** the distilled `<worker_handoff>` fields (`STATUS`, `SUMMARY`, `TOUCHED_FILES`, `VERIFICATION_PROOF`) capped at `MAX_INLINE_UPSTREAM_CHARS = 2000` (design target), plus `Full upstream output saved at: <handoffFilePath>`. Downstream cheap models receive compact, high-signal instructions without context window rot, while retaining on-demand `read_file` access to the full artifact.
3. **Collision-Free Parallel Wave Execution**:
   - When a parallel wave dispatches `Stage B1 (bot-modeep)` and `Stage B2 (bot-mocode)` simultaneously via `Promise.allSettled`:
     - Different bots run in distinct seats (`Teams/<team>/agents/bot-modeep` vs `Teams/<team>/agents/bot-mocode`).
     - If two parallel stages use the **same** `botId` with different stage-level `skillIds` overrides, `ensureManagedSessionHome` allocates `stageSeatKey = "${stage.id}-${botId}"` under `<sessionBoardPath>/seats/`, preventing skill symlink races.
     - Each stage writes its own `<runsPath>/<chatId>.prompt.md` and `<runsPath>/<chatId>.mcp.json`.
4. **Automatic Target Repository & `AGENTS.md` Inheritance**:
   - Because Block 5 injects the team's `targetProjectDirs` and `<projectDir>/AGENTS.md` into every `"dispatched-worker"` session, workflow stage prompt templates no longer need hardcoded repository paths or repeated build/lint instructions.

---

## 7. Atomic Implementation Work Packages (For Worker Models)

Execute in topological order (`WP-1` -> `WP-2` & `WP-3` in parallel -> `WP-4` -> `WP-5` -> `WP-6`). Each work package touches at most 4 files and ends with a deterministic verification command.

### WP-1: Seat & Session Blackboard Path Topology
- **Depends On**: None
- **Allowed Write Scope**:
  - `paseo-bots/server/bot-home.ts`
  - `paseo-bots/shared/chat.ts`
  - `paseo-bots/tests/bot-home-seats.test.ts` (new)
- **Implementation Steps**:
  1. In `server/bot-home.ts`, implement `teamAgentSeatPath`, `teamSessionBoardPath`, `directSessionBoardPath`, and `ensureManagedSessionHome` creating `MEMORY.md` parent dirs, `sessions/<sessionId>/handoffs`, `sessions/<sessionId>/artifacts`, and `sessions/<sessionId>/runs`. Keep existing `ensureBotHome` working as a thin wrapper for legacy callers.
  2. In `shared/chat.ts`, add `TEAM_SESSION_LABEL`, `SESSION_ROLE_LABEL`, extend `BotPlacement` with `botHomePath`, `teamRootPath`, `sessionBoardPath`, and `targetProjectDirs: string[]`, and update `resolveBotPlacement` so `placement.path` always equals `home.path` while `group.cwd`, `bot.cwd`, and `mounts` populate `targetProjectDirs`.
  3. Update any existing placement assertions in `tests/chat-placement.test.ts` only if required by the intentional `resolveBotPlacement` contract change, or gate via `ManagedHomePaths` presence; write `tests/bot-home-seats.test.ts` covering DM paths, Team seat paths, stage override seats, and `targetProjectDirs` deduplication.
- **Verification Command**:
  `npm --prefix paseo-bots run typecheck && npx --prefix paseo-bots vitest run tests/bot-home-seats.test.ts tests/chat-placement.test.ts`

### WP-2: Managed-Directory Guard & In-Seat Skill/MCP Materialization
- **Depends On**: `WP-1`
- **Allowed Write Scope**:
  - `paseo-bots/server/library.ts`
  - `paseo-bots/server/claude-agents.ts`
  - `paseo-bots/tests/seat-isolation.test.ts` (new)
- **Implementation Steps**:
  1. Export `assertInsideManagedDataDir(targetPath: string, allowedRootOverride?: string)` in `server/library.ts` (or `server/claude-agents.ts`), verifying `resolve(targetPath)` starts with `resolve(pluginDataPath())` (or `allowedRootOverride` in unit tests) in addition to `assertNotGlobalUserConfig`.
  2. In `server/library.ts`, add `syncSeatSkills(seatDir: string, skillIds: readonly string[])` symlinking reviewed skills into both `<seatDir>/.agents/skills/<id>` and `<seatDir>/.claude/skills/<id>` and pruning stale symlinks within those two subdirectories only.
  3. In `server/claude-agents.ts`, add `writeSessionRunArtifacts({ runsDir, agentId, systemPrompt, mcpServers })` writing `<runsDir>/<agentId>.prompt.md` and `<runsDir>/<agentId>.mcp.json`. Ensure `syncBotToClaudeAgent` never writes `.mcp.json` or `.claude/skills/` to an external `targetProjectDir`.
  4. Create `tests/seat-isolation.test.ts` verifying concurrent `syncSeatSkills` for two bots in the same team do not prune each other's symlinks, and `assertInsideManagedDataDir` rejects external repository paths.
- **Verification Command**:
  `npm --prefix paseo-bots run typecheck && npx --prefix paseo-bots vitest run tests/seat-isolation.test.ts tests/claude-agents.test.ts`

### WP-3: Main-Session Dynamic Prompt Channel & Workspace Roots (AGY + Claude)
- **Depends On**: `WP-1`
- **Allowed Write Scope**:
  - `paseo-bots/shared/bot.ts`
  - `paseo-agy-acp/server/session.ts`
  - `paseo-bots/tests/session-prompt-channel.test.ts` (new)
  - `paseo-agy-acp/tests/provider.test.ts`
- **Implementation Steps**:
  1. In `paseo-bots/shared/bot.ts`, add optional `options?: { useStaticAgyAgent?: boolean; additionalDirectories?: string[]; promptFilePath?: string }` to `buildAgentConfig` (preserving positional compatibility). Default `useStaticAgyAgent` to `false` so `systemPrompt` is always populated on `BotAgentConfig` and `providerOptions.agent` is omitted for main/peer/stage sessions. Attach `additionalDirectories` (when non-empty) and `promptFilePath` (when provided) to `providerOptions`.
  2. In `paseo-agy-acp/server/session.ts`, verify that when `providerOptions.agent` is absent, `effectiveLaunch` omits `--agent`, `sessionParams` passes `_meta.antigravity.systemPrompt.{append|replace}`, and `providerOptions.additionalDirectories` (string array) is forwarded under `_meta.antigravity.workspaceRoots`.
  3. Add unit tests in `paseo-bots/tests/session-prompt-channel.test.ts` and `paseo-agy-acp/tests/provider.test.ts` asserting AGY main sessions carry `systemPrompt` + `workspaceRoots` without `--agent`.
- **Verification Command**:
  `npm --prefix paseo-bots run typecheck && npx --prefix paseo-bots vitest run tests/session-prompt-channel.test.ts tests/bot.test.ts && npm --prefix paseo-agy-acp test`

### WP-4: Six-Block Role-Aware Prompt Assembler & Target `AGENTS.md` Loader
- **Depends On**: `WP-2`, `WP-3`
- **Allowed Write Scope**:
  - `paseo-bots/shared/groups.ts`
  - `paseo-bots/shared/bot.ts`
  - `paseo-bots/server/prompt.ts`
  - `paseo-bots/tests/teamwork-prompt-assembly.test.ts` (new)
- **Implementation Steps**:
  1. In `shared/groups.ts`, implement `SessionRoleKind`, `resolveSessionRole`, and `sessionRolePrompt`; update `teamPrompt` / `teamsPrompt` to accept `role: SessionRoleKind` and `teamMemory?: { path: string; content: string }`, omitting the `Workflows` catalog when `role !== "team-lead"`.
  2. In `shared/bot.ts`, extend `PromptContext` with `sessionRole?: SessionRoleKind`, `sessionRoleText?: string | null`, `sessionBoardPath?: string | null`, `teamMemory?: { path: string; content: string } | null`, and `targetProjects?: { path: string; rulesFile?: string; rulesExcerpt?: string; truncated?: boolean }[]`. Update `promptSections` to emit Blocks 1–6 in exact §5.2 order.
  3. In `server/prompt.ts`, implement `loadTargetProjectRules(dirs: readonly string[], maxBytes = 16384)` reading `<dir>/AGENTS.md` (fallback `<dir>/CLAUDE.md`), load `<teamRootPath>/MEMORY.md` when in teamwork mode, invoke `syncSeatSkills(seatDir, skillIds)` when `seatDir` is provided, and invoke `writeSessionRunArtifacts` when `runsDir` and `agentId` are provided.
  4. Write `tests/teamwork-prompt-assembly.test.ts` testing all four `SessionRoleKind` branches (`"dm"`, `"team-lead"`, `"team-direct-specialist"`, `"dispatched-worker"`), workflow catalog gating, and `AGENTS.md` loading + truncation at `16384` bytes.
- **Verification Command**:
  `npm --prefix paseo-bots run typecheck && npx --prefix paseo-bots vitest run tests/teamwork-prompt-assembly.test.ts`

### WP-5: Chat & Workflow Blackboard Wiring + File-Backed Stage Handoffs
- **Depends On**: `WP-4`
- **Allowed Write Scope**:
  - `paseo-bots/server/chats.ts`
  - `paseo-bots/shared/workflows.ts`
  - `paseo-bots/server/workflow-runner.ts`
  - `paseo-bots/tests/workflow-blackboard.test.ts` (new)
- **Implementation Steps**:
  1. In `server/chats.ts` (`startChat`), accept optional `teamSessionId?: string`, `isWorkflowStage?: boolean`, and `stageSeatKey?: string`. Resolve `teamSessionId` from `input.teamSessionId ?? input.labels[TEAM_SESSION_LABEL] ?? agentId`. Call `ensureManagedSessionHome`, compute `resolveSessionRole`, pass `seatDir`, `runsDir`, `sessionBoardPath`, and `targetProjectDirs` into `systemPrompt` and `startBotChat`, and stamp `TEAM_SESSION_LABEL` + `SESSION_ROLE_LABEL` on `labels`. Also update `server/tools/ask-bot.ts` (if needed, max +5 lines) to forward caller's `TEAM_SESSION_LABEL`.
  2. In `shared/workflows.ts`, add optional `teamSessionId?: string`, `sessionBoardPath?: string` to `WorkflowRunStateSchema` and `handoffFilePath?: string` to `TaskStageStateSchema`. Update `buildStageBriefPrompt` so upstream context truncates inline text at `MAX_INLINE_UPSTREAM_CHARS = 2000` and cites `handoffFilePath` when present.
  3. In `server/workflow-runner.ts`, compute `stageSeatKey` when `stage.skillIds` is non-empty, pass `teamSessionId` and `isWorkflowStage: true` to `startChat`, and write each completed stage's raw reply to `<sessionBoardPath>/handoffs/<stage.id>-<botId>.md` before advancing the wave.
  4. Write `tests/workflow-blackboard.test.ts` verifying shared `sessionBoardPath` across multi-stage DAG waves, `<sessionBoardPath>/handoffs/*.md` persistence, inline upstream truncation with file pointer, and stage-override seat isolation.
- **Verification Command**:
  `npm --prefix paseo-bots run typecheck && npx --prefix paseo-bots vitest run tests/workflow-blackboard.test.ts tests/workflow-runner.test.ts tests/workflow-tool.test.ts`

### WP-6: Full Suite Regression Audit & Documentation Status Promotion
- **Depends On**: `WP-5`
- **Allowed Write Scope**:
  - `docs/paseo/paseo-bots-teamwork-workspace-and-session-architecture.md`
  - `docs/paseo/paseo-bots-configuration-and-storage.md`
  - `docs/paseo/paseo-bots-workflow-engine-and-routing.md`
  - `docs/README.md`
- **Implementation Steps**:
  1. Run full typecheck and test suites across `paseo-bots` and `paseo-agy-acp`.
  2. Promote this document's front matter `status` from `TARGET` to `CURRENT`, update every row in §8 Conformance Table to `CURRENT`, synchronize storage/routing cross-references in sibling `docs/paseo/` specs, and update line counts and status in `docs/README.md`.
  3. Run documentation lint commands from `docs/standards/documentation-standards.md`.
- **Verification Command**:
  `npm --prefix paseo-bots run typecheck && npm --prefix paseo-bots test && npm --prefix paseo-agy-acp test`

---

## 8. Conformance Table (D8)

| Component / Symbol | File Path | Status | Verification Command |
| :--- | :--- | :--- | :--- |
| `botsHomePath`, `teamsHomePath`, `teamHomePath`, `botDataPath` | `paseo-bots/server/bot-home.ts` | `CURRENT` | `npm --prefix paseo-bots run typecheck` |
| `teamAgentSeatPath`, `teamSessionBoardPath`, `ensureManagedSessionHome` | `paseo-bots/server/bot-home.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/bot-home-seats.test.ts` |
| `BotPlacement.targetProjectDirs`, seat-preserving `resolveBotPlacement` | `paseo-bots/shared/chat.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/bot-home-seats.test.ts` |
| `assertNotGlobalUserConfig` | `paseo-bots/server/claude-agents.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/claude-agents.test.ts` |
| `assertInsideManagedDataDir`, `syncSeatSkills`, `writeSessionRunArtifacts` | `paseo-bots/server/library.ts`, `paseo-bots/server/claude-agents.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/seat-isolation.test.ts` |
| `systemPromptMode` (`append` \| `replace`), `resolveClaudeSystemPromptFlag` | `paseo-bots/shared/bot.ts`, `paseo-agy-acp/server/session.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/bot.test.ts && npm --prefix paseo-agy-acp test` |
| Main-session dynamic prompt (`useStaticAgyAgent = false`) & `workspaceRoots` | `paseo-bots/shared/bot.ts`, `paseo-agy-acp/server/session.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/session-prompt-channel.test.ts` |
| `resolveSessionRole`, 6-block `promptSections`, `loadTargetProjectRules` | `paseo-bots/shared/groups.ts`, `paseo-bots/shared/bot.ts`, `paseo-bots/server/prompt.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/teamwork-prompt-assembly.test.ts` |
| `runWorkflowDag`, `buildStageBriefPrompt`, `parseWorkerHandoff` | `paseo-bots/server/workflow-runner.ts`, `paseo-bots/shared/workflows.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/workflow-runner.test.ts` |
| File-backed stage handoffs (`handoffs/<stageId>-<botId>.md`) & shared `sessionBoardPath` | `paseo-bots/server/workflow-runner.ts`, `paseo-bots/shared/workflows.ts` | `CURRENT` | `npx --prefix paseo-bots vitest run tests/workflow-blackboard.test.ts` |
