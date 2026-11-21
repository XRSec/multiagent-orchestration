/**
 * Purpose: Distilled virtual chat card for a single Bot/Team FeedEntry.
 * Context: Strips noisy tool timelines into a clean user-command bubble + Markdown reply card.
 * Usage: Rendered inside FeedScreen's chronological message stream with onOpenTask callback.
 */

import { Icon, Markdown } from "@getpaseo/plugin/client/ui";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import type { FeedEntry, FeedSource } from "../shared/protocol.ts";
import {
  channelInitial,
  formatRelativeTimestamp,
  isPreviewOnlyEntry,
  resolveWorkflowStageLabel,
  type HydratableFeedEntry,
} from "./feed-helpers.ts";
import type { FeedPalette } from "./styles.ts";

export interface FeedMessageCardProps {
  entry: HydratableFeedEntry;
  palette: FeedPalette;
  onOpenTask(entry: FeedEntry): void;
}

function sourceTagMeta(
  source: FeedSource,
): { label: string; tone: "muted" | "accent" | "warning" | "workflow"; icon?: string } | null {
  switch (source) {
    case "routine":
      return { label: "定时任务", tone: "warning" };
    case "workflow":
      return { label: "工作流", tone: "workflow", icon: "GitBranch" };
    case "team":
      return { label: "团队协作", tone: "accent" };
    case "delegated":
      return { label: "委派", tone: "muted" };
    case "dm":
      return null;
  }
}

function PillBadge({
  label,
  bg,
  fg,
  icon,
}: {
  label: string;
  bg: string;
  fg: string;
  icon?: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: bg,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      {icon ? <Icon name={icon} size={11} color={fg} /> : null}
      <Text style={{ fontSize: 11, fontWeight: "600", color: fg }}>{label}</Text>
    </View>
  );
}

function UserCommandBubble({
  command,
  timeText,
  palette,
}: {
  command: string;
  timeText: string;
  palette: FeedPalette;
}) {
  if (!command.trim()) return null;
  return (
    <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
      <View
        style={{
          maxWidth: "85%",
          backgroundColor: palette.userBubbleBg,
          borderWidth: 1,
          borderColor: palette.userBubbleBorder,
          borderRadius: 14,
          borderTopRightRadius: 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
          gap: 4,
        }}
      >
        <Text selectable style={{ fontSize: 13.5, lineHeight: 19, color: palette.fg }}>
          {command}
        </Text>
        {timeText ? (
          <Text style={{ fontSize: 10, color: palette.fgMuted, alignSelf: "flex-end" }}>
            {timeText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function EntrySpeakerHeader({
  entry,
  timeText,
  palette,
}: {
  entry: HydratableFeedEntry;
  timeText: string;
  palette: FeedPalette;
}) {
  const sourceTag = sourceTagMeta(entry.source);
  const stageLabel = resolveWorkflowStageLabel(entry);
  const tagColors =
    sourceTag?.tone === "warning"
      ? { bg: palette.warningSoftBg, fg: palette.warning }
      : sourceTag?.tone === "workflow"
        ? palette.dark
          ? { bg: "rgba(168, 85, 247, 0.18)", fg: "#C084FC" }
          : { bg: "rgba(147, 51, 234, 0.12)", fg: "#7E22CE" }
        : sourceTag?.tone === "accent"
          ? { bg: palette.accentSoftBg, fg: palette.accentBg }
          : { bg: palette.pillMutedBg, fg: palette.fgMuted };
  const stageColors = palette.dark
    ? { bg: "rgba(168, 85, 247, 0.12)", fg: "#D8B4FE" }
    : { bg: "rgba(147, 51, 234, 0.08)", fg: "#6B21A8" };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: palette.accentSoftBg,
          borderWidth: 1,
          borderColor: palette.accentBorder,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: palette.accentBg }}>
          {channelInitial(entry.botName)}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "700", color: palette.fg }}>
        {entry.botName}
      </Text>
      {sourceTag ? (
        <PillBadge
          label={sourceTag.label}
          bg={tagColors.bg}
          fg={tagColors.fg}
          {...(sourceTag.icon ? { icon: sourceTag.icon } : {})}
        />
      ) : null}
      {stageLabel ? (
        <PillBadge label={stageLabel} bg={stageColors.bg} fg={stageColors.fg} />
      ) : null}
      {entry.toolsCount > 0 ? (
        <PillBadge
          icon="Wrench"
          label={`${entry.toolsCount} tools`}
          bg={palette.pillMutedBg}
          fg={palette.fgMuted}
        />
      ) : null}
      {entry.archived ? (
        <PillBadge label="已归档" bg={palette.pillMutedBg} fg={palette.fgMuted} />
      ) : null}
      {isPreviewOnlyEntry(entry) ? (
        <PillBadge
          icon="Eye"
          label="仅预览（原会话已清理）"
          bg={palette.warningSoftBg}
          fg={palette.warning}
        />
      ) : null}
      <View style={{ flex: 1 }} />
      {timeText ? (
        <Text style={{ fontSize: 11, color: palette.fgMuted }}>{timeText}</Text>
      ) : null}
    </View>
  );
}

/** Renders one distilled FeedEntry as an optional user bubble plus an agent response card. */
export const FeedMessageCard = memo(function FeedMessageCard({
  entry,
  palette,
  onOpenTask,
}: FeedMessageCardProps) {
  const timeText = formatRelativeTimestamp(entry.timestamp);
  const hasReply = entry.reply.trim().length > 0;
  const isFailed = entry.status === "failed";

  return (
    <View style={{ marginBottom: 14 }}>
      <UserCommandBubble command={entry.command} timeText={timeText} palette={palette} />
      <View
        style={{
          backgroundColor: palette.botCardBg,
          borderWidth: 1,
          borderColor: isFailed ? palette.danger : palette.botCardBorder,
          borderRadius: 14,
          borderTopLeftRadius: 4,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <EntrySpeakerHeader entry={entry} timeText={timeText} palette={palette} />

        {isFailed ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              backgroundColor: palette.dangerSoftBg,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              marginBottom: hasReply ? 8 : 0,
            }}
          >
            <Icon name="AlertCircle" size={14} color={palette.danger} />
            <Text selectable style={{ flex: 1, fontSize: 12, color: palette.danger }}>
              {entry.errorMessage || "任务执行失败"}
            </Text>
          </View>
        ) : null}

        {hasReply ? (
          <View style={{ minHeight: 20 }}>
            <Markdown>{entry.reply}</Markdown>
          </View>
        ) : !isFailed ? (
          <Text style={{ fontSize: 13, color: palette.fgMuted }}>（无正文回复）</Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: 10,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: palette.borderSubtle,
          }}
        >
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontSize: 11, color: palette.fgMuted }}
          >
            {entry.agentTitle || entry.agentId}
          </Text>
          <Pressable
            onPress={() => onOpenTask(entry)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              backgroundColor: pressed ? palette.accentBg : palette.accentSoftBg,
              borderWidth: 1,
              borderColor: palette.accentBorder,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: "600", color: palette.accentBg }}>
              查看任务 ↗
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});
