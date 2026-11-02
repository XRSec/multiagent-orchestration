/**
 * GroupMembersTab.jsx
 * 群聊配置面板 - 成员管理选项卡：
 * 展示群内当前成员列表、角色徽标、移除成员及向群内添加新伙伴。
 * 单文件严格规范：<= 200 行
 */

import React, { useState } from 'react';
import { UserPlus, Trash2, Bot, Shield, Crown } from 'lucide-react';

export default function GroupMembersTab({
  group,
  allPartners = [],
  onUpdateMembers,
}) {
  const [selectedToAdd, setSelectedToAdd] = useState('');

  if (!group) return null;

  const currentMemberIds = (group.members || []).map((m) => m.botId || m.id);
  const organizerId = group.organizerBotId || 'lead-orchestrator';

  // Available partners not yet in this group
  const nonMembers = allPartners.filter((p) => !currentMemberIds.includes(p.id));

  const handleAddMember = () => {
    if (!selectedToAdd) return;
    const target = allPartners.find((p) => p.id === selectedToAdd);
    if (!target) return;

    const newMembers = [
      ...(group.members || []),
      {
        botId: target.id,
        name: target.name,
        role: target.role,
        joinedAt: Date.now(),
      },
    ];

    onUpdateMembers?.(newMembers);
    setSelectedToAdd('');
  };

  const handleRemoveMember = (botId) => {
    if (botId === organizerId) {
      alert('无法移除群主负责人！请先指定其他成员为群主。');
      return;
    }
    const newMembers = (group.members || []).filter(
      (m) => (m.botId || m.id) !== botId
    );
    onUpdateMembers?.(newMembers);
  };

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Add Member Bar */}
      <div className="flex items-center space-x-2">
        <select
          value={selectedToAdd}
          onChange={(e) => setSelectedToAdd(e.target.value)}
          className="flex-1 bg-slate-950 border border-border/80 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-accent/80 font-mono"
        >
          <option value="">-- 选择要加入群聊的伙伴 --</option>
          {nonMembers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.role})
            </option>
          ))}
        </select>

        <button
          onClick={handleAddMember}
          disabled={!selectedToAdd}
          className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
            selectedToAdd
              ? 'bg-accent text-slate-950 hover:bg-accent-hover cursor-pointer'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>添加</span>
        </button>
      </div>

      {/* Current Members List */}
      <div className="space-y-2">
        <div className="text-[11px] font-semibold text-slate-400 px-1">
          当前在群成员 ({(group.members || []).length})
        </div>

        <div className="space-y-1.5">
          {(group.members || []).map((m) => {
            const botId = m.botId || m.id;
            const p = allPartners.find((cand) => cand.id === botId);
            const isOrganizer = botId === organizerId;

            return (
              <div
                key={botId}
                className="p-2.5 rounded-xl bg-card/60 border border-border/70 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-accent flex-shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5 font-medium text-slate-200">
                      <span className="truncate">{p?.name || m.name || botId}</span>
                      {isOrganizer && (
                        <span className="flex items-center gap-1 text-[9px] bg-amber-500/15 text-amber-400 border border-amber-500/30 px-1.5 py-0.2 rounded-full">
                          <Crown className="w-2.5 h-2.5" />
                          群主
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate">
                      {p?.role || '协同伙伴'} · {botId}
                    </div>
                  </div>
                </div>

                {!isOrganizer && (
                  <button
                    onClick={() => handleRemoveMember(botId)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-all cursor-pointer"
                    title="移出群聊"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
