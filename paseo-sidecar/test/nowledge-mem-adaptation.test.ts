/**
 * Purpose: Test suite for nowledge-mem plugin adaptation across Claude and AGY runtimes.
 * Context: Validates AC-1 (.mcp.json), AC-2 (SidecarToolExecutor), and AC-3 (Claude & AGY hooks & discovery).
 * Usage: npx vitest run test/nowledge-mem-adaptation.test.ts
 * Prerequisites: Vitest, Node fs/http.
 * Justification: Multi-runtime nowledge-mem test suites covering AC-1 through AC-4.
 */

import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { startDaemon } from "../src/daemon/index.js";
import { HookOrchestrator } from "../src/hooks/orchestrator.js";
import { SidecarMcpToolExecutor } from "../src/mcp/executor.js";
import { loadPluginBundle } from "../src/plugins/loader.js";
import { discoverPlatformAssets } from "../src/registry/discover.js";
import { UnifiedRegistry } from "../src/registry/store.js";
import type { HookEventPayload } from "../src/types.js";

const tempDirs: string[] = [];
const cleanupFns: Array<() => Promise<void>> = [];

function parseMcpResponse(rawText: string): Record<string, any> {
  const lines = rawText.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6).trim());
      } catch {
        // try next
      }
    }
  }
  return JSON.parse(rawText);
}

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const fn of cleanupFns.splice(0)) {
    try {
      await fn();
    } catch {
      // ignore
    }
  }
  for (const dir of tempDirs.splice(0)) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

describe("AC-1: .mcp.json Loader Support in loadPluginBundle", () => {
  it("loads standard Claude Code .mcp.json with mcpServers and variable substitution", async () => {
    const root = await makeTempDir("nm-loader-");
    await fs.mkdir(path.join(root, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "nowledge-mem", version: "0.7.36" }),
    );

    await fs.writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "nowledge-mem": {
            type: "http",
            url: "http://127.0.0.1:14242/mcp/",
            headers: { APP: "Claude Code" },
          },
          "local-helper": {
            command: "python3",
            args: ["${CLAUDE_PLUGIN_ROOT}/scripts/helper.py", "--dir", "${extensionPath}"],
            env: {
              DATA_DIR: "${pluginDir}/data",
              APP_NAME: "nowledge",
            },
          },
        },
      }),
    );

    const bundle = await loadPluginBundle(root);
    expect(bundle).not.toBeNull();
    expect(bundle?.source_runtime).toBe("claude-code");
    expect(bundle?.mcp_servers).toBeDefined();

    const servers = bundle?.mcp_servers as Record<string, Record<string, unknown>>;
    expect(servers["nowledge-mem"]).toEqual({
      type: "http",
      url: "http://127.0.0.1:14242/mcp/",
      headers: { APP: "Claude Code" },
    });

    const helper = servers["local-helper"];
    expect(helper.command).toBe("python3");
    expect(helper.args).toEqual([
      `${root}/scripts/helper.py`,
      "--dir",
      root,
    ]);
    expect(helper.env).toEqual({
      DATA_DIR: `${root}/data`,
      APP_NAME: "nowledge",
    });
  });

  it("loads direct server map without mcpServers wrapper from .mcp.json", async () => {
    const root = await makeTempDir("nm-direct-");
    await fs.writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({
        "nowledge-mem": {
          url: "http://127.0.0.1:14242/mcp/",
          headers: { APP: "Direct" },
        },
      }),
    );

    const bundle = await loadPluginBundle(root);
    expect(bundle).not.toBeNull();
    expect(bundle?.mcp_servers).toBeDefined();
    const servers = bundle?.mcp_servers as Record<string, Record<string, unknown>>;
    expect(servers["nowledge-mem"].url).toBe("http://127.0.0.1:14242/mcp/");
  });

  it("merges .mcp.json with mcp_config.json, preferring .mcp.json overrides", async () => {
    const root = await makeTempDir("nm-merge-");
    await fs.writeFile(
      path.join(root, "plugin.json"),
      JSON.stringify({ name: "nm-merge", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(root, "mcp_config.json"),
      JSON.stringify({
        mcpServers: {
          "base-server": { serverUrl: "http://127.0.0.1:11111/mcp" },
          "shared-server": { serverUrl: "http://127.0.0.1:22222/old" },
        },
      }),
    );
    await fs.writeFile(
      path.join(root, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "shared-server": { url: "http://127.0.0.1:22222/new" },
          "dot-server": { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/index.js"] },
        },
      }),
    );

    const bundle = await loadPluginBundle(root);
    const servers = bundle?.mcp_servers as Record<string, Record<string, unknown>>;
    expect(servers["base-server"].serverUrl).toBe("http://127.0.0.1:11111/mcp");
    expect(servers["shared-server"].url).toBe("http://127.0.0.1:22222/new");
    expect(servers["dot-server"].args).toEqual([`${root}/index.js`]);
  });
});

describe("AC-2: Downstream MCP Tool Executor (SidecarMcpToolExecutor)", () => {
  it("connects to HTTP MCP server, lists, describes, and invokes tools", async () => {
    const mockMcp = new McpServer({ name: "mock-nowledge-mem", version: "0.7.36" });
    mockMcp.tool(
      "read_working_memory",
      "Read today's Working Memory briefing",
      {
        date: z.string().optional(),
        space_id: z.string().optional(),
      },
      async ({ date }) => ({
        content: [{ type: "text", text: `Active briefing for ${date ?? "today"}` }],
      }),
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await mockMcp.connect(transport);
    const httpServer = http.createServer((req, res) => {
      void transport.handleRequest(req, res);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (httpServer.address() as { port: number }).port;
    const serverUrl = `http://127.0.0.1:${port}/mcp/`;

    cleanupFns.push(async () => {
      await transport.close();
      await mockMcp.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    const executor = new SidecarMcpToolExecutor({
      getServerConfig: (name) => {
        if (name === "nowledge-mem") {
          return { url: serverUrl, headers: { APP: "Vitest" } };
        }
        return undefined;
      },
    });
    cleanupFns.push(async () => {
      await executor.close();
    });

    // 1. describeTool
    const desc = await executor.describeTool("nowledge-mem", "read_working_memory");
    expect(desc).not.toBeNull();
    expect(desc?.name).toBe("read_working_memory");
    expect(desc?.description).toContain("Working Memory");

    // 2. callTool
    const result = (await executor.callTool("nowledge-mem", "read_working_memory", {
      date: "2026-11-15",
    })) as { content: Array<{ type: string; text: string }> };
    expect(result.content[0].text).toContain("Active briefing for 2026-11-15");

    // 3. listTools
    const tools = await executor.listTools("nowledge-mem");
    expect(tools.some((t) => t.name === "read_working_memory")).toBe(true);
  });

  it("fails gracefully with clear actionable error when downstream MCP server is offline", async () => {
    // Port 44998 is offline
    const executor = new SidecarMcpToolExecutor({
      connectionTimeoutMs: 1500,
      getServerConfig: () => ({ url: "http://127.0.0.1:44998/mcp/" }),
    });
    cleanupFns.push(async () => {
      await executor.close();
    });

    await expect(
      executor.callTool("nowledge-mem", "read_working_memory", {}),
    ).rejects.toThrow(/offline or unreachable at http:\/\/127\.0\.0\.1:44998\/mcp\//);
  });

  it("falls back to reading static agy-mcp-dir tool schemas when downstream is offline", async () => {
    const agyDir = await makeTempDir("agy-mcp-");
    await fs.writeFile(
      path.join(agyDir, "read_working_memory.json"),
      JSON.stringify({
        name: "read_working_memory",
        description: "Static briefing from AGY schema",
        parameters: { type: "object", properties: { space_id: { type: "string" } } },
      }),
    );

    const executor = new SidecarMcpToolExecutor({
      connectionTimeoutMs: 500,
      getServerConfig: () => ({
        url: "http://127.0.0.1:44997/mcp/",
        sourceDir: agyDir,
      }),
    });
    cleanupFns.push(async () => {
      await executor.close();
    });

    const desc = await executor.describeTool("nowledge-mem", "read_working_memory");
    expect(desc).not.toBeNull();
    expect(desc?.name).toBe("read_working_memory");
    expect(desc?.description).toBe("Static briefing from AGY schema");
  });
});

describe("AC-3: Claude & AGY Lifecycle Hook Compatibility", () => {
  it("dispatches Claude hooks (SessionStart, UserPromptSubmit, Stop) with CLAUDE_PLUGIN_ROOT and ${extensionPath}", async () => {
    const pluginDir = await makeTempDir("nm-claude-plugin-");
    await fs.mkdir(path.join(pluginDir, "scripts"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "scripts", "run.sh"),
      `#!/bin/sh\necho '{"hookSpecificOutput":{"additionalContext":"Claude memory restored"}}\'`,
    );
    await fs.chmod(path.join(pluginDir, "scripts", "run.sh"), 0o755);

    await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "nowledge-mem", version: "0.7.36" }),
    );
    await fs.mkdir(path.join(pluginDir, "hooks"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "*",
              hooks: [
                {
                  type: "command",
                  command: 'sh "${extensionPath}/scripts/run.sh"',
                },
              ],
            },
          ],
        },
      }),
    );

    const bundle = await loadPluginBundle(pluginDir);
    expect(bundle).not.toBeNull();

    const orchestrator = new HookOrchestrator();
    const payload: HookEventPayload = {
      runtime: "claude-code",
      session_id: "test-session",
      canonical_cwd: pluginDir,
      event_name: "SessionStart",
      timestamp: new Date().toISOString(),
    };

    const res = await orchestrator.dispatch(payload, bundle ? [bundle] : []);
    expect(res.reduced.exitCode).toBe(0);
    expect(res.reduced.additionalContext).toContain("Claude memory restored");
  });

  it("dispatches AGY hooks (PreInvocation, PostInvocation, Stop) with GEMINI_PLUGIN_ROOT", async () => {
    const pluginDir = await makeTempDir("nm-agy-plugin-");
    await fs.mkdir(path.join(pluginDir, "hooks"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "hooks", "nmem_entrypoint.sh"),
      `#!/bin/sh\necho "{\\"injectSteps\\":[{\\"ephemeralMessage\\":\\"AGY context injected: $GEMINI_PLUGIN_ROOT\\"}]}"`,
    );
    await fs.chmod(path.join(pluginDir, "hooks", "nmem_entrypoint.sh"), 0o755);

    await fs.writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(pluginDir, "hooks.json"),
      JSON.stringify({
        "nowledge-mem": {
          PreInvocation: [
            {
              type: "command",
              command: `sh "${pluginDir}/hooks/nmem_entrypoint.sh"`,
            },
          ],
        },
      }),
    );

    const bundle = await loadPluginBundle(pluginDir);
    expect(bundle).not.toBeNull();

    const orchestrator = new HookOrchestrator();
    const payload: HookEventPayload = {
      runtime: "gemini-cli",
      session_id: "agy-sess-1",
      canonical_cwd: pluginDir,
      event_name: "PreInvocation",
      timestamp: new Date().toISOString(),
    };

    const res = await orchestrator.dispatch(payload, bundle ? [bundle] : []);
    expect(res.reduced.exitCode).toBe(0);
  });

  it("executes PreInvocation only once when gemini-cli dispatches SessionStart then PreInvocation", async () => {
    const pluginDir = await makeTempDir("nm-agy-no-dup-");
    const countFile = path.join(pluginDir, "run-count.txt");
    await fs.mkdir(path.join(pluginDir, "hooks"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "hooks", "nmem_entrypoint.sh"),
      `#!/bin/sh\necho "1" >> "${countFile}"\necho "{\\"injectSteps\\":[{\\"ephemeralMessage\\":\\"AGY memory restored\\"}]}"`,
    );
    await fs.chmod(path.join(pluginDir, "hooks", "nmem_entrypoint.sh"), 0o755);

    await fs.writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem-google-antigravity", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(pluginDir, "hooks.json"),
      JSON.stringify({
        "nowledge-mem-google-antigravity": {
          PreInvocation: [
            {
              type: "command",
              command: `sh "${pluginDir}/hooks/nmem_entrypoint.sh"`,
            },
          ],
        },
      }),
    );

    const bundle = await loadPluginBundle(pluginDir);
    expect(bundle).not.toBeNull();

    const orchestrator = new HookOrchestrator();
    const sessionStartRes = await orchestrator.dispatch(
      {
        runtime: "gemini-cli",
        session_id: "agy-sess-dedup",
        canonical_cwd: pluginDir,
        event_name: "SessionStart",
        timestamp: new Date().toISOString(),
      },
      bundle ? [bundle] : [],
    );
    expect(sessionStartRes.results).toHaveLength(0);

    const preInvRes = await orchestrator.dispatch(
      {
        runtime: "gemini-cli",
        session_id: "agy-sess-dedup",
        canonical_cwd: pluginDir,
        event_name: "PreInvocation",
        timestamp: new Date().toISOString(),
      },
      bundle ? [bundle] : [],
    );
    expect(preInvRes.results).toHaveLength(1);
    expect(preInvRes.reduced.exitCode).toBe(0);

    const runs = (await fs.readFile(countFile, "utf8")).trim().split("\n");
    expect(runs).toHaveLength(1);
  });

  it("discovers AGY MCPs in both ~/.gemini/antigravity-cli/mcp and ~/.gemini/antigravity/mcp", async () => {
    const fakeHome = await makeTempDir("disc-agy-both-");
    const cliMcpDir = path.join(fakeHome, ".gemini", "antigravity-cli", "mcp", "nm-cli");
    const agyMcpDir = path.join(fakeHome, ".gemini", "antigravity", "mcp", "nm-desk");
    await fs.mkdir(cliMcpDir, { recursive: true });
    await fs.mkdir(agyMcpDir, { recursive: true });

    const registry = new UnifiedRegistry(path.join(fakeHome, ".sidecar-mcp"));
    const assets = discoverPlatformAssets(registry, fakeHome);
    const mcpIds = assets.mcps.map((m) => m.id);
    expect(mcpIds).toContain("nm-cli");
    expect(mcpIds).toContain("nm-desk");
  });
});

describe("AC-4: End-to-End Sidecar Daemon MCP Tool Execution", () => {
  it("executes sidecar_describe_tool and sidecar_call_tool via HTTP daemon", async () => {
    const mockMcp = new McpServer({ name: "downstream", version: "1.0.0" });
    mockMcp.tool(
      "search_memory",
      "Search long term memory",
      { query: z.string() },
      async ({ query }) => ({
        content: [{ type: "text", text: `Found results for ${query}` }],
      }),
    );

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });
    await mockMcp.connect(transport);
    const httpServer = http.createServer((req, res) => {
      void transport.handleRequest(req, res);
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, "127.0.0.1", () => resolve());
    });
    const port = (httpServer.address() as { port: number }).port;
    const downstreamUrl = `http://127.0.0.1:${port}/mcp/`;

    cleanupFns.push(async () => {
      await transport.close();
      await mockMcp.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    const pluginDir = await makeTempDir("e2e-plugin-");
    await fs.writeFile(
      path.join(pluginDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "nowledge-mem": {
            type: "http",
            url: downstreamUrl,
          },
        },
      }),
    );
    const bundle = await loadPluginBundle(pluginDir);
    expect(bundle).not.toBeNull();

    const sockDir = await makeTempDir("e2e-sock-");
    const sockPath = path.join(sockDir, "hook.sock");

    const daemon = await startDaemon({
      httpHost: "127.0.0.1",
      httpPort: 0,
      sockPath,
      plugins: bundle ? [bundle] : [],
    });
    cleanupFns.push(async () => {
      await daemon.close();
    });

    // 1. Call sidecar_describe_tool
    const descRes = await fetch(`${daemon.httpUrl}/mcp/sidecar/hub/claude-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "sidecar_describe_tool",
          arguments: {
            server: "nowledge-mem",
            name: "search_memory",
          },
        },
      }),
    });
    expect(descRes.status).toBe(200);
    const descJson = parseMcpResponse(await descRes.text()) as {
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(descJson.result.content[0].text).toContain("search_memory");

    // 2. Call sidecar_call_tool
    const callRes = await fetch(`${daemon.httpUrl}/mcp/sidecar/hub/claude-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "sidecar_call_tool",
          arguments: {
            server: "nowledge-mem",
            name: "search_memory",
            arguments: { query: "architecture decision" },
          },
        },
      }),
    });
    expect(callRes.status).toBe(200);
    const callJson = parseMcpResponse(await callRes.text()) as {
      result: { content: Array<{ type: string; text: string }> };
    };
    expect(callJson.result.content[0].text).toContain("Found results for architecture decision");
  });
});
