import * as http from "node:http";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { dispatchHookLocally } from "../daemon/index.js";
import { getSidecarPaths } from "../registry/store.js";

export { dispatchHookLocally };

const CAPTURED_ENV_KEYS = [
  "CLAUDE_ENV_FILE",
  "CLAUDE_PROJECT_DIR",
  "GEMINI_PROJECT_DIR",
  "CURSOR_PROJECT_DIR",
  "OPENHANDS_PROJECT_DIR",
  "CODEX_HOME",
  "PWD",
  "CLAUDE_EFFORT",
  "SIDECAR_RUNTIME",
] as const;

export interface ShimCliArgs {
  event?: string;
  runtime?: string;
}

export function parseShimCliArgs(argv: string[]): ShimCliArgs {
  const parsed: ShimCliArgs = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--event" && i + 1 < argv.length) {
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        parsed.event = val;
        i += 1;
      }
    } else if (arg.startsWith("--event=")) {
      const val = arg.slice("--event=".length);
      if (val) parsed.event = val;
    } else if (arg === "--runtime" && i + 1 < argv.length) {
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        parsed.runtime = val;
        i += 1;
      }
    } else if (arg.startsWith("--runtime=")) {
      const val = arg.slice("--runtime=".length);
      if (val) parsed.runtime = val;
    }
  }
  return parsed;
}

function pickNonEmptyString(...values: unknown[]): string | undefined {
  for (const val of values) {
    if (typeof val === "string" && val.trim().length > 0) {
      return val;
    }
  }
  return undefined;
}

function firstWorkspacePath(val: unknown): string | undefined {
  if (!Array.isArray(val)) return undefined;
  for (const item of val) {
    if (typeof item === "string" && item.trim().length > 0) {
      return item;
    }
  }
  return undefined;
}

export function normalizeShimPayload(
  rawPayload: unknown,
  env: Record<string, string | undefined> = process.env,
  cliArgs: ShimCliArgs = {},
): Record<string, unknown> {
  const raw: Record<string, unknown> =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as Record<string, unknown>)
      : {};

  const hasGeminiShape =
    raw.conversationId !== undefined ||
    raw.workspacePaths !== undefined ||
    raw.artifactDirectoryPath !== undefined ||
    raw.invocationNum !== undefined ||
    raw.toolCall !== undefined;

  const runtime =
    pickNonEmptyString(raw.runtime, cliArgs.runtime, env.SIDECAR_RUNTIME) ??
    (pickNonEmptyString(env.OPENHANDS_PROJECT_DIR)
      ? "openhands"
      : hasGeminiShape
        ? "gemini-cli"
        : "claude-code");

  const canonicalCwd =
    pickNonEmptyString(
      raw.canonical_cwd,
      raw.cwd,
      raw.workspace_root,
      raw.project_dir,
    ) ??
    firstWorkspacePath(raw.workspacePaths) ??
    pickNonEmptyString(
      env.CLAUDE_PROJECT_DIR,
      env.OPENHANDS_PROJECT_DIR,
      env.GEMINI_PROJECT_DIR,
      env.CURSOR_PROJECT_DIR,
      env.PWD,
    ) ??
    process.cwd();

  const sessionId =
    pickNonEmptyString(raw.session_id, raw.sessionId, raw.conversationId) ??
    "default";

  const rawToolCall =
    raw.toolCall && typeof raw.toolCall === "object" && !Array.isArray(raw.toolCall)
      ? (raw.toolCall as Record<string, unknown>)
      : undefined;

  const toolName = pickNonEmptyString(raw.tool_name, rawToolCall?.name);
  const toolInput =
    raw.tool_input && typeof raw.tool_input === "object" && !Array.isArray(raw.tool_input)
      ? (raw.tool_input as Record<string, unknown>)
      : rawToolCall?.args && typeof rawToolCall.args === "object" && !Array.isArray(rawToolCall.args)
        ? (rawToolCall.args as Record<string, unknown>)
        : undefined;

  const toolCall =
    raw.toolCall !== undefined
      ? raw.toolCall
      : toolName
        ? { name: toolName, args: toolInput ?? {} }
        : undefined;

  const hasToolResult =
    raw.tool_response !== undefined ||
    raw.tool_output !== undefined ||
    raw.toolResult !== undefined;

  const eventName =
    pickNonEmptyString(
      raw.event_name,
      raw.hook_event_name,
      raw.event,
      cliArgs.event,
      env.SIDECAR_HOOK_EVENT,
    ) ??
    (rawToolCall !== undefined || raw.toolCall !== undefined || toolName !== undefined
      ? hasToolResult
        ? "PostToolUse"
        : "PreToolUse"
      : raw.invocationNum !== undefined
        ? "PreInvocation"
        : "SessionStart");

  const timestamp =
    pickNonEmptyString(raw.timestamp) ?? new Date().toISOString();

  return {
    ...raw,
    canonical_cwd: canonicalCwd,
    event_name: eventName,
    session_id: sessionId,
    runtime,
    timestamp,
    ...(toolName !== undefined ? { tool_name: toolName } : {}),
    ...(toolInput !== undefined ? { tool_input: toolInput } : {}),
    ...(toolCall !== undefined ? { toolCall } : {}),
  };
}

export interface ShimResponse {
  stdoutJson?: unknown;
  stderrText?: string;
  exitCode?: number;
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function captureHostEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of CAPTURED_ENV_KEYS) {
    const val = process.env[key];
    if (val !== undefined) {
      env[key] = val;
    }
  }
  return env;
}

function postOverUds(socketPath: string, body: string, timeoutMs = 5000): Promise<ShimResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath,
        path: "/hook",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`UDS HTTP ${res.statusCode}: ${text}`));
            return;
          }
          try {
            resolve(text ? (JSON.parse(text) as ShimResponse) : {});
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("UDS request timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function postOverHttp(url: string, body: string, timeoutMs = 5000): Promise<ShimResponse> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${text}`));
            return;
          }
          try {
            resolve(text ? (JSON.parse(text) as ShimResponse) : {});
          } catch (err) {
            reject(err);
          }
        });
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("HTTP request timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

export async function runShim(): Promise<void> {
  const rawInput = await readStdin();
  let parsedPayload: unknown = {};
  if (rawInput.trim().length > 0) {
    try {
      parsedPayload = JSON.parse(rawInput);
    } catch {
      parsedPayload = { raw: rawInput };
    }
  }

  const cliArgs = parseShimCliArgs(process.argv.slice(2));
  const payload = normalizeShimPayload(parsedPayload, process.env, cliArgs);
  const env = captureHostEnv();
  const body = JSON.stringify({ payload, env });
  const sidecarHome = process.env.SIDECAR_HOME;
  const socketPath =
    process.env.SIDECAR_SOCK_PATH ?? getSidecarPaths(sidecarHome).hookSock;
  const httpUrl =
    process.env.SIDECAR_HTTP_URL ??
    `http://127.0.0.1:${process.env.SIDECAR_HTTP_PORT ?? "44880"}/hook`;

  let response: ShimResponse;
  if (process.env.SIDECAR_NO_DAEMON === "1") {
    response = await dispatchHookLocally(
      { payload: payload as never, env },
      { sidecarHome, hostEnv: process.env },
    );
  } else {
    try {
      response = await postOverUds(socketPath, body);
    } catch {
      try {
        response = await postOverHttp(httpUrl, body);
      } catch {
        response = await dispatchHookLocally(
          { payload: payload as never, env },
          { sidecarHome, hostEnv: process.env },
        );
      }
    }
  }

  if (response.stdoutJson !== undefined && response.stdoutJson !== null) {
    const out =
      typeof response.stdoutJson === "string"
        ? response.stdoutJson
        : JSON.stringify(response.stdoutJson);
    process.stdout.write(out.endsWith("\n") ? out : `${out}\n`);
  }

  if (response.stderrText) {
    process.stderr.write(
      response.stderrText.endsWith("\n") ? response.stderrText : `${response.stderrText}\n`,
    );
  }

  const code = response.exitCode === 2 ? 2 : 0;
  process.exit(code);
}

const isMain =
  Boolean(process.argv[1]) &&
  (import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href ||
    path.basename(process.argv[1]) === "sidecar-hook-shim");

if (isMain) {
  runShim().catch(() => {
    process.stderr.write("[sidecar-hook-shim] unexpected error, failing open\n");
    process.exit(0);
  });
}
