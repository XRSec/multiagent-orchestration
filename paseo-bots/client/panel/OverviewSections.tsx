import { useRpc } from "@getpaseo/plugin/client";
import { Modal, SettingsAction, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { botMcpServers, botSkills, estimateTokens, utf8Bytes, type Bot } from "../../shared/bot";
import { teamsOf } from "../../shared/groups";
import { systemPromptRpc } from "../../shared/rpc";
import { useBotChats, useBotHost } from "../data";
import { formatBotLimits, formatDescribeSchedule, formatRelativeTime, useT, type AppLocale, type TFn } from "../i18n";
import { MONO_FONT, MONO_PROPS } from "../native";
import { code, codeLine, ui } from "../typography";
import { useAppsCatalog, useAppsStatus } from "../library/apps";
import type { PanelProps } from "./BotPanel";
import { CardNote, DrillRow, SectionMeta } from "./controls";

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

// ---------------------------------------------------------------- overview

function size(t: TFn, locale: AppLocale, text: string): string {
  const numberLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  return t("panel.promptSize", { kb: (utf8Bytes(text) / 1000).toFixed(1), tokens: estimateTokens(text).toLocaleString(numberLocale) });
}

/** "Chief of Staff of Ops", "On Ops, led by Scout" or "No team". */
function teamLine(t: TFn, bot: Bot, groups: PanelProps["groups"]): string {
  const joined = teamsOf(bot.id, groups);
  if (joined.length === 0) return t("panel.noTeamHint");
  return joined
    .map((group) => (group.leadId === bot.id ? t("panel.chiefOfStaffOf", { team: group.name }) : t("panel.onTeam", { team: group.name })))
    .join(", ");
}

export function OverviewSection({ colors, bot, library, groups, localHost, onSetup }: PanelProps) {
  const { t, locale } = useT();
  const sep = locale === "zh-CN" ? "、" : ", ";
  const host = useBotHost(bot.hostId, localHost);
  const compose = useRpc(systemPromptRpc);
  const promptBot = useDebounced(bot, 600);
  const prompt = useQuery({
    // The server reads skills and teams from the saved settings, so changes there recompose too.
    queryKey: ["paseo-bots", "prompt", JSON.stringify(promptBot), host.isLocal, JSON.stringify(library.skills), JSON.stringify(groups)],
    queryFn: () => compose({ bot: promptBot, local: host.isLocal }),
    // Keep the previous composition while edits recompose it, so the card doesn't jump.
    placeholderData: (previous) => previous,
  });
  const [sheet, setSheet] = useState<"summary" | "prompt" | null>(null);

  const appsStatus = useAppsStatus();
  const appNames = new Map((useAppsCatalog(appsStatus.data?.configured ?? false).data?.apps ?? []).map((app) => [app.slug, app.name]));
  const tools = [
    ...botMcpServers(bot, library).map((server) => server.name),
    ...botSkills(bot, library).map((skill) => t("panel.skillTag", { id: skill.id })),
    ...(appsStatus.data?.configured && host.isLocal ? bot.apps.map((slug) => t("panel.appTag", { name: appNames.get(slug) ?? slug })) : []),
  ];
  const sections = prompt.data?.sections ?? [];

  return (
    <>
      <SettingsSection title={t("panel.setupSection")}>
        <SettingsCard>
          <SettingsAction label={t("panel.rowSetUpWithBot")} hint={t("panel.setupWithBotHint")} actionLabel={t("panel.startAction")} onPress={onSetup} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("panel.aboutThisBot")}>
        <SettingsCard>
          <DrillRow colors={colors} label={t("panel.summaryLabel")} hint={t("panel.summaryHint")} onPress={() => setSheet("summary")} />
          <DrillRow colors={colors} label={t("panel.rowSystemPrompt")} hint={prompt.data ? size(t, locale, prompt.data.systemPrompt) : prompt.isError ? t("panel.unableToComposePrompt") : t("common.loading")} onPress={() => setSheet("prompt")} />
        </SettingsCard>
      </SettingsSection>
      {sheet === "summary" ? (
        <Modal title={t("panel.summaryLabel")} open onOpenChange={(next) => !next && setSheet(null)}>
          <Modal.Content>
            <SettingsCard>
              <SettingsRow label={t("panel.summaryDoes")} hint={bot.title || bot.description || t("panel.summaryNoTitleYet")} />
              <SettingsRow label={t("panel.summaryTeam")} hint={teamLine(t, bot, groups)} />
              <SettingsRow label={t("panel.summaryCanReach")} hint={tools.length ? tools.join(sep) : t("panel.summaryBuiltInOnly")} />
              <SettingsRow label={t("panel.summaryRuns")} hint={bot.routines.length ? bot.routines.map((routine) => `${routine.name}: ${formatDescribeSchedule(t, locale, routine.schedule)}${routine.enabled ? "" : t("panel.routinePausedSuffix")}`).join("\n") : t("panel.summaryOnlyWhenMessaged")} />
              <SettingsRow label={t("panel.summaryWont")} hint={formatBotLimits(t, bot, { local: host.isLocal, appsConfigured: !!appsStatus.data?.configured }).join("\n")} />
            </SettingsCard>
          </Modal.Content>
        </Modal>
      ) : null}
      {sheet === "prompt" ? (
        <Modal title={t("panel.rowSystemPrompt")} open onOpenChange={(next) => !next && setSheet(null)}>
          <Modal.Content>
            <Text style={{ fontSize: ui(14), color: colors.foregroundMuted }}>
              {t("panel.sentWithEveryChat", { size: prompt.data ? (locale === "zh-CN" ? `：${size(t, locale, prompt.data.systemPrompt)}` : `: ${size(t, locale, prompt.data.systemPrompt)}`) : locale === "zh-CN" ? "。" : "." })}
            </Text>
            {sections.length === 0 ? <CardNote colors={colors} text={prompt.isError ? t("panel.unableToComposePrompt") : t("common.loading")} loading={!prompt.isError} /> : null}
            {sections.map((section) => (
              <View key={section.title} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <Text style={{ fontSize: ui(14), color: colors.foreground }}>{section.title}</Text>
                  <SectionMeta colors={colors} text={size(t, locale, section.text)} />
                </View>
                <View style={{ padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
                  <Text selectable {...MONO_PROPS} style={{ fontFamily: MONO_FONT, fontSize: code(), lineHeight: codeLine(), color: colors.foreground }}>
                    {section.text}
                  </Text>
                </View>
              </View>
            ))}
          </Modal.Content>
        </Modal>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- history

function summarize(t: TFn, locale: AppLocale, before: Bot, after: Bot): string {
  const labels: [keyof Bot, Parameters<TFn>[0]][] = [
    ["name", "panel.diffName"],
    ["title", "panel.diffTitle"],
    ["description", "panel.diffBlurb"],
    ["avatar", "panel.diffAvatar"],
    ["soul", "panel.diffStandingInstructions"],
    ["skillIds", "panel.diffSkills"],
    ["routines", "panel.diffRoutines"],
    ["playbooks", "panel.diffPlaybooks"],
    ["mcpServerIds", "panel.diffMcpServers"],
    ["apps", "panel.diffConnectedApps"],
    ["alwaysAllow", "panel.diffAlwaysAllowedTools"],
    ["contactBots", "panel.diffContactBots"],
    ["cwd", "panel.diffFolder"],
    ["mounts", "panel.diffMounts"],
    ["hostId", "panel.diffHost"],
    ["provider", "panel.diffProvider"],
    ["model", "panel.diffModel"],
    ["modeId", "panel.diffMode"],
    ["thinkingOptionId", "panel.diffThinking"],
  ];
  const sep = locale === "zh-CN" ? "、" : ", ";
  const changed = labels.filter(([key]) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(([, key]) => t(key));
  return changed.length ? t("panel.changedSince", { fields: changed.join(sep) }) : t("panel.sameAsNow");
}

export function HistorySection({ colors, bot, history, onRestore }: PanelProps) {
  const { t, locale } = useT();
  const mine = history.filter((entry) => entry.botId === bot.id).reverse();
  return (
    <SettingsSection title={t("panel.rowEarlierVersions")} info={t("panel.earlierVersionsInfo")}>
      <SettingsCard>
        {mine.length === 0 ? <CardNote colors={colors} text={t("panel.noEarlierVersionsYet")} /> : null}
        {mine.map((entry) => (
          <SettingsAction key={entry.at} label={t("panel.versionFrom", { time: formatRelativeTime(t, entry.at) })} hint={summarize(t, locale, entry.snapshot, bot)} actionLabel={t("panel.restoreAction")} onPress={() => onRestore(entry.snapshot)} />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------- usage

export function UsageSection({ bot, localHost }: PanelProps) {
  const { t, locale } = useT();
  const numberLocale = locale === "zh-CN" ? "zh-CN" : "en-US";
  const host = useBotHost(bot.hostId, localHost);
  const chats = useBotChats(host, bot.id);
  const list = chats.data ?? [];
  const sum = (pick: (usage: NonNullable<(typeof list)[number]["lastUsage"]>) => number | undefined) =>
    list.reduce((total, chat) => total + (chat.lastUsage ? (pick(chat.lastUsage) ?? 0) : 0), 0);
  const input = sum((usage) => usage.inputTokens);
  const output = sum((usage) => usage.outputTokens);
  const cost = sum((usage) => usage.totalCostUsd);
  const working = list.filter((chat) => chat.status === "running").length;
  const loading = chats.isLoading;
  return (
    <SettingsSection title={t("panel.allChatsTitle")} info={t("panel.allChatsInfo")}>
      <SettingsCard>
        <SettingsRow label={t("panel.rowChats")} hint={loading ? t("common.loading") : t("panel.chatsCountHint", { count: list.length, working: working ? t("panel.chatsWorkingSuffix", { count: working }) : "" })} />
        <SettingsRow label={t("panel.rowTokens")} hint={loading ? t("common.loading") : t("panel.tokensInOut", { in: input.toLocaleString(numberLocale), out: output.toLocaleString(numberLocale) })} />
        <SettingsRow label={t("panel.rowCost")} hint={loading ? t("common.loading") : cost > 0 ? `$${cost.toFixed(2)}` : t("panel.costNotReported")} />
      </SettingsCard>
    </SettingsSection>
  );
}
