/**
 * Purpose: Unified Composer input card with runtime models, effort, permissions, and command menus.
 * Context: Adheres strictly to Cindy design and <600 lines limit (Script Standards).
 * Usage: <ComposerCard prompt={...} onPromptChange={...} onSend={...} isNewChat={...} />
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  Paperclip,
  Mic,
  ArrowUp,
  Shield,
  AlertTriangle,
  Lock,
  ChevronDown,
  Plus,
  Github,
  Command,
  Puzzle,
  Target,
  ListTodo,
  Users,
  Sparkles,
  FileCode,
  X,
} from 'lucide-react';
import { SlashCommandMenu, SlashCommand } from './SlashCommandMenu';
import { ComposerPermissionMenu, PermissionMode } from './ComposerPermissionMenu';
import {
  ComposerProjectAndBranchMenu,
  ComposerProjectItem,
  ComposerBranchItem,
} from './ComposerProjectAndBranchMenu';
import { ModelAndEffortPicker } from './ModelAndEffortPicker';

interface ComposerCardProps {
  prompt: string;
  onPromptChange: (val: string) => void;
  onSend: () => void;
  isNewChat?: boolean;
  onSelectSlashCommand?: (cmd: SlashCommand) => void;
  placeholder?: string;
}

export function ComposerCard({
  prompt,
  onPromptChange,
  onSend,
  isNewChat = false,
  onSelectSlashCommand,
  placeholder = '描述任务或提出问题...',
}: ComposerCardProps) {
  // Top-Right Dropdowns State
  const [selectedProject, setSelectedProject] = useState<string>('multiagent-orchestration');
  const [isDialogueMode, setIsDialogueMode] = useState<boolean>(false);
  const [projectSearch, setProjectSearch] = useState('');

  const [selectedBranch, setSelectedBranch] = useState('main');
  const [branchSearch, setBranchSearch] = useState('');
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);

  // Bottom Toolbar States
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<'bypass' | 'auto' | 'ask'>('bypass');
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);

  // Model & Effort (由 ModelAndEffortPicker 统一管理)
  const [model, setModel] = useState('claude-fable-5[1M]');
  const [effort, setEffort] = useState('max');

  // Context attachments (files / docs)
  const [attachments, setAttachments] = useState<string[]>([]);

  // Slash command trigger
  const showSlashMenu = prompt.startsWith('/') && !prompt.includes(' ');

  // Projects list
  const projects: ComposerProjectItem[] = [
    { name: 'multiagent-orchestration', path: '~/IDEA.localized/multiagent-orchestration' },
    { name: 'cindy', path: '~/IDEA.localized/cindy' },
    { name: 'lead-orchestrator', path: '~/.multiagent-orchestration/partners/lead-orchestrator' },
    { name: 'm1-orchestrator', path: '~/IDEA.localized/m1-orchestrator' },
  ];

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  // Branches list
  const branches: ComposerBranchItem[] = [
    { name: 'main', subtitle: '最新提交 (本地 HEAD)' },
    { name: 'feat/multiagent-group', subtitle: '2 小时前提交' },
    { name: 'refactor/cli-pool', subtitle: '昨天提交' },
  ];

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(branchSearch.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !showSlashMenu) {
      e.preventDefault();
      onSend();
    }
  };

  const handleAddMockFile = (name: string) => {
    if (!attachments.includes(name)) {
      setAttachments((prev) => [...prev, name]);
    }
    setPlusMenuOpen(false);
  };

  return (
    <div className="w-full relative select-none">
      {/* Slash Command Autocomplete Popover */}
      <SlashCommandMenu
        isOpen={showSlashMenu}
        filterText={prompt}
        isNewChat={isNewChat}
        onSelect={(cmd) => {
          if (onSelectSlashCommand) {
            onSelectSlashCommand(cmd);
          } else {
            onPromptChange(`/${cmd.name} `);
          }
        }}
        onClose={() => onPromptChange('')}
      />

      <div className="w-full bg-surface-elevated border border-border-default rounded-2xl shadow-xl p-3.5 flex flex-col focus-within:border-accent-blue/50 transition-all">
        {/* TOP ROW: 仅新建对话时展示 (右上角文件夹/分支/worktree) */}
        {isNewChat && (
          <ComposerProjectAndBranchMenu
            isDialogueMode={isDialogueMode}
            setIsDialogueMode={setIsDialogueMode}
            selectedProject={selectedProject}
            setSelectedProject={setSelectedProject}
            filteredProjects={filteredProjects}
            projectSearch={projectSearch}
            setProjectSearch={setProjectSearch}
            selectedBranch={selectedBranch}
            setSelectedBranch={setSelectedBranch}
            filteredBranches={filteredBranches}
            branchSearch={branchSearch}
            setBranchSearch={setBranchSearch}
            worktreeEnabled={worktreeEnabled}
            setWorktreeEnabled={setWorktreeEnabled}
            onCloseOtherMenus={() => {
              setPermissionMenuOpen(false);
              setPlusMenuOpen(false);
            }}
          />
        )}

        {/* Attached Files Strip */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 mb-2 border-b border-border-subtle">
            {attachments.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 bg-surface-chip px-2 py-1 rounded-lg text-xs font-mono text-text-primary border border-border-default"
              >
                <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                <span>{file}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  className="hover:text-accent-red ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 模式指示徽章 (Goal / Teamwork / Boost) */}
        {(prompt.startsWith('[Goal] ') || prompt.startsWith('/goal ') ||
          prompt.startsWith('[Teamwork] ') || prompt.startsWith('/teamwork ') ||
          prompt.startsWith('[Boost] ') || prompt.startsWith('/boost ')) && (
          <div className="flex items-center gap-1.5 mb-1.5 px-2.5 py-1 rounded-xl text-xs font-medium w-fit border border-border-default bg-surface-elevated animate-in fade-in duration-150">
            {prompt.startsWith('[Goal]') || prompt.startsWith('/goal') ? (
              <span className="text-accent-red flex items-center gap-1">
                <Target className="w-3.5 h-3.5" />
                <span>目标驱动模式 (/goal): 持续推进直至终极交付</span>
              </span>
            ) : prompt.startsWith('[Teamwork]') || prompt.startsWith('/teamwork') ? (
              <span className="text-accent-purple flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                <span>Teamwork 协同模式 (/teamwork): 分派团队联合攻坚</span>
              </span>
            ) : (
              <span className="text-accent-amber flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Boost 强化模式 (/boost): 最高推理预算与多视角审查</span>
              </span>
            )}
            <button
              onClick={() => onPromptChange(prompt.replace(/^\[(Goal|Teamwork|Boost)\]\s*|^\/(goal|teamwork|boost)\s*/i, ''))}
              className="ml-1 p-0.5 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary"
              title="退出模式"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* CENTER: Textarea Input */}
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-transparent resize-none border-none text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none leading-relaxed p-1"
        />

        {/* BOTTOM TOOLBAR: 左侧 + 与权限，右侧模型、推理、语音、发送 */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle">
          {/* LEFT: + 按钮与权限 */}
          <div className="flex items-center gap-2 relative">
            <div className="relative">
              <button
                onClick={() => {
                  setPlusMenuOpen(!plusMenuOpen);
                  setPermissionMenuOpen(false);
                }}
                title="添加文件、技能与操作"
                className={`p-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-text-primary transition-colors cursor-pointer ${
                  plusMenuOpen ? 'bg-surface-chip' : 'bg-surface'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>

              {plusMenuOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-52 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs">
                  <div
                    onClick={() => handleAddMockFile('router.tsx')}
                    className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <div className="flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-text-secondary" />
                      <span>添加文件或照片</span>
                    </div>
                    <kbd className="text-[10px] text-text-tertiary font-mono">⌘ U</kbd>
                  </div>

                  <div
                    onClick={() => handleAddMockFile('src/components/')}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <Folder className="w-4 h-4 text-text-secondary" />
                    <span>添加文件夹</span>
                  </div>

                  <div
                    onClick={() => {
                      onPromptChange('/issues ');
                      setPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <Github className="w-4 h-4 text-text-secondary" />
                    <span>导入 GitHub 问题</span>
                  </div>

                  <div className="h-px bg-border-subtle my-1" />

                  <div
                    onClick={() => {
                      onPromptChange('/skillhub ');
                      setPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <Puzzle className="w-4 h-4 text-text-secondary" />
                    <span>引用技能 (Skill)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 权限指示按钮 */}
            <div className="relative">
              <button
                onClick={() => {
                  setPermissionMenuOpen(!permissionMenuOpen);
                  setPlusMenuOpen(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-chip hover:bg-surface-hover text-xs font-mono transition-colors border border-border-subtle cursor-pointer"
              >
                {permissionMode === 'bypass' ? (
                  <>
                    <Shield className="w-3.5 h-3.5 text-accent-blue" />
                    <span className="text-accent-blue font-medium">Bypass</span>
                  </>
                ) : permissionMode === 'auto' ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-accent-green" />
                    <span className="text-accent-green font-medium">自动审批</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-3.5 h-3.5 text-text-secondary" />
                    <span className="text-text-primary font-medium">手动确认</span>
                  </>
                )}
                <ChevronDown className="w-3 h-3 opacity-60 text-text-tertiary" />
              </button>

              <ComposerPermissionMenu
                isOpen={permissionMenuOpen}
                onSelect={(newMode) => {
                  setPermissionMode(newMode);
                  setPermissionMenuOpen(false);
                }}
              />
            </div>
          </div>

          {/* RIGHT: (非新建会话: 文件夹不可点击) -> 模型选择 -> 推理level -> 语音输入 -> 发送按钮 */}
          <div className="flex items-center gap-1.5">
            {!isNewChat && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-chip text-text-secondary text-[11px] font-mono select-none cursor-default border border-border-subtle"
                title="当前会话关联的工作目录 (不可更改)"
              >
                <Folder className="w-3.5 h-3.5 text-text-tertiary" />
                <span className="truncate max-w-[150px]">{selectedProject}</span>
              </div>
            )}

            {/* 模型与思考深度合并选择器 (1:1 对齐 Claude 官方交互) */}
            <ModelAndEffortPicker
              currentModelId={model}
              onModelChange={setModel}
              currentEffort={effort}
              onEffortChange={setEffort}
            />

            {/* 3. 语音输入 */}
            <button
              title="语音输入"
              className="p-1.5 rounded-xl hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* 4. 发送按钮 */}
            <button
              onClick={onSend}
              disabled={!prompt.trim()}
              className={`p-2 rounded-xl transition-all flex items-center justify-center ${
                prompt.trim()
                  ? 'bg-accent-cta text-accent-cta-fg shadow-md hover:bg-accent-hover cursor-pointer'
                  : 'bg-surface-chip text-text-disabled cursor-not-allowed'
              }`}
            >
              <ArrowUp className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
