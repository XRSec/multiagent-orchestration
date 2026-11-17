/**
 * Purpose: SidecarMCP core daemon running HTTP and UDS servers for hook dispatch and MCP routing.
 * Context: Manages runtime lifecycle, workspace profile filtering, and downstream tool execution.
 * Usage: const daemon = await startDaemon(options);
 * Prerequisites: Node http, fs/promises, os.
 * Justification: Multi-transport daemon integrating HTTP, UDS, admin routes, and MCP hubs.
 */
import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import {
  isGlobalWorkspaceCwd,
  loadWorkspacesConfig,
  resolveEffectiveWorkspaceProfile,
} from "../config/workspaces.js";
import {
  buildWorkspaceSkillInjection,
  type SkillInjectionMode,
} from "../hooks/context-injector.js";
import { HookOrchestrator } from "../hooks/orchestrator.js";
import { SidecarMcpToolExecutor } from "../mcp/executor.js";
import { handleMcpHttpRequest, type SidecarToolExecutor } from "../mcp/server.js";
import { loadPluginsFromDirectory } from "../plugins/loader.js";
import { UnifiedRegistry } from "../registry/store.js";
import { handleAdminRequest } from "../web/admin.js";
import type {
  HookEventPayload,
  NormalizedPluginBundle,
  RuntimeType,
  WorkspaceProfile,
} from "../types.js";

export interface HookEndpointRequest {
  payload: HookEventPayload;
  env?: Record<string, string | undefined>;
}

export interface HookEndpointResponse {
  exitCode: number;
  stdoutJson?: string;
  stderrText?: string;
}

export type HookHandler = (
  req: HookEndpointRequest,
) => Promise<HookEndpointResponse>;

export interface DaemonOptions {
  httpHost?: string;
  httpPort?: number;
  sockPath?: string;
  pluginsDir?: string;
  enableWeb?: boolean;
  sidecarHome?: string;
  plugins?: NormalizedPluginBundle[];
  onHookEvent?: HookHandler;
  toolExecutor?: SidecarToolExecutor;
}

export interface DaemonInstance {
  httpServer: http.Server;
  udsServer: http.Server;
  httpUrl: string;
  sockPath: string;
  close: () => Promise<void>;
}

const VALID_RUNTIMES = new Set<RuntimeType>([
  "claude-code",
  "claude-desktop",
  "claude-desktop-3p",
  "codex",
  "openhands",
  "cursor",
  "gemini-cli",
]);

function readRequestBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(data),
  });
  res.end(data);
}

export async function loadUnifiedPlugins(
  registry: UnifiedRegistry,
  runtime: RuntimeType = "claude-code",
  extraPluginsDir?: string,
): Promise<NormalizedPluginBundle[]> {
  const result: NormalizedPluginBundle[] = [];
  const seen = new Set<string>();
  const addPlugins = (list: NormalizedPluginBundle[]) => {
    for (const p of list) {
      if (seen.has(p.plugin_id)) continue;
      seen.add(p.plugin_id);
      result.push(p);
    }
  };

  if (extraPluginsDir) {
    addPlugins(await loadPluginsFromDirectory(extraPluginsDir));
  }
  addPlugins(await loadPluginsFromDirectory(registry.paths.pluginsCacheDir));

  try {
    const skillEntries = await fs.readdir(registry.paths.skillsDir, { withFileTypes: true });
    const skills = skillEntries
      .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith("."))
      .map((d) => d.name)
      .sort();

    const mcpServers: Record<string, { command?: string; args?: string[]; url?: string; env?: Record<string, string> }> = {};
    try {
      const mcpFiles = await fs.readdir(registry.paths.mcpsDir);
      for (const f of mcpFiles) {
        if (!f.endsWith(".json")) continue;
        try {
          const raw = await fs.readFile(path.join(registry.paths.mcpsDir, f), "utf-8");
          const parsed = JSON.parse(raw) as { name?: string; command?: string; args?: string[]; url?: string; env?: Record<string, string> };
          const name = parsed.name ?? f.replace(/\.json$/, "");
          mcpServers[name] = {
            ...(parsed.command ? { command: parsed.command } : {}),
            ...(parsed.args ? { args: parsed.args } : {}),
            ...(parsed.url ? { url: parsed.url } : {}),
            ...(parsed.env ? { env: parsed.env } : {}),
          };
        } catch {
          // skip invalid mcp manifest
        }
      }
    } catch {
      // mcps dir missing
    }

    if (skills.length > 0 || Object.keys(mcpServers).length > 0) {
      result.push({
        plugin_id: "sidecar-library",
        name: "Sidecar Unified Library",
        version: "0.1.0",
        source_runtime: runtime,
        root_dir: registry.paths.home,
        skills,
        mcp_servers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,
        hooks: [],
      });
    }
  } catch {
    // skills dir missing
  }

  return result;
}

function stripPlatformPrefix(id: string): string {
  return id.replace(/^[a-z0-9-]+--/i, "");
}

function getPluginCandidateIds(plugin: NormalizedPluginBundle): Set<string> {
  const ids = new Set<string>();
  const add = (val: unknown) => {
    if (typeof val !== "string") return;
    const trimmed = val.trim();
    if (!trimmed) return;
    ids.add(trimmed);
    const stripped = stripPlatformPrefix(trimmed);
    if (stripped) ids.add(stripped);
  };

  add(plugin.plugin_id);
  add(plugin.name);

  const aliasIds = plugin.metadata?.alias_ids;
  if (Array.isArray(aliasIds)) {
    for (const alias of aliasIds) {
      add(alias);
    }
  }
  return ids;
}

function isNowledgeMemId(id: string): boolean {
  return id.toLowerCase().includes("nowledge-mem");
}

function pluginMatchesRuntime(
  plugin: NormalizedPluginBundle,
  runtime: RuntimeType,
): boolean {
  if (plugin.source_runtime === runtime) return true;
  if (plugin.plugin_id.startsWith(`${runtime}--`)) return true;
  const aliasIds = plugin.metadata?.alias_ids;
  if (
    Array.isArray(aliasIds) &&
    aliasIds.some((a) => typeof a === "string" && a.startsWith(`${runtime}--`))
  ) {
    return true;
  }
  return false;
}

function getCanonicalGroupKey(plugin: NormalizedPluginBundle): string {
  const candidates = Array.from(getPluginCandidateIds(plugin));
  if (candidates.some(isNowledgeMemId)) {
    return "__nowledge-mem__";
  }
  return stripPlatformPrefix(plugin.plugin_id);
}

function deduplicatePluginsByRuntime(
  plugins: NormalizedPluginBundle[],
  runtime?: RuntimeType,
): NormalizedPluginBundle[] {
  if (!runtime || plugins.length <= 1) return plugins;

  const groups = new Map<string, NormalizedPluginBundle[]>();
  for (const p of plugins) {
    if (p.plugin_id === "sidecar-library") continue;
    const key = getCanonicalGroupKey(p);
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  const dropSet = new Set<NormalizedPluginBundle>();
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    const runtimeMatched = group.filter((p) => pluginMatchesRuntime(p, runtime));
    if (runtimeMatched.length > 0 && runtimeMatched.length < group.length) {
      for (const p of group) {
        if (!pluginMatchesRuntime(p, runtime)) {
          dropSet.add(p);
        }
      }
    }
  }

  return dropSet.size === 0 ? plugins : plugins.filter((p) => !dropSet.has(p));
}

export function filterActivePluginsByProfile(
  allPlugins: NormalizedPluginBundle[],
  profile?: WorkspaceProfile,
  runtime?: RuntimeType,
): NormalizedPluginBundle[] {
  const realPlugins = allPlugins.filter((p) => p.plugin_id !== "sidecar-library");

  if (!profile || profile.plugins.length === 0) {
    return deduplicatePluginsByRuntime(realPlugins, runtime);
  }

  const matched = new Map<string, NormalizedPluginBundle>();
  const addMatches = (list: NormalizedPluginBundle[]) => {
    for (const p of list) {
      matched.set(p.plugin_id, p);
    }
  };

  for (const rawReq of profile.plugins) {
    const reqId = rawReq.trim();
    if (!reqId) continue;

    if (reqId === "sidecar-library") {
      const lib = allPlugins.find((p) => p.plugin_id === "sidecar-library");
      if (lib) matched.set(lib.plugin_id, lib);
      continue;
    }

    const directOrAlias = realPlugins.filter((p) => {
      if (
        p.plugin_id === reqId ||
        p.name === reqId ||
        stripPlatformPrefix(p.plugin_id) === reqId
      ) {
        return true;
      }
      const candidates = getPluginCandidateIds(p);
      if (candidates.has(reqId)) return true;
      if (
        reqId === "nowledge-mem-google-antigravity" &&
        candidates.has("gemini-cli--nowledge-mem")
      ) {
        return true;
      }
      if (
        reqId === "gemini-cli--nowledge-mem" &&
        candidates.has("nowledge-mem-google-antigravity")
      ) {
        return true;
      }
      return false;
    });
    if (directOrAlias.length > 0) {
      addMatches(directOrAlias);
      continue;
    }

    if (isNowledgeMemId(reqId)) {
      const fallback = realPlugins.filter((p) =>
        Array.from(getPluginCandidateIds(p)).some(isNowledgeMemId),
      );
      if (fallback.length > 0) {
        addMatches(fallback);
      }
    }
  }

  return deduplicatePluginsByRuntime(Array.from(matched.values()), runtime);
}

export function filterPluginsForMcpHub(
  allPlugins: NormalizedPluginBundle[],
  profile?: WorkspaceProfile,
  runtime?: RuntimeType,
): NormalizedPluginBundle[] {
  if (!profile) return deduplicatePluginsByRuntime(allPlugins, runtime);

  const filteredReal = filterActivePluginsByProfile(allPlugins, profile, runtime);
  const lib = allPlugins.find((p) => p.plugin_id === "sidecar-library");
  if (!lib) return filteredReal;

  const hasMcpsRule = Array.isArray(profile.metadata?.mcp_servers);
  const allowedMcps = hasMcpsRule
    ? new Set(
        (profile.metadata!.mcp_servers as unknown[]).filter(
          (m): m is string => typeof m === "string" && m.trim().length > 0,
        ),
      )
    : undefined;

  const hasSkillsRule = Array.isArray(profile.metadata?.skills);
  const allowedSkills = hasSkillsRule
    ? new Set(
        (profile.metadata!.skills as unknown[]).filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        ),
      )
    : undefined;

  let nextMcps = lib.mcp_servers;
  if (allowedMcps && lib.mcp_servers) {
    const filteredMap: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(lib.mcp_servers)) {
      if (allowedMcps.has(k)) {
        filteredMap[k] = v;
      }
    }
    nextMcps = Object.keys(filteredMap).length > 0 ? filteredMap : undefined;
  }

  let nextSkills = lib.skills;
  if (allowedSkills && lib.skills) {
    nextSkills = lib.skills.filter((s) => allowedSkills.has(s));
  }

  const filteredLib: NormalizedPluginBundle = {
    ...lib,
    skills: nextSkills,
    mcp_servers: nextMcps,
  };

  const hasLibraryAssets =
    (filteredLib.skills && filteredLib.skills.length > 0) ||
    (filteredLib.mcp_servers && Object.keys(filteredLib.mcp_servers).length > 0);

  const withoutLib = filteredReal.filter((p) => p.plugin_id !== "sidecar-library");
  return hasLibraryAssets ? [...withoutLib, filteredLib] : withoutLib;
}

export interface WorkspaceScopedPluginsResult {
  profile?: WorkspaceProfile;
  allPlugins: NormalizedPluginBundle[];
  activePlugins: NormalizedPluginBundle[];
  mcpPlugins: NormalizedPluginBundle[];
}

export async function resolveWorkspaceScopedPlugins(options: {
  registry: UnifiedRegistry;
  runtime: RuntimeType;
  canonicalCwd: string;
  sessionId?: string;
  plugins?: NormalizedPluginBundle[];
  pluginsDir?: string;
}): Promise<WorkspaceScopedPluginsResult> {
  const allPlugins =
    options.plugins ??
    (await loadUnifiedPlugins(
      options.registry,
      options.runtime,
      options.pluginsDir,
    ));

  const profile = resolveEffectiveWorkspaceProfile(
    {
      runtime: options.runtime,
      session_id: options.sessionId ?? "default",
      canonical_cwd: options.canonicalCwd,
    },
    loadWorkspacesConfig(options.registry.paths.workspacesFile),
  );

  return {
    profile,
    allPlugins,
    activePlugins: filterActivePluginsByProfile(
      allPlugins,
      profile,
      options.runtime,
    ),
    mcpPlugins: filterPluginsForMcpHub(allPlugins, profile, options.runtime),
  };
}

export interface LocalHookDispatchOptions {
  sidecarHome?: string;
  pluginsDir?: string;
  plugins?: NormalizedPluginBundle[];
  hostEnv?: Record<string, string | undefined>;
}

export async function dispatchHookLocally(
  req: HookEndpointRequest,
  options: LocalHookDispatchOptions = {},
): Promise<HookEndpointResponse> {
  const registry = new UnifiedRegistry(options.sidecarHome);
  const payload = normalizeHookPayload(req.payload, req.env);
  const shouldApplyWorkspaceRouting =
    !options.plugins || Boolean(options.sidecarHome);

  const profile = shouldApplyWorkspaceRouting
    ? resolveEffectiveWorkspaceProfile(
        {
          runtime: payload.runtime,
          session_id: payload.session_id,
          canonical_cwd: payload.canonical_cwd,
        },
        loadWorkspacesConfig(registry.paths.workspacesFile),
      )
    : undefined;

  const allPlugins =
    options.plugins ??
    (await loadUnifiedPlugins(registry, payload.runtime, options.pluginsDir));
  const activePlugins = filterActivePluginsByProfile(
    allPlugins,
    profile,
    payload.runtime,
  );

  const orchestrator = new HookOrchestrator({
    hostEnv: { ...(options.hostEnv ?? process.env), ...req.env },
    pluginDataBaseDir: registry.paths.pluginsDataDir,
  });

  const orchestration = await orchestrator.dispatch(
    payload,
    activePlugins,
    profile,
  );

  const stdoutObj: Record<string, unknown> = {
    ...(orchestration.reduced.stdoutJson ?? {}),
  };

  const isStartupOrPreInvocation =
    payload.event_name === "SessionStart" ||
    payload.event_name === "PreInvocation";

  const rawPayload = isPlainObject(req.payload)
    ? (req.payload as unknown as Record<string, unknown>)
    : undefined;
  const invocationNum =
    typeof rawPayload?.invocationNum === "number"
      ? rawPayload.invocationNum
      : undefined;
  const initialNumSteps =
    typeof rawPayload?.initialNumSteps === "number"
      ? rawPayload.initialNumSteps
      : undefined;
  const isSubsequentGeminiInvocation =
    payload.runtime === "gemini-cli" &&
    payload.event_name === "PreInvocation" &&
    invocationNum !== undefined &&
    !(
      invocationNum === 0 ||
      (invocationNum === 1 &&
        (initialNumSteps === undefined || initialNumSteps <= 2))
    );

  if (
    isStartupOrPreInvocation &&
    !isSubsequentGeminiInvocation &&
    orchestration.reduced.decision !== "deny"
  ) {
    const hookContext = orchestration.reduced.additionalContext?.trim() ?? "";
    const injection = buildWorkspaceSkillInjection({
      registry,
      profile,
      activePlugins,
      runtime: payload.runtime,
      alreadyInjectedContext: hookContext,
    });

    const combinedContext = [hookContext, injection.injectedContext.trim()]
      .filter(Boolean)
      .join("\n\n");

    if (combinedContext) {
      if (payload.runtime === "gemini-cli") {
        delete stdoutObj.additionalContext;
        delete stdoutObj.hookSpecificOutput;
        stdoutObj.injectSteps = [{ ephemeralMessage: combinedContext }];
      } else {
        stdoutObj.additionalContext = combinedContext;
        stdoutObj.hookSpecificOutput = {
          hookEventName: payload.event_name,
          additionalContext: combinedContext,
        };
      }
    }
  }

  const stdoutJson =
    Object.keys(stdoutObj).length > 0 ? JSON.stringify(stdoutObj) : undefined;

  return {
    exitCode: orchestration.reduced.exitCode,
    ...(stdoutJson !== undefined ? { stdoutJson } : {}),
    ...(orchestration.reduced.stderrText
      ? { stderrText: orchestration.reduced.stderrText }
      : {}),
  };
}

function pickNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) {
      return c.trim();
    }
  }
  return undefined;
}

function pickValidRuntime(...candidates: unknown[]): RuntimeType | undefined {
  for (const c of candidates) {
    if (typeof c === "string") {
      const trimmed = c.trim();
      if (VALID_RUNTIMES.has(trimmed as RuntimeType)) {
        return trimmed as RuntimeType;
      }
    }
  }
  return undefined;
}

function firstWorkspacePath(val: unknown): string | undefined {
  if (!Array.isArray(val)) return undefined;
  for (const item of val) {
    if (typeof item === "string" && item.trim().length > 0) {
      return item.trim();
    }
  }
  return undefined;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return Boolean(val) && typeof val === "object" && !Array.isArray(val);
}

function normalizeHookPayload(
  rawPayload: unknown,
  env?: Record<string, string | undefined>,
): HookEventPayload {
  const raw = isPlainObject(rawPayload) ? rawPayload : {};

  const hasAntigravityFields =
    raw.conversationId !== undefined ||
    raw.workspacePaths !== undefined ||
    raw.artifactDirectoryPath !== undefined ||
    raw.invocationNum !== undefined ||
    raw.toolCall !== undefined;

  const runtime: RuntimeType =
    pickValidRuntime(raw.runtime, env?.SIDECAR_RUNTIME) ??
    (env?.OPENHANDS_PROJECT_DIR
      ? "openhands"
      : hasAntigravityFields
        ? "gemini-cli"
        : "claude-code");

  const rawCwd =
    pickNonEmptyString(
      raw.canonical_cwd,
      raw.cwd,
      raw.workspace_root,
      raw.project_dir,
      firstWorkspacePath(raw.workspacePaths),
      env?.CLAUDE_PROJECT_DIR,
      env?.OPENHANDS_PROJECT_DIR,
      env?.GEMINI_PROJECT_DIR,
      env?.CURSOR_PROJECT_DIR,
      env?.PWD,
    ) ?? process.cwd();

  const session_id =
    pickNonEmptyString(raw.session_id, raw.sessionId, raw.conversationId) ??
    "default";

  const rawToolCall = isPlainObject(raw.toolCall) ? raw.toolCall : undefined;
  const tool_name =
    pickNonEmptyString(raw.tool_name) ?? pickNonEmptyString(rawToolCall?.name);
  const tool_input = isPlainObject(raw.tool_input)
    ? raw.tool_input
    : isPlainObject(rawToolCall?.args)
      ? rawToolCall.args
      : undefined;
  const toolCall =
    rawToolCall ??
    (tool_name !== undefined
      ? { name: tool_name, args: tool_input ?? {} }
      : undefined);

  let event_name = pickNonEmptyString(
    raw.event_name,
    raw.hook_event_name,
    raw.event,
  );
  if (!event_name) {
    if (rawToolCall !== undefined || tool_name !== undefined) {
      const hasToolResponse =
        raw.tool_response !== undefined ||
        raw.tool_output !== undefined ||
        raw.toolResult !== undefined;
      event_name = hasToolResponse ? "PostToolUse" : "PreToolUse";
    } else if (raw.invocationNum !== undefined) {
      event_name = "PreInvocation";
    } else {
      event_name = "unknown";
    }
  }

  const timestamp =
    pickNonEmptyString(raw.timestamp) ?? new Date().toISOString();

  const normalized: HookEventPayload = {
    ...(raw as Partial<HookEventPayload>),
    runtime,
    session_id,
    canonical_cwd: path.resolve(rawCwd),
    event_name,
    timestamp,
    ...(tool_name !== undefined ? { tool_name } : {}),
    ...(tool_input !== undefined ? { tool_input } : {}),
  };
  if (toolCall !== undefined) {
    (normalized as unknown as Record<string, unknown>).toolCall = toolCall;
  }
  return normalized;
}

export async function startDaemon(
  options: DaemonOptions = {},
): Promise<DaemonInstance> {
  const httpHost = options.httpHost ?? "127.0.0.1";
  const httpPort = options.httpPort ?? 44880;
  const registry = new UnifiedRegistry(options.sidecarHome);
  const sockPath =
    options.sockPath ??
    process.env.SIDECAR_SOCK_PATH ??
    registry.paths.hookSock;

  const loadPluginsForRuntime = async (runtime: RuntimeType = "claude-code"): Promise<NormalizedPluginBundle[]> => {
    if (options.plugins) return options.plugins;
    return loadUnifiedPlugins(registry, runtime, options.pluginsDir);
  };

  const defaultHookHandler: HookHandler = async (req) =>
    dispatchHookLocally(req, {
      sidecarHome: options.sidecarHome,
      pluginsDir: options.pluginsDir,
      plugins: options.plugins,
    });

  const hookHandler = options.onHookEvent ?? defaultHookHandler;

  const initialPlugins = await loadPluginsForRuntime();
  const scopedExecutors = new Map<
    string,
    { executor: SidecarMcpToolExecutor; plugins: NormalizedPluginBundle[] }
  >();
  const getScopedExecutor = (
    runtime: RuntimeType,
    runtimeDir: string,
    activePlugins: NormalizedPluginBundle[],
  ): SidecarToolExecutor => {
    if (options.toolExecutor) {
      return options.toolExecutor;
    }
    const key = `${runtime}:${runtimeDir}`;
    let entry = scopedExecutors.get(key);
    if (!entry) {
      entry = {
        plugins: activePlugins,
        executor: new SidecarMcpToolExecutor({
          registry,
          runtimeDir,
          restrictToPlugins: !options.plugins && !options.pluginsDir,
          getPlugins: () => entry!.plugins,
        }),
      };
      scopedExecutors.set(key, entry);
    } else {
      entry.plugins = activePlugins;
    }
    return entry.executor;
  };
  const requestListener = async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> => {
    const rawUrl = req.url ?? "/";
    const [urlPath, rawQuery = ""] = rawUrl.split("?");

    if (req.method === "POST" && urlPath === "/api/admin/injection-preview") {
      try {
        const raw = await readRequestBody(req);
        let body: {
          runtime?: unknown;
          cwd?: unknown;
          mode?: unknown;
          skills?: unknown;
        } = {};
        if (raw.trim()) {
          try {
            body = JSON.parse(raw) as typeof body;
          } catch {
            sendJson(res, 400, { error: "Invalid JSON body" });
            return;
          }
        }

        let runtime: RuntimeType = "claude-code";
        if (body.runtime !== undefined && body.runtime !== null && body.runtime !== "") {
          if (
            typeof body.runtime !== "string" ||
            !VALID_RUNTIMES.has(body.runtime as RuntimeType)
          ) {
            sendJson(res, 400, {
              error: `Unsupported runtime: ${String(body.runtime)}`,
            });
            return;
          }
          runtime = body.runtime as RuntimeType;
        }

        const rawCwd =
          typeof body.cwd === "string" && body.cwd.trim().length > 0
            ? body.cwd.trim()
            : process.cwd();
        const cwd = isGlobalWorkspaceCwd(rawCwd)
          ? "*"
          : path.resolve(rawCwd);

        const mode: SkillInjectionMode | undefined =
          body.mode === "inline" || body.mode === "manifest"
            ? body.mode
            : undefined;

        const explicitSkills = Array.isArray(body.skills)
          ? body.skills.filter((s): s is string => typeof s === "string")
          : undefined;

        const profile = resolveEffectiveWorkspaceProfile(
          {
            runtime,
            session_id: "injection-preview",
            canonical_cwd: cwd,
          },
          loadWorkspacesConfig(registry.paths.workspacesFile),
        );

        const allPlugins = await loadPluginsForRuntime(runtime);
        const activePlugins = filterActivePluginsByProfile(
          allPlugins,
          profile,
          runtime,
        );
        const injection = buildWorkspaceSkillInjection({
          registry,
          profile,
          activePlugins,
          runtime,
          mode,
          explicitSkills,
        });

        sendJson(res, 200, {
          ok: true,
          runtime,
          cwd,
          profileId: profile?.id ?? null,
          activePluginIds: activePlugins.map((p) => p.plugin_id),
          mode: injection.mode,
          deliveryMechanism: injection.deliveryMechanism,
          injectedSkillIds: injection.injectedSkillIds,
          injectedContext: injection.injectedContext,
        });
      } catch (err) {
        sendJson(res, 500, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    if (await handleAdminRequest(req, res, registry)) {
      return;
    }

    if (req.method === "GET" && urlPath === "/health") {
      const currentPlugins = options.plugins ? initialPlugins : await loadPluginsForRuntime();
      sendJson(res, 200, {
        status: "ok",
        plugins: currentPlugins.length,
      });
      return;
    }

    if (req.method === "POST" && urlPath === "/hook") {
      try {
        const raw = await readRequestBody(req);
        const parsed = raw ? (JSON.parse(raw) as HookEndpointRequest) : null;
        if (!parsed || !parsed.payload) {
          sendJson(res, 400, { error: "Missing hook payload" });
          return;
        }
        const result = await hookHandler(parsed);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, {
          exitCode: 0,
          stderrText: err instanceof Error ? err.message : String(err),
        });
      }
      return;
    }

    const mcpMatch = /^\/mcp\/sidecar\/hub\/([^/]+)$/.exec(urlPath);
    if (mcpMatch) {
      const runtimeParam = mcpMatch[1] as RuntimeType;
      if (!VALID_RUNTIMES.has(runtimeParam)) {
        sendJson(res, 400, { error: `Unsupported runtime: ${runtimeParam}` });
        return;
      }
      try {
        const raw = await readRequestBody(req);
        const parsedBody = raw ? (JSON.parse(raw) as unknown) : undefined;
        let activePlugins = options.plugins ?? (await loadPluginsForRuntime(runtimeParam));
        const queryParams = new URLSearchParams(rawQuery);
        const headerCwd =
          typeof req.headers["x-sidecar-cwd"] === "string"
            ? req.headers["x-sidecar-cwd"]
            : undefined;
        const reqCwd = path.resolve(
          queryParams.get("cwd") ?? headerCwd ?? process.cwd(),
        );
        if (!options.plugins && !options.pluginsDir) {
          const profile = resolveEffectiveWorkspaceProfile(
            {
              runtime: runtimeParam,
              session_id: "mcp-hub",
              canonical_cwd: reqCwd,
            },
            loadWorkspacesConfig(registry.paths.workspacesFile),
          );
          activePlugins = filterPluginsForMcpHub(activePlugins, profile, runtimeParam);
        }
        const executor = getScopedExecutor(runtimeParam, reqCwd, activePlugins);
        await handleMcpHttpRequest(req, res, parsedBody, {
          runtime: runtimeParam,
          runtimeDir: reqCwd,
          getPlugins: () => activePlugins,
          executor,
        });
      } catch (err) {
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  };

  const httpServer = http.createServer((req, res) => {
    void requestListener(req, res);
  });

  const udsServer = http.createServer((req, res) => {
    void requestListener(req, res);
  });

  await fs.mkdir(path.dirname(sockPath), { recursive: true });
  try {
    await fs.unlink(sockPath);
  } catch {
    // socket file did not exist
  }

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(httpPort, httpHost, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  await new Promise<void>((resolve, reject) => {
    udsServer.once("error", reject);
    udsServer.listen(sockPath, () => {
      udsServer.off("error", reject);
      resolve();
    });
  });

  const addr = httpServer.address();
  const actualPort =
    addr && typeof addr === "object" ? addr.port : httpPort;

  return {
    httpServer,
    udsServer,
    httpUrl: `http://${httpHost}:${actualPort}`,
    sockPath,
    close: async () => {
      if (options.toolExecutor && "close" in options.toolExecutor && typeof options.toolExecutor.close === "function") {
        try {
          await options.toolExecutor.close();
        } catch {
          // ignore error closing downstream connections
        }
      }
      for (const entry of scopedExecutors.values()) {
        try {
          await entry.executor.close();
        } catch {
          // ignore error closing scoped downstream connections
        }
      }
      scopedExecutors.clear();
      await Promise.all([
        new Promise<void>((resolve) => httpServer.close(() => resolve())),
        new Promise<void>((resolve) => udsServer.close(() => resolve())),
      ]);
      try {
        await fs.unlink(sockPath);
      } catch {
        // ignore
      }
    },
  };
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const port = Number(process.env.SIDECAR_HTTP_PORT ?? "44880");
  const host = process.env.SIDECAR_HTTP_HOST ?? "127.0.0.1";
  const sock = process.env.SIDECAR_SOCK_PATH;
  const pluginsDir = process.env.SIDECAR_PLUGINS_DIR;

  startDaemon({
    httpHost: host,
    httpPort: port,
    sockPath: sock,
    pluginsDir,
  })
    .then((daemon) => {
      console.error(
        `[paseo-sidecar] daemon listening on ${daemon.httpUrl} and ${daemon.sockPath}`,
      );
    })
    .catch((err) => {
      console.error("[paseo-sidecar] failed to start daemon:", err);
      process.exit(1);
    });
}
