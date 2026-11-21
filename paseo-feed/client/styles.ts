/**
 * Purpose: Theme token mapper for paseo-feed dark and light surfaces.
 * Context: Translates Paseo PluginTheme colors into cohesive chat stream, rail, and badge palettes.
 * Usage: Call createFeedPalette(theme.colors) inside client UI components.
 */

import type { PluginTheme } from "@getpaseo/plugin";

type ThemeColors = PluginTheme["colors"];
type Rgba = readonly [number, number, number, number];

export const FEED_RAIL_WIDTH = 256;
export const FEED_STREAM_MAX_WIDTH = 820;

export interface FeedPalette {
  dark: boolean;
  canvasBg: string;
  railBg: string;
  surfaceCard: string;
  surfaceElevated: string;
  surfaceActiveRow: string;
  userBubbleBg: string;
  userBubbleBorder: string;
  botCardBg: string;
  botCardBorder: string;
  pillBg: string;
  pillMutedBg: string;
  accentBg: string;
  accentSoftBg: string;
  accentBorder: string;
  accentFg: string;
  fg: string;
  fgMuted: string;
  border: string;
  borderSubtle: string;
  success: string;
  successSoftBg: string;
  warning: string;
  warningSoftBg: string;
  danger: string;
  dangerSoftBg: string;
  inputBg: string;
}

function parseColor(color: string): Rgba | null {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3) {
      digits = digits.split("").map((ch) => ch + ch).join("");
    }
    const n = parseInt(digits.slice(0, 6), 16);
    const alpha = digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(
    value,
  );
  if (!rgb) return null;
  const rawAlpha = rgb[4];
  const alpha = rawAlpha
    ? rawAlpha.endsWith("%")
      ? parseFloat(rawAlpha) / 100
      : parseFloat(rawAlpha)
    : 1;
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
}

export function withAlpha(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (!parsed) return color;
  return `rgba(${parsed[0]}, ${parsed[1]}, ${parsed[2]}, ${alpha})`;
}

function isDarkColor(surface0: string): boolean {
  const parsed = parseColor(surface0);
  if (!parsed) return true;
  const luminance = (0.2126 * parsed[0] + 0.7152 * parsed[1] + 0.0722 * parsed[2]) / 255;
  return luminance < 0.5;
}

/** Derives dark/light adaptive palette tokens from Paseo host theme colors. */
export function createFeedPalette(colors: ThemeColors): FeedPalette {
  const dark = isDarkColor(colors.surface0);
  return {
    dark,
    canvasBg: colors.surface0,
    railBg: colors.surface1,
    surfaceCard: colors.surface1,
    surfaceElevated: colors.surface2,
    surfaceActiveRow: withAlpha(colors.accent, dark ? 0.16 : 0.12),
    userBubbleBg: withAlpha(colors.accent, dark ? 0.2 : 0.12),
    userBubbleBorder: withAlpha(colors.accent, dark ? 0.42 : 0.3),
    botCardBg: colors.surface1,
    botCardBorder: colors.border,
    pillBg: colors.surface2,
    pillMutedBg: withAlpha(colors.foreground, dark ? 0.08 : 0.06),
    accentBg: colors.accent,
    accentSoftBg: withAlpha(colors.accent, dark ? 0.16 : 0.11),
    accentBorder: withAlpha(colors.accent, dark ? 0.45 : 0.35),
    accentFg: colors.accentForeground,
    fg: colors.foreground,
    fgMuted: colors.foregroundMuted,
    border: colors.border,
    borderSubtle: withAlpha(colors.border, dark ? 0.55 : 0.7),
    success: colors.statusSuccess,
    successSoftBg: withAlpha(colors.statusSuccess, dark ? 0.18 : 0.13),
    warning: colors.statusWarning,
    warningSoftBg: withAlpha(colors.statusWarning, dark ? 0.18 : 0.13),
    danger: colors.statusDanger,
    dangerSoftBg: withAlpha(colors.statusDanger, dark ? 0.18 : 0.13),
    inputBg: colors.surface2,
  };
}
