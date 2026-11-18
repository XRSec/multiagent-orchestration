/**
 * Purpose: Client UI state & preference management (including companion intent compilation toggle).
 * Context: Shared between BotLauncherCore, Composer, and stream message views.
 * Usage: const [enabled, setEnabled] = useCompanionIntentEnabled();
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "@paseo-bots:companion-intent-enabled";

function safeReadStorage(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      return localStorage.getItem(key);
    }
  } catch {}
  return null;
}

function safeWriteStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage.setItem === "function") {
      localStorage.setItem(key, value);
    }
  } catch {}
}

let companionIntentEnabled: boolean = (() => {
  const stored = safeReadStorage(STORAGE_KEY);
  if (stored === null || stored === undefined) return true;
  return stored !== "false";
})();

const listeners = new Set<(enabled: boolean) => void>();

export function getCompanionIntentEnabled(): boolean {
  return companionIntentEnabled;
}

export function setCompanionIntentEnabled(enabled: boolean): void {
  if (companionIntentEnabled === enabled) return;
  companionIntentEnabled = enabled;
  safeWriteStorage(STORAGE_KEY, enabled ? "true" : "false");
  for (const listener of listeners) {
    listener(enabled);
  }
}

export function useCompanionIntentEnabled(): [boolean, (enabled: boolean) => void] {
  const [enabled, setLocal] = useState(companionIntentEnabled);

  useEffect(() => {
    const listener = (val: boolean) => setLocal(val);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return [enabled, setCompanionIntentEnabled];
}
