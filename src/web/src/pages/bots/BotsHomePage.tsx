import React, { useState, useEffect } from 'react';
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
  Cpu,
  Terminal,
  Activity
} from 'lucide-react';
import type { BotItem } from '@/mock/bots';

export function BotsHomePage() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<BotItem[]>([]);
  const [selectedBot, setSelectedBot] = useState<BotItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotRole, setNewBotRole] = useState('');
  const [newBotTitle, setNewBotTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    async function loadBots() {
      try {
        setLoading(true);
        const res = await fetch('/api/bots');
        const data = await res.json();
        if (data.ok && Array.isArray(data.bots) && data.bots.length > 0) {
          const mapped: BotItem[] = data.bots.map((b: any) => ({
            id: b.id,
            name: b.name,
            title: b.title,
            avatar: b.avatar_url || '/assets/agent-island-cindy.png',
            role: b.role,
            department: b.department,
            model: b.model,
            status: b.status === 'active' || b.status === 'online' ? 'online' : 'busy',
            description: b.description,
            capabilities: Array.isArray(b.capabilities?.tools)
              ? b.capabilities.tools
              : ['多智能体编排', '架构规范', '自动化验证', '系统集成'],
            systemPrompt: b.soulSummary || `角色定位：${b.role}。\n职责边界：全权负责多智能体架构演进与交付。`,
            stats: {
              tasksCompleted: 420 + Math.floor(b.name.length * 15),
              rating: 4.95,
              collaborations: 130 + Math.floor(b.name.length * 8)
            }
          }));
          setBots(mapped);
          setSelectedBot(mapped[0]);
        }
      } catch (e) {
        console.warn('Failed to load bots from server:', e);
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none p-3.5 sm:p-6 space-y-4 sm:space-y-6">
      {/* 1. Header & Secondary Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border-default">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-purple" />
            <span>AI 伙伴团队与名册 (7 Mo-Bots)</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            由 7 位专业 Mo-Bots 组成的多智能体协同开发核心团队，各持专属角色定位、记忆沙箱与协作规则
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-xs font-medium text-text-primary transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建伙伴</span>
          </button>
          <button
            onClick={() => navigate('/bots/roster')}
            className="px-3 py-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-xs font-medium text-text-secondary transition-colors cursor-pointer"
          >
            阵容编队
          </button>
          <button
            onClick={() => navigate('/bots/groups/multiagent-orchestration')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-medium shadow-sm hover:bg-accent-hover transition-colors cursor-pointer"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>核心群聊</span>
          </button>
        </div>
      </div>

      {/* 2. Bots Grid (7 Mo-Bots) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {bots.map((bot) => (
          <div
            key={bot.id}
            onClick={() => setSelectedBot(bot)}
            className={`p-4 bg-surface-elevated border rounded-2xl cursor-pointer transition-all flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md ${
              selectedBot?.id === bot.id
                ? 'border-accent-purple ring-1 ring-accent-purple/30 shadow-md'
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
                <h3 className="text-sm font-bold text-text-primary flex items-center gap-1.5">
                  <span>{bot.name}</span>
                  <span className="text-[10px] font-mono font-normal text-text-tertiary">
                    ({bot.id.split('_')[1] || bot.id})
                  </span>
                </h3>
                <div className="text-xs text-accent-purple font-medium mt-0.5">{bot.title}</div>
                <div className="text-[10px] text-text-tertiary mt-0.5">{bot.department}</div>
              </div>

              <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                {bot.description}
              </p>

              <div className="flex flex-wrap gap-1 pt-1">
                {bot.capabilities.slice(0, 3).map((cap, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] bg-surface-chip text-text-secondary px-2 py-0.5 rounded-md font-mono"
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
              <span>独立会话</span>
            </button>
          </div>
        ))}
      </div>

      {/* 3. Selected Bot Deep Dive Profile */}
      {selectedBot && (
        <div className="bg-surface-elevated border border-border-default rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border-subtle">
            <div className="flex items-center gap-3">
              <img
                src={selectedBot.avatar}
                alt=""
                className="w-11 h-11 rounded-xl object-cover border border-border-default shadow-xs shrink-0"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-text-primary flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <span>{selectedBot.name}</span>
                  <span className="text-xs text-accent-purple font-normal">({selectedBot.title})</span>
                  <span className="text-[10px] font-mono text-accent-green bg-accent-green/10 px-1.5 py-0.2 rounded">
                    ONLINE
                  </span>
                </div>
                <div className="text-xs text-text-tertiary font-mono mt-0.5 truncate">
                  模型: <strong className="text-accent-blue">{selectedBot.model}</strong> | {selectedBot.department}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={() => navigate(`/bots/groups/multiagent-orchestration`)}
                className="flex-1 sm:flex-none px-3 py-1.5 sm:py-2 border border-border-default hover:bg-surface-hover rounded-xl text-xs font-semibold text-text-primary transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-accent-purple" />
                <span>在群聊中 @{selectedBot.name}</span>
              </button>
              <button
                onClick={() => navigate(`/bots/${selectedBot.id}`)}
                className="flex-1 sm:flex-none px-3.5 py-1.5 sm:py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold hover:bg-accent-hover transition-colors shadow-sm text-center cursor-pointer"
              >
                独立对话
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2 p-3.5 bg-surface rounded-xl border border-border-default">
              <div className="text-[11px] font-bold text-text-tertiary uppercase flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-accent-blue" />
                <span>智能体架构规范与角色信条 (SOUL.md / System Prompt)</span>
              </div>
              <p className="text-text-secondary leading-relaxed font-mono text-[11px] whitespace-pre-wrap bg-surface-elevated p-2.5 rounded-lg border border-border-subtle max-h-40 overflow-y-auto">
                {selectedBot.systemPrompt}
              </p>
            </div>

            <div className="space-y-2 p-3.5 bg-surface rounded-xl border border-border-default">
              <div className="text-[11px] font-bold text-text-tertiary uppercase flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-accent-green" />
                <span>专长能力与工具白名单 (Capabilities / Tools)</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {selectedBot.capabilities.map((cap, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-surface-chip text-text-primary rounded-lg text-xs font-mono border border-border-subtle flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3 h-3 text-accent-green" />
                    <span>{cap}</span>
                  </span>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border-subtle text-[11px] text-text-tertiary leading-relaxed">
                严格遵循单发言人单轮 ≤5 步自主限制，无实质进展返回 NO_REPLY，敏感操作需确认。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Creation Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-border-default rounded-2xl w-full max-w-md p-6 space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-text-primary">新建智能伙伴向导</h2>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-text-secondary mb-1">伙伴英文标识 (Name)</label>
                <input
                  type="text"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  placeholder="例如: MoOps"
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl font-mono text-xs focus:outline-hidden focus:border-accent-purple"
                />
              </div>
              <div>
                <label className="block text-text-secondary mb-1">角色职称 (Title)</label>
                <input
                  type="text"
                  value={newBotTitle}
                  onChange={(e) => setNewBotTitle(e.target.value)}
                  placeholder="例如: 云原生运维专家"
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-xs focus:outline-hidden focus:border-accent-purple"
                />
              </div>
              <div>
                <label className="block text-text-secondary mb-1">专业职责 (Role)</label>
                <input
                  type="text"
                  value={newBotRole}
                  onChange={(e) => setNewBotRole(e.target.value)}
                  placeholder="例如: 负责基础设施自动化与监控"
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-xs focus:outline-hidden focus:border-accent-purple"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-3.5 py-1.5 border border-border-default rounded-xl text-xs text-text-secondary hover:bg-surface-hover"
              >
                取消
              </button>
              <button
                disabled={creating || !newBotName.trim()}
                onClick={async () => {
                  try {
                    setCreating(true);
                    const res = await fetch('/api/bots', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        name: newBotName.trim(),
                        title: newBotTitle.trim() || 'AI 协同伙伴',
                        role: newBotRole.trim() || '自动化任务协同',
                        model: 'gemini-3.8-flash',
                      }),
                    });
                    const data = await res.json();
                    if (data.ok) {
                      setShowCreateModal(false);
                      setNewBotName('');
                      setNewBotTitle('');
                      setNewBotRole('');
                      // Reload bots
                      const refreshRes = await fetch('/api/bots');
                      const refreshData = await refreshRes.json();
                      if (refreshData.ok && Array.isArray(refreshData.bots)) {
                        setBots(refreshData.bots.map((b: any) => ({
                          id: b.id,
                          name: b.name,
                          title: b.title,
                          avatar: b.avatar_url || '/assets/agent-island-cindy.png',
                          role: b.role,
                          department: b.department,
                          model: b.model,
                          status: 'online',
                          description: b.description,
                          capabilities: Array.isArray(b.capabilities?.tools) ? b.capabilities.tools : ['基础工具'],
                          systemPrompt: b.soulSummary || '',
                          stats: { tasksCompleted: 10, rating: 5.0, collaborations: 2 },
                        })));
                      }
                    }
                  } catch (err) {
                    console.error('Create bot failed:', err);
                  } finally {
                    setCreating(false);
                  }
                }}
                className="px-4 py-1.5 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold hover:bg-accent-hover disabled:opacity-50"
              >
                {creating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
