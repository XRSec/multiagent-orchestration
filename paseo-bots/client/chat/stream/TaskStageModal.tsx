/**
 * Purpose: Detailed inspection modal for a workflow execution stage.
 * Context: Opened when clicking any stage card in TaskCardView.
 * Usage: <TaskStageModal open={!!selectedStage} stage={selectedStage} ... />
 * Prerequisites: Paseo Modal, TaskCardWorkflowStage.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { copyText, Modal, useToast } from "@getpaseo/plugin/client/react-native";
import * as UI from "@getpaseo/plugin/client/ui";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { BotAvatar } from "../../../shared/bot";
import { segmentProtocolBlocks } from "../../../shared/protocol-cards";
import type { TaskCardWorkflowStage } from "../../../shared/task-card";
import { formatElapsedDuration } from "../../../shared/workflows";
import { Avatar } from "../../Avatar";
import { useT } from "../../i18n";
import { nativeTokens } from "../../native";
import { Button, StatusBadge, type BadgeVariant } from "../../panel/controls";
import { ui } from "../../typography";
import { ProtocolCard } from "./ProtocolCard";

type Colors = PluginTheme["colors"];

const Icon = UI.Icon;
let PaseoMarkdown: any = null;
try {
  PaseoMarkdown = (UI as any).Markdown;
} catch {
  PaseoMarkdown = null;
}

/** Markdown renderer that falls back to text if PaseoMarkdown is unmounted/mocked. */
export function MarkdownText({ colors, text }: { colors: Colors; text: string }) {
  if (typeof PaseoMarkdown === "function" || (typeof PaseoMarkdown === "object" && PaseoMarkdown !== null)) {
    const Comp = PaseoMarkdown;
    return <Comp>{text}</Comp>;
  }
  return (
    <Text selectable style={{ fontSize: ui(12), color: colors.foreground, lineHeight: 18 }}>
      {text}
    </Text>
  );
}

export interface TaskStageModalProps {
  open: boolean;
  onClose(): void;
  stage: TaskCardWorkflowStage | null;
  workflowName: string;
  botName?: string;
  botAvatar?: (Pick<BotAvatar, "seed"> & Partial<BotAvatar>) | null;
  colors: Colors;
  allStages?: readonly TaskCardWorkflowStage[];
  onOpenChat?(chatId: string, botId?: string): void;
  onResume?(): void | Promise<void>;
  resuming?: boolean;
}

const STAGE_STATUS_VARIANT: Record<TaskCardWorkflowStage["status"], BadgeVariant> = {
  pending: "muted",
  running: "warning",
  done: "success",
  failed: "error",
  skipped: "muted",
};

export { formatElapsedDuration };

export function TaskStageModal({
  open,
  onClose,
  stage,
  workflowName,
  botName,
  botAvatar,
  colors,
  allStages = [],
  onOpenChat,
  onResume,
  resuming = false,
}: TaskStageModalProps) {
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const toast = useToast();
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const stageNameById = useMemo(() => new Map(allStages.map((s) => [s.id, s.name])), [allStages]);
  const outputSegments = useMemo(
    () => (stage?.output ? segmentProtocolBlocks(stage.output) : []),
    [stage?.output],
  );
  const hasProtocolOutput = outputSegments.some((s) => s.kind === "protocol");

  if (!stage) return null;

  const duration = formatElapsedDuration(stage.startedAt, stage.completedAt);
  const statusLabel =
    stage.status === "done"
      ? t("workflows.statusDone")
      : stage.status === "running"
        ? t("workflows.statusRunning")
        : stage.status === "failed"
          ? t("workflows.statusFailed")
          : stage.status === "skipped"
            ? t("workflows.statusSkipped")
            : t("workflows.statusPending");

  const engineLabel = stage.engine === "native" ? t("workflows.engineNative") : t("workflows.enginePaseoBot");

  const upstreamStages = stage.dependsOn
    .map((depId) => ({
      id: depId,
      name: stageNameById.get(depId) ?? depId,
      stage: allStages.find((s) => s.id === depId),
    }))
    .filter(Boolean);

  const handleCopy = async (key: string, text: string) => {
    await copyText(text);
    setCopiedKey(key);
    toast.show(t("common.copied"), { variant: "success" });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <Modal
      title={`${stage.name} · ${workflowName}`}
      open={open}
      onOpenChange={(next) => !next && onClose()}
    >
      <Modal.Content contentContainerStyle={{ gap: 14, padding: 16 }}>
        {/* Meta Header */}
        <View
          style={{
            padding: 12,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface1,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {botAvatar ? <Avatar size={24} avatar={botAvatar} /> : <Icon name="Bot" size={20} color={colors.accent} />}
              <View>
                <Text style={{ fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
                  {botName ?? stage.botId}
                </Text>
                <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>
                  {stage.botId}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <StatusBadge colors={colors} label={engineLabel} variant="muted" />
              <StatusBadge colors={colors} label={statusLabel} variant={STAGE_STATUS_VARIANT[stage.status]} />
            </View>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap", borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
            {duration ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="Clock" size={12} color={colors.foregroundMuted} />
                <Text style={{ fontSize: ui(12), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
                  {t("workflows.durationLabel", { duration })}
                </Text>
              </View>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="RotateCcw" size={12} color={colors.foregroundMuted} />
              <Text style={{ fontSize: ui(12), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
                {t("workflows.retryCount", { retries: stage.retries, max: stage.maxRetries })}
              </Text>
            </View>

            {stage.chatId ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="MessageSquare" size={12} color={colors.foregroundMuted} />
                <Text style={{ fontSize: ui(12), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
                  {stage.chatId.slice(0, 8)}...
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Action Button: Open Agent Chat */}
        {stage.chatId && onOpenChat ? (
          <Button
            colors={colors}
            size="md"
            variant="default"
            icon="MessageSquare"
            label={t("workflows.openAgentChat")}
            onPress={() => {
              onOpenChat(stage.chatId!, stage.botId);
              onClose();
            }}
          />
        ) : null}

        {/* Action Button: Resume Workflow */}
        {stage.status === "failed" && onResume ? (
          <Button
            colors={colors}
            size="md"
            variant="default"
            icon="RotateCcw"
            style={{ backgroundColor: tokens.brandClay, borderColor: tokens.brandClay }}
            label={resuming ? t("workflows.resumingWorkflow") : t("workflows.resumeWorkflow")}
            onPress={() => {
              void onResume();
              onClose();
            }}
          />
        ) : null}

        {/* Prompt Section */}
        {stage.prompt ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foreground }}>
                {t("workflows.stagePromptTitle")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleCopy("prompt", stage.prompt!)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Icon name={copiedKey === "prompt" ? "Check" : "Copy"} size={12} color={colors.accent} />
                <Text style={{ fontSize: ui(11), color: colors.accent }}>
                  {copiedKey === "prompt" ? t("common.copied") : t("common.copy")}
                </Text>
              </Pressable>
            </View>
            <View
              style={{
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface0,
              }}
            >
              <MarkdownText colors={colors} text={stage.prompt} />
            </View>
          </View>
        ) : null}

        {/* Upstream Context / Dependencies */}
        {upstreamStages.length > 0 ? (
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foreground }}>
              {t("workflows.upstreamContextTitle")}
            </Text>
            <View style={{ gap: 6 }}>
              {upstreamStages.map((up) => (
                <View
                  key={up.id}
                  style={{
                    padding: 8,
                    borderRadius: 6,
                    borderWidth: 0,
                    backgroundColor: colors.surface2,
                    gap: 4,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ fontSize: ui(12), fontWeight: "500", color: colors.foreground }}>
                      {up.name} ({up.id})
                    </Text>
                    {up.stage ? (
                      <StatusBadge
                        colors={colors}
                        label={up.stage.status}
                        variant={STAGE_STATUS_VARIANT[up.stage.status]}
                      />
                    ) : null}
                  </View>
                  {up.stage?.output ? (
                    <Text numberOfLines={2} style={{ fontSize: ui(11), color: colors.foregroundMuted, fontFamily: "monospace" }}>
                      {up.stage.output.slice(0, 150)}...
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Error Trace if failed */}
        {stage.error ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.statusDanger }}>
                {t("workflows.errorLogTitle")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleCopy("error", stage.error!)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Icon name={copiedKey === "error" ? "Check" : "Copy"} size={12} color={colors.accent} />
                <Text style={{ fontSize: ui(11), color: colors.accent }}>
                  {copiedKey === "error" ? t("common.copied") : t("common.copy")}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={{
                maxHeight: 180,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.statusDanger,
                backgroundColor: colors.surface0,
              }}
            >
              <Text style={{ fontSize: ui(11), color: colors.statusDanger, fontFamily: "monospace", lineHeight: 16 }}>
                {stage.error}
              </Text>
            </ScrollView>
          </View>
        ) : null}

        {/* Output / Summary */}
        {stage.output ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foreground }}>
                {t("workflows.stageOutputTitle")}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => handleCopy("output", stage.output!)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
              >
                <Icon name={copiedKey === "output" ? "Check" : "Copy"} size={12} color={colors.accent} />
                <Text style={{ fontSize: ui(11), color: colors.accent }}>
                  {copiedKey === "output" ? t("common.copied") : t("common.copy")}
                </Text>
              </Pressable>
            </View>
            <ScrollView
              style={{
                maxHeight: 220,
                padding: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface0,
              }}
            >
              {hasProtocolOutput ? (
                <View style={{ gap: 6 }}>
                  {outputSegments.map((seg, idx) => {
                    if (seg.kind === "protocol") {
                      return <ProtocolCard key={`proto-${idx}`} colors={colors} segment={seg} />;
                    }
                    if (!seg.text.trim()) return null;
                    return <MarkdownText key={`md-${idx}`} colors={colors} text={seg.text} />;
                  })}
                </View>
              ) : (
                <MarkdownText colors={colors} text={stage.output} />
              )}
            </ScrollView>
          </View>
        ) : null}
      </Modal.Content>
    </Modal>
  );
}
