import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch, useToast } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { View } from "react-native";
import { randomSeed } from "../../shared/avatar";
import type { Bot, BotGroup, TeamLogo as Logo } from "../../shared/bot";
import { teamLogoOf, teamsOf, type TeamDraft } from "../../shared/groups";
import { TeamLogo } from "../Avatar";
import { errorText, nativeTokens } from "../native";
import { useT } from "../i18n";
import { Button, InputField, SheetActions, TextAreaField } from "../panel/controls";
import { ColourRow, pickPicture, PictureSource } from "../panel/picture";
import { canPickFiles } from "../web";

type Colors = PluginTheme["colors"];

export interface TeamEditorFormProps {
  colors: Colors;
  /** Null for a new team. */
  group: BotGroup | null;
  groups: readonly BotGroup[];
  bots: readonly Bot[];
  onClose(): void;
  onSave(team: TeamDraft): void;
  onDelete?: () => void;
}

/** Reusable team identity & roster editor body. */
export function TeamEditorForm({
  colors,
  group,
  groups,
  bots,
  onClose,
  onSave,
  onDelete,
}: TeamEditorFormProps) {
  const { t } = useT();
  const toast = useToast();
  const [name, setName] = useState(group?.name ?? "");
  const [logo, setLogo] = useState<Logo>(() => (group ? teamLogoOf(group) : { seed: randomSeed(), palette: null, imageUrl: null }));
  const [memberIds, setMemberIds] = useState<string[]>(group ? [...new Set([...(group.leadId ? [group.leadId] : []), ...group.memberIds])] : []);
  const [leadId, setLeadId] = useState<string | null>(group?.leadId ?? null);
  const [instructions, setInstructions] = useState(group?.instructions ?? "");
  const live = bots.filter((bot) => !bot.archived);
  const members = live.filter((bot) => memberIds.includes(bot.id));
  const lead = leadId && memberIds.includes(leadId) ? leadId : null;

  const toggle = (botId: string, on: boolean) => setMemberIds((current) => (on ? [...current, botId] : current.filter((id) => id !== botId)));
  const patchLogo = (patch: Partial<Logo>) => setLogo((current) => ({ ...current, ...patch }));
  const upload = () =>
    void pickPicture()
      .then((imageUrl) => imageUrl && patchLogo({ imageUrl }))
      .catch((error: unknown) => toast.error(errorText(error)));

  return (
    <>
      <View style={{ marginBottom: 24 }}>
        <SettingsCard>
          <InputField colors={colors} label={t("teams.nameLabel")} initialValue={name} placeholder={t("teams.namePlaceholder")} onChangeText={setName} />
        </SettingsCard>
      </View>
      <SettingsSection title={t("teams.logoSection")}>
        <SettingsCard>
          <SettingsRow label={t("teams.pictureLabel")} hint={logo.imageUrl?.startsWith("data:") ? t("teams.pictureYour") : logo.imageUrl ? t("teams.pictureUrl") : t("teams.picturePixel")}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <TeamLogo group={{ id: group?.id ?? "", logo }} size={40} dark={nativeTokens(colors).dark} />
              <Button colors={colors} variant="outline" size="sm" label={t("teams.reroll")} onPress={() => patchLogo({ seed: randomSeed(), imageUrl: null })} />
            </View>
          </SettingsRow>
          {canPickFiles ? <SettingsAction label={t("teams.uploadPictureLabel")} hint={t("teams.uploadPictureHint")} actionLabel={t("teams.uploadAction")} onPress={upload} /> : null}
          <ColourRow colors={colors} value={logo.palette} onChange={(palette) => patchLogo({ palette })} />
          <PictureSource colors={colors} imageUrl={logo.imageUrl} hint={t("teams.pictureUrlHint")} placeholder={t("teams.pictureUrlPlaceholder")} onChange={(imageUrl) => patchLogo({ imageUrl })} />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("teams.membersSection")} info={t("teams.membersInfo")}>
        <SettingsCard>
          {live.map((bot) => {
            const elsewhere = teamsOf(bot.id, groups).filter((other) => other.id !== group?.id);
            return (
              <SettingsSwitch
                key={bot.id}
                label={bot.name}
                hint={elsewhere.length ? t("teams.elsewhereHint", { team: elsewhere.map((other) => other.name || t("teams.anotherTeam")).join(", ") }) : bot.title || undefined}
                value={memberIds.includes(bot.id)}
                onValueChange={(on) => toggle(bot.id, on)}
              />
            );
          })}
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("teams.chiefSection")} info={t("teams.chiefInfo")}>
        <SettingsCard>
          <SettingsSelect
            label={t("teams.leadLabel")}
            value={lead ?? ""}
            disabled={members.length === 0}
            options={[{ label: t("common.none"), value: "" }, ...members.map((bot) => ({ label: bot.name, value: bot.id }))]}
            onValueChange={(value) => setLeadId(value || null)}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t("teams.sharedInstructions")} info={t("teams.sharedInstructionsInfo")}>
        <SettingsCard>
          <TextAreaField colors={colors} accessibilityLabel={t("teams.sharedInstructions")} value={instructions} onChangeText={setInstructions} minHeight={160} placeholder={t("teams.sharedInstructionsPlaceholder")} />
        </SettingsCard>
      </SettingsSection>
      <SheetActions leading={onDelete ? <Button colors={colors} variant="ghost" label={t("teams.deleteTeam")} icon="Trash2" onPress={onDelete} /> : null}>
        <Button colors={colors} variant="ghost" label={t("common.cancel")} onPress={onClose} />
        <Button
          colors={colors}
          variant="default"
          label={group ? t("common.save") : t("teams.createTeam")}
          disabled={!name.trim()}
          onPress={() => onSave({ name: name.trim().slice(0, 60), logo, leadId: lead, memberIds: members.map((bot) => bot.id), instructions })}
        />
      </SheetActions>
    </>
  );
}

/**
 * A team's name, logo, members, Chief of Staff and shared instructions, as
 * OpenMausBot's team settings. A bot can belong to multiple teams at once.
 */
export function TeamSheet(props: TeamEditorFormProps) {
  const { t } = useT();
  return (
    <Modal title={props.group ? t("teams.editTeam") : t("teams.newTeam")} open onOpenChange={(open) => !open && props.onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        <TeamEditorForm {...props} />
      </Modal.Content>
    </Modal>
  );
}
