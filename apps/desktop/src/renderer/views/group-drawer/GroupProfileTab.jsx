/**
 * GroupProfileTab.jsx
 * 群聊配置面板 - 基础资料与运行模式配置：
 * 支持修改群名称、工作目录（projectDir）、群主负责人（organizerBotId）与发言模式切换。
 * 单文件严格规范：<= 220 行
 */

import React, { useState } from 'react';
import { Save, Check, FolderGit2, Users, Sliders, FolderPlus, Folder, X } from 'lucide-react';

export default function GroupProfileTab({
  group,
  partners = [],
  onSave,
}) {
  const [name, setName] = useState(group?.name || group?.title || '');
  const [projectDir, setProjectDir] = useState(group?.projectDir || group?.workdir || '');
  const [mountedDirs, setMountedDirs] = useState(group?.mountedDirs || []);
  const [newMountInput, setNewMountInput] = useState('');
  const [organizerId, setOrganizerId] = useState(group?.organizerBotId || 'lead-orchestrator');
  const [speakingMode, setSpeakingMode] = useState(group?.speakingMode || 'auto');
  const [saved, setSaved] = useState(false);

  const handleAddMount = () => {
    const trimmed = newMountInput.trim();
    if (trimmed && !mountedDirs.includes(trimmed)) {
      setMountedDirs((prev) => [...prev, trimmed]);
      setNewMountInput('');
    }
  };

  const handleRemoveMount = (idx) => {
    setMountedDirs((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    onSave?.({
      ...group,
      name,
      title: name,
      projectDir,
      workdir: projectDir,
      mountedDirs,
      organizerBotId: organizerId,
      speakingMode,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Group Name Field */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-300">群聊名称</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如: 核心多Agent审计群"
          className="w-full bg-slate-950 border border-border/80 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/50"
        />
      </div>

      {/* Organizer Select */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-300">群主 / 调度负责人</label>
        <select
          value={organizerId}
          onChange={(e) => setOrganizerId(e.target.value)}
          className="w-full bg-slate-950 border border-border/80 rounded-xl px-3 py-2 text-xs text-slate-100 outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/50 font-mono"
        >
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.id})
            </option>
          ))}
        </select>
        <p className="text-[10px] text-slate-500">
          群主负责在多 Agent 协同阶段进行任务拆解与分工计划（BotGroupPlan）的派发。
        </p>
      </div>

      {/* Speaking Mode */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-300">发言机制 (Speaking Mode)</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSpeakingMode('auto')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              speakingMode === 'auto'
                ? 'bg-accent/15 border-accent text-accent font-semibold shadow-sm'
                : 'bg-card/40 border-border/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-xs">智能接话 (Auto)</div>
            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
              仅当提及或轮到角色专长时接话
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSpeakingMode('all')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              speakingMode === 'all'
                ? 'bg-accent/15 border-accent text-accent font-semibold shadow-sm'
                : 'bg-card/40 border-border/60 text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="text-xs">全员轮询 (All)</div>
            <div className="text-[10px] text-slate-500 font-normal mt-0.5">
              群内所有成员依次按顺序接话
            </div>
          </button>
        </div>
      </div>

      {/* Group Storage Dir Field */}
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold text-slate-300">群专属存储空间 (Group Storage Dir)</label>
        <input
          type="text"
          value={projectDir}
          onChange={(e) => setProjectDir(e.target.value)}
          placeholder="~/.multiagent-orchestration/groups/group-id"
          className="w-full bg-slate-950 border border-border/80 rounded-xl px-3 py-2 text-xs text-slate-100 font-mono outline-none focus:border-accent/80 focus:ring-1 focus:ring-accent/50"
        />
        <p className="text-[10px] text-slate-500">
          属于此群自身的存储文件夹（类似伙伴独立沙箱），用于存放共享记忆、任务分解 plans 与黑板，不污染业务代码库。
        </p>
      </div>

      {/* Mounted Directories Field */}
      <div className="space-y-2 p-2.5 rounded-xl bg-slate-950/60 border border-border/60">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold text-slate-300 flex items-center space-x-1.5">
            <FolderPlus className="w-3.5 h-3.5 text-sky-400" />
            <span>挂载操作的工程项目 (Mounted Repos)</span>
          </label>
          <span className="text-[10px] font-mono text-sky-400">
            {mountedDirs.length} 个目标工程
          </span>
        </div>

        <div className="flex items-center space-x-1.5">
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
            placeholder="/Users/xr/IDEA.localized/Prism"
            className="flex-1 bg-slate-900 border border-border/80 rounded-xl px-3 py-1.5 text-xs text-slate-100 font-mono outline-none focus:border-accent/80"
          />
          <button
            type="button"
            onClick={handleAddMount}
            className="px-3 py-1.5 bg-card hover:bg-slate-800 border border-border text-xs text-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            + 挂载
          </button>
        </div>

        {mountedDirs.length > 0 && (
          <div className="space-y-1 pt-0.5">
            {mountedDirs.map((dir, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-slate-900 border border-border/80 px-2.5 py-1 rounded-lg text-[10px] font-mono text-sky-300"
              >
                <div className="flex items-center space-x-1.5 min-w-0">
                  <Folder className="w-3 h-3 text-sky-400 flex-shrink-0" />
                  <span className="truncate">{dir}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveMount(idx)}
                  className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer ml-1"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Save Button */}
      <div className="pt-2 flex justify-end">
        <button
          onClick={handleSave}
          className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-accent text-slate-950 font-semibold text-xs hover:bg-accent-hover transition-all shadow-md active:scale-95 cursor-pointer"
        >
          {saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          <span>{saved ? '已更新' : '保存设置'}</span>
        </button>
      </div>
    </div>
  );
}
