/**
 * ExtensionConfigView.jsx
 * MCP、Skill、Plugin 配置页面（支持【伙伴】与【文件夹】双维度配置）：
 * 提供服务开关、白名单/继承模式切换、自定义参数录入及后端物理同步。
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
  RefreshCw,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react';

export default function ExtensionConfigView({
  partners = [],
  currentWorkspace = '',
  onClose
}) {
  const [scopeType, setScopeType] = useState('partner'); // 'partner' | 'folder'
  const [selectedPartnerId, setSelectedPartnerId] = useState(partners[0]?.id || 'lead-orchestrator');
  const [selectedFolder, setSelectedFolder] = useState(currentWorkspace || '~/.multiagent-orchestration');

  const [activeTab, setActiveTab] = useState('mcp'); // 'mcp' | 'skill' | 'plugin'

  // 可用扩展元数据 (来自 /api/extensions)
  const [availableExtensions, setAvailableExtensions] = useState({
    mcps: [],
    skills: [],
    plugins: []
  });

  // 当前作用域配置 (来自 /api/configs)
  const [config, setConfig] = useState({
    mcpServers: [],
    mcpMode: 'inherit',
    skills: [],
    skillMode: 'inherit',
    plugins: [],
    pluginMode: 'inherit'
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState(null);

  // 1. 加载系统所有可用扩展
  useEffect(() => {
    fetch('/api/extensions')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setAvailableExtensions({
            mcps: data.mcps || [],
            skills: data.skills || [],
            plugins: data.plugins || []
          });
        }
      })
      .catch(err => console.error('[ExtensionConfig] Fetch extensions failed:', err));
  }, []);

  // 2. 切换伙伴或文件夹时，加载其当前配置
  const fetchConfig = () => {
    setLoading(true);
    const scopeId = scopeType === 'partner' ? selectedPartnerId : selectedFolder;
    fetch(`/api/configs?scopeType=${scopeType}&scopeId=${encodeURIComponent(scopeId)}`)
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.config) {
          setConfig({
            mcpServers: data.config.mcpServers || [],
            mcpMode: data.config.mcpMode || 'inherit',
            skills: data.config.skills || [],
            skillMode: data.config.skillMode || 'inherit',
            plugins: data.config.plugins || [],
            pluginMode: data.config.pluginMode || 'inherit'
          });
        }
      })
      .catch(err => console.error('[ExtensionConfig] Load config failed:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConfig();
  }, [scopeType, selectedPartnerId, selectedFolder]);

  // 3. 保存配置
  const handleSave = () => {
    setSaving(true);
    const scopeId = scopeType === 'partner' ? selectedPartnerId : selectedFolder;
    fetch('/api/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scopeType,
        scopeId,
        ...config
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setSaveToast('配置已物理保存并实时生效！');
          setTimeout(() => setSaveToast(null), 3000);
        }
      })
      .catch(err => {
        console.error('[ExtensionConfig] Save config failed:', err);
        setSaveToast('保存失败: ' + err.message);
      })
      .finally(() => setSaving(false));
  };

  // 切换 MCP 勾选
  const toggleMcp = (mcpId) => {
    setConfig(prev => {
      const exists = prev.mcpServers.includes(mcpId);
      const nextServers = exists
        ? prev.mcpServers.filter(id => id !== mcpId)
        : [...prev.mcpServers, mcpId];
      return { ...prev, mcpServers: nextServers };
    });
  };

  // 切换 Skill 勾选
  const toggleSkill = (skillId) => {
    setConfig(prev => {
      const exists = prev.skills.includes(skillId);
      const nextSkills = exists
        ? prev.skills.filter(id => id !== skillId)
        : [...prev.skills, skillId];
      return { ...prev, skills: nextSkills };
    });
  };

  // 切换 Plugin 勾选
  const togglePlugin = (pluginId) => {
    setConfig(prev => {
      const exists = prev.plugins.includes(pluginId);
      const nextPlugins = exists
        ? prev.plugins.filter(id => id !== pluginId)
        : [...prev.plugins, pluginId];
      return { ...prev, plugins: nextPlugins };
    });
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#1e1e22] text-[#e0e0e0] overflow-hidden">
      {/* 顶部标题与维度切换栏 */}
      <div className="border-b border-[#2d2d32] px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1a1a1e]">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-semibold text-white">扩展配置中心 (MCP / Skill / Plugin)</h1>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            按【伙伴】或【文件夹】分层配置运行时能力，严格遵循 Cindy 扩展隔离规范
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 维度切换器 */}
          <div className="inline-flex rounded-lg p-1 bg-[#25252a] border border-[#333338]">
            <button
              onClick={() => setScopeType('partner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'partner'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              伙伴维度
            </button>
            <button
              onClick={() => setScopeType('folder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'folder'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              文件夹维度
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg shadow transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      {/* 作用域目标选择栏 */}
      <div className="bg-[#242429] px-6 py-3 border-b border-[#2d2d32] flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-400 text-xs">当前配置对象:</span>
          {scopeType === 'partner' ? (
            <select
              value={selectedPartnerId}
              onChange={e => setSelectedPartnerId(e.target.value)}
              className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {partners.map(p => (
                <option key={p.id} value={p.id}>
                  {p.avatar || '🤖'} {p.name} ({p.id})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              placeholder="输入目标工作区文件夹绝对路径"
              className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1.5 w-72 focus:outline-none focus:border-indigo-500"
            />
          )}
        </div>

        {saveToast && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/80 px-3 py-1 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5" />
            {saveToast}
          </div>
        )}
      </div>

      {/* 三大分类 Tab */}
      <div className="flex border-b border-[#2d2d32] px-6 bg-[#1a1a1e]">
        <button
          onClick={() => setActiveTab('mcp')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'mcp'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          MCP 服务 ({config.mcpServers.length} 已选)
        </button>
        <button
          onClick={() => setActiveTab('skill')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'skill'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Zap className="w-4 h-4" />
          Skill 技能 ({config.skills.length} 已选)
        </button>
        <button
          onClick={() => setActiveTab('plugin')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'plugin'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-gray-400 hover:text-gray-200'
          }`}
        >
          <Puzzle className="w-4 h-4" />
          Plugin 插件 ({config.plugins.length} 已选)
        </button>
      </div>

      {/* 主体列表内容 */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            正在加载扩展配置...
          </div>
        ) : (
          <>
            {/* 1. MCP 服务选项卡 */}
            {activeTab === 'mcp' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-[#25252b] p-3 rounded-lg border border-[#313138]">
                  <div>
                    <div className="text-xs font-semibold text-white">生效策略 (MCP Mode)</div>
                    <div className="text-[11px] text-gray-400">选择当前层级是继承上级配置，还是自定义白名单</div>
                  </div>
                  <select
                    value={config.mcpMode}
                    onChange={e => setConfig({ ...config, mcpMode: e.target.value })}
                    className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1 focus:outline-none"
                  >
                    <option value="inherit">inherit (继承全局默认)</option>
                    <option value="allowlist">allowlist (仅启用勾选服务)</option>
                    <option value="none">none (完全禁用 MCP)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableExtensions.mcps.map(mcp => {
                    const isChecked = config.mcpServers.includes(mcp.id);
                    return (
                      <div
                        key={mcp.id}
                        onClick={() => toggleMcp(mcp.id)}
                        className={`cursor-pointer rounded-lg p-4 border transition-all ${
                          isChecked
                            ? 'bg-indigo-950/20 border-indigo-500/60 shadow-sm'
                            : 'bg-[#222227] border-[#2f2f36] hover:border-[#42424c]'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-4 h-4 accent-indigo-600 rounded"
                            />
                            <div className="font-medium text-xs text-white">{mcp.name}</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a1a1e] text-gray-400 border border-[#313138]">
                            {mcp.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2 line-clamp-2">{mcp.description}</p>
                        {mcp.tools && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {mcp.tools.map(t => (
                              <span key={t} className="text-[10px] bg-[#2a2a30] text-gray-300 px-1.5 py-0.5 rounded">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Skill 技能选项卡 */}
            {activeTab === 'skill' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-[#25252b] p-3 rounded-lg border border-[#313138]">
                  <div>
                    <div className="text-xs font-semibold text-white">技能加载策略 (Skill Mode)</div>
                    <div className="text-[11px] text-gray-400">限定当前上下文可被激活或注入的技能范围</div>
                  </div>
                  <select
                    value={config.skillMode}
                    onChange={e => setConfig({ ...config, skillMode: e.target.value })}
                    className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1 focus:outline-none"
                  >
                    <option value="inherit">inherit (继承全局技能)</option>
                    <option value="allowlist">allowlist (仅启用白名单技能)</option>
                    <option value="none">none (不加载技能)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableExtensions.skills.map(sk => {
                    const isChecked = config.skills.includes(sk.id);
                    return (
                      <div
                        key={sk.id}
                        onClick={() => toggleSkill(sk.id)}
                        className={`cursor-pointer rounded-lg p-4 border transition-all ${
                          isChecked
                            ? 'bg-indigo-950/20 border-indigo-500/60 shadow-sm'
                            : 'bg-[#222227] border-[#2f2f36] hover:border-[#42424c]'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-4 h-4 accent-indigo-600 rounded"
                            />
                            <div className="font-medium text-xs text-white">{sk.name}</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-[#1a1a1e] text-indigo-300 border border-indigo-900/50">
                            {sk.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">{sk.description}</p>
                        {sk.triggers && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {sk.triggers.map(tr => (
                              <span key={tr} className="text-[10px] bg-[#2a2a30] text-gray-300 px-1.5 py-0.5 rounded">
                                #{tr}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Plugin 插件选项卡 */}
            {activeTab === 'plugin' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-[#25252b] p-3 rounded-lg border border-[#313138]">
                  <div>
                    <div className="text-xs font-semibold text-white">插件模式 (Plugin Mode)</div>
                    <div className="text-[11px] text-gray-400">控制当前作用域可调用的 Cindy Ghost 插件集</div>
                  </div>
                  <select
                    value={config.pluginMode}
                    onChange={e => setConfig({ ...config, pluginMode: e.target.value })}
                    className="bg-[#1a1a1e] border border-[#38383e] text-white text-xs rounded-md px-3 py-1 focus:outline-none"
                  >
                    <option value="inherit">inherit (继承)</option>
                    <option value="allowlist">allowlist (白名单)</option>
                    <option value="none">none (停用所有插件)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {availableExtensions.plugins.map(plg => {
                    const isChecked = config.plugins.includes(plg.id);
                    return (
                      <div
                        key={plg.id}
                        onClick={() => togglePlugin(plg.id)}
                        className={`cursor-pointer rounded-lg p-4 border transition-all ${
                          isChecked
                            ? 'bg-indigo-950/20 border-indigo-500/60 shadow-sm'
                            : 'bg-[#222227] border-[#2f2f36] hover:border-[#42424c]'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}}
                              className="w-4 h-4 accent-indigo-600 rounded"
                            />
                            <div className="font-medium text-xs text-white">{plg.name}</div>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            v{plg.version}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-2">{plg.description}</p>
                        <div className="flex items-center justify-between mt-3 text-[10px] text-gray-500">
                          <span>作者: {plg.author}</span>
                          <span className="text-gray-400">权限: {plg.permissions?.join(', ')}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
