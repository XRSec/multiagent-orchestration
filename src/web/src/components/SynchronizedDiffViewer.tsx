/**
 * SynchronizedDiffViewer.tsx
 * 双栏对照与滑动同步 (Synchronized Scrolling) Diff 视图组件:
 * - 左右双栏按比例精确同步滚动，杜绝长短文本错位
 * - 支持一键切换同步滚动锁定与独立浏览
 * - 复制原文 / 结果反馈与高亮对比
 * 单文件 <= 300 行规范。
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Copy, Check, ArrowRight, Minimize2, Maximize2, Link2, Unlink } from 'lucide-react';

interface SynchronizedDiffViewerProps {
  title?: string;
  originalLabel?: string;
  distilledLabel?: string;
  originalContent: string;
  distilledContent: string;
  originalTokens?: number;
  distilledTokens?: number;
  reductionRate?: string;
  emptyStateText?: string;
}

export function SynchronizedDiffViewer({
  title,
  originalLabel = '【原】Baseline / 未蒸馏全量注入',
  distilledLabel = '【现在】Distilled / 去脂蒸馏态',
  originalContent,
  distilledContent,
  originalTokens,
  distilledTokens,
  reductionRate,
  emptyStateText = '暂无去脂缓存数据'
}: SynchronizedDiffViewerProps) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [isSyncScroll, setIsSyncScroll] = useState(true);
  const isSyncing = useRef(false);

  const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null);

  // 滑动同步核心逻辑 (基于滚动比例双向对齐，带锁防死循环跳动)
  const handleScroll = useCallback((source: 'left' | 'right') => {
    if (!isSyncScroll || isSyncing.current) return;

    const sourceEl = source === 'left' ? leftRef.current : rightRef.current;
    const targetEl = source === 'left' ? rightRef.current : leftRef.current;

    if (!sourceEl || !targetEl) return;

    const maxSourceScroll = sourceEl.scrollHeight - sourceEl.clientHeight;
    const maxTargetScroll = targetEl.scrollHeight - targetEl.clientHeight;

    if (maxSourceScroll <= 0 || maxTargetScroll <= 0) return;

    isSyncing.current = true;
    const scrollRatio = sourceEl.scrollTop / maxSourceScroll;
    targetEl.scrollTop = Math.round(scrollRatio * maxTargetScroll);

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [isSyncScroll]);

  const copyToClipboard = (text: string, side: 'left' | 'right') => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedSide(side);
    setTimeout(() => setCopiedSide(null), 1800);
  };

  return (
    <div className="flex flex-col h-full bg-surface-elevated/10 border border-border-default rounded-xl overflow-hidden shadow-sm">
      {/* 状态与控制条 */}
      <div className="px-4 py-2.5 bg-surface-elevated/40 border-b border-border-default flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          {title && <span className="font-bold text-text-primary">{title}</span>}
          {originalTokens !== undefined && distilledTokens !== undefined && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-text-secondary bg-surface px-2.5 py-1 rounded-md border border-border-subtle">
              <span>原: <strong className="text-text-primary">{originalTokens}</strong> tok</span>
              <ArrowRight className="w-3 h-3 text-text-tertiary" />
              <span>现在: <strong className="text-amber-400">{distilledTokens}</strong> tok</span>
              {reductionRate && (
                <span className="text-emerald-400 font-bold ml-1">(-{reductionRate})</span>
              )}
            </div>
          )}
        </div>

        {/* 滑动同步开关 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSyncScroll(!isSyncScroll)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ${
              isSyncScroll
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-sm'
                : 'bg-surface border-border-default text-text-tertiary hover:text-text-primary'
            }`}
            title={isSyncScroll ? '已启用滑动同步：左右两侧将按比例同步滚动' : '已关闭滑动同步'}
          >
            {isSyncScroll ? <Link2 className="w-3.5 h-3.5 text-amber-400" /> : <Unlink className="w-3.5 h-3.5" />}
            <span>滑动同步: {isSyncScroll ? '开' : '关'}</span>
          </button>
        </div>
      </div>

      {/* 双栏对比视窗 */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-default min-h-[300px]">
        {/* 左栏：原文 (Baseline) */}
        <div className="flex flex-col h-full bg-surface-elevated/20 overflow-hidden">
          <div className="px-3.5 py-1.5 bg-surface-elevated/50 border-b border-border-default flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
              <span className="font-semibold text-text-primary truncate">{originalLabel}</span>
            </div>
            <button
              onClick={() => copyToClipboard(originalContent, 'left')}
              className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedSide === 'left' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>复制原文</span>
                </>
              )}
            </button>
          </div>
          <div
            ref={leftRef}
            onScroll={() => handleScroll('left')}
            className="flex-1 p-4 overflow-y-auto font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap select-text scroll-smooth"
          >
            {originalContent || <span className="text-text-tertiary italic">{emptyStateText}</span>}
          </div>
        </div>

        {/* 右栏：去脂后 (Distilled) */}
        <div className="flex flex-col h-full bg-surface-elevated/10 overflow-hidden">
          <div className="px-3.5 py-1.5 bg-surface-elevated/40 border-b border-border-default flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
              <span className="font-semibold text-emerald-400 truncate">{distilledLabel}</span>
            </div>
            <button
              onClick={() => copyToClipboard(distilledContent, 'right')}
              className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1 cursor-pointer transition-colors"
            >
              {copiedSide === 'right' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span className="text-emerald-400">已复制</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>复制结果</span>
                </>
              )}
            </button>
          </div>
          <div
            ref={rightRef}
            onScroll={() => handleScroll('right')}
            className="flex-1 p-4 overflow-y-auto font-mono text-xs text-emerald-300 leading-relaxed whitespace-pre-wrap select-text bg-surface-elevated/30 scroll-smooth"
          >
            {distilledContent || <span className="text-text-tertiary italic">{emptyStateText}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
