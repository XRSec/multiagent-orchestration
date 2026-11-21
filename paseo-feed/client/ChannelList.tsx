/**
 * Purpose: Searchable and category-filterable channel navigation rail for Bot DMs and Team feeds.
 * Context: Left column on desktop layouts; primary view before drilling into a stream on compact layouts.
 * Usage: Render inside FeedScreen passing channels, active selection, and onSelect callback.
 */

import { Icon, ScrollView, TextInput } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { FeedChannel } from "../shared/protocol.ts";
import {
  channelInitial,
  filterChannelsByCategory,
  formatRelativeTimestamp,
  truncatePreview,
  type ChannelCategory,
} from "./feed-helpers.ts";
import { FEED_RAIL_WIDTH, type FeedPalette } from "./styles.ts";

export interface ChannelListProps {
  channels: readonly FeedChannel[];
  selectedKind: string | null;
  selectedId: string | null;
  loading: boolean;
  compact: boolean;
  palette: FeedPalette;
  onSelect(channel: FeedChannel): void;
}

const CATEGORY_TABS: readonly { key: ChannelCategory; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "assistant", label: "助理" },
  { key: "bots", label: "伙伴" },
  { key: "teams", label: "团队" },
];

function CategoryTabs({
  value,
  palette,
  onChange,
}: {
  value: ChannelCategory;
  palette: FeedPalette;
  onChange(category: ChannelCategory): void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 4 }}>
      {CATEGORY_TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 5,
              borderRadius: 8,
              backgroundColor: active
                ? palette.accentSoftBg
                : pressed
                  ? palette.surfaceElevated
                  : palette.pillMutedBg,
              borderWidth: 1,
              borderColor: active ? palette.accentBorder : "transparent",
            })}
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 11.5,
                fontWeight: active ? "700" : "500",
                color: active ? palette.accentBg : palette.fgMuted,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function ChannelAvatar({
  channel,
  selected,
  palette,
}: {
  channel: FeedChannel;
  selected: boolean;
  palette: FeedPalette;
}) {
  const isTeam = channel.kind === "team";
  const isGlobal = Boolean(channel.isGlobalAssistant);
  const bg = selected
    ? palette.accentBg
    : isGlobal
      ? palette.accentSoftBg
      : palette.surfaceElevated;
  const fg = selected ? palette.accentFg : isGlobal ? palette.accentBg : palette.fg;

  return (
    <View style={{ position: "relative" }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: isTeam ? 10 : 17,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: selected ? palette.accentBorder : palette.borderSubtle,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isTeam ? (
          <Icon name="Users" size={16} color={fg} />
        ) : isGlobal ? (
          <Icon name="Sparkles" size={16} color={fg} />
        ) : (
          <Text style={{ fontSize: 13, fontWeight: "700", color: fg }}>
            {channelInitial(channel.name)}
          </Text>
        )}
      </View>
      {channel.activeAgentId !== null ? (
        <View
          style={{
            position: "absolute",
            right: -1,
            bottom: -1,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: palette.success,
            borderWidth: 2,
            borderColor: palette.railBg,
          }}
        />
      ) : null}
    </View>
  );
}

function ChannelRow({
  channel,
  selected,
  palette,
  onPress,
}: {
  channel: FeedChannel;
  selected: boolean;
  palette: FeedPalette;
  onPress(): void;
}) {
  const timeText = formatRelativeTimestamp(channel.lastActivityAt);
  const preview = truncatePreview(channel.lastPreview || channel.subtitle || "暂无消息", 46);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 10,
        paddingVertical: 9,
        marginHorizontal: 8,
        marginVertical: 2,
        borderRadius: 10,
        backgroundColor: selected
          ? palette.surfaceActiveRow
          : pressed
            ? palette.pillMutedBg
            : "transparent",
        borderWidth: 1,
        borderColor: selected ? palette.accentBorder : "transparent",
      })}
    >
      <ChannelAvatar channel={channel} selected={selected} palette={palette} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: selected ? "700" : "600",
              color: palette.fg,
            }}
          >
            {channel.name}
          </Text>
          {channel.pinned && !channel.isGlobalAssistant ? (
            <Icon name="Pin" size={11} color={palette.fgMuted} />
          ) : null}
          {timeText ? (
            <Text style={{ fontSize: 11, color: palette.fgMuted }}>{timeText}</Text>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 12, color: palette.fgMuted }}
          >
            {preview}
          </Text>
          {channel.entryCount > 0 ? (
            <View
              style={{
                backgroundColor: palette.pillMutedBg,
                borderRadius: 8,
                paddingHorizontal: 5,
                paddingVertical: 1,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: "600", color: palette.fgMuted }}>
                {channel.entryCount > 99 ? "99+" : channel.entryCount}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function ChannelSection({
  title,
  items,
  selectedKind,
  selectedId,
  palette,
  onSelect,
}: {
  title: string;
  items: readonly FeedChannel[];
  selectedKind: string | null;
  selectedId: string | null;
  palette: FeedPalette;
  onSelect(channel: FeedChannel): void;
}) {
  if (items.length === 0) return null;
  return (
    <View style={{ marginTop: 10 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: palette.fgMuted,
          paddingHorizontal: 16,
          paddingBottom: 4,
        }}
      >
        {title}
      </Text>
      {items.map((ch) => (
        <ChannelRow
          key={`${ch.kind}:${ch.id}`}
          channel={ch}
          selected={selectedKind === ch.kind && selectedId === ch.id}
          palette={palette}
          onPress={() => onSelect(ch)}
        />
      ))}
    </View>
  );
}

/** Left navigation rail grouping Bot DMs and Team feeds with category tabs and search filtering. */
export function ChannelList({
  channels,
  selectedKind,
  selectedId,
  loading,
  compact,
  palette,
  onSelect,
}: ChannelListProps) {
  const [category, setCategory] = useState<ChannelCategory>("all");
  const [query, setQuery] = useState("");
  const filteredChannels = useMemo(
    () => filterChannelsByCategory(channels, category, query),
    [channels, category, query],
  );
  const botItems = useMemo(
    () => filteredChannels.filter((ch) => ch.kind === "bot"),
    [filteredChannels],
  );
  const teamItems = useMemo(
    () => filteredChannels.filter((ch) => ch.kind === "team"),
    [filteredChannels],
  );

  return (
    <View
      style={{
        width: compact ? "100%" : FEED_RAIL_WIDTH,
        flex: compact ? 1 : undefined,
        backgroundColor: palette.railBg,
        borderRightWidth: compact ? 0 : 1,
        borderRightColor: palette.border,
      }}
    >
      <View
        style={{
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 8,
          borderBottomWidth: 1,
          borderBottomColor: palette.borderSubtle,
        }}
      >
        <CategoryTabs value={category} palette={palette} onChange={setCategory} />
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: palette.inputBg,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.borderSubtle,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Icon name="Search" size={14} color={palette.fgMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="搜索伙伴或团队…"
            placeholderTextColor={palette.fgMuted}
            style={{
              flex: 1,
              fontSize: 13,
              color: palette.fg,
              paddingVertical: 0,
            }}
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={6}>
              <Icon name="X" size={14} color={palette.fgMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
        {loading && channels.length === 0 ? (
          <View style={{ padding: 20, alignItems: "center" }}>
            <Text style={{ fontSize: 13, color: palette.fgMuted }}>正在加载频道…</Text>
          </View>
        ) : filteredChannels.length === 0 ? (
          <View style={{ padding: 20, alignItems: "center", gap: 4 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: palette.fg }}>
              {channels.length === 0 ? "暂无可用频道" : "无匹配结果"}
            </Text>
            <Text style={{ fontSize: 12, color: palette.fgMuted }}>
              {channels.length === 0
                ? "请先创建 Bot 或团队会话"
                : query.trim()
                  ? "尝试更换搜索关键词"
                  : "该分类下暂无频道"}
            </Text>
          </View>
        ) : category === "all" ? (
          <>
            <ChannelSection
              title="伙伴私聊"
              items={botItems}
              selectedKind={selectedKind}
              selectedId={selectedId}
              palette={palette}
              onSelect={onSelect}
            />
            <ChannelSection
              title="团队群聊"
              items={teamItems}
              selectedKind={selectedKind}
              selectedId={selectedId}
              palette={palette}
              onSelect={onSelect}
            />
          </>
        ) : (
          <View style={{ marginTop: 6 }}>
            {filteredChannels.map((ch) => (
              <ChannelRow
                key={`${ch.kind}:${ch.id}`}
                channel={ch}
                selected={selectedKind === ch.kind && selectedId === ch.id}
                palette={palette}
                onPress={() => onSelect(ch)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
