/**
 * Purpose: Friendly empty state placeholder with starter suggestion chips for newly created rooms.
 * Context: Guides the user on how to initiate collaborative multi-agent group tasks using @mentions.
 * Usage: <EmptyRoomState roomName="multiagent-orchestration" onSelectSuggestion={(text) => setInputVal(text)} />
 * Prerequisites: React 19, Lucide icons, Tailwind CSS.
 */

import React from 'react';
import { Bot, Sparkles, MessageSquare, ArrowRight } from 'lucide-react';

interface EmptyRoomStateProps {
  roomName: string;
  onSelectSuggestion: (text: string) => void;
}

const STARTER_SUGGESTIONS = [
  {
    icon: Sparkles,
    label: '测试我发的消息 (运行状态卡片)',
    prompt: '测试我发的消息：全链路校验状态卡片最高高度限制与无原生滚动条交互'
  },
  {
    icon: Sparkles,
    label: '多智能体任务分解与统筹',
    prompt: '@moAdmin 针对 multiagent-orchestration 进行群任务拆解并分配各伙伴'
  },
  {
    icon: Bot,
    label: '前端状态卡片与无滚动条实现',
    prompt: '@moCode 请落实群聊消息气泡下方状态卡片最高限高与无滚动条平滑滚动'
  },
  {
    icon: MessageSquare,
    label: '持续集成与构建验收',
    prompt: '@MoCI 请执行自动化构建与测试验收，确保质量门禁 100% 绿灯'
  }
];

export const EmptyRoomState: React.FC<EmptyRoomStateProps> = ({
  roomName,
  onSelectSuggestion
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto select-none">
      <div className="w-16 h-16 rounded-3xl bg-surface-elevated border border-border-default shadow-md flex items-center justify-center mb-4 text-accent-blue">
        <Bot className="w-8 h-8" />
      </div>

      <h3 className="text-base font-bold text-text-primary mb-1">
        欢迎加入 {roomName} 协同群
      </h3>
      <p className="text-xs text-text-secondary leading-relaxed mb-6">
        在这里可以与 7 位核心伙伴展开协同攻坚。输入框输入 <span className="font-semibold text-accent-blue font-mono">@</span> 即可指定伙伴分配任务。
      </p>

      <div className="w-full space-y-2">
        <div className="text-[10px] font-bold text-text-tertiary uppercase tracking-wider text-left pl-1">
          建议开始的话题
        </div>
        {STARTER_SUGGESTIONS.map((s, idx) => {
          const Icon = s.icon;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectSuggestion(s.prompt)}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-surface-elevated border border-border-subtle hover:border-accent-blue/40 hover:bg-surface-chip/50 transition-all text-left group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-xl bg-surface flex items-center justify-center text-text-secondary group-hover:text-accent-blue transition-colors shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-text-primary group-hover:text-accent-blue transition-colors truncate">
                    {s.label}
                  </div>
                  <div className="text-[11px] text-text-tertiary font-mono truncate">{s.prompt}</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-text-tertiary group-hover:text-accent-blue group-hover:translate-x-0.5 transition-all shrink-0 ml-2" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
