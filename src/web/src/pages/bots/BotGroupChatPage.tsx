/**
 * Purpose: Dynamic group chat page container connecting UI components to room and message APIs.
 * Context: Adheres to bot-group-orchestration.md for monotonic message streaming and @partner execution.
 * Usage: Routed via /bots/groups/:groupId in apps/web/src/router.tsx.
 * Prerequisites: React 19, React Router 7, useRoom, useRoomMessages, usePartnerRoster.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AtSign, ArrowUp, Sparkles, Loader2, Target, Users, FileText, X, RefreshCw, BookOpen, Copy, Check, Square } from 'lucide-react';
import type { PartnerInfo } from '@/types/room';
import { useRoom } from '@/hooks/useRoom';
import { usePartnerRoster } from '@/hooks/usePartnerRoster';
import { useRoomMessages } from '@/hooks/useRoomMessages';
import { RoomHeader } from '@/components/group-chat/RoomHeader';
import { MessageTimeline } from '@/components/group-chat/MessageTimeline';
import { MentionAutocompleteMenu } from '@/components/group-chat/MentionAutocompleteMenu';
import { SessionWallpaperMask } from '@/components/wallpaper/SessionWallpaperMask';
import { MultiSelectActionBar } from '@/components/chat/MultiSelectActionBar';
import { useSessions } from '@/hooks/useSessions';
import { useToast } from '@/contexts/ToastContext';
import { triggerHaptic } from '@/utils/haptics';
import type { GroupMessage } from '@/types/room';

export function BotGroupChatPage() {
  const { groupId: routeGroupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  // Default to multiagent-orchestration if not specified
  const activeGroupId = routeGroupId || 'multiagent-orchestration';

  const { partners, partnerMap } = usePartnerRoster();
  const { currentRoom, allRooms, charter, memory, refreshRoom } = useRoom(activeGroupId);
  const {
    messages,
    isThinking,
    activeBot,
    isSubmitting,
    sendMessage,
    stopGenerating,
    deleteMessage,
    recallAndEdit
  } = useRoomMessages(activeGroupId, partnerMap);
  const { createSession } = useSessions();

  const [inputVal, setInputVal] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mobile virtual keyboard viewport adaptation (pi-web style)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const handleViewportResize = () => {
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    window.visualViewport.addEventListener('resize', handleViewportResize);
    return () => window.visualViewport?.removeEventListener('resize', handleViewportResize);
  }, []);

  // Multi-select state
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Blackboard & Charter drawer state
  const [showBlackboard, setShowBlackboard] = useState(false);
  const [blackboardTab, setBlackboardTab] = useState<'memory' | 'charter'>('memory');
  const [copied, setCopied] = useState(false);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(messages.map((m) => m.id)));
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBatchCopy = () => {
    const selected = messages.filter((m) => selectedIds.has(m.id));
    if (selected.length === 0) return;
    const text = selected
      .map((m) => `[${m.authorName} - ${m.createdAt}]:\n${m.content}`)
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
    const title = `[群聊分叉] ${currentRoom?.name || '话题'} (${selected.length}条上下文)`;
    const newSession = await createSession({
      title,
      tags: ['群聊分叉', currentRoom?.name || 'Group']
    });
    triggerHaptic('success');
    showToast(`已成功分叉创建新会话: ${newSession.title}`, 'success');
    setIsSelecting(false);
    setSelectedIds(new Set());
    navigate(`/cc-agent/${newSession.id}`);
  };

  const handleBatchDelete = () => {
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条消息吗？`)) return;
    showToast(`已批量移除选中消息视图`, 'info');
    setIsSelecting(false);
    setSelectedIds(new Set());
  };

  const handleForkSingleMessage = async (msg: GroupMessage) => {
    const title = `[消息分叉] ${msg.authorName}: ${msg.content.slice(0, 18)}...`;
    const newSession = await createSession({
      title,
      tags: ['单条分叉', msg.authorName]
    });
    triggerHaptic('success');
    showToast(`已基于该消息分叉新会话: ${newSession.title}`, 'success');
    navigate(`/cc-agent/${newSession.id}`);
  };

  // Recall and edit user message
  const handleRecallAndEdit = async (msg: GroupMessage) => {
    const content = await recallAndEdit(msg.id);
    if (content !== null) {
      setInputVal(content);
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(content.length, content.length);
        }
      }, 50);
    }
  };

  const handleDeleteSingleMessage = async (msgId: string) => {
    await deleteMessage(msgId);
  };

  // Global Escape key to stop generating
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (isThinking || isSubmitting)) {
        stopGenerating();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isThinking, isSubmitting, stopGenerating]);

  // Check for '@' mention token at cursor position
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);

    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const queryPart = textBeforeCursor.slice(lastAtIndex + 1);
      // If there is no whitespace after @, consider it an active mention query
      if (!/\s/.test(queryPart)) {
        setMentionQuery(queryPart);
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleSelectPartner = (partner: PartnerInfo) => {
    if (!inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart || inputVal.length;
    const textBeforeCursor = inputVal.slice(0, cursorPos);
    const textAfterCursor = inputVal.slice(cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');

    const prefix = lastAtIndex !== -1 ? textBeforeCursor.slice(0, lastAtIndex) : textBeforeCursor;
    const updated = `${prefix}@${partner.name} ${textAfterCursor}`;

    setInputVal(updated);
    setMentionQuery(null);

    // Focus input and set cursor after inserted mention
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const nextPos = prefix.length + partner.name.length + 2;
        inputRef.current.setSelectionRange(nextPos, nextPos);
      }
    }, 10);
  };

  const handleAtButtonClick = () => {
    if (!inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart || inputVal.length;
    const textBeforeCursor = inputVal.slice(0, cursorPos);
    const textAfterCursor = inputVal.slice(cursorPos);

    setInputVal(`${textBeforeCursor}@${textAfterCursor}`);
    setMentionQuery('');
    setTimeout(() => {
      inputRef.current?.focus();
      const nextPos = cursorPos + 1;
      inputRef.current?.setSelectionRange(nextPos, nextPos);
    }, 10);
  };

  const handleSend = async () => {
    if (!inputVal.trim() || isSubmitting) return;
    const textToSend = inputVal;
    setInputVal('');
    setMentionQuery(null);
    await sendMessage(textToSend);
    refreshRoom();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      if (isThinking || isSubmitting) {
        e.preventDefault();
        stopGenerating();
        return;
      }
    }

    if (mentionQuery !== null) {
      // Menu handles arrow keys & Enter
      if (['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRoomSelect = (newGroupId: string) => {
    navigate(`/bots/groups/${encodeURIComponent(newGroupId)}`);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface overflow-hidden relative">
      {/* Background Mask */}
      <SessionWallpaperMask />

      {/* 1. Room Header Bar */}
      <RoomHeader
        currentRoom={currentRoom}
        allRooms={allRooms}
        partners={partners}
        isSelecting={isSelecting}
        onToggleSelectMode={() => {
          setIsSelecting(!isSelecting);
          setSelectedIds(new Set());
        }}
        onSelectRoom={handleRoomSelect}
        onToggleBlackboard={() => setShowBlackboard(!showBlackboard)}
        blackboardOpen={showBlackboard}
      />

      {/* 2. Monotonic Timeline Stream */}
      <MessageTimeline
        messages={messages}
        partnerMap={partnerMap}
        isThinking={isThinking}
        activeBot={activeBot}
        roomName={currentRoom?.name || activeGroupId}
        isSelecting={isSelecting}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onForkMessage={handleForkSingleMessage}
        onRecallAndEdit={handleRecallAndEdit}
        onDeleteMessage={handleDeleteSingleMessage}
        onStop={stopGenerating}
        onSelectStarterSuggestion={(prompt) => {
          setInputVal(prompt);
          inputRef.current?.focus();
        }}
      />

      {/* Multi-select bottom floating bar */}
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

      {/* 3. Bottom Composer */}
      <div className="relative p-3 sm:p-4 bg-surface/90 border-t border-border-subtle shrink-0">
        <div className="max-w-4xl mx-auto relative">
          {/* Autocomplete Popup */}
          {mentionQuery !== null && (
            <MentionAutocompleteMenu
              query={mentionQuery}
              partners={partners}
              onSelect={handleSelectPartner}
              onClose={() => setMentionQuery(null)}
            />
          )}

          {/* Quick Slash Mode Bar (/goal /teamwork /boost / test) */}
          <div className="flex items-center gap-1.5 mb-2 overflow-x-auto pb-1 text-xs select-none no-scrollbar">
            <span className="text-[11px] text-text-tertiary mr-1">快捷模式:</span>
            <button
              type="button"
              data-testid="btn-test-my-message"
              onClick={() => {
                const testPrompt = '测试我发的消息：全链路校验状态卡片最高高度限制与无原生滚动条交互';
                setInputVal(testPrompt);
                inputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors text-[11px] font-medium cursor-pointer shrink-0"
            >
              <Sparkles className="w-3 h-3 text-accent-blue" />
              <span>⚡ 测试我发的消息</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputVal((prev) => prev.startsWith('/goal ') ? prev : `/goal ${prev}`.trim() + ' ');
                inputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-default hover:border-accent-red/40 text-text-secondary hover:text-accent-red transition-colors text-[11px] cursor-pointer shrink-0"
            >
              <Target className="w-3 h-3 text-accent-red" />
              <span>/goal 目标驱动</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputVal((prev) => prev.startsWith('/teamwork ') ? prev : `/teamwork ${prev}`.trim() + ' ');
                inputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-default hover:border-accent-purple/40 text-text-secondary hover:text-accent-purple transition-colors text-[11px] cursor-pointer shrink-0"
            >
              <Users className="w-3 h-3 text-accent-purple" />
              <span>/teamwork 团队协同</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputVal((prev) => prev.startsWith('/boost ') ? prev : `/boost ${prev}`.trim() + ' ');
                inputRef.current?.focus();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-surface-elevated border border-border-default hover:border-amber-500/40 text-text-secondary hover:text-amber-500 transition-colors text-[11px] cursor-pointer shrink-0"
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>/boost 深度强化</span>
            </button>
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-2 p-1.5 sm:p-2 rounded-2xl bg-surface-elevated border border-border-default shadow-sm focus-within:border-accent-blue/50 focus-within:ring-2 focus-within:ring-accent-blue/10 transition-all">
            <button
              type="button"
              onClick={handleAtButtonClick}
              title="提及伙伴 (@)"
              className="p-2 text-text-tertiary hover:text-accent-blue hover:bg-surface-hover rounded-xl transition-colors shrink-0"
            >
              <AtSign className="w-4 h-4" />
            </button>

            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={`在 ${currentRoom?.name || activeGroupId} 发送消息，输入 @ 可指定伙伴协同...`}
              className="flex-1 bg-transparent border-none text-xs sm:text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none min-w-0"
            />

            {inputVal.trim().length > 0 && (
              <button
                type="button"
                onClick={() => { setInputVal(''); inputRef.current?.focus(); }}
                title="清空内容"
                className="p-1 rounded-full text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {isThinking || isSubmitting ? (
              <button
                type="button"
                data-testid="btn-stop-generating"
                onClick={stopGenerating}
                title="停止响应 / 暂停 (Esc)"
                className="p-2 rounded-xl transition-all shrink-0 flex items-center justify-center bg-accent-red/90 hover:bg-accent-red text-white shadow-sm active:scale-95 animate-in fade-in cursor-pointer"
              >
                <Square className="w-4 h-4 fill-white" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!inputVal.trim()}
                className={`p-2 rounded-xl transition-all shrink-0 flex items-center justify-center ${
                  inputVal.trim()
                    ? 'bg-accent-blue text-white shadow-sm hover:opacity-90 active:scale-95 cursor-pointer'
                    : 'bg-surface-chip text-text-tertiary cursor-not-allowed opacity-60'
                }`}
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Blackboard & Charter Slide-Over Drawer (提升至 z-50 避免移动端被 Tab 栏遮挡) */}
      {showBlackboard && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[480px] bg-surface-elevated/98 backdrop-blur-xl border-l border-border-default shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200 pb-[env(safe-area-inset-bottom)]">
          {/* Drawer Header */}
          <div className="p-4 border-b border-border-default flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-accent-purple/10 text-accent-purple flex items-center justify-center border border-accent-purple/20">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary">黑板与章程看板</h3>
                <p className="text-[11px] text-text-tertiary">GROUP_MEMORY & GROUP_CHARTER</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  refreshRoom();
                }}
                title="刷新黑板"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const content = blackboardTab === 'memory' ? memory : charter;
                  navigator.clipboard.writeText(content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                title="复制内容"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                {copied ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setShowBlackboard(false)}
                title="关闭抽屉"
                className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Drawer Tabs */}
          <div className="flex items-center px-4 pt-3 gap-2 border-b border-border-subtle bg-surface/50">
            <button
              type="button"
              onClick={() => setBlackboardTab('memory')}
              className={`pb-2.5 text-xs font-semibold px-2 transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                blackboardTab === 'memory'
                  ? 'border-accent-purple text-accent-purple'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>共享黑板 (GROUP_MEMORY)</span>
            </button>
            <button
              type="button"
              onClick={() => setBlackboardTab('charter')}
              className={`pb-2.5 text-xs font-semibold px-2 transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                blackboardTab === 'charter'
                  ? 'border-accent-purple text-accent-purple'
                  : 'border-transparent text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>群组章程 (GROUP_CHARTER)</span>
            </button>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 p-4 overflow-y-auto">
            <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap leading-relaxed select-text bg-surface/60 p-4 rounded-xl border border-border-subtle">
              {blackboardTab === 'memory'
                ? memory || '（暂无黑板内容或尚未同步）'
                : charter || '（暂无章程内容或尚未同步）'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
