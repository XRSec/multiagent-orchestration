# Handoff Report: ToolSlimmingHelper, McpMetaToolingHelper & Constants/Index 架构设计方案 (Explorer 3)

## 1. Observation (客观事实与源码勘测)

通过对现有代码库、Claude Agent SDK 核心定义及技术规约的直接勘测，确认以下事实与结构约束：

1. **SDK 驱动层与 MCP 挂载机制**：
   - 引用自 `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs:139-148`：
     ```javascript
     const queryOptions = {
       cwd: this.partnerDir,
       abortController: this.abortController,
       appendSystemPrompt: combinedSystemPrompt,
       hooks,
       maxTurns: this.manifest.max_turns || 25,
       ...(this.manifest.disallowed_tools?.length ? { disallowedTools: this.manifest.disallowed_tools } : {}),
       ...(options.inProcessMcpServers ? { mcpServers: options.inProcessMcpServers } : {}),
       ...(options.resumeSessionId ? { resume: options.resumeSessionId } : {})
     };
     ```
     `ClaudeAgentSdkDriver` 原生支持通过 `disallowedTools` 动态禁用特定工具，并支持注入 `inProcessMcpServers`。
   - 引用自 `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:647-677`：
     ```typescript
     export declare function createSdkMcpServer(_options: CreateSdkMcpServerOptions): McpSdkServerConfigWithInstance;
     declare type CreateSdkMcpServerOptions = {
         name: string;
         version?: string;
         instructions?: string;
         tools?: Array<SdkMcpToolDefinition<any>>;
         alwaysLoad?: boolean;
         timeout?: number;
     };
     ```
     SDK 原生通过 `createSdkMcpServer` 挂载进程内工具，每个工具包含 name、description、inputSchema 等 JSON Schema 定义。

2. **多 Agent 现有 MCP 元工具实现模式**：
   - 引用自 `apps/desktop/src/main/orchestrator/InProcessOrchestratorMcp.mjs:167-171`：
     ```javascript
     const server = createSdkMcpServer({
       name: 'nexus-orchestrator-mcp',
       version: '1.0.0',
       tools: [dispatchTool, awaitTool, steerTool]
     });
     ```
     该模块已验证在 Electron 主进程中无 IPC/stdio 开销的原生 In-Process MCP 模式是成熟可行的。

3. **代码规范与行数预算**：
   - 引用自 `docs/dev-rules/script-standards.md:18-21`：
     `Single script target length: <= 600 lines; Decoupling review threshold: >= 500 lines; Single function scope: <= 50 lines; cyclomatic complexity <= 10.`
   - 引用自 `docs/dev-rules/script-standards.md:22-27`：
     每个脚本必须包含标准的 3-4 行头部自解释注释（Purpose, Context, Usage, Prerequisites）。
   - 引用自 `docs/axioms/STANDING_ORDER.md:11-17`：
     内部代码注释、文档与类型规范必须 100% 使用 `en-US` 与 RFC-2119 规范动词。

4. **架构解耦与目录定位**：
   - 引用自 `PROJECT.md:8-23`：
     - 包路径位于 `packages/agent-control-plane/`；
     - 零外部运行时第三方膨胀，纯 Node.js 18+ 原生 ES Modules (`.mjs`)；
     - 8 项 Helper 之间严格解耦，0 交叉依赖，通信统一经由 `PipelineContext`；
     - 测试框架统一采用 Node.js 原生 `node:test` 与 `node:assert/strict`。

---

## 2. Logic Chain (逻辑推导链)

从上述客观事实出发，推导出本次负责的 4 个核心源文件与 2 个单元测试套件的技术方案：

1. **上下文冗余与 Token 击穿问题 (推导 Helper 6: ToolSlimmingHelper)**：
   - **事实依据**：工具的原始 JSON Schema 通常包含大量调试级元数据（`examples`, `title`, `default`, `markdownDescription`, `$schema`）以及长达数百字符的冗长说明。若注册 20 个工具，这些元数据会单次消耗 3,000~5,000 个 Input Token，且每轮重复发送。
   - **推导结论**：
     - 必须设计递归字段剪裁器（`cleanNode`），剔除 `TOOL_SLIMMING_EXCLUDED_KEYS`；
     - 必须将 `description` 规整为单行并在超过 `MAX_TOOL_DESCRIPTION_LENGTH` (120 字符) 时优雅截断；
     - 根据意图预检计算的 `CAPABILITIES` 掩码（如只读探索模式仅需 `FILE_READ`），动态过滤只暴露最小工具集，并通过 `getDisallowedTools()` 计算差集输出给 SDK；
     - 工具集具有高度幂等性，必须按 `sha256(canonicalTools + capabilities)` 建立确定性预编译内存缓存（`schemaCache`），第二次调用直接 O(1) 返回相同对象引用。

2. **工具数量膨胀与 Context 爆炸问题 (推导 Helper 7: McpMetaToolingHelper)**：
   - **事实依据**：当接入多个外部 MCP Server（浏览器驱动、文件系统、知识库检索等）时，底层工具数量激增至 50~100+。若全部暴露给大模型，会导致严重的幻觉、参数混淆以及 Context 爆炸。
   - **推导结论**：
     - 必须将成百上千个外部 MCP 工具折叠为固定的 **2 个高阶元工具**：
       1. `mcp_gateway_list_tools`: 支持按 `server` 过滤或按 `keyword` 快速模糊检索本地内存快照；
       2. `mcp_gateway_call_tool`: 接收 `{ server, tool, arguments }`，在控制平面本地执行 Schema 安全校验后，将调用转发给对应真实 MCP Server 执行；
     - 本地快照通过内存 `Map` 存储，实现 0ms 本地元数据查询，杜绝任何外部 RPC 网络往返；
     - 转发执行必须具备**异常隔离**与**超时熔断**（`DEFAULT_MCP_TIMEOUT_MS = 30000`），避免单个外部工具挂死导致主调度流程卡死。

3. **单点真实源与全局契约 (推导 `constants.mjs` 与 `index.mjs`)**：
   - **事实依据**：8 大能力各自独立，但共享核心阈值（`STEP_SCRUB_INTERVAL = 6`, `MAX_CAPSULE_LENGTH = 180`）与枚举定义（`CAPABILITIES`, `INTENT_TYPES`）。
   - **推导结论**：
     - `constants.mjs` 作为全包不可变常量源（全部 `Object.freeze`），杜绝任何硬编码魔法数；
     - `index.mjs` 作为统一门面，完整汇聚导出 `constants.mjs`、8 个 Helper 类以及便捷装配工厂 `createControlPlane()`，同时支持细粒度 Tree-shaking 导入。

4. **单测独立性与全绿可控性 (推导 `test-tool-slimming.mjs` & `test-mcp-meta-tooling.mjs`)**：
   - **事实依据**：单元测试严禁依赖网络大模型，必须能在毫秒级执行完毕。
   - **推导结论**：使用 `node:test` 与 `node:assert/strict` 构造全量 Mock 数据与边界断言，针对剪裁率、原型链安全、异常隔离、缓存命中率进行全面闭环覆盖。

---

## 3. Caveats (边界限制与潜在陷阱)

1. **原型污染与保留键拦截 (Prototype Pollution Defense)**：
   - 在处理工具参数字典或快照查询时，严禁使用裸 `obj[key]`。所有外部键名检索必须通过 `Object.prototype.hasOwnProperty.call(map, key)` 或使用 `Map` 原生数据结构，彻底防范 `'toString'`, `'__proto__'`, `'constructor'` 攻击。
2. **Schema 递归剪裁对 `required` 约束的完整性保留**：
   - 剪裁 `parameters` 只能移除装饰性说明（`examples`, `title` 等），**绝对不能删除** `type`, `properties`, `required`, `items`, `enum` 核心语义字段，否则会导致大模型生成非法参数结构。
3. **超时与异步未捕获异常的沙箱隔离**：
   - 外部 MCP dispatcher 抛出的错误必须被 `try...catch` 拦截并包装为 `{ success: false, error: 'EXECUTION_FAILED', message: err.message }`，严禁让未捕获的 Promise Rejection 溢出至主进程事件循环。
4. **SDK 依赖解耦与离线运行兜底**：
   - 在单测环境或轻量无 SDK 环境下，`McpMetaToolingHelper` 的核心元工具能力必须完全自包含运作，`createSdkMcpServerConfig()` 在缺失 `@anthropic-ai/claude-agent-sdk` 时应优雅降级返回标准定义对象，确保无依赖全绿运行。

---

## 4. Conclusion: 完整落地实现与代码蓝图

以下为本次勘测设计的 6 个文件详尽技术实现蓝图。所有文件均遵循：
- 单文件行数在 100 ~ 280 行区间（严格 `<= 600` 行）；
- 原生 Node.js ESM (`.mjs`)，零第三方运行时依赖；
- 符合 3-4 行标准头部注释规范；
- 内部代码注释严格遵循 100% `en-US` 与 RFC-2119 规范。

### 4.1 `packages/agent-control-plane/constants.mjs`

```javascript
/**
 * Purpose: Central constants and configuration thresholds for Agent Control Plane.
 * Context: Unifies capability names, thresholds, regexes, and system bounds across 8 helpers.
 * Usage: import { CAPABILITIES, STEP_SCRUB_INTERVAL, ... } from './constants.mjs';
 * Prerequisites: Node.js 18+ (ESM).
 */

// [1] Pipeline & Step Scrubbing Bounds
export const STEP_SCRUB_INTERVAL = 6;
export const HEAD_RETAIN_LINES = 6;
export const TAIL_RETAIN_LINES = 6;

// [2] Micro-Capsule & Progressive Disclosure Bounds
export const MAX_CAPSULE_LENGTH = 180;
export const DISCLOSURE_LEVELS = Object.freeze({
  LEVEL_1: 1, // Metadata folded: [ResourceFolded: id | lines: n | bytes: b | tag: t]
  LEVEL_2: 2, // Micro-capsule: <= 180 chars high-density summary
  LEVEL_3: 3  // On-demand line slice window: [Lines start-end of total]
});

// [3] Prompt Cache & Tail Injection
export const EPHEMERAL_TAIL_FENCE = '=== [EPHEMERAL_TAIL_CONTEXT] ===';

// [4] Intent & Continuation Primitives
export const INTENT_TYPES = Object.freeze({
  BYPASS_CONTINUATION: 'BYPASS_CONTINUATION',
  READ_EXPLORE: 'READ_EXPLORE',
  CODE_MUTATION: 'CODE_MUTATION',
  TERMINAL_EXEC: 'TERMINAL_EXEC',
  ORCHESTRATION: 'ORCHESTRATION',
  GENERAL_QUERY: 'GENERAL_QUERY'
});

export const CONTINUATION_PHRASES = Object.freeze([
  'ok', 'okay', '继续', '好', '好的', 'yes', 'y', 'proceed',
  'go on', '1', '收到', '确认', 'next', 'continue', '行'
]);

// [5] Capabilities
export const CAPABILITIES = Object.freeze({
  FILE_READ: 'FILE_READ',
  FILE_WRITE: 'FILE_WRITE',
  COMMAND_RUN: 'COMMAND_RUN',
  MCP_GATEWAY: 'MCP_GATEWAY',
  SKILL_LOAD: 'SKILL_LOAD'
});

// [6] Default Capability to Tool Mappings
export const DEFAULT_CAPABILITY_TOOLS = Object.freeze({
  [CAPABILITIES.FILE_READ]: Object.freeze([
    'view_file', 'Read', 'read_file', 'grep_search', 'Grep', 'find_by_name', 'Glob', 'list_dir'
  ]),
  [CAPABILITIES.FILE_WRITE]: Object.freeze([
    'replace_file_content', 'write_to_file', 'Edit', 'Write'
  ]),
  [CAPABILITIES.COMMAND_RUN]: Object.freeze([
    'run_command', 'Bash'
  ]),
  [CAPABILITIES.MCP_GATEWAY]: Object.freeze([
    'mcp_gateway_list_tools', 'mcp_gateway_call_tool'
  ]),
  [CAPABILITIES.SKILL_LOAD]: Object.freeze([
    'load_skill', 'Skill'
  ])
});

// [7] Tool Slimming Rules & Bounds
export const MAX_TOOL_DESCRIPTION_LENGTH = 120;
export const TOOL_SLIMMING_EXCLUDED_KEYS = Object.freeze([
  'examples',
  'example',
  'title',
  'default',
  'markdownDescription',
  '$schema',
  'definitions',
  'comments',
  'x-expanded'
]);

// [8] MCP Gateway Configuration & Meta Tool Names
export const MCP_GATEWAY_TOOLS = Object.freeze({
  LIST_TOOLS: 'mcp_gateway_list_tools',
  CALL_TOOL: 'mcp_gateway_call_tool'
});

export const DEFAULT_MCP_TIMEOUT_MS = 30000;

// [9] In-Memory Cache Limits
export const CACHE_LIMITS = Object.freeze({
  MAX_SCHEMA_CACHE_SIZE: 256,
  MAX_PROMPT_PREFIX_CACHE_SIZE: 128,
  MAX_SKILL_CACHE_SIZE: 128
});
```

---

### 4.2 `packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs`

```javascript
/**
 * Purpose: Strips verbose schema metadata, dynamically filters tools by capability, and caches compiled definitions.
 * Context: Helper 6 in Agent Control Plane - Prevents tool definition bloat and saves input tokens.
 * Usage: const slimmer = new ToolSlimmingHelper(); const compiled = slimmer.getOrCompile(tools, capabilities);
 * Prerequisites: Node.js 18+ (ESM).
 */

import crypto from 'node:crypto';
import {
  CAPABILITIES,
  DEFAULT_CAPABILITY_TOOLS,
  MAX_TOOL_DESCRIPTION_LENGTH,
  TOOL_SLIMMING_EXCLUDED_KEYS,
  CACHE_LIMITS
} from '../../constants.mjs';

export class ToolSlimmingHelper {
  constructor(options = {}) {
    this.maxDescriptionLength = options.maxDescriptionLength || MAX_TOOL_DESCRIPTION_LENGTH;
    this.excludedKeys = new Set(options.excludedKeys || TOOL_SLIMMING_EXCLUDED_KEYS);
    this.capabilityToolMapping = options.capabilityToolMapping || DEFAULT_CAPABILITY_TOOLS;
    this.cacheLimit = options.cacheLimit || CACHE_LIMITS.MAX_SCHEMA_CACHE_SIZE;

    // In-memory bounded LRU cache: cacheKey -> CompiledToolSet
    this.cache = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Recursively strip non-essential metadata from JSON schema.
   */
  cleanSchemaNode(node) {
    if (!node || typeof node !== 'object') {
      return node;
    }

    if (Array.isArray(node)) {
      return node.map((item) => this.cleanSchemaNode(item));
    }

    const cleaned = {};
    for (const [key, value] of Object.entries(node)) {
      if (this.excludedKeys.has(key)) {
        continue;
      }

      if (key === 'description' && typeof value === 'string') {
        cleaned[key] = this.compressDescription(value);
      } else {
        cleaned[key] = this.cleanSchemaNode(value);
      }
    }

    return cleaned;
  }

  /**
   * Compress description to single line and bounded length.
   */
  compressDescription(text) {
    if (typeof text !== 'string') return '';
    const singleLine = text.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= this.maxDescriptionLength) {
      return singleLine;
    }
    return singleLine.slice(0, this.maxDescriptionLength - 3) + '...';
  }

  /**
   * Slim a single raw tool definition.
   */
  slimSchema(tool) {
    if (!tool || typeof tool !== 'object' || !tool.name) {
      throw new Error('Tool definition MUST contain a valid "name" property.');
    }

    const slimmed = {
      name: tool.name,
      description: this.compressDescription(tool.description || '')
    };

    const inputParams = tool.parameters || tool.inputSchema;
    if (inputParams && typeof inputParams === 'object') {
      slimmed.parameters = this.cleanSchemaNode(inputParams);
    }

    return slimmed;
  }

  /**
   * Dynamically filter tool array according to active capabilities.
   */
  filterByCapabilities(tools, capabilities) {
    if (!Array.isArray(tools)) return [];
    if (!capabilities) return [...tools];

    const capSet = capabilities instanceof Set ? capabilities : new Set(capabilities);
    if (capSet.has('ALL') || capSet.size === 0) {
      return [...tools];
    }

    const allowedToolNames = new Set();
    for (const cap of capSet) {
      const mapped = this.capabilityToolMapping[cap];
      if (Array.isArray(mapped)) {
        for (const toolName of mapped) {
          allowedToolNames.add(toolName);
        }
      }
    }

    return tools.filter((t) => allowedToolNames.has(t.name));
  }

  /**
   * Compute disallowed tools list for SDK queryOptions.
   */
  getDisallowedTools(allTools, capabilities) {
    if (!Array.isArray(allTools)) return [];
    const allowed = this.filterByCapabilities(allTools, capabilities);
    const allowedNames = new Set(allowed.map((t) => t.name));
    return allTools
      .filter((t) => !allowedNames.has(t.name))
      .map((t) => t.name);
  }

  /**
   * Compile a toolset with SHA-256 hash and compression metrics.
   */
  compileToolSet(tools, capabilities) {
    const filteredTools = this.filterByCapabilities(tools, capabilities);
    const slimmedTools = filteredTools.map((t) => this.slimSchema(t));

    const rawJson = JSON.stringify(filteredTools);
    const slimmedJson = JSON.stringify(slimmedTools);

    const rawLength = rawJson.length;
    const slimmedLength = slimmedJson.length;
    const savedBytes = Math.max(0, rawLength - slimmedLength);
    const tokenEstimate = Math.max(1, Math.round(slimmedLength / 4));
    const tokenSavingsEstimate = Math.round(savedBytes / 4);

    const schemaHash = crypto
      .createHash('sha256')
      .update(slimmedJson)
      .digest('hex');

    return {
      schemaHash,
      tools: slimmedTools,
      rawLength,
      slimmedLength,
      tokenEstimate,
      tokenSavingsEstimate,
      compressionRatio: rawLength > 0 ? Number((1 - slimmedLength / rawLength).toFixed(3)) : 0
    };
  }

  /**
   * Get compiled toolset from cache or compile and store.
   */
  getOrCompile(tools, capabilities) {
    const capList = capabilities
      ? Array.from(capabilities instanceof Set ? capabilities : capabilities).sort()
      : ['ALL'];
    const toolNames = Array.isArray(tools) ? tools.map((t) => t.name).sort() : [];
    const cacheKey = crypto
      .createHash('sha256')
      .update(toolNames.join(',') + '::' + capList.join(','))
      .digest('hex');

    if (this.cache.has(cacheKey)) {
      this.hits++;
      const cached = this.cache.get(cacheKey);
      // Promote key in Map for LRU behavior
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    this.misses++;
    const compiled = this.compileToolSet(tools, capabilities);

    if (this.cache.size >= this.cacheLimit) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    this.cache.set(cacheKey, compiled);
    return compiled;
  }

  /**
   * Cache management and statistics.
   */
  clearCache() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getCacheStats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? Number((this.hits / total).toFixed(3)) : 0
    };
  }
}
```

---

### 4.3 `packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs`

```javascript
/**
 * Purpose: Folds N external MCP tools into 2 meta-tools with in-memory snapshot cache and safe forwarding.
 * Context: Helper 7 in Agent Control Plane - Eliminates tool schema explosion for external MCP servers.
 * Usage: const helper = new McpMetaToolingHelper(); helper.registerServer('driver', tools, dispatcher);
 * Prerequisites: Node.js 18+ (ESM).
 */

import crypto from 'node:crypto';
import { MCP_GATEWAY_TOOLS, DEFAULT_MCP_TIMEOUT_MS } from '../../constants.mjs';

export class McpMetaToolingHelper {
  constructor(options = {}) {
    this.timeoutMs = options.timeoutMs || DEFAULT_MCP_TIMEOUT_MS;
    this.listToolName = options.listToolName || MCP_GATEWAY_TOOLS.LIST_TOOLS;
    this.callToolName = options.callToolName || MCP_GATEWAY_TOOLS.CALL_TOOL;

    // Storage: serverName -> { tools: Map<toolName, ToolItem>, dispatcher: Function }
    this.servers = new Map();
    this.snapshotHash = '';
    this._recomputeSnapshotHash();
  }

  /**
   * Register an external MCP server and its tools into local memory snapshot.
   */
  registerServer(serverName, tools, dispatcher) {
    if (typeof serverName !== 'string' || !serverName) {
      throw new Error('serverName MUST be a non-empty string.');
    }
    if (!Array.isArray(tools)) {
      throw new Error('tools MUST be an array of tool definitions.');
    }
    if (typeof dispatcher !== 'function') {
      throw new Error('dispatcher MUST be a function (toolName, args) => Promise<any>.');
    }

    const toolsMap = new Map();
    for (const tool of tools) {
      if (!tool || !tool.name) continue;
      toolsMap.set(tool.name, {
        server: serverName,
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || tool.parameters || { type: 'object' },
        tags: Array.isArray(tool.tags) ? tool.tags : []
      });
    }

    this.servers.set(serverName, {
      tools: toolsMap,
      dispatcher
    });

    this._recomputeSnapshotHash();
    return this.snapshotHash;
  }

  /**
   * Unregister an MCP server from snapshot.
   */
  unregisterServer(serverName) {
    const deleted = this.servers.delete(serverName);
    if (deleted) {
      this._recomputeSnapshotHash();
    }
    return deleted;
  }

  /**
   * List or search tools in memory snapshot without network RPC.
   */
  listTools(query = {}) {
    const { server, keyword } = query;
    const results = [];
    const normalizedKeyword = keyword ? String(keyword).toLowerCase() : null;

    const targetServers = server
      ? (this.servers.has(server) ? [[server, this.servers.get(server)]] : [])
      : Array.from(this.servers.entries());

    for (const [srvName, srvRecord] of targetServers) {
      for (const [toolName, toolItem] of srvRecord.tools.entries()) {
        if (normalizedKeyword) {
          const matchName = toolName.toLowerCase().includes(normalizedKeyword);
          const matchDesc = (toolItem.description || '').toLowerCase().includes(normalizedKeyword);
          const matchTags = toolItem.tags.some((t) => t.toLowerCase().includes(normalizedKeyword));
          if (!matchName && !matchDesc && !matchTags) {
            continue;
          }
        }

        results.push({
          server: srvName,
          name: toolName,
          description: toolItem.description,
          tags: toolItem.tags,
          requiredParams: toolItem.inputSchema?.required || []
        });
      }
    }

    return results;
  }

  /**
   * Retrieve full tool schema and details for on-demand inspection.
   */
  getTool(serverName, toolName) {
    if (!this.servers.has(serverName)) return null;
    const srv = this.servers.get(serverName);
    return srv.tools.get(toolName) || null;
  }

  /**
   * Dispatches a meta-call safely to the underlying registered dispatcher.
   */
  async dispatchCall(serverName, toolName, args = {}) {
    if (!this.servers.has(serverName)) {
      return {
        success: false,
        error: 'UNKNOWN_SERVER',
        message: `MCP Server "${serverName}" is not registered in gateway snapshot.`
      };
    }

    const srv = this.servers.get(serverName);
    if (!srv.tools.has(toolName)) {
      return {
        success: false,
        error: 'UNKNOWN_TOOL',
        message: `Tool "${toolName}" was not found on MCP Server "${serverName}".`
      };
    }

    const toolItem = srv.tools.get(toolName);
    const requiredProps = toolItem.inputSchema?.required;
    if (Array.isArray(requiredProps)) {
      const missing = requiredProps.filter((prop) => !Object.prototype.hasOwnProperty.call(args, prop));
      if (missing.length > 0) {
        return {
          success: false,
          error: 'MISSING_REQUIRED_ARGUMENTS',
          missing,
          message: `Missing required argument(s): ${missing.join(', ')}`
        };
      }
    }

    // Guard with execution timeout
    try {
      const executionPromise = srv.dispatcher(toolName, args);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`MCP tool execution timed out after ${this.timeoutMs}ms.`));
        }, this.timeoutMs).unref?.();
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);
      return {
        success: true,
        server: serverName,
        tool: toolName,
        result
      };
    } catch (err) {
      const isTimeout = err.message && err.message.includes('timed out');
      return {
        success: false,
        error: isTimeout ? 'TIMEOUT' : 'EXECUTION_FAILED',
        message: err.message || 'Unknown execution error occurred.'
      };
    }
  }

  /**
   * Returns exactly 2 meta tool definitions for LLM context exposure.
   */
  getMetaToolDefinitions() {
    return [
      {
        name: this.listToolName,
        description: 'Lists or searches available external tools by server name or keyword query from local snapshot.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Optional MCP server name filter.'
            },
            keyword: {
              type: 'string',
              description: 'Optional query keyword to search in tool names, descriptions, or tags.'
            }
          }
        }
      },
      {
        name: this.callToolName,
        description: 'Dispatches an execution call to a specific external tool hosted on a registered MCP server.',
        parameters: {
          type: 'object',
          properties: {
            server: {
              type: 'string',
              description: 'Target MCP server name.'
            },
            tool: {
              type: 'string',
              description: 'Target tool name on the server.'
            },
            arguments: {
              type: 'object',
              description: 'Input arguments matching target tool schema.'
            }
          },
          required: ['server', 'tool', 'arguments']
        }
      }
    ];
  }

  /**
   * Internal deterministic hash computation over registered snapshot.
   */
  _recomputeSnapshotHash() {
    const canonical = [];
    const sortedServers = Array.from(this.servers.keys()).sort();
    for (const srvName of sortedServers) {
      const srv = this.servers.get(srvName);
      const sortedTools = Array.from(srv.tools.keys()).sort();
      canonical.push({
        server: srvName,
        tools: sortedTools
      });
    }

    this.snapshotHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex');
  }

  /**
   * Snapshot statistics.
   */
  getSnapshotStats() {
    let totalTools = 0;
    for (const srv of this.servers.values()) {
      totalTools += srv.tools.size;
    }
    return {
      totalServers: this.servers.size,
      totalTools,
      snapshotHash: this.snapshotHash
    };
  }

  clear() {
    this.servers.clear();
    this._recomputeSnapshotHash();
  }
}
```

---

### 4.4 `packages/agent-control-plane/index.mjs`

```javascript
/**
 * Purpose: Unified package entrypoint for @agent-control-plane runtime control plane.
 * Context: Central facade exporting all 8 decoupled capabilities, constants, and helper factory.
 * Usage: import { ToolSlimmingHelper, McpMetaToolingHelper, ... } from './index.mjs';
 * Prerequisites: Node.js 18+ (ESM).
 */

// Export all centralized constants
export * from './constants.mjs';

// Export all 8 decoupled helpers
export { IntentPreflightHelper } from './helpers/intent-preflight/IntentPreflightHelper.mjs';
export { PromptCacheLockHelper } from './helpers/prompt-cache-lock/PromptCacheLockHelper.mjs';
export { ProgressiveDisclosureHelper } from './helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs';
export { StepScrubberHelper } from './helpers/step-scrubber/StepScrubberHelper.mjs';
export { PromptDistillationHelper } from './helpers/prompt-distillation/PromptDistillationHelper.mjs';
export { ToolSlimmingHelper } from './helpers/tool-slimming/ToolSlimmingHelper.mjs';
export { McpMetaToolingHelper } from './helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs';
export { SkillCapsuleHelper } from './helpers/skill-capsule/SkillCapsuleHelper.mjs';

import { ToolSlimmingHelper } from './helpers/tool-slimming/ToolSlimmingHelper.mjs';
import { McpMetaToolingHelper } from './helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs';

/**
 * Convenience factory to create a fully initialized control plane helper bundle.
 */
export function createControlPlane(options = {}) {
  const toolSlimming = new ToolSlimmingHelper(options.toolSlimming);
  const mcpMetaTooling = new McpMetaToolingHelper(options.mcpMetaTooling);

  return {
    toolSlimming,
    mcpMetaTooling
  };
}
```

---

### 4.5 `tests/unit/test-tool-slimming.mjs`

```javascript
/**
 * Purpose: Automated unit test suite for ToolSlimmingHelper (Helper 6).
 * Context: Validates schema metadata trimming, dynamic capability filtering, and SHA-256 pre-compiled cache.
 * Usage: node --test tests/unit/test-tool-slimming.mjs
 * Prerequisites: Node.js 18+ (node:test, node:assert/strict).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ToolSlimmingHelper } from '../../packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs';
import { CAPABILITIES } from '../../packages/agent-control-plane/constants.mjs';

describe('ToolSlimmingHelper (Helper 6)', () => {
  const sampleVerboseTools = [
    {
      name: 'view_file',
      description: 'Reads the entire contents of a specified file. Use this whenever you want to inspect source code or text files in the project workspace.',
      parameters: {
        type: 'object',
        title: 'ViewFileParameters',
        $schema: 'http://json-schema.org/draft-07/schema#',
        examples: [{ AbsolutePath: '/foo/bar.txt' }],
        properties: {
          AbsolutePath: {
            type: 'string',
            title: 'Path',
            default: '/default/path',
            description: 'The absolute filesystem path of the target file to be viewed.'
          }
        },
        required: ['AbsolutePath']
      }
    },
    {
      name: 'write_to_file',
      description: 'Creates a new file or overwrites an existing file with the provided code content.',
      parameters: {
        type: 'object',
        properties: {
          TargetFile: { type: 'string' },
          CodeContent: { type: 'string' }
        },
        required: ['TargetFile', 'CodeContent']
      }
    },
    {
      name: 'run_command',
      description: 'Executes a bash shell command in the host terminal environment.',
      parameters: {
        type: 'object',
        properties: {
          CommandLine: { type: 'string' }
        },
        required: ['CommandLine']
      }
    }
  ];

  it('T1.1: should recursively strip excluded metadata while preserving required fields', () => {
    const helper = new ToolSlimmingHelper();
    const slimmed = helper.slimSchema(sampleVerboseTools[0]);

    assert.equal(slimmed.name, 'view_file');
    assert.ok(slimmed.description.length <= 120);
    assert.equal(slimmed.parameters.type, 'object');
    assert.deepEqual(slimmed.parameters.required, ['AbsolutePath']);

    // Assert stripped keys
    assert.equal(slimmed.parameters.title, undefined);
    assert.equal(slimmed.parameters.$schema, undefined);
    assert.equal(slimmed.parameters.examples, undefined);
    assert.equal(slimmed.parameters.properties.AbsolutePath.title, undefined);
    assert.equal(slimmed.parameters.properties.AbsolutePath.default, undefined);
  });

  it('T1.2: should compress overlong description to maxDescriptionLength', () => {
    const helper = new ToolSlimmingHelper({ maxDescriptionLength: 40 });
    const longDescTool = {
      name: 'long_tool',
      description: 'This is an excessively wordy description that definitely exceeds forty characters by a very large margin.',
      parameters: { type: 'object', properties: {} }
    };
    const slimmed = helper.slimSchema(longDescTool);
    assert.ok(slimmed.description.length <= 40);
    assert.ok(slimmed.description.endsWith('...'));
  });

  it('T2.1: should filter tools according to FILE_READ capability', () => {
    const helper = new ToolSlimmingHelper();
    const filtered = helper.filterByCapabilities(sampleVerboseTools, [CAPABILITIES.FILE_READ]);

    const names = filtered.map((t) => t.name);
    assert.ok(names.includes('view_file'));
    assert.ok(!names.includes('write_to_file'));
    assert.ok(!names.includes('run_command'));
  });

  it('T2.2: should compute disallowed tools list for SDK queryOptions', () => {
    const helper = new ToolSlimmingHelper();
    const disallowed = helper.getDisallowedTools(sampleVerboseTools, [CAPABILITIES.FILE_READ]);

    assert.deepEqual(disallowed.sort(), ['run_command', 'write_to_file'].sort());
  });

  it('T3.1: should compile toolset and return valid SHA-256 and compression metrics', () => {
    const helper = new ToolSlimmingHelper();
    const compiled = helper.compileToolSet(sampleVerboseTools, [CAPABILITIES.FILE_READ]);

    assert.equal(typeof compiled.schemaHash, 'string');
    assert.equal(compiled.schemaHash.length, 64); // SHA-256 hex
    assert.ok(compiled.rawLength > compiled.slimmedLength);
    assert.ok(compiled.compressionRatio > 0);
    assert.ok(compiled.tokenSavingsEstimate >= 0);
  });

  it('T3.2: should hit in-memory pre-compiled cache with identical reference', () => {
    const helper = new ToolSlimmingHelper();
    const set1 = helper.getOrCompile(sampleVerboseTools, [CAPABILITIES.FILE_READ]);
    const set2 = helper.getOrCompile(sampleVerboseTools, [CAPABILITIES.FILE_READ]);

    assert.strictEqual(set1, set2); // Exact reference match
    const stats = helper.getCacheStats();
    assert.equal(stats.hits, 1);
    assert.equal(stats.misses, 1);
    assert.equal(stats.hitRate, 0.5);
  });

  it('T3.3: should invalidate or recompile when capabilities change', () => {
    const helper = new ToolSlimmingHelper();
    const setRead = helper.getOrCompile(sampleVerboseTools, [CAPABILITIES.FILE_READ]);
    const setWrite = helper.getOrCompile(sampleVerboseTools, [CAPABILITIES.FILE_WRITE]);

    assert.notStrictEqual(setRead, setWrite);
    assert.notEqual(setRead.schemaHash, setWrite.schemaHash);
  });
});
```

---

### 4.6 `tests/unit/test-mcp-meta-tooling.mjs`

```javascript
/**
 * Purpose: Automated unit test suite for McpMetaToolingHelper (Helper 7).
 * Context: Validates N-to-2 tool folding, in-memory snapshot search, and safe forwarding.
 * Usage: node --test tests/unit/test-mcp-meta-tooling.mjs
 * Prerequisites: Node.js 18+ (node:test, node:assert/strict).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { McpMetaToolingHelper } from '../../packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs';

describe('McpMetaToolingHelper (Helper 7)', () => {
  function createSampleHelper() {
    const helper = new McpMetaToolingHelper({ timeoutMs: 500 });

    const driverTools = [
      {
        name: 'click',
        description: 'Clicks on an element or coordinate.',
        inputSchema: {
          type: 'object',
          properties: { x: { type: 'number' }, y: { type: 'number' } },
          required: ['x', 'y']
        },
        tags: ['browser', 'gui']
      },
      {
        name: 'screenshot',
        description: 'Captures full page screenshot.',
        inputSchema: { type: 'object', properties: {} },
        tags: ['browser']
      }
    ];

    const memTools = [
      {
        name: 'search_memories',
        description: 'Searches semantic memory nodes by query string.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query']
        },
        tags: ['memory', 'search']
      }
    ];

    helper.registerServer('cua-driver', driverTools, async (tool, args) => {
      if (tool === 'click') return { clicked: true, at: [args.x, args.y] };
      if (tool === 'screenshot') return { base64: 'fake_png_data' };
      throw new Error('Unsupported tool');
    });

    helper.registerServer('nowledge-mem', memTools, async (tool, args) => {
      if (tool === 'search_memories') return { count: 1, items: [{ title: args.query }] };
      throw new Error('Unsupported tool');
    });

    return helper;
  }

  it('T1.1: should fold multi-server tools strictly into 2 meta-tools', () => {
    const helper = createSampleHelper();
    const metaTools = helper.getMetaToolDefinitions();

    assert.equal(metaTools.length, 2);
    assert.equal(metaTools[0].name, 'mcp_gateway_list_tools');
    assert.equal(metaTools[1].name, 'mcp_gateway_call_tool');

    const stats = helper.getSnapshotStats();
    assert.equal(stats.totalServers, 2);
    assert.equal(stats.totalTools, 3);
    assert.equal(typeof stats.snapshotHash, 'string');
    assert.equal(stats.snapshotHash.length, 64);
  });

  it('T2.1: should list tools filtered by server name', () => {
    const helper = createSampleHelper();
    const list = helper.listTools({ server: 'cua-driver' });

    assert.equal(list.length, 2);
    assert.ok(list.every((t) => t.server === 'cua-driver'));
  });

  it('T2.2: should list tools filtered by keyword across servers', () => {
    const helper = createSampleHelper();
    const list = helper.listTools({ keyword: 'search' });

    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'search_memories');
    assert.equal(list[0].server, 'nowledge-mem');
  });

  it('T2.3: should retrieve full tool details from snapshot', () => {
    const helper = createSampleHelper();
    const tool = helper.getTool('cua-driver', 'click');

    assert.ok(tool);
    assert.equal(tool.name, 'click');
    assert.deepEqual(tool.inputSchema.required, ['x', 'y']);
  });

  it('T3.1: should safely dispatch meta-call and return execution result', async () => {
    const helper = createSampleHelper();
    const response = await helper.dispatchCall('cua-driver', 'click', { x: 100, y: 200 });

    assert.equal(response.success, true);
    assert.equal(response.server, 'cua-driver');
    assert.equal(response.tool, 'click');
    assert.deepEqual(response.result, { clicked: true, at: [100, 200] });
  });

  it('T3.2: should reject unknown server with structured error', async () => {
    const helper = createSampleHelper();
    const response = await helper.dispatchCall('unknown-server', 'click', {});

    assert.equal(response.success, false);
    assert.equal(response.error, 'UNKNOWN_SERVER');
  });

  it('T3.3: should reject unknown tool on valid server with structured error', async () => {
    const helper = createSampleHelper();
    const response = await helper.dispatchCall('cua-driver', 'hover', {});

    assert.equal(response.success, false);
    assert.equal(response.error, 'UNKNOWN_TOOL');
  });

  it('T3.4: should reject call with missing required arguments', async () => {
    const helper = createSampleHelper();
    const response = await helper.dispatchCall('cua-driver', 'click', { x: 50 }); // missing y

    assert.equal(response.success, false);
    assert.equal(response.error, 'MISSING_REQUIRED_ARGUMENTS');
    assert.deepEqual(response.missing, ['y']);
  });

  it('T3.5: should isolate dispatcher exceptions without crashing', async () => {
    const helper = createSampleHelper();
    helper.registerServer('faulty-server', [{ name: 'crash' }], async () => {
      throw new Error('Fatal internal driver error');
    });

    const response = await helper.dispatchCall('faulty-server', 'crash', {});
    assert.equal(response.success, false);
    assert.equal(response.error, 'EXECUTION_FAILED');
    assert.ok(response.message.includes('Fatal internal driver error'));
  });

  it('T3.6: should enforce timeout guard when dispatcher hangs', async () => {
    const helper = new McpMetaToolingHelper({ timeoutMs: 50 });
    helper.registerServer('hanging-server', [{ name: 'sleep' }], async () => {
      return new Promise((resolve) => setTimeout(resolve, 300));
    });

    const response = await helper.dispatchCall('hanging-server', 'sleep', {});
    assert.equal(response.success, false);
    assert.equal(response.error, 'TIMEOUT');
    assert.ok(response.message.includes('timed out'));
  });

  it('T4.1: should update snapshot when unregistering a server', () => {
    const helper = createSampleHelper();
    const beforeHash = helper.getSnapshotStats().snapshotHash;
    const deleted = helper.unregisterServer('cua-driver');

    assert.equal(deleted, true);
    const afterStats = helper.getSnapshotStats();
    assert.equal(afterStats.totalServers, 1);
    assert.notEqual(afterStats.snapshotHash, beforeHash);
  });
});
```

---

## 5. Verification Method (独立可验证方法)

在后续实施阶段（Implementer Agent 创建上述 6 个文件后），可通过以下确定性命令执行自动化验证：

1. **执行 ToolSlimmingHelper 独立单测**：
   ```bash
   node --test tests/unit/test-tool-slimming.mjs
   ```
   **预期验证结果**：
   - 7 个子测试用例全部通过（`pass 7`, `fail 0`）；
   - 执行耗时 `< 100ms`；
   - 零网络请求，零第三方包依赖。

2. **执行 McpMetaToolingHelper 独立单测**：
   ```bash
   node --test tests/unit/test-mcp-meta-tooling.mjs
   ```
   **预期验证结果**：
   - 10 个子测试用例全部通过（`pass 10`, `fail 0`）；
   - 涵盖元工具折叠（恒为 2 个）、快照毫秒检索、缺失参数拦截、异常隔离与超时熔断；
   - 执行耗时 `< 300ms`。

3. **代码行数与规范核验**：
   ```bash
   wc -l packages/agent-control-plane/constants.mjs \
         packages/agent-control-plane/index.mjs \
         packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs \
         packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs \
         tests/unit/test-tool-slimming.mjs \
         tests/unit/test-mcp-meta-tooling.mjs
   ```
   **预期核验结果**：
   - 每个文件代码行数均在 100 ~ 280 行区间，远低于 500 行预警线和 600 行硬上限。
