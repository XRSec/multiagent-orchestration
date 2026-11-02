/**
 * proposed_BotGroupPlanCard.jsx - Cindy 风格多 Agent 分工计划卡
 * 包含：计划标题与折叠、BotGroupOrganizerTag、状态图标、步骤改派/重试/删除、
 * 交接文件药丸列表 (BotGroupHandoffFiles)、进度条与跟进行/完成线。
 */
import React, { useState } from 'react';
import {
  ChevronDown, ChevronUp, Sparkles, CheckCircle2, AlertCircle, CircleDashed,
  RotateCw, Trash2, FileText, Shield, Play, ArrowRight, ExternalLink
} from 'lucide-react';

export function BotGroupOrganizerTag({ organizerName = 'Lead Orchestrator', role = '主控调度' }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-medium select-none"
      title={`组织者: ${organizerName}`}
    >
      <Shield className="w-3 h-3 text-sky-400 shrink-0" />
      <span>{role}</span>
      <span className="text-slate-500">·</span>
      <span className="text-slate-200">{organizerName}</span>
    </span>
  );
}

export function StepStatusIcon({ status, index }) {
  if (status === 'running') {
    return (
      <span className="relative flex items-center justify-center w-5 h-5 text-amber-400 select-none" title="执行中">
        <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/30 animate-ping opacity-75" />
        <Sparkles className="w-4 h-4 relative z-10 animate-pulse" />
      </span>
    );
  }
  if (status === 'done') return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 select-none" title="已完成" />;
  if (status === 'failed') return <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 select-none" title="执行失败" />;
  if (status === 'skipped' || status === 'cancelled') return <CircleDashed className="w-5 h-5 text-slate-500 shrink-0 select-none" title="取消" />;
  return (
    <span className="flex items-center justify-center w-5 h-5 rounded-full border border-slate-600 bg-slate-800 text-slate-400 text-[11px] font-mono shrink-0 select-none">
      {index + 1}
    </span>
  );
}

export function BotGroupHandoffFiles({ files = [], workDir = '', onFileClick }) {
  if (!Array.isArray(files) || files.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {files.map((file, idx) => {
        const basename = String(file).split('/').pop() || file;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onFileClick?.(file, workDir)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-800/90 border border-slate-700 text-slate-300 hover:bg-slate-700 text-xs transition-colors group cursor-pointer max-w-xs truncate"
            title={`${file} (工作区相对路径)`}
          >
            <FileText className="w-3 h-3 text-sky-400 shrink-0" />
            <span className="truncate">{basename}</span>
            <ExternalLink className="w-2.5 h-2.5 text-slate-500 group-hover:text-slate-300 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        );
      })}
    </div>
  );
}

function StepRow({ step, index, members = [], reassignable, canManage, onAssigneeChange, onRetry, onDelete, onFileClick, workDir }) {
  const isRunning = step.status === 'running';
  const isDone = step.status === 'done';
  const isFailed = step.status === 'failed';

  return (
    <div className={`p-3 rounded-xl border transition-all ${
      isRunning ? 'bg-amber-500/5 border-amber-500/30' : isDone ? 'bg-slate-800/40 border-slate-700/40' : isFailed ? 'bg-rose-500/5 border-rose-500/30' : 'bg-slate-800/20 border-slate-700/30'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className="pt-0.5 shrink-0"><StepStatusIcon status={step.status} index={index} /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium ${isDone ? 'text-slate-300' : 'text-slate-100'}`}>{step.title}</span>
              {isRunning && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse">执行中 · {step.elapsedSeconds ?? 0}s</span>}
              {isDone && step.elapsedSeconds ? <span className="text-[10px] font-mono text-slate-500">耗时 {step.elapsedSeconds}s</span> : null}
            </div>
            {step.taskDescription && <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">{step.taskDescription}</p>}
            {step.resultSummary && <div className="mt-1.5 text-xs text-emerald-400/90 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">{step.resultSummary}</div>}
            <BotGroupHandoffFiles files={step.outputFiles} workDir={workDir} onFileClick={onFileClick} />
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {reassignable && !isDone ? (
            <select
              value={step.assigneeId || ''}
              onChange={(e) => onAssigneeChange?.(index, e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none cursor-pointer"
            >
              {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          ) : (
            <span className="text-xs font-medium text-slate-300 bg-slate-800/80 border border-slate-700/60 px-2 py-0.5 rounded-full">
              {step.assigneeName || step.assigneeId}
            </span>
          )}
          {isFailed && (
            <button type="button" onClick={() => onRetry?.(index)} className="p-1 text-amber-400 hover:bg-amber-500/15 rounded" title="重试">
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}
          {canManage && !isDone && !isRunning && (
            <button type="button" onClick={() => onDelete?.(index)} className="p-1 text-slate-500 hover:text-rose-400 rounded" title="删除">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BotGroupPlanCard({
  plan, members = [], actionable = false, reassignable = true, canManage = true,
  onStart, onDismiss, onStepAssigneeChange, onStepRetry, onStepDelete, onContinue,
  onAutoContinueToggle, onFileClick, className = '',
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!plan) return null;

  const steps = plan.steps || [];
  const completedCount = steps.filter((s) => s.status === 'done').length;
  const totalCount = steps.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isAllDone = totalCount > 0 && completedCount === totalCount;
  const isRunning = plan.status === 'running';
  const isProposed = plan.status === 'proposed';

  return (
    <div className={`rounded-2xl border border-slate-700/80 bg-slate-900/90 shadow-lg overflow-hidden ${className}`}>
      {/* 头部与折叠切换 */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <BotGroupOrganizerTag organizerName={plan.organizerName} />
          <h4 className="text-sm font-semibold text-slate-100 truncate" title={plan.title}>{plan.title}</h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-mono text-slate-400">{completedCount}/{totalCount} 完成 ({progressPercent}%)</span>
          <button type="button" onClick={() => setCollapsed(!collapsed)} className="p-1 text-slate-400 hover:text-slate-200 rounded">
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 进度条 */}
      <div className="h-1 w-full bg-slate-800">
        <div className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
      </div>

      {!collapsed && (
        <div className="p-4 space-y-2.5">
          {steps.map((step, idx) => (
            <StepRow
              key={step.index ?? idx} step={step} index={idx} members={members}
              reassignable={reassignable} canManage={canManage} onAssigneeChange={onStepAssigneeChange}
              onRetry={onStepRetry} onDelete={onStepDelete} onFileClick={onFileClick} workDir={plan.workDir}
            />
          ))}

          {/* 全部完成分割线 */}
          {isAllDone && (
            <div className="flex items-center gap-3 pt-2 text-xs text-slate-400 select-none">
              <span className="h-px flex-1 bg-slate-800" />
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="w-4 h-4" /> 共 {totalCount} 步协同任务均已顺利完成
              </span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>
          )}

          {/* 待启动操作栏 */}
          {isProposed && actionable && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-xs text-slate-400">核对执行人分配后启动分工方案</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onDismiss} className="px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-400 hover:text-slate-200">
                  放弃计划
                </button>
                <button type="button" onClick={onStart} className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-medium shadow-sm">
                  <Play className="w-3.5 h-3.5 fill-current" /> 开始执行
                </button>
              </div>
            </div>
          )}

          {/* 执行中控制栏 */}
          {isRunning && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs text-slate-400">
              <label className="flex items-center gap-2 cursor-pointer hover:text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={Boolean(plan.autoContinue)}
                  onChange={(e) => onAutoContinueToggle?.(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-0 cursor-pointer"
                />
                <span>单步完成后自动流转至下一步</span>
              </label>
              {!plan.autoContinue && (
                <button
                  type="button"
                  onClick={onContinue}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-accent/20 border border-accent/40 text-accent hover:bg-accent/30 font-medium"
                >
                  <span>继续执行下一步</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
