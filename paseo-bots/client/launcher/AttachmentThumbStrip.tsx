/**
 * Purpose: Compact thumbnail preview and file attachment badge strip with deletion support.
 * Context: Used by BotLauncherPopover to show uploaded or pasted attachments above prompt.
 * Usage: <AttachmentThumbStrip attachments={attachments} colors={colors} onRemove={handleRemove} />
 * Prerequisites: React Native, ComposerAttachment from shared/attachments.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import React from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import type { ComposerAttachment } from "../../shared/attachments";
import { useT } from "../i18n";
import { ui } from "../typography";

type Colors = PluginTheme["colors"];

interface AttachmentThumbStripProps {
  attachments: readonly ComposerAttachment[];
  colors: Colors;
  onRemove(id: string): void;
}

export function AttachmentThumbStrip({ attachments, colors, onRemove }: AttachmentThumbStripProps) {
  const { t } = useT();
  if (!attachments.length) return null;

  const webTouchStyle = Platform.OS === "web" ? ({
    overflowX: "auto",
    touchAction: "pan-x",
    WebkitOverflowScrolling: "touch",
  } as unknown as ViewStyle) : null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      nestedScrollEnabled
      style={[styles.container, webTouchStyle]}
      contentContainerStyle={styles.content}
    >
      {attachments.map((att) => {
        const isImage = att.kind === "image";
        return (
          <View
            key={att.id}
            style={[
              styles.itemWrapper,
              { borderColor: colors.border, backgroundColor: colors.surface1 },
            ]}
          >
            {isImage ? (
              <Image
                source={{ uri: `data:${att.mimeType};base64,${att.data}` }}
                style={styles.imageThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.filePill}>
                <Icon name="FileText" size={13} color={colors.foregroundMuted} />
                <Text numberOfLines={1} style={[styles.fileName, { color: colors.foreground }]}>
                  {att.name}
                </Text>
              </View>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("launcher.removeAttachment")}
              onPress={() => onRemove(att.id)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.deleteBtn,
                { backgroundColor: colors.surface2, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Icon name="X" size={10} color={colors.foreground} />
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 62,
    marginBottom: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
    paddingRight: 8,
    paddingLeft: 2,
  },
  itemWrapper: {
    position: "relative",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "visible",
  },
  imageThumb: {
    width: 44,
    height: 44,
    borderRadius: 7,
  },
  filePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 44,
    paddingHorizontal: 8,
    maxWidth: 150,
  },
  fileName: {
    fontSize: ui(12),
    maxWidth: 100,
  },
  deleteBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
