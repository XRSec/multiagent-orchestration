import { useSettings } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import { botSettings, type BotSettingsValues } from "../shared/bot";
import { setUiLanguageOverride, translateNow } from "./i18n";

export type BotSettingsState = ReturnType<typeof useBotSettingsState>;

const MAX_SAVE_ATTEMPTS = 3;
const DEFAULT_RELOAD_WAIT_TIMEOUT_MS = 250;
const DEFAULT_RELOAD_POLL_INTERVAL_MS = 10;

function useBotSettingsState() {
  return useSettings(botSettings);
}

export interface BotSettingsCommitOptions {
  getLatest: () => BotSettingsState;
  onError: (message: string) => void;
  fallbackErrorMessage?: () => string;
  maxAttempts?: number;
  reloadWaitTimeoutMs?: number;
  reloadPollIntervalMs?: number;
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) {
        out[key] = stripUndefined(entry);
      }
    }
    return out as T;
  }
  return value;
}

async function waitForRefreshedSettings(
  getLatest: () => BotSettingsState,
  prevRevision: string,
  timeoutMs: number,
  pollMs: number,
): Promise<BotSettingsState> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const state = getLatest();
    if (state.status === "error" || state.status === "invalid") return state;
    if (state.status === "ready" && state.revision !== prevRevision) return state;
    if (Date.now() >= deadline) return state;
    await new Promise<void>((resolve) => setTimeout(resolve, pollMs));
  }
}

export function createBotSettingsCommitter(options: BotSettingsCommitOptions) {
  const {
    getLatest,
    onError,
    fallbackErrorMessage = () => translateNow("common.couldNotSaveBots"),
    maxAttempts = MAX_SAVE_ATTEMPTS,
    reloadWaitTimeoutMs = DEFAULT_RELOAD_WAIT_TIMEOUT_MS,
    reloadPollIntervalMs = DEFAULT_RELOAD_POLL_INTERVAL_MS,
  } = options;
  let queue: Promise<unknown> = Promise.resolve();

  return (mutate: (values: BotSettingsValues) => BotSettingsValues): Promise<boolean> => {
    const run = async (): Promise<boolean> => {
      let lastSaveError: string | null = null;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const current = getLatest();
        if (current.status !== "ready") {
          if (attempt === 0) return false;
          break;
        }
        const prevRevision = current.revision;
        const nextValues = stripUndefined(mutate(current.values));
        if (await current.save(nextValues, prevRevision)) {
          // Let the hook render the new revision before the next queued write reads it.
          await nextTick();
          return true;
        }
        if (!getLatest().saveError) {
          await nextTick();
        }
        lastSaveError = getLatest().saveError ?? lastSaveError;
        if (attempt === maxAttempts - 1) break;
        await current.reload();
        const refreshed = await waitForRefreshedSettings(
          getLatest,
          prevRevision,
          reloadWaitTimeoutMs,
          reloadPollIntervalMs,
        );
        if (refreshed.status !== "ready" || refreshed.revision === prevRevision) {
          break;
        }
      }
      onError(lastSaveError ?? getLatest().saveError ?? fallbackErrorMessage());
      return false;
    };
    const result = queue.then(run);
    queue = result.catch(() => false);
    return result;
  };
}

/**
 * The bots settings document with one write queue. Every write reads the latest
 * revision when it runs and retries on a conflict, so autosaves, menu actions
 * and the other plugin surface never overwrite each other.
 */
export function useBotSettings() {
  const settings = useBotSettingsState();
  const toast = useToast();
  const latest = useRef(settings);
  latest.current = settings;
  const commitRef = useRef<ReturnType<typeof createBotSettingsCommitter> | null>(null);
  const toastErrorRef = useRef(toast.error);
  toastErrorRef.current = toast.error;

  if (!commitRef.current) {
    commitRef.current = createBotSettingsCommitter({
      getLatest: () => latest.current,
      onError: (message) => toastErrorRef.current(message),
    });
  }

  const uiLanguage = settings.status === "ready" ? (settings.values.ui?.language ?? "auto") : null;

  useEffect(() => {
    if (uiLanguage !== null) setUiLanguageOverride(uiLanguage);
  }, [uiLanguage]);

  return { settings, latest, commit: commitRef.current };
}
