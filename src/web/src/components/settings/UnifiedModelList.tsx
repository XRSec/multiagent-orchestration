/**
 * Migrated from extensions/Cindy/apps/desktop/src/renderer/components/settings/UnifiedModelList.tsx
 * Uses Cindy's official ProviderLogoMark (AnthropicMark, Google Gemini star, OpenAIMark, DeepSeek, Qwen, etc.),
 * Cindy's Switch (with pointer drag & thumb deformation), and Cindy's Manage dropdown (按品牌 / 按名称 / 全部打开 / 全部关闭 / 恢复默认).
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Check,
} from 'lucide-react';
import { ProviderLogoMark } from '@/components/icons/ProviderLogoMark';
import type { ProviderLogoKind } from '@/components/icons/providerBranding';
import { Switch } from '@/components/ui/switch';

export interface UnifiedModelEntry {
  id: string;
  name?: string;
  displayName?: string;
  vendor?: string;
  enabled?: boolean;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  input?: string[];
}

export interface UnifiedModelListProps {
  providerId: string;
  models: UnifiedModelEntry[];
  refreshing?: boolean;
  onRefresh?: () => void;
  onToggleModel: (modelId: string, enabled: boolean) => void;
  onBulkToggle?: (action: 'show' | 'hide' | 'reset') => void;
  onOpenAdvanced?: (model: UnifiedModelEntry) => void;
}

const COLLAPSE_STORAGE_KEY = 'xdt:modelListCollapsedGroups:v3';

function loadCollapsedMap(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function resolveModelBrand(model: UnifiedModelEntry): {
  key: string;
  label: string;
  logoKind: ProviderLogoKind;
} {
  const raw = `${model.id} ${model.name || ''} ${model.displayName || ''} ${model.vendor || ''}`.toLowerCase();
  if (
    raw.includes('claude') ||
    raw.includes('anthropic') ||
    raw.includes('opus') ||
    raw.includes('sonnet') ||
    raw.includes('haiku') ||
    raw.includes('fable')
  ) {
    return { key: 'anthropic', label: 'ANTHROPIC', logoKind: 'anthropic' };
  }
  if (raw.includes('gemini') || raw.includes('argon') || raw.includes('google') || raw.includes('谷歌')) {
    return { key: 'google', label: '谷歌', logoKind: 'google' };
  }
  if (raw.includes('gpt') || raw.includes('openai') || raw.includes('o1') || raw.includes('o3')) {
    return { key: 'openai', label: 'OPENAI', logoKind: 'openai' };
  }
  if (raw.includes('deepseek')) {
    return { key: 'deepseek', label: 'DEEPSEEK', logoKind: 'deepseek' };
  }
  if (raw.includes('qwen') || raw.includes('千问') || raw.includes('alibaba')) {
    return { key: 'alibaba', label: '通义千问', logoKind: 'alibaba' };
  }
  if (raw.includes('kimi') || raw.includes('moonshot')) {
    return { key: 'moonshot', label: 'KIMI / MOONSHOT', logoKind: 'moonshot' };
  }
  if (raw.includes('glm') || raw.includes('zhipu')) {
    return { key: 'zhipu', label: '智谱 GLM', logoKind: 'zhipu' };
  }
  if (raw.includes('minimax')) {
    return { key: 'minimax', label: 'MINIMAX', logoKind: 'minimax' };
  }
  if (raw.includes('grok') || raw.includes('xai')) {
    return { key: 'xai', label: 'XAI', logoKind: 'xai' };
  }
  return { key: 'other', label: model.vendor || '其他', logoKind: 'anthropic' };
}

export const UnifiedModelList: React.FC<UnifiedModelListProps> = ({
  providerId,
  models,
  refreshing = false,
  onRefresh,
  onToggleModel,
  onBulkToggle,
  onOpenAdvanced,
}) => {
  const [query, setQuery] = useState('');
  const [managementView, setManagementView] = useState<'brand' | 'model'>('brand');
  const [collapsedMap, setCollapsedMap] = useState<Record<string, boolean>>(loadCollapsedMap);
  const [manageMenuOpen, setManageMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setManageMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDocClick);
    return () => window.removeEventListener('mousedown', onDocClick);
  }, []);

  const normalizedModels = useMemo<UnifiedModelEntry[]>(
    () =>
      models.map((m) =>
        typeof m === 'string'
          ? { id: m, name: m, enabled: true }
          : { ...m, enabled: m.enabled !== false }
      ),
    [models]
  );

  const selectedCount = normalizedModels.filter((m) => m.enabled !== false).length;
  const showSearch = normalizedModels.length > 8;

  const toggleGroupCollapse = (key: string) => {
    setCollapsedMap((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const { activeGroups, hiddenRows } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? normalizedModels.filter(
          (m) =>
            m.id.toLowerCase().includes(q) ||
            (m.name || '').toLowerCase().includes(q) ||
            (m.displayName || '').toLowerCase().includes(q)
        )
      : normalizedModels;

    const shown = filtered.filter((m) => m.enabled !== false);
    const hidden = filtered.filter((m) => m.enabled === false);

    if (managementView === 'model') {
      const sorted = [...shown].sort((a, b) =>
        (a.name || a.id).localeCompare(b.name || b.id)
      );
      return {
        activeGroups: sorted.length > 0 ? [{ key: 'all', label: '全部模型', rows: sorted }] : [],
        hiddenRows: hidden,
      };
    }

    const byBrand = new Map<string, { key: string; label: string; rows: UnifiedModelEntry[] }>();
    for (const m of shown) {
      const brand = resolveModelBrand(m);
      if (!byBrand.has(brand.key)) {
        byBrand.set(brand.key, { key: brand.key, label: brand.label, rows: [] });
      }
      byBrand.get(brand.key)!.rows.push(m);
    }

    return {
      activeGroups: Array.from(byBrand.values()),
      hiddenRows: hidden,
    };
  }, [normalizedModels, query, managementView]);

  const renderModelRow = (m: UnifiedModelEntry) => {
    const brand = resolveModelBrand(m);
    const label = m.name || m.displayName || m.id;
    const isOn = m.enabled !== false;

    return (
      <div
        key={m.id}
        className="group flex items-center gap-3 rounded-lg px-2 py-[7px] transition-colors hover:bg-surface-hover/60"
      >
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center text-text-secondary"
          aria-hidden="true"
        >
          <ProviderLogoMark
            providerId={providerId}
            logoKind={brand.logoKind}
            size={18}
          />
        </span>

        <span
          className={`min-w-0 truncate text-[14px] font-medium ${
            isOn ? 'text-text-primary' : 'text-text-tertiary'
          }`}
        >
          {label}
        </span>

        <span className="min-w-0 flex-1" />

        {onOpenAdvanced && (
          <button
            type="button"
            title="模型参数设置"
            onClick={() => onOpenAdvanced(m)}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-0 group-hover:opacity-100 hover:bg-surface text-text-tertiary hover:text-text-primary transition-opacity cursor-pointer"
          >
            <SlidersHorizontal size={14} />
          </button>
        )}

        <Switch
          checked={isOn}
          onCheckedChange={(next) => onToggleModel(m.id, next)}
          aria-label={label}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar: 模型 已选 N 个 + 刷新 + 管理 v */}
      <div
        data-testid="provider-model-toolbar"
        className="sticky top-0 z-10 flex flex-col gap-2 bg-surface-elevated px-6 pb-2.5 pt-3.5"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[13px] font-semibold text-text-primary">模型</span>
              <span className="text-[11px] text-text-tertiary">已选 {selectedCount} 个</span>
            </div>
            <p className="mt-0.5 text-[11px] text-text-tertiary">
              用开关选择常用的对话模型。
            </p>
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              title="从上游 /v1/models 刷新模型列表"
              className="flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          )}

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setManageMenuOpen((v) => !v)}
              className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-default bg-surface px-3 text-[12px] font-medium text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span>管理</span>
              <ChevronDown size={12} className="text-text-tertiary" />
            </button>

            {manageMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl border border-border-default bg-surface-elevated p-1.5 shadow-xl z-30 text-xs">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary">
                  排列方式
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManagementView('brand');
                    setManageMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-text-primary cursor-pointer"
                >
                  <span>按品牌分组</span>
                  {managementView === 'brand' && <Check size={13} className="text-accent-blue" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManagementView('model');
                    setManageMenuOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-text-primary cursor-pointer"
                >
                  <span>按模型名称</span>
                  {managementView === 'model' && <Check size={13} className="text-accent-blue" />}
                </button>

                {onBulkToggle && (
                  <>
                    <div className="my-1 h-px bg-border-subtle" />
                    <div className="px-2.5 py-1 text-[10px] font-semibold text-text-tertiary">
                      批量选择
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onBulkToggle('show');
                        setManageMenuOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-text-primary cursor-pointer"
                    >
                      全部开启
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onBulkToggle('hide');
                        setManageMenuOpen(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-text-primary cursor-pointer"
                    >
                      全部关闭
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {showSearch && (
          <div className="flex h-8 items-center gap-2 rounded-full border border-border-default bg-surface px-3 mt-1">
            <Search size={14} className="text-text-tertiary shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索模型名称或 ID..."
              className="min-w-0 flex-1 bg-transparent text-xs text-text-primary outline-none placeholder:text-text-tertiary"
            />
          </div>
        )}
      </div>

      {/* Grouped Rows */}
      <div className="px-5 pb-4 space-y-3 overflow-y-auto flex-1">
        {activeGroups.map((group) => {
          const isCollapsed = Boolean(collapsedMap[group.key]);
          return (
            <div key={group.key} className="space-y-0.5">
              {managementView === 'brand' && (
                <button
                  type="button"
                  onClick={() => toggleGroupCollapse(group.key)}
                  className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary hover:text-text-secondary cursor-pointer select-none"
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span>{group.label}</span>
                  <span className="font-normal text-text-tertiary/70">{group.rows.length}</span>
                </button>
              )}

              {!isCollapsed && (
                <div className="space-y-0.5">{group.rows.map(renderModelRow)}</div>
              )}
            </div>
          );
        })}

        {/* Sunk Unenabled Section (Cindy pattern: disabled switches sink to bottom) */}
        {hiddenRows.length > 0 && (
          <div className="space-y-0.5 pt-2 border-t border-border-subtle/50">
            <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
              <span>未启用</span>
              <span className="font-normal text-text-tertiary/70">{hiddenRows.length}</span>
            </div>
            <div className="space-y-0.5">{hiddenRows.map(renderModelRow)}</div>
          </div>
        )}
      </div>
    </div>
  );
};
