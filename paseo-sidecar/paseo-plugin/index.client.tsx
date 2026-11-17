/**
 * Purpose: Paseo client plugin entry registering the Sidecar sidebar item and control-plane screen.
 * Context: Executed inside connected Paseo apps (desktop/mobile/web) with @getpaseo/plugin/client.
 * Usage: Loaded automatically by Paseo from paseo-plugin/index.client.tsx.
 * Prerequisites: @getpaseo/plugin/client and ./client/screen.
 */
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SCREEN_ID, SidecarScreen, SidecarSidebarItem } from "./client/screen";

export default function contribute(client: PluginClientContext) {
  const screen = client.addScreen({
    id: SCREEN_ID,
    title: "Sidecar",
    Component: SidecarScreen,
  });
  const sidebar = client.addSidebarHeaderItem({
    id: "sidecar",
    title: "Sidecar",
    Component: SidecarSidebarItem,
  });

  return () => {
    sidebar();
    screen();
  };
}
