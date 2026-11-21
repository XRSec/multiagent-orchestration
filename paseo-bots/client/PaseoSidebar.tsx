import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

/** Every Bots view belongs to the native Paseo Bots sidebar entry. */
export function PaseoBotsSidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const isBotsActive =
    (currentScreen?.screenId === "bots" || currentScreen?.screenId.startsWith("bot-")) &&
    currentScreen?.screenId !== "bot-workflows" &&
    currentScreen?.screenId !== "workflows" &&
    currentScreen?.screenId !== "bot-teams" &&
    currentScreen?.screenId !== "teams";
  return <SidebarRow icon="Bot" label="Bots" active={isBotsActive} onPress={() => openScreen({ screenId: "bots" })} />;
}

/** Dedicated sidebar pillar for Team map and squad coordination. */
export function PaseoTeamsSidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const isTeamsActive = currentScreen?.screenId === "teams" || currentScreen?.screenId === "bot-teams";
  return <SidebarRow icon="Users" label="Team" active={isTeamsActive} onPress={() => openScreen({ screenId: "teams" })} />;
}

/** Dedicated sidebar pillar for multi-agent DAG Workflows. */
export function PaseoWorkflowsSidebar({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const isWorkflowsActive = currentScreen?.screenId === "workflows" || currentScreen?.screenId === "bot-workflows";
  return <SidebarRow icon="GitBranch" label="Workflow" active={isWorkflowsActive} onPress={() => openScreen({ screenId: "workflows" })} />;
}
