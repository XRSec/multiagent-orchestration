/**
 * Purpose: Preset avatar resolution, URI scheme definitions, and CAS media protocol parsing.
 * Context: Decoupled bot avatar asset architecture for Paseo Bots and Cindy compatibility.
 * Usage: import { parsePresetId, resolvePresetDataUri, isPresetAvatarUrl, isCasMediaUrl } from "./avatar-presets";
 * Prerequisites: Generated PRESET_DATA in ./avatar-presets-data.
 */

import { PRESET_DATA, type PresetDataItem } from "./avatar-presets-data";

export type { PresetDataItem };

// Ensure canonical alias compatibility for xiaohongshu / xhs in PRESET_DATA dictionary
if (PRESET_DATA["xhs"] && !PRESET_DATA["xiaohongshu"]) {
  (PRESET_DATA as Record<string, PresetDataItem>)["xiaohongshu"] = {
    ...PRESET_DATA["xhs"],
    id: "xiaohongshu",
  };
}

/** Supported preset URL scheme prefixes. */
export const PRESET_PREFIX = "preset:";
export const PRESET_CANONICAL_PREFIX = "preset://avatar/";
export const CINDY_PRESET_PREFIX = "cindy://avatar/preset/";

/** Supported CAS media URL scheme prefixes. */
export const MEDIA_BLOBS_PREFIX = "media://blobs/";
export const CAS_BLOBS_PREFIX = "cas://blobs/";
export const CINDY_MEDIA_BLOBS_PREFIX = "cindy-media://blobs/";

/** Regular expressions matching preset avatar sentinels. */
export const PRESET_AVATAR_RE = /^(?:preset:(?:\/\/avatar\/)?|cindy:\/\/avatar\/preset\/)([a-z0-9_-]+)$/i;

/** Regular expressions matching CAS content-addressed media blob sentinels. */
export const CAS_MEDIA_RE = /^(?:media|cas|cindy-media):\/\/blobs\/([0-9a-f]{64})\.([a-z0-9]+)$/i;

/** Comprehensive avatar image URL validator allowing remote URLs, data URIs, file URIs, presets, and CAS media. */
export const AVATAR_URL_RE = /^(https?:\/\/\S+|data:image\/\S+|file:\/\/\S+|preset:(?:\/\/avatar\/)?[a-z0-9_-]+|cindy:\/\/avatar\/preset\/[a-z0-9_-]+|(?:media|cas|cindy-media):\/\/blobs\/[0-9a-f]{64}\.[a-z0-9]+)$/i;

/** Alias map pointing alternative / legacy IDs to canonical preset IDs in PRESET_DATA. */
const PRESET_ALIASES: Readonly<Record<string, string>> = {
  // Platform aliases
  "platform-x": "x",
  "twitter": "x",
  "platform-github": "github",
  "platform-xhs": "xiaohongshu",
  "xhs": "xiaohongshu",
  "red": "xiaohongshu",

  // Cindy mascot aliases
  "preset-cindy": "cindy",

  // Cindy teammates aliases (support underscore and preset- prefix)
  "preset-teammate-1": "teammate-1",
  "teammate_1": "teammate-1",
  "preset-teammate-2": "teammate-2",
  "teammate_2": "teammate-2",
  "preset-teammate-3": "teammate-3",
  "teammate_3": "teammate-3",
  "preset-teammate-4": "teammate-4",
  "teammate_4": "teammate-4",
  "preset-teammate-5": "teammate-5",
  "teammate_5": "teammate-5",
  "preset-teammate-6": "teammate-6",
  "teammate_6": "teammate-6",
  "preset-teammate-7": "teammate-7",
  "teammate_7": "teammate-7",
  "preset-teammate-8": "teammate-8",
  "teammate_8": "teammate-8",
  "preset-teammate-9": "teammate-9",
  "teammate_9": "teammate-9",
  "preset-teammate-10": "teammate-10",
  "teammate_10": "teammate-10",
  "preset-teammate-11": "teammate-11",
  "teammate_11": "teammate-11",
  "preset-teammate-12": "teammate-12",
  "teammate_12": "teammate-12",
  "preset-teammate-13": "teammate-13",
  "teammate_13": "teammate-13",
  "preset-teammate-14": "teammate-14",
  "teammate_14": "teammate-14",
  "preset-teammate-15": "teammate-15",
  "teammate_15": "teammate-15",
  "preset-teammate-16": "teammate-16",
  "teammate_16": "teammate-16",
};

/** Normalizes a preset identifier to its canonical dictionary key. */
export function canonicalPresetId(id: string): string {
  const normalized = id.toLowerCase().trim();
  return PRESET_ALIASES[normalized] ?? normalized;
}

/** Extracts the canonical preset ID if the input matches a preset URI sentinel. */
export function parsePresetId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(PRESET_AVATAR_RE);
  if (!match || !match[1]) return null;
  return canonicalPresetId(match[1]);
}

/** Extracts CAS blob hash and extension if the input matches a CAS media URI. */
export function parseCasBlobRef(value: unknown): { hash: string; ext: string } | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(CAS_MEDIA_RE);
  if (!match || !match[1] || !match[2]) return null;
  return { hash: match[1].toLowerCase(), ext: `.${match[2].toLowerCase()}` };
}

/** Returns true if the string represents a preset avatar sentinel. */
export function isPresetAvatarUrl(value: unknown): value is string {
  return typeof value === "string" && PRESET_AVATAR_RE.test(value.trim());
}

/** Returns true if the string represents a content-addressed media blob URI. */
export function isCasMediaUrl(value: unknown): value is string {
  return typeof value === "string" && CAS_MEDIA_RE.test(value.trim());
}

/** Returns true if the avatar string is any supported remote, data, preset, or CAS URI. */
export function isSupportedAvatarUrl(value: unknown): value is string {
  return typeof value === "string" && AVATAR_URL_RE.test(value.trim());
}

/** Builds a lightweight preset sentinel (e.g. "preset:x", "preset:cindy"). */
export function presetUrl(id: string): string {
  return `${PRESET_PREFIX}${canonicalPresetId(id)}`;
}

/** Builds a content-addressed storage media URI. */
export function casMediaUrl(hash: string, ext: string): string {
  const cleanExt = ext.replace(/^\.+/, "").toLowerCase();
  return `${MEDIA_BLOBS_PREFIX}${hash.toLowerCase()}.${cleanExt}`;
}

/**
 * Synchronously resolves a preset sentinel or preset ID to its Base64 data URL.
 * Returns null if the preset is not recognized.
 */
export function resolvePresetDataUri(value: string): string | null {
  const presetId = parsePresetId(value) ?? canonicalPresetId(value);
  const item = PRESET_DATA[presetId] ?? PRESET_DATA[canonicalPresetId(presetId)];
  return item ? item.dataUrl : null;
}

/**
 * Resolves an avatar or team logo image URL:
 * - If it is a preset (e.g. "preset:x", "cindy://avatar/preset/..."), resolves it to a Base64 data URL.
 * - If it is a local "file://" URI, remote "http(s)://", or data URL, preserves it directly for native React Native rendering.
 * - Otherwise returns null to trigger pixel-sprite fallback.
 */
export function resolveAvatarUri(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const trimmed = imageUrl.trim();
  if (/^(preset:|cindy:\/\/avatar\/preset\/)/i.test(trimmed)) {
    return resolvePresetDataUri(trimmed);
  }
  return trimmed;
}

/** Returns an array of all available presets for UI selectors and pickers. */
export function listPresetAvatars(): readonly PresetDataItem[] {
  return Object.values(PRESET_DATA);
}
