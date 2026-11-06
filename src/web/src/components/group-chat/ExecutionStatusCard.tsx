/**
 * Purpose: Execution status card displaying ThinkingCard, ToolExecutingCard, and DoneCard with latency breakdown.
 * Context: Conforms to Cindy/AGY visual spec: max-height constraint, overflow-y-auto, and strict .no-scrollbar.
 * Usage: <ExecutionStatusCard status={message.executionStatus} />
 * Prerequisites: React 19, Tailwind CSS, Lucide Icons, .no-scrollbar class.
 */

import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  Terminal,
  CheckCircle2,
  Loader2,
  XCircle,
  AlertTriangle,
  Clock,
  Code2
} from 'lucide-react';
import type { ExecutionStatus, ToolCallItem } from '@/types/room';

interface ExecutionStatusCardProps {
  status?: ExecutionStatus;
  className?: string;
  maxHeightClass?: string;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '0s';
  if (ms < 1000) return `${Math.max(ms, 1)}ms`;
  const sec = (ms / 1000).toFixed(1);
  return `${sec}s`;
}

export const ExecutionStatusCard: React.FC<ExecutionStatusCardProps> = ({
  status,
  className = '',
  maxHeightClass = 'max-h-56 sm:max-h-60'
}) => {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  if (!status || status.state === 'idle') {
    // If there's no active or recorded status, don't render an empty card
    if (!status?.thinking && (!status?.tools || status.tools.length === 0)) {
      return null;
    }
  }

  const {
    state = 'idle',
    currentPhaseText,
    thinking,
    tools = [],
    latency,
    error
  } = status;

  const isThinkingState = state === 'thinking';
  const isToolState = state === 'tool_executing';
  const isDone = state === 'done';
  const isFailed = state === 'failed';
  const isAborted = state === 'aborted';

  // Compute breakdown times
  const thinkingMs = latency?.thinkingMs ?? (thinking?.durationMs ? thinking.durationMs : (thinking?.durationSeconds ? thinking.durationSeconds * 1000 : undefined));
  const toolMs = latency?.toolMs ?? (tools.length > 0 ? tools.reduce((acc, t) => acc + (t.durationMs || 0), 0) : undefined);
  const totalMs = latency?.totalMs ?? ((thinkingMs || 0) + (toolMs || 0) || undefined);

  return (
    <div
      data-testid="execution-status-card"
      className={`w-full rounded-xl bg-surface-elevated/90 border border-border-default/80 p-2.5 sm:p-3 text-xs shadow-xs select-none transition-all ${className}`}
    >
      {/* Scrollable Container with max-height and strict invisible scrollbar */}
      <div
        data-testid="status-scroll-container"
        className={`${maxHeightClass} overflow-y-auto no-scrollbar flex flex-col gap-2.5`}
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        
        {/* 1. Header / Phase Status Bar */}
        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-border-subtle/60">
          <div className="flex items-center gap-1.5 font-medium truncate">
            {isThinkingState && (
              <span className="flex items-center gap-1.5 text-accent-purple">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                <span className="truncate">{currentPhaseText || '正在思考与规划...'}</span>
              </span>
            )}
            {isToolState && (
              <span className="flex items-center gap-1.5 text-accent-blue">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="truncate">{currentPhaseText || '正在调用工具执行...'}</span>
              </span>
            )}
            {isDone && (
              <span className="flex items-center gap-1.5 text-accent-green">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>执行完成</span>
              </span>
            )}
            {isFailed && (
              <span className="flex items-center gap-1.5 text-accent-red">
                <XCircle className="w-3.5 h-3.5" />
                <span>执行失败</span>
              </span>
            )}
            {isAborted && (
              <span className="flex items-center gap-1.5 text-accent-amber">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>已停止执行</span>
              </span>
            )}
          </div>

          {/* Latency Summary Badge */}
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-tertiary shrink-0">
            <Clock className="w-3 h-3 opacity-70" />
            <span>
              {isDone
                ? `用时 ${formatDuration(totalMs)}`
                : isThinkingState
                ? thinkingMs ? `${formatDuration(thinkingMs)}...` : '思考中...'
                : isToolState
                ? toolMs ? `${formatDuration(toolMs)}...` : '执行中...'
                : totalMs ? formatDuration(totalMs) : '0s'}
            </span>
          </div>
        </div>

        {/* 2. Thinking Card (Collapsible, with Left Guide Rail) */}
        {thinking && (
          <div className="w-full">
            <button
              type="button"
              onClick={() => setThinkingExpanded(!thinkingExpanded)}
              className="w-full flex items-center justify-between py-1 px-1.5 rounded-lg hover:bg-surface-chip/50 text-text-tertiary hover:text-text-secondary transition-colors cursor-pointer group/think"
            >
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-accent-purple shrink-0" />
                <span className="font-sans text-[11px]">
                  {thinkingExpanded
                    ? '收起思考过程'
                    : isThinkingState
                    ? '正在思考...'
                    : `已思考 ${formatDuration(thinkingMs)}`}
                </span>
              </div>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform duration-200 ${
                  thinkingExpanded ? 'rotate-90' : ''
                }`}
              />
            </button>

            {thinkingExpanded && thinking.text && (
              <div className="mt-1.5 pl-3 py-1.5 border-l-2 border-accent-purple/50 bg-surface/50 rounded-r-lg text-[11px] font-mono text-text-secondary italic whitespace-pre-wrap leading-relaxed select-text">
                {thinking.text}
              </div>
            )}
          </div>
        )}

        {/* 3. Tool Executing Card (List of Tools with Params & Output) */}
        {tools.length > 0 && (
          <div className="w-full space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between text-[11px] text-text-tertiary px-1">
              <span className="font-medium flex items-center gap-1">
                <Terminal className="w-3 h-3 text-accent-blue" />
                <span>工具调用轨迹 ({tools.length})</span>
              </span>
              {toolMs !== undefined && (
                <span className="font-mono text-[10px]">累计 {formatDuration(toolMs)}</span>
              )}
            </div>

            <div className="space-y-1">
              {tools.map((tc: ToolCallItem, idx: number) => {
                const toolKey = tc.id || `tool-${idx}`;
                const isExpanded = expandedToolId === toolKey;

                return (
                  <div
                    key={toolKey}
                    className="rounded-lg border border-border-subtle bg-surface/60 overflow-hidden text-[11px] transition-all"
                  >
                    <div
                      onClick={() => setExpandedToolId(isExpanded ? null : toolKey)}
                      className="px-2.5 py-1.5 flex items-center justify-between cursor-pointer hover:bg-surface-hover/70 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 font-mono">
                        <ChevronRight
                          className={`w-3 h-3 text-text-tertiary shrink-0 transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <Code2 className="w-3 h-3 text-accent-amber shrink-0" />
                        <span className="font-bold text-text-primary truncate">{tc.tool}</span>
                        {tc.description && (
                          <span className="text-text-tertiary font-sans truncate text-[10px] hidden sm:inline max-w-[200px]">
                            {tc.description}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {tc.durationMs !== undefined && (
                          <span className="font-mono text-[10px] text-text-tertiary">
                            {formatDuration(tc.durationMs)}
                          </span>
                        )}
                        {tc.status === 'running' ? (
                          <Loader2 className="w-3 h-3 text-accent-blue animate-spin" />
                        ) : tc.status === 'failed' ? (
                          <span className="text-[9px] px-1 py-0.2 rounded font-mono font-medium text-accent-red bg-accent-red/10">
                            FAIL
                          </span>
                        ) : (
                          <span className="text-[9px] px-1 py-0.2 rounded font-mono font-medium text-accent-green bg-accent-green/10">
                            PASS
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Collapsible Details: Arguments and Output */}
                    {isExpanded && (
                      <div className="p-2 bg-surface-elevated/70 border-t border-border-subtle/80 font-mono text-[10px] space-y-1.5 text-text-secondary select-text">
                        {tc.args !== undefined && (
                          <div>
                            <div className="text-text-tertiary mb-0.5">输入参数:</div>
                            <pre className="p-1.5 rounded bg-surface border border-border-subtle overflow-x-auto whitespace-pre-wrap max-h-36 no-scrollbar text-text-primary">
                              {typeof tc.args === 'string'
                                ? tc.args
                                : JSON.stringify(tc.args, null, 2)}
                            </pre>
                          </div>
                        )}
                        {tc.output !== undefined && (
                          <div>
                            <div className="text-text-tertiary mb-0.5">返回结果:</div>
                            <pre className="p-1.5 rounded bg-surface border border-border-subtle overflow-x-auto whitespace-pre-wrap max-h-40 no-scrollbar text-text-secondary">
                              {typeof tc.output === 'string'
                                ? tc.output
                                : JSON.stringify(tc.output, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Done Summary Card with Detailed Breakdown */}
        {isDone && (
          <div className="mt-1 pt-1.5 border-t border-border-subtle/60 flex items-center justify-between text-[11px] text-text-secondary font-mono flex-wrap gap-1">
            <div className="flex items-center gap-1.5 text-accent-green">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              <span>任务执行完成</span>
            </div>
            <div className="text-text-tertiary text-[10px]">
              总耗时 {formatDuration(totalMs)}
              {thinkingMs !== undefined || toolMs !== undefined ? (
                <span className="text-text-disabled ml-1">
                  (思考: {formatDuration(thinkingMs)}, 工具: {formatDuration(toolMs)})
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* 5. Error Info Card */}
        {isFailed && error && (
          <div className="mt-1 p-2 rounded-lg bg-accent-red/10 border border-accent-red/20 text-accent-red text-[11px] font-mono whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
