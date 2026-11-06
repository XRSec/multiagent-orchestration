import React from 'react';
import { HelpCircle } from 'lucide-react';

export interface ModelOption {
  id: string;
  name: string;
  displayName?: string;
  provider?: string;
}

export interface ReasoningOption {
  id: string;
  label: string;
  budget?: number;
}

export interface ModelMapping {
  role: string;
  displayName: string;
  targetModel: string;
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
  modelMappings: ModelMapping[];
  onChangeModelMapping?: (index: number, field: 'displayName' | 'targetModel', val: string) => void;
  onSave?: () => void;
  isSaving?: boolean;
}

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
  modelMappings,
  onChangeModelMapping,
  onSave,
  isSaving
}) => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text-primary">模型与推理配置</h2>
          <p className="text-xs text-text-secondary mt-0.5">默认模型选择、深度思考推理预算与执行策略</p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>基于多 Agent 运行时权威配置</span>
        </div>
      </div>

      {/* 1. 默认主对话模型与思考档位 */}
      <div className="flex flex-col rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm text-xs">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
          <div>
            <div className="font-medium text-text-primary">默认对话主模型</div>
            <div className="text-text-tertiary text-[11px] mt-0.5">
              动态读取自 <code className="font-mono text-text-secondary">{cliSourceInfo}</code>
            </div>
          </div>
          <select
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            className="bg-surface border border-border-default px-3 py-1.5 rounded-xl text-text-primary focus:outline-none font-mono max-w-sm"
          >
            {cliModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName && m.displayName !== m.id ? `${m.displayName} (${m.id})` : m.id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
          <div>
            <div className="font-medium text-text-primary">默认推理思考档位 (Thinking Effort)</div>
            <div className="text-text-tertiary text-[11px] mt-0.5">
              控制 Claude CLI 在输出前展开隐式推理的深度预算 (Budget Tokens)
            </div>
          </div>
          <select
            value={selectedReasoning}
            onChange={(e) => onSelectReasoning(e.target.value)}
            className="bg-surface border border-border-default px-3 py-1.5 rounded-xl text-text-primary focus:outline-none max-w-sm"
          >
            {cliReasoning.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <div className="font-medium text-text-primary">开启 Fast Mode (极速流式输出)</div>
            <div className="text-text-tertiary text-[11px] mt-0.5">使用高吞吐输出通道（不降低核心模型版本）</div>
          </div>
          <input type="checkbox" defaultChecked className="w-4 h-4 accent-accent-blue cursor-pointer" />
        </div>
      </div>

      {/* 2. 默认兜底模型 (1:1 还原用户截图) */}
      <div className="flex flex-col rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm text-xs p-4 space-y-2">
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-text-primary">默认兜底模型</span>
          <span title="当会话未显式指定模型或首选模型故障时自动降级调用的兜底模型">
            <HelpCircle className="w-3.5 h-3.5 text-text-tertiary cursor-pointer hover:text-text-secondary" />
          </span>
        </div>
        <input
          type="text"
          value={fallbackModel}
          onChange={(e) => onChangeFallbackModel(e.target.value)}
          placeholder="例如: claude-fable-5"
          className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary font-mono text-xs focus:outline-none focus:border-accent-blue transition-colors"
        />
      </div>

      {/* 3. 模型映射 (1:1 还原用户截图) */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          <h3 className="font-medium text-text-primary text-xs">模型映射</h3>
          <span title="Claude CLI 角色与实际调用模型的别名路由关系映射表">
            <HelpCircle className="w-3.5 h-3.5 text-text-tertiary cursor-pointer hover:text-text-secondary" />
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-text-tertiary px-1">
          <span className="w-24 shrink-0">模型角色</span>
          <span className="flex-1 min-w-0">显示名称</span>
          <span className="flex-1 min-w-0">实际请求模型</span>
        </div>

        <div className="space-y-2">
          {modelMappings.map((item, idx) => (
            <div key={item.role} className="flex items-center gap-3">
              {/* Role badge */}
              <div className="w-24 shrink-0 h-9 px-3 rounded-xl bg-surface-chip/80 border border-border-subtle flex items-center text-xs font-medium text-text-secondary">
                {item.role}
              </div>

              {/* Display name input */}
              <input
                type="text"
                value={item.displayName}
                onChange={(e) => onChangeModelMapping?.(idx, 'displayName', e.target.value)}
                className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-surface border border-border-default text-xs text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />

              {/* Target request model input */}
              <input
                type="text"
                value={item.targetModel}
                onChange={(e) => onChangeModelMapping?.(idx, 'targetModel', e.target.value)}
                className="flex-1 min-w-0 h-9 px-3 rounded-xl bg-surface border border-border-default text-xs font-mono text-text-primary focus:outline-none focus:border-accent-blue transition-colors"
              />
            </div>
          ))}
        </div>
      </div>

      {/* 4. Action Save Bar */}
      {onSave && (
        <div className="pt-4 border-t border-border-default flex items-center justify-end">
          <button
            onClick={onSave}
            disabled={isSaving}
            className="px-5 py-2 rounded-xl bg-accent-blue text-white text-xs font-semibold hover:bg-accent-blue/90 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
          >
            {isSaving ? '正在持久化保存...' : '保存模型与推理配置'}
          </button>
        </div>
      )}
    </div>
  );
};
