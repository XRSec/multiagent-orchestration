import { useHosts, useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Modal, SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { APPS_MCP_NAME } from "../../shared/apps";
import { botMcpServers, providerBaseTools, toolGrants, type Bot, type BotProviderConfig, type FallbackModel } from "../../shared/bot";
import { TOOLS_MCP_NAME } from "../../shared/bot-tools";
import { commandListRpc, commandRemoveRpc } from "../../shared/rpc";
import { useAgentProfiles, useBotHost, useHostProjects, usePaseoTools, useProviders } from "../data";
import { formatPluralCount, useT } from "../i18n";
import { errorText, nativeTokens, useHover } from "../native";
import { ui } from "../typography";
import { measureAnchor, useMenu } from "../ui/Menu";
import { tooltip } from "../ui/Tooltip";
import type { PanelProps } from "./BotPanel";
import { AdvancedToggle, CardNote, DrillRow, InputField, SectionMeta, StatusBadge, TextAreaField } from "./controls";
import { AppsPicker } from "./AppsPicker";
import { LibraryPicker } from "./LibraryPicker";

const MANAGED = "__managed__";
const ABSOLUTE_PATH = /^(\/|~(\/|$)|[A-Za-z]:[\\/]|\\\\)/;

// ---------------------------------------------------------------- access

export function AccessSection(props: PanelProps) {
  const { t } = useT();
  const { colors, bot, localHost, onPatch } = props;
  // A folder, mounted paths, or grants already set count as in use, so they show.
  const [advanced, setAdvanced] = useState(bot.cwd !== null || (bot.mounts?.length ?? 0) > 0 || bot.alwaysAllow.length > 0);
  return (
    <>
      <PaseoToolsSection colors={colors} bot={bot} localHost={localHost} />
      <LibraryPicker {...props} kind="mcp" title={t("panel.rowMcpServers")} info={t("panel.mcpServersInfo")} />
      <AppsPicker colors={colors} bot={bot} localHost={localHost} onPatch={onPatch} />
      <AdvancedToggle colors={colors} open={advanced} onToggle={() => setAdvanced(!advanced)} />
      {advanced ? (
        <>
          <FolderSection {...props} />
          <MountsSection {...props} />
          <GrantsSection {...props} />
        </>
      ) : null}
    </>
  );
}

function FolderSection({ colors, bot, localHost, onPatch }: PanelProps) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const projects = useHostProjects(host);
  const [pathText, setPathText] = useState(bot.cwd ?? "");
  // Picking a folder from the list rewrites the path field; remounting resets its text.
  const [pathKey, setPathKey] = useState(0);
  const options = [
    ...(host.isLocal ? [{ label: t("panel.shared"), value: MANAGED }] : []),
    ...(projects.data ?? []).map((project) => ({ label: project.label, value: project.directory })),
  ];
  const folderValue = bot.cwd === null ? (host.isLocal ? MANAGED : t("panel.chooseAFolder")) : options.some((option) => option.value === bot.cwd) ? bot.cwd : t("common.custom");
  const pathError = pathText.trim() && !ABSOLUTE_PATH.test(pathText.trim()) ? t("panel.useAbsolutePath") : null;
  return (
    <SettingsSection title={t("panel.rowWorkingFolder")} info={t("panel.workingFolderInfo")}>
      <SettingsCard>
        <SettingsSelect
          label={t("panel.folderLabel")}
          value={folderValue}
          options={options}
          onValueChange={(next) => {
            const cwd = next === MANAGED ? null : next;
            onPatch({ cwd });
            setPathText(cwd ?? "");
            setPathKey((key) => key + 1);
          }}
        />
        <InputField
          colors={colors}
          key={pathKey}
          label={t("panel.pathLabel")}
          hint={host.isLocal ? t("panel.emptyUsesShared") : t("panel.folderOnBotsHost")}
          error={pathError}
          initialValue={pathText}
          placeholder={host.isLocal ? t("panel.sharedBotsFolder") : "/Users/me/work"}
          onChangeText={(text) => {
            setPathText(text);
            const trimmed = text.trim();
            if (!trimmed) onPatch({ cwd: null });
            else if (ABSOLUTE_PATH.test(trimmed)) onPatch({ cwd: trimmed });
          }}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

function MountRow({
  colors,
  path,
  options,
  onChangePath,
  onRemove,
}: {
  colors: PanelProps["colors"];
  path: string;
  options: { label: string; value: string }[];
  onChangePath(next: string, commit: boolean): void;
  onRemove(): void;
}) {
  const { t } = useT();
  const [pathKey, setPathKey] = useState(0);
  const selected = options.some((option) => option.value === path) ? path : path.trim() ? t("common.custom") : t("panel.chooseAFolder");
  const pathError = path.trim() && !ABSOLUTE_PATH.test(path.trim()) ? t("panel.useAbsolutePath") : null;
  return (
    <>
      <SettingsSelect
        label={t("panel.mountProjectLabel")}
        value={selected}
        options={options}
        onValueChange={(next) => {
          onChangePath(next, true);
          setPathKey((key) => key + 1);
        }}
      />
      <InputField
        colors={colors}
        key={pathKey}
        label={t("panel.pathLabel")}
        error={pathError}
        initialValue={path}
        placeholder="/Users/me/project"
        onChangeText={(text) => {
          const trimmed = text.trim();
          onChangePath(text, Boolean(trimmed && ABSOLUTE_PATH.test(trimmed)));
        }}
      />
      <SettingsAction label={t("panel.removeMount")} actionLabel={t("common.remove")} onPress={onRemove} />
    </>
  );
}

function MountsSection({ colors, bot, localHost, onPatch }: PanelProps) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const projects = useHostProjects(host);
  const [botId, setBotId] = useState(bot.id);
  const [rows, setRows] = useState<string[]>(bot.mounts ?? []);
  if (botId !== bot.id) {
    setBotId(bot.id);
    setRows(bot.mounts ?? []);
  }
  const options = (projects.data ?? []).map((project) => ({ label: project.label, value: project.directory }));

  const commitRows = (nextRows: string[]) => {
    const valid: string[] = [];
    for (const raw of nextRows) {
      const trimmed = raw.trim();
      if (trimmed && ABSOLUTE_PATH.test(trimmed) && !valid.includes(trimmed)) valid.push(trimmed);
    }
    onPatch({ mounts: valid });
  };

  return (
    <SettingsSection
      title={t("panel.mountsSection")}
      info={t("panel.mountsInfo")}
      trailing={<InlineActionButton colors={colors} label={t("panel.addMount")} onPress={() => setRows((prev) => [...prev, ""])} />}
    >
      <SettingsCard>
        {rows.length === 0 ? <CardNote colors={colors} text={t("panel.noMountsYet")} /> : null}
        {rows.map((path, index) => (
          <MountRow
            key={`${bot.id}-${index}`}
            colors={colors}
            path={path}
            options={options}
            onChangePath={(next, shouldCommit) => {
              const updated = rows.map((entry, idx) => (idx === index ? next : entry));
              setRows(updated);
              if (shouldCommit) commitRows(updated);
            }}
            onRemove={() => {
              const updated = rows.filter((_, idx) => idx !== index);
              setRows(updated);
              commitRows(updated);
            }}
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

function GrantsSection({ colors, bot, library, localHost, onPatch }: PanelProps) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const [allowText, setAllowText] = useState(bot.alwaysAllow.join("\n"));
  const lines = allowText.split("\n").map((line) => line.trim()).filter(Boolean);
  const servers = botMcpServers(bot, library);
  const oauthNeedsProviderApproval = bot.provider !== "claude" && servers.some((server) => server.config.type !== "stdio" && server.config.oauth);
  // Only grants for the bot's own servers are sent; Paseo rejects the rest.
  const active = new Set([...servers.map((server) => server.name), ...(host.isLocal && bot.apps.length ? [APPS_MCP_NAME] : []), ...(host.isLocal ? [TOOLS_MCP_NAME] : [])]);
  const grants = toolGrants(lines).filter((grant) => active.has(grant.server));
  const ignored = lines.length - grants.length;
  return (
    <SettingsSection
      title={t("panel.rowAlwaysAllowed")}
      info={t("panel.alwaysAllowedInfo")}
      trailing={<SectionMeta colors={colors} text={`${t("panel.grantsCount", { valid: grants.length })}${ignored ? t("panel.grantsIgnoredSuffix", { ignored }) : ""}`} tone={ignored ? "warning" : undefined} />}
    >
      <SettingsCard>
        {oauthNeedsProviderApproval ? <SettingsRow label="OAuth approvals" hint="With this Paseo version, automatic approval of individual OAuth tools is available only with Claude. Other providers use their normal approval prompts." /> : null}
        <TextAreaField
          colors={colors}
          monospace
          accessibilityLabel={t("panel.alwaysAllowedA11y")}
          value={allowText}
          onChangeText={(text) => {
            setAllowText(text);
            onPatch({ alwaysAllow: text.split("\n").map((line) => line.trim()).filter(Boolean) });
          }}
          autoCapitalize="none"
          autoCorrect={false}
          minHeight={72}
          placeholder={"gmail/search_threads\nfetch/fetch"}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

/**
 * Paseo adds its own tools (other agents, workspaces, terminals, schedules, the
 * browser) to every agent it starts, bots included. Whether it does is a host
 * setting, so this shows it and can turn it back on.
 */
function PaseoToolsSection({ colors, bot, localHost }: Pick<PanelProps, "colors" | "bot" | "localHost">) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const tools = usePaseoTools(host, bot.provider);
  const [busy, setBusy] = useState(false);
  const state = tools.state;
  const label = !state ? (tools.loading ? t("panel.checking") : t("panel.couldntReadHostSettings")) : state.on ? t("panel.includedInEveryChat") : t("panel.turnedOff");
  const hint = !state
    ? null
    : state.on
      ? t("panel.paseoToolsIncludedHint")
      : state.reason === "provider"
        ? t("panel.offForProviderOnHost", { provider: bot.provider, host: host.label })
        : state.reason === "host"
          ? t("panel.offForEveryAgentOnHost", { host: host.label })
          : t("panel.paseoMcpOffOnHost", { host: host.label });
  return (
    <SettingsSection title={t("panel.rowPaseoTools")} info={t("panel.paseoToolsInfo")}>
      <SettingsCard>
        {state && !state.on && state.reason !== "mcp" ? (
          <SettingsAction
            label={label}
            hint={hint ?? undefined}
            actionLabel={busy ? t("panel.turningOn") : t("panel.turnOn")}
            disabled={busy}
            onPress={() => {
              setBusy(true);
              void tools.turnOn().finally(() => setBusy(false));
            }}
          />
        ) : (
          <SettingsRow label={label} hint={hint ?? undefined}>
            {state?.on ? <StatusBadge colors={colors} label={t("common.on")} variant="success" /> : null}
          </SettingsRow>
        )}
      </SettingsCard>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------- model

type SelectOption = { label: string; value: string };

const INLINE_ROW_STYLE = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  alignItems: "center" as const,
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 16,
};

function InlineSelect({
  colors,
  label,
  menuTitle,
  value,
  options,
  placeholder,
  disabled,
  onValueChange,
}: {
  colors: PanelProps["colors"];
  label: string;
  menuTitle: string;
  value: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onValueChange(value: string): void;
}) {
  const menu = useMenu();
  const ref = useRef<View>(null);
  const tokens = nativeTokens(colors);
  const { hovered, hoverProps } = useHover();
  const selected = options.find((opt) => opt.value === value);
  const displayText = selected?.label ?? (placeholder || value);
  const isMuted = !selected && !!placeholder;

  const openMenu = () => {
    if (disabled || options.length === 0) return;
    void measureAnchor(ref).then((anchor) => {
      menu.open({
        anchor: anchor ?? { x: 0, y: 0, width: 0, height: 0 },
        title: menuTitle,
        entries: options.map((opt) => ({
          label: opt.label,
          selected: opt.value === value,
          onSelect: () => onValueChange(opt.value),
        })),
      });
    });
  };

  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${menuTitle}: ${label}`}
        disabled={disabled || options.length === 0}
        onPress={openMenu}
        {...hoverProps}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          minHeight: 30,
          maxWidth: "100%",
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: hovered ? tokens.borderAccent : colors.border,
          backgroundColor: pressed ? tokens.surface3 : hovered ? colors.surface2 : colors.surface1,
          opacity: disabled ? 0.5 : 1,
        })}
      >
        <Text numberOfLines={1} style={{ fontSize: ui(13), color: isMuted ? colors.foregroundMuted : colors.foreground, flexShrink: 1 }}>
          {displayText}
        </Text>
        <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
      </Pressable>
    </View>
  );
}

function InlineActionButton({ colors, label, onPress }: { colors: PanelProps["colors"]; label: string; onPress(): void }) {
  const tokens = nativeTokens(colors);
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => ({
        minHeight: 28,
        paddingHorizontal: 10,
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: hovered ? tokens.borderAccent : colors.border,
        backgroundColor: pressed ? tokens.surface3 : hovered ? colors.surface2 : "transparent",
      })}
    >
      <Text numberOfLines={1} style={{ fontSize: ui(12), color: hovered ? colors.foreground : colors.foregroundMuted }}>
        {label}
      </Text>
    </Pressable>
  );
}

function InlineRemoveButton({ colors, label, onPress }: { colors: PanelProps["colors"]; label: string; onPress(): void }) {
  const tokens = nativeTokens(colors);
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      {...tooltip(label)}
      hitSlop={6}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => ({
        width: 28,
        height: 28,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 6,
        backgroundColor: pressed ? tokens.surface3 : hovered ? colors.surface2 : "transparent",
      })}
    >
      <Icon name="X" size={13} color={hovered ? colors.statusDanger : colors.foregroundMuted} />
    </Pressable>
  );
}

function AddPickerRow({
  colors,
  label,
  menuTitle,
  options,
  indented,
  onSelect,
}: {
  colors: PanelProps["colors"];
  label: string;
  menuTitle: string;
  options: SelectOption[];
  indented?: boolean;
  onSelect(value: string): void;
}) {
  const menu = useMenu();
  const ref = useRef<View>(null);
  const tokens = nativeTokens(colors);
  const { hovered, hoverProps } = useHover();

  const openMenu = () => {
    if (options.length === 0) return;
    void measureAnchor(ref).then((anchor) => {
      menu.open({
        anchor: anchor ?? { x: 0, y: 0, width: 0, height: 0 },
        title: menuTitle,
        entries: options.map((opt) => ({
          label: opt.label,
          onSelect: () => onSelect(opt.value),
        })),
      });
    });
  };

  return (
    <View ref={ref} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={openMenu}
        {...hoverProps}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          paddingVertical: indented ? 8 : 12,
          paddingLeft: indented ? 32 : 16,
          paddingRight: 16,
          backgroundColor: pressed ? tokens.surface3 : hovered ? colors.surface2 : "transparent",
        })}
      >
        <Icon name="Plus" size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
        <Text numberOfLines={1} style={{ fontSize: ui(13), color: hovered ? colors.foreground : colors.foregroundMuted }}>
          {label}
        </Text>
      </Pressable>
    </View>
  );
}

type FallbackModelOption = {
  id: string;
  label: string;
  thinkingOptions?: Array<{ id: string; label: string }>;
};

const MAX_FALLBACK_MODELS = 3;

/** Renders ordered fallback model rows and an add-fallback picker for a provider config. */
function FallbackRows({
  colors,
  models,
  primaryModel,
  fallbacks,
  indented,
  onChange,
}: {
  colors: PanelProps["colors"];
  models: FallbackModelOption[];
  primaryModel: string | null;
  fallbacks: FallbackModel[];
  indented?: boolean;
  onChange(next: FallbackModel[]): void;
}) {
  const { t } = useT();
  const unusedFallbackModels = models.filter((m) => m.id !== primaryModel && !fallbacks.some((f) => f.model === m.id));
  const rowStyle = indented ? { ...INLINE_ROW_STYLE, paddingLeft: 32, paddingVertical: 8 } : INLINE_ROW_STYLE;

  return (
    <>
      {fallbacks.map((fb, idx) => {
        const fbModel = models.find((m) => m.id === fb.model);
        const fbThinking = fbModel?.thinkingOptions ?? [];
        const slotModelOptions: SelectOption[] = models
          .filter((m) => m.id === fb.model || (m.id !== primaryModel && !fallbacks.some((f, i) => i !== idx && f.model === m.id)))
          .map((m) => ({ label: m.label, value: m.id }));
        const slotThinkingOptions: SelectOption[] = [
          { label: `${t("panel.rowThinking")}: ${t("common.default")}`, value: "" },
          ...fbThinking.map((opt) => ({ label: opt.label, value: opt.id })),
        ];
        return (
          <View key={`${fb.model}-${idx}`} style={rowStyle}>
            <StatusBadge colors={colors} label={t("panel.fallbackBadge", { index: idx + 1 })} variant="muted" />
            <InlineSelect
              colors={colors}
              label={fbModel?.label ?? fb.model}
              menuTitle={t("panel.rowModel")}
              value={fb.model}
              options={slotModelOptions}
              onValueChange={(value) => {
                const next = fallbacks.map((item, i) => (i === idx ? { model: value, thinkingOptionId: null } : item));
                onChange(next);
              }}
            />
            {fbThinking.length > 0 ? (
              <InlineSelect
                colors={colors}
                label={fbThinking.find((opt) => opt.id === fb.thinkingOptionId)?.label ?? t("common.default")}
                menuTitle={t("panel.rowThinking")}
                value={fb.thinkingOptionId ?? ""}
                options={slotThinkingOptions}
                onValueChange={(val) => {
                  const next = fallbacks.map((item, i) => (i === idx ? { ...item, thinkingOptionId: val || null } : item));
                  onChange(next);
                }}
              />
            ) : null}
            <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
              <InlineRemoveButton
                colors={colors}
                label={t("common.remove")}
                onPress={() => {
                  const next = fallbacks.filter((_, i) => i !== idx);
                  onChange(next);
                }}
              />
            </View>
          </View>
        );
      })}
      {models.length > 1 && unusedFallbackModels.length > 0 && fallbacks.length < MAX_FALLBACK_MODELS ? (
        <AddPickerRow
          colors={colors}
          label={t("panel.addFallbackModel")}
          menuTitle={t("panel.addFallbackModel")}
          indented={indented}
          options={unusedFallbackModels.map((m) => ({ label: m.label, value: m.id }))}
          onSelect={(value) => {
            onChange([...fallbacks, { model: value, thinkingOptionId: null }]);
          }}
        />
      ) : null}
    </>
  );
}

export function ModelSection({ colors, bot, localHost, onPatch }: PanelProps) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const hosts = useHosts();
  const providers = useProviders(host);
  const profiles = useAgentProfiles(host);
  const provider = providers.data?.find((entry) => entry.provider === bot.provider);
  const models = (provider?.models ?? []).filter((model) => model.isSelectable !== false);
  const model = models.find((entry) => entry.id === bot.model);
  const thinking = model?.thinkingOptions ?? models.find((entry) => entry.isDefault)?.thinkingOptions ?? [];
  const profile = (profiles.data ?? []).find((entry) => entry.provider === bot.provider && (entry.model ?? null) === bot.model);
  const providerPlaceholder = providers.isLoading ? t("common.loading") : t("panel.chooseProvider");
  // Another host counts as in use, so it shows.
  const [advanced, setAdvanced] = useState(bot.hostId !== null);

  const providerOptions: SelectOption[] = (providers.data ?? []).map((entry) => ({
    label: (entry.label ?? entry.provider) + (entry.status === "ready" ? "" : ` (${entry.status})`),
    value: entry.provider,
  }));
  const primaryModelOptions: SelectOption[] = provider
    ? [{ label: `${t("panel.rowModel")}: ${t("common.default")}`, value: "" }, ...models.map((entry) => ({ label: entry.label, value: entry.id }))]
    : [];
  const primaryThinkingOptions: SelectOption[] = [
    { label: `${t("panel.rowThinking")}: ${t("common.default")}`, value: "" },
    ...thinking.map((option) => ({ label: option.label, value: option.id })),
  ];

  const fallbacks = bot.fallbackModels ?? [];
  const showFallbackSection = Boolean(provider && (models.length > 1 || fallbacks.length > 0));

  const primaryConfig: BotProviderConfig = {
    provider: bot.provider,
    model: bot.model,
    modeId: bot.modeId,
    thinkingOptionId: bot.thinkingOptionId,
    fallbackModels: fallbacks,
    ...(bot.baseTools !== undefined ? { baseTools: bot.baseTools } : {}),
  };
  const extraProviders = (bot.providerConfigs ?? []).slice(1);

  return (
    <>
      <SettingsSection title={t("panel.agentSection")} info={t("panel.agentSectionInfo")}>
        <SettingsCard>
          <View style={INLINE_ROW_STYLE}>
            <StatusBadge colors={colors} label={t("common.default")} variant="success" />
            <InlineSelect
              colors={colors}
              label={provider ? (provider.label ?? provider.provider) : (bot.provider || providerPlaceholder)}
              menuTitle={t("panel.rowProvider")}
              value={bot.provider}
              placeholder={providerPlaceholder}
              disabled={providers.isLoading}
              options={providerOptions}
              onValueChange={(value) => {
                const entry = providers.data?.find((candidate) => candidate.provider === value);
                const matchedConfig = bot.providerConfigs?.find((candidate) => candidate.provider === value);
                onPatch({
                  provider: value,
                  model: null,
                  modeId: entry?.defaultModeId ?? null,
                  thinkingOptionId: null,
                  fallbackModels: [],
                  ...(matchedConfig?.baseTools !== undefined ? { baseTools: matchedConfig.baseTools } : {}),
                });
              }}
            />
            <InlineSelect
              colors={colors}
              label={model?.label ?? (provider ? (bot.model ?? t("common.default")) : (bot.model ?? t("panel.chooseProviderFirst")))}
              menuTitle={t("panel.rowModel")}
              value={provider ? (bot.model ?? "") : ""}
              placeholder={provider ? undefined : t("panel.chooseProviderFirst")}
              disabled={!provider}
              options={primaryModelOptions}
              onValueChange={(value) => onPatch({ model: value || null, thinkingOptionId: null })}
            />
            {thinking.length > 0 ? (
              <InlineSelect
                colors={colors}
                label={thinking.find((opt) => opt.id === bot.thinkingOptionId)?.label ?? t("common.default")}
                menuTitle={t("panel.rowThinking")}
                value={bot.thinkingOptionId ?? ""}
                options={primaryThinkingOptions}
                onValueChange={(value) => onPatch({ thinkingOptionId: value || null })}
              />
            ) : null}
          </View>
          {providers.isError ? (
            <SettingsAction
              label={t("panel.providersLoadError", { label: host.label })}
              actionLabel={t("chat.retry")}
              onPress={() => void providers.refetch()}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>

      {showFallbackSection ? (
        <SettingsSection title={t("panel.fallbackModelsSection")} info={t("panel.fallbackModelsInfo")}>
          <SettingsCard>
            <FallbackRows
              colors={colors}
              models={models}
              primaryModel={bot.model}
              fallbacks={fallbacks}
              onChange={(next) =>
                onPatch({
                  fallbackModels: next,
                  ...(extraProviders.length > 0
                    ? { providerConfigs: [{ ...primaryConfig, fallbackModels: next }, ...extraProviders] }
                    : {}),
                })
              }
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      {providers.data && providers.data.length > 0 ? (
        <SettingsSection title={t("panel.additionalProvidersSection")} info={t("panel.additionalProvidersInfo")}>
          <SettingsCard>
            {extraProviders.map((cfg, idx) => {
              const cfgProvider = providers.data?.find((entry) => entry.provider === cfg.provider);
              const cfgModels = (cfgProvider?.models ?? []).filter((m) => m.isSelectable !== false);
              const cfgModel = cfgModels.find((m) => m.id === cfg.model);
              const cfgThinking = cfgModel?.thinkingOptions ?? cfgModels.find((m) => m.isDefault)?.thinkingOptions ?? [];
              const cfgModelOptions: SelectOption[] = [
                { label: `${t("panel.rowModel")}: ${t("common.default")}`, value: "" },
                ...cfgModels.map((m) => ({ label: m.label, value: m.id })),
              ];
              const cfgThinkingOptions: SelectOption[] = [
                { label: `${t("panel.rowThinking")}: ${t("common.default")}`, value: "" },
                ...cfgThinking.map((opt) => ({ label: opt.label, value: opt.id })),
              ];
              return (
                <View key={`${cfg.provider}-${idx}`}>
                  <View style={INLINE_ROW_STYLE}>
                    <InlineSelect
                      colors={colors}
                      label={cfgProvider?.label ?? cfg.provider}
                      menuTitle={t("panel.rowProvider")}
                      value={cfg.provider}
                      options={providerOptions}
                      onValueChange={(value) => {
                        const entry = providers.data?.find((candidate) => candidate.provider === value);
                        const nextExtras = extraProviders.map((item, i) =>
                          i === idx
                            ? { provider: value, model: null, modeId: entry?.defaultModeId ?? null, thinkingOptionId: null, fallbackModels: [] }
                            : item,
                        );
                        onPatch({ providerConfigs: [primaryConfig, ...nextExtras] });
                      }}
                    />
                    {cfgModels.length > 0 ? (
                      <InlineSelect
                        colors={colors}
                        label={cfgModel?.label ?? t("common.default")}
                        menuTitle={t("panel.rowModel")}
                        value={cfg.model ?? ""}
                        options={cfgModelOptions}
                        onValueChange={(value) => {
                          const nextExtras = extraProviders.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  model: value || null,
                                  thinkingOptionId: null,
                                  fallbackModels: (item.fallbackModels ?? []).filter((f) => f.model !== value),
                                }
                              : item,
                          );
                          onPatch({ providerConfigs: [primaryConfig, ...nextExtras] });
                        }}
                      />
                    ) : null}
                    {cfgThinking.length > 0 ? (
                      <InlineSelect
                        colors={colors}
                        label={cfgThinking.find((opt) => opt.id === cfg.thinkingOptionId)?.label ?? t("common.default")}
                        menuTitle={t("panel.rowThinking")}
                        value={cfg.thinkingOptionId ?? ""}
                        options={cfgThinkingOptions}
                        onValueChange={(value) => {
                          const nextExtras = extraProviders.map((item, i) =>
                            i === idx ? { ...item, thinkingOptionId: value || null } : item,
                          );
                          onPatch({ providerConfigs: [primaryConfig, ...nextExtras] });
                        }}
                      />
                    ) : null}
                    <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <InlineActionButton
                        colors={colors}
                        label={t("panel.setDefault")}
                        onPress={() => {
                          const swappedExtras = extraProviders.map((item, i) => (i === idx ? primaryConfig : item));
                          onPatch({
                            provider: cfg.provider,
                            model: cfg.model,
                            modeId: cfg.modeId,
                            thinkingOptionId: cfg.thinkingOptionId,
                            fallbackModels: cfg.fallbackModels ?? [],
                            ...(cfg.baseTools !== undefined ? { baseTools: cfg.baseTools } : {}),
                            providerConfigs: [cfg, ...swappedExtras],
                          });
                        }}
                      />
                      <InlineRemoveButton
                        colors={colors}
                        label={t("common.remove")}
                        onPress={() => {
                          const nextExtras = extraProviders.filter((_, i) => i !== idx);
                          onPatch({ providerConfigs: nextExtras.length > 0 ? [primaryConfig, ...nextExtras] : [] });
                        }}
                      />
                    </View>
                  </View>
                  {cfgModels.length > 1 || (cfg.fallbackModels?.length ?? 0) > 0 ? (
                    <FallbackRows
                      colors={colors}
                      models={cfgModels}
                      primaryModel={cfg.model}
                      fallbacks={cfg.fallbackModels ?? []}
                      indented
                      onChange={(next) => {
                        const nextExtras = extraProviders.map((item, i) =>
                          i === idx ? { ...item, fallbackModels: next } : item,
                        );
                        onPatch({ providerConfigs: [primaryConfig, ...nextExtras] });
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
            <AddPickerRow
              colors={colors}
              label={t("panel.addProvider")}
              menuTitle={t("panel.addProvider")}
              options={providerOptions}
              onSelect={(value) => {
                const entry = providers.data?.find((candidate) => candidate.provider === value);
                const added: BotProviderConfig = {
                  provider: value,
                  model: null,
                  modeId: entry?.defaultModeId ?? null,
                  thinkingOptionId: null,
                  fallbackModels: [],
                };
                onPatch({ providerConfigs: [primaryConfig, ...extraProviders, added] });
              }}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <AdvancedToggle colors={colors} open={advanced} onToggle={() => setAdvanced(!advanced)} />
      {advanced ? (
        <SettingsSection title={t("panel.whereItRunsSection")} info={t("panel.whereItRunsInfo")}>
          <SettingsCard>
            <SettingsSelect
              label={t("panel.rowHost")}
              hint={host.isLocal ? t("panel.thisHost") : undefined}
              error={host.online ? null : t("panel.hostOfflineError", { label: host.label })}
              value={bot.hostId ?? ""}
              options={[
                { label: localHost.label, value: "" },
                ...hosts
                  .filter((entry) => entry.serverId !== localHost.id)
                  .map((entry) => ({ label: `${entry.label}${entry.status === "online" ? "" : ` (${entry.status === "offline" ? t("common.offline") : entry.status})`}`, value: entry.serverId })),
              ]}
              onValueChange={(value) => onPatch({ hostId: value || null, provider: "", model: null, modeId: null, thinkingOptionId: null, fallbackModels: [], cwd: value ? bot.cwd : null })}
            />
            {(profiles.data ?? []).length > 0 ? (
              <SettingsSelect
                label={t("panel.rowAgentProfile")}
                hint={t("panel.agentProfileHint")}
                value={profile?.id ?? ""}
                options={[
                  { label: t("common.custom"), value: "" },
                  ...profiles.data!.map((entry) => ({ label: entry.name, value: entry.id })),
                ]}
                onValueChange={(id) => {
                  if (!id) {
                    onPatch({ model: null, modeId: null, thinkingOptionId: null, fallbackModels: [] });
                    return;
                  }
                  const chosen = profiles.data?.find((entry) => entry.id === id);
                  if (chosen) onPatch({ provider: chosen.provider, model: chosen.model ?? null, modeId: chosen.modeId ?? null, thinkingOptionId: chosen.thinkingOptionId ?? null, fallbackModels: [] });
                }}
              />
            ) : null}
          </SettingsCard>
        </SettingsSection>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------- permissions

export function PermissionsSection({ colors, bot, localHost, onPatch }: PanelProps) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const providers = useProviders(host);
  const provider = providers.data?.find((entry) => entry.provider === bot.provider);
  const modes = provider?.modes ?? [];
  const current = modes.find((mode) => mode.id === (bot.modeId ?? provider?.defaultModeId));
  return (
    <>
      <SettingsSection title={t("panel.approvalSection")} info={t("panel.approvalInfo")}>
        <SettingsCard>
          <SettingsSelect
            label={t("panel.rowMode")}
            hint={provider ? (current?.description ? `${current.label}: ${current.description}` : undefined) : t("panel.pickProviderForModes")}
            value={provider ? (bot.modeId ?? "") : t("panel.chooseProviderFirst")}
            disabled={!provider}
            options={provider ? [{ label: t("common.default"), value: "" }, ...modes.map((mode) => ({ label: mode.label, value: mode.id }))] : []}
            onValueChange={(value) => onPatch({ modeId: value || null })}
          />
        </SettingsCard>
      </SettingsSection>
      <BaseToolsSection colors={colors} bot={bot} onPatch={onPatch} />
      {host.isLocal ? (
        <SettingsSection title={t("panel.otherBotsSection")} info={t("panel.otherBotsInfo")}>
          <SettingsCard>
            <SettingsSelect
              label={t("panel.rowContactBots")}
              hint={bot.contactBots === "ask" ? t("panel.contactBotsAskHint") : bot.contactBots === "allow" ? t("panel.contactBotsAllowHint") : t("panel.contactBotsOffHint")}
              value={bot.contactBots}
              options={[
                { label: t("settings.defaults.contactAsk"), value: "ask" },
                { label: t("settings.defaults.contactAllow"), value: "allow" },
                { label: t("settings.defaults.contactOff"), value: "off" },
              ]}
              onValueChange={(contactBots) => onPatch({ contactBots })}
            />
          </SettingsCard>
        </SettingsSection>
      ) : null}
      {host.isLocal ? <AllowedCommands colors={colors} bot={bot} /> : null}
    </>
  );
}

function BaseToolsSection({ colors, bot, onPatch }: Pick<PanelProps, "colors" | "bot" | "onPatch">) {
  const { t } = useT();
  const availableTools = providerBaseTools(bot.provider);
  const isCustom = bot.baseTools !== undefined;
  const isEnabled = (tool: string) => (isCustom ? (bot.baseTools?.includes(tool) ?? false) : true);
  const enabledCount = availableTools.filter(isEnabled).length;

  const patchBaseTools = (next: string[] | undefined) => {
    const patch: Partial<Bot> = { baseTools: next };
    if (bot.providerConfigs && bot.providerConfigs.length > 0) {
      patch.providerConfigs = bot.providerConfigs.map((cfg, idx) => {
        if (idx === 0 || cfg.provider === bot.provider) {
          return { ...cfg, baseTools: next };
        }
        return cfg;
      });
    }
    onPatch(patch);
  };

  return (
    <SettingsSection
      title={t("panel.baseToolsSection")}
      info={t("panel.baseToolsInfo", { provider: bot.provider })}
      trailing={
        availableTools.length > 0 ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isCustom ? (
              <InlineActionButton
                colors={colors}
                label={t("panel.resetBaseToolsDefault")}
                onPress={() => patchBaseTools(undefined)}
              />
            ) : null}
            <SectionMeta
              colors={colors}
              text={
                isCustom
                  ? t("panel.baseToolsCount", { enabled: enabledCount, total: availableTools.length })
                  : t("panel.baseToolsAllDefault")
              }
              tone={isCustom && enabledCount < availableTools.length ? "warning" : undefined}
            />
          </View>
        ) : undefined
      }
    >
      <SettingsCard>
        {availableTools.length === 0 ? (
          <CardNote colors={colors} text={t("panel.noBaseToolsForProvider", { provider: bot.provider })} />
        ) : null}
        {availableTools.map((tool) => (
          <SettingsSwitch
            key={tool}
            label={tool}
            value={isEnabled(tool)}
            onValueChange={(on) => {
              const current = isCustom ? (bot.baseTools ?? []) : [...availableTools];
              const next = on
                ? current.includes(tool)
                  ? current
                  : [...current, tool]
                : current.filter((t) => t !== tool);
              patchBaseTools(next);
            }}
          />
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

/** OpenMausBot's saved commands: each is one exact command in one folder, added from its approval card. */
function AllowedCommands({ colors, bot }: Pick<PanelProps, "colors" | "bot">) {
  const { t } = useT();
  const list = useRpc(commandListRpc);
  const remove = useRpc(commandRemoveRpc);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["paseo-bots", "commands", bot.id];
  const rules = useQuery({ queryKey: key, queryFn: () => list({ botId: bot.id }) });
  const items = rules.data?.rules ?? [];
  return (
    <SettingsSection title={t("panel.commandsSection")} info={t("panel.commandsInfo")}>
      <SettingsCard>
        <DrillRow colors={colors} label={t("panel.rowAllowedCommands")} hint={rules.isLoading ? t("common.loading") : items.length ? formatPluralCount(t, "command", items.length) : t("panel.noneYet")} onPress={() => setOpen(true)} />
      </SettingsCard>
      {open ? (
        <Modal title={t("panel.rowAllowedCommands")} open onOpenChange={(next) => !next && setOpen(false)}>
          <Modal.Content>
            <SettingsCard>
              {items.length === 0 ? <CardNote colors={colors} text={t("panel.noAllowedCommandsHint")} /> : null}
              {items.map((rule) => (
                <SettingsAction
                  key={rule.id}
                  label={rule.command}
                  hint={rule.cwd}
                  actionLabel={t("common.remove")}
                  onPress={() =>
                    void remove({ botId: bot.id, id: rule.id })
                      .then(() => queryClient.invalidateQueries({ queryKey: key }))
                      .catch((error: unknown) => toast.error(errorText(error)))
                  }
                />
              ))}
            </SettingsCard>
          </Modal.Content>
        </Modal>
      ) : null}
    </SettingsSection>
  );
}
