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
      heartbeatIntervalMs: customConfig?.heartbeatIntervalMs ?? 10000,
      leaseTimeoutMs: customConfig?.leaseTimeoutMs ?? 30000,
    };

    fs.mkdirSync(this.config.dataDir, { recursive: true });
    this.pidFilePath = path.join(this.config.dataDir, 'daemon.pid');

    // Subsystems
    this.storage = new StorageManager(this.config.dataDir);
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
    this.gatewayServer.registerHandler('system:ping', async () => ({ pong: true, timestamp: Date.now() }));

    // 2. agent:*
    this.gatewayServer.registerHandler('agent:list', async () => {
      return this.storage.listBots();
    });

    this.gatewayServer.registerHandler('agent:get', async (params: { botId: string }) => {
      if (!params?.botId) throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'botId is required');
      const bot = this.storage.getBot(params.botId);
      if (!bot) throw new DaemonRpcError(DaemonErrorCode.BOT_NOT_FOUND, `Bot '${params.botId}' not found`);
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
      });
    });

    this.gatewayServer.registerHandler('agent:abort', async (params: { roomId?: string; turnId?: string; directSessionId?: string }) => {
      const targetId = params?.roomId || params?.directSessionId || 'multiagent-orchestration';
      let stopped = false;
      if (typeof (this.orchestrator as any).abortExecution === 'function') {
        stopped = (this.orchestrator as any).abortExecution(targetId);
      }
      const topic = params?.directSessionId ? `direct:${params.directSessionId}` : `session:${targetId}`;
      this.gatewayServer.push(topic, 'agent:turn_interrupted', {
        turnId: params?.turnId || `turn_${Date.now()}`,
        abortedAt: Date.now(),
        reason: 'user_aborted',
        stopped
      });
      return { status: 'aborted', targetId, stopped };
    });

    this.gatewayServer.registerHandler('session:history', async (params: { roomId?: string; sessionId?: string; afterSequence?: number; limit?: number }) => {
      const targetRoomId = params?.roomId || (params?.sessionId ? params.sessionId.replace('session_', '') : 'multiagent-orchestration');
      const afterSeq = params?.afterSequence ?? 0;
      const limit = params?.limit ?? 100;
      const messages = this.storage.getMessagesSince(targetRoomId, afterSeq);
      const sliced = limit > 0 ? messages.slice(0, limit) : messages;
      return {
        roomId: targetRoomId,
        messages: sliced.map((m) => ({
          id: m.id,
          groupId: targetRoomId,
          sequence: m.sequence,
          authorKind: m.sender_role === 'assistant' ? 'bot' : 'user',
          authorBotId: m.sender_role === 'assistant' ? m.sender_id : undefined,
          authorName: m.sender_id,
          content: m.content,
          createdAt: new Date(m.created_at).toISOString(),
        })),
      };
    });

    this.gatewayServer.registerHandler('session:list', async () => {
      let rooms: any[] = [];
      try {
        const db = (this.storage as any).db;
        if (db && typeof db.prepare === 'function') {
          rooms = db.prepare('SELECT id, slug, name, updated_at FROM rooms ORDER BY updated_at DESC').all();
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

    this.gatewayServer.registerHandler('agent:speaker-status', async (params: { roomId: string }) => {
      if (!params?.roomId) throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'roomId is required');
      return this.orchestrator.getSingleSpeakerStatus(params.roomId);
    });

    // 3. room:*
    this.gatewayServer.registerHandler('room:create', async (params) => {
      if (!params?.name) {
        throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'name is required for room:create');
      }
      return this.storage.createRoom(params);
    });

    this.gatewayServer.registerHandler('room:get', async (params: { roomId: string }) => {
      if (!params?.roomId) throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'roomId is required');
      const room = this.storage.getRoom(params.roomId);
      if (!room) throw new DaemonRpcError(DaemonErrorCode.ROOM_NOT_FOUND, `Room '${params.roomId}' not found`);
      const blackboard = this.storage.readBlackboard(params.roomId);
      return { room, blackboard };
    });

    // 4. worker:*
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
      if (!params?.taskId) throw new DaemonRpcError(DaemonErrorCode.INVALID_PARAMS, 'taskId is required');
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
    this.backpressure.startWatchdog((deadConnId) => {
      // Clean dead connections
    });

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
      } catch {
        // safe
      }
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
