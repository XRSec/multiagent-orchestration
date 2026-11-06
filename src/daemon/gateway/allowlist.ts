/**
 * @file src/daemon/gateway/allowlist.ts
 * @description Security allowlists for remote invocations and push forwarding.
 * Modeled after Cindy's REMOTE_INVOKE_ALLOWLIST and PUSH_FORWARD_ALLOWLIST.
 */

import * as crypto from 'crypto';

/**
 * All allowed remote invoke channels.
 * Default-deny: Any channel not explicitly listed here is rejected.
 */
export const REMOTE_INVOKE_ALLOWLIST = [
  // System & Health
  'system:status',
  'system:ping',
  
  // Agent & Orchestration (Web Client Core)
  'agent:list',
  'agent:get',
  'agent:chat',
  'agent:abort',
  'agent:speaker-status',
  'agent:get-context',
  
  // Session & Message History (Web Client Core)
  'session:list',
  'session:history',
  
  // Room & Blackboard
  'room:create',
  'room:get',
  'room:subscribe',
  'room:unsubscribe',
  'room:blackboard:read',
  'room:blackboard:update',
  
  // Task & Worker Execution
  'worker:task:execute',
  'worker:task:kill',
  
  // Gateway Subscriptions
  'gateway:subscribe',
  'gateway:unsubscribe',
] as const;

export type AllowedRemoteChannel = (typeof REMOTE_INVOKE_ALLOWLIST)[number];

export const PUSH_FORWARD_ALLOWLIST = [
  // 7-Frame Streaming Contract
  'agent:turn_start',
  'agent:thinking',
  'agent:tool_use',
  'agent:tool_result',
  'agent:text_delta',
  'agent:turn_complete',
  'agent:turn_interrupted',
  
  // Legacy / Raw chunk compatibility
  'agent:stream_chunk',
  
  // Blackboard & Coordination
  'blackboard:updated',
  'circuit_breaker:tripped',
  
  // Worker Execution
  'worker:stdout',
  'worker:stderr',
] as const;

export type AllowedPushEvent = (typeof PUSH_FORWARD_ALLOWLIST)[number];

export function isChannelAllowed(channel: string): boolean {
  return (REMOTE_INVOKE_ALLOWLIST as readonly string[]).includes(channel);
}

export function isPushEventAllowed(event: string): boolean {
  return (PUSH_FORWARD_ALLOWLIST as readonly string[]).includes(event);
}

/**
 * Computes deterministic hash of the allowlist for client version checking
 */
export function computeAllowlistHash(): string {
  const sorted = [...REMOTE_INVOKE_ALLOWLIST].sort().join('\n');
  return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}

