import { z } from "zod";
import { InteractionSpecSchema } from "../../shared/interaction";
import { interactions } from "../interactions";
import { defineTool } from "./mcp";

export const showCard = defineTool({
  name: "show_card",
  description: "Show an interactive form or inline-editable draft card in this chat. Prefer native ask_question (or brief plain-text confirmation) for simple yes/no approvals or quick choices so the turn continues with minimal token overhead; reserve show_card strictly for multi-field forms or long drafts needing inline user editing, and never re-confirm routine reversible actions when the user already gave the target and core content. The user's answer arrives as a new message; this tool only presents the card, so finish your turn and wait. Never request passwords, tokens or other secrets in a card.",
  input: z.object({
    key: z.string().min(1).max(100).optional().describe("A unique key for this request. Repeating the same key and card is safe if a tool response was lost."),
    card: InteractionSpecSchema,
  }),
  async run({ key, card }, { bot, agentId, host }) {
    const saved = await interactions.create({ botId: bot.id, agentId, spec: card, key }, host.requirePaseo());
    return JSON.stringify({ cardId: saved.id, status: saved.status, instruction: saved.status === "pending" ? "The card is visible in the chat. Finish your turn and wait for the user to answer it. Do not perform its proposed action before that answer." : "This card already exists. Do not create a duplicate.", ...(saved.response ? { response: saved.response } : {}) });
  },
});
