# System Architecture: Headless Subprocess Pool & Full-Duplex Stream Engine

## 1. Executive Summary

This specification governs the runtime architecture of the multi-agent coordination platform powered exclusively by the native Claude Code CLI (`/opt/homebrew/bin/claude`). The platform completely strips third-party SDK dependencies, proprietary wrapper harnesses, and PTY terminal parsing, replacing them with a deterministic, low-latency, full-duplex Newline-Delimited JSON (NDJSON) streaming pipeline.

---

## 2. Process Pool & Full-Duplex NDJSON Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant UI as Electron UI / Renderer
    participant Host as ProcessPoolManager (Node.js)
    participant Watchdog as ProcessWatchdog
    participant Claude as Claude CLI Subprocess

    UI->>Host: Dispatch task request (User / Lead)
    Host->>Claude: spawn(claude -p --input-format stream-json --output-format stream-json ...)
    Host->>Watchdog: Register PID & Session UUID
    Claude-->>Host: stdout: {"type": "system", "subtype": "init", "session_id": "<uuid>"}
    Host->>UI: Stream initial session metadata
    
    loop Real-Time Turn Execution
        Claude-->>Host: stdout: {"type": "stream_event", "event": {"type": "content_block_delta", ...}}
        Host->>UI: Forward text chunks for typewriter display
        Claude-->>Host: stdout: {"type": "tool_use", "name": "...", "input": {...}}
        Host->>UI: Broadcast ToolCall card event
    end

    alt Mid-Flight User Amendment
        UI->>Host: User issues mid-turn correction
        Host->>Claude: stdin: {"type": "control_request", "request": {"subtype": "interrupt", ...}}
        Claude-->>Host: stdout: {"type": "control_response", "subtype": "success"}
        Host->>Claude: stdin: {"type": "user", "message": {"role": "user", "content": "[STEER]..."}}
    end

    Claude-->>Host: stdout: {"type": "result", "subtype": "success", "total_cost_usd": ...}
    Host->>UI: Final completion envelope
    Host->>Watchdog: De-register session
```

---

## 3. Subprocess Launch Invariants & CLI Flag Configuration

The host engine initiates worker processes with strict parameter matrices depending on the agent category:

### 3.1 Standard Subprocess Parameter Matrix

| Parameter / Flag | Value | Operational Purpose |
| :--- | :--- | :--- |
| `Binary` | `/opt/homebrew/bin/claude` | Direct execution of the native CLI binary. |
| `-p` | Flag active | Headless, non-interactive execution mode. |
| `--input-format` | `stream-json` | Real-time NDJSON stream ingestion via `stdin`. |
| `--output-format` | `stream-json` | Real-time NDJSON event broadcasting via `stdout`. |
| `--verbose` | Flag active | Mandatory: prevents output suppression, ensures intermediate events are emitted. |
| `--include-partial-messages` | Flag active | Mandatory: delivers delta tokens for real-time UI streaming. |
| `--dangerously-skip-permissions`| Flag active | Bypasses terminal approval prompts in sandboxed headless execution. |
| `--append-system-prompt` | `"$(cat SOUL.md)"` | Appends agent identity and behavioral constraints without overriding native tools. |
| `--mcp-config` | `./mcp.json` | Mounts agent-specific MCP tool definitions. |
| `--allowedTools` | Specific whitelist | Restricts tool boundaries (e.g., `mcp__rea__*,Read,Grep,Bash(r2 *)`). |
| `cwd` | `partners/<id>/` | Sets the execution context to the partner's root directory. |

---

## 4. Prompt Caching Economics & Process Lifecycle

### 4.1 The 5-Minute Cache Window Invariant
Anthropic Claude 3.5 / 3.7 models enforce a 5-minute Prompt Cache expiration TTL. In multi-agent collaborative workflows:
- Cold spawns require 2–4 seconds of initialization latency and force full re-reading of directory context.
- Terminating processes via `SIGTERM` destroys the active cache shard, causing a $10\times$ cost surge and $5\times$ latency penalty on subsequent calls.

### 4.2 Lifecycle States
```mermaid
stateDiagram-v2
    [*] --> SPAWNING: Host Invocation
    SPAWNING --> ACTIVE_IDLE: Init Handshake (session_id captured)
    ACTIVE_IDLE --> RUNNING_TURN: stdin {"type": "user"}
    
    RUNNING_TURN --> RUNNING_TURN: Streaming Events (stdout)
    RUNNING_TURN --> STEERING_IN_FLIGHT: Soft Steer (Hook) / Hard Steer (Interrupt)
    STEERING_IN_FLIGHT --> RUNNING_TURN: Redirect Injected
    
    RUNNING_TURN --> ACTIVE_IDLE: Turn Completed (Cache Retained)
    RUNNING_TURN --> STALLED: Zero-Byte Output > 45s
    
    STALLED --> RECOVERING: Watchdog SIGKILL
    RECOVERING --> RUNNING_TURN: Resume with --resume <uuid>
    
    ACTIVE_IDLE --> TERMINATED: Inactivity TTL Expired (> 5 min)
    TERMINATED --> [*]
```

---

## 5. Host-Side Process Watchdog Specification

To protect against Claude CLI Issue #53584 (headless process entering silent sleep state with zero CPU and open TCP connection):

```typescript
export interface WatchdogConfig {
  heartbeatTimeoutMs: number; // Default: 45,000ms
  checkIntervalMs: number;    // Default: 5,000ms
  longToolGraceMs: number;    // Default: 180,000ms (for compiler/build tasks)
}
```

1. **Activity Monitor**: Host tracks timestamp of last received `stdout` byte.
2. **Tool Awareness**: If `tool_use` is emitted for a known long-running tool (e.g. `Bash` running a build or analysis), timeout window expands to `longToolGraceMs`.
3. **Execution**: If time since last activity exceeds threshold:
   - Force kill stale PID.
   - Spawn recovery process immediately with:
     `claude -p --resume "<SESSION_UUID>" --input-format stream-json --output-format stream-json ...`
   - Log automated watchdog recovery event to audit database.

---

## 6. Bot Group Coordination & Multi-Repo Directory Architecture

For collaborative taskforce execution (governed by [BOT_GROUP_ORCHESTRATION_SPEC](./dev-rules/bot-group-orchestration.md)):

### 6.1 Two-Tier Directory Decoupling Model
1. **Group Private Storage Folder (`~/.multiagent-orchestration/groups/<id>/`)**:
   - Stores the group's own assets: `GROUP_CHARTER.md`, shared blackboard memory `GROUP_MEMORY.md`, division plans (`plans/`), and intermediate execution logs.
   - Decoupled from user codebases: Zero internal coordination clutter is written to customer projects.
2. **Mounted Target Projects (`mountedDirs`)**:
   - The actual repositories being analyzed and patched (e.g. `/Users/xr/IDEA.localized/cliproxyapi`, `/Users/xr/IDEA.localized/Prism-Browser`).
   - Injected into tool sandbox whitelists so partners operate directly across repositories without directory replication.

### 6.2 Session Channels & Context Increments
- **Canonical 1:1 Direct Chat**: Exactly 1 persistent session per partner (`dm_<id>`).
- **Hidden Group Lane Session**: Exactly 1 persistent session per `(group, partner)` (`route_key: group:<groupId>`).
- **Thread Lane Isolation**: Discrete topic threads run in independent sessions (`route_key: group:<groupId>:thread:<rootMessageId>`), preventing sub-conversations from polluting the main timeline.
- **Incremental Turn Context**: Host tracks `lastSeenSequence` watermark per member, delivering only new peer message deltas wrapped in `<untrusted-json-block>`, strictly preserving System Prompt integrity.
- **Owner Intent Boundary (PR #8075)**: Automatic tool execution review derives exclusively from verified human owner text (`autoReviewUserText`), preventing peer quote-card privilege escalation.

