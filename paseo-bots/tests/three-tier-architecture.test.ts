import { describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ASKED_BY_LABEL,
  ASKED_IN_LABEL,
  TIER_DEPTH_LABEL,
  resolveTierDepth,
} from "../shared/handoff";
import { BOT_LABEL, type BotGroup } from "../shared/bot";
import {
  askBot,
  extractInsulatedReply,
} from "../server/tools/bots";
import { sessionRolePrompt } from "../shared/groups";
import {
  buildMemorySyncEnvelope,
  MAIN_MEMORY,
  MAIN_MEMORY_MAX_LINES,
} from "../server/memory";
import { fakeHost, makeBot } from "./helpers";

const startedChats: { botId: string; prompt: string; title: string; labels: Record<string, string> }[] = [];
vi.mock("../server/chats", () => ({
  startChat: vi.fn(async (_host: unknown, _relay: unknown, bot: { id: string }, input: { prompt: string; title: string; labels: Record<string, string> }) => {
    startedChats.push({ botId: bot.id, ...input });
    return `chat-${startedChats.length}`;
  }),
}));

interface FakeChat {
  status: string;
  labels: Record<string, string>;
  title?: string;
  reply?: string;
  pendingPermissions?: unknown[];
  archivedAt?: string;
  metadata?: Record<string, unknown>;
}

function createFakePaseo(chats: Record<string, FakeChat>) {
  return {
    agents: {
      ref: (id: string) => ({
        refresh: async () => {
          const chat = chats[id];
          return chat
            ? {
                agent: {
                  id,
                  status: chat.status,
                  labels: chat.labels,
                  title: chat.title ?? null,
                  pendingPermissions: chat.pendingPermissions ?? [],
                  lastError: null,
                  archivedAt: chat.archivedAt,
                  metadata: chat.metadata ?? {},
                },
              }
            : null;
        },
        setMetadata: async (patch: Record<string, unknown>) => {
          if (chats[id]) {
            chats[id].metadata = { ...chats[id].metadata, ...patch };
          }
        },
        send: async () => {},
        waitForFinish: async () => {},
        timeline: {
          append: vi.fn(async () => {}),
          refetch: async () => ({
            entries: chats[id]?.reply ? [{ item: { type: "text", text: chats[id].reply } }] : [],
          }),
        },
      }),
    },
  };
}

describe("3-Tier Chief of Staff Architecture", () => {
  describe("1. resolveTierDepth", () => {
    it("resolves depth 1 by default when labels are missing or empty", () => {
      expect(resolveTierDepth()).toBe(1);
      expect(resolveTierDepth({})).toBe(1);
    });

    it("resolves explicit depth 1, 2, and 3", () => {
      expect(resolveTierDepth({ [TIER_DEPTH_LABEL]: "1" })).toBe(1);
      expect(resolveTierDepth({ [TIER_DEPTH_LABEL]: "2" })).toBe(2);
      expect(resolveTierDepth({ [TIER_DEPTH_LABEL]: "3" })).toBe(3);
    });

    it("resolves legacy asked-by label to depth 2 as fallback", () => {
      expect(resolveTierDepth({ [ASKED_BY_LABEL]: "bot-moadmin" })).toBe(2);
    });

    it("prefers explicit TIER_DEPTH_LABEL over legacy ASKED_BY_LABEL", () => {
      expect(resolveTierDepth({ [TIER_DEPTH_LABEL]: "3", [ASKED_BY_LABEL]: "bot-mocode" })).toBe(3);
    });
  });

  describe("2. ask_bot Depth Progression and Tier Guardrails", () => {
    it("enforces mayAsk permission: L1 allows, L2 allows, L3 blocks, legacy blocks", async () => {
      const lead = makeBot({ id: "bot-moadmin", name: "moAdmin" });
      const squadLead = makeBot({ id: "bot-mocode", name: "moCode" });
      const worker = makeBot({ id: "bot-moci", name: "MoCI" });

      const chats: Record<string, FakeChat> = {
        "chat-l1": { status: "running", labels: { [BOT_LABEL]: "bot-moadmin", [TIER_DEPTH_LABEL]: "1" } },
        "chat-l2": {
          status: "running",
          labels: { [BOT_LABEL]: "bot-mocode", [TIER_DEPTH_LABEL]: "2", [ASKED_BY_LABEL]: "bot-moadmin" },
        },
        "chat-l3": {
          status: "running",
          labels: { [BOT_LABEL]: "bot-moci", [TIER_DEPTH_LABEL]: "3", [ASKED_BY_LABEL]: "bot-mocode" },
        },
        "chat-legacy-asked": {
          status: "running",
          labels: { [BOT_LABEL]: "bot-mocode", [ASKED_BY_LABEL]: "bot-moadmin" },
        },
      };

      const host = fakeHost([lead, squadLead, worker]);
      host.attach(createFakePaseo(chats) as never);

      // L1 session (no asked-by or tier 1) -> can ask
      expect(await askBot.available!({ bot: lead, agentId: "chat-l1", host, relay: null as never })).toBe(true);

      // L2 session (tier 2 squad lead) -> can ask (spawns L3)
      expect(await askBot.available!({ bot: squadLead, agentId: "chat-l2", host, relay: null as never })).toBe(true);

      // L3 session (tier 3 worker) -> blocked from further ask_bot
      expect(await askBot.available!({ bot: worker, agentId: "chat-l3", host, relay: null as never })).toBe(false);

      // Legacy asked session (without tier 2) -> blocked
      expect(await askBot.available!({ bot: squadLead, agentId: "chat-legacy-asked", host, relay: null as never })).toBe(false);

      // Bot with contactBots === 'off' -> always blocked
      expect(await askBot.available!({ bot: { ...squadLead, contactBots: "off" }, agentId: "chat-l2", host, relay: null as never })).toBe(false);
    });

    it("progresses depth correctly: L1 lead spawns L2, L2 spawns L3, peer omits depth", async () => {
      startedChats.length = 0;
      const lead = makeBot({ id: "bot-moadmin", name: "moAdmin" });
      const squadLead = makeBot({ id: "bot-mocode", name: "moCode" });
      const worker = makeBot({ id: "bot-moci", name: "MoCI" });
      const peer = makeBot({ id: "bot-peer", name: "Peer" });

      const group: BotGroup = {
        id: "team-test",
        name: "Test Team",
        logo: null,
        leadId: "bot-moadmin",
        memberIds: ["bot-moadmin", "bot-mocode", "bot-moci"],
        instructions: "",
        cwd: null,
        mounts: [],
        createdAt: "2026-09-27T00:00:00.000Z",
        updatedAt: "2026-09-27T00:00:00.000Z",
      };

      const chats: Record<string, FakeChat> = {
        "chat-lead": { status: "running", labels: { [BOT_LABEL]: "bot-moadmin", [TIER_DEPTH_LABEL]: "1" } },
        "chat-squad-lead": {
          status: "running",
          labels: { [BOT_LABEL]: "bot-mocode", [TIER_DEPTH_LABEL]: "2", [ASKED_BY_LABEL]: "bot-moadmin" },
        },
        "chat-peer": { status: "running", labels: { [BOT_LABEL]: "bot-peer" } },
      };

      const host = fakeHost([lead, squadLead, worker, peer]);
      const hostValues = await host.values();
      if (hostValues) {
        hostValues.groups = [group];
      }
      host.attach(createFakePaseo(chats) as never);

      // 1. L1 lead asks squadLead -> child chat gets TIER_DEPTH_LABEL = "2"
      const leadCaller = { bot: lead, agentId: "chat-lead", host, relay: null as never };
      await askBot.run({ bot: "bot-mocode", message: "Plan and implement feature" }, leadCaller);
      expect(startedChats.at(-1)?.labels[TIER_DEPTH_LABEL]).toBe("2");
      expect(startedChats.at(-1)?.labels[ASKED_BY_LABEL]).toBe("bot-moadmin");

      // 2. L2 squad lead asks worker -> child chat gets TIER_DEPTH_LABEL = "3"
      const l2Caller = { bot: squadLead, agentId: "chat-squad-lead", host, relay: null as never };
      await askBot.run({ bot: "bot-moci", message: "Run integration tests" }, l2Caller);
      expect(startedChats.at(-1)?.labels[TIER_DEPTH_LABEL]).toBe("3");
      expect(startedChats.at(-1)?.labels[ASKED_BY_LABEL]).toBe("bot-mocode");

      // 3. Independent peer ask (not a lead) -> omits TIER_DEPTH_LABEL for backwards compatibility
      const peerCaller = { bot: peer, agentId: "chat-peer", host, relay: null as never };
      await askBot.run({ bot: "bot-mocode", message: "Peer question" }, peerCaller);
      expect(startedChats.at(-1)?.labels[TIER_DEPTH_LABEL]).toBeUndefined();
      expect(startedChats.at(-1)?.labels[ASKED_BY_LABEL]).toBe("bot-peer");
    });
  });

  describe("3. Context Insulation Wall (extractInsulatedReply)", () => {
    it("extracts <worker_handoff> block cleanly when surrounded by noisy logs", () => {
      const noisyOutput = `
Running test suite...
PASS test/1.ts (10s)
PASS test/2.ts (12s)
PASS test/3.ts (15s)
[... 50,000 lines of build output ...]
Finished in 45s.

<worker_handoff>
STATUS: PASS
SUMMARY: All tests passed with zero regressions.
TOUCHED_FILES:
- src/auth.ts
VERIFICATION_PROOF: npm test exited with code 0
DOD_CHECKLIST:
- [x] Schema check
OPEN_ISSUES: None
</worker_handoff>

Extra trailing debug info here.
`;
      const result = extractInsulatedReply(noisyOutput);
      expect(result).toContain("<worker_handoff>");
      expect(result).toContain("STATUS: PASS");
      expect(result).toContain("</worker_handoff>");
      expect(result).not.toContain("50,000 lines of build output");
      expect(result).not.toContain("Extra trailing debug info here");
      // Includes the concise 1-line lead summary
      expect(result).toContain("Running test suite...");
    });

    it("bounds ordinary reply to maxChars when no <worker_handoff> is present", () => {
      const normal = "Task completed successfully.";
      expect(extractInsulatedReply(normal)).toBe(normal);

      const longReply = "A".repeat(100);
      const bounded = extractInsulatedReply(longReply, 50);
      expect(bounded).toBe(`${"A".repeat(50)}\n[cut at 50 characters]`);
    });
  });

  describe("4. 3-Tier Session Role Prompts", () => {
    it("renders L1 Chief of Staff prompt with Green/Yellow/Red authority and file-pointers", () => {
      const prompt = sessionRolePrompt("team-lead", {
        sessionBoardPath: "/blackboard/session-1",
      });
      expect(prompt).toContain("Session Role: Team Lead / Chief of Staff");
      expect(prompt).toContain("Tier 1 - L1 Chief of Staff");
      expect(prompt).toContain("Long-running proxy for the user");
      expect(prompt).toContain("Do NOT write code or read raw build/test logs directly");
      expect(prompt).toContain("Green (Full Autonomy)");
      expect(prompt).toContain("Yellow (Act & Report)");
      expect(prompt).toContain("Red (Hard Circuit-Breaker — Escalate to User)");
      expect(prompt).toContain("Option A / Option B");
      expect(prompt).toContain("File-Pointer Communication");
      expect(prompt).toContain("/blackboard/session-1/TASK_MANIFEST.md");
    });

    it("renders L2 Squad Lead prompt for tierDepth === 2", () => {
      const prompt = sessionRolePrompt("dispatched-worker", {
        tierDepth: 2,
      });
      expect(prompt).toContain("Session Role: Dispatched Worker (Tier 2 - Squad Lead)");
      expect(prompt).toContain("L2 Squad Lead");
      expect(prompt).toContain("Decompose the L1 brief into atomic sub-tasks for Tier 3 (L3) workers via ask_bot");
      expect(prompt).toContain("maximum of 2 repair rounds");
      expect(prompt).toContain("Context Insulation");
      expect(prompt).toContain("<worker_handoff>");
      expect(prompt).toContain("Archive or close worker sessions upon completion");
    });

    it("renders L3 Disposable Worker prompt for tierDepth === 3", () => {
      const prompt = sessionRolePrompt("dispatched-worker", {
        tierDepth: 3,
      });
      expect(prompt).toContain("Session Role: Dispatched Worker (Tier 3 - Disposable Worker)");
      expect(prompt).toContain("L3 Disposable Worker");
      expect(prompt).toContain("heavy-token execution");
      expect(prompt).toContain("Never delegate further to other bots via ask_bot");
      expect(prompt).toContain("Context Insulation");
      expect(prompt).toContain("<worker_handoff>");
    });

    it("renders fallback dispatched-worker prompt when tierDepth is omitted", () => {
      const prompt = sessionRolePrompt("dispatched-worker");
      expect(prompt).toContain("Session Role: Dispatched Worker");
      expect(prompt).toContain("<worker_protocol>");
      expect(prompt).not.toContain("Tier 2 - Squad Lead");
      expect(prompt).not.toContain("Tier 3 - Disposable Worker");
    });
  });

  describe("5. buildMemorySyncEnvelope", () => {
    it("returns null when neither bot nor team memory exists", async () => {
      const tempDir = mkdtempSync(join(tmpdir(), "sync-mem-empty-"));
      const envelope = await buildMemorySyncEnvelope(tempDir);
      expect(envelope).toBeNull();
    });

    it("formats <memory_sync> envelope with bot and team memory", async () => {
      const botDir = mkdtempSync(join(tmpdir(), "sync-mem-bot-"));
      const teamDir = mkdtempSync(join(tmpdir(), "sync-mem-team-"));

      writeFileSync(join(botDir, MAIN_MEMORY), "# Bot Architectural Notes\n- Follow 3-tier pattern.", "utf8");
      writeFileSync(join(teamDir, MAIN_MEMORY), "# Team Guidelines\n- Zero rm/rm -rf.", "utf8");

      const envelope = await buildMemorySyncEnvelope(botDir, teamDir);
      expect(envelope).not.toBeNull();
      expect(envelope).toContain("<memory_sync>");
      expect(envelope).toContain("## Bot Memory (MEMORY.md)");
      expect(envelope).toContain("- Follow 3-tier pattern.");
      expect(envelope).toContain("## Team Memory (MEMORY.md)");
      expect(envelope).toContain("- Zero rm/rm -rf.");
      expect(envelope).toContain("</memory_sync>");
    });

    it("enforces memory bounds on large files", async () => {
      const botDir = mkdtempSync(join(tmpdir(), "sync-mem-large-"));
      const manyLines = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}`).join("\n");
      writeFileSync(join(botDir, MAIN_MEMORY), manyLines, "utf8");

      const envelope = await buildMemorySyncEnvelope(botDir);
      expect(envelope).not.toBeNull();
      expect(envelope).toContain("Line 1");
      expect(envelope).toContain(`Line ${MAIN_MEMORY_MAX_LINES}`);
      expect(envelope).not.toContain(`Line ${MAIN_MEMORY_MAX_LINES + 50}`);
    });
  });
});
