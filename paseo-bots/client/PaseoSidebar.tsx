import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

/** Every Bots view belongs to the native Paseo Bots sidebar entry. */
export function PaseoBotsSidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const isBotsActive =
    (currentScreen?.screenId === "bots" || currentScreen?.screenId.startsWith("bot-")) &&
    currentScreen?.screenId !== "bot-workflows" &&
    currentScreen?.screenId !== "workflows";
  return <SidebarRow icon="Bot" label="Bots" active={isBotsActive} onPress={() => openScreen({ screenId: "bots" })} />;
}

/** Dedicated second sidebar entry for multi-agent DAG Workflows. */
export function PaseoWorkflowsSidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const isWorkflowsActive = currentScreen?.screenId === "workflows" || currentScreen?.screenId === "bot-workflows";
  return <SidebarRow icon="GitBranch" label="Workflows" active={isWorkflowsActive} onPress={() => openScreen({ screenId: "workflows" })} />;
}
