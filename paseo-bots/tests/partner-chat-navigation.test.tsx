import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import type { Bot, BotSettingsValues } from "../shared/bot";
import { DEFAULT_BOT_LIST_UI, EMPTY_LIBRARY } from "../shared/bot";
import type { BotSettingsState } from "../client/useBotSettings";
import { makeBot } from "./helpers";
import { setGlobalNavigation } from "../client/navigation";

vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: () => vi.fn(async () => ({})),
}));

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  copyText: vi.fn(async () => {}),
  useToast: () => ({ show: vi.fn(), error: vi.fn() }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    getQueryData: vi.fn(() => []),
    invalidateQueries: vi.fn(async () => {}),
  }),
}));

vi.mock("react-native", () => ({
  BackHandler: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
}));

vi.mock("../client/data", () => ({
  useBotHost: () => ({ key: "local", label: "Local", isLocal: true }),
  useChatInvalidation: vi.fn(),
  useHostResolver: () => vi.fn(() => ({ key: "local", label: "Local", isLocal: true, online: true, api: null })),
  useProviders: () => ({ data: [] }),
}));

vi.mock("../client/i18n", () => ({
  useT: () => ({ t: (k: string) => k }),
  formatPluralCount: (_t: unknown, singular: string, count: number) => `${count} ${singular}`,
}));

vi.mock("../client/keyboard", () => ({
  homeIndicatorInset: () => 0,
  useKeyboardHeight: () => 0,
}));

vi.mock("../client/native", () => ({
  confirmDialog: vi.fn(async () => true),
  errorText: (e: unknown) => String(e),
  nativeTokens: () => ({ dark: false, surfaceSidebar: "#fff", interactionHighlight: "#eee" }),
}));

vi.mock("../client/ui/Menu", () => ({
  measureAnchor: vi.fn(),
  useMenu: () => ({ open: vi.fn(), close: vi.fn() }),
}));

vi.mock("../client/BotSidebar", () => ({
  BotSidebar: "BotSidebar",
  BotSidebarFooter: "BotSidebarFooter",
}));

vi.mock("../client/teams/TeamTabs", () => ({
  TeamTabsRow: "TeamTabsRow",
  TeamTabSwitcher: "TeamTabSwitcher",
}));

vi.mock("../client/ui/Columns", () => ({
  ResizeHandle: "ResizeHandle",
  RowResizeHandle: "RowResizeHandle",
  SlideOver: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("../client/launcher/BotLauncherCore", () => ({
  BotLauncherCore: (props: { initialBotId?: string | null }) => (
    <div data-testid="bot-launcher-core" data-initial-bot-id={props.initialBotId ?? ""} />
  ),
}));

vi.mock("../client/panel/BotPanel", () => ({
  BotPanel: "BotPanel",
}));

vi.mock("../client/Splash", () => ({
  Splash: "Splash",
}));

vi.mock("../client/AgyOrphanBanner", () => ({
  AgyOrphanBanner: "AgyOrphanBanner",
}));

vi.mock("../client/settings/PartnerSettingsModal", () => ({
  PartnerSettingsModal: "PartnerSettingsModal",
}));

vi.mock("../client/teams/TeamMap", () => ({
  TeamMap: "TeamMap",
}));

vi.mock("../client/teams/TeamSheet", () => ({
  TeamSheet: "TeamSheet",
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { BotsSurfaceReady } from "../client/BotsSurfaceReady";

describe("Partner chat navigation (DoD-1)", () => {
  afterEach(() => {
    setGlobalNavigation(null);
  });
  it("opens the existing stage.chatId via openAgent when navigated to bot-chat with botId and chatId", async () => {
    const theme = {
      colors: {
        surface0: "#000",
        surface1: "#111",
        surface2: "#222",
        border: "#333",
        foreground: "#fff",
        foregroundMuted: "#888",
        accent: "#00f",
      },
    } as any;
    const layout = { compact: false, platform: "web" as const };
    const host = { id: "local", label: "Local" };
    const openAgent = vi.fn();
    const bots: Bot[] = [
      makeBot({ id: "bot-lead", name: "moAdmin" }),
      makeBot({ id: "bot-mocode", name: "moCode" }),
    ];
    const settingsValues: BotSettingsValues = {
      bots,
      groups: [],
      library: EMPTY_LIBRARY,
      history: [],
      ui: { ...DEFAULT_BOT_LIST_UI },
    };
    const settings: Extract<BotSettingsState, { status: "ready" }> = {
      status: "ready",
      values: settingsValues,
      revision: "rev-1",
      saving: false,
      saveError: null,
      save: vi.fn(async () => true),
      reload: vi.fn(async () => {}),
      reset: vi.fn(async () => true),
    };

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <BotsSurfaceReady
          theme={theme}
          layout={layout}
          host={host}
          navigation={{ openAgent } as any}
          screen="bot-chat"
          params={{ botId: "bot-mocode", chatId: "stage-chat-uuid-999" }}
          settings={settings}
          latest={{ current: settings }}
          commit={vi.fn(async () => true)}
        />,
      );
    });

    expect(openAgent).toHaveBeenCalledTimes(1);
    expect(openAgent).toHaveBeenCalledWith({ agentId: "stage-chat-uuid-999", serverId: "local" });
    const launcher = renderer!.root.findByProps({ "data-testid": "bot-launcher-core" });
    expect(launcher.props["data-initial-bot-id"]).toBe("bot-mocode");
  });

  it("does not call openAgent when bot-chat has no chatId (new blank session)", async () => {
    const theme = {
      colors: {
        surface0: "#000",
        surface1: "#111",
        surface2: "#222",
        border: "#333",
        foreground: "#fff",
        foregroundMuted: "#888",
        accent: "#00f",
      },
    } as any;
    const openAgent = vi.fn();
    const bots: Bot[] = [makeBot({ id: "bot-mocode", name: "moCode" })];
    const settings: Extract<BotSettingsState, { status: "ready" }> = {
      status: "ready",
      values: { bots, groups: [], library: EMPTY_LIBRARY, history: [], ui: { ...DEFAULT_BOT_LIST_UI } },
      revision: "rev-1",
      saving: false,
      saveError: null,
      save: vi.fn(async () => true),
      reload: vi.fn(async () => {}),
      reset: vi.fn(async () => true),
    };

    await act(async () => {
      create(
        <BotsSurfaceReady
          theme={theme}
          layout={{ compact: false, platform: "web" }}
          host={{ id: "local", label: "Local" }}
          navigation={{ openAgent } as any}
          screen="bot-chat"
          params={{ botId: "bot-mocode" }}
          settings={settings}
          latest={{ current: settings }}
          commit={vi.fn(async () => true)}
        />,
      );
    });

    expect(openAgent).not.toHaveBeenCalled();
  });
});
