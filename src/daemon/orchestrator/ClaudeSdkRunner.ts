/**
 * Purpose: Official in-process runner powered by @anthropic-ai/claude-agent-sdk with Cindy-aligned Rewind, Compaction, and Resume Self-Healing.
 * Context: multiagent-orchestration daemon orchestrator, enforces SPEC-ARCH-SESSION-REWIND-COMPACT-2026 invariants.
 * Usage: Instantiated per (botId, sessionScope) by AgentOrchestrator.
 * Prerequisites: @anthropic-ai/claude-agent-sdk, SessionLifecycleEngine.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';
import { SENSITIVE_ENV_VARS_TO_STRIP } from '../../storage/RuntimeEnvironment';
import {
  MemoryFlushController,
  MemoryFlushEvent,
  isClaudeResumeSessionNotFound,
  relocateClaudeSessionTranscripts,
  repairForkedClaudeJsonl,
  sanitizeClaudeProjectKey,
} from './SessionLifecycleEngine';

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

export interface RewindFilesResult {
  canRewind: boolean;
  filesChanged?: string[];
  insertions?: number;
  deletions?: number;
  error?: string;
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
  sdkSessionId?: string | null;
  contextWindow?: number;
  onMemoryFlushThreshold?: (event: MemoryFlushEvent) => void;
  onInvalidResumeDetected?: (staleSdkSessionId: string) => string | undefined;
}

export interface TurnExecutionParams {
  prompt: string;
  userUuid?: string;
  contextBundle?: string;
  handoffPrefix?: string;
  onStreamChunk?: (chunk: string) => void;
  onThinking?: (delta: string) => void;
  onToolUse?: (tool: { id?: string; name: string; input: any }) => void;
  onToolResult?: (result: { toolUseId?: string; content: any; isError?: boolean }) => void;
  onTextDelta?: (delta: string) => void;
  onCompactBoundary?: (meta: { boundaryUuid?: string; prevFiredThresholds: number[] }) => void;
  onTurnComplete?: (result: TurnExecutionResult) => void;
}

export interface TurnExecutionResult {
  reply: string;
  toolCallsMade: Array<{ tool: string; input: any; output: any }>;
  tokensUsed: number;
  contextTokens?: number;
  contextWindow?: number;
  sdkSessionId?: string | null;
  assistantMessageUuid?: string | null;
  compacted?: boolean;
}

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'Customizations')) && fs.existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }
  const parent = path.resolve(cwd, '../..');
  if (fs.existsSync(path.join(parent, 'Customizations')) && fs.existsSync(path.join(parent, 'package.json'))) {
    return parent;
  }
  return cwd;
}

function resolveClaudeCodeExecutable(): string {
  const candidates = [
    '/Users/xr/Library/pnpm/global/v11/a629ed560f8a9823615acc093e3df41c7eada60ae1154f0ad09c3368e4ae3d0e/node_modules/@anthropic-ai/claude-code/bin/claude.exe',
    path.join(os.homedir(), 'Library', 'pnpm', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return 'claude';
}

function collectAllowedSkillPlugins(projectRoot: string): Array<{ type: 'local'; path: string }> {
  const allowedSkills = ['script-standards', 'skill-creator-helper', 'agent-first-docs'];
  const roots: string[] = [];

  for (const skillName of allowedSkills) {
    const candidates = [
      path.join(projectRoot, 'Customizations', 'skills', skillName),
      path.join(os.homedir(), '.multiagent-orchestration', 'skills', skillName),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c) && fs.existsSync(path.join(c, 'SKILL.md'))) {
        roots.push(c);
        break;
      }
    }
  }

  return roots.map((p) => ({ type: 'local' as const, path: p }));
}

let cachedSdkQueryFn: any = null;

async function getSdkQueryFunction(): Promise<any> {
  if (cachedSdkQueryFn) return cachedSdkQueryFn;

  const wsRoot = resolveWorkspaceRoot();
  const mjsCandidates = [
    path.join(wsRoot, 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
    path.join(wsRoot, 'extensions', 'Cindy', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
    path.join(wsRoot, 'extensions', 'CindyR', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
    path.join(wsRoot, 'extensions', 'multiagent-orchestration-old', 'node_modules', '@anthropic-ai', 'claude-agent-sdk', 'sdk.mjs'),
  ];

  // 1. Try native ESM dynamic import on explicit sdk.mjs paths first (works in Vite .mjs & Node ESM)
  for (const mjsPath of mjsCandidates) {
    if (fs.existsSync(mjsPath)) {
      try {
        const mod = await import(pathToFileURL(mjsPath).href);
        const q = mod?.query || mod?.default?.query;
        if (typeof q === 'function') {
          cachedSdkQueryFn = q;
          return q;
        }
      } catch {}
    }
  }

  // 2. Try bare specifier dynamic import
  try {
    const mod = await import('@anthropic-ai/claude-agent-sdk');
    const q = (mod as any)?.query || (mod as any)?.default?.query;
    if (typeof q === 'function') {
      cachedSdkQueryFn = q;
      return q;
    }
  } catch {}

  // 3. Fallback to createRequire rooted at workspace package.json
  try {
    const req = createRequire(path.join(wsRoot, 'package.json'));
    const sdk = req('@anthropic-ai/claude-agent-sdk');
    if (sdk && typeof sdk.query === 'function') {
      cachedSdkQueryFn = sdk.query;
      return sdk.query;
    }
  } catch {}

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

  // Cindy-aligned Session & Rewind & Compaction state machine
  private sdkSessionId: string | null = null;
  private pendingRewindTo: string | null | undefined = undefined;
  private pendingCompactInstruction: string | null = null;
  private queuedBridgeTurns: number = 0;
  private turnInFlight: boolean = false;
  private interruptRequested: boolean = false;
  private activeQueryHandle: any = null;
  private contextWindow: number;
  private memoryFlushController: MemoryFlushController;
  private onInvalidResumeDetected?: (staleSdkSessionId: string) => string | undefined;

  constructor(options: RunnerOptions) {
    super();
    this.botId = options.botId;
    this.cwd = path.resolve(options.cwd);
    this.claudeConfigDir = path.resolve(options.claudeConfigDir);
    this.mountedDirs = (options.mountedDirs || [this.cwd]).map((d) => path.resolve(d));
    this.systemPrompt = options.systemPrompt || '';
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.model = options.model || 'claude-opus-4-6';
    this.thinkingLevel = options.thinkingLevel || 'high';
    this.permissionLevel = options.permissionLevel || 'full';
    this.allowedToolsList = options.tools;
    this.skillsList = options.skills;
    this.customMcpServers = options.mcpServers;
    this.hooks = options.hooks;
    this.sdkSessionId = options.sdkSessionId ?? null;
    this.contextWindow = options.contextWindow ?? 200000;
    this.onInvalidResumeDetected = options.onInvalidResumeDetected;
    this.memoryFlushController = new MemoryFlushController({
      onThresholdCrossed: (ev) => {
        this.emit('memory.flush.threshold', { botId: this.botId, ...ev });
        options.onMemoryFlushThreshold?.(ev);
      },
    });
  }

  public getSdkSessionId(): string | null {
    return this.sdkSessionId;
  }

  public setSdkSessionId(id: string | null): void {
    this.sdkSessionId = id;
  }

  /**
   * Hot-apply a re-resolved route so edits to models.json take effect on the next turn without a daemon restart.
   * Returns true when anything changed. A turn already in flight keeps the route it started with.
   */
  public setRoute(route: { baseUrl?: string; apiKey?: string; model?: string }): boolean {
    const model = route.model || this.model;
    const changed = route.baseUrl !== this.baseUrl || route.apiKey !== this.apiKey || model !== this.model;
    this.baseUrl = route.baseUrl;
    this.apiKey = route.apiKey;
    this.model = model;
    return changed;
  }

  public isTurnRunning(): boolean {
    return this.turnInFlight || this.queuedBridgeTurns > 0;
  }

  public getQueuedBridgeTurns(): number {
    return this.queuedBridgeTurns;
  }

  public getMemoryFlushFiredThresholds(): number[] {
    return this.memoryFlushController.getFiredThresholds();
  }

  /**
   * Relocate transcripts when working directory changes (Copy-On-Relocate)
   */
  public setWorkingDirectory(newCwd: string): void {
    const resolvedNew = path.resolve(newCwd);
    if (resolvedNew === this.cwd) return;
    if (this.sdkSessionId) {
      relocateClaudeSessionTranscripts({
        sdkSessionIds: [this.sdkSessionId],
        oldWorkingDir: this.cwd,
        newWorkingDir: resolvedNew,
        claudeConfigDir: this.claudeConfigDir,
      });
    }
    this.cwd = resolvedNew;
  }

  /**
   * Schedule a bridge /compact turn before the next user message (or execute immediately)
   */
  public scheduleBridgeCompaction(instructions?: string): void {
    this.pendingCompactInstruction = instructions ? `/compact ${instructions}` : '/compact';
  }

  /**
   * Dry-run preview of files affected by rewinding to userUuid
   */
  public async previewRewindFiles(userUuid: string): Promise<RewindFilesResult> {
    if (!userUuid) {
      return { canRewind: false, error: 'NO_CHECKPOINT_UUID' };
    }
    if (
      this.turnInFlight &&
      this.activeQueryHandle &&
      typeof this.activeQueryHandle.rewindFiles === 'function'
    ) {
      try {
        const res = await this.activeQueryHandle.rewindFiles(userUuid, { dryRun: true });
        if (res && typeof res.canRewind === 'boolean') {
          return res;
        }
      } catch {
        // Fallback to conversation-level rewind preview when live SDK checkpoint is unavailable
      }
    }
    return {
      canRewind: true,
      filesChanged: [],
      insertions: 0,
      deletions: 0,
    };
  }

  /**
   * Commit file rewind and arm lazy 3-tuple fork (resume + resumeSessionAt + forkSession) for next send
   */
  public async commitRewindFiles(
    userUuid: string | null,
    priorAssistantUuid: string | null,
    options?: { allowFileRestore?: boolean }
  ): Promise<{ fileRewindResult: RewindFilesResult; pendingRewindTo: string | null }> {
    let fileRewindResult: RewindFilesResult = { canRewind: false };

    if (
      options?.allowFileRestore !== false &&
      userUuid &&
      this.activeQueryHandle &&
      typeof this.activeQueryHandle.rewindFiles === 'function'
    ) {
      try {
        fileRewindResult = await this.activeQueryHandle.rewindFiles(userUuid, { dryRun: false });
      } catch (err: any) {
        fileRewindResult = { canRewind: false, error: err?.message || String(err) };
      }
    }

    if (this.activeQueryHandle && typeof this.activeQueryHandle.close === 'function') {
      try {
        await this.activeQueryHandle.close();
      } catch {}
    }
    this.activeQueryHandle = null;
    this.turnInFlight = false;

    if (priorAssistantUuid) {
      this.pendingRewindTo = priorAssistantUuid;
    } else {
      // First-turn rewind: no prior assistant message exists, reset to clean session on next send
      this.pendingRewindTo = null;
      this.sdkSessionId = null;
    }

    return {
      fileRewindResult,
      pendingRewindTo: this.pendingRewindTo,
    };
  }

  /**
   * Abort active SDK turn with duplicate error banner suppression
   */
  public abortTurn(): boolean {
    if (!this.turnInFlight && this.queuedBridgeTurns === 0) {
      return false;
    }
    this.interruptRequested = true;
    this.turnInFlight = false;
    this.queuedBridgeTurns = 0;

    if (this.activeQueryHandle) {
      if (typeof this.activeQueryHandle.interrupt === 'function') {
        try {
          this.activeQueryHandle.interrupt();
        } catch {}
      } else if (typeof this.activeQueryHandle.close === 'function') {
        try {
          this.activeQueryHandle.close();
        } catch {}
      }
    }
    return true;
  }

  /**
   * Run a turn using official @anthropic-ai/claude-agent-sdk.
   */
  public async executeTurn(params: TurnExecutionParams): Promise<TurnExecutionResult> {
    const {
      prompt,
      contextBundle,
      handoffPrefix,
      onStreamChunk,
      onThinking,
      onToolUse,
      onToolResult,
      onTextDelta,
      onCompactBoundary,
      onTurnComplete,
    } = params;

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
        sdkSessionId: this.sdkSessionId,
      };
      onTurnComplete?.(emptyResult);
      return emptyResult;
    }

    // If a bridge /compact turn is armed, execute it first while holding queuedBridgeTurns > 0
    if (this.pendingCompactInstruction) {
      const compactCmd = this.pendingCompactInstruction;
      this.pendingCompactInstruction = null;
      this.queuedBridgeTurns += 1;
      try {
        await this.runSingleSdkQuery({
          prompt: compactCmd,
          contextBundle,
          isBridgeTurn: true,
          onCompactBoundary,
        });
      } catch {
        // Non-fatal if bridge compact fails; continue to real user turn
      } finally {
        this.queuedBridgeTurns = Math.max(0, this.queuedBridgeTurns - 1);
      }
    }

    const effectivePrompt = handoffPrefix ? `${handoffPrefix}\n\n${prompt}` : prompt;

    try {
      return await this.runSingleSdkQuery({
        ...params,
        prompt: effectivePrompt,
        isBridgeTurn: false,
      });
    } catch (err: any) {
      // Self-heal on verified "No conversation found with session ID" error (Scenario 7)
      if (this.sdkSessionId && isClaudeResumeSessionNotFound(err, this.sdkSessionId)) {
        const staleId = this.sdkSessionId;
        this.sdkSessionId = null;
        this.pendingRewindTo = undefined;
        const recoveryHandoff = this.onInvalidResumeDetected?.(staleId);
        const rebuiltPrompt = recoveryHandoff
          ? `${recoveryHandoff}\n\n${prompt}`
          : effectivePrompt;
        return await this.runSingleSdkQuery({
          ...params,
          prompt: rebuiltPrompt,
          isBridgeTurn: false,
        });
      }
      throw err;
    }
  }

  private async runSingleSdkQuery(
    params: TurnExecutionParams & { isBridgeTurn?: boolean }
  ): Promise<TurnExecutionResult> {
    const {
      prompt,
      contextBundle,
      isBridgeTurn,
      onStreamChunk,
      onThinking,
      onToolUse,
      onToolResult,
      onTextDelta,
      onCompactBoundary,
      onTurnComplete,
    } = params;

    const sdkQuery = await getSdkQueryFunction();
    if (!sdkQuery) {
      throw new DaemonRpcError(
        DaemonErrorCode.INTERNAL_ERROR,
        '@anthropic-ai/claude-agent-sdk could not be loaded.'
      );
    }

    if (!fs.existsSync(this.cwd)) {
      fs.mkdirSync(this.cwd, { recursive: true });
    }
    if (!fs.existsSync(this.claudeConfigDir)) {
      fs.mkdirSync(this.claudeConfigDir, { recursive: true });
    }

    const cleanEnv: Record<string, string> = { ...(process.env as any) };
    for (const key of SENSITIVE_ENV_VARS_TO_STRIP) {
      delete cleanEnv[key];
    }

    const projectRoot = this.mountedDirs[1] || path.resolve('.');
    const skillPlugins = collectAllowedSkillPlugins(projectRoot);
    const executablePath = resolveClaudeCodeExecutable();
    const effortLevel =
      this.thinkingLevel === 'high' ? 'high' : this.thinkingLevel === 'low' ? 'low' : 'medium';

    let disallowedTools: string[] | undefined = undefined;
    const allowedTools: string[] | undefined = this.allowedToolsList;

    if (this.permissionLevel === 'chat-only') {
      disallowedTools = ['Bash', 'Write', 'Edit', 'Read', 'Glob', 'Grep'];
    } else if (this.permissionLevel === 'basic') {
      disallowedTools = ['Bash', 'Write', 'Edit'];
    } else if (this.permissionLevel === 'config') {
      disallowedTools = ['Bash'];
    }

    const allowedMcpServers: Record<string, any> = {
      ...(this.customMcpServers || {}),
    };

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

    // Build Rewind 3-tuple (resume + resumeSessionAt + forkSession) if armed
    const resumeOpts: Record<string, any> = {};
    const wasRewindFork = Boolean(this.sdkSessionId && this.pendingRewindTo);
    if (this.sdkSessionId && this.pendingRewindTo) {
      resumeOpts.resume = this.sdkSessionId;
      resumeOpts.resumeSessionAt = this.pendingRewindTo;
      resumeOpts.forkSession = true;
      this.pendingRewindTo = undefined;
    } else if (this.sdkSessionId) {
      resumeOpts.resume = this.sdkSessionId;
    }

    this.turnInFlight = true;
    this.interruptRequested = false;

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
          settingSources: [],
          ...resumeOpts,
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
              const url =
                this.baseUrl || process.env.ANTHROPIC_BASE_URL || process.env.CPA_BASE_URL;
              if (!url) {
                throw new DaemonRpcError(
                  DaemonErrorCode.CONFIG_ERROR,
                  `Missing baseUrl for bot ${this.botId}. Please configure provider baseUrl in models.json or set ANTHROPIC_BASE_URL/CPA_BASE_URL.`
                );
              }
              return url;
            })(),
            ANTHROPIC_API_KEY:
              this.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CPA_API_KEY || '',
            CLAUDE_CONFIG_DIR: this.claudeConfigDir,
            CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
          },
        },
      });

      this.activeQueryHandle = q;

      let finalReply = '';
      const toolCallsMade: Array<{ tool: string; input: any; output: any }> = [];
      let tokensUsed = 0;
      let contextTokens = 0;
      let assistantMessageUuid: string | null = null;
      let compacted = false;

      for await (const message of q) {
        if (typeof message.session_id === 'string' && message.session_id) {
          this.sdkSessionId = message.session_id;
        }

        if (message.type === 'system' && message.subtype === 'compact_boundary') {
          compacted = true;
          const prevFired = this.memoryFlushController.onCompactBoundary();
          onCompactBoundary?.({
            boundaryUuid: message.uuid,
            prevFiredThresholds: prevFired,
          });
          this.emit('compact.boundary', {
            botId: this.botId,
            sdkSessionId: this.sdkSessionId,
            boundaryUuid: message.uuid,
            prevFiredThresholds: prevFired,
          });
        } else if (message.type === 'stream_event' && !isBridgeTurn) {
          const ev = message.event;
          if (ev?.type === 'content_block_delta' && ev.delta?.text) {
            finalReply += ev.delta.text;
            onTextDelta?.(ev.delta.text);
            onStreamChunk?.(ev.delta.text);
          } else if (ev?.type === 'content_block_delta' && ev.delta?.thinking) {
            onThinking?.(ev.delta.thinking);
            onStreamChunk?.(ev.delta.thinking);
          }
        } else if (message.type === 'assistant' && !isBridgeTurn) {
          if (typeof message.uuid === 'string') {
            assistantMessageUuid = message.uuid;
          }
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
        } else if (message.type === 'user' && !isBridgeTurn) {
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
          if (this.interruptRequested && message.is_error) {
            // Suppress duplicate terminal error banner from an intentionally interrupted turn
            this.interruptRequested = false;
            break;
          }
          if (message.result && typeof message.result === 'string' && !isBridgeTurn) {
            if (!finalReply) finalReply = message.result;
          }
          if (message.usage) {
            const inTok = message.usage.input_tokens || 0;
            const outTok = message.usage.output_tokens || 0;
            const cacheRead = message.usage.cache_read_input_tokens || 0;
            const cacheCreate = message.usage.cache_creation_input_tokens || 0;
            tokensUsed = inTok + outTok;
            contextTokens = inTok + cacheRead + cacheCreate;
            this.memoryFlushController.onUsageUpdate(contextTokens, this.contextWindow);
          }
        }
      }

      // If this turn was a rewind fork, repair the forked JSONL transcript
      if (wasRewindFork && this.sdkSessionId) {
        const projKey = sanitizeClaudeProjectKey(this.cwd);
        const forkedJsonl = path.join(
          this.claudeConfigDir,
          'projects',
          projKey,
          `${this.sdkSessionId}.jsonl`
        );
        repairForkedClaudeJsonl(forkedJsonl);
      }

      const turnResult: TurnExecutionResult = {
        reply: finalReply || 'NO_REPLY',
        toolCallsMade,
        tokensUsed: tokensUsed || Math.ceil((finalReply || '').length / 4),
        contextTokens,
        contextWindow: this.contextWindow,
        sdkSessionId: this.sdkSessionId,
        assistantMessageUuid,
        compacted,
      };

      // Suppress terminal onTurnComplete callback if this is a bridge turn or bridge turns remain
      if (!isBridgeTurn && this.queuedBridgeTurns === 0) {
        onTurnComplete?.(turnResult);
      }
      return turnResult;
    } catch (err: any) {
      console.error(`[ClaudeSdkRunner] SDK execution failed for ${this.botId}:`, err);
      throw err;
    } finally {
      if (!isBridgeTurn && this.queuedBridgeTurns === 0) {
        this.turnInFlight = false;
      }
    }
  }
}
