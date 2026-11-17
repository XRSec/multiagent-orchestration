---
doc_id: ARCH-CCMA-SHARD-04
status: CURRENT
version: 1.0.0
last_verified: 2026-11-13
language: en-US
description: Virtual group chat timeline UI synthesis, real-time subagent stream parsing, mid-flight steering, and progressive disclosure memory pipelines.
type: PROTOCOL_SHARD
parent_node: ../INDEX.md
allowed-tools: [Read, Write, Edit, Bash]
target: LLM_ENGINEERING
sources: [docs/standards/documentation-standards.md, docs/architecture/INDEX.md]
---

# Virtual Group Chat, Stream Routing & Progressive Memory Pipeline

## 1. Virtual Group Chat Timeline vs Physical Process Topology

Enterprise multi-agent systems require a strict separation between user-facing presentation and physical runtime execution.

```
+-------------------------------------------------------------------------+
| PRESENTATION LAYER: Virtual Group Chat Timeline (Web UI)                |
| [moAdmin]: Decomposing requirement...                                  |
|   ↳ [moCode]: Modifying src/auth/jwt.ts... (ExecutionStatusCard)       |
|   ↳ [MoCI]: Running integration tests... PASS                           |
+-------------------------------------------------------------------------+
                                    |
          Orchestrator NDJSON Stream Aggregator & Normalizer
                                    |
+-------------------------------------------------------------------------+
| RUNTIME LAYER: Physical Session Isolation (Independent Processes)      |
| - Lead Process:   CLAUDE_CONFIG_DIR=.../moAdmin (Session: adm-89a1.jsonl)|
| - Sub-Worker 1:   CLAUDE_CONFIG_DIR=.../moCode  (Session: cod-33f2.jsonl)|
| - Sub-Worker 2:   CLAUDE_CONFIG_DIR=.../MoCI    (Session: ci-90b4.jsonl) |
+-------------------------------------------------------------------------+
```

### Physical Invariants
- Agents MUST NOT share mutable context in a single giant transcript.
- Every bot maintains its own physical `CLAUDE_CONFIG_DIR`, project directory, and persistent JSONL transcript.
- The web frontend renders a synthetic unified room timeline by subscribing to the daemon's multiplexed WebSocket stream.

---

## 2. Real-Time Multi-Agent Stream Demuxing

To render discrete thinking stages, tool invocations, and agent replies in real time, the streaming pipeline parses structured NDJSON events emitted across processes.

### 2.1 Demuxing Envelope Contract
When subagents are spawned, the parent CLI process is launched with `--forward-subagent-text` (or the environment variable equivalent `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT=1`). Emitted events carry structural routing identifiers:

| Attribute | Type | Routing Semantics |
| :--- | :--- | :--- |
| `parent_tool_use_id` | `string \| null` | `null` designates the root lead agent (primary conversation thread). A non-null UUID designates a child subagent invocation emitted under a parent `Agent` tool use call. |
| `agent_id` | `string` | Canonical identifier of the specialist bot (e.g., `bot_mocode_engine_01`). |
| `message_id` | `string` | Unique identifier of the specific message block in the virtual room. |
| `delta_type` | `enum` | Stream chunk category: `thinking`, `text`, `tool_use`, `tool_result`. |

### 2.2 UI Stream Mapping Algorithm
1. Incoming chunk arrives over WebSocket daemon transport (`ws://127.0.0.1:38080/gateway`).
2. If `parent_tool_use_id == null`, route delta to the primary timeline message bubble.
3. If `parent_tool_use_id != null`, mount or update the nested `ExecutionStatusCard` or dedicated subagent drawer belonging to `agent_id`.
4. Flush buffers to React virtualized DOM; enforce monotonic auto-scroll anchoring.

---

## 3. Dynamic Mid-Flight Steering & Sibling Coordination

Multi-agent coordination allows real-time intervention without terminating underlying processes.

### 3.1 Subagent Suspension & Resume
- The lead orchestrator tracks subagent lifecycles via runtime PID and internal `agent_id`.
- Execution can be suspended via SIGSTOP/SIGCONT or host-level pause events, allowing human operators or lead agents to inspect intermediate diffs before allowing further disk writes.

### 3.2 Sibling Coordination Protocol
Subagents discover and message peers through native inter-agent tools:
- `ListAgents`: Queries currently active siblings, their domain descriptions, and operational readiness.
- `SendMessage`: Transmits structured payloads directly to sibling inboxes.
- `notify_when_idle`: Subscribes a caller to target agent idle events, enabling clean fan-in barriers without busy-wait polling loops.

---

## 4. "Invisible Partner" Progressive Disclosure Pipeline

Injecting historical session transcripts into new sessions causes immediate context rot. The "Invisible Partner" architecture enforces asynchronous two-stage distillation.

```
Session Lifecycle End:
[Session Active] -> [Stop / SessionEnd Hook] -> (Detached Background Worker)
                                                      |
                                                      v
                                      claude -p --bare --model haiku
                                                      |
                                      +---------------+---------------+
                                      |                               |
                                      v                               v
                       Write tasks/task-xxx.md         Append 1-Line Summary to
                       (Structured Granular Dossier)   tasks/INDEX.md (Pointer)
```

### 4.1 Stage 1: Asynchronous Distillation
1. When a task completes, the `Stop` or `SessionEnd` lifecycle hook fires a detached asynchronous shell process.
2. The worker invokes `claude -p --bare --model haiku` to compress the raw transcript into a structured dossier at `tasks/task-<id>.md`:
   - Inputs, outputs, touched files, architecture compromises, test verification commands.
3. The worker appends an atomic one-line pointer to `tasks/INDEX.md`:
   `- [TASK-<ID>](tasks/task-<ID>.md) :: <1-line summary of verified outcome>`

### 4.2 Stage 2: Progressive Disclosure Injection
1. On new session startup or when the user toggles "Include history", the host does **not** dump past conversations into context.
2. The orchestrator injects **only** the root `tasks/INDEX.md` pointer table into Tier 2 project context (<500 tokens).
3. The active agent searches the index, and invokes `Read("tasks/task-<ID>.md")` **on demand** only if relevant to the active assignment. Context remains lean.
