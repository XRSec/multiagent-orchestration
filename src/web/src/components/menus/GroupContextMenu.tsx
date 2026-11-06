import React, { useEffect, useRef } from 'react';
import { Settings, Archive } from 'lucide-react';
import type { BotGroupItem } from '@/mock/bots';

interface GroupContextMenuProps {
  x: number;
  y: number;
  group: BotGroupItem;
  onClose: () => void;
  onOpenSettings: (group: BotGroupItem) => void;
  onArchiveGroup: (group: BotGroupItem) => void;
}

export const GroupContextMenu: React.FC<GroupContextMenuProps> = ({
  x,
  y,
  group,
  onClose,
  onOpenSettings,
  onArchiveGroup
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

  const menuWidth = 150;
  const menuHeight = 110;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 12);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 12);

  return (
    <div
      ref={menuRef}
      style={{ left: adjustedX, top: adjustedY }}
      className="fixed z-[9999] w-[140px] bg-surface-elevated/95 backdrop-blur-xl border border-border-default rounded-2xl shadow-2xl p-1.5 text-xs text-text-primary select-none animate-in fade-in zoom-in-95 duration-100"
    >
      {/* 1. 群设置 */}
      <button
        onClick={() => {
          onOpenSettings(group);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Settings className="w-4 h-4 text-text-secondary" />
        <span>群设置</span>
      </button>

      <div className="h-px bg-border-subtle my-1" />

      {/* 2. 归档群 */}
      <button
        onClick={() => {
          onArchiveGroup(group);
          onClose();
        }}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-surface-hover text-left transition-colors cursor-pointer"
      >
        <Archive className="w-4 h-4 text-text-secondary" />
        <span>归档群</span>
      </button>
    </div>
  );
};
