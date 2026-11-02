/**
 * BotGroupPlanCard.jsx
 * Cindy 风格的群聊任务分工安排卡（BotGroupPlan）：
 * 展示步骤列表、认领伙伴头像、步骤运行状态指示（done/running/pending/failed）、
 * 交接文件及流转操作（开始 / 下一步 · 继续 / 重试）。
 * 单文件严格规范：<= 250 行
 */

import React, { useState } from 'react';
import {
  CheckCircle2,
  CircleDashed,
  Sparkles,
  AlertCircle,
  FileCode,
  FolderGit2,
  ChevronDown,
  ChevronUp,
  Play,
  RotateCcw,
} from 'lucide-react';

export default function BotGroupPlanCard({
  plan,
  onStepAction,
  onStartPlan,
}) {
  const [collapsed, setCollapsed] = useState(false);

  if (!plan) return null;

  const steps = plan.steps || [];
  const completedCount = steps.filter((s) => s.status === 'done').length;
  const isAllDone = steps.length > 0 && completedCount === steps.length;
  const isRunning = steps.some((s) => s.status === 'running');

  return (
    <div className="my-3 border border-sky-900/60 bg-slate-900/90 rounded-2xl overflow-hidden shadow-lg shadow-sky-950/20 text-xs select-none">
      {/* Plan Header */}
      <div className="p-3.5 bg-slate-800/60 border-b border-border/60 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-6 h-6 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <FolderGit2 className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="font-semibold text-slate-100 flex items-center gap-2">
              <span>{plan.title || '多 Agent 协同分工计划'}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                {completedCount}/{steps.length} 步完成
              </span>
            </div>
            {plan.projectDir && (
              <div className="text-[10px] font-mono text-slate-500 truncate max-w-md mt-0.5">
                工作目录: {plan.projectDir}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-all cursor-pointer"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {/* Plan Steps List */}
      {!collapsed && (
        <div className="p-3 space-y-2">
          {steps.map((step, idx) => (
            <PlanStepItem
              key={step.id || idx}
              index={idx}
              step={step}
              onAction={onStepAction}
            />
          ))}

          {/* Bottom Action Footer */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              {isAllDone
                ? '全部步骤均已顺利交付'
                : isRunning
                ? '伙伴正在执行中，支持随时自然发消息追加调整'
                : '就绪，点击开始执行'}
            </span>

            {plan.status === 'proposed' && onStartPlan && (
              <button
                onClick={() => onStartPlan(plan.id)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>开始执行</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanStepItem({ index, step, onAction }) {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'running':
        return <Sparkles className="w-4 h-4 text-sky-400 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-rose-400" />;
      case 'pending':
      default:
        return <CircleDashed className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div
      className={`p-2.5 rounded-xl border transition-all ${
        step.status === 'running'
          ? 'bg-sky-950/30 border-sky-500/50 shadow-sm'
          : step.status === 'done'
          ? 'bg-slate-900/40 border-slate-800 text-slate-300'
          : 'bg-card/40 border-border/50 text-slate-400'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="flex-shrink-0">{getStatusIcon(step.status)}</div>
          <div className="text-xs font-mono text-slate-500 font-semibold">
            #{index + 1}
          </div>
          <div className="text-xs font-medium text-slate-200 truncate max-w-sm">
            {step.title || step.instruction}
          </div>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
          {/* Assigned Partner Chip */}
          <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
            {step.botName || step.botId}
          </span>

          {/* Step Actions */}
          {step.status === 'failed' && (
            <button
              onClick={() => onAction?.('retry', step.id)}
              className="p-1 rounded text-rose-400 hover:bg-rose-950/40 transition-all cursor-pointer"
              title="重试"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Handoff Artifacts */}
      {step.handoffFiles && step.handoffFiles.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-800/60 flex items-center gap-1.5 flex-wrap">
          <span className="text-[10px] font-mono text-slate-500">产出物:</span>
          {step.handoffFiles.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-1.5 py-0.2 rounded"
            >
              <FileCode className="w-3 h-3" />
              {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
