/**
 * Purpose: New chat task entry page with ComposerCard and suggestion prompts.
 * Context: Creates authentic persistent sessions and bridges user intent to agent execution.
 * Usage: Route component for /cc-agent/new.
 * Prerequisites: React 19, react-router-dom, useSessions hook.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { ComposerCard } from '@/components/ComposerCard';
import { SlashCommand } from '@/components/SlashCommandMenu';
import { useSessions } from '@/hooks/useSessions';

export function NewChatPage() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { createSession } = useSessions();

  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const suggestionChips = [
    { label: '🏗️ 审查 M1 Helper 架构与多 Agent 协同', prompt: '全面审查 M1 Helper 助手模块，并分析上下文去脂策略' },
    { label: '🎨 获取并精修 Cindy App UI 页面壳子', prompt: '从 cindy 中获取 App UI 页面的壳子，所有 UI 页面都需要，存到 apps/web' },
    { label: '🔍 自动化巡检 Git 工作区变更与测试状态', prompt: '检查当前仓库中未提交的代码，并执行单元测试' },
    { label: '⏰ 创建每日 09:00 GitHub 待审 PR 自动汇总', prompt: '配置一项每天早晨 9:00 自动收集 PR 并汇报的定时任务' },
  ];

  const handleSend = async () => {
    const text = prompt.trim();
    if (!text || isSubmitting) return;

    if (text.startsWith('[Teamwork]') || text.startsWith('/teamwork')) {
      navigate('/bots/groups/multiagent-orchestration');
      return;
    }

    try {
      setIsSubmitting(true);
      const title = text.slice(0, 24);
      const newSession = await createSession({
        title,
        tags: ['新建任务'],
        status: 'idle',
      });

      if (newSession && newSession.id) {
        navigate(`/cc-agent/${newSession.id}`, { state: { autoSend: text } });
      }
    } catch (err) {
      console.error('Failed to create new session:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSelectSlashCommand = (cmd: SlashCommand) => {
    if (cmd.name === 'mcp') {
      navigate('/mcp');
      return;
    }
    if (cmd.name === 'skills') {
      navigate('/skillhub');
      return;
    }
    if (cmd.name === 'plugin') {
      navigate('/plugins');
      return;
    }
    if (cmd.name === 'config' || cmd.name === 'storage' || cmd.name === 'theme') {
      navigate('/settings');
      return;
    }
    if (cmd.name === 'workflows' || cmd.name === 'tasks') {
      navigate('/cc-agent/orca');
      return;
    }
    if (cmd.name === 'goal') {
      setPrompt('[Goal] ');
      return;
    }
    if (cmd.name === 'teamwork') {
      setPrompt('[Teamwork] ');
      return;
    }
    if (cmd.name === 'boost') {
      setPrompt('[Boost] ');
      return;
    }
    setPrompt(`/${cmd.name} `);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-start sm:justify-center p-4 sm:p-6 pt-6 sm:pt-6 min-h-0 select-none overflow-y-auto bg-surface">
      {/* 1. Official Cindy Brand Lockup (50px icon + 110x37.5px Logo) */}
      <div className="flex flex-col items-center mb-6 sm:mb-8 space-y-3">
        <div className="flex items-center gap-3">
          <img
            src="/assets/cindy-avatar-lockup.png"
            alt="Cindy"
            className="w-[50px] h-[50px] rounded-2xl shadow-md border border-border-default object-cover"
          />
          <img
            src={isDark ? '/assets/cindy-logo-dark.png' : '/assets/cindy-logo-light.png'}
            alt="Cindy"
            className="h-[34px] w-auto object-contain"
          />
        </div>
        <p className="text-xs text-text-secondary text-center max-w-md leading-relaxed">
          全自主智能开发助手。从代码审查、UI 原型打磨，到全自动流水线与多 Agent 协同。
        </p>
      </div>

      {/* 2. Official ComposerCard Framework */}
      <div className="w-full max-w-2xl relative">
        <ComposerCard
          prompt={prompt}
          onPromptChange={setPrompt}
          onSend={handleSend}
          isNewChat={true}
          onSelectSlashCommand={handleSelectSlashCommand}
          placeholder="描述任务或提出问题..."
        />
      </div>

      {/* 3. Suggestion Pills */}
      <div className="w-full max-w-2xl mt-5">
        <div className="text-[11px] font-semibold text-text-tertiary mb-2 uppercase tracking-wider text-center">
          常用任务建议
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {suggestionChips.map((chip, idx) => (
            <div
              key={idx}
              onClick={() => setPrompt(chip.prompt)}
              className="p-2.5 bg-surface-elevated hover:bg-surface-hover border border-border-default rounded-xl cursor-pointer text-xs text-text-secondary hover:text-text-primary transition-all flex items-center gap-2 group shadow-sm"
            >
              <span className="truncate group-hover:translate-x-0.5 transition-transform">
                {chip.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
