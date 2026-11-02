/**
 * BotGroupLiveStatus.jsx
 * Cindy 风格的实时进行中状态指示条：展示当前正在执行/思考的伙伴、耗时及状态动画
 * 单文件严格规范：<= 150 行
 */

import React, { useState, useEffect } from 'react';
import { Sparkles, Clock, AlertCircle } from 'lucide-react';

export default function BotGroupLiveStatus({
  speaker = null,
  isExecuting = false,
  statusText = '',
  durationSec = 0,
}) {
  const [elapsed, setElapsed] = useState(durationSec);

  useEffect(() => {
    if (!isExecuting) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isExecuting]);

  if (!isExecuting && !speaker) {
    return null;
  }

  const formatElapsed = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m > 0 ? `${m}m ` : ''}${s}s`;
  };

  const displayName = speaker?.name || speaker?.botId || '伙伴';
  const roleText = statusText || speaker?.activity || '正在处理协同任务...';

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border/60 bg-sky-950/20 text-xs font-mono select-none">
      <div className="flex items-center space-x-2 text-sky-400 min-w-0">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
        </span>

        <Sparkles className="w-3.5 h-3.5 animate-pulse text-sky-400 flex-shrink-0" />

        <div className="truncate flex items-center gap-1.5">
          <span className="font-semibold text-slate-200">{displayName}</span>
          <span className="text-slate-400 text-[11px] truncate">({roleText})</span>
        </div>
      </div>

      <div className="flex items-center space-x-1.5 text-slate-500 text-[11px] flex-shrink-0 ml-2">
        <Clock className="w-3 h-3 text-slate-500" />
        <span>{formatElapsed(elapsed)}</span>
      </div>
    </div>
  );
}
