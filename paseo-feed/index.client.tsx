/**
 * Purpose: Client plugin entrypoint registering sidebar, screen, and Command Center items.
 * Context: Loaded by Paseo host app for @xrsec/paseo-feed client contributions.
 * Usage: Export default contribute(client) returning cleanup disposer.
 */

import type { PluginClientContext } from "@getpaseo/plugin/client";
import { FeedScreen } from "./client/FeedScreen.tsx";
import { FeedSidebar } from "./client/FeedSidebar.tsx";

export default function contribute(client: PluginClientContext) {
  const removeSidebar = client.addSidebarHeaderItem({
    id: "feeds",
    title: "Feed (助理)",
    Component: FeedSidebar,
  });

  const removeScreen = client.addScreen({
    id: "feed",
    title: (params) => params.title || "Feed (助理)",
    Component: FeedScreen,
  });

  const removeCommand = client.addCommandCenterItem({
    id: "open-feeds",
    title: "Open Feed (助理)",
    icon: "Sparkles",
    keywords: ["feed", "dm", "assistant", "chat", "助理", "消息流", "私聊", "群聊"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "feed" });
    },
  });

  return () => {
    removeSidebar();
    removeScreen();
    removeCommand();
  };
}
