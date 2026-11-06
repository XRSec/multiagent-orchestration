# DISPATCH RECEIPT: M4-FOUR-DIMENSIONS-WEB-INTEGRATION

- **Receipt ID**: `RCPT-20261105-M4-4DIM-INTEGRATION-03`
- **Timestamp**: `2026-11-05T14:00:00.000Z`
- **Dispatcher**: `moAdmin` (`bot_moadmin_director_03`, Taskforce Director & Orchestration Lead)
- **Assignee**: `moCode` (`bot_mocode_engine_01`, Core Full-Stack Engineer)
- **Workstream**: `M4: Web UI Full-Stack Integration (Workspaces, Skills, Bots, Groups)`
- **Status**: `DISPATCHED_PENDING_ACK`

---

## 1. Architectural Baseline & Existing Data Source Audit

### 1.1 Dimension 1: Workspaces & Directory Tree (目录 / 工作区)
- **Disk Path**: Project root `<projectRoot>` (`multiagent-orchestration`) and parent workspace `<workspaceRoot>/`.
- **Current State**: Frontend page `WorkdirBrowsePage.tsx` relies completely on static `MOCK_FILE_TREE` (`src/web/src/mock/files.ts`). Backend endpoint `/api/workspaces/folders` attempts to import non-existent `packages/agent-control-plane/...` resulting in runtime failures.
- **Requirement**: Provide real filesystem scanning, workspace folder listing, file tree generation (ignoring `node_modules`, `.git`, `dist`, etc.), file content retrieval, and workspace statistics.

### 1.2 Dimension 2: Skills Registry (技能资产库)
- **Disk Path**:
  1. Runtime / Global Skills: `~/.multiagent-orchestration/skills/` & `~/.agents/skills/`.
  2. Workspace Skills: `Customizations/skills/` (`agent-first-docs`, `script-standards`, `skill-creator-helper`).
- **Current State**: Frontend `SkillhubLocalPage.tsx` relies on `MOCK_SKILLS` (`src/web/src/mock/skills.ts`) and hardcodes obsolete folder paths. Backend `/api/folders/skills` relies on missing `packages/agent-control-plane`.
- **Requirement**: Provide native recursive scanner reading `SKILL.md` (YAML frontmatter + markdown body), cataloging skills with scope (`global` vs `workspace`), title, description, tools, and content.

### 1.3 Dimension 3: Bots & Partner Roster (智能体)
- **Disk Path**: `Customizations/agents/` (mirrored in `Bots/` and `~/.multiagent-orchestration/agents/`).
- **Registered Entities (7 Mo-Bots)**:
  1. `bot_moadmin_director_03` (`moAdmin`) - 任务编排与治理主管 (👑 violet)
  2. `bot_mocode_engine_01` (`moCode`) - 核心全栈与系统工程师 (⚡ blue)
  3. `bot_modoc_scribe_02` (`moDoc`) - 架构文胆与文档专员 (📝 emerald)
  4. `bot_moci_sentinel_07` (`MoCI`) - 持续集成与测试哨兵 (🛡️ cyan)
  5. `bot_mogit_scm_05` (`MoGit`) - 版本控制与代码审计 (🌿 amber)
  6. `bot_modeep_scout_04` (`MoDeep`) - 深度调研与技术情报 (🔍 rose)
  7. `bot_mo_meta_06` (`Mo`) - 元工具与伙伴锻造师 (🛠️ orange)
- **Current State**: Backend `GET /api/partners` in `src/web/server/vite-room-api-plugin.ts` returns legacy Cindy mock definitions (`lead-orchestrator`, `cindy-r`, etc.). Frontend `BotRosterPage.tsx` and `BotsHomePage.tsx` consume `MOCK_BOTS` (Ada, Devon).
- **Requirement**: Overhaul `GET /api/partners` and introduce `GET /api/bots` to dynamically parse `profile.json`, `capabilities.json`, `workbench.json`, and `SOUL.md` from `Customizations/agents/`. Bind UI directly to the authentic 7 Mo-Bots.

### 1.4 Dimension 4: Group Rooms (群聊房间)
- **Disk Path**: `Customizations/group/multiagent-orchestration/` and `groups/multiagent-orchestration/`.
- **Current State**: `room.json`, `GROUP_CHARTER.md`, `GROUP_MEMORY.md`, and message logs exist. `GET /api/rooms` and `GET /api/rooms/:slug` are implemented, but room member roster is partially desynchronized from the 7 Mo-Bots, and `BotsHomePage.tsx` hardcodes links to `/bots/groups/group-m1`.
- **Requirement**: Standardize room metadata to represent `multiagent-orchestration` room with all 7 Mo-Bots, provide full charter and memory inspection, and connect group chat list dynamically.

---

## 2. Backend REST Endpoint Specifications (`src/web/server/vite-room-api-plugin.ts`)

| HTTP Method | Route | Description | Query / Body Schema | Response Schema |
|---|---|---|---|---|
| `GET` | `/api/workspaces` | Get workspace list and current working directory stats | `?dir=<path>` (optional) | `{ ok: true, currentDir: string, workspaces: Array<{ id, name, path, isCurrent }>, stats: { totalFiles, totalDirs, gitBranch } }` |
| `GET` | `/api/workspaces/tree` | Get filesystem tree structure | `?dir=<path>&depth=<number>` | `{ ok: true, tree: FileNode[] }` |
| `GET` | `/api/workspaces/file` | Read file content for code viewer | `?path=<filePath>` | `{ ok: true, name, path, size, extension, content }` |
| `GET` | `/api/skills` | List all scanned skills across global & workspace scopes | `?scope=all\|global\|workspace` | `{ ok: true, skills: Array<{ id, name, title, description, scope, path, content }> }` |
| `GET` | `/api/skills/:id` | Get individual skill detail | - | `{ ok: true, skill: { id, name, title, description, scope, path, content, frontmatter } }` |
| `GET` | `/api/bots` | List all 7 registered Mo-Bots with profiles & capabilities | - | `{ ok: true, bots: Array<{ id, name, display_name, description, avatar, avatar_color, role, status, capabilities, workbench, soulSummary }> }` |
| `GET` | `/api/bots/:id` | Get individual bot detailed config | - | `{ ok: true, bot: BotDetail }` |
| `GET` | `/api/partners` | Unified partner list for composer / mentions | - | Synchronized with 7 Mo-Bots (`bot_moadmin_director_03`, etc.) |
| `GET` | `/api/rooms` | List active group chat rooms | - | `{ ok: true, rooms: GroupRecord[] }` |
| `GET` | `/api/rooms/:slug` | Room details + Charter + Blackboard Memory | - | `{ ok: true, room, charter, memory }` |

---

## 3. Frontend Views & Routing Plan (`src/web/src/`)

### 3.1 Workspaces & Directory Dimension
- **Target Page**: `src/web/src/pages/cc-agent/WorkdirBrowsePage.tsx`
- **Actions**:
  1. Replace `MOCK_FILE_TREE` with live hook/fetch from `/api/workspaces/tree` and `/api/workspaces`.
  2. Implement dynamic file loading via `/api/workspaces/file?path=...` when clicking a file node.
  3. Display directory summary statistics header (total files, current directory path, git branch).

### 3.2 Skills Dimension
- **Target Page**: `src/web/src/pages/skillhub/SkillhubLocalPage.tsx`
- **Actions**:
  1. Replace `MOCK_SKILLS` with live fetch from `/api/skills`.
  2. Update scope selector to switch between Global (`~/.multiagent-orchestration/skills`) and Workspace (`Customizations/skills`).
  3. Render real skill cards with frontmatter title, descriptions, and viewable markdown drawer/modal.
  4. Purge legacy hardcoded host paths.

### 3.3 Bots Dimension
- **Target Pages**: `web/src/pages/bots/BotsHomePage.tsx`, `web/src/pages/bots/BotRosterPage.tsx`
- **Actions**:
  1. Replace `MOCK_BOTS` with live data fetched from `/api/bots` (the 7 Mo-Bots).
  2. Render exact emojis/avatars, role badges, model chains, and status (online/active).
  3. In `BotsHomePage.tsx`, link group entry to the real `/bots/groups/multiagent-orchestration` room.

### 3.4 Groups Dimension
- **Target Pages**: `web/src/pages/bots/BotGroupChatPage.tsx`, `web/src/layouts/Sidebar.tsx`
- **Actions**:
  1. Sidebar dynamically displays rooms returned from `/api/rooms`.
  2. `BotGroupChatPage.tsx` loads real room charter (`GROUP_CHARTER.md`) and shared blackboard (`GROUP_MEMORY.md`) into a collapsible inspection drawer.
  3. Mention autocomplete (`MentionAutocompleteMenu.tsx`) maps to the 7 Mo-Bots with `@moAdmin`, `@moCode`, `@moDoc`, etc.

---

## 4. Work Order Dispatch & Acceptance Criteria

### Assigned to: `bot_mocode_engine_01` (`moCode`)
1. **Backend Implementation**:
   - Refactor `web/server/vite-room-api-plugin.ts` to implement `/api/workspaces*`, `/api/skills*`, `/api/bots*`, and update `/api/partners` to load from `Customizations/agents/`.
   - Remove dead imports pointing to non-existent `packages/agent-control-plane`.
2. **Frontend Wiring**:
   - Update `WorkdirBrowsePage.tsx`, `SkillhubLocalPage.tsx`, `BotsHomePage.tsx`, `BotRosterPage.tsx`, and `Sidebar.tsx`.
   - Guarantee zero legacy Cindy branding or broken paths.
3. **Quality Gate**:
   - `pnpm --filter web build` must complete with 0 errors.
   - Clean startup verified with `pnpm dev` or `pnpm --filter web dev`.
