/**
 * Purpose: Bottom quick-reply composer for active Bot DM and Team channels.
 * Context: Dispatches feedSendRpc and surfaces actionable no-active-chat recovery links.
 * Usage: Render at the bottom of FeedScreen when a channel is selected.
 */

import { Icon, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { FeedChannel } from "../shared/protocol.ts";
import {
  isImeComposing,
  resolveComposerNotice,
  type ComposerNoticeState,
  type FeedComposerSendResult,
} from "./feed-helpers.ts";
import { scrollWebNodeIntoView } from "./keyboard.ts";
import { FEED_STREAM_MAX_WIDTH, type FeedPalette } from "./styles.ts";

export type FeedSendResult = FeedComposerSendResult;

export interface FeedComposerProps {
  channel: FeedChannel | null;
  palette: FeedPalette;
  onSend(text: string): Promise<FeedSendResult>;
  onOpenAgent(agentId: string): void;
  onFocusInput?(): void;
  onSent?(result: FeedSendResult): void;
}

function ComposerNoticeBanner({
  notice,
  palette,
  onOpenAgent,
}: {
  notice: ComposerNoticeState;
  palette: FeedPalette;
  onOpenAgent(agentId: string): void;
}) {
  const bg =
    notice.tone === "error"
      ? palette.dangerSoftBg
      : notice.tone === "success"
        ? palette.successSoftBg
        : palette.warningSoftBg;
  const fg =
    notice.tone === "error"
      ? palette.danger
      : notice.tone === "success"
        ? palette.success
        : palette.warning;
  const icon = notice.tone === "success" ? "Check" : "AlertCircle";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        backgroundColor: bg,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 8,
      }}
    >
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name={icon} size={14} color={fg} />
        <Text style={{ flex: 1, fontSize: 12, color: fg }}>{notice.message}</Text>
      </View>
      {notice.actionAgentId ? (
        <Pressable
          onPress={() => onOpenAgent(notice.actionAgentId!)}
          style={({ pressed }) => ({
            backgroundColor: palette.accentSoftBg,
            borderWidth: 1,
            borderColor: palette.accentBorder,
            borderRadius: 8,
            paddingHorizontal: 8,
            paddingVertical: 4,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 11, fontWeight: "600", color: palette.accentBg }}>
            {notice.actionLabel || "打开会话 ↗"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Quick message composer bound to the currently selected feed channel. */
export function FeedComposer({
  channel,
  palette,
  onSend,
  onOpenAgent,
  onFocusInput,
  onSent,
}: FeedComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<ComposerNoticeState | null>(null);
  const composerRef = useRef<View | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNotice(null);
  }, [channel?.kind, channel?.id]);

  useEffect(() => () => {
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
  }, []);

  if (!channel) return null;

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !sending;

  const handleSubmit = async () => {
    if (!canSend) return;
    setSending(true);
    setNotice(null);
    try {
      const result = await onSend(trimmed);
      const nextNotice = resolveComposerNotice(result);
      if (result.ok) {
        setText("");
        setNotice(nextNotice);
        onSent?.(result);
      } else {
        setNotice(nextNotice);
      }
    } catch (error) {
      setNotice({
        message: error instanceof Error ? error.message : "发送请求异常。",
        tone: "error",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <View
      ref={composerRef}
      style={{
        flexShrink: 0,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        backgroundColor: palette.railBg,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <View style={{ width: "100%", maxWidth: FEED_STREAM_MAX_WIDTH, alignSelf: "center" }}>
        {notice ? (
          <ComposerNoticeBanner
            notice={notice}
            palette={palette}
            onOpenAgent={onOpenAgent}
          />
        ) : null}
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-end",
            gap: 8,
            backgroundColor: palette.inputBg,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            editable={!sending}
            onFocus={() => {
              onFocusInput?.();
              if (Platform.OS === "web") {
                if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
                focusTimerRef.current = setTimeout(() => {
                  scrollWebNodeIntoView(composerRef.current, "nearest");
                }, 100);
              }
            }}
            onKeyPress={(event) => {
              if (Platform.OS !== "web" || isImeComposing(event)) return;
              const native = event.nativeEvent as { key?: string; shiftKey?: boolean };
              if (native.key === "Enter" && !native.shiftKey) {
                (event as { preventDefault?: () => void }).preventDefault?.();
                void handleSubmit();
              }
            }}
            placeholder={
              channel.activeAgentId
                ? `向 ${channel.name} 发送消息…`
                : `向 ${channel.name} 发送消息（将自动创建新会话）…`
            }
            placeholderTextColor={palette.fgMuted}
            style={{
              flex: 1,
              fontSize: 13.5,
              lineHeight: 19,
              color: palette.fg,
              maxHeight: 110,
              paddingVertical: 2,
            }}
          />
          <Pressable
            disabled={!canSend}
            onPress={() => void handleSubmit()}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              backgroundColor: canSend ? palette.accentBg : palette.pillMutedBg,
              borderRadius: 9,
              paddingHorizontal: 12,
              paddingVertical: 7,
              opacity: pressed && canSend ? 0.85 : 1,
            })}
          >
            <Icon name="Send" size={13} color={canSend ? palette.accentFg : palette.fgMuted} />
            <Text
              style={{
                fontSize: 12.5,
                fontWeight: "600",
                color: canSend ? palette.accentFg : palette.fgMuted,
              }}
            >
              {sending ? "发送中" : "发送"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
