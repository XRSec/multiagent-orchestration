/**
 * Purpose: Compact bot selector popover rendered when clicking the composer pill in normal agent chats.
 * Context: Clicking a bot closes the popover, jumps to the Bots surface, and switches to that bot's composer.
 * Usage: Contributed via client.addComposerPill in index.client.tsx.
 * Prerequisites: Paseo client runtime, useBotSettings, and intent navigation.
 */

import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Avatar, TeamLogo } from "../Avatar";
import { useT } from "../i18n";
import { requestIntent } from "../intent";
import { nativeTokens } from "../native";
import { ui } from "../typography";
import { useBotSettings } from "../useBotSettings";

export type BotLauncherPopoverProps = PluginButtonContentProps & {
  openBotsSurface?: () => void;
};

export function BotLauncherPopover(props: BotLauncherPopoverProps) {
  const { colors } = props.theme;
  const tokens = nativeTokens(colors);
  const { t } = useT();
  const { settings } = useBotSettings();
  // Compact/mobile hosts render `button.title` as the bottom-sheet header, so skip the inner header there.
  const isCompact = props.layout?.compact ?? Platform.OS !== "web";

  const groups = useMemo(
    () => (settings.status === "ready" ? settings.values.groups ?? [] : []),
    [settings],
  );
  const bots = useMemo(
    () => (settings.status === "ready" ? settings.values.bots.filter((b) => !b.archived) : []),
    [settings],
  );

  const handleSelectGroup = (groupId: string) => {
    props.close();
    requestIntent({ kind: "select-group", groupId });
    props.openBotsSurface?.();
  };

  const handleSelectBot = (botId: string) => {
    props.close();
    requestIntent({ kind: "select-bot", botId, mode: "direct" });
    props.openBotsSurface?.();
  };

  const handleNewBot = () => {
    props.close();
    requestIntent({ kind: "new-bot" });
    props.openBotsSurface?.();
  };

  return (
    <View
      style={[
        styles.container,
        {
          width: isCompact ? "100%" : 280,
        },
      ]}
    >
      {!isCompact ? (
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerLeft}>
            <Icon name="Bot" size={15} color={colors.accent} />
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>
              {t("launcher.title")}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
            onPress={props.close}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.65 : 1 }]}
          >
            <Icon name="X" size={14} color={colors.foregroundMuted} />
          </Pressable>
        </View>
      ) : null}

      {groups.length === 0 && bots.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={[styles.emptyText, { color: colors.foregroundMuted }]}>
            {t("launcher.noBotsAvailable")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={handleNewBot}
            style={({ pressed }) => [
              styles.newBotBtn,
              { backgroundColor: colors.accent, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Icon name="Plus" size={14} color={colors.accentForeground ?? tokens.warmPaper} />
            <Text style={[styles.newBotText, { color: colors.accentForeground ?? tokens.warmPaper }]}>
              {t("plugin.newBot")}
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {groups.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foregroundMuted }]}>
                {t("launcher.teamsSection")}
              </Text>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  accessibilityRole="button"
                  onPress={() => handleSelectGroup(group.id)}
                  style={({ pressed, hovered }: any) => [
                    styles.botRow,
                    {
                      backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                    },
                  ]}
                >
                  <TeamLogo group={group} size={24} dark={tokens.dark} />
                  <View style={styles.botMeta}>
                    <Text numberOfLines={1} style={[styles.botName, { color: colors.foreground }]}>
                      {group.name}
                    </Text>
                    <Text numberOfLines={1} style={[styles.botSub, { color: colors.foregroundMuted }]}>
                      {t("launcher.teamMode")}
                    </Text>
                  </View>
                  <Icon name="ChevronRight" size={14} color={colors.foregroundMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {bots.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foregroundMuted }]}>
                {t("launcher.botsSection")}
              </Text>
              {bots.map((bot) => (
                <Pressable
                  key={bot.id}
                  accessibilityRole="button"
                  onPress={() => handleSelectBot(bot.id)}
                  style={({ pressed, hovered }: any) => [
                    styles.botRow,
                    {
                      backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
                    },
                  ]}
                >
                  <Avatar avatar={bot.avatar} size={24} dark={tokens.dark} />
                  <View style={styles.botMeta}>
                    <Text numberOfLines={1} style={[styles.botName, { color: colors.foreground }]}>
                      {bot.name}
                    </Text>
                    {bot.title || bot.description ? (
                      <Text numberOfLines={1} style={[styles.botSub, { color: colors.foregroundMuted }]}>
                        {bot.title || bot.description}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="ChevronRight" size={14} color={colors.foregroundMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
    maxHeight: 360,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: ui(13),
    fontWeight: "600",
  },
  closeBtn: {
    padding: 4,
    borderRadius: 6,
  },
  list: {
    maxHeight: 300,
  },
  listContent: {
    padding: 6,
    gap: 8,
  },
  section: {
    gap: 2,
  },
  sectionTitle: {
    fontSize: ui(11),
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingTop: 4,
    paddingBottom: 2,
  },
  botRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  botMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  botName: {
    fontSize: ui(13),
    fontWeight: "500",
  },
  botSub: {
    fontSize: ui(11),
  },
  emptyState: {
    padding: 20,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: ui(13),
  },
  newBotBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  newBotText: {
    fontSize: ui(12),
    fontWeight: "600",
  },
});
