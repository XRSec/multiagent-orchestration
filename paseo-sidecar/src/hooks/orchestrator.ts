/**
 * Purpose: Hook execution orchestrator across Tiers 00, 10, 50, and 90 with child env isolation.
 * Context: Manages lifecycle hooks for Claude Code, AGY, Codex, and OpenHands runtimes.
 * Usage: const orchestrator = new HookOrchestrator(options); orchestrator.dispatch(payload, plugins);
 * Prerequisites: Node child_process, fs/promises, crypto.
 * Justification: Multi-runtime hook dispatch, environment virtualization, and slice merging under 550 lines.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type {
  HookDispatchResult,
  HookEventPayload,
  NormalizedPluginBundle,
  SubHookDescriptor,
  WorkspaceProfile,
} from "../types.js";
import { getSidecarPaths } from "../registry/store.js";
import { matchHook } from "./matcher.js";
import { reduceHookResults, type ReducedHookOutput } from "./reducer.js";

export type InlineHookHandler = (
  payload: HookEventPayload,
  env: Record<string, string>
) => Promise<Partial<HookDispatchResult>> | Partial<HookDispatchResult>;

export interface OrchestratorOptions {
  hostEnv?: Record<string, string | undefined>;
  inlineHandlers?: Map<string, InlineHookHandler>;
  pluginDataBaseDir?: string;
}

export interface OrchestrationResult {
  results: HookDispatchResult[];
  reduced: ReducedHookOutput;
}

/**
 * Normalizes a hook priority into Tier 00, 10, 50, or 90.
 */
export function resolveTier(priority?: number): 0 | 10 | 50 | 90 {
  if (priority === undefined || Number.isNaN(priority)) return 50;
  if (priority < 10) return 0;
  if (priority < 50) return 10;
  if (priority < 90) return 50;
  return 90;
}

/**
 * Builds the child environment for a sub-hook, injecting plugin & project variables.
 */
export function buildChildEnv(
  hook: SubHookDescriptor,
  plugin: NormalizedPluginBundle | undefined,
  payload: HookEventPayload,
  workspace: WorkspaceProfile | undefined,
  hostEnv: Record<string, string | undefined>,
  envFileSlicePath: string,
  pluginDataBaseDir: string
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [k, v] of Object.entries(hostEnv)) {
    if (v !== undefined) env[k] = v;
  }

  if (workspace?.env) {
    for (const [k, v] of Object.entries(workspace.env)) {
      env[k] = v;
    }
  }

  const pluginRoot = plugin?.root_dir ?? "";
  const pluginData = path.join(pluginDataBaseDir, hook.plugin_id);

  env.CLAUDE_PLUGIN_ROOT = pluginRoot;
  env.PLUGIN_ROOT = pluginRoot;
  env.GEMINI_PLUGIN_ROOT = pluginRoot;
  env.GROK_PLUGIN_ROOT = pluginRoot;
  env.extensionPath = pluginRoot;
  env.pluginDir = pluginRoot;
  env.CLAUDE_PLUGIN_DATA = pluginData;
  env.PLUGIN_DATA = pluginData;
  env.GEMINI_PLUGIN_DATA = pluginData;
  env.CLAUDE_PROJECT_DIR = payload.canonical_cwd;
  env.OPENHANDS_PROJECT_DIR = payload.canonical_cwd;
  env.CLAUDE_ENV_FILE = envFileSlicePath;

  // Inject CLAUDE_PLUGIN_OPTION_* from plugin metadata.options or hook metadata.options
  const pluginOpts =
    (plugin?.metadata?.options as Record<string, unknown> | undefined) ?? {};
  const hookOpts =
    (hook.metadata?.options as Record<string, unknown> | undefined) ?? {};
  for (const [k, v] of Object.entries({ ...pluginOpts, ...hookOpts })) {
    if (v !== undefined && v !== null) {
      const normalizedKey = k.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
      env[`CLAUDE_PLUGIN_OPTION_${normalizedKey}`] = String(v);
    }
  }

  return env;
}

/**
 * Atomically merges a child's CLAUDE_ENV_FILE slice into the host CLAUDE_ENV_FILE.
 */
async function mergeEnvFileSlice(
  slicePath: string,
  hostEnvFile?: string
): Promise<void> {
  if (!hostEnvFile) return;

  let sliceContent = "";
  try {
    sliceContent = await fs.readFile(slicePath, "utf8");
  } catch {
    return;
  }

  const trimmed = sliceContent.trim();
  if (!trimmed) return;

  let existing = "";
  try {
    existing = await fs.readFile(hostEnvFile, "utf8");
  } catch {
    await fs.mkdir(path.dirname(hostEnvFile), { recursive: true });
  }

  const combined = existing
    ? `${existing.replace(/\n*$/, "")}\n${trimmed}\n`
    : `${trimmed}\n`;

  const tmpTarget = `${hostEnvFile}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpTarget, combined, "utf8");
  await fs.rename(tmpTarget, hostEnvFile);
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rewrites relative `hooks/...` or `scripts/...` paths in a hook command to
 * `<plugin.root_dir>/<relPath>` when missing under `canonicalCwd` and present under `plugin.root_dir`.
 */
async function resolveHookCommand(
  command: string,
  canonicalCwd: string,
  plugin?: NormalizedPluginBundle
): Promise<string> {
  if (!plugin?.root_dir) {
    return command;
  }

  const baseCommand = command
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", plugin.root_dir)
    .replaceAll("$CLAUDE_PLUGIN_ROOT", plugin.root_dir)
    .replaceAll("${extensionPath}", plugin.root_dir)
    .replaceAll("$extensionPath", plugin.root_dir)
    .replaceAll("${pluginDir}", plugin.root_dir)
    .replaceAll("$pluginDir", plugin.root_dir);

  const relPattern =
    /(^|[\s"'=;:(])(?:\.\/)?((?:hooks|scripts)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)/g;
  const candidates = new Set<string>();
  for (const m of baseCommand.matchAll(relPattern)) {
    if (m[2]) {
      candidates.add(m[2]);
    }
  }
  if (candidates.size === 0) {
    return baseCommand;
  }

  const replacements = new Map<string, string>();
  await Promise.all(
    Array.from(candidates).map(async (relPath) => {
      const cwdTarget = path.join(canonicalCwd, relPath);
      const pluginTarget = path.join(plugin.root_dir, relPath);
      const [inCwd, inPlugin] = await Promise.all([
        pathExists(cwdTarget),
        pathExists(pluginTarget),
      ]);
      if (!inCwd && inPlugin) {
        replacements.set(relPath, pluginTarget);
      }
    })
  );

  if (replacements.size === 0) {
    return baseCommand;
  }

  return baseCommand.replace(relPattern, (full, prefix: string, relPath: string) => {
    const resolved = replacements.get(relPath);
    if (!resolved) return full;
    if (prefix === '"' || prefix === "'") {
      return `${prefix}${resolved}`;
    }
    const quoted = /[\s"'$&|;<>()]/.test(resolved) ? `"${resolved}"` : resolved;
    return `${prefix}${quoted}`;
  });
}

function resolveEffectiveMatchPayload(
  payload: HookEventPayload
): Pick<HookEventPayload, "tool_name" | "tool_input" | "event_name"> {
  if (
    !payload.tool_name &&
    (payload.event_name === "SessionStart" ||
      payload.event_name === "PreInvocation")
  ) {
    const rawPayload = payload as unknown as Record<string, unknown>;
    const sessionSource =
      typeof rawPayload.source === "string" && rawPayload.source.trim()
        ? rawPayload.source.trim()
        : typeof payload.metadata?.source === "string" &&
            payload.metadata.source.trim()
          ? payload.metadata.source.trim()
          : "startup";
    return {
      ...payload,
      tool_name: sessionSource,
    };
  }
  return payload;
}

function collectCandidateHooks(
  plugins: NormalizedPluginBundle[],
  payload: HookEventPayload
): SubHookDescriptor[] {
  const candidates: SubHookDescriptor[] = [];
  const fallbackEvent =
    payload.event_name === "SessionStart"
      ? payload.runtime === "gemini-cli"
        ? undefined
        : "PreInvocation"
      : payload.event_name === "PreInvocation"
        ? "SessionStart"
        : undefined;
  const effectivePayload = resolveEffectiveMatchPayload(payload);

  for (const plugin of plugins) {
    const enabledHooks = plugin.hooks.filter((h) => h.enabled);
    const hasDirectEvent = enabledHooks.some(
      (h) => h.event_name === payload.event_name
    );
    const targetEvent = hasDirectEvent ? payload.event_name : fallbackEvent;
    if (!targetEvent) continue;

    for (const hook of enabledHooks) {
      if (hook.event_name !== targetEvent) continue;
      if (!matchHook(hook.matcher, effectivePayload)) continue;
      candidates.push(hook);
    }
  }

  return candidates;
}

async function executeCommandHook(
  hook: SubHookDescriptor,
  payload: HookEventPayload,
  env: Record<string, string>,
  plugin?: NormalizedPluginBundle
): Promise<HookDispatchResult> {
  const start = Date.now();
  const timeoutMs = hook.timeout_ms ?? 10_000;

  if (!hook.command) {
    return {
      hook_id: hook.id,
      plugin_id: hook.plugin_id,
      event_name: hook.event_name,
      status: "error",
      duration_ms: Date.now() - start,
      error: "Missing command for command hook",
    };
  }

  const effectiveEnv =
    plugin?.root_dir && !env.CLAUDE_PLUGIN_ROOT
      ? {
          ...env,
          CLAUDE_PLUGIN_ROOT: plugin.root_dir,
          PLUGIN_ROOT: env.PLUGIN_ROOT || plugin.root_dir,
        }
      : env;

  const effectiveCommand = await resolveHookCommand(
    hook.command,
    payload.canonical_cwd,
    plugin
  );

  return new Promise<HookDispatchResult>((resolve) => {
    const child = spawn(effectiveCommand, {
      shell: true,
      cwd: payload.canonical_cwd,
      env: effectiveEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve({
        hook_id: hook.id,
        plugin_id: hook.plugin_id,
        event_name: hook.event_name,
        status: "timeout",
        duration_ms: Date.now() - start,
        error: `Hook timed out after ${timeoutMs}ms`,
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        hook_id: hook.id,
        plugin_id: hook.plugin_id,
        event_name: hook.event_name,
        status: "error",
        duration_ms: Date.now() - start,
        error: err.message,
      });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      let parsedOutput: unknown = stdout.trim() || undefined;
      if (typeof parsedOutput === "string") {
        try {
          parsedOutput = JSON.parse(parsedOutput);
        } catch {
          // Keep raw string if not JSON
        }
      }

      const outObj =
        parsedOutput && typeof parsedOutput === "object"
          ? (parsedOutput as Record<string, unknown>)
          : undefined;

      if (code === 2 || outObj?.decision === "deny" || outObj?.permissionDecision === "deny") {
        resolve({
          hook_id: hook.id,
          plugin_id: hook.plugin_id,
          event_name: hook.event_name,
          status: "blocked",
          decision: "deny",
          duration_ms: Date.now() - start,
          output: parsedOutput,
          error: stderr.trim() || undefined,
        });
        return;
      }

      if (code !== 0) {
        resolve({
          hook_id: hook.id,
          plugin_id: hook.plugin_id,
          event_name: hook.event_name,
          status: "error",
          duration_ms: Date.now() - start,
          output: parsedOutput,
          error: stderr.trim() || `Exited with code ${code}`,
        });
        return;
      }

      const hasUpdate = Boolean(outObj?.updatedInput);
      resolve({
        hook_id: hook.id,
        plugin_id: hook.plugin_id,
        event_name: hook.event_name,
        status: "ok",
        decision: hasUpdate ? "modify" : "allow",
        duration_ms: Date.now() - start,
        output: parsedOutput,
        error: stderr.trim() || undefined,
      });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

export class HookOrchestrator {
  private readonly hostEnv: Record<string, string | undefined>;
  private readonly inlineHandlers: Map<string, InlineHookHandler>;
  private readonly pluginDataBaseDir: string;

  constructor(options: OrchestratorOptions = {}) {
    this.hostEnv = options.hostEnv ?? process.env;
    this.inlineHandlers = options.inlineHandlers ?? new Map();
    this.pluginDataBaseDir =
      options.pluginDataBaseDir ?? getSidecarPaths().pluginsDataDir;
  }

  /**
   * Executes matching hooks across Tier 00 -> 10 -> 50 -> 90 and reduces their outputs.
   */
  async dispatch(
    payload: HookEventPayload,
    plugins: NormalizedPluginBundle[],
    workspace?: WorkspaceProfile
  ): Promise<OrchestrationResult> {
    const pluginMap = new Map<string, NormalizedPluginBundle>();
    for (const plugin of plugins) {
      pluginMap.set(plugin.plugin_id, plugin);
    }
    const candidates = collectCandidateHooks(plugins, payload);

    // Sort by Tier (00, 10, 50, 90), then by raw priority ascending
    candidates.sort((a, b) => {
      const tierDiff = resolveTier(a.priority) - resolveTier(b.priority);
      if (tierDiff !== 0) return tierDiff;
      return (a.priority ?? 50) - (b.priority ?? 50);
    });

    const results: HookDispatchResult[] = [];
    const hostEnvFile = this.hostEnv.CLAUDE_ENV_FILE;

    for (const hook of candidates) {
      const plugin = pluginMap.get(hook.plugin_id);
      const slicePath = path.join(
        os.tmpdir(),
        `sidecar-env-${crypto.randomUUID()}.env`
      );
      const childEnv = buildChildEnv(
        hook,
        plugin,
        payload,
        workspace,
        this.hostEnv,
        slicePath,
        this.pluginDataBaseDir
      );

      let result: HookDispatchResult;
      const start = Date.now();

      try {
        if (hook.handler_type === "inline") {
          const handler = this.inlineHandlers.get(hook.id);
          if (!handler) {
            result = {
              hook_id: hook.id,
              plugin_id: hook.plugin_id,
              event_name: hook.event_name,
              status: "error",
              duration_ms: Date.now() - start,
              error: `No inline handler registered for ${hook.id}`,
            };
          } else {
            const partial = await handler(payload, childEnv);
            result = {
              hook_id: hook.id,
              plugin_id: hook.plugin_id,
              event_name: hook.event_name,
              status: partial.status ?? "ok",
              decision: partial.decision ?? "allow",
              duration_ms: partial.duration_ms ?? Date.now() - start,
              output: partial.output,
              error: partial.error,
              modified_payload: partial.modified_payload,
            };
          }
        } else if (hook.handler_type === "command") {
          result = await executeCommandHook(hook, payload, childEnv, plugin);
        } else {
          result = {
            hook_id: hook.id,
            plugin_id: hook.plugin_id,
            event_name: hook.event_name,
            status: "skipped",
            duration_ms: Date.now() - start,
          };
        }

        await mergeEnvFileSlice(slicePath, hostEnvFile);
      } finally {
        await fs.rm(slicePath, { force: true }).catch(() => {});
      }

      results.push(result);

      // Short-circuit on deny/block unless stop_hook_active is set
      const stopHookActive = Boolean(payload.metadata?.stop_hook_active);
      if (
        !stopHookActive &&
        (result.decision === "deny" || result.status === "blocked")
      ) {
        break;
      }
    }

    const reduced = reduceHookResults(results, payload.runtime, {
      stopHookActive: Boolean(payload.metadata?.stop_hook_active),
      eventName: payload.event_name,
    });

    return { results, reduced };
  }
}
