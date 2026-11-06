---
doc_id: SPEC-OPT-LINKAGE-STUDY-2026
status: PROPOSED
version: 0.2.0
last_verified: 2026-11-07
language: en-US
---

# Multi-Agent Linkage Reference Study

Mechanisms from four sources, mapped to the seven Mo-Bots. All are proposals. Adoption rules are in [collaboration-efficiency-and-cache-memory-optimization.md](collaboration-efficiency-and-cache-memory-optimization.md).

## 1. Evidence

| Source | Read | Confidence |
| :--- | :--- | :--- |
| Claude Managed Agents | Vendored pages on orchestration, threads, workflow runs | High |
| agy teamwork | The `.agents/teamwork/` records of one run in this repo | High for behavior, none for internals |
| agy goal | `agy changelog`, plus Cindy `goal-host` source as the closest readable implementation | High for Cindy, medium for agy |
| agy boost | One changelog line about worker tool configuration | **Low, not run** |

Role names found as plain strings in the `agy` binary include conductor, replanner, plan merger, gate merger, synthesizer, outliner, ingestor, knowledge curator, solver, empirical challenger and victory auditor. These are names only.

## 2. Teamwork

One orchestrator runs a fixed loop and never writes code.

```
Survey -> milestones plus an end-to-end test track
  -> per milestone: Explorer -> Worker -> Reviewer -> Challenger -> Auditor gate
  -> failures: retry, replace, skip, redistribute, redesign
  -> at 16 spawns write a handoff and start a successor
```

Each agent owns `DISPATCH.md`, `BRIEFING.md`, `progress.md` and `handoff.md`. A shared `ORIGINAL_REQUEST.md` holds the request.

| ID | Mechanism | Cost |
| :--- | :--- | :--- |
| L1 | Five-part handoff: observation, logic chain, caveats, conclusion, verification method | Cap each part |
| L2 | Durable per-task mailbox. Make it a view over `messages` and blackboard rows, not a second store | Two writable copies would drift |
| L3 | One shared original request file | None |
| L4 | Survey first with parallel read-only explorers | Only for unfamiliar scope |
| L5 | Gate loop with an independent adversarial role | Tokens, so risky changes only |
| L6 | Explicit failure ladder | Per-step caps |
| L7 | Orchestrator succession by budget | Handoff quality decides |
| L8 | Liveness heartbeat per task. The records show the orchestrator nudging a silent explorer | Noise |

| Teamwork role | Mo-Bot | Gap |
| :--- | :--- | :--- |
| Orchestrator | moAdmin | None |
| Explorer, spec miner | MoDeep | None |
| Worker | moCode | None |
| Reviewer, test writer | MoCI | None |
| Empirical challenger | none | **Yes.** Nothing stress-tests beyond the CI gate |
| Victory auditor with veto | none | **Yes.** The three-tier verdict is not an independent final veto |
| Sentinel | daemon watchdog | Covers processes, not stalled tasks |

Cheapest fix for the gaps: a second adversarial prompt role for MoCI on a different model tier, then a new Bot through `Mo` only if the review catch rate shows a need.

## 3. Goal

Cindy `goal-host`:

1. The host appends a verdict contract to the end of each user message, never to the system prompt, so the cacheable prefix stays stable.
2. The model works with tools and ends with one JSON block: `goal_status` of `complete`, `continue` or `blocked`, plus a reason.
3. Host code parses it and decides whether to run again. The model judges meaning. Code decides continuation, budgets and stopping.
4. Gate: status active, session idle, nothing in flight, guards pass.
5. `complete` requires running the check in the same turn and showing its output.

States: active, paused, blocked, complete, budget limited, usage limited. Complete and budget limited are terminal. Usage limited resumes by itself at the reset time. Billing depletion is not a rate limit, because it needs a human. Guards are per goal and optional. The `agy` changelog says its round cap was removed.

| Defect fixed in agy | Lesson |
| :--- | :--- |
| A fork inherited an active goal and could not stop | Goal is session state. Cancel or clone it at fork |
| A side question in a goal session was forced to continue | Side channels bypass the continuation gate |
| Failed tool calls were returned as ordinary results | Return them as errors |
| Deleting a conversation left subagents and workspaces behind | Delete cascades to child runs |

Cindy pauses a goal on rewind. Use the same rule here: rewind pauses, fork cancels.

**Decision needed.** The project rule allows five autonomous turns before an operator checkpoint, and open-ended goals remove that checkpoint. If goal mode is built here, make a token budget, a round cap and a wall-clock limit mandatory, and treat `blocked` or a spent cap as a checkpoint. This differs from both references.

## 4. Claude primitives

| Primitive | Behavior | Candidate |
| :--- | :--- | :--- |
| Context-isolated threads | Own history, shared sandbox. Subagent threads persist and take follow-ups | Bot lanes already match |
| Advisor | A stronger model is consulted mid-turn. Not a subagent, ends itself, a failed consult never fails the turn, billed at its own rate | L9 |
| Dynamic workflow | The agent writes a program that fans out agents in stages and retries a failed one once | L10 |
| Run limits | 64 concurrent threads, 1,000 agents per run, 24 hour life, 10 open runs, no nesting | Copy the shape, not the values |
| Shared budget | One cap across threads, open runs pause at the cap | L11 |

- **L9 Advisor channel.** A Sonnet-tier Bot consults an Opus-tier model once, with nothing added to the room timeline. It differs from the peer query protocol, which spawns a resumable peer.
- **L10 Declarative stage plan.** moAdmin emits stages with agents, inputs and a join rule. The host validates the schema, checks write-path orthogonality, enforces caps and runs it. A failed agent retries once on a fresh session. Runs do not nest.
- **L11 One budget.** One token budget per round or task, charged by every Bot. At the cap, pause and raise a checkpoint.

## 5. `/boost`

Not studied. To close the gap, paste its help text from an interactive `agy` session, or approve a read-only run of the help command, which sends a model request.

## 6. Layers

| Layer | Unit | Decided by | Stops on | Durable artifact |
| :--- | :--- | :--- | :--- | :--- |
| 1 Turn | One reply | Model proposes, code validates | Single speaker, silent token | `messages` row |
| 2 Round | Several turns | Code | Turn quota, novelty, round token cap | Cursor, blackboard epoch |
| 3 Task | One objective | Model judges, code decides | Verdict, caps, rewind pause | Goal row, verdict log |
| 4 Program | Parallel stages | Code runs a validated plan | Stage caps, one retry | Plan, stage events |
| 5 Project | Milestones | Orchestrator plus independent auditor | Gate, failure ladder, succession | Mailbox, handoffs |

A layer spends only what the layer above granted. That keeps cost bounded while the agents add up.

Order: L1 and L3 first, then L9 and L11 once cost metrics exist, then the rewind and fork wording in the session spec, then L10 and goal mode after the decision in section 3, then L5 gaps only if needed.

```bash
ls .agents/teamwork
grep -nE "'(active|paused|blocked|complete|budgetLimited|usageLimited)'" extensions/Cindy/apps/desktop/src/main/goal-host/types.ts
agy changelog | grep -inE "/goal|/boost|teamwork"
```
