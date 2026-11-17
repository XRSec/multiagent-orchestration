---
doc_id: PASEO-BOTS-WORKFLOW-ROUTING
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Paseo Bots Workflow Engine, Subagent Routing & Session Injection Specification

## 1. Scope & Architectural Overview

This specification defines the three-tier execution hierarchy, declarative Stage Directed Acyclic Graph (DAG) engine, orchestrator-worker dual-end protocol, and per-session tool/skill injection mechanisms in the Paseo Bots plugin (`paseo-bots`).

Primary codebase coordinates:
- Workflow definitions & DAG algorithms: `<projectRoot>/paseo-bots/shared/workflows.ts`, symbols `validateWorkflowDAG`, `resolveStepEngine`, `readyStages`, `initWorkflowRunState`, `buildStageBriefPrompt`, `parseWorkerHandoff`
- Workflow execution runner: `<projectRoot>/paseo-bots/server/workflow-runner.ts`, symbol `runWorkflowDag`
- Workflow MCP tool: `<projectRoot>/paseo-bots/server/tools/workflows.ts`, symbols `runWorkflowTool`, `startWorkflowExecution`, `resolveWorkflowForCaller`
- Workflow settings & schemas: `<projectRoot>/paseo-bots/shared/bot.ts`, symbols `WorkflowDefinitionSchema`, `botSettings` (`values.workflows`, `groups[].workflows`)
- Task timeline cards: `<projectRoot>/paseo-bots/shared/task-card.ts`, symbol `TaskCardWorkflowSchema`; `<projectRoot>/paseo-bots/server/task-cards.ts`, symbol `publishWorkflowCard`
- Per-session MCP & skill injection: `<projectRoot>/paseo-bots/server/claude-agents.ts`, symbols `assertNotGlobalUserConfig`, `syncClaudeMcpConfig`, `syncClaudeSkills`, `renderClaudeAgentFile`, `syncBotToClaudeAgent`
- Visual DAG management UI: `<projectRoot>/paseo-bots/client/settings/WorkflowEditor.tsx`; timeline card UI: `<projectRoot>/paseo-bots/client/chat/stream/TaskCard.tsx`

---

## 2. Three-Tier Routing Matrix & Step Engine Resolution

Paseo Bots executes sub-tasks across three distinct execution tiers depending on isolation, statefulness, and orchestration requirements:

| Dimension | Route 1: Native Subagent | Route 2: Persistent Bot Session | Route 3: Declarative Workflow DAG |
| :--- | :--- | :--- | :--- |
| **Engine Identifier** | `"native"` | `"paseo-bot"` | `"auto" \| "native" \| "paseo-bot"` per stage |
| **Dispatch Mechanism** | Provider native tool (`invoke_subagent`, `delegate_task`) | Host chat session via `startChat` / `ask_bot` | Topological wave execution via `run_workflow` / `runWorkflowDag` |
| **State & Memory** | Ephemeral, stateless single-turn worker | Persistent `MEMORY.md`, topic files, and session history | Isolated per-stage chats; pipeline state tracked in `WorkflowRunState` |
| **Context Overhead** | Minimal (brief prompt only) | Full prompt context (`SOUL.md`, tools, app connections) | Structured `<task_brief>` / `<repair_brief>` with upstream outputs |
| **Tool Scope** | Provider-native base tools | Bot-specific tools, library skills, and Composio apps | Stage bot tools, with optional per-session MCP/skill injection |
| **Error Handling** | Host-level timeout or provider error | Interactive error retry or follow-up `ask_bot` call | Bounded retry loop (`maxRetries`) with `<repair_brief>` context |
| **Primary Use Cases** | Single-shot code generation, isolated file edits | Interactive cross-bot consulting, stateful investigations | Multi-stage delivery pipelines (e.g. Research -> Code -> QA) |

### 2.1 Heuristic Step Engine Resolution (`resolveStepEngine`)

When a stage specifies `engine: "auto"` (the default in `WorkflowStageDefinitionSchema`), the engine heuristically determines the execution tier via `resolveStepEngine` (`shared/workflows.ts`):

1. **Explicit Override**: If `requestedEngine === "native"` or `"paseo-bot"`, the explicit selection is returned directly.
2. **Provider Capability Check**: If `provider === "codex"`, `"paseo-bot"` is selected because Codex lacks a native subagent tool.
3. **Statefulness Check**: If the target bot defines playbooks (`bot.playbooks.length > 0`) or enables peer communication (`bot.contactBots !== "off"`), `"paseo-bot"` is selected to preserve state and tool bindings.
4. **Stateless Fallback**: All other bots resolve to `"native"` for lower overhead and isolated execution.

---

## 3. Declarative Workflow DAG Engine

### 3.1 Data Structures & Validation

Workflows are modeled as declarative DAGs persisted globally in `values.workflows` or team-scoped in `values.groups[].workflows`:

- **Stage Definition (`WorkflowStageDefinitionSchema`)**:
  - `id`: Non-empty string identifier (e.g. `"research"`, `"code"`, `"review"`).
  - `name`: Human-readable stage title.
  - `botId`: ID of the specialist bot assigned to execute the stage.
  - `prompt`: Stage specification or template instructions (max 20,000 characters).
  - `engine`: `"auto"` (default), `"native"`, or `"paseo-bot"`.
  - `dependsOn`: Array of prerequisite stage IDs.
  - `maxRetries`: Bounded retry count on stage failure (default `1`, max `10`).
- **Workflow Definition (`WorkflowDefinitionSchema`)**: Contains `id`, `name`, `description`, and `stages: z.array(WorkflowStageDefinitionSchema).min(1).max(50)`.
- **Runtime State (`WorkflowRunStateSchema`)**: Tracks overall workflow status (`"running" | "done" | "failed"`), active `currentStageIds`, and per-stage `TaskStageStateSchema` (`status`, `retries`, `maxRetries`, `output`, `error`, `chatId`, `startedAt`, `completedAt`).

### 3.2 Cycle Detection & Layer Partitioning (`validateWorkflowDAG`)

`validateWorkflowDAG` (`shared/workflows.ts`) enforces DAG integrity using Kahn's algorithm:
- Verifies that all `dependsOn` references point to known stages within the workflow.
- Verifies that no stage depends on itself.
- Computes in-degrees and partitions stages into parallel topological execution layers (`layers: string[][]`).
- Detects circular dependencies: if processed nodes count does not match total stages count, validation fails with `"Cyclic dependency detected in workflow stages."`.

### 3.3 Execution Lifecycle (`runWorkflowDag`)

`runWorkflowDag` (`server/workflow-runner.ts`) orchestrates stage execution:

1. **Validation & Initialization**: Validates the DAG and initializes `WorkflowRunState` with `initWorkflowRunState`.
2. **Topological Readiness (`readyStages`)**: Filters stages where `status === "pending"` and all dependencies in `dependsOn` have `status === "done"`.
3. **Parallel Wave Dispatch**: All ready stages in the current wave are marked `"running"` and executed concurrently (subject to optional `task.budget.fanout` limits).
4. **Context Propagation**: Upstream outputs are collected and injected into each stage's prompt via `buildStageBriefPrompt`.
5. **Failure & Cascading Skip**: If any stage fails after exhausting its `maxRetries`:
   - The workflow status transitions to `"failed"`.
   - Remaining unexecuted stages with `status === "pending"` transition to `"skipped"`.
   - Active stages complete or abort, and the final state is settled.
6. **Task Card Synchronization**: Throughout execution, `publishWorkflowCard` pushes live progress cards (`TaskCardWorkflowSchema`) to the chat timeline, and `settleAndPublish` emits the terminal card state upon completion.

---

## 4. Dual-End Contract & Bounded Repair Protocol

Multi-agent workflow execution requires clear role boundaries between the orchestrator (caller) and workers (stage executants).

### 4.1 Orchestrator Protocol (`ORCHESTRATOR_WORKFLOW_PROTOCOL`)

The orchestrator adheres to four operational invariants:
1. **Zero Direct Execution**: Never execute multi-stage worker tasks directly; delegate implementation and research to specialist bots via `run_workflow`.
2. **Self-Contained Briefs**: Provide complete objectives, scope constraints, and acceptance criteria in stage inputs; workers lack conversational history.
3. **Zero-Trust Audit**: Validate reported outputs and verification proofs rather than accepting bare claims.
4. **Bounded Repair**: Stage retries are strictly bounded (`maxRetries`); escalate to the human operator if retries are exhausted.

### 4.2 Task Brief & Repair Brief Generation (`buildStageBriefPrompt`)

`buildStageBriefPrompt` (`shared/workflows.ts`) composes the prompt dispatched to the stage worker:

- **Initial Attempt (`attempt === 1`)**:
  ```text
  <task_brief>
  - WORKFLOW: <workflowName>
  - STAGE_ID: <stage.id>
  - STAGE_NAME: <stage.name>
  - WORKFLOW_INPUT: <userInput>
  - UPSTREAM_CONTEXT:
  ### From "<upstreamName>" (<upstreamId>):
  <upstreamOutput>
  - SPECIFICATION:
  <stagePrompt>
  </task_brief>
  ```
- **Retry Attempt (`attempt > 1`)**: Prepends a targeted `<repair_brief>` diagnosing the failure:
  ```text
  <repair_brief>
  - WORKFLOW: <workflowName>
  - STAGE_ID: <stage.id> (<stage.name>)
  - ATTEMPT: <attempt>/<maxRetries + 1>
  - PREVIOUS_FAILURE: <previousError>
  - INSTRUCTION: Diagnose the failure above, apply only the minimal surgical fix required without rewriting working parts, and re-verify.
  </repair_brief>
  ```
- Both initial and retry prompts append the mandatory `WORKER_PROTOCOL_SUFFIX`.

### 4.3 Worker Protocol & Structured Handoff (`WORKER_PROTOCOL_SUFFIX`, `parseWorkerHandoff`)

Every worker response must terminate with a structured `<worker_handoff>` block:

```text
<worker_protocol>
Execute ONLY the instructions in the brief above.
RULES:
1. STRICT SCOPE: Modify ONLY files or targets explicitly authorized. Do not refactor unrelated code.
2. NO SILENT FALLBACKS: Never fake passing tests or stub incomplete work. Set STATUS to BLOCKED if blocked.
3. MANDATORY VERIFICATION: Run verification checks before reporting completion.
4. DISTILLED HANDOFF: End your response with this structured block:
<worker_handoff>
STATUS: PASS | PARTIAL | BLOCKED | FAILED
SUMMARY: <1-3 concise bullets of changes/findings>
TOUCHED_FILES: <paths or "None">
VERIFICATION_PROOF: <command, exit code, and 3-10 line excerpt>
OPEN_ISSUES: <None | exact blocker>
</worker_handoff>
</worker_protocol>
```

`parseWorkerHandoff` parses the output:
- If `<worker_handoff>` reports `STATUS: FAILED` or `STATUS: BLOCKED`, the stage is treated as failed, triggering bounded retry or pipeline abort.
- If the block is omitted (backward compatibility for unconstrained models), `status` defaults to `"UNKNOWN"` and the reply text is preserved without failing the stage automatically.

---

## 5. Bot CLI Per-Session MCP & Skill Injection

When executing bots through the Claude Code CLI or external harnesses, Paseo isolates configurations per project and per session to maintain system hygiene.

### 5.1 Zero Global Pollution Invariant (`assertNotGlobalUserConfig`)

To prevent multi-agent workloads from overwriting the operator's personal global configurations, `assertNotGlobalUserConfig` (`server/claude-agents.ts`) strictly forbids writing to:
- `~/.claude.json`
- `~/.claude/settings.json*`
- `~/.gemini/config/skills*`
- `~/.gemini/settings.json*`

Any attempt to target these global user directories throws an immediate error.

### 5.2 Per-Session & Project-Scoped MCP Configuration

MCP servers assigned to a bot are projected to scoped configuration files without touching host globals:
1. **Project Configuration (`defaultClaudeMcpPath`)**: `<projectRoot>/.mcp.json` is updated via `syncClaudeMcpConfig`, merging stdio and HTTP/SSE MCP server definitions.
2. **Session Configuration (`sessionClaudeMcpPath`)**: `<botDataDir>/mcp.json` is written for CLI invocation via `--mcp-config <sessionMcpPath>`, guaranteeing complete session isolation.

### 5.3 Per-Session Skill Symlinking (`syncClaudeSkills`)

Skills enabled for a bot are projected into `<projectRoot>/.claude/skills/`:
- `syncClaudeSkills` creates filesystem symlinks (or directory junctions on Windows) from `<projectRoot>/paseo-bots-plugin-data/library/skills/<skillId>` to `<projectRoot>/.claude/skills/<skillId>`.
- Stale or unassigned skill symlinks in the target directory are automatically pruned (`unlink`).
- `assertNotGlobalUserConfig` ensures the target directory does not resolve to user-global skill roots.

### 5.4 Claude Agent File Projection (`renderClaudeAgentFile`)

`syncBotToClaudeAgent` generates `<projectRoot>/.claude/agents/<bot.id>.md`:
- YAML Frontmatter: Declares `name`, `description`, `managedBy: paseo-bots`, `tools`, `permissionMode`, `skills: [...]`, and `mcpServers: { ... }`.
- Markdown Body: Renders bot role, standing instructions (`SOUL.md`), long-term memory path (`<botDataDir>/MEMORY.md`), daily log paths, and preloaded skill listing.

---

## 6. Conformance Table (D8)

| Component / Symbol | Coordinate | Status | Verification Command |
| :--- | :--- | :--- | :--- |
| DAG Validation | `paseo-bots/shared/workflows.ts`, `validateWorkflowDAG` | CURRENT | `npm --prefix paseo-bots test tests/workflows.test.ts` |
| Step Engine Resolution | `paseo-bots/shared/workflows.ts`, `resolveStepEngine` | CURRENT | `npm --prefix paseo-bots test tests/workflows.test.ts` |
| Ready Stages Resolution | `paseo-bots/shared/workflows.ts`, `readyStages` | CURRENT | `npm --prefix paseo-bots test tests/workflows.test.ts` |
| Brief & Handoff Protocols | `paseo-bots/shared/workflows.ts`, `buildStageBriefPrompt`, `parseWorkerHandoff` | CURRENT | `npm --prefix paseo-bots test tests/workflows.test.ts` |
| Workflow Runner | `paseo-bots/server/workflow-runner.ts`, `runWorkflowDag` | CURRENT | `npm --prefix paseo-bots test tests/workflow-runner.test.ts` |
| Workflow Tool | `paseo-bots/server/tools/workflows.ts`, `runWorkflowTool` | CURRENT | `npm --prefix paseo-bots test tests/workflow-tool.test.ts` |
| Zero Global Pollution Guard | `paseo-bots/server/claude-agents.ts`, `assertNotGlobalUserConfig` | CURRENT | `npm --prefix paseo-bots test tests/claude-agents.test.ts` |
| Claude MCP Sync | `paseo-bots/server/claude-agents.ts`, `syncClaudeMcpConfig` | CURRENT | `npm --prefix paseo-bots test tests/claude-agents.test.ts` |
| Claude Skills Sync | `paseo-bots/server/claude-agents.ts`, `syncClaudeSkills` | CURRENT | `npm --prefix paseo-bots test tests/claude-agents.test.ts` |
| Claude Agent Projection | `paseo-bots/server/claude-agents.ts`, `syncBotToClaudeAgent` | CURRENT | `npm --prefix paseo-bots test tests/claude-agents.test.ts` |
| Full TypeScript Typecheck | `paseo-bots/` package root | CURRENT | `npm --prefix paseo-bots run typecheck` |
