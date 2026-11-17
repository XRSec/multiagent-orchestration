import { useRpc } from "@getpaseo/plugin/client";
import { copyText, Modal, SettingsAction, SettingsCard, SettingsRow, SettingsSection, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { newPlaybookId, SOUL_MAX_BYTES, utf8Bytes, type Playbook } from "../../shared/bot";
import { parseTriggers } from "../../shared/playbooks";
import { memoryDeleteRpc, memoryListRpc, memoryReadRpc, memoryWriteRpc } from "../../shared/rpc";
import { useBotHost } from "../data";
import { formatPluralCount, useT } from "../i18n";
import { confirmDialog, errorText } from "../native";
import type { PanelProps } from "./BotPanel";
import { LibraryPicker } from "./LibraryPicker";
import { Alert, Button, CardNote, DrillRow, FormTextArea, InputField, SectionLink, SectionMeta, SheetActions, TextAreaField } from "./controls";
import { ChangesSheet, LogSheet, useDailyLog, useMemoryJournal } from "./MemoryActivity";

type Colors = PanelProps["colors"];

const kb = (bytes: number) => (bytes / 1000).toFixed(1);


function LocalOnly({ colors, what }: { colors: Colors; what: string }) {
  const { t } = useT();
  return (
    <View style={{ marginBottom: 24 }}>
      <Alert colors={colors} description={t("panel.localOnlyNotice", { what })} />
    </View>
  );
}

// ---------------------------------------------------------------- soul

/** Paseo's "Append system prompt": a row with Edit that opens a sheet with the text, Reset and Save. */
export function SoulSection({ colors, bot, onPatch }: PanelProps) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const bytes = utf8Bytes(bot.soul);
  return (
    <>
      <SettingsSection title={t("panel.instructionsTitle")} info={t("panel.instructionsInfo")}>
        <SettingsCard>
          <SettingsAction label={t("panel.rowStandingInstructions")} hint={t("panel.standingInstructionsHint")} actionLabel={t("common.edit")} onPress={() => setEditing(true)} />
          <SettingsRow
            label={t("panel.sizeLabel")}
            hint={bytes ? t("panel.sizeOfKb", { kb: kb(bytes), max: SOUL_MAX_BYTES / 1000 }) : t("panel.empty")}
            error={bytes > SOUL_MAX_BYTES ? t("panel.overKbLimit", { max: SOUL_MAX_BYTES / 1000 }) : null}
          />
        </SettingsCard>
      </SettingsSection>
      {editing ? (
        <SoulSheet
          colors={colors}
          saved={bot.soul}
          onClose={() => setEditing(false)}
          onSave={(soul) => {
            onPatch({ soul });
            setEditing(false);
          }}
        />
      ) : null}
    </>
  );
}

function SoulSheet({ colors, saved, onClose, onSave }: { colors: Colors; saved: string; onClose(): void; onSave(soul: string): void }) {
  const { t } = useT();
  const [draft, setDraft] = useState(saved);
  const bytes = utf8Bytes(draft);
  const changed = draft !== saved;
  return (
    <Modal title={t("panel.rowStandingInstructions")} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <FormTextArea
          colors={colors}
          accessibilityLabel={t("panel.rowStandingInstructions")}
          value={draft}
          onChangeText={setDraft}
          minHeight={320}
          placeholder={t("panel.standingInstructionsPlaceholder")}
        />
        <SheetActions
          leading={
            <SectionMeta colors={colors} text={t("panel.soulSizeRatio", { kb: kb(bytes), max: SOUL_MAX_BYTES / 1000 })} tone={bytes > SOUL_MAX_BYTES ? "danger" : bytes > SOUL_MAX_BYTES * 0.8 ? "warning" : undefined} />
          }
        >
          <Button colors={colors} variant="ghost" label={t("common.reset")} disabled={!changed} onPress={() => setDraft(saved)} />
          <Button colors={colors} variant="default" label={t("common.save")} disabled={!changed || bytes > SOUL_MAX_BYTES} onPress={() => onSave(draft)} />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}

// ---------------------------------------------------------------- skills

export function SkillsSection(props: PanelProps) {
  const { t } = useT();
  const host = useBotHost(props.bot.hostId, props.localHost);
  return (
    <>
      {!host.isLocal ? <LocalOnly colors={props.colors} what={t("panel.localOnlySkills")} /> : null}
      <LibraryPicker {...props} kind="skill" title={t("panel.sectionSkills")} info={t("panel.skillsSectionInfo")} />
    </>
  );
}

// ---------------------------------------------------------------- memory

const TOPIC_NAME = /^[A-Za-z0-9 ._-]+$/;
const MEMORY_LINES = 200;
const MEMORY_BYTES = 24_000;

export function MemorySection({ colors, bot, localHost }: PanelProps) {
  const { t } = useT();
  const host = useBotHost(bot.hostId, localHost);
  const list = useRpc(memoryListRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"topic" | "changes" | "log" | null>(null);
  const files = useQuery({ queryKey: ["paseo-bots", "memory", bot.id], queryFn: () => list({ botId: bot.id }), refetchInterval: 20_000 });
  const journal = useMemoryJournal(bot.id);
  const log = useDailyLog(bot.id);
  const refresh = () =>
    Promise.all([queryClient.invalidateQueries({ queryKey: ["paseo-bots", "memory", bot.id] }), queryClient.invalidateQueries({ queryKey: ["paseo-bots", "memory-journal", bot.id] })]);

  const data = files.data;
  const mainMemory = data?.files.find((file) => !file.topic);
  const over = !!mainMemory && (mainMemory.lines > MEMORY_LINES || mainMemory.bytes > MEMORY_BYTES);
  const changes = journal.data?.entries.length ?? 0;
  const days = log.data?.days.length ?? 0;

  return (
    <>
      {!host.isLocal ? <LocalOnly colors={colors} what={t("panel.localOnlyMemoryFiles")} /> : null}
      {files.error ? <Alert colors={colors} variant="error" title="Could not load memory" description={errorText(files.error)} actionLabel="Retry" onAction={() => void files.refetch()} /> : null}
      <SettingsSection
        title={t("panel.filesSection")}
        info={t("panel.filesSectionInfo")}
        trailing={<SectionLink colors={colors} label={t("panel.rowNewTopicFile")} onPress={() => setSheet("topic")} />}
      >
        <SettingsCard>
          {(data?.files ?? [{ name: "MEMORY.md", bytes: 0, lines: 0, topic: false }]).map((file) => (
            <DrillRow
              key={file.name}
              colors={colors}
              label={file.topic ? `memory/${file.name}` : file.name}
              hint={!data ? t("common.loading") : file.topic ? t("panel.memoryTopicHint", { lines: formatPluralCount(t, "line", file.lines), kb: kb(file.bytes) }) : t("panel.memoryInjectedHint", { lines: data.injectedLines, maxLines: MEMORY_LINES, kb: kb(data.injectedBytes), maxKb: MEMORY_BYTES / 1000 })}
              error={!file.topic && over ? t("panel.overBudgetError") : null}
              hintLines={2}
              onPress={() => setOpen(file.name)}
            />
          ))}
          {data ? (
            <SettingsAction
              label={t("panel.folderLabel")}
              hint={data.folder.replace(/^\/(?:Users|home)\/[^/]+/, "~")}
              actionLabel={t("common.copy")}
              onPress={() => void copyText(data.folder).then(() => toast.show(t("common.pathCopied"), { variant: "success" }))}
            />
          ) : null}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("panel.activitySection")}>
        <SettingsCard>
          <DrillRow colors={colors} label={t("panel.rowChanges")} hint={journal.isLoading ? t("common.loading") : changes ? t("panel.changesWithUndo", { changes: formatPluralCount(t, "change", changes) }) : t("panel.noChangesYet")} onPress={() => setSheet("changes")} />
          <DrillRow colors={colors} label={t("panel.rowDailyLog")} hint={log.isLoading ? t("common.loading") : days ? formatPluralCount(t, "day", days) : t("panel.noEntriesYet")} onPress={() => setSheet("log")} />
        </SettingsCard>
      </SettingsSection>
      {sheet === "topic" ? (
        <TopicSheet
          colors={colors}
          botId={bot.id}
          onClose={() => setSheet(null)}
          onCreated={(name) => {
            setSheet(null);
            setOpen(name);
            void refresh();
          }}
        />
      ) : null}
      {sheet === "changes" ? <ChangesSheet colors={colors} bot={bot} onUndone={() => void refresh()} onClose={() => setSheet(null)} /> : null}
      {sheet === "log" ? <LogSheet colors={colors} bot={bot} onClose={() => setSheet(null)} /> : null}
      {open ? <MemorySheet colors={colors} botId={bot.id} name={open} onChanged={() => void refresh()} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** A new topic file: its name, then it opens to write in. */
function TopicSheet({ colors, botId, onClose, onCreated }: { colors: Colors; botId: string; onClose(): void; onCreated(name: string): void }) {
  const { t } = useT();
  const write = useRpc(memoryWriteRpc);
  const toast = useToast();
  const [topic, setTopic] = useState("");
  const name = topic.trim().replace(/\.md$/, "");
  const [creating, setCreating] = useState(false);
  const createLock = useRef(false);
  const error = name && (!TOPIC_NAME.test(name) || name.length > 252) ? t("panel.topicNameInvalid") : null;
  const create = () => {
    if (createLock.current) return;
    createLock.current = true; setCreating(true);
    void write({ botId, name: `${name}.md`, text: `# ${name}\n`, expectedRevision: null })
      .then(() => onCreated(`${name}.md`))
      .catch((caught: unknown) => toast.error(errorText(caught)))
      .finally(() => { createLock.current = false; setCreating(false); });
  };
  return (
    <Modal title={t("panel.rowNewTopicFile")} open onOpenChange={(value) => !value && onClose()}>
      <Modal.Content>
        <SettingsCard>
          <InputField colors={colors} label={t("panel.rowName")} hint={t("panel.topicNameHint")} error={error} initialValue="" placeholder="projects" onChangeText={setTopic} />
        </SettingsCard>
        <SheetActions>
          <Button colors={colors} variant="ghost" label={t("common.cancel")} onPress={onClose} />
          <Button colors={colors} variant="default" label={t("common.create")} loading={creating} disabled={!name || !!error || creating} onPress={create} />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}

/** One memory file in a sheet. Closing with unsaved edits asks before discarding them. */
function MemorySheet({ colors, botId, name, onChanged, onClose }: { colors: Colors; botId: string; name: string; onChanged(): void; onClose(): void }) {
  const { t } = useT();
  const read = useRpc(memoryReadRpc);
  const write = useRpc(memoryWriteRpc);
  const remove = useRpc(memoryDeleteRpc);
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [text, setText] = useState<string | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const operationLock = useRef(false);
  const topic = name !== "MEMORY.md";
  const label = topic ? `memory/${name}` : name;
  const dirty = text !== null && text !== saved;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    void read({ botId, name })
      .then(({ text: loaded, revision }) => {
        if (cancelled) return;
        setText(loaded);
        setSaved(loaded);
        setRevision(revision);
      })
      .catch((error: unknown) => { if (!cancelled) setLoadError(errorText(error)); });
    return () => {
      cancelled = true;
    };
  }, [botId, name, read, retry]);

  const close = async () => {
    if (dirty && !(await confirmDialog({ title: t("panel.discardChangesTitle"), message: t("panel.discardChangesMessage", { label }), confirmLabel: t("panel.discardAction"), destructive: true }))) return;
    onClose();
  };

  const save = async () => {
    if (text === null || operationLock.current) return;
    operationLock.current = true;
    setSaving(true);
    try {
      await write({ botId, name, text, expectedRevision: revision });
      setSaved(text);
      onChanged();
      onClose();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      operationLock.current = false;
      setSaving(false);
    }
  };

  const destroy = async () => {
    if (text === null || operationLock.current) return;
    operationLock.current = true;
    try {
      const confirmed = await confirmDialog({ title: t("panel.deleteTopicTitle"), message: t("panel.deleteTopicMessage", { label }), confirmLabel: t("common.delete"), destructive: true });
      if (!confirmed) return;
      setSaving(true);
      await remove({ botId, name, expectedRevision: revision });
      onChanged(); onClose();
    } catch (error) { toast.error(errorText(error)); }
    finally { operationLock.current = false; setSaving(false); }
  };

  return (
    <Modal title={label} open onOpenChange={(value) => !value && void close()}>
      <Modal.Content>
        {loadError ? <Alert colors={colors} variant="error" title="Could not read memory" description={loadError} actionLabel="Retry" onAction={() => setRetry((value) => value + 1)} /> : text === null ? (
          <SettingsCard>
            <View style={{ minHeight: 320, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator size="small" color={colors.foregroundMuted} />
            </View>
          </SettingsCard>
        ) : (
          <FormTextArea colors={colors} monospace accessibilityLabel={t("panel.fileContentsA11y", { label })} value={text} onChangeText={setText} minHeight={320} placeholder={"- Prefers short replies\n- Works Mon-Fri, CET"} />
        )}
        <SheetActions leading={topic ? <Button colors={colors} variant="ghost" label={t("common.delete")} icon="Trash2" disabled={saving || text === null} onPress={() => void destroy()} /> : null}>
          <Button colors={colors} variant="ghost" label={t("common.reset")} disabled={!dirty || saving} onPress={() => setText(saved)} />
          <Button colors={colors} variant="default" label={saving ? t("common.saving") : t("common.save")} disabled={!dirty || saving} onPress={() => void save()} />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}

// ---------------------------------------------------------------- playbooks

/** OpenMausBot's playbooks: step-by-step guidance a chat gets when its first message mentions a trigger. */
export function PlaybooksSection({ colors, bot, onPatch }: PanelProps) {
  const { t, locale } = useT();
  const [editing, setEditing] = useState<Playbook | "new" | null>(null);
  const save = (playbook: Playbook) => {
    onPatch({ playbooks: bot.playbooks.some((entry) => entry.id === playbook.id) ? bot.playbooks.map((entry) => (entry.id === playbook.id ? playbook : entry)) : [...bot.playbooks, playbook] });
    setEditing(null);
  };
  const remove = async (playbook: Playbook) => {
    if (!(await confirmDialog({ title: t("panel.deletePlaybookTitle"), message: t("panel.deletePlaybookMessage", { name: playbook.name }), confirmLabel: t("common.delete"), destructive: true }))) return;
    onPatch({ playbooks: bot.playbooks.filter((entry) => entry.id !== playbook.id) });
    setEditing(null);
  };
  return (
    <>
      <SettingsSection
        title={t("panel.sectionPlaybooks")}
        info={t("panel.playbooksInfo")}
        trailing={<SectionLink colors={colors} label={t("panel.rowNewPlaybook")} onPress={() => setEditing("new")} />}
      >
        <SettingsCard>
          {bot.playbooks.length === 0 ? <CardNote colors={colors} text={t("panel.noPlaybooksYet")} /> : null}
          {bot.playbooks.map((playbook) => (
            <DrillRow
              key={playbook.id}
              colors={colors}
              label={playbook.name || t("panel.untitledPlaybook")}
              hint={playbook.triggers.length ? t("panel.whenChatMentions", { triggers: playbook.triggers.join(locale === "zh-CN" ? "、" : ", ") }) : t("panel.noTriggerWordsHint")}
              onPress={() => setEditing(playbook)}
            />
          ))}
        </SettingsCard>
      </SettingsSection>
      {editing ? <PlaybookSheet colors={colors} playbook={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSave={save} onDelete={editing === "new" ? undefined : () => void remove(editing)} /> : null}
    </>
  );
}

function PlaybookSheet({ colors, playbook, onClose, onSave, onDelete }: { colors: Colors; playbook: Playbook | null; onClose(): void; onSave(playbook: Playbook): void; onDelete?: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(playbook?.name ?? "");
  const [triggers, setTriggers] = useState(playbook?.triggers.join(", ") ?? "");
  const [instructions, setInstructions] = useState(playbook?.instructions ?? "");
  const parsed = parseTriggers(triggers);
  const canSave = !!name.trim() && parsed.length > 0 && !!instructions.trim();
  return (
    <Modal title={playbook ? t("panel.editPlaybookTitle") : t("panel.rowNewPlaybook")} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        <View style={{ marginBottom: 24 }}>
          <SettingsCard>
            <InputField colors={colors} label={t("panel.rowName")} initialValue={name} placeholder={t("panel.playbookNamePlaceholder")} onChangeText={setName} />
            <InputField colors={colors} label={t("panel.rowTriggerWords")} hint={t("panel.triggerWordsHint")} initialValue={triggers} placeholder={t("panel.triggerWordsPlaceholder")} onChangeText={setTriggers} />
            <TextAreaField colors={colors} label={t("panel.rowSteps")} hint={t("panel.stepsHint")} value={instructions} onChangeText={setInstructions} minHeight={240} placeholder={t("panel.stepsPlaceholder")} />
          </SettingsCard>
        </View>
        <SheetActions leading={onDelete ? <Button colors={colors} variant="ghost" label={t("common.delete")} icon="Trash2" onPress={onDelete} /> : null}>
          <Button colors={colors} variant="ghost" label={t("common.cancel")} onPress={onClose} />
          <Button
            colors={colors}
            variant="default"
            label={t("common.save")}
            disabled={!canSave}
            onPress={() => onSave({ id: playbook?.id ?? newPlaybookId(), name: name.trim().slice(0, 80), triggers: parsed, instructions })}
          />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}
