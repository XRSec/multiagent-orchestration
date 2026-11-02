import React, { useState } from 'react';
import {
  Clock,
  Plus,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  Bot,
  Sliders,
  X,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { MOCK_SCHEDULES, ScheduleItem } from '@/mock/schedules';
import { MOCK_BOTS } from '@/mock/bots';

export function SchedulerPage() {
  const [schedules, setSchedules] = useState(MOCK_SCHEDULES);
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'paused'>('all');
  const [showModal, setShowModal] = useState(false);

  // New Schedule Form States
  const [newTitle, setNewTitle] = useState('');
  const [newCron, setNewCron] = useState('0 9 * * 1-5');
  const [newBot, setNewBot] = useState('Ada (Code Reviewer)');
  const [newDesc, setNewDesc] = useState('');

  const toggleStatus = (id: string) => {
    setSchedules((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === 'active' ? 'paused' : 'active' }
          : s
      )
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const item: ScheduleItem = {
      id: `sch-${Date.now()}`,
      name: newTitle,
      description: newDesc || '自定义自动化任务',
      cronExpr: newCron,
      humanSchedule: newCron === '0 9 * * 1-5' ? '工作日 09:00' : '每天定时执行',
      targetBot: newBot,
      status: 'active',
      lastRunAt: '未执行',
      nextRunAt: '明天 09:00',
      lastOutcome: '已新建任务，等待首次调度触发',
    };
    setSchedules((prev) => [item, ...prev]);
    setShowModal(false);
    setNewTitle('');
    setNewDesc('');
  };

  const filtered = schedules.filter((s) => {
    if (activeFilter === 'active') return s.status === 'active';
    if (activeFilter === 'paused') return s.status === 'paused';
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none bg-surface p-6 space-y-6">
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-default shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-amber" />
            <span>自动化调度任务 (Scheduler)</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            设置定时或条件触发的自动化工作流，由专属 AI 伙伴自主执行与回报
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented Filter */}
          <div className="flex bg-surface-chip p-0.5 rounded-xl border border-border-default">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter === 'all'
                  ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              全部 ({schedules.length})
            </button>
            <button
              onClick={() => setActiveFilter('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter === 'active'
                  ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              运行中 ({schedules.filter((s) => s.status === 'active').length})
            </button>
            <button
              onClick={() => setActiveFilter('paused')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeFilter === 'paused'
                  ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              已暂停 ({schedules.filter((s) => s.status === 'paused').length})
            </button>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold shadow-sm hover:bg-accent-hover transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>新建调度任务</span>
          </button>
        </div>
      </div>

      {/* 2. Schedules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((sch) => (
          <div
            key={sch.id}
            className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4 text-xs"
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-bold text-text-primary leading-snug">
                  {sch.name}
                </h3>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 font-semibold ${
                    sch.status === 'active'
                      ? 'bg-accent-green/10 text-accent-green'
                      : 'bg-surface-chip text-text-tertiary'
                  }`}
                >
                  {sch.status === 'active' ? '运行中' : '已暂停'}
                </span>
              </div>

              <p className="text-text-secondary leading-relaxed line-clamp-2">
                {sch.description}
              </p>

              <div className="pt-2 border-t border-border-subtle space-y-1.5">
                <div className="flex items-center justify-between text-text-tertiary">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>执行周期</span>
                  </span>
                  <span className="font-mono text-text-primary font-medium">{sch.humanSchedule}</span>
                </div>

                <div className="flex items-center justify-between text-text-tertiary">
                  <span className="flex items-center gap-1.5">
                    <Bot className="w-3.5 h-3.5" />
                    <span>执行伙伴</span>
                  </span>
                  <span className="text-text-primary font-medium">{sch.targetBot}</span>
                </div>

                <div className="flex items-center justify-between text-text-tertiary">
                  <span>下次触发</span>
                  <span className="font-mono text-accent-blue font-semibold">{sch.nextRunAt}</span>
                </div>
              </div>
            </div>

            {/* Outcome & Controls */}
            <div className="pt-2.5 border-t border-border-subtle flex items-center justify-between">
              <span className="text-[11px] text-text-tertiary truncate max-w-[200px]">
                {sch.lastOutcome}
              </span>
              <button
                onClick={() => toggleStatus(sch.id)}
                className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
                title={sch.status === 'active' ? '暂停' : '启动'}
              >
                {sch.status === 'active' ? (
                  <Pause className="w-4 h-4 text-accent-amber" />
                ) : (
                  <Play className="w-4 h-4 text-accent-green" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Execution History Log Table */}
      <div className="bg-surface-elevated border border-border-default rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-tertiary">
          自动化执行流水审计 (Execution Audit Log)
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border-default text-text-tertiary">
                <th className="pb-2.5 font-medium">任务名称</th>
                <th className="pb-2.5 font-medium">触发时间</th>
                <th className="pb-2.5 font-medium">执行伙伴</th>
                <th className="pb-2.5 font-medium">退出状态</th>
                <th className="pb-2.5 font-medium">执行回执</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle text-text-secondary">
              <tr>
                <td className="py-2.5 font-medium text-text-primary">每日早报与代码评审汇总</td>
                <td className="py-2.5 font-mono text-[11px]">今天 09:00:02</td>
                <td className="py-2.5">Ada</td>
                <td className="py-2.5 text-accent-green font-mono font-semibold">SUCCESS</td>
                <td className="py-2.5">汇总 4 个待审 PR 并同步飞书研发群</td>
              </tr>
              <tr>
                <td className="py-2.5 font-medium text-text-primary">数据库存储空间自动巡检</td>
                <td className="py-2.5 font-mono text-[11px]">今天 12:00:01</td>
                <td className="py-2.5">Devon</td>
                <td className="py-2.5 text-accent-green font-mono font-semibold">SUCCESS</td>
                <td className="py-2.5">巡检正常，当前 DB 142.8 MB，无残留碎片</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modal for New Schedule */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-border-default rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Clock className="w-4 h-4 text-accent-amber" />
                <span>新建自动化调度任务</span>
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-text-secondary">任务标题</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如: 每日早间 PR 自动化汇总"
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-blue"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-text-secondary">Cron 周期表达式</label>
                <select
                  value={newCron}
                  onChange={(e) => setNewCron(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary focus:outline-none font-mono"
                >
                  <option value="0 9 * * 1-5">工作日 09:00 (0 9 * * 1-5)</option>
                  <option value="0 */6 * * *">每 6 小时一次 (0 */6 * * *)</option>
                  <option value="0 2 * * 0">每周日凌晨 02:00 (0 2 * * 0)</option>
                  <option value="0 0 * * *">每天午夜 00:00 (0 0 * * *)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-text-secondary">指定执行 AI 伙伴</label>
                <select
                  value={newBot}
                  onChange={(e) => setNewBot(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary focus:outline-none"
                >
                  {MOCK_BOTS.map((bot) => (
                    <option key={bot.id} value={`${bot.name} (${bot.role})`}>
                      {bot.name} ({bot.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-text-secondary">任务描述 / 附加指令</label>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="说明该任务执行的具体行为、产出形式及推送目标..."
                  rows={2}
                  className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary focus:outline-none resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-surface hover:bg-surface-hover border border-border-default rounded-xl font-medium text-text-secondary transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-accent-cta text-accent-cta-fg rounded-xl font-semibold hover:bg-accent-hover transition-colors shadow-sm"
                >
                  确认创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
