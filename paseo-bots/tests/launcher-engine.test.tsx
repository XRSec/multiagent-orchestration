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
    t: (key: string) => key,
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
import { ENGINE_CHOICES, engineLabelKey, toEngine } from "../client/launcher/engineChoice";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeBot(id: string, name: string, model = "gemini-4-hydrogen"): Bot {
  return {
    id,
    name,
    model,
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
  mockState.bots = [makeBot("bot-moadmin", "moAdmin")];
  mockState.groups = [];
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
});

async function launchWith(engineLabelText: string | null): Promise<Record<string, unknown>> {
  await act(async () => {
    root = create(
      <BotLauncherCore theme={theme} host={{ id: "local", label: "Local" }} initialBotId="bot-moadmin" embedded={true} />,
    );
  });
  if (engineLabelText) {
    const pressables = root!.root.findAllByType("Pressable" as never);
    const target = pressables.find((p) =>
      p.findAllByType("Text" as never).some((t) => String(t.props.children ?? "") === engineLabelText),
    );
    if (!target) throw new Error(`engine option "${engineLabelText}" not found`);
    await act(async () => {
      await target.props.onPress();
    });
  }
  const input = root!.root.findByType("TextInput" as never);
  await act(async () => {
    input.props.onChangeText("hello");
  });
  await act(async () => {
    await input.props.onKeyPress({ nativeEvent: { key: "Enter", shiftKey: false }, preventDefault: vi.fn() });
  });
  expect(mockState.startBotChat).toHaveBeenCalledTimes(1);
  return mockState.startBotChat.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("launcher subagent engine selector", () => {
  it("omits the engine key when the default option is kept (no engine property at all)", async () => {
    const payload = await launchWith(null);
    expect(Object.prototype.hasOwnProperty.call(payload, "engine")).toBe(false);
  });

  it("sends engine:native when the native option is picked", async () => {
    const payload = await launchWith("launcher.engineNative");
    expect(payload.engine).toBe("native");
  });

  it("sends engine:paseo-bot when the dispatch option is picked", async () => {
    const payload = await launchWith("launcher.enginePaseoBot");
    expect(payload.engine).toBe("paseo-bot");
  });
});

describe("engine choice mapping", () => {
  it("only exposes the default plus the exact shared subagent engines", async () => {
    const actual = await vi.importActual<typeof import("../shared/chat")>("../shared/chat");
    const exposed = ENGINE_CHOICES.filter((c) => c !== "default");
    expect(exposed).toEqual([...actual.SUBAGENT_ENGINES]);
    // Every exposed option must map to itself, never to null/undefined.
    for (const choice of exposed) {
      expect(toEngine(choice)).toBe(choice);
      expect(actual.SUBAGENT_ENGINES).toContain(toEngine(choice));
    }
    expect(toEngine("default")).toBeNull();
  });

  it("has an i18n label key for every choice", () => {
    const keys = ENGINE_CHOICES.map(engineLabelKey);
    expect(keys).toEqual(["launcher.engineDefault", "launcher.engineNative", "launcher.enginePaseoBot"]);
  });
});
