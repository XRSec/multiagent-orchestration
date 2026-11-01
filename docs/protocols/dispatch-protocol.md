# Concurrency Dispatch Protocol (Fan-Out & Fan-In)

Defines parallel task decomposition, asynchronous subprocess execution, and barrier aggregation.

## 1. Concurrency Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Orch as Orchestrator
    participant Host as Dispatch Engine
    participant Res as Researcher Subprocess
    participant Cod as Coder Subprocess

    User->>Orch: Composite Request (e.g., Audit and Prototype)
    Orch->>Host: MAP Packet (Action: DISPATCH, Subtasks: [Researcher, Coder])
    Host->>Res: Spawn claude CLI --resume <UUID_1>
    Host->>Cod: Spawn claude CLI --resume <UUID_2>
    Note over Res,Cod: Concurrent Non-Interactive Execution
    Res-->>Host: Subtask Result 1 (JSON)
    Cod-->>Host: Subtask Result 2 (JSON)
    Host->>Orch: Fan-In Aggregation Packet
    Orch->>User: Final Comprehensive Report
```

## 2. Invariants

1. **Orthogonality**: Subtasks must be independent and share no race-condition locks on the same target files.
2. **Barrier Synchronization**: All subtasks must report status before the final synthesis prompt is fed to the Orchestrator.
3. **Timeout Strategy**: Max runtime per subtask defaults to 120 seconds ($T_{max} = 120s$). If a subtask breaches timeout, the host terminates the child process and injects a `STATUS_TIMEOUT` error packet into the fan-in aggregator.
