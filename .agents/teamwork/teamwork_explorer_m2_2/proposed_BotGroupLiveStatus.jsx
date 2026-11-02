/**
 * proposed_BotGroupLiveStatus.jsx - Cindy 风格实时进行中状态条组件
 *
 * 核心机制：
 * 1. 3秒延迟就地展示向浮动条跃迁：发言前 3 秒在时间轴末尾就地展示 (BotGroupSpeakingLine)；
 *    超过 3 秒或有分工计划执行时，跃迁为固定在输入框上方的浮动状态条 (BotGroupProgressStrip)。
 * 2. 思考中状态：Thinking Orange 呼吸脉冲 (Sparkles)、正在发言 Agent 头像与名称、
 *    已耗时动态计数器 (useElapsedTimer)、一键「停止」按钮交互。
 * 3. 顶栏状态指示器：BotGroupHeaderStatusText 供 SessionHeader 复用。
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Square, Loader2, Bot, Layers } from 'lucide-react';

export const BOT_GROUP_PROGRESS_STRIP_DELAY_MS = 3_000;

/**
 * 动态计时器 Hook：提供秒级格式化输出
 */
export function useElapsedTimer(startedAtMs, active = true) {
  const [elapsedMs, setElapsedMs] = useState(() => {
    if (!startedAtMs || !active) return 0;
    return Math.max(0, Date.now() - startedAtMs);
  });

  useEffect(() => {
    if (!startedAtMs || !active) {
      setElapsedMs(0);
      return undefined;
    }

    const interval = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    }, 1000);

    return () => clearInterval(interval);
  }, [startedAtMs, active]);

  const totalSec = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return { elapsedMs, formatted: `${mm}:${ss}`, totalSeconds: totalSec };
}

/**
 * 时间轴末端就地展示行（0-3秒轻量呈现）
 */
export function BotGroupSpeakingLine({ speaker, className = '' }) {
  if (!speaker) return null;
  const displayName = speaker.displayName || speaker.name || '伙伴';
  const actionText = speaker.actionText || '正在思考与组织回答...';

  return (
    <div className={`flex items-center gap-3 py-2 px-3 text-xs text-slate-300 select-none ${className}`}>
      {/* 伙伴小头像 */}
      <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
        <Bot className="w-3.5 h-3.5 text-accent" />
      </div>

      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium text-slate-200 shrink-0">{displayName}</span>
        <span className="flex items-center gap-1 text-amber-400 shrink-0">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="text-[11px] font-mono">思考中</span>
        </span>
        <span className="text-slate-400 truncate">{actionText}</span>
      </div>
    </div>
  );
}

/**
 * 固定在输入框上方的浮动进度条（超过3秒或分工执行时）
 */
export function BotGroupProgressStrip({
  speaker,
  currentStep = null,
  onStop,
  stopping = false,
  className = '',
}) {
  if (!speaker) return null;

  const displayName = speaker.displayName || speaker.name || '伙伴';
  const startedAt = speaker.startedAt || Date.now();
  const timer = useElapsedTimer(startedAt, !stopping);

  // 区分普通发言思考 vs 计划卡步骤执行
  const isPlanStep = Boolean(currentStep);
  const stepTitle = currentStep?.title || speaker.actionText || '正在执行协作任务...';
  const stepIndexInfo = currentStep ? `步骤 ${currentStep.index ?? 1} · ` : '';

  return (
    <div
      className={`mx-auto w-full max-w-3xl rounded-xl border border-amber-500/30 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 shadow-xl flex items-center justify-between gap-3 text-xs select-none transition-all ${className}`}
    >
      {/* 左侧：头像、Thinking Orange 呼吸灯与任务状态 */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="relative shrink-0">
          <div className="w-7 h-7 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
            {isPlanStep ? <Layers className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </div>
          <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
          </span>
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-100 truncate">{displayName}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-mono text-amber-400">
              <Sparkles className="w-3 h-3 animate-pulse" />
              <span>{isPlanStep ? '分工执行中' : '思考中'}</span>
            </span>
            <span className="text-[11px] font-mono text-slate-400">已耗时 {timer.formatted}</span>
          </div>

          <div className="text-slate-400 truncate text-[11px] mt-0.5">
            <span className="text-slate-300 font-medium">{stepIndexInfo}</span>
            <span>{stepTitle}</span>
          </div>
        </div>
      </div>

      {/* 右侧：一键「停止」按钮 */}
      {typeof onStop === 'function' && (
        <button
          type="button"
          onClick={() => onStop()}
          disabled={stopping}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 hover:border-rose-500/60 disabled:opacity-50 text-xs font-medium shrink-0 transition-colors cursor-pointer"
          title="终止当前伙伴发言或分工步骤"
        >
          {stopping ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>正在停止...</span>
            </>
          ) : (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span>停止</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}

/**
 * 顶栏状态指示文本（供 SessionHeader 复用）
 */
export function BotGroupHeaderStatusText({ text = '', className = '' }) {
  if (!text) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-xs text-amber-400 font-medium ${className}`}>
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
      </span>
      <span className="truncate">{text}</span>
    </span>
  );
}

/**
 * 状态条门面组件：封装 3 秒延迟就地展示与浮动条自动跃迁逻辑
 */
export default function BotGroupLiveStatus({
  speaker,
  currentStep = null,
  onStop,
  stopping = false,
  forceFloating = false,
  className = '',
}) {
  const [mountedAt] = useState(() => Date.now());
  const [isPromoted, setIsPromoted] = useState(false);

  useEffect(() => {
    if (!speaker) {
      setIsPromoted(false);
      return undefined;
    }

    // 若正在执行分工步骤，立即跃迁为浮动条
    if (currentStep || forceFloating) {
      setIsPromoted(true);
      return undefined;
    }

    const elapsed = Date.now() - (speaker.startedAt || mountedAt);
    if (elapsed >= BOT_GROUP_PROGRESS_STRIP_DELAY_MS) {
      setIsPromoted(true);
      return undefined;
    }

    const remaining = BOT_GROUP_PROGRESS_STRIP_DELAY_MS - elapsed;
    const timer = setTimeout(() => setIsPromoted(true), remaining);
    return () => clearTimeout(timer);
  }, [speaker, currentStep, forceFloating, mountedAt]);

  if (!speaker) return null;

  // 超过3秒或执行步骤：跃迁为固定浮动条
  if (isPromoted) {
    return (
      <BotGroupProgressStrip
        speaker={speaker}
        currentStep={currentStep}
        onStop={onStop}
        stopping={stopping}
        className={className}
      />
    );
  }

  // 初始 0-3 秒：时间轴就地呈现
  return <BotGroupSpeakingLine speaker={speaker} className={className} />;
}
