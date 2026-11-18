import type { Bot, BotGroup, TeamLogo } from "./bot";
import {
  ORCHESTRATOR_WORKFLOW_PROTOCOL,
  WORKER_PROTOCOL_SUFFIX,
  type WorkflowDefinition,
} from "./workflows";

// OpenMausBot's teams: a bot can belong to one or more teams, every member gets
// each team's roster and shared instructions in its prompt, and each team's
// Chief of Staff (its lead) is the user's main contact who hands work to the others.

const ROSTER_MAX = 40;

/** The team's logo; teams from before logos draw one from their id. */
export function teamLogoOf(group: Pick<BotGroup, "id" | "logo">): TeamLogo {
  return group.logo ?? { seed: group.id, palette: null, imageUrl: null };
}

/** All teams a bot is on, in order. */
export function teamsOf(botId: string, groups: readonly BotGroup[]): BotGroup[] {
  return groups.filter((group) => group.leadId === botId || group.memberIds.includes(botId));
}

/** The first team a bot is on, if any. */
export function teamOf(botId: string, groups: readonly BotGroup[]): BotGroup | null {
  return teamsOf(botId, groups)[0] ?? null;
}

/** The team's bots that still exist, lead first. */
export function groupBots(group: BotGroup, bots: readonly Bot[]): { lead: Bot | null; members: Bot[] } {
  const live = (id: string) => bots.find((bot) => bot.id === id && !bot.archived) ?? null;
  const lead = group.leadId ? live(group.leadId) : null;
  const members = group.memberIds.filter((id) => id !== group.leadId).map(live).filter((bot): bot is Bot => bot !== null);
  return { lead, members };
}

function rosterLine(bot: Bot, lead: boolean): string {
  const about = [bot.title, bot.description].filter((part) => part.trim()).join(" — ");
  return `- ${bot.name}${lead ? " (Chief of Staff)" : ""}${about ? `: ${about}` : ""}`;
}

export type SessionRoleKind =
  | "dm"
  | "team-lead"
  | "team-direct-specialist"
  | "dispatched-worker";

export function resolveSessionRole(input: {
  botId: string;
  group?: Pick<BotGroup, "id" | "leadId"> | null;
  askedByBotId?: string | null;
  isWorkflowStage?: boolean;
}): SessionRoleKind {
  if (input.isWorkflowStage || input.askedByBotId) return "dispatched-worker";
  if (!input.group) return "dm";
  if (input.group.leadId === input.botId) return "team-lead";
  return "team-direct-specialist";
}

export interface SessionRolePromptContext {
  bot?: Pick<Bot, "id" | "name"> | null;
  group?: Pick<BotGroup, "id" | "name" | "leadId"> | null;
  leadBot?: Pick<Bot, "id" | "name"> | null;
  sessionBoardPath?: string | null;
}

export function sessionRolePrompt(
  role: SessionRoleKind,
  context: SessionRolePromptContext = {},
): string {
  switch (role) {
    case "dm":
      return [
        "Session Role: Direct Assistant",
        "You are interacting directly with the user as a personal assistant.",
        "Understand the request, execute tasks directly within your granted tools, and communicate results concisely.",
      ].join("\n");
    case "team-lead": {
      const manifestPath = context.sessionBoardPath
        ? `${context.sessionBoardPath}/TASK_MANIFEST.md`
        : "the session blackboard TASK_MANIFEST.md";
      return [
        "Session Role: Team Lead / Chief of Staff",
        "You are the Chief of Staff and Orchestrator for the team.",
        `- Maintain execution state in ${manifestPath}.`,
        "- Delegate implementation, research, and verification to specialist teammates via ask_bot or run_workflow.",
        "- Audit <worker_handoff> proof blocks rather than accepting bare claims.",
        "- Limit repair rounds to a maximum of 3 before escalating blockers to the user.",
        "",
        ORCHESTRATOR_WORKFLOW_PROTOCOL,
      ].join("\n");
    }
    case "team-direct-specialist": {
      const leadName = context.leadBot
        ? `${context.leadBot.name} (${context.leadBot.id})`
        : context.group?.leadId
          ? context.group.leadId
          : "the team lead";
      return [
        "Session Role: Team Specialist",
        "You are a domain-bounded specialist on this team.",
        `Handle requests within your specialization directly. For cross-domain requests, workflow orchestration, or tasks outside your domain, escalate or coordinate with ${leadName} via ask_bot.`,
      ].join("\n");
    }
    case "dispatched-worker":
      return [
        "Session Role: Dispatched Worker",
        WORKER_PROTOCOL_SUFFIX,
      ].join("\n");
  }
}

export interface TeamPromptOptions {
  globalWorkflows?: readonly WorkflowDefinition[];
  role?: SessionRoleKind;
  teamMemory?: { path: string; content: string } | null;
}

function isTeamPromptOptions(val: unknown): val is TeamPromptOptions {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

/** A team member's prompt section: its teammates, the shared instructions and, for the lead, how to lead. */
export function teamPrompt(
  group: BotGroup,
  bot: Bot,
  bots: readonly Bot[],
  globalWorkflowsOrOptions?: readonly WorkflowDefinition[] | TeamPromptOptions,
  role?: SessionRoleKind,
  teamMemory?: { path: string; content: string } | null,
): string {
  let globalWorkflows: readonly WorkflowDefinition[] | undefined;
  let effectiveRole = role;
  let effectiveTeamMemory = teamMemory;

  if (isTeamPromptOptions(globalWorkflowsOrOptions)) {
    globalWorkflows = globalWorkflowsOrOptions.globalWorkflows;
    if (globalWorkflowsOrOptions.role !== undefined) effectiveRole = globalWorkflowsOrOptions.role;
    if (globalWorkflowsOrOptions.teamMemory !== undefined) effectiveTeamMemory = globalWorkflowsOrOptions.teamMemory;
  } else if (Array.isArray(globalWorkflowsOrOptions)) {
    globalWorkflows = globalWorkflowsOrOptions as readonly WorkflowDefinition[];
  }

  const { lead, members } = groupBots(group, bots);
  const isLead = effectiveRole !== undefined ? effectiveRole === "team-lead" : lead?.id === bot.id;
  const canSeeWorkflows = effectiveRole !== undefined ? effectiveRole === "team-lead" : isLead;

  const others = [...(lead && !isLead ? [lead] : []), ...members.filter((member) => member.id !== bot.id)].slice(0, ROSTER_MAX);
  const name = group.name.trim() || "Untitled";
  const teamWorkflows = group.workflows ?? [];
  const teamWorkflowIds = new Set(teamWorkflows.map((w) => w.id));
  const combinedWorkflows = canSeeWorkflows
    ? [...teamWorkflows, ...(globalWorkflows ?? []).filter((w) => !teamWorkflowIds.has(w.id))]
    : [];
  const workflowsSection = canSeeWorkflows && combinedWorkflows.length > 0
    ? [
        `Available workflows for "${name}" (trigger with run_workflow):`,
        ...combinedWorkflows.map((w) => {
          const stagesLine = w.stages.map((s) => `${s.name} (${s.botId})`).join(" -> ");
          const desc = w.description?.trim() ? ` — ${w.description.trim()}` : "";
          return `- ${w.name} (id: "${w.id}")${desc} [${stagesLine}]`;
        }),
        "",
        ORCHESTRATOR_WORKFLOW_PROTOCOL,
      ].join("\n")
    : "";

  const memorySection = effectiveTeamMemory?.content?.trim()
    ? `Team shared memory (${effectiveTeamMemory.path}):\n${effectiveTeamMemory.content.trim()}`
    : "";

  const parts = [
    isLead
      ? `You are the Chief of Staff of the "${name}" team and the user's main contact for it. Own the outcome: understand the request, decide what to handle yourself, hand parts to the teammates who fit them with ask_bot when that helps, and return one concise answer. Don't delegate trivial work to look busy, and never invent a teammate's progress or result.`
      : `You're on the "${name}" team.${lead ? ` ${lead.name} leads it.` : ""}`,
    others.length ? `Teammates:\n${others.map((other) => rosterLine(other, other.id === lead?.id)).join("\n")}` : "",
    group.instructions.trim() ? `Shared instructions for the team. The user manages them for every bot on the team; you can't edit them.\n${group.instructions.trim()}` : "",
    memorySection,
    workflowsSection,
  ];
  return parts.filter(Boolean).join("\n\n");
}

/** Combined prompt sections for all teams a bot belongs to. */
export function teamsPrompt(
  groups: readonly BotGroup[],
  bot: Bot,
  bots: readonly Bot[],
  globalWorkflowsOrOptions?: readonly WorkflowDefinition[] | TeamPromptOptions,
  role?: SessionRoleKind,
  teamMemory?: { path: string; content: string } | null,
): string {
  return groups
    .map((group) => teamPrompt(group, bot, bots, globalWorkflowsOrOptions, role, teamMemory))
    .filter(Boolean)
    .join("\n\n");
}

export interface TeamDraft {
  name: string;
  logo: TeamLogo | null;
  leadId: string | null;
  memberIds: string[];
  instructions: string;
  cwd?: string | null;
  mounts?: string[];
  workflows?: WorkflowDefinition[];
}

/** Creates (null id) or updates a team; bots may belong to multiple teams at once. */
export function saveTeam(groups: readonly BotGroup[], id: string | null, draft: TeamDraft, newId: string, now: string): BotGroup[] {
  const teamId = id ?? newId;
  const joining = new Set(draft.memberIds);
  const existing = groups.find((group) => group.id === teamId);
  const team: BotGroup = {
    id: teamId,
    name: draft.name,
    logo: draft.logo,
    leadId: draft.leadId && joining.has(draft.leadId) ? draft.leadId : null,
    memberIds: draft.memberIds,
    instructions: draft.instructions,
    cwd: draft.cwd !== undefined ? draft.cwd : (existing?.cwd ?? null),
    mounts: draft.mounts !== undefined ? draft.mounts : (existing?.mounts ?? []),
    workflows: draft.workflows !== undefined ? draft.workflows : (existing?.workflows ?? []),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return existing ? groups.map((group) => (group.id === teamId ? team : group)) : [...groups, team];
}

/** Takes a deleted bot off its team. */
export function withoutBot(groups: readonly BotGroup[], botId: string, now: string): BotGroup[] {
  return groups.map((group) =>
    group.memberIds.includes(botId) || group.leadId === botId ? { ...group, memberIds: group.memberIds.filter((id) => id !== botId), leadId: group.leadId === botId ? null : group.leadId, updatedAt: now } : group,
  );
}

// ------------------------------------------------------------------ tabs

/** The tab of the bots that aren't on a team. */
export const OTHER_BOTS_TAB = "other";

export interface TeamTab {
  /** A team id, or OTHER_BOTS_TAB. */
  id: string;
  group: BotGroup | null;
  /** The listed bots on it; a team's lead comes first. */
  bots: Bot[];
}

/**
 * With teams the bot list splits into tabs: one per team, then "Other bots"
 * when some listed bots have no team. Without teams there are none.
 */
export function teamTabs(groups: readonly BotGroup[], bots: readonly Bot[]): TeamTab[] {
  if (groups.length === 0) return [];
  const byId = new Map(bots.map((bot) => [bot.id, bot]));
  const teamed = new Set<string>();
  const tabs: TeamTab[] = groups.map((group) => {
    const ids = [...(group.leadId ? [group.leadId] : []), ...group.memberIds.filter((id) => id !== group.leadId)];
    for (const id of ids) teamed.add(id);
    return { id: group.id, group, bots: ids.flatMap((id) => byId.get(id) ?? []) };
  });
  const others = bots.filter((bot) => !teamed.has(bot.id));
  return others.length > 0 ? [...tabs, { id: OTHER_BOTS_TAB, group: null, bots: others }] : tabs;
}

/** The tab a bot is listed under. */
export function tabOf(botId: string, groups: readonly BotGroup[]): string {
  return teamOf(botId, groups)?.id ?? OTHER_BOTS_TAB;
}
