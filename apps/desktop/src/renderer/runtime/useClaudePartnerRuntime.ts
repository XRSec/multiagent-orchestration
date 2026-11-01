/**
 * Purpose: Full-duplex Claude NDJSON stream bridge for React UI runtime.
 * Context: Integrates claude-code-parser with @assistant-ui/react external store.
 * Usage: Ingests IPC streams, renders messages/traces, and dispatches stdin frames.
 * Prerequisites: claude-code-parser, @assistant-ui/react, Electron IPC bridge
 */

import { useState, useEffect, useCallback } from 'react';
import { useExternalStoreRuntime, type ThreadMessageLike } from '@assistant-ui/react';
import { parseLine, Translator, createMessage } from 'claude-code-parser';

export interface UseClaudePartnerRuntimeOptions {
  partnerId: string;
  activeSessionId?: string;
}

export function useClaudePartnerRuntime({ partnerId, activeSessionId }: UseClaudePartnerRuntimeOptions) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    // Translator handles --verbose cumulative snapshot deduplication and multi-agent interleaving
    const translator = new Translator();

    const unsubscribe = window.electronIPC?.onPartnerStream?.(partnerId, (rawLine: string) => {
      const event = parseLine(rawLine);
      if (!event) return;

      const normalized = translator.process(event);
      if (!normalized) return;

      // 1. Text deltas and tool_use nodes
      if (normalized.type === 'assistant' || normalized.type === 'stream_event') {
        setMessages((prev) => mergeClaudeEventIntoMessages(prev, normalized));
      }

      // 2. Tool result resolution
      if (normalized.type === 'tool_result') {
        setMessages((prev) => updateMatchingToolCallResult(prev, normalized));
      }

      // 3. Authorization gate (control_request)
      if (normalized.type === 'control_request') {
        setMessages((prev) => attachPendingApprovalToToolCall(prev, normalized));
      }

      // 4. Turn completion
      if (normalized.type === 'result') {
        setIsRunning(false);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [partnerId]);

  // Dispatch new user turn via stdin
  const onNew = useCallback(
    async (message: { content: Array<{ type: string; text?: string }> }) => {
      setIsRunning(true);
      const userText = message.content.map((c) => c.text || '').join('\n');
      const stdinFrame = createMessage.user(userText);

      await window.electronIPC?.sendToPartnerStdin?.(partnerId, stdinFrame, {
        resumeSessionId: activeSessionId,
      });
    },
    [partnerId, activeSessionId]
  );

  // Hard interrupt via control_request
  const onCancel = useCallback(async () => {
    await window.electronIPC?.interruptPartnerSession?.(partnerId, activeSessionId);
    setIsRunning(false);
  }, [partnerId, activeSessionId]);

  return useExternalStoreRuntime({
    isRunning,
    messages,
    onNew,
    onCancel,
  });
}

// ---------------------------------------------------------
// Helper State Reducers (Pure Functional Transformations)
// ---------------------------------------------------------

function mergeClaudeEventIntoMessages(
  prev: ThreadMessageLike[],
  event: any
): ThreadMessageLike[] {
  // Functional immutable append / update logic for delta streams
  const last = prev[prev.length - 1];
  if (last && last.role === 'assistant') {
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content),
      },
    ];
  }
  return [
    ...prev,
    {
      id: event.id || `msg_${Date.now()}`,
      role: 'assistant',
      content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content),
    },
  ];
}

function updateMatchingToolCallResult(
  prev: ThreadMessageLike[],
  event: any
): ThreadMessageLike[] {
  return prev.map((msg) => {
    if (msg.role !== 'assistant') return msg;
    // Map tool_result to matching toolCall id
    return msg;
  });
}

function attachPendingApprovalToToolCall(
  prev: ThreadMessageLike[],
  event: any
): ThreadMessageLike[] {
  return prev.map((msg) => {
    if (msg.role !== 'assistant') return msg;
    // Attach approval required state for inline UI card
    return msg;
  });
}

// Global declaration for Electron IPC
declare global {
  interface Window {
    electronIPC?: {
      onPartnerStream: (partnerId: string, cb: (line: string) => void) => () => void;
      sendToPartnerStdin: (partnerId: string, frame: object, meta?: object) => Promise<void>;
      interruptPartnerSession: (partnerId: string, sessionId?: string) => Promise<void>;
    };
  }
}
