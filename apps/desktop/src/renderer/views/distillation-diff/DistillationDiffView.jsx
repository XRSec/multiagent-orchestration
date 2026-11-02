/**
 * DistillationDiffView.jsx
 * 提示词去脂与蒸馏 Diff 对比面板（支持【伙伴】与【文件夹】双维度）：
 * 直观对比 tools, mcps, skills, plugins 四大维度的【原（Baseline）】//【现在（Distilled）】。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState, useEffect } from 'react';
import {
  Flame,
  ArrowRight,
  TrendingDown,
  Lock,
  Cpu,
  Zap,
  Puzzle,
  Wrench,
  RefreshCw,
  Folder,
  User,
  CheckCircle2,
  Copy,
  ChevronRight
} from 'lucide-react';

export default function DistillationDiffView({
  partners = [],
  currentWorkspace = '',
  onClose
}) {
  const [scopeType, setScopeType] = useState('partner'); // 'partner' | 'folder'
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id || 'lead-orchestrator');
  const [selectedFolder, setSelectedFolder] = useState(currentWorkspace || '~/.multiagent-orchestration');

  const [activeCategory, setActiveCategory] = useState('tools'); // 'tools' | 'mcps' | 'skills' | 'plugins'
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedSide, setCopiedSide] = useState(null);

  const fetchDistillationDiff = () => {
    setLoading(true);
    const scopeId = scopeType === 'partner' ? selectedPartnerId : selectedFolder;
    fetch(`/api/distill/diff?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.report) {
          setReport(data.report);
        }
      })
      .catch(err => console.error('[DistillationDiff] Compute diff failed:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchDistillationDiff();
  }, [scopeType, selectedPartnerId, selectedFolder]);

  const copyText = (text, side) => {
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedSide(side);
    setTimeout(() => setCopiedSide(null), 2000);
  };

  const dimData = report?.dimensions?.[activeCategory] || {
    title: '加载中...',
    description: '',
    originalTokens: 0,
    distilledTokens: 0,
    savedTokens: 0,
    reductionRate: '0%',
    baseline: '',
    distilled: ''
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e22] text-[#e0e0e0] overflow-hidden">
      {/* 顶部标题与目标选择栏 */}
      <div className="border-b border-[#2d2d32] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1a1a1e]">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
            <h1 className="text-lg font-semibold text-white">提示词与架构去脂蒸馏 Diff 面板</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            实时分析并比对 Tools、MCPs、Skills、Plugins 四大维度的【原 (Baseline)】与【现在 (Distilled)】
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 维度切换器 */}
          <div className="inline-flex rounded-lg p-1 bg-[#25252a] border border-[#333338]">
            <button
              onClick={() => setScopeType('partner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'partner'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              伙伴维度
            </button>
            <button
              onClick={() => setScopeType('folder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'folder'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              文件夹维度
            </button>
          </div>

          <button
            onClick={fetchDistillationDiff}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2a2a30] hover:bg-[#34343c] text-gray-200 text-xs font-medium rounded-lg border border-[#3a3a44] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            重新计算
          </button>
        </div>
      </div>

      {/* 作用域目标选择栏 */}
      <div className="bg-[#242429] px-6 py-2.5 border-b border-[#2d2d32] flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-400">分析目标:</span>
          {scopeType === 'partner' ? (
            <select
              value={selectedPartnerId}
              onChange={e => setSelectedPartnerId(e.target.value)}
              className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1 focus:outline-none focus:border-amber-500"
            >
              {partners.map(p => (
                <option key={p.id} value={p.id}>
                  {p.avatar || '🤖'} {p.name} ({p.id})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              placeholder="输入工作区文件夹绝对路径"
              className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1 w-72 focus:outline-none focus:border-amber-500"
            />
          )}
        </div>

        {report?.summary && (
          <div className="flex items-center gap-2 text-gray-400 font-mono text-[11px]">
            <Lock className="w-3 h-3 text-indigo-400" />
            <span>前缀缓存键: {report.summary.prefixHash.slice(0, 16)}...</span>
          </div>
        )}
      </div>

      {/* 核心指标 KPI 仪表盘 */}
      {report?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 bg-[#1d1d22] border-b border-[#2d2d32]">
          <div className="bg-[#25252b] p-3 rounded-lg border border-[#313138]">
            <div className="text-[11px] text-gray-400">原始 Token 消耗 (原)</div>
            <div className="text-lg font-bold text-gray-200 mt-1 font-mono">
              {report.summary.originalTokens.toLocaleString()} <span className="text-xs font-normal text-gray-500">tok</span>
            </div>
          </div>

          <div className="bg-[#25252b] p-3 rounded-lg border border-[#313138]">
            <div className="text-[11px] text-gray-400">蒸馏后 Token 消耗 (现在)</div>
            <div className="text-lg font-bold text-amber-400 mt-1 font-mono">
              {report.summary.distilledTokens.toLocaleString()} <span className="text-xs font-normal text-gray-500">tok</span>
            </div>
          </div>

          <div className="bg-[#25252b] p-3 rounded-lg border border-[#313138]">
            <div className="text-[11px] text-gray-400">净节省 Token</div>
            <div className="text-lg font-bold text-emerald-400 mt-1 font-mono">
              -{report.summary.savedTokens.toLocaleString()} <span className="text-xs font-normal text-gray-500">tok</span>
            </div>
          </div>

          <div className="bg-[#25252b] p-3 rounded-lg border border-emerald-900/40 bg-gradient-to-br from-[#25252b] to-emerald-950/20">
            <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
              <TrendingDown className="w-3.5 h-3.5" />
              去脂节约率
            </div>
            <div className="text-xl font-black text-emerald-300 mt-0.5 font-mono">
              {report.summary.reductionPercent}
            </div>
          </div>
        </div>
      )}

      {/* 4 大维度 Tab 切换 */}
      <div className="flex border-b border-[#2d2d32] px-6 bg-[#1a1a1e]">
        <button
          onClick={() => setActiveCategory('tools')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'tools'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Wrench className="w-4 h-4" />
          1. Tools 工具瘦身 ({report?.dimensions?.tools?.reductionRate || '0%'} 节约)
        </button>

        <button
          onClick={() => setActiveCategory('mcps')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'mcps'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          2. MCPs 元工具化 ({report?.dimensions?.mcps?.reductionRate || '0%'} 节约)
        </button>

        <button
          onClick={() => setActiveCategory('skills')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'skills'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          3. Skills 技能胶囊 ({report?.dimensions?.skills?.reductionRate || '0%'} 节约)
        </button>

        <button
          onClick={() => setActiveCategory('plugins')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'plugins'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Puzzle className="w-4 h-4" />
          4. Plugins 意图裁剪 ({report?.dimensions?.plugins?.reductionRate || '0%'} 节约)
        </button>
      </div>

      {/* 维度详细说明 */}
      <div className="px-6 py-2 bg-[#212127] border-b border-[#2d2d32] flex items-center justify-between text-xs text-gray-400">
        <div>
          <span className="font-semibold text-gray-200">{dimData.title}</span>：{dimData.description}
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="text-gray-400">原: {dimData.originalTokens} tok</span>
          <ArrowRight className="w-3 h-3 text-gray-600" />
          <span className="text-amber-400">现在: {dimData.distilledTokens} tok</span>
          <span className="text-emerald-400 font-bold">(-{dimData.reductionRate})</span>
        </div>
      </div>

      {/* Diff 双栏核心对照视窗 */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#2d2d32]">
        {/* 左栏：原 (Baseline / Un-distilled) */}
        <div className="flex flex-col h-full bg-[#1b1b1f] overflow-hidden">
          <div className="px-4 py-2 bg-[#232328] border-b border-[#2d2d32] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500/80"></span>
              <span className="font-semibold text-gray-300">【原】Baseline / 未蒸馏全量注入</span>
            </div>
            <button
              onClick={() => copyText(dimData.baseline, 'left')}
              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              {copiedSide === 'left' ? '已复制' : '复制原文'}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-gray-400 leading-relaxed whitespace-pre-wrap select-text">
            {dimData.baseline || '(无数据)'}
          </div>
        </div>

        {/* 右栏：现在 (Distilled / Post-diet) */}
        <div className="flex flex-col h-full bg-[#19191d] overflow-hidden">
          <div className="px-4 py-2 bg-[#202025] border-b border-[#2d2d32] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80"></span>
              <span className="font-semibold text-emerald-400">【现在】Distilled / Control Plane 去脂蒸馏态</span>
            </div>
            <button
              onClick={() => copyText(dimData.distilled, 'right')}
              className="text-[11px] text-gray-400 hover:text-white flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              {copiedSide === 'right' ? '已复制' : '复制结果'}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-emerald-300/90 leading-relaxed whitespace-pre-wrap select-text bg-[#161619]">
            {dimData.distilled || '(无数据)'}
          </div>
        </div>
      </div>
    </div>
  );
}
