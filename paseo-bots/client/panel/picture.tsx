import type { PluginTheme } from "@getpaseo/plugin";
import { SettingsAction, SettingsInput, SettingsSelect, type SettingsInputHandle } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { PALETTE_COUNT } from "../../shared/pixel";
import { translateNow, useT } from "../i18n";
import { pickFileHandles, squareImage } from "../web";

// The picture controls bot avatars and team logos share.

type Colors = PluginTheme["colors"];

/** Pictures are stored with the bot or team, so they're scaled down to this many pixels. */
export const PICTURE_SIZE = 192;
export const IMAGE_URL = /^(https?:\/\/\S+|data:image\/\S+|file:\/\/\S+|preset:(?:\/\/avatar\/)?[a-z0-9_-]+)$/i;
const MAX_UPLOAD = 20 * 1024 * 1024;

/** Picks an image file (web) and returns it as a square data URL; null when nothing was picked. */
export async function pickPicture(): Promise<string | null> {
  const [file] = await pickFileHandles({ accept: "image/png,image/jpeg,image/webp,image/gif", multiple: false });
  if (!file) return null;
  if (file.size > MAX_UPLOAD) throw new Error(translateNow("panel.pickPictureTooLarge"));
  return squareImage(`data:${file.mimeType};base64,${await file.readBase64()}`, PICTURE_SIZE);
}

/** The generated picture's colour: automatic, or one of the palettes. */
export function ColourRow({ colors, value, onChange }: { colors: Colors; value: number | null; onChange(palette: number | null): void }) {
  const { t } = useT();
  return <SettingsSelect label={t("panel.colourLabel")} value={value === null ? "automatic" : String(value)} options={[
    { label: t("panel.automaticColour"), value: "automatic" },
    ...Array.from({ length: PALETTE_COUNT }, (_, index) => ({ label: t("panel.colourIndex", { index: index + 1 }), value: String(index) })),
  ]} onValueChange={(next) => onChange(next === "automatic" ? null : Number(next))} />;
}

/** A stored custom picture with Remove, or the Image URL field. */
export function PictureSource(props: { colors: Colors; imageUrl: string | null; hint: string; placeholder: string; onChange(imageUrl: string | null): void }) {
  const { t } = useT();
  if (props.imageUrl?.startsWith("data:")) return <SettingsAction label={t("panel.imageLabel")} hint={t("panel.uploadedOrGenerated")} actionLabel={t("common.remove")} onPress={() => props.onChange(null)} />;
  return <ImageUrlField {...props} />;
}

function ImageUrlField({ colors, imageUrl, hint, placeholder, onChange }: { colors: Colors; imageUrl: string | null; hint: string; placeholder: string; onChange(imageUrl: string | null): void }) {
  const { t } = useT();
  const [text, setText] = useState(imageUrl ?? "");
  const input = useRef<SettingsInputHandle>(null);
  const applied = useRef(imageUrl);
  useEffect(() => {
    if (applied.current === imageUrl) return;
    applied.current = imageUrl;
    setText(imageUrl ?? "");
    input.current?.replaceText(imageUrl ?? "");
  }, [imageUrl]);
  return (
    <SettingsInput
      ref={input}
      label={t("panel.imageUrlLabel")}
      hint={hint}
      error={text.trim() && !IMAGE_URL.test(text.trim()) ? t("panel.invalidImageUrl") : null}
      initialValue={text}
      placeholder={placeholder}
      onChangeText={(url) => {
        setText(url);
        const trimmed = url.trim();
        if (!trimmed || IMAGE_URL.test(trimmed)) {
          applied.current = trimmed || null;
          onChange(trimmed || null);
        }
      }}
    />
  );
}
