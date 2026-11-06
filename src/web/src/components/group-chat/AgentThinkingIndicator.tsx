/**
 * Purpose: Live visual indicator displaying active agent execution status.
 * Context: Conforms to Cindy/AGY visual spec: stopwatch timer, executing tool badge,
 *          phase description, and eliminates the 20-minute black-box silence.
 * Usage: <AgentThinkingIndicator activeBotName="moAdmin" statusText="正在分析需求并调度工具链..." startedAt={...} currentTool="manage_task" />
 * Prerequisites: React 19, Lucide icons, Tailwind CSS.
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, Clock, Terminal, Code2, Square } from 'lucide-react';
import type { ExecutionStatus } from '@/types/room';
import { ExecutionStatusCard } from './ExecutionStatusCard';

export interface AgentThinkingIndicatorProps {
  activeBotName?: string;
  activeBotAvatar?: string;
  badgeText?: string;
  statusText?: string;
  startedAt?: number;
  currentTool?: string;
  toolDescription?: string;
  executionStatus?: ExecutionStatus;
  onStop?: () => void;
}

function formatStopwatch(ms: number): string {
  if (ms < 1000) return `${Math.max(ms, 1)}ms`;
  const sec = (ms / 1000).toFixed(1);
  return `${sec}s`;
}

export const AgentThinkingIndicator: React.FC<AgentThinkingIndicatorProps> = ({
  activeBotName = 'moAdmin',
  activeBotAvatar = '/assets/agent-island-cindy.png',
  badgeText = '编排主管',
  statusText = '正在分析需求并调度工具链...',
  startedAt,
  currentTool = 'executing',
  toolDescription = '正在调度工具执行并分析意图',
  executionStatus,
  onStop
}) => {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = startedAt || Date.now();
    setElapsedMs(Date.now() - start);

    const timer = setInterval(() => {
      setElapsedMs(Date.now() - start);
    }, 100);

    return () => clearInterval(timer);
  }, [startedAt]);

  // If a full executionStatus is provided, render it directly with card styling
  if (executionStatus) {
    return (
      <div
        data-testid="active-bot-indicator"
        className="flex items-start gap-3 py-2 px-1 animate-in fade-in slide-in-from-bottom-2 duration-200 w-full"
      >
        <div className="relative shrink-0 mt-0.5">
          <img
            src={activeBotAvatar}
            alt={activeBotName}
            className="w-7 h-7 rounded-full object-cover border border-border-default shadow-xs"
          />
          <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-accent-blue rounded-full flex items-center justify-center border-2 border-surface">
            <Loader2 className="w-2 h-2 text-white animate-spin" />
          </span>
        </div>

        <div className="flex-1 min-w-0 max-w-[720px]">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap w-full">
            <span className="text-xs font-semibold text-text-primary">{activeBotName}</span>
            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono border bg-purple-500/10 text-purple-400 border-purple-500/20">
              {badgeText}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>正在执行中 (Running)</span>
            </span>

            {onStop && (
              <button
                type="button"
                data-testid="indicator-stop-btn"
                onClick={onStop}
                title="暂停 / 停止生成"
                className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-accent-red/10 hover:bg-accent-red/20 text-accent-red border border-accent-red/30 transition-colors cursor-pointer"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>停止响应</span>
              </button>
            )}
          </div>

          <ExecutionStatusCard status={executionStatus} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="active-bot-indicator"
      className="flex items-start gap-3 py-2 px-1 animate-in fade-in slide-in-from-bottom-2 duration-200 w-full"
    >
      {/* 28px Avatar */}
      <div className="relative shrink-0 mt-0.5">
        <img
          src={activeBotAvatar}
          alt={activeBotName}
          className="w-7 h-7 rounded-full object-cover border border-border-default shadow-xs"
        />
        <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-accent-blue rounded-full flex items-center justify-center border-2 border-surface">
          <Loader2 className="w-2 h-2 text-white animate-spin" />
        </span>
      </div>

      {/* Main Execution Status Container */}
      <div className="flex-1 min-w-0 max-w-[720px] flex flex-col items-start">
        {/* Header row */}
        <div className="flex items-center gap-2 mb-1.5 flex-wrap w-full">
          <span className="text-xs font-semibold text-text-primary">{activeBotName}</span>
          <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-mono border bg-purple-500/10 text-purple-400 border-purple-500/20">
            {badgeText}
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
            <Sparkles className="w-2.5 h-2.5 animate-pulse text-accent-purple" />
            <span>正在执行中 (Running)</span>
          </span>

          {/* Action buttons & Stopwatch */}
          <div className="ml-auto flex items-center gap-2">
            {onStop && (
              <button
                type="button"
                data-testid="indicator-stop-btn"
                onClick={onStop}
                title="暂停 / 停止生成"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-accent-red/10 hover:bg-accent-red/20 text-accent-red border border-accent-red/30 transition-colors cursor-pointer"
              >
                <Square className="w-2.5 h-2.5 fill-current" />
                <span>停止响应</span>
              </button>
            )}

            {/* Stopwatch badge */}
            <span className="flex items-center gap-1 font-mono text-[11px] text-accent-blue bg-accent-blue/5 px-2 py-0.5 rounded-md border border-accent-blue/20 animate-pulse">
              <Clock className="w-3 h-3" />
              <span>⏱️ {formatStopwatch(elapsedMs)}</span>
            </span>
          </div>
        </div>

        {/* Running Execution Card */}
        <div className="w-full rounded-xl bg-surface-elevated/95 border border-accent-blue/30 p-3 text-xs shadow-sm flex flex-col gap-2.5">
          {/* Phase text with spinner */}
          <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border-subtle/70">
            <div className="flex items-center gap-2 font-medium text-text-primary truncate">
              <Loader2 className="w-3.5 h-3.5 text-accent-blue animate-spin shrink-0" />
              <span className="truncate">{statusText}</span>
            </div>
            <span className="text-[10px] font-mono text-accent-amber bg-accent-amber/10 px-1.5 py-0.5 rounded border border-accent-amber/20 shrink-0">
              实时调度中
            </span>
          </div>

          {/* Active Tool Executing Box */}
          {currentTool && (
            <div className="rounded-lg border border-border-subtle bg-surface/80 p-2 text-[11px]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-mono text-text-secondary truncate">
                  <Terminal className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                  <span className="text-text-tertiary">tool:</span>
                  <span className="font-bold text-accent-blue px-1.5 py-0.5 bg-accent-blue/10 rounded font-mono text-[11px] animate-pulse">
                    '{currentTool}'
                  </span>
                  {toolDescription && (
                    <span className="text-text-tertiary font-sans truncate text-[10px] ml-1">
                      {toolDescription}
                    </span>
                  )}
                </div>

                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-accent-blue">
                  <Code2 className="w-3 h-3" />
                  <span>executing</span>
                </span>
              </div>
            </div>
          )}

          {/* Realtime progress reassurance */}
          <div className="flex items-center justify-between text-[10px] text-text-tertiary font-mono pt-0.5">
            <span>智能体正在处理上下文并调用工具链，请稍候...</span>
            <span className="animate-pulse text-accent-purple">● 活跃信道</span>
          </div>
        </div>
      </div>
    </div>
  );
};
