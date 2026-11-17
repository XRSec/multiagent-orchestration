/**
 * Purpose: Sidebar navigation and session list for bots and teams.
 * Context: Renders in the left pane of BotsSurface.
 * Usage: <BotSidebar ... />
 * Prerequisites: Paseo client runtime, theme tokens, and bot settings.
 * Budget Justification: ~760 lines consolidating sidebar navigation, pinned chats, and team grouping.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import type { PaseoAgent } from "./paseo";
import { Icon, ScrollView } from "@getpaseo/plugin/client/ui";
import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Animated, Easing, Platform, Pressable, Text, View, type LayoutRectangle } from "react-native";
import type { Bot, BotGroup, BotListUi } from "../shared/bot";
import { displayTitle } from "../shared/chat";
import type { TeamTab } from "../shared/groups";
import { aggregateBuckets, chatBucket, orderChats, SIDEBAR_GROUP_LIMIT, type ChatBucket } from "../shared/sidebar";
import { Avatar, TeamLogo } from "./Avatar";
import { ChatStatusSlot, StatusBadge, SkeletonRows } from "./BotSidebarStatus";
import { formatBucketLabel, useT } from "./i18n";
import { useBotChats, useBotHost, useBotsChats, type BotChatItem, type LocalHost } from "./data";
import { openLibrary, useOpenLibrary } from "./navigation";
import { nativeTokens, useHover, type NativeTokens } from "./native";
import { Splash } from "./Splash";
import { ui } from "./typography";
import { SearchField } from "./panel/controls";
import { contextMenuProps, measureAnchor } from "./ui/Menu";
import { tooltip } from "./ui/Tooltip";

// Paseo's sidebar, reproduced from components/left-sidebar.tsx, sidebar-workspace-list.tsx
// and components/sidebar/*: bot rows are project rows, chat rows are workspace rows.

type Colors = PluginTheme["colors"];

export interface Selection {
  botId: string;
  /** Null is a new, not yet started chat. */
  chatId: string | null;
  /** First message to send straight away when starting a new chat. */
  prompt?: string;
  /** Title for the chat that `prompt` starts; Paseo derives one from the prompt otherwise. */
  title?: string;
}

export type MenuSource = "kebab" | "context";

export interface ChatMenuContext {
  /** Every unpinned chat of the bot in list order, for Move up / Move down. */
  siblings: string[];
  pinned: boolean;
}

interface BotSidebarProps {
  colors: Colors;
  bots: readonly Bot[];
  /** With teams, the open team tab: the list shows its bots. */
  openTab: TeamTab | null;
  /** Archived bots hidden by the display preferences. Keeps the header (and its menu) up when they're all that's left. */
  hiddenArchivedCount: number;
  selection: Selection | null;
  panelOpen?: boolean;
  ui: BotListUi;
  localHost: LocalHost;
  /** Touch devices have no hover: row actions stay visible. */
  touch: boolean;
  /** Hide the bottom action bar when the host layout renders it at the very bottom. */
  hideFooter?: boolean;
  /** Phone layout: with no bots at all, show the Paseo Bots splash instead of the empty state. */
  splash?: boolean;
  /** The home indicator: Paseo's mobile sidebar pads its panel by the bottom safe area. */
  bottomInset: number;
  onToggle(botId: string): void;
  onTogglePinnedSection(): void;
  onShowArchived(): void;
  onSelect(selection: Selection): void;
  onNewBot(): void;
  onBotMenu(bot: Bot, anchor: LayoutRectangle, source: MenuSource): void;
  onChatMenu(bot: Bot, chat: PaseoAgent, anchor: LayoutRectangle, source: MenuSource, context: ChatMenuContext): void;
  onDisplayMenu(anchor: LayoutRectangle): void;
  onEditTeam(group: BotGroup): void;
  onDataAnalysis(): void;
  onTeamMap(): void;
  onNewChat?(): void;
  onPartnerSettings?(): void;
}

const noSelect = { userSelect: "none" } as object;
/** Paseo hardcodes the project chevron colour (project-leading-visual.tsx). */
const CHEVRON_COLOR = "#9ca3af";

export function BotSidebar(props: BotSidebarProps) {
  const { colors, bots, openTab, ui: listUi, hiddenArchivedCount, bottomInset, onNewBot, onShowArchived, onDataAnalysis, onTeamMap, onEditTeam, onNewChat, onPartnerSettings } = props;
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const [query, setQuery] = useState("");
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const available = openTab?.bots ?? bots;
  const shown = available.filter((bot) => {
    const text = `${bot.name} ${bot.title} ${bot.description}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  const pinnedIds = new Set(listUi.pinnedChats.map((pin) => pin.chatId));
  const listedBots = new Map(shown.map((bot) => [bot.id, bot]));
  const pins = listUi.pinnedChats.filter((pin) => listedBots.has(pin.botId));
  const [containerWidth, setContainerWidth] = useState(0);
  const twoColumn = containerWidth >= 520;
  const { items: rawSessions, isLoading: sessionsLoading } = useBotsChats(shown, props.localHost);
  const sessionItems = rawSessions.filter((item) => !pinnedIds.has(item.chat.id));
  const mid = Math.ceil(sessionItems.length / 2);
  const leftItems = twoColumn ? sessionItems.slice(0, mid) : [];
  const rightItems = twoColumn ? sessionItems.slice(mid) : [];
  const siblingsByBot = new Map<string, string[]>();
  for (const item of sessionItems) {
    const list = siblingsByBot.get(item.bot.id) ?? [];
    list.push(item.chat.id);
    siblingsByBot.set(item.bot.id, list);
  }
  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
      return;
    }
    const fallbackBot = (openTab?.group?.leadId ? shown.find((b) => b.id === openTab.group?.leadId) : undefined) ?? shown[0] ?? bots[0];
    if (fallbackBot) props.onSelect({ botId: fallbackBot.id, chatId: null });
  };

  if (props.splash && bots.length === 0 && hiddenArchivedCount === 0 && pins.length === 0 && !openTab) {
    return (
      <View style={{ flex: 1, paddingBottom: bottomInset, backgroundColor: tokens.surfaceSidebar }}>
        <Splash colors={colors} background={tokens.surfaceSidebar} />
        {!props.hideFooter ? <BotSidebarFooter colors={colors} onNewBot={onNewBot} onDataAnalysis={onDataAnalysis} onTeamMap={onTeamMap} onPartnerSettings={onPartnerSettings} /> : null}
      </View>
    );
  }

  const renderSessionItem = ({ bot, chat }: BotChatItem) => {
    const isSelected = props.selection?.botId === bot.id && props.selection.chatId === chat.id;
    const siblings = siblingsByBot.get(bot.id) ?? [];
    return (
      <View
        key={chat.id}
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: isSelected ? colors.accent : colors.border,
          backgroundColor: colors.surface0,
          overflow: "hidden",
        }}
      >
        <ChatRow
          colors={colors}
          tokens={tokens}
          chat={chat}
          bot={bot}
          team={openTab?.group ?? null}
          hoisted
          touch={props.touch}
          selected={isSelected}
          onPress={() => props.onSelect({ botId: bot.id, chatId: chat.id })}
          onMenu={(anchor, source) => props.onChatMenu(bot, chat, anchor, source, { siblings, pinned: false })}
        />
      </View>
    );
  };

  return (
    <View
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={{ flex: 1, paddingBottom: bottomInset, backgroundColor: tokens.surfaceSidebar }}
    >
      {available.length || query ? <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6 }}><SearchField colors={colors} value={query} onChangeText={setQuery} placeholder="Find bots…" /></View> : null}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 4, paddingBottom: 12 }}
      >
        {pins.length > 0 ? <PinnedSection {...props} pins={pins} botById={listedBots} tokens={tokens} /> : null}
        {shown.length > 0 || hiddenArchivedCount > 0 ? (
          <SectionHeader
            colors={colors}
            title={openTab?.group ? t("sidebar.teamChatsHeader") : t("sidebar.directChatsHeader")}
            canNewChat={shown.length > 0}
            onNewChat={handleNewChat}
            onDisplayMenu={props.onDisplayMenu}
          />
        ) : null}
        {sessionsLoading && sessionItems.length === 0 ? (
          <SkeletonRows colors={colors} />
        ) : sessionItems.length > 0 ? (
          twoColumn ? (
            <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-start" }}>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>{leftItems.map(renderSessionItem)}</View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>{rightItems.map(renderSessionItem)}</View>
            </View>
          ) : (
            <View style={{ gap: 6 }}>{sessionItems.map(renderSessionItem)}</View>
          )
        ) : terms.length > 0 && shown.length === 0 ? (
          <EmptyState colors={colors} title="No matching bots" description="Search by name, role or description." action={{ icon: "X", label: "Clear search", onPress: () => setQuery("") }} />
        ) : openTab?.group && shown.length === 0 ? (
          <EmptyState colors={colors} title={t("sidebar.noBotsOnTeamTitle")} description={t("sidebar.noBotsOnTeamDesc")} action={{ icon: "Pencil", label: t("sidebar.editTeam"), onPress: () => onEditTeam(openTab.group!) }} />
        ) : bots.length === 0 ? (
          hiddenArchivedCount > 0 ? (
            <EmptyState
              colors={colors}
              title={t("sidebar.allArchivedTitle")}
              description={t("sidebar.allArchivedDesc")}
              action={{ icon: "Archive", label: t("sidebar.showArchived"), onPress: onShowArchived }}
            />
          ) : (
            <EmptyState colors={colors} title={t("sidebar.noBotsTitle")} description={t("sidebar.noBotsDesc")} action={{ icon: "Plus", label: t("sidebar.newBot"), onPress: onNewBot }} />
          )
        ) : (
          <EmptyState colors={colors} title={t("sidebar.noChatsTitle")} description={t("sidebar.noChatsDesc")} action={{ icon: "Plus", label: t("sidebar.newChat"), onPress: handleNewChat }} />
        )}
      </ScrollView>
      {!props.hideFooter ? <BotSidebarFooter colors={colors} onNewBot={onNewBot} onDataAnalysis={onDataAnalysis} onTeamMap={onTeamMap} onPartnerSettings={onPartnerSettings} /> : null}
    </View>
  );
}

// ------------------------------------------------------------------ header / footer / empty

function SectionHeader({
  colors,
  title,
  canNewChat,
  onNewChat,
  onDisplayMenu,
}: {
  colors: Colors;
  title: string;
  canNewChat: boolean;
  onNewChat(): void;
  onDisplayMenu(anchor: LayoutRectangle): void;
}) {
  const { t } = useT();
  const ref = useRef<View>(null);
  const { hovered, hoverProps } = useHover();
  const newChatHover = useHover();
  const displayLabel = t("sidebar.displayPreferences");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingLeft: 8, paddingRight: 4, paddingTop: 4, paddingBottom: 6 }}>
      <Text style={[{ fontSize: ui(12), color: colors.foregroundMuted }, noSelect]}>{title}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {canNewChat ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("sidebar.newChat")}
            onPress={onNewChat}
            {...newChatHover.hoverProps}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              height: 26,
              paddingHorizontal: 8,
              borderRadius: 6,
              backgroundColor: newChatHover.hovered ? colors.surface1 : "transparent",
            }}
          >
            <Icon name="Plus" size={13} color={newChatHover.hovered ? colors.foreground : colors.foregroundMuted} />
            <Text style={[{ fontSize: ui(12), color: newChatHover.hovered ? colors.foreground : colors.foregroundMuted }, noSelect]}>
              {t("sidebar.newChat")}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          ref={ref}
          accessibilityRole="button"
          accessibilityLabel={displayLabel}
          {...tooltip(displayLabel, "bottom")}
          onPress={() => void measureAnchor(ref).then((anchor) => anchor && onDisplayMenu(anchor))}
          {...hoverProps}
          style={{ width: 28, height: 28, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: hovered ? colors.surface1 : "transparent" }}
        >
          <Icon name="Settings2" size={14} color={colors.foregroundMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export function BotSidebarFooter({
  colors,
  onNewBot,
  onDataAnalysis,
  onTeamMap,
  onPartnerSettings,
}: {
  colors: Colors;
  onNewBot(): void;
  onDataAnalysis(): void;
  onTeamMap(): void;
  onPartnerSettings?(): void;
}) {
  const { t } = useT();
  const { hovered, hoverProps } = useHover();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.newBot")}
        onPress={onNewBot}
        {...hoverProps}
        style={({ pressed }) => [
          {
            minWidth: 0,
            minHeight: 32,
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: 8,
            backgroundColor: pressed ? colors.surface2 : hovered ? colors.surface1 : "transparent",
          },
          noSelect,
        ]}
      >
        <Icon name="Plus" size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
        <Text numberOfLines={1} style={{ minWidth: 0, flexShrink: 1, fontSize: ui(14), color: hovered ? colors.foreground : colors.foregroundMuted }}>
          {t("sidebar.newBot")}
        </Text>
      </Pressable>
      <FooterIconButton colors={colors} icon="BarChart2" label={t("sidebar.dataAnalysis")} onPress={onDataAnalysis} />
      <FooterIconButton colors={colors} icon="Network" label={t("sidebar.teamMap")} onPress={onTeamMap} />
      <FooterIconButton colors={colors} icon="Blocks" label={t("sidebar.skillsTools")} onPress={() => openLibrary()} />
      {onPartnerSettings ? (
        <FooterIconButton colors={colors} icon="Settings" label={t("sidebar.partnerSettings")} onPress={onPartnerSettings} />
      ) : null}
    </View>
  );
}

/** The sidebar footer's trailing icon buttons (Paseo's host, import and settings buttons): 32 box, 16pt icon. */
function FooterIconButton({ colors, icon, label, onPress }: { colors: Colors; icon: string; label: string; onPress(): void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...tooltip(label)}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => [
        { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: pressed ? colors.surface2 : hovered ? colors.surface1 : "transparent" },
        noSelect,
      ]}
    >
      <Icon name={icon} size={16} color={hovered ? colors.foreground : colors.foregroundMuted} />
    </Pressable>
  );
}

/** Paseo's SidebarProjectEmptyState (sidebar/empty-states.tsx). */
function EmptyState({ colors, title, description, action }: { colors: Colors; title: string; description: string; action: { icon: string; label: string; onPress(): void } }) {
  return (
    <View style={{ marginHorizontal: 8, marginTop: 16, paddingTop: 24, paddingBottom: 16, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.surface0, alignItems: "center", gap: 12 }}>
      <Text style={{ color: colors.foreground, fontSize: ui(12), fontWeight: "500", textAlign: "center" }}>{title}</Text>
      <Text style={{ color: colors.foregroundMuted, fontSize: ui(12), textAlign: "center" }}>{description}</Text>
      <GhostButton colors={colors} icon={action.icon} label={action.label} onPress={action.onPress} />
    </View>
  );
}

/** Paseo's Button variant="ghost" size="sm". */
function GhostButton({ colors, icon, label, onPress }: { colors: Colors; icon: string; label: string; onPress(): void }) {
  const { hovered, hoverProps } = useHover();
  const tint = hovered ? colors.foreground : colors.foregroundMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "transparent",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={icon} size={14} color={tint} />
      <Text style={{ fontSize: ui(14), color: tint }}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ pinned

type PinnedProps = BotSidebarProps & { pins: BotListUi["pinnedChats"]; botById: ReadonlyMap<string, Bot>; tokens: NativeTokens };

function PinnedSection(props: PinnedProps) {
  const { colors, pins, ui: listUi, touch, onTogglePinnedSection } = props;
  const { t } = useT();
  const collapsed = listUi.pinnedCollapsed;
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? pins : pins.slice(0, SIDEBAR_GROUP_LIMIT);
  const { hovered, hoverProps } = useHover();
  const pinnedLabel = t("sidebar.pinned");
  return (
    <View style={{ marginBottom: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={pinnedLabel}
        accessibilityState={{ expanded: !collapsed }}
        onPress={onTogglePinnedSection}
        {...hoverProps}
        style={[{ minHeight: 36, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 4, paddingHorizontal: 8, paddingVertical: 4 }, noSelect]}
      >
        <Text style={{ fontSize: ui(12), color: colors.foregroundMuted }}>{pinnedLabel}</Text>
        {hovered || touch ? <Icon name={collapsed ? "ChevronRight" : "ChevronDown"} size={12} color={colors.foregroundMuted} /> : null}
      </Pressable>
      {collapsed ? null : (
        <>
          {visible.map((pin) => (
            <PinnedChatRow key={pin.chatId} {...props} bot={props.botById.get(pin.botId)!} chatId={pin.chatId} />
          ))}
          {pins.length > SIDEBAR_GROUP_LIMIT ? <ShowMoreRow colors={colors} expanded={expanded} onPress={() => setExpanded(!expanded)} /> : null}
        </>
      )}
    </View>
  );
}

function PinnedChatRow({ colors, tokens, bot, chatId, selection, localHost, touch, onSelect, onChatMenu }: PinnedProps & { bot: Bot; chatId: string }) {
  const host = useBotHost(bot.hostId, localHost);
  const chats = useBotChats(host, bot.id);
  const chat = chats.data?.find((entry) => entry.id === chatId);
  if (!chat) return null;
  return (
    <ChatRow
      colors={colors}
      tokens={tokens}
      chat={chat}
      bot={bot}
      hoisted
      touch={touch}
      selected={selection?.botId === bot.id && selection.chatId === chat.id}
      onPress={() => onSelect({ botId: bot.id, chatId: chat.id })}
      onMenu={(anchor, source) => onChatMenu(bot, chat, anchor, source, { siblings: [], pinned: true })}
    />
  );
}

// ------------------------------------------------------------------ bot group

type GroupProps = BotSidebarProps & { bot: Bot; tokens: NativeTokens; pinnedIds: ReadonlySet<string>; /** The team's Chief of Staff. */ lead?: boolean };

function BotGroup(props: GroupProps) {
  const { colors, tokens, bot, selection, panelOpen, ui: listUi, localHost, touch, pinnedIds, onSelect, onChatMenu } = props;
  const host = useBotHost(bot.hostId, localHost);
  const chats = useBotChats(host, bot.id);
  const [expanded, setExpanded] = useState(false);
  const isOpen = !listUi.collapsed.includes(bot.id);
  const botSelected = selection?.botId === bot.id;
  const draftSelected = !panelOpen && botSelected && selection?.chatId === null;

  const unpinned = (chats.data ?? []).filter((chat) => !pinnedIds.has(chat.id));
  const ordered = orderChats(unpinned, listUi.chatSort, listUi.chatOrder[bot.id]);
  const siblings = ordered.map((chat) => chat.id);
  const visible = expanded ? ordered : ordered.slice(0, SIDEBAR_GROUP_LIMIT);
  const loading = !!host.api && chats.isLoading;
  // Collapsed rows carry their chats' most urgent status; open ones leave it to the rows.
  const aggregate = isOpen ? null : aggregateBuckets(unpinned.map(chatBucket));

  let children: ReactNode = null;
  if (isOpen) {
    if (loading) {
      children = <SkeletonRows colors={colors} />;
    } else {
      children = (
        <>
          <NewChatGhostRow
            colors={colors}
            tokens={tokens}
            selected={draftSelected}
            onPress={() => onSelect({ botId: bot.id, chatId: null })}
          />
          {visible.map((chat) => (
            <ChatRow
              key={chat.id}
              colors={colors}
              tokens={tokens}
              chat={chat}
              bot={bot}
              touch={touch}
              selected={botSelected && selection?.chatId === chat.id}
              onPress={() => onSelect({ botId: bot.id, chatId: chat.id })}
              onMenu={(anchor, source) => onChatMenu(bot, chat, anchor, source, { siblings, pinned: false })}
            />
          ))}
          {ordered.length > SIDEBAR_GROUP_LIMIT ? <ShowMoreRow colors={colors} expanded={expanded} onPress={() => setExpanded(!expanded)} /> : null}
        </>
      );
    }
  }

  return (
    <View role="group" accessibilityLabel={bot.name} style={{ paddingBottom: children ? 12 : 0 }}>
      <BotRow {...props} isOpen={isOpen} aggregate={aggregate} hostLabel={host.online ? null : host.label} />
      {children}
    </View>
  );
}

function BotRow({ colors, tokens, bot, lead, touch, isOpen, aggregate, hostLabel, onToggle, onSelect, onBotMenu }: GroupProps & { isOpen: boolean; aggregate: ChatBucket | null; hostLabel: string | null }) {
  const { t } = useT();
  const [hovered, setHovered] = useState(false);
  const kebabRef = useRef<View>(null);
  const plus = useHover();
  const actionsVisible = hovered || touch;
  const backdrop = hovered ? colors.surface1 : tokens.surfaceSidebar;
  // The row's press target sits behind its content and the ⋮ button is its sibling,
  // not children: nested pressables let a button press leak into the row on react-native-web.
  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[
        {
          position: "relative",
          minHeight: 36,
          paddingVertical: 8,
          paddingHorizontal: 8,
          borderRadius: 8,
          marginBottom: 4,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          backgroundColor: hovered ? colors.surface1 : "transparent",
        },
        noSelect,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={bot.name}
        accessibilityState={{ expanded: isOpen }}
        onPress={() => onToggle(bot.id)}
        {...contextMenuProps((anchor) => onBotMenu(bot, anchor, "context"))}
        style={({ pressed }) => ({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: pressed ? colors.surface2 : "transparent" })}
      />
      <View pointerEvents="none" style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <View style={{ width: 16, height: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
          {hovered ? (
            <Icon name={isOpen ? "ChevronDown" : "ChevronRight"} size={14} color={CHEVRON_COLOR} />
          ) : (
            <View style={{ position: "relative", width: 16, height: 16 }}>
              <Avatar avatar={bot.avatar} size={16} />
              {aggregate ? <StatusBadge colors={colors} tokens={tokens} bucket={aggregate} backdrop={backdrop} /> : null}
            </View>
          )}
        </View>
        <Text numberOfLines={1} style={{ minWidth: 0, flexShrink: 1, fontSize: ui(14), color: colors.foregroundMuted, opacity: bot.archived ? 0.6 : 1 }}>
          {bot.name}
          {hostLabel ? t("sidebar.hostOffline", { host: hostLabel }) : ""}
        </Text>
        {lead ? <Icon name="Crown" size={12} color={colors.foregroundMuted} /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 2, flexShrink: 0, marginRight: -6 }}>
        <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: actionsVisible ? 1 : 0 }} pointerEvents={actionsVisible ? "auto" : "none"}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("sidebar.newChatWithBot", { name: bot.name })}
            {...tooltip(t("sidebar.newChat"), "bottom")}
            hitSlop={8}
            onPress={() => onSelect({ botId: bot.id, chatId: null })}
            {...plus.hoverProps}
            style={({ pressed: down }) => ({
              width: 24,
              height: 24,
              borderRadius: 6,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: plus.hovered || down ? colors.surface1 : "transparent",
            })}
          >
            {({ pressed: down }) => <Icon name="Plus" size={15} color={plus.hovered || down ? colors.foreground : colors.foregroundMuted} />}
          </Pressable>
        </View>
        <View style={{ opacity: actionsVisible ? 1 : 0 }} pointerEvents={actionsVisible ? "auto" : "none"}>
          <KebabButton
            colors={colors}
            buttonRef={kebabRef}
            label={t("sidebar.botActions")}
            box
            onPress={() => void measureAnchor(kebabRef).then((anchor) => anchor && onBotMenu(bot, anchor, "kebab"))}
          />
        </View>
      </View>
    </View>
  );
}

// ------------------------------------------------------------------ rows

interface ChatRowProps {
  colors: Colors;
  tokens: NativeTokens;
  chat: PaseoAgent;
  bot: Bot;
  team?: BotGroup | null;
  selected: boolean;
  touch: boolean;
  /** Pinned rows sit outside their bot, so they lead with its avatar and name it underneath. */
  hoisted?: boolean;
  onPress(): void;
  onMenu(anchor: LayoutRectangle, source: MenuSource): void;
}

/** Paseo's workspace row (sidebar-workspace-list.tsx workspaceRow + sidebar-workspace-row-content.tsx). */
const ChatRow = memo(function ChatRow({ colors, tokens, chat, bot, team, selected, touch, hoisted, onPress, onMenu }: ChatRowProps) {
  const { t } = useT();
  const [hovered, setHovered] = useState(false);
  const kebabRef = useRef<View>(null);
  const bucket = chatBucket(chat);
  const bucketLabel = formatBucketLabel(t, bucket);
  const title = displayTitle(chat.title);
  const showKebab = hovered || touch;
  const background = selected ? tokens.surfaceSidebarSelected : hovered ? colors.surface1 : "transparent";
  // As in BotRow: the press target sits behind the content and the ⋮ is its sibling, so a
  // kebab press can't also select the chat.
  return (
    <View
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      style={[
        {
          position: "relative",
          minHeight: 36,
          marginBottom: 2,
          paddingVertical: 8,
          paddingLeft: 8,
          paddingRight: 12,
          borderRadius: 8,
          justifyContent: "center",
          backgroundColor: background,
        },
        noSelect,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.chatLabelWithStatus", { title, status: bucketLabel })}
        accessibilityState={{ selected }}
        onPress={onPress}
        {...contextMenuProps((anchor) => onMenu(anchor, "context"))}
        style={({ pressed }) => ({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: 8, backgroundColor: pressed ? colors.surface2 : "transparent" })}
      />
      <View pointerEvents="none" style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, width: "100%" }}>
        {hoisted ? (
          <View style={{ width: 16, height: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
            <View style={{ position: "relative", width: 16, height: 16 }}>
              <Avatar avatar={bot.avatar} size={16} />
              {bucket !== "done" ? <StatusBadge colors={colors} tokens={tokens} bucket={bucket} backdrop={selected ? tokens.surfaceSidebarSelected : hovered ? colors.surface1 : tokens.surfaceSidebar} /> : null}
            </View>
          </View>
        ) : (
          <ChatStatusSlot colors={colors} tokens={tokens} bucket={bucket} />
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: ui(14), fontWeight: "400", lineHeight: 20, color: colors.foreground, opacity: hovered ? 1 : 0.76 }}>
              {title}
            </Text>
            {/* On touch the kebab stays, so its space is reserved; on desktop it overlays the title's tail. */}
            {touch ? <View style={{ width: 18, height: 20 }} /> : null}
          </View>
          {hoisted ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: ui(12), lineHeight: 16, color: colors.foregroundMuted, flexShrink: 1 }}>
                {bot.name}
              </Text>
              {team ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surface1 }}>
                  <TeamLogo group={team} size={11} dark={tokens.dark} />
                  <Text numberOfLines={1} style={{ fontSize: ui(11), lineHeight: 14, color: colors.foregroundMuted, maxWidth: 96 }}>
                    {team.name || t("teams.untitledTeam")}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {showKebab ? (
        <View style={{ position: "absolute", top: 8, right: 12, flexDirection: "row" }}>
          {/* A short scrim in the row's colour hides the title's tail under the kebab, as native does. */}
          {touch ? null : <View pointerEvents="none" style={{ width: 16, backgroundColor: hovered ? colors.surface1 : "transparent" }} />}
          <View style={{ backgroundColor: selected ? tokens.surfaceSidebarSelected : colors.surface1 }}>
            <KebabButton colors={colors} buttonRef={kebabRef} label={t("sidebar.chatActions")} onPress={() => void measureAnchor(kebabRef).then((anchor) => anchor && onMenu(anchor, "kebab"))} />
          </View>
        </View>
      ) : null}
    </View>
  );
});

/** Paseo's NewWorkspaceGhostRow: the one row indented 16 so it reads as belonging to its bot. */
function NewChatGhostRow({ colors, tokens, selected, onPress }: { colors: Colors; tokens: NativeTokens; selected: boolean; onPress(): void }) {
  const { t } = useT();
  const { hovered, hoverProps } = useHover();
  const label = t("sidebar.newChat");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => [
        {
          minHeight: 36,
          marginBottom: 2,
          paddingVertical: 8,
          paddingLeft: 16,
          paddingRight: 12,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: pressed ? colors.surface2 : selected ? tokens.surfaceSidebarSelected : hovered ? colors.surface1 : "transparent",
        },
        noSelect,
      ]}
    >
      {({ pressed }) => (
        <>
          <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="Plus" size={14} color={hovered || pressed || selected ? colors.foreground : colors.foregroundMuted} />
          </View>
          <Text numberOfLines={1} style={{ minWidth: 0, flexShrink: 1, fontSize: ui(14), color: hovered || pressed || selected ? colors.foreground : colors.foregroundMuted }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** Paseo's SidebarGroupToggleRow. */
function ShowMoreRow({ colors, expanded, onPress }: { colors: Colors; expanded: boolean; onPress(): void }) {
  const { t } = useT();
  const { hovered, hoverProps } = useHover();
  const label = expanded ? t("sidebar.showLess") : t("sidebar.showMore");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => [
        {
          minHeight: 36,
          marginBottom: 2,
          paddingVertical: 8,
          paddingLeft: 8,
          paddingRight: 12,
          borderRadius: 8,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          backgroundColor: pressed ? colors.surface2 : hovered ? colors.surface1 : "transparent",
        },
        noSelect,
      ]}
    >
      {({ pressed }) => (
        <>
          <View style={{ width: 16, height: 16, alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={14} color={hovered || pressed ? colors.foreground : colors.foregroundMuted} />
          </View>
          <Text numberOfLines={1} style={{ minWidth: 0, flexShrink: 1, fontSize: ui(14), color: hovered || pressed ? colors.foreground : colors.foregroundMuted }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/**
 * Kebab triggers. Chat rows use Paseo's workspace trigger (padding 2, radius 4, pulled
 * onto the rail with marginRight -7); bot rows use the 24pt project kebab (`box`).
 */
function KebabButton({ colors, buttonRef, label, box, onPress }: { colors: Colors; buttonRef: RefObject<View | null>; label: string; box?: boolean; onPress(): void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      ref={buttonRef}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...tooltip(label, "bottom")}
      hitSlop={8}
      onPress={onPress}
      {...hoverProps}
      style={
        box
          ? { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center", flexShrink: 0, backgroundColor: hovered ? colors.surface2 : "transparent" }
          : { padding: 2, borderRadius: 4, marginLeft: 2, marginRight: -7, backgroundColor: hovered ? colors.surface2 : "transparent" }
      }
    >
      <Icon name="MoreVertical" size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
    </Pressable>
  );
}

