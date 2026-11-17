/**
 * Purpose: Lightweight Paseo-to-Sidecar adapter bridging workspace routing, skills/MCP tools, and deterministic hook dispatch.
 * Context: Called exclusively by the Paseo plugin shell (paseo-plugin/index.server.ts); keeps Sidecar core zero-dependency on @getpaseo/plugin.
 * Usage: const adapter = new PaseoSidecarAdapter(); await adapter.discover({ cwd, sessionId, runtime });
 * Prerequisites: Sidecar core modules (config, registry, hooks, mcp).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  loadWorkspacesConfig,
  resolveEffectiveWorkspaceProfile,
} from "../config/workspaces.js";
import {
  HookOrchestrator,
  type OrchestrationResult,
} from "../hooks/orchestrator.js";
import {
  SidecarMcpToolExecutor,
  type DownstreamServerConfig,
} from "../mcp/executor.js";
import {
  UnifiedRegistry,
  type McpServerManifest,
  type SkillEntry,
} from "../registry/store.js";
import type {
  HookEventPayload,
  NormalizedPluginBundle,
  RuntimeType,
  WorkspaceProfile,
} from "../types.js";

export interface PaseoSessionRoutingParams {
  cwd: string;
  sessionId: string;
  runtime: RuntimeType;
}

export interface ResolvedSessionAssets {
  profile?: WorkspaceProfile;
  skills: SkillEntry[];
  plugins: NormalizedPluginBundle[];
  mcps: McpServerManifest[];
}

export interface BatchToolCall {
  server: string;
  name: string;
  arguments?: Record<string, unknown>;
}

export interface LifecycleHookDispatchParams extends PaseoSessionRoutingParams {
  eventName: string;
  env?: Record<string, string>;
  prompt?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: unknown;
  metadata?: Record<string, unknown>;
}

export interface LifecycleHookDispatchOutput {
  profile?: WorkspaceProfile;
  envToInject: Record<string, string>;
  orchestration: OrchestrationResult;
}

/** Map a Paseo agent provider string to a Sidecar RuntimeType. */
export function mapProviderToRuntime(provider?: string): RuntimeType {
  const normalized = (provider ?? "").trim().toLowerCase();
  if (normalized === "codex") return "codex";
  if (normalized === "cursor") return "cursor";
  if (normalized === "openhands") return "openhands";
  if (normalized === "claude-desktop") return "claude-desktop";
  if (normalized === "claude-desktop-3p") return "claude-desktop-3p";
  if (
    normalized === "gemini" ||
    normalized === "gemini-cli" ||
    normalized === "agy" ||
    normalized === "antigravity"
  ) {
    return "gemini-cli";
  }
  return "claude-code";
}

function normalizeKey(key: string): string {
  return key.replace(/^[a-z0-9-]+--/i, "").toLowerCase().replace(/_/g, "-");
}

function toDownstreamConfig(mcp: McpServerManifest): DownstreamServerConfig {
  return {
    id: mcp.id,
    name: mcp.id,
    command: mcp.command,
    args: mcp.args,
    env: mcp.env,
    url: mcp.url,
    type: mcp.url ? "http" : mcp.command ? "stdio" : undefined,
  };
}

export class PaseoSidecarAdapter {
  private readonly sidecarHome?: string;
  private readonly hostEnv: Record<string, string | undefined>;
  private readonly executors = new Map<string, SidecarMcpToolExecutor>();
  private readonly sessionContexts = new Map<
    string,
    { cwd: string; runtime: RuntimeType }
  >();

  constructor(options?: {
    sidecarHome?: string;
    hostEnv?: Record<string, string | undefined>;
  }) {
    this.sidecarHome = options?.sidecarHome;
    this.hostEnv = options?.hostEnv ?? process.env;
  }

  rememberSession(sessionId: string, cwd: string, runtime: RuntimeType): void {
    this.sessionContexts.set(sessionId, { cwd, runtime });
  }

  getRememberedSession(
    sessionId: string,
  ): { cwd: string; runtime: RuntimeType } | undefined {
    return this.sessionContexts.get(sessionId);
  }

  forgetSession(sessionId: string): void {
    this.sessionContexts.delete(sessionId);
  }

  private getRegistry(): UnifiedRegistry {
    return new UnifiedRegistry(this.sidecarHome);
  }

  async resolveAssets(
    params: PaseoSessionRoutingParams,
  ): Promise<ResolvedSessionAssets> {
    const registry = this.getRegistry();
    const profiles = loadWorkspacesConfig(registry.paths.workspacesFile);
    const profile = resolveEffectiveWorkspaceProfile(
      {
        runtime: params.runtime,
        session_id: params.sessionId,
        canonical_cwd: params.cwd,
      },
      profiles,
    );
    const assets = await registry.resolveWorkspaceAssets(profile);
    return { profile, ...assets };
  }

  async discover(
    params: PaseoSessionRoutingParams & { query?: string },
  ): Promise<Record<string, unknown>> {
    const { profile, skills, plugins, mcps } = await this.resolveAssets(params);
    const q = params.query?.trim().toLowerCase();

    const filteredSkills = skills
      .filter((s) => {
        if (!q) return true;
        return (
          s.id.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q)
        );
      })
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        source: s.source,
      }));

    const filteredPlugins = plugins
      .filter((p) => {
        if (!q) return true;
        return (
          p.plugin_id.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.skills ?? []).some((s) => s.toLowerCase().includes(q))
        );
      })
      .map((p) => ({
        plugin_id: p.plugin_id,
        name: p.name,
        version: p.version,
        source_runtime: p.source_runtime,
        skills: p.skills ?? [],
        mcp_servers: p.mcp_servers ? Object.keys(p.mcp_servers) : [],
        hook_count: p.hooks.length,
      }));

    const filteredMcps = mcps
      .filter((m) => {
        if (!q) return true;
        return m.id.toLowerCase().includes(q);
      })
      .map((m) => ({
        id: m.id,
        scope: m.scope,
        transport: m.url ? "http" : m.command ? "stdio" : "unknown",
      }));

    return {
      runtime: params.runtime,
      cwd: params.cwd,
      workspace_profile: profile
        ? { id: profile.id, name: profile.name, canonical_cwd: profile.canonical_cwd }
        : null,
      skills: filteredSkills,
      plugins: filteredPlugins,
      mcps: filteredMcps,
    };
  }

  async loadSkill(
    params: PaseoSessionRoutingParams & { skillName: string; pluginId?: string },
  ): Promise<{ found: boolean; content?: string; source?: string }> {
    const { skills, plugins } = await this.resolveAssets(params);

    if (!params.pluginId) {
      const matchedStandalone = skills.find(
        (s) => s.id === params.skillName || s.name === params.skillName,
      );
      if (matchedStandalone) {
        const content = await fs.readFile(matchedStandalone.skillMdPath, "utf-8");
        return {
          found: true,
          content,
          source: matchedStandalone.skillMdPath,
        };
      }
    }

    const candidatePlugins = params.pluginId
      ? plugins.filter((p) => p.plugin_id === params.pluginId)
      : plugins;

    for (const plugin of candidatePlugins) {
      const candidatePaths = [
        path.join(plugin.root_dir, "skills", params.skillName, "SKILL.md"),
        path.join(plugin.root_dir, "skills", `${params.skillName}.md`),
      ];
      for (const candidatePath of candidatePaths) {
        try {
          const content = await fs.readFile(candidatePath, "utf-8");
          return { found: true, content, source: candidatePath };
        } catch {
          // continue searching
        }
      }
    }

    return { found: false };
  }

  private getExecutorKey(cwd: string, runtime: RuntimeType): string {
    return `${runtime}::${path.resolve(cwd)}`;
  }

  private getOrCreateExecutor(
    params: PaseoSessionRoutingParams,
  ): SidecarMcpToolExecutor {
    const key = this.getExecutorKey(params.cwd, params.runtime);
    const existing = this.executors.get(key);
    if (existing) return existing;

    const registry = this.getRegistry();
    const executor = new SidecarMcpToolExecutor({
      registry,
      getServerConfig: async (serverName: string) => {
        const assets = await this.resolveAssets(params);
        const normTarget = normalizeKey(serverName);

        for (const p of assets.plugins) {
          if (!p.mcp_servers) continue;
          for (const [k, v] of Object.entries(p.mcp_servers)) {
            if (!v || typeof v !== "object") continue;
            if (k === serverName || normalizeKey(k) === normTarget) {
              return { id: k, ...(v as DownstreamServerConfig) };
            }
          }
        }

        const matchedMcp = assets.mcps.find(
          (m) => m.id === serverName || normalizeKey(m.id) === normTarget,
        );
        return matchedMcp ? toDownstreamConfig(matchedMcp) : undefined;
      },
    });
    this.executors.set(key, executor);
    return executor;
  }

  async describeTool(
    params: PaseoSessionRoutingParams & { server: string; name: string },
  ): Promise<Record<string, unknown> | null> {
    const executor = this.getOrCreateExecutor(params);
    return executor.describeTool(params.server, params.name);
  }

  async callTool(
    params: PaseoSessionRoutingParams & {
      server: string;
      name: string;
      arguments?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    const executor = this.getOrCreateExecutor(params);
    return executor.callTool(params.server, params.name, params.arguments ?? {});
  }

  async execBatch(
    params: PaseoSessionRoutingParams & { calls: BatchToolCall[] },
  ): Promise<
    Array<{ server: string; name: string; output?: unknown; error?: string }>
  > {
    const executor = this.getOrCreateExecutor(params);
    const results: Array<{
      server: string;
      name: string;
      output?: unknown;
      error?: string;
    }> = [];

    for (const call of params.calls) {
      try {
        const output = await executor.callTool(
          call.server,
          call.name,
          call.arguments ?? {},
        );
        results.push({ server: call.server, name: call.name, output });
      } catch (err) {
        results.push({
          server: call.server,
          name: call.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }

  async dispatchLifecycleHook(
    params: LifecycleHookDispatchParams,
  ): Promise<LifecycleHookDispatchOutput> {
    const registry = this.getRegistry();
    const { profile, plugins } = await this.resolveAssets(params);

    const envToInject: Record<string, string> = {
      SIDECAR_HOME: registry.paths.home,
      ...(profile?.env ?? {}),
    };

    const orchestrator = new HookOrchestrator({
      hostEnv: {
        ...this.hostEnv,
        ...params.env,
        ...envToInject,
      },
      pluginDataBaseDir: registry.paths.pluginsDataDir,
    });

    const payload: HookEventPayload = {
      runtime: params.runtime,
      session_id: params.sessionId,
      canonical_cwd: params.cwd,
      event_name: params.eventName,
      timestamp: new Date().toISOString(),
      tool_name: params.toolName,
      tool_input: params.toolInput,
      tool_output: params.toolOutput,
      prompt: params.prompt,
      metadata: params.metadata,
    };

    const orchestration = await orchestrator.dispatch(payload, plugins, profile);
    return {
      profile,
      envToInject,
      orchestration,
    };
  }

  async dispose(): Promise<void> {
    const closing = Array.from(this.executors.values()).map((ex) =>
      ex.close().catch(() => {}),
    );
    await Promise.all(closing);
    this.executors.clear();
    this.sessionContexts.clear();
  }
}
