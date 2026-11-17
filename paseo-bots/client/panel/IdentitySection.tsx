import { Modal, SettingsAction, SettingsCard, SettingsInput, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch, useToast, type SettingsInputHandle } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { randomSeed } from "../../shared/avatar";
import { avatarStyle, AVATAR_STYLE_OPTIONS } from "../../shared/avatar-options";
import type { Bot, BotAvatar, BotVoice } from "../../shared/bot";
import { Avatar } from "../Avatar";
import { useT, type TFn } from "../i18n";
import type { PanelProps } from "./BotPanel";
import { errorText, nativeTokens } from "../native";
import { canSpeak, speak, useVoices } from "../speech";
import { canPickFiles } from "../web";
import { Button, DrillRow, InputField, SheetActions, TextAreaField } from "./controls";
import { ColourRow, pickPicture, PictureSource } from "./picture";

const DESCRIPTION_MAX = 4000;

export function IdentitySection({ colors, bot, onPatch }: PanelProps) {
  const { t } = useT();
  const avatar = useRef(bot.avatar);
  avatar.current = bot.avatar;
  const setAvatar = (patch: Partial<BotAvatar>) => {
    avatar.current = { ...avatar.current, ...patch };
    onPatch({ avatar: avatar.current });
  };
  const [sheet, setSheet] = useState(false);
  const [nameEmpty, setNameEmpty] = useState(!bot.name.trim());
  const length = bot.description.length;

  return (
    <>
      <SettingsSection title={t("panel.avatarSection")}>
        <SettingsCard>
          <DrillRow colors={colors} label={t("panel.pictureLabel")} hint={pictureHint(t, bot)} hintLines={2} trailing={<Avatar avatar={bot.avatar} size={40} />} onPress={() => setSheet(true)} />
        </SettingsCard>
      </SettingsSection>
      {sheet ? <AvatarEditor colors={colors} bot={bot} setAvatar={setAvatar} onClose={() => setSheet(false)} /> : null}
      <SettingsSection title={t("panel.profileSection")}>
        <SettingsCard>
          <InputField colors={colors}
            label={t("panel.rowName")}
            error={nameEmpty ? t("panel.giveBotAName") : null}
            initialValue={bot.name}
            placeholder={t("panel.namePlaceholder")}
            onChangeText={(name) => {
              setNameEmpty(!name.trim());
              onPatch({ name: name.replace(/\n/g, " ").slice(0, 100) });
            }}
          />
          <InputField colors={colors}
            label={t("panel.rowTitle")}
            hint={t("panel.titleHint")}
            initialValue={bot.title}
            placeholder={t("panel.titlePlaceholder")}
            onChangeText={(title) => onPatch({ title: title.replace(/\n/g, " ").slice(0, 200) })}
          />
          <TextAreaField
            colors={colors}
            label={t("panel.rowBlurb")}
            hint={t("panel.blurbHint")}
            error={length >= DESCRIPTION_MAX ? t("panel.atCharLimit", { max: DESCRIPTION_MAX }) : null}
            defaultValue={bot.description}
            maxLength={DESCRIPTION_MAX}
            onChangeText={(description) => onPatch({ description: description.slice(0, DESCRIPTION_MAX) })}
            placeholder={t("panel.blurbPlaceholder")}
          />
        </SettingsCard>
      </SettingsSection>
      {canSpeak ? <VoiceSection bot={bot} onPatch={onPatch} /> : null}
    </>
  );
}

function pictureHint(t: TFn, bot: Bot): string {
  if (bot.avatar.imageUrl?.startsWith("data:")) return t("panel.pictureYour");
  return bot.avatar.imageUrl ? t("panel.pictureUrl") : AVATAR_STYLE_OPTIONS.find((entry) => entry.value === avatarStyle(bot.avatar.style))!.description;
}

/** Everything about the picture: the face, its colour and shape, or a picture of your own. */
function AvatarEditor({ colors, bot, setAvatar, onClose }: { colors: PanelProps["colors"]; bot: Bot; setAvatar(patch: Partial<BotAvatar>): void; onClose(): void }) {
  const { t } = useT();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false), mounted = useRef(true);
  const latestSetAvatar = useRef(setAvatar);
  latestSetAvatar.current = setAvatar;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const upload = async () => {
    if (uploadLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    try { const imageUrl = await pickPicture(); if (imageUrl && mounted.current) latestSetAvatar.current({ imageUrl }); }
    catch (error) { if (mounted.current) toast.error(errorText(error)); }
    finally { uploadLock.current = false; if (mounted.current) setUploading(false); }
  };
  return (
    <Modal title={t("panel.avatarSection")} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <SettingsCard>
          <SettingsRow label={t("panel.pictureLabel")} hint={pictureHint(t, bot)}>
            <Avatar avatar={bot.avatar} size={56} dark={nativeTokens(colors).dark} />
          </SettingsRow>
          <SettingsSelect
            label="Style"
            value={bot.avatar.imageUrl ? "custom" : avatarStyle(bot.avatar.style)}
            options={[...AVATAR_STYLE_OPTIONS.map(({ label, value }) => ({ label, value })), ...(bot.avatar.imageUrl ? [{ label: "Custom picture", value: "custom" }] : [])]}
            onValueChange={(style) => { if (style !== "custom") setAvatar({ style: avatarStyle(style), imageUrl: null }); }}
          />
          <SettingsAction label={t("panel.newFaceLabel")} hint={t("panel.newFaceHint")} actionLabel={t("panel.rerollAction")} onPress={() => setAvatar({ seed: randomSeed(), imageUrl: null })} />
          {canPickFiles ? <SettingsAction label={t("panel.uploadPictureLabel")} hint={t("panel.uploadPictureHint")} actionLabel={uploading ? t("common.loading") : t("panel.uploadAction")} disabled={uploading} onPress={() => void upload()} /> : null}
          {!bot.avatar.imageUrl ? <>
            <ColourRow colors={colors} value={bot.avatar.palette} onChange={(palette) => setAvatar({ palette })} />
            <AvatarSeed seed={bot.avatar.seed} onChange={(seed) => setAvatar({ seed })} />
          </> : null}
          <SettingsSelect
            label={t("panel.rowShape")}
            value={bot.avatar.shape}
            options={[
              { label: t("panel.shapeCircle"), value: "circle" },
              { label: t("panel.shapeRounded"), value: "rounded" },
              { label: t("panel.shapeSquare"), value: "square" },
            ]}
            onValueChange={(shape) => setAvatar({ shape })}
          />
          <PictureSource colors={colors} imageUrl={bot.avatar.imageUrl} hint={t("panel.pictureUrlHint")} placeholder="https://example.com/avatar.png" onChange={(imageUrl) => setAvatar({ imageUrl })} />
        </SettingsCard>
        <SheetActions>
          <Button colors={colors} variant="default" label={t("common.done")} onPress={onClose} />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}

function AvatarSeed({ seed, onChange }: { seed: string; onChange(seed: string): void }) {
  const input = useRef<SettingsInputHandle>(null);
  useEffect(() => { if (input.current?.getText() !== seed) input.current?.replaceText(seed); }, [seed]);
  return <SettingsInput ref={input} label="Seed" hint="The same seed and style always draw the same avatar" initialValue={seed} onChangeText={(text) => {
    const next = text.slice(0, 200);
    if (next !== text) input.current?.replaceText(next);
    onChange(next);
  }} />;
}

/** The device voice a bot's replies are read in, and whether finished replies are read out. */
function VoiceSection({ bot, onPatch }: Pick<PanelProps, "bot" | "onPatch">) {
  const { t } = useT();
  const voices = useVoices();
  const setVoice = (patch: Partial<BotVoice>) => onPatch({ voice: { ...bot.voice, ...patch } });
  const missing = bot.voice.name !== null && voices.length > 0 && !voices.some((voice) => voice.name === bot.voice.name);
  return (
    <SettingsSection title={t("panel.rowVoice")} info={t("panel.voiceInfo")}>
      <SettingsCard>
        <SettingsSelect
          label={t("panel.rowVoice")}
          hint={missing ? t("panel.voiceMissingHint", { name: bot.voice.name ?? "" }) : undefined}
          value={bot.voice.name ?? ""}
          options={[{ label: t("common.default"), value: "" }, ...voices.map((voice) => ({ label: voice.name.includes("(") ? voice.name : `${voice.name} (${voice.lang})`, value: voice.name }))]}
          onValueChange={(name) => setVoice({ name: name || null })}
        />
        <SettingsAction label={t("panel.hearItLabel")} hint={t("panel.hearItHint")} actionLabel={t("panel.playAction")} onPress={() => speak(`voice-test:${bot.id}`, t("panel.voiceTestSample", { name: bot.name || t("panel.voiceTestFallbackName") }), bot.voice.name)} />
        <SettingsSwitch label={t("panel.rowReadReplies")} hint={t("panel.readRepliesHint")} value={bot.voice.readReplies} onValueChange={(readReplies) => setVoice({ readReplies })} />
      </SettingsCard>
    </SettingsSection>
  );
}
