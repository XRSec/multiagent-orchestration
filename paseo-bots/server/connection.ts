import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createPaseoApi } from "@getpaseo/client";
import { createHostClient } from "@getpaseo/client/node";
import type { BotsHost } from "./host";

const execute = promisify(execFile);
const MAC_APP_PASEO_CLI = "/Applications/Paseo.app/Contents/Resources/bin/paseo";

async function readDaemonStatusJson(home: string): Promise<string> {
  const candidates = [process.env.PASEO_CLI_PATH, "paseo", MAC_APP_PASEO_CLI].filter(
    (item): item is string => Boolean(item && item.trim()),
  );
  let lastError: unknown;
  for (const bin of candidates) {
    try {
      const { stdout } = await execute(bin, ["daemon", "status", "--json", "--home", home], {
        timeout: 15_000,
        maxBuffer: 256 * 1024,
      });
      return stdout;
    } catch (error) {
      lastError = error;
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") continue;
      throw error;
    }
  }
  throw lastError ?? new Error("Paseo CLI executable not found.");
}

const AUTH_ERROR_PATTERN = /password required|unauthorized|4401/i;
const TRANSIENT_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000] as const;

export function isAuthConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return AUTH_ERROR_PATTERN.test(message) || AUTH_ERROR_PATTERN.test(code);
}

export function nextRetryDelayMs(attempt: number): number {
  const index = Math.min(Math.max(0, Math.floor(attempt)), TRANSIENT_BACKOFF_MS.length - 1);
  return TRANSIENT_BACKOFF_MS[index]!;
}

export interface ConnectSchedulerHostDeps {
  readStatusJson?: (home: string) => Promise<string>;
  createClient?: typeof createHostClient;
  createApi?: typeof createPaseoApi;
  initialDelayMs?: number;
}

/** The public SDK has no plugin startup context. Borrow one when a hook/RPC
 * arrives; until then a server-owned local SDK connection keeps schedules alive
 * without an app. The CLI resolves the selected home and endpoint (including
 * sockets); no plugin IPC or credentials are read from private runtime files. */
export function connectSchedulerHost(host: BotsHost, deps: ConnectSchedulerHostDeps = {}): () => Promise<void> {
  const readStatus = deps.readStatusJson ?? readDaemonStatusJson;
  const createClient = deps.createClient ?? createHostClient;
  const createApi = deps.createApi ?? createPaseoApi;
  const initialDelayMs = deps.initialDelayMs ?? 1_000;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let close: (() => Promise<void>) | null = null;
  let connecting: Promise<void> | null = null;
  let authWarned = false;
  let retryAttempt = 0;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const release = async () => {
    const current = close;
    close = null;
    await current?.();
  };
  const detach = host.onAttach(() => {
    // A hook can arrive in the middle of create(). Keep the fallback connection
    // alive until teardown so its already-running request can finish safely.
    if (host.hasPluginApi) clearTimer();
  });
  const connect = async () => {
    if (stopped || host.hasPluginApi) return;
    try {
      const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
      const stdout = await readStatus(home);
      if (stopped || host.hasPluginApi) return;
      const status = JSON.parse(stdout) as { listen?: string; connectedDaemon?: string };
      if (!status.listen || status.connectedDaemon !== "reachable") throw new Error("The local Paseo daemon is not reachable.");
      const client = createClient(status.listen, { clientId: "paseo-bots-scheduler", connectTimeoutMs: 10_000, reconnect: { enabled: true } });
      const api = createApi(client);
      close = async () => { await api.dispose(); await client.close(); };
      await client.connect();
      if (stopped || host.hasPluginApi) { await release(); return; }
      retryAttempt = 0;
      authWarned = false;
      host.attach(api, true);
    } catch (error) {
      await release().catch(() => {});
      if (stopped || host.hasPluginApi) return;
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthConnectionError(error)) {
        host.bootstrapError = `Unattended scheduler connection requires daemon authentication (${message}); waiting for plugin API attach.`;
        if (!authWarned) {
          authWarned = true;
          console.warn(`paseo-bots: unattended scheduler connection halted on authentication error (${message}); waiting for plugin API attach.`);
        }
        clearTimer();
        return;
      }
      host.bootstrapError = `Unattended scheduler connection failed: ${message}`;
      const delay = nextRetryDelayMs(retryAttempt);
      retryAttempt = Math.min(retryAttempt + 1, TRANSIENT_BACKOFF_MS.length - 1);
      timer = setTimeout(start, delay);
      timer.unref?.();
    }
  };
  const start = () => { connecting = connect(); };
  timer = setTimeout(start, initialDelayMs);
  timer.unref?.();
  return async () => {
    stopped = true;
    detach();
    clearTimer();
    await release().catch(() => {});
    await connecting;
  };
}
