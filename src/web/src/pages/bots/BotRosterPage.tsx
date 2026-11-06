import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Shield,
  Sliders,
  CheckCircle2,
  Plus,
  ArrowLeft,
  Bot,
  Zap,
  RefreshCw
} from 'lucide-react';
import type { BotItem } from '@/mock/bots';

export function BotRosterPage() {
  const navigate = useNavigate();
  const [bots, setBots] = useState<BotItem[]>([]);
  const [loading, setLoading] = useState(false);

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
            capabilities: Array.isArray(b.capabilities?.tools) ? b.capabilities.tools : ['基础工具'],
            systemPrompt: b.soulSummary || '',
            stats: {
              tasksCompleted: 400,
              rating: 4.95,
              collaborations: 120
            }
          }));
          setBots(mapped);
        }
      } catch (e) {
        console.warn('Failed to load bots in roster:', e);
      } finally {
        setLoading(false);
      }
    }
    loadBots();
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none p-3.5 sm:p-6 space-y-4 sm:space-y-6 bg-surface">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-border-default">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/bots')}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2">
              <Users className="w-5 h-5 text-accent-purple" />
              <span>智能体阵容与权限配置 (7 Mo-Bots Roster)</span>
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              为 7 位核心伙伴分配执行权限、自主度级别、工具调用限制与模型映射
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/bots/groups/multiagent-orchestration')}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3.5 py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold shadow-sm hover:bg-accent-hover transition-colors cursor-pointer"
        >
          <Bot className="w-4 h-4" />
          <span>进入开发核心组</span>
        </button>
      </div>

      {/* Roster Table (移动端支持横向平滑滚动) */}
      <div className="bg-surface-elevated border border-border-default rounded-2xl p-3 sm:p-4 shadow-sm overflow-x-auto touch-pan-x scrollbar-thin">
        <table className="w-full min-w-[580px] text-left text-xs">
          <thead>
            <tr className="border-b border-border-default text-text-tertiary">
              <th className="pb-3 font-semibold">伙伴 / 角色</th>
              <th className="pb-3 font-semibold">所属业务组</th>
              <th className="pb-3 font-semibold">绑定模型</th>
              <th className="pb-3 font-semibold">自主执行级别</th>
              <th className="pb-3 font-semibold">状态</th>
              <th className="pb-3 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle text-text-secondary">
            {bots.map((bot) => (
              <tr key={bot.id} className="hover:bg-surface-hover/50 transition-colors">
                <td className="py-3 flex items-center gap-3">
                  <img
                    src={bot.avatar}
                    alt=""
                    className="w-8 h-8 rounded-xl object-cover border border-border-default"
                  />
                  <div>
                    <div className="font-bold text-text-primary flex items-center gap-1.5">
                      <span>{bot.name}</span>
                      <span className="text-[10px] text-text-tertiary font-mono">({bot.id})</span>
                    </div>
                    <div className="text-[11px] text-text-tertiary">{bot.title}</div>
                  </div>
                </td>
                <td className="py-3">{bot.department}</td>
                <td className="py-3 font-mono text-accent-blue">{bot.model}</td>
                <td className="py-3">
                  <span className="bg-surface-chip text-text-primary px-2 py-0.5 rounded font-mono text-[11px] border border-border-default">
                    Step ≤ 5 (Single Speaker)
                  </span>
                </td>
                <td className="py-3">
                  <span className="flex items-center gap-1 text-accent-green text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-green" />
                    <span>正常在线</span>
                  </span>
                </td>
                <td className="py-3 text-right">
                  <button
                    onClick={() => navigate(`/bots/${bot.id}`)}
                    className="px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border-default rounded-lg text-xs text-text-primary transition-colors font-medium"
                  >
                    配置
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
