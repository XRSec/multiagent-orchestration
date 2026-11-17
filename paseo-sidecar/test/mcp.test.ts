import * as fs from "node:fs/promises";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { filterPluginsForMcpHub, startDaemon, type DaemonInstance } from "../src/daemon/index.js";
import { SidecarMcpToolExecutor } from "../src/mcp/executor.js";
import { BYTE0_META_TOOL_NAMES } from "../src/mcp/server.js";
import { loadPluginBundle } from "../src/plugins/loader.js";
import { UnifiedRegistry } from "../src/registry/store.js";
import type { NormalizedPluginBundle, WorkspaceProfile } from "../src/types.js";

const tempDirs: string[] = [];
const daemons: DaemonInstance[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const d of daemons.splice(0)) {
    await d.close();
  }
  for (const dir of tempDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("Universal Plugin Manifest Adapter", () => {
  it("loads .claude-plugin/plugin.json with skills and hooks/hooks.json", async () => {
    const root = await makeTempDir("sidecar-claude-");
    await fs.mkdir(path.join(root, ".claude-plugin"), { recursive: true });
    await fs.mkdir(path.join(root, "hooks"), { recursive: true });
    await fs.mkdir(path.join(root, "skills", "my-skill"), { recursive: true });

    await fs.writeFile(
      path.join(root, ".claude-plugin", "plugin.json"),
      JSON.stringify({
        name: "claude-sample",
        version: "1.2.3",
        mcpServers: { local: { command: "node" } },
      }),
    );
    await fs.writeFile(
      path.join(root, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo ok", timeout: 5 }],
            },
          ],
        },
      }),
    );
    await fs.writeFile(
      path.join(root, "skills", "my-skill", "SKILL.md"),
      "# My Skill\nInstructions here.",
    );

    const bundle = await loadPluginBundle(root);
    expect(bundle).not.toBeNull();
    expect(bundle?.source_runtime).toBe("claude-code");
    expect(bundle?.name).toBe("claude-sample");
    expect(bundle?.skills).toContain("my-skill");
    expect(bundle?.hooks).toHaveLength(1);
    expect(bundle?.hooks[0].matcher).toBe("Bash");
    expect(bundle?.hooks[0].timeout_ms).toBe(5000);
    expect(bundle?.mcp_servers).toEqual({ local: { command: "node" } });
  });

  it("loads .codex-plugin/plugin.json and Agent Plugins 1.0.0 plugin.json", async () => {
    const codexRoot = await makeTempDir("sidecar-codex-");
    await fs.mkdir(path.join(codexRoot, ".codex-plugin"), { recursive: true });
    await fs.writeFile(
      path.join(codexRoot, ".codex-plugin", "plugin.json"),
      JSON.stringify({ id: "codex-ext", name: "Codex Ext", version: "0.2.0" }),
    );
    const codexBundle = await loadPluginBundle(codexRoot);
    expect(codexBundle?.source_runtime).toBe("codex");
    expect(codexBundle?.plugin_id).toBe("codex-ext");

    const agentRoot = await makeTempDir("sidecar-agent-");
    await fs.writeFile(
      path.join(agentRoot, "plugin.json"),
      JSON.stringify({ name: "agent-plugin", version: "1.0.0" }),
    );
    const agentBundle = await loadPluginBundle(agentRoot);
    expect(agentBundle?.source_runtime).toBe("native");
    expect(agentBundle?.name).toBe("agent-plugin");
  });
});

describe("SidecarMCP Daemon & 5 Meta-Tool MCP Server", () => {
  it("serves /health, /hook (HTTP + UDS), and /mcp/sidecar/hub/:runtime with 5 meta-tools", async () => {
    const pluginRoot = await makeTempDir("sidecar-plugin-");
    await fs.mkdir(path.join(pluginRoot, "skills", "hello"), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(pluginRoot, "plugin.json"),
      JSON.stringify({ name: "test-plugin", version: "1.0.0" }),
    );
    await fs.writeFile(
      path.join(pluginRoot, "skills", "hello", "SKILL.md"),
      "# Hello Skill",
    );
    const bundle = await loadPluginBundle(pluginRoot);
    expect(bundle).not.toBeNull();

    const sockDir = await makeTempDir("sidecar-sock-");
    const sockPath = path.join(sockDir, "hook.sock");

    const daemon = await startDaemon({
      httpHost: "127.0.0.1",
      httpPort: 0,
      sockPath,
      plugins: bundle ? [bundle] : [],
      onHookEvent: async ({ payload }) => ({
        exitCode: 0,
        stdoutJson: JSON.stringify({ echoedEvent: payload.event_name }),
      }),
    });
    daemons.push(daemon);

    // 1. Health check over HTTP
    const healthRes = await fetch(`${daemon.httpUrl}/health`);
    expect(healthRes.status).toBe(200);
    const healthJson = (await healthRes.json()) as {
      status: string;
      plugins: number;
    };
    expect(healthJson.status).toBe("ok");
    expect(healthJson.plugins).toBe(1);

    // 2. /hook over UDS
    const udsResult = await new Promise<{ exitCode: number; stdoutJson?: string }>(
      (resolve, reject) => {
        const req = http.request(
          {
            socketPath: sockPath,
            path: "/hook",
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (c: Buffer) => chunks.push(c));
            res.on("end", () => {
              resolve(
                JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
                  exitCode: number;
                  stdoutJson?: string;
                },
              );
            });
          },
        );
        req.on("error", reject);
        req.write(
          JSON.stringify({
            payload: {
              runtime: "claude-code",
              session_id: "s1",
              canonical_cwd: "/tmp",
              event_name: "PreToolUse",
              timestamp: new Date().toISOString(),
            },
          }),
        );
        req.end();
      },
    );
    expect(udsResult.exitCode).toBe(0);
    expect(udsResult.stdoutJson).toContain("PreToolUse");

    // 3. MCP tools/list over Streamable HTTP
    const mcpRes = await fetch(`${daemon.httpUrl}/mcp/sidecar/hub/claude-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {},
      }),
    });
    expect(mcpRes.status).toBe(200);
    const text = await mcpRes.text();
    for (const toolName of BYTE0_META_TOOL_NAMES) {
      expect(text).toContain(toolName);
    }
  });
});

describe("Runtime dir isolation and MCP hub plugin filtering", () => {
  it("filterPluginsForMcpHub filters plugins, library mcp_servers, and library skills per workspace profile", () => {
    const allPlugins: NormalizedPluginBundle[] = [
      {
        plugin_id: "plugin-a",
        name: "Plugin A",
        version: "1.0.0",
        source_runtime: "claude-code",
        root_dir: "/tmp/plugin-a",
        hooks: [],
        skills: ["skill-a"],
        mcp_servers: { "srv-a": { command: "echo" } },
      },
      {
        plugin_id: "plugin-b",
        name: "Plugin B",
        version: "1.0.0",
        source_runtime: "claude-code",
        root_dir: "/tmp/plugin-b",
        hooks: [],
        skills: ["skill-b"],
        mcp_servers: { "srv-b": { command: "echo" } },
      },
      {
        plugin_id: "sidecar-library",
        name: "Sidecar Library",
        version: "1.0.0",
        source_runtime: "native",
        root_dir: "/tmp/lib",
        hooks: [],
        skills: ["lib-skill-1", "lib-skill-2"],
        mcp_servers: {
          "lib-mcp-1": { command: "echo", args: ["1"] },
          "lib-mcp-2": { command: "echo", args: ["2"] },
        },
      },
    ];

    const profileA: WorkspaceProfile = {
      id: "ws-a",
      name: "Workspace A",
      canonical_cwd: "/work/a",
      runtimes: ["claude-code"],
      plugins: ["plugin-a"],
      enabled: true,
      metadata: {
        mcp_servers: ["lib-mcp-1"],
        skills: ["lib-skill-1"],
      },
    };

    const filteredA = filterPluginsForMcpHub(allPlugins, profileA, "claude-code");
    expect(filteredA.map((p) => p.plugin_id)).toEqual(["plugin-a", "sidecar-library"]);
    const libA = filteredA.find((p) => p.plugin_id === "sidecar-library");
    expect(Object.keys(libA?.mcp_servers ?? {})).toEqual(["lib-mcp-1"]);
    expect(libA?.skills).toEqual(["lib-skill-1"]);

    const profileB: WorkspaceProfile = {
      id: "ws-b",
      name: "Workspace B",
      canonical_cwd: "/work/b",
      runtimes: ["claude-code"],
      plugins: ["plugin-b"],
      enabled: true,
      metadata: {
        mcp_servers: ["lib-mcp-2"],
        skills: [],
      },
    };

    const filteredB = filterPluginsForMcpHub(allPlugins, profileB, "claude-code");
    expect(filteredB.map((p) => p.plugin_id)).toEqual(["plugin-b", "sidecar-library"]);
    const libB = filteredB.find((p) => p.plugin_id === "sidecar-library");
    expect(Object.keys(libB?.mcp_servers ?? {})).toEqual(["lib-mcp-2"]);
    expect(libB?.skills).toEqual([]);
  });

  it("SidecarMcpToolExecutor enforces restrictToPlugins and isolates stdio cwd by runtimeDir", async () => {
    const sidecarHome = await makeTempDir("sidecar-exec-home-");
    const runtimeDirA = await makeTempDir("sidecar-cwd-a-");
    const runtimeDirB = await makeTempDir("sidecar-cwd-b-");
    const registry = new UnifiedRegistry(sidecarHome);

    // Unlisted MCP exists in registry mcps/ dir, should be blocked when restrictToPlugins=true
    await fs.writeFile(
      path.join(registry.paths.mcpsDir, "blocked-mcp.json"),
      JSON.stringify({ id: "blocked-mcp", command: process.execPath, args: ["-e", "process.exit(0)"] }),
    );

    // Minimal JSON-RPC stdio MCP server returning process.cwd()
    const serverScript = path.join(sidecarHome, "cwd-mcp.mjs");
    await fs.writeFile(
      serverScript,
      `
import readline from "node:readline";
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "cwd-mcp", version: "1.0.0" } }
    }) + "\\n");
  } else if (msg.method === "tools/list") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: { tools: [{ name: "get_cwd", description: "Return cwd", inputSchema: { type: "object", properties: {} } }] }
    }) + "\\n");
  } else if (msg.method === "tools/call") {
    process.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: msg.id,
      result: { content: [{ type: "text", text: process.cwd() }] }
    }) + "\\n");
  }
});
`,
    );

    const allowedPlugins: NormalizedPluginBundle[] = [
      {
        plugin_id: "cwd-plugin",
        name: "CWD Plugin",
        version: "1.0.0",
        source_runtime: "native",
        root_dir: sidecarHome,
        hooks: [],
        skills: [],
        mcp_servers: {
          "cwd-srv": { command: process.execPath, args: [serverScript] },
        },
      },
    ];

    const execA = new SidecarMcpToolExecutor({
      registry,
      getPlugins: () => allowedPlugins,
      runtimeDir: runtimeDirA,
      restrictToPlugins: true,
      ephemeralStdio: true,
    });
    const execB = new SidecarMcpToolExecutor({
      registry,
      getPlugins: () => allowedPlugins,
      runtimeDir: runtimeDirB,
      restrictToPlugins: true,
      ephemeralStdio: true,
    });

    expect(await execA.resolveServerConfig("blocked-mcp")).toBeUndefined();
    expect(await execA.resolveServerConfig("cwd-srv")).toBeDefined();

    const resA = (await execA.callTool("cwd-srv", "get_cwd", {})) as {
      content: Array<{ text: string }>;
    };
    const resB = (await execB.callTool("cwd-srv", "get_cwd", {})) as {
      content: Array<{ text: string }>;
    };

    expect(resA.content[0]?.text).toBe(await fs.realpath(runtimeDirA));
    expect(resB.content[0]?.text).toBe(await fs.realpath(runtimeDirB));
  });
});
