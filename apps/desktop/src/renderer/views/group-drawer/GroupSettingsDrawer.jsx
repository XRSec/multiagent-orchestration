/**
 * GroupSettingsDrawer.jsx
 * 群聊配置抽屉主容器：
 * 集成 SlideOverDrawer，组织 GroupProfileTab（基础设置）、
 * GroupMembersTab（成员管理）与 GroupDangerZone（危险区），
 * 严格对齐 Cindy 的 BotGroupSettingsDrawer 业务规范。
 * 单文件严格规范：<= 230 行
 */

import React, { useState } from 'react';
import { Settings2, Users, Sliders, AlertTriangle } from 'lucide-react';
import SlideOverDrawer from '../../components/common/SlideOverDrawer.jsx';
import GroupProfileTab from './GroupProfileTab.jsx';
import GroupMembersTab from './GroupMembersTab.jsx';
import GroupDangerZone from './GroupDangerZone.jsx';

export default function GroupSettingsDrawer({
  isOpen,
  onClose,
  group,
  allPartners = [],
  onUpdateGroup,
  onDissolveGroup,
}) {
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'members' | 'danger'

  if (!group) return null;

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="群聊配置"
      subtitle={`${group.name || group.title || '群聊'} · ${group.id}`}
      width="w-[520px]"
    >
      <div className="space-y-4 text-xs select-none">
        {/* Navigation Tabs */}
        <div className="flex border-b border-border/70">
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'profile'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            基础资料 (Profile)
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'members'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            群成员管理 ({(group.members || []).length})
          </button>

          <button
            onClick={() => setActiveTab('danger')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'danger'
                ? 'border-rose-500 text-rose-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            危险操作 (Danger Zone)
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'profile' && (
          <GroupProfileTab
            group={group}
            partners={allPartners}
            onSave={(updated) => onUpdateGroup?.(updated)}
          />
        )}

        {activeTab === 'members' && (
          <GroupMembersTab
            group={group}
            allPartners={allPartners}
            onUpdateMembers={(newMembers) =>
              onUpdateGroup?.({ ...group, members: newMembers })
            }
          />
        )}

        {activeTab === 'danger' && (
          <GroupDangerZone
            group={group}
            onDissolveGroup={(gid) => {
              onDissolveGroup?.(gid);
              onClose?.();
            }}
          />
        )}
      </div>
    </SlideOverDrawer>
  );
}
