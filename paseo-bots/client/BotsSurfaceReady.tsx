/**
 * Purpose: Ready-state surface view for bot navigation, team tabs, launcher, and panel routing.
 * Context: Mounted unconditionally by BotsSurface once bot settings are successfully loaded.
 * Usage: <BotsSurfaceReady {...props} settings={settings} latest={latest} commit={commit} />
 * Prerequisites: Paseo client runtime, @getpaseo/plugin, and ready BotSettingsState.
 * Budget Justification: ~650 lines consolidating ready bot surface layout, responsive sidebar slide-over, and launcher routing.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import type { PaseoAgent } from "./paseo";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, useToast } from "@getpaseo/plugin/client/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { BackHandler, type LayoutRectangle, Platform, Text, View } from "react-native";
import { randomSeed } from "../shared/avatar";
import {
  applyDefaults,
  DEFAULT_BOT_DEFAULTS,
  DEFAULT_BOT_LIST_UI,
  EMPTY_LIBRARY,
  newBotId,
  newGroupId,
  presetFromBot,
  primaryGroupForBot,
  pushHistory,
  type Bot,
  type BotGroup,
  type BotListUi,
  type BotSettingsValues,
} from "../shared/bot";
import { saveTeam, tabOf, teamTabs, withoutBot } from "../shared/groups";
import { addImportedBots } from "../shared/library";
import { displayTitle, resolveBotPlacement, startBotChat, syncBotWorkspaceTitle } from "../shared/chat";
import { moveKey } from "../shared/sidebar";
import { chatTranscript } from "../shared/transcript";
import {
  agyOrphanResolveRpc,
  agyOrphansListRpc,
  ensureBotHomeRpc,
  mountRpc,
  exportBotRpc,
  importBotRpc,
  importTeamRpc,
  systemPromptRpc,
  type OrphanedAgyAgentEntry,
} from "../shared/rpc";
import { botFromPreset, newBot } from "../shared/templates";
import { formatPluralCount, useT } from "./i18n";
import { botMenuEntries, chatMenuEntries } from "./BotDialogs";
import { BotsSurfaceModals } from "./BotsSurfaceModals";
import { BotSidebar, BotSidebarFooter, type ChatMenuContext, type MenuSource, type Selection } from "./BotSidebar";
import { useBotHost, useChatInvalidation, useHostResolver, useProviders, type LocalHost } from "./data";
import { onIntent, takeIntent, type SurfaceIntent } from "./intent";
import { LibraryView } from "./library/LibraryView";
import { getGlobalNavigation, onLibraryTarget, setGlobalNavigation, type LibraryTarget } from "./navigation";
import { Splash } from "./Splash";
import { TeamMap } from "./teams/TeamMap";
import { DataAnalysisPane } from "./analytics/DataAnalysisPane";
import { TeamTabsRow, TeamTabSwitcher } from "./teams/TeamTabs";
import { ResizeHandle, RowResizeHandle, SlideOver } from "./ui/Columns";
import { fitColumns } from "../shared/layout";
import { confirmDialog, errorText, nativeTokens } from "./native";
import { measureAnchor, useMenu } from "./ui/Menu";
import { homeIndicatorInset, useKeyboardHeight } from "./keyboard";
import { BotPanel, type SectionId } from "./panel/BotPanel";
import { AgyOrphanBanner } from "./AgyOrphanBanner";
import type { BotSettingsState } from "./useBotSettings";
import { fullTimeline } from "./useChat";
import { newUuid } from "../shared/uuid";
import { BotLauncherCore } from "./launcher/BotLauncherCore";
import { PartnerSettingsModal } from "./settings/PartnerSettingsModal";

type Colors = PluginTheme["colors"];

const SETUP_PROMPT = "Let's set you up. Interview me one short question at a time about what I want from you, how I like to work, and what you should never do. Then propose standing instructions for yourself and a starting MEMORY.md. Write the memory file once I confirm, and give me the instructions to paste into your Soul settings.";
const SAVE_DELAY_MS = 600;

export interface BotsSurfaceReadyProps extends PluginSurfaceProps {
  settings: Extract<BotSettingsState, { status: "ready" }>;
  latest: MutableRefObject<BotSettingsState>;
  commit: (mutate: (values: BotSettingsValues) => BotSettingsValues) => Promise<boolean>;
}

export function BotsSurfaceReady({ theme, layout, host, navigation, settings, latest, commit }: BotsSurfaceReadyProps) {
  const { colors } = theme;
  const { t } = useT();
  const toast = useToast();
  const menu = useMenu();
  const queryClient = useQueryClient();
  const localHost: LocalHost = { id: host.id, label: host.label };
  const localProviders = useProviders(useBotHost(null, localHost));
  const resolveHost = useHostResolver(localHost);
  const exportBot = useRpc(exportBotRpc);
  const importBot = useRpc(importBotRpc);
  const importTeam = useRpc(importTeamRpc);
  const listAgyOrphans = useRpc(agyOrphansListRpc);
  const resolveAgyOrphan = useRpc(agyOrphanResolveRpc);
  const ensureHome = useRpc(ensureBotHomeRpc);
  const compose = useRpc(systemPromptRpc);
  const mountServers = useRpc(mountRpc);

  const [agyOrphans, setAgyOrphans] = useState<OrphanedAgyAgentEntry[]>([]);
  const [orphansDismissed, setOrphansDismissed] = useState(false);
  const [orphansBusy, setOrphansBusy] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [panel, setPanel] = useState<{ open: boolean; section: SectionId | null }>({ open: false, section: null });
  const [panelVersion, setPanelVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [launcherTarget, setLauncherTarget] = useState<{ mode?: "direct" | "team"; groupId?: string | null; nonce: number } | null>(null);
  const [teamMap, setTeamMap] = useState(false);
  const [dataAnalysis, setDataAnalysis] = useState(false);
  const [editingTeam, setEditingTeam] = useState<BotGroup | "new" | null>(null);
  const [partnerSettingsOpen, setPartnerSettingsOpen] = useState(false);
  const [libraryView, setLibraryView] = useState<{ target: LibraryTarget | null } | null>(null);
  const [renaming, setRenaming] = useState<Bot | null>(null);
  const [exporting, setExporting] = useState<Bot | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Bot>>({});
  const [uiOverride, setUiOverride] = useState<BotListUi | null>(null);
  const [surfaceWidth, setSurfaceWidth] = useState(0);
  const [dragWidths, setDragWidths] = useState<{ list?: number }>({});
  const [splitHeight, setSplitHeight] = useState(0);
  const [paneSplitHeight, setPaneSplitHeight] = useState<number | null>(null);
  const [measuredPaneHeight, setMeasuredPaneHeight] = useState(0);

  const uiRef = useRef<BotListUi | null>(null);
  const paneRef = useRef<View>(null);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keyboardHeight = useKeyboardHeight();
  const bottomInset = keyboardHeight > 0 ? 0 : homeIndicatorInset();
  useChatInvalidation();

  useEffect(() => {
    if (navigation) {
      setGlobalNavigation(navigation);
    }
  }, [navigation]);

  useEffect(() => {
    void listAgyOrphans({})
      .then((res) => setAgyOrphans(res.orphans))
      .catch(() => {});
  }, [listAgyOrphans]);

  const allBots = settings.values.bots.map((bot) => drafts[bot.id] ?? bot);
  const library = settings.values.library ?? EMPTY_LIBRARY;
  const groups = settings.values.groups ?? [];
  const listUi = uiOverride ?? settings.values.ui ?? DEFAULT_BOT_LIST_UI;
  const listed = allBots
    .filter((bot) => listUi.showArchived || !bot.archived)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  const selectedBot = selection ? allBots.find((bot) => bot.id === selection.botId) : undefined;
  const archivedCount = allBots.filter((bot) => bot.archived).length;
  const tabs = teamTabs(groups, listed);
  const openTab = tabs.find((tab) => tab.id === listUi.tab) ?? tabs[0] ?? null;

  useEffect(() => {
    if (!selectedBot) return;
    const botHost = resolveHost(selectedBot.hostId);
    if (!botHost.api || selectedBot.cwd || !selectedBot.name.trim()) return;
    const api = botHost.api;
    const primaryGroup = primaryGroupForBot(selectedBot.id, groups);
    const timer = setTimeout(() => {
      void ensureHome({ botId: selectedBot.id, ...(primaryGroup ? { groupId: primaryGroup.id, groupName: primaryGroup.name } : {}) })
        .then((home) => syncBotWorkspaceTitle(api, selectedBot, { path: home.path, projectRoot: home.root, projectTitle: primaryGroup?.name ?? null }))
        .catch(() => {});
    }, 1000);
    return () => clearTimeout(timer);
  }, [selectedBot?.name, selectedBot?.id, selectedBot?.cwd, selectedBot?.hostId, groups, ensureHome, resolveHost]);

  const flush = async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    const pending = draftsRef.current;
    if (Object.keys(pending).length === 0) return;
    const ok = await commit((values) => {
      let history = values.history;
      const bots = values.bots.map((bot) => {
        const draft = pending[bot.id];
        if (!draft) return bot;
        history = pushHistory(history, bot);
        return draft;
      });
      return { ...values, bots, history };
    });
    if (ok) {
      setDrafts((current) => {
        const next = { ...current };
        for (const [id, bot] of Object.entries(pending)) if (next[id] === bot) delete next[id];
        return next;
      });
    }
  };

  const patchBot = (botId: string, patch: Partial<Bot>) => {
    setDrafts((current) => {
      const base = current[botId] ?? (latest.current.status === "ready" ? latest.current.values.bots.find((bot) => bot.id === botId) : undefined);
      return base ? { ...current, [botId]: { ...base, ...patch, updatedAt: new Date().toISOString() } } : current;
    });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  useEffect(() => () => void flush(), []);

  const currentUi = (): BotListUi =>
    uiRef.current ?? (latest.current.status === "ready" ? latest.current.values.ui : undefined) ?? DEFAULT_BOT_LIST_UI;

  const updateUi = (mutate: (current: BotListUi) => BotListUi) => {
    const latestLanguage = latest.current.status === "ready" ? latest.current.values.ui?.language : undefined;
    const base = latestLanguage ? { ...currentUi(), language: latestLanguage } : currentUi();
    const next = mutate(base);
    uiRef.current = next;
    setUiOverride(next);
    void commit((values) => ({ ...values, ui: uiRef.current ?? next }));
  };

  const updateBot = (botId: string, patch: Partial<Bot>, recordHistory = false) => {
    setDrafts((current) => (current[botId] ? { ...current, [botId]: { ...current[botId], ...patch } } : current));
    return commit((values) => {
      const previous = values.bots.find((entry) => entry.id === botId);
      if (!previous) return values;
      return {
        ...values,
        bots: values.bots.map((entry) => (entry.id === botId ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry)),
        history: recordHistory ? pushHistory(values.history, previous) : values.history,
      };
    });
  };

  const enterLibrary = (target: LibraryTarget | null) => {
    void flush();
    setLibraryView({ target });
  };

  const enterLibraryRef = useRef(enterLibrary);
  enterLibraryRef.current = enterLibrary;
  useEffect(
    () =>
      onLibraryTarget((target) => {
        enterLibraryRef.current(target);
      }),
    [],
  );

  const back = useRef({ panel, compact: layout.compact, selection, teamMap, dataAnalysis, libraryView });
  back.current = { panel, compact: layout.compact, selection, teamMap, dataAnalysis, libraryView };
  const goBack = (): boolean => {
    const state = back.current;
    if (state.libraryView) {
      setLibraryView(state.compact && state.libraryView.target ? { target: null } : null);
      return true;
    }
    if (state.panel.section) {
      setPanel({ open: true, section: null });
      return true;
    }
    if (state.panel.open) {
      setPanel({ open: false, section: null });
      return true;
    }
    if (!state.compact) return false;
    if (state.dataAnalysis) {
      setDataAnalysis(false);
      return true;
    }
    if (state.teamMap) {
      setTeamMap(false);
      return true;
    }
    if (state.selection) {
      setSelection(null);
      return true;
    }
    return false;
  };
  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => goBackRef.current());
    return () => subscription.remove();
  }, []);

  const applyIntentRef = useRef<(intent: SurfaceIntent) => void>(() => {});
  applyIntentRef.current = (intent) => {
    if (intent.kind === "new-bot") {
      setCreating(true);
    } else if (intent.kind === "select-bot") {
      setLibraryView(null);
      setLauncherTarget((prev) => ({
        mode: intent.mode ?? "direct",
        groupId: null,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      select({ botId: intent.botId, chatId: null });
    } else if (intent.kind === "select-group") {
      setLibraryView(null);
      setLauncherTarget((prev) => ({
        mode: "team",
        groupId: intent.groupId,
        nonce: (prev?.nonce ?? 0) + 1,
      }));
      const group = groups.find((g) => g.id === intent.groupId);
      const targetBotId =
        (group?.leadId && allBots.some((b) => b.id === group.leadId)
          ? group.leadId
          : group?.memberIds.find((id) => allBots.some((b) => b.id === id))) ?? listed[0]?.id;
      if (targetBotId) {
        select({ botId: targetBotId, chatId: null });
      }
    }
  };

  useEffect(() => {
    const initial = takeIntent();
    if (initial) applyIntentRef.current(initial);
    return onIntent((intent) => {
      takeIntent();
      applyIntentRef.current(intent);
    });
  }, []);

  const resolveAllOrphans = async (action: "disable" | "delete") => {
    if (agyOrphans.length === 0) return;
    const filesLabel = agyOrphans.map((o) => o.fileName).join(", ");
    if (action === "delete") {
      const confirmed = await confirmDialog({
        title: t("settings.agyOrphans.deleteTitle"),
        message: t("settings.agyOrphans.surfaceDeleteMessage", { count: agyOrphans.length, files: filesLabel }),
        confirmLabel: t("settings.agyOrphans.delete"),
        destructive: true,
      });
      if (!confirmed) return;
    }
    setOrphansBusy(true);
    try {
      for (const orphan of agyOrphans) {
        await resolveAgyOrphan({ fileName: orphan.fileName, action });
      }
      setAgyOrphans([]);
      toast.show(
        action === "disable"
          ? t("settings.agyOrphans.disabledToast", { fileName: filesLabel })
          : t("settings.agyOrphans.deletedToast", { fileName: filesLabel }),
        { variant: "success" },
      );
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setOrphansBusy(false);
    }
  };

  const listWidth = fitColumns(surfaceWidth || 1600, dragWidths.list ?? listUi.listWidth, null).list;
  const commitWidth = (key: "listWidth", width: number) => {
    setDragWidths({});
    updateUi((current) => ({ ...current, [key]: Math.round(width) }));
  };

  const select = (next: Selection) => {
    if (next.chatId) {
      const bot = allBots.find((b) => b.id === next.botId);
      const botHost = resolveHost(bot?.hostId ?? null);
      const openAgent = navigation?.openAgent ?? getGlobalNavigation()?.openAgent;
      if (openAgent) {
        openAgent({ agentId: next.chatId, serverId: botHost.key });
      }
      setSelection({ botId: next.botId, chatId: null });
      setPanel({ open: false, section: null });
    } else {
      setSelection(next);
      setPanel({ open: false, section: null });
      setTeamMap(false);
      setDataAnalysis(false);
    }
    const tab = openTab && tabOf(next.botId, groups) !== openTab.id ? tabOf(next.botId, groups) : null;
    if (tab || currentUi().collapsed.includes(next.botId)) {
      updateUi((current) => ({ ...current, tab: tab ?? current.tab, collapsed: current.collapsed.filter((id) => id !== next.botId) }));
    }
  };

  const openPanel = (bot: Bot, section: SectionId | null) => {
    select({ botId: bot.id, chatId: null });
    setPanel({ open: true, section });
  };

  const addBot = async (bot: Bot, section: SectionId = "identity") => {
    const saved = await commit((values) => ({ ...values, bots: [...values.bots, bot] }));
    if (saved) {
      select({ botId: bot.id, chatId: null });
      setPanel({ open: true, section });
    }
  };

  const defaultProvider = () => {
    const ready = (localProviders.data ?? []).filter((entry) => entry.status === "ready");
    return (ready.find((entry) => entry.provider === "claude") ?? ready[0])?.provider ?? "";
  };

  const duplicate = async (bot: Bot) => {
    await flush();
    const { json } = await exportBot({ bot, includeMemory: false });
    const { bot: copy } = await importBot({ botId: newBotId(), json });
    await addBot({
      ...copy,
      name: t("surface.copySuffix", { name: bot.name }),
      hostId: bot.hostId,
      cwd: bot.cwd,
      mounts: bot.mounts,
      alwaysAllow: bot.alwaysAllow,
      skillIds: bot.skillIds,
      mcpServerIds: bot.mcpServerIds,
      avatar: { ...bot.avatar, seed: randomSeed() },
    });
  };

  const remove = async (bot: Bot) => {
    const ok = await commit((values) => ({
      ...values,
      bots: values.bots.filter((entry) => entry.id !== bot.id),
      history: values.history.filter((entry) => entry.botId !== bot.id),
      groups: withoutBot(values.groups ?? [], bot.id, new Date().toISOString()),
    }));
    if (!ok) return;
    if (selection?.botId === bot.id) setSelection(null);
    updateUi((current) => {
      const { [bot.id]: _order, ...chatOrder } = current.chatOrder;
      return {
        ...current,
        collapsed: current.collapsed.filter((id) => id !== bot.id),
        pinnedChats: current.pinnedChats.filter((pin) => pin.botId !== bot.id),
        chatOrder,
      };
    });
  };

  const moveBot = (bot: Bot, delta: -1 | 1): (() => void) | undefined => {
    const shown = openTab?.bots ?? listed;
    const index = shown.findIndex((entry) => entry.id === bot.id);
    const neighbour = shown[index + delta];
    if (index === -1 || !neighbour) return undefined;
    const swap = (ids: readonly string[]) => ids.map((id) => (id === bot.id ? neighbour.id : id === neighbour.id ? bot.id : id));
    const group = openTab?.group;
    if (group) {
      if (bot.id === group.leadId || neighbour.id === group.leadId) return undefined;
      return () =>
        void commit((values) => ({
          ...values,
          groups: (values.groups ?? []).map((entry) => (entry.id === group.id ? { ...entry, memberIds: swap(entry.memberIds), updatedAt: new Date().toISOString() } : entry)),
        }));
    }
    if (neighbour.pinned !== bot.pinned) return undefined;
    return () =>
      void commit((values) => {
        const order = swap(values.bots.map((entry) => entry.id));
        return { ...values, bots: order.map((id) => values.bots.find((entry) => entry.id === id)!) };
      });
  };

  const copy = (text: string, done: string) =>
    void copyText(text)
      .then(() => toast.show(done, { variant: "success" }))
      .catch(() => toast.error(t("surface.unableToCopy")));

  const openBotMenu = (bot: Bot, anchor: LayoutRectangle, source: MenuSource) => {
    const botHost = resolveHost(bot.hostId);
    const chats = queryClient.getQueryData<PaseoAgent[]>(["paseo-bots", "chats", botHost.key, bot.id]) ?? [];
    const workspaceId = chats.find((chat) => chat.workspaceId)?.workspaceId;
    const openWorkspace = navigation?.openWorkspace;
    menu.open({
      anchor,
      align: source === "kebab" ? "end" : "start",
      width: 220,
      title: t("sidebar.botActions"),
      entries: botMenuEntries({
        bot,
        onOpenInPaseo: openWorkspace && workspaceId && botHost.online ? () => openWorkspace({ workspaceId, serverId: botHost.key }) : undefined,
        onOpenSettings: () => openPanel(bot, null),
        onTogglePin: () => void updateBot(bot.id, { pinned: !bot.pinned }),
        onMoveUp: moveBot(bot, -1),
        onMoveDown: moveBot(bot, 1),
        onRename: () => setRenaming(bot),
        onDuplicate: () => duplicate(bot).catch((error: unknown) => toast.error(t("surface.couldNotDuplicate", { error: errorText(error) }))),
        onExport: () => setExporting(bot),
        onCopyId: () => copy(bot.id, t("surface.botIdCopied")),
        onSaveAsPreset: () =>
          void flush()
            .then(() => commit((values) => ({ ...values, presets: [...(values.presets ?? []), presetFromBot(values.bots.find((entry) => entry.id === bot.id) ?? bot)] })))
            .then((saved) => saved && toast.show(t("surface.savedAsPreset", { name: bot.name }), { variant: "success" })),
        onToggleArchive: () => void updateBot(bot.id, { archived: !bot.archived }),
        onDelete: async () => {
          const confirmed = await confirmDialog({
            title: t("surface.deleteBotTitle"),
            message: t("surface.deleteBotMessage", { name: bot.name }),
            confirmLabel: t("common.delete"),
            cancelLabel: t("common.cancel"),
            destructive: true,
          });
          if (confirmed) await remove(bot);
        },
      }),
    });
  };

  const deleteTeam = async (group: BotGroup) => {
    const confirmed = await confirmDialog({
      title: t("surface.deleteTeamTitle"),
      message: t("surface.deleteTeamMessage", { name: group.name }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      destructive: true,
    });
    if (!confirmed) return false;
    await commit((values) => ({ ...values, groups: (values.groups ?? []).filter((entry) => entry.id !== group.id) }));
    return true;
  };

  const openTeamMenu = (group: BotGroup, anchor: LayoutRectangle) =>
    menu.open({
      anchor,
      align: "end",
      width: 200,
      title: t("surface.teamActions"),
      entries: [
        { label: t("surface.editTeam"), icon: "Pencil", onSelect: () => setEditingTeam(group) },
        { label: t("surface.dataAnalysis"), icon: "BarChart2", onSelect: () => { setTeamMap(false); setDataAnalysis(true); } },
        { label: t("surface.teamMap"), icon: "Network", onSelect: () => { setDataAnalysis(false); setTeamMap(true); } },
        { kind: "separator" },
        { label: t("surface.deleteTeam"), icon: "Trash2", destructive: true, onSelect: () => void deleteTeam(group) },
      ],
    });

  const openChatMenu = (bot: Bot, chat: PaseoAgent, anchor: LayoutRectangle, source: MenuSource, context: ChatMenuContext) => {
    const botHost = resolveHost(bot.hostId);
    const move = (delta: -1 | 1) => {
      const order = moveKey(context.siblings, chat.id, delta);
      return order ? () => updateUi((current) => ({ ...current, chatOrder: { ...current.chatOrder, [bot.id]: order } })) : undefined;
    };
    const unpin = (current: BotListUi) => ({ ...current, pinnedChats: current.pinnedChats.filter((pin) => pin.chatId !== chat.id) });
    const openAgent = navigation?.openAgent ?? getGlobalNavigation()?.openAgent;
    menu.open({
      anchor,
      align: source === "kebab" ? "end" : "start",
      width: 260,
      title: t("surface.chatActions"),
      entries: chatMenuEntries({
        pinned: context.pinned,
        onCopyPath: () => (chat.cwd ? copy(chat.cwd, t("common.pathCopied")) : toast.error(t("surface.chatPathUnavailable"))),
        onCopyId: () => copy(chat.id, t("surface.chatIdCopied")),
        onCopyTranscript: async () => {
          if (!botHost.api) {
            toast.error(t("surface.hostNotConnected"));
            return;
          }
          try {
            const entries = await fullTimeline(botHost.api, chat.id);
            await copyText(chatTranscript({ title: displayTitle(chat.title), botName: bot.name, entries, exportedAt: new Date() }));
            toast.show(t("surface.transcriptCopied"), { variant: "success" });
          } catch (error) {
            toast.error(t("surface.couldNotCopyTranscript", { error: errorText(error) }));
          }
        },
        onTogglePin: () =>
          updateUi((current) =>
            context.pinned ? unpin(current) : { ...current, pinnedChats: [...current.pinnedChats, { botId: bot.id, chatId: chat.id }] },
          ),
        move: context.pinned || listUi.chatSort !== "manual" ? null : { up: move(-1), down: move(1) },
        onOpenInPaseo: openAgent && botHost.online ? () => openAgent({ agentId: chat.id, serverId: botHost.key }) : undefined,
        onArchive: async () => {
          if (!botHost.api) {
            toast.error(t("surface.hostNotConnected"));
            return;
          }
          try {
            await botHost.api.agents.ref(chat.id).archive();
            if (selection?.chatId === chat.id) setSelection({ botId: bot.id, chatId: null });
            if (context.pinned) updateUi(unpin);
            await queryClient.invalidateQueries({ queryKey: ["paseo-bots", "chats", botHost.key, bot.id] });
          } catch (error) {
            toast.error(t("surface.failedToArchiveChat", { error: errorText(error) }));
          }
        },
      }),
    });
  };

  const openDisplayMenu = (anchor: LayoutRectangle) => {
    menu.open({
      anchor,
      align: "end",
      width: 232,
      title: t("surface.displayTitle"),
      entries: [
        {
          label: t("surface.archivedBots"),
          trailing: listUi.showArchived ? t("surface.shown") : archivedCount ? t("surface.hiddenCount", { count: archivedCount }) : t("surface.hidden"),
          onSelect: () => updateUi((current) => ({ ...current, showArchived: !current.showArchived })),
        },
        {
          label: t("surface.chatOrder"),
          trailing: listUi.chatSort === "manual" ? t("surface.orderManual") : t("surface.orderLastActivity"),
          onSelect: () => updateUi((current) => ({ ...current, chatSort: current.chatSort === "manual" ? "activity" : "manual" })),
        },
      ],
    });
  };

  const sidebar = (
    <BotSidebar
      colors={colors}
      bots={listed}
      openTab={openTab}
      hiddenArchivedCount={listUi.showArchived ? 0 : archivedCount}
      selection={selection}
      panelOpen={panel.open}
      ui={listUi}
      localHost={localHost}
      touch={layout.compact || layout.platform !== "web"}
      hideFooter={!layout.compact || (listed.length > 0 && !selection)}
      splash={layout.compact}
      bottomInset={layout.compact && listed.length > 0 && !selection ? 0 : bottomInset}
      onToggle={(botId) =>
        updateUi((current) => ({
          ...current,
          collapsed: current.collapsed.includes(botId) ? current.collapsed.filter((id) => id !== botId) : [...current.collapsed, botId],
        }))
      }
      onTogglePinnedSection={() => updateUi((current) => ({ ...current, pinnedCollapsed: !current.pinnedCollapsed }))}
      onShowArchived={() => updateUi((current) => ({ ...current, showArchived: true }))}
      onSelect={select}
      onNewBot={() => setCreating(true)}
      onBotMenu={openBotMenu}
      onChatMenu={openChatMenu}
      onDisplayMenu={openDisplayMenu}
      onEditTeam={setEditingTeam}
      onDataAnalysis={() => { setTeamMap(false); setDataAnalysis(true); }}
      onTeamMap={() => { setDataAnalysis(false); setTeamMap(true); }}
      onNewChat={() => {
        const group = openTab?.group ?? null;
        const targetBotId = (group?.leadId ? openTab?.bots.find((b) => b.id === group.leadId)?.id : undefined) ?? openTab?.bots[0]?.id ?? listed[0]?.id;
        if (!targetBotId) return;
        setLauncherTarget((prev) => ({
          mode: group ? "team" : "direct",
          groupId: group?.id ?? null,
          nonce: (prev?.nonce ?? 0) + 1,
        }));
        select({ botId: targetBotId, chatId: null });
      }}
      onPartnerSettings={() => setPartnerSettingsOpen(true)}
    />
  );

  const tabProps = openTab
    ? { colors, tabs, openTab, onTab: (tab: string) => updateUi((current) => ({ ...current, tab })), onTeamMenu: openTeamMenu, onNewTeam: () => setEditingTeam("new" as const) }
    : null;

  const pane = dataAnalysis ? (
    <DataAnalysisPane
      colors={colors}
      bots={allBots.filter((b) => !b.archived)}
      compact={layout.compact}
      bottomInset={bottomInset}
      onBack={() => setDataAnalysis(false)}
    />
  ) : teamMap ? (
    <TeamMap
      colors={colors}
      groups={groups}
      bots={allBots}
      localHost={localHost}
      compact={layout.compact}
      bottomInset={bottomInset}
      onBack={() => setTeamMap(false)}
      onNewTeam={() => setEditingTeam("new")}
      onEditTeam={setEditingTeam}
      onOpenBot={(bot) => {
        select({ botId: bot.id, chatId: null });
        setPanel({ open: true, section: null });
      }}
    />
  ) : panel.open && selectedBot ? (
    <BotPanel
      key={`${selectedBot.id}:${panelVersion}`}
      colors={colors}
      compact={layout.compact}
      bottomInset={bottomInset}
      bot={selectedBot}
      localHost={localHost}
      history={settings.values.history}
      library={library}
      groups={groups}
      section={panel.section}
      onSection={(section) => setPanel({ open: true, section })}
      onClose={() => {
        setPanel({ open: false, section: null });
        setSelection(null);
      }}
      onPatch={(patch) => patchBot(selectedBot.id, patch)}
      flush={flush}
      onRestore={(snapshot) => {
        patchBot(selectedBot.id, snapshot);
        setPanelVersion((version) => version + 1);
        toast.show(t("surface.restoredToast"), { variant: "success" });
      }}
      onSetup={async () => {
        try {
          const group = primaryGroupForBot(selectedBot.id, groups);
          const home = await ensureHome({ botId: selectedBot.id, ...(group ? { groupId: group.id, groupName: group.name } : {}) });
          const botHost = resolveHost(selectedBot.hostId);
          if (!botHost.api) throw new Error(t("surface.hostIsOffline", { label: botHost.label }));
          const { systemPrompt } = await compose({ bot: selectedBot, local: botHost.isLocal, message: SETUP_PROMPT });
          const agentId = newUuid();
          const plugin = botHost.isLocal ? await mountServers({ botId: selectedBot.id, agentId }) : {};
          const newAgentId = await startBotChat(botHost.api, {
            bot: selectedBot,
            library,
            ...(botHost.isLocal ? { agentId } : {}),
            plugin,
            placement: resolveBotPlacement(selectedBot, group, home),
            prompt: SETUP_PROMPT,
            title: t("surface.setupChatTitle"),
            systemPrompt,
          });
          await queryClient.invalidateQueries({ queryKey: ["paseo-bots", "chats", botHost.key, selectedBot.id] });
          (navigation?.openAgent ?? getGlobalNavigation()?.openAgent)?.({ agentId: newAgentId, serverId: botHost.key });
        } catch (error) {
          toast.error(t("surface.couldNotStart", { error: errorText(error) }));
        }
      }}
      onOpenChat={(chatId) => {
        const botHost = resolveHost(selectedBot.hostId);
        (navigation?.openAgent ?? getGlobalNavigation()?.openAgent)?.({ agentId: chatId, serverId: botHost.key });
      }}
    />
  ) : selection || (!layout.compact && listed.length > 0) ? (
    layout.compact ? (
      <View style={{ flex: 1, backgroundColor: colors.surface0, paddingBottom: bottomInset }}>
        <BotLauncherCore
          theme={theme}
          host={host}
          navigation={navigation}
          initialBotId={selection?.botId ?? listed[0]?.id ?? null}
          initialGroupId={launcherTarget?.groupId}
          initialMode={launcherTarget?.mode}
          intentKey={launcherTarget?.nonce}
          embedded={true}
          onClose={selection ? () => setSelection(null) : undefined}
        />
      </View>
    ) : (
      <BotLauncherCore
        theme={theme}
        host={host}
        navigation={navigation}
        initialBotId={selection?.botId ?? listed[0]?.id ?? null}
        initialGroupId={launcherTarget?.groupId}
        initialMode={launcherTarget?.mode}
        intentKey={launcherTarget?.nonce}
        embedded={true}
        onClose={selection ? () => setSelection(null) : undefined}
      />
    )
  ) : (
    <Splash colors={colors} />
  );

  const libraryScreen = libraryView ? (
    <LibraryView
      colors={colors}
      layout={layout}
      bottomInset={bottomInset}
      values={settings.values}
      commit={commit}
      target={libraryView.target}
      onTarget={(target) => setLibraryView({ target })}
      onBack={() => setLibraryView(null)}
    />
  ) : null;

  if (libraryScreen && !layout.compact) {
    return <View style={{ flex: 1, backgroundColor: colors.surface0, paddingBottom: keyboardHeight }}>{libraryScreen}</View>;
  }

  if ((dataAnalysis || teamMap) && !layout.compact) {
    return <View style={{ flex: 1, backgroundColor: colors.surface0, paddingBottom: keyboardHeight }}>{pane}</View>;
  }

  return (
    <>
      <View
        style={{ flex: 1, backgroundColor: colors.surface0, paddingBottom: keyboardHeight }}
        onLayout={(event) => setSurfaceWidth(event.nativeEvent.layout.width)}
      >
        {!orphansDismissed ? (
          <AgyOrphanBanner
            colors={colors}
            orphans={agyOrphans}
            busy={orphansBusy}
            onDisable={() => void resolveAllOrphans("disable")}
            onDelete={() => void resolveAllOrphans("delete")}
            onDismiss={() => setOrphansDismissed(true)}
          />
        ) : null}
        {layout.compact ? (
          <View ref={paneRef} collapsable={false} style={{ flex: 1 }}>
            {tabProps ? <TeamTabSwitcher {...tabProps} /> : null}
            <View style={{ flex: 1, minHeight: 0, backgroundColor: nativeTokens(colors).surfaceSidebar }}>
              {sidebar}
            </View>
            {listed.length > 0 && !selection ? (
              <>
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                    maxHeight: "55%",
                    flexShrink: 1,
                    overflow: "hidden",
                  }}
                >
                  <BotLauncherCore
                    theme={theme}
                    host={host}
                    navigation={navigation}
                    initialBotId={listed[0]?.id ?? null}
                    initialGroupId={launcherTarget?.groupId}
                    initialMode={launcherTarget?.mode}
                    intentKey={launcherTarget?.nonce}
                    embedded={true}
                  />
                </View>
                <View style={{ paddingBottom: bottomInset, backgroundColor: nativeTokens(colors).surfaceSidebar }}>
                  <BotSidebarFooter
                    colors={colors}
                    onNewBot={() => setCreating(true)}
                    onDataAnalysis={() => { setTeamMap(false); setDataAnalysis(true); }}
                    onTeamMap={() => { setDataAnalysis(false); setTeamMap(true); }}
                    onPartnerSettings={() => setPartnerSettingsOpen(true)}
                  />
                </View>
              </>
            ) : null}
            {selection || teamMap || dataAnalysis ? <SlideOver onClose={() => (dataAnalysis ? setDataAnalysis(false) : teamMap ? setTeamMap(false) : setSelection(null))}>{pane}</SlideOver> : null}
            {libraryScreen ? <SlideOver onClose={() => setLibraryView(null)}>{libraryScreen}</SlideOver> : null}
          </View>
        ) : (
          <>
            {tabProps ? <TeamTabsRow {...tabProps} /> : null}
            <View
              style={{ flex: 1, flexDirection: "column" }}
              onLayout={(event) => setSplitHeight(event.nativeEvent.layout.height)}
            >
              <View style={{ flex: 1, minHeight: 0, backgroundColor: nativeTokens(colors).surfaceSidebar }}>
                {sidebar}
              </View>
              {(() => {
                const isLauncherPane = !dataAnalysis && !teamMap && !(panel.open && selectedBot) && Boolean(selection || (!layout.compact && listed.length > 0));
                const minPaneHeight = 140;
                const maxPaneHeight = splitHeight > 0 ? Math.max(minPaneHeight, splitHeight - 96) : 640;
                const clampPane = (next: number) => Math.max(minPaneHeight, Math.min(maxPaneHeight, Math.round(next)));
                const activePaneHeight = paneSplitHeight !== null ? clampPane(paneSplitHeight) : null;
                return (
                  <View
                    onLayout={(event) => setMeasuredPaneHeight(event.nativeEvent.layout.height)}
                    style={[
                      {
                        position: "relative",
                        zIndex: 2,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                        overflow: "hidden",
                      },
                      activePaneHeight !== null
                        ? { height: activePaneHeight }
                        : isLauncherPane
                          ? { maxHeight: "75%" }
                          : { flexBasis: "58%", maxHeight: "78%", minHeight: 240 },
                    ]}
                  >
                    <RowResizeHandle
                      edge="top"
                      height={activePaneHeight ?? (measuredPaneHeight || 220)}
                      onResize={(next) => setPaneSplitHeight(clampPane(next))}
                    />
                    <View
                      ref={paneRef}
                      collapsable={false}
                      style={
                        isLauncherPane && activePaneHeight === null
                          ? { flexShrink: 1, minHeight: 0 }
                          : { flex: 1, minHeight: 0 }
                      }
                    >
                      {pane}
                    </View>
                  </View>
                );
              })()}
              <View style={{ backgroundColor: nativeTokens(colors).surfaceSidebar }}>
                <BotSidebarFooter
                  colors={colors}
                  onNewBot={() => setCreating(true)}
                  onDataAnalysis={() => setDataAnalysis(true)}
                  onTeamMap={() => setTeamMap(true)}
                  onPartnerSettings={() => setPartnerSettingsOpen(true)}
                />
              </View>
            </View>
          </>
        )}

        <BotsSurfaceModals
          colors={colors}
          editingTeam={editingTeam}
          creating={creating}
          renaming={renaming}
          exporting={exporting}
          groups={groups}
          allBots={allBots}
          presets={settings.values.presets ?? []}
          onCloseTeam={() => setEditingTeam(null)}
          onSaveTeam={(draft) => {
            const id = editingTeam === "new" ? null : (editingTeam ? editingTeam.id : null);
            const teamId = id ?? newGroupId();
            setEditingTeam(null);
            void commit((values) => ({ ...values, groups: saveTeam(values.groups ?? [], id, draft, teamId, new Date().toISOString()) })).then((saved) => saved && !id && updateUi((current) => ({ ...current, tab: teamId })));
          }}
          onDeleteTeam={editingTeam === "new" || !editingTeam ? undefined : () => void deleteTeam(editingTeam).then((deleted) => deleted && setEditingTeam(null))}
          onCloseCreating={() => setCreating(false)}
          onCreateBot={(start) => {
            setCreating(false);
            const bot = start?.preset ? botFromPreset(defaultProvider(), start.preset) : newBot(defaultProvider(), start?.template);
            const defaults = settings.values.defaults ?? DEFAULT_BOT_DEFAULTS;
            void addBot(applyDefaults(bot, defaults, defaultProvider()), start ? "overview" : "identity");
          }}
          onImportTeam={async (json) => {
            const { bots, teams } = await importTeam({ json });
            setCreating(false);
            const saved = await commit((values) => addImportedBots(values, bots, teams));
            const first = bots[0]?.bot;
            if (saved && first) {
              select({ botId: first.id, chatId: null });
              setPanel({ open: true, section: "overview" });
              if (bots.length > 1) toast.show(t("surface.addedBotsToast", { bots: formatPluralCount(t, "bot", bots.length) }), { variant: "success" });
            }
          }}
          onCloseRenaming={() => setRenaming(null)}
          onSubmitRenaming={async (name) => {
            if (!renaming) return;
            if (!(await updateBot(renaming.id, { name }, true))) throw new Error(t("common.unableToSave"));
            if (panel.open && selection?.botId === renaming.id) setPanelVersion((version) => version + 1);
          }}
          onCloseExporting={() => setExporting(null)}
        />

        <PartnerSettingsModal
          open={partnerSettingsOpen}
          colors={colors}
          groups={groups}
          bots={allBots}
          localHost={localHost}
          history={settings.values.history}
          library={library}
          initialTarget={
            openTab?.group
              ? { kind: "team", id: openTab.group.id }
              : selectedBot
                ? { kind: "bot", id: selectedBot.id }
                : null
          }
          onClose={() => setPartnerSettingsOpen(false)}
          onPatchBot={patchBot}
          flush={flush}
          onRestoreBot={(botId, snapshot) => {
            patchBot(botId, snapshot);
            toast.show(t("surface.restoredToast"), { variant: "success" });
          }}
          onSetupBot={async (bot) => {
            try {
              const group = primaryGroupForBot(bot.id, groups);
              const home = await ensureHome({ botId: bot.id, ...(group ? { groupId: group.id, groupName: group.name } : {}) });
              const botHost = resolveHost(bot.hostId);
              if (!botHost.api) throw new Error(t("surface.hostIsOffline", { label: botHost.label }));
              const { systemPrompt } = await compose({ bot, local: botHost.isLocal, message: SETUP_PROMPT });
              const agentId = newUuid();
              const plugin = botHost.isLocal ? await mountServers({ botId: bot.id, agentId }) : {};
              const newAgentId = await startBotChat(botHost.api, {
                bot,
                library,
                ...(botHost.isLocal ? { agentId } : {}),
                plugin,
                placement: resolveBotPlacement(bot, group, home),
                prompt: SETUP_PROMPT,
                title: t("surface.setupChatTitle"),
                systemPrompt,
              });
              await queryClient.invalidateQueries({ queryKey: ["paseo-bots", "chats", botHost.key, bot.id] });
              (navigation?.openAgent ?? getGlobalNavigation()?.openAgent)?.({ agentId: newAgentId, serverId: botHost.key });
            } catch (error) {
              toast.error(t("surface.couldNotStart", { error: errorText(error) }));
            }
          }}
          onOpenChat={(bot, chatId) => {
            const botHost = resolveHost(bot.hostId);
            (navigation?.openAgent ?? getGlobalNavigation()?.openAgent)?.({ agentId: chatId, serverId: botHost.key });
          }}
          onSaveTeam={(teamId, draft) => {
            void commit((values) => ({
              ...values,
              groups: saveTeam(values.groups ?? [], teamId, draft, teamId, new Date().toISOString()),
            }));
          }}
          onDeleteTeam={(group) => {
            void deleteTeam(group);
          }}
        />
      </View>
    </>
  );
}
