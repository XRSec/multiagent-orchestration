/**
 * Migrated from extensions/Cindy/apps/desktop/src/renderer/components/settings/ProvidersSection.tsx
 * Uses Cindy's UnifiedModelList, ProviderLogoMark, and Switch components.
 */

import React, { useState, useRef } from 'react';
import {
  Plus,
  ChevronRight,
  MoreHorizontal,
  FileUp,
  Pencil,
  Trash2,
} from 'lucide-react';
import { ProviderLogoMark } from '@/components/icons/ProviderLogoMark';
import { Switch } from '@/components/ui/switch';
import { UnifiedModelList } from '@/components/settings/UnifiedModelList';

export interface ProviderItem {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: any[];
  icon?: string;
}

interface ProvidersTabProps {
  providers: ProviderItem[];
  sourceFile?: string;
  onAdd: () => void;
  onEdit: (p: ProviderItem) => void;
  onDelete: (p: ProviderItem) => void;
  onToggleModel?: (provider: ProviderItem, modelId: string, enabled: boolean) => void;
  onRefreshModels?: (provider: ProviderItem) => Promise<void>;
  onImportJsonFile?: (file: File) => void;
}

function getProviderLetterBadge(p: ProviderItem): string {
  const lower = `${p.id} ${p.name}`.toLowerCase();
  if (lower.includes('cpa') || lower.includes('claude')) return 'C';
  if (lower.includes('pi')) return 'P';
  return (p.name || p.id || 'P').slice(0, 1).toUpperCase();
}

function formatHostFromUrl(baseUrl?: string): string {
  if (!baseUrl) return '官方默认通道';
  if (baseUrl.startsWith('$')) return baseUrl;
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  }
}

export const ProvidersTab: React.FC<ProvidersTabProps> = ({
  providers,
  onAdd,
  onEdit,
  onDelete,
  onToggleModel,
  onRefreshModels,
  onImportJsonFile,
}) => {
  const [selectedId, setSelectedId] = useState<string>(providers[0]?.id || 'cpa');
  const [remoteCallEnabled, setRemoteCallEnabled] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedProvider =
    providers.find((p) => p.id === selectedId) || providers[0] || null;

  const handleRefreshClick = async () => {
    if (!selectedProvider || !onRefreshModels || refreshing) return;
    setRefreshing(true);
    try {
      await onRefreshModels(selectedProvider);
    } finally {
      setRefreshing(false);
    }
  };

  const handleBulkToggle = (action: 'show' | 'hide' | 'reset') => {
    if (!selectedProvider || !onToggleModel) return;
    const enable = action !== 'hide';
    for (const m of selectedProvider.models || []) {
      const id = typeof m === 'string' ? m : m.id;
      if (id) onToggleModel(selectedProvider, id, enable);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Page Title & Share Link Button */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-text-primary tracking-tight">模型供应商</h2>
          <p className="text-xs text-text-secondary mt-1">
            选择模型时的来源。每个来源提供它支持的模型与计费方式，可按任务分别切换。
          </p>
        </div>

        <button
          type="button"
          onClick={() => selectedProvider && onEdit(selectedProvider)}
          className="px-4 py-1.5 rounded-full border border-border-default bg-surface-elevated hover:bg-surface-hover text-xs font-medium text-text-primary transition-colors cursor-pointer shrink-0 shadow-2xs"
        >
          输入分享链接...
        </button>
      </div>

      {/* Main Dual-Column Container Card (Cindy ProvidersSection) */}
      <div className="rounded-2xl border border-border-default bg-surface-elevated shadow-xs overflow-hidden flex flex-col md:flex-row min-h-[560px]">
        {/* ================= LEFT COLUMN: Provider List & Actions ================= */}
        <div className="w-full md:w-[235px] shrink-0 border-b md:border-b-0 md:border-r border-border-subtle flex flex-col justify-between p-3 bg-surface/30">
          <div className="space-y-4">
            <div className="space-y-1">
              <div className="px-2.5 py-1 text-[11px] font-medium text-text-tertiary">
                拖动排序
              </div>

              {providers.map((p) => {
                const isSelected = selectedProvider?.id === p.id;
                const badgeChar = getProviderLetterBadge(p);
                const activeModelCount = (p.models || []).filter((m: any) =>
                  typeof m === 'string' ? true : m?.enabled !== false
                ).length;

                return (
                  <div
                    key={p.id}
                    data-testid="provider-card"
                    onClick={() => setSelectedId(p.id)}
                    className={`flex items-center justify-between gap-2 px-2.5 py-2.5 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-surface-hover/90 text-text-primary font-semibold shadow-2xs'
                        : 'hover:bg-surface-hover/50 text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-surface-elevated border border-border-subtle flex items-center justify-center text-xs font-bold text-text-primary shrink-0 shadow-2xs">
                        {p.id === 'cindy' ? (
                          <ProviderLogoMark providerId="cindy" logoKind="cindy" size={16} />
                        ) : (
                          badgeChar
                        )}
                      </span>
                      <span className="text-[13px] truncate">
                        {p.id === 'cpa' && p.name === 'CPA' ? 'Claude' : p.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-text-tertiary font-normal">
                        {activeModelCount} 个模型
                      </span>
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Detected Local CLI */}
            <div className="space-y-1.5 pt-2">
              <div className="px-2.5 py-1 text-[11px] font-medium text-text-tertiary">
                检测到本机 CLI
              </div>
              <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-xs text-text-secondary">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-lg bg-surface-elevated border border-border-subtle flex items-center justify-center text-text-primary shrink-0">
                    <ProviderLogoMark providerId="anthropic" logoKind="anthropic" size={14} />
                  </span>
                  <span className="truncate text-text-secondary">Anthr...</span>
                </div>
                <button
                  type="button"
                  onClick={() => selectedProvider && onEdit(selectedProvider)}
                  className="px-2.5 py-1 rounded-full border border-border-default bg-surface-elevated hover:bg-surface-hover text-[11px] text-text-secondary hover:text-text-primary transition-colors cursor-pointer shrink-0"
                >
                  使用本机账号
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Pill Action Buttons */}
          <div className="pt-3 border-t border-border-subtle space-y-2 mt-4">
            <button
              type="button"
              data-testid="btn-add-provider"
              onClick={onAdd}
              className="w-full py-2 px-4 rounded-full border border-border-default bg-surface-elevated hover:bg-surface-hover text-xs font-medium text-text-primary flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加供应商</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2 px-4 rounded-full border border-border-default bg-surface-elevated hover:bg-surface-hover text-xs font-medium text-text-primary flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <FileUp className="w-3.5 h-3.5" />
              <span>从文件导入</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && onImportJsonFile) {
                  onImportJsonFile(file);
                }
                e.target.value = '';
              }}
            />
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Selected Provider Detail ================= */}
        {selectedProvider ? (
          <div className="flex-1 flex flex-col min-w-0">
            {/* 1. Provider Detail Header */}
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-surface border border-border-subtle flex items-center justify-center text-sm font-bold text-text-primary shrink-0">
                  {getProviderLetterBadge(selectedProvider)}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-text-primary truncate">
                    {selectedProvider.id === 'cpa' && selectedProvider.name === 'CPA'
                      ? 'Claude'
                      : selectedProvider.name}
                  </div>
                  <div className="text-xs text-text-tertiary truncate mt-0.5">
                    {formatHostFromUrl(selectedProvider.baseUrl)} · Claude Code · 仅支持 Claude Code
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 relative">
                <span className="text-xs text-text-tertiary">
                  {selectedProvider.apiKey ? '已配置' : '待配置'}
                </span>
                <button
                  type="button"
                  onClick={() => onEdit(selectedProvider)}
                  className="px-3.5 py-1.5 rounded-full border border-border-default bg-surface hover:bg-surface-hover text-xs font-medium text-text-primary transition-colors cursor-pointer"
                >
                  断开
                </button>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-1.5 rounded-full hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>

                {menuOpen && (
                  <div
                    onMouseLeave={() => setMenuOpen(false)}
                    className="absolute right-0 top-full mt-1 w-40 rounded-xl bg-surface-elevated border border-border-default shadow-xl py-1 z-30 text-xs"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(selectedProvider);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-surface-hover text-text-primary cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>编辑连接与模型</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(selectedProvider);
                      }}
                      className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-accent-red/10 text-accent-red cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>删除该供应商</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 2. RemoteProviderAccessRow (允许被远程调用) */}
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <div className="text-[13px] font-semibold text-text-primary">允许被远程调用</div>
                <p className="text-xs text-text-tertiary leading-relaxed">
                  开启后，你的其他电脑和你分享的人可以用这个供应商的模型。关闭期间，已有的分享暂时不可用，不会被删除。
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => onEdit(selectedProvider)}
                  className="px-3 py-1.5 rounded-full border border-border-default bg-surface hover:bg-surface-hover text-xs text-text-primary flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>远程与分享</span>
                  <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                </button>
                <Switch
                  checked={remoteCallEnabled}
                  onCheckedChange={setRemoteCallEnabled}
                  aria-label="允许被远程调用"
                />
              </div>
            </div>

            {/* 3. Cindy UnifiedModelList */}
            <UnifiedModelList
              providerId={selectedProvider.id}
              models={selectedProvider.models || []}
              refreshing={refreshing}
              onRefresh={handleRefreshClick}
              onToggleModel={(modelId, enabled) =>
                onToggleModel?.(selectedProvider, modelId, enabled)
              }
              onBulkToggle={handleBulkToggle}
              onOpenAdvanced={() => onEdit(selectedProvider)}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8 text-xs text-text-tertiary">
            请在左侧选择或添加一个模型供应商
          </div>
        )}
      </div>
    </div>
  );
};
