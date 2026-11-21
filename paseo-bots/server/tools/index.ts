import { askBot, checkChat, listBots, listTeams } from "./bots";
import { searchChats } from "./chats";
import type { BotToolName } from "../../shared/bot-tools";
import type { SubagentEngine } from "../../shared/chat";
import type { BotTool } from "./mcp";
import { listTasksTool, openTaskTool } from "./tasks";
import { resumeWorkflowTool, runWorkflowTool } from "./workflows";
import { cancelRoutineRun, listRoutines, proposeRoutine, runRoutine } from "./routines";
import { getSetup, proposeChanges } from "./setup";
import { proposeSkill } from "./skills";
import { showCard } from "./interactions";

/** Every tool the "bots" MCP server offers, in the order agents see them. */
export const BOT_TOOLS: readonly BotTool[] = [listBots, listTeams, askBot, checkChat, searchChats, openTaskTool, listTasksTool, runWorkflowTool, resumeWorkflowTool, getSetup, proposeSkill, proposeRoutine, listRoutines, runRoutine, cancelRoutineRun, proposeChanges, showCard];

/**
 * Tools that only exist to hand work to another bot, so the native engine hides
 * them. check_chat and search_chats stay: they read chats the bot already has,
 * which a native-engine chat still needs to follow up on earlier handoffs.
 */
export const DISPATCH_ONLY_TOOLS: readonly BotToolName[] = [askBot.name];

/** The tools one chat sees, narrowed by the engine it was started with; no engine keeps them all. */
export function toolsForEngine(tools: readonly BotTool[], engine: SubagentEngine | null): readonly BotTool[] {
  if (engine !== "native") return tools;
  return tools.filter((tool) => !DISPATCH_ONLY_TOOLS.includes(tool.name));
}
