<!--
name: "Skill: Workflow authoring reference"
description: "Reference for authoring Workflow scripts: persistence, metadata, runtime hooks, isolation, concurrency, budgeting, patterns, and resume"
ccVersion: "2.1.326"
variables:
  - "WORKFLOW_INVOCATION_QUALIFIER"
  - "WORKFLOW_SCRIPT_PATH_NOTE"
  - "SUBAGENT_MODEL_FORCE"
  - "WORKFLOW_AGENT_ISOLATION_TYPE"
  - "GET_SUBAGENT_EFFORT_OVERRIDE_FN"
  - "WORKFLOW_AGENT_ISOLATION_NOTE"
  - "WORKFLOW_GROUP_PREFIX"
  - "MAX_WORKFLOW_ITEMS_PER_CALL"
-->
# Workflow authoring reference

Use a workflow to structure multi-agent work with deterministic control flow (loops, conditionals, fan-out) for comprehensive coverage, independent/adversarial verification, or scale beyond one context.

## When and how to run

- **Hybrid pattern:** Scout inline first (list files, scope diff) to discover the work-list, then invoke Workflow to pipeline over it.
- **Single-phase shapes (chainable across turns):**
  - **Understand:** parallel readers over subsystems → structured map
  - **Design:** judge panel of N independent approaches → scored synthesis
  - **Review:** dimensions → find → adversarially verify
  - **Research:** multi-modal sweep → deep-read → synthesize
  - **Migrate:** discover sites → transform each (worktree isolation) → verify
- **Ultracode mode:** When a system reminder/message confirms ultracode is on, author and run workflows for every substantive task by default (token cost is unconstrained; solo only on conversational turns or trivial mechanical edits). For multi-phase work, chain one workflow per phase so you stay in the loop. When ultracode is off, revert to the Workflow tool description's opt-in rule.
- **Script persistence:** Pass scripts inline via `script` (do not `Write` to a file first). Every${WORKFLOW_INVOCATION_QUALIFIER} invocation auto-persists the script under the session directory and returns its path. To iterate, `Write`/`Edit` that file and re-invoke with `{scriptPath: "<path>"}`.${WORKFLOW_SCRIPT_PATH_NOTE}

## Script metadata (`export const meta`)

Every script MUST begin with a **pure literal** `export const meta = {...}` (no variables, calls, spreads, or template interpolation):

```js
export const meta = {
  name: 'find-flaky-tests',
  description: 'Find flaky tests and propose fixes',   // one-line, shown in permission dialog
  phases: [                                            // one entry per phase() call
    { title: 'Scan', detail: 'grep test logs for retries' },
    { title: 'Fix', detail: 'one agent per flaky test' },
  ],
}
phase('Scan')
const flaky = await agent('grep CI logs for retry markers', {schema: FLAKY_SCHEMA})
```

- Required: `name`, `description`. Optional: `whenToUse` (shown in workflow list), `phases`.
- Match `meta.phases` titles exactly to `phase()` calls (unmatched `phase()` calls get separate progress groups).${SUBAGENT_MODEL_FORCE?"":" Add `model` to a phase entry when that phase uses a specific model override."}

## Runtime API

- `agent(prompt: string, opts?: {label?: string, phase?: string, schema?: object,${SUBAGENT_MODEL_FORCE?"":" model?: string,"} effort?: string, isolation?: ${WORKFLOW_AGENT_ISOLATION_TYPE}, agentType?: string}): Promise<any>`: Spawn a subagent.
  - Returns final text as string, or validated object if `schema` (JSON Schema) is set (forces `StructuredOutput` tool; root must be `{type: 'object', properties: {...}}` with `required ⊆ properties`, else `agent()` throws). Returns `null` if user skips or subagent dies on terminal API error (filter with `.filter(Boolean)`).
  - `opts.label`: override display label. `opts.phase`: explicitly assign progress group (use inside `pipeline()`/`parallel()` to avoid races on global `phase()`).
  - ${SUBAGENT_MODEL_FORCE?"":" opts.model overrides the model for this agent call. Default to omitting it — the agent inherits the main-loop model (the resolved session model), which is almost always correct. Only set it when you're highly confident a different tier fits the task; when unsure, omit."} `opts.effort`: `'low' | 'medium' | 'high' | 'xhigh' | 'max'` (omit to ${GET_SUBAGENT_EFFORT_OVERRIDE_FN()===void 0?"inherit the session effort":"use the configured subagent default"}).
  - `opts.isolation: 'worktree'`: fresh git worktree — EXPENSIVE (~200–500ms setup + disk per agent); use ONLY when parallel agents mutate files and would conflict (auto-removed if unchanged).${WORKFLOW_AGENT_ISOLATION_NOTE}
  - `opts.agentType`: custom subagent type (e.g., `'general-purpose'`, `'code-reviewer'`) resolved from Agent tool registry; composes with `schema`.
- `pipeline(items, stage1, stage2, ...): Promise<any[]>`: Default for multi-stage work. Runs each item through stages independently with **no barrier** (wall-clock = slowest single-item chain). Stage callbacks receive `(prevResult, originalItem, index)`. Throwing drops that item to `null` and skips its remaining stages.
- `parallel(thunks: Array<() => Promise<any>>): Promise<any[]>`: Concurrent **barrier** (awaits all thunks; thrown/errored thunk resolves to `null`, never rejects — `.filter(Boolean)` results). Use ONLY when all results are genuinely needed together.
- `log(message: string): void`: Emit narrator line above progress tree.
- `phase(title: string): void`: Start new phase group for subsequent `agent()` calls.
- `args: any`: Verbatim `args` input (`undefined` if omitted). Pass arrays/objects as JSON values (`args: ["a.ts", "b.ts"]`), NOT JSON-encoded strings.
- `budget: {total: number|null, spent(): number, remaining(): number}`: Shared turn output-token budget from `"+500k"`-style directives (`total` is `null` if unset; `remaining()` is `Infinity` if unset). `total` is a HARD ceiling: once `spent() >= total`, further `agent()` calls throw. Guard loops on `budget.total` (e.g., `while (budget.total && budget.remaining() > 50_000)` or `const FLEET = budget.total ? Math.floor(budget.total / 100_000) : 5`).
- `workflow(nameOrRef: string | {scriptPath: string}, args?: any): Promise<any>`: Run a saved workflow by name or `{scriptPath}` inline as a sub-step. Shares concurrency cap, agent counter, abort signal, and token budget (grouped under `"${WORKFLOW_GROUP_PREFIX} name"` in `/workflows`). Nesting is 1 level only (calling `workflow()` inside a child throws). Throws on unknown name / unreadable `scriptPath` / child syntax error.

<runtime_constraints>
- Subagents return raw data (their final text IS the return value).
- Workflow agents reach session-connected MCP tools via `ToolSearch` (caveat: interactively-authenticated MCPs like `claude.ai` may be absent in headless/cron runs).
- Subagents already receive your `CLAUDE.md` files (except built-ins like `Explore` and `Plan`); do not tell them to re-read or paste rules—name only the specific rule needed.
- Scripts are plain JavaScript, NOT TypeScript (no type annotations, interfaces, or generics). Top-level async/`await` is supported.
- Standard JS built-ins work, EXCEPT `Date.now()`, `Math.random()`, and argless `new Date()` throw (they break resume). Pass timestamps via `args`, stamp after return, and vary prompts/labels by index. No filesystem or Node.js API access.
- Concurrency cap: `min(16, available CPUs - 2)` concurrent `agent()` calls per workflow (excess queue). Lifetime cap: 1000 agents per workflow. Max items per `parallel()`/`pipeline()` call: `${MAX_WORKFLOW_ITEMS_PER_CALL}` (exceeding throws an explicit error).
</runtime_constraints>

## `pipeline()` vs. Barriers

Default to `pipeline()`. Use a `parallel()` barrier ONLY when stage N requires cross-item context from all of stage N-1:
- Dedup/merge across full result set before expensive downstream work
- Early-exit on zero total count
- Stage N compares against "other findings"

Do NOT add a barrier just to flatten/map/filter (do it inside a `pipeline` stage: `pipeline(items, stageA, r => transform([r]).flat(), stageB)`), separate conceptual stages, or "cleaner code" (barriers idle fast workers).

## Patterns

### Barrier dedup before verification
```js
const all = await parallel(DIMENSIONS.map(d => () => agent(d.prompt, {schema: FINDINGS_SCHEMA})))
const deduped = dedupeByFileAndLine(all.filter(Boolean).flatMap(r => r.findings))
const verified = await parallel(deduped.map(f => () => agent(verifyPrompt(f), {schema: VERDICT_SCHEMA})))
```

### Loop-until-count / Loop-until-budget
```js
const bugs = []
while (bugs.length < 10) {
  const result = await agent("Find bugs in this codebase.", {schema: BUGS_SCHEMA})
  bugs.push(...result.bugs)
  log(`${bugs.length}/10 found`)
}

// Budget-scaled (ALWAYS guard on budget.total so unbudgeted runs don't hit the 1000-agent cap):
while (budget.total && budget.remaining() > 50_000) {
  const result = await agent("Find bugs in this codebase.", {schema: BUGS_SCHEMA})
  bugs.push(...result.bugs)
  log(`${bugs.length} found, ${Math.round(budget.remaining()/1000)}k remaining`)
}
```

### Exhaustive review (find → dedup vs seen → diverse-lens panel → loop-until-dry)
```js
const seen = new Set(), confirmed = []
let dry = 0
while (dry < 2) {
  const found = (await parallel(FINDERS.map(f => () =>
    agent(f.prompt, {phase: 'Find', schema: BUGS})))).filter(Boolean).flatMap(r => r.bugs)
  const fresh = found.filter(b => !seen.has(key(b)))
  if (!fresh.length) { dry++; continue }
  dry = 0; fresh.forEach(b => seen.add(key(b)))
  const judged = await parallel(fresh.map(b => () =>
    parallel(['correctness','security','repro'].map(lens => () =>
      agent(`Judge "${b.desc}" via the ${lens} lens — real?`, {phase: 'Verify', schema: VERDICT})))
      .then(vs => ({ b, real: vs.filter(Boolean).filter(v => v.real).length >= 2 }))))
  confirmed.push(...judged.filter(v => v.real).map(v => v.b))
}
return confirmed // dedup vs `seen`, NOT `confirmed`, so rejected findings don't loop
```

### Quality patterns (compose and scale to request depth)
- **Adversarial verify:** spawn N skeptics per finding prompted to `REFUTE`; drop if majority refute:
  ```js
  const votes = await parallel(Array.from({length: 3}, () => () =>
    agent(`Try to refute: ${claim}. Default to refuted=true if uncertain.`, {schema: VERDICT})))
  const survives = votes.filter(Boolean).filter(v => !v.refuted).length >= 2
  ```
- **Perspective-diverse verify:** assign distinct lenses (correctness, security, perf, repro) instead of identical refuters.
- **Judge panel:** generate N independent approaches (MVP-first, risk-first, user-first), score in parallel, synthesize winner + best runner-up ideas.
- **Loop-until-dry:** repeat discovery until K consecutive rounds yield nothing new.
- **Multi-modal sweep:** parallel agents searching by different axes (container, content, entity, time).
- **Completeness critic:** final agent checking for missed modalities, unverified claims, or unread sources.
- **No silent caps:** `log()` any dropped items when bounding coverage (top-N, no-retry, sampling).
- **Scaling:** quick checks ("find any bugs") → small finder pool, single-vote verify; thorough audits ("thoroughly audit", "be comprehensive") → larger pool, 3–5 vote adversarial pass, synthesis.

## Resume

- Relaunch with `Workflow({scriptPath, resumeFromRunId})` using `runId` from the tool result: the longest unchanged prefix of `agent()` calls returns cached results; the first edited, new, failed, or unstarted call and everything after runs live.
- Before diagnosing empty/unexpected results from a completed workflow, `Read` `<transcriptDir>/journal.jsonl` for actual `agent()` return values (do not assume cached results are non-empty).
- Fallback if no journal exists: `Read` `agent-<id>.jsonl` in the transcript directory and hand-author a continuation script.