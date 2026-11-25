import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BotFeedEntry } from "../shared/feed-view";

const mocked = vi.hoisted(() => ({
  platformOS: "web" as "web" | "ios" | "android",
  readFeed: vi.fn(),
  measuredEnd: vi.fn(),
  scrollIntoView: vi.fn(),
  resizeCallback: null as (() => void) | null,
  disconnect: vi.fn(),
  scrollToEnd: vi.fn(),
  scrollTo: vi.fn(),
  getScrollableNode: vi.fn(() => ({ scrollHeight: 1500 })),
  keyboardListeners: new Map<string, (event: any) => void>(),
  draftStore: { get: () => undefined, set: vi.fn(), subscribe: () => () => {}, load: async () => {}, flush: async () => {} },
  emptyQueue: [] as unknown[],
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mocked.platformOS;
    },
    select: (obj: Record<string, unknown>) => obj[mocked.platformOS] ?? obj.default,
    isPad: false,
  },
  ActivityIndicator: "ActivityIndicator",
  Dimensions: { get: () => ({ width: 390, height: 844 }) },
  Keyboard: {
    addListener: (event: string, cb: (payload: any) => void) => {
      mocked.keyboardListeners.set(event, cb);
      return { remove: () => mocked.keyboardListeners.delete(event) };
    },
  },
  LayoutAnimation: {
    create: vi.fn(() => ({})),
    configureNext: vi.fn(),
    Types: { keyboard: "keyboard", easeInEaseOut: "easeInEaseOut" },
    Properties: { opacity: "opacity" },
  },
  NativeModules: {},
  Pressable: "Pressable",
  Text: "Text",
  TextInput: "TextInput",
  TurboModuleRegistry: { get: () => null },
  View: "View",
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));

vi.mock("@getpaseo/plugin/client", () => ({
  useRpc: () => mocked.readFeed,
}));

vi.mock("@getpaseo/plugin/client/react-native", async () => {
  const React = await import("react");
  return {
    Icon: "Icon",
    ScrollView: React.forwardRef((props: object, ref) => {
      React.useImperativeHandle(ref, () => ({
        scrollToEnd: mocked.scrollToEnd,
        scrollTo: mocked.scrollTo,
        getScrollableNode: mocked.getScrollableNode,
      }));
      return React.createElement("ScrollView", props);
    }),
  };
});

vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: "Icon",
  Modal: Object.assign("Modal", { Content: "ModalContent" }),
  SettingsAction: "SettingsAction",
  SettingsCard: "SettingsCard",
  SettingsRow: "SettingsRow",
  TextInput: "TextInput",
  useToast: () => ({ show: vi.fn(), error: vi.fn() }),
}));

vi.mock("../client/Avatar", () => ({ Avatar: "Avatar" }));
vi.mock("../client/Markdown", () => ({ Markdown: "Markdown" }));
vi.mock("../client/i18n", () => ({
  formatPluralCount: (_t: unknown, _k: string, count: number) => `${count}`,
  formatRelativeTime: () => "1m",
  useT: () => ({ t: (key: string) => key }),
}));
vi.mock("../client/native", () => ({
  CONTENT_MAX_WIDTH: 800,
  errorText: (err: unknown) => String(err),
  nativeTokens: () => ({ dark: false, borderAccent: "#ccc", interactionHighlight: "#eee", brandClay: "#d97757", brandClaySoft: "#f5e3dc", warmPaper: "#faf9f5" }),
  placeholderColor: () => "#888",
  useHover: () => ({ hovered: false, hoverProps: {} }),
  withAlpha: (c: string) => c,
}));
vi.mock("../client/typography", () => ({ content: () => 14, ui: (s: number) => s }));
vi.mock("../client/ui/Tooltip", () => ({ tooltip: () => ({}) }));
vi.mock("../client/web", () => ({
  scrollWebListToEnd: mocked.measuredEnd,
  watchWebListSize: (_list: unknown, changed: () => void) => {
    mocked.resizeCallback = changed;
    changed();
    return mocked.disconnect;
  },
  scrollIntoView: mocked.scrollIntoView,
  decodeUtf8: (s: string) => s,
  domNode: () => null,
  focusWithRetries: () => () => {},
  listenForFileDrop: () => () => {},
  listenForImagePaste: () => () => {},
  pickFileHandles: vi.fn(async () => []),
  surfaceIsVisible: () => true,
}));
vi.mock("../client/AttachmentPill", () => ({ AttachmentPill: "AttachmentPill", PendingAttachmentPill: "PendingAttachmentPill" }));
vi.mock("../client/chat/composer/CommandMenu", () => ({ CommandMenu: "CommandMenu" }));
vi.mock("../client/chat/composer/ContextMeter", () => ({ ContextMeter: "ContextMeter" }));
vi.mock("../client/chat/composer/drafts", () => ({
  queueMessage: vi.fn(),
  requeueFront: vi.fn(),
  takeQueuedMessage: vi.fn(),
  useDraftAttachmentPending: () => false,
  useDraftCreationPending: () => false,
  useDraftStore: () => mocked.draftStore,
  useQueue: () => mocked.emptyQueue,
  useQueuePaused: () => false,
}));
vi.mock("../client/chat/composer/draft-mutations", () => ({ listenForDraftMutation: () => () => {}, mutateDraft: vi.fn() }));
vi.mock("../client/chat/composer/draft-creation", () => ({
  beginDraftAttachments: () => () => {},
  draftCreationGuard: () => () => true,
  isDraftAttachmentPending: () => false,
  isDraftCreationPending: () => false,
}));
vi.mock("../client/chat/composer/queue-pause", () => ({ setQueuePaused: vi.fn() }));
vi.mock("../client/chat/composer/height", () => ({
  useInputHeight: () => ({ scrollEnabled: false, style: { height: 28 } }),
}));
vi.mock("../client/chat/composer/storage", () => ({ useSendBehavior: () => "enter" }));
vi.mock("../client/sent-attachments", () => ({ newMessageId: () => "msg-1", rememberSent: vi.fn() }));
vi.mock("../client/stop-agent", () => ({ stopAgent: vi.fn() }));
vi.mock("../client/ui-state", () => ({ useCompanionIntentEnabled: () => [false, vi.fn()] }));
vi.mock("../client/ui/Menu", () => ({ measureAnchor: vi.fn(), useMenu: () => ({ open: vi.fn() }) }));

import { BotFeedPane, type BotFeedPaneProps } from "../client/BotFeedPane";
import { Composer } from "../client/chat/Composer";
import { computeVisualViewportState, useKeyboardHeight } from "../client/keyboard";
import { useVisualViewport } from "../client/launcher/useVisualViewport";

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
  statusDanger: "#f12e2f",
} as unknown as BotFeedPaneProps["colors"];

function makeEntry(id: string, ts: number): BotFeedEntry {
  return {
    id,
    channelKind: "bot",
    channelId: "bot-a",
    botId: "bot-a",
    botName: "Bot A",
    teamId: null,
    agentId: "ag-1",
    agentTitle: "Task",
    archived: false,
    turnId: `t-${id}`,
    timestamp: new Date(ts).toISOString(),
    command: `cmd ${id}`,
    reply: `reply ${id}`,
    status: "completed",
    errorMessage: null,
    toolsCount: 0,
    source: "dm",
  };
}

let root: ReactTestRenderer | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocked.platformOS = "web";
  mocked.resizeCallback = null;
  mocked.keyboardListeners.clear();
  mocked.getScrollableNode.mockReturnValue({ scrollHeight: 1500 });
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

describe("BotFeedPane default-latest scroll & partner switch", () => {
  it("pins to bottom on initial load, keeps following late web size changes, and stops when user scrolls up", async () => {
    const pageA = [makeEntry("a1", 1000), makeEntry("a2", 2000)];
    mocked.readFeed.mockResolvedValue({ entries: pageA, hasOlder: true, nextCursor: "c1", totalPointers: 10 });

    const props: BotFeedPaneProps = {
      colors,
      channelKind: "bot",
      channelId: "bot-a",
      channelName: "Bot A",
      compact: true,
      bottomInset: 0,
      keyboardHeight: 0,
      onOpenTask: vi.fn(),
      onSendMessage: vi.fn(),
      onBack: vi.fn(),
    };

    await act(async () => {
      root = create(<BotFeedPane {...props} />);
    });

    expect(mocked.measuredEnd).toHaveBeenCalled();

    const scrollView = root!.root.findByType("ScrollView" as never);
    mocked.measuredEnd.mockClear();
    await act(async () => {
      scrollView.props.onContentSizeChange(360, 1400);
      mocked.resizeCallback?.();
    });
    expect(mocked.measuredEnd).toHaveBeenCalledTimes(2);

    // User deliberately scrolls up -> stops auto-pinning
    const wrapper = root!.root.findAllByType("View" as never).find((v) => typeof v.props.onWheel === "function");
    expect(wrapper).toBeTruthy();
    await act(async () => {
      wrapper!.props.onWheel();
      scrollView.props.onScroll({
        nativeEvent: { contentOffset: { y: 100 }, contentSize: { height: 1400 }, layoutMeasurement: { height: 500 } },
      });
    });

    mocked.measuredEnd.mockClear();
    await act(async () => {
      scrollView.props.onContentSizeChange(360, 1600);
      mocked.resizeCallback?.();
    });
    expect(mocked.measuredEnd).not.toHaveBeenCalled();
  });

  it("clears stale entries immediately on partner switch before next RPC resolves and pins new partner to bottom", async () => {
    mocked.readFeed.mockResolvedValueOnce({
      entries: [makeEntry("a1", 1000), makeEntry("a2", 2000)],
      hasOlder: false,
      nextCursor: null,
      totalPointers: 2,
    });

    const props: BotFeedPaneProps = {
      colors,
      channelKind: "bot",
      channelId: "bot-a",
      channelName: "Bot A",
      compact: false,
      bottomInset: 0,
      keyboardHeight: 0,
      onOpenTask: vi.fn(),
      onSendMessage: vi.fn(),
      onBack: vi.fn(),
    };

    await act(async () => {
      root = create(<BotFeedPane {...props} />);
    });
    expect(root!.root.findAllByType("Markdown" as never)).toHaveLength(2);

    let resolveB!: (value: any) => void;
    mocked.readFeed.mockImplementationOnce(() => new Promise((r) => { resolveB = r; }));
    mocked.measuredEnd.mockClear();

    await act(async () => {
      root!.update(<BotFeedPane {...props} channelId="bot-b" channelName="Bot B" />);
    });

    // Stale Bot A entries must be cleared immediately while Bot B loads
    expect(root!.root.findAllByType("Markdown" as never)).toHaveLength(0);

    await act(async () => {
      resolveB({
        entries: [makeEntry("b1", 3000), makeEntry("b2", 4000)],
        hasOlder: false,
        nextCursor: null,
        totalPointers: 2,
      });
    });

    expect(root!.root.findAllByType("Markdown" as never)).toHaveLength(2);
    expect(mocked.measuredEnd).toHaveBeenCalled();
  });

  it("preserves scroll offset when prepending older entries via loadOlder and pins when keyboard opens", async () => {
    vi.useFakeTimers();
    try {
      mocked.readFeed
        .mockResolvedValueOnce({
          entries: [makeEntry("a3", 3000), makeEntry("a4", 4000)],
          hasOlder: true,
          nextCursor: "cur-2",
          totalPointers: 4,
        })
        .mockResolvedValueOnce({
          entries: [makeEntry("a1", 1000), makeEntry("a2", 2000)],
          hasOlder: false,
          nextCursor: null,
          totalPointers: 4,
        });

      const props: BotFeedPaneProps = {
        colors,
        channelKind: "bot",
        channelId: "bot-a",
        channelName: "Bot A",
        compact: true,
        bottomInset: 0,
        keyboardHeight: 0,
        onOpenTask: vi.fn(),
        onSendMessage: vi.fn(),
        onBack: vi.fn(),
      };

      await act(async () => {
        root = create(<BotFeedPane {...props} />);
      });

      const scrollView = root!.root.findByType("ScrollView" as never);
      await act(async () => {
        scrollView.props.onContentSizeChange(360, 1000);
        scrollView.props.onScroll({
          nativeEvent: { contentOffset: { y: 400 }, contentSize: { height: 1000 }, layoutMeasurement: { height: 500 } },
        });
      });

      const loadOlderBtn = root!.root.findByProps({ accessibilityLabel: "feed.loadOlder" });
      await act(async () => {
        await loadOlderBtn.props.onPress();
      });

      mocked.measuredEnd.mockClear();
      await act(async () => {
        scrollView.props.onContentSizeChange(360, 1450);
      });
      expect(mocked.scrollTo).toHaveBeenCalledWith({ y: 850, animated: false });
      expect(mocked.measuredEnd).not.toHaveBeenCalled();

      // Re-scroll near bottom then open keyboard -> re-pins to bottom
      await act(async () => {
        scrollView.props.onScroll({
          nativeEvent: { contentOffset: { y: 940 }, contentSize: { height: 1450 }, layoutMeasurement: { height: 500 } },
        });
      });
      await act(async () => {
        root!.update(<BotFeedPane {...props} keyboardHeight={300} />);
      });
      await act(async () => {
        vi.advanceTimersByTime(60);
      });
      expect(mocked.measuredEnd).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Soft keyboard & visualViewport unification + Composer flexShrink", () => {
  it("computes visualViewport keyboard height accounting for offsetTop and >80 threshold", () => {
    expect(computeVisualViewportState(null)).toEqual({ keyboardHeight: 0, viewportHeight: 0 });
    expect(computeVisualViewportState({ innerHeight: 800, visualViewport: { height: 750, offsetTop: 0 } as any })).toEqual({
      keyboardHeight: 0,
      viewportHeight: 750,
    });
    expect(computeVisualViewportState({ innerHeight: 800, visualViewport: { height: 480, offsetTop: 0 } as any })).toEqual({
      keyboardHeight: 320,
      viewportHeight: 480,
    });
    expect(computeVisualViewportState({ innerHeight: 800, visualViewport: { height: 480, offsetTop: 40 } as any })).toEqual({
      keyboardHeight: 280,
      viewportHeight: 480,
    });
  });

  it("drives useKeyboardHeight on web from shared visualViewport listeners and on native from Keyboard events", async () => {
    const vvListeners = new Map<string, Set<() => void>>();
    const vv = {
      height: 800,
      offsetTop: 0,
      addEventListener: (type: string, cb: () => void) => {
        const set = vvListeners.get(type) ?? new Set();
        set.add(cb);
        vvListeners.set(type, set);
      },
      removeEventListener: (type: string, cb: () => void) => vvListeners.get(type)?.delete(cb),
    };
    const win = { innerHeight: 800, visualViewport: vv, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal("window", win);

    const observed: { kh: number; vvKh: number }[] = [];
    function Probe() {
      const kh = useKeyboardHeight();
      const vvState = useVisualViewport();
      observed.push({ kh, vvKh: vvState.keyboardHeight });
      return null;
    }

    await act(async () => {
      root = create(<Probe />);
    });
    expect(observed.at(-1)).toEqual({ kh: 0, vvKh: 0 });

    vv.height = 490;
    await act(async () => {
      vvListeners.get("resize")?.forEach((cb) => cb());
    });
    expect(observed.at(-1)).toEqual({ kh: 310, vvKh: 310 });

    await act(async () => {
      root!.unmount();
    });
    root = undefined;

    // Native iOS path ignores predictive bar (<120) and tracks full keyboard
    mocked.platformOS = "ios";
    await act(async () => {
      root = create(<Probe />);
    });
    await act(async () => {
      mocked.keyboardListeners.get("keyboardWillChangeFrame")?.({ endCoordinates: { height: 60, screenY: 780 }, duration: 250 });
    });
    expect(observed.at(-1)?.kh).toBe(0);
    await act(async () => {
      mocked.keyboardListeners.get("keyboardWillChangeFrame")?.({ endCoordinates: { height: 336, screenY: 508 }, duration: 250 });
    });
    expect(observed.at(-1)?.kh).toBe(336);
  });

  it("keeps Composer outer wrapper non-shrinking (flexShrink: 0)", async () => {
    await act(async () => {
      root = create(
        <Composer
          colors={colors}
          bot={{ id: "bot-a", name: "Bot A" } as any}
          host={{ key: "local", label: "Local", isLocal: true, api: null } as any}
          agentId={null}
          running={false}
          layout={{ compact: true, platform: "web" }}
          keyboardOpen={true}
          onStart={vi.fn()}
        />,
      );
    });
    const outer = root!.root.findAllByType("View" as never)[0]!;
    expect(outer.props.style.flexShrink).toBe(0);
  });
});
