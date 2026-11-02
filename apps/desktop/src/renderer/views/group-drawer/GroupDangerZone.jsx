/**
 * GroupDangerZone.jsx
 * 群聊配置面板 - 危险操作区域：
 * 提供解散群聊（Dissolve）与从我的列表退出（Leave/Remove）的二次确认交互。
 * 单文件严格规范：<= 160 行
 */

import React, { useState } from 'react';
import { AlertTriangle, Trash2, LogOut } from 'lucide-react';

export default function GroupDangerZone({
  group,
  onDissolveGroup,
  onLeaveGroup,
}) {
  const [confirmDissolve, setConfirmDissolve] = useState(false);

  if (!group) return null;

  return (
    <div className="space-y-4 text-xs select-none pt-2">
      <div className="p-3.5 bg-rose-950/20 border border-rose-900/50 rounded-2xl space-y-3">
        <div className="flex items-center space-x-2 text-rose-400 font-semibold text-xs">
          <AlertTriangle className="w-4 h-4" />
          <span>危险操作 (Danger Zone)</span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          解散群聊将立即停止当前正在执行的分工计划与排队队列，并从本地会话列表中物理移除；退出群聊仅将此房间从当前设备隐藏。
        </p>

        <div className="pt-2 border-t border-rose-900/30 flex items-center justify-between">
          <div>
            <div className="font-semibold text-slate-200">解散此群聊</div>
            <div className="text-[10px] text-slate-500">无法撤销，所有成员即刻退出</div>
          </div>

          {confirmDissolve ? (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setConfirmDissolve(false)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={() => onDissolveGroup?.(group.id)}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-md active:scale-95 cursor-pointer"
              >
                确认解散
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDissolve(true)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/60 font-medium text-xs transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>解散群聊</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
