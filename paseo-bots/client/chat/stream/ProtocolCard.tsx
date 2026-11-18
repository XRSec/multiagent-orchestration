/**
 * Purpose: Collapsible structured status card for <task_brief>, <repair_brief>, and <worker_handoff> blocks.
 * Context: Rendered inside chat stream UserMessage and AssistantMessage rows.
 * Usage: <ProtocolCard colors={colors} segment={segment} />
 * Prerequisites: shared/protocol-cards.ts, client/i18n, client/native.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import * as UI from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { ProtocolSegment } from "../../../shared/protocol-cards";
import { useT } from "../../i18n";
import { nativeTokens, withAlpha } from "../../native";
import { ui } from "../../typography";

type Colors = PluginTheme["colors"];
type ProtocolBlock = Extract<ProtocolSegment, { kind: "protocol" }>;

const BLOCKED_ORANGE = "#F97316";

const Icon = UI.Icon;
let PaseoMarkdown: any = null;
try {
  PaseoMarkdown = (UI as any).Markdown;
} catch {
  PaseoMarkdown = null;
}

/** Markdown renderer that falls back to selectable text if PaseoMarkdown is unmounted/mocked. */
export function MarkdownText({ colors, text }: { colors: Colors; text: string }) {
  if (typeof PaseoMarkdown === "function" || (typeof PaseoMarkdown === "object" && PaseoMarkdown !== null)) {
    const Comp = PaseoMarkdown;
    return <Comp>{text}</Comp>;
  }
  return (
    <Text selectable style={{ fontSize: ui(12), lineHeight: 18, color: colors.foregroundMuted }}>
      {text}
    </Text>
  );
}

function resolveToneColor(colors: Colors, segment: ProtocolBlock): string {
  if (segment.tag === "worker_handoff") {
    const status = segment.handoff?.status ?? "UNKNOWN";
    if (status === "PASS") return colors.statusSuccess;
    if (status === "PARTIAL") return colors.statusWarning;
    if (status === "BLOCKED") return BLOCKED_ORANGE;
    if (status === "FAILED") return colors.statusDanger;
    return colors.foregroundMuted;
  }
  return segment.tag === "repair_brief" ? colors.statusWarning : colors.accent;
}

function resolveTagIcon(segment: ProtocolBlock): string {
  if (segment.tag === "worker_handoff") {
    const status = segment.handoff?.status ?? "UNKNOWN";
    if (status === "PASS") return "CheckCircle2";
    if (status === "PARTIAL") return "AlertTriangle";
    if (status === "BLOCKED") return "PauseCircle";
    if (status === "FAILED") return "AlertCircle";
    return "FileCheck2";
  }
  return segment.tag === "repair_brief" ? "Wrench" : "ClipboardList";
}

function CollapsibleSection({
  colors,
  title,
  body,
  defaultExpanded = false,
  monospace = false,
}: {
  colors: Colors;
  title: string;
  body: string;
  defaultExpanded?: boolean;
  monospace?: boolean;
}) {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}
      >
        <Text style={{ fontSize: ui(12), fontWeight: "600", color: colors.foreground }}>{title}</Text>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} size={14} color={colors.foregroundMuted} />
      </Pressable>
      {open ? (
        <View style={{ padding: 8, borderRadius: 6, backgroundColor: colors.surface2 }}>
          {monospace ? (
            <Text selectable style={{ fontSize: ui(11), lineHeight: 16, color: colors.foregroundMuted, fontFamily: "monospace" }}>
              {body}
            </Text>
          ) : (
            <MarkdownText colors={colors} text={body} />
          )}
        </View>
      ) : null}
    </View>
  );
}

/** Renders a structured collapsible card for `<task_brief>`, `<repair_brief>`, or `<worker_handoff>`. */
export function ProtocolCard({ colors, segment }: { colors: Colors; segment: ProtocolBlock }) {
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const [expanded, setExpanded] = useState(false);

  const tone = resolveToneColor(colors, segment);
  const icon = resolveTagIcon(segment);

  const title =
    segment.tag === "task_brief"
      ? t("workflows.protocolTaskBrief")
      : segment.tag === "repair_brief"
        ? t("workflows.protocolRepairBrief")
        : t("workflows.protocolWorkerHandoff");

  const badgeLabel =
    segment.tag === "worker_handoff"
      ? segment.handoff?.status ?? "UNKNOWN"
      : segment.fields.STAGE_ID || segment.fields.WORKFLOW || segment.tag.toUpperCase();

  const subtitle =
    segment.tag === "worker_handoff"
      ? segment.handoff?.summary || ""
      : [segment.fields.WORKFLOW, segment.fields.STAGE_NAME || segment.fields.STAGE_ID]
          .filter(Boolean)
          .join(" · ");

  const verificationProof = segment.handoff?.verificationProof || segment.fields.VERIFICATION_PROOF || "";
  const dodChecklist = segment.handoff?.dodChecklist || segment.fields.DOD_CHECKLIST || "";
  const touchedFiles = segment.handoff?.touchedFiles || segment.fields.TOUCHED_FILES || "";
  const openIssues = segment.handoff?.openIssues || segment.fields.OPEN_ISSUES || "";
  const previousError = segment.fields.PREVIOUS_ERROR || "";
  const briefObjective =
    segment.fields.OBJECTIVE ||
    segment.fields.WORKFLOW_INPUT ||
    segment.fields.SPECIFICATION ||
    segment.fields.INSTRUCTIONS ||
    "";
  const upstreamContext = segment.fields.UPSTREAM_CONTEXT || "";

  return (
    <View
      style={{
        marginVertical: 8,
        padding: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: withAlpha(tone, tokens.dark ? 0.4 : 0.3),
        borderLeftWidth: 3,
        borderLeftColor: tone,
        backgroundColor: colors.surface1,
        gap: 8,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((v) => !v)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 }}
      >
        <Icon name={icon as never} size={15} color={tone} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: ui(13), fontWeight: "600", color: colors.foreground }}>
          {title}
        </Text>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 999,
            backgroundColor: withAlpha(tone, tokens.dark ? 0.18 : 0.12),
          }}
        >
          <Text style={{ fontSize: ui(11), fontWeight: "600", color: tone }}>{badgeLabel}</Text>
        </View>
        <Icon name={expanded ? "ChevronUp" : "ChevronDown"} size={14} color={colors.foregroundMuted} />
      </Pressable>

      {subtitle ? (
        <View style={{ opacity: 0.95 }}>
          <MarkdownText colors={colors} text={subtitle} />
        </View>
      ) : null}

      {expanded ? (
        <View style={{ gap: 8 }}>
          {previousError ? (
            <CollapsibleSection colors={colors} title={t("workflows.protocolPreviousError")} body={previousError} defaultExpanded />
          ) : null}
          {touchedFiles && touchedFiles.toLowerCase() !== "none" ? (
            <CollapsibleSection colors={colors} title={t("workflows.protocolTouchedFiles")} body={touchedFiles} defaultExpanded monospace />
          ) : null}
          {openIssues && openIssues.toLowerCase() !== "none" ? (
            <CollapsibleSection colors={colors} title={t("workflows.protocolOpenIssues")} body={openIssues} defaultExpanded />
          ) : null}
          {verificationProof ? (
            <CollapsibleSection colors={colors} title={t("workflows.protocolVerificationProof")} body={verificationProof} monospace />
          ) : null}
          {dodChecklist ? (
            <CollapsibleSection colors={colors} title={t("workflows.protocolDodChecklist")} body={dodChecklist} />
          ) : null}
          {briefObjective ? (
            <CollapsibleSection colors={colors} title={t("workflows.stagePromptTitle") || "Objective"} body={briefObjective} />
          ) : null}
          {upstreamContext ? (
            <CollapsibleSection colors={colors} title="Upstream Context" body={upstreamContext} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
