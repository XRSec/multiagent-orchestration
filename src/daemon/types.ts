/**
 * @file src/daemon/types.ts
 * @description Multi-Agent Orchestration Daemon Protocol & Core Types.
 * Designed with Paseo-style contract decoupling and Cindy-style multi-agent orchestration.
 */

export interface DaemonConfig {
  projectRoot: string;
  dataDir: string;
  socketPath: string;
  httpPort: number;
  httpHost: string;
  maxSocketBufferedBytes: number; // e.g. 64 * 1024 * 1024 (64 MiB)
  heartbeatIntervalMs: number;
  leaseTimeoutMs: number;
}

export type MessageRole = 'user' | 'bot' | 'system' | 'assistant';

export interface RpcRequestEnvelope<T = any> {
  type: 'request';
  id: string; // UUID v4
  method: string; // e.g. "agent.chat", "room.create", "system.status"
  params: T;
  timestamp: number;
}

export interface RpcResponseEnvelope<T = any> {
  type: 'response';
  id: string; // Corresponds to request.id
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  timestamp: number;
}

export interface RpcEventEnvelope<T = any> {
  type: 'event';
  event: string; // e.g. "message.stream", "blackboard.updated", "agent.state_changed"
  payload: T;
  timestamp: number;
}

export type DaemonMessageEnvelope = 
  | RpcRequestEnvelope 
  | RpcResponseEnvelope 
  | RpcEventEnvelope
  | { type: 'ping'; timestamp: number }
  | { type: 'pong'; timestamp: number };

export interface AgentChatParams {
  roomId: string;
  botId: string;
  threadId?: string;
  content: string;
  role?: MessageRole;
  metadata?: Record<string, any>;
  directSessionId?: string;
}

export interface AgentChatResult {
  messageId: string;
  replyId?: string;
  replyContent?: string;
  botId: string;
  sequence: number;
  tokensUsed?: number;
  blackboardUpdated?: boolean;
}

export interface SingleSpeakerStatus {
  roomId: string;
  currentSpeakerId: string | null;
  mode: 'talk' | 'work' | 'idle';
  turnsCount: number;
  maxTurns: number;
  circuitBreakerTripped: boolean;
  historySummary: string[];
}

export interface WorkerTaskParams {
  taskId: string;
  botId: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface WorkerTaskResult {
  taskId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface DaemonStatusResult {
  pid: number;
  uptimeSeconds: number;
  socketPath: string;
  httpPort: number;
  activeConnections: number;
  registeredBotsCount: number;
  activeRoomsCount: number;
  memoryUsage: NodeJS.MemoryUsage;
}

