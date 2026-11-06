/**
 * @file src/daemon/gateway/protocol.ts
 * @description Cindy-style Device Gateway Protocol Definitions.
 * Single unified envelope for invoke, invoke-result, push, ping, and pong.
 * Zero redundant protocols: all endpoints (CLI, Web, Mobile) speak this contract.
 */

export const PROTOCOL_VERSION = 1;

export type EnvelopeKind = 
  | 'invoke' 
  | 'invoke-result' 
  | 'push' 
  | 'ping' 
  | 'pong' 
  | 'link-open' 
  | 'link-accept' 
  | 'link-close';

export interface Envelope<T = any> {
  kind: EnvelopeKind;
  id: string;              // UUIDv4
  src?: string;            // Sender deviceId/clientId
  dst?: string;            // Target deviceId/gatewayId
  payload: T;
  timestamp: number;
}

export interface InvokePayload<TArgs = any> {
  channel: string;         // Whitelisted channel, e.g. "agent:chat", "room:create"
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
  topic: string;           // Subscription topic, e.g. "session:<id>", "blackboard:<roomId>"
  event: string;           // Event name, e.g. "stream_chunk", "blackboard_updated"
  data: TData;
}

export interface LinkOpenPayload {
  clientName: string;
  clientType: 'cli' | 'desktop' | 'mobile' | 'web';
  capabilities?: string[];
  token?: string;          // Optional auth token
}

export interface LinkAcceptPayload {
  gatewayId: string;
  gatewayVersion: string;
  allowlistHash: string;
  capabilities: string[];
}

