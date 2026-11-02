/**
 * BotGroupCreateDialog.jsx
 * Cindy 风格「创建伙伴群聊」模态弹窗：
 * 支持群聊名称、工作目录、多选伙伴成员（最少 2 位）、指定主调度负责人与发言模式。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Users,
  Check,
  AlertCircle,
  Folder,
  Crown,
  Radio,
  FolderPlus,
  Trash2,
  Database,
  FolderGit2,
} from 'lucide-react';
import RoleStatusBadge from '../../components/common/RoleStatusBadge.jsx';

export default function BotGroupCreateDialog({
  isOpen,
  onClose,
  allPartners = [],
  onCreateGroup,
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupDir, setGroupDir] = useState('~/.multiagent-orchestration/groups/taskforce');
  const [mountedDirs, setMountedDirs] = useState([]);
  const [newMountInput, setNewMountInput] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [leadPartnerId, setLeadPartnerId] = useState('');
  const [speakingMode, setSpeakingMode] = useState('auto');
  const [errorMessage, setErrorMessage] = useState('');

  // 每次打开弹窗时重置并初始化默认成员（前 2 位伙伴，首选 lead-orchestrator）
  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setGroupDir('~/.multiagent-orchestration/groups/new-taskforce');
      setMountedDirs([]);
      setNewMountInput('');
      setErrorMessage('');
      setSpeakingMode('auto');

      const initialSelected = allPartners.slice(0, 3).map((p) => p.id);
      setSelectedIds(initialSelected);

      const defaultLead = allPartners.find((p) => p.isLead || p.id === 'lead-orchestrator')?.id || allPartners[0]?.id || '';
      setLeadPartnerId(defaultLead);
    }
  }, [isOpen, allPartners]);

  // 群名称修改时自动建议群专属存储目录名
  const handleNameChange = (val) => {
    setName(val);
    setErrorMessage('');
    const slug = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'taskforce';
    setGroupDir(`~/.multiagent-orchestration/groups/${slug}`);
  };

  // 添加挂载关联工程目录
  const handleAddMount = () => {
    const trimmed = newMountInput.trim();
    if (trimmed && !mountedDirs.includes(trimmed)) {
      setMountedDirs((prev) => [...prev, trimmed]);
      setNewMountInput('');
    }
  };

  // 移除挂载目录
  const handleRemoveMount = (idx) => {
    setMountedDirs((prev) => prev.filter((_, i) => i !== idx));
  };

  // ESC 键监听关闭
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 切换成员勾选状态
  const toggleMember = (botId) => {
    setErrorMessage('');
    setSelectedIds((prev) => {
      const next = prev.includes(botId) ? prev.filter((id) => id !== botId) : [...prev, botId];
      // 如果移除了当前的主调度负责人，自动把负责人指向下一个已勾选伙伴
      if (!next.includes(leadPartnerId)) {
        setLeadPartnerId(next[0] || '');
      }
      return next;
    });
  };

  // 提交群聊创建
  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('请输入群聊名称');
      return;
    }
    if (trimmedName.length > 40) {
      setErrorMessage('群聊名称不能超过 40 个字符');
      return;
    }
    if (selectedIds.length < 2) {
      setErrorMessage('群聊至少需要选择 2 位伙伴协同');
      return;
    }
    if (!leadPartnerId || !selectedIds.includes(leadPartnerId)) {
      setErrorMessage('请从已选成员中指定一位群聊主调度负责人');
      return;
    }

    const selectedMembers = allPartners
      .filter((p) => selectedIds.includes(p.id))
      .map((p) => ({
        botId: p.id,
        name: p.name,
        role: p.role,
        avatar: p.avatar,
        avatarColor: p.avatarColor,
        isLead: p.id === leadPartnerId,
      }));

    const trimmedGroupDir = groupDir.trim() || `~/.multiagent-orchestration/groups/grp_${Date.now().toString(36)}`;

    const newGroup = {
      id: `grp_${Date.now().toString(36)}`,
      name: trimmedName,
      title: trimmedName,
      kind: 'group',
      description: description.trim() || '多 Agent 协同工作区群聊',
      organizerBotId: leadPartnerId,
      leadPartnerId: leadPartnerId,
      groupDir: trimmedGroupDir,
      storageDir: trimmedGroupDir,
      workdir: trimmedGroupDir,
      projectDir: trimmedGroupDir,
      mountedDirs: mountedDirs.map((d) => d.trim()).filter(Boolean),
      speakingMode,
      memberIds: selectedIds,
      members: selectedMembers,
      createdAt: new Date().toISOString(),
      updatedAt: '刚刚',
      messages: [],
    };

    onCreateGroup(newGroup);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-xl bg-surface border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">创建伙伴群聊</h2>
              <p className="text-[11px] text-slate-400">汇聚多位 Agent 伙伴，共同分解与执行复杂协同任务</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-card transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 群聊名称 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200 flex justify-between">
              <span>群聊名称 <span className="text-rose-400">*</span></span>
              <span className="text-[10px] text-slate-500 font-mono">{name.length}/40</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="例如：CLIProxyAPI & Prism Taskforce"
              className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent transition-all"
              autoFocus
            />
          </div>

          {/* 任务说明/协同目标 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">群协同目标 / 任务说明 (可选)</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简述该群聊核心任务，例如：联合推进 CLIProxyAPI 协议开发与 Prism 客户端联调"
              className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent transition-all resize-none"
            />
          </div>

          {/* 群专属存储空间与目标工程挂载 (架构核心) */}
          <div className="space-y-3 p-3.5 rounded-xl bg-card/40 border border-border/80">
            {/* 群自身的专属存储空间 */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200 flex items-center justify-between">
                <span className="flex items-center space-x-1.5">
                  <Database className="w-3.5 h-3.5 text-accent" />
                  <span>群专属存储目录 (Group Storage Dir)</span>
                </span>
                <span className="text-[10px] text-accent/80 font-mono">群自身数据 · 独立存放</span>
              </label>
              <input
                type="text"
                value={groupDir}
                onChange={(e) => setGroupDir(e.target.value)}
                placeholder="~/.multiagent-orchestration/groups/cliproxyapi-prism-taskforce"
                className="w-full bg-slate-950/80 border border-border/80 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent transition-all"
              />
              <p className="text-[10px] text-slate-400 leading-relaxed">
                🛡️ 类似伙伴专属目录，用于独立保存群共享记忆 (GROUP_MEMORY.md)、任务计划与黑板，<strong>绝不把群内部数据塞入业务代码库</strong>。
              </p>
            </div>

            {/* 挂载的实际工程代码库 */}
            <div className="space-y-2 pt-2 border-t border-border/50">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-200 flex items-center space-x-1.5">
                  <FolderGit2 className="w-3.5 h-3.5 text-sky-400" />
                  <span>挂载目标工程 (Mounted Project Repos)</span>
                </label>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300">
                  {mountedDirs.length} 个目标项目
                </span>
              </div>

              {/* 输入框与添加按钮 */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={newMountInput}
                  onChange={(e) => setNewMountInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddMount();
                    }
                  }}
                  placeholder="例如: /Users/xr/IDEA.localized/CLIProxyAPI 或 Prism"
                  className="flex-1 bg-slate-950/80 border border-border/80 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-accent transition-all"
                />
                <button
                  type="button"
                  onClick={handleAddMount}
                  className="px-3 py-1.5 bg-card hover:bg-slate-700/60 border border-border text-xs font-medium text-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                >
                  + 挂载工程
                </button>
              </div>

              {/* 已挂载工程展示标签 */}
              {mountedDirs.length > 0 ? (
                <div className="space-y-1 pt-0.5">
                  {mountedDirs.map((dir, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-slate-900/90 border border-border/70 px-2.5 py-1.5 rounded-lg text-[11px] font-mono text-sky-300"
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <Folder className="w-3 h-3 text-sky-400 flex-shrink-0" />
                        <span className="truncate">{dir}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveMount(idx)}
                        className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition-colors cursor-pointer ml-2"
                        title="取消挂载"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 bg-slate-950/40 p-2.5 rounded-lg border border-border/40">
                  暂未挂载外部工程。群伙伴默认在专属存储空间内进行讨论与方案推演；如需操作业务代码，可在上方填入项目路径点击挂载。
                </div>
              )}
            </div>
          </div>

          {/* 成员多选选择器 (最少 2 位) */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-200">
                选择入群伙伴 <span className="text-rose-400">*</span>
              </label>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                selectedIds.length >= 2 ? 'bg-accent/20 text-accent' : 'bg-rose-500/20 text-rose-400'
              }`}>
                已选 {selectedIds.length} 位 (最少 2 位)
              </span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {allPartners.map((partner) => {
                const isSelected = selectedIds.includes(partner.id);
                const isLead = partner.id === leadPartnerId;
                return (
                  <div
                    key={partner.id}
                    onClick={() => toggleMember(partner.id)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-card/90 border-accent/60 shadow-sm'
                        : 'bg-card/30 border-border/50 hover:bg-card/60 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                          isSelected ? 'bg-accent text-slate-950 font-bold' : 'border border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-medium text-slate-100 truncate">{partner.name}</span>
                          {isLead && (
                            <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1 rounded flex items-center space-x-0.5">
                              <Crown className="w-2.5 h-2.5 mr-0.5" />
                              主调度
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{partner.role}</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <RoleStatusBadge role={partner.role} status={partner.status || 'idle'} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 群聊主调度负责人 (Lead Orchestrator) */}
          {selectedIds.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-medium text-slate-200 flex items-center space-x-1.5">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span>群聊主调度负责人</span>
              </label>
              <select
                value={leadPartnerId}
                onChange={(e) => setLeadPartnerId(e.target.value)}
                className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 focus:outline-none focus:border-accent transition-all cursor-pointer"
              >
                {allPartners
                  .filter((p) => selectedIds.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id} className="bg-slate-900 text-slate-200">
                      {p.name} ({p.role})
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* 发言模式选择 */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-medium text-slate-200">协同调度模式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSpeakingMode('auto')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                  speakingMode === 'auto'
                    ? 'bg-accent/15 border-accent text-accent'
                    : 'bg-card/40 border-border/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-medium text-slate-200">智能自主调度 (Auto)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">主控根据上下文动态指派伙伴</div>
              </button>
              <button
                type="button"
                onClick={() => setSpeakingMode('sequential')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                  speakingMode === 'sequential'
                    ? 'bg-accent/15 border-accent text-accent'
                    : 'bg-card/40 border-border/70 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-medium text-slate-200">顺序轮流响应 (Sequential)</div>
                <div className="text-[10px] text-slate-500 mt-0.5">按成员顺序流水线式协同处理</div>
              </button>
            </div>
          </div>
        </form>

        {/* 底部按钮栏 */}
        <div className="flex items-center justify-end space-x-3 px-6 py-4 border-t border-border bg-slate-900/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 rounded-xl transition-all cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="px-5 py-2 text-xs font-medium bg-accent text-slate-950 hover:bg-accent-hover rounded-xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
          >
            创建群聊
          </button>
        </div>
      </div>
    </div>
  );
}
