import { createElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bot } from "../shared/bot";

const mocked = vi.hoisted(() => ({
  providersQuery: {
    data: [] as Array<{
      provider: string;
      label?: string;
      status: string;
      enabled: boolean;
      defaultModeId?: string;
      modes?: Array<{ id: string; label: string; description?: string }>;
      models?: Array<{
        id: string;
        label: string;
        isDefault?: boolean;
        isSelectable?: boolean;
        thinkingOptions?: Array<{ id: string; label: string }>;
      }>;
    }> | undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => ({})),
  },
  profilesQuery: { data: [] as Array<{ id: string; name: string; provider: string; model?: string; modeId?: string; thinkingOptionId?: string }> },
  host: { key: "host-1", label: "Mac Studio", isLocal: true, online: true, api: {} as unknown },
  hosts: [] as Array<{ serverId: string; label: string; status: string }>,
  menuOpen: vi.fn(),
  measureWindow: { x: 10, y: 20, width: 120, height: 30 },
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useHosts: () => mocked.hosts,
  useRpc: () => vi.fn(async () => ({ rules: [] })),
}));

vi.mock("@getpaseo/plugin/client/react-native", async () => {
  const React = await import("react");
  return {
    Icon: "Icon",
    Modal: Object.assign(
      ({ open, children }: { open: boolean; children: import("react").ReactNode }) =>
        open ? React.createElement("MockModal", null, children) : null,
      { Content: "ModalContent" },
    ),
    ScrollView: "ScrollView",
  };
});

vi.mock("@getpaseo/plugin/client/ui", async () => {
  const React = await import("react");
  return {
    Icon: "Icon",
    Modal: Object.assign(
      ({ open, children }: { open: boolean; children: import("react").ReactNode }) =>
        open ? React.createElement("MockModal", null, children) : null,
      { Content: "ModalContent" },
    ),
    SettingsAction: "SettingsAction",
    SettingsCard: "SettingsCard",
    SettingsRow: "SettingsRow",
    SettingsSection: ({ children }: { children: import("react").ReactNode }) =>
      React.createElement("MockSettingsSection", null, children),
    SettingsSelect: "SettingsSelect",
    SettingsSwitch: "SettingsSwitch",
    TextInput: "TextInput",
    useToast: () => ({ show: vi.fn(), error: vi.fn() }),
  };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("react-native", async () => {
  const React = await import("react");
  return {
    ActivityIndicator: "ActivityIndicator",
    Platform: { OS: "ios", select: (obj: Record<string, unknown>) => obj.ios ?? obj.default },
    Pressable: "Pressable",
    ScrollView: "ScrollView",
    Text: "Text",
    View: React.forwardRef((props: Record<string, unknown>, ref) => {
      React.useImperativeHandle(ref, () => ({
        measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
          cb(mocked.measureWindow.x, mocked.measureWindow.y, mocked.measureWindow.width, mocked.measureWindow.height),
      }));
      return React.createElement("View", props);
    }),
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});

vi.mock("../client/data", () => ({
  useAgentProfiles: () => mocked.profilesQuery,
  useBotHost: () => mocked.host,
  useHostProjects: () => ({ data: [] }),
  usePaseoTools: () => ({ state: null, loading: false, turnOn: vi.fn() }),
  useProviders: () => mocked.providersQuery,
}));

vi.mock("../client/i18n", () => ({
  formatBotProblems: () => [],
  formatPluralCount: (_t: unknown, s: string, n: number) => `${n} ${s}`,
  useT: () => ({
    locale: "zh-CN",
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("../client/native", () => ({
  errorText: (err: unknown) => String(err),
  MONO_FONT: "mono",
  MONO_PROPS: {},
  nativeTokens: () => ({
    dark: false,
    borderAccent: "#ccc",
    surface3: "#ddd",
    interactionHighlight: "#eee",
    foregroundExtraMuted: "#999",
  }),
  placeholderColor: () => "#888",
  useHover: () => ({ hovered: false, hoverProps: {} }),
  withAlpha: (c: string) => c,
}));

vi.mock("../client/typography", () => ({
  ui: (size: number) => size,
}));

vi.mock("../client/ui/Tooltip", () => ({
  tooltip: () => ({}),
}));

vi.mock("../client/Avatar", () => ({
  Avatar: "Avatar",
  TeamLogo: "TeamLogo",
}));

vi.mock("../client/teams/TeamSheet", () => ({
  TeamEditorForm: "TeamEditorForm",
}));

vi.mock("../client/settings/WorkflowEditor", () => ({
  WorkflowListEditor: "WorkflowListEditor",
}));

vi.mock("../client/panel/IdentitySection", () => ({ IdentitySection: "IdentitySection" }));
vi.mock("../client/panel/KnowledgeSections", () => ({
  MemorySection: "MemorySection",
  PlaybooksSection: "PlaybooksSection",
  SkillsSection: "SkillsSection",
  SoulSection: "SoulSection",
}));
vi.mock("../client/panel/OverviewSections", () => ({
  HistorySection: "HistorySection",
  OverviewSection: "OverviewSection",
  UsageSection: "UsageSection",
}));
vi.mock("../client/panel/RoutinesSection", () => ({ RoutinesSection: "RoutinesSection" }));
vi.mock("../client/panel/AppsPicker", () => ({ AppsPicker: "AppsPicker" }));
vi.mock("../client/panel/LibraryPicker", () => ({ LibraryPicker: "LibraryPicker" }));

import { findMatchingProvider, InlineSelect, ModelSection } from "../client/panel/AgentSections";
import { PartnerSettingsModal } from "../client/settings/PartnerSettingsModal";
import { MenuProvider, useMenu } from "../client/ui/Menu";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const colors = {
  surface0: "#faf9f5",
  surface1: "#f5f4f0",
  surface2: "#eeece6",
  foreground: "#141413",
  foregroundMuted: "#5c5b57",
  border: "#dcdad3",
  accent: "#184f95",
  accentForeground: "#faf9f5",
  statusSuccess: "#299f51",
  statusWarning: "#b37824",
  statusDanger: "#f12e2f",
} as any;

function makeBot(patch: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    name: "moCode",
    title: "Engineer",
    description: "Writes code.",
    avatar: { seed: "s1", palette: null, shape: "circle", imageUrl: null },
    hostId: null,
    provider: "antigravity",
    model: "gemini-4-hydrogen",
    modeId: null,
    thinkingOptionId: null,
    fallbackModels: [],
    providerConfigs: [],
    soul: "",
    mcpServerIds: [],
    alwaysAllow: [],
    skillIds: [],
    apps: [],
    appRules: {},
    voice: { name: null, readReplies: false },
    contactBots: "allow",
    playbooks: [],
    routines: [],
    pinned: false,
    archived: false,
    cwd: null,
    mounts: [],
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...patch,
  };
}

function collectText(node: ReactTestInstance): string[] {
  return node.findAllByType("Text" as never).map((t) =>
    Array.isArray(t.props.children) ? t.props.children.join("") : String(t.props.children ?? ""),
  );
}

let root: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.providersQuery = {
    data: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(async () => ({})),
  };
  mocked.profilesQuery = { data: [] };
  mocked.host = { key: "host-1", label: "Mac Studio", isLocal: true, online: true, api: {} };
  mocked.hosts = [];
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
});

describe("InlineSelect fallback echo & empty disabled styling", () => {
  it("echoes non-empty unmatched value instead of placeholder and applies 0.5 opacity when options are empty", async () => {
    await act(async () => {
      root = create(
        <InlineSelect
          colors={colors}
          label="antigravity"
          menuTitle="panel.rowProvider"
          value="antigravity"
          placeholder="panel.chooseProvider"
          options={[]}
          onValueChange={vi.fn()}
        />,
      );
    });

    const pressable = root!.root.findByType("Pressable" as never);
    expect(pressable.props.disabled).toBe(true);
    expect(pressable.props.style({ pressed: false }).opacity).toBe(0.5);
    expect(pressable.props.style({ pressed: false }).borderColor).toBe(colors.statusWarning);
    expect(collectText(root!.root)).toContain("antigravity");
    expect(collectText(root!.root)).not.toContain("panel.chooseProvider");
    const icons = root!.root.findAllByType("Icon" as never);
    expect(icons.some((i) => i.props.name === "AlertCircle")).toBe(true);
  });

  it("shows muted placeholder when value is empty and options are empty", async () => {
    await act(async () => {
      root = create(
        <InlineSelect
          colors={colors}
          label="panel.chooseProvider"
          menuTitle="panel.rowProvider"
          value=""
          placeholder="panel.chooseProvider"
          options={[]}
          onValueChange={vi.fn()}
        />,
      );
    });

    const textNode = root!.root.findByType("Text" as never);
    expect(textNode.props.children).toBe("panel.chooseProvider");
    expect(textNode.props.style.color).toBe(colors.foregroundMuted);
  });
});

describe("ModelSection fallback echo, retry feedback, and antigravity/agy matching", () => {
  it("echoes configured provider and model with retry button when providers list is empty", async () => {
    const bot = makeBot({ provider: "antigravity", model: "gemini-4-hydrogen" });
    await act(async () => {
      root = create(
        <ModelSection
          colors={colors}
          bot={bot}
          localHost={{ id: "host-1", label: "Mac Studio" }}
          history={[]}
          library={{ skills: [], mcpServers: [] }}
          groups={[]}
          onPatch={vi.fn()}
          flush={vi.fn(async () => {})}
          onRestore={vi.fn()}
          onSetup={vi.fn()}
          onOpenChat={vi.fn()}
        />,
      );
    });

    const texts = collectText(root!.root);
    expect(texts).toContain("antigravity");
    expect(texts).toContain("gemini-4-hydrogen");
    expect(texts).not.toContain("panel.chooseProviderFirst");

    const retryAction = root!.root.findByType("SettingsAction" as never);
    expect(retryAction.props.actionLabel).toBe("chat.retry");
    expect(retryAction.props.label).toContain("panel.providersEmpty");
    await act(async () => {
      retryAction.props.onPress();
    });
    expect(mocked.providersQuery.refetch).toHaveBeenCalledOnce();
  });

  it("echoes configured provider and model and provides retry button when providers fetch errors", async () => {
    mocked.providersQuery = {
      ...mocked.providersQuery,
      data: undefined,
      isError: true,
    };
    const bot = makeBot({ provider: "antigravity", model: "gemini-4-hydrogen" });

    await act(async () => {
      root = create(
        <ModelSection
          colors={colors}
          bot={bot}
          localHost={{ id: "host-1", label: "Mac Studio" }}
          history={[]}
          library={{ skills: [], mcpServers: [] }}
          groups={[]}
          onPatch={vi.fn()}
          flush={vi.fn(async () => {})}
          onRestore={vi.fn()}
          onSetup={vi.fn()}
          onOpenChat={vi.fn()}
        />,
      );
    });

    const texts = collectText(root!.root);
    expect(texts).toContain("antigravity");
    expect(texts).toContain("gemini-4-hydrogen");
    expect(texts).not.toContain("panel.chooseProviderFirst");

    const retryAction = root!.root.findByType("SettingsAction" as never);
    expect(retryAction.props.label).toContain("panel.providersLoadError");
    await act(async () => {
      retryAction.props.onPress();
    });
    expect(mocked.providersQuery.refetch).toHaveBeenCalledOnce();
  });

  it("maps antigravity <-> agy seamlessly without mutating saved bot.provider", async () => {
    const agyEntry = {
      provider: "agy",
      label: "Antigravity",
      status: "ready",
      enabled: true,
      models: [
        { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", isDefault: true, isSelectable: true, thinkingOptions: [] },
        { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", isDefault: false, isSelectable: true, thinkingOptions: [] },
      ],
    };
    expect(findMatchingProvider([agyEntry], "antigravity")?.provider).toBe("agy");
    expect(findMatchingProvider([{ ...agyEntry, provider: "antigravity" }], "agy")?.provider).toBe("antigravity");

    mocked.providersQuery.data = [agyEntry];
    const onPatch = vi.fn();
    const bot = makeBot({ provider: "antigravity", model: "gemini-4-hydrogen" });

    await act(async () => {
      root = create(
        <MenuProvider colors={colors} compact inlineCompact>
          <ModelSection
            colors={colors}
            bot={bot}
            localHost={{ id: "host-1", label: "Mac Studio" }}
            history={[]}
            library={{ skills: [], mcpServers: [] }}
            groups={[]}
            onPatch={onPatch}
            flush={vi.fn(async () => {})}
            onRestore={vi.fn()}
            onSetup={vi.fn()}
            onOpenChat={vi.fn()}
          />
        </MenuProvider>,
      );
    });

    expect(onPatch).not.toHaveBeenCalled();
    const texts = collectText(root!.root);
    expect(texts).toContain("Antigravity");
    expect(texts).toContain("Gemini 4 Hydrogen");

    // Model selector must be enabled and interactive
    const modelButton = root!.root.findByProps({ accessibilityLabel: "panel.rowModel: Gemini 4 Hydrogen" });
    expect(modelButton.props.disabled).toBe(false);
    await act(async () => {
      modelButton.props.onPress();
    });
    const flashOption = root!.root.findByProps({ accessibilityRole: "menuitem", accessibilityLabel: "Gemini 3.8 Flash" });
    await act(async () => {
      flashOption.props.onPress();
    });
    expect(onPatch).toHaveBeenCalledWith({ model: "gemini-3.8-flash", thinkingOptionId: null });
  });

  it("shows unavailable provider hint when providers exist but none match bot.provider, and offline hint when host is offline", async () => {
    mocked.providersQuery.data = [
      { provider: "claude", label: "Claude", status: "ready", enabled: true, models: [] },
    ];
    const bot = makeBot({ provider: "custom-provider", model: "custom-model" });

    await act(async () => {
      root = create(
        <ModelSection
          colors={colors}
          bot={bot}
          localHost={{ id: "host-1", label: "Mac Studio" }}
          history={[]}
          library={{ skills: [], mcpServers: [] }}
          groups={[]}
          onPatch={vi.fn()}
          flush={vi.fn(async () => {})}
          onRestore={vi.fn()}
          onSetup={vi.fn()}
          onOpenChat={vi.fn()}
        />,
      );
    });

    let texts = collectText(root!.root);
    expect(texts).toContain("custom-provider");
    expect(texts).toContain("custom-model");
    expect(texts.some((t) => t.includes("panel.providerUnavailable"))).toBe(true);

    mocked.host = { key: "host-2", label: "Remote Mac", isLocal: false, online: false, api: null as any };
    mocked.providersQuery = { ...mocked.providersQuery, data: undefined, isLoading: false, isError: false };
    await act(async () => {
      root!.update(
        <ModelSection
          colors={colors}
          bot={makeBot({ hostId: "host-2", provider: "antigravity", model: "gemini-4-hydrogen" })}
          localHost={{ id: "host-1", label: "Mac Studio" }}
          history={[]}
          library={{ skills: [], mcpServers: [] }}
          groups={[]}
          onPatch={vi.fn()}
          flush={vi.fn(async () => {})}
          onRestore={vi.fn()}
          onSetup={vi.fn()}
          onOpenChat={vi.fn()}
        />,
      );
    });

    texts = collectText(root!.root);
    expect(texts).toContain("antigravity");
    expect(texts).toContain("gemini-4-hydrogen");
    expect(texts.some((t) => t.includes("panel.hostOfflineError"))).toBe(true);
  });
});

describe("PartnerSettingsModal scoped MenuProvider prevents dual-Modal occlusion on compact mobile", () => {
  it("renders inline compact sheet inside the active PartnerSettingsModal without opening a second Modal", async () => {
    mocked.providersQuery.data = [
      {
        provider: "agy",
        label: "Antigravity",
        status: "ready",
        enabled: true,
        models: [
          { id: "gemini-4-hydrogen", label: "Gemini 4 Hydrogen", isDefault: true, isSelectable: true, thinkingOptions: [] },
        ],
      },
      {
        provider: "claude",
        label: "Claude",
        status: "ready",
        enabled: true,
        models: [],
      },
    ];
    const onPatchBot = vi.fn();
    const bot = makeBot({ provider: "antigravity", model: "gemini-4-hydrogen" });

    await act(async () => {
      root = create(
        <PartnerSettingsModal
          open
          compact
          colors={colors}
          groups={[]}
          bots={[bot]}
          localHost={{ id: "host-1", label: "Mac Studio" }}
          history={[]}
          library={{ skills: [], mcpServers: [] }}
          initialTarget={{ kind: "bot", id: bot.id }}
          onClose={vi.fn()}
          onPatchBot={onPatchBot}
          flush={vi.fn(async () => {})}
          onRestoreBot={vi.fn()}
          onSetupBot={vi.fn()}
          onOpenChat={vi.fn()}
          onSaveTeam={vi.fn()}
        />,
      );
    });

    // Only PartnerSettingsModal's own Modal is mounted
    expect(root!.root.findAllByType("MockModal" as never)).toHaveLength(1);

    // Navigate into Model section inside BotPanel
    const modelRow = root!.root.findByProps({ accessibilityRole: "button", accessibilityLabel: "panel.sectionModel" });
    await act(async () => {
      modelRow.props.onPress();
    });

    // Open Provider selector menu
    const providerSelect = root!.root.findByProps({ accessibilityLabel: "panel.rowProvider: Antigravity" });
    await act(async () => {
      providerSelect.props.onPress();
    });

    // Still only 1 Modal (no second competing Modal), and compact menu is rendered inline!
    expect(root!.root.findAllByType("MockModal" as never)).toHaveLength(1);
    const menuView = root!.root.findByProps({ accessibilityRole: "menu" });
    expect(menuView).toBeTruthy();

    const claudeItem = root!.root.findByProps({ accessibilityRole: "menuitem", accessibilityLabel: "Claude" });
    await act(async () => {
      claudeItem.props.onPress();
    });

    expect(onPatchBot).toHaveBeenCalledWith(bot.id, expect.objectContaining({ provider: "claude", model: null }));
    expect(root!.root.findAllByProps({ accessibilityRole: "menu" })).toHaveLength(0);
  });

  it("keeps desktop Popover behavior inside PartnerSettingsModal when compact is false", async () => {
    function Trigger() {
      const menu = useMenu();
      return (
        <PressableProbe
          onPress={() =>
            menu.open({
              anchor: { x: 10, y: 20, width: 100, height: 30 },
              title: "Choose",
              entries: [{ label: "Option A", onSelect: vi.fn() }],
            })
          }
        />
      );
    }
    function PressableProbe({ onPress }: { onPress(): void }) {
      return createElement("MockProbe", { onPress });
    }

    await act(async () => {
      root = create(
        <MenuProvider colors={colors} compact={false} inlineCompact>
          <Trigger />
        </MenuProvider>,
      );
    });

    await act(async () => {
      root!.root.findByType("MockProbe" as never).props.onPress();
    });

    expect(root!.root.findAllByType("MockModal" as never)).toHaveLength(0);
    expect(root!.root.findByProps({ accessibilityRole: "menu" })).toBeTruthy();
  });
});
