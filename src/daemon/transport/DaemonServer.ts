/**
 * @file src/daemon/transport/DaemonServer.ts
 * @description Central Multi-Agent Daemon Server powered exclusively by Cindy-style GatewayServer.
 * Single unified WebSocket transport, zero dual-protocol overhead.
 */

import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { StorageManager } from '../../storage/StorageManager';
import { RuntimeEnvironment } from '../../storage/RuntimeEnvironment';
import { UniversalConfigLoader } from '../config/UniversalConfigLoader';
import { AgentOrchestrator } from '../orchestrator/AgentOrchestrator';
import { WorkerManager } from '../orchestrator/WorkerManager';
import { GatewayServer } from '../gateway/GatewayServer';
import { BackpressureGuard } from './BackpressureGuard';
import { DaemonConfig, DaemonStatusResult } from '../types';
import { DaemonRpcError, DaemonErrorCode } from '../protocol/errors';

export interface MultiAgentDaemonConfig extends Omit<DaemonConfig, 'socketPath'> {
  authToken?: string;
}

export class DaemonServer extends EventEmitter {
  private config: MultiAgentDaemonConfig;
  private storage: StorageManager;
  private runtime: RuntimeEnvironment;
  private configLoader: UniversalConfigLoader;
  private orchestrator: AgentOrchestrator;
  private workerManager: WorkerManager;
  private backpressure: BackpressureGuard;
  private gatewayServer: GatewayServer;

  private startTime: number = 0;
  private pidFilePath: string;
  private isRunning: boolean = false;

  constructor(customConfig?: Partial<MultiAgentDaemonConfig>) {
    super();
    const projectRoot = path.resolve(customConfig?.projectRoot || process.cwd());
    const dataDir = path.resolve(customConfig?.dataDir || path.join(projectRoot, '.daemon'));
    const httpPort = customConfig?.httpPort ?? 38080;
    const httpHost = customConfig?.httpHost || '127.0.0.1';

    this.config = {
      projectRoot,
      dataDir,
      httpPort,
      httpHost,
      authToken: customConfig?.authToken,
      maxSocketBufferedBytes: customConfig?.maxSocketBufferedBytes ?? 64 * 1024 * 1024,
      heartbeatIntervalMs: customConfig?.heartbeatIntervalMs ?? 15000,
      leaseTimeoutMs: customConfig?.leaseTimeoutMs ?? 45000,
    };

    fs.mkdirSync(this.config.dataDir, { recursive: true });
    this.pidFilePath = path.join(this.config.dataDir, 'daemon.pid');

    // Subsystems
    this.storage = new StorageManager(this.config.dataDir);
    try {
      this.storage.scanAndRegisterAgents(this.config.projectRoot);
    } catch {}
    this.runtime = new RuntimeEnvironment(this.config.projectRoot, this.storage);
    this.configLoader = new UniversalConfigLoader(this.config.projectRoot);
    this.orchestrator = new AgentOrchestrator({
      storage: this.storage,
      runtime: this.runtime,
    });
    this.workerManager = new WorkerManager();
    this.backpressure = new BackpressureGuard({
      maxBufferedBytes: this.config.maxSocketBufferedBytes,
      leaseTimeoutMs: this.config.leaseTimeoutMs,
      heartbeatIntervalMs: this.config.heartbeatIntervalMs,
    });

    // Unified Device Gateway Server
    this.gatewayServer = new GatewayServer({
      host: this.config.httpHost,
      port: this.config.httpPort,
      authToken: this.config.authToken,
      backpressure: this.backpressure,
    });

    this.registerGatewayChannels();
    this.wirePushEventRelays();
  }

  /**
   * Register Cindy-style allowlisted invoke channels.
   */
  private registerGatewayChannels(): void {
    // 1. system:*
    this.gatewayServer.registerHandler('system:status', async () => this.getStatus());
    this.gatewayServer.registerHandler('system:ping', async () => ({
      pong: true,
      timestamp: Date.now(),
    }));

    // 2. agent:*
    this.gatewayServer.registerHandler('agent:list', async () => {
      return this.storage.listBots();
    });

    this.gatewayServer.registerHandler('agent:get', async (params: { botId: string }) => {
      if (!params?.botId) {
        throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'botId is required');
      }
      const bot = this.storage.getBot(params.botId);
      if (!bot) {
        throw new DaemonRpcError(DaemonErrorCode.BOT_NOT_FOUND, `Bot '${params.botId}' not found`);
      }
      return bot;
    });

    this.gatewayServer.registerHandler('agent:chat', async (params) => {
      const content = params?.content || params?.text;
      const roomId = params?.roomId || params?.directSessionId || 'multiagent-orchestration';
      const botId = params?.botId || 'bot_moadmin_director_03';

      if (!content) {
        throw new DaemonRpcError(
          DaemonErrorCode.INVALID_PARAMS,
          'content or text is required for agent:chat'
        );
      }

      return await this.orchestrator.handleChat({
        roomId,
        botId,
        content,
        role: params?.role || 'user',
        threadId: params?.threadId,
        directSessionId: params?.directSessionId,
        metadata: params?.metadata || (params?.clientId ? { clientId: params.clientId } : undefined),
      });
    });

    this.gatewayServer.registerHandler(
      'agent:abort',
      async (params: { roomId?: string; turnId?: string; directSessionId?: string }) => {
        const targetId = params?.roomId || params?.directSessionId || 'multiagent-orchestration';
        const stopped = this.orchestrator.abortExecution(targetId);
        const topic = params?.directSessionId
          ? `direct:${params.directSessionId}`
          : `session:${targetId}`;
        this.gatewayServer.push(topic, 'agent:turn_interrupted', {
          turnId: params?.turnId || `turn_${Date.now()}`,
          abortedAt: Date.now(),
          reason: 'user_aborted',
          stopped,
        });
        return { status: 'aborted', targetId, stopped };
      }
    );

    // 3. rewind:* (Two-Phase Message & File Rewind)
    this.gatewayServer.registerHandler(
      'rewind:preview',
      async (params: { sessionId: string; clientId?: string; messageId?: string }) => {
        const sid = params?.sessionId;
        const mid = params?.clientId || params?.messageId;
        if (!sid || !mid) {
          throw new DaemonRpcError(
            DaemonErrorCode.INVALID_PARAMS,
            'sessionId and clientId/messageId are required for rewind:preview'
          );
        }
        return await this.orchestrator.previewRewind(sid, mid);
      }
    );

    this.gatewayServer.registerHandler(
      'rewind:commit',
      async (params: {
        sessionId: string;
        clientId?: string;
        messageId?: string;
        stopIfRunning?: boolean;
        allowFileRestore?: boolean;
        requireLatestUser?: boolean;
      }) => {
        const sid = params?.sessionId;
        const mid = params?.clientId || params?.messageId;
        if (!sid || !mid) {
          throw new DaemonRpcError(
            DaemonErrorCode.INVALID_PARAMS,
            'sessionId and clientId/messageId are required for rewind:commit'
          );
        }
        return await this.orchestrator.commitRewind(sid, mid, {
          stopIfRunning: params?.stopIfRunning,
          allowFileRestore: params?.allowFileRestore,
          requireLatestUser: params?.requireLatestUser,
        });
      }
    );

    // 4. session:* (History, List, Compaction, Fork, Tombstone, Relocate, Interrupted, Queue)
    this.gatewayServer.registerHandler(
      'session:history',
      async (params: {
        roomId?: string;
        sessionId?: string;
        afterSequence?: number;
        limit?: number;
      }) => {
        const targetRoomId =
          params?.roomId ||
          (params?.sessionId ? params.sessionId.replace('session_', '') : 'multiagent-orchestration');
        const afterSeq = params?.afterSequence ?? 0;
        const limit = params?.limit ?? 100;
        const messages = this.storage.getMessagesSince(targetRoomId, afterSeq);
        const sliced = limit > 0 ? messages.slice(0, limit) : messages;
        return {
          roomId: targetRoomId,
          messages: sliced.map((m) => ({
            id: m.id,
            clientId: m.client_id,
            groupId: targetRoomId,
            sequence: m.sequence,
            authorKind: m.sender_role === 'assistant' ? 'bot' : 'user',
            authorBotId: m.sender_role === 'assistant' ? m.sender_id : undefined,
            authorName: m.sender_id,
            content: m.content,
            createdAt: new Date(m.created_at).toISOString(),
          })),
        };
      }
    );

    this.gatewayServer.registerHandler('session:list', async () => {
      let rooms: any[] = [];
      try {
        const db = (this.storage as any).db;
        if (db && typeof db.prepare === 'function') {
          rooms = db
            .prepare('SELECT id, slug, name, updated_at FROM rooms ORDER BY updated_at DESC')
            .all();
        }
      } catch {}
      return {
        sessions: rooms.map((r: any) => ({
          id: r.id,
          slug: r.slug,
          name: r.name,
          updatedAt: r.updated_at,
        })),
      };
    });

    this.gatewayServer.registerHandler(
      'session:compact',
      async (params: { sessionId: string; botId?: string; instructions?: string }) => {
        if (!params?.sessionId) {
          throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'sessionId is required');
        }
        return this.orchestrator.scheduleSessionCompaction(
          params.sessionId,
          params.botId,
          params.instructions
        );
      }
    );

    this.gatewayServer.registerHandler(
      'session:fork',
      async (params: {
        sourceSessionId: string;
        newSessionId?: string;
        upToMessageId?: string;
        title?: string;
      }) => {
        if (!params?.sourceSessionId) {
          throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'sourceSessionId is required');
        }
        const newId = params.newSessionId || `session_fork_${Date.now()}`;
        return this.storage.forkSessionAtMessage(
          params.sourceSessionId,
          newId,
          params.upToMessageId,
          params.title
        );
      }
    );

    this.gatewayServer.registerHandler(
      'session:tombstone',
      async (params: { sessionId: string; messageId: string }) => {
        if (!params?.sessionId || !params?.messageId) {
          throw new DaemonRpcError(
            DaemonErrorCode.INVALID_PARAMS,
            'sessionId and messageId are required'
          );
        }
        return this.storage.tombstoneMessage(params.sessionId, params.messageId);
      }
    );

    this.gatewayServer.registerHandler(
      'session:relocate',
      async (params: { sessionId: string; newWorkingDir: string }) => {
        if (!params?.sessionId || !params?.newWorkingDir) {
          throw new DaemonRpcError(
            DaemonErrorCode.INVALID_PARAMS,
            'sessionId and newWorkingDir are required'
          );
        }
        return this.orchestrator.relocateSessionWorkingDir(
          params.sessionId,
          params.newWorkingDir
        );
      }
    );

    this.gatewayServer.registerHandler('session:interrupted', async () => {
      return {
        interruptedSessions: this.storage.listInterruptedSessions(),
      };
    });

    this.gatewayServer.registerHandler(
      'session:queue:save',
      async (params: { sessionId: string; items: any[] }) => {
        if (!params?.sessionId || !Array.isArray(params?.items)) {
          throw new DaemonRpcError(
            DaemonErrorCode.INVALID_PARAMS,
            'sessionId and items[] are required'
          );
        }
        return this.orchestrator.saveSessionInputQueue(params.sessionId, params.items);
      }
    );

    this.gatewayServer.registerHandler(
      'session:queue:load',
      async (params: { sessionId: string }) => {
        if (!params?.sessionId) {
          throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'sessionId is required');
        }
        return {
          sessionId: params.sessionId,
          items: this.orchestrator.loadSessionInputQueue(params.sessionId),
        };
      }
    );

    this.gatewayServer.registerHandler(
      'session:queue:clear',
      async (params: { sessionId: string }) => {
        if (!params?.sessionId) {
          throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'sessionId is required');
        }
        this.orchestrator.clearSessionInputQueue(params.sessionId);
        return { sessionId: params.sessionId, cleared: true };
      }
    );

    this.gatewayServer.registerHandler(
      'agent:speaker-status',
      async (params: { roomId: string }) => {
        if (!params?.roomId) {
          throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'roomId is required');
        }
        return this.orchestrator.getSingleSpeakerStatus(params.roomId);
      }
    );

    // 5. room:*
    this.gatewayServer.registerHandler('room:create', async (params) => {
      if (!params?.name) {
        throw new DaemonRpcError(
          DaemonErrorCode.INVALID_PARAMS,
          'name is required for room:create'
        );
      }
      return this.storage.createRoom(params);
    });

    this.gatewayServer.registerHandler('room:get', async (params: { roomId: string }) => {
      if (!params?.roomId) {
        throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'roomId is required');
      }
      const room = this.storage.getRoom(params.roomId);
      if (!room) {
        throw new DaemonRpcError(DaemonErrorCode.ROOM_NOT_FOUND, `Room '${params.roomId}' not found`);
      }
      const blackboard = this.storage.readBlackboard(params.roomId);
      return { room, blackboard };
    });

    // 6. worker:*
    this.gatewayServer.registerHandler('worker:task:execute', async (params) => {
      if (!params?.taskId || !params?.command) {
        throw new DaemonRpcError(
          DaemonErrorCode.INVALID_PARAMS,
          'taskId and command are required for worker:task:execute'
        );
      }
      return await this.workerManager.executeTask(params);
    });

    this.gatewayServer.registerHandler('worker:task:kill', async (params: { taskId: string }) => {
      if (!params?.taskId) {
        throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'taskId is required');
      }
      const killed = this.workerManager.killTask(params.taskId);
      return { taskId: params.taskId, killed };
    });
  }

  /**
   * Relay internal agent / worker events into topic-scoped pushes.
   */
  private wirePushEventRelays(): void {
    // 1. turn_start
    this.orchestrator.on('turn.start', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:turn_start', data);
      this.gatewayServer.push('*', 'agent:turn_start', data);
    });

    // 2. thinking
    this.orchestrator.on('stream.thinking', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:thinking', data);
    });

    // 3. tool_use & tool_result
    this.orchestrator.on('tool.use', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:tool_use', data);
    });

    this.orchestrator.on('tool.result', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:tool_result', data);
    });

    // 4. text_delta
    this.orchestrator.on('stream.delta', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:text_delta', data);
    });

    // 5. turn_complete
    this.orchestrator.on('turn.complete', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:turn_complete', data);
      this.gatewayServer.push('*', 'agent:turn_complete', data);
    });

    // 6. turn_interrupted
    this.orchestrator.on('turn.interrupted', (data) => {
      const topic = data.directSessionId ? `direct:${data.directSessionId}` : `session:${data.roomId}`;
      this.gatewayServer.push(topic, 'agent:turn_interrupted', data);
    });

    // 7. Rewind & Compaction lifecycle push events
    this.orchestrator.on('session.rewound', (data) => {
      this.gatewayServer.push(`session:${data.sessionId}`, 'session:rewound', data);
      this.gatewayServer.push('*', 'session:rewound', data);
    });

    this.orchestrator.on('session.compacted', (data) => {
      this.gatewayServer.push(`session:${data.sessionId}`, 'session:compacted', data);
      this.gatewayServer.push('*', 'session:compacted', data);
    });

    this.orchestrator.on('memory.flush.threshold', (data) => {
      this.gatewayServer.push(`session:${data.sessionId}`, 'memory:flush_threshold', data);
      this.gatewayServer.push('*', 'memory:flush_threshold', data);
    });

    // Legacy stream.chunk & blackboard / worker
    this.orchestrator.on('stream.chunk', (data) => {
      this.gatewayServer.push(`session:${data.roomId}`, 'agent:stream_chunk', data);
      this.gatewayServer.push('*', 'agent:stream_chunk', data);
    });

    this.orchestrator.on('blackboard.updated', (data) => {
      this.gatewayServer.push(`blackboard:${data.roomId}`, 'blackboard:updated', data);
      this.gatewayServer.push('*', 'blackboard:updated', data);
    });

    this.workerManager.on('worker.stdout', (data) => {
      this.gatewayServer.push(`task:${data.taskId}`, 'worker:stdout', data);
    });

    this.workerManager.on('worker.stderr', (data) => {
      this.gatewayServer.push(`task:${data.taskId}`, 'worker:stderr', data);
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;

    this.checkAndAcquirePidLock();

    this.startTime = Date.now();
    this.backpressure.startWatchdog(() => {});

    const actualPort = await this.gatewayServer.start();
    this.config.httpPort = actualPort;

    this.isRunning = true;
    this.emit('started', {
      httpPort: this.config.httpPort,
      pid: process.pid,
    });
  }

  private checkAndAcquirePidLock(): void {
    if (fs.existsSync(this.pidFilePath)) {
      try {
        const existingPidStr = fs.readFileSync(this.pidFilePath, 'utf-8').trim();
        const existingPid = parseInt(existingPidStr, 10);
        if (Number.isFinite(existingPid)) {
          process.kill(existingPid, 0);
          throw new Error(
            `Another daemon instance is already running with PID ${existingPid}. Stop it first.`
          );
        }
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          // Stale PID file
        } else if (err.message.includes('Another daemon')) {
          throw err;
        }
      }
    }

    fs.writeFileSync(this.pidFilePath, String(process.pid), 'utf-8');
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.backpressure.stopWatchdog();
    await this.gatewayServer.stop();
    this.workerManager.shutdown();

    if (fs.existsSync(this.pidFilePath)) {
      try {
        fs.unlinkSync(this.pidFilePath);
      } catch {}
    }

    this.isRunning = false;
    this.emit('stopped');
  }

  public getStatus(): DaemonStatusResult {
    return {
      pid: process.pid,
      uptimeSeconds: this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      socketPath: 'gateway://websocket',
      httpPort: this.config.httpPort,
      activeConnections: this.gatewayServer.getActiveClientsCount(),
      registeredBotsCount: this.storage.listBots().length,
      activeRoomsCount: 0,
      memoryUsage: process.memoryUsage(),
    };
  }

  public getStorage(): StorageManager {
    return this.storage;
  }

  public getRuntime(): RuntimeEnvironment {
    return this.runtime;
  }

  public getOrchestrator(): AgentOrchestrator {
    return this.orchestrator;
  }

  public getConfigLoader(): UniversalConfigLoader {
    return this.configLoader;
  }

  public getWorkerManager(): WorkerManager {
    return this.workerManager;
  }

  public getGatewayServer(): GatewayServer {
    return this.gatewayServer;
  }

  public getConfig(): MultiAgentDaemonConfig {
    return { ...this.config };
  }
}
