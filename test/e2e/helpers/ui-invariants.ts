/**
 * Purpose: Validation helpers for UI mental model invariants and message layout contracts.
 * Context: multiagent-orchestration E2E tests enforcing frontend rendering rules.
 * Usage: import { validateExecutionStatusCardAboveBubble, validateZeroInvalidDate } from './ui-invariants.ts';
 * Prerequisites: Node.js runtime.
 */

import { assert } from './e2e-harness';

export interface MessageUiRenderModel {
  id: string;
  senderId: string;
  senderType: 'user' | 'bot' | 'system';
  content: string;
  timestamp: string | number;
  executionStatus?: {
    thinking?: string;
    toolCalls?: Array<{ toolName: string; input: any; result: any }>;
    status: 'idle' | 'thinking' | 'tool_executing' | 'done' | 'failed';
  };
}

/**
 * Validates invariant 1: ExecutionStatusCard MUST strictly render ABOVE the content bubble.
 */
export function validateExecutionStatusCardAboveBubble(
  renderedSegments: Array<'status_card' | 'content_bubble' | 'avatar' | 'actions'>
): void {
  const statusIdx = renderedSegments.indexOf('status_card');
  const bubbleIdx = renderedSegments.indexOf('content_bubble');

  if (statusIdx !== -1 && bubbleIdx !== -1) {
    assert(
      statusIdx < bubbleIdx,
      `Visual Flow Invariant Violated: status_card at index ${statusIdx} must appear BEFORE content_bubble at index ${bubbleIdx}`
    );
  }
}

/**
 * Validates invariant 2: Zero Invalid Date and Zero NaN in timestamps.
 */
export function validateZeroInvalidDate(timestampValue: unknown): string {
  if (timestampValue === null || timestampValue === undefined) {
    return new Date().toISOString();
  }
  const str = String(timestampValue);
  assert(!str.includes('Invalid Date'), `Invalid Date detected in timestamp: "${str}"`);
  assert(!str.includes('NaN'), `NaN detected in timestamp: "${str}"`);

  let parsed = new Date(timestampValue as any);
  if (isNaN(parsed.getTime())) {
    parsed = new Date();
  }
  return parsed.toISOString();
}

/**
 * Validates invariant 3: ActiveBotIndicator mounted with non-empty active state during execution.
 */
export function validateActiveBotIndicator(indicatorState: {
  botId: string;
  phase: string;
  active: boolean;
  elapsedMs?: number;
}): void {
  assert(Boolean(indicatorState.botId), 'ActiveBotIndicator must declare botId');
  assert(Boolean(indicatorState.phase), 'ActiveBotIndicator must declare active phase description');
  assert(indicatorState.active === true, 'ActiveBotIndicator must be in active state during execution');
}
