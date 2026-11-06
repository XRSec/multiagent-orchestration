/**
 * Purpose: Top-Right project & branch selector popovers for ComposerCard.
 * Context: Extracted from ComposerCard to maintain <600 lines limit per AST standards.
 * Usage: <ComposerProjectAndBranchMenu ... />
 */

import React, { useState } from 'react';
import {
  Folder,
  GitBranch,
  ChevronDown,
  Search,
  MessageSquare,
  FolderPlus,
  Layers,
} from 'lucide-react';

export interface ComposerProjectItem {
  name: string;
  path: string;
}

export interface ComposerBranchItem {
  name: string;
  subtitle: string;
}

interface ComposerProjectAndBranchMenuProps {
  isDialogueMode: boolean;
  setIsDialogueMode: (v: boolean) => void;
  selectedProject: string;
  setSelectedProject: (v: string) => void;
  filteredProjects: ComposerProjectItem[];
  projectSearch: string;
  setProjectSearch: (v: string) => void;
  selectedBranch: string;
  setSelectedBranch: (v: string) => void;
  filteredBranches: ComposerBranchItem[];
  branchSearch: string;
  setBranchSearch: (v: string) => void;
  worktreeEnabled: boolean;
  setWorktreeEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  onCloseOtherMenus?: () => void;
}

export function ComposerProjectAndBranchMenu({
  isDialogueMode,
  setIsDialogueMode,
  selectedProject,
  setSelectedProject,
  filteredProjects,
  projectSearch,
  setProjectSearch,
  selectedBranch,
  setSelectedBranch,
  filteredBranches,
  branchSearch,
  setBranchSearch,
  worktreeEnabled,
  setWorktreeEnabled,
  onCloseOtherMenus,
}: ComposerProjectAndBranchMenuProps) {
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2 pb-2 mb-2 border-b border-border-subtle text-xs">
      {/* 1. 项目/文件夹选择器 */}
      <div className="relative">
        <button
          onClick={() => {
            setProjectMenuOpen(!projectMenuOpen);
            setBranchMenuOpen(false);
            onCloseOtherMenus?.();
          }}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-primary text-xs font-medium border border-border-subtle transition-colors cursor-pointer"
        >
          {isDialogueMode ? (
            <MessageSquare className="w-3.5 h-3.5 text-accent-blue" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-text-secondary" />
          )}
          <span className="truncate max-w-[170px]">
            {isDialogueMode ? '对话' : selectedProject}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
              projectMenuOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {projectMenuOpen && (
          <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2 z-50 text-xs">
            <div className="px-2 py-1 text-[11px] text-text-tertiary">对话或选择项目</div>

            <div
              onClick={() => {
                setIsDialogueMode(true);
                setProjectMenuOpen(false);
              }}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                isDialogueMode
                  ? 'bg-surface-chip text-text-primary font-semibold'
                  : 'hover:bg-surface-hover text-text-primary'
              }`}
            >
              <MessageSquare className="w-4 h-4 text-text-secondary" />
              <span>对话</span>
            </div>

            <div className="px-2 pt-2 pb-1 text-[11px] text-text-tertiary">项目</div>

            <div className="px-1 mb-1.5">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 absolute left-2.5 text-text-tertiary" />
                <input
                  type="text"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="搜索项目"
                  className="w-full pl-8 pr-2 py-1 text-xs bg-surface border border-accent-blue rounded-full text-text-primary placeholder:text-text-tertiary focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredProjects.map((p) => (
                <div
                  key={p.name}
                  onClick={() => {
                    setSelectedProject(p.name);
                    setIsDialogueMode(false);
                    setProjectMenuOpen(false);
                  }}
                  className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors ${
                    !isDialogueMode && selectedProject === p.name
                      ? 'bg-surface-chip text-text-primary font-semibold'
                      : 'hover:bg-surface-hover text-text-primary'
                  }`}
                >
                  <Folder className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate font-medium">{p.name}</div>
                    <div className="text-[10px] text-text-tertiary truncate font-mono">{p.path}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="h-px bg-border-subtle my-1.5" />

            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary">
              <FolderPlus className="w-4 h-4 text-text-secondary" />
              <span>选择其他项目文件夹</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. 分支选择器 */}
      {!isDialogueMode && (
        <div className="relative">
          <button
            onClick={() => {
              setBranchMenuOpen(!branchMenuOpen);
              setProjectMenuOpen(false);
              onCloseOtherMenus?.();
            }}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-primary text-xs font-medium border border-border-subtle transition-colors cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5 text-text-secondary" />
            <span className="font-mono">{selectedBranch}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
                branchMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {branchMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2 z-50 text-xs">
              <div className="mb-2">
                <div className="relative flex items-center">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 text-text-tertiary" />
                  <input
                    type="text"
                    value={branchSearch}
                    onChange={(e) => setBranchSearch(e.target.value)}
                    placeholder="搜索分支"
                    className="w-full pl-8 pr-2 py-1 text-xs bg-surface border border-accent-blue rounded-full text-text-primary placeholder:text-text-tertiary focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                {filteredBranches.map((b) => (
                  <div
                    key={b.name}
                    onClick={() => {
                      setSelectedBranch(b.name);
                      setBranchMenuOpen(false);
                    }}
                    className={`p-2.5 rounded-xl cursor-pointer transition-colors ${
                      selectedBranch === b.name
                        ? 'bg-surface-chip text-text-primary font-semibold'
                        : 'hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="text-xs font-mono font-bold text-text-primary">{b.name}</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">{b.subtitle}</div>
                  </div>
                ))}
              </div>

              <div className="h-px bg-border-subtle my-2" />

              <div
                onClick={() => setWorktreeEnabled((prev) => !prev)}
                className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-hover cursor-pointer"
              >
                <div className="space-y-0.5">
                  <div className="font-semibold text-text-primary">在新的工作区运行</div>
                  <div className="text-[11px] text-text-tertiary">通过 git worktree 在独立目录执行</div>
                </div>
                <div
                  className={`w-8 h-4.5 rounded-full transition-colors relative p-0.5 ${
                    worktreeEnabled ? 'bg-accent-blue' : 'bg-surface-chip'
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                      worktreeEnabled ? 'translate-x-3.5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Worktree 独立运行徽章 */}
      {worktreeEnabled && (
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent-blue/10 text-accent-blue border border-accent-blue/20 font-medium">
          <Layers className="w-3 h-3" />
          <span>Worktree</span>
        </div>
      )}
    </div>
  );
}
