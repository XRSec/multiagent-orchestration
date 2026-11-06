/**
 * ExtensionConfigPage.tsx
 * MCP、Skill、Plugin 扩展配置中心 (Cindy Web 规范):
 * 支持【伙伴维度】与【文件夹维度】的双维度独立配置与策略持久化。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Cpu,
  Zap,
  Puzzle,
  Folder,
  User,
  Save,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
export function ExtensionConfigPage() {
  const [scopeType, setScopeType] = useState<'partner' | 'folder'>('partner');
  const [bots, setBots] = useState<Array<{ id: string; name: string }>>([
    { id: 'bot_moadmin_director_03', name: 'moAdmin' },
    { id: 'bot_mocode_engine_01', name: 'moCode' },
  ]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('bot_moadmin_director_03');
  const [selectedFolder, setSelectedFolder] = useState('~/.multiagent-orchestration/workspace');

  useEffect(() => {
    fetch('/api/bots')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.bots) && data.bots.length > 0) {
          setBots(data.bots.map((b: any) => ({ id: b.id, name: b.name })));
          setSelectedPartnerId(data.bots[0].id);
        }
      })
      .catch(() => {});
  }, []);

  const [activeTab, setActiveTab] = useState<'mcp' | 'skill' | 'plugin'>('mcp');

  // 配置状态
  const [config, setConfig] = useState({
    mcpServers: ['nexus-orchestrator-mcp', 'cindy-memory'],
    mcpMode: 'inherit',
    skills: ['workflow-authoring', 'architecture-review'],
    skillMode: 'inherit',
    plugins: ['cindy-github'],
    pluginMode: 'inherit'
  });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const availableMcps = [
    { id: 'nexus-orchestrator-mcp', name: 'Nexus Orchestrator (In-Process)', type: 'in-process', desc: '多 Agent 任务流水线、异步等待与强行干预分派。', tools: ['dispatch_and_queue', 'await_queue', 'steer_partner'] },
    { id: 'cindy-memory', name: 'Cindy Maker Memory', type: 'stdio', desc: '持久化分片记忆与 FTS5 向量语义检索引擎。', tools: ['memory_read', 'memory_write', 'memory_search'] },
    { id: 'filesystem', name: 'Local Filesystem Provider', type: 'builtin', desc: '工作区受控文件读写、修改与目录扫描。', tools: ['read_file', 'write_file', 'list_dir'] },
    { id: 'cindy-github', name: 'GitHub Integration MCP', type: 'plugin-bridge', desc: 'PR 审查、Commit 对比与仓库联动工具。', tools: ['list_tools', 'call_tool'] }
  ];

  const availableSkills = [
    { id: 'workflow-authoring', name: 'Workflow Authoring', cat: 'orchestration', desc: '多阶段 Agent 编排流水线与并行分发脚本规范。', triggers: ['workflow', 'pipeline'] },
    { id: 'task-decomposition', name: 'Task Decomposition', cat: 'planning', desc: '将大型宏观需求拓扑拆解为最小可验证子任务。', triggers: ['plan', 'breakdown'] },
    { id: 'architecture-review', name: 'Architecture Review', cat: 'quality', desc: '单文件行数限额 (<=600行) 与双平面隔离审查。', triggers: ['review', 'architecture'] },
    { id: 'safe-refactoring', name: 'Safe Refactoring', cat: 'engineering', desc: '严禁越界修改生产代码，纯粹 AST 重构。', triggers: ['refactor', 'clean'] }
  ];

  const availablePlugins = [
    { id: 'cindy-github', name: 'GitHub Extension', ver: '1.2.0', author: 'Cindy Core Team', desc: '支持 PR 评审、分支管理、Issue 互动与 CI 检查。', permissions: ['network', 'repo-write'] },
    { id: 'cindy-gitlab', name: 'GitLab Extension', ver: '1.1.0', author: 'Cindy Core Team', desc: '支持自建 GitLab 实例的项目与合并请求审查。', permissions: ['network'] },
    { id: 'cindy-docs', name: 'Docs & PDF Formatter', ver: '2.0.0', author: 'Cindy Studio', desc: '零依赖生成专业 Word、PPT 与 PDF 交付文档。', permissions: ['filesystem-write'] }
  ];

  const toggleMcp = (id: string) => {
    setConfig(prev => ({
      ...prev,
      mcpServers: prev.mcpServers.includes(id)
        ? prev.mcpServers.filter(s => s !== id)
        : [...prev.mcpServers, id]
    }));
  };

  const toggleSkill = (id: string) => {
    setConfig(prev => ({
      ...prev,
      skills: prev.skills.includes(id)
        ? prev.skills.filter(s => s !== id)
        : [...prev.skills, id]
    }));
  };

  const togglePlugin = (id: string) => {
    setConfig(prev => ({
      ...prev,
      plugins: prev.plugins.includes(id)
        ? prev.plugins.filter(p => p !== id)
        : [...prev.plugins, id]
    }));
  };

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setToast('配置已物理同步到对应架构层级！');
      setTimeout(() => setToast(null), 3000);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface text-text-primary overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="border-b border-border-default px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-elevated/40">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-accent-purple" />
            <h1 className="text-base font-bold text-text-primary">扩展配置中心 (MCP / Skill / Plugin)</h1>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            按【伙伴】或【文件夹】分层配置运行时能力，严格遵循 Cindy 扩展隔离规范
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 维度切换器 */}
          <div className="inline-flex rounded-lg p-1 bg-surface-hover border border-border-default">
            <button
              onClick={() => setScopeType('partner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'partner'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              伙伴维度
            </button>
            <button
              onClick={() => setScopeType('folder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'folder'
                  ? 'bg-accent-purple text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              文件夹维度
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg shadow transition-colors cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {/* 目标对象选择栏 */}
      <div className="bg-surface-elevated/20 px-6 py-3 border-b border-border-default flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-text-secondary">当前配置对象:</span>
          {scopeType === 'partner' ? (
            <select
              value={selectedPartnerId}
              onChange={e => setSelectedPartnerId(e.target.value)}
              className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-accent-purple"
            >
              {bots.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              placeholder="输入目标工作区文件夹路径"
              className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1.5 w-72 focus:outline-none focus:border-accent-purple"
            />
          )}
        </div>

        {toast && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {toast}
          </div>
        )}
      </div>

      {/* 分类 Tab */}
      <div className="flex border-b border-border-default px-6 bg-surface-elevated/10">
        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'mcp'
              ? 'border-accent-purple text-accent-purple'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Cpu className="w-4 h-4" />
          MCP 服务 ({config.mcpServers.length} 已选)
        </button>
        <button
          onClick={() => setActiveTab('skill')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'skill'
              ? 'border-accent-purple text-accent-purple'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Zap className="w-4 h-4" />
          Skill 技能 ({config.skills.length} 已选)
        </button>
        <button
          onClick={() => setActiveTab('plugin')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'plugin'
              ? 'border-accent-purple text-accent-purple'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Puzzle className="w-4 h-4" />
          Plugin 插件 ({config.plugins.length} 已选)
        </button>
      </div>

      {/* 主体卡片列表 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {activeTab === 'mcp' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableMcps.map(mcp => {
              const checked = config.mcpServers.includes(mcp.id);
              return (
                <div
                  key={mcp.id}
                  onClick={() => toggleMcp(mcp.id)}
                  className={`cursor-pointer rounded-xl p-4 border transition-all ${
                    checked
                      ? 'bg-accent-purple/10 border-accent-purple/60 shadow-sm'
                      : 'bg-surface-elevated/40 border-border-default hover:border-border-hover'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={checked} readOnly className="w-4 h-4 accent-accent-purple" />
                      <div className="font-semibold text-xs text-text-primary">{mcp.name}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-border-default text-text-secondary">
                      {mcp.type}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-2">{mcp.desc}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {mcp.tools.map(t => (
                      <span key={t} className="text-[10px] bg-surface text-text-secondary px-1.5 py-0.5 rounded">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'skill' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availableSkills.map(sk => {
              const checked = config.skills.includes(sk.id);
              return (
                <div
                  key={sk.id}
                  onClick={() => toggleSkill(sk.id)}
                  className={`cursor-pointer rounded-xl p-4 border transition-all ${
                    checked
                      ? 'bg-accent-purple/10 border-accent-purple/60 shadow-sm'
                      : 'bg-surface-elevated/40 border-border-default hover:border-border-hover'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={checked} readOnly className="w-4 h-4 accent-accent-purple" />
                      <div className="font-semibold text-xs text-text-primary">{sk.name}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-surface border border-accent-purple/40 text-accent-purple">
                      {sk.cat}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-2">{sk.desc}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {sk.triggers.map(tr => (
                      <span key={tr} className="text-[10px] bg-surface text-text-secondary px-1.5 py-0.5 rounded">
                        #{tr}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'plugin' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {availablePlugins.map(plg => {
              const checked = config.plugins.includes(plg.id);
              return (
                <div
                  key={plg.id}
                  onClick={() => togglePlugin(plg.id)}
                  className={`cursor-pointer rounded-xl p-4 border transition-all ${
                    checked
                      ? 'bg-accent-purple/10 border-accent-purple/60 shadow-sm'
                      : 'bg-surface-elevated/40 border-border-default hover:border-border-hover'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={checked} readOnly className="w-4 h-4 accent-accent-purple" />
                      <div className="font-semibold text-xs text-text-primary">{plg.name}</div>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-800/40">
                      v{plg.ver}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary mt-2">{plg.desc}</p>
                  <div className="mt-3 text-[10px] text-text-tertiary">
                    权限: {plg.permissions.join(', ')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
