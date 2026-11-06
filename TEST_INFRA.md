# TEST_INFRA — Multiagent Orchestration E2E Test Infrastructure Specification

## 1. Test Philosophy: Opaque-Box & Requirement-Driven

The end-to-end testing track evaluates the system from an opaque-box, user-and-client perspective. Tests interact with public network transports, protocol contracts, storage artifacts, and user interfaces without relying on internal private implementations:
- **Contract Fidelity**: Testing verifies compliance with the Cindy/Paseo WebSocket JSON-RPC Envelope specification (`ws://127.0.0.1:38080/gateway`), 7-frame streaming contract, 4-tier capability matrix, and safe deletion invariant.
- **Zero Mock Policy**: Tests execute against real network sockets, real SQLite databases with WAL mode, real filesystem assets (`Customizations/agents/`), and real protocol codecs. Simulated mocks, synthetic regex tool matchers, and fake timers are strictly rejected.
- **Progressive Testability & Isolation**: Every test is self-contained. Test harnesses allocate isolated ephemeral ports, distinct database instances, and dedicated temporary directories, cleaning up with `/opt/xrsec/.env/rmfile` upon teardown.

---

## 2. Feature Inventory Mapping (F01 – F27)

All 27 features identified in `PROJECT.md` are mapped to the 4-tier test architecture:

| Feature ID | Feature Name | Primary Test Tier | Verification Scope |
|---|---|---|---|
| **F01** | GatewayServer WebSocket Upgrade | Tier 1, Tier 2 | `ws://127.0.0.1:38080/gateway` upgrade, `/health` HTTP probe, port binding |
| **F02** | JSON-RPC Envelope Protocol | Tier 1, Tier 2 | Full-duplex frames: `link-open`, `link-accept`, `invoke`, `invoke-result`, `push`, `ping`, `pong` |
| **F03** | Gateway Allowlist Expansion | Tier 1, Tier 2 | Default-deny security model; remote invokes for `agent:chat`, `session:list`, `agent:list`, etc. |
| **F04** | WebGatewayClient Implementation | Tier 1, Tier 3 | Request-response correlation by UUID, auto-reconnect, topic subscriptions |
| **F05** | Vite Proxy Configuration | Tier 1 | `/gateway` WebSocket proxy forwarding to port 38080 |
| **F06** | Server SSE & Mock Eradication | Tier 1 | Absence of SSE `/stream`, removal of synthetic `setTimeout` response generators |
| **F07** | Frontend SSE & Mock Eradication | Tier 1 | Absence of `EventSource`, removal of `simulatedTurnRunner` and `seedMessages` |
| **F08** | 7 Mo-Bots Asset Harmonization | Tier 1 | 4-pack assets in `Customizations/agents/<bot_id>/`: `profile.json`, `capabilities.json`, `workbench.json`, `SOUL.md` |
| **F09** | Dynamic Agent Scanner & Create API | Tier 1, Tier 2 | Dynamic scanning of agent directories, wizard validation, capability mutation |
| **F10** | Frontend MOCK_BOTS Decoupling | Tier 1, Tier 4 | Frontend pages bound to live API / Gateway instead of static mock constants |
| **F11** | Claude SDK Runner Bridge | Tier 1, Tier 3 | SDK runner initialization, `claude.exe` resolution, `models.json` configuration |
| **F12** | Structured Stream Events Emission | Tier 1, Tier 3 | 7 standard streaming events: `turn_start`, `thinking`, `tool_use`, `tool_result`, `text_delta`, `turn_complete`, `turn_interrupted` |
| **F13** | Eradicate Regex Tool Synthesis | Tier 1 | Removal of fake regex tool parser (`bot-execution-service.ts`) |
| **F14** | Direct Chat P2P Physical Lane | Tier 1, Tier 3 | Dedicated topic `direct:<sessionId>`, isolated workspace sandbox, zero group memory pollution |
| **F15** | Group Blackboard State Machine | Tier 1, Tier 3 | Consensus tracking across `room.json`, `GROUP_CHARTER.md`, and `GROUP_MEMORY.md` |
| **F16** | Single-Speaker & 5-Turn Breaker | Tier 2, Tier 3 | Single-speaker routing, `@mention` priority, strict 5-turn circuit breaker tripping, `NO_REPLY` silent skip |
| **F17** | Safe File Deletion Invariant | Tier 2, Tier 3 | Mandatory invocation of `/opt/xrsec/.env/rmfile <target>`, strict prohibition of `rm` |
| **F18** | Transcript JSONL Persistence | Tier 1, Tier 3 | Monotonic sequence append to `storage/transcripts/{sessionId}.jsonl` |
| **F19** | Session Lifecycle Controls | Tier 1, Tier 3 | Pinning, muting, renaming, archiving, and deletion of direct/group sessions |
| **F20** | Cindy 4-Tier Capability Matrix UI | Tier 1, Tier 3 | 4 modes: Chat-only, Config, Basic Tools, Full Access with folding tree UI |
| **F21** | Capability Matrix Toolchain Guard | Tier 1, Tier 2 | Permission enforcement: block write/terminal in Chat-only & Basic; temporary sandbox isolation |
| **F22** | Model Configuration Panel | Tier 1 | Model selection (primary vs distillation), reasoning effort configuration |
| **F23** | Prompt Distillation Pipeline | Tier 1, Tier 3 | 4-stage pipeline: 0ms rule bypass, small model intent distillation, fail-open guard, visual diff |
| **F24** | E2E Testing Infrastructure | All Tiers | Automated test harness, runner orchestration, `TEST_READY.md` reporting |
| **F25** | 100% E2E Test Pass (Tiers 1-4) | All Tiers | Deterministic execution and pass gate for entire suite |
| **F26** | Tier 5 Adversarial Coverage Hardening | Tier 2, Tier 5 | Adversarial fuzzing, malformed envelopes, backpressure saturation, extreme inputs |
| **F27** | Ego-Browser E2E Automated Verification | Tier 4 | Browser automation asserting UI visual invariants (ExecutionStatusCard above bubble, ActiveBotIndicator) |

---

## 3. Test Methodology: Tiers 1 – 4

### Tier 1: Feature Coverage (Category-Partition)
- **Objective**: Verify the primary happy paths and interface contracts for all functional components.
- **Coverage Areas**:
  1. *Gateway WebSocket Handshake*: `link-open` -> `link-accept` negotiation with protocol version, capabilities, and allowlist hash verification.
  2. *JSON-RPC Remote Invocation*: `invoke` envelope request-reply cycle (`system:ping`, `system:status`, `agent:list`, `room:create`, `room:get`).
  3. *Push Streaming Multiplexing*: Subscription via `gateway:subscribe` to `session:<roomId>` and `direct:<sessionId>`, followed by streaming frames emission.
  4. *Companion Autonomy & Assets*: Verification of 7 Mo-Bots in `Customizations/agents/` parsing `profile.json`, `capabilities.json`, `workbench.json`, and `SOUL.md`.
  5. *Direct vs Group Chat Segmentation*: P2P channel isolation ensuring direct chat messages do not touch group memory or trigger group coordination.
  6. *Cindy 4-Tier Matrix Validation*: Contract validation for Chat-only (dialogue only), Config (agent profile tuning), Basic Tools (read-only), Full Access (complete execution).
  7. *Prompt Distillation Pipeline*: Validation of 0ms local rule bypass, intent summary synthesis, and fail-open preservation.

### Tier 2: Boundary Value Analysis & Corner Cases
- **Objective**: Rigorously test limits, malformed inputs, edge conditions, and error recovery.
- **Coverage Areas**:
  1. *Empty & Whitespace Inputs*: Messages with empty strings, whitespace-only, or null payloads.
  2. *Payload Size Boundaries*: 1MB+ oversized payloads verifying BackpressureGuard rejection or safe streaming without memory exhaustion.
  3. *Malformed Envelope Handling*: Invalid JSON strings, unknown envelope kinds, missing UUIDs, and malformed payload schemas.
  4. *Allowlist Default-Deny Security*: Invocations of non-allowlisted channels (e.g., `admin:shutdown`, `eval:shell`) strictly returning `NOT_ALLOWED` (Code 403 / 4004).
  5. *Anti-Loop Circuit Breaker (5-Turn Limit)*: Rapid sequential autonomous bot messages tripping the 5-turn limit, followed by user recovery.
  6. *NO_REPLY Silent Skip*: Agent returning `NO_REPLY` causing zero message emission, no blackboard modification, and loop termination.
  7. *Safe File Deletion Edge Cases*: Deletion of non-existent files or directories via `/opt/xrsec/.env/rmfile` handling errors gracefully without crashing.

### Tier 3: Pairwise Combinatorial & Cross-Feature Interactions
- **Objective**: Verify multi-subsystem concurrency and cross-cutting state transitions.
- **Coverage Areas**:
  1. *Concurrent Direct Chat & Group Blackboard*: Simultanous active direct conversation while group room blackboard processes updates, asserting zero cross-talk.
  2. *Dynamic Capability Mutation During Active Session*: Switching capability modes (e.g., Basic Tools -> Full Access) between turns, verifying runner reloads permissions.
  3. *Distillation Pipeline Combined with Streaming*: Long prompts processed through distillation, streaming diff metrics, then emitting structured stream frames.
  4. *Session Lifecycle Concurrency*: Pinning, muting, renaming, and archiving sessions while real-time push events are in-flight.
  5. *Multi-Bot Monotonic Sequence Order*: Multiple bots writing to SQLite concurrently, verifying strict monotonic sequence ordering and zero gap/duplicate.

### Tier 4: Real-World Scenarios & Workload Verification
- **Objective**: End-to-end integration flows simulating human and multi-agent interaction cycles.
- **Coverage Areas**:
  1. *Full Multi-Agent Collaboration Cycle*: Human issues a goal -> `moAdmin` dispatches -> `moCode` and `moCI` process -> blackboard updates -> final consensus reached.
  2. *Ego-Browser UI Verification Harness*: Web page verification asserting:
     - WebSocket connection established on port 38080.
     - `ActiveBotIndicator` mounts immediately upon message submit.
     - `ExecutionStatusCard` renders strictly ABOVE the message bubble.
     - No `Invalid Date` or `NaN` present in any timestamp view.
  3. *Abortion and Interrupt Recovery*: Client initiates `agent:abort`, Gateway halts runner, emits `agent:turn_interrupted`, and restores idle state.

---

## 4. Test Runner Invocation & Pass/Fail Semantics

### Test Directory Layout
```
test/
├── e2e/
│   ├── helpers/
│   │   ├── e2e-harness.ts              # Ephemeral server, client factory, mock engine
│   │   └── ui-invariants.ts            # UI mental model validator (cards above bubbles, etc.)
│   ├── tier1-feature-coverage.test.ts   # Category-Partition feature tests
│   ├── tier2-boundary-corner.test.ts    # Boundary & error condition tests
│   ├── tier3-cross-feature.test.ts      # Combinatorial cross-feature tests
│   ├── tier4-real-world-scenarios.test.ts # End-to-end multi-agent & UI scenarios
│   └── run-all-e2e.ts                  # Master E2E runner orchestrator
```

### Execution Commands
1. **Master Test Suite (All Tiers)**:
   ```bash
   npx tsx test/e2e/run-all-e2e.ts
   ```
2. **Individual Tier Execution**:
   ```bash
   npx tsx test/e2e/tier1-feature-coverage.test.ts
   npx tsx test/e2e/tier2-boundary-corner.test.ts
   npx tsx test/e2e/tier3-cross-feature.test.ts
   npx tsx test/e2e/tier4-real-world-scenarios.test.ts
   ```
3. **Alternative Native Fast Runner**:
   ```bash
   ./extensions/CindyR/node_modules/.bin/tsx --test test/e2e/*.test.ts
   ```

### Pass/Fail Semantics
- **Zero Exit Code (`0`)**: 100% of test cases passed. All envelope codecs, WebSocket connections, blackboard operations, permission guards, and UI invariants satisfied.
- **Non-Zero Exit Code (`1`)**: One or more assertions failed. The runner outputs:
  - Exact failing test name and tier.
  - Expected vs actual values.
  - Stack trace pointing to the assertion line.
- **Timeout Semantics**: Individual unit/integration operations must settle within 5,000ms. Long-running turns have an upper bound of 15,000ms. Any hanging operation is treated as an immediate failure.
