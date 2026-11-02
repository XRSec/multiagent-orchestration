/**
 * Purpose: McpMetaToolingHelper - MCP meta-tool folding (list_tools & call_tool) and snapshot caching.
 * Context: Helper 7 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import crypto from 'node:crypto';
import { META_TOOL_NAMES } from '../../constants.mjs';

export { META_TOOL_NAMES };

export class McpMetaToolingHelper {
  constructor(options = {}) {
    this.tools = new Map(); // key: `${serverName}:${toolName}` -> MCPToolItem
    this.serverDispatchers = new Map(); // serverName -> handler function
    this.fallbackDispatcher = options.fallbackDispatcher || null;
    this.snapshotVersion = 1;
  }

  /**
   * Register or update tool definitions snapshot for a specific MCP server.
   */
  registerServerSnapshot(serverName, tools = []) {
    if (!serverName || typeof serverName !== 'string') {
      throw new TypeError('serverName must be a non-empty string');
    }
    if (!Array.isArray(tools)) {
      throw new TypeError('tools must be an array');
    }

    // Remove existing tools for this server to handle updates
    for (const key of Array.from(this.tools.keys())) {
      if (key.startsWith(`${serverName}:`)) {
        this.tools.delete(key);
      }
    }

    for (const tool of tools) {
      if (!tool || typeof tool !== 'object') continue;
      const toolName = tool.toolName || tool.name;
      if (!toolName) continue;
      const key = `${serverName}:${toolName}`;
      this.tools.set(key, {
        serverName,
        toolName,
        name: toolName,
        description: tool.description || '',
        inputSchema: tool.inputSchema || tool.parameters || { type: 'object' },
        tags: Array.isArray(tool.tags) ? [...tool.tags] : []
      });
    }

    this.snapshotVersion++;
    return this.computeSnapshotHash();
  }

  /**
   * Compute deterministic SHA-256 hash of the entire snapshot cache.
   */
  computeSnapshotHash() {
    const sortedKeys = Array.from(this.tools.keys()).sort();
    const data = sortedKeys.map(k => {
      const t = this.tools.get(k);
      return `${k}:${t.description}:${JSON.stringify(t.inputSchema)}`;
    }).join('||');
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Returns exactly 2 meta tool definitions for the SDK.
   */
  getMetaToolDefinitions() {
    return [
      {
        name: META_TOOL_NAMES.LIST_TOOLS,
        description: 'Query and list available external MCP tools from local snapshot cache.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Optional server name filter'
            },
            keyword: {
              type: 'string',
              description: 'Optional keyword to search tool names, descriptions, or tags'
            }
          }
        }
      },
      {
        name: META_TOOL_NAMES.CALL_TOOL,
        description: 'Execute an external MCP tool via the control plane gateway.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Target MCP server name'
            },
            tool: {
              type: 'string',
              description: 'Target tool name on the server'
            },
            arguments: {
              type: 'object',
              description: 'Arguments payload matching the tool input schema'
            }
          },
          required: ['server', 'tool']
        }
      }
    ];
  }

  /**
   * Query tools from in-memory snapshot with sub-millisecond execution.
   */
  listToolsFromSnapshot(serverName = null, keyword = null) {
    const results = [];
    const lowerKw = keyword ? String(keyword).toLowerCase() : null;

    for (const item of this.tools.values()) {
      if (serverName && item.serverName !== serverName) {
        continue;
      }
      if (lowerKw) {
        const matchesName = item.toolName.toLowerCase().includes(lowerKw);
        const matchesDesc = item.description.toLowerCase().includes(lowerKw);
        const matchesTag = item.tags.some(t => t.toLowerCase().includes(lowerKw));
        const matchesServer = item.serverName.toLowerCase().includes(lowerKw);
        if (!matchesName && !matchesDesc && !matchesTag && !matchesServer) {
          continue;
        }
      }
      results.push(item);
    }
    return results;
  }

  /**
   * Register execution dispatcher for a specific MCP server.
   */
  registerDispatcher(serverName, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('handler must be a function');
    }
    this.serverDispatchers.set(serverName, handler);
  }

  /**
   * Dispatch meta tool call to server handler.
   */
  async dispatchMetaCall(serverName, toolName, args = {}) {
    if (!serverName || !toolName) {
      throw new Error('Both serverName and toolName are required for meta call');
    }
    const key = `${serverName}:${toolName}`;
    const toolDef = this.tools.get(key);
    if (!toolDef) {
      throw new Error(`MCP tool not found in snapshot: ${key}`);
    }

    const dispatcher = this.serverDispatchers.get(serverName) || this.fallbackDispatcher;
    if (typeof dispatcher !== 'function') {
      return {
        success: true,
        mockExecuted: true,
        server: serverName,
        tool: toolName,
        arguments: args,
        timestamp: Date.now()
      };
    }

    return await dispatcher(toolName, args);
  }
}
