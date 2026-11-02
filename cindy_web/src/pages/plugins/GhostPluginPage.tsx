import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Puzzle,
  Check,
  Search,
  ExternalLink,
  Plus,
  Terminal,
  Code2,
  Shield,
  Layers,
  ArrowRight,
  Sparkles,
  Upload,
  Globe,
  Sliders,
} from 'lucide-react';
import { MOCK_PLUGINS, GhostPluginItem } from '@/mock/plugins';

export function GhostPluginPage() {
  const navigate = useNavigate();
  const [plugins, setPlugins] = useState(MOCK_PLUGINS);
  const [activeTab, setActiveTab] = useState<'installed' | 'market' | 'my-publishes' | 'forge'>('installed');
  const [search, setSearch] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<GhostPluginItem>(MOCK_PLUGINS[0]);

  const togglePlugin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlugins((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, status: p.status === 'enabled' ? 'disabled' : 'enabled' }
          : p
      )
    );
  };

  const filteredPlugins = plugins.filter(
    (p) =>
      (activeTab === 'installed' ? p.isInstalled : true) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface p-6 space-y-6">
      {/* 1. Header & Official Segmented Tab Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-border-default shrink-0">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <Puzzle className="w-5 h-5 text-accent-red" />
            <span>Ghost 插件管理与能力中心 (Plugins)</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            通过 .cindy 原生能力包扩展 Cindy 工具生态，集成外部平台与自动化能力
          </p>
        </div>

        {/* Tab Buttons */}
        <div className="flex bg-surface-chip p-0.5 rounded-xl border border-border-default">
          <button
            onClick={() => setActiveTab('installed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'installed'
                ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            已安装 ({plugins.filter((p) => p.isInstalled).length})
          </button>
          <button
            onClick={() => setActiveTab('market')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'market'
                ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            插件市场
          </button>
          <button
            onClick={() => setActiveTab('my-publishes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'my-publishes'
                ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            我的投稿
          </button>
          <button
            onClick={() => setActiveTab('forge')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'forge'
                ? 'bg-surface-elevated text-text-primary shadow-sm font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            开发者 Forge
          </button>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="flex items-center justify-between gap-4 shrink-0">
        <div className="relative w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索插件 ID、名称或暴露工具..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-surface-elevated border border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-blue"
          />
        </div>

        <button className="flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border-default rounded-xl text-xs font-medium text-text-primary transition-colors">
          <Upload className="w-3.5 h-3.5" />
          <span>从本地文件安装 (.cindy)</span>
        </button>
      </div>

      {/* 3. Split Layout: Plugins List (Left) + Detailed Plugin Panel (Right) */}
      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        {/* Left: Plugin Cards Grid / List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {filteredPlugins.map((plugin) => {
            const isSelected = selectedPlugin.id === plugin.id;
            return (
              <div
                key={plugin.id}
                onClick={() => setSelectedPlugin(plugin)}
                className={`p-4 bg-surface-elevated border rounded-2xl cursor-pointer transition-all space-y-3 shadow-sm ${
                  isSelected
                    ? 'border-accent-red shadow-md'
                    : 'border-border-default hover:border-text-tertiary'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl p-2 bg-surface rounded-xl border border-border-subtle shrink-0">
                      {plugin.icon}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-text-primary">{plugin.name}</h3>
                        <span className="text-[10px] font-mono text-text-tertiary">
                          v{plugin.version}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-tertiary font-mono">
                        {plugin.id} · {plugin.author}
                      </div>
                    </div>
                  </div>

                  {plugin.isInstalled && (
                    <button
                      onClick={(e) => togglePlugin(plugin.id, e)}
                      title={plugin.status === 'enabled' ? '点击禁用插件' : '点击启用插件'}
                      className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
                        plugin.status === 'enabled' ? 'bg-accent-green' : 'bg-surface-chip'
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          plugin.status === 'enabled' ? 'translate-x-4' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  )}
                </div>

                <p className="text-xs text-text-secondary leading-relaxed line-clamp-2">
                  {plugin.description}
                </p>

                {/* Badges */}
                <div className="flex items-center justify-between text-[10px] text-text-tertiary pt-2 border-t border-border-subtle">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-surface px-2 py-0.5 rounded border border-border-subtle">
                      {plugin.category}
                    </span>
                    <span>{plugin.toolsProvided.length} 个沙箱工具</span>
                  </div>
                  {plugin.hasMainView && (
                    <span className="text-accent-blue font-medium flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      <span>独立主视图</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Right: Selected Plugin Detail View */}
        {selectedPlugin && (
          <div className="w-96 bg-surface-elevated border border-border-default rounded-2xl p-5 shadow-sm flex flex-col space-y-4 overflow-y-auto shrink-0 text-xs">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-border-subtle">
              <div className="flex items-center gap-3">
                <span className="text-3xl p-2.5 bg-surface rounded-2xl border border-border-subtle">
                  {selectedPlugin.icon}
                </span>
                <div>
                  <h2 className="text-base font-bold text-text-primary">{selectedPlugin.name}</h2>
                  <div className="text-[11px] text-text-tertiary font-mono">
                    {selectedPlugin.id} (v{selectedPlugin.version})
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                插件功能描述
              </div>
              <p className="text-text-secondary leading-relaxed">
                {selectedPlugin.description}
              </p>
            </div>

            {/* Permissions */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                权限访问申请
              </div>
              <div className="bg-surface rounded-xl border border-border-default p-2.5 space-y-1">
                {selectedPlugin.permissions.map((perm, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px] text-text-secondary">
                    <Shield className="w-3.5 h-3.5 text-accent-green shrink-0" />
                    <span>{perm}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tools list */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                暴露给 Agent 的沙箱工具 ({selectedPlugin.toolsProvided.length})
              </div>
              <div className="bg-surface rounded-xl border border-border-default p-2.5 space-y-1.5">
                {selectedPlugin.toolsProvided.map((tool, idx) => (
                  <div key={idx} className="flex items-center gap-2 font-mono text-[11px] text-text-primary">
                    <Terminal className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                    <span>{tool}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            {selectedPlugin.hasMainView && (
              <div className="pt-2">
                <button
                  onClick={() => navigate(`/apps/${selectedPlugin.id}`)}
                  className="w-full py-2 bg-accent-cta text-accent-cta-fg rounded-xl font-semibold hover:bg-accent-hover transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>打开 MCP Apps 交互视图</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
