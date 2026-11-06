import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { StorageManager } from '../../storage/StorageManager';
import { RuntimeEnvironment } from '../../storage/RuntimeEnvironment';
import { ClaudeSdkRunner, TurnExecutionResult } from './ClaudeSdkRunner';
import { UniversalConfigLoader } from '../config/UniversalConfigLoader';
import { AgentChatParams, AgentChatResult, SingleSpeakerStatus } from '../types';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';

export interface OrchestratorOptions {
  storage: StorageManager;
  runtime: RuntimeEnvironment;
  maxTurnsPerRound?: number; // Defaults to 10
}

export class AgentOrchestrator extends EventEmitter {
  private storage: StorageManager;
  private runtime: RuntimeEnvironment;
  private configLoader: UniversalConfigLoader;
  private runners = new Map<string, ClaudeSdkRunner>();
  private maxTurnsPerRound: number;
  private roomSpeakerState = new Map<string, SingleSpeakerStatus>();

  constructor(options: OrchestratorOptions) {
    super();
    this.storage = options.storage;
    this.runtime = options.runtime;
    this.configLoader = new UniversalConfigLoader(this.runtime.getProjectRoot());
    this.maxTurnsPerRound = options.maxTurnsPerRound ?? 10;
  }

  /**
   * Get or instantiate a ClaudeSdkRunner for a specific Bot.
   */
  public getOrCreateRunner(botId: string, roomId?: string): ClaudeSdkRunner {
    if (this.runners.has(botId)) {
      return this.runners.get(botId)!;
    }

    const bot = this.storage.getBot(botId);
    if (!bot) {
      throw new DaemonRpcError(DaemonErrorCode.BOT_NOT_FOUND, `Bot with ID '${botId}' not found.`);
    }

    let botThinkingLevel = 'high';
    let permissionLevel = 'full';
    let tools: string[] | undefined = undefined;
    let skills: string[] | undefined = undefined;
    let mcpServers: Record<string, any> | undefined = undefined;

    // Check bot.capabilities_json or read from Customizations/agents/
    let parsedCaps: any = {};
    if (bot.capabilities_json) {
      try {
        parsedCaps = JSON.parse(bot.capabilities_json);
      } catch {}
    }

    const capCandidates = [
      path.join(this.runtime.getProjectRoot(), 'Customizations', 'agents', bot.name, 'capabilities.json'),
      path.join(this.runtime.getProjectRoot(), 'Customizations', 'agents', botId, 'capabilities.json'),
    ];
    for (const capFile of capCandidates) {
      if (fs.existsSync(capFile)) {
        try {
          const fileCaps = JSON.parse(fs.readFileSync(capFile, 'utf-8'));
          parsedCaps = { ...fileCaps, ...parsedCaps };
          break;
        } catch {}
      }
    }

    if (parsedCaps.thinkingLevel) botThinkingLevel = parsedCaps.thinkingLevel;
    if (parsedCaps.permissionLevel) permissionLevel = parsedCaps.permissionLevel;
    if (parsedCaps.tools) tools = parsedCaps.tools;
    if (parsedCaps.skills) skills = parsedCaps.skills;
    if (parsedCaps.mcpServers) mcpServers = parsedCaps.mcpServers;

    // Resolve model and endpoint via Cindy 4-level resolution chain:
    // bot.model -> bot.fallbackModel -> global.primaryModel -> global.primaryFallbackModel
    const resolvedEndpoint = this.configLoader.resolveModelEndpoint(parsedCaps.model, {
      botId,
      botName: bot.name,
      botModel: parsedCaps.model,
      botFallbackModel: parsedCaps.fallbackModel,
      isAuxiliary: false,
    });

    const cwd = roomId
      ? this.runtime.ensureGroupSandboxDir(roomId, botId)
      : this.runtime.resolveBotWorkbenchCwd(bot.name || botId);

    const runner = new ClaudeSdkRunner({
      botId,
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
    });

    this.runners.set(botId, runner);
    return runner;
  }

  /**
   * Initialize or retrieve single speaker status for a room.
   */
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
   * Handle an incoming chat message with deterministic single-speaker routing,
   * blackboard delta slicing, and anti-loop guards.
   */
  public async handleChat(params: AgentChatParams): Promise<AgentChatResult> {
    const { roomId, botId, content, role = 'user', threadId, directSessionId } = params;

    const room = this.storage.getRoom(roomId);
    if (!room) {
      throw new DaemonRpcError(DaemonErrorCode.ROOM_NOT_FOUND, `Room with ID '${roomId}' not found.`);
    }

    const bot = this.storage.getBot(botId);
    if (!bot) {
      throw new DaemonRpcError(DaemonErrorCode.BOT_NOT_FOUND, `Bot with ID '${botId}' not found.`);
    }

    const speakerState = this.getSingleSpeakerStatus(roomId);

    // Human message resets turn counter and clears circuit breaker
    if (role === 'user') {
      speakerState.turnsCount = 0;
      speakerState.circuitBreakerTripped = false;
      speakerState.currentSpeakerId = botId;
    } else {
      // Bot message increments turn counter
      speakerState.turnsCount++;
      if (speakerState.turnsCount >= speakerState.maxTurns) {
        speakerState.circuitBreakerTripped = true;
        throw new DaemonRpcError(
          DaemonErrorCode.CIRCUIT_BREAKER_TRIPPED,
          `Anti-loop circuit breaker tripped: exceeded ${speakerState.maxTurns} turns in round. Awaiting human input.`
        );
      }
    }

    // 1. Record incoming message into SQLite (WAL mode, monotonic sequence increment)
    const userMessage = this.storage.addMessage({
      room_id: roomId,
      sender_id: role === 'user' ? 'human_user' : botId,
      sender_type: role,
      content,
      role,
      thread_id: threadId,
    });

    // 2. Fetch incremental messages slice for this Bot since lastSeenSequence (Delta Slicing)
    const cursor = this.storage.getMemberCursor(roomId, botId);
    const lastSeenSequence = cursor?.last_seen_sequence ?? 0;
    const deltaSlice = this.storage.getMessagesSince(roomId, lastSeenSequence);

    // Advance Bot cursor to current latest sequence
    this.storage.updateMemberCursor(roomId, botId, userMessage.sequence);

    // If message is from a bot, it is already authored; do not re-invoke runner
    if (role === 'bot') {
      return {
        messageId: userMessage.id,
        botId,
        sequence: userMessage.sequence,
        replyContent: content,
      };
    }

    // 3. Assemble dynamic context bundle (8-section prompt pipeline)
    const contextBundle = this.runtime.assembleContextPrompt(
      botId,
      roomId,
      deltaSlice.map((m) => ({
        id: m.id,
        sender: m.sender_id,
        content: m.content,
        timestamp: m.created_at,
      }))
    );

    // 4. Dispatch to Claude SDK Runner with structured event pipeline
    const runner = this.getOrCreateRunner(botId, roomId);
    let replyText = '';
    const turnStartedAt = Date.now();
    const turnId = `turn_${turnStartedAt}_${botId}`;

    this.emit('turn.start', {
      roomId,
      botId,
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

    const executionResult: TurnExecutionResult = await runner.executeTurn({
      prompt: content,
      contextBundle,
      onStreamChunk: (chunk) => {
        this.emit('stream.chunk', {
          roomId,
          botId,
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
          botId,
          turnId,
          delta,
          accumulated: executionStatus.thinking.text,
          directSessionId,
          startedAt: turnStartedAt,
        });
      },
      onToolUse: (tool) => {
        const toolCallId = tool.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
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
          botId,
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
          botId,
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
          botId,
          turnId,
          delta,
          directSessionId,
        });
      },
    });

    replyText = executionResult.reply;

    // 5. Anti-loop NO_REPLY check (exact token match per Rule 4.3)
    if (replyText.trim() === 'NO_REPLY' || replyText.trim() === '```NO_REPLY```') {
      return {
        messageId: userMessage.id,
        botId,
        sequence: userMessage.sequence,
        replyContent: 'NO_REPLY',
      };
    }

    // 6. Record bot reply into SQLite with authentic executionStatus
    const totalMs = Date.now() - turnStartedAt;
    executionStatus.state = 'done';
    executionStatus.currentPhaseText = '已完成执行';
    executionStatus.latency.totalMs = totalMs;
    if (!executionStatus.latency.thinkingMs) {
      executionStatus.latency.thinkingMs = Math.max(0, totalMs - (executionStatus.latency.toolMs || 0));
    }

    const botMessage = this.storage.addMessage({
      room_id: roomId,
      sender_id: botId,
      sender_type: 'bot',
      content: replyText,
      role: 'assistant',
      thread_id: threadId,
      reply_to_id: userMessage.id,
      metadata: {
        reply_to_id: userMessage.id,
        executionStatus,
      },
    });

    this.emit('turn.complete', {
      roomId,
      botId,
      messageId: userMessage.id,
      turnId,
      replyId: botMessage.id,
      replyContent: replyText,
      tokensUsed: executionResult.tokensUsed,
      executionStatus,
      directSessionId,
    });

    // Advance cursor for bot reply
    this.storage.updateMemberCursor(roomId, botId, botMessage.sequence);

    // 7. Update Blackboard (GROUP_MEMORY.md) if meaningful consensus emerged (and NOT a direct session)
    let blackboardUpdated = false;
    if (!directSessionId && replyText && replyText.trim() !== 'NO_REPLY') {
      const summaryLine = replyText.split('\n').find((l) => l.trim().length > 0) || replyText.slice(0, 100);
      this.storage.appendToBlackboard(
        roomId,
        `\n- [${new Date().toISOString()}] **${bot.name}**: ${summaryLine.trim().slice(0, 120)}`
      );
      blackboardUpdated = true;
      this.emit('blackboard.updated', { roomId, botId, timestamp: Date.now() });
    }

    return {
      messageId: userMessage.id,
      replyId: botMessage.id,
      replyContent: replyText,
      botId,
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
}

