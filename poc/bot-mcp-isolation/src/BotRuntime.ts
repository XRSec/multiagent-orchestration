import fs from 'node:fs';
import path from 'node:path';
import type {
  BotConfig,
  BotPluginDefinition,
  BotRuntimeEnv,
  ToolCallResponse,
  ToolInfo,
} from './types.js';
import { McpIsolationManager } from './McpIsolationManager.js';
import { BaseMcpServer } from './mcp-servers/BaseMcpServer.js';

export class McpAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpAccessDeniedError';
  }
}

export class ToolNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolNotFoundError';
  }
}

export class BotRuntime {
  public readonly botConfig: BotConfig;
  private readonly isolationManager: McpIsolationManager;
  private runtimeEnv: BotRuntimeEnv | null = null;
  private activeServers: Map<string, BaseMcpServer> = new Map();
  private loadedPlugins: BotPluginDefinition[] = [];
  private isRunning = false;

  constructor(botConfig: BotConfig, isolationManager?: McpIsolationManager) {
    this.botConfig = botConfig;
    this.isolationManager = isolationManager || new McpIsolationManager();
  }

  /**
   * Initializes sandbox, validates isolation boundaries, and boots authorized MCP servers.
   */
  public async start(availableServerFactories: Record<string, () => BaseMcpServer>): Promise<void> {
    if (this.isRunning) return;

    // 1. Prepare isolated sandbox topology
    const sandbox = this.isolationManager.prepareBotSandbox(this.botConfig);

    // 2. Build isolated execution environment with dynamic CLAUDE_CONFIG_DIR
    this.runtimeEnv = this.isolationManager.buildRuntimeEnv(
      this.botConfig,
      sandbox.claudeConfigDir,
      sandbox.workingDir
    );

    // 3. Filter MCP servers using whitelist policy
    const candidateNames = Object.keys(availableServerFactories);
    const allowedNames = this.isolationManager.filterAllowedServers(this.botConfig, candidateNames);

    // 4. Instantiate and start only allowed servers
    for (const name of allowedNames) {
      const factory = availableServerFactories[name];
      if (factory) {
        const server = factory();
        await server.start();
        this.activeServers.set(name, server);
      }
    }

    // 5. Discover and load bot-specific plugins
    this.loadedPlugins = this.isolationManager.loadBotPlugins(this.botConfig);

    this.isRunning = true;
  }

  /**
   * Returns the runtime environment configuration.
   */
  public getRuntimeEnv(): BotRuntimeEnv {
    if (!this.runtimeEnv) {
      throw new Error(`BotRuntime [${this.botConfig.botId}] is not started.`);
    }
    return this.runtimeEnv;
  }

  /**
   * Lists all MCP tools currently available and visible to this Bot.
   */
  public async listAvailableTools(): Promise<ToolInfo[]> {
    if (!this.isRunning) {
      throw new Error(`BotRuntime [${this.botConfig.botId}] is not started.`);
    }

    const allTools: ToolInfo[] = [];
    for (const server of this.activeServers.values()) {
      const tools = await server.listTools();
      allTools.push(...tools);
    }
    return allTools;
  }

  /**
   * Lists all plugins mounted for this Bot.
   */
  public listAvailablePlugins(): BotPluginDefinition[] {
    return [...this.loadedPlugins];
  }

  /**
   * Executes a tool with strict isolation boundary checking.
   */
  public async callTool(serverName: string, toolName: string, args?: Record<string, unknown>): Promise<ToolCallResponse> {
    if (!this.isRunning) {
      throw new Error(`BotRuntime [${this.botConfig.botId}] is not started.`);
    }

    // Check 1: Is this server authorized for this Bot?
    if (!this.botConfig.mcpPolicy.allowedServers.includes(serverName)) {
      throw new McpAccessDeniedError(
        `[Isolation Boundary Violation]: Bot "${this.botConfig.botId}" is NOT authorized to access MCP server "${serverName}". Allowed servers: [${this.botConfig.mcpPolicy.allowedServers.join(', ')}]`
      );
    }

    // Check 2: Is the server actively running?
    const server = this.activeServers.get(serverName);
    if (!server) {
      throw new McpAccessDeniedError(
        `[Isolation Boundary Violation]: MCP server "${serverName}" is not running or not mounted in Bot "${this.botConfig.botId}".`
      );
    }

    // Check 3: Check if the tool exists on this server
    const tools = await server.listTools();
    const hasTool = tools.some((t) => t.name === toolName);
    if (!hasTool) {
      throw new ToolNotFoundError(
        `Tool "${toolName}" not found on server "${serverName}". Available tools: [${tools.map((t) => t.name).join(', ')}]`
      );
    }

    // Execute via standard MCP JSON-RPC protocol
    return await server.callTool(toolName, args);
  }

  /**
   * Writes a bot artifact into the isolated CLAUDE_CONFIG_DIR to demonstrate sandbox persistence.
   * Enforces sandbox containment to prevent path traversal escape into peer bot or host directories.
   */
  public writeConfigArtifact(relativePath: string, content: string): string {
    const env = this.getRuntimeEnv();
    const configRoot = path.resolve(env.claudeConfigDir);
    let fullPath = path.resolve(configRoot, relativePath);
    const rootWithSep = configRoot.endsWith(path.sep) ? configRoot : configRoot + path.sep;

    // Enforce sandbox containment: if relativePath attempts to escape, confine write strictly inside configRoot
    if (!fullPath.startsWith(rootWithSep) && fullPath !== configRoot) {
      const safeRelative = relativePath.replace(/^(\.\.[\/\\])+/, '').replace(/[^a-zA-Z0-9_.\-\/\\]/g, '_');
      const safeFileName = path.basename(safeRelative) || 'artifact.json';
      fullPath = path.resolve(configRoot, safeFileName);
    }

    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf-8');
    return fullPath;
  }

  /**
   * Cleanly terminates the Bot runtime and its MCP servers.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    for (const server of this.activeServers.values()) {
      await server.stop();
    }
    this.activeServers.clear();
    this.loadedPlugins = [];
    this.isRunning = false;
  }
}
