import { act, create, type ReactTestRenderer } from "react-test-renderer";
import React from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  formatCompanionIntentEnvelope,
  parseCompanionIntentEnvelope,
  SHADOW_FOR_LABEL,
  SHADOW_SESSION_LABEL,
  shouldBypassCompanionIntent,
} from "../shared/companion-intent";
import { turnVisibleAssistantBody } from "../shared/activity";
import {
  CompanionSessionManager,
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
      expect(createCall.config.thinkingOptionId).toBe("low");
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
});
