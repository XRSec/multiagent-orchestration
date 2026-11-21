/**
 * Purpose: Single clean primary Paseo sidebar entry for Feed (助理) with live activity badge.
 * Context: Rendered inside Paseo's left sidebar via client.addSidebarHeaderItem.
 * Usage: Registered in index.client.tsx under id "feeds".
 */

import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc, useSubscription } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { feedChannelsRpc, feedUpdatesSub, type FeedChannel } from "../shared/protocol.ts";
import { summarizeSidebarActivity, type SidebarActivitySummary } from "./feed-helpers.ts";

const SIDEBAR_POLL_MS = 30_000;

function SidebarActivityBadge({
  summary,
  successColor,
  mutedColor,
  badgeBg,
}: {
  summary: SidebarActivitySummary;
  successColor: string;
  mutedColor: string;
  badgeBg: string;
}) {
  if (!summary.hasActive && summary.totalEntryCount <= 0) return null;
  const countLabel =
    summary.totalEntryCount > 999 ? "999+" : String(summary.totalEntryCount);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      {summary.hasActive ? (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: successColor,
          }}
        />
      ) : null}
      {summary.totalEntryCount > 0 ? (
        <View
          style={{
            backgroundColor: badgeBg,
            borderRadius: 9,
            paddingHorizontal: 5,
            paddingVertical: 1,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: "600", color: mutedColor }}>
            {countLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** Renders a single clean "Feed (助理)" sidebar row opening the unified FeedScreen. */
export function FeedSidebar({
  theme,
  host,
  currentScreen,
  openScreen,
}: PluginSidebarItemProps) {
  const fetchChannels = useRpc(feedChannelsRpc);
  const fetchChannelsRef = useRef(fetchChannels);
  fetchChannelsRef.current = fetchChannels;

  const [channels, setChannels] = useState<FeedChannel[]>([]);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchChannelsRef.current({ includeArchived: false });
      if (mountedRef.current) setChannels(res.channels);
    } catch {
      // Sidebar stays resilient when host daemon is momentarily unavailable.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), SIDEBAR_POLL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [host.id, refresh]);

  const emptySubInput = useMemo(() => ({}), []);
  useSubscription(feedUpdatesSub, emptySubInput, () => {
    void refresh();
  });

  const summary = useMemo(() => summarizeSidebarActivity(channels), [channels]);
  const isFeedActive = currentScreen?.screenId === "feed";

  return (
    <SidebarRow
      id="feed-assistant"
      icon="Sparkles"
      label="Feed (助理)"
      active={isFeedActive}
      trailing={
        <SidebarActivityBadge
          summary={summary}
          successColor={theme.colors.statusSuccess}
          mutedColor={theme.colors.foregroundMuted}
          badgeBg={theme.colors.surface2}
        />
      }
      onPress={() => openScreen({ screenId: "feed" })}
    />
  );
}
