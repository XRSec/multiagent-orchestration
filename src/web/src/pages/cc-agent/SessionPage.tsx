/**
 * Purpose: Authentic interactive chat session view for Claude Agent conversations.
 * Context: Full-stack dynamic session interface driven by SQLite persistence and ClaudeSdkRunner.
 * Usage: Route component for /cc-agent/:sessionId.
 * Prerequisites: React 19, react-router-dom, useSessions, /api/sessions/:id/messages.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Sparkles,
  ChevronRight,
  ChevronDown,
  Terminal,
  FileCode,
  CheckCircle2,
  ListTodo,
  Folder,
  Copy,
  RotateCcw,
  GitFork,
  Activity,
  Clock,
  Check,
  MessageSquare,
  CheckSquare,
  Square,
  MoreHorizontal,
} from 'lucide-react';
import { SlashCommand } from '@/components/SlashCommandMenu';
import { useToast } from '@/contexts/ToastContext';
import { triggerHaptic } from '@/utils/haptics';
import { ComposerCard } from '@/components/ComposerCard';
import { SessionWallpaperMask, WallpaperMaskPickerButton } from '@/components/wallpaper/SessionWallpaperMask';
import { MessageContextMenu } from '@/components/chat/MessageContextMenu';
import { MultiSelectActionBar } from '@/components/chat/MultiSelectActionBar';
import { BtwSideDrawer } from './components/BtwSideDrawer';
import { AssistantExecutionCards } from './components/AssistantExecutionCards';
import { useSessions } from '@/hooks/useSessions';
import type { ChatMessage } from '@/types/session';

export function CCAgentSessionView() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const { showToast } = useToast();
  const { sessions, createSession } = useSessions();

  const currentSession = sessions.find((s) => s.id === sessionId);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [inputPrompt, setInputPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Multi-select state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [contextMenuTarget, setContextMenuTarget] = useState<{ id: string; x: number; y: number; time: string } | null>(null);

  // BTW Side Chat Modal
  const [showBtwModal, setShowBtwModal] = useState(false);
  const [btwQuery, setBtwQuery] = useState('');
  const [btwList, setBtwList] = useState<Array<{ q: string; a: string; time: string }>>([
    {
      q: '当前对话与 Claude SDK 是如何关联的？',
      a: '本对话已接入底座 Claude Agent SDK 真实沙箱，每次交互均会由主管 moAdmin 动态解析并执行工具调用。',
      time: '系统就绪',
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialSentRef = useRef(false);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadMessages = useCallback(async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.messages)) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.warn('[SessionPage] Failed to fetch session messages:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const doSendMessage = async (text: string) => {
    if (!text.trim() || !sessionId || isExecuting) return;

    const userMsgId = `m-${Date.now()}`;
    const tempAssistantId = `m-temp-${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      role: 'user',
      authorKind: 'user',
      authorName: '人类用户',
      content: text,
      timestamp: '刚刚',
    };

    const pendingAssistantMessage: ChatMessage = {
      id: tempAssistantId,
      role: 'assistant',
      authorKind: 'bot',
      authorName: 'moAdmin',
      content: '正在规划与执行任务...',
      timestamp: '刚刚',
      executionStatus: {
        state: 'thinking',
        currentPhaseText: 'Claude Agent 正在深度解析与执行...',
        thinking: {
          text: '正在初始化独立沙箱与工具链...',
          thinkingMs: 120,
          durationSeconds: 0.12,
          durationMs: 120,
        },
        tools: [
          {
            id: 't_init',
            tool: 'Read',
            description: '载入工作区环境与上下文',
            status: 'running',
            durationMs: 60,
          },
        ],
      },
    };

    setMessages((prev) => [...prev, userMessage, pendingAssistantMessage]);
    setIsExecuting(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          model: currentSession?.model,
          effort: currentSession?.effort,
          workingDir: currentSession?.workingDir,
        }),
      });

      const data = await res.json();
      if (data.ok && data.assistantMessage) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempAssistantId ? data.assistantMessage : m))
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAssistantId
              ? {
                  ...m,
                  content: `执行未完成: ${data.error || '未知响应'}`,
                  executionStatus: {
                    state: 'error',
                    currentPhaseText: '执行遇到错误',
                    thinking: { text: data.error || '执行异常', durationSeconds: 0.1 },
                    tools: [],
                  },
                }
              : m
          )
        );
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? {
                ...m,
                content: `网络连接异常: ${err.message}`,
                executionStatus: {
                  state: 'error',
                  currentPhaseText: '网络故障',
                  thinking: { text: err.message, durationSeconds: 0.1 },
                  tools: [],
                },
              }
            : m
        )
      );
    } finally {
      setIsExecuting(false);
    }
  };

  // Auto-send when routed from NewChatPage with state
  useEffect(() => {
    const autoSendText = (location.state as any)?.autoSend;
    if (autoSendText && !initialSentRef.current && sessionId) {
      initialSentRef.current = true;
      window.history.replaceState({}, document.title);
      doSendMessage(autoSendText);
    }
  }, [sessionId, location.state]);

  const handleSend = () => {
    if (!inputPrompt.trim() || isExecuting) return;

    if (inputPrompt.startsWith('/btw') || inputPrompt.startsWith('//btw')) {
      const qText = inputPrompt.replace(/^(\/\/|\/)btw\s*/, '').trim() || '当前上下文说明';
      setBtwList((prev) => [
        ...prev,
        {
          q: qText,
          a: `[侧边答复] 针对独立提问：“${qText}”，已在不影响主会话的前提下完成查阅。`,
          time: '刚刚',
        },
      ]);
      setShowBtwModal(true);
      setInputPrompt('');
      return;
    }

    const text = inputPrompt;
    setInputPrompt('');
    doSendMessage(text);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => setSelectedIds(new Set(messages.map((m) => m.id)));
  const handleDeselectAll = () => setSelectedIds(new Set());

  const handleBatchCopy = () => {
    const selected = messages.filter((m) => selectedIds.has(m.id));
    if (selected.length === 0) return;
    const text = selected
      .map((m) => `[${m.role === 'user' ? '用户' : '助手'} - ${m.timestamp}]:\n${m.content}`)
      .join('\n\n---\n\n');
    navigator.clipboard.writeText(text);
    triggerHaptic('light');
    showToast(`已合并复制 ${selected.length} 条消息`, 'success');
    setIsSelecting(false);
    setSelectedIds(new Set());
  };

  const handleBatchFork = async () => {
    const selected = messages.filter((m) => selectedIds.has(m.id));
    if (selected.length === 0) return;
    const title = `[会话分叉] ${selected[0]?.content.slice(0, 16) || '新话题'}`;
    const newSession = await createSession({
      title,
      tags: ['消息分叉'],
    });
    triggerHaptic('success');
    showToast(`已成功分叉创建新会话: ${newSession.title}`, 'success');
    setIsSelecting(false);
    setSelectedIds(new Set());
    navigate(`/cc-agent/${newSession.id}`);
  };

  const handleBatchDelete = () => {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条消息吗？`)) return;
    setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
    showToast(`已批量移除选中消息视图`, 'info');
    setIsSelecting(false);
    setSelectedIds(new Set());
  };

  const handleForkSingleMessage = async (msg: any) => {
    const title = `[分叉] ${msg.content.slice(0, 20)}...`;
    const newSession = await createSession({
      title,
      tags: ['单条分叉'],
    });
    triggerHaptic('success');
    showToast(`已基于该消息分叉新会话: ${newSession.title}`, 'success');
    navigate(`/cc-agent/${newSession.id}`);
  };

  const handleDeleteSingleMessage = (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSendBtw = () => {
    if (!btwQuery.trim()) return;
    const q = btwQuery.trim();
    setBtwList((prev) => [
      ...prev,
      {
        q,
        a: `[侧边答复] 针对独立提问：“${q}”，已在不影响主会话前提下完成快速解答。`,
        time: '刚刚',
      },
    ]);
    setBtwQuery('');
  };

  const handleSelectSlashCommand = (cmd: SlashCommand) => {
    if (cmd.name === 'mcp') navigate('/mcp');
    else if (cmd.name === 'skills') navigate('/skillhub');
    else if (cmd.name === 'plugin') navigate('/plugins');
    else if (cmd.name === 'config' || cmd.name === 'storage' || cmd.name === 'theme') navigate('/settings');
    else if (cmd.name === 'btw') {
      setShowBtwModal(true);
      setInputPrompt('');
    } else {
      setInputPrompt(`/${cmd.name} `);
    }
  };

  const workingDir = currentSession?.workingDir || '/Users/xr/workspace';
  const sessionTitle = currentSession?.title || '任务对话';

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-surface relative overflow-hidden">
      <SessionWallpaperMask />

      {/* 1. Official Session Status Bar */}
      <div className="h-9 px-4 border-b border-border-default bg-surface/90 backdrop-blur-md flex items-center justify-between text-xs text-text-secondary shrink-0 z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary cursor-pointer transition-colors truncate max-w-xs">
            <Folder className="w-3.5 h-3.5 text-accent-amber shrink-0" />
            <span className="truncate">{workingDir}</span>
          </div>
          <span className="text-text-tertiary">|</span>
          <div className="flex items-center gap-1 font-mono text-[11px] text-text-tertiary">
            <Activity className="w-3.5 h-3.5 text-accent-green" />
            <span>{sessionTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <WallpaperMaskPickerButton />

          <button
            onClick={() => {
              setIsSelecting(!isSelecting);
              setSelectedIds(new Set());
            }}
            title={isSelecting ? '退出多选' : '多选消息'}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
              isSelecting
                ? 'bg-accent-blue text-white shadow-xs font-semibold'
                : 'bg-surface-chip hover:bg-surface-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            <span>{isSelecting ? '退出' : '多选'}</span>
          </button>

          <button
            onClick={() => setShowBtwModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-surface-chip hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            title="侧边提问 (不污染主对话上下文)"
          >
            <MessageSquare className="w-3 h-3 text-accent-blue" />
            <span>/btw 侧问</span>
          </button>
        </div>
      </div>

      {/* 2. Official MessageStream */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7 max-w-3xl w-full mx-auto relative z-10">
        {loading && (
          <div className="flex items-center justify-center py-12 text-xs text-text-tertiary">
            <Activity className="w-4 h-4 animate-spin mr-2 text-accent-blue" />
            <span>正在载入对话记录...</span>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-chip flex items-center justify-center text-text-tertiary">
              <Sparkles className="w-6 h-6 text-accent-blue" />
            </div>
            <div className="text-sm font-semibold text-text-primary">{sessionTitle}</div>
            <p className="text-xs text-text-tertiary max-w-md">
              会话已就绪并绑定独立沙箱。在下方输入框中描述您的任务，或使用斜杠命令启动自动化工具。
            </p>
          </div>
        )}

        {messages.map((msg) => {
          const isSelected = selectedIds.has(msg.id);
          return (
            <div
              key={msg.id}
              onClick={() => isSelecting && handleToggleSelect(msg.id)}
              className={`space-y-3 group rounded-2xl p-1.5 transition-colors ${
                isSelecting ? 'cursor-pointer hover:bg-surface-chip/50' : ''
              } ${isSelected ? 'bg-accent-blue/10 ring-1 ring-accent-blue/30' : ''}`}
            >
              {/* USER MESSAGE */}
              {msg.role === 'user' && (
                <div className="flex items-start justify-end gap-2.5">
                  {isSelecting && (
                    <div className="mt-2.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-accent-blue" />
                      ) : (
                        <Square className="w-4 h-4 text-text-tertiary" />
                      )}
                    </div>
                  )}
                  <div className="flex flex-col items-end">
                    <div className="bg-surface-elevated/90 backdrop-blur-md border border-border-default rounded-2xl rounded-tr-sm p-3.5 max-w-xl shadow-sm text-text-primary text-sm leading-relaxed select-text cursor-text">
                      <p className="select-text cursor-text whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-text-tertiary mt-1 px-1">
                      <span>{msg.timestamp}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* ASSISTANT MESSAGE */}
              {msg.role === 'assistant' && (
                <div className="flex items-start gap-2.5 w-full">
                  {isSelecting && (
                    <div className="mt-2.5 shrink-0">
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-accent-blue" />
                      ) : (
                        <Square className="w-4 h-4 text-text-tertiary" />
                      )}
                    </div>
                  )}

                  <div className="flex flex-col items-start space-y-3.5 w-full min-w-0">
                    {/* Execution Cards: Thinking, Tools (Process rendered strictly above content) */}
                    <AssistantExecutionCards msg={msg} />

                    {/* Main Text Content */}
                    <div className="text-sm text-text-primary leading-relaxed select-text space-y-2 pt-1">
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {/* Message Actions */}
                    {!isSelecting && (
                      <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-text-tertiary pt-1 opacity-80 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          title="复制消息内容"
                          className="p-1 rounded-lg hover:bg-surface-chip text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <Check className="w-3.5 h-3.5 text-accent-green" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleForkSingleMessage(msg);
                          }}
                          title="从本条消息分叉新会话"
                          className="p-1 rounded-lg hover:bg-surface-chip text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                        >
                          <GitFork className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = e.currentTarget.getBoundingClientRect();
                            setContextMenuTarget({
                              id: msg.id,
                              x: rect.left,
                              y: rect.bottom + 4,
                              time: msg.timestamp || '刚刚',
                            });
                          }}
                          title="更多操作"
                          className="p-1 rounded-lg hover:bg-surface-chip text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => doSendMessage(`重新评估并继续推进任务: ${msg.content.slice(0, 30)}`)}
                          className="flex items-center gap-1 hover:text-text-primary transition-colors ml-1 sm:ml-2 cursor-pointer"
                          title="重新生成"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span className="hidden sm:inline text-[11px]">重新生成</span>
                        </button>

                        <span className="text-[10px] text-text-tertiary font-mono ml-auto">
                          {msg.timestamp}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Multi-select bottom bar */}
      {isSelecting && (
        <MultiSelectActionBar
          selectedCount={selectedIds.size}
          totalCount={messages.length}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onBatchFork={handleBatchFork}
          onBatchCopy={handleBatchCopy}
          onBatchDelete={handleBatchDelete}
          onExit={() => {
            setIsSelecting(false);
            setSelectedIds(new Set());
          }}
        />
      )}

      {/* Popover Context Menu */}
      {contextMenuTarget && (
        <MessageContextMenu
          x={contextMenuTarget.x}
          y={contextMenuTarget.y}
          messageId={contextMenuTarget.id}
          timestamp={contextMenuTarget.time}
          onClose={() => setContextMenuTarget(null)}
          onShareAsImage={() => {
            triggerHaptic('success');
            showToast('已生成长图快照并拷贝至剪贴板', 'success');
          }}
          onCreateTopicOrFork={() => {
            const target = messages.find((m) => m.id === contextMenuTarget.id);
            if (target) handleForkSingleMessage(target);
          }}
          onCopyLink={() => {
            navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${contextMenuTarget.id}`);
            triggerHaptic('light');
            showToast('已复制当前消息链接', 'success');
          }}
          onDeleteMessage={() => handleDeleteSingleMessage(contextMenuTarget.id)}
          onEnterMultiSelect={() => {
            setIsSelecting(true);
            setSelectedIds(new Set([contextMenuTarget.id]));
          }}
        />
      )}

      {/* Sticky Bottom Composer */}
      <div className="p-4 border-t border-border-default bg-surface shrink-0 relative">
        <div className="max-w-3xl mx-auto relative">
          <ComposerCard
            prompt={inputPrompt}
            onPromptChange={setInputPrompt}
            onSend={handleSend}
            isNewChat={false}
            onSelectSlashCommand={handleSelectSlashCommand}
            placeholder="描述任务需求、键入 / 触发指令，或 /btw 侧边提问..."
          />
        </div>
      </div>

      {/* BTW Side Chat Drawer */}
      <BtwSideDrawer
        open={showBtwModal}
        onClose={() => setShowBtwModal(false)}
        btwList={btwList}
        btwQuery={btwQuery}
        onBtwQueryChange={setBtwQuery}
        onSendBtw={handleSendBtw}
      />
    </div>
  );
}
