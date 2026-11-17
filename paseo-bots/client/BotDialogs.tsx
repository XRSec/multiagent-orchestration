import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { copyText, Icon, Modal, SettingsAction, SettingsCard, SettingsSection, SettingsSwitch, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { Bot, BotAvatar, BotDefaults, Preset } from "../shared/bot";
import { exportBotRpc } from "../shared/rpc";
import { BOT_TEMPLATES, type BotTemplate } from "../shared/templates";
import { Avatar } from "./Avatar";
import { formatTemplateDisplay, translateNow, useT } from "./i18n";
import { NewBotDefaults } from "./NewBotDefaults";
import type { LocalHost } from "./data";
import { errorText, MONO_FONT, MONO_PROPS, nativeTokens, useHover } from "./native";
import { Button, FormTextArea, SectionLink, SheetActions } from "./panel/controls";
import type { MenuEntry } from "./ui/Menu";
import { code, codeLine, ui } from "./typography";

type Colors = PluginTheme["colors"];

// ------------------------------------------------------------------ new bot

export function NewBotDialog({
  colors,
  presets,
  defaults = { provider: "", model: null, modeId: null, thinkingOptionId: null, fallbackModels: [], contactBots: "allow" },
  localHost = { id: "", label: "" },
  onDefaultsChange = () => {},
  onDeletePreset = async () => {},
  onClose,
  onCreate,
  onImport,
}: {
  colors: Colors;
  presets: readonly Preset[];
  defaults?: BotDefaults;
  localHost?: LocalHost;
  onDefaultsChange?(patch: Partial<BotDefaults>): void;
  onDeletePreset?(preset: Preset): Promise<void>;
  onClose(): void;
  onCreate(start: { template?: BotTemplate; preset?: Preset } | undefined, defaults?: BotDefaults): void;
  onImport(json: string): Promise<void>;
}) {
  const { t } = useT();
  const [json, setJson] = useState("");
  const [importing, setImporting] = useState(false);
  const [editingDefaults, setEditingDefaults] = useState(false);
  const [managingPresets, setManagingPresets] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);
  const [draftDefaults, setDraftDefaults] = useState(defaults);
  const defaultsRef = useRef(defaults);
  const toast = useToast();
  return (
    <Modal title={t("dialogs.newBotTitle")} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <SettingsSection title={t("dialogs.startFrom")}>
          <SettingsCard>
            <StartRow colors={colors} label={t("dialogs.blankBot")} hint={t("dialogs.blankBotHint")} onPress={() => onCreate(undefined, defaultsRef.current)} />
            {BOT_TEMPLATES.map((template) => {
              const display = formatTemplateDisplay(t, template);
              return (
                <StartRow key={template.id} colors={colors} label={display.title} hint={display.description} avatar={{ seed: template.avatarSeed }} onPress={() => onCreate({ template }, defaultsRef.current)} />
              );
            })}
          </SettingsCard>
        </SettingsSection>
        {presets.length ? (
          <SettingsSection title={t("dialogs.yourPresets")} info={t("dialogs.yourPresetsInfo")} trailing={<SectionLink colors={colors} label={managingPresets ? "Done" : "Manage"} icon={managingPresets ? "Check" : "Pencil"} onPress={() => setManagingPresets(!managingPresets)} />}>
            <SettingsCard>
              {presets.map((preset) => (
                managingPresets ? <SettingsAction key={preset.id} label={preset.name} hint={preset.title || preset.description} actionLabel={pendingPreset === preset.id ? "Deleting…" : "Delete"} disabled={pendingPreset !== null} onPress={() => {
                  if (pendingPreset) return;
                  setPendingPreset(preset.id);
                  void onDeletePreset(preset).catch((error: unknown) => toast.error(errorText(error))).finally(() => setPendingPreset(null));
                }} /> : <StartRow key={preset.id} colors={colors} label={preset.name} hint={preset.title || preset.description} avatar={preset.avatar} onPress={() => onCreate({ preset }, defaultsRef.current)} />
              ))}
            </SettingsCard>
          </SettingsSection>
        ) : null}
        {editingDefaults ? <NewBotDefaults localHost={localHost} defaults={draftDefaults} trailing={<SectionLink colors={colors} label="Done" icon="Check" onPress={() => setEditingDefaults(false)} />} onChange={(patch) => {
          defaultsRef.current = { ...defaultsRef.current, ...patch };
          setDraftDefaults(defaultsRef.current);
          onDefaultsChange(patch);
        }} /> : <SettingsCard><SettingsAction label="Defaults for new bots" hint="Provider, model and permissions for new bots" actionLabel="Configure" onPress={() => setEditingDefaults(true)} /></SettingsCard>}
        <SettingsSection title={t("dialogs.importSection")} info={t("dialogs.importInfo")}>
          <FormTextArea
            colors={colors}
            monospace
            accessibilityLabel={t("dialogs.importInputLabel")}
            value={json}
            onChangeText={setJson}
            autoCapitalize="none"
            autoCorrect={false}
            minHeight={120}
            placeholder={t("dialogs.importPlaceholder")}
          />
          <SheetActions>
            <Button
              colors={colors}
              variant="default"
              label={importing ? t("common.importing") : t("dialogs.importButton")}
              loading={importing}
              disabled={!json.trim()}
              onPress={() => {
                setImporting(true);
                void onImport(json)
                  .catch((error: unknown) => toast.error(errorText(error)))
                  .finally(() => setImporting(false));
              }}
            />
          </SheetActions>
        </SettingsSection>
      </Modal.Content>
    </Modal>
  );
}

/** A whole-row pressable settings row (settings card geometry: 16 padding, 14/12 text). */
function StartRow({ colors, label, hint, avatar, onPress }: { colors: Colors; label: string; hint: string; avatar?: Partial<BotAvatar> & { seed: string }; onPress(): void }) {
  const { t } = useT();
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("dialogs.createRowAccessibility", { label })}
      accessibilityHint={hint}
      onPress={onPress}
      {...hoverProps}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: pressed || hovered ? colors.surface2 : "transparent",
      })}
    >
      {avatar ? (
        <Avatar avatar={avatar} size={28} dark={nativeTokens(colors).dark} />
      ) : (
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}>
          <Icon name="Plus" size={14} color={colors.foregroundMuted} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: ui(14), color: colors.foreground }}>
          {label}
        </Text>
        {hint ? (
          <Text numberOfLines={2} style={{ marginTop: 4, fontSize: ui(12), color: colors.foregroundMuted }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Icon name="ChevronRight" size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
    </Pressable>
  );
}

// ------------------------------------------------------------------ rename

interface RenameDialogProps {
  colors: Colors;
  title: string;
  initialValue: string;
  placeholder?: string;
  submitLabel?: string;
  onClose(): void;
  onSubmit(value: string): Promise<void> | void;
}

/**
 * Paseo's AdaptiveRenameModal (components/rename-modal.tsx): the current name selected
 * in one input, the error inline, Cancel and Rename side by side. It stays open on errors.
 */
export function RenameDialog({ colors, title, initialValue, placeholder, submitLabel, onClose, onSubmit }: RenameDialogProps) {
  const { t } = useT();
  const [draft, setDraft] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const invalid = !draft.trim();
  const submitDisabled = pending || draft === initialValue || invalid;
  const resolvedSubmitLabel = submitLabel ?? t("dialogs.renameSubmit");

  const submit = async () => {
    if (pending || draft === initialValue) return;
    if (invalid) {
      setError(t("common.nameRequired"));
      return;
    }
    try {
      setPending(true);
      await onSubmit(draft.trim());
      setPending(false);
      onClose();
    } catch (err) {
      setPending(false);
      setError(err instanceof Error && err.message ? err.message : t("common.unableToSave"));
    }
  };
  const cancel = () => {
    if (!pending) onClose();
  };

  return (
    <Modal title={title} open onOpenChange={(open) => !open && cancel()}>
      <Modal.Content>
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <TextInput
            accessibilityLabel={title}
            defaultValue={initialValue}
            onChangeText={(value) => {
              setDraft(value);
              setError(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={colors.foregroundMuted}
            autoFocus
            selectTextOnFocus
            autoCapitalize="none"
            autoCorrect={false}
            editable={!pending}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            style={{
              backgroundColor: colors.surface0,
              color: colors.foreground,
              paddingVertical: 12,
              paddingHorizontal: 12,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              fontSize: ui(14),
            }}
          />
          {error ? <Text accessibilityRole="alert" style={{ color: colors.statusDanger, fontSize: ui(14) }}>{error}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <DialogButton colors={colors} label={t("common.cancel")} disabled={pending} onPress={cancel} />
            <DialogButton colors={colors} label={pending ? t("common.saving") : resolvedSubmitLabel} primary disabled={submitDisabled} onPress={() => void submit()} />
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}

/** Paseo's Button size="sm": secondary (surface3) or default (accent). */
function DialogButton({ colors, label, primary, disabled, onPress }: { colors: Colors; label: string; primary?: boolean; disabled?: boolean; onPress(): void }) {
  const fill = primary ? colors.accent : nativeTokens(colors).surface3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 32,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: fill,
        backgroundColor: fill,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ fontSize: ui(14), color: primary ? colors.accentForeground : colors.foreground }}>{label}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------ menus

export interface BotMenuActions {
  bot: Bot;
  /** Set when the host exposes navigation and the bot's workspace is known. */
  onOpenInPaseo?: () => void;
  onOpenSettings(): void;
  onTogglePin(): void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRename(): void;
  onDuplicate(): Promise<void>;
  onExport(): void;
  onCopyId(): void;
  onSaveAsPreset(): void;
  onToggleArchive(): void;
  onDelete(): Promise<void>;
}

/** The bot menu, after Paseo's project menu (sidebar-workspace-list.tsx ProjectMenuItems). */
export function botMenuEntries(actions: BotMenuActions): MenuEntry[] {
  const { bot } = actions;
  const entries: MenuEntry[] = [{ label: translateNow("menus.openBotSettings"), icon: "Settings", onSelect: actions.onOpenSettings }];
  if (actions.onOpenInPaseo) entries.push({ label: translateNow("menus.openInPaseo"), icon: "ExternalLink", onSelect: actions.onOpenInPaseo });
  entries.push({ label: bot.pinned ? translateNow("menus.unpin") : translateNow("menus.pinToTop"), icon: bot.pinned ? "PinOff" : "Pin", onSelect: actions.onTogglePin });
  if (actions.onMoveUp || actions.onMoveDown) {
    entries.push({ label: translateNow("menus.moveUp"), icon: "ArrowUp", disabled: !actions.onMoveUp, onSelect: () => actions.onMoveUp?.() });
    entries.push({ label: translateNow("menus.moveDown"), icon: "ArrowDown", disabled: !actions.onMoveDown, onSelect: () => actions.onMoveDown?.() });
  }
  entries.push(
    { label: translateNow("menus.renameBot"), icon: "Pencil", onSelect: actions.onRename },
    { label: translateNow("menus.duplicate"), icon: "CopyPlus", pendingLabel: translateNow("common.duplicating"), onSelect: actions.onDuplicate },
    { label: translateNow("menus.saveAsPreset"), icon: "BookmarkPlus", onSelect: actions.onSaveAsPreset },
    { label: translateNow("menus.exportBot"), icon: "Share", onSelect: actions.onExport },
    { label: translateNow("menus.copyBotId"), icon: "Copy", onSelect: actions.onCopyId },
    { kind: "separator" },
    { label: bot.archived ? translateNow("menus.unarchiveBot") : translateNow("menus.archiveBot"), icon: bot.archived ? "ArchiveRestore" : "Archive", onSelect: actions.onToggleArchive },
    { label: translateNow("menus.deleteBot"), icon: "Trash2", destructive: true, pendingLabel: translateNow("common.deleting"), onSelect: actions.onDelete },
  );
  return entries;
}

export interface ChatMenuActions {
  pinned: boolean;
  onCopyPath(): void;
  onCopyId(): void;
  onCopyTranscript(): Promise<void>;
  onTogglePin(): void;
  /** Present in manual order; undefined at an edge. `null` hides the pair (pinned chats, activity order). */
  move: { up?: () => void; down?: () => void } | null;
  onOpenInPaseo?: () => void;
  onArchive(): Promise<void>;
}

/** The chat menu, after Paseo's workspace menu (sidebar/sidebar-workspace-menu.tsx). */
export function chatMenuEntries(actions: ChatMenuActions): MenuEntry[] {
  const entries: MenuEntry[] = [
    { label: translateNow("menus.copyPath"), icon: "Copy", onSelect: actions.onCopyPath },
    { label: translateNow("menus.copyChatId"), icon: "Copy", onSelect: actions.onCopyId },
    { label: translateNow("menus.copyTranscript"), icon: "FileText", pendingLabel: translateNow("common.copying"), onSelect: actions.onCopyTranscript },
    { label: actions.pinned ? translateNow("menus.unpin") : translateNow("menus.pinToTop"), icon: actions.pinned ? "PinOff" : "Pin", onSelect: actions.onTogglePin },
  ];
  if (actions.move) {
    entries.push({ label: translateNow("menus.moveUp"), icon: "ArrowUp", disabled: !actions.move.up, onSelect: () => actions.move?.up?.() });
    entries.push({ label: translateNow("menus.moveDown"), icon: "ArrowDown", disabled: !actions.move.down, onSelect: () => actions.move?.down?.() });
  }
  if (actions.onOpenInPaseo) entries.push({ label: translateNow("menus.openInPaseo"), icon: "ExternalLink", onSelect: actions.onOpenInPaseo });
  entries.push({ label: translateNow("menus.archiveChat"), icon: "Archive", pendingLabel: translateNow("common.archiving"), onSelect: actions.onArchive });
  return entries;
}

// ------------------------------------------------------------------ export

export function ExportDialog({ colors, bot, onClose }: { colors: Colors; bot: Bot; onClose(): void }) {
  const { t } = useT();
  const exportBot = useRpc(exportBotRpc);
  const toast = useToast();
  const [includeMemory, setIncludeMemory] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setJson(null);
    exportBot({ bot, includeMemory })
      .then((result) => !cancelled && setJson(result.json))
      .catch((error: unknown) => toast.error(errorText(error)));
    return () => {
      cancelled = true;
    };
    // The bot is a snapshot for this dialog; rebuild only when the memory choice changes.
  }, [includeMemory]);
  return (
    <Modal title={t("dialogs.exportTitle", { name: bot.name })} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <SettingsCard>
          <SettingsSwitch
            label={t("dialogs.includeMemoryLabel")}
            hint={t("dialogs.includeMemoryHint")}
            value={includeMemory}
            onValueChange={setIncludeMemory}
          />
          <SettingsAction
            label={t("dialogs.copyBotFile")}
            hint={json ? t("dialogs.copyBotFileHint", { kb: (json.length / 1000).toFixed(1) }) : t("dialogs.copyBotFileBuilding")}
            actionLabel={t("common.copy")}
            disabled={!json}
            onPress={() => void copyText(json!).then(() => toast.show(t("dialogs.botFileCopied"), { variant: "success" }))}
          />
        </SettingsCard>
        <Text {...MONO_PROPS} selectable numberOfLines={16} style={{ fontFamily: MONO_FONT, fontSize: code(), lineHeight: codeLine(), color: colors.foregroundMuted }}>
          {json ?? ""}
        </Text>
      </Modal.Content>
    </Modal>
  );
}
