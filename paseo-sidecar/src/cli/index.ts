#!/usr/bin/env node
/**
 * Purpose: CLI entry point for SidecarMCP unified control plane commands.
 * Context: Supports serve, mcp-stdio, status, list, and init commands.
 * Usage: sidecar serve [--port 44880] | sidecar mcp-stdio [--runtime <runtime>]
 * Prerequisites: Node 20+, util.parseArgs.
 */
import * as path from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveWorkspaceScopedPlugins, startDaemon } from "../daemon/index.js";
import { SidecarMcpToolExecutor } from "../mcp/executor.js";
import { createSidecarMcpServer } from "../mcp/server.js";
import { UnifiedRegistry } from "../registry/store.js";
import type { RuntimeType } from "../types.js";

function printHelp(): void {
  console.log(`sidecar - paseo-sidecar Unified Control Plane CLI

Usage:
  sidecar serve [--port 44880] [--home ~/.sidecar]
  sidecar mcp-stdio [--runtime claude-desktop] [--dir <path>] [--home ~/.sidecar]
  sidecar status [--home ~/.sidecar]
  sidecar list <skills|plugins|mcps> [--home ~/.sidecar]
  sidecar init [--home ~/.sidecar]
  sidecar help
`);
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command = "help", ...rest] = argv;
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      port: { type: "string", default: "44880" },
      web: { type: "boolean", default: false },
      runtime: { type: "string", default: "claude-desktop" },
      dir: { type: "string" },
      home: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  const registry = new UnifiedRegistry(values.home);

  if (command === "init") {
    console.log(`Initialized paseo-sidecar home at: ${registry.paths.home}`);
    return;
  }

  if (command === "status") {
    const assets = await registry.resolveWorkspaceAssets();
    console.log(
      JSON.stringify(
        {
          home: registry.paths.home,
          skills: assets.skills.length,
          plugins: assets.plugins.length,
          mcps: assets.mcps.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "list") {
    const target = positionals[0] ?? "all";
    const assets = await registry.resolveWorkspaceAssets();
    if (target === "skills") {
      console.log(JSON.stringify(assets.skills, null, 2));
    } else if (target === "plugins") {
      console.log(JSON.stringify(assets.plugins, null, 2));
    } else if (target === "mcps") {
      console.log(JSON.stringify(assets.mcps, null, 2));
    } else {
      console.log(JSON.stringify(assets, null, 2));
    }
    return;
  }

  if (command === "mcp-stdio") {
    const runtime = values.runtime as RuntimeType;
    const runtimeDir = path.resolve(values.dir ?? process.cwd());
    const { mcpPlugins } = await resolveWorkspaceScopedPlugins({
      registry,
      runtime,
      canonicalCwd: runtimeDir,
      sessionId: "mcp-stdio",
    });
    const executor = new SidecarMcpToolExecutor({
      registry,
      runtimeDir,
      restrictToPlugins: true,
      getPlugins: () => mcpPlugins,
    });
    const server = createSidecarMcpServer({
      runtime,
      runtimeDir,
      getPlugins: () => mcpPlugins,
      executor,
    });
    const cleanup = async () => {
      await executor.close();
    };
    server.server.onclose = () => {
      void cleanup();
    };
    process.once("SIGINT", () => {
      void cleanup().finally(() => process.exit(0));
    });
    process.once("SIGTERM", () => {
      void cleanup().finally(() => process.exit(0));
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
    return;
  }

  if (command === "serve") {
    const httpPort = Number(values.port) || 44880;
    const daemon = await startDaemon({
      httpPort,
      enableWeb: values.web,
      sidecarHome: values.home,
    });
    console.log(`paseo-sidecar daemon listening on http://127.0.0.1:${httpPort}`);
    if (values.web) {
      console.log(`Web UI & Plugin Renderer enabled at http://127.0.0.1:${httpPort}/admin`);
    }
    process.on("SIGINT", async () => {
      await daemon.close();
      process.exit(0);
    });
    return;
  }

  console.error(`Unknown command: ${command}`);
  printHelp();
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void runCli();
}
