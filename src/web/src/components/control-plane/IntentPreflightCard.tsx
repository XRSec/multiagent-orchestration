/**
 * IntentPreflightCard.tsx
 * 意图预检分析与多轮上下文蒸馏 UI 组件 (Cindy Web 规范):
 * 呈现小模型前置翻译、意图动作提取、工具路由推荐，以及多轮历史蒸馏摘要链。
 * 遵循严格单文件 <= 600 行规范。
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  Wrench,
  Layers,
  History,
  TrendingDown
} from 'lucide-react';

export interface DistilledHistoryItem {
  turn: number;
  distilledSummary: string;
}

export interface IntentPreflightData {
  turnIndex: number;
  rawInput: string;
  distilledHistory?: DistilledHistoryItem[];
  smallModelTranslation: string;
  intentType: string;
  requiredCapabilities: string[];
  suggestedTools: string[];
  latencyMs: number | string;
  isBypass?: boolean;
}

interface IntentPreflightCardProps {
  preflight: IntentPreflightData;
}

export function IntentPreflightCard({ preflight }: IntentPreflightCardProps) {
  const [expanded, setExpanded] = useState(true);

  if (!preflight) return null;

  const {
    turnIndex = 1,
    rawInput = '',
    distilledHistory = [],
    smallModelTranslation = '',
    intentType = 'GENERAL_ANALYSIS',
    requiredCapabilities = [],
    suggestedTools = [],
    latencyMs = 0.8,
    isBypass = false
  } = preflight;

  return (
    <div className="my-2.5 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-[#1d1d28] via-[#1a1a24] to-[#161620] shadow-lg overflow-hidden text-xs">
      {/* 顶部标题栏 */}
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3.5 py-2 bg-indigo-950/40 hover:bg-indigo-950/60 border-b border-indigo-500/20 flex items-center justify-between cursor-pointer select-none transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-indigo-300">
            <Sparkles className="w-3 h-3 text-indigo-400 animate-pulse" />
          </div>
          <span className="font-semibold text-indigo-200">
            意图预检分析 {turnIndex > 1 ? `(第 ${turnIndex} 轮复合分析)` : '(首轮介入)'}
          </span>
          <span className="px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 font-mono text-[10px] border border-indigo-700/50">
            {isBypass ? 'Bypass 穿透' : intentType}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[11px] text-gray-400 font-mono">
            <Clock className="w-3 h-3 text-indigo-400" />
            {latencyMs}ms
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="p-3.5 space-y-3 bg-[#171720]/80">
          {/* 若存在历史轮次，展示多轮对话上下文蒸馏链 */}
          {distilledHistory && distilledHistory.length > 0 && (
            <div className="p-2.5 rounded-lg bg-[#20202e] border border-indigo-900/40 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-indigo-300 font-medium">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-amber-400" />
                  前置对话正文去脂蒸馏链 (Multi-Turn Distilled Context)
                </span>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3" />
                  Token 负载大幅去脂
                </span>
              </div>

              <div className="space-y-1">
                {distilledHistory.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-1.5 rounded bg-[#181824] text-[11px] text-gray-300 border border-gray-800/80 flex items-start gap-2"
                  >
                    <span className="px-1 py-0.5 rounded bg-amber-950/60 text-amber-400 font-mono text-[9px] flex-shrink-0 mt-0.5">
                      Turn {item.turn} 蒸馏摘要
                    </span>
                    <span className="text-gray-300 leading-relaxed font-mono">{item.distilledSummary}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 小模型翻译与核心想法提炼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {/* 左侧：用户原始输入 */}
            <div className="p-2.5 rounded-lg bg-[#1c1c26] border border-[#2d2d3a]">
              <div className="text-[11px] text-gray-400 mb-1 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                用户口语原始输入
              </div>
              <div className="text-gray-300 text-xs leading-relaxed italic bg-[#14141d] p-2 rounded border border-gray-800/60 font-sans">
                "{rawInput}"
              </div>
            </div>

            {/* 右侧：小模型意图翻译提炼 */}
            <div className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-700/40">
              <div className="text-[11px] text-indigo-300 mb-1 flex items-center gap-1 font-medium">
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                语言小模型意图翻译 & 想法结构化
              </div>
              <div className="text-indigo-200 text-xs leading-relaxed bg-[#151522] p-2 rounded border border-indigo-900/60 font-mono">
                {smallModelTranslation || '提取核心任务语义，剥离口语客套，锁定主干约束'}
              </div>
            </div>
          </div>

          {/* 路由能力与建议工具集 */}
          <div className="pt-2 border-t border-indigo-950 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-400 flex items-center gap-1">
                <Layers className="w-3 h-3 text-indigo-400" />
                匹配能力:
              </span>
              {requiredCapabilities.map((cap, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded bg-indigo-900/30 text-indigo-300 border border-indigo-800/50 font-mono text-[10px]"
                >
                  {cap}
                </span>
              ))}
            </div>

            {suggestedTools && suggestedTools.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-gray-400 flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-amber-400" />
                  建议激活工具:
                </span>
                {suggestedTools.map((tool, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/40 font-mono text-[10px]"
                  >
                    {tool}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
