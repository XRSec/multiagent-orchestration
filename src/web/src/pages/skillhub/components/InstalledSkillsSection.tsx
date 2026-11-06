/**
 * Purpose: Collapsible section for managing installed Skills & Rules with filter and pagination.
 * Context: Installed tab view of SkillhubLocalPage.
 * Usage: Rendered inside the installed tab of SkillhubLocalPage.
 * Prerequisites: React, lucide-react, skill types and mocks.
 */

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, SlidersHorizontal, Check } from 'lucide-react';
import { SkillItem } from '@/mock/skills';

export type FilterSelection = 'All' | 'Skills' | 'Rules' | 'Built In' | 'Global';

export interface InstalledSkillsSectionProps {
  filteredSkillsCount: number;
  skillsCollapsed: boolean;
  onToggleCollapse: () => void;
  onOpenImportModal: () => void;
  activeFilter: FilterSelection;
  onSelectFilter: (filter: FilterSelection) => void;
  visibleSkills: SkillItem[];
  skillsEnabled: Record<string, boolean>;
  onToggleSkill: (id: string, e: React.MouseEvent) => void;
  onSkillClick: (skill: SkillItem) => void;
  expandedSkillsList: boolean;
  remainingCount: number;
  onToggleExpand: () => void;
}

export function InstalledSkillsSection({
  filteredSkillsCount,
  skillsCollapsed,
  onToggleCollapse,
  onOpenImportModal,
  activeFilter,
  onSelectFilter,
  visibleSkills,
  skillsEnabled,
  onToggleSkill,
  onSkillClick,
  expandedSkillsList,
  remainingCount,
  onToggleExpand,
}: InstalledSkillsSectionProps) {
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <span>Skills & Rules</span>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
            {filteredSkillsCount}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              skillsCollapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenImportModal}
            className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 rounded-lg transition-colors font-medium border border-amber-500/30 cursor-pointer shadow-xs"
            title="导入自定义 Skill 并软链接至 ~/.agents/skills/"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>导入 Skill</span>
          </button>

          {/* Scope & Type Filter Dropdown (1:1 还原用户 Image 1 截图) */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              type="button"
              onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-lg hover:bg-surface-hover transition-colors font-medium border border-border-subtle cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-text-tertiary" />
              <span>{activeFilter}</span>
            </button>

            {/* Filter Dropdown Popover */}
            {isFilterDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1.5 z-50 text-xs">
                {/* All option */}
                <div
                  onClick={() => {
                    onSelectFilter('All');
                    setIsFilterDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary font-medium"
                >
                  <span>All</span>
                  {activeFilter === 'All' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                </div>

                <div className="h-px bg-border-subtle my-1" />

                {/* Section: Type */}
                <div className="px-3 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Type
                </div>
                <div
                  onClick={() => {
                    onSelectFilter('Skills');
                    setIsFilterDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                >
                  <span>Skills</span>
                  {activeFilter === 'Skills' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                </div>
                <div
                  onClick={() => {
                    onSelectFilter('Rules');
                    setIsFilterDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                >
                  <span>Rules</span>
                  {activeFilter === 'Rules' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                </div>

                <div className="h-px bg-border-subtle my-1" />

                {/* Section: Source */}
                <div className="px-3 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  Source
                </div>
                <div
                  onClick={() => {
                    onSelectFilter('Built In');
                    setIsFilterDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                >
                  <span>Built In</span>
                  {activeFilter === 'Built In' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                </div>
                <div
                  onClick={() => {
                    onSelectFilter('Global');
                    setIsFilterDropdownOpen(false);
                  }}
                  className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                >
                  <span>Global</span>
                  {activeFilter === 'Global' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!skillsCollapsed && (
        <div className="bg-surface-elevated border border-border-default rounded-2xl divide-y divide-border-subtle shadow-xs overflow-hidden">
          {visibleSkills.map((skill) => {
            const isSkillOn = skillsEnabled[skill.id] !== false;
            return (
              <div
                key={skill.id}
                onClick={() => onSkillClick(skill)}
                className={`px-4 py-2.5 flex items-center gap-3 hover:bg-surface-hover/70 cursor-pointer transition-colors text-xs group ${
                  !isSkillOn ? 'opacity-55' : ''
                }`}
              >
                {/* Skill Slash Command Name */}
                <span className="font-mono font-bold text-text-primary shrink-0 text-[12px] min-w-[170px]">
                  /{skill.name}
                </span>

                {/* Scope Pill Badge: [ Built In | Global ] */}
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 font-sans ${
                    skill.scope === 'builtin'
                      ? 'bg-surface-chip text-text-secondary border border-border-subtle'
                      : 'bg-blue-500/10 text-accent-blue border border-blue-500/20'
                  }`}
                >
                  {skill.scope === 'builtin' ? 'Built In' : 'Global'}
                </span>

                {/* Description */}
                <span
                  className={`truncate flex-1 text-[11px] leading-relaxed ${
                    !isSkillOn ? 'text-text-disabled line-through' : 'text-text-secondary'
                  }`}
                >
                  {skill.description}
                </span>

                {/* Skill Toggle Switch */}
                <button
                  type="button"
                  onClick={(e) => onToggleSkill(skill.id, e)}
                  className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center shrink-0 cursor-pointer ${
                    isSkillOn
                      ? 'bg-[#3B82F6]'
                      : 'bg-surface-chip border border-border-default'
                  }`}
                  title={isSkillOn ? '已启用 (点击关闭)' : '已关闭 (点击开启)'}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-xs ${
                      isSkillOn ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}

          {/* + See N more toggle */}
          {!expandedSkillsList && remainingCount > 0 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="w-full px-4 py-2.5 text-center text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium cursor-pointer"
            >
              + See {remainingCount} more
            </button>
          )}

          {expandedSkillsList && remainingCount > 0 && (
            <button
              type="button"
              onClick={onToggleExpand}
              className="w-full px-4 py-2.5 text-center text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium cursor-pointer"
            >
              收起列表
            </button>
          )}
        </div>
      )}
    </div>
  );
}
