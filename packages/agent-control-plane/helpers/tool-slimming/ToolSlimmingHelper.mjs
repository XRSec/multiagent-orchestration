/**
 * Purpose: ToolSlimmingHelper - JSON Schema slimming, capability-based filtering & pre-compiled hash caching.
 * Context: Helper 6 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import crypto from 'node:crypto';
import { CAPABILITY_TOOL_MAP, CAPABILITY_TYPES } from '../../constants.mjs';

export { CAPABILITY_TOOL_MAP, CAPABILITY_TYPES };

export class ToolSlimmingHelper {
  constructor(options = {}) {
    this.compileCache = new Map();
    this.maxDescriptionChars = Number.isInteger(options.maxDescriptionChars)
      ? options.maxDescriptionChars
      : 80;
  }

  /**
   * Recursively clean schema objects removing metadata bloat:
   * examples, title, default, markdownDescription, $schema.
   */
  _cleanPropertyNode(node, seen = new WeakSet()) {
    if (!node || typeof node !== 'object') return node;
    if (seen.has(node)) {
      return '[Circular]';
    }
    seen.add(node);

    if (Array.isArray(node)) {
      return node.map(item => this._cleanPropertyNode(item, seen));
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(node)) {
      // Discard metadata bloat
      if (['examples', 'title', 'default', 'markdownDescription', '$schema'].includes(key)) {
        continue;
      }
      if (key === 'description' && typeof value === 'string') {
        const singleLine = value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
        cleaned[key] = singleLine.length > this.maxDescriptionChars
          ? singleLine.slice(0, Math.max(0, this.maxDescriptionChars - 3)) + '...'
          : singleLine;
      } else if (value && typeof value === 'object') {
        cleaned[key] = this._cleanPropertyNode(value, seen);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  /**
   * Slim down a single tool's JSON Schema by stripping bloat fields.
   */
  slimSchema(tool) {
    if (!tool || typeof tool !== 'object') return tool;

    const slimmed = {
      name: tool.name
    };

    if (tool.description) {
      const desc = String(tool.description).replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      slimmed.description = desc.length > this.maxDescriptionChars
        ? desc.slice(0, Math.max(0, this.maxDescriptionChars - 3)) + '...'
        : desc;
    }

    const seen = new WeakSet();
    seen.add(tool);

    if (tool.parameters) {
      slimmed.parameters = this._cleanPropertyNode(tool.parameters, seen);
    } else if (tool.inputSchema) {
      slimmed.inputSchema = this._cleanPropertyNode(tool.inputSchema, seen);
    }

    return slimmed;
  }

  /**
   * Filter tool list dynamically based on active capability mask.
   */
  filterByCapabilities(tools, capabilities) {
    if (!Array.isArray(tools)) return [];
    if (!capabilities || !(capabilities instanceof Set) || capabilities.size === 0) {
      return tools;
    }

    const allowedToolNames = new Set();
    for (const cap of capabilities) {
      const list = CAPABILITY_TOOL_MAP[cap] || [];
      for (const t of list) {
        allowedToolNames.add(t.toLowerCase());
      }
      // Support aliases (e.g. standard SDK tool names)
      if (cap === CAPABILITY_TYPES.FILE_READ) {
        allowedToolNames.add('read');
        allowedToolNames.add('glob');
        allowedToolNames.add('grep');
        allowedToolNames.add('view_file');
        allowedToolNames.add('list_dir');
      } else if (cap === CAPABILITY_TYPES.FILE_WRITE) {
        allowedToolNames.add('write');
        allowedToolNames.add('edit');
        allowedToolNames.add('replace_file_content');
      } else if (cap === CAPABILITY_TYPES.COMMAND_RUN) {
        allowedToolNames.add('bash');
        allowedToolNames.add('run_command');
      }
    }

    return tools.filter(tool => {
      const name = String(tool.name || '').toLowerCase();
      return allowedToolNames.has(name);
    });
  }

  /**
   * Compile or retrieve pre-compiled cached tool set with deterministic SHA-256 key.
   */
  getOrCompile(tools = [], capabilities = null) {
    const rawTools = Array.isArray(tools) ? tools : [];
    const filtered = this.filterByCapabilities(rawTools, capabilities);
    const slimmedTools = filtered.map(t => this.slimSchema(t));

    const toolsJson = JSON.stringify(slimmedTools);
    const capKey = capabilities ? Array.from(capabilities).sort().join(',') : 'ALL';
    const schemaHash = crypto.createHash('sha256').update(`${capKey}:${toolsJson}`, 'utf8').digest('hex');

    if (this.compileCache.has(schemaHash)) {
      return this.compileCache.get(schemaHash);
    }

    const tokenEstimate = Math.max(1, Math.round(Buffer.byteLength(toolsJson, 'utf8') / 3.5));
    const compiled = {
      schemaHash,
      tools: slimmedTools,
      tokenEstimate
    };

    this.compileCache.set(schemaHash, compiled);
    return compiled;
  }
}
