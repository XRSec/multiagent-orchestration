/**
 * Migrated from extensions/Cindy/apps/desktop/src/renderer/features/bots/BotModelChainEditor.tsx
 * Supports up to BOT_MODEL_CHAIN_MAXordered routes (Primary + Fallbacks with ArrowUp/ArrowDown/Trash2/Plus),
 * grouped by vendor with official ProviderLogoMark icons.
 */

import React, { useMemo } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, RotateCcw } from 'lucide-react';
import { ProviderLogoMark } from '@/components/icons/ProviderLogoMark';
import { resolveModelBrand } from '@/components/settings/UnifiedModelList';

export const BOT_MODEL_CHAIN_MAX = 4;

export interface BotModelRoute {
  model: string;
  providerId?: string | null;
  effort?: string;
}

export interface CatalogModelItem {
  id: string;
  name?: string;
  displayName?: string;
  provider?: string;
  providerId?: string;
  vendor?: string;
  enabled?: boolean;
}

export interface BotModelChainEditorProps {
  value: BotModelRoute[];
  onChange: (next: BotModelRoute[]) => void;
  models: CatalogModelItem[];
  disabled?: boolean;
  onRestoreDefault?: () => void;
  primaryLabel?: string;
  primaryHint?: string;
}

export function BotModelChainEditor({
  value,
  onChange,
  models,
  disabled = false,
  onRestoreDefault,
  primaryLabel = '首选模型',
  primaryHint = '当前主要使用的对话与工具执行模型',
}: BotModelChainEditorProps) {
  const routes = value.length > 0 ? value.slice(0, BOT_MODEL_CHAIN_MAX) : [{ model: 'claude-opus-4-6', effort: 'high' }];

  const groupedModels = useMemo(() => {
    const groups = new Map<string, CatalogModelItem[]>();
    for (const m of models) {
      const brand = resolveModelBrand({ id: m.id, name: m.displayName || m.name, vendor: m.vendor });
      const label = `${m.provider || 'Claude'} · ${brand.label}`;
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label)!.push(m);
    }
    return Array.from(groups.entries());
  }, [models]);

  const replaceAt = (index: number, patch: Partial<BotModelRoute>) => {
    if (disabled) return;
    const next = routes.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange(next);
  };

  const moveFallback = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (disabled || index < 1 || target < 1 || target >= routes.length) return;
    const next = [...routes];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  const removeAt = (index: number) => {
    if (disabled || routes.length <= 1) return;
    onChange(routes.filter((_, i) => i !== index));
  };

  const addFallback = () => {
    if (disabled || routes.length >= BOT_MODEL_CHAIN_MAX) return;
    const usedIds = new Set(routes.map((r) => r.model));
    const candidate = models.find((m) => !usedIds.has(m.id)) || models[0];
    onChange([
      ...routes,
      {
        model: candidate?.id || 'gemini-3.8-flash',
        providerId: candidate?.providerId || 'cpa',
        effort: 'high',
      },
    ]);
  };

  const renderRoutePicker = (route: BotModelRoute, index: number) => {
    const brand = resolveModelBrand({ id: route.model });
    return (
      <div className="flex flex-1 min-w-0 items-center gap-2">
        <div className="relative flex-1 min-w-0 flex items-center">
          <span className="absolute left-3 pointer-events-none text-text-secondary">
            <ProviderLogoMark providerId={route.providerId || 'cpa'} logoKind={brand.logoKind} size={15} />
          </span>
          <select
            data-testid={`bot-chain-select-${index}`}
            disabled={disabled}
            value={route.model}
            onChange={(e) => replaceAt(index, { model: e.target.value })}
            className="w-full bg-surface border border-border-default rounded-full pl-9 pr-3 py-1.5 text-xs font-medium text-text-primary focus:outline-none focus:border-accent-blue cursor-pointer"
          >
            {groupedModels.map(([groupName, list]) => (
              <optgroup key={groupName} label={groupName}>
                {list.map((m) => (
                  <option key={`${m.providerId || ''}:${m.id}`} value={m.id}>
                    {m.displayName || m.name || m.id}
                  </option>
                ))}
              </optgroup>
            ))}
            {!models.some((m) => m.id === route.model) && route.model ? (
              <option value={route.model}>{route.model}</option>
            ) : null}
          </select>
        </div>

        <select
          disabled={disabled}
          value={route.effort || 'high'}
          onChange={(e) => replaceAt(index, { effort: e.target.value })}
          title="思考深度 (Thinking Effort)"
          className="w-24 shrink-0 bg-surface border border-border-default rounded-full px-2.5 py-1.5 text-[11px] font-mono text-text-secondary focus:outline-none focus:border-accent-blue cursor-pointer"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="max">Max</option>
        </select>
      </div>
    );
  };

  const primaryRoute = routes[0]!;
  const fallbackRoutes = routes.slice(1);

  return (
    <div
      data-testid="bot-model-chain-editor"
      className="rounded-2xl border border-border-default bg-surface-elevated overflow-hidden shadow-xs text-xs"
    >
      {/* Row 1: Primary Model (Cindy settings layout) */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5 min-w-0">
          <div className="text-[13px] font-semibold text-text-primary">{primaryLabel}</div>
          <p className="text-[11px] text-text-tertiary">{primaryHint}</p>
        </div>

        <div className="flex items-center gap-2 sm:min-w-[300px]">
          {onRestoreDefault && (
            <button
              type="button"
              onClick={onRestoreDefault}
              title="恢复默认模型链"
              className="p-1.5 rounded-full border border-border-default bg-surface hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer shrink-0"
            >
              <RotateCcw size={13} />
            </button>
          )}
          {renderRoutePicker(primaryRoute, 0)}
        </div>
      </div>

      <div className="mx-4 h-px bg-border-subtle" />

      {/* Row 2: Fallback Chain Header + Add Button */}
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="text-[13px] font-semibold text-text-primary">
            备用模型（已配置 {fallbackRoutes.length} / {BOT_MODEL_CHAIN_MAX - 1} 个）
          </div>
          <p className="text-[11px] text-text-tertiary">
            首选模型不可用或超载时，按顺序自动切换至下一顺位备用模型。
          </p>
        </div>

        <button
          type="button"
          disabled={disabled || routes.length >= BOT_MODEL_CHAIN_MAX}
          onClick={addFallback}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-border-default bg-surface hover:bg-surface-hover text-xs font-medium text-text-primary disabled:opacity-40 transition-colors cursor-pointer shrink-0"
        >
          <Plus size={14} />
          <span>添加备用模型</span>
        </button>
      </div>

      {/* Ordered Fallback Rows */}
      {fallbackRoutes.length > 0 && (
        <div className="px-4 pb-4 space-y-2" data-testid="bot-model-fallbacks">
          {fallbackRoutes.map((route, fIdx) => {
            const index = fIdx + 1;
            return (
              <div key={index} className="flex items-center gap-2">
                <span className="w-5 shrink-0 text-center font-mono text-[11px] text-text-tertiary">
                  {index}
                </span>
                {renderRoutePicker(route, index)}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={disabled || index === 1}
                    onClick={() => moveFallback(index, -1)}
                    title="上移优先级"
                    className="rounded-lg p-1.5 hover:bg-surface-hover text-text-secondary disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === routes.length - 1}
                    onClick={() => moveFallback(index, 1)}
                    title="下移优先级"
                    className="rounded-lg p-1.5 hover:bg-surface-hover text-text-secondary disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeAt(index)}
                    title="移除该备用模型"
                    className="rounded-lg p-1.5 hover:bg-accent-red/10 text-text-tertiary hover:text-accent-red cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
