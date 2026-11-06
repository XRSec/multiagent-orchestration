import React, { useEffect, useRef } from 'react';
import { Pin, EyeOff, Copy, Trash2 } from 'lucide-react';
import type { PartnerInfo } from '@/types/room';

interface PartnerContextMenuProps {
  x: number;
  y: number;
  partner: PartnerInfo;
  isPinned?: boolean;
  isHidden?: boolean;
  onClose: () => void;
  onTogglePin: (partner: PartnerInfo) => void;
  onToggleHide: (partner: PartnerInfo) => void;
  onDuplicate: (partner: PartnerInfo) => void;
  onDelete: (partner: PartnerInfo) => void;
}

export const PartnerContextMenu: React.FC<PartnerContextMenuProps> = ({
  x,
  y,
  partner,
  isPinned = false,
  isHidden = false,
  onClose,
  onTogglePin,
  onToggleHide,
  onDuplicate,
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

  const menuWidth = 170;
  const menuHeight = 180;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 12);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 12);

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-[9999] w-[160px] bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-2xl shadow-2xl p-1.5 text-xs text-text-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. 置顶 */}
      <button
        onClick={() => {
          onTogglePin(partner);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Pin className={`w-4 h-4 ${isPinned ? 'text-accent-blue rotate-45' : 'text-text-secondary'}`} />
        <span>{isPinned ? '取消置顶' : '置顶'}</span>
      </button>

      {/* 2. 隐藏 */}
      <button
        onClick={() => {
          onToggleHide(partner);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <EyeOff className="w-4 h-4 text-text-secondary" />
        <span>{isHidden ? '取消隐藏' : '隐藏'}</span>
      </button>

      <div className="h-px bg-border-subtle my-1" />

      {/* 3. 复制伙伴 */}
      <button
        onClick={() => {
          onDuplicate(partner);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Copy className="w-4 h-4 text-text-secondary" />
        <span>复制伙伴</span>
      </button>

      <div className="h-px bg-border-subtle my-1" />

      {/* 4. 永久删除 */}
      <button
        onClick={() => {
          onDelete(partner);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-accent-red/10 text-accent-red text-left transition-colors cursor-pointer"
      >
        <Trash2 className="w-4 h-4 text-accent-red" />
        <span>永久删除</span>
      </button>
    </div>
  );
};
