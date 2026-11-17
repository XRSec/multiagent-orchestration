/**
 * Purpose: Live visual DAG stage pipeline preview with parallel layers and topological connectors.
 * Context: Rendered inside WorkflowEditor and WorkflowsScreen.
 * Usage: <WorkflowPipelinePreview colors={colors} stages={stages} bots={bots} activeStageId={activeId} onSelectStage={...} />
 * Prerequisites: validateWorkflowDAG in shared/workflows.ts.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Bot } from "../../shared/bot";
import { validateWorkflowDAG, type WorkflowStageDefinition } from "../../shared/workflows";
import { Avatar } from "../Avatar";
import { useT } from "../i18n";
import { StatusBadge } from "../panel/controls";
import { ui } from "../typography";

type Colors = PluginTheme["colors"];

export interface WorkflowPipelinePreviewProps {
  colors: Colors;
  stages: readonly WorkflowStageDefinition[];
  bots?: readonly Bot[];
  activeStageId?: string | null;
  onSelectStage?(stageId: string): void;
}

export function WorkflowPipelinePreview({
  colors,
  stages,
  bots = [],
  activeStageId,
  onSelectStage,
}: WorkflowPipelinePreviewProps) {
  const { t } = useT();
  const botMap = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);
  const stageMap = useMemo(() => new Map(stages.map((s) => [s.id, s])), [stages]);

  const dagCheck = useMemo(() => validateWorkflowDAG(stages), [stages]);

  if (!dagCheck.valid) {
    return (
      <View
        accessibilityRole="alert"
        style={{
          padding: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.statusDanger,
          backgroundColor: colors.surface1,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="AlertCircle" size={16} color={colors.statusDanger} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.statusDanger }}>
            {t("workflows.dagInvalidTitle")}
          </Text>
          <Text style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
            {dagCheck.error}
          </Text>
        </View>
      </View>
    );
  }

  const layers = dagCheck.layers ?? [];

  return (
    <View
      style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface0,
        padding: 12,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Icon name="GitBranch" size={14} color={colors.accent} />
          <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foreground }}>
            {t("workflows.pipelinePreviewTitle")}
          </Text>
        </View>
        <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>
          {t("workflows.pipelineStats", { layers: layers.length, stages: stages.length })}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingVertical: 4,
          paddingHorizontal: 2,
        }}
      >
        {layers.map((layerStageIds, layerIdx) => {
          const isParallel = layerStageIds.length > 1;

          return (
            <View key={`layer-${layerIdx}`} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {layerIdx > 0 ? (
                <View style={{ alignItems: "center", justifyContent: "center", width: 24 }}>
                  <Text
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={{ fontSize: ui(16), fontWeight: "700", color: colors.foregroundMuted }}
                  >
                    →
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  gap: 8,
                  padding: isParallel ? 6 : 0,
                  borderRadius: isParallel ? 8 : 0,
                  borderWidth: isParallel ? 1 : 0,
                  borderColor: isParallel ? colors.border : "transparent",
                  backgroundColor: isParallel ? colors.surface1 : "transparent",
                }}
              >
                {isParallel ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4 }}>
                    <Icon name="Shuffle" size={11} color={colors.foregroundMuted} />
                    <Text style={{ fontSize: ui(10), fontWeight: "600", color: colors.foregroundMuted, textTransform: "uppercase" }}>
                      {t("workflows.parallelWave", { count: layerStageIds.length })}
                    </Text>
                  </View>
                ) : null}

                {layerStageIds.map((stageId) => {
                  const stage = stageMap.get(stageId);
                  if (!stage) return null;

                  const assignedBot = botMap.get(stage.botId);
                  const isSelected = stage.id === activeStageId;
                  const depsCount = stage.dependsOn.length;

                  return (
                    <Pressable
                      key={stage.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Stage ${stage.name || stage.id}`}
                      onPress={() => onSelectStage?.(stage.id)}
                      style={{
                        minWidth: 150,
                        maxWidth: 220,
                        padding: 8,
                        borderRadius: 8,
                        borderWidth: 1.5,
                        borderColor: isSelected ? colors.accent : colors.border,
                        backgroundColor: isSelected ? colors.surface2 : colors.surface1,
                        gap: 4,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: ui(12), fontWeight: "600", color: isSelected ? colors.accent : colors.foreground }}>
                          {stage.name || stage.id}
                        </Text>
                        <StatusBadge
                          colors={colors}
                          label={stage.engine === "auto" ? "auto" : stage.engine === "native" ? "native" : "bot"}
                          variant="muted"
                        />
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        {assignedBot ? (
                          <Avatar size={16} avatar={assignedBot.avatar} />
                        ) : (
                          <Icon name="Bot" size={14} color={colors.foregroundMuted} />
                        )}
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: ui(11), color: colors.foregroundMuted }}>
                          {assignedBot?.name ?? stage.botId ?? t("workflows.unassignedBot")}
                        </Text>
                      </View>

                      {depsCount > 0 ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                          <Icon name="CornerDownRight" size={10} color={colors.foregroundMuted} />
                          <Text style={{ fontSize: ui(10), color: colors.foregroundMuted }}>
                            {t("workflows.dependsCount", { count: depsCount })}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
