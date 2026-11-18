import { z } from "zod";

// Route 3: Workflow Engine ("workflow 工作流")
// Declarative Stage DAG, topological dependency resolution, bounded retries,
// and hybrid step dispatch engines ("auto" | "native" | "paseo-bot").

export const WorkflowStepEngineSchema = z.enum(["auto", "native", "paseo-bot"]);
export type WorkflowStepEngine = z.infer<typeof WorkflowStepEngineSchema>;

export const WorkflowStageDefinitionSchema = z.object({
  /** Unique stage identifier within the workflow (e.g. "research", "code", "review"). */
  id: z.string().trim().min(1).max(100),
  /** Human-readable stage name. */
  name: z.string().trim().min(1).max(100),
  /** Designated specialist bot id for this stage. */
  botId: z.string().trim().min(1).max(100),
  /** Prompt template or instructions for this stage. */
  prompt: z.string().max(20000).default(""),
  /** Dispatch engine: "auto" (default heuristic), "native" (Route 1), or "paseo-bot" (Route 2). */
  engine: WorkflowStepEngineSchema.default("auto"),
  /** IDs of stages that must complete before this stage starts. */
  dependsOn: z.array(z.string().trim().min(1).max(100)).default([]),
  /** Bounded retry attempts on stage failure (default 1). */
  maxRetries: z.number().int().min(0).max(10).default(1),
  /** Optional stage-level skill overrides or additions. */
  skillIds: z.array(z.string().trim().min(1).max(100)).optional(),
  /** Optional stage-level MCP server overrides or additions. */
  mcpServerIds: z.array(z.string().trim().min(1).max(100)).optional(),
});
export type WorkflowStageDefinition = z.infer<typeof WorkflowStageDefinitionSchema>;

export const WorkflowDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(""),
  stages: z.array(WorkflowStageDefinitionSchema).min(1).max(50),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

export const TaskStageStatusSchema = z.enum(["pending", "running", "done", "failed", "skipped"]);
export type TaskStageStatus = z.infer<typeof TaskStageStatusSchema>;

export const TaskStageStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  botId: z.string(),
  engine: z.enum(["native", "paseo-bot"]),
  status: TaskStageStatusSchema,
  dependsOn: z.array(z.string()).default([]),
  retries: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(1),
  error: z.string().nullable().default(null),
  output: z.string().nullable().default(null),
  handoffFilePath: z.string().optional(),
  chatId: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  prompt: z.string().nullable().optional().default(null),
  skillIds: z.array(z.string()).optional(),
  mcpServerIds: z.array(z.string()).optional(),
});
export type TaskStageState = z.infer<typeof TaskStageStateSchema>;

export const WorkflowRunStateSchema = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  status: z.enum(["running", "done", "failed"]),
  stages: z.array(TaskStageStateSchema),
  currentStageIds: z.array(z.string()).default([]),
  startedAt: z.string(),
  completedAt: z.string().nullable().default(null),
  teamSessionId: z.string().optional(),
  sessionBoardPath: z.string().optional(),
});
export type WorkflowRunState = z.infer<typeof WorkflowRunStateSchema>;

export interface DagValidationResult {
  valid: boolean;
  error?: string;
  layers?: string[][];
}

/**
 * Validates a declarative stage DAG:
 * - Stage IDs must be non-empty and unique.
 * - `dependsOn` must reference declared stage IDs within the workflow.
 * - No self-dependencies.
 * - No circular dependencies (DAG cycle detection via Kahn's algorithm).
 * - Computes parallel execution layers when valid.
 */
export function validateWorkflowDAG(stages: readonly WorkflowStageDefinition[]): DagValidationResult {
  if (stages.length === 0) {
    return { valid: false, error: "Workflow must have at least one stage." };
  }

  const stageIds = new Set<string>();
  for (const stage of stages) {
    if (!stage.id.trim()) {
      return { valid: false, error: "Stage id cannot be empty." };
    }
    if (stageIds.has(stage.id)) {
      return { valid: false, error: `Duplicate stage id "${stage.id}".` };
    }
    stageIds.add(stage.id);
  }

  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of stageIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const stage of stages) {
    for (const dep of stage.dependsOn) {
      if (!stageIds.has(dep)) {
        return { valid: false, error: `Stage "${stage.id}" depends on unknown stage "${dep}".` };
      }
      if (dep === stage.id) {
        return { valid: false, error: `Stage "${stage.id}" cannot depend on itself.` };
      }
      adj.get(dep)!.push(stage.id);
      inDegree.set(stage.id, (inDegree.get(stage.id) ?? 0) + 1);
    }
  }

  // Kahn's algorithm for topological sorting and layer partitioning
  const layers: string[][] = [];
  let currentLayer = stages.filter((s) => (inDegree.get(s.id) ?? 0) === 0).map((s) => s.id);
  let processedCount = 0;

  while (currentLayer.length > 0) {
    layers.push(currentLayer);
    processedCount += currentLayer.length;
    const nextLayer: string[] = [];

    for (const node of currentLayer) {
      for (const neighbor of adj.get(node) ?? []) {
        const nextDeg = (inDegree.get(neighbor) ?? 0) - 1;
        inDegree.set(neighbor, nextDeg);
        if (nextDeg === 0) {
          nextLayer.push(neighbor);
        }
      }
    }
    currentLayer = nextLayer;
  }

  if (processedCount !== stages.length) {
    return { valid: false, error: "Cyclic dependency detected in workflow stages." };
  }

  return { valid: true, layers };
}

/**
 * Heuristically resolves the dispatch engine for a workflow step:
 * - "native": Route 1 (harness native subagent)
 * - "paseo-bot": Route 2 (persistent bot session with systemPrompt / ask_bot)
 * - "auto": inspects bot configuration and provider capabilities:
 *   - Provider "codex" has no subagent tool -> "paseo-bot"
 *   - If bot has memory, playbooks, or contactBots !== "off" -> "paseo-bot"
 *   - Otherwise (stateless, single-shot) -> "native"
 */
export function resolveStepEngine(
  requestedEngine: WorkflowStepEngine,
  bot: { soul?: string; playbooks?: unknown[]; contactBots?: string } | null,
  provider?: string,
): "native" | "paseo-bot" {
  if (requestedEngine === "native") return "native";
  if (requestedEngine === "paseo-bot") return "paseo-bot";

  // "auto" heuristics
  if (provider === "codex") return "paseo-bot";
  if (bot) {
    const hasPlaybooks = Array.isArray(bot.playbooks) && bot.playbooks.length > 0;
    const isStatefulContact = bot.contactBots && bot.contactBots !== "off";
    if (hasPlaybooks || isStatefulContact) {
      return "paseo-bot";
    }
  }
  return "native";
}

/**
 * Returns stages that are ready for execution:
 * Status is "pending" and all dependencies in `dependsOn` are "done".
 */
export function readyStages(stages: readonly TaskStageState[]): TaskStageState[] {
  const doneIds = new Set(stages.filter((s) => s.status === "done").map((s) => s.id));
  return stages.filter((stage) => {
    if (stage.status !== "pending") return false;
    return stage.dependsOn.every((depId) => doneIds.has(depId));
  });
}

/**
 * Initializes a runtime WorkflowRunState from a WorkflowDefinition.
 */
export function initWorkflowRunState(
  workflow: WorkflowDefinition,
  botLookup?: (botId: string) => { soul?: string; playbooks?: unknown[]; contactBots?: string } | null,
  providerLookup?: (botId: string) => string | undefined,
  context?: { teamSessionId?: string; sessionBoardPath?: string },
): WorkflowRunState {
  const now = new Date().toISOString();
  const stages: TaskStageState[] = workflow.stages.map((stage) => {
    const bot = botLookup ? botLookup(stage.botId) : null;
    const provider = providerLookup ? providerLookup(stage.botId) : undefined;
    const engine = resolveStepEngine(stage.engine, bot, provider);
    return {
      id: stage.id,
      name: stage.name,
      botId: stage.botId,
      engine,
      status: "pending",
      dependsOn: [...stage.dependsOn],
      retries: 0,
      maxRetries: stage.maxRetries ?? 1,
      error: null,
      output: null,
      chatId: null,
      startedAt: null,
      completedAt: null,
      prompt: stage.prompt || null,
    };
  });

  const ready = readyStages(stages).map((s) => s.id);

  return {
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: "running",
    stages,
    currentStageIds: ready,
    startedAt: now,
    completedAt: null,
    ...(context?.teamSessionId ? { teamSessionId: context.teamSessionId } : {}),
    ...(context?.sessionBoardPath ? { sessionBoardPath: context.sessionBoardPath } : {}),
  };
}

/**
 * Formats a clean progress summary string for a workflow run.
 */
export function workflowSummaryText(run: WorkflowRunState): string {
  const done = run.stages.filter((s) => s.status === "done").length;
  const failed = run.stages.filter((s) => s.status === "failed").length;
  const running = run.stages.filter((s) => s.status === "running").length;
  const total = run.stages.length;

  const parts: string[] = [`${done}/${total} done`];
  if (running > 0) parts.push(`${running} running`);
  if (failed > 0) parts.push(`${failed} failed`);

  return `Workflow "${run.workflowName}" [${run.status}]: ${parts.join(", ")}`;
}

// ------------------------------------------------------------------ Dual-End Protocols (Orchestrator & Worker)

export const ORCHESTRATOR_WORKFLOW_PROTOCOL = [
  "Workflow Orchestration Protocol:",
  "1. ZERO DIRECT EXECUTION: Delegate implementation/research stages via run_workflow or specialist bots; do not execute multi-stage worker tasks directly.",
  "2. SELF-CONTAINED BRIEFS: Provide explicit objective, scope, and acceptance criteria in run_workflow input; workers lack your conversation history.",
  "3. ZERO-TRUST AUDIT: Verify reported outputs and proof rather than accepting bare claims.",
  "4. BOUNDED REPAIR: Stage retries are capped (max 3); escalate to the user if a stage exhausts retries.",
].join("\n");

export const WORKER_PROTOCOL_SUFFIX = `<worker_protocol>
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
</worker_protocol>`;

export const MAX_INLINE_UPSTREAM_CHARS = 2000;

export interface StageBriefInput {
  workflowName: string;
  stage: WorkflowStageDefinition;
  userInput?: string;
  role?: string;
  upstreamOutputs?: Array<{
    stageId: string;
    stageName: string;
    output: string;
    handoffFilePath?: string | null;
  }>;
  sessionBoardPath?: string;
  attempt: number;
  previousError?: string | null;
}

/**
 * Builds a self-contained <task_brief> (attempt 1) or <repair_brief> (retry > 1)
 * with upstream stage outputs and the Worker handoff protocol suffix.
 */
export function buildStageBriefPrompt(input: StageBriefInput): string {
  const sections: string[] = [];

  if (input.attempt > 1 && input.previousError) {
    sections.push([
      "<repair_brief>",
      `- WORKFLOW: ${input.workflowName}`,
      `- STAGE_ID: ${input.stage.id} (${input.stage.name})`,
      `- ATTEMPT: ${input.attempt}/${(input.stage.maxRetries ?? 1) + 1}`,
      `- PREVIOUS_FAILURE: ${input.previousError}`,
      "- INSTRUCTION: Diagnose the failure above, apply only the minimal surgical fix required without rewriting working parts, and re-verify.",
      "</repair_brief>",
    ].join("\n"));
  }

  const upstreamBlock = input.upstreamOutputs && input.upstreamOutputs.length > 0
    ? input.upstreamOutputs
        .map((up) => {
          const raw = up.output.trim();
          let text = raw;
          const handoffMatch = extractWorkerHandoffBlock(raw);

          if (raw.length > MAX_INLINE_UPSTREAM_CHARS) {
            if (handoffMatch) {
              const handoffBlock = handoffMatch.fullMatch.trim();
              if (handoffBlock.length > MAX_INLINE_UPSTREAM_CHARS) {
                // If handoff block alone exceeds MAX_INLINE_UPSTREAM_CHARS, preserve head
                // and tail (which contains VERIFICATION_PROOF and OPEN_ISSUES) so proofs are never truncated away.
                const tailBudget = Math.floor(MAX_INLINE_UPSTREAM_CHARS * 0.7);
                const headBudget = MAX_INLINE_UPSTREAM_CHARS - tailBudget - 20;
                text = `${handoffBlock.slice(0, headBudget)}\n...[truncated]...\n${handoffBlock.slice(-tailBudget)}`;
              } else {
                // Preserve handoff block first, then fill remaining budget with prose/summary
                const remainingBudget = MAX_INLINE_UPSTREAM_CHARS - handoffBlock.length;
                const prose = raw.replace(handoffMatch.fullMatch, "").trim();
                if (prose.length > 0 && remainingBudget > 30) {
                  const truncatedProse = prose.length > remainingBudget
                    ? prose.slice(0, remainingBudget - 16).trim() + "\n...[truncated]"
                    : prose;
                  text = `${truncatedProse}\n\n${handoffBlock}`;
                } else {
                  text = handoffBlock;
                }
              }
            } else {
              text = raw.slice(0, MAX_INLINE_UPSTREAM_CHARS) + "\n...[truncated]";
            }
          } else if (handoffMatch) {
            text = handoffMatch.fullMatch.trim();
          }

          const citation = up.handoffFilePath ? `\nFull upstream output saved at: ${up.handoffFilePath}` : "";
          return `### From "${up.stageName}" (${up.stageId}):\n${text}${citation}`;
        })
        .join("\n\n")
    : "";

  const boardPath = input.sessionBoardPath?.trim();
  sections.push([
    "<task_brief>",
    `- WORKFLOW: ${input.workflowName}`,
    `- STAGE_ID: ${input.stage.id}`,
    `- STAGE_NAME: ${input.stage.name}`,
    boardPath ? `- SESSION_BOARD: ${boardPath}` : "",
    boardPath ? `- TASK_MANIFEST: ${boardPath}/TASK_MANIFEST.md` : "",
    input.userInput?.trim() ? `- WORKFLOW_INPUT:\n${input.userInput.trim()}` : "",
    upstreamBlock ? `- UPSTREAM_CONTEXT:\n${upstreamBlock}` : "",
    `- SPECIFICATION:\n${input.stage.prompt.trim() || `Complete stage "${input.stage.name}".`}`,
    "</task_brief>",
  ].filter(Boolean).join("\n"));

  const promptSources = [
    input.stage.prompt,
    input.role,
  ].filter(Boolean).join("\n");

  const alreadyHasProtocol = /<worker_handoff>|worker_protocol/i.test(promptSources);
  if (!alreadyHasProtocol) {
    sections.push(WORKER_PROTOCOL_SUFFIX);
  }
  return sections.join("\n\n");
}

export interface ParsedWorkerHandoff {
  hasBlock: boolean;
  status: "PASS" | "PARTIAL" | "BLOCKED" | "FAILED" | "UNKNOWN";
  summary: string;
  touchedFiles: string;
  verificationProof: string;
  dodChecklist: string;
  openIssues: string;
}

const HANDOFF_FIELDS = "STATUS|SUMMARY|TOUCHED_FILES|VERIFICATION_PROOF|DOD_CHECKLIST|OPEN_ISSUES";

function extractHandoffField(body: string, field: string): string {
  const re = new RegExp(
    `^[ \\t]*(?:[-*]\\s*)?(?:\\*\\*)?${field}(?:\\*\\*)?\\s*:\\s*(?:\\*\\*)?\\s*([\\s\\S]*?)(?=^[ \\t]*(?:[-*]\\s*)?(?:\\*\\*)?(?:${HANDOFF_FIELDS})(?:\\*\\*)?\\s*:|$)`,
    "im",
  );
  const m = re.exec(body);
  return m?.[1]?.replace(/\*\*$/, "").trim() ?? "";
}

export interface ExtractedWorkerHandoffBlock {
  fullMatch: string;
  body: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Extracts the LAST valid closed <worker_handoff>...</worker_handoff> block outside inline backticks.
 * Prevents prose mentions like `<worker_handoff>` from tricking a left-greedy regex into swallowing
 * all intervening prose up to the actual closing tag.
 */
export function extractWorkerHandoffBlock(text: string): ExtractedWorkerHandoffBlock | null {
  if (!text) return null;

  const closeRe = /<\/worker_handoff\s*>/gi;
  const openRe = /<worker_handoff\b[^>]*>/gi;

  const closes: { index: number; length: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = closeRe.exec(text)) !== null) {
    closes.push({ index: m.index, length: m[0].length });
  }
  if (closes.length === 0) return null;

  const opens: { index: number; length: number; tag: string }[] = [];
  while ((m = openRe.exec(text)) !== null) {
    const idx = m.index;
    const len = m[0].length;

    // Check if opening tag is preceded by 1 or 2 backticks (inline code, not 3+ code fence)
    let backticksBefore = 0;
    let p = idx - 1;
    while (p >= 0 && text[p] === "`") {
      backticksBefore++;
      p--;
    }
    const isDirectlyWrappedInInlineBackticks =
      (backticksBefore === 1 || backticksBefore === 2) ||
      (text[idx - 1] === "`" && text[idx + len] === "`");

    // Also check if inside an inline backtick span on this line
    const lineStart = text.lastIndexOf("\n", idx) + 1;
    const beforeOnLine = text.slice(lineStart, idx);
    const nonFenceBackticks = (beforeOnLine.replace(/`{3,}/g, "").match(/`/g) || []).length;
    const insideInlineBackticks = isDirectlyWrappedInInlineBackticks || (nonFenceBackticks % 2 === 1);

    if (!insideInlineBackticks) {
      opens.push({ index: idx, length: len, tag: m[0] });
    }
  }
  if (opens.length === 0) return null;

  // Search from last closing tag backwards to get the last valid closed block
  for (let c = closes.length - 1; c >= 0; c--) {
    const close = closes[c]!;
    let bestOpen: { index: number; length: number; tag: string } | null = null;
    for (const open of opens) {
      if (open.index < close.index) {
        if (!bestOpen || open.index > bestOpen.index) {
          bestOpen = open;
        }
      }
    }
    if (bestOpen) {
      const fullMatch = text.slice(bestOpen.index, close.index + close.length);
      const body = text.slice(bestOpen.index + bestOpen.length, close.index);
      return {
        fullMatch,
        body,
        startIndex: bestOpen.index,
        endIndex: close.index + close.length,
      };
    }
  }

  return null;
}

/**
 * Parses the optional <worker_handoff> block from a worker reply.
 * Only treats explicit FAILED/BLOCKED/PARTIAL status in a handoff block as failure;
 * replies without a <worker_handoff> block remain backward-compatible.
 */
export function parseWorkerHandoff(reply: string): ParsedWorkerHandoff {
  const match = extractWorkerHandoffBlock(reply);
  if (!match) {
    return {
      hasBlock: false,
      status: "UNKNOWN",
      summary: reply.trim(),
      touchedFiles: "",
      verificationProof: "",
      dodChecklist: "",
      openIssues: "",
    };
  }
  const body = match.body;
  const statusRaw = extractHandoffField(body, "STATUS").toUpperCase();
  const statusMatch = /^(PASS|PARTIAL|BLOCKED|FAILED)\b/.exec(statusRaw);
  const status = (statusMatch?.[1] as ParsedWorkerHandoff["status"]) ?? "UNKNOWN";
  const summary = extractHandoffField(body, "SUMMARY");
  return {
    hasBlock: true,
    status,
    summary: summary || body.trim(),
    touchedFiles: extractHandoffField(body, "TOUCHED_FILES"),
    verificationProof: extractHandoffField(body, "VERIFICATION_PROOF"),
    dodChecklist: extractHandoffField(body, "DOD_CHECKLIST"),
    openIssues: extractHandoffField(body, "OPEN_ISSUES"),
  };
}

/**
 * Calculates human-readable elapsed duration (e.g. "42s", "1m 35s") between two ISO timestamps.
 */
export function formatElapsedDuration(startStr?: string | null, endStr?: string | null): string | null {
  if (!startStr) return null;
  const start = Date.parse(startStr);
  if (isNaN(start)) return null;
  const end = endStr ? Date.parse(endStr) : Date.now();
  if (isNaN(end) || end < start) return null;
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}


