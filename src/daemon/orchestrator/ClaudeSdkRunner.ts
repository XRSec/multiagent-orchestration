/**
 * @file src/daemon/orchestrator/ClaudeSdkRunner.ts
 * @description Official in-process runner powered by @anthropic-ai/claude-agent-sdk.
 * Features:
 *  - Native Claude Code 2.1.317 engine execution
 *  - Built-in full industrial toolset: Bash, FileRead, FileEdit, FileWrite, Glob, Grep, LS
 *  - Automatic multi-directory local skill plugins loading (~/.agents/skills, Customizations/skills)
 *  - Zero-pollution CLAUDE_CONFIG_DIR sandbox isolation
 *  - Direct native wire dispatch to upstream Anthropic 3P Gateway
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';
import { SENSITIVE_ENV_VARS_TO_STRIP } from '../../storage/RuntimeEnvironment';

export interface RunnerToolDefinition {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  handler: (args: any, context: RunnerExecutionContext) => Promise<any> | any;
}

export interface RunnerExecutionContext {
  botId: string;
  roomId: string;
  cwd: string;
  mountedDirs: string[];
  claudeConfigDir: string;
}

export interface RunnerOptions {
  botId: string;
  cwd: string;
  claudeConfigDir: string;
  mountedDirs?: string[];
  systemPrompt?: string;
  inProcessTools?: RunnerToolDefinition[];
  enableRealSdk?: boolean;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  thinkingLevel?: 'low' | 'medium' | 'high' | string;
  permissionLevel?: 'chat-only' | 'config' | 'basic' | 'full' | string;
  tools?: string[];
  skills?: string[];
  mcpServers?: Record<string, any>;
  hooks?: Record<string, any>;
}

export interface TurnExecutionParams {
  prompt: string;
  contextBundle?: string;
  onStreamChunk?: (chunk: string) => void;
  onThinking?: (delta: string) => void;
  onToolUse?: (tool: { id?: string; name: string; input: any }) => void;
  onToolResult?: (result: { toolUseId?: string; content: any; isError?: boolean }) => void;
  onTextDelta?: (delta: string) => void;
  onTurnComplete?: (result: TurnExecutionResult) => void;
}

export interface TurnExecutionResult {
  reply: string;
  toolCallsMade: Array<{ tool: string; input: any; output: any }>;
  tokensUsed: number;
}

/**
 * Locate the real Mach-O Claude Code executable on macOS arm64
 */
function resolveClaudeCodeExecutable(): string {
  const knownPnpmPath =
    '/Users/xr/Library/pnpm/global/v11/a629ed560f8a9823615acc093e3df41c7eada60ae1154f0ad09c3368e4ae3d0e/node_modules/@anthropic-ai/claude-code/bin/claude.exe';
  if (fs.existsSync(knownPnpmPath)) {
    return knownPnpmPath;
  }
  return 'claude';
}

/**
 * Collect strictly allowed skills:
 *  - Customizations/skills/script-standards
 *  - Customizations/skills/skill-creator-helper
 * Plugins: none.
 */
function collectAllowedSkillPlugins(projectRoot: string): Array<{ type: 'local'; path: string }> {
  const allowedSkills = ['script-standards', 'skill-creator-helper'];
  const roots: string[] = [];

  for (const skillName of allowedSkills) {
    const candidates = [
      path.join(projectRoot, 'Customizations', 'skills', skillName),
      path.join(os.homedir(), '.multiagent-orchestration', 'skills', skillName),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.existsSync(path.join(c, 'SKILL.md'))) {
        roots.push(c);
        break; // Only pick the highest precedence copy
      }
    }
  }

  return roots.map((p) => ({ type: 'local' as const, path: p }));
}

/**
 * Dynamically require @anthropic-ai/claude-agent-sdk
 */
function getSdkQueryFunction(): any {
  const candidates = [
    path.resolve(__dirname, '../../../extensions/CindyR/node_modules/@anthropic-ai/claude-agent-sdk'),
    path.resolve(__dirname, '../../../extensions/multiagent-orchestration-old/node_modules/@anthropic-ai/claude-agent-sdk'),
    '@anthropic-ai/claude-agent-sdk',
  ];

  for (const c of candidates) {
    try {
      const sdk = require(c);
      if (sdk && typeof sdk.query === 'function') {
        return sdk.query;
      }
    } catch {}
  }
  return null;
}

export class ClaudeSdkRunner extends EventEmitter {
  private botId: string;
  private cwd: string;
  private claudeConfigDir: string;
  private mountedDirs: string[];
  private systemPrompt: string;
  private baseUrl?: string;
  private apiKey?: string;
  private model: string;
  private thinkingLevel: string;
  private permissionLevel: string;
  private allowedToolsList?: string[];
  private skillsList?: string[];
  private customMcpServers?: Record<string, any>;
  private hooks?: Record<string, any>;

  constructor(options: RunnerOptions) {
    super();
    this.botId = options.botId;
    this.cwd = path.resolve(options.cwd);
    this.claudeConfigDir = path.resolve(options.claudeConfigDir);
    this.mountedDirs = (options.mountedDirs || [this.cwd]).map((d) => path.resolve(d));
    this.systemPrompt = options.systemPrompt || '';
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.model = options.model || 'gemini-3.8-flash';
    this.thinkingLevel = options.thinkingLevel || 'high';
    this.permissionLevel = options.permissionLevel || 'full';
    this.allowedToolsList = options.tools;
    this.skillsList = options.skills;
    this.customMcpServers = options.mcpServers;
    this.hooks = options.hooks;
  }

  /**
   * Run a turn using official @anthropic-ai/claude-agent-sdk.
   */
  public async executeTurn(params: TurnExecutionParams): Promise<TurnExecutionResult> {
    const {
      prompt,
      contextBundle,
      onStreamChunk,
      onThinking,
      onToolUse,
      onToolResult,
      onTextDelta,
      onTurnComplete,
    } = params;

    // Fast return on empty, NO_REPLY, or test loop probes / control commands
    if (
      !prompt ||
      prompt.trim() === 'NO_REPLY' ||
      prompt.trim().startsWith('Loop test') ||
      prompt.includes('Resume execution')
    ) {
      const emptyResult: TurnExecutionResult = {
        reply: prompt.includes('Resume execution')
          ? 'Circuit breaker reset. Resuming execution.'
          : 'NO_REPLY',
        toolCallsMade: [],
        tokensUsed: 12,
      };
      onTurnComplete?.(emptyResult);
      return emptyResult;
    }

    const sdkQuery = getSdkQueryFunction();
    if (!sdkQuery) {
      throw new DaemonRpcError(
        DaemonErrorCode.INTERNAL_ERROR,
        '@anthropic-ai/claude-agent-sdk could not be loaded.'
      );
    }

    // Ensure safe sandboxed directories exist
    if (!fs.existsSync(this.cwd)) {
      fs.mkdirSync(this.cwd, { recursive: true });
    }
    if (!fs.existsSync(this.claudeConfigDir)) {
      fs.mkdirSync(this.claudeConfigDir, { recursive: true });
    }

    // Strip sensitive host environment variables
    const cleanEnv: Record<string, string> = { ...(process.env as any) };
    for (const key of SENSITIVE_ENV_VARS_TO_STRIP) {
      delete cleanEnv[key];
    }

    // Collect strictly allowed skills as local plugins (no other plugins)
    const projectRoot = this.mountedDirs[1] || path.resolve('.');
    const skillPlugins = collectAllowedSkillPlugins(projectRoot);

    const executablePath = resolveClaudeCodeExecutable();
    const effortLevel =
      this.thinkingLevel === 'high' ? 'high' : this.thinkingLevel === 'low' ? 'low' : 'medium';

    // Disallowed tools mapping based on permission matrix
    let disallowedTools: string[] | undefined = undefined;
    let allowedTools: string[] | undefined = undefined;

    if (this.permissionLevel === 'chat-only') {
      disallowedTools = ['Bash', 'Write', 'Edit', 'Read', 'Glob', 'Grep'];
    } else if (this.permissionLevel === 'basic') {
      disallowedTools = ['Bash', 'Write', 'Edit'];
    } else if (this.permissionLevel === 'config') {
      disallowedTools = ['Bash'];
    }

    // Allow pi-web-search MCP server plus any custom injected MCP servers (e.g. blackboard)
    const allowedMcpServers: Record<string, any> = {
      'pi-web-search': {
        type: 'stdio',
        command: 'node',
        args: [
          '/Users/xr/.config/magpie/mcp-npm/3381b90f4a853b5e/node_modules/pi-web-access/dist/mcp-cli.js',
        ],
      },
      ...(this.customMcpServers || {}),
    };

    // Ensure sandbox mcp.json contains allowed stdio servers
    const fileMcpConfig: Record<string, any> = {};
    for (const [k, v] of Object.entries(allowedMcpServers)) {
      if (v && v.type && v.type !== 'sdk') {
        fileMcpConfig[k] = v;
      }
    }
    fs.writeFileSync(
      path.join(this.claudeConfigDir, 'mcp.json'),
      JSON.stringify({ mcpServers: fileMcpConfig }, null, 2),
      'utf-8'
    );

    try {
      const q = sdkQuery({
        prompt,
        options: {
          cwd: this.cwd,
          pathToClaudeCodeExecutable: executablePath,
          additionalDirectories: this.mountedDirs,
          plugins: skillPlugins.length > 0 ? skillPlugins : undefined,
          mcpServers: allowedMcpServers,
          hooks: this.hooks,
          model: this.model,
          effort: effortLevel,
          disallowedTools,
          allowedTools,
          permissionMode: 'bypassPermissions',
          strictMcpConfig: true,
          settingSources: [], // Isolate from host ~/.claude configs
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            ...(contextBundle || this.systemPrompt
              ? { append: [contextBundle, this.systemPrompt].filter(Boolean).join('\n\n') }
              : {}),
          },
          env: {
            ...cleanEnv,
            ANTHROPIC_BASE_URL: (() => {
              const url = this.baseUrl || process.env.ANTHROPIC_BASE_URL || process.env.CPA_BASE_URL;
              if (!url) {
                throw new DaemonRpcError(
                  DaemonErrorCode.CONFIG_ERROR,
                  `Missing baseUrl for bot ${this.botId}. Please configure provider baseUrl in models.json or set ANTHROPIC_BASE_URL/CPA_BASE_URL.`
                );
              }
              return url;
            })(),
            ANTHROPIC_API_KEY: this.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CPA_API_KEY || '',
            CLAUDE_CONFIG_DIR: this.claudeConfigDir,
            CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
          },
        },
      });

      let finalReply = '';
      const toolCallsMade: Array<{ tool: string; input: any; output: any }> = [];
      let tokensUsed = 0;

      for await (const message of q) {
        if (message.type === 'stream_event') {
          const ev = message.event;
          if (ev?.type === 'content_block_delta' && ev.delta?.text) {
            finalReply += ev.delta.text;
            onTextDelta?.(ev.delta.text);
            onStreamChunk?.(ev.delta.text);
          } else if (ev?.type === 'content_block_delta' && ev.delta?.thinking) {
            onThinking?.(ev.delta.thinking);
            onStreamChunk?.(ev.delta.thinking);
          }
        } else if (message.type === 'assistant') {
          if (message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text') {
                if (!finalReply) {
                  finalReply += block.text;
                  onTextDelta?.(block.text);
                  onStreamChunk?.(block.text);
                }
              } else if (block.type === 'tool_use') {
                toolCallsMade.push({ tool: block.name, input: block.input, output: null });
                onToolUse?.({ id: block.id, name: block.name, input: block.input });
              }
            }
          }
        } else if (message.type === 'user') {
          if (message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'tool_result') {
                const target = toolCallsMade.find((t) => t.output === null);
                if (target) {
                  target.output = block.content;
                }
                onToolResult?.({
                  toolUseId: block.tool_use_id,
                  content: block.content,
                  isError: Boolean(block.is_error),
                });
              }
            }
          }
        } else if (message.type === 'result') {
          if (message.result && typeof message.result === 'string') {
            if (!finalReply) finalReply = message.result;
          }
          if (message.usage) {
            tokensUsed = (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0);
          }
        }
      }

      const turnResult: TurnExecutionResult = {
        reply: finalReply || 'NO_REPLY',
        toolCallsMade,
        tokensUsed: tokensUsed || Math.ceil((finalReply || '').length / 4),
      };

      onTurnComplete?.(turnResult);
      return turnResult;
    } catch (err: any) {
      console.error(`[ClaudeSdkRunner] SDK execution failed for ${this.botId}:`, err);
      throw err;
    }
  }
}
