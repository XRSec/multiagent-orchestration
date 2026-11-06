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
   - Single WebSocket transport on `ws://127.0.0.1:38080/gateway` with `/health` HTTP probe.
   - All client-server interactions use Cindy's full-duplex Envelope frames: `kind: 'link-open' | 'link-accept' | 'invoke' | 'invoke-result' | 'push' | 'ping' | 'pong'`.
   - Streaming pushes use topic subscription `session:<roomId>` and `direct:<sessionId>`.
   - Standard 7-frame streaming contract: `agent:turn_start`, `agent:thinking`, `agent:tool_use`, `agent:tool_result`, `agent:text_delta`, `agent:turn_complete`, `agent:turn_interrupted`.
   - Complete eradication of SSE (`EventSource`), `setTimeout` simulated responses, and fake regex tool traces.
2. **Independent Companion Autonomy**:
   - 7 Mo-Bots in `Customizations/agents/<bot_id>/` with 4-pack assets: `profile.json`, `capabilities.json`, `workbench.json`, `SOUL.md`.
   - Dynamic scanning and capability persistence APIs; unbinding `MOCK_BOTS` on all frontend pages.
   - Real Claude SDK (`@anthropic-ai/claude-agent-sdk`) execution via native Mach-O `claude.exe`.
3. **Blackboard Coordination & Single-Speaker Arbitration**:
   - Shared blackboard: `room.json`, `GROUP_CHARTER.md`, `GROUP_MEMORY.md`.
   - Single-speaker protocol with explicit `@mention` priority or `moAdmin` arbitration.
   - 5-turn autonomous interaction circuit breaker to eliminate infinite loops and polite echoing; `NO_REPLY` silent skip.
4. **Session Lifecycle & Safe Deletion Invariant**:
   - Session pinning, muting, renaming, archiving, and deletion.
   - ALL physical deletions MUST invoke `/opt/xrsec/.env/rmfile <target>`.
   - Transcript persistence to `storage/transcripts/{sessionId}.jsonl`.
5. **Cindy 4-Tier Capability Matrix & Prompt Distill Pipeline**:
   - 4-Tier Capability Matrix: Chat-only (isolated sandbox), Config, Basic Tools (read-only), Full Access (bypass).
   - Dynamic MCP / Skill tree folding with preset one-click configurations.
   - 4-Stage Prompt Distill Pipeline: 0ms local rule bypass, small model intent distillation, fail-open safety guard, visual diff view.
6. **Ego-Browser End-to-End Verification**:
   - Automated browser testing on `http://localhost:5173` verifying real WebSocket connection, real-time thinking status card above content bubble, real tool cards, and real model responses.

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
| M1 | Gateway WS Envelope & Web Client Layer | F01, F02, F03, F04, F05, F06, F07 | none | DONE (pnpm build pass, 28/28 E2E pass, Gate PASS) |
| E2E | E2E Testing Track (Requirement-Driven) | F24 (Tiers 1-4 Test Suites, Runner, TEST_READY.md) | none (parallel) | DONE (TEST_READY.md published, 28/28 tests passing) |
| M2 | Companion Autonomy & Real Claude SDK Engine Bridge | F08, F09, F10, F11, F12, F13 | M1 (contracts) | IN_PROGRESS |
| M3 | Direct Chat, Group Blackboard & Safe Lifecycle Engine | F14, F15, F16, F17, F18, F19 | M1, M2 | PLANNED |
| M4 | Cindy 4-Tier Matrix, Model & Distill Pipeline | F20, F21, F22, F23 | M2 | PLANNED |
| M5 | Final Milestone: 100% E2E Pass, Tier 5 Hardening & Ego-Browser | F25, F26, F27 | M1, M2, M3, M4, E2E | PLANNED |

---

## Interface Contracts

### 1. Web Client ↔ GatewayServer (Port 38080)
- **Transport**: WebSocket `ws://127.0.0.1:38080/gateway` (or Vite `/gateway`)
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
- **Push Topics & Event Types**:
  - Topic: `session:<roomId>` or `direct:<sessionId>`
  - Events:
    - `agent:turn_start`: `{ turnId: string; botId: string; timestamp: number }`
    - `agent:thinking`: `{ turnId: string; botId: string; thinking_delta: string; accumulated: string }`
    - `agent:tool_use`: `{ turnId: string; botId: string; toolCallId: string; toolName: string; input: any }`
    - `agent:tool_result`: `{ turnId: string; botId: string; toolCallId: string; toolName: string; result: any; durationMs: number }`
    - `agent:text_delta`: `{ turnId: string; botId: string; text_delta: string }`
    - `agent:turn_complete`: `{ turnId: string; botId: string; text: string; status: 'completed' | 'interrupted'; metrics: { durationMs: number; tokens?: number } }`

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
