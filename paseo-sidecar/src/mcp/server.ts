/**
 * Purpose: Streamable HTTP and stdio MCP server exposing frozen Byte-0 meta-tools.
 * Context: Dispatches sidecar_discover, sidecar_load_skill, sidecar_describe_tool, sidecar_call_tool, sidecar_exec_batch.
 * Usage: const server = createSidecarMcpServer(ctx);
 * Prerequisites: @modelcontextprotocol/sdk, zod.
 */
import * as fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import type { NormalizedPluginBundle, RuntimeType } from "../types.js";

export interface SidecarToolExecutor {
  listTools?(
    server?: string,
  ): Promise<
    Array<{
      server: string;
      name: string;
      description?: string;
      inputSchema?: unknown;
    }>
  >;
  describeTool?(
    server: string,
    tool: string,
  ): Promise<Record<string, unknown> | null>;
  callTool?(
    server: string,
    tool: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  close?(): Promise<void>;
}

export interface SidecarMcpContext {
  runtime: RuntimeType;
  runtimeDir?: string;
  getPlugins: () => NormalizedPluginBundle[];
  executor?: SidecarToolExecutor;
}

export const BYTE0_META_TOOL_NAMES = [
  "sidecar_discover",
  "sidecar_load_skill",
  "sidecar_describe_tool",
  "sidecar_call_tool",
  "sidecar_exec_batch",
] as const;

export function createSidecarMcpServer(ctx: SidecarMcpContext): McpServer {
  const server = new McpServer({
    name: `paseo-sidecar-${ctx.runtime}`,
    version: "0.1.0",
  });

  server.tool(
    "sidecar_discover",
    "Discover available plugins, skills, and MCP servers for the active runtime.",
    {
      query: z.string().optional().describe("Optional filter keyword"),
    },
    async ({ query }) => {
      const plugins = ctx.getPlugins();
      const q = query?.toLowerCase();
      const filtered = plugins
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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                runtime: ctx.runtime,
                ...(ctx.runtimeDir ? { runtime_dir: ctx.runtimeDir } : {}),
                plugins: filtered,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "sidecar_load_skill",
    "Load the SKILL.md instructions for a named skill from loaded plugins.",
    {
      skill_name: z.string().describe("Name of the skill to load"),
      plugin_id: z.string().optional().describe("Optional plugin_id hint"),
    },
    async ({ skill_name, plugin_id }) => {
      const plugins = ctx.getPlugins();
      const candidates = plugin_id
        ? plugins.filter((p) => p.plugin_id === plugin_id)
        : plugins;

      for (const plugin of candidates) {
        const candidatesPaths = [
          path.join(plugin.root_dir, "skills", skill_name, "SKILL.md"),
          path.join(plugin.root_dir, "skills", `${skill_name}.md`),
        ];
        for (const p of candidatesPaths) {
          try {
            const content = await fs.readFile(p, "utf-8");
            return {
              content: [{ type: "text", text: content }],
            };
          } catch {
            // continue searching
          }
        }
      }

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Skill "${skill_name}" not found in loaded plugins.`,
          },
        ],
      };
    },
  );

  server.tool(
    "sidecar_describe_tool",
    "Describe a downstream MCP tool schema and metadata.",
    {
      server: z.string().describe("Downstream MCP server name"),
      name: z.string().describe("Tool name"),
    },
    async ({ server: serverName, name }) => {
      if (ctx.executor?.describeTool) {
        try {
          const desc = await ctx.executor.describeTool(serverName, name);
          if (desc) {
            return {
              content: [{ type: "text", text: JSON.stringify(desc, null, 2) }],
            };
          }
        } catch (err) {
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: err instanceof Error ? err.message : String(err),
              },
            ],
          };
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                server: serverName,
                name,
                status: "unavailable",
                message: "No downstream tool descriptor registered.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    "sidecar_call_tool",
    "Invoke a downstream MCP tool through the sidecar hub.",
    {
      server: z.string().describe("Downstream MCP server name"),
      name: z.string().describe("Tool name"),
      arguments: z
        .record(z.unknown())
        .optional()
        .describe("Tool arguments object"),
    },
    async ({ server: serverName, name, arguments: args }) => {
      if (!ctx.executor?.callTool) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No downstream tool executor configured for ${serverName}.${name}.`,
            },
          ],
        };
      }

      try {
        const result = await ctx.executor.callTool(
          serverName,
          name,
          args ?? {},
        );
        return {
          content: [
            {
              type: "text",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: err instanceof Error ? err.message : String(err),
            },
          ],
        };
      }
    },
  );

  server.tool(
    "sidecar_exec_batch",
    "Execute a batch of downstream MCP tool calls.",
    {
      calls: z
        .array(
          z.object({
            server: z.string(),
            name: z.string(),
            arguments: z.record(z.unknown()).optional(),
          }),
        )
        .describe("List of tool calls to execute"),
    },
    async ({ calls }) => {
      const results = [];
      for (const call of calls) {
        if (!ctx.executor?.callTool) {
          results.push({
            server: call.server,
            name: call.name,
            error: "No downstream tool executor configured",
          });
          continue;
        }
        try {
          const output = await ctx.executor.callTool(
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

      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  return server;
}

export async function handleMcpHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  parsedBody: unknown,
  ctx: SidecarMcpContext,
): Promise<void> {
  const server = createSidecarMcpServer(ctx);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}
