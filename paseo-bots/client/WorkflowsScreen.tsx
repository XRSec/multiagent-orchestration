/**
 * Purpose: Dedicated top-level sidebar screen for multi-agent DAG workflows and pipelines.
 * Context: Accessible via dedicated Workflows sidebar item and command palette.
 * Usage: <WorkflowsScreen {...props} openScreen={...} />
 * Prerequisites: Paseo client runtime, WorkflowListEditor.
 */

import type { PluginOpenScreenInput, PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { WorkflowDefinition } from "../shared/workflows";
import { AvatarTheme } from "./Avatar";
import { useT } from "./i18n";
import { PAGE_STYLE, PageTitle } from "./library/parts";
import { nativeTokens } from "./native";
import { StatusBadge } from "./panel/controls";
import { WorkflowListEditor } from "./settings/WorkflowEditor";
import { ui } from "./typography";
import { MenuProvider } from "./ui/Menu";
import { useBotSettings } from "./useBotSettings";

export function WorkflowsScreen(props: PluginScreenProps & { openScreen(input: PluginOpenScreenInput): void }) {
  return (
    <MenuProvider colors={props.theme.colors} compact={props.layout.compact}>
      <AvatarTheme dark={nativeTokens(props.theme.colors).dark}>
        <WorkflowsContent {...props} />
      </AvatarTheme>
    </MenuProvider>
  );
}

function WorkflowsContent({ theme, host, openScreen, params }: PluginScreenProps & { openScreen(input: PluginOpenScreenInput): void }) {
  const colors = theme.colors;
  const { t } = useT();
  const { settings, commit } = useBotSettings();

  const [selectedScope, setSelectedScope] = useState<string>("global");

  if (settings.status !== "ready") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0, padding: 24, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: ui(14), color: colors.foregroundMuted }}>
          {settings.status === "loading" ? t("workflows.loading") : t("workflows.loadError")}
        </Text>
      </View>
    );
  }

  const liveBots = settings.values.bots.filter((b) => !b.archived);
  const groups = settings.values.groups ?? [];
  const globalWorkflows = settings.values.workflows ?? [];

  const activeGroup = groups.find((g) => g.id === selectedScope) ?? null;
  const currentWorkflows: readonly WorkflowDefinition[] = activeGroup
    ? (activeGroup.workflows ?? [])
    : globalWorkflows;

  const handleSaveWorkflows = (updatedWorkflows: WorkflowDefinition[]) => {
    if (activeGroup) {
      void commit((current) => ({
        ...current,
        groups: (current.groups ?? []).map((g) =>
          g.id === activeGroup.id ? { ...g, workflows: updatedWorkflows, updatedAt: new Date().toISOString() } : g,
        ),
      }));
    } else {
      void commit((current) => ({
        ...current,
        workflows: updatedWorkflows,
      }));
    }
  };

  const totalWorkflowCount = globalWorkflows.length + groups.reduce((acc, g) => acc + (g.workflows?.length ?? 0), 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={PAGE_STYLE}>
      <PageTitle colors={colors} title={t("workflows.sidebarTitle")} />

      {/* Scope Selector Section */}
      <SettingsSection
        title={t("workflows.scopeSelectorTitle")}
        info={t("workflows.scopeSelectorInfo")}
      >
        <SettingsCard>
          <SettingsRow
            label={t("workflows.activeScopeLabel")}
            hint={activeGroup ? t("workflows.teamScopeHint", { team: activeGroup.name }) : t("workflows.globalScopeHint")}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <StatusBadge
                colors={colors}
                label={t("workflows.totalCountBadge", { count: totalWorkflowCount })}
                variant="muted"
              />
            </View>
          </SettingsRow>

          <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
            <Text style={{ fontSize: ui(12), fontWeight: "500", color: colors.foregroundMuted }}>
              {t("workflows.selectScope")}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedScope === "global" }}
                onPress={() => setSelectedScope("global")}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: selectedScope === "global" ? colors.accent : colors.border,
                  backgroundColor: selectedScope === "global" ? colors.surface2 : colors.surface1,
                }}
              >
                <Icon name="Globe" size={14} color={selectedScope === "global" ? colors.accent : colors.foregroundMuted} />
                <Text style={{ fontSize: ui(13), fontWeight: "500", color: selectedScope === "global" ? colors.foreground : colors.foregroundMuted }}>
                  {t("workflows.globalTemplates")} ({globalWorkflows.length})
                </Text>
              </Pressable>

              {groups.map((group) => {
                const count = group.workflows?.length ?? 0;
                const isSelected = selectedScope === group.id;
                return (
                  <Pressable
                    key={group.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedScope(group.id)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.accent : colors.border,
                      backgroundColor: isSelected ? colors.surface2 : colors.surface1,
                    }}
                  >
                    <Icon name="Users" size={14} color={isSelected ? colors.accent : colors.foregroundMuted} />
                    <Text style={{ fontSize: ui(13), fontWeight: "500", color: isSelected ? colors.foreground : colors.foregroundMuted }}>
                      {group.name} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SettingsCard>
      </SettingsSection>

      {/* Spacious Workflow Editor with live DAG preview and presets */}
      <WorkflowListEditor
        key={selectedScope}
        colors={colors}
        title={activeGroup ? t("workflows.teamTitleScoped", { name: activeGroup.name }) : t("workflows.globalTitle")}
        info={activeGroup ? t("workflows.teamInfoScoped", { name: activeGroup.name }) : t("workflows.globalInfo")}
        workflows={currentWorkflows}
        bots={liveBots}
        onChange={handleSaveWorkflows}
      />
    </ScrollView>
  );
}
