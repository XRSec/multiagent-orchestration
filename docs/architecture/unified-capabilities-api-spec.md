---
doc_id: ARCH-UNIFIED-CAPABILITIES-API-SPEC
status: CURRENT
version: 1.0.0
last_verified: 2026-11-11
language: en-US
---

# Unified Multi-Scope Capabilities API & Cross-Page State Convergence Specification

## 1. Overview & Architectural Goals
Prior to TASK-105, capability state management was fragmented across disparate endpoints:
1. Skills were managed independently via `/api/skills` (`skills-controller.ts`).
2. Companion tool configurations and permissions were queried and persisted via `/api/bots/:id` and `/api/partners` (`bots-controller.ts`).
3. Customizations views (`SkillhubLocalPage.tsx`) and entity configuration panels (`BotCapabilityMatrix.tsx`) executed uncoordinated REST calls with divergent payload formats, causing state desynchronization and redundant network requests.

TASK-105 establishes a unified multi-scope capability architecture:
- **Single Endpoint Contract**: Exposes `/api/capabilities?scope=...&targetId=...` for querying and updating skills, tools, rules, and governance metadata across five hierarchical scopes.
- **Isomorphic Data Contract**: Normalizes capability state into `UnifiedCapabilityPayload`, unifying tri-tier skills (`preloadedSkills`, `onDemandSkills`, `disallowedSkills`), tools, and prompt rules.
- **Unified Client Hook**: Implements `useCapabilities` in `src/web/src/hooks/useCapabilities.ts`, providing optimistic UI updates, error rollback, and synchronized rehydration across pages.

---

## 2. Multi-Scope Taxonomy & Resolution Hierarchy

The capability engine defines five explicit scopes (`CapabilityScope`):

```text
┌────────────────────────────────────────────────────────────────────────┐
│                      Capability Resolution Scope Tree                  │
├────────────────────────────────────────────────────────────────────────┤
│ 1. GLOBAL   : System-wide default skills, baseline tools, global rules │
│      │                                                                 │
│      ├── 2. PROJECT : Project-level skill configs and custom overrides │
│      │       │                                                         │
│      │       └── 3. GROUP   : Room/team-level collaborative toolset    │
│      │               │                                                 │
│      │               └── 4. BOT     : Agent micro-kernel capabilities  │
│      │                       │                                         │
│      │                       └── 5. SESSION : Ephemeral runtime traits │
└────────────────────────────────────────────────────────────────────────┘
```

### Scope Definitions

| Scope | `targetId` Requirement | Data Sources & Storage Target | Description |
|---|---|---|---|
| `global` | None (`undefined`) | `skills-config.json`, `GLOBAL_SKILLS_DIR` | System baseline across all agents and rooms. Disabling a skill in `global` sets its state in `skills-config.json`. |
| `group` | Room Slug or ID | `groups/<slug>/room.json` (Forward compatibility stub) | Group-level collaborative boundaries and shared tools. |
| `bot` | Bot ID or Name | `Customizations/agents/<name>.md`, SQLite `bots` table, `skills-config.json` | Companion persona capabilities, including tri-tier skills, native tools, and MCP authorizations. |
| `project` | Project Path or ID | `<projectRoot>/settings.json` (Forward compatibility stub) | Workspace-level skill directories and project directives. |
| `session` | Session UUID | SQLite `sessions` table (Forward compatibility stub) | Ephemeral mid-flight tool or skill toggles scoped to an active run. |

---

## 3. Unified Data Contract (`UnifiedCapabilityPayload`)

Located in `src/web/server/controllers/capabilities-controller.ts` and mirrored in `src/web/src/hooks/useCapabilities.ts`:

### 3.1 Type Definitions
```typescript
export type CapabilityScope = 'global' | 'group' | 'bot' | 'project' | 'session';

export interface SkillEntry {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  path?: string;
  tier?: 'preloaded' | 'onDemand' | 'disabled';
}

export interface UnifiedCapabilityPayload {
  scope: CapabilityScope;
  targetId?: string;
  // Three-tier skills
  preloadedSkills: SkillEntry[];
  onDemandSkills: SkillEntry[];
  disallowedSkills: string[];
  // Tools
  tools: string[];
  disallowedTools: string[];
  // Rules & prompt snippets
  systemRules: string[];
  customRules: string[];
  promptSnippets: string[];
  // Governance & Permissions
  permissionLevel?: string;
  allowedWritePaths?: string[];
  disallowedWritePaths?: string[];
  // Model & Execution Metadata
  model?: string;
  effort?: string;
}
```

### 3.2 Tri-Tier Skill Serialization Rules
When building payloads for `scope=bot`:
1. `preloadedSkills`: Skills present in the agent definition `skills` array. Loaded as active plugins in runtime execution.
2. `onDemandSkills`: Skills present in `onDemandSkills`. Exposed as discoverable metadata in prompt indices.
3. `disallowedSkills`: Skills listed in `disallowedSkills` or globally disabled in `skills-config.json`.
4. All entries retain unified `{ id, name, description, enabled, path }` fields.

---

## 4. HTTP API Endpoint Specification

Mounted via Vite Connect middleware in `src/web/server/vite-room-api-plugin.ts` (`handleCapabilitiesRoute`):

### 4.1 Query Capabilities: `GET /api/capabilities`

- **Query Parameters**:
  - `scope` (optional): One of `global`, `group`, `bot`, `project`, `session` (defaults to `global`).
  - `targetId` (optional): Required when `scope=bot` (e.g. `bot_mocode_engine_01` or `moCode`).
- **Success Response (`200 OK`)**:
  ```json
  {
    "ok": true,
    "capabilities": {
      "scope": "bot",
      "targetId": "bot_mocode_engine_01",
      "preloadedSkills": [
        {
          "id": "agent-first-docs",
          "name": "agent-first-docs",
          "description": "Universal standards for LLM-consumed artifacts",
          "enabled": true
        }
      ],
      "onDemandSkills": [],
      "disallowedSkills": [],
      "tools": ["Read", "Write", "Edit", "Bash", "Glob", "Grep", "mcp__agent_profile__*"],
      "disallowedTools": [],
      "systemRules": [],
      "customRules": [],
      "promptSnippets": [],
      "permissionLevel": "full",
      "allowedWritePaths": ["src/", "test/"],
      "disallowedWritePaths": ["Customizations/", ".env"],
      "model": "claude-sonnet-4-6",
      "effort": "high"
    }
  }
  ```
- **Error Response (`404 Not Found` / `500 Server Error`)**:
  ```json
  {
    "ok": false,
    "error": "Bot nonexistent_bot not found"
  }
  ```

### 4.2 Mutate Capabilities: `PUT /api/capabilities`

- **Query Parameters**:
  - `scope` (optional): Target scope (defaults to `global`).
  - `targetId` (required if `scope=bot`): Bot identifier.
- **Request Body**: `Partial<UnifiedCapabilityPayload>`
- **Persistence Handling by Scope**:
  - `scope=global`: Updates `disabledSkills` and `targetDisabledMap['global']` in `skills-config.json`.
  - `scope=bot`:
    1. Parses existing markdown definition from `Customizations/agents/<name>.md`.
    2. Merges updated tools, skills, rules, permissions, and metadata.
    3. Invariant check: Forcefully preserves `mcp__agent_profile__*` in `tools`.
    4. Serializes definition back to disk via `serializeAgentMarkdown`.
    5. Synchronizes SQLite database row in table `bots` (`markdown_definition`, `capabilities_json`, `user_prompt_config`, `updated_at`).
    6. Writes companion skill blacklist to `skills-config.json` under `targetDisabledMap['bot:<id>']`.
  - `scope=group | project | session`: Acknowledged as stubs for forward-compatible orchestration.
- **Success Response (`200 OK`)**:
  ```json
  {
    "ok": true,
    "capabilities": { ...updatedPayload }
  }
  ```

---

## 5. Bidirectional State Flow Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Frontend UI Consumers                           │
│  - Customizations: SkillhubLocalPage.tsx                               │
│  - Partner Settings: BotCapabilityMatrix.tsx                           │
│  - Entity Panels: BotRosterPage.tsx, BotSessionPage.tsx                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ consumes hook
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│          Unified Client Hook: useCapabilities({ scope, targetId })     │
│   - State: capabilities, loading, error                                │
│   - Methods: updateCapabilities(), setSkillTier(), toggleTool()        │
│   - Resilience: Optimistic update with automatic error rollback        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP GET / PUT /api/capabilities
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│       Vite Connect Route Dispatcher: vite-room-api-plugin.ts           │
│   - Priority 2.5: handleCapabilitiesRoute(pathname, method, ...)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ delegates
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│       Backend Multi-Scope Controller: capabilities-controller.ts       │
│                                                                        │
│   ├── buildGlobalPayload() / handlePutGlobal()                         │
│   └── buildBotPayload()    / handlePutBot()                            │
└──────────────────┬───────────────────────────────┬─────────────────────┘
                   │                               │
                   ▼                               ▼
┌──────────────────────────────────────┐ ┌───────────────────────────────┐
│ Filesystem Persistence Plane         │ │ SQLite Storage Plane          │
│ - Customizations/agents/<name>.md    │ │ - Table: bots                 │
│ - Customizations/skills-config.json  │ │   - markdown_definition       │
│ - GLOBAL_SKILLS_DIR, USER_SKILLS_DIR │ │   - capabilities_json         │
└──────────────────────────────────────┘ │   - user_prompt_config        │
                                         └───────────────────────────────┘
```

---

## 6. Frontend Client Hook Implementation (`useCapabilities.ts`)

The client hook encapsulates HTTP communication, cancellation, and optimistic mutations:

### 6.1 Core API Signature
```typescript
export interface UseCapabilitiesOptions {
  scope: CapabilityScope;
  targetId?: string;
  skip?: boolean;
}

export interface UseCapabilitiesReturn {
  capabilities: UnifiedCapabilities | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateCapabilities: (payload: Partial<UnifiedCapabilities>) => Promise<boolean>;
  setSkillTier: (skillId: string, tier: 'preloaded' | 'onDemand' | 'disabled') => Promise<boolean>;
  toggleTool: (toolId: string, enabled: boolean) => Promise<boolean>;
}
```

### 6.2 Optimistic Mutation & Rollback Guarantees
Operations such as `setSkillTier` and `toggleTool` immediately update React local state to ensure snappy UI responsiveness. If the underlying `PUT /api/capabilities` request fails due to network dropouts or backend validation errors, the previous state is restored automatically:

```typescript
const prev = capabilities;
// 1. Optimistic local state update
setCaps(nextState);

// 2. Network synchronization
const ok = await updateCapabilities(mutationPayload);
if (!ok && mountedRef.current) {
  // 3. Rollback on failure
  setCaps(prev);
}
return ok;
```

---

## 7. Verification & Conformance Matrix (TASK-105)

| Requirement Code | Description | Implementation File | Verification Method | Status |
|---|---|---|---|---|
| **AC-105-1** | Unified multi-scope `/api/capabilities` route with `scope` and `targetId` query params | `capabilities-controller.ts`, `vite-room-api-plugin.ts` | Endpoint query verification across `global`, `bot`, and stub scopes | **VERIFIED** |
| **AC-105-2** | Isomorphic `UnifiedCapabilityPayload` data contract | `capabilities-controller.ts`, `useCapabilities.ts` | Schema validation for tri-tier skills, tools, rules, and governance metadata | **VERIFIED** |
| **AC-105-3** | Multi-plane persistence synchronization (Markdown, SQLite, `skills-config.json`) | `capabilities-controller.ts` | Verified persistence writes to disk definition, SQLite table `bots`, and targetDisabledMap | **VERIFIED** |
| **AC-105-4** | Reusable client hook `useCapabilities` with optimistic update and rollback | `useCapabilities.ts` | Method execution inspection for `setSkillTier`, `toggleTool`, and `refetch` | **VERIFIED** |
| **AC-105-5** | Zero TypeScript compilation and build regression | `src/web` | `cd src/web && npx tsc --noEmit` exits with code 0 | **VERIFIED** |

---

## 8. Cache Invalidation & External Synchronization Resilience (TASK-118-REMED)

### 8.1 Zero-Cache Response Headers
To resolve stale customization states when database files are synchronized across devices or updated out-of-band:
- `sendJson` in `src/web/server/common.ts` injects explicit anti-cache HTTP headers across all JSON responses:
  - `Cache-Control: no-cache, no-store, must-revalidate, max-age=0`
  - `Pragma: no-cache`
  - `Expires: 0`
- Disables HTTP 304 caching and downstream browser memory/disk caches on capabilities, bots, and skills endpoints.

### 8.2 Client-Side Cache Busting Policy (`useCapabilities.ts`)
- All fetch operations within `fetchCapabilities()` and `useCapabilities()` specify `{ cache: 'no-store' }`.
- Guarantees each hook invocation queries fresh capability state directly from the backend server without relying on client browser heuristics.

### 8.3 SQLite Connection Hot-Reload via `mtimeMs` Detection (`common.ts`)
- In `src/web/server/common.ts`, `getDb()` caches the resolved database path and its modification timestamp (`mtimeMs`).
- On every database access, `getDb()` verifies if `fs.statSync(chosenPath).mtimeMs` matches `lastDbMtime`.
- If an external synchronization tool (e.g. OneDrive, Syncthing, Dropbox) replaces the SQLite database file, `getDb()` automatically closes the stale handle and reconnects to the newly synced database file.

### 8.4 Manual Refresh Capability (`SkillhubLocalPage.tsx`)
- The customizations header features a manual refresh trigger (`data-testid="btn-refresh-customizations"`).
- Clicking the button activates a spinning `RefreshCw` animation and concurrently executes:
  1. `refetchCaps()` to reload capabilities for the selected entity.
  2. `loadSkills()` to discover newly installed skills.
  3. `fetch('/api/bots', { cache: 'no-store' })` to refresh bot definitions and system prompts.

### 8.5 Verification Matrix (TASK-118-REMED)

| Requirement | Implementation Component / Symbol | Verification Command | Status |
|---|---|---|---|
| Anti-Cache Headers | `src/web/server/common.ts: sendJson` | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 2.1) | **VERIFIED** |
| SQLite mtime Invalidation | `src/web/server/common.ts: getDb, resetDbHandle` | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 2.2) | **VERIFIED** |
| Frontend `cache: 'no-store'` | `src/web/src/hooks/useCapabilities.ts: fetchCapabilities` | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.5) | **VERIFIED** |
| Manual Refresh Button | `src/web/src/pages/skillhub/SkillhubLocalPage.tsx: handleManualRefresh` | `npx tsx test/task-windows-path-and-folder-cache.test.ts` (Test 4.5) | **VERIFIED** |

