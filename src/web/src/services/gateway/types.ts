/**
 * Purpose: TypeScript protocol definitions for Cindy-style Unified Device Gateway.
 * Context: Matches src/daemon/gateway/protocol.ts and PROJECT.md streaming contract.
 * Usage: import type { Envelope, StreamFrameEvent, ConnectionState } from '@/services/gateway/types';
 * Prerequisites: TypeScript 5.0+.
 */

export const PROTOCOL_VERSION = 1;

export type EnvelopeKind =
  | 'link-open'
  | 'link-accept'
  | 'link-close'
  | 'invoke'
  | 'invoke-result'
  | 'push'
  | 'ping'
  | 'pong';

export interface Envelope<T = any> {
  kind: EnvelopeKind;
  id: string;              // UUIDv4
  src?: string;            // Client ID (e.g. client_xxxx)
  dst?: string;            // Gateway ID (e.g. gw_xxxx)
  payload: T;
  timestamp: number;       // Epoch milliseconds
}

export interface LinkOpenPayload {
  clientName: string;
  clientType: 'web' | 'cli' | 'desktop' | 'mobile';
  capabilities?: string[];
  token?: string;
}

export interface LinkAcceptPayload {
  gatewayId: string;
  gatewayVersion: string;
  allowlistHash: string;
  capabilities: string[];
}

export interface InvokePayload<TArgs = any> {
  channel: string;         // Whitelisted channel (e.g. "agent:chat", "gateway:subscribe")
  args: TArgs;
}

export interface InvokeResultPayload<TResult = any> {
  channel: string;
  result?: TResult;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface PushPayload<TData = any> {
  topic: string;           // e.g. "session:<roomId>", "direct:<sessionId>", "*"
  event: string;           // e.g. "agent:thinking", "agent:tool_use"
  data: TData;
}

export interface PingPongPayload {
  timestamp: number;
}

// 1. Turn Start
export interface TurnStartEventData {
  turnId: string;
  botId: string;
  botName?: string;
  badgeText?: string;
  avatarUrl?: string;
  sequence?: number;
  statusText?: string;
  startedAt?: number;
}

// 2. Thinking Delta
export interface ThinkingEventData {
  turnId: string;
  botId: string;
  delta?: string;
  thinking_delta?: string;
  accumulated?: string;
  accumulatedText?: string;
  phase?: string;
}

// 3. Tool Use Start
export interface ToolUseEventData {
  turnId: string;
  botId: string;
  toolId?: string;
  toolCallId?: string;
  tool?: string;
  toolName?: string;
  args?: any;
  input?: any;
  description?: string;
  status?: 'executing' | 'running';
  startedAt?: number;
}

// 4. Tool Execution Result
export interface ToolResultEventData {
  turnId: string;
  botId: string;
  toolId?: string;
  toolCallId?: string;
  tool?: string;
  toolName?: string;
  output?: any;
  result?: any;
  isError?: boolean;
  status?: 'success' | 'failed';
  durationMs: number;
  completedAt?: number;
}

// 5. Text Streaming Delta
export interface TextDeltaEventData {
  turnId: string;
  botId: string;
  delta?: string;
  text_delta?: string;
  accumulatedText?: string;
}

// 6. Turn Complete
export interface TurnCompleteEventData {
  turnId: string;
  botId: string;
  text?: string;
  status?: 'completed' | 'interrupted';
  sequence?: number;
  isFinal?: boolean;
  message?: any;           // GroupMessage item
  metrics?: {
    durationMs: number;
    tokens?: number;
  };
}

// 7. Turn Interrupted
export interface TurnInterruptedEventData {
  turnId?: string;
  botId?: string;
  abortedAt?: number;
  reason?: string;
  stopped?: boolean;
}

// 7-Frame Streaming Event Union
export type StreamFrameEvent =
  | { topic: string; event: 'agent:turn_start'; data: TurnStartEventData }
  | { topic: string; event: 'agent:thinking'; data: ThinkingEventData }
  | { topic: string; event: 'agent:tool_use'; data: ToolUseEventData }
  | { topic: string; event: 'agent:tool_result'; data: ToolResultEventData }
  | { topic: string; event: 'agent:text_delta'; data: TextDeltaEventData }
  | { topic: string; event: 'agent:turn_complete'; data: TurnCompleteEventData }
  | { topic: string; event: 'agent:turn_interrupted'; data: TurnInterruptedEventData }
  | { topic: string; event: string; data: any };

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'reconnecting';
