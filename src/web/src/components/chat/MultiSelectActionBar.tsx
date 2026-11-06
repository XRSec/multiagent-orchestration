import React from 'react';
import { CheckSquare, Copy, GitFork, Trash2, X } from 'lucide-react';

interface MultiSelectActionBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBatchFork: () => void;
  onBatchCopy: () => void;
  onBatchDelete: () => void;
  onExit: () => void;
}

export const MultiSelectActionBar: React.FC<MultiSelectActionBarProps> = ({
  selectedCount,
  totalCount,
  onSelectAll,
  onDeselectAll,
  onBatchFork,
  onBatchCopy,
  onBatchDelete,
  onExit
}) => {
  const isAllSelected = selectedCount > 0 && selectedCount === totalCount;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2.5 bg-surface-elevated/95 backdrop-blur-2xl border border-border-default rounded-full shadow-2xl text-xs animate-in slide-in-from-bottom-4 duration-150">
      <div className="flex items-center gap-2 pr-3 border-r border-border-subtle font-medium text-text-primary">
        <CheckSquare className="w-4 h-4 text-accent-blue" />
        <span>已选择 <strong className="text-accent-blue font-mono">{selectedCount}</strong> 条</span>
      </div>

      <button
        onClick={isAllSelected ? onDeselectAll : onSelectAll}
        className="px-2.5 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
      >
        {isAllSelected ? '取消全选' : '全选'}
      </button>

      <button
        disabled={selectedCount === 0}
        onClick={onBatchFork}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-primary disabled:opacity-40 transition-colors cursor-pointer"
      >
        <GitFork className="w-3.5 h-3.5 text-accent-purple" />
        <span>分叉新会话</span>
      </button>

      <button
        disabled={selectedCount === 0}
        onClick={onBatchCopy}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-primary disabled:opacity-40 transition-colors cursor-pointer"
      >
        <Copy className="w-3.5 h-3.5 text-accent-green" />
        <span>合并复制</span>
      </button>

      <button
        disabled={selectedCount === 0}
        onClick={onBatchDelete}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-red/10 hover:bg-accent-red/20 text-accent-red disabled:opacity-40 transition-colors cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
        <span>批量删除</span>
      </button>

      <button
        onClick={onExit}
        title="退出多选"
        className="p-1 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer ml-1"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
