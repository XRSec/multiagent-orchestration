/**
 * Purpose: Collapsible section for displaying installed plugins and their toggle states.
 * Context: Installed tab view of SkillhubLocalPage.
 * Usage: Rendered inside the installed tab of SkillhubLocalPage.
 * Prerequisites: React, lucide-react, plugin mock definitions.
 */

import React from 'react';
import { ChevronDown, Plus, MoreVertical } from 'lucide-react';
import { MOCK_PLUGINS } from '@/mock/plugins';

export interface InstalledPluginsSectionProps {
  plugins: typeof MOCK_PLUGINS;
  pluginsEnabled: Record<string, boolean>;
  pluginsCollapsed: boolean;
  onToggleCollapse: () => void;
  onTogglePlugin: (id: string, e: React.MouseEvent) => void;
  onNavigateMarketplace: () => void;
}

export function InstalledPluginsSection({
  plugins,
  pluginsEnabled,
  pluginsCollapsed,
  onToggleCollapse,
  onTogglePlugin,
  onNavigateMarketplace,
}: InstalledPluginsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <span>Plugins</span>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
            {plugins.length}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              pluginsCollapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        <button
          type="button"
          onClick={onNavigateMarketplace}
          className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors font-medium cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Create</span>
        </button>
      </div>

      {!pluginsCollapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {plugins.slice(0, 2).map((plugin) => {
            const isPluginOn = pluginsEnabled[plugin.id] !== false;
            return (
              <div
                key={plugin.id}
                className={`p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:shadow-sm transition-all ${
                  !isPluginOn ? 'opacity-55' : ''
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Square Avatar with Capital Initial (Antigravity Style) */}
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0 shadow-xs ${
                      plugin.avatarBg || 'bg-[#9E5A54] text-white'
                    }`}
                  >
                    {plugin.avatarChar || plugin.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-text-primary truncate flex items-center gap-1.5">
                      <span>{plugin.id}</span>
                      {!isPluginOn && (
                        <span className="text-[10px] text-text-tertiary font-normal">
                          (已关闭)
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-secondary truncate mt-0.5">
                      {plugin.description}
                    </div>
                  </div>
                </div>

                {/* Toggle Switch + More Button */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => onTogglePlugin(plugin.id, e)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                      isPluginOn
                        ? 'bg-[#3B82F6]'
                        : 'bg-surface-chip border border-border-default'
                    }`}
                    title={isPluginOn ? '已启用 (点击关闭)' : '已关闭 (点击开启)'}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                        isPluginOn ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <MoreVertical className="w-4 h-4" />
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
