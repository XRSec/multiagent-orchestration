# Protocol Specification: Real-Time Mid-Flight Steering & Dual-Channel Intervention

## 1. Context and Problem Statement

Under native headless Claude Code CLI execution, streaming input (`{"type": "user", ...}`) written to standard input during an active turn is by default buffered at the tail of the turn queue (Issue #30492 / #41665). 

To achieve sub-second dynamic steering when a user amends requirements mid-execution—without killing the process, corrupting the workspace, or invalidating Prompt Caching—the system implements the **Dual-Channel Steering Protocol**.

---

## 2. Lead Coordinator Wakeup Sequence

```mermaid
sequenceDiagram
    autonumber
    participant User as User / Group UI
    participant Host as Host Orchestrator Engine
    participant Lead as Lead Coordinator Session
    participant Worker as Running Partner Session

    Lead->>Host: ToolCall: await_partner_queue(ticket_ids)
    Note over Lead,Host: Lead enters async pending state (Promise unresolved)
    Host->>Worker: Worker executes subtask in background

    User->>Host: User issues amendment: "Change target APK to v2.2"
    Host->>Host: Detect pending await_partner_queue on Lead
    Host-->>Lead: Resolve ToolCall with USER_MID_FLIGHT_AMENDMENT payload
    Note over Lead: Lead instantly resumes with amended context
    Lead->>Host: ToolCall: steer_or_repair_partner(mode: "STEER_IN_FLIGHT", ...)
    Host->>Worker: Dispatch Dual-Channel Steering Directive
```

---

## 3. Dual-Channel Subagent Steering Protocol

```mermaid
flowchart TD
    A[Steering Signal Triggered] --> B{Subagent Execution State}
    
    B -->|State: Between Tool Steps| C[Channel 1: Soft Steering]
    B -->|State: Blocking in Long-Running Tool| D[Channel 2: Hard Steering]

    subgraph Channel_1 [Soft Steering: PreToolUse Hook]
        C --> C1[Host writes directive to steering_mailbox]
        C1 --> C2[Claude CLI triggers PreToolUse lifecycle hook]
        C2 --> C3[Hook injects additionalContext into pending turn]
        C3 --> C4[Subagent absorbs steer in-flight; process stays alive]
    end

    subgraph Channel_2 [Hard Steering: control_request interrupt]
        D --> D1[Host sends control_request interrupt frame via stdin]
        D1 --> D2[Claude CLI aborts active tool and emits control_response]
        D2 --> D3[Host resumes session with --resume or stdin user frame]
        D3 --> D4[Prompt Cache retained; workspace clean; redirected]
    end
```

### 3.1 Channel 1: Soft Steering (PreToolUse Hook Injection)
- **Applicability**: Normal multi-step tool loops (e.g., iterative file inspection, sequential edits).
- **Protocol**:
  1. The host orchestrator writes the amendment directive to `~/.multiagent-orchestration/mailboxes/<bot_id>.json` (or in-memory `PreToolUse` callback).
  2. The hook configured in `<bot_dir>/claude_config/settings.json` intercepts the tool call (strictly `0` host `~/.claude` touch).
  3. The hook returns `additionalContext` containing high-priority instructions:
     ```json
     {
       "hook": "PreToolUse",
       "additionalContext": "[CRITICAL_LEAD_STEER]: Requirements revised. Abort current parameter search and redirect immediately."
     }
     ```
  4. If the pending tool is obsolete, the hook exits with status code `2`, blocking tool execution while preserving the conversation context.

### 3.2 Channel 2: Hard Steering (`control_request: interrupt`)
- **Applicability**: Subagent stalled in a long-latency monolithic command (e.g., extensive decompilation, large build).
- **Protocol**:
  1. Host writes a standardized NDJSON control request to `stdin`:
     ```json
     {
       "type": "control_request",
       "request_id": "steer_ctrl_<uuid>",
       "request": {
         "subtype": "interrupt",
         "session_id": "<PARTNER_SESSION_UUID>",
         "reason": "Host user requested dynamic mid-flight steering"
       }
     }
     ```
  2. Claude CLI traps the signal, halts execution of the child tool safely, and emits:
     ```json
     {
       "type": "control_response",
       "request_id": "steer_ctrl_<uuid>",
       "subtype": "success"
     }
     ```
  3. Host follows up by injecting the revised user turn via `stdin`:
     ```json
     {
       "type": "user",
       "message": {
         "role": "user",
         "content": "[STEER_REDIRECT]: Halt analysis on v2.1. Redirect to v2.2 immediately using discovered symbols."
       }
     }
     ```
