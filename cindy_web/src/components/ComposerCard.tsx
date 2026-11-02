import React, { useState, useRef, useEffect } from 'react';
import {
  Folder,
  GitBranch,
  Paperclip,
  Mic,
  ArrowUp,
  Shield,
  AlertTriangle,
  Lock,
  ChevronDown,
  Search,
  Check,
  Plus,
  Github,
  Command,
  Layers,
  Puzzle,
  Target,
  ListTodo,
  Users,
  FolderPlus,
  MessageSquare,
  Sparkles,
  FileCode,
  X,
  FileText,
} from 'lucide-react';
import { SlashCommandMenu, SlashCommand } from './SlashCommandMenu';

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
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');

  const [selectedBranch, setSelectedBranch] = useState('main');
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState('');

  const [worktreeEnabled, setWorktreeEnabled] = useState(false);

  // Bottom Toolbar States
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] = useState<'bypass' | 'auto' | 'ask'>('bypass');
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);

  // Model & Effort (简洁好用)
  const [model, setModel] = useState('Claude Opus 5.5');
  const [effort, setEffort] = useState<'Low' | 'Medium' | 'High' | 'Max'>('High');

  // Attachments
  const [attachments, setAttachments] = useState<string[]>([]);

  // Slash menu visibility
  const showSlashMenu = prompt.startsWith('/') || prompt.startsWith('//');

  const projects = [
    { name: 'multiagent-orchestration', path: '/Users/xr/IDEA.localized/multiagent-orchestration' },
    { name: 'cindy', path: '/Users/xr/IDEA.localized/cindy' },
    { name: 'Prism-Browser', path: '/Users/xr/IDEA.localized/Prism-Browser' },
    { name: 'cliproxyapi', path: '/Users/xr/IDEA.localized/cliproxyapi' },
    { name: 'Clash-Rule-Custom', path: '/Users/xr/IDEA.localized/Clash-Rule-Custom' },
    { name: 'TunnelFlow', path: '/Users/xr/IDEA.localized/TunnelFlow' },
  ];

  const branches = [
    { name: 'main', subtitle: '领先 origin/main 4 个提交 · 未提交 443 个文件' },
    { name: 'feat/web-ui-alignment', subtitle: '与 origin/main 同步' },
    { name: 'dev', subtitle: '落后 origin/main 1 个提交' },
  ];

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(projectSearch.toLowerCase()) ||
    p.path.toLowerCase().includes(projectSearch.toLowerCase())
  );

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
        {/* ========================================================= */}
        {/* TOP ROW: 仅新建对话时展示 (右上角文件夹/分支/worktree)    */}
        {/* ========================================================= */}
        {isNewChat && (
          <div className="flex items-center justify-end gap-2 pb-2 mb-2 border-b border-border-subtle text-xs">
            {/* 1. 项目/文件夹选择器 (对应截图 1) */}
            <div className="relative">
              <button
                onClick={() => {
                  setProjectMenuOpen(!projectMenuOpen);
                  setBranchMenuOpen(false);
                  setPermissionMenuOpen(false);
                  setPlusMenuOpen(false);
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
                <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${projectMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* 项目下拉弹窗 (Exact Screenshot 1) */}
              {projectMenuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2 z-50 text-xs">
                  <div className="px-2 py-1 text-[11px] text-text-tertiary">
                    对话或选择项目
                  </div>

                  <div
                    onClick={() => {
                      setIsDialogueMode(true);
                      setProjectMenuOpen(false);
                    }}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                      isDialogueMode ? 'bg-surface-chip text-text-primary font-semibold' : 'hover:bg-surface-hover text-text-primary'
                    }`}
                  >
                    <MessageSquare className="w-4 h-4 text-text-secondary" />
                    <span>对话</span>
                  </div>

                  <div className="px-2 pt-2 pb-1 text-[11px] text-text-tertiary">
                    项目
                  </div>

                  {/* 搜索框 (带蓝框激活态) */}
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

                  {/* 项目列表 */}
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

            {/* 2. 分支选择器 (对应截图 2) */}
            {!isDialogueMode && (
              <div className="relative">
                <button
                  onClick={() => {
                    setBranchMenuOpen(!branchMenuOpen);
                    setProjectMenuOpen(false);
                    setPermissionMenuOpen(false);
                    setPlusMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-primary text-xs font-medium border border-border-subtle transition-colors cursor-pointer"
                >
                  <GitBranch className="w-3.5 h-3.5 text-text-secondary" />
                  <span className="font-mono">{selectedBranch}</span>
                  <ChevronDown className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${branchMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* 分支下拉弹窗 (Exact Screenshot 2) */}
                {branchMenuOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2 z-50 text-xs">
                    {/* 分支搜索框 (带蓝框激活态) */}
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

                    {/* 分支条目 */}
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
                          <div className="text-xs font-mono font-bold text-text-primary">
                            {b.name}
                          </div>
                          <div className="text-[11px] text-text-tertiary mt-0.5">
                            {b.subtitle}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Worktree 复选框 */}
            {!isDialogueMode && (
              <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-hover cursor-pointer text-text-secondary transition-colors">
                <input
                  type="checkbox"
                  checked={worktreeEnabled}
                  onChange={(e) => setWorktreeEnabled(e.target.checked)}
                  className="w-3.5 h-3.5 accent-accent-blue rounded cursor-pointer"
                />
                <span className="text-[11px] font-mono">worktree</span>
              </label>
            )}
          </div>
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

        {/* ========================================================= */}
        {/* CENTER: Textarea Input                                    */}
        {/* ========================================================= */}
        <textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={3}
          className="w-full bg-transparent resize-none border-none text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none leading-relaxed p-1"
        />

        {/* ========================================================= */}
        {/* BOTTOM TOOLBAR: 左侧 + 与权限，右侧模型、推理、语音、发送 */}
        {/* ========================================================= */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle">
          {/* LEFT: + 按钮与权限 */}
          <div className="flex items-center gap-2 relative">
            {/* 1. '+' 按钮 (对应截图 3 & 4) */}
            <div className="relative">
              <button
                onClick={() => {
                  setPlusMenuOpen(!plusMenuOpen);
                  setPermissionMenuOpen(false);
                  setProjectMenuOpen(false);
                  setBranchMenuOpen(false);
                }}
                title="添加文件、技能与操作"
                className={`p-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-text-primary transition-colors cursor-pointer ${
                  plusMenuOpen ? 'bg-surface-chip' : 'bg-surface'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>

              {/* '+' 下拉菜单 (Exact Screenshot 4 & 3) */}
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

                  <div
                    onClick={() => {
                      onPromptChange('/');
                      setPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <Command className="w-4 h-4 text-text-secondary" />
                    <span>斜线命令</span>
                  </div>

                  <div className="h-px bg-border-subtle my-1" />

                  <div
                    onClick={() => {
                      onPromptChange('[Goal] ');
                      setPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <Target className="w-4 h-4 text-accent-red" />
                    <span>新建目标 (/goal)</span>
                  </div>

                  <div
                    onClick={() => {
                      onPromptChange('/plan ');
                      setPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <ListTodo className="w-4 h-4 text-accent-blue" />
                    <span>计划模式 (/plan)</span>
                  </div>

                  <div
                    onClick={() => {
                      onPromptChange('/workflows ');
                      setPlusMenuOpen(false);
                    }}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    <Users className="w-4 h-4 text-accent-purple" />
                    <span>协同模式 (Orca)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. 权限模式 (对应截图 3 底部: 完全访问 / 自动审批 / 手动确认) */}
            <div className="relative">
              <button
                onClick={() => {
                  setPermissionMenuOpen(!permissionMenuOpen);
                  setPlusMenuOpen(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl hover:bg-surface-hover text-xs transition-colors cursor-pointer"
              >
                {permissionMode === 'bypass' ? (
                  <>
                    <AlertTriangle className="w-3.5 h-3.5 text-accent-amber" />
                    <span className="text-accent-amber font-medium">完全访问</span>
                  </>
                ) : permissionMode === 'auto' ? (
                  <>
                    <Shield className="w-3.5 h-3.5 text-accent-green" />
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

              {/* 权限选择菜单 */}
              {permissionMenuOpen && (
                <div className="absolute left-0 bottom-full mb-2 w-56 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs">
                  <div
                    onClick={() => {
                      setPermissionMode('bypass');
                      setPermissionMenuOpen(false);
                    }}
                    className="p-2 rounded-xl hover:bg-surface-hover cursor-pointer space-y-0.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-accent-amber">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>完全访问 (Bypass)</span>
                    </div>
                    <div className="text-[10px] text-text-tertiary pl-5.5">
                      不询问，自动直接放行所有文件修改与命令
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      setPermissionMode('auto');
                      setPermissionMenuOpen(false);
                    }}
                    className="p-2 rounded-xl hover:bg-surface-hover cursor-pointer space-y-0.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-accent-green">
                      <Shield className="w-3.5 h-3.5" />
                      <span>自动审批 (Auto)</span>
                    </div>
                    <div className="text-[10px] text-text-tertiary pl-5.5">
                      自动根据工作区边界判定并审批执行
                    </div>
                  </div>

                  <div
                    onClick={() => {
                      setPermissionMode('ask');
                      setPermissionMenuOpen(false);
                    }}
                    className="p-2 rounded-xl hover:bg-surface-hover cursor-pointer space-y-0.5"
                  >
                    <div className="flex items-center gap-2 font-bold text-text-primary">
                      <Lock className="w-3.5 h-3.5" />
                      <span>手动确认 (Ask)</span>
                    </div>
                    <div className="text-[10px] text-text-tertiary pl-5.5">
                      关键文件写入与终端指令需逐项授权
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: (非新建会话: 文件夹不可点击) -> 模型选择 -> 推理level -> 语音输入 -> 发送按钮 */}
          <div className="flex items-center gap-1.5">
            {/* 非新建对话时：右侧显示文件夹名称，不可点击 (对齐 Cindy 规范) */}
            {!isNewChat && (
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-chip text-text-secondary text-[11px] font-mono select-none cursor-default border border-border-subtle"
                title="当前会话关联的工作目录 (不可更改)"
              >
                <Folder className="w-3.5 h-3.5 text-text-tertiary" />
                <span className="truncate max-w-[150px]">{selectedProject}</span>
              </div>
            )}

            {/* 1. 模型选择 (简洁好用，不计划搞复杂的多供应商) */}
            <div className="flex items-center gap-1 bg-surface-chip hover:bg-surface-hover px-2.5 py-1 rounded-xl text-text-primary text-[11px] font-medium transition-colors">
              <Sparkles className="w-3 h-3 text-accent-blue" />
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="bg-transparent border-none text-text-primary focus:outline-none cursor-pointer font-mono"
              >
                <option value="Claude Opus 5.5">Claude Opus 5.5</option>
                <option value="Claude Sonnet 5.5">Claude Sonnet 5.5</option>
                <option value="GPT-5.5 (Codex)">GPT-5.5 (Codex)</option>
                <option value="Gemini 2.5 Pro">Gemini 2.5 Pro</option>
              </select>
            </div>

            {/* 2. 推理 level 选择 */}
            <div className="flex items-center bg-surface-chip hover:bg-surface-hover px-2 py-1 rounded-xl text-text-secondary text-[11px] font-medium transition-colors">
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value as any)}
                className="bg-transparent border-none text-text-secondary focus:outline-none cursor-pointer text-[11px]"
              >
                <option value="Low">低推理 Low</option>
                <option value="Medium">中推理 Med</option>
                <option value="High">高推理 High</option>
                <option value="Max">极限 Max</option>
              </select>
            </div>

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
