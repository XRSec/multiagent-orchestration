import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsSection, SettingsSwitch, useToast } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { skillNeedsReview, type Bot, type LibrarySkill } from "../../shared/bot";
import { skillImportRpc, skillReadRpc } from "../../shared/rpc";
import { useT } from "../i18n";
import { errorText, MONO_FONT, MONO_PROPS } from "../native";
import { Alert, Button, CardNote, SectionLink } from "../panel/controls";
import { code, codeLine } from "../typography";
import { BotsCard, DangerZone, PageTitle } from "./parts";
import { EditSkillSheet, ReviewSkillSheet, type SavedSkill } from "./SkillSheets";

type Colors = PluginTheme["colors"];

interface SkillPageProps {
  colors: Colors;
  skill: LibrarySkill;
  bots: Bot[];
  /** Compact layouts show the name in the back bar instead of a page title. */
  showTitle: boolean;
  onPatch(patch: Partial<LibrarySkill>): void;
  onToggleBot(bot: Bot, on: boolean): void;
  onImported(skills: SavedSkill[]): void;
  onDelete(): void;
}

export const skillQueryKey = (id: string) => ["paseo-bots", "library-skill", id];

/** Imports stored as "github.com/owner/repo/path" update from "owner/repo/path"; links update from themselves. */
function updateSource(source: string): string | null {
  if (source.startsWith("github.com/")) return source.slice("github.com/".length);
  return /^https?:\/\//i.test(source) ? source : null;
}

export function SkillPage({ colors, skill, bots, showTitle, onPatch, onToggleBot, onImported, onDelete }: SkillPageProps) {
  const { t } = useT();
  const read = useRpc(skillReadRpc);
  const importSkills = useRpc(skillImportRpc);
  const queryClient = useQueryClient();
  const toast = useToast();
  const file = useQuery({ queryKey: skillQueryKey(skill.id), queryFn: () => read({ id: skill.id }) });
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [updating, setUpdating] = useState(false);
  const source = updateSource(skill.source);
  const needsReview = skillNeedsReview(skill, file.data?.sha ?? null);
  const changedSinceReview = typeof skill.reviewedSha === "string" && needsReview;

  const update = async () => {
    if (!source) return;
    setUpdating(true);
    try {
      const { skills } = await importSkills({ source });
      onImported(skills);
      await queryClient.invalidateQueries({ queryKey: skillQueryKey(skill.id) });
      toast.show(t("library.skillUpdatedToast"), { variant: "success" });
    } catch (error) {
      toast.error(t("library.couldNotUpdate", { error: errorText(error) }));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      {showTitle ? <PageTitle colors={colors} title={skill.id} /> : null}
      {needsReview && file.data && !file.data.missing ? (
        <View style={{ marginBottom: 24, gap: 12 }}>
          <Alert
            colors={colors}
            variant="warning"
            title={changedSinceReview ? t("library.skillChangedSinceReview") : t("library.skillReviewBeforeUse")}
            description={changedSinceReview ? t("library.skillChangedDesc") : t("library.skillReviewBeforeUseDesc")}
          />
          <View style={{ alignItems: "flex-start" }}>
            <Button colors={colors} variant="outline" icon="ScanEye" label={t("library.review")} onPress={() => setReviewing(true)} />
          </View>
        </View>
      ) : null}
      <SettingsSection title={t("library.skillSection")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("common.enabled")}
            hint={needsReview ? t("library.skillEnabledHintReview") : t("library.skillEnabledHintOff")}
            value={skill.enabled && !needsReview}
            onValueChange={(enabled) => (enabled && needsReview ? setReviewing(true) : onPatch({ enabled }))}
          />
          {source ? <SettingsAction label={t("library.skillSourceLabel")} hint={skill.source} actionLabel={updating ? t("common.updating") : t("library.skillUpdateAction")} disabled={updating} onPress={() => void update()} /> : null}
        </SettingsCard>
      </SettingsSection>

      <BotsCard colors={colors} bots={bots} noun="skill" uses={(bot) => bot.skillIds.includes(skill.id)} onToggle={onToggleBot} />

      <SettingsSection
        title="SKILL.md"
        info={t("library.skillInfo")}
        trailing={file.data && !file.data.missing ? <SectionLink colors={colors} icon="Pencil" label={t("common.edit")} onPress={() => setEditing(true)} /> : undefined}
      >
        <SettingsCard>
          {file.isLoading ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <ActivityIndicator size="small" color={colors.foregroundMuted} />
            </View>
          ) : file.data?.missing ? (
            <CardNote colors={colors} text={source ? t("library.skillMissingWithSource") : t("library.skillMissing")} />
          ) : (
            <View style={{ padding: 16 }}>
              <Text selectable {...MONO_PROPS} style={{ fontFamily: MONO_FONT, fontSize: code(), lineHeight: codeLine(), color: colors.foreground }}>
                {file.data?.text ?? ""}
              </Text>
            </View>
          )}
        </SettingsCard>
      </SettingsSection>

      <DangerZone
        label={t("library.skillDeleteLabel")}
        hint={t("library.skillDeleteHint")}
        actionLabel={t("common.delete")}
        confirmTitle={t("library.skillDeleteConfirmTitle")}
        confirmMessage={t("library.skillDeleteConfirmMessage", { id: skill.id })}
        onConfirm={onDelete}
      />

      {editing && file.data ? (
        <EditSkillSheet
          colors={colors}
          id={skill.id}
          saved={file.data.text}
          onClose={() => setEditing(false)}
          onSaved={(description, sha) => {
            setEditing(false);
            // You wrote it, so it counts as reviewed.
            onPatch({ description, reviewedSha: sha });
            void queryClient.invalidateQueries({ queryKey: skillQueryKey(skill.id) });
          }}
        />
      ) : null}
      {reviewing && file.data?.sha ? (
        <ReviewSkillSheet
          colors={colors}
          id={skill.id}
          text={file.data.text}
          sha={file.data.sha}
          files={file.data.files}
          onClose={() => setReviewing(false)}
          onApprove={(sha) => {
            setReviewing(false);
            onPatch({ enabled: true, reviewedSha: sha });
          }}
        />
      ) : null}
    </>
  );
}
