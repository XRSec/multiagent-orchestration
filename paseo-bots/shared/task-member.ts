import { z } from "zod";

// A receipt for one dead member. It belongs to the task line, never to the group: a member
// dying is process, and the group only ever receives the task's merged verdict.

export const TASK_MEMBER_CARD = { kind: "task-member", version: 1 } as const;

export const TaskMemberCardSchema = z.object({
  taskId: z.string().min(1).max(200),
  handleId: z.string().min(1).max(200),
  botId: z.string().min(1).max(200).optional(),
  status: z.literal("blocked_dead"),
  at: z.string(),
});
export type TaskMemberCard = z.infer<typeof TaskMemberCardSchema>;

/** One receipt per member per task: the id is the idempotency key. */
export function taskMemberCardId(taskId: string, handleId: string): string {
  return `task-member:${taskId}:${handleId}`;
}
