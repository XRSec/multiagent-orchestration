/**
 * Purpose: Lightweight background memory curation (turn-ended fallback & periodic log consolidation).
 * Context: Invoked by turnEnded when a user signals "remember/记住" without MEMORY.md edits, and on a daily timer.
 * Usage: const curator = new MemoryCurator(host, relay); curator.start();
 * Prerequisites: BotsHost, Relay, startChat with thinkingOptionId: "low".
 */

import { localDay } from "../shared/activity";
import { primaryGroupForBot, type Bot } from "../shared/bot";
import { startChat } from "./chats";
import type { BotsHost } from "./host";
import { listLogDays, MAIN_MEMORY, memoryFilePath } from "./memory";
import type { Relay } from "./relay";

export const MEMORY_CURATION_LABEL = "paseo-bots:memory-curation";
const CURATION_THINKING = "low";
const CONSOLIDATE_TICK_MS = 6 * 3_600_000;
const CONSOLIDATE_MIN_INTERVAL_MS = 20 * 3_600_000;

export function turnFallbackPrompt(bot: Bot, chatTitle: string, userText: string, reply: string): string {
  const path = memoryFilePath(bot.id, MAIN_MEMORY);
  return [
    `In a recent turn of "${chatTitle}", the user expressed something worth remembering, but ${path} was not updated.`,
    `Review the exchange below and update ${path} directly (or a topic file under memory/) if there is a durable preference, correction (feedback with Why & How to apply), project decision, or reference.`,
    `Update existing entries rather than duplicating. Never store secrets. If nothing durable needs saving, do nothing.`,
    "",
    `User: ${userText.trim()}`,
    reply.trim() ? `Assistant: ${reply.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function consolidatePrompt(bot: Bot, recentDays: string[]): string {
  const path = memoryFilePath(bot.id, MAIN_MEMORY);
  const logs = recentDays.map((day) => `memory/log/${day}.md`).join(", ");
  return [
    `Perform a lightweight memory maintenance pass on ${path}.`,
    `1. Read recent daily logs (${logs}) and extract any durable user preferences, corrections (feedback with Why & How to apply), or project decisions not yet in ${path}.`,
    `2. Merge duplicates, remove stale/contradicted notes, and keep ${path} concise and well-organized under the four categories (user / feedback / project / reference).`,
    `3. Never store secrets.`,
  ].join("\n");
}

/** Coordinates low-thinking background memory updates without re-triggering turn-end hooks. */
export class MemoryCurator {
  private readonly inflightBots = new Set<string>();
  private readonly ownedAgents = new Set<string>();
  private readonly lastConsolidatedAt = new Map<string, number>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly host: BotsHost,
    private readonly relay: Relay,
  ) {}

  isCurationAgent(agentId: string): boolean {
    return this.ownedAgents.has(agentId);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.consolidateAll().catch((error: unknown) => {
        console.error("paseo-bots: periodic memory consolidation failed", error);
      });
    }, CONSOLIDATE_TICK_MS);
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async curateTurnFallback(input: { botId: string; agentId: string; chatTitle: string; userText: string; reply: string }): Promise<boolean> {
    if (this.ownedAgents.has(input.agentId) || this.inflightBots.has(input.botId)) return false;
    const bot = await this.host.bot(input.botId);
    if (!bot || bot.archived || bot.hostId) return false;
    return this.launchCuration(bot, "Memory check", turnFallbackPrompt(bot, input.chatTitle, input.userText, input.reply));
  }

  async consolidateBot(botId: string): Promise<boolean> {
    if (this.inflightBots.has(botId)) return false;
    const bot = await this.host.bot(botId);
    if (!bot || bot.archived || bot.hostId) return false;

    const today = localDay(new Date());
    const yesterday = localDay(new Date(Date.now() - 86_400_000));
    const { days } = await listLogDays(botId);
    const recent = days.map((entry) => entry.day).filter((day) => day === today || day === yesterday);
    if (recent.length === 0) return false;

    const ok = await this.launchCuration(bot, "Memory consolidation", consolidatePrompt(bot, recent));
    if (ok) this.lastConsolidatedAt.set(botId, Date.now());
    return ok;
  }

  async consolidateAll(): Promise<void> {
    const values = await this.host.values();
    if (!values) return;
    const now = Date.now();
    for (const bot of values.bots) {
      if (bot.archived || bot.hostId) continue;
      const last = this.lastConsolidatedAt.get(bot.id) ?? 0;
      if (now - last < CONSOLIDATE_MIN_INTERVAL_MS) continue;
      await this.consolidateBot(bot.id).catch((error: unknown) => {
        console.error(`paseo-bots: failed to consolidate memory for ${bot.id}`, error);
      });
    }
  }

  private async launchCuration(bot: Bot, title: string, prompt: string): Promise<boolean> {
    this.inflightBots.add(bot.id);
    try {
      const values = await this.host.values();
      const group = primaryGroupForBot(bot.id, values?.groups ?? []);
      const agentId = await startChat(this.host, this.relay, bot, {
        prompt,
        title: `${bot.name} · ${title}`,
        labels: { [MEMORY_CURATION_LABEL]: "true" },
        group,
        thinkingOptionId: CURATION_THINKING,
      });
      this.ownedAgents.add(agentId);
      return true;
    } finally {
      this.inflightBots.delete(bot.id);
    }
  }
}
