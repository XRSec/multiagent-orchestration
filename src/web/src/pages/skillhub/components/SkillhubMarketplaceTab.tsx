/**
 * Purpose: Marketplace tab view for browsing and installing plugins and skills.
 * Context: Skillhub page public ecosystem tab (plugins and skill packs).
 * Usage: Rendered when topSegment === 'marketplace' in SkillhubLocalPage.
 * Prerequisites: React, lucide-react, mock skills and plugins data.
 */

import React from 'react';
import { Puzzle, Zap, Download, Check } from 'lucide-react';
import { SkillItem } from '@/mock/skills';

export interface MarketPluginItem {
  id: string;
  name: string;
  author: string;
  category: string;
  downloads: string;
  description: string;
}

export interface SkillhubMarketplaceTabProps {
  marketCategory: 'all' | 'plugins' | 'skills';
  onMarketCategoryChange: (cat: 'all' | 'plugins' | 'skills') => void;
  marketPlugins: MarketPluginItem[];
  installedMarketItems: Record<string, boolean>;
  onInstallMarketItem: (id: string) => void;
  popularSkills: SkillItem[];
  onSkillClick: (skill: SkillItem) => void;
}

export function SkillhubMarketplaceTab({
  marketCategory,
  onMarketCategoryChange,
  marketPlugins,
  installedMarketItems,
  onInstallMarketItem,
  popularSkills,
  onSkillClick,
}: SkillhubMarketplaceTabProps) {
  return (
    <div className="space-y-6">
      {/* Sub-filter tabs */}
      <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => onMarketCategoryChange('all')}
            className={`px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
              marketCategory === 'all'
                ? 'bg-surface-chip text-text-primary font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            全部生态 (All)
          </button>
          <button
            type="button"
            onClick={() => onMarketCategoryChange('plugins')}
            className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              marketCategory === 'plugins'
                ? 'bg-surface-chip text-text-primary font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Puzzle className="w-3.5 h-3.5 text-accent-red" />
            <span>插件市场 (Plugins)</span>
          </button>
          <button
            type="button"
            onClick={() => onMarketCategoryChange('skills')}
            className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              marketCategory === 'skills'
                ? 'bg-surface-chip text-text-primary font-semibold'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-accent-green" />
            <span>技能生态 (Skills)</span>
          </button>
        </div>

        <span className="text-[11px] text-text-tertiary">
          来源：SkillHub & Ghost 官方生态源
        </span>
      </div>

      {/* 1. Plugins in Marketplace */}
      {(marketCategory === 'all' || marketCategory === 'plugins') && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Puzzle className="w-3.5 h-3.5 text-accent-red" />
            <span>推荐插件生态 (Ghost Plugins)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {marketPlugins.map((plugin) => (
              <div
                key={plugin.id}
                className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-xs flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-text-primary">
                      {plugin.name}
                    </span>
                    <span className="text-[10px] bg-surface-chip text-text-secondary px-2 py-0.5 rounded-full font-mono">
                      {plugin.category}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-tertiary mt-0.5">
                    作者: {plugin.author} · 下载: {plugin.downloads}
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mt-1.5 line-clamp-2">
                    {plugin.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-[10px] font-mono text-text-tertiary">
                    ID: {plugin.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => onInstallMarketItem(plugin.id)}
                    disabled={installedMarketItems[plugin.id]}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                      installedMarketItems[plugin.id]
                        ? 'bg-surface-chip text-text-tertiary cursor-not-allowed'
                        : 'bg-accent-cta text-accent-cta-fg hover:bg-accent-hover'
                    }`}
                  >
                    {installedMarketItems[plugin.id] ? (
                      <>
                        <Check className="w-3 h-3 text-accent-green" />
                        <span>已安装</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        <span>安装到 Global</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. Skills in Marketplace */}
      {(marketCategory === 'all' || marketCategory === 'skills') && (
        <div className="space-y-3">
          <div className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-accent-green" />
            <span>热门技能包 (Skills & Rules)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {popularSkills.slice(0, 6).map((skill) => (
              <div
                key={skill.id}
                className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-xs flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold font-mono text-text-primary">
                      /{skill.name}
                    </span>
                    <span className="text-[10px] bg-surface-chip text-text-secondary px-2 py-0.5 rounded-full font-mono">
                      v{skill.version || '1.0.0'}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed mt-1.5 line-clamp-2">
                    {skill.description}
                  </p>
                </div>
                <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                  <span className="text-[11px] text-text-tertiary font-mono">
                    {skill.scope.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => onSkillClick(skill)}
                    className="px-3 py-1 bg-surface hover:bg-surface-hover border border-border-default rounded-lg text-xs font-medium text-text-primary transition-colors cursor-pointer"
                  >
                    查看定义
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
