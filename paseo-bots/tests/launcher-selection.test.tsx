import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot, BotGroup } from "../shared/bot";

const mockState = vi.hoisted(() => ({
  bots: [] as Bot[],
  groups: [] as BotGroup[],
  ensureHome: vi.fn(async () => ({ path: "/tmp/bot-home", root: null })),
  compose: vi.fn(async () => ({ systemPrompt: "sys" })),
  mountServers: vi.fn(async () => ({})),
  startBotChat: vi.fn<(...args: unknown[]) => Promise<string>>(async () => "agent-new-1"),
  invalidateQueries: vi.fn(async () => {}),
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: (rpc: unknown) => {
    const id = String(rpc);
    if (id.includes("ensureBotHome")) return mockState.ensureHome;
    if (id.includes("systemPrompt")) return mockState.compose;
    if (id.includes("mount")) return mockState.mountServers;
    return mockState.ensureHome;
  },
}));
vi.mock("@getpaseo/plugin/client/react-native", () => ({
  Icon: "Icon",
  useToast: () => ({ show: vi.fn(), error: vi.fn() }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mockState.invalidateQueries }),
}));
vi.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Platform: { OS: "ios", select: (o: Record<string, unknown>) => o.ios ?? o.default },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  StyleSheet: { create: <T,>(styles: T) => styles },
  Text: "Text",
  TextInput: "TextInput",
  View: "View",
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
}));
vi.mock("../client/Avatar", () => ({ Avatar: "Avatar", TeamLogo: "TeamLogo" }));
vi.mock("../client/data", () => ({
  useBotHost: () => ({
    key: "local",
    label: "Local",
    isLocal: true,
    api: { workspaces: { list: vi.fn(async () => ({ entries: [] })) } },
  }),
  useHostWorkspaces: () => ({ data: [] }),
}));
vi.mock("../client/i18n", () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string>) => {
      if (key === "sidebar.newChatWithBot") return `与 ${vars?.name ?? ""} 新建对话`;
      if (key === "launcher.directMode") return "私聊";
      if (key === "launcher.teamMode") return "团队";
      return key;
    },
  }),
}));
vi.mock("../client/native", () => ({
  nativeTokens: () => ({ dark: false, surfaceSidebar: "#fff" }),
}));
vi.mock("../client/navigation", () => ({
  getGlobalNavigation: () => ({ openAgent: vi.fn() }),
}));
vi.mock("../client/typography", () => ({ ui: (s: number) => s }));
vi.mock("../client/useBotSettings", () => ({
  useBotSettings: () => ({
    settings: {
      status: "ready",
      values: {
        bots: mockState.bots,
        groups: mockState.groups,
        library: { skills: [], mcpServers: [], apps: [] },
        ui: { chatOrder: {} },
      },
    },
  }),
}));
vi.mock("../client/web", () => ({
  createHiddenFileInput: () => ({ click: vi.fn(), destroy: vi.fn() }),
  createTextMeasurer: () => null,
  decodeUtf8: (s: string) => s,
  domNode: () => null,
  listenForImagePaste: () => () => {},
  observeWidth: () => () => {},
  pickFileHandles: vi.fn(async () => []),
}));
vi.mock("../shared/chat", () => ({
  resolveBotPlacement: () => ({ path: "/tmp/bot-home", projectRoot: null }),
  startBotChat: (...args: unknown[]) => mockState.startBotChat(...args),
}));
vi.mock("../shared/rpc", () => ({
  ensureBotHomeRpc: "ensureBotHomeRpc",
  mountRpc: "mountRpc",
  systemPromptRpc: "systemPromptRpc",
  companionCompileRpc: "companionCompileRpc",
}));
vi.mock("../shared/uuid", () => ({ newUuid: () => "uuid-1" }));
vi.mock("../client/launcher/AttachmentThumbStrip", () => ({ AttachmentThumbStrip: "AttachmentThumbStrip" }));
vi.mock("../client/launcher/CompactComposerSheet", () => ({ CompactComposerSheet: "CompactComposerSheet" }));
vi.mock("../client/launcher/ModelPickerPopover", () => ({ ModelPickerPopover: "ModelPickerPopover" }));
vi.mock("../client/launcher/ScrollablePills", () => ({
  ScrollablePills: ({ children }: { children: import("react").ReactNode }) => children,
}));
vi.mock("../client/launcher/useComposerOptions", () => ({
  useComposerOptions: () => ({
    selectedProvider: "agy",
    selectedModelId: "gemini-4-hydrogen",
    selectedThinkingId: null,
    selectedModeId: null,
    allProviders: [],
    allProfiles: [],
    selectableModels: [],
    currentModel: null,
    thinkingOptions: [],
    currentThinking: null,
    modeOptions: [],
    currentMode: null,
    modelTriggerRef: { current: null },
    thinkingTriggerRef: { current: null },
    modeTriggerRef: { current: null },
    openModelMenu: vi.fn(),
    openThinkingMenu: vi.fn(),
    openModeMenu: vi.fn(),
    modelPickerOpen: false,
    modelPickerAnchor: null,
    setModelPickerOpen: vi.fn(),
    setSelectedThinkingId: vi.fn(),
    setSelectedModeId: vi.fn(),
    selectProviderAndModel: vi.fn(),
    selectProfile: vi.fn(),
  }),
}));
vi.mock("../client/launcher/useVisualViewport", () => ({
  useVisualViewport: () => ({ keyboardHeight: 0 }),
}));

import { BotLauncherCore } from "../client/launcher/BotLauncherCore";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeBot(id: string, name: string): Bot {
  return {
    id,
    name,
    model: "gemini-4-hydrogen",
    prompt: "",
    systemPrompt: "",
    archived: false,
    pinned: false,
    hostId: null,
    cwd: null,
    mounts: [],
    alwaysAllow: [],
    skillIds: [],
    mcpServerIds: [],
    avatar: { seed: id, palette: null, shape: "circle", imageUrl: null },
    createdAt: "2026-11-16T00:00:00Z",
    updatedAt: "2026-11-16T00:00:00Z",
  } as unknown as Bot;
}

function makeGroup(id: string, name: string, leadId: string): BotGroup {
  return {
    id,
    name,
    logo: null,
    leadId,
    memberIds: ["bot-moadmin", "bot-modoc"],
    instructions: "",
    cwd: null,
    mounts: [],
    createdAt: "2026-11-16T00:00:00Z",
    updatedAt: "2026-11-16T00:00:00Z",
  };
}

const theme = {
  colors: {
    accent: "#007aff",
    border: "#ccc",
    foreground: "#111",
    foregroundMuted: "#666",
    surface0: "#fff",
    surface1: "#f9f9f9",
    surface2: "#eee",
    destructive: "#e00",
  },
} as unknown as Parameters<typeof BotLauncherCore>[0]["theme"];

let root: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mockState.bots = [makeBot("bot-moadmin", "moAdmin"), makeBot("bot-modoc", "moDoc")];
  mockState.groups = [makeGroup("group-1", "Team Alpha", "bot-moadmin"), makeGroup("group-2", "Team Beta", "bot-modoc")];
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
});

function findTexts(renderer: ReactTestRenderer): string[] {
  return renderer.root.findAllByType("Text" as never).map((n) => {
    const c = n.props.children;
    return Array.isArray(c) ? c.join("") : String(c ?? "");
  });
}

function pressButtonWithText(renderer: ReactTestRenderer, label: string) {
  const pressables = renderer.root.findAllByType("Pressable" as never);
  const target = pressables.find((p) =>
    p.findAllByType("Text" as never).some((t) => {
      const c = t.props.children;
      return (Array.isArray(c) ? c.join("") : String(c ?? "")) === label;
    }),
  );
  if (!target) throw new Error(`Button with text "${label}" not found`);
  return act(async () => {
    await target.props.onPress();
  });
}

describe("BotLauncherCore direct chat bot selection", () => {
  it("persists selected non-default bot in direct mode across renders and routes launch to it", async () => {
    await act(async () => {
      root = create(
        <BotLauncherCore
          theme={theme}
          host={{ id: "local", label: "Local" }}
          initialBotId="bot-moadmin"
          embedded={true}
        />,
      );
    });

    await pressButtonWithText(root!, "私聊");
    expect(findTexts(root!)).toContain("与 moAdmin 新建对话");

    await pressButtonWithText(root!, "moDoc");
    expect(findTexts(root!)).toContain("与 moDoc 新建对话");

    mockState.bots = [...mockState.bots];
    mockState.groups = [...mockState.groups];
    await act(async () => {
      root!.update(
        <BotLauncherCore
          theme={theme}
          host={{ id: "local", label: "Local" }}
          initialBotId="bot-moadmin"
          embedded={true}
        />,
      );
    });
    expect(findTexts(root!)).toContain("与 moDoc 新建对话");

    const input = root!.root.findByType("TextInput" as never);
    await act(async () => {
      input.props.onChangeText("Hello moDoc");
    });
    await act(async () => {
      await input.props.onKeyPress({ nativeEvent: { key: "Enter", shiftKey: false }, preventDefault: vi.fn() });
    });

    expect(mockState.startBotChat).toHaveBeenCalledTimes(1);
    const launchArgs = mockState.startBotChat.mock.calls[0]?.[1] as unknown as { bot: Bot; prompt: string };
    expect(launchArgs.bot.id).toBe("bot-modoc");
    expect(launchArgs.bot.name).toBe("moDoc");
    expect(launchArgs.prompt).toBe("Hello moDoc");
  });

  it("persists manually selected group across groups array refreshes and syncs on intentKey change", async () => {
    await act(async () => {
      root = create(
        <BotLauncherCore
          theme={theme}
          host={{ id: "local", label: "Local" }}
          initialBotId="bot-moadmin"
          initialGroupId="group-1"
          initialMode="team"
          intentKey={1}
          embedded={true}
        />,
      );
    });

    expect(findTexts(root!)).toContain("与 Team Alpha 新建对话");

    await pressButtonWithText(root!, "Team Beta");
    expect(findTexts(root!)).toContain("与 Team Beta 新建对话");

    mockState.groups = [...mockState.groups];
    await act(async () => {
      root!.update(
        <BotLauncherCore
          theme={theme}
          host={{ id: "local", label: "Local" }}
          initialBotId="bot-moadmin"
          initialGroupId="group-1"
          initialMode="team"
          intentKey={1}
          embedded={true}
        />,
      );
    });
    expect(findTexts(root!)).toContain("与 Team Beta 新建对话");

    await act(async () => {
      root!.update(
        <BotLauncherCore
          theme={theme}
          host={{ id: "local", label: "Local" }}
          initialBotId="bot-modoc"
          initialGroupId="group-1"
          initialMode="team"
          intentKey={2}
          embedded={true}
        />,
      );
    });
    expect(findTexts(root!)).toContain("与 Team Alpha 新建对话");
    await pressButtonWithText(root!, "私聊");
    expect(findTexts(root!)).toContain("与 moDoc 新建对话");
  });
});
