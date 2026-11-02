import React from 'react';
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
} from 'lucide-react';
import { MOCK_BOTS } from '@/mock/bots';

export function BotRosterPage() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-default">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/bots')}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
              <Users className="w-5 h-5 text-accent-purple" />
              <span>阵容管理与权限配置 (Bot Roster)</span>
            </h1>
            <p className="text-xs text-text-secondary mt-0.5">
              为团队内各个角色分配执行权限、自主度级别、工具调用限制与模型映射
            </p>
          </div>
        </div>

        <button className="flex items-center gap-1.5 px-3.5 py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold shadow-sm hover:bg-accent-hover transition-colors">
          <Plus className="w-4 h-4" />
          <span>引入新伙伴</span>
        </button>
      </div>

      {/* Roster Table */}
      <div className="bg-surface-elevated border border-border-default rounded-2xl p-4 shadow-sm">
        <table className="w-full text-left text-xs">
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
            {MOCK_BOTS.map((bot) => (
              <tr key={bot.id} className="hover:bg-surface-hover/50 transition-colors">
                <td className="py-3 flex items-center gap-3">
                  <img
                    src={bot.avatar}
                    alt=""
                    className="w-8 h-8 rounded-xl object-cover border border-border-default"
                  />
                  <div>
                    <div className="font-bold text-text-primary">{bot.name}</div>
                    <div className="text-[11px] text-text-tertiary">{bot.title}</div>
                  </div>
                </td>
                <td className="py-3">{bot.department}</td>
                <td className="py-3 font-mono text-accent-blue">{bot.model}</td>
                <td className="py-3">
                  <span className="bg-surface-chip text-text-primary px-2 py-0.5 rounded font-mono text-[11px]">
                    Auto-Approve
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
                    className="px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border-default rounded-lg text-xs text-text-primary transition-colors"
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
