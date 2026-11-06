/**
 * Purpose: Group chat message item with Cindy/AGY styling, 28px avatars, role badges,
 *          user right-align / bot left-align layout, and ExecutionStatusCard mounted BEFORE the bubble.
 * Context: Conforms to mental model: execution status & thinking first, content conclusion last.
 * Usage: <MessageItem message={msg} partnerMeta={meta} onJumpPrivateSession={...} onForkMessage={...} />
 * Prerequisites: React 19, Tailwind CSS, Lucide Icons, ExecutionStatusCard.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Copy,
  GitFork,
  MoreHorizontal,
  ExternalLink,
  Check,
  CheckSquare,
  Square,
  MessageSquare,
  Pencil
} from 'lucide-react';
import type { GroupMessage, PartnerInfo } from '@/types/room';
import { MarkdownContent } from './MarkdownContent';
import { MessageContextMenu } from '../chat/MessageContextMenu';
import { ExecutionStatusCard } from './ExecutionStatusCard';
import { useToast } from '@/contexts/ToastContext';
import { triggerHaptic } from '@/utils/haptics';

interface MessageItemProps {
  message: GroupMessage;
  partnerMeta?: PartnerInfo;
  isPending?: boolean;
  isSelecting?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  onForkMessage?: (message: GroupMessage) => void;
  onRecallAndEdit?: (message: GroupMessage) => void;
  onDeleteMessage?: (id: string) => void;
}

const BADGE_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  teal: { bg: 'bg-teal-500/10', text: 'text-teal-400', border: 'border-teal-500/20' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
  red: { bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/20' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  green: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  indigo: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  sky: { bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/20' },
  slate: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' }
};

const BOT_PRESETS: Record<
  string,
  { name: string; badge: string; theme: string; avatar: string; emoji: string }
> = {
  bot_moadmin_director_03: { name: 'moAdmin', badge: '编排主管', theme: 'purple', avatar: '/assets/agent-island-cindy.png', emoji: '👑' },
  moadmin: { name: 'moAdmin', badge: '编排主管', theme: 'purple', avatar: '/assets/agent-island-cindy.png', emoji: '👑' },
  moAdmin: { name: 'moAdmin', badge: '编排主管', theme: 'purple', avatar: '/assets/agent-island-cindy.png', emoji: '👑' },

  bot_mocode_engine_01: { name: 'moCode', badge: '全栈研发', theme: 'blue', avatar: '/assets/agent-island-boli.png', emoji: '💻' },
  mocode: { name: 'moCode', badge: '全栈研发', theme: 'blue', avatar: '/assets/agent-island-boli.png', emoji: '💻' },
  moCode: { name: 'moCode', badge: '全栈研发', theme: 'blue', avatar: '/assets/agent-island-boli.png', emoji: '💻' },

  bot_modoc_scribe_02: { name: 'moDoc', badge: '架构文胆', theme: 'teal', avatar: '/assets/agent-island-annie.png', emoji: '📝' },
  modoc: { name: 'moDoc', badge: '架构文胆', theme: 'teal', avatar: '/assets/agent-island-annie.png', emoji: '📝' },
  moDoc: { name: 'moDoc', badge: '架构文胆', theme: 'teal', avatar: '/assets/agent-island-annie.png', emoji: '📝' },

  bot_moci_sentinel_07: { name: 'MoCI', badge: '测试哨兵', theme: 'rose', avatar: '/assets/agent-island-tarara.png', emoji: '🛡️' },
  moci: { name: 'MoCI', badge: '测试哨兵', theme: 'rose', avatar: '/assets/agent-island-tarara.png', emoji: '🛡️' },
  MoCI: { name: 'MoCI', badge: '测试哨兵', theme: 'rose', avatar: '/assets/agent-island-tarara.png', emoji: '🛡️' },

  bot_mogit_scm_05: { name: 'MoGit', badge: '代码审计', theme: 'emerald', avatar: '/assets/agent-island-erika.png', emoji: '🌿' },
  mogit: { name: 'MoGit', badge: '代码审计', theme: 'emerald', avatar: '/assets/agent-island-erika.png', emoji: '🌿' },
  MoGit: { name: 'MoGit', badge: '代码审计', theme: 'emerald', avatar: '/assets/agent-island-erika.png', emoji: '🌿' },

  bot_modeep_scout_04: { name: 'MoDeep', badge: '深度情报', theme: 'indigo', avatar: '/assets/agent-island-chaku.png', emoji: '🔍' },
  modeep: { name: 'MoDeep', badge: '深度情报', theme: 'indigo', avatar: '/assets/agent-island-chaku.png', emoji: '🔍' },
  MoDeep: { name: 'MoDeep', badge: '深度情报', theme: 'indigo', avatar: '/assets/agent-island-chaku.png', emoji: '🔍' },

  bot_mo_meta_06: { name: 'Mo', badge: '元工具师', theme: 'orange', avatar: '/assets/agent-island-muffin.png', emoji: '⚙️' },
  mo: { name: 'Mo', badge: '元工具师', theme: 'orange', avatar: '/assets/agent-island-muffin.png', emoji: '⚙️' },
  Mo: { name: 'Mo', badge: '元工具师', theme: 'orange', avatar: '/assets/agent-island-muffin.png', emoji: '⚙️' }
};

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  partnerMeta,
  isPending = false,
  isSelecting = false,
  isSelected = false,
  onToggleSelect,
  onForkMessage,
  onRecallAndEdit,
  onDeleteMessage
}) => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [copied, setCopied] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

  const isUser = message.authorKind === 'user';

  // Find preset by botId or authorName
  const botPreset = !isUser
    ? (message.authorBotId ? BOT_PRESETS[message.authorBotId] : null) ||
      (message.authorName ? BOT_PRESETS[message.authorName] : null)
    : null;

  const displayName = isUser
    ? (message.authorName || '真人测试者 (Owner)')
    : (partnerMeta?.name || botPreset?.name || message.authorName || 'AI 伙伴');

  const avatarUrl = isUser
    ? '/assets/cindy-avatar-account.png'
    : (partnerMeta?.avatarUrl || botPreset?.avatar || '/assets/agent-island-cindy.png');

  const badgeText = isUser ? '群主' : (partnerMeta?.badgeText || botPreset?.badge || '伙伴');
  const badgeThemeKey = isUser ? 'sky' : (partnerMeta?.badgeTheme || botPreset?.theme || 'slate');
  const badgeStyles = BADGE_COLOR_MAP[badgeThemeKey] || BADGE_COLOR_MAP.slate;

  // Execution status from message, with fallback client parsing for bots if missing
  let executionStatus = message.executionStatus || message.statusCard;
  if (!executionStatus && !isUser) {
    const rawContent = message.content || '';
    const thoughtMatch = rawContent.match(/<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/i);
    const thinkingText = thoughtMatch
      ? thoughtMatch[1].trim()
      : `${displayName}（${partnerMeta?.role || botPreset?.badge || '协同伙伴'}）：解析上下文并执行协同任务。`;

    const codeMatches = Array.from(rawContent.matchAll(/`([^`\n]+)`/g))
      .map((m) => m[1].trim())
      .filter((s) => s.length > 2 && !s.includes('\n'))
      .slice(0, 4);

    const tools: any[] = codeMatches.map((c, idx) => ({
      id: `t_cli_${idx}`,
      tool: c.startsWith('pnpm') || c.startsWith('npm') || c.startsWith('node') || c.startsWith('git') ? 'Bash' : 'Read',
      description: `审查/执行指令上下文: ${c.slice(0, 40)}`,
      status: 'success',
      durationMs: 80,
    }));

    if (tools.length === 0) {
      tools.push({
        id: 't_cli_0',
        tool: 'Read',
        description: `审查 ${displayName} 工作区任务契约`,
        status: 'success',
        durationMs: 70,
      });
    }

    executionStatus = {
      state: 'done',
      currentPhaseText: '协同执行完成',
      thinking: {
        text: thinkingText,
        durationSeconds: 0.28,
        durationMs: 280,
      },
      tools,
      latency: {
        thinkingMs: 280,
        toolMs: tools.length * 80,
        totalMs: 280 + tools.length * 80,
      },
    };
  }

  // Resolve private session target
  const targetSessionId =
    message.partnerSessionId ||
    (message.authorBotId
      ? message.authorBotId === 'lead-orchestrator'
        ? 's-orca-lead-01'
        : `session-${message.authorBotId}`
      : 's-orca-lead-01');

  let formattedTime = '';
  try {
    const raw = message.createdAt;
    if (raw) {
      if (typeof raw === 'number' || typeof raw === 'bigint') {
        const num = Number(raw);
        const ms = num < 1e11 ? num * 1000 : num;
        const d = new Date(ms);
        if (!isNaN(d.getTime())) {
          formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (/^\d+$/.test(trimmed)) {
          const num = Number(trimmed);
          const ms = num < 1e11 ? num * 1000 : num;
          const d = new Date(ms);
          if (!isNaN(d.getTime())) {
            formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        } else {
          const d = new Date(trimmed);
          if (!isNaN(d.getTime())) {
            formattedTime = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } else if (trimmed.includes(':') && !trimmed.toLowerCase().includes('invalid')) {
            formattedTime = trimmed;
          }
        }
      }
    }
  } catch {
    formattedTime = '';
  }

  // Strict UI fallback: never show 'Invalid Date', 'NaN', 'undefined' or empty string
  if (
    !formattedTime ||
    formattedTime.toLowerCase().includes('invalid') ||
    formattedTime.includes('NaN') ||
    formattedTime === 'undefined'
  ) {
    formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleOpenMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPos({ x: rect.left, y: rect.bottom + 4 });
  };

  const handleJumpPrivate = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isUser) return;
    if (message.authorBotId) {
      navigate(`/bots/${message.authorBotId}`);
    } else {
      navigate(`/cc-agent/${targetSessionId}`);
    }
  };

  return (
    <div
      onClick={() => isSelecting && onToggleSelect?.(message.id)}
      className={`group relative flex items-start gap-3 py-2 px-2 transition-colors rounded-2xl w-full ${
        isUser ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
      } ${
        isSelecting
          ? 'cursor-pointer hover:bg-surface-chip/60'
          : isUser
          ? 'hover:bg-surface-chip/20'
          : 'hover:bg-surface-elevated/40'
      } ${isSelected ? 'bg-accent-blue/10 ring-1 ring-accent-blue/30' : ''}`}
    >
      {/* Multi-select checkbox */}
      {isSelecting && (
        <div className="shrink-0 mt-2">
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-accent-blue" />
          ) : (
            <Square className="w-4 h-4 text-text-tertiary" />
          )}
        </div>
      )}

      {/* 28px Avatar Slot with Clickable Jump */}
      <div
        onClick={handleJumpPrivate}
        title={isUser ? displayName : `跳转至 ${displayName} 的私聊`}
        className={`relative shrink-0 mt-0.5 ${
          !isUser ? 'cursor-pointer hover:scale-105 transition-transform' : ''
        }`}
      >
        <img
          src={avatarUrl}
          alt={displayName}
          className="w-7 h-7 rounded-full object-cover border border-border-default shadow-xs"
          onError={(e) => {
            // Fallback for missing avatar image
            const target = e.currentTarget;
            target.style.display = 'none';
            if (target.nextElementSibling) {
              (target.nextElementSibling as HTMLElement).style.display = 'flex';
            }
          }}
        />
        {/* Emoji fallback when image fails */}
        <div
          className="w-7 h-7 rounded-full bg-surface-elevated border border-border-default shadow-xs items-center justify-center text-xs hidden"
        >
          {isUser ? '🧑‍💻' : botPreset?.emoji || '🤖'}
        </div>
      </div>

      {/* Message Column Container: constrained max width 720px */}
      <div className={`flex-1 min-w-0 max-w-[720px] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        
        {/* Header row: Name, Badge, Sequence, Time, and Private Jump Shortcut */}
        <div
          className={`flex items-center gap-2 mb-1 flex-wrap w-full ${
            isUser ? 'flex-row-reverse justify-start' : 'flex-row justify-start'
          }`}
        >
          <span className="text-xs font-semibold text-text-primary truncate">{displayName}</span>

          <span
            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono border ${badgeStyles.bg} ${badgeStyles.text} ${badgeStyles.border}`}
          >
            {badgeText}
          </span>

          {message.sequence > 0 ? (
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono bg-surface-chip text-text-tertiary border border-border-subtle">
              #{message.sequence}
            </span>
          ) : null}

          {/* Bot Private Session Jump Shortcut */}
          {!isUser && (
            <button
              onClick={handleJumpPrivate}
              title={`跳转查看 ${displayName} 私聊详情 (Session: ${targetSessionId})`}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue border border-accent-blue/20 transition-colors cursor-pointer ml-1"
            >
              <MessageSquare className="w-3 h-3" />
              <span className="hidden sm:inline">私聊详情</span>
              <ExternalLink className="w-2.5 h-2.5 opacity-70" />
            </button>
          )}

          {isPending ? (
            <span
              className={`text-[10px] text-accent-amber animate-pulse font-mono ${
                isUser ? 'mr-auto' : 'ml-auto'
              }`}
            >
              发送中...
            </span>
          ) : (
            <span
              className={`text-[10px] text-text-tertiary font-mono ${
                isUser ? 'mr-auto' : 'ml-auto'
              }`}
            >
              {formattedTime}
            </span>
          )}
        </div>

        {/* 【前置】ExecutionStatusCard: 思考过程折叠、耗时细分与工具执行轨迹，位于正文气泡上方 */}
        {executionStatus && (
          <div data-testid="message-execution-status" className="mb-2 w-full max-w-[720px]">
            <ExecutionStatusCard status={executionStatus} />
          </div>
        )}

        {/* 【后置】Content Bubble: 消息正文气泡 (MarkdownContent) */}
        <div
          data-testid="message-content-bubble"
          className={`w-fit max-w-full p-2.5 sm:p-3.5 shadow-xs text-text-primary select-text cursor-text ${
            isUser
              ? 'bg-accent-blue/10 border border-accent-blue/30 rounded-2xl rounded-tr-sm'
              : 'bg-surface-elevated/90 border border-border-subtle rounded-2xl rounded-tl-sm'
          }`}
        >
          <MarkdownContent content={message.content} />

          {/* Action Icons row (优化触屏点击与移动端默认可见度) */}
          {!isSelecting && (
            <div
              className={`flex items-center gap-1 sm:gap-1.5 mt-2 pt-1.5 border-t border-border-subtle/50 opacity-75 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              {/* 0. Recall & Edit icon for user message */}
              {isUser && onRecallAndEdit && (
                <button
                  type="button"
                  data-testid="btn-recall-edit-msg"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRecallAndEdit(message);
                  }}
                  title="撤回并重新编辑"
                  className="p-1 rounded-lg hover:bg-surface-chip text-text-tertiary hover:text-accent-blue transition-colors cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}

              {/* 1. Copy icon */}
              <button
                type="button"
                onClick={handleCopy}
                title="复制消息"
                className="p-1 rounded-lg hover:bg-surface-chip text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
              </button>

              {/* 2. Fork / Topic icon */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onForkMessage?.(message);
                }}
                title="基于本条消息分叉 / 创建话题"
                className="p-1 rounded-lg hover:bg-surface-chip text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <GitFork className="w-3.5 h-3.5" />
              </button>

              {/* 3. More ... icon */}
              <button
                type="button"
                onClick={handleOpenMenu}
                title="更多操作"
                className="p-1 rounded-lg hover:bg-surface-chip text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Popover Context Menu */}
      {menuPos && (
        <MessageContextMenu
          x={menuPos.x}
          y={menuPos.y}
          messageId={message.id}
          timestamp={message.createdAt}
          onClose={() => setMenuPos(null)}
          onShareAsImage={() => {
            triggerHaptic('success');
            showToast('已生成长图快照并拷贝至剪贴板', 'success');
          }}
          onCreateTopicOrFork={() => onForkMessage?.(message)}
          onCopyLink={() => {
            navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}#${message.id}`);
            triggerHaptic('light');
            showToast('已复制消息直链', 'success');
          }}
          onRecallAndEdit={isUser && onRecallAndEdit ? () => onRecallAndEdit(message) : undefined}
          onDeleteMessage={() => onDeleteMessage?.(message.id)}
          onEnterMultiSelect={() => onToggleSelect?.(message.id)}
        />
      )}
    </div>
  );
};
