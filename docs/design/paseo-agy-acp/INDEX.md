---
doc_id: DESIGN-PASEO-AGY-ACP-INDEX
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Paseo Antigravity ACP Bridge (`paseo-agy-acp`) Design Index

`@fdkevin/paseo-agy-acp` (plugin ID `agy-acp`, provider ID `agy`, source root `paseo-agy-acp/`) is the primary production protocol bridge connecting the Paseo daemon to local `agy acp` runtimes, fusing foreground ACP JSON-RPC stdio streaming with local Antigravity Brain disk projection, fail-closed turn settlement, shadow-Git time-machine revert, and multi-level subagent tracking.

Parent index: [../INDEX.md](../INDEX.md)

## Core Invariants

1. **Dual-Plane Fusion**: Pair foreground ACP stdio (`paseo-agy-acp/server/transport.ts`, `session.ts`) with `<appDataDir>/brain/<nativeId>/.system_generated/` observation (`brain.ts`, `brain-observer.ts`) because post-RPC Reactive Wakeups, background tasks, and child subagents execute asynchronously outside `session/prompt`.
2. **Fail-Closed Turn & Tool Settlement**: NEVER classify a turn or running tool as `completed` without positive terminal evidence (`mapTerminalStopReason`, `isCompletePlannerResponse`); journal every prompt before dispatch (`turn-journal.ts`) and sweep crash leftovers to `failed`.
3. **Orthogonal Two-Clock Watchdogs**: Bound foreground silence (`turnStallTimeoutMs = 120,000` ms) separately from active tool execution (`toolStallTimeoutMs = 600,000` ms), counting only work-bearing `TURN_PROGRESS_UPDATES` and attributing timeouts exclusively to the expired oldest tool.
4. **Containment & Fork Sovereignty**: Enforce realpath and `lstat` non-symlink containment across Brain reads, SQLite `step_type = 17` forensics (`error-inspection.ts`), shadow-Git checkpoints (`checkpoints.ts`), and `VACUUM INTO` conversation forks (`agy-fork.ts`).
5. **Queue Over Implicit Interrupt-Replace**: Omit `prompt.steer` (`provider.ts`) because `agy acp` runs a strict single-turn state machine; Paseo default `steer` triggers host `Interrupt & Replace` (`session/cancel`), requiring client-side `queue` for uninterrupted multi-step execution.

## Architecture Shards

| Shard | Scope & Codebase Anchors |
| :--- | :--- |
| [shards/01-dual-plane-and-brain-observer.md](shards/01-dual-plane-and-brain-observer.md) | ACP stdio + `_meta.antigravity` injection, Brain `.system_generated` observer, Reactive Wakeup phase machine, `settleBrainTurn`, `O_TRUNC` detection, and idle external transcript sync (`session.ts`, `brain.ts`, `brain-io.ts`, `brain-observer.ts`, `brain-projector.ts`). |
| [shards/02-turn-lifecycle-and-fail-closed-guards.md](shards/02-turn-lifecycle-and-fail-closed-guards.md) | Fail-closed `stopReason` & tool settlement, `120s`/`600s` two-clock watchdog, write-ahead `turn-journal.ts`, `runLoadSessionWithReplayIdle`, read-only SQLite `step_type = 17` forensics (`error-inspection.ts`), and safe config fallback. |
| [shards/03-subagents-checkpoints-and-steer.md](shards/03-subagents-checkpoints-and-steer.md) | Multi-level `<sessionId>:child:<nativeChildId>` registry (`subagents.ts`), cross-plane tool alignment, shadow-Git + SQLite fork time-machine (`checkpoints.ts`, `agy-fork.ts`, `revert.ts`), `/usage` quota (`usage.ts`), and Steer vs Queue contract. |

## Verification Gate

Run `npm --prefix paseo-agy-acp run verify` (`format:check`, `tsc --noEmit`, `node --test`, `npm pack --dry-run`) before shipping any bridge mutation.
