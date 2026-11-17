import type { PluginTheme } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { botSettings } from "../../../shared/bot";
import type { TaskCard as TaskCardData, TaskCardWorkflowStage } from "../../../shared/task-card";
import { useT } from "../../i18n";
import { StatusBadge, type BadgeVariant } from "../../panel/controls";
import { ui } from "../../typography";

type Colors = PluginTheme["colors"];

const TASK_STATUS_VARIANT: Record<TaskCardData["status"], BadgeVariant> = {
  issued: "muted",
  running: "muted",
  done: "success",
  blocked: "error",
  retired: "warning",
};

const STAGE_STATUS_VARIANT: Record<TaskCardWorkflowStage["status"], BadgeVariant> = {
  pending: "muted",
  running: "warning",
  done: "success",
  failed: "error",
  skipped: "muted",
};

const STAGE_STATUS_ICON: Record<TaskCardWorkflowStage["status"], string> = {
  pending: "Circle",
  running: "Clock",
  done: "CheckCircle2",
  failed: "AlertCircle",
  skipped: "MinusCircle",
};

/**
 * Renders a Task Pyramid group card and, when backed by a Route 3 Workflow DAG,
 * displays real-time stage status, bot assignment, resolved engine badge, dependencies, and retries.
 */
export function TaskCardView({ colors, card }: { colors: Colors; card: TaskCardData }) {
  const { t } = useT();
  const settings = useSettings(botSettings);
  const bots = settings.status === "ready" ? settings.values.bots : [];
  const botNameById = new Map(bots.map((b) => [b.id, b.name]));

  const statusVariant = TASK_STATUS_VARIANT[card.status];
  const taskStatusLabel =
    card.status === "done"
      ? t("workflows.statusDone")
      : card.status === "running"
        ? t("workflows.statusRunning")
        : card.status === "blocked"
          ? t("workflows.statusFailed")
          : card.status;

  if (!card.workflow) {
    return (
      <View style={{ marginVertical: 12, padding: 12, borderRadius: 8, borderWidth: 1, backgroundColor: colors.surface1, borderColor: colors.border, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
          <Icon name="ListChecks" size={16} color={colors.foregroundMuted} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: ui(14), fontWeight: "600", lineHeight: 22 }}>
            {card.title}
          </Text>
          <StatusBadge colors={colors} label={taskStatusLabel} variant={statusVariant} />
        </View>
        <Text style={{ color: colors.foregroundMuted, fontSize: ui(13), lineHeight: 18 }}>
          {card.summary}
        </Text>
      </View>
    );
  }

  const wf = card.workflow;
  const doneCount = wf.stages.filter((s) => s.status === "done").length;
  const stageNameById = new Map(wf.stages.map((s) => [s.id, s.name]));

  return (
    <View style={{ marginVertical: 12, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: colors.surface1, borderColor: colors.border, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
        <Icon name="GitBranch" size={16} color={colors.accent} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: ui(14), fontWeight: "600", lineHeight: 22 }}>
          {wf.workflowName}
        </Text>
        <Text style={{ color: colors.foregroundMuted, fontSize: ui(12) }}>
          {t("workflows.stageProgress", { done: doneCount, total: wf.stages.length })}
        </Text>
        <StatusBadge colors={colors} label={taskStatusLabel} variant={statusVariant} />
      </View>

      <View style={{ gap: 6 }}>
        {wf.stages.map((stage) => {
          const botLabel = botNameById.get(stage.botId) ?? stage.botId;
          const engineLabel = stage.engine === "native" ? t("workflows.engineNative") : t("workflows.enginePaseoBot");
          const stageLabel =
            stage.status === "done"
              ? t("workflows.statusDone")
              : stage.status === "running"
                ? t("workflows.statusRunning")
                : stage.status === "failed"
                  ? t("workflows.statusFailed")
                  : stage.status === "skipped"
                    ? t("workflows.statusSkipped")
                    : t("workflows.statusPending");
          const iconColor =
            stage.status === "done"
              ? colors.statusSuccess
              : stage.status === "failed"
                ? colors.statusDanger
                : stage.status === "running"
                  ? colors.accent
                  : colors.foregroundMuted;
          const depsText = stage.dependsOn.length > 0
            ? stage.dependsOn.map((id) => stageNameById.get(id) ?? id).join(", ")
            : null;

          return (
            <View
              key={stage.id}
              style={{
                padding: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface0,
                gap: 4,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <Icon name={STAGE_STATUS_ICON[stage.status]} size={14} color={iconColor} />
                <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: ui(13), fontWeight: "500" }}>
                  {stage.name}
                </Text>
                <StatusBadge colors={colors} label={engineLabel} variant="muted" />
                {stage.retries > 0 ? (
                  <StatusBadge
                    colors={colors}
                    label={t("workflows.retryBadge", { count: stage.retries, max: stage.maxRetries })}
                    variant="warning"
                  />
                ) : null}
                <StatusBadge colors={colors} label={stageLabel} variant={STAGE_STATUS_VARIANT[stage.status]} />
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 20 }}>
                <Text style={{ color: colors.foregroundMuted, fontSize: ui(12) }}>
                  {botLabel}
                </Text>
                {depsText ? (
                  <Text style={{ color: colors.foregroundMuted, fontSize: ui(12) }}>
                    · {t("workflows.dependsOnLabel", { deps: depsText })}
                  </Text>
                ) : null}
              </View>

              {stage.error ? (
                <Text numberOfLines={2} style={{ color: colors.statusDanger, fontSize: ui(12), paddingLeft: 20 }}>
                  {stage.error}
                </Text>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}
