import React, { useEffect, useRef } from 'react';
import {
  Pin,
  Edit2,
  BellOff,
  Bell,
  Copy,
  Share2,
  FolderInput,
  Download,
  ExternalLink,
  Archive,
  Trash2,
  MoreHorizontal,
  Check
} from 'lucide-react';
import type { PersistentSession } from '@/types/session';

export const TAG_COLORS = [
  { name: '红色', hex: '#EF4444' },
  { name: '橙色', hex: '#F97316' },
  { name: '黄色', hex: '#EAB308' },
  { name: '绿色', hex: '#22C55E' },
  { name: '蓝色', hex: '#3B82F6' },
  { name: '紫色', hex: '#A855F7' },
  { name: '棕色', hex: '#D97706' },
];

interface SessionContextMenuProps {
  x: number;
  y: number;
  session: PersistentSession;
  onClose: () => void;
  onTogglePin: (session: PersistentSession) => void;
  onRename: (session: PersistentSession) => void;
  onToggleMute: (session: PersistentSession) => void;
  onSetTagColor: (session: PersistentSession, colorHex: string | null) => void;
  onCopyLink: (session: PersistentSession) => void;
  onShare: (session: PersistentSession) => void;
  onMove: (session: PersistentSession) => void;
  onExport: (session: PersistentSession) => void;
  onOpenNewWindow: (session: PersistentSession) => void;
  onArchive: (session: PersistentSession) => void;
  onDelete: (session: PersistentSession) => void;
}

export const SessionContextMenu: React.FC<SessionContextMenuProps> = ({
  x,
  y,
  session,
  onClose,
  onTogglePin,
  onRename,
  onToggleMute,
  onSetTagColor,
  onCopyLink,
  onShare,
  onMove,
  onExport,
  onOpenNewWindow,
  onArchive,
  onDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust menu position to keep within viewport
  const menuWidth = 220;
  const menuHeight = 440;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 12);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 12);

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-[9999] w-[210px] bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-2xl shadow-2xl p-1.5 text-xs text-text-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. 置顶 */}
      <button
        onClick={() => {
          onTogglePin(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Pin className={`w-4 h-4 ${session.isPinned ? 'text-accent-blue rotate-45' : 'text-text-secondary'}`} />
        <span>{session.isPinned ? '取消置顶' : '置顶'}</span>
      </button>

      {/* 2. 重命名 */}
      <button
        onClick={() => {
          onRename(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Edit2 className="w-4 h-4 text-text-secondary" />
        <span>重命名</span>
      </button>

      {/* 3. 消息免打扰 */}
      <button
        onClick={() => {
          onToggleMute(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        {session.isMuted ? (
          <Bell className="w-4 h-4 text-accent-amber" />
        ) : (
          <BellOff className="w-4 h-4 text-text-secondary" />
        )}
        <span>{session.isMuted ? '允许消息通知' : '消息免打扰'}</span>
      </button>

      {/* 4. 标签 (8个圆形颜色按钮) */}
      <div className="px-3 pt-2 pb-1.5 border-t border-border-subtle mt-1">
        <div className="text-[11px] text-text-tertiary mb-2 font-medium">标签</div>
        <div className="flex items-center justify-between gap-1">
          {TAG_COLORS.map((c) => {
            const isSelected = session.tagColor === c.hex;
            return (
              <button
                key={c.hex}
                title={c.name}
                onClick={() => {
                  onSetTagColor(session, isSelected ? null : c.hex);
                  onClose();
                }}
                style={{ backgroundColor: c.hex }}
                className="w-4 h-4 rounded-full transition-transform hover:scale-125 flex items-center justify-center cursor-pointer shadow-xs shrink-0"
              >
                {isSelected && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
              </button>
            );
          })}
          <button
            title="清除/更多标签"
            onClick={() => {
              onSetTagColor(session, null);
              onClose();
            }}
            className="w-4 h-4 rounded-full border border-border-default hover:bg-surface-chip flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors cursor-pointer shrink-0"
          >
            <MoreHorizontal className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      <div className="h-px bg-border-subtle my-1" />

      {/* 5. 复制任务链接 */}
      <button
        onClick={() => {
          onCopyLink(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Copy className="w-4 h-4 text-text-secondary" />
        <span>复制任务链接</span>
      </button>

      {/* 6. 共享任务 */}
      <button
        onClick={() => {
          onShare(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Share2 className="w-4 h-4 text-text-secondary" />
        <span>共享任务</span>
      </button>

      {/* 7. 移动任务 > */}
      <button
        onClick={() => {
          onMove(session);
          onClose();
        }}
        className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <FolderInput className="w-4 h-4 text-text-secondary" />
          <span>移动任务</span>
        </div>
        <span className="text-text-tertiary font-mono text-[10px]">&gt;</span>
      </button>

      {/* 8. 导出任务... */}
      <button
        onClick={() => {
          onExport(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Download className="w-4 h-4 text-text-secondary" />
        <span>导出任务...</span>
      </button>

      <div className="h-px bg-border-subtle my-1" />

      {/* 9. 在新窗口打开 */}
      <button
        onClick={() => {
          onOpenNewWindow(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <ExternalLink className="w-4 h-4 text-text-secondary" />
        <span>在新窗口打开</span>
      </button>

      <div className="h-px bg-border-subtle my-1" />

      {/* 10. 归档 */}
      <button
        onClick={() => {
          onArchive(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Archive className="w-4 h-4 text-text-secondary" />
        <span>{session.archived ? '取消归档' : '归档'}</span>
      </button>

      {/* 11. 删除 */}
      <button
        onClick={() => {
          onDelete(session);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent-red/10 text-accent-red text-left transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4 text-accent-red" />
        <span>删除</span>
      </button>
    </div>
  );
};
