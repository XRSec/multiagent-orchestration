import type { BotsHost } from "../host";
import { startChat } from "../chats";
import type { PaseoApi } from "../paseo";
import type { Relay } from "../relay";

/** Sends one prompt to a bot and resolves with its reply; injectable for tests. */
export type AskBot = (botId: string, prompt: string) => Promise<string>;

export interface AnalyticsExecContext {
  paseo?: PaseoApi;
  host?: BotsHost;
  relay?: Relay;
  askBot?: AskBot;
}

const BOT_TURN_TIMEOUT_MS = 10 * 60_000;

async function waitAgentReply(paseo: PaseoApi, agentId: string, timeoutMs: number): Promise<string> {
  const ref = paseo.agents.ref(agentId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await ref.refresh();
    const status = snap?.agent.status;
    if (status !== "running" && status !== "initializing") {
      const page = await ref.timeline.refetch({ direction: "tail", projection: "projected", limit: 20 });
      const items = page.entries.map((e) => e.item as { type: string; text?: string });
      const reply = [...items].reverse().find((item) => item.type === "assistant_message")?.text?.trim();
      if (reply) return reply;
      if (status === "error") throw new Error("Bot turn failed");
      throw new Error(`Bot returned empty reply (status: ${status ?? "unknown"})`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Bot turn timed out");
}

/**
 * Bot mode only: the bot's soul is its system prompt (kept current in bots.json and synced to the
 * runtime agent file on chat start), so only the stage data is sent.
 */
export async function askBot(botId: string, prompt: string, exec: AnalyticsExecContext = {}): Promise<string> {
  if (exec.askBot) return exec.askBot(botId, prompt);
  if (!exec.host || !exec.relay || !exec.paseo) throw new Error("Bot runtime unavailable in this context");
  const bot = await exec.host.bot(botId);
  if (!bot || bot.archived) throw new Error(`Bot "${botId}" ${bot ? "is archived" : "no longer exists"}; restore it before running analysis.`);
  const agentId = await startChat(exec.host, exec.relay, bot, {
    prompt,
    title: `Data analysis (${bot.name})`,
    labels: { "paseo-bots.analytics": "1" },
  });
  return waitAgentReply(exec.paseo, agentId, BOT_TURN_TIMEOUT_MS);
}
