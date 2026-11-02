/**
 * ToolDecayScrubberCard.jsx
 * 历史工具输出阶梯衰减 (Step-based Tool Decay Scrubber) UI 组件：
 * 呈现随 Step 执行推进的历史工具输出压缩、首尾保留衰减与极简指纹态，
 * 保护 Prompt Cache 稳定性并直观展示 Token 节省量。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState } from 'react';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  TrendingDown,
  RotateCcw,
  CheckCircle2,
  Terminal,
  Layers
} from 'lucide-react';

export default function ToolDecayScrubberCard({
  toolName = 'execute_bash_command',
  step = 1,
  currentTurnStep = 6,
  args = { command: 'pnpm test --runInBand' },
  rawOutput = `TAP version 13\n# Subtest: StepScrubber chunk decay\nok 1 - chunkStep=6 verified\nok 2 - freeze threshold calculated\nok 3 - collapsed 48 lines\n... (60 more lines of test logs) ...\n1..3\n# tests 3\n# pass 3\n# ok`,
  status = 'completed'
}) {
  // 根据 step 与 currentTurnStep 计算衰减阶梯
  // step 差异：
  // diff <= 1: 'full' (完整明细)
  // diff 2~4: 'compressed' (首尾保留，中间折叠)
  // diff >= 5: 'skeleton' (极简指纹)
  const diff = Math.max(0, currentTurnStep - step);
  const calculatedTier = diff <= 1 ? 'full' : diff <= 4 ? 'compressed' : 'skeleton';

  const [expanded, setExpanded] = useState(calculatedTier === 'full');
  const [forceFull, setForceFull] = useState(false);

  const activeMode = forceFull ? 'full' : calculatedTier;

  // 生成压缩态文本
  const lines = (rawOutput || '').split('\n');
  const totalLines = lines.length;
  const compressedText = totalLines > 4
    ? [
        lines[0],
        lines[1],
        `... [Scrubbed: ${totalLines - 4} 行历史输出已阶梯衰减折叠，保护 Prompt Cache 稳定] ...`,
        lines[totalLines - 2] || '',
        lines[totalLines - 1] || ''
      ].filter(Boolean).join('\n')
    : rawOutput;

  // 估算节约 Token
  const savedTokens = activeMode === 'skeleton'
    ? Math.max(1, Math.round(rawOutput.length / 3.8))
    : activeMode === 'compressed'
      ? Math.max(1, Math.round((rawOutput.length - compressedText.length) / 3.8))
      : 0;

  return (
    <div className="my-2 rounded-xl border border-gray-700/60 bg-[#191921] overflow-hidden text-xs shadow-sm">
      {/* 头部状态条 */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3.5 py-2 bg-[#20202b] hover:bg-[#252533] flex items-center justify-between cursor-pointer border-b border-gray-800 transition-colors select-none"
      >
        <div className="flex items-center gap-2">
          <Wrench className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono font-medium text-amber-300">{toolName}</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-gray-800 text-gray-400">
            Step #{step}
          </span>

          {/* 衰减状态胶囊 */}
          {activeMode === 'skeleton' ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/50 text-rose-300 border border-rose-800/50 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              极简指纹衰减 (Step &gt; 5)
            </span>
          ) : activeMode === 'compressed' ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950/50 text-amber-300 border border-amber-800/50 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              首尾保留衰减 (节省 ~{savedTokens} tok)
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/50 text-emerald-300 border border-emerald-800/50">
              最新完整输出 (Active)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {calculatedTier !== 'full' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setForceFull(!forceFull);
              }}
              className="text-[10px] text-gray-400 hover:text-amber-300 underline font-mono flex items-center gap-1"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              {forceFull ? '恢复衰减态' : '回看完整原始输出'}
            </button>
          )}

          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          )}
        </div>
      </div>

      {/* 展开内容 */}
      {expanded && (
        <div className="p-3.5 space-y-2.5 bg-[#14141c]">
          {/* 参数 */}
          <div>
            <div className="text-[10px] text-gray-500 font-mono mb-1">调用参数 (Arguments):</div>
            <pre className="p-2 rounded bg-[#0f0f16] border border-gray-800 text-[11px] text-gray-300 font-mono overflow-x-auto">
              {JSON.stringify(args, null, 2)}
            </pre>
          </div>

          {/* 输出内容（按衰减阶梯呈现） */}
          <div>
            <div className="text-[10px] text-gray-500 font-mono mb-1 flex items-center justify-between">
              <span>工具返回值 (Tool Result):</span>
              {savedTokens > 0 && (
                <span className="text-emerald-400 text-[10px] flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" />
                  已通过 Step 衰减去脂削减 {savedTokens} Tokens
                </span>
              )}
            </div>

            {activeMode === 'skeleton' ? (
              <div className="p-2.5 rounded bg-rose-950/20 border border-rose-900/40 text-rose-300/90 font-mono text-[11px]">
                [ToolResultDecayed: status={status} | totalLines={totalLines} | bytes={rawOutput.length} | step={step}]
                <div className="text-[10px] text-gray-500 mt-1">
                  (已进入极简指纹态，避免长尾历史输出污染上下文缓存)
                </div>
              </div>
            ) : activeMode === 'compressed' ? (
              <pre className="p-2.5 rounded bg-[#0f0f16] border border-amber-900/40 text-[11px] text-amber-200/90 font-mono overflow-x-auto leading-relaxed">
                {compressedText}
              </pre>
            ) : (
              <pre className="p-2.5 rounded bg-[#0f0f16] border border-emerald-900/40 text-[11px] text-emerald-300 font-mono overflow-x-auto leading-relaxed">
                {rawOutput}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
