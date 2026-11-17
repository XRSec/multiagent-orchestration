import { en } from "./en";
import { zhCN } from "./zh-CN";

export type AppLocale = "en" | "zh-CN";
export type LanguagePreference = "auto" | AppLocale;
export type TranslateParams = Record<string, string | number>;

type DotPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : T[K] extends Record<string, unknown> ? `${K}.${DotPaths<T[K]>}` : never;
}[keyof T & string];

export type TranslationKey = DotPaths<typeof en>;
export type TFn = (key: TranslationKey, params?: TranslateParams) => string;

export const translationResources = {
  en,
  "zh-CN": zhCN,
} as const;

/** Maps any BCP 47 / Paseo locale string into a supported plugin locale (`zh-CN` or `en`). */
export function resolveAppLocale(raw?: string | null): AppLocale {
  if (!raw) return "en";
  const normalized = raw.trim().replace(/_/g, "-").toLowerCase();
  if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans")) {
    return "zh-CN";
  }
  return "en";
}

/** Reads Paseo's persisted `@paseo:app-settings` JSON language field when not set to "system". */
export function parseAppSettingsLanguage(raw?: string | null): AppLocale | null {
  if (!raw) return null;
  try {
    const language = (JSON.parse(raw) as { language?: unknown } | null)?.language;
    if (typeof language !== "string" || !language.trim() || language === "system") return null;
    return resolveAppLocale(language);
  } catch {
    return null;
  }
}

/** Fallback locale detection when host i18n context is absent (older Paseo builds or unit tests). */
export function detectFallbackLocale(): AppLocale {
  try {
    const storage = Reflect.get(globalThis, "localStorage") as { getItem?(key: string): string | null } | undefined;
    const stored = parseAppSettingsLanguage(storage?.getItem?.("@paseo:app-settings"));
    if (stored) return stored;
  } catch {
    // Ignore storage access errors outside browser runtimes.
  }
  try {
    const nav = Reflect.get(globalThis, "navigator") as { language?: unknown } | undefined;
    if (typeof nav?.language === "string" && nav.language) {
      return resolveAppLocale(nav.language);
    }
  } catch {
    // Ignore missing navigator.
  }
  try {
    const systemLocale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (systemLocale) return resolveAppLocale(systemLocale);
  } catch {
    // Ignore Intl errors.
  }
  return "en";
}

function flattenDictionary(obj: Record<string, unknown>, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[fullKey] = value;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenDictionary(value as Record<string, unknown>, fullKey, out);
    }
  }
  return out;
}

const FLAT_DICTIONARIES: Record<AppLocale, Record<string, string>> = {
  en: flattenDictionary(en as unknown as Record<string, unknown>),
  "zh-CN": flattenDictionary(zhCN as unknown as Record<string, unknown>),
};

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (match, name: string) => {
    return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
  });
}

export function translate(locale: AppLocale, key: TranslationKey, params?: TranslateParams): string {
  const dict = FLAT_DICTIONARIES[locale] ?? FLAT_DICTIONARIES.en;
  const template = dict[key] ?? FLAT_DICTIONARIES.en[key] ?? key;
  return interpolate(template, params);
}

/** Selects the singular or plural translation key and interpolates `{{count}}`. */
export function pluralText(t: TFn, oneKey: TranslationKey, otherKey: TranslationKey, count: number): string {
  return t(count === 1 ? oneKey : otherKey, { count });
}
