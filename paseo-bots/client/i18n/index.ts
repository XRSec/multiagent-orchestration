import * as pluginClient from "@getpaseo/plugin/client";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  detectFallbackLocale,
  resolveAppLocale,
  translate,
  type AppLocale,
  type LanguagePreference,
  type TFn,
  type TranslateParams,
  type TranslationKey,
  translationResources,
} from "./locale";

export * from "./locale";
export * from "./format";

interface RuntimeTranslations<T extends Record<string, unknown>> {
  resources: { en: T; [locale: string]: unknown };
  message(key: string, options?: Record<string, unknown>): unknown;
}

interface PluginTranslationRuntime {
  locale?: string;
  t?: (translations: unknown, key: string, options?: Record<string, unknown>) => string;
  resolve?: (message: unknown) => string;
  subscribe?: (listener: () => void) => () => void;
}

interface PluginClientI18nExt {
  defineTranslations?: <T extends Record<string, unknown>>(input: {
    resources: { en: T; [locale: string]: unknown };
  }) => RuntimeTranslations<T>;
  useTranslation?: <T extends Record<string, unknown>>(translations: RuntimeTranslations<T>) => {
    locale: string;
    t: (key: string, options?: Record<string, unknown>) => string;
  };
}

const runtimeClient = pluginClient as unknown as PluginClientI18nExt;
const hostUseTranslation = (() => {
  try {
    return Object.prototype.hasOwnProperty.call(runtimeClient, "useTranslation") && typeof runtimeClient.useTranslation === "function"
      ? runtimeClient.useTranslation
      : null;
  } catch {
    return null;
  }
})();

function createPluginTranslations(): RuntimeTranslations<typeof translationResources.en> | null {
  try {
    if (!Object.prototype.hasOwnProperty.call(runtimeClient, "defineTranslations") || typeof runtimeClient.defineTranslations !== "function") return null;
    return runtimeClient.defineTranslations({ resources: translationResources });
  } catch {
    return null;
  }
}

export const pluginTranslations = createPluginTranslations();

interface LocaleStoreSnapshot {
  override: LanguagePreference;
  hostLocale: AppLocale;
}

let store: LocaleStoreSnapshot = {
  override: "auto",
  hostLocale: detectFallbackLocale(),
};

const listeners = new Set<() => void>();
let runtimeI18n: PluginTranslationRuntime | null = null;
let runtimeClientLocale: string | undefined;

function emit() {
  for (const listener of listeners) listener();
}

function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getStoreSnapshot(): LocaleStoreSnapshot {
  return store;
}

function refreshHostLocale() {
  const raw = runtimeI18n?.locale ?? runtimeClientLocale;
  const next = raw ? resolveAppLocale(raw) : detectFallbackLocale();
  if (next !== store.hostLocale) {
    store = { ...store, hostLocale: next };
    emit();
  }
}

/** Connects Paseo's runtime locale & i18n event stream from `contribute(client)`. */
export function initPluginI18n(client: PluginClientContext): () => void {
  const ext = client as PluginClientContext & { locale?: string; i18n?: PluginTranslationRuntime };
  runtimeClientLocale = ext.locale;
  runtimeI18n = ext.i18n ?? null;
  refreshHostLocale();
  const unsubscribe = typeof ext.i18n?.subscribe === "function" ? ext.i18n.subscribe(() => refreshHostLocale()) : null;
  return () => {
    unsubscribe?.();
    if (runtimeI18n === ext.i18n) runtimeI18n = null;
    if (runtimeClientLocale === ext.locale) runtimeClientLocale = undefined;
  };
}

/** Syncs the optional plugin UI language setting stored in `BotSettingsValues.ui.language`. */
export function setUiLanguageOverride(language: LanguagePreference | undefined): void {
  const next: LanguagePreference = language === "en" || language === "zh-CN" ? language : "auto";
  if (next === store.override) return;
  store = { ...store, override: next };
  emit();
}

export function getUiLanguageOverride(): LanguagePreference {
  return store.override;
}

export function getCurrentLocale(): AppLocale {
  if (store.override !== "auto") return store.override;
  const raw = runtimeI18n?.locale ?? runtimeClientLocale;
  return raw ? resolveAppLocale(raw) : store.hostLocale;
}

/** Non-hook translation helper for toasts, confirm dialogs, and menu/action handlers. */
export function translateNow(key: TranslationKey, params?: TranslateParams): string {
  return translate(getCurrentLocale(), key, params);
}

/**
 * Plugin registration message helper (`addSidebarItem`, `addSettingsScreen`, etc.).
 * Returns a reactive Paseo `PluginMessage` when supported at runtime (cast as string
 * for `@getpaseo/plugin@0.9.2` type compatibility), falling back to resolved text.
 */
export function tMsg(key: TranslationKey, params?: TranslateParams): string {
  if (pluginTranslations && store.override === "auto") {
    return pluginTranslations.message(key, params) as string;
  }
  return translateNow(key, params);
}

function useHostTranslation(): { locale: string; t: (key: string, params?: Record<string, unknown>) => string } | null {
  if (!hostUseTranslation || !pluginTranslations) return null;
  try {
    return hostUseTranslation(pluginTranslations);
  } catch {
    return null;
  }
}

/** React hook returning the active locale and strongly-typed `t(key, params?)`. */
export function useT(): { locale: AppLocale; t: TFn } {
  const host = useHostTranslation();
  const state = useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);
  const hostLocaleResolved = host?.locale ? resolveAppLocale(host.locale) : null;

  useEffect(() => {
    if (hostLocaleResolved && hostLocaleResolved !== store.hostLocale) {
      store = { ...store, hostLocale: hostLocaleResolved };
      emit();
    }
  }, [hostLocaleResolved]);

  const locale: AppLocale = state.override !== "auto" ? state.override : (hostLocaleResolved ?? state.hostLocale);
  const hostT = state.override === "auto" ? host?.t : undefined;

  const t = useMemo<TFn>(() => {
    if (hostT) {
      return (key, params) => hostT(key, params);
    }
    return (key, params) => translate(locale, key, params);
  }, [hostT, locale]);

  return { locale, t };
}
