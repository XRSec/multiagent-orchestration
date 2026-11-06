# Project: Claude Multiagent Fullstack Enhancement

## Architecture

### 1. System Topology & Dual Track
```
                                +--------------------------------------------+
                                |               User / Sentinel              |
                                +--------------------------------------------+
                                                      |
                                                      v
                                +--------------------------------------------+
                                |      Top-level Project Orchestrator        |
                                +--------------------------------------------+
                                       |                             |
                 Implementation Track  |                             |  E2E Testing Track
                                       v                             v
                       +-------------------------------+   +--------------------+
                       | M1: Gateway WS Envelope &     |   | E2E Testing Track  |
                       |     Web Client Layer          |   | Orchestrator       |
                       +-------------------------------+   +--------------------+
                                       |                             |
                                       v                             | (TEST_INFRA.md)
                       +-------------------------------+             | (Tiers 1-4 tests)
                       | M2: Companion Autonomy & Real |             | (TEST_READY.md)
                       |     Claude SDK Engine Bridge  |             |
                       +-------------------------------+             |
                                       |                             |
                                       v                             v
                       +-------------------------------+   +--------------------+
                       | M3: Direct Chat, Group Board  |   | Implementation M5: |
                       |     & Safe Lifecycle Engine   |-->| 100% E2E Pass +    |
                       +-------------------------------+   | Tier 5 Adversarial |
                                       |                   | + ego-browser E2E  |
                                       v                   +--------------------+
                       +-------------------------------+             ^
                       | M4: Cindy 4-Tier Matrix,      |             |
                       |     Model & Distill Pipeline  |-------------+
                       +-------------------------------+
```

### 2. Core Architectural Principles
1. **Paseo/Cindy Unified Device Gateway (Port 38080)**:
   - Single WebSocket transport on `ws://127.0.0.1:38080/gateway` with `/health` HTTP probe (Vite dev server on `127.0.0.1:5173` proxies `/api` and `/gateway` to `:38080`).
   - All client-server interactions use Cindy's full-duplex Envelope frames: `kind: 'link-open' | 'link-accept' | 'invoke' | 'invoke-result' | 'push' | 'ping' | 'pong'`.
   - Heartbeat & Backpressure: `pingIntervalMs: 15000` (`15s`), `zombieTimeoutMs: 45000` (`45s`), `maxBackpressureBytes: 67108864` (`64 MiB`).
   - Streaming pushes use topic subscription `session:<roomId>` and `direct:<sessionId>`.
   - Standard 7-frame daemon streaming contract (`agent:turn_start`, `agent:thinking`, `agent:tool_use`, `agent:tool_result`, `agent:text_delta`, `agent:turn_complete`, `agent:turn_interrupted`) cross-mapped to 12 UI/gateway event channels (`turn_start`, `text_delta`, `thinking_delta`, `tool_start`, `tool_input_delta`, `tool_output_delta`, `tool_done`, `turn_done`, `message_created`, `orchestration_phase`, `bot_status`, `prompt_distill`).
   - **Zero-SSE Mandate**: Complete eradication of SSE (`EventSource` / `/api/events`), `setTimeout` simulated responses, and fake regex tool traces.
2. **Independent Companion Autonomy & Zero Host Pollution**:
   - Zero bytes read or written to `~/.claude/`; isolated per-bot `CLAUDE_CONFIG_DIR=<bot_dir>/claude_config` (`settingSources: []`, `strictMcpConfig: true`) under `~/.multiagent-orchestration/`.
   - 7 Mo-Bots synchronized across `Customizations/agents/<BotName>/` and `Bots/<BotName>/` with 4-pack assets: `profile.json`, `capabilities.json`, `workbench.json`, `SOUL.md`.
   - Dynamic scanning and capability persistence APIs; unbinding `MOCK_BOTS` on all frontend pages (`src/web`).
   - Real Claude SDK (`@anthropic-ai/claude-agent-sdk`) execution with model routing via `Customizations/models.json` (`claude-opus-4-6` / `claude-sonnet-4-6`, fallback `gemini-3.8-flash`).
3. **Blackboard Coordination, Dual-SQLite WAL & Single-Speaker Arbitration**:
   - Dual-SQLite WAL storage (`node:sqlite` `DatabaseSync`): `data/orchestrator.db` and `data/blackboard_ssot.db`, unified under `GatewayServer -> DaemonServer -> AgentOrchestrator -> ClaudeSdkRunner` with `mcp__blackboard__*` and `mcp__orchestrator__*` tool injection.
   - Shared triple-file group blackboard in `groups/<slug>/` and `Customizations/group/<slug>/`: `room.json`, `GROUP_CHARTER.md`, `GROUP_MEMORY.md`.
   - Single-speaker protocol (`single_speaker_mode: true`) with explicit `@mention` priority or `moAdmin` fallback arbitration.
   - Two-tier turn quota (`max_consecutive_steps: 5`, `max_turns_per_round: 10`, `max_circles_per_round: 3`) and `<group-Action>` XML tags (`talk`, `collaborate`, `finish`) to eliminate infinite loops; `NO_REPLY` silent skip.
4. **Session Lifecycle & Safe Deletion Invariant**:
   - Session pinning, muting, renaming, archiving, and deletion.
   - ALL physical deletions MUST invoke `/opt/xrsec/.env/rmfile <target>` (zero `rm` or `rm -rf`).
   - Transcript persistence to `storage/transcripts/{sessionId}.jsonl` (or `~/.multiagent-orchestration/transcripts/`).
5. **Cindy 4-Tier Capability Matrix & Prompt Distill Pipeline**:
   - 4-Tier Capability Matrix: Chat-only (isolated sandbox), Config, Basic Tools (read-only), Full Access (bypass).
   - Dynamic MCP / Skill tree folding with preset one-click configurations.
   - 4-Stage Prompt Distill Pipeline: 0ms local rule bypass (`enable0msBypass: true`), small model intent distillation (`timeoutMs: 30000`, `slidingWindowDepth: 2`, `decayLambda: 0.35`, `prompts/round2.md`), fail-open safety guard, visual diff view, state persisted in `~/.multiagent-orchestration/state/prompt-distill`.
6. **Ego-Browser End-to-End Verification & UI Mental Model (`src/web`)**:
   - Automated browser and E2E testing (`npx tsx test/e2e/run-all-e2e.ts` + `test/e2e-web/web-chat-e2e.test.ts`) verifying real WebSocket connection, `ExecutionStatusCard` strictly **ABOVE** the content bubble (`Process First, Conclusion Last`), `ActiveBotIndicator` 0ms live mount, and `Zero Invalid Date` fallback.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F01 | GatewayServer WebSocket Upgrade | Provide `ws://127.0.0.1:38080/gateway` and `/health` probe with link handshake | M1 | R1, survey |
| F02 | JSON-RPC Envelope Protocol | Full-duplex frame codec for `link-open`, `link-accept`, `invoke`, `invoke-result`, `push`, `ping`, `pong` | M1 | R1, survey |
| F03 | Gateway Allowlist Expansion | Add `agent:chat`, `agent:abort`, `session:history`, `session:list`, `agent:list` to remote invoke allowlist | M1 | R1, survey |
| F04 | WebGatewayClient Implementation | Browser WebSocket client with auto-reconnect, topic subscription, and request-response matching | M1 | R1, survey |
| F05 | Vite Proxy Configuration | Configure Vite (`vite.config.ts`) `/gateway` proxy to `ws://127.0.0.1:38080/gateway` | M1 | R1, survey |
| F06 | Server SSE & Mock Eradication | Remove `roomSubscribers`, fake `setTimeout` (L201-293 in `messages-controller.ts`), and `/stream` SSE endpoint | M1 | R1, survey |
| F07 | Frontend SSE & Mock Eradication | Remove `EventSource`, `runDefaultSimulatedDialogue`, `simulatedTurnRunner.ts`, and `seedMessages.ts` | M1 | R1, survey |
| F08 | 7 Mo-Bots Asset Harmonization | Ensure `profile.json`, `capabilities.json`, `workbench.json`, `SOUL.md` are aligned with runtime | M2 | R2, survey |
| F09 | Dynamic Agent Scanner & Create API | Implement `GET /api/bots`, `POST /api/bots` (wizard), `PUT /api/bots/:id/capabilities` | M2 | R2, survey |
| F10 | Frontend MOCK_BOTS Decoupling | Unbind `MOCK_BOTS` across all 7 frontend pages, fetching from backend API & Gateway | M2 | R2, survey |
| F11 | Claude SDK Runner Bridge | Dynamic import of `@anthropic-ai/claude-agent-sdk`, binding to 312MB Mach-O `claude.exe` and `models.json` | M2 | R2, survey |
| F12 | Structured Stream Events Emission | Emit `agent:thinking`, `agent:tool_use`, `agent:tool_result`, `agent:text_delta` over `session:<roomId>` | M2 | R2, survey |
| F13 | Eradicate Regex Tool Synthesis | Remove `bot-execution-service.ts` (488 lines of regex fake tools) in favor of real engine execution | M2 | R2, survey |
| F14 | Direct Chat P2P Physical Lane | Isolated direct chat session channel (`direct:<sessionId>`) with separate sandbox, non-polluting to blackboard | M3 | R3, survey |
| F15 | Group Blackboard State Machine | Coordinate `room.json`, `GROUP_CHARTER.md`, and incremental summaries in `GROUP_MEMORY.md` | M3 | R3, survey |
| F16 | Single-Speaker & 5-Turn Breaker | Speaker arbitration (`@mention` or `moAdmin`), strict 5-turn autonomous limit, `NO_REPLY` silent skip | M3 | R3, survey |
| F17 | Safe File Deletion Invariant | Enforce all file/session deletions call `/opt/xrsec/.env/rmfile <target>`, zero `rm` | M3 | R3, survey |
| F18 | Transcript JSONL Persistence | Persist conversation transcripts incrementally to `storage/transcripts/{sessionId}.jsonl` | M3 | R3, survey |
| F19 | Session Lifecycle Controls | Implement Pinning, Muting, Renaming, Archiving, and Deletion across frontend and backend | M3 | R3, survey |
| F20 | Cindy 4-Tier Capability Matrix UI | `BotCapabilityMatrix.tsx`: 4 tiers (Chat-only, Config, Basic Tools, Full Access) with tree folding | M4 | R4, survey |
| F21 | Capability Matrix Toolchain Guard | Enforce permission limits in runner: block writes in Chat-only/Basic, isolate temp sandbox | M4 | R4, survey |
| F22 | Model Configuration Panel | Manage Claude runtime settings, primary/code model vs fast distillation model, reasoning effort slider | M4 | R5, survey |
| F23 | Prompt Distillation Pipeline | 4-stage pipeline: 0ms rule bypass, small model intent distillation, fail-open guard, visual diff view | M4 | R5, survey |
| F24 | E2E Testing Infrastructure | Test harness for Tiers 1-4 (Category-Partition, BVA, Pairwise, Workload) and `TEST_READY.md` | E2E | R5, Dual Track |
| F25 | 100% E2E Test Pass (Tiers 1-4) | Execution and passing of all unit, integration, and E2E test suites | M5 | R5, Dual Track |
| F26 | Tier 5 Adversarial Coverage Hardening | White-box source coverage audit, gap analysis, and adversarial test expansion | M5 | Dual Track |
| F27 | Ego-Browser E2E Automated Verification | Automated browser testing on `http://localhost:5173` via `@ego-browser`, validating thinking card & real tools | M5 | R5, survey |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Gateway WS Envelope, Storage & Web Client Foundation | F01, F02, F03, F04, F05, F06, F07 | none | DONE (pnpm build pass, 28/28 E2E pass, Gate PASS) |
| E2E | E2E Testing Track (Requirement-Driven) | F24 (Tiers 1-4 Test Suites, Runner, TEST_READY.md) | none (parallel) | DONE (TEST_READY.md published, 28/28 tests passing) |
| M2 | Companion Autonomy, 7 Mo-Bots 4-Pack & Claude SDK Bridge | F08, F09, F10, F11, F12, F13 | M1 (contracts) | DONE (7 Mo-Bots 4-pack synchronized, SDK bridge verified) |
| M3 | Direct Chat, Group Blackboard, Gateway IPC & Safe Lifecycle | F14, F15, F16, F17, F18, F19 | M1, M2 | DONE (Blackboard triple-file & safe delete verified) |
| M4 | Cindy 4-Tier Matrix, Model Config, Prompt Distill & Web Studio (`src/web`) | F20, F21, F22, F23 | M2 | DONE (4-Tier matrix, distill pipeline & Web Studio verified) |
| M5 | Full-Link E2E (F01–F27), Tier 5 Hardening & Ego-Browser Gate | F25, F26, F27 | M1, M2, M3, M4, E2E | DONE (28/28 E2E tests in `test/e2e/run-all-e2e.ts` + `test/e2e-web/web-chat-e2e.test.ts`) |

---

## Interface Contracts

### 1. Web Client ↔ GatewayServer (Port 38080)
- **Transport**: WebSocket `ws://127.0.0.1:38080/gateway` (or Vite `/gateway`), Heartbeat `pingIntervalMs: 15000` (`15s`), `zombieTimeoutMs: 45000` (`45s`), `maxBackpressureBytes: 67108864` (`64 MiB`).
- **Envelope Format**:
  ```typescript
  type EnvelopeKind = 'link-open' | 'link-accept' | 'invoke' | 'invoke-result' | 'push' | 'ping' | 'pong';
  interface Envelope {
    id: string;
    kind: EnvelopeKind;
    topic?: string;
    action?: string;
    payload?: any;
    error?: { code: string; message: string; details?: any };
    timestamp: number;
  }
  ```
- **Invoke Actions**:
  - `agent:chat`: `{ roomId: string; botId: string; text: string; messageId?: string; directSessionId?: string }` -> `{ status: 'accepted'; turnId: string }`
  - `agent:abort`: `{ turnId: string; roomId: string }` -> `{ status: 'aborted' }`
  - `room:subscribe`: `{ topic: string }` -> `{ subscribed: true }`
  - `agent:list`: `{}` -> `{ bots: BotItem[] }`
  - `session:list`: `{}` -> `{ sessions: SessionItem[] }`
- **Push Topics & Canonical Event Mapping (7 Daemon `agent:*` Events ↔ 12 UI Stream Channels)**:
  - Topic: `session:<roomId>` or `direct:<sessionId>`
  - Events:
    - `agent:turn_start` (UI channel: `turn_start`): `{ turnId: string; botId: string; timestamp: number }`
    - `agent:thinking` (UI channel: `thinking_delta`): `{ turnId: string; botId: string; thinking_delta: string; accumulated: string }`
    - `agent:tool_use` (UI channels: `tool_start`, `tool_input_delta`): `{ turnId: string; botId: string; toolCallId: string; toolName: string; input: any }`
    - `agent:tool_result` (UI channels: `tool_output_delta`, `tool_done`): `{ turnId: string; botId: string; toolCallId: string; toolName: string; result: any; durationMs: number }`
    - `agent:text_delta` (UI channel: `text_delta`): `{ turnId: string; botId: string; text_delta: string }`
    - `agent:turn_complete` / `agent:turn_interrupted` (UI channel: `turn_done`): `{ turnId: string; botId: string; text: string; status: 'completed' | 'interrupted'; metrics: { durationMs: number; tokens?: number } }`
    - Room/Lifecycle UI push channels: `message_created`, `orchestration_phase`, `bot_status`, `prompt_distill`.

### 2. GatewayServer ↔ AgentOrchestrator ↔ ClaudeSdkRunner
- **Orchestrator Signature**:
  ```typescript
  interface TurnExecutionRequest {
    roomId: string;
    directSessionId?: string;
    botId: string;
    userMessage: { id: string; text: string; sender: string; timestamp: number };
    onEvent: (event: StreamFrameEvent) => void;
  }
  interface TurnExecutionResult {
    turnId: string;
    botId: string;
    finalText: string;
    toolCalls: Array<{ toolName: string; input: any; result: any; durationMs: number }>;
    status: 'completed' | 'interrupted' | 'no_reply';
  }
  ```
- **Error Handling**: Graceful error emission via `agent:turn_interrupted` push frame; zero server crash.

### 3. Session Lifecycle ↔ Storage & Safe Deletion
- **Safe Delete Function**:
  ```typescript
  async function safeDeletePath(targetPath: string): Promise<void> {
    const { execFile } = await import('child_process');
    return new Promise((resolve, reject) => {
      execFile('/opt/xrsec/.env/rmfile', [targetPath], (error, stdout, stderr) => {
        if (error) reject(new Error(`rmfile failed: ${stderr || error.message}`));
        else resolve();
      });
    });
  }
  ```
- **Transcript Format**: `storage/transcripts/{sessionId}.jsonl` (one JSON per line).
- **Session lifecycle, rewind, compaction**: see `docs/architecture/session-lifecycle-compaction-and-rewind-specs.md`.

---

## Code Layout

- `src/daemon/gateway/`: GatewayServer, protocol envelope codecs, topic multiplexer, allowlists
- `src/daemon/orchestrator/`: AgentOrchestrator, ClaudeSdkRunner, BlackboardCoordinator, prompt distillation
- `src/daemon/transport/`: DaemonServer, IPC/WS dispatch handlers
- `src/web/src/hooks/`: `useGatewaySocket.ts`, refactored `useRoomMessages.ts`, `useDirectChat.ts`
- `src/web/src/components/control-plane/`: `BotCapabilityMatrix.tsx`, `ModelConfigPanel.tsx`, `PromptDistillDiff.tsx`
- `src/web/src/components/group-chat/`: `MessageItem.tsx` (ExecutionStatusCard above bubble), `ActiveBotIndicator.tsx`
- `src/web/src/pages/bots/`: `BotSessionPage.tsx`, `BotRosterPage.tsx`, `BotsHomePage.tsx` (all decoupled from MOCK_BOTS)
- `Customizations/agents/<bot_id>/`: 7 Mo-Bots 4-pack assets (`profile.json`, `capabilities.json`, `workbench.json`, `SOUL.md`)
- `storage/transcripts/`: `{sessionId}.jsonl` persistent conversation logs
- `test/e2e/`: requirement-driven E2E tests, runner, and automated ego-browser scripts
