/**
 * ProgressiveDisclosureCard.jsx
 * 三层渐进披露 (3-Tier Progressive Disclosure) 交互式卡片：
 * Tier 1 (折叠标签) -> Tier 2 (微胶囊 <=180字符) -> Tier 3 (行切片/全量视窗)。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState } from 'react';
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Layers,
  Copy,
  Check,
  Maximize2,
  Minimize2
} from 'lucide-react';

export default function ProgressiveDisclosureCard({
  resourceId = 'res-spec-01',
  tag = 'SPEC_DOCUMENT',
  title = '系统架构规范与约束说明',
  lines = 120,
  bytes = 4850,
  capsuleText = '严禁越界修改生产代码；所有重构必须遵循 STANDING_ORDER.md 单向拓扑；单文件行数硬限制 <=600 行。',
  fullContent = `# [0] ROOT: SPECIFICATION & ARCHITECTURAL INVARIANTS\n\n* [1] STANDING ORDER INHERITANCE: 100% en-US prompts, zero cross-dependencies.\n* [2] FILE LIMITS: Hard limit <= 600 lines per source file.\n* [3] VERIFIED EXECUTION: Zero unhandled promise rejections allowed.\n* [4] PROMPT CACHE STABILITY: Static prefix locked at step boundaries.`
}) {
  // 当前处于哪一层: 1 (Folded) | 2 (Capsule) | 3 (Full Slice)
  const [tier, setTier] = useState(2);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard?.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl border border-sky-500/30 bg-[#191924] overflow-hidden text-xs shadow-md">
      {/* 顶部控制栏与三层切换器 */}
      <div className="px-3.5 py-2 bg-sky-950/30 border-b border-sky-500/20 flex flex-wrap items-center justify-between gap-2 select-none">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
            <FileText className="w-3 h-3 text-sky-400" />
          </div>
          <span className="font-semibold text-sky-200">{title}</span>
          <span className="font-mono text-[10px] text-gray-400 bg-sky-900/30 px-1.5 py-0.5 rounded border border-sky-800/40">
            {tag}
          </span>
        </div>

        {/* 3-Tier 渐进切换分段器 */}
        <div className="inline-flex rounded-lg p-0.5 bg-[#12121a] border border-[#2b2b3d]">
          <button
            onClick={() => setTier(1)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              tier === 1
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Tier 1: 0-Token 折叠标签"
          >
            Tier 1 索引标签
          </button>
          <button
            onClick={() => setTier(2)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              tier === 2
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Tier 2: <=180 字符微胶囊"
          >
            Tier 2 微胶囊
          </button>
          <button
            onClick={() => setTier(3)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              tier === 3
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
            title="Tier 3: 全量窗口切片"
          >
            Tier 3 全量切片
          </button>
        </div>
      </div>

      {/* Tier 1: 折叠标签态 */}
      {tier === 1 && (
        <div
          onClick={() => setTier(2)}
          className="p-3 bg-[#151520] hover:bg-[#1a1a28] cursor-pointer flex items-center justify-between transition-colors text-gray-400"
        >
          <div className="font-mono text-[11px] text-sky-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-400/60"></span>
            <span>
              [ResourceFolded: {resourceId} | {lines} lines | {(bytes / 1024).toFixed(1)} KB | tag: {tag}]
            </span>
          </div>
          <span className="text-[10px] text-gray-500 flex items-center gap-1">
            点击展开微胶囊
            <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      )}

      {/* Tier 2: 微胶囊态 (<=180 字符) */}
      {tier === 2 && (
        <div className="p-3.5 bg-[#171723] space-y-2">
          <div className="flex items-center justify-between text-[10px] text-gray-500 font-mono">
            <span>[ResourceCapsule: {resourceId}]</span>
            <span className="text-emerald-400">长度: {capsuleText.length} 字符 (限额 180)</span>
          </div>

          <div className="text-xs text-slate-200 leading-relaxed font-sans bg-[#13131c] p-2.5 rounded-lg border border-sky-950/60">
            {capsuleText}
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={() => setTier(3)}
              className="text-[11px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
            >
              展开 Tier 3 全量正文与代码
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Tier 3: 全量切片视窗 */}
      {tier === 3 && (
        <div className="p-3.5 bg-[#14141e] space-y-2">
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono border-b border-gray-800/80 pb-1.5">
            <span>[ResourceSlice: {resourceId} | Lines 1-{lines} of {lines}]</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copied ? '已复制' : '复制全文'}
              </button>
              <button
                onClick={() => setTier(2)}
                className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1"
              >
                <Minimize2 className="w-3 h-3" />
                折叠至胶囊
              </button>
            </div>
          </div>

          <div className="p-3 bg-[#0f0f16] rounded-lg border border-gray-800 font-mono text-[11px] text-slate-300 leading-relaxed max-h-56 overflow-y-auto whitespace-pre-wrap select-text">
            {fullContent}
          </div>
        </div>
      )}
    </div>
  );
}
