import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Bot,
  Sparkles,
  MessageSquare,
  Shield,
  Layers,
  ChevronRight,
  Plus,
  Star,
  CheckCircle2,
} from 'lucide-react';
import { MOCK_BOTS, BotItem } from '@/mock/bots';

export function BotsHomePage() {
  const navigate = useNavigate();
  const [selectedBot, setSelectedBot] = useState<BotItem>(MOCK_BOTS[0]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none p-6 space-y-6">
      {/* 1. Header & Secondary Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-border-default">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-purple" />
            <span>AI 伙伴团队与阵容 (Teammates)</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            由专业 AI 伙伴组成的高效团队，具备各自独立的角色能力、持久记忆与自主协作流程
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/bots/roster')}
            className="px-3 py-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-xs font-medium text-text-secondary transition-colors"
          >
            阵容编队
          </button>
          <button
            onClick={() => navigate('/bots/market')}
            className="px-3 py-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-xs font-medium text-text-secondary transition-colors"
          >
            伙伴市场
          </button>
          <button
            onClick={() => navigate('/bots/groups/group-m1')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-medium shadow-sm hover:bg-accent-hover transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>伙伴群组</span>
          </button>
        </div>
      </div>

      {/* 2. Bots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {MOCK_BOTS.map((bot) => (
          <div
            key={bot.id}
            onClick={() => setSelectedBot(bot)}
            className={`p-4 bg-surface-elevated border rounded-2xl cursor-pointer transition-all flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md ${
              selectedBot.id === bot.id
                ? 'border-accent-purple shadow-md'
                : 'border-border-default hover:border-text-tertiary'
            }`}
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="relative">
                  <img
                    src={bot.avatar}
                    alt={bot.name}
                    className="w-12 h-12 rounded-2xl object-cover bg-surface-chip border border-border-default shadow-sm"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-elevated ${
                      bot.status === 'online'
                        ? 'bg-accent-green'
                        : bot.status === 'busy'
                        ? 'bg-accent-amber'
                        : 'bg-text-tertiary'
                    }`}
                  />
                </div>

                <div className="flex items-center gap-1 text-[11px] text-text-tertiary font-mono">
                  <Star className="w-3 h-3 text-accent-amber fill-accent-amber" />
                  <span>{bot.stats.rating}</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-text-primary">{bot.name}</h3>
                <div className="text-xs text-accent-purple font-medium">{bot.title}</div>
                <div className="text-[10px] text-text-tertiary mt-0.5">{bot.department}</div>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                {bot.description}
              </p>

              <div className="flex flex-wrap gap-1 pt-1">
                {bot.capabilities.slice(0, 3).map((cap, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] bg-surface-chip text-text-secondary px-2 py-0.5 rounded-md"
                  >
                    {cap}
                  </span>
                ))}
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/bots/${bot.id}`);
              }}
              className="w-full py-1.5 bg-surface hover:bg-surface-hover border border-border-default rounded-xl text-xs font-semibold text-text-primary transition-colors flex items-center justify-center gap-1"
            >
              <MessageSquare className="w-3.5 h-3.5 text-accent-blue" />
              <span>开启对话</span>
            </button>
          </div>
        ))}
      </div>

      {/* 3. Selected Bot Deep Dive Profile */}
      <div className="bg-surface-elevated border border-border-default rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <img
              src={selectedBot.avatar}
              alt=""
              className="w-10 h-10 rounded-xl object-cover border border-border-default"
            />
            <div>
              <div className="text-sm font-bold text-text-primary flex items-center gap-2">
                <span>{selectedBot.name}</span>
                <span className="text-xs text-accent-purple font-normal">({selectedBot.title})</span>
              </div>
              <div className="text-xs text-text-tertiary font-mono">
                Model: {selectedBot.model} | 协作次数: {selectedBot.stats.collaborations}
              </div>
            </div>
          </div>

          <button
            onClick={() => navigate(`/bots/${selectedBot.id}`)}
            className="px-4 py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold hover:bg-accent-hover transition-colors"
          >
            与 {selectedBot.name} 独立对话
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1.5 p-3 bg-surface rounded-xl border border-border-default">
            <div className="text-[11px] font-semibold text-text-tertiary uppercase">
              系统定位与提示词约束 (System Prompt)
            </div>
            <p className="text-text-secondary leading-relaxed font-mono">
              {selectedBot.systemPrompt}
            </p>
          </div>

          <div className="space-y-1.5 p-3 bg-surface rounded-xl border border-border-default">
            <div className="text-[11px] font-semibold text-text-tertiary uppercase">
              专长能力清单 (Capabilities)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {selectedBot.capabilities.map((cap, idx) => (
                <span
                  key={idx}
                  className="px-2.5 py-1 bg-surface-chip text-text-primary rounded-lg text-xs"
                >
                  ✓ {cap}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
