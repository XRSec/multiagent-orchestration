import React from 'react';
import { AlertTriangle, Shield, Lock } from 'lucide-react';

export type PermissionMode = 'bypass' | 'auto' | 'ask';

interface ComposerPermissionMenuProps {
  isOpen: boolean;
  onSelect: (mode: PermissionMode) => void;
}

export function ComposerPermissionMenu({ isOpen, onSelect }: ComposerPermissionMenuProps) {
  if (!isOpen) return null;

  return (
    <div className="absolute left-0 bottom-full mb-2 w-56 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs">
      <div
        onClick={() => onSelect('bypass')}
        className="p-2 rounded-xl hover:bg-surface-hover cursor-pointer space-y-0.5"
      >
        <div className="flex items-center gap-2 font-bold text-accent-amber">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>完全访问 (Bypass)</span>
        </div>
        <div className="text-[10px] text-text-tertiary pl-5.5">
          不询问，自动直接放行所有文件修改与命令
        </div>
      </div>

      <div
        onClick={() => onSelect('auto')}
        className="p-2 rounded-xl hover:bg-surface-hover cursor-pointer space-y-0.5"
      >
        <div className="flex items-center gap-2 font-bold text-accent-green">
          <Shield className="w-3.5 h-3.5" />
          <span>自动审批 (Auto)</span>
        </div>
        <div className="text-[10px] text-text-tertiary pl-5.5">
          自动根据工作区边界判定并审批执行
        </div>
      </div>

      <div
        onClick={() => onSelect('ask')}
        className="p-2 rounded-xl hover:bg-surface-hover cursor-pointer space-y-0.5"
      >
        <div className="flex items-center gap-2 font-bold text-text-primary">
          <Lock className="w-3.5 h-3.5" />
          <span>手动确认 (Ask)</span>
        </div>
        <div className="text-[10px] text-text-tertiary pl-5.5">
          关键文件写入与终端指令需逐项授权
        </div>
      </div>
    </div>
  );
}
