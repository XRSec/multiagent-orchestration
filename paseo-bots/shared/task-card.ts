import { z } from "zod";
import { TaskStageStatusSchema } from "./workflows";

// A group overview card is composed by the host, never by a worker, and it is the only
// thing a task line puts in a group timeline. It carries everything a reader needs, so a
// pruned task file cannot make an old card unreadable or invite a re-send.

export const TASK_CARD = { kind: "task-card", version: 1 } as const;

export const TaskCardWorkflowStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  botId: z.string(),
  engine: z.enum(["native", "paseo-bot"]),
  status: TaskStageStatusSchema,
  dependsOn: z.array(z.string()).default([]),
  retries: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().nonnegative().default(1),
  error: z.string().nullable().optional(),
});
export type TaskCardWorkflowStage = z.infer<typeof TaskCardWorkflowStageSchema>;

export const TaskCardWorkflowSchema = z.object({
  workflowId: z.string(),
  workflowName: z.string(),
  status: z.enum(["running", "done", "failed"]),
  stages: z.array(TaskCardWorkflowStageSchema),
});
export type TaskCardWorkflow = z.infer<typeof TaskCardWorkflowSchema>;

export const TaskCardSchema = z.object({
  taskId: z.string().min(1).max(200),
  title: z.string().min(1).max(200),
  status: z.enum(["issued", "running", "blocked", "done", "retired"]),
  summary: z.string().max(800),
  memberCount: z.number().int().nonnegative(),
  engines: z.array(z.enum(["native", "paseo-bot"])).max(2),
  settledAt: z.string().nullable(),
  version: z.number().int().positive(),
  workflow: TaskCardWorkflowSchema.optional(),
});
export type TaskCard = z.infer<typeof TaskCardSchema>;

/** The append id doubles as the idempotency key: one card per task version. */
export function taskCardId(taskId: string, version: number): string {
  return `task-card:${taskId}:${version}`;
}

export interface TaskCardSource {
  taskId: string;
  title: string;
  status: TaskCard["status"];
  version: number;
  settledAt: string | null;
  acceptance?: string;
  members: { engine: "native" | "paseo-bot"; status: string }[];
  workflow?: {
    workflowId: string;
    workflowName: string;
    status: "running" | "done" | "failed";
    stages: {
      id: string;
      name: string;
      botId: string;
      engine: "native" | "paseo-bot";
      status: "pending" | "running" | "done" | "failed" | "skipped";
      dependsOn: string[];
      retries: number;
      maxRetries: number;
      error?: string | null;
    }[];
  };
}

/** A single self-contained line, cut short rather than truncated mid-word by the schema. */
export function taskCardSummary(source: TaskCardSource): string {
  if (source.workflow) {
    const done = source.workflow.stages.filter((s) => s.status === "done").length;
    const failed = source.workflow.stages.filter((s) => s.status === "failed").length;
    const running = source.workflow.stages.filter((s) => s.status === "running").length;
    const total = source.workflow.stages.length;
    const summary = `${source.title} — ${source.status} at version ${source.version}; workflow "${source.workflow.workflowName}" (${done}/${total} done${running ? `, ${running} running` : ""}${failed ? `, ${failed} failed` : ""}).`;
    return summary.length <= 800 ? summary : `${summary.slice(0, 797)}...`;
  }
  const tally = new Map<string, number>();
  for (const member of source.members) tally.set(member.status, (tally.get(member.status) ?? 0) + 1);
  const tallyText = [...tally.entries()].map(([status, count]) => `${count} ${status}`).join(", ") || "no members";
  const acceptance = source.acceptance?.trim() ? `acceptance: ${source.acceptance.trim()}` : "acceptance not recorded";
  const summary = `${source.title} — ${source.status} at version ${source.version}; ${source.members.length} member(s): ${tallyText}. ${acceptance}.`;
  return summary.length <= 800 ? summary : `${summary.slice(0, 797)}...`;
}

/** Builds the card from a task record; the record shape is structural so this stays shared. */
export function taskCardOf(source: TaskCardSource): TaskCard {
  const stageEngines = source.workflow?.stages.map((s) => s.engine) ?? [];
  const engines = [...new Set([...source.members.map((member) => member.engine), ...stageEngines])];
  return {
    taskId: source.taskId,
    title: source.title.slice(0, 200),
    status: source.status,
    summary: taskCardSummary(source),
    memberCount: source.members.length,
    engines,
    settledAt: source.settledAt,
    version: source.version,
    ...(source.workflow ? {
      workflow: {
        workflowId: source.workflow.workflowId,
        workflowName: source.workflow.workflowName,
        status: source.workflow.status,
        stages: source.workflow.stages.map((s) => ({
          id: s.id,
          name: s.name,
          botId: s.botId,
          engine: s.engine,
          status: s.status,
          dependsOn: s.dependsOn,
          retries: s.retries,
          maxRetries: s.maxRetries,
          ...(s.error ? { error: s.error.slice(0, 300) } : {}),
        })),
      },
    } : {}),
  };
}
