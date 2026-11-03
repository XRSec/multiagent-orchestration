---
doc_id: MULTIAGENT_ORCHESTRATION_MEMORY_ROOT
version: 2.1.0
description: Core repository architectural invariants, topologies, and execution contracts.
type: REPO_MEMORY_AST
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: MULTIAGENT-ORCHESTRATION ARCHITECTURAL MEMORY

* **[1] REPOSITORY TAXONOMY & BOUNDARIES**
  * **[1.1] Orchestration Scope**: Covers group chat timelines, multi-agent topologies, headless CLI process pools, stream parsing, and in-process orchestration MCP servers.
  * **[1.2] CindyR Submodule Relation**: `CindyR/` operates as a downstream lightweight desktop client (Electron) dieted strictly to the Claude Code single-runtime.
  * **[1.3] Symlink Prohibition**: Root files (`AGENTS.md`, `CLAUDE.md`, `UPDATE.md`, `MEMORY.md`, `/docs/`) MUST NOT be symlinked to `CindyR/`.

* **[2] TOPOLOGY & PROTOCOL CONTRACTS (`docs/protocols/`)**
  * **[2.1] Group Chat Timeline**:
    * **[2.1.1]** Messages persisted sequentially with strictly monotonic sequence integers.
    * **[2.1.2]** Storage MUST reside exclusively in user directory `~/.multiagent-orchestration/groups/<room_slug>/` (`0` code repository pollution).
    * **[2.1.3]** Direct `@partner` mentions trigger target headless agent runtimes.
  * **[2.2] Machine Action Protocol (MAP)**: Headless subagents MUST encapsulate typed JSON actions within `<!-- CINDY_MAP:BEGIN -->...<!-- CINDY_MAP:END -->` (`0` unstructured text actions).
  * **[2.3] P2P Isolated Query**: Inter-agent hypothesis validation uses ephemeral `p2p_*` namespaces; maximum recursion depth: `CallDepth <= 3`.
  * **[2.4] Pipeline Relay**: Sequential state machine (`researcher -> coder -> reviewer`); upstream agent suspends upon handoff.
  * **[2.5] Concurrent Dispatch**: Tasks split into parallel executions; subagent processes join at barrier synchronizers.
  * **[2.6] Dual-Channel Steering**:
    * **[2.6.1] Soft Steering**: Injects `additionalContext` or blocks tool execution via `PreToolUse` hook mailbox; preserves `300s` prompt cache.
    * **[2.6.2] Hard Steering**: Dispatches `control_request: interrupt` frame to stdin to terminate hung execution loops.

* **[3] RUNTIME ENGINES & ORCHESTRATOR MCP**
  * **[3.1] Primary Driver**: `@anthropic-ai/claude-agent-sdk` streaming NDJSON inside Electron / Node.js main processes.
  * **[3.2] Secondary Driver**: Native `claude` CLI headless child processes (`--print --input-format stream-json --output-format stream-json --dangerously-skip-permissions`).
  * **[3.3] Nexus Orchestrator MCP (`nexus-orchestrator-mcp`)**: Bound exclusively to Lead Orchestrator; exports `3` tools: `dispatch_and_queue_partners`, `await_partner_queue`, `steer_or_repair_partner`.
  * **[3.4] Single-Runtime Diet Invariant**: Heterogeneous engines (`codex`, `pi`) are completely purged; binary probing, version checks, and UI selectors scope strictly to `claude-code`.

* **[4] DOCUMENTATION ROUTING TREE (`docs/`)**
  * **[4.1]** `docs/architecture.md`: System lifecycle and process architecture.
  * **[4.2]** `docs/axioms/STANDING_ORDER.md`: Foundational AST grammar, line budgets, and machine-first laws.
  * **[4.3]** `docs/protocols/`: Full protocol specifications (MAP, steering, MCP, partner contracts).
  * **[4.4]** `docs/dev-rules/`: Storage, NDJSON pool, IPC/SQLite, script standards, web studio rules.

* **[5] OPERATIONAL DISCIPLINES & INVARIANTS**
  * **[5.1] Safe Deletion**: Plain `rm` MUST NOT be used; deletion MUST route through `/opt/xrsec/.env/rmfile`.
  * **[5.2] Script Size Budget**: Single script files MUST NOT exceed `600` lines (warning threshold: `500` lines, hard split: `800` lines).
  * **[5.3] Non-Destructive Code Diet**: Disabled code in `CindyR/` MUST use block comments `/* [Disabled: <reason>] */`; physical code deletion is prohibited.
  * **[5.4] Git Delivery**: Unpushed commits MUST be squashed before remote push (`git squash before push`).
  * **[5.5] IPC Fallback Stub Invariant**: Every IPC channel declared in `preload.ts` or renderer hooks MUST register a fallback stub if the underlying module is disabled; unhandled `No handler registered` errors are prohibited.
  * **[5.6] Multi-Instance Isolation Invariant**: Local development instances MUST execute with `--isolated=dev`; sharing `userDataDirName: 'Cindy'` with `/Applications/Cindy.app` is prohibited (`localDb.sqlite` WAL lock conflict avoidance).
  * **[5.7] Manifest-Level Capability Shutoff**: Unreachable or offline cloud services (e.g., `cindySkillHubApiBaseUrl = ""`) MUST use manifest-level empty strings to trigger `UNSUPPORTED_CAPABILITY` before socket initiation; IPC layers MUST degrade to `log.debug` and return safe empty DTOs.
  * **[5.8] Eager IPC Registration & Database Readiness Barrier**: Handlers for `maker:project-automation:*` MUST register eagerly in `registerMakerIpcsAfterSplash` with `15,000ms` `withLoader` readiness barrier; subsystem DB operations MUST wait on `await whenDbReady()`.
  * **[5.9] Database Switching Race Condition Guard**: Account switches MUST resolve SQLite reconnection barrier (`setAccountSwitchReconnect` & `whenDbReady` queue) prior to session emission (`0ms` `DbClient not ready` window).
  * **[5.10] Multi-Thread Concurrency Fault Tolerance**: Thread message pre-reads encountering HTTP 400 `INVALID_INPUT` MUST fallback to `${room}:main`; candidate failures in `claimBesideRuns` MUST NOT abort adjacent concurrent claims.
  * **[5.11] Frontend Component SSOT & Anti-Flicker Guard**: Companion onboarding MUST use `BotProfileCreateForm.tsx` as SSOT with `useSyncExternalStore` default model binding; companion store hydration MUST acquire `hydrateFromDatabase` lock to eliminate UI list flickering.
  * **[5.12] UI Entrypoint Diet Invariant**: When an underlying service or IPC channel is disabled (e.g., remote desktop), all associated renderer UI entry points, triggers, and nested submenus (e.g., `MachineSwitcherMenu.tsx`, `MainLayout.tsx`) MUST be suppressed via non-destructive block comments (`0` orphan interactive triggers).
