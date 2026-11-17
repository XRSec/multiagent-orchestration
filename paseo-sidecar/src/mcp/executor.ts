/**
 * Purpose: Downstream MCP tool client and executor supporting HTTP and stdio transports.
 * Context: Routes sidecar_describe_tool, sidecar_call_tool, and tool batching to downstream MCP servers.
 * Usage: const executor = new SidecarMcpToolExecutor(options);
 * Prerequisites: @modelcontextprotocol/sdk.
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { UnifiedRegistry } from "../registry/store.js";
import type { NormalizedPluginBundle } from "../types.js";
import type { SidecarToolExecutor } from "./server.js";

export interface DownstreamServerConfig {
  id?: string;
  name?: string;
  type?: "http" | "stdio" | "sse" | string;
  url?: string;
  serverUrl?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  headers?: Record<string, string>;
  timeout_ms?: number;
  idle_timeout_sec?: number;
  sourceDir?: string;
}

export interface ToolExecutorOptions {
  registry?: UnifiedRegistry;
  getPlugins?: () => NormalizedPluginBundle[];
  runtimeDir?: string;
  restrictToPlugins?: boolean;
  ephemeralStdio?: boolean;
  stdioIdleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  callTimeoutMs?: number;
  getServerConfig?: (
    serverName: string,
  ) => Promise<DownstreamServerConfig | undefined> | DownstreamServerConfig | undefined;
}

interface CachedConnection {
  client: Client;
  transport: Transport;
  configHash: string;
  isStdio: boolean;
  idleTimer?: NodeJS.Timeout;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stripPlatformPrefix(id: string): string {
  return id.replace(/^[a-z0-9-]+--/i, "");
}

function normalizeServerKey(key: string): string {
  return stripPlatformPrefix(key).toLowerCase().replace(/_/g, "-");
}

async function readStaticAgyToolSchema(
  sourceDir: string,
  toolName: string,
): Promise<Record<string, unknown> | null> {
  const toolJsonPath = path.join(sourceDir, `${toolName}.json`);
  try {
    const raw = await fs.readFile(toolJsonPath, "utf-8");
    const parsed = JSON.parse(raw) as {
      name?: string;
      description?: string;
      parameters?: unknown;
    };
    return {
      name: parsed.name ?? toolName,
      description: parsed.description ?? "",
      inputSchema: parsed.parameters ?? { type: "object", properties: {} },
    };
  } catch {
    return null;
  }
}

async function listStaticAgyTools(
  sourceDir: string,
  serverName: string,
): Promise<
  Array<{
    server: string;
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>
> {
  try {
    const files = await fs.readdir(sourceDir);
    const list = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const toolName = f.replace(/\.json$/, "");
      const schema = await readStaticAgyToolSchema(sourceDir, toolName);
      if (schema) {
        list.push({
          server: serverName,
          name: toolName,
          description: schema.description as string | undefined,
          inputSchema: schema.inputSchema,
        });
      }
    }
    return list;
  } catch {
    return [];
  }
}

export class SidecarMcpToolExecutor implements SidecarToolExecutor {
  private readonly connections = new Map<string, CachedConnection>();
  private readonly connectionTimeoutMs: number;
  private readonly callTimeoutMs: number;

  constructor(private readonly options: ToolExecutorOptions = {}) {
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 5000;
    this.callTimeoutMs = options.callTimeoutMs ?? 30000;
  }

  private findPluginConfig(
    serverName: string,
  ): DownstreamServerConfig | undefined {
    const plugins = this.options.getPlugins?.() ?? [];
    const targetNorm = normalizeServerKey(serverName);

    for (const p of plugins) {
      if (!p.mcp_servers) continue;
      for (const [k, v] of Object.entries(p.mcp_servers)) {
        if (!v || typeof v !== "object") continue;
        const cfg = v as DownstreamServerConfig;
        if (
          k === serverName ||
          normalizeServerKey(k) === targetNorm ||
          (targetNorm.includes("nowledge-mem") &&
            normalizeServerKey(k).includes("nowledge-mem"))
        ) {
          return { id: k, ...cfg };
        }
      }
    }

    if (targetNorm.includes("nowledge-mem")) {
      const nmPlugin = plugins.find((p) =>
        normalizeServerKey(p.plugin_id).includes("nowledge-mem"),
      );
      if (nmPlugin?.mcp_servers) {
        const first = Object.values(nmPlugin.mcp_servers)[0];
        if (first && typeof first === "object") {
          return first as DownstreamServerConfig;
        }
      }
    }
    return undefined;
  }

  private async readRegistryMcp(
    filePath: string,
  ): Promise<DownstreamServerConfig | undefined> {
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      return JSON.parse(raw) as DownstreamServerConfig;
    } catch {
      return undefined;
    }
  }

  async resolveServerConfig(
    serverName: string,
  ): Promise<DownstreamServerConfig | undefined> {
    if (this.options.getServerConfig) {
      const custom = await this.options.getServerConfig(serverName);
      if (custom) return custom;
    }

    const pluginConfig = this.findPluginConfig(serverName);
    if (this.options.restrictToPlugins && !pluginConfig) {
      return undefined;
    }

    const mcpsDir = this.options.registry?.paths.mcpsDir;
    if (!mcpsDir) return pluginConfig;

    const candidates = [
      `${serverName}.json`,
      `${serverName.replace(/-/g, "_")}.json`,
      `${serverName}_${serverName}.json`,
    ];
    let fileConfig: DownstreamServerConfig | undefined;
    for (const file of candidates) {
      fileConfig = await this.readRegistryMcp(path.join(mcpsDir, file));
      if (fileConfig) break;
    }

    if (!fileConfig && normalizeServerKey(serverName).includes("nowledge-mem")) {
      fileConfig = await this.readRegistryMcp(
        path.join(mcpsDir, "nowledge-mem_nowledge-mem.json"),
      );
    }

    if (fileConfig && pluginConfig) {
      return { ...fileConfig, ...pluginConfig };
    }
    return fileConfig ?? pluginConfig;
  }

  private async createTransport(
    serverName: string,
    config: DownstreamServerConfig,
  ): Promise<Transport> {
    const rawUrl = config.url ?? config.serverUrl;
    if (rawUrl) {
      const parsedUrl = new URL(rawUrl);
      const headers = config.headers;
      if (config.type === "sse") {
        return new SSEClientTransport(parsedUrl, {
          requestInit: headers ? { headers } : undefined,
        });
      }
      return new StreamableHTTPClientTransport(parsedUrl, {
        requestInit: headers ? { headers } : undefined,
      });
    }

    if (config.command) {
      return new StdioClientTransport({
        command: config.command,
        args: config.args ?? [],
        env: {
          ...getDefaultEnvironment(),
          ...(config.env ?? {}),
        },
        cwd: config.cwd ?? this.options.runtimeDir,
      });
    }

    throw new Error(
      `Downstream MCP server "${serverName}" has neither url nor command configured.`,
    );
  }

  private isStdioConfig(config: DownstreamServerConfig): boolean {
    return !(config.url ?? config.serverUrl) && Boolean(config.command);
  }

  private scheduleIdleEviction(
    cacheKey: string,
    serverName: string,
    config: DownstreamServerConfig,
  ): void {
    const entry = this.connections.get(cacheKey);
    if (!entry || !entry.isStdio) return;
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
    const idleMs =
      typeof config.idle_timeout_sec === "number" && config.idle_timeout_sec > 0
        ? config.idle_timeout_sec * 1000
        : this.options.stdioIdleTimeoutMs;
    if (!idleMs || idleMs <= 0) return;
    entry.idleTimer = setTimeout(() => {
      void this.evictConnection(serverName);
    }, idleMs);
    entry.idleTimer.unref();
  }

  private async getOrConnectClient(
    serverName: string,
    config: DownstreamServerConfig,
  ): Promise<{ client: Client; cacheKey: string; isStdio: boolean }> {
    const scopeDir = this.options.runtimeDir ?? "global";
    const configHash = createHash("sha256")
      .update(JSON.stringify({ scopeDir, ...config }))
      .digest("hex")
      .slice(0, 16);
    const cacheKey = `${scopeDir}:${serverName}:${configHash}`;
    const isStdio = this.isStdioConfig(config);

    const cached = this.connections.get(cacheKey);
    if (cached) {
      if (cached.idleTimer) {
        clearTimeout(cached.idleTimer);
        cached.idleTimer = undefined;
      }
      return { client: cached.client, cacheKey, isStdio: cached.isStdio };
    }

    const transport = await this.createTransport(serverName, config);
    const client = new Client(
      { name: "paseo-sidecar-hub", version: "0.1.0" },
      { capabilities: {} },
    );

    const targetDesc = config.url ?? config.serverUrl ?? config.command;
    try {
      await withTimeout(
        client.connect(transport),
        this.connectionTimeoutMs,
        `Connection to downstream MCP server "${serverName}" timed out after ${this.connectionTimeoutMs}ms.`,
      );
    } catch (err) {
      try {
        await transport.close();
      } catch {
        // ignore transport close error on failure
      }
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Downstream MCP server "${serverName}" is offline or unreachable at ${targetDesc} (${reason}). Ensure the service is running.`,
      );
    }

    this.connections.set(cacheKey, { client, transport, configHash, isStdio });
    return { client, cacheKey, isStdio };
  }

  private async evictConnection(serverName: string): Promise<void> {
    const scopePrefix = `${this.options.runtimeDir ?? "global"}:${serverName}:`;
    for (const [key, entry] of Array.from(this.connections.entries())) {
      if (key.startsWith(scopePrefix)) {
        if (entry.idleTimer) clearTimeout(entry.idleTimer);
        this.connections.delete(key);
        try {
          await entry.transport.close();
        } catch {}
        try {
          await entry.client.close();
        } catch {}
      }
    }
  }

  private async finalizeConnectionUse(
    cacheKey: string,
    serverName: string,
    config: DownstreamServerConfig,
    isStdio: boolean,
  ): Promise<void> {
    if (!isStdio) return;
    if (this.options.ephemeralStdio || config.idle_timeout_sec === 0) {
      await this.evictConnection(serverName);
    } else {
      this.scheduleIdleEviction(cacheKey, serverName, config);
    }
  }

  async describeTool(
    serverName: string,
    toolName: string,
  ): Promise<Record<string, unknown> | null> {
    const config = await this.resolveServerConfig(serverName);
    if (!config) return null;

    try {
      const { client, cacheKey, isStdio } = await this.getOrConnectClient(
        serverName,
        config,
      );
      try {
        const res = await withTimeout(
          client.listTools(),
          this.callTimeoutMs,
          `Tool list timed out for ${serverName}`,
        );
        const found = res.tools.find((t) => t.name === toolName);
        if (found) {
          return {
            server: serverName,
            name: found.name,
            description: found.description,
            inputSchema: found.inputSchema,
          };
        }
      } finally {
        await this.finalizeConnectionUse(cacheKey, serverName, config, isStdio);
      }
    } catch (err) {
      if (config.sourceDir) {
        const staticSchema = await readStaticAgyToolSchema(
          config.sourceDir,
          toolName,
        );
        if (staticSchema) {
          return { server: serverName, ...staticSchema };
        }
      }
      throw err;
    }

    if (config.sourceDir) {
      const staticSchema = await readStaticAgyToolSchema(
        config.sourceDir,
        toolName,
      );
      if (staticSchema) {
        return { server: serverName, ...staticSchema };
      }
    }
    return null;
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const config = await this.resolveServerConfig(serverName);
    if (!config) {
      throw new Error(
        `No downstream MCP server configuration found for "${serverName}".`,
      );
    }

    const { client, cacheKey, isStdio } = await this.getOrConnectClient(
      serverName,
      config,
    );
    let succeeded = false;
    try {
      const result = await withTimeout(
        client.callTool({ name: toolName, arguments: args }),
        this.callTimeoutMs,
        `Tool call to ${serverName}.${toolName} timed out after ${this.callTimeoutMs}ms.`,
      );
      succeeded = true;
      return result;
    } catch (err) {
      await this.evictConnection(serverName);
      throw err;
    } finally {
      if (succeeded) {
        await this.finalizeConnectionUse(cacheKey, serverName, config, isStdio);
      }
    }
  }

  async listTools(
    serverName?: string,
  ): Promise<
    Array<{
      server: string;
      name: string;
      description?: string;
      inputSchema?: unknown;
    }>
  > {
    if (serverName) {
      const config = await this.resolveServerConfig(serverName);
      if (!config) return [];
      try {
        const { client, cacheKey, isStdio } = await this.getOrConnectClient(
          serverName,
          config,
        );
        try {
          const res = await withTimeout(
            client.listTools(),
            this.callTimeoutMs,
            `Tool listing timed out for ${serverName}`,
          );
          return res.tools.map((t) => ({
            server: serverName,
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }));
        } finally {
          await this.finalizeConnectionUse(cacheKey, serverName, config, isStdio);
        }
      } catch (err) {
        if (config.sourceDir) {
          return listStaticAgyTools(config.sourceDir, serverName);
        }
        throw err;
      }
    }
    return [];
  }

  async close(): Promise<void> {
    for (const entry of this.connections.values()) {
      if (entry.idleTimer) clearTimeout(entry.idleTimer);
      try {
        await entry.transport.close();
      } catch {}
      try {
        await entry.client.close();
      } catch {}
    }
    this.connections.clear();
  }
}
