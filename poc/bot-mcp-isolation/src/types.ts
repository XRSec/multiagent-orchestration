/**
 * Types and interfaces for Bot MCP Tools and Plugins Isolation PoC
 */

export interface McpServerConfigEntry {
  name: string;
  type: 'in-process' | 'sdk' | 'stdio' | 'http';
  description?: string;
  tools?: string[];
  endpointUrl?: string;
  command?: string;
  args?: string[];
}

export interface BotPluginDefinition {
  id: string;
  name: string;
  version: string;
  rootPath: string;
  skills: Array<{
    name: string;
    description: string;
    entryFile: string;
  }>;
}

export interface BotConfig {
  botId: string;
  botName: string;
  description: string;
  mcpPolicy: {
    mode: 'whitelist' | 'strict';
    allowedServers: string[];
  };
  pluginPolicy: {
    allowedPlugins: string[];
    pluginRoots: string[];
  };
  systemPrompt?: string;
}

export interface BotRuntimeOptions {
  botId: string;
  baseSandboxDir?: string;
  configPath?: string;
  isolatedWorkingDir?: string;
}

export interface BotRuntimeEnv {
  botId: string;
  claudeConfigDir: string;
  workingDir: string;
  strictMcpConfig: boolean;
  settingSources: string[];
  env: Record<string, string>;
}

export interface ToolCallRequest {
  serverName: string;
  toolName: string;
  args?: Record<string, unknown>;
}

export interface ToolCallResponse {
  success: boolean;
  serverName: string;
  toolName: string;
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

export interface ToolInfo {
  name: string;
  serverName: string;
  description?: string;
  inputSchema?: unknown;
}

export interface HostIsolationCheckResult {
  hostClaudeDir: string;
  hostDirExisted: boolean;
  hostDirTouched: boolean;
  hostFilesModified: string[];
  readViolations: string[];
  writeViolations: string[];
  isFullyIsolated: boolean;
}
