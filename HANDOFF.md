# Session Handoff: Multi-Agent Orchestration Engine

## 1. Goal & Execution Scope
| Field | Value |
| :--- | :--- |
| **Workspace** | `/Users/xr/IDEA.localized/multiagent-orchestration` |
| **Objective** | Architect and scaffold a multi-subagent collaboration tool modeled after Cindy App, powered by native `claude` (Claude Code CLI) headless subprocess execution. |
| **Core Topologies** | User-Agent DM, Agent-to-Agent P2P, Group Chat Timeline, Pipeline Relay (Handoff), Concurrency Dispatch (Fan-out / Fan-in), Directed Mention Assignment. |

---

## 2. Key Architectural Decisions
| Category | Decision / Invariant | Rationale |
| :--- | :--- | :--- |
| **Engine Foundation** | Native `claude` CLI (`/opt/homebrew/bin/claude`) | Eliminates proprietary SDK overhead; leverages built-in session resumption (`--resume`), tool execution, and local credential management. |
| **Execution Pattern** | `claude -p "<PROMPT>" --resume "<UUID>" --system-prompt-file "<PATH>" --output-format json --dangerously-skip-permissions` | Guarantees non-interactive headless execution without terminal confirmation blocking. |
| **Protocol Enforcement** | Machine Action Protocol (MAP) | Delimited `<!-- CINDY_MAP:BEGIN -->...<!-- CINDY_MAP:END -->` JSON envelopes emitted on stdout for deterministic state transitions. |
| **Side-Channel Isolation** | Agent-to-Agent P2P | Dedicated ephemeral namespace `p2p_*` with strict recursion bound ($CallDepth \le 3$) to prevent timeline pollution and chatter loops. |
| **Language Discipline** | Standing Order: Strict `en-US` for internal specs | Machine-first, zero fluff, deterministic schema-first specifications. |

---

## 3. Files Touched & Initialized

All files located under `/Users/xr/IDEA.localized/multiagent-orchestration/`:

- **Master Charter & Invariants**:
  - `AGENTS.md`: Root operational charter, interaction topologies, and execution invariants.
  - `CLAUDE.md`: Direct CLI command execution entry points.
  - `package.json`: Minimal Node.js ESM package configuration.
- **Specifications & Protocols**:
  - `docs/architecture.md`: Runtime subprocess lifecycle and session allocation table.
  - `docs/protocols/map-protocol.md`: JSON schema for MAP action envelopes.
  - `docs/protocols/relay-protocol.md`: Pipeline sequential relay state machine.
  - `docs/protocols/dispatch-protocol.md`: Fan-out concurrency and barrier aggregation.
  - `docs/protocols/p2p-protocol.md`: Agent P2P side-channel isolation and recursion limits.
- **Agent Registry & Subagent Charters**:
  - `agents/registry.json`: Registry metadata for orchestrator, researcher, coder, reviewer.
  - `agents/orchestrator/AGENTS.md` & `system-prompt.md`
  - `agents/researcher/AGENTS.md` & `system-prompt.md`
  - `agents/coder/AGENTS.md` & `system-prompt.md`
  - `agents/reviewer/AGENTS.md` & `system-prompt.md`

---

## 4. Risks & Verification Anchors

> **Subprocess Permissions**: Non-interactive headless calls MUST include `--dangerously-skip-permissions`. Omitting this will cause the subprocess to hang indefinitely awaiting interactive tty confirmation.

> **P2P Recursion Halting**: The host driver must actively increment and inspect the recursion depth header in P2P packets. If $CallDepth > 3$, it must forcibly terminate the dialogue turn.

---

## 5. Next Steps for Upcoming Session

- [ ] **Core Subprocess Runner**: Implement `src/core/claude-subprocess.mjs` using Node.js `child_process.spawn` to handle command execution, stdout stream buffering, and error handling.
- [ ] **MAP Protocol Parser**: Implement `src/core/map-parser.mjs` to extract and validate `<!-- CINDY_MAP:BEGIN -->...<!-- CINDY_MAP:END -->` blocks from subprocess stdout.
- [ ] **Session & Timeline Storage**: Implement `src/session/timeline-manager.mjs` for persisting DM and Group append-only events.
- [ ] **Collaboration Handlers**:
  - [ ] Implement `src/collaboration/relay.mjs` (pipeline transitions).
  - [ ] Implement `src/collaboration/dispatch.mjs` (`Promise.allSettled` fan-out with timeout).
  - [ ] Implement `src/collaboration/p2p.mjs` (isolated subagent queries).
- [ ] **End-to-End CLI Harness**: Create `src/index.mjs` providing a command-line interface to test DM, Group Chat, Relay, and Dispatch workflows.
