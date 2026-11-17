import { randomBytes } from "node:crypto";
import { z } from "zod";
import { inFlightMembers, listTasks, openTask, type TaskStatus } from "../tasks";
import { defineTool } from "./mcp";

// The task-line tools a partner uses before and between dispatches. They only own the
// bookkeeping file: the group card, the settle and the fanout gate stay in the host.

const TASK_STATUSES = ["issued", "running", "blocked", "done", "retired"] as const;
/** Hard output budget: a listing must never eat a partner's context. */
const LIST_BUDGET_CHARS = 2000;
const LIST_TITLE_MAX = 80;

function newTaskId(): string {
  return `task-${randomBytes(4).toString("hex")}`;
}

/** One wording for the fanout line everywhere, so a refusal and a listing agree. */
function fanoutLine(inFlight: number, cap: number | undefined): string {
  return `partners ${inFlight}/${cap ?? "no cap"}`;
}

export const openTaskTool = defineTool({
  name: "open_task",
  description:
    "Open a task line before you hand one request to several partners, then pass its task_id to ask_bot. A line records the acceptance and the fanout cap; the host publishes one group card when the line settles, which needs every partner terminal and an acceptance recorded. Re-open an existing line to change its acceptance or cap, or to add partners; an unchanged re-open changes nothing. A settled line takes no new partner: open a new line for further work.",
  input: z.object({
    title: z.string().trim().min(1).max(200).describe("What this task line delivers, in one line the user would recognise."),
    task_id: z.string().trim().min(1).max(200).optional().describe("Reuse an existing task line instead of opening a new one. Omit to get a generated id back."),
    acceptance: z.string().trim().min(1).max(1000).optional().describe("How you will know it is done. Without one the line is never settled and no card is published."),
    fanout: z.number().int().positive().max(20).optional().describe("How many partners may work on this line at the same time. The host refuses a dispatch past it."),
    steps: z.number().int().positive().max(200).optional().describe("Reported cap for steps spent on this line. Informational; not enforced yet."),
    group_id: z.string().trim().min(1).max(200).optional().describe("Team whose lead receives the card, when the requester belongs to more than one. It must be a team this bot is on."),
  }),
  async run({ title, task_id, acceptance, fanout, steps, group_id }, caller) {
    const taskId = task_id?.trim() || newTaskId();
    if (group_id) {
      // Validating here, not at card time: a wrong team would drop the card and say nothing.
      const groups = (await caller.host.values().catch(() => null))?.groups ?? [];
      const team = groups.find((entry) => entry.id === group_id);
      const onTeam = team && (team.leadId === caller.bot.id || team.memberIds.includes(caller.bot.id));
      if (!onTeam) throw new Error(`This bot is not on team "${group_id}", so its card would be dropped. Use a team it belongs to, or omit group_id.`);
    }
    const budget = fanout || steps ? { ...(fanout ? { fanout } : {}), ...(steps ? { steps } : {}) } : undefined;
    const record = await openTask({
      taskId,
      title,
      ...(acceptance ? { acceptance } : {}),
      ...(group_id ? { groupId: group_id } : {}),
      ...(budget ? { budget } : {}),
    });
    const acceptanceState = record.acceptance?.trim() ? "acceptance recorded" : "no acceptance yet, so it cannot settle";
    const settled = record.settledAt ? ` It is already settled as ${record.status}; open a new line for further work.` : "";
    return `Task ${record.taskId} is ${record.status} at version ${record.version}: ${fanoutLine(inFlightMembers(record), record.budget?.fanout)} in flight, ${acceptanceState}.${settled} Pass task_id "${record.taskId}" to ask_bot for each partner.`;
  },
});

export const listTasksTool = defineTool({
  name: "list_tasks",
  description:
    "List the task lines on this host, most recently changed first: status, partners in flight against the fanout cap, and whether an acceptance is recorded. The list is capped and ends with \"...and N more\". Use it before asking a partner for more work, so you continue an existing line instead of opening a duplicate.",
  input: z.object({
    status: z.enum(TASK_STATUSES).optional().describe("Only lines in this status."),
    limit: z.number().int().positive().max(20).optional().describe("How many lines to show (default 5)."),
  }),
  async run({ status, limit = 5 }) {
    const all = await listTasks();
    const matching = status ? all.filter((record) => record.status === (status as TaskStatus)) : all;
    if (matching.length === 0) {
      return status ? `No task line is ${status}.` : "There are no task lines yet. Open one with open_task before you hand one request to several partners.";
    }
    // One line of the twenty is reserved for the ellipsis, so the budget covers the whole answer.
    const room = Math.min(limit, 20);
    const shown = matching.slice(0, matching.length > room ? Math.max(1, room - 1) : room);
    const lines: string[] = [];
    let used = 0;
    for (const record of shown) {
      const acceptance = record.acceptance?.trim() ? " · acceptance set" : " · no acceptance";
      const line = `${record.taskId} [${record.status}] ${fanoutLine(inFlightMembers(record), record.budget?.fanout)} · ${record.title.slice(0, LIST_TITLE_MAX)}${acceptance}`;
      if (used + line.length + 1 > LIST_BUDGET_CHARS) break;
      lines.push(line);
      used += line.length + 1;
    }
    const hidden = matching.length - lines.length;
    return `${lines.join("\n")}${hidden > 0 ? `\n...and ${hidden} more` : ""}`;
  },
});
