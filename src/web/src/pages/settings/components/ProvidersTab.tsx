/**
 * Purpose: Model Providers & Gateway API configuration tab component.
 * Context: Displays configured providers and allows editing Base URL & API Key with persistence.
 * Usage: Mounted in SettingsPage for 'providers' tab.
 * Prerequisites: React 19, Lucide icons.
 */

import React from 'react';

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
  fallbackProviders: any[];
  editingProvider: ProviderItem | null;
  editName: string;
  editBaseUrl: string;
  editApiKey: string;
  savingProvider: boolean;
  onStartEdit: (p: ProviderItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onChangeName: (v: string) => void;
  onChangeBaseUrl: (v: string) => void;
  onChangeApiKey: (v: string) => void;
}

export const ProvidersTab: React.FC<ProvidersTabProps> = ({
  providers,
  fallbackProviders,
  editingProvider,
  editName,
  editBaseUrl,
  editApiKey,
  savingProvider,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onChangeName,
  onChangeBaseUrl,
  onChangeApiKey,
}) => {
  const displayList = providers.length > 0 ? providers : fallbackProviders;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-text-primary">模型供应商与接入</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
              实时持久化生效
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">已配置的大模型服务网关、Base URL 与认证凭据</p>
        </div>
      </div>

      <div className="space-y-3">
        {displayList.map((p) => (
          <div
            key={p.id}
            className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-sm space-y-3 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl p-1.5 bg-surface rounded-xl border border-border-subtle">{p.icon || '⚡'}</span>
                <div>
                  <div className="font-bold text-text-primary">{p.name}</div>
                  <div className="text-[10px] text-text-tertiary font-mono">{p.baseUrl || '官方默认通道'}</div>
                </div>
              </div>
              <span className="text-accent-green bg-accent-green/10 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold">
                CONNECTED
              </span>
            </div>

            <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-text-tertiary">可用模型:</span>
                {p.models.map((m: any, idx: number) => (
                  <span
                    key={idx}
                    className="bg-surface font-mono text-text-secondary px-2 py-0.5 rounded-md border border-border-subtle text-[10px]"
                  >
                    {typeof m === 'string' ? m : m.name || m.id}
                  </span>
                ))}
              </div>
              <button
                onClick={() => onStartEdit(p)}
                className="px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border-default rounded-lg text-text-secondary hover:text-text-primary transition-colors text-[11px] cursor-pointer"
              >
                编辑 API 配置
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Provider Edit Modal */}
      {editingProvider && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-surface-elevated border border-border-default rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h3 className="font-bold text-sm text-text-primary">编辑网关与 API：{editingProvider.name}</h3>
              <button
                onClick={onCancelEdit}
                className="text-text-tertiary hover:text-text-primary p-1 rounded-lg hover:bg-surface"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-text-secondary mb-1">网关显示名称</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => onChangeName(e.target.value)}
                  className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="block text-[11px] text-text-secondary mb-1">API Base URL (端点根路径)</label>
                <input
                  type="text"
                  value={editBaseUrl}
                  onChange={(e) => onChangeBaseUrl(e.target.value)}
                  placeholder="例如: https://api.anthropic.com 或网关地址"
                  className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-blue"
                />
              </div>

              <div>
                <label className="block text-[11px] text-text-secondary mb-1">API Key / Token (留空则沿用环境变量)</label>
                <input
                  type="password"
                  value={editApiKey}
                  onChange={(e) => onChangeApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-blue"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-subtle">
              <button
                onClick={onCancelEdit}
                className="px-3 py-1.5 rounded-xl border border-border-default text-text-secondary hover:bg-surface cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={onSaveEdit}
                disabled={savingProvider}
                className="px-4 py-1.5 rounded-xl bg-accent-blue text-white font-semibold hover:bg-accent-blue/90 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {savingProvider ? '保存中...' : '保存网关配置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
