/**
 * Purpose: Scope switching and search filter toolbar for SkillhubLocalPage.
 * Context: Web UI Skillhub page, supporting dialogue/bot scope selection and quick search.
 * Usage: Mounted in SkillhubLocalPage header.
 * Prerequisites: React, lucide-react icons, mock bot/skill types.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Search, Folder, ChevronDown, Check, Users } from 'lucide-react';
import { BotItem } from '@/mock/bots';

export interface FolderChoice {
  id: string;
  name: string;
  path: string;
  label: string;
}

export const AVAILABLE_FOLDERS: FolderChoice[] = [
  { id: 'all', name: 'All Scopes', path: 'All', label: '全部技能 (Global + Project)' },
  { id: 'global', name: 'Global', path: '/Users/xr/.agents/skills', label: 'Global 全局库 (~/.agents/skills)' },
  { id: 'workspace', name: 'Customizations', path: '/Users/xr/IDEA.localized/multiagent-orchestration/Customizations/skills', label: '项目定制技能 (Customizations/skills)' },
];

export interface SkillScopeToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  scopeMode: 'dialogue' | 'bot';
  onScopeModeChange: (mode: 'dialogue' | 'bot') => void;
  selectedFolder: FolderChoice;
  onSelectFolder: (folder: FolderChoice) => void;
  selectedBot: BotItem;
  onSelectBot: (bot: BotItem) => void;
  bots: BotItem[];
}

export function SkillScopeToolbar({
  searchQuery,
  onSearchChange,
  scopeMode,
  onScopeModeChange,
  selectedFolder,
  onSelectFolder,
  selectedBot,
  onSelectBot,
  bots,
}: SkillScopeToolbarProps) {
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isBotDropdownOpen, setIsBotDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const botDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
      if (botDropdownRef.current && !botDropdownRef.current.contains(event.target as Node)) {
        setIsBotDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-3">
      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search customizations, plugins, skills..."
          className="w-full pl-10 pr-4 py-2.5 text-xs bg-surface-elevated/70 hover:bg-surface-elevated border border-border-default rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-all shadow-xs"
        />
      </div>

      {/* [对话: 文件夹 ｜ 伙伴] 作用域切换条 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 bg-surface-elevated/50 border border-border-default rounded-xl text-xs">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* 对话 ｜ 伙伴 联合切换胶囊 */}
          <div className="flex items-center bg-surface-chip p-0.5 rounded-xl border border-border-subtle shadow-xs">
            {/* 1. 对话端 */}
            {scopeMode === 'dialogue' ? (
              <div className="relative" ref={folderDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-surface-elevated text-text-primary font-medium rounded-lg shadow-xs text-xs cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <Folder className="w-3.5 h-3.5 text-accent-amber shrink-0" />
                  <span>对话:</span>
                  <span className="font-mono text-text-primary font-semibold">{selectedFolder.name}</span>
                  <ChevronDown className="w-3 h-3 text-text-tertiary" />
                </button>

                {/* 文件夹下拉选择框 */}
                {isFolderDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-80 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-2 z-50 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                      选择对话绑定的生效文件夹
                    </div>
                    {AVAILABLE_FOLDERS.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => {
                          onSelectFolder(f);
                          setIsFolderDropdownOpen(false);
                        }}
                        className={`p-2 rounded-lg cursor-pointer transition-colors text-xs flex items-center justify-between ${
                          selectedFolder.id === f.id
                            ? 'bg-surface-chip text-text-primary font-semibold'
                            : 'hover:bg-surface-hover text-text-secondary'
                        }`}
                      >
                        <div className="flex flex-col truncate">
                          <span className="font-mono text-text-primary font-medium">{f.name}</span>
                          <span className="text-[10px] text-text-tertiary">{f.path}</span>
                        </div>
                        {selectedFolder.id === f.id && (
                          <Check className="w-3.5 h-3.5 text-accent-blue shrink-0 ml-2" />
                        )}
                      </div>
                    ))}
                    <div className="pt-1.5 border-t border-border-subtle flex items-center justify-between px-2 text-[11px]">
                      <span className="text-text-tertiary">自定义本地绝对路径...</span>
                      <button
                        type="button"
                        onClick={() => {
                          const path = prompt('请输入文件夹绝对路径:', selectedFolder.path);
                          if (path) {
                            onSelectFolder({
                              id: 'custom',
                              name: path.split('/').pop() || path,
                              path,
                              label: path,
                            });
                            setIsFolderDropdownOpen(false);
                          }
                        }}
                        className="text-accent-blue hover:underline"
                      >
                        输入路径
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onScopeModeChange('dialogue')}
                className="flex items-center gap-1.5 px-3 py-1 text-text-secondary hover:text-text-primary text-xs transition-colors cursor-pointer"
              >
                <Folder className="w-3.5 h-3.5 text-text-tertiary" />
                <span>对话</span>
              </button>
            )}

            {/* 中间分割线 */}
            <span className="text-text-tertiary opacity-40 px-1 select-none">｜</span>

            {/* 2. 伙伴端 */}
            {scopeMode === 'bot' ? (
              <div className="relative" ref={botDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsBotDropdownOpen(!isBotDropdownOpen)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-surface-elevated text-text-primary font-medium rounded-lg shadow-xs text-xs cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <img
                    src={selectedBot.avatar}
                    alt=""
                    className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                  />
                  <span>伙伴:</span>
                  <span className="font-semibold text-text-primary">{selectedBot.name}</span>
                  <ChevronDown className="w-3 h-3 text-text-tertiary" />
                </button>

                {/* 伙伴下拉选择框 */}
                {isBotDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1.5 w-72 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-2 z-50 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                      选择切换具体伙伴角色
                    </div>
                    {bots.map((bot) => (
                      <div
                        key={bot.id}
                        onClick={() => {
                          onSelectBot(bot);
                          setIsBotDropdownOpen(false);
                        }}
                        className={`p-2 rounded-lg cursor-pointer transition-colors text-xs flex items-center justify-between ${
                          selectedBot.id === bot.id
                            ? 'bg-surface-chip text-text-primary font-semibold'
                            : 'hover:bg-surface-hover text-text-secondary'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <img
                            src={bot.avatar}
                            alt=""
                            className="w-6 h-6 rounded-full object-cover border border-border-default shrink-0"
                          />
                          <div className="flex flex-col truncate">
                            <span className="font-semibold text-text-primary">{bot.name}</span>
                            <span className="text-[10px] text-text-tertiary">{bot.title}</span>
                          </div>
                        </div>
                        {selectedBot.id === bot.id && (
                          <Check className="w-3.5 h-3.5 text-accent-purple shrink-0 ml-2" />
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onScopeModeChange('bot')}
                className="flex items-center gap-1.5 px-3 py-1 text-text-secondary hover:text-text-primary text-xs transition-colors cursor-pointer"
              >
                <Users className="w-3.5 h-3.5 text-text-tertiary" />
                <span>伙伴</span>
              </button>
            )}
          </div>

          {/* 动态描述路径或伙伴详情 */}
          {scopeMode === 'dialogue' ? (
            <span className="text-text-tertiary font-mono text-[11px] truncate max-w-sm hidden sm:inline">
              {selectedFolder.path}
            </span>
          ) : (
            <span className="text-text-tertiary text-[11px] truncate max-w-sm hidden sm:inline">
              {selectedBot.title} · {selectedBot.model}
            </span>
          )}
        </div>

        {/* 状态徽章 */}
        <div className="flex items-center gap-2 text-text-tertiary text-[11px]">
          {scopeMode === 'dialogue' ? (
            <span className="font-mono text-[10px] bg-surface-chip px-2 py-0.5 rounded text-accent-green font-medium">
              WORKSPACE ACTIVE
            </span>
          ) : (
            <span className="font-mono text-[10px] bg-purple-500/10 px-2 py-0.5 rounded text-accent-purple font-medium">
              BOT BOUND
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
