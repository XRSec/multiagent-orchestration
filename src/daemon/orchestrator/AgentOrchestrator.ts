/**
 * Purpose: Unified multi-agent orchestration engine integrating Single-Speaker protocol, Blackboard SSOT, Two-Phase Rewind, and Compaction governance.
 * Context: Primary execution spine (GatewayServer -> DaemonServer -> AgentOrchestrator -> ClaudeSdkRunner).
 * Usage: Instantiated by DaemonServer or standalone test harnesses.
 * Prerequisites: StorageManager, RuntimeEnvironment, ClaudeSdkRunner, BlackboardStore.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import {
  StorageManager,
  BotRecord,
  RewindCommitSummary,
  QueuedInputItem,
} from '../../storage/StorageManager';
import { RuntimeEnvironment } from '../../storage/RuntimeEnvironment';
import { ClaudeSdkRunner, TurnExecutionResult, RewindFilesResult } from './ClaudeSdkRunner';
import { UniversalConfigLoader } from '../config/UniversalConfigLoader';
import { AgentChatParams, AgentChatResult, SingleSpeakerStatus } from '../types';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';
import { BlackboardStore } from '../blackboard/BlackboardStore';
import {
  createCompactionGuardHooks,
  dangerousCommandGuardHook,
} from '../blackboard/lifecycleHooks';
import {
  GitSnapshotSavepointEngine,
  SubagentRewindFenceManager,
  relocateClaudeSessionTranscripts,
} from './SessionLifecycleEngine';

export interface OrchestratorOptions {
  storage: StorageManager;
  runtime: RuntimeEnvironment;
  maxTurnsPerRound?: number; // Defaults to 10
  maxConsecutiveSteps?: number; // Defaults to 5
}

export interface GroupActionDirective {
  action: 'talk' | 'collaborate' | 'finish';
  targets: string[];
  summary?: string;
}

/**
 * Parse <group-Action> XML directive emitted by moAdmin or peer bots
 */
export function parseGroupActionTag(text: string): GroupActionDirective | null {
  if (!text) return null;
  const tagMatch = text.match(/<group-Action\b([^>]*)>([\s\S]*?)<\/group-Action>/i);
  if (!tagMatch) return null;

  const attrs = tagMatch[1] || '';
  const body = tagMatch[2] || '';
  const typeMatch =
    attrs.match(/\b(?:type|mode|action)\s*=\s*["']?(talk|collaborate|finish)["']?/i) ||
    body.match(/\b(?:action|mode)\s*:\s*(talk|collaborate|finish)/i);

  const action = (typeMatch?.[1]?.toLowerCase() || 'talk') as 'talk' | 'collaborate' | 'finish';
  const targetMatches = Array.from(
    (attrs + ' ' + body).matchAll(/@?(moAdmin|moCode|moDoc|MoCI|MoGit|MoDeep|Mo)\b/gi)
  ).map((m) => m[1]);

  return {
    action,
    targets: Array.from(new Set(targetMatches)),
    summary: body.trim().slice(0, 300),
  };
}

/**
 * Extract @mentioned bot names from user message, defaulting to moAdmin (Rule 4.5)
 */
export function resolveMentionedBotIds(
  content: string,
  storage: StorageManager,
  explicitBotId?: string
): string {
  if (explicitBotId && explicitBotId !== 'auto') {
    const found = storage.getBot(explicitBotId);
    if (found) return found.id;
  }

  const mentionMatch = content.match(/@([a-zA-Z0-9_-]+)\b/);
  if (mentionMatch) {
    const mentioned = storage.getBot(mentionMatch[1]);
    if (mentioned) return mentioned.id;
  }

  const fallback = storage.getBot('moAdmin') || storage.getBot('bot_moadmin_director_03');
  return fallback ? fallback.id : explicitBotId || 'bot_moadmin_director_03';
}

export class AgentOrchestrator extends EventEmitter {
  private storage: StorageManager;
  private runtime: RuntimeEnvironment;
  private configLoader: UniversalConfigLoader;
  private blackboardStore: BlackboardStore;
  private savepointEngine: GitSnapshotSavepointEngine;
  private rewindFence: SubagentRewindFenceManager;
  private runners = new Map<string, ClaudeSdkRunner>();
  private maxTurnsPerRound: number;
  private maxConsecutiveSteps: number;
  private roomSpeakerState = new Map<string, SingleSpeakerStatus>();

  constructor(options: OrchestratorOptions) {
    super();
    this.storage = options.storage;
    this.runtime = options.runtime;
    this.configLoader = new UniversalConfigLoader(this.runtime.getProjectRoot());
    this.blackboardStore = new BlackboardStore(
      this.runtime.getProjectRoot(),
      this.storage.getStorageDir()
    );
    this.savepointEngine = new GitSnapshotSavepointEngine();
    this.rewindFence = new SubagentRewindFenceManager();
    this.maxTurnsPerRound = options.maxTurnsPerRound ?? 10;
    this.maxConsecutiveSteps = options.maxConsecutiveSteps ?? 5;
  }

  public getBlackboardStore(): BlackboardStore {
    return this.blackboardStore;
  }

  private buildRunnerCacheKey(botId: string, scopeId?: string): string {
    return `${botId}::${scopeId || 'global'}`;
  }

  /**
   * Get or instantiate a ClaudeSdkRunner for a specific (Bot, Room/Session Scope).
   * Keyed by `${bot.id}::${scopeId}` to prevent cross-room sandbox contamination.
   */
  public getOrCreateRunner(botId: string, roomId?: string, sessionId?: string): ClaudeSdkRunner {
    let bot = this.storage.getBot(botId);
    if (!bot) {
      this.storage.scanAndRegisterAgents(this.runtime.getProjectRoot());
      bot = this.storage.getBot(botId);
    }
    if (!bot) {
      throw new DaemonRpcError(DaemonErrorCode.BOT_NOT_FOUND, `Bot with ID '${botId}' not found.`);
    }

    const scopeKey = sessionId || (roomId ? `session_${roomId}` : 'global');
    const cacheKey = this.buildRunnerCacheKey(bot.id, scopeKey);
    if (this.runners.has(cacheKey)) {
      return this.runners.get(cacheKey)!;
    }

    let botThinkingLevel = 'high';
    let permissionLevel = 'full';
    let tools: string[] | undefined = undefined;
    let skills: string[] | undefined = undefined;
    let mcpServers: Record<string, any> | undefined = undefined;

    const parsedCaps = this.loadBotCaps(bot);

    if (parsedCaps.thinkingLevel) botThinkingLevel = parsedCaps.thinkingLevel;
    if (parsedCaps.permissionLevel) permissionLevel = parsedCaps.permissionLevel;
    if (Array.isArray(parsedCaps.sdkTools)) {
      tools = [
        ...parsedCaps.sdkTools,
        ...(Array.isArray(parsedCaps.mcpTools) ? parsedCaps.mcpTools : []),
      ];
    } else if (parsedCaps.tools) {
      tools = parsedCaps.tools;
    }
    if (parsedCaps.skills) skills = parsedCaps.skills;
    if (parsedCaps.mcpServers) mcpServers = parsedCaps.mcpServers;

    const resolvedEndpoint = this.resolveBotEndpoint(bot, parsedCaps);

    const cwd = roomId
      ? this.runtime.ensureGroupSandboxDir(roomId, bot.id)
      : this.runtime.resolveBotWorkbenchCwd(bot.name || bot.id);

    const existingSession = this.storage.getSession(scopeKey);
    const compactionHooks = createCompactionGuardHooks(
      this.blackboardStore,
      this.runtime.getProjectRoot()
    );

    const runner = new ClaudeSdkRunner({
      botId: bot.id,
      cwd,
      claudeConfigDir: bot.claude_config_dir,
      mountedDirs: [cwd, this.runtime.getProjectRoot()],
      baseUrl: resolvedEndpoint.baseUrl,
      apiKey: resolvedEndpoint.apiKey,
      model: resolvedEndpoint.modelId,
      thinkingLevel: botThinkingLevel,
      permissionLevel,
      tools,
      skills,
      mcpServers,
      sdkSessionId: existingSession?.sdk_session_id ?? null,
      contextWindow: existingSession?.context_window ?? 200000,
      hooks: {
        PreToolUse: [{ hooks: [dangerousCommandGuardHook] }],
        PreCompact: [{ hooks: [compactionHooks.preCompactHook] }],
        SessionStart: [{ hooks: [compactionHooks.sessionStartCompactHook] }],
      },
      onMemoryFlushThreshold: (ev) => {
        if (ev.threshold >= 0.85) {
          compactionHooks.preCompactHook({ hook_event_name: 'PreCompact' }).catch(() => {});
        }
        this.emit('memory.flush.threshold', {
          sessionId: scopeKey,
          roomId,
          botId: bot.id,
          ...ev,
        });
      },
      onInvalidResumeDetected: (staleSdkId) => {
        this.storage.compareAndClearSdkSessionId(scopeKey, staleSdkId);
        const visible = this.storage.getVisibleSessionMessages(scopeKey);
        return this.storage.buildConversationHandoffText(visible);
      },
    });

    this.runners.set(cacheKey, runner);
    return runner;
  }

  /** Bot capabilities: DB snapshot overlaid by Customizations/agents/<bot>/capabilities.json (file wins for missing keys only). */
  private loadBotCaps(bot: BotRecord): any {
    let parsedCaps: any = {};
    if (bot.capabilities_json) {
      try {
        parsedCaps = JSON.parse(bot.capabilities_json);
      } catch {}
    }
    for (const name of [bot.name, bot.id]) {
      const capFile = path.join(this.runtime.getProjectRoot(), 'Customizations', 'agents', name, 'capabilities.json');
      if (!fs.existsSync(capFile)) continue;
      try {
        parsedCaps = { ...JSON.parse(fs.readFileSync(capFile, 'utf-8')), ...parsedCaps };
        break;
      } catch {}
    }
    return parsedCaps;
  }

  private resolveBotEndpoint(bot: BotRecord, parsedCaps: any) {
    return this.configLoader.resolveModelEndpoint(parsedCaps.model, {
      botId: bot.id,
      botName: bot.name,
      botModel: parsedCaps.model,
      botFallbackModel: parsedCaps.fallbackModel,
      isAuxiliary: false,
    });
  }

  /** models.json is read fresh on every resolve; a cached runner must not keep a stale baseUrl, key or model. */
  private refreshRunnerRoute(runner: ClaudeSdkRunner, bot: BotRecord): void {
    const endpoint = this.resolveBotEndpoint(bot, this.loadBotCaps(bot));
    if (runner.setRoute({ baseUrl: endpoint.baseUrl, apiKey: endpoint.apiKey, model: endpoint.modelId })) {
      this.emit('runner.route.refreshed', { botId: bot.id, model: endpoint.modelId, baseUrl: endpoint.baseUrl });
    }
  }

  public getSingleSpeakerStatus(roomId: string): SingleSpeakerStatus {
    let state = this.roomSpeakerState.get(roomId);
    if (!state) {
      state = {
        roomId,
        currentSpeakerId: null,
        mode: 'talk',
        turnsCount: 0,
        maxTurns: this.maxTurnsPerRound,
        circuitBreakerTripped: false,
        historySummary: [],
      };
      this.roomSpeakerState.set(roomId, state);
    }
    return state;
  }

  /**
   * Abort active execution for a room or direct session (Fixes Overview Issue #3)
   */
  public abortExecution(targetId: string): boolean {
    let stoppedAny = false;
    const candidateScopes = new Set([
      targetId,
      `session_${targetId}`,
      targetId.replace(/^session_/, ''),
    ]);

    for (const [key, runner] of this.runners.entries()) {
      const [, scope] = key.split('::');
      if (candidateScopes.has(scope) || key.includes(targetId)) {
        if (runner.abortTurn()) {
          stoppedAny = true;
        }
      }
    }

    for (const scope of candidateScopes) {
      if (this.storage.getSession(scope)) {
        this.storage.markTurnEnded(scope);
      }
    }

    return stoppedAny;
  }

  /**
   * Two-Phase Rewind Phase 1: Dry-Run Preview
   */
  public async previewRewind(
    sessionId: string,
    messageIdOrClientId: string
  ): Promise<RewindFilesResult & { targetMessageId?: string; priorAssistantUuid?: string | null }> {
    const normalizedSessionId = sessionId.startsWith('session_')
      ? sessionId
      : this.storage.getSession(sessionId)
        ? sessionId
        : `session_${sessionId}`;

    const target = this.storage.getMessageByIdOrClientId(normalizedSessionId, messageIdOrClientId);
    if (!target || target.rewind_at !== null) {
      throw new DaemonRpcError(
        DaemonErrorCode.INVALID_PARAMS,
        `MESSAGE_NOT_FOUND: '${messageIdOrClientId}'`
      );
    }
    if (target.sender_role !== 'user') {
      throw new DaemonRpcError(
        DaemonErrorCode.INVALID_PARAMS,
        `NOT_USER_MESSAGE: Rewind target must be a user message.`
      );
    }

    const prior = this.storage.findPriorAssistantAnchor(normalizedSessionId, target.sequence);
    const userUuid = target.client_id || target.id;

    // Locate any runner bound to this session scope
    for (const [key, runner] of this.runners.entries()) {
      if (key.endsWith(`::${normalizedSessionId}`)) {
        const preview = await runner.previewRewindFiles(userUuid);
        return {
          ...preview,
          targetMessageId: target.id,
          priorAssistantUuid: prior?.uuid ?? null,
        };
      }
    }

    return {
      canRewind: true,
      filesChanged: [],
      insertions: 0,
      deletions: 0,
      targetMessageId: target.id,
      priorAssistantUuid: prior?.uuid ?? null,
    };
  }

  /**
   * Two-Phase Rewind Phase 2: Atomic Commit (Files + SQLite rewind_at + Group Cursors + Blackboard Epoch)
   */
  public async commitRewind(
    sessionId: string,
    messageIdOrClientId: string,
    options?: {
      stopIfRunning?: boolean;
      allowFileRestore?: boolean;
      requireLatestUser?: boolean;
    }
  ): Promise<RewindCommitSummary & { generation: number }> {
    const normalizedSessionId = sessionId.startsWith('session_')
      ? sessionId
      : this.storage.getSession(sessionId)
        ? sessionId
        : `session_${sessionId}`;

    this.rewindFence.beginFence(normalizedSessionId);
    try {
      if (options?.stopIfRunning) {
        this.abortExecution(normalizedSessionId);
      }

      const summary = this.storage.rewindToMessage(normalizedSessionId, messageIdOrClientId, {
        requireLatestUser: options?.requireLatestUser,
      });

      // Notify all runners in this session scope to commit file rewind and arm lazy 3-tuple fork
      for (const [key, runner] of this.runners.entries()) {
        if (key.endsWith(`::${normalizedSessionId}`)) {
          await runner.commitRewindFiles(summary.targetClientId, summary.priorAssistantUuid, {
            allowFileRestore: options?.allowFileRestore,
          });
          if (!summary.priorAssistantUuid) {
            this.storage.updateSessionSdkId(normalizedSessionId, null);
          }
        }
      }

      // Rollback Blackboard SSOT epoch if rewinding a group room session (Scenario 6)
      const session = this.storage.getSession(normalizedSessionId);
      if (session?.session_type === 'room') {
        this.blackboardStore.rollbackStateBefore(summary.rewindTimestamp, 'HostRewind');
      }

      const generation = this.rewindFence.commitAndAdvance(normalizedSessionId);
      const payload = { ...summary, generation };
      this.emit('session.rewound', payload);
      return payload;
    } finally {
      this.rewindFence.releaseFence(normalizedSessionId);
    }
  }

  /**
   * Manual / Host-Triggered Session Compaction via Bridge Turn
   */
  public scheduleSessionCompaction(
    sessionId: string,
    botId?: string,
    instructions?: string
  ): { sessionId: string; scheduled: boolean } {
    const normalizedSessionId = sessionId.startsWith('session_')
      ? sessionId
      : this.storage.getSession(sessionId)
        ? sessionId
        : `session_${sessionId}`;

    let count = 0;
    for (const [key, runner] of this.runners.entries()) {
      if (key.endsWith(`::${normalizedSessionId}`) && (!botId || key.startsWith(`${botId}::`))) {
        runner.scheduleBridgeCompaction(instructions);
        count++;
      }
    }
    this.emit('session.compacted', {
      sessionId: normalizedSessionId,
      botId,
      instructions: instructions || null,
      timestamp: Date.now(),
    });
    return { sessionId: normalizedSessionId, scheduled: count > 0 || true };
  }

  /**
   * Relocate Session Working Directory and Copy Claude JSONL Transcripts
   */
  public relocateSessionWorkingDir(sessionId: string, newWorkingDir: string) {
    const session = this.storage.getSession(sessionId);
    if (!session) {
      throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, `SESSION_NOT_FOUND: '${sessionId}'`);
    }
    const oldDir = session.cwd_path || this.runtime.getProjectRoot();
    const resolvedNew = path.resolve(newWorkingDir);
    const sdkIds = session.sdk_session_id ? [session.sdk_session_id] : [];

    const relocateResult = relocateClaudeSessionTranscripts({
      sdkSessionIds: sdkIds,
      oldWorkingDir: oldDir,
      newWorkingDir: resolvedNew,
      claudeConfigDir: session.claude_config_dir || this.storage.getStorageDir(),
    });

    this.storage.createSession(
      session.id,
      session.session_type,
      session.target_id,
      session.title,
      resolvedNew,
      session.claude_config_dir
    );

    for (const [key, runner] of this.runners.entries()) {
      if (key.endsWith(`::${session.id}`)) {
        runner.setWorkingDirectory(resolvedNew);
      }
    }

    return relocateResult;
  }

  /**
   * Handle an incoming chat message with deterministic single-speaker routing,
   * @mention resolution, blackboard delta slicing, and anti-loop guards.
   */
  public async handleChat(params: AgentChatParams): Promise<AgentChatResult> {
    const { roomId, content, role = 'user', threadId, directSessionId } = params;
    const resolvedBotId = resolveMentionedBotIds(content, this.storage, params.botId);

    let bot = this.storage.getBot(resolvedBotId);
    if (!bot) {
      this.storage.scanAndRegisterAgents(this.runtime.getProjectRoot());
      bot = this.storage.getBot(resolvedBotId);
    }
    if (!bot) {
      throw new DaemonRpcError(
        DaemonErrorCode.BOT_NOT_FOUND,
        `Bot with ID '${resolvedBotId}' not found.`
      );
    }

    let room = this.storage.getRoom(roomId);
    if (!room && (directSessionId || roomId.startsWith('direct_') || roomId === 'multiagent-orchestration')) {
      room = this.storage.createRoom({
        id: roomId,
        slug: roomId.replace(/[^a-zA-Z0-9_-]/g, '_'),
        name: directSessionId ? `Direct Chat (${bot.name})` : 'Multi-Agent Orchestration',
        members: [bot.name],
      });
    }
    if (!room) {
      throw new DaemonRpcError(
        DaemonErrorCode.ROOM_NOT_FOUND,
        `Room with ID '${roomId}' not found.`
      );
    }

    const sessionId = directSessionId || `session_${room.id}`;
    if (!this.storage.getSession(sessionId)) {
      this.storage.createSession(
        sessionId,
        directSessionId ? 'dm' : 'room',
        directSessionId ? bot.id : room.id,
        directSessionId ? `DM with ${bot.name}` : `${room.name} Session`,
        room.room_dir,
        bot.claude_config_dir
      );
    }

    const speakerState = this.getSingleSpeakerStatus(roomId);
    const effectiveMaxTurns = Math.min(
      this.maxTurnsPerRound,
      room.max_consecutive_steps || this.maxConsecutiveSteps
    );
    speakerState.maxTurns = this.maxTurnsPerRound;

    if (role === 'user') {
      speakerState.turnsCount = 0;
      speakerState.circuitBreakerTripped = false;
      speakerState.currentSpeakerId = bot.id;
    } else {
      speakerState.turnsCount++;
      if (speakerState.turnsCount >= effectiveMaxTurns) {
        speakerState.circuitBreakerTripped = true;
        throw new DaemonRpcError(
          DaemonErrorCode.CIRCUIT_BREAKER_TRIPPED,
          `Anti-loop circuit breaker tripped: exceeded ${effectiveMaxTurns} autonomous turns in round. Awaiting human input.`
        );
      }
    }

    // 1. Record incoming message into SQLite with client_id checkpoint anchor
    const userMessage = this.storage.addMessage({
      room_id: roomId,
      sender_id: role === 'user' ? 'human_user' : bot.id,
      sender_type: role,
      content,
      role: role === 'bot' ? 'assistant' : role,
      thread_id: threadId,
      client_id: params.metadata?.clientId,
      metadata: params.metadata,
    });

    // 2. Fetch incremental messages slice for this Bot since lastSeenSequence (Delta Slicing)
    const cursor = this.storage.getMemberCursor(roomId, bot.id);
    const lastSeenSequence = cursor?.last_seen_sequence ?? 0;
    const deltaSlice = this.storage.getMessagesSince(roomId, lastSeenSequence);

    // Advance Bot cursor to current latest sequence
    this.storage.updateMemberCursor(roomId, bot.id, userMessage.sequence);

    if (role === 'bot') {
      return {
        messageId: userMessage.id,
        botId: bot.id,
        sequence: userMessage.sequence,
        replyContent: content,
      };
    }

    // 3. Assemble dynamic context bundle (with <untrusted-json-block> peer deltas)
    const contextBundle = this.runtime.assembleContextPrompt(
      bot.id,
      roomId,
      deltaSlice.map((m) => ({
        id: m.id,
        role: m.sender_role,
        sender: m.sender_id,
        content: m.content,
        timestamp: m.created_at,
      }))
    );

    // Consume any pending context_rebuild handoff (after message tombstone deletion)
    const handoffPrefix = this.storage.consumePendingContextRebuildHandoff(sessionId) || undefined;

    // 4. Dispatch to Claude SDK Runner with structured event pipeline & crash watermarks
    const runner = this.getOrCreateRunner(bot.id, roomId, sessionId);
    this.refreshRunnerRoute(runner, bot);
    const turnStartedAt = Date.now();
    const turnId = `turn_${turnStartedAt}_${bot.id}`;

    this.storage.markTurnStarted(sessionId, turnStartedAt);
    this.savepointEngine.beginTurnOnRepo(this.runtime.getProjectRoot(), sessionId);

    this.emit('turn.start', {
      roomId,
      botId: bot.id,
      botName: bot.name,
      messageId: userMessage.id,
      turnId,
      directSessionId,
      startedAt: turnStartedAt,
      sequence: userMessage.sequence + 1,
    });

    const executionStatus: any = {
      state: 'thinking',
      currentPhaseText: `${bot.name} 正在深度思考规划...`,
      thinking: {
        text: '',
        startedAt: turnStartedAt,
        durationMs: 0,
        durationSeconds: 0,
      },
      tools: [] as Array<any>,
      latency: {
        startedAt: turnStartedAt,
        thinkingMs: 0,
        toolMs: 0,
        totalMs: 0,
      },
    };

    let executionResult: TurnExecutionResult;
    try {
      executionResult = await runner.executeTurn({
        prompt: content,
        userUuid: userMessage.client_id || userMessage.id,
        contextBundle,
        handoffPrefix,
        onStreamChunk: (chunk) => {
          this.emit('stream.chunk', {
            roomId,
            botId: bot.id,
            chunk,
            directSessionId,
          });
        },
        onThinking: (delta) => {
          executionStatus.thinking.text += delta;
          const durationMs = Date.now() - turnStartedAt;
          executionStatus.thinking.durationMs = durationMs;
          executionStatus.thinking.durationSeconds = Number((durationMs / 1000).toFixed(2));
          executionStatus.latency.thinkingMs = durationMs;
          this.emit('stream.thinking', {
            roomId,
            botId: bot.id,
            turnId,
            delta,
            accumulated: executionStatus.thinking.text,
            directSessionId,
            startedAt: turnStartedAt,
          });
        },
        onToolUse: (tool) => {
          const toolCallId =
            tool.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const toolDesc = `正在执行工具: ${tool.name}`;
          const toolItem = {
            id: toolCallId,
            tool: tool.name,
            description: toolDesc,
            args: tool.input,
            status: 'running',
            startedAt: Date.now(),
          };
          executionStatus.tools.push(toolItem);
          executionStatus.state = 'tool_executing';
          executionStatus.currentPhaseText = `正在调用工具: ${tool.name}...`;
          this.emit('tool.use', {
            roomId,
            botId: bot.id,
            turnId,
            toolCallId,
            toolName: tool.name,
            toolInput: tool.input,
            input: tool.input,
            description: toolDesc,
            directSessionId,
          });
        },
        onToolResult: (res) => {
          const toolCallId = res.toolUseId;
          const toolItem =
            executionStatus.tools.find((t: any) => t.id === toolCallId) ||
            executionStatus.tools[executionStatus.tools.length - 1];
          if (toolItem) {
            toolItem.status = res.isError ? 'failed' : 'completed';
            toolItem.output = res.content;
            toolItem.durationMs = Date.now() - (toolItem.startedAt || Date.now());
          }
          const totalToolMs = executionStatus.tools.reduce(
            (sum: number, t: any) => sum + (t.durationMs || 0),
            0
          );
          executionStatus.latency.toolMs = totalToolMs;
          this.emit('tool.result', {
            roomId,
            botId: bot.id,
            turnId,
            toolCallId,
            output: res.content,
            result: res.content,
            isError: res.isError,
            directSessionId,
          });
        },
        onTextDelta: (delta) => {
          this.emit('stream.delta', {
            roomId,
            botId: bot.id,
            turnId,
            delta,
            directSessionId,
          });
        },
      });
    } finally {
      this.storage.markTurnEnded(sessionId, Date.now());
      this.savepointEngine.endTurnOnRepo(this.runtime.getProjectRoot(), sessionId);
    }

    // Update session sdk_session_id and context token telemetry
    if (executionResult.sdkSessionId) {
      this.storage.updateSessionSdkId(sessionId, executionResult.sdkSessionId);
    }
    if (executionResult.contextTokens !== undefined || executionResult.tokensUsed) {
      this.storage.updateSessionContextUsage(
        sessionId,
        executionResult.contextTokens ?? 0,
        executionResult.contextWindow,
        executionResult.tokensUsed
      );
    }

    const replyText = executionResult.reply;

    // 5. Anti-loop NO_REPLY check (exact token match per Rule 4.3 & Scenario E2)
    const normalizedReply = replyText.trim().toUpperCase();
    if (normalizedReply === 'NO_REPLY' || normalizedReply === '```NO_REPLY```') {
      return {
        messageId: userMessage.id,
        botId: bot.id,
        sequence: userMessage.sequence,
        replyContent: 'NO_REPLY',
      };
    }

    // Parse optional <group-Action> directive emitted by moAdmin
    const groupAction = parseGroupActionTag(replyText);
    if (groupAction) {
      speakerState.mode = groupAction.action === 'collaborate' ? 'work' : 'talk';
    }

    // 6. Record bot reply into SQLite with authentic executionStatus & assistant UUID anchor
    const totalMs = Date.now() - turnStartedAt;
    executionStatus.state = 'done';
    executionStatus.currentPhaseText = '已完成执行';
    executionStatus.latency.totalMs = totalMs;
    if (!executionStatus.latency.thinkingMs) {
      executionStatus.latency.thinkingMs = Math.max(
        0,
        totalMs - (executionStatus.latency.toolMs || 0)
      );
    }

    const assistantUuid = executionResult.assistantMessageUuid || undefined;
    const botMessage = this.storage.addMessage({
      room_id: roomId,
      sender_id: bot.id,
      sender_type: 'bot',
      content: replyText,
      role: 'assistant',
      thread_id: threadId,
      reply_to_id: userMessage.id,
      client_id: assistantUuid,
      agent_meta: {
        uuid: assistantUuid || `asst_${Date.now()}`,
        sdkSessionId: executionResult.sdkSessionId || null,
        model: bot.name,
        tokensUsed: executionResult.tokensUsed,
      },
      metadata: {
        reply_to_id: userMessage.id,
        executionStatus,
        groupAction,
      },
    });

    this.emit('turn.complete', {
      roomId,
      botId: bot.id,
      messageId: userMessage.id,
      turnId,
      replyId: botMessage.id,
      replyContent: replyText,
      tokensUsed: executionResult.tokensUsed,
      executionStatus,
      directSessionId,
    });

    this.storage.updateMemberCursor(roomId, bot.id, botMessage.sequence);

    // 7. Update Blackboard (GROUP_MEMORY.md) if meaningful consensus emerged
    let blackboardUpdated = false;
    if (!directSessionId && replyText && normalizedReply !== 'NO_REPLY') {
      const summaryLine =
        replyText.split('\n').find((l) => l.trim().length > 0) || replyText.slice(0, 100);
      this.storage.appendToBlackboard(
        roomId,
        `\n- [${new Date().toISOString()}] **${bot.name}**: ${summaryLine.trim().slice(0, 120)}`
      );
      blackboardUpdated = true;
      this.emit('blackboard.updated', { roomId, botId: bot.id, timestamp: Date.now() });
    }

    return {
      messageId: userMessage.id,
      replyId: botMessage.id,
      replyContent: replyText,
      botId: bot.id,
      sequence: botMessage.sequence,
      tokensUsed: executionResult.tokensUsed,
      blackboardUpdated,
    };
  }

  public resetCircuitBreaker(roomId: string): void {
    const state = this.getSingleSpeakerStatus(roomId);
    state.turnsCount = 0;
    state.circuitBreakerTripped = false;
  }

  public saveSessionInputQueue(sessionId: string, items: QueuedInputItem[]) {
    return this.storage.saveInputQueueSnapshot(sessionId, items);
  }

  public loadSessionInputQueue(sessionId: string): QueuedInputItem[] {
    return this.storage.loadInputQueueSnapshot(sessionId);
  }

  public clearSessionInputQueue(sessionId: string): void {
    this.storage.clearInputQueueSnapshot(sessionId);
  }
}
