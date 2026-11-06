import React, { useEffect, useRef } from 'react';
import {
  Share2,
  GitFork,
  Link as LinkIcon,
  Trash2,
  CheckSquare,
  Pencil
} from 'lucide-react';

interface MessageContextMenuProps {
  x: number;
  y: number;
  messageId: string;
  timestamp?: string;
  onClose: () => void;
  onShareAsImage?: () => void;
  onCreateTopicOrFork?: () => void;
  onCopyLink?: () => void;
  onRecallAndEdit?: () => void;
  onDeleteMessage?: () => void;
  onEnterMultiSelect?: () => void;
}

export const MessageContextMenu: React.FC<MessageContextMenuProps> = ({
  x,
  y,
  messageId,
  timestamp,
  onClose,
  onShareAsImage,
  onCreateTopicOrFork,
  onCopyLink,
  onRecallAndEdit,
  onDeleteMessage,
  onEnterMultiSelect
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

  const menuWidth = 190;
  const menuHeight = 220;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 12);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 12);

  const displayTime = timestamp || new Date().toLocaleString('zh-CN', { hour12: false });

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-[9999] w-[185px] bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-2xl shadow-2xl p-1.5 text-xs text-text-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. 分享为图片 */}
      <button
        onClick={() => {
          onShareAsImage?.();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Share2 className="w-4 h-4 text-text-secondary" />
        <span>分享为图片</span>
      </button>

      {/* 2. 创建话题 / 分叉 */}
      <button
        onClick={() => {
          onCreateTopicOrFork?.();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <GitFork className="w-4 h-4 text-text-secondary" />
        <span>创建话题 / 分叉</span>
      </button>

      {/* 3. 复制当前消息链接 */}
      <button
        onClick={() => {
          onCopyLink?.();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <LinkIcon className="w-4 h-4 text-text-secondary" />
        <span>复制当前消息链接</span>
      </button>

      {/* 4. 多选消息 */}
      {onEnterMultiSelect && (
        <button
          onClick={() => {
            onEnterMultiSelect();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
        >
          <CheckSquare className="w-4 h-4 text-text-secondary" />
          <span>多选消息...</span>
        </button>
      )}

      {/* 4.1 撤回并重新编辑 */}
      {onRecallAndEdit && (
        <button
          onClick={() => {
            onRecallAndEdit();
            onClose();
          }}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent-blue/10 text-accent-blue text-left transition-colors cursor-pointer font-medium"
        >
          <Pencil className="w-4 h-4 text-accent-blue" />
          <span>撤回并重新编辑</span>
        </button>
      )}

      <div className="h-px bg-border-subtle my-1" />

      {/* 5. 删除本条消息 */}
      <button
        onClick={() => {
          onDeleteMessage?.();
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent-red/10 text-accent-red text-left transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4 text-accent-red" />
        <span>删除本条消息</span>
      </button>

      <div className="h-px bg-border-subtle my-1" />

      {/* 6. 时间戳底栏 (1:1 还原截图) */}
      <div className="px-3 py-1.5 text-[11px] font-mono text-text-tertiary">
        {displayTime}
      </div>
    </div>
  );
};
