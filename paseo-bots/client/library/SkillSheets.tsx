import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { skillImportRpc, skillWriteRpc } from "../../shared/rpc";
import { parseSkillFrontmatter, parseSkillSource, sanitizeSkillName, skillMarkdown } from "../../shared/skills";
import { formatPluralCount, formatScanSkillText, useT } from "../i18n";
import { Alert, Button, FormTextArea, InputField, SheetActions, SheetFooter, TextAreaField } from "../panel/controls";
import { code, codeLine, ui } from "../typography";
import { errorText, MONO_FONT, MONO_PROPS } from "../native";

type Colors = PluginTheme["colors"];

export interface SavedSkill {
  id: string;
  description: string;
  source: string;
  /** Set when the user wrote the text here, so it counts as reviewed. */
  reviewedSha?: string;
}


function ErrorLine({ colors, text, tone = "error" }: { colors: Colors; text: string | null; tone?: "error" | "warning" }) {
  return text ? (
    <Text accessibilityRole="alert" style={{ fontSize: ui(12), color: tone === "warning" ? colors.statusWarning : colors.statusDanger, marginLeft: 4 }}>
      {text}
    </Text>
  ) : null;
}

/** Fetches one skill, or every skill in a repository or folder, into the library. */
export function ImportSkillsSheet({ colors, onClose, onImported }: { colors: Colors; onClose(): void; onImported(skills: SavedSkill[]): void }) {
  const { t } = useT();
  const importSkills = useRpc(skillImportRpc);
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  let sourceError: string | null = null;
  try {
    if (source.trim()) parseSkillSource(source);
  } catch (caught) {
    sourceError = errorText(caught);
  }
  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { skills } = await importSkills({ source: source.trim() });
      onImported(skills);
    } catch (caught) {
      setError(t("library.couldNotImport", { error: errorText(caught) }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("library.skillImportTitle")} open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        <SettingsSection title={t("library.skillImportSectionTitle")} info={t("library.skillImportSectionInfo")}>
          <SettingsCard>
            <InputField colors={colors} label={t("library.skillSourceLabel")} hint={t("library.skillSourceHint")} error={sourceError} initialValue="" placeholder="anthropics/skills/skills/pdf" onChangeText={setSource} />
          </SettingsCard>
          <ErrorLine colors={colors} text={error} />
        </SettingsSection>
        <SheetFooter>
          <Button colors={colors} size="md" label={t("common.cancel")} disabled={busy} onPress={onClose} style={{ flex: 1 }} />
          <Button colors={colors} size="md" variant="default" label={busy ? t("common.importing") : t("library.skillImportButton")} loading={busy} disabled={!source.trim() || !!sourceError} onPress={() => void run()} style={{ flex: 1 }} />
        </SheetFooter>
      </Modal.Content>
    </Modal>
  );
}

/** Writes a new skill here: a name, when to use it, and its instructions. */
export function NewSkillSheet({ colors, taken, onClose, onCreated }: { colors: Colors; taken: string[]; onClose(): void; onCreated(skill: SavedSkill): void }) {
  const { t } = useT();
  const write = useRpc(skillWriteRpc);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = name.trim() ? sanitizeSkillName(name) : "";
  const nameError = id && taken.includes(id) ? t("library.mcpNameAlreadyInLibrary", { name: id }) : null;
  const nameHint = id && id !== name.trim() ? t("library.skillNameSavedAs", { id }) : t("library.skillNameHint");
  const canCreate = !!id && !nameError && !!description.trim() && !!body.trim();

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await write({ id, text: skillMarkdown(id, description, body) });
      onCreated({ id, description: saved.description, source: "", reviewedSha: saved.sha });
    } catch (caught) {
      setError(t("library.couldNotSave", { error: errorText(caught) }));
      setBusy(false);
    }
  };

  return (
    <Modal title={t("library.skillNewTitle")} open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        <View style={{ marginBottom: 24 }}>
          <SettingsCard>
            <InputField colors={colors} label={t("library.mcpNameLabel")} hint={nameHint} error={nameError} initialValue="" placeholder="weekly-report" onChangeText={setName} />
            <InputField colors={colors} label={t("library.skillWhenToUseLabel")} hint={t("library.skillWhenToUseHint")} initialValue="" placeholder={t("library.skillWhenToUsePlaceholder")} onChangeText={setDescription} />
            <TextAreaField
              colors={colors}
              label={t("library.skillInstructionsLabel")}
              hint={t("library.skillInstructionsHint")}
              value={body}
              onChangeText={setBody}
              minHeight={240}
              placeholder={t("library.skillInstructionsPlaceholder")}
            />
          </SettingsCard>
        </View>
        <ErrorLine colors={colors} text={error} />
        <SheetFooter>
          <Button colors={colors} size="md" label={t("common.cancel")} disabled={busy} onPress={onClose} style={{ flex: 1 }} />
          <Button colors={colors} size="md" variant="default" label={t("library.skillCreateButton")} loading={busy} disabled={!canCreate} onPress={() => void create()} style={{ flex: 1 }} />
        </SheetFooter>
      </Modal.Content>
    </Modal>
  );
}

/** Edits SKILL.md as text; the description is read back from its frontmatter. */
export function EditSkillSheet({ colors, id, saved, onClose, onSaved }: { colors: Colors; id: string; saved: string; onClose(): void; onSaved(description: string, sha: string): void }) {
  const { t } = useT();
  const write = useRpc(skillWriteRpc);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = draft !== saved;
  const meta = parseSkillFrontmatter(draft);
  const warning = !meta.description ? t("library.skillFrontmatterNoDesc") : meta.name && meta.name !== id ? t("library.skillFrontmatterBadName", { id }) : null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await write({ id, text: draft });
      onSaved(result.description, result.sha);
    } catch (caught) {
      setError(t("library.couldNotSave", { error: errorText(caught) }));
      setBusy(false);
    }
  };

  return (
    <Modal title={t("library.skillEditTitle", { id })} open onOpenChange={(open) => !open && !busy && onClose()}>
      <Modal.Content>
        <FormTextArea colors={colors} monospace accessibilityLabel="SKILL.md" value={draft} onChangeText={setDraft} autoCapitalize="none" autoCorrect={false} minHeight={360} />
        {error ? <ErrorLine colors={colors} text={error} /> : <ErrorLine colors={colors} text={warning} tone="warning" />}
        <SheetActions>
          <Button colors={colors} variant="ghost" label={t("common.reset")} disabled={!changed || busy} onPress={() => setDraft(saved)} />
          <Button colors={colors} variant="default" label={t("common.save")} loading={busy} disabled={!changed} onPress={() => void save()} />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}

/**
 * OpenMausBot's "Review before enabling": the whole SKILL.md, anything that
 * looks risky, and the files that come with it. Turning the skill on records
 * the hash of exactly this text.
 */
export function ReviewSkillSheet({ colors, id, text, sha, files, onClose, onApprove }: { colors: Colors; id: string; text: string; sha: string; files: string[]; onClose(): void; onApprove(sha: string): void }) {
  const { t } = useT();
  const warnings = formatScanSkillText(t, text);
  const others = files.filter((file) => file !== "SKILL.md");
  return (
    <Modal title={t("library.skillReviewTitle", { id })} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        {warnings.length ? <Alert colors={colors} variant="warning" title={t("library.skillReviewWarningsTitle")} description={warnings} /> : null}
        <Text style={{ fontSize: ui(14), color: colors.foregroundMuted }}>
          {t("library.skillReviewBody")}
          {others.length
            ? t("library.skillReviewOtherFiles", {
                filesCount: formatPluralCount(t, "otherFile", others.length),
                names: others.slice(0, 4).join(", "),
                more: others.length > 4 ? ", ..." : "",
              })
            : ""}
        </Text>
        <View style={{ padding: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
          <Text selectable {...MONO_PROPS} style={{ fontFamily: MONO_FONT, fontSize: code(), lineHeight: codeLine(), color: colors.foreground }}>
            {text}
          </Text>
        </View>
        <SheetFooter>
          <Button colors={colors} size="md" label={t("library.notNow")} onPress={onClose} style={{ flex: 1 }} />
          <Button colors={colors} size="md" variant="default" label={t("library.turnOn")} onPress={() => onApprove(sha)} style={{ flex: 1 }} />
        </SheetFooter>
      </Modal.Content>
    </Modal>
  );
}
