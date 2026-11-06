/**
 * Purpose: Hook for managing message history, optimistic submission, state transitions,
 *          and real-time full-duplex WebSocket JSON-RPC communication for a multi-agent room.
 * Context: Cindy-style Unified Device Gateway, strictly monotonic sequence ordering,
 *          ExecutionStatusCard rendering above bubble, zero Invalid Date, zero mock simulation.
 * Usage: const { messages, isThinking, activeBot, isSubmitting, sendMessage, stopGenerating, deleteMessage, recallAndEdit } = useRoomMessages(groupId, partnerMap);
 * Prerequisites: React 19, useGatewaySocket, ExecutionStatus types.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type {
  GroupMessage,
  PartnerInfo,
  ExecutionStatus,
  ToolCallItem,
  ActiveBotState,
} from '@/types/room';
import { useGatewaySocket } from './useGatewaySocket';
import type { StreamFrameEvent } from '@/services/gateway/types';

export type { ActiveBotState };

export function toSafeIsoString(input?: string | number | null): string {
  if (!input) return new Date().toISOString();
  if (typeof input === 'number') {
    const ms = input < 1e11 ? input * 1000 : input;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  const d = new Date(input);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function useRoomMessages(groupId: string, partnerMap: Record<string, PartnerInfo>) {
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [activeBot, setActiveBot] = useState<ActiveBotState | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { invoke, subscribe } = useGatewaySocket();
  const partnerMapRef = useRef(partnerMap);
  partnerMapRef.current = partnerMap;

  // 1. Fetch message history (prioritize WebSocket invoke('session:history'), HTTP fallback)
  const fetchHistory = useCallback(async () => {
    if (!groupId) return;
    try {
      let serverMessages: GroupMessage[] | null = null;

      try {
        const res = await invoke<{ ok?: boolean; messages?: GroupMessage[] }>(
          'session:history',
          { roomId: groupId },
          5000
        );
        if (res && Array.isArray(res.messages)) {
          serverMessages = res.messages;
        }
      } catch {
        // Fallback to REST API if gateway is not ready
      }

      if (!serverMessages) {
        const res = await fetch(`/api/rooms/${encodeURIComponent(groupId)}/messages`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.messages)) {
            serverMessages = data.messages;
          }
        }
      }

      if (serverMessages && serverMessages.length > 0) {
        setMessages((prev) => {
          const map = new Map<string, GroupMessage>();
          for (const m of serverMessages!) {
            map.set(m.id, m);
          }
          // Preserve optimistic pending client messages
          for (const m of prev) {
            if (
              m.id.startsWith('msg_client_') ||
              m.id.startsWith('optimistic-') ||
              m.id.startsWith('temp-') ||
              m.id.startsWith('temp_')
            ) {
              if (!map.has(m.id)) {
                map.set(m.id, m);
              }
            }
          }
          return Array.from(map.values()).sort((a, b) => a.sequence - b.sequence);
        });
      }
    } catch (e: any) {
      console.warn('[useRoomMessages] fetchHistory fallback error:', e?.message || e);
    }
  }, [groupId, invoke]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // 2. Full-duplex WebSocket push subscription: topic = session:<groupId>
  useEffect(() => {
    if (!groupId) return;

    const topic = `session:${groupId}`;
    const unsubscribe = subscribe(topic, (streamEvent: StreamFrameEvent) => {
      const { event, data } = streamEvent;
      const currentPartners = partnerMapRef.current;

      switch (event) {
        case 'agent:turn_start': {
          const partner = data.botId ? currentPartners[data.botId] : undefined;
          const startTime = data.startedAt || Date.now();
          setIsThinking(true);
          setActiveBot({
            name: data.botName || partner?.name || data.botId || 'moAdmin',
            avatarUrl: data.avatarUrl || partner?.avatarUrl || '/assets/agent-island-cindy.png',
            badgeText: data.badgeText || partner?.badgeText || partner?.role || '智能伙伴',
            statusText: data.statusText || `${data.botName || partner?.name || '智能体'} 正在分析并调度工具链...`,
            startedAt: startTime,
            currentTool: undefined,
            toolDescription: undefined,
          });

          setMessages((prev) => {
            const existingIdx = prev.findIndex((m) => m.id === data.turnId);
            const highestSeq = prev.length > 0 ? Math.max(...prev.map((m) => m.sequence)) : 0;
            const nextSeq = data.sequence || highestSeq + 1;

            const initialMsg: GroupMessage = {
              id: data.turnId,
              groupId,
              sequence: nextSeq,
              authorKind: 'bot',
              authorBotId: data.botId,
              authorName: data.botName || partner?.name || data.botId || 'moAdmin',
              content: '',
              createdAt: toSafeIsoString(startTime),
              executionStatus: {
                state: 'thinking',
                currentPhaseText: `${data.botName || partner?.name || '智能体'} 正在思考规划...`,
                thinking: {
                  text: '',
                  startedAt: startTime,
                },
                tools: [],
                latency: {
                  startedAt: startTime,
                  thinkingMs: 0,
                  toolMs: 0,
                  totalMs: 0,
                },
              },
            };

            if (existingIdx >= 0) {
              const updated = [...prev];
              updated[existingIdx] = { ...updated[existingIdx], ...initialMsg };
              return updated;
            }
            return [...prev, initialMsg].sort((a, b) => a.sequence - b.sequence);
          });
          break;
        }

        case 'agent:thinking': {
          setIsThinking(true);
          setActiveBot((prev) =>
            prev
              ? {
                  ...prev,
                  statusText: data.phase || `${prev.name} 正在深度思考规划...`,
                }
              : prev
          );

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== data.turnId) return m;
              const prevText = m.executionStatus?.thinking?.text || '';
              const delta = data.delta || data.thinking_delta || '';
              const fullThinking = data.accumulated || data.accumulatedText || prevText + delta;
              const startedAt = m.executionStatus?.thinking?.startedAt || Date.now();
              const durationMs = Math.max(0, Date.now() - startedAt);

              return {
                ...m,
                executionStatus: {
                  ...m.executionStatus,
                  state: 'thinking',
                  currentPhaseText: data.phase || `${m.authorName} 正在深度思考规划...`,
                  thinking: {
                    text: fullThinking,
                    startedAt,
                    durationMs,
                    durationSeconds: Number((durationMs / 1000).toFixed(2)),
                  },
                  latency: {
                    ...m.executionStatus?.latency,
                    thinkingMs: durationMs,
                  },
                },
              };
            })
          );
          break;
        }

        case 'agent:tool_use': {
          setIsThinking(true);
          const toolName = data.toolName || data.tool || 'tool_executing';
          const toolCallId = data.toolCallId || data.toolId || `call_${Date.now()}`;
          const toolDesc = data.description || `正在执行工具: ${toolName}`;

          setActiveBot((prev) =>
            prev
              ? {
                  ...prev,
                  statusText: `正在调用工具: ${toolName}...`,
                  currentTool: toolName,
                  toolDescription: toolDesc,
                }
              : prev
          );

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== data.turnId) return m;
              const existingTools = m.executionStatus?.tools || [];
              const toolIdx = existingTools.findIndex((t) => t.id === toolCallId);

              const newToolItem: ToolCallItem = {
                id: toolCallId,
                tool: toolName,
                description: toolDesc,
                args: data.input || data.args,
                status: 'running',
                startedAt: data.startedAt || Date.now(),
              };

              const updatedTools =
                toolIdx >= 0
                  ? existingTools.map((t, idx) => (idx === toolIdx ? { ...t, ...newToolItem } : t))
                  : [...existingTools, newToolItem];

              return {
                ...m,
                executionStatus: {
                  ...m.executionStatus,
                  state: 'tool_executing',
                  currentPhaseText: `正在执行工具: ${toolName}...`,
                  tools: updatedTools,
                },
              };
            })
          );
          break;
        }

        case 'agent:tool_result': {
          const toolCallId = data.toolCallId || data.toolId;
          const isFailed = Boolean(data.isError || data.status === 'failed');
          const output = data.result !== undefined ? data.result : data.output;
          const duration = data.durationMs || 0;

          setActiveBot((prev) =>
            prev
              ? {
                  ...prev,
                  statusText: '工具执行完成，分析输出中...',
                }
              : prev
          );

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== data.turnId) return m;
              const existingTools = m.executionStatus?.tools || [];
              const updatedTools = existingTools.map((t) => {
                if (
                  (toolCallId && t.id === toolCallId) ||
                  (!toolCallId && t.tool === (data.toolName || data.tool))
                ) {
                  return {
                    ...t,
                    output,
                    status: isFailed ? ('failed' as const) : ('success' as const),
                    durationMs: duration,
                    completedAt: data.completedAt || Date.now(),
                  };
                }
                return t;
              });

              const totalToolMs = updatedTools.reduce((acc, cur) => acc + (cur.durationMs || 0), 0);

              return {
                ...m,
                executionStatus: {
                  ...m.executionStatus,
                  state: m.executionStatus?.state || 'tool_executing',
                  tools: updatedTools,
                  latency: {
                    ...m.executionStatus?.latency,
                    toolMs: totalToolMs,
                  },
                },
              };
            })
          );
          break;
        }

        case 'agent:text_delta': {
          setActiveBot((prev) =>
            prev
              ? {
                  ...prev,
                  statusText: '正在生成回答内容...',
                  currentTool: 'output_stream',
                  toolDescription: '流式生成输出文本',
                }
              : prev
          );

          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== data.turnId) return m;
              const delta = data.delta || data.text_delta || '';
              const nextContent =
                data.accumulatedText !== undefined ? data.accumulatedText : m.content + delta;
              return {
                ...m,
                content: nextContent,
              };
            })
          );
          break;
        }

        case 'agent:turn_complete': {
          setMessages((prev) => {
            if (data.message && data.message.id) {
              const filtered = prev.filter(
                (m) => m.id !== data.message.id && m.id !== data.turnId
              );
              filtered.push(data.message);
              return filtered.sort((a, b) => a.sequence - b.sequence);
            }

            return prev.map((m) => {
              if (m.id !== data.turnId) return m;
              const finalContent = data.text !== undefined ? data.text : m.content;
              const startedAt = m.executionStatus?.latency?.startedAt || Date.now();
              const totalMs = data.metrics?.durationMs || Math.max(0, Date.now() - startedAt);

              return {
                ...m,
                content: finalContent,
                executionStatus: {
                  ...m.executionStatus,
                  state: 'done',
                  currentPhaseText: '协同执行完成 · 生产就绪',
                  latency: {
                    ...m.executionStatus?.latency,
                    totalMs,
                    completedAt: Date.now(),
                  },
                },
              };
            });
          });

          if (data.isFinal !== false) {
            setIsThinking(false);
            setActiveBot(undefined);
            setIsSubmitting(false);
          }
          break;
        }

        case 'agent:turn_interrupted': {
          if (data.turnId) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.turnId
                  ? {
                      ...m,
                      executionStatus: {
                        ...m.executionStatus,
                        state: 'aborted',
                        currentPhaseText: data.reason || '已中断执行',
                      },
                    }
                  : m
              )
            );
          }
          setIsThinking(false);
          setActiveBot(undefined);
          setIsSubmitting(false);
          break;
        }

        case 'message:deleted':
        case 'message_deleted': {
          if (data.messageId) {
            setMessages((prev) => prev.filter((m) => m.id !== data.messageId));
          }
          break;
        }

        default:
          break;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [groupId, subscribe]);

  // 3. Send message via WebSocket invoke('agent:chat'), eliminating fake dialogues
  const sendMessage = async (
    content: string,
    authorName = '我 (测试发送者)',
    targetBotId?: string
  ): Promise<boolean> => {
    const trimmed = content.trim();
    if (!trimmed || isSubmitting) return false;

    const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempId = `temp_${clientId}`;
    const highestSeq = messages.length > 0 ? Math.max(...messages.map((m) => m.sequence)) : 0;
    const optimisticSeq = highestSeq + 1;
    const nowIso = new Date().toISOString();

    // Optimistic user message with safe ISO timestamp
    const optimisticMsg: GroupMessage = {
      id: tempId,
      groupId,
      sequence: optimisticSeq,
      authorKind: 'user',
      authorName,
      content: trimmed,
      clientId,
      createdAt: nowIso,
      executionStatus: {
        state: 'done',
        currentPhaseText: '消息已投递至统一设备网关',
        latency: {
          startedAt: Date.now(),
          completedAt: Date.now(),
          totalMs: 15,
        },
      },
    };

    setMessages((prev) => [...prev, optimisticMsg].sort((a, b) => a.sequence - b.sequence));
    setIsSubmitting(true);

    // Mount ActiveBotIndicator instantly for immediate feedback (Invariant 2)
    setIsThinking(true);
    const leadBot = partnerMap[targetBotId || 'bot_moadmin_director_03'];
    setActiveBot({
      name: leadBot?.name || 'moAdmin',
      avatarUrl: leadBot?.avatarUrl || '/assets/agent-island-cindy.png',
      badgeText: leadBot?.badgeText || '编排主管',
      statusText: '正在分析需求并调度多智能体工具链...',
      startedAt: Date.now(),
      currentTool: 'dispatch',
      toolDescription: '正在分析协同上下文并调度多智能体工具链',
    });

    try {
      // Invoke remote gateway channel
      await invoke<{ status: string; turnId?: string; messageId?: string }>('agent:chat', {
        roomId: groupId,
        text: trimmed,
        botId: targetBotId || undefined,
        authorName,
        clientId,
      });
      return true;
    } catch (err: any) {
      console.warn('[useRoomMessages] invoke agent:chat failed, attempting HTTP fallback:', err);
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(groupId)}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: trimmed, authorName, clientId, botId: targetBotId }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.message) {
            setMessages((prev) => {
              const filtered = prev.filter((m) => m.id !== tempId && m.clientId !== clientId);
              filtered.push(data.message);
              return filtered.sort((a, b) => a.sequence - b.sequence);
            });
            return true;
          }
        }
      } catch (fallbackErr: any) {
        console.error('[useRoomMessages] HTTP fallback failed:', fallbackErr);
        setError(fallbackErr?.message || '发送失败');
      }
      setIsThinking(false);
      setActiveBot(undefined);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Abort turn execution: invoke('agent:abort')
  const stopGenerating = useCallback(async () => {
    setIsThinking(false);
    setActiveBot(undefined);
    setIsSubmitting(false);
    try {
      await invoke('agent:abort', { roomId: groupId });
    } catch {
      try {
        await fetch(`/api/rooms/${encodeURIComponent(groupId)}/abort`, { method: 'POST' });
      } catch {}
    }
  }, [groupId, invoke]);

  // 5. Delete message: invoke('message:delete') with HTTP fallback
  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      try {
        await invoke('message:delete', { roomId: groupId, messageId });
        return true;
      } catch {
        try {
          const res = await fetch(
            `/api/rooms/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`,
            { method: 'DELETE' }
          );
          return res.ok;
        } catch {
          return false;
        }
      }
    },
    [groupId, invoke]
  );

  // 6. Recall and edit message
  const recallAndEdit = useCallback(
    async (messageId: string): Promise<string | null> => {
      const target = messages.find((m) => m.id === messageId);
      const content = target ? target.content : null;
      await stopGenerating();
      await deleteMessage(messageId);
      return content;
    },
    [messages, stopGenerating, deleteMessage]
  );

  return {
    messages,
    isThinking,
    activeBot,
    isSubmitting,
    error,
    sendMessage,
    stopGenerating,
    deleteMessage,
    recallAndEdit,
    refreshMessages: fetchHistory,
  };
}
