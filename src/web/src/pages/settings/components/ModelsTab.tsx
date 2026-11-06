/**
 * Purpose: 4-Slot Model Hierarchy & Reasoning Configuration Tab (Cindy 4-Tier Architecture).
 * Context: Configures Slot 1 (primaryModel), Slot 2 (primaryFallbackModel), Slot 3 (auxiliaryModel),
 *          and Slot 4 (auxiliaryFallbackModel), plus Thinking Effort Budget and Fast Mode.
 * Usage: Mounted in SettingsPage for the 'models' tab.
 * Prerequisites: React 19, Lucide icons.
 */

import React, { useState, useMemo } from 'react';
import {
  Cpu,
  Sparkles,
  ShieldAlert,
  Zap,
  FileCode2,
  Check,
  Sliders,
  Layers,
  RotateCcw,
} from 'lucide-react';

export interface ModelOption {
  id: string;
  name: string;
  displayName?: string;
  provider?: string;
  providerId?: string;
  vendor?: string;
  enabled?: boolean;
  description?: string;
}

export interface ReasoningOption {
  id: string;
  label: string;
  tokens?: number;
  budget?: number;
}

interface ModelsTabProps {
  cliSourceInfo: string;
  cliModels: ModelOption[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  cliReasoning: ReasoningOption[];
  selectedReasoning: string;
  onSelectReasoning: (id: string) => void;
  fallbackModel: string;
  onChangeFallbackModel: (val: string) => void;
  auxiliaryModel: string;
  onChangeAuxiliaryModel: (val: string) => void;
  auxiliaryFallbackModel: string;
  onChangeAuxiliaryFallbackModel: (val: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

const EFFORT_META: Record<
  string,
  { short: string; badge: string; tokensLabel: string; desc: string }
> = {
  low: {
    short: '低 (Low)',
    badge: '4K tokens',
    tokensLabel: '4,096 tokens',
    desc: '轻量极速思考，适合简单问答、格式转换与快速指令',
  },
  medium: {
    short: '中 (Medium)',
    badge: '16K tokens',
    tokensLabel: '16,384 tokens',
    desc: '均衡推理深度与响应延迟，适合日常代码编辑与常规分析',
  },
  high: {
    short: '高 (High)',
    badge: '32K tokens · 推荐',
    tokensLabel: '32,000 tokens',
    desc: '深度多步推演，适合复杂架构设计、多智能体协同编排与根因排查',
  },
  max: {
    short: '极高 (Max)',
    badge: '64K tokens',
    tokensLabel: '64,000 tokens',
    desc: '最大推理预算，适合高难度重构、安全审计与跨模块全链路推演',
  },
};

export const ModelsTab: React.FC<ModelsTabProps> = ({
  cliSourceInfo,
  cliModels,
  selectedModel,
  onSelectModel,
  cliReasoning,
  selectedReasoning,
  onSelectReasoning,
  fallbackModel,
  onChangeFallbackModel,
  auxiliaryModel,
  onChangeAuxiliaryModel,
  auxiliaryFallbackModel,
  onChangeAuxiliaryFallbackModel,
  onSave,
  isSaving,
}) => {
  const [fastMode, setFastMode] = useState(true);

  // Group all available models by vendor/provider so every model is clearly listed
  const groupedOptions = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const m of cliModels) {
      const groupName = m.vendor
        ? `${m.provider || 'Claude'} · ${m.vendor}`
        : m.provider || '已配置模型';
      if (!map.has(groupName)) map.set(groupName, []);
      map.get(groupName)!.push(m);
    }
    return Array.from(map.entries());
  }, [cliModels]);

  const renderModelSelect = (
    value: string,
    onChange: (val: string) => void,
    testId: string
  ) => (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface-elevated border border-border-default px-3 py-2 rounded-xl text-text-primary font-mono text-xs focus:outline-none focus:border-accent-blue transition-colors cursor-pointer"
    >
      {groupedOptions.map(([group, list]) => (
        <optgroup key={group} label={group}>
          {list.map((m) => (
            <option key={`${m.providerId || ''}:${m.id}`} value={m.id}>
              {m.displayName && m.displayName !== m.id
                ? `${m.displayName} (${m.id})`
                : m.id}
            </option>
          ))}
        </optgroup>
      ))}
      {!cliModels.some((m) => m.id === value) && value ? (
        <option value={value}>{value}</option>
      ) : null}
    </select>
  );

  return (
    <div className="space-y-5">
      {/* Top Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              模型与推理配置 (4 级模型矩阵)
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              全量模型已同步 ({cliModels.length} 个)
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            配置全局 4 份核心模型槽位（主力首选、主力回退、辅助首选、辅助回退）与推理思考预算
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-elevated border border-border-default text-[11px] text-text-secondary font-mono shrink-0">
          <FileCode2 className="w-3.5 h-3.5 text-accent-blue shrink-0" />
          <span className="truncate max-w-[240px]" title={cliSourceInfo}>
            {cliSourceInfo}
          </span>
        </div>
      </div>

      {/* Card 1: 4-Slot Model Selection Matrix */}
      <div className="rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border-subtle bg-surface/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-primary">
                四级模型路由矩阵 (4-Slot Model Hierarchy)
              </div>
              <div className="text-[11px] text-text-tertiary">
                主力通道负责深度推理与工具执行，辅助通道负责会话摘要、标题生成与前置意图提炼
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectModel('claude-opus-4-6');
              onChangeFallbackModel('gemini-3.8-flash');
              onChangeAuxiliaryModel('gemini-3.8-flash');
              onChangeAuxiliaryFallbackModel('gemini-3.5-flash-lite');
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border-default bg-surface hover:bg-surface-hover text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>恢复推荐默认</span>
          </button>
        </div>

        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Slot 1: Primary Model */}
          <div className="p-4 rounded-xl bg-surface border border-border-subtle space-y-2.5 hover:border-border-default transition-colors">
            <div className="flex items-center justify-between">
              <label className="font-bold text-text-primary flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
                <span>1. 主力对话首选模型 (Primary)</span>
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                Slot 1 · 主力首选
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              新对话与编排调度默认调用的旗舰推理模型
            </p>
            {renderModelSelect(selectedModel, onSelectModel, 'select-primary-model')}
          </div>

          {/* Slot 2: Primary Fallback Model */}
          <div className="p-4 rounded-xl bg-surface border border-border-subtle space-y-2.5 hover:border-border-default transition-colors">
            <div className="flex items-center justify-between">
              <label className="font-bold text-text-primary flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>2. 主力对话备用回退 (Primary Fallback)</span>
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Slot 2 · 主力兜底
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              当主力首选模型发生 429 限流或 5xx 超时时自动无缝接管
            </p>
            {renderModelSelect(fallbackModel, onChangeFallbackModel, 'select-primary-fallback-model')}
          </div>

          {/* Slot 3: Auxiliary Preferred Model */}
          <div className="p-4 rounded-xl bg-surface border border-border-subtle space-y-2.5 hover:border-border-default transition-colors">
            <div className="flex items-center justify-between">
              <label className="font-bold text-text-primary flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span>3. 辅助小模型首选 (Auxiliary Preferred)</span>
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                Slot 3 · 辅助首选
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              用于会话自动标题、Prompt Distill 滚动摘要与快速预检的高吞吐模型
            </p>
            {renderModelSelect(auxiliaryModel, onChangeAuxiliaryModel, 'select-auxiliary-model')}
          </div>

          {/* Slot 4: Auxiliary Fallback Model */}
          <div className="p-4 rounded-xl bg-surface border border-border-subtle space-y-2.5 hover:border-border-default transition-colors">
            <div className="flex items-center justify-between">
              <label className="font-bold text-text-primary flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-teal-400" />
                <span>4. 辅助小模型备用回退 (Auxiliary Fallback)</span>
              </label>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                Slot 4 · 辅助兜底
              </span>
            </div>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              当辅助首选模型不可用或超载时自动降级调用的极速兜底小模型
            </p>
            {renderModelSelect(
              auxiliaryFallbackModel,
              onChangeAuxiliaryFallbackModel,
              'select-auxiliary-fallback-model'
            )}
          </div>
        </div>
      </div>

      {/* Card 2: Thinking Effort Interactive Selector */}
      <div className="rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-xs">
        <div className="px-5 py-3.5 border-b border-border-subtle bg-surface/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-primary">
                默认推理思考档位 (Thinking Effort Budget)
              </div>
              <div className="text-[11px] text-text-tertiary">
                控制 Claude Agent SDK 在输出正式回复前展开隐式推理的 Token 预算上限
              </div>
            </div>
          </div>
          <span className="text-[11px] font-mono text-purple-400 bg-purple-500/10 px-2.5 py-0.5 rounded-lg border border-purple-500/20">
            {EFFORT_META[selectedReasoning]?.tokensLabel || selectedReasoning}
          </span>
        </div>

        <div className="p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {cliReasoning.map((r) => {
              const isSelected = selectedReasoning === r.id;
              const meta = EFFORT_META[r.id] || {
                short: r.label,
                badge: r.tokens ? `${r.tokens} tokens` : r.id,
                tokensLabel: r.label,
                desc: r.label,
              };
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectReasoning(r.id)}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                    isSelected
                      ? 'bg-accent-blue/10 border-accent-blue shadow-xs'
                      : 'bg-surface border-border-subtle hover:border-border-default hover:bg-surface-hover/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`text-xs font-bold ${
                        isSelected ? 'text-accent-blue' : 'text-text-primary'
                      }`}
                    >
                      {meta.short}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        isSelected
                          ? 'bg-accent-blue text-white'
                          : 'bg-surface-elevated text-text-tertiary border border-border-subtle'
                      }`}
                    >
                      {meta.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-tertiary leading-snug">{meta.desc}</p>
                </button>
              );
            })}
          </div>

          {/* Fast Mode Toggle Strip */}
          <div className="pt-2">
            <label className="flex items-center justify-between p-3.5 rounded-xl bg-surface border border-border-subtle hover:border-border-default transition-colors cursor-pointer">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-text-primary">
                    开启 Fast Mode (高吞吐极速流式通道)
                  </div>
                  <div className="text-[11px] text-text-tertiary mt-0.5">
                    优先启用低延迟 Token 流式推送，保持相同核心模型权重与推理精度
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={fastMode}
                onChange={(e) => setFastMode(e.target.checked)}
                className="w-4 h-4 accent-accent-blue cursor-pointer shrink-0"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Action Save Bar */}
      {onSave && (
        <div className="pt-2 flex items-center justify-between gap-4">
          <span className="text-[11px] text-text-tertiary">
            保存后将立即持久化 4 级模型配置并同步至运行时引擎
          </span>
          <button
            onClick={onSave}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-accent-blue text-white text-xs font-semibold hover:bg-accent-blue/90 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{isSaving ? '正在持久化保存...' : '保存 4 级模型与推理配置'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
