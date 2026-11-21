/**
 * Purpose: Dedicated top-level sidebar screen for multi-agent DAG workflows and pipelines.
 * Context: Accessible via dedicated Workflows sidebar item and command palette.
 * Usage: <WorkflowsScreen {...props} openScreen={...} />
 * Prerequisites: Paseo client runtime, WorkflowListEditor.
 */

import { useRpc, type PluginOpenScreenInput, type PluginScreenProps } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { Icon, ScrollView, SettingsCard, SettingsRow, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { primaryGroupForBot } from "../shared/bot";
import { workflowResumeRpc, workflowRunRpc, workflowRunsRpc } from "../shared/rpc";
import type { WorkflowDefinition } from "../shared/workflows";
import { AvatarTheme } from "./Avatar";
import { TaskCardView } from "./chat/stream/TaskCard";
import { useT } from "./i18n";
import { PAGE_STYLE, PageTitle } from "./library/parts";
import { nativeTokens } from "./native";
import { Button, StatusBadge, TextAreaField } from "./panel/controls";
import { chatScreen, feedScreen, teamChatScreen, teamsScreen } from "./screen-navigation";
import { navigateToAgentChat } from "./navigation";
import { WorkflowListEditor } from "./settings/WorkflowEditor";
import { ui } from "./typography";
import { MenuProvider } from "./ui/Menu";
import { useBotSettings } from "./useBotSettings";

export interface WorkflowsScreenProps extends PluginScreenProps {
  openScreen(input: PluginOpenScreenInput): void;
  initialScope?: string;
  onOpenFeed?(kind: "bot" | "team", id: string): void;
  onOpenTeamChat?(groupId: string): void;
  onOpenTeams?(): void;
  onOpenChat?(chatId: string, botId?: string): void;
}

function parseWorkflowScope(raw?: string): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "global";
  if (trimmed.startsWith("team:")) {
    return trimmed.slice("team:".length).trim() || "global";
  }
  return trimmed;
}

export function WorkflowsScreen(props: WorkflowsScreenProps) {
  return (
    <MenuProvider colors={props.theme.colors} compact={props.layout.compact}>
      <AvatarTheme dark={nativeTokens(props.theme.colors).dark}>
        <WorkflowsContent {...props} />
      </AvatarTheme>
    </MenuProvider>
  );
}

function WorkflowsContent({
  theme,
  openScreen,
  navigation,
  params,
  initialScope,
  onOpenFeed,
  onOpenTeamChat,
  onOpenTeams,
  onOpenChat,
}: WorkflowsScreenProps) {
  const colors = theme.colors;
  const { t } = useT();
  const { settings, commit } = useBotSettings();
  const fetchRuns = useRpc(workflowRunsRpc);
  const resumeRun = useRpc(workflowResumeRpc);
  const runWorkflow = useRpc(workflowRunRpc);
  const toast = useToast();

  const rawInitialScope = initialScope ?? params?.scope;
  const [selectedScope, setSelectedScope] = useState<string>(() => parseWorkflowScope(rawInitialScope));
  const [runTarget, setRunTarget] = useState<WorkflowDefinition | null>(null);
  const [runGoal, setRunGoal] = useState("");
  const [runGroupId, setRunGroupId] = useState("");
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [runFeedback, setRunFeedback] = useState<{ kind: "error" | "success"; message: string; chatId?: string; taskId?: string } | null>(null);

  useEffect(() => {
    if (rawInitialScope !== undefined) {
      setSelectedScope(parseWorkflowScope(rawInitialScope));
    }
  }, [rawInitialScope]);

  const readyGroups = settings.status === "ready" ? settings.values.groups ?? [] : null;
  useEffect(() => {
    if (!readyGroups || !selectedScope.startsWith("bot:")) return;
    const botId = selectedScope.slice("bot:".length);
    const primary = primaryGroupForBot(botId, readyGroups);
    setSelectedScope(primary?.id ?? "global");
  }, [readyGroups, selectedScope]);

  useEffect(() => {
    setRunTarget(null);
    setRunFeedback(null);
    setRunGroupId(selectedScope !== "global" && !selectedScope.startsWith("bot:") ? selectedScope : "");
  }, [selectedScope]);

  const runsQuery = useQuery({
    queryKey: ["bots", "workflows", "runs"],
    queryFn: () => fetchRuns({ limit: 10 }),
    refetchInterval: (query) => (query.state.data?.runs.some((r) => r.workflow?.status === "running") ? 4000 : false),
  });

  const liveBots = useMemo(
    () => (settings.status === "ready" ? settings.values.bots.filter((b) => !b.archived) : []),
    [settings],
  );
  const botMap = useMemo(() => new Map(liveBots.map((b) => [b.id, b])), [liveBots]);

  if (settings.status !== "ready") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.surface0, padding: 24, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: ui(14), color: colors.foregroundMuted }}>
          {settings.status === "loading" ? t("workflows.loading") : t("workflows.loadError")}
        </Text>
      </View>
    );
  }

  const groups = settings.values.groups ?? [];
  const globalWorkflows = settings.values.workflows ?? [];

  const activeGroup = groups.find((g) => g.id === selectedScope) ?? null;
  const currentWorkflows: readonly WorkflowDefinition[] = activeGroup
    ? (activeGroup.workflows ?? [])
    : globalWorkflows;

  const handleOpenChat = (chatId: string, botId?: string) => {
    if (onOpenChat) {
      onOpenChat(chatId, botId);
      return;
    }
    const navigated = navigateToAgentChat(chatId, {
      botId,
      navigation: navigation as any,
    });
    if (!navigated && botId) {
      openScreen(chatScreen({ botId, chatId }, botMap.get(botId)?.name ?? botId));
    }
  };

  const handleOpenFeed = (kind: "bot" | "team", id: string, title?: string) => {
    if (onOpenFeed) {
      onOpenFeed(kind, id);
      return;
    }
    openScreen(feedScreen(kind, id, title));
  };

  const handleOpenTeamChat = (groupId: string) => {
    if (onOpenTeamChat) {
      onOpenTeamChat(groupId);
      return;
    }
    openScreen(teamChatScreen(groupId));
  };

  const handleOpenTeams = () => {
    if (onOpenTeams) {
      onOpenTeams();
      return;
    }
    openScreen(teamsScreen());
  };

  const handleStartRun = async () => {
    if (!runTarget || !runGoal.trim() || runSubmitting) return;
    setRunSubmitting(true);
    setRunFeedback(null);
    const effectiveGroupId = activeGroup?.id ?? (runGroupId || undefined);
    try {
      const res = await runWorkflow({
        workflowId: runTarget.id,
        goal: runGoal.trim(),
        ...(effectiveGroupId ? { groupId: effectiveGroupId } : {}),
      });
      if (res.ok) {
        const msg = res.reused ? t("workflows.runReused") : t("workflows.runStarted");
        toast.show(msg, { variant: "success" });
        setRunFeedback({ kind: "success", message: msg, chatId: res.chatId, taskId: res.taskId });
        setRunGoal("");
        await runsQuery.refetch();
        if (res.chatId) {
          handleOpenChat(res.chatId);
        }
      } else {
        const errMsg = res.error ?? t("workflows.runFailed");
        toast.error(errMsg);
        setRunFeedback({ kind: "error", message: errMsg });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : t("workflows.runFailed");
      toast.error(errMsg);
      setRunFeedback({ kind: "error", message: errMsg });
    } finally {
      setRunSubmitting(false);
    }
  };

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
  const runs = runsQuery.data?.runs ?? [];
  const activeRunsCount = runs.filter((r) => r.workflow?.status === "running").length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface0 }} contentContainerStyle={PAGE_STYLE}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <PageTitle colors={colors} title={t("workflows.sidebarTitle")} />
        </View>
        <View style={{ marginBottom: 24 }}>
          <Button colors={colors} size="xs" variant="ghost" icon="Users" label={t("workflows.quickLinkTeams")} onPress={handleOpenTeams} />
        </View>
      </View>

      {/* Active & Recent Workflow Runs */}
      <SettingsSection
        title={t("workflows.recentRunsTitle")}
        info={t("workflows.recentRunsInfo")}
      >
        <SettingsCard>
          <SettingsRow
            label={t("workflows.recentRunsTitle")}
            hint={runs.length === 0 ? t("workflows.noRunsYet") : undefined}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {activeRunsCount > 0 ? (
                <StatusBadge
                  colors={colors}
                  label={t("workflows.activeRunsBadge", { count: activeRunsCount })}
                  variant="warning"
                />
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => void runsQuery.refetch()}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 6,
                  borderWidth: 0,
                  backgroundColor: colors.surface2,
                }}
              >
                <Icon name="RefreshCw" size={12} color={colors.foregroundMuted} />
                <Text style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
                  {t("workflows.refreshRuns")}
                </Text>
              </Pressable>
            </View>
          </SettingsRow>
          {runs.length > 0 ? (
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              {runs.map((card) => (
                <TaskCardView
                  key={card.taskId}
                  colors={colors}
                  card={card}
                  onOpenChat={handleOpenChat}
                  onOpenTeamFeed={(groupId) =>
                    handleOpenFeed("team", groupId, groups.find((g) => g.id === groupId)?.name)
                  }
                  onOpenSourceChat={(chatId) => handleOpenChat(chatId)}
                  onResume={async (taskId) => {
                    const res = await resumeRun({ taskId });
                    if (res.ok) {
                      toast.show(t("workflows.resumeSuccess"), { variant: "success" });
                      await runsQuery.refetch();
                    } else {
                      toast.error(res.error ?? t("workflows.resumeFailed"));
                    }
                  }}
                />
              ))}
            </View>
          ) : null}
        </SettingsCard>
      </SettingsSection>

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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {activeGroup ? (
                <>
                  <Button
                    colors={colors}
                    size="xs"
                    variant="ghost"
                    icon="MessageSquareText"
                    label={t("workflows.quickLinkFeed")}
                    onPress={() => handleOpenFeed("team", activeGroup.id, activeGroup.name)}
                  />
                  <Button
                    colors={colors}
                    size="xs"
                    variant="ghost"
                    icon="MessageCircle"
                    label={t("workflows.quickLinkTeamChat")}
                    onPress={() => handleOpenTeamChat(activeGroup.id)}
                  />
                </>
              ) : null}
              <Button
                colors={colors}
                size="xs"
                variant="ghost"
                icon="Users"
                label={t("workflows.quickLinkTeams")}
                onPress={handleOpenTeams}
              />
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
                  borderWidth: 0,
                  backgroundColor: selectedScope === "global" ? colors.surface2 : colors.surface1,
                }}
              >
                <Icon name="Globe" size={14} color={selectedScope === "global" ? colors.accent : colors.foregroundMuted} />
                <Text style={{ fontSize: ui(13), fontWeight: "500", color: selectedScope === "global" ? colors.foreground : colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
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
                      borderWidth: 0,
                      backgroundColor: isSelected ? colors.surface2 : colors.surface1,
                    }}
                  >
                    <Icon name="Users" size={14} color={isSelected ? colors.accent : colors.foregroundMuted} />
                    <Text style={{ fontSize: ui(13), fontWeight: "500", color: isSelected ? colors.foreground : colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
                      {group.name} ({count})
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </SettingsCard>
      </SettingsSection>

      {/* Inline Run Workflow Panel */}
      {runTarget ? (
        <SettingsSection title={t("workflows.runPanelTitle", { name: runTarget.name })}>
          <SettingsCard>
            <SettingsRow
              label={runTarget.name}
              hint={runTarget.description || t("workflows.stagesCount", { count: runTarget.stages.length })}
            >
              <Button
                colors={colors}
                size="xs"
                variant="ghost"
                icon="X"
                label={t("common.close")}
                onPress={() => {
                  setRunTarget(null);
                  setRunFeedback(null);
                }}
              />
            </SettingsRow>
            {!activeGroup && groups.length > 0 ? (
              <SettingsSelect
                label={t("workflows.runTargetTeamLabel")}
                value={runGroupId}
                options={[
                  { label: t("workflows.runNoTeamOption"), value: "" },
                  ...groups.map((g) => ({ label: g.name, value: g.id })),
                ]}
                onValueChange={setRunGroupId}
              />
            ) : null}
            <TextAreaField
              colors={colors}
              label={t("workflows.runGoalLabel")}
              value={runGoal}
              onChangeText={setRunGoal}
              minHeight={76}
              placeholder={t("workflows.runGoalPlaceholder")}
            />
            {runFeedback ? (
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingBottom: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontSize: ui(12),
                    color: runFeedback.kind === "error" ? colors.statusDanger : colors.statusSuccess,
                  }}
                >
                  {runFeedback.message}
                </Text>
                {runFeedback.chatId ? (
                  <Button
                    colors={colors}
                    size="xs"
                    variant="outline"
                    icon="ArrowUpRight"
                    label={t("workflows.openRunChat")}
                    onPress={() => handleOpenChat(runFeedback.chatId!)}
                  />
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
              <Button
                colors={colors}
                size="sm"
                variant="ghost"
                label={t("common.cancel")}
                onPress={() => {
                  setRunTarget(null);
                  setRunFeedback(null);
                }}
              />
              <Button
                colors={colors}
                size="sm"
                variant="default"
                icon="Play"
                loading={runSubmitting}
                disabled={!runGoal.trim() || runSubmitting}
                label={runSubmitting ? t("workflows.runningSubmit") : t("workflows.runSubmit")}
                onPress={() => void handleStartRun()}
              />
            </View>
          </SettingsCard>
        </SettingsSection>
      ) : null}

      {/* Spacious Workflow Editor with live DAG preview and presets */}
      <WorkflowListEditor
        key={selectedScope}
        colors={colors}
        title={activeGroup ? t("workflows.teamTitleScoped", { name: activeGroup.name }) : t("workflows.globalTitle")}
        info={activeGroup ? t("workflows.teamInfoScoped", { name: activeGroup.name }) : t("workflows.globalInfo")}
        workflows={currentWorkflows}
        bots={liveBots}
        onChange={handleSaveWorkflows}
        onRunWorkflow={(wf) => {
          setRunTarget(wf);
          setRunGoal("");
          setRunGroupId(activeGroup?.id ?? "");
          setRunFeedback(null);
        }}
      />
    </ScrollView>
  );
}
