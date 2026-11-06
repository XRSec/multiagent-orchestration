/**
 * Purpose: Top header bar for the single bot chat session.
 * Context: Bot chat session page, offering bot info, settings navigation, and quick action buttons.
 * Usage: Rendered at the top of BotSessionPage.
 * Prerequisites: React, react-router-dom, lucide-react, BotItem type.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  UserPlus,
  Activity,
  Phone,
  PhoneOff,
  Settings2,
  Volume2,
} from 'lucide-react';
import { BotItem } from '@/mock/bots';
import { useToast } from '@/contexts/ToastContext';

export interface BotSessionHeaderProps {
  bot: BotItem;
  botName: string;
  botTitle: string;
  botModel: string;
  isVoiceCallActive: boolean;
  onToggleVoiceCall: () => void;
  onOpenSettings: () => void;
}

export function BotSessionHeader({
  bot,
  botName,
  botTitle,
  botModel,
  isVoiceCallActive,
  onToggleVoiceCall,
  onOpenSettings,
}: BotSessionHeaderProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();

  return (
    <>
      <div className="h-14 px-4 border-b border-border-default bg-surface flex items-center justify-between shrink-0 z-20">
        {/* 左上角：点击进入伙伴设置页面 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/bots')}
            title="返回伙伴列表"
            className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* 伙伴头像与名称胶囊 */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="点击查看并配置伙伴设置"
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-surface-hover transition-colors cursor-pointer group"
          >
            <div className="relative">
              <img
                src={bot.avatar}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-border-default shadow-xs"
              />
              <span
                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-surface ${
                  bot.status === 'online'
                    ? 'bg-accent-green'
                    : bot.status === 'busy'
                    ? 'bg-accent-amber'
                    : 'bg-text-tertiary'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5 text-left">
              <span className="text-sm font-bold text-text-primary group-hover:text-accent-blue transition-colors">
                {botName}
              </span>
              <span className="text-xs text-text-tertiary font-normal">
                ({botTitle.split(' ')[0]})
              </span>
              <span className="text-[10px] bg-surface-chip text-text-secondary px-1.5 py-0.2 rounded-md font-mono">
                {botModel.split('-')[1] || botModel}
              </span>
            </div>
          </button>
        </div>

        {/* 右上角操作区 */}
        <div className="flex items-center gap-1.5">
          {/* 拉入群聊 */}
          <button
            type="button"
            onClick={() => navigate('/bots/groups/group-m1')}
            title="创建或拉入群组协同"
            className="p-2 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
          </button>

          {/* 伙伴近况 / 任务浮层 */}
          <button
            type="button"
            onClick={() =>
              showToast(
                `${botName} 近况: 完成任务 ${bot.stats.tasksCompleted} 次 · 好评率 ${bot.stats.rating} · 正常就绪`,
                'info'
              )
            }
            title="伙伴近况"
            className="p-2 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
          >
            <Activity className="w-4 h-4 text-accent-green" />
          </button>

          {/* 实时语音通话 (Voice Call) */}
          <button
            type="button"
            onClick={onToggleVoiceCall}
            title={isVoiceCallActive ? '挂断语音' : '开启双向实时语音'}
            className={`p-2 rounded-full transition-colors cursor-pointer ${
              isVoiceCallActive
                ? 'bg-accent-red text-white animate-pulse'
                : 'hover:bg-surface-hover text-text-tertiary hover:text-text-primary'
            }`}
          >
            {isVoiceCallActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </button>

          {/* 伙伴设置齿轮按钮 */}
          <button
            type="button"
            onClick={onOpenSettings}
            title="伙伴设置"
            className="p-2 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 语音通话悬浮条 */}
      {isVoiceCallActive && (
        <div className="h-10 px-4 bg-accent-blue/10 border-b border-accent-blue/20 flex items-center justify-between text-xs text-accent-blue">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span className="font-medium">与 {botName} 实时语音通话中...</span>
          </div>
          <button
            type="button"
            onClick={onToggleVoiceCall}
            className="px-2 py-0.5 bg-accent-red text-white text-[11px] rounded-lg hover:bg-red-600 transition-colors cursor-pointer"
          >
            挂断
          </button>
        </div>
      )}
    </>
  );
}
