/**
 * Purpose: Unified modal for configuring team and partner (bot) identities.
 * Context: Opened from the bottom-right "Partner settings" button in BotSidebarFooter.
 * Usage: <PartnerSettingsModal open={...} colors={...} groups={...} bots={...} ... />
 * Prerequisites: Paseo client runtime, TeamEditorForm, and BotPanel sections.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Bot, BotGroup, HistoryEntry, Library, WorkflowDefinition } from "../../shared/bot";
import type { TeamDraft } from "../../shared/groups";
import { Avatar, TeamLogo } from "../Avatar";
import type { LocalHost } from "../data";
import { useT } from "../i18n";
import { isImeComposing } from "../keyboard";
import { nativeTokens } from "../native";
import { BotPanel, type PanelProps, type SectionId } from "../panel/BotPanel";
import { TeamEditorForm } from "../teams/TeamSheet";
import { ui } from "../typography";
import { WorkflowListEditor } from "./WorkflowEditor";

type Colors = PluginTheme["colors"];

export type PartnerSettingsTarget =
  | { kind: "team"; id: string }
  | { kind: "bot"; id: string }
  | { kind: "workflows" };

export interface PartnerSettingsModalProps {
  open: boolean;
  colors: Colors;
  groups: readonly BotGroup[];
  bots: readonly Bot[];
  localHost: LocalHost;
  history: HistoryEntry[];
  library: Library;
  globalWorkflows?: readonly WorkflowDefinition[];
  initialTarget?: PartnerSettingsTarget | null;
  onClose(): void;
  onPatchBot(botId: string, patch: Partial<Bot>): void;
  flush(): Promise<void>;
  onRestoreBot(botId: string, snapshot: Bot): void;
  onSetupBot(bot: Bot): void;
  onOpenChat(bot: Bot, chatId: string): void;
  onSaveTeam(teamId: string, draft: TeamDraft): void;
  onDeleteTeam?(group: BotGroup): void;
  onSaveGlobalWorkflows?(workflows: WorkflowDefinition[]): void;
}

export function PartnerSettingsModal({
  open,
  colors,
  groups,
  bots,
  localHost,
  history,
  library,
  globalWorkflows,
  initialTarget,
  onClose,
  onPatchBot,
  flush,
  onRestoreBot,
  onSetupBot,
  onOpenChat,
  onSaveTeam,
  onDeleteTeam,
  onSaveGlobalWorkflows,
}: PartnerSettingsModalProps) {
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const liveBots = useMemo(() => bots.filter((b) => !b.archived), [bots]);

  const fallbackTarget = useMemo<PartnerSettingsTarget | null>(() => {
    if (groups[0]) return { kind: "team", id: groups[0].id };
    if (liveBots[0]) return { kind: "bot", id: liveBots[0].id };
    if (bots[0]) return { kind: "bot", id: bots[0].id };
    if (onSaveGlobalWorkflows) return { kind: "workflows" };
    return null;
  }, [groups, liveBots, bots, onSaveGlobalWorkflows]);

  const [target, setTarget] = useState<PartnerSettingsTarget | null>(() => initialTarget ?? fallbackTarget);
  const [botSection, setBotSection] = useState<SectionId | null>(null);

  useEffect(() => {
    if (!open) return;
    setBotSection(null);
    if (initialTarget) {
      setTarget(initialTarget);
      return;
    }
    setTarget((prev) => {
      if (prev?.kind === "team" && groups.some((g) => g.id === prev.id)) return prev;
      if (prev?.kind === "bot" && bots.some((b) => b.id === prev.id)) return prev;
      if (prev?.kind === "workflows" && onSaveGlobalWorkflows) return prev;
      return fallbackTarget;
    });
  }, [open, initialTarget, groups, bots, fallbackTarget, onSaveGlobalWorkflows]);

  const selectTarget = (next: PartnerSettingsTarget) => {
    setTarget(next);
    setBotSection(null);
  };

  const selectedGroup = target?.kind === "team" ? groups.find((g) => g.id === target.id) ?? null : null;
  const selectedBot = target?.kind === "bot" ? bots.find((b) => b.id === target.id) ?? null : null;

  const handleClose = () => {
    void flush();
    onClose();
  };

  const botPanelProps: PanelProps | null = selectedBot
    ? {
        colors,
        bot: selectedBot,
        localHost,
        history,
        library,
        groups,
        onPatch: (patch) => onPatchBot(selectedBot.id, patch),
        flush,
        onRestore: (snapshot) => onRestoreBot(selectedBot.id, snapshot),
        onSetup: () => onSetupBot(selectedBot),
        onOpenChat: (chatId) => onOpenChat(selectedBot, chatId),
      }
    : null;

  return (
    <Modal title={t("partnerSettings.title")} open={open} onOpenChange={(next) => !next && handleClose()}>
      <Modal.Content contentContainerStyle={{ gap: 12 }}>
        {(groups.length > 0 || liveBots.length > 0 || onSaveGlobalWorkflows) ? (
          <View style={{ gap: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {groups.length > 0 ? (
              <TargetSelectorRow
                label={t("partnerSettings.teamsGroup")}
                colors={colors}
                items={groups.map((g) => ({
                  key: `team:${g.id}`,
                  label: g.name || t("teams.untitledTeam"),
                  active: target?.kind === "team" && target.id === g.id,
                  icon: <TeamLogo group={g} size={18} dark={tokens.dark} />,
                  onPress: () => selectTarget({ kind: "team", id: g.id }),
                }))}
              />
            ) : null}

            {liveBots.length > 0 ? (
              <TargetSelectorRow
                label={t("partnerSettings.partnersGroup")}
                colors={colors}
                items={liveBots.map((b) => ({
                  key: `bot:${b.id}`,
                  label: b.name || t("panel.untitledBot"),
                  active: target?.kind === "bot" && target.id === b.id,
                  icon: <Avatar avatar={b.avatar} size={18} dark={tokens.dark} />,
                  onPress: () => selectTarget({ kind: "bot", id: b.id }),
                }))}
              />
            ) : null}

            {onSaveGlobalWorkflows ? (
              <TargetSelectorRow
                label={t("workflows.templatesGroup")}
                colors={colors}
                items={[
                  {
                    key: "global:workflows",
                    label: t("workflows.globalTemplates"),
                    active: target?.kind === "workflows",
                    icon: <Icon name="GitBranch" size={16} color={target?.kind === "workflows" ? colors.accent : colors.foregroundMuted} />,
                    onPress: () => selectTarget({ kind: "workflows" }),
                  },
                ]}
              />
            ) : null}
          </View>
        ) : null}

        {target?.kind === "workflows" && onSaveGlobalWorkflows ? (
          <WorkflowListEditor
            colors={colors}
            title={t("workflows.globalTitle")}
            info={t("workflows.globalInfo")}
            workflows={globalWorkflows ?? []}
            bots={liveBots}
            onChange={onSaveGlobalWorkflows}
          />
        ) : selectedGroup ? (
          <TeamEditorForm
            key={selectedGroup.id}
            colors={colors}
            group={selectedGroup}
            groups={groups}
            bots={bots}
            onClose={handleClose}
            onSave={(draft) => onSaveTeam(selectedGroup.id, draft)}
            onDelete={onDeleteTeam ? () => onDeleteTeam(selectedGroup) : undefined}
          />
        ) : botPanelProps ? (
          <BotPanel
            key={selectedBot!.id}
            {...botPanelProps}
            section={botSection}
            onSection={setBotSection}
            onClose={handleClose}
            bottomInset={0}
            embedded
          />
        ) : (
          <View style={{ paddingVertical: 32, alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: ui(14), fontWeight: "600", color: colors.foreground }}>
              {t("partnerSettings.emptyTitle")}
            </Text>
            <Text style={{ fontSize: ui(13), color: colors.foregroundMuted, textAlign: "center" }}>
              {t("partnerSettings.emptyDesc")}
            </Text>
          </View>
        )}
      </Modal.Content>
    </Modal>
  );
}

interface SelectorItem {
  key: string;
  label: string;
  active: boolean;
  icon: ReactNode;
  onPress(): void;
}

/** Horizontal pill strip for one entity group (teams or partners). */
function TargetSelectorRow({ label, colors, items }: { label: string; colors: Colors; items: SelectorItem[] }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Text style={{ fontSize: ui(12), fontWeight: "500", color: colors.foregroundMuted, minWidth: 40 }}>
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 2 }}
      >
        {items.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected: item.active }}
            onPress={item.onPress}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 20,
              borderWidth: 0,
              backgroundColor: item.active ? colors.surface2 : colors.surface1,
            }}
          >
            {item.icon}
            <Text numberOfLines={1} style={{ fontSize: ui(13), fontWeight: "500", color: item.active ? colors.foreground : colors.foregroundMuted }}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
