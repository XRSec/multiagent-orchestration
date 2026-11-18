/**
 * Purpose: Task Card stream renderer with horizontal DAG pipeline flow and stage drilldown.
 * Context: Rendered in chat timeline when task records or Route 3 workflow updates arrive.
 * Usage: <TaskCardView colors={theme.colors} card={item.data} onOpenChat={...} />
 * Prerequisites: TaskCard schema, TaskStageModal.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { botSettings } from "../../../shared/bot";
import { workflowResumeRpc } from "../../../shared/rpc";
import type { TaskCard as TaskCardData, TaskCardWorkflowStage } from "../../../shared/task-card";
import { Avatar } from "../../Avatar";
import { useT } from "../../i18n";
import { useReduceMotion } from "../../motion";
import { nativeTokens } from "../../native";
import { StatusBadge, type BadgeVariant } from "../../panel/controls";
import { ui } from "../../typography";
import { formatElapsedDuration, TaskStageModal } from "./TaskStageModal";

type Colors = PluginTheme["colors"];

export const MAX_ACTIVE_DURATION_MS = 30 * 60 * 1000;

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

export interface TaskCardViewProps {
  colors: Colors;
  card: TaskCardData;
  onOpenChat?(chatId: string, botId?: string): void;
  onResume?(taskId: string): void | Promise<void>;
}

/**
 * Renders a Task Pyramid group card and, when backed by a Route 3 Workflow DAG,
 * displays real-time stage status, bot assignment, resolved engine badge, dependencies, and retries.
 */
export function TaskCardView({ colors, card, onOpenChat, onResume }: TaskCardViewProps) {
  const { t } = useT();
  const settings = useSettings(botSettings);
  const resumeRpc = useRpc(workflowResumeRpc);
  const toast = useToast();
  const reduceMotion = useReduceMotion();
  const bots = settings.status === "ready" ? settings.values.bots : [];
  const botMap = useMemo(() => new Map(bots.map((b) => [b.id, b])), [bots]);

  const [selectedStage, setSelectedStage] = useState<TaskCardWorkflowStage | null>(null);
  const [resuming, setResuming] = useState(false);
  const [resumedCard, setResumedCard] = useState<TaskCardData | null>(null);

  const activeCard = resumedCard && resumedCard.version > card.version ? resumedCard : card;
  const wf = activeCard.workflow;
  const canResume = activeCard.status === "blocked" || wf?.status === "failed";

  const handleResume = async () => {
    if (resuming) return;
    setResuming(true);
    try {
      if (onResume) {
        await onResume(activeCard.taskId);
      } else {
        const res = await resumeRpc({ taskId: activeCard.taskId });
        if (res.ok) {
          if (res.card) setResumedCard(res.card);
          toast.show(t("workflows.resumeSuccess"), { variant: "success" });
        } else {
          toast.error(res.error ?? t("workflows.resumeFailed"));
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("workflows.resumeFailed"));
    } finally {
      setResuming(false);
    }
  };
  const isRunning = activeCard.status === "running" && (wf?.status === "running" || wf?.stages.some((s) => s.status === "running"));
  const startedMs = wf?.startedAt ? Date.parse(wf.startedAt) : NaN;
  const [now, setNow] = useState(() => Date.now());
  const elapsedMs = Number.isFinite(startedMs) ? Math.max(0, now - startedMs) : 0;
  const isStalled = Boolean(isRunning && !wf?.completedAt && Number.isFinite(startedMs) && elapsedMs >= MAX_ACTIVE_DURATION_MS);
  const shouldTick = isRunning && !isStalled;

  useEffect(() => {
    if (!shouldTick) return;
    const timer = setInterval(() => {
      const currentNow = Date.now();
      if (Number.isFinite(startedMs) && currentNow - startedMs >= MAX_ACTIVE_DURATION_MS) {
        clearInterval(timer);
      }
      setNow(currentNow);
    }, 1000);
    return () => clearInterval(timer);
  }, [shouldTick, startedMs]);

  const statusVariant = TASK_STATUS_VARIANT[activeCard.status];
  const taskStatusLabel =
    activeCard.status === "done"
      ? t("workflows.statusDone")
      : activeCard.status === "running"
        ? t("workflows.statusRunning")
        : activeCard.status === "blocked"
          ? t("workflows.statusFailed")
          : activeCard.status;

  if (!wf) {
    return (
      <View style={{ marginVertical: 12, padding: 12, borderRadius: 8, borderWidth: 1, backgroundColor: colors.surface1, borderColor: colors.border, gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}>
          <Icon name="ListChecks" size={16} color={colors.foregroundMuted} />
          <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: ui(14), fontWeight: "600", lineHeight: 22 }}>
            {activeCard.title}
          </Text>
          <StatusBadge colors={colors} label={taskStatusLabel} variant={statusVariant} />
        </View>
        <Text style={{ color: colors.foregroundMuted, fontSize: ui(13), lineHeight: 18 }}>
          {activeCard.summary}
        </Text>
      </View>
    );
  }

  const doneCount = wf.stages.filter((s) => s.status === "done").length;
  const totalStages = wf.stages.length;
  const totalDuration = formatElapsedDuration(wf.startedAt, wf.completedAt);

  return (
    <View style={{ marginVertical: 12, padding: 12, borderRadius: 10, borderWidth: 1, backgroundColor: colors.surface1, borderColor: colors.border, gap: 10 }}>
      {/* Workflow Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24, flexWrap: "wrap" }}>
        <Icon name="GitBranch" size={16} color={colors.accent} />
        <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: ui(14), fontWeight: "600", lineHeight: 22 }}>
          {wf.workflowName}
        </Text>

        {totalDuration ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.surface2 }}>
            <Icon name="Clock" size={11} color={colors.foregroundMuted} />
            <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>
              {totalDuration}
            </Text>
          </View>
        ) : null}

        {isStalled ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12, backgroundColor: colors.surface2 }}>
            <Icon name="AlertTriangle" size={11} color={colors.statusWarning} />
            <Text style={{ fontSize: ui(11), color: colors.statusWarning, fontWeight: "600" }}>
              Stalled
            </Text>
          </View>
        ) : null}

        <Text style={{ color: colors.foregroundMuted, fontSize: ui(12), fontVariant: ["tabular-nums"] }}>
          {t("workflows.stageProgress", { done: doneCount, total: totalStages })}
        </Text>
        <StatusBadge colors={colors} label={taskStatusLabel} variant={statusVariant} />
        {canResume ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("workflows.resumeWorkflow")}
            disabled={resuming}
            onPress={() => void handleResume()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.accent,
              backgroundColor: colors.surface2,
              opacity: resuming ? 0.6 : 1,
            }}
          >
            <Icon name="RotateCcw" size={12} color={colors.accent} />
            <Text style={{ fontSize: ui(11), fontWeight: "600", color: colors.accent }}>
              {resuming ? t("workflows.resumingWorkflow") : t("workflows.resumeWorkflow")}
            </Text>
          </Pressable>
        ) : null}
      </View>

      {/* Horizontal Pipeline Stream Flow */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: 4,
          paddingHorizontal: 2,
        }}
      >
        {wf.stages.map((stage, idx) => {
          const assignedBot = botMap.get(stage.botId);
          const botLabel = assignedBot?.name ?? stage.botId;
          const engineLabel = stage.engine === "native" ? t("workflows.engineNative") : t("workflows.enginePaseoBot");
          const stageRunning = stage.status === "running";
          const isFailed = stage.status === "failed";
          const isDone = stage.status === "done";
          const stageDuration = formatElapsedDuration(stage.startedAt, stage.completedAt);

          const tokens = nativeTokens(colors);
          const iconColor =
            isDone
              ? colors.statusSuccess
              : isFailed
                ? colors.statusDanger
                : stageRunning
                  ? tokens.brandClay
                  : colors.foregroundMuted;

          const borderColor = stageRunning
            ? tokens.brandClay
            : isFailed
              ? colors.statusDanger
              : colors.border;

          return (
            <View key={stage.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {idx > 0 ? (
                <Text accessibilityElementsHidden importantForAccessibility="no" style={{ fontSize: ui(15), fontWeight: "bold", color: colors.foregroundMuted }}>
                  →
                </Text>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Stage ${stage.name}: ${stage.status}`}
                onPress={() => setSelectedStage(stage)}
                style={{
                  minWidth: 160,
                  maxWidth: 240,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: stageRunning || isFailed ? 1.5 : 1,
                  borderColor,
                  backgroundColor: stageRunning ? colors.surface2 : colors.surface0,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Icon name={STAGE_STATUS_ICON[stage.status]} size={14} color={iconColor} />
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.foreground, fontSize: ui(13), fontWeight: "600" }}>
                    {stage.name}
                  </Text>
                  {stageRunning && !isStalled && !reduceMotion ? (
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.brandClay }} />
                  ) : null}
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  {assignedBot?.avatar ? (
                    <Avatar size={16} avatar={assignedBot.avatar} />
                  ) : (
                    <Icon name="Bot" size={13} color={colors.foregroundMuted} />
                  )}
                  <Text numberOfLines={1} style={{ flex: 1, color: colors.foregroundMuted, fontSize: ui(11) }}>
                    {botLabel}
                  </Text>
                  <StatusBadge colors={colors} label={engineLabel} variant="muted" />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                  {stageDuration ? (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <Icon name="Clock" size={10} color={colors.foregroundMuted} />
                      <Text style={{ color: colors.foregroundMuted, fontSize: ui(10), fontVariant: ["tabular-nums"] }}>
                        {stageDuration}
                      </Text>
                    </View>
                  ) : (
                    <View />
                  )}

                  {stage.retries > 0 ? (
                    <StatusBadge
                      colors={colors}
                      label={t("workflows.retryBadge", { count: stage.retries, max: stage.maxRetries })}
                      variant="warning"
                    />
                  ) : null}
                </View>

                {stage.error ? (
                  <Text numberOfLines={1} style={{ color: colors.statusDanger, fontSize: ui(10), fontFamily: "monospace" }}>
                    {stage.error}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {/* Stage Inspection Modal */}
      {selectedStage ? (
        <TaskStageModal
          open={!!selectedStage}
          onClose={() => setSelectedStage(null)}
          stage={selectedStage}
          workflowName={wf.workflowName}
          botName={botMap.get(selectedStage.botId)?.name}
          botAvatar={botMap.get(selectedStage.botId)?.avatar}
          colors={colors}
          allStages={wf.stages}
          onOpenChat={onOpenChat}
          onResume={canResume ? () => handleResume() : undefined}
          resuming={resuming}
        />
      ) : null}
    </View>
  );
}
