/**
 * BotGroupChatView.jsx
 * Cindy 风格的伙伴群聊核心主页面：
 * 顶栏（群名称、成员头像栈、群主负责人标识、群设置抽屉触发入口）+
 * 多作者时间线列表 + 实时进行中条（BotGroupLiveStatus）+ 自然输入框（BotGroupComposer）。
 * 单文件严格规范：<= 250 行
 */

import React, { useState, useRef, useEffect } from 'react';
import { Settings2, Users, Bot, FolderGit2 } from 'lucide-react';
import AvatarStack from '../../components/common/AvatarStack.jsx';
import BotGroupTimelineItem from './BotGroupTimelineItem.jsx';
import BotGroupLiveStatus from './BotGroupLiveStatus.jsx';
import BotGroupComposer from './BotGroupComposer.jsx';

export default function BotGroupChatView({
  group,
  partners = [],
  onSendMessage,
  onOpenGroupSettings,
  onStepAction,
  onStartPlan,
  isExecuting = false,
  activeSpeaker = null,
}) {
  const timelineEndRef = useRef(null);

  useEffect(() => {
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [group?.messages?.length, isExecuting]);

  if (!group) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
        未选择群聊房间
      </div>
    );
  }

  const messages = group.messages || [];
  const members = group.members || [];
  const organizerId = group.organizerBotId || 'lead-orchestrator';

  // Format members for AvatarStack
  const memberAvatars = members.map((m) => {
    const p = partners.find((cand) => cand.id === (m.botId || m.id));
    return {
      name: p?.name || m.name || m.botId || '伙伴',
      avatarColor: p?.avatarColor || 'bg-slate-800 text-sky-400',
    };
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface/30 select-none">
      {/* Group Header Bar */}
      <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-surface/70 backdrop-blur-md flex-shrink-0">
        <div className="flex items-center space-x-3.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400 flex-shrink-0">
            <Users className="w-4 h-4" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center space-x-2">
              <h1 className="font-semibold text-sm text-slate-100 truncate max-w-sm">
                {group.name || group.title || '多 Agent 协同群聊'}
              </h1>
              <span className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full">
                {members.length} 位成员
              </span>
            </div>

            <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2 mt-0.5">
              <span>Room: {group.id}</span>
              <span>·</span>
              <span>Seq: #{messages.length}</span>
              <span>·</span>
              <span className="text-slate-400">群主: {organizerId}</span>
            </div>
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center space-x-3">
          {/* Member Avatar Stack */}
          <AvatarStack members={memberAvatars} max={4} size="sm" />

          {/* Group Settings Drawer Trigger */}
          <button
            onClick={() => onOpenGroupSettings?.(group)}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-card hover:bg-slate-700/60 border border-border/80 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
            title="群聊配置"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-400" />
            <span>群设置</span>
          </button>
        </div>
      </header>

      {/* Main Messages Timeline */}
      <div className="flex-1 overflow-y-auto p-6 space-y-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
            <Users className="w-10 h-10 text-slate-600 mb-2 stroke-[1.5]" />
            <div className="text-xs font-medium text-slate-300">群聊房间已开启</div>
            <div className="text-[11px] text-slate-500 mt-1 max-w-sm">
              在下方输入协同任务，支持随时打 @ 点名伙伴，或开启分工模式交由负责人出计划。
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <BotGroupTimelineItem
              key={msg.id || msg.sequence}
              message={msg}
              onStepAction={onStepAction}
              onStartPlan={onStartPlan}
            />
          ))
        )}
        <div ref={timelineEndRef} />
      </div>

      {/* Live Speaking Status Strip */}
      <BotGroupLiveStatus
        speaker={activeSpeaker}
        isExecuting={isExecuting}
        statusText={activeSpeaker?.statusText || ''}
      />

      {/* Group Composer Input */}
      <BotGroupComposer
        onSendMessage={onSendMessage}
        isExecuting={isExecuting}
        members={partners}
      />
    </div>
  );
}
