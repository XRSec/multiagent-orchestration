import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import type { Bot, BotGroup, HistoryEntry, Library } from "../../shared/bot";
import { useBotHost, type LocalHost } from "../data";
import { formatBotProblems, useT, type TranslationKey } from "../i18n";
import { nativeTokens, useHover } from "../native";
import { ui } from "../typography";
import { AccessSection, ModelSection, PermissionsSection } from "./AgentSections";
import { Alert, SearchField, useCompact } from "./controls";
import { IdentitySection } from "./IdentitySection";
import { MemorySection, PlaybooksSection, SkillsSection, SoulSection } from "./KnowledgeSections";
import { HistorySection, OverviewSection, UsageSection } from "./OverviewSections";
import { RoutinesSection } from "./RoutinesSection";
import { tooltip } from "../ui/Tooltip";

type Colors = PluginTheme["colors"];

export type SectionId = "overview" | "identity" | "soul" | "skills" | "playbooks" | "memory" | "routines" | "access" | "model" | "permissions" | "history" | "usage";

interface SectionEntry {
  id: SectionId;
  labelKey: TranslationKey;
  icon: string;
  /** Setting names inside the section; search matches and lists them. */
  rowKeys: TranslationKey[];
  keywords: string;
  /** Browsing rather than settings: opens as a modal instead of a page. */
  modal?: boolean;
}

// OpenMausBot's order (bot-settings/sections.ts), minus sections Paseo has no equivalent for,
// grouped like Paseo's settings sidebar.
const GROUPS: { labelKey: TranslationKey; sections: SectionEntry[] }[] = [
  {
    labelKey: "panel.groupBot",
    sections: [
      { id: "overview", labelKey: "panel.sectionOverview", icon: "LayoutDashboard", rowKeys: ["panel.rowSetUpWithBot", "panel.rowSystemPrompt"], keywords: "overview summary setup prompt preview tokens set up with the bot system prompt" },
      { id: "identity", labelKey: "panel.sectionIdentity", icon: "IdCard", rowKeys: ["panel.rowAvatar", "panel.rowColour", "panel.rowShape", "panel.rowImageUrl", "panel.rowName", "panel.rowTitle", "panel.rowBlurb", "panel.rowVoice", "panel.rowReadReplies"], keywords: "identity avatar colour shape image url name title blurb voice read replies aloud description picture color face upload generate speech speak tts" },
      { id: "soul", labelKey: "panel.sectionSoul", icon: "ScrollText", rowKeys: ["panel.rowStandingInstructions"], keywords: "soul standing instructions system prompt behaviour behavior" },
    ],
  },
  {
    labelKey: "panel.groupKnowledge",
    sections: [
      { id: "skills", labelKey: "panel.sectionSkills", icon: "Puzzle", rowKeys: ["panel.rowLibrarySkills"], keywords: "skills skill library skills github SKILL.md library" },
      { id: "playbooks", labelKey: "panel.sectionPlaybooks", icon: "BookOpenCheck", rowKeys: ["panel.rowNewPlaybook", "panel.rowTriggerWords", "panel.rowSteps"], keywords: "playbooks playbook new playbook trigger words steps process guidance triggers procedure" },
      { id: "memory", labelKey: "panel.sectionMemory", icon: "Brain", rowKeys: ["panel.rowMemoryMd", "panel.rowTopicFiles", "panel.rowChanges", "panel.rowDailyLog", "panel.rowNewTopicFile"], keywords: "memory topic files changes daily log new topic file notes remember undo journal log" },
    ],
  },
  {
    labelKey: "panel.groupAutomation",
    sections: [{ id: "routines", labelKey: "panel.sectionRoutines", icon: "CalendarClock", rowKeys: ["panel.rowNewRoutine", "panel.rowCadence", "panel.rowRunNow"], keywords: "routines routine new routine cadence run now schedule daily interval cron automation" }],
  },
  {
    labelKey: "panel.groupAgent",
    sections: [
      { id: "access", labelKey: "panel.sectionAccess", icon: "KeyRound", rowKeys: ["panel.rowWorkingFolder", "panel.rowPaseoTools", "panel.rowMcpServers", "panel.rowConnectedApps", "panel.rowAlwaysAllowed"], keywords: "access working folder paseo tools mcp servers connected apps always allowed directory path tools apps composio gmail slack grants library" },
      { id: "model", labelKey: "panel.sectionModel", icon: "Sparkles", rowKeys: ["panel.rowHost", "panel.rowAgentProfile", "panel.rowProvider", "panel.rowModel", "panel.rowThinking"], keywords: "model host agent profile provider thinking effort reasoning" },
      { id: "permissions", labelKey: "panel.sectionPermissions", icon: "Shield", rowKeys: ["panel.rowMode", "panel.rowContactBots", "panel.rowAllowedCommands"], keywords: "permissions mode contact other bots allowed commands approval ask auto bots delegate commands allowlist shell" },
    ],
  },
  {
    labelKey: "panel.groupActivity",
    sections: [
      { id: "history", labelKey: "panel.sectionHistory", icon: "History", rowKeys: ["panel.rowEarlierVersions"], keywords: "history earlier versions undo restore changes", modal: true },
      { id: "usage", labelKey: "panel.sectionUsage", icon: "ChartNoAxesColumn", rowKeys: ["panel.rowChats", "panel.rowTokens", "panel.rowCost"], keywords: "usage chats tokens cost", modal: true },
    ],
  },
];

const SECTIONS = GROUPS.flatMap((group) => group.sections);

export function botSectionTitle(id: string | undefined): string | null {
  return SECTIONS.find((entry) => entry.id === id && !entry.modal)?.id ?? null;
}

export interface PanelProps {
  colors: Colors;
  bot: Bot;
  localHost: LocalHost;
  history: HistoryEntry[];
  /** The shared skills and MCP servers the bot picks from. */
  library: Library;
  groups: readonly BotGroup[];
  onPatch(patch: Partial<Bot>): void;
  /** Saves pending edits now (routines run from the saved bot). */
  flush(): Promise<void>;
  onRestore(snapshot: Bot): void;
  onSetup(): void;
  /** Shows one of the bot's chats (a routine run). */
  onOpenChat(chatId: string): void;
}

interface BotPanelProps extends PanelProps {
  /** Open section (detail view), or null for the section list. */
  section: SectionId | null;
  onSection(section: SectionId | null): void;
  onClose(): void;
  /** The surface's compact layout; falls back to the window width. */
  compact?: boolean;
  /** The home indicator on phones. */
  bottomInset: number;
  /** When embedded inside a parent scroll container (e.g. PartnerSettingsModal), omit outer ScrollView and close chrome. */
  embedded?: boolean;
  hostHeader?: boolean;
}

/**
 * Bot settings as Paseo's list+detail (docs/design.md §9) in its compact form: a
 * section list, and a pushed detail page whose header carries a back arrow.
 */
export function BotPanel(props: BotPanelProps) {
  const { t, locale } = useT();
  const { colors, bot, localHost, section, onSection, onClose, bottomInset, embedded = false } = props;
  const compact = useCompact(props.compact);
  const [query, setQuery] = useState("");
  const host = useBotHost(bot.hostId, localHost);
  const problems = formatBotProblems(t, bot, host.isLocal);
  const open = section ? SECTIONS.find((entry) => entry.id === section && !entry.modal) : undefined;
  const [sheet, setSheet] = useState<SectionEntry | null>(null);
  const choose = (entry: SectionEntry) => (entry.modal ? setSheet(entry) : onSection(entry.id));

  if (open) {
    const body = renderSection(open.id, props);
    return (
      <View style={embedded ? undefined : { flex: 1, backgroundColor: colors.surface0 }}>
        {props.hostHeader && !embedded ? null : (
          <PanelHeader
            colors={colors}
            compact={compact}
            title={t(open.labelKey)}
            onBack={() => onSection(null)}
            onClose={embedded ? undefined : onClose}
          />
        )}
        {embedded ? (
          <View style={{ paddingTop: 16, paddingBottom: 8 }}>{body}</View>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 24, paddingBottom: 32 + bottomInset }}>
            {body}
          </ScrollView>
        )}
      </View>
    );
  }

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? SECTIONS.flatMap((entry) => {
        const localizedRows = entry.rowKeys.map((key) => t(key));
        const rows = localizedRows.filter((row) => row.toLowerCase().includes(needle));
        const hit = rows.length > 0 || `${t(entry.labelKey)} ${entry.keywords}`.toLowerCase().includes(needle);
        return hit ? [{ entry, rows }] : [];
      })
    : [];

  const listContent = (
    <>
      <View style={{ paddingHorizontal: embedded ? 0 : 8, paddingTop: embedded ? 0 : 8, gap: 8 }}>
        <SearchField colors={colors} value={query} onChangeText={setQuery} placeholder={t("panel.searchSettings")} />
        {problems.length > 0 ? <Alert colors={colors} variant="warning" title={t("panel.needsAttention")} description={problems} /> : null}
      </View>
      {needle ? (
        <View style={{ paddingVertical: 8, paddingHorizontal: embedded ? 0 : 8, gap: 2 }}>
          {matches.map(({ entry, rows }) => (
            <SectionRow key={entry.id} colors={colors} compact={compact} entry={entry} hint={rows.join(locale === "zh-CN" ? "、" : ", ")} onPress={() => choose(entry)} />
          ))}
          {matches.length === 0 ? (
            <Text style={{ fontSize: ui(14), color: colors.foregroundMuted, textAlign: "center", paddingVertical: 32 }}>{t("panel.noSettingsMatch", { query: query.trim() })}</Text>
          ) : null}
        </View>
      ) : (
        GROUPS.map((group) => (
          <View key={group.labelKey} style={{ paddingVertical: 8, paddingHorizontal: embedded ? 0 : 8, gap: 2 }}>
            <Text style={{ fontSize: ui(14), color: nativeTokens(colors).foregroundExtraMuted, paddingHorizontal: 8, paddingVertical: 4 }}>{t(group.labelKey)}</Text>
            {group.sections.map((entry) => (
              <SectionRow key={entry.id} colors={colors} compact={compact} entry={entry} onPress={() => choose(entry)} />
            ))}
          </View>
        ))
      )}
    </>
  );

  return (
    <View style={embedded ? undefined : { flex: 1, backgroundColor: colors.surface0 }}>
      {embedded ? null : <PanelHeader colors={colors} compact={compact} title={bot.name || t("panel.untitledBot")} onClose={onClose} />}
      {embedded ? (
        <View style={{ paddingBottom: 8 }}>{listContent}</View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 + bottomInset }}>
          {listContent}
        </ScrollView>
      )}
      {sheet ? (
        <Modal title={t(sheet.labelKey)} open onOpenChange={(next) => !next && setSheet(null)}>
          <Modal.Content>{renderSection(sheet.id, props)}</Modal.Content>
        </Modal>
      ) : null}
    </View>
  );
}

function renderSection(id: SectionId, props: PanelProps): ReactNode {
  switch (id) {
    case "overview":
      return <OverviewSection {...props} />;
    case "identity":
      return <IdentitySection {...props} />;
    case "soul":
      return <SoulSection {...props} />;
    case "skills":
      return <SkillsSection {...props} />;
    case "playbooks":
      return <PlaybooksSection {...props} />;
    case "memory":
      return <MemorySection {...props} />;
    case "routines":
      return <RoutinesSection {...props} />;
    case "access":
      return <AccessSection {...props} />;
    case "model":
      return <ModelSection {...props} />;
    case "permissions":
      return <PermissionsSection {...props} />;
    case "history":
      return <HistorySection {...props} />;
    case "usage":
      return <UsageSection {...props} />;
  }
}

/**
 * Paseo's settings sidebar item (settings-screen.tsx sidebarStyles.item: 28 min height, 4/8
 * padding, radius 8, 16pt icon, muted 14pt label, surfaceSidebarHover on hover) with a
 * drill-in chevron when the detail replaces the list. Touch-sized (36) on compact.
 */
function SectionRow({ colors, compact, entry, hint, onPress }: { colors: Colors; compact: boolean; entry: SectionEntry; hint?: string; onPress(): void }) {
  const { t } = useT();
  const { hovered, hoverProps } = useHover();
  const label = t(entry.labelKey);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: compact ? 36 : 28,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: hovered || pressed ? colors.surface1 : "transparent",
      })}
    >
      <Icon name={entry.icon} size={16} color={hovered ? colors.foreground : colors.foregroundMuted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: ui(14), color: hovered ? colors.foreground : colors.foregroundMuted }}>
          {label}
        </Text>
        {hint ? (
          <Text numberOfLines={1} style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
            {hint}
          </Text>
        ) : null}
      </View>
      {entry.modal ? null : <Icon name="ChevronRight" size={14} color={colors.foregroundMuted} />}
    </Pressable>
  );
}

/**
 * One header row: the bot name on the list, a back arrow and the section title on a
 * detail page (BackHeader), and the close button. 36 high on desktop, 48 on compact;
 * the title is ScreenTitle (14pt, weight 300 desktop / 400 compact).
 */
function PanelHeader({ colors, compact, title, onBack, onClose }: { colors: Colors; compact: boolean; title: string; onBack?: () => void; onClose?: () => void }) {
  const { t } = useT();
  return (
    <View
      style={{
        height: compact ? 56 : 36,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: onBack ? 4 : compact ? 16 : 12,
        paddingRight: compact ? 8 : 4,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.surface0,
      }}
    >
      {onBack ? <HeaderButton colors={colors} compact={compact} icon="ArrowLeft" label={t("panel.backToBotSettings")} iconSize={20} onPress={onBack} /> : null}
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: ui(14), fontWeight: compact ? "400" : "300", color: colors.foreground }}>
        {title}
      </Text>
      {onClose ? <HeaderButton colors={colors} compact={compact} icon="X" label={t("panel.closeBotSettings")} iconSize={18} onPress={onClose} /> : null}
    </View>
  );
}

/** Header control: 34 box on desktop, 32 on compact; interactionHighlight on hover and press. */
function HeaderButton({ colors, compact, icon, label, iconSize, onPress }: { colors: Colors; compact: boolean; icon: string; label: string; iconSize: number; onPress(): void }) {
  const { hovered, hoverProps } = useHover();
  const box = compact ? 32 : 34;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...tooltip(label, "bottom")}
      hitSlop={8}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => ({
        width: box,
        height: box,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: hovered || pressed ? nativeTokens(colors).interactionHighlight : "transparent",
      })}
    >
      <Icon name={icon} size={iconSize} color={hovered ? colors.foreground : colors.foregroundMuted} />
    </Pressable>
  );
}
