import { act, create, type ReactTestRenderer } from "react-test-renderer";
import React from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PaseoApi } from "@getpaseo/client";

// Mock React Native for UI testing
vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  Pressable: ({ children, onPress, ...props }: any) => <button onClick={onPress} {...props}>{children}</button>,
  Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  StyleSheet: { create: (s: any) => s },
  Image: () => null,
}));

vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: ({ name }: { name: string }) => <i data-icon={name} />,
  Markdown: ({ children }: { children: React.ReactNode }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock("../client/i18n", () => ({
  useT: () => ({
    t: (k: string) => {
      const dict: Record<string, string> = {
        "companion.distilledIntentLabel": "✨ 已提炼需求",
        "companion.distilledRequirement": "精简需求",
        "companion.compiledPrompt": "执行提示词",
        "companion.intentDistillPill": "✨ 意图精简",
        "companion.expandTooltip": "展开提炼详情",
        "companion.collapseTooltip": "收起提炼详情",
      };
      return dict[k] ?? k;
    },
  }),
}));

vi.mock("../client/native", () => ({
  nativeTokens: () => ({ dark: false, surface3: "#333", brandClay: "#8b5cf6", warmPaper: "#fff" }),
  placeholderColor: () => "#999",
  useHover: () => [false, {}],
  CONTENT_MAX_WIDTH: 800,
}));

vi.mock("../client/typography", () => ({
  content: () => 14,
  contentLine: () => 20,
  ui: (size: number) => size,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  applyClosedWorldGuard,
  applyConstraintOps,
  classifyCompanionBypass,
  formatCompanionIntentEnvelope,
  parseCompanionIntentEnvelope,
  SHADOW_FOR_LABEL,
  SHADOW_SESSION_LABEL,
  shouldBypassCompanionIntent,
} from "../shared/companion-intent";
import { extractToolFootprintDigest, turnVisibleAssistantBody, type TimelineItemLike } from "../shared/activity";
import {
  CompanionCircuitBreaker,
  CompanionSessionManager,
  createEmptyLedger,
  parseIntentAnalysis,
  parseReplySummary,
  readShadowSession,
} from "../server/companion-session";
import { turnEnded } from "../server/activity";
import type { BotsHost } from "../server/host";
import type { MemoryJournal } from "../server/journal";
import type { RoutineScheduler } from "../server/scheduler";
import { CompanionIntentBadge } from "../client/chat/stream/CompanionIntentBadge";
import { RowContent } from "../client/chat/stream/rows";

let shadowDir = "";
let previousShadowDir = process.env.PASEO_BOTS_SHADOW_DIR;

beforeAll(() => {
  shadowDir = mkdtempSync(join(tmpdir(), "paseo-bots-shadow-test-"));
  process.env.PASEO_BOTS_SHADOW_DIR = shadowDir;
});

afterAll(() => {
  if (previousShadowDir === undefined) delete process.env.PASEO_BOTS_SHADOW_DIR;
  else process.env.PASEO_BOTS_SHADOW_DIR = previousShadowDir;
  rmSync(shadowDir, { recursive: true, force: true });
});

const MOCK_COLORS = {
  surface0: "#111",
  surface1: "#222",
  surface2: "#2a2a2a",
  border: "#444",
  foreground: "#eee",
  foregroundMuted: "#888",
  accent: "#3b82f6",
  accentForeground: "#fff",
  statusSuccess: "#22c55e",
  statusWarning: "#eab308",
  statusDanger: "#ef4444",
} as any;

describe("Dual-Session Companion Intent Compiler & Reply Distiller", () => {
  describe("1. Envelope Determinism & Parser Invariant", () => {
    it("formats and strictly parses tail companion intent envelope", () => {
      const rawUserText = "请帮我重构一下网络模块\n需要支持重试和超时";
      const formatted = formatCompanionIntentEnvelope({
        rawUserText,
        turnIndex: 1,
        distilledIntent: "重构网络模块，增加重试与超时控制",
        compiledPrompt: "Refactor network module to include exponential backoff and timeout handling.",
      });

      expect(formatted).toContain(rawUserText);
      expect(formatted).toContain("<companion_intent version=\"1\">");
      expect(formatted.endsWith("</companion_intent>")).toBe(true);

      const parsed = parseCompanionIntentEnvelope(formatted);
      expect(parsed).not.toBeNull();
      expect(parsed?.rawUserText).toBe(rawUserText);
      expect(parsed?.turnIndex).toBe(1);
      expect(parsed?.distilledIntent).toBe("重构网络模块，增加重试与超时控制");
      expect(parsed?.compiledPrompt).toBe("Refactor network module to include exponential backoff and timeout handling.");
    });

    it("returns null when <companion_intent> is quoted mid-message or followed by trailing text", () => {
      const midMessage = `Here is what happened earlier:
<companion_intent version="1">
TURN: 1
DISTILLED_INTENT: Quoted intent
COMPILED_PROMPT:
Quoted prompt
</companion_intent>
What do you think of this previous turn?`;

      expect(parseCompanionIntentEnvelope(midMessage)).toBeNull();
    });

    it("returns null if any required field is missing or invalid", () => {
      const missingPrompt = `Hello world\n\n<companion_intent version="1">\nTURN: 1\nDISTILLED_INTENT: Intent only\n</companion_intent>`;
      expect(parseCompanionIntentEnvelope(missingPrompt)).toBeNull();

      const invalidTurn = `Hello\n\n<companion_intent version="1">\nTURN: invalid\nDISTILLED_INTENT: Intent\nCOMPILED_PROMPT:\nPrompt\n</companion_intent>`;
      expect(parseCompanionIntentEnvelope(invalidTurn)).toBeNull();
    });

    it("identifies messages to bypass correctly", () => {
      expect(shouldBypassCompanionIntent("")).toBe(true);
      expect(shouldBypassCompanionIntent("   ")).toBe(true);
      expect(shouldBypassCompanionIntent("/compact")).toBe(true);
      expect(shouldBypassCompanionIntent("/learn some skill")).toBe(true);
      expect(shouldBypassCompanionIntent("<task_brief>\n- WORKFLOW: test\n</task_brief>")).toBe(true);
      expect(shouldBypassCompanionIntent("<repair_brief>\n- REPAIR: test\n</repair_brief>")).toBe(true);

      const alreadyWrapped = formatCompanionIntentEnvelope({
        rawUserText: "Do something",
        turnIndex: 1,
        distilledIntent: "Intent",
        compiledPrompt: "Prompt",
      });
      expect(shouldBypassCompanionIntent(alreadyWrapped)).toBe(true);

      // Normal message should NOT bypass
      expect(shouldBypassCompanionIntent("优化一下性能")).toBe(false);
    });

    it("parses intent analysis and reply summary XML correctly", () => {
      const analysisXml = `<intent_analysis>
DISTILLED_INTENT: 用户要求添加暗黑模式开关
COMPILED_PROMPT:
请在设置页面添加暗黑模式切换按钮，并确保主题状态持久化到本地存储。
</intent_analysis>`;
      const analysis = parseIntentAnalysis(analysisXml);
      expect(analysis).toEqual({
        distilledIntent: "用户要求添加暗黑模式开关",
        compiledPrompt: "请在设置页面添加暗黑模式切换按钮，并确保主题状态持久化到本地存储。",
      });

      const replyXml = `<reply_summary>
DISTILLED_REPLY: 已在 SettingsScreen.tsx 添加 ThemeSwitch 组件，提供了 light/dark/system 三种模式选项。
</reply_summary>`;
      const summary = parseReplySummary(replyXml);
      expect(summary).toBe("已在 SettingsScreen.tsx 添加 ThemeSwitch 组件，提供了 light/dark/system 三种模式选项。");
    });
  });

  describe("2. turnVisibleAssistantBody extraction", () => {
    it("extracts visible assistant prose, strictly ignoring tool_call, tool_result, thinking, and plugin", () => {
      const items = [
        { type: "user_message", text: "Turn 1 user" },
        { type: "assistant_message", text: "Turn 1 assistant" },
        { type: "user_message", text: "Turn 2 user" },
        { type: "reasoning", text: "internal reasoning..." },
        { type: "assistant_message", text: "<thinking>hidden thinking</thinking>Here is the first visible paragraph." },
        { type: "tool_call", name: "read_file" },
        { type: "tool_result", text: "file content" },
        { type: "assistant_message", text: "Here is the second visible paragraph with conclusion." },
        { type: "plugin", kind: "proposal" },
      ];

      const visible = turnVisibleAssistantBody(items);
      expect(visible).toBe("Here is the first visible paragraph.\n\nHere is the second visible paragraph with conclusion.");
      expect(visible).not.toContain("hidden thinking");
      expect(visible).not.toContain("internal reasoning");
      expect(visible).not.toContain("Turn 1");
    });
  });

  describe("3. Multi-Turn Persistent Companion Session Flow", () => {
    it("creates companion session on Turn 1, distills prose on Turn 1 end, and reuses same companion on Turn 2", async () => {
      const createdAgents: any[] = [];
      const companionRuns: { prompt: string }[] = [];
      let companionTimeline: any[] = [];

      const mainAgentId = "main-agent-001";
      const companionAgentId = "companion-agent-999";

      const fakePaseo = {
        agents: {
          create: vi.fn(async (opts: any) => {
            createdAgents.push(opts);
            return { id: companionAgentId };
          }),
          ref: (id: string) => ({
            refresh: async () => ({
              agent: {
                id,
                cwd: "/test/cwd",
                status: "idle",
                archivedAt: null,
                labels: id === companionAgentId
                  ? { [SHADOW_SESSION_LABEL]: "true", [SHADOW_FOR_LABEL]: mainAgentId }
                  : {},
              },
            }),
            run: vi.fn(async (prompt: string) => {
              companionRuns.push({ prompt });
              if (prompt.includes("<analyze_user_turn turn=\"1\">")) {
                companionTimeline = [
                  {
                    type: "assistant_message",
                    text: `<intent_analysis>
DISTILLED_INTENT: 实现用户登录功能
COMPILED_PROMPT:
实现基于 JWT 的登录 API，包含用户名和密码校验。
</intent_analysis>`,
                  },
                ];
              } else if (prompt.includes("<distill_assistant_reply turn=\"1\">")) {
                companionTimeline = [
                  {
                    type: "assistant_message",
                    text: `<reply_summary>
DISTILLED_REPLY: 已创建 POST /login 接口，提供了方案A(Session)与方案B(JWT)，等待用户确认。
</reply_summary>`,
                  },
                ];
              } else if (prompt.includes("<analyze_user_turn turn=\"2\">")) {
                companionTimeline = [
                  {
                    type: "assistant_message",
                    text: `<intent_analysis>
DISTILLED_INTENT: 用户确认采用方案B(JWT)实现登录
COMPILED_PROMPT:
根据前一步提出的方案B，使用 JWT 签名生成 token 并返回给客户端。
</intent_analysis>`,
                  },
                ];
              }
            }),
            timeline: {
              refetch: async () => ({
                entries: companionTimeline.map((item) => ({ item })),
              }),
            },
            archive: vi.fn(async () => ({ archivedAt: new Date().toISOString() })),
          }),
        },
      } as any;

      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({
          id: "bot-mocode",
          name: "moCode",
          provider: "agy",
          model: "gemini-4-hydrogen",
        }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      // --- Turn 1: compile user turn ---
      const turn1Result = await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "我想加一个用户登录功能",
        skipBypass: true,
      });

      expect(turn1Result.bypassed).toBe(false);
      expect(turn1Result.turnIndex).toBe(1);
      expect(turn1Result.distilledIntent).toBe("实现用户登录功能");
      expect(turn1Result.outgoingText).toContain("我想加一个用户登录功能");
      expect(turn1Result.outgoingText).toContain("<companion_intent version=\"1\">");

      // Verify companion session creation parameters
      expect(fakePaseo.agents.create).toHaveBeenCalledTimes(1);
      const createCall = createdAgents[0];
      expect(createCall.background).toBe(true);
      expect(createCall.title).toBe("[Companion] moCode");
      expect(createCall.labels[SHADOW_SESSION_LABEL]).toBe("true");
      expect(createCall.labels[SHADOW_FOR_LABEL]).toBe(mainAgentId);
      expect(createCall.config.provider).toBe("agy/gemini-3.8-flash");
      expect(createCall.config.thinkingOptionId).toBe("medium");
      expect(createCall.config.mcpServers).toEqual({});

      // Check ledger file after Turn 1 compile
      const ledgerT1 = await readShadowSession(mainAgentId);
      expect(ledgerT1).not.toBeNull();
      expect(ledgerT1?.turns.length).toBe(1);
      expect(ledgerT1?.turns[0]!.distilledIntent).toBe("实现用户登录功能");
      expect(ledgerT1?.turns[0]!.distilledReply).toBeNull();

      // --- Turn 1 post-reply distillation ---
      await manager.distillTurnReply({
        mainAgentId,
        botId: "bot-mocode",
        assistantBody: "我为你准备了两种方案：\n方案A：传统 Session Cookie\n方案B：JWT Bearer Token\n请问你更倾向哪种？",
      });

      // Check ledger file after Turn 1 reply distillation
      const ledgerT1Done = await readShadowSession(mainAgentId);
      expect(ledgerT1Done?.turns[0]!.distilledReply).toContain("POST /login");
      expect(ledgerT1Done?.turns[0]!.completedAt).not.toBeNull();

      // --- Turn 2: user responds "选第二个方案" ---
      const turn2Result = await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "选第二个方案",
      });

      expect(turn2Result.bypassed).toBe(false);
      expect(turn2Result.turnIndex).toBe(2);
      expect(turn2Result.distilledIntent).toBe("用户确认采用方案B(JWT)实现登录");

      // Reused the EXACT same companion session without creating another one!
      expect(fakePaseo.agents.create).toHaveBeenCalledTimes(1);

      // Check ledger has 2 turns
      const ledgerT2 = await readShadowSession(mainAgentId);
      expect(ledgerT2?.turns.length).toBe(2);
      expect(ledgerT2?.turns[1]!.turnIndex).toBe(2);
      expect(ledgerT2?.turns[1]!.distilledIntent).toBe("用户确认采用方案B(JWT)实现登录");
    });

    it("configures companion session thinkingOptionId via manager options", async () => {
      const mainAgentId = "main-agent-thinking-test";
      const companionAgentId = "companion-agent-thinking-test";
      const createdAgents: any[] = [];

      const fakePaseo = {
        agents: {
          create: vi.fn(async (params: any) => {
            createdAgents.push(params);
            return { id: companionAgentId };
          }),
          ref: () => ({
            refresh: async () => ({
              agent: { id: companionAgentId, status: "idle", archivedAt: null },
            }),
            run: async () => {},
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      id: "item-1",
                      type: "message",
                      source: "assistant",
                      content:
                        "<intent_analysis>\nDISTILLED_INTENT: 测试思考等级\nCOMPILED_PROMPT:\n测试思考等级指令\n</intent_analysis>",
                    },
                  },
                ],
              }),
            },
          }),
        },
      };

      const host: BotsHost = {
        bot: async () => ({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen" }),
        paseo: fakePaseo as unknown as PaseoApi,
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(host, {
        thinkingOptionId: "medium",
      });

      await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "请测试下思考等级为medium的模式",
        skipBypass: true,
      });

      expect(fakePaseo.agents.create).toHaveBeenCalledTimes(1);
      expect(createdAgents[0].config.thinkingOptionId).toBe("medium");
    });

    it("configures companion session thinkingOptionId via PASEO_BOTS_COMPANION_THINKING env var", async () => {
      const mainAgentId = "main-agent-thinking-env-test";
      const companionAgentId = "companion-agent-thinking-env-test";
      const createdAgents: any[] = [];

      const fakePaseo = {
        agents: {
          create: vi.fn(async (params: any) => {
            createdAgents.push(params);
            return { id: companionAgentId };
          }),
          ref: () => ({
            refresh: async () => ({
              agent: { id: companionAgentId, status: "idle", archivedAt: null },
            }),
            run: async () => {},
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      id: "item-1",
                      type: "message",
                      source: "assistant",
                      content:
                        "<intent_analysis>\nDISTILLED_INTENT: 测试环境变量思考等级\nCOMPILED_PROMPT:\n测试指令\n</intent_analysis>",
                    },
                  },
                ],
              }),
            },
          }),
        },
      };

      const host: BotsHost = {
        bot: async () => ({ id: "bot-mocode", name: "moCode", provider: "agy", model: "gemini-4-hydrogen" }),
        paseo: fakePaseo as unknown as PaseoApi,
      } as unknown as BotsHost;

      process.env.PASEO_BOTS_COMPANION_THINKING = "high";
      try {
        const manager = new CompanionSessionManager(host);
        await manager.compileUserTurn({
          mainAgentId,
          botId: "bot-mocode",
          rawText: "请测试下环境变量思考等级",
          skipBypass: true,
        });

        expect(fakePaseo.agents.create).toHaveBeenCalledTimes(1);
        expect(createdAgents[0].config.thinkingOptionId).toBe("high");
      } finally {
        delete process.env.PASEO_BOTS_COMPANION_THINKING;
      }
    });
  });

  describe("4. Concurrency Serialization", () => {
    it("serializes compileUserTurn and distillTurnReply per mainAgentId", async () => {
      const executionOrder: string[] = [];

      const mainAgentId = "main-agent-serial";
      const companionAgentId = "companion-agent-serial";

      let resolveDistillation: (() => void) | null = null;
      const distillationInFlight = new Promise<void>((resolve) => {
        resolveDistillation = resolve;
      });

      const fakePaseo = {
        agents: {
          create: vi.fn(async () => ({ id: companionAgentId })),
          ref: () => ({
            refresh: async () => ({
              agent: {
                id: companionAgentId,
                status: "idle",
                archivedAt: null,
                labels: { [SHADOW_SESSION_LABEL]: "true", [SHADOW_FOR_LABEL]: mainAgentId },
              },
            }),
            run: vi.fn(async (prompt: string) => {
              if (prompt.includes("<distill_assistant_reply")) {
                executionOrder.push("distill:start");
                await distillationInFlight;
                executionOrder.push("distill:finish");
              } else if (prompt.includes("<analyze_user_turn turn=\"2\"")) {
                executionOrder.push("compile2:start");
                executionOrder.push("compile2:finish");
              } else {
                executionOrder.push("compile1:run");
              }
            }),
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      type: "assistant_message",
                      text: `<intent_analysis>
DISTILLED_INTENT: Turn Intent
COMPILED_PROMPT:
Turn Prompt
</intent_analysis>`,
                    },
                  },
                ],
              }),
            },
          }),
        },
      } as any;

      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({ id: "bot-mocode", provider: "agy" }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      // Start turn 1 compile
      await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 1 message",
        skipBypass: true,
      });

      // Start Turn 1 distillation (in-flight, blocked on distillationInFlight)
      const distillPromise = manager.distillTurnReply({
        mainAgentId,
        botId: "bot-mocode",
        assistantBody: "Turn 1 reply",
      });

      // User immediately sends Turn 2 while Turn 1 distillation is still in-flight
      const compilePromise = manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 2 message",
      });

      // Unblock distillation after a brief moment
      setTimeout(() => {
        resolveDistillation?.();
      }, 50);

      await Promise.all([distillPromise, compilePromise]);

      // Execution order must be strictly serialized: distill finishes BEFORE compile 2 starts!
      expect(executionOrder).toEqual([
        "compile1:run",
        "distill:start",
        "distill:finish",
        "compile2:start",
        "compile2:finish",
      ]);
    });
  });

  describe("5. Anti-Recursion & MemoryCurator Isolation", () => {
    it("ignores turns on SHADOW_SESSION_LABEL agents in turnEnded", async () => {
      const appendDailyLogSpy = vi.fn();
      const curateTurnFallbackSpy = vi.fn();

      const fakeHost = {
        chatOf: async () => ({
          botId: "bot-mocode",
          title: "Companion Chat",
          labels: { [SHADOW_SESSION_LABEL]: "true" },
        }),
      } as unknown as BotsHost;

      const fakeJournal = {
        begin: vi.fn(),
        end: vi.fn(),
      } as unknown as MemoryJournal;

      const fakeScheduler = {
        finished: vi.fn(),
      } as unknown as RoutineScheduler;

      const fakeCurator = {
        isCurationAgent: () => false,
        curateTurnFallback: curateTurnFallbackSpy,
      };

      await turnEnded(
        fakeHost,
        fakeJournal,
        fakeScheduler,
        {
          agent: { id: "companion-agent-xyz", title: "Companion" },
          outcome: { kind: "completed" },
          timeline: [
            { type: "user_message", text: "analyze turn" },
            { type: "assistant_message", text: "intent analysis" },
          ],
        },
        fakeCurator,
      );

      // Must return immediately without journal, curation, or logs
      expect(fakeJournal.end).not.toHaveBeenCalled();
      expect(curateTurnFallbackSpy).not.toHaveBeenCalled();
    });

    it("runs hasMemorySignal on rawUserText ONLY so COMPILED_PROMPT never triggers memory curation", async () => {
      const curateTurnFallbackSpy = vi.fn(async () => true);

      const fakeHost = {
        chatOf: async () => ({
          botId: "bot-mocode",
          title: "Main Chat",
          labels: {},
        }),
        paseo: {
          agents: {
            ref: () => ({
              timeline: {
                refetch: async () => ({ entries: [] }),
              },
            }),
          },
        },
      } as unknown as BotsHost;

      const fakeJournal = {
        begin: vi.fn(),
        end: vi.fn(async () => false), // memoryChanged = false
      } as unknown as MemoryJournal;

      const fakeScheduler = {
        finished: vi.fn(),
      } as unknown as RoutineScheduler;

      const fakeCurator = {
        isCurationAgent: () => false,
        curateTurnFallback: curateTurnFallbackSpy,
      };

      // Raw user text has NO memory signal ("请帮我查看代码")
      // But COMPILED_PROMPT has words like "Never do X, always do Y" which would trigger MEMORY_SIGNAL_RE if unhygienic!
      const userTextWithEnvelope = formatCompanionIntentEnvelope({
        rawUserText: "请帮我查看代码",
        turnIndex: 1,
        distilledIntent: "查看代码",
        compiledPrompt: "Review the code. Always check for security bugs and never commit secrets.",
      });

      await turnEnded(
        fakeHost,
        fakeJournal,
        fakeScheduler,
        {
          agent: { id: "main-chat-1", title: "Main Chat" },
          outcome: { kind: "completed" },
          timeline: [
            { type: "user_message", text: userTextWithEnvelope },
            { type: "assistant_message", text: "Code review complete." },
          ],
        },
        fakeCurator,
      );

      // MemoryCurator must NOT be called because rawUserText had no memory signal!
      expect(curateTurnFallbackSpy).not.toHaveBeenCalled();

      // Now test with a user message that DOES contain a memory signal
      const userTextWithMemorySignal = formatCompanionIntentEnvelope({
        rawUserText: "记住我更喜欢 TypeScript",
        turnIndex: 2,
        distilledIntent: "用户说明偏好 TypeScript",
        compiledPrompt: "Use TypeScript for future tasks.",
      });

      await turnEnded(
        fakeHost,
        fakeJournal,
        fakeScheduler,
        {
          agent: { id: "main-chat-1", title: "Main Chat" },
          outcome: { kind: "completed" },
          timeline: [
            { type: "user_message", text: userTextWithMemorySignal },
            { type: "assistant_message", text: "已记住您的偏好。" },
          ],
        },
        fakeCurator,
      );

      // MemoryCurator MUST be called with clean rawUserText, not the XML envelope
      expect(curateTurnFallbackSpy).toHaveBeenCalledTimes(1);
      expect(curateTurnFallbackSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userText: "记住我更喜欢 TypeScript",
        }),
      );
    });
  });

  describe("6. Fail-Open Behavior & Error Handling", () => {
    it("falls back to raw text cleanly if companion session errors or times out", async () => {
      const fakePaseo = {
        agents: {
          create: vi.fn(async () => ({ id: "companion-fail" })),
          ref: () => ({
            refresh: async () => ({
              agent: { id: "companion-fail", status: "idle", archivedAt: null },
            }),
            run: vi.fn(async () => {
              throw new Error("Provider timeout after 15000ms");
            }),
          }),
        },
      } as any;

      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({ id: "bot-mocode", provider: "agy" }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      const result = await manager.compileUserTurn({
        mainAgentId: "main-fail-agent",
        botId: "bot-mocode",
        rawText: "Normal user text",
        skipBypass: true,
      });

      expect(result.outgoingText).toBe("Normal user text");
      expect(result.bypassed).toBe(true);
      expect(result.fallbackReason).toContain("timeout");
    });
  });

  describe("7. UI Rendering & Bubble Invariant", () => {
    it("renders rawUserText + collapsible CompanionIntentBadge inside single surface3 bubble", () => {
      const rawUserText = "我想为这个项目编写单元测试";
      const distilledIntent = "编写单元测试用例";
      const compiledPrompt = "Write unit tests using vitest covering all edge cases.";

      const envelope = formatCompanionIntentEnvelope({
        rawUserText,
        turnIndex: 1,
        distilledIntent,
        compiledPrompt,
      });

      let tree: ReactTestRenderer | undefined;
      act(() => {
        tree = create(
          <RowContent
            compactBottom={false}
            context={{
              colors: MOCK_COLORS,
              compact: false,
              attachmentsFor: () => [],
              agentId: "agent-1",
              botId: "bot-mocode",
            }}
            row={{
              kind: "user",
              key: "msg-1",
              text: envelope,
              timestamp: Date.now(),
            }}
          />,
        );
      });

      const root = tree!.root;

      // 1. Must render rawUserText
      const spans = root.findAllByType("span");
      const hasRawText = spans.some((s) => s.props.children === rawUserText);
      expect(hasRawText).toBe(true);

      // 2. Must NOT leak raw XML tags like <companion_intent> in any rendered text
      for (const span of spans) {
        if (typeof span.props.children === "string") {
          expect(span.props.children).not.toContain("<companion_intent");
          expect(span.props.children).not.toContain("</companion_intent>");
        }
      }

      // 3. Must render collapsed CompanionIntentBadge with Sparkles icon & distilled intent
      const buttons = root.findAllByType("button");
      const badgeHeader = buttons.find((b) => b.props.accessibilityRole === "button" && b.props.accessibilityLabel === "展开提炼详情");
      expect(badgeHeader).toBeDefined();

      // In collapsed state, compiledPrompt is not rendered yet
      const compiledBefore = spans.find((s) => s.props.children === compiledPrompt);
      expect(compiledBefore).toBeUndefined();

      // Click to expand
      act(() => {
        badgeHeader!.props.onClick();
      });

      // After expansion, compiledPrompt is now visible
      const spansAfter = root.findAllByType("span");
      const compiledAfter = spansAfter.find((s) => s.props.children === compiledPrompt);
      expect(compiledAfter).toBeDefined();
    });
  });

  describe("8. Deterministic G0–G4 0ms Bypass Gate & Async Backfill", () => {
    it("G0: cold start triggers 0ms bypass to main agent and async backfills rootGoal", async () => {
      const mainAgentId = "main-g0-test";
      const fakePaseo = {
        agents: {
          create: vi.fn(),
          ref: () => ({ refresh: async () => null, run: vi.fn() }),
        },
      } as any;
      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({ id: "bot-mocode", provider: "agy" }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      // Turn 1 (turnsCount === 0): should bypass with G0_COLD_START
      const res = await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "实现双通道伴生意图编译",
      });

      expect(res.bypassed).toBe(true);
      expect(res.fallbackReason).toBe("G0_COLD_START");
      expect(res.outgoingText).toBe("实现双通道伴生意图编译");

      // Give async backfill a short tick to complete disk write
      await new Promise((resolve) => setTimeout(resolve, 50));

      const ledger = await readShadowSession(mainAgentId);
      expect(ledger).not.toBeNull();
      expect(ledger?.rootGoal?.summary).toContain("实现双通道伴生意图编译");
      expect(ledger?.rootGoal?.verbatimAnchor).toContain("实现双通道伴生意图编译");
      expect(ledger?.rootGoal?.turnSeq).toBe(1);
      expect(ledger?.turns.length).toBe(1);
      expect(ledger?.turns[0]!.turnIndex).toBe(1);
    });

    it("G1: slash commands are 0ms bypassed", () => {
      expect(classifyCompanionBypass({ rawText: "/compact", turnsCount: 2 })).toEqual({
        bypassed: true,
        gate: "G1_SLASH_COMMAND",
      });
      expect(classifyCompanionBypass({ rawText: "/learn custom skill", turnsCount: 1 })).toEqual({
        bypassed: true,
        gate: "G1_SLASH_COMMAND",
      });
      expect(classifyCompanionBypass({ rawText: "/clear", turnsCount: 3 })).toEqual({
        bypassed: true,
        gate: "G1_SLASH_COMMAND",
      });
    });

    it("G2: pure short confirmations bypass with async backfill, but pivots/negations do NOT bypass", () => {
      const picks = ["好", "好的", "1", "2", "3", "方案1", "第二个", "lgtm", "yes", "继续", "行", "确定"];
      for (const pick of picks) {
        const res = classifyCompanionBypass({ rawText: pick, turnsCount: 2 });
        expect(res.bypassed).toBe(true);
        expect(res.gate).toBe("G2_SHORT_CONFIRMATION");
        expect(res.needsBackfill).toBe(true);
      }

      // Pivots/negations should NOT bypass G2!
      expect(classifyCompanionBypass({ rawText: "不好", turnsCount: 2 }).bypassed).toBe(false);
      expect(classifyCompanionBypass({ rawText: "别改这个", turnsCount: 2 }).bypassed).toBe(false);
      expect(classifyCompanionBypass({ rawText: "但还是选A吧", turnsCount: 2 }).bypassed).toBe(false);
      expect(classifyCompanionBypass({ rawText: "除了第一个", turnsCount: 2 }).bypassed).toBe(false);
    });

    it("G3: deictic-free short atomic dev commands bypass with async backfill, while deictic commands do NOT", () => {
      const devCmds = ["全部提交", "push", "git status", "npm test", "npm run typecheck", "build 看看", "修一下 lint"];
      for (const cmd of devCmds) {
        const res = classifyCompanionBypass({ rawText: cmd, turnsCount: 2 });
        expect(res.bypassed).toBe(true);
        expect(res.gate).toBe("G3_DEICTIC_FREE_ATOMIC_COMMAND");
        expect(res.needsBackfill).toBe(true);
      }

      // Commands with deictic pronouns must NOT bypass!
      expect(classifyCompanionBypass({ rawText: "把刚才那个全部提交", turnsCount: 2 }).bypassed).toBe(false);
      expect(classifyCompanionBypass({ rawText: "把它 push 一下", turnsCount: 2 }).bypassed).toBe(false);
      expect(classifyCompanionBypass({ rawText: "同样跑一下测试", turnsCount: 2 }).bypassed).toBe(false);
      expect(classifyCompanionBypass({ rawText: "测试那个接口", turnsCount: 2 }).bypassed).toBe(false);
    });

    it("G4: large error stack/diff (>1200 chars with signatures) bypasses with async backfill", () => {
      const stack = "Traceback (most recent call last):\n" +
        '  File "main.py", line 42, in <module>\n' +
        "    app.run()\n".repeat(100) +
        "ValueError: Invalid configuration value provided";

      expect(stack.length).toBeGreaterThan(1200);
      const res = classifyCompanionBypass({ rawText: stack, turnsCount: 2 });
      expect(res.bypassed).toBe(true);
      expect(res.gate).toBe("G4_LARGE_STACK_OR_DIFF");
      expect(res.needsBackfill).toBe(true);

      // Short stack trace (<1200 chars) does not bypass G4
      const shortStack = "Error: Invalid token\n at line 1";
      expect(classifyCompanionBypass({ rawText: shortStack, turnsCount: 2 }).bypassed).toBe(false);
    });
  });

  describe("9. Patch-Only Constraint Lifecycle & 3-Turn Revocation Pruning", () => {
    it("preserves untouched constraints byte-for-byte and prunes revoked constraints after 3 turns", () => {
      let state = {
        activeConstraints: [] as any[],
        recentlyRevokedConstraints: [] as any[],
      };

      // Turn 1: Add C1
      state = applyConstraintOps(
        state,
        [{ op: "ADD", rule: "SQLite lock wait at 3000ms", strength: "MUST", verbatim_quote: "等待时间改成 3000ms" }],
        1
      );
      expect(state.activeConstraints.length).toBe(1);
      expect(state.activeConstraints[0]!.id).toBe("C1");
      expect(state.activeConstraints[0]!.rule).toBe("SQLite lock wait at 3000ms");
      const c1Snapshot = state.activeConstraints[0]!;

      // Turn 2: Add C2 (MUST_NOT)
      state = applyConstraintOps(
        state,
        [{ op: "ADD", rule: "严禁阻塞握手阶段", strength: "MUST_NOT", verbatim_quote: "千万别影响握手阶段" }],
        2
      );
      expect(state.activeConstraints.length).toBe(2);
      expect(state.activeConstraints[1]!.id).toBe("C2");
      // C1 must be preserved byte-for-byte!
      expect(state.activeConstraints[0]).toBe(c1Snapshot);

      // Turn 3: SUPERSEDE C1 -> C3
      state = applyConstraintOps(
        state,
        [{ op: "SUPERSEDE", target_id: "C1", rule: "SQLite lock wait at 5000ms", strength: "MUST", reason: "增加重试宽容度" }],
        3
      );
      expect(state.activeConstraints.map((c) => c.id)).toEqual(["C3", "C2"]);
      expect(state.recentlyRevokedConstraints.length).toBe(1);
      expect(state.recentlyRevokedConstraints[0]!.id).toBe("C1");
      expect(state.recentlyRevokedConstraints[0]!.revokedAtTurn).toBe(3);

      // Turn 4 (Turn 4 - 3 = 1 < 3): C1 is retained
      state = applyConstraintOps(state, [], 4);
      expect(state.recentlyRevokedConstraints.some((r) => r.id === "C1")).toBe(true);

      // Turn 5 (Turn 5 - 3 = 2 < 3): C1 is retained
      state = applyConstraintOps(state, [], 5);
      expect(state.recentlyRevokedConstraints.some((r) => r.id === "C1")).toBe(true);

      // Turn 6 (Turn 6 - 3 = 3 >= 3): C1 is pruned!
      state = applyConstraintOps(state, [], 6);
      expect(state.recentlyRevokedConstraints.some((r) => r.id === "C1")).toBe(false);
      expect(state.recentlyRevokedConstraints.length).toBe(0);

      // Turn 7: REVOKE C2
      state = applyConstraintOps(state, [{ op: "REVOKE", target_id: "C2", reason: "用户已完成阶段握手" }], 7);
      expect(state.activeConstraints.map((c) => c.id)).toEqual(["C3"]);
      expect(state.recentlyRevokedConstraints.length).toBe(1);
      expect(state.recentlyRevokedConstraints[0]!.id).toBe("C2");
      expect(state.recentlyRevokedConstraints[0]!.revokedAtTurn).toBe(7);
    });
  });

  describe("10. ToolFootprintDigest Extraction from Timeline", () => {
    it("extracts mutatedFiles, inspectedFiles, commandOutcomes, and errorHeadlines deterministically", () => {
      const items = [
        { type: "user_message", text: "Run some checks" },
        { type: "tool_call", name: "write_file", input: { path: "src/auth.ts" } },
        { type: "tool_call", name: "edit_file", input: { Path: "src/server.ts" } },
        { type: "tool_call", name: "read_file", input: { path: "src/config.ts" } },
        { type: "tool_call", name: "read_file", input: { path: "src/auth.ts" } }, // already mutated -> not in inspected
        { type: "tool_call", name: "run_command", input: { CommandLine: "npm test" }, exitCode: 0 },
        {
          type: "tool_call",
          name: "run_command",
          input: { CommandLine: "npm run lint" },
          exitCode: 1,
          text: "Command exited with code 1\nESLint: 2 errors found in src/auth.ts",
        },
      ];

      const digest = extractToolFootprintDigest(items);
      expect(digest.mutatedFiles).toEqual(["src/auth.ts", "src/server.ts"]);
      expect(digest.inspectedFiles).toEqual(["src/config.ts"]);
      expect(digest.commandOutcomes).toEqual([
        { command: "npm test", exitCode: 0 },
        { command: "npm run lint", exitCode: 1 },
      ]);
      expect(digest.errorHeadlines.length).toBeGreaterThanOrEqual(1);
      expect(digest.errorHeadlines[0]).toContain("ESLint: 2 errors found");
    });

    it("extracts footprint for Paseo 0.16 tool_call detail.input with TargetFile, file_path, and locations schemas", () => {
      const items: TimelineItemLike[] = [
        { type: "user_message", text: "Paseo 0.16 turn" },
        {
          type: "tool_call",
          name: "write_file",
          detail: {
            name: "write_file",
            input: { TargetFile: "report.md" },
          },
        },
        {
          type: "tool_call",
          name: "edit_file",
          detail: {
            input: { file_path: "src/index.ts" },
          },
        },
        {
          type: "tool_call",
          name: "read_file",
          detail: {
            input: { AbsolutePath: "/etc/hosts" },
          },
        },
        {
          type: "tool_call",
          name: "read_file",
          detail: {
            locations: [{ path: "docs/readme.md" }],
          },
        },
        {
          type: "tool_call",
          name: "run_command",
          detail: {
            input: { CommandLine: "vitest run" },
            exitCode: 0,
          },
        },
        {
          type: "tool_call",
          name: "bash",
          detail: {
            input: { command: "git status" },
            output: { exitCode: 1 },
          },
          text: "exit code 1\nfatal: not a git repo",
        },
      ];

      const digest = extractToolFootprintDigest(items);
      expect(digest.mutatedFiles).toEqual(["report.md", "src/index.ts"]);
      expect(digest.inspectedFiles).toEqual(["/etc/hosts", "docs/readme.md"]);
      expect(digest.commandOutcomes).toEqual([
        { command: "vitest run", exitCode: 0 },
        { command: "git status", exitCode: 1 },
      ]);
      expect(digest.errorHeadlines.length).toBeGreaterThanOrEqual(1);
      expect(digest.errorHeadlines[0]).toContain("fatal: not a git repo");
    });
  });

  describe("11. Closed-World Identifier Guard & Dangerous Command Blocking", () => {
    it("strips hallucinated paths absent from allowedSources and blocks unrequested destructive commands", () => {
      const allowedSources = [
        "src/auth.ts",
        "src/server.ts",
        "vitest.config.ts",
      ];

      const compiledPrompt =
        "Please update `src/auth.ts` and also check `src/phantom/hallucinated.ts`. Run git reset --hard and rm -rf dist/ before testing.";
      const rawUserText = "请帮我修改一下鉴权模块";

      const guard = applyClosedWorldGuard(compiledPrompt, allowedSources, rawUserText);

      expect(guard.modified).toBe(true);
      expect(guard.droppedPaths).toContain("src/phantom/hallucinated.ts");
      expect(guard.blockedCommands).toContain("reset --hard");
      expect(guard.blockedCommands).toContain("rm -rf");

      expect(guard.cleanedPrompt).toContain("src/auth.ts");
      expect(guard.cleanedPrompt).not.toContain("src/phantom/hallucinated.ts");
      expect(guard.cleanedPrompt).not.toContain("reset --hard");
      expect(guard.cleanedPrompt).not.toContain("rm -rf");
    });

    it("allows destructive commands when explicitly requested in rawUserText", () => {
      const allowedSources = ["src/auth.ts"];
      const compiledPrompt = "Execute git reset --hard HEAD~1 to revert the bad commit.";
      const rawUserText = "请执行 git reset --hard 撤销提交";

      const guard = applyClosedWorldGuard(compiledPrompt, allowedSources, rawUserText);
      expect(guard.blockedCommands.length).toBe(0);
      expect(guard.cleanedPrompt).toContain("git reset --hard");
    });
  });

  describe("12. 9s Hard Timeout, 60s Circuit Breaker, and 150ms Fast-Follow Race", () => {
    it("trips circuit breaker after 3 failures and fails open for 60s cooldown", () => {
      const breaker = new CompanionCircuitBreaker({ cooldownMs: 60_000 });

      expect(breaker.isOpen("agy")).toBe(false);
      breaker.recordFailure("agy");
      expect(breaker.isOpen("agy")).toBe(false);
      breaker.recordFailure("agy");
      expect(breaker.isOpen("agy")).toBe(false);

      // 3rd failure trips the breaker!
      breaker.recordFailure("agy");
      expect(breaker.isOpen("agy")).toBe(true);

      // Success resets the breaker
      breaker.recordSuccess("agy");
      expect(breaker.isOpen("agy")).toBe(false);
    });

    it("150ms Fast-Follow Race: uses PendingPostTurnSnapshot when distillation takes longer than 150ms", async () => {
      const mainAgentId = "main-fast-follow-race";
      const companionAgentId = "companion-agent-race";

      let resolveDistill: (() => void) | null = null;
      const slowDistillPromise = new Promise<void>((resolve) => {
        resolveDistill = resolve;
      });

      const promptsReceived: string[] = [];

      const fakePaseo = {
        agents: {
          create: vi.fn(async () => ({ id: companionAgentId })),
          ref: () => ({
            refresh: async () => ({
              agent: {
                id: companionAgentId,
                status: "idle",
                archivedAt: null,
                labels: { [SHADOW_SESSION_LABEL]: "true", [SHADOW_FOR_LABEL]: mainAgentId },
              },
            }),
            run: vi.fn(async (prompt: string) => {
              promptsReceived.push(prompt);
              if (prompt.includes("<distill_assistant_reply")) {
                await slowDistillPromise;
              }
            }),
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      type: "assistant_message",
                      text: `<intent_analysis>
DISTILLED_INTENT: Turn 2 fast-follow intent
COMPILED_PROMPT:
Turn 2 compiled prompt
</intent_analysis>`,
                    },
                  },
                ],
              }),
            },
          }),
        },
      } as any;

      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({ id: "bot-mocode", provider: "agy" }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      // Turn 1 compiles
      await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 1 start",
        skipBypass: true,
      });

      // Synchronously record pending post-turn snapshot before slow distillation
      manager.recordPendingPostTurnSnapshot(mainAgentId, {
        turnSeq: 1,
        rawUserText: "Turn 1 start",
        assistantVisibleBody: "Turn 1 in-flight assistant outcome proposing Option A and Option B",
        footprintDigest: {
          mutatedFiles: ["src/client.ts"],
          inspectedFiles: [],
          commandOutcomes: [{ command: "npm test", exitCode: 0 }],
          errorHeadlines: [],
        },
        timestamp: Date.now(),
      });

      // Start slow distillation (>150ms in flight)
      const distillPromise = manager.distillTurnReply({
        mainAgentId,
        botId: "bot-mocode",
        assistantBody: "Turn 1 reply",
      });

      // Turn 2 arrives while Turn 1 distillation is still in-flight
      const startT2 = Date.now();
      const turn2Promise = manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "选 Option A",
        skipBypass: true,
      });

      // Resolve slow distillation after 300ms (>150ms)
      setTimeout(() => {
        resolveDistill?.();
      }, 300);

      const turn2Res = await turn2Promise;
      const durationT2 = Date.now() - startT2;

      // Turn 2 must NOT have waited 300ms for distillation! It races and unblocks after ~150ms
      expect(durationT2).toBeLessThan(280);
      expect(turn2Res.bypassed).toBe(false);

      // Turn 2 compile prompt must include the pending snapshot (<pending_prior_turn>)
      const turn2Prompt = promptsReceived.find((p) => p.includes('<analyze_user_turn turn="2">'));
      expect(turn2Prompt).toBeDefined();
      expect(turn2Prompt).toContain("<pending_prior_turn>");
      expect(turn2Prompt).toContain("Option A and Option B");
      expect(turn2Prompt).toContain("src/client.ts");

      await distillPromise;
    });

    it("uses 9000ms default compile timeout for companion run", async () => {
      const mainAgentId = "main-agent-timeout-default";
      let capturedTimeout: number | undefined;

      const fakePaseo = {
        agents: {
          create: vi.fn(async () => ({ id: "companion-timeout-agent" })),
          ref: () => ({
            refresh: async () => ({
              agent: { id: "companion-timeout-agent", status: "idle", archivedAt: null },
            }),
            run: vi.fn(async (_prompt: string, opts?: { timeoutMs?: number }) => {
              capturedTimeout = opts?.timeoutMs;
            }),
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      type: "assistant_message",
                      text: `<intent_analysis>\nDISTILLED_INTENT: Timeout Test\nCOMPILED_PROMPT:\nPrompt\n</intent_analysis>`,
                    },
                  },
                ],
              }),
            },
          }),
        },
      } as any;

      const host: BotsHost = {
        bot: async () => ({ id: "bot-mocode", provider: "agy" }),
        paseo: fakePaseo,
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(host);
      await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "测试超时默认值",
        skipBypass: true,
      });

      expect(capturedTimeout).toBe(9000);
    });

    it("auto-rotates wedged companionAgentId when run rejects with cancellation error and injects prior_distilled_history", async () => {
      const mainAgentId = "main-agent-wedged-test";
      const createdAgents: any[] = [];
      const archivedAgents: string[] = [];
      let agentCounter = 0;

      const fakePaseo = {
        agents: {
          create: vi.fn(async (params: any) => {
            agentCounter++;
            const id = `companion-agent-${agentCounter}`;
            createdAgents.push({ id, ...params });
            return { id };
          }),
          ref: (id: string) => ({
            refresh: async () => ({
              agent: {
                id,
                status: "idle",
                archivedAt: archivedAgents.includes(id) ? new Date().toISOString() : null,
                labels: { [SHADOW_SESSION_LABEL]: "true", [SHADOW_FOR_LABEL]: mainAgentId },
              },
            }),
            archive: vi.fn(async () => {
              archivedAgents.push(id);
            }),
            run: vi.fn(async (prompt: string) => {
              if (id === "companion-agent-1" && prompt.includes('<analyze_user_turn turn="1">')) {
                return;
              }
              if (id === "companion-agent-1" && prompt.includes('<analyze_user_turn turn="2">')) {
                throw new Error("Cannot replace agent companion-agent-1 because its active run cancellation was not acknowledged");
              }
              return;
            }),
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      type: "assistant_message",
                      text: `<intent_analysis>\nDISTILLED_INTENT: Successful Turn Intent\nCOMPILED_PROMPT:\nSuccessful Turn Prompt\n</intent_analysis>`,
                    },
                  },
                ],
              }),
            },
          }),
        },
      } as any;

      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({ id: "bot-mocode", name: "moCode", provider: "agy" }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      // --- Turn 1: Successfully compiles and sets up companion-agent-1 ---
      const turn1Result = await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 1: 请实现用户认证",
        skipBypass: true,
      });

      expect(turn1Result.bypassed).toBe(false);
      expect(turn1Result.turnIndex).toBe(1);
      expect(fakePaseo.agents.create).toHaveBeenCalledTimes(1);
      expect(createdAgents[0].id).toBe("companion-agent-1");

      let ledger = await readShadowSession(mainAgentId);
      expect(ledger?.companionAgentId).toBe("companion-agent-1");
      expect(ledger?.turns.length).toBe(1);

      // Distill Turn 1 reply
      await manager.distillTurnReply({
        mainAgentId,
        botId: "bot-mocode",
        assistantBody: "Turn 1 已完成认证实现",
      });

      // --- Turn 2: run() rejects with wedged cancellation error ---
      const turn2Result = await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 2: 继续添加单元测试",
        skipBypass: true,
      });

      // Fails open cleanly
      expect(turn2Result.bypassed).toBe(true);
      expect(turn2Result.fallbackReason).toContain("Cannot replace agent");

      // Archived the wedged agent
      expect(archivedAgents).toContain("companion-agent-1");

      // Ledger companionAgentId must be reset to null!
      ledger = await readShadowSession(mainAgentId);
      expect(ledger?.companionAgentId).toBeNull();

      // --- Turn 3: Next turn automatically creates a fresh companion session with <prior_distilled_history> ---
      const turn3Result = await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 3: 检查覆盖率报告",
        skipBypass: true,
      });

      expect(turn3Result.bypassed).toBe(false);
      expect(fakePaseo.agents.create).toHaveBeenCalledTimes(2);
      expect(createdAgents[1].id).toBe("companion-agent-2");

      // Verify createdAgents[1].config.systemPrompt contains <prior_distilled_history>
      const newCompanionConfig = createdAgents[1].config;
      expect(newCompanionConfig.systemPrompt).toContain("<prior_distilled_history>");
      expect(newCompanionConfig.systemPrompt).toContain("Turn 1: 请实现用户认证");

      // Ledger now points to companion-agent-2
      ledger = await readShadowSession(mainAgentId);
      expect(ledger?.companionAgentId).toBe("companion-agent-2");
    });

    it("auto-rotates wedged companionAgentId on timeout in distillTurnReply", async () => {
      const mainAgentId = "main-agent-distill-timeout";
      const archivedAgents: string[] = [];

      const fakePaseo = {
        agents: {
          create: vi.fn(async () => ({ id: "companion-distill-timeout-1" })),
          ref: (id: string) => ({
            refresh: async () => ({
              agent: {
                id,
                status: "idle",
                archivedAt: archivedAgents.includes(id) ? new Date().toISOString() : null,
                labels: { [SHADOW_SESSION_LABEL]: "true", [SHADOW_FOR_LABEL]: mainAgentId },
              },
            }),
            archive: vi.fn(async () => {
              archivedAgents.push(id);
            }),
            run: vi.fn(async (prompt: string) => {
              if (prompt.includes("<distill_assistant_reply")) {
                throw new Error("timed out after 15000ms");
              }
            }),
            timeline: {
              refetch: async () => ({
                entries: [
                  {
                    item: {
                      type: "assistant_message",
                      text: `<intent_analysis>\nDISTILLED_INTENT: Turn 1 Intent\nCOMPILED_PROMPT:\nTurn 1 Prompt\n</intent_analysis>`,
                    },
                  },
                ],
              }),
            },
          }),
        },
      } as any;

      const fakeHost = {
        paseo: fakePaseo,
        bot: async () => ({ id: "bot-mocode", name: "moCode", provider: "agy" }),
      } as unknown as BotsHost;

      const manager = new CompanionSessionManager(fakeHost);

      await manager.compileUserTurn({
        mainAgentId,
        botId: "bot-mocode",
        rawText: "Turn 1 message",
        skipBypass: true,
      });

      let ledger = await readShadowSession(mainAgentId);
      expect(ledger?.companionAgentId).toBe("companion-distill-timeout-1");

      await manager.distillTurnReply({
        mainAgentId,
        botId: "bot-mocode",
        assistantBody: "Turn 1 assistant reply",
      });

      expect(archivedAgents).toContain("companion-distill-timeout-1");
      ledger = await readShadowSession(mainAgentId);
      expect(ledger?.companionAgentId).toBeNull();
    });
  });
});
