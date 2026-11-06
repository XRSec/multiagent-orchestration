import React, { useState, useEffect } from 'react';
import {
  Settings,
  Palette,
  KeyRound,
  Cpu,
  Keyboard,
  HardDrive,
  MessageSquare,
  CreditCard,
  Info,
  Check,
  Globe,
  Sliders,
  RefreshCw,
  ExternalLink,
  Shield,
  Layers,
  ChevronRight,
  Terminal,
  Trash2,
  Download,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { MOCK_SHORTCUTS, MOCK_USER_PROFILE } from '@/mock/settings';
import { useTheme } from '@/contexts/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';
import { AboutTab } from './components/AboutTab';
import { ModelsTab } from './components/ModelsTab';
import { ProvidersTab, type ProviderItem } from './components/ProvidersTab';
import { ProviderEditorModal } from './components/ProviderEditorModal';
import { type ProviderDraft, draftFromProvider, emptyDraft, fromModelDraft } from './components/providerDraft';
import { useToast } from '@/contexts/ToastContext';

export function SettingsPage() {
  const { isDark, toggleTheme } = useTheme();
  const { showToast } = useToast();
  const { locale, setLocale, t } = useLocale();
  const [activeTab, setActiveTab] = useState<
    'general' | 'appearance' | 'providers' | 'models' | 'shortcuts' | 'storage' | 'imbot' | 'billing' | 'about'
  >('general');

  // Appearance states
  const [fontSize, setFontSize] = useState(14);
  const [sidebarCardMode, setSidebarCardMode] = useState<'standard' | 'compact'>('standard');

  // General states
  const [autoStart, setAutoStart] = useState(true);
  const [autoUpdate, setAutoUpdate] = useState(true);

  // Storage states
  const [dbOptimized, setDbOptimized] = useState(false);

  // 运行时模型与推理配置状态 (动态读取自系统权威 models.json，零 Mock)
  const [cliModels, setCliModels] = useState<any[]>([]);
  const [cliReasoning, setCliReasoning] = useState<any[]>([
    { id: 'max', label: '极高 (64,000 tokens 预算)' },
    { id: 'high', label: '高 (32,000 tokens 预算 - 默认)' },
    { id: 'medium', label: '中 (16,384 tokens 预算)' },
    { id: 'low', label: '低 (4,096 tokens 预算)' },
  ]);
  const [selectedModel, setSelectedModel] = useState('gemini-3.8-flash');
  const [selectedReasoning, setSelectedReasoning] = useState('high');
  const [cliSourceInfo, setCliSourceInfo] = useState('~/.multiagent-orchestration/models.json');
  const [fallbackModel, setFallbackModel] = useState('gemini-3.5-flash-lite');
  const [auxiliaryModel, setAuxiliaryModel] = useState('gemini-3.8-flash');
  const [auxiliaryFallbackModel, setAuxiliaryFallbackModel] = useState('gemini-3.5-flash-lite');
  const [isSavingModels, setIsSavingModels] = useState(false);

  // Providers states
  const [providers, setProviders] = useState<any[]>([]);
  const [editorDraft, setEditorDraft] = useState<ProviderDraft | null>(null);
  const [savingProvider, setSavingProvider] = useState(false);

  const loadProviders = React.useCallback(async () => {
    try {
      const res = await fetch('/api/config/providers');
      const data = await res.json();
      if (data.ok && data.providers) {
        const list = Object.entries(data.providers).map(([k, v]: [string, any]) => ({
          id: k,
          name: v.name || k,
          baseUrl: v.baseUrl || '',
          apiKey: v.apiKey || '',
          models: Array.isArray(v.models) ? v.models : [],
          icon: k === 'anthropic' ? '⚡' : '🧠'
        }));
        setProviders(list);
      }
    } catch (err) {
      console.warn('Load providers error:', err);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const handleSaveProvider = async () => {
    if (!editorDraft) return;
    const payload = {
      providerId: editorDraft.id,
      name: editorDraft.name,
      baseUrl: editorDraft.baseUrl,
      apiKey: editorDraft.apiKey,
      models: editorDraft.models.map(fromModelDraft),
    };
    try {
      setSavingProvider(true);
      const res = await fetch('/api/config/providers', {
        method: editorDraft.isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast(`已写入 models.json：${editorDraft.name}`, 'success');
      setEditorDraft(null);
      loadProviders();
      loadModelConfig(true);
    } catch (err: any) {
      showToast(`保存失败: ${err.message}`, 'error');
    } finally {
      setSavingProvider(false);
    }
  };

  const handleDeleteProvider = async (p: ProviderItem) => {
    if (!confirm(`确定从 models.json 中删除供应商「${p.name}」及其 ${p.models.length} 个模型吗？`)) return;
    try {
      const res = await fetch(`/api/config/providers/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      showToast(`已删除供应商「${p.name}」`, 'success');
      loadProviders();
      loadModelConfig(true);
    } catch (err: any) {
      showToast(`删除失败: ${err.message}`, 'error');
    }
  };

  const handleToggleProviderModel = async (p: ProviderItem, modelId: string, enabled: boolean) => {
    const nextModels = (p.models || []).map((m: any) => {
      const obj = typeof m === 'string' ? { id: m, name: m } : { ...m };
      if (obj.id === modelId) {
        return { ...obj, enabled };
      }
      return obj;
    });
    try {
      const res = await fetch('/api/config/providers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: p.id,
          models: nextModels,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      loadProviders();
      loadModelConfig(true);
    } catch (err: any) {
      showToast(`更新模型状态失败: ${err.message}`, 'error');
    }
  };

  const handleRefreshProviderModels = async (p: ProviderItem) => {
    try {
      const res = await fetch('/api/config/providers/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: p.id, baseUrl: p.baseUrl, apiKey: p.apiKey }),
      });
      const data = await res.json();
      if (!data.ok || !Array.isArray(data.models)) {
        showToast(data.detail || '该网关未返回新模型，可在「管理」中手动添加', 'info');
        return;
      }
      const existingIds = new Set((p.models || []).map((m: any) => (typeof m === 'string' ? m : m.id)));
      const merged = [...(p.models || [])];
      let added = 0;
      for (const fm of data.models) {
        if (!existingIds.has(fm.id)) {
          merged.push({
            id: fm.id,
            name: fm.name || fm.id,
            contextWindow: fm.contextWindow || 200000,
            maxTokens: 64000,
            reasoning: true,
            enabled: true,
          });
          added++;
        }
      }
      if (added > 0) {
        await fetch('/api/config/providers', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId: p.id, models: merged }),
        });
        loadProviders();
        loadModelConfig(true);
        showToast(`已从网关同步新增 ${added} 个模型`, 'success');
      } else {
        showToast(`模型列表已是最新（共 ${merged.length} 个模型）`, 'success');
      }
    } catch (err: any) {
      showToast(`刷新模型失败: ${err.message}`, 'error');
    }
  };

  const handleImportProvidersFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const importedProviders = parsed.providers || (parsed.id && parsed.baseUrl ? { [parsed.id]: parsed } : null);
      if (!importedProviders || typeof importedProviders !== 'object') {
        throw new Error('JSON 文件中未找到有效的 providers 结构');
      }
      for (const [pId, pVal] of Object.entries(importedProviders) as [string, any][]) {
        const exists = providers.some((x) => x.id === pId);
        await fetch('/api/config/providers', {
          method: exists ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providerId: pId,
            name: pVal.name || pId,
            baseUrl: pVal.baseUrl,
            apiKey: pVal.apiKey || '',
            models: Array.isArray(pVal.models) ? pVal.models : [],
          }),
        });
      }
      loadProviders();
      loadModelConfig(true);
      showToast(`已成功从 ${file.name} 导入供应商配置！`, 'success');
    } catch (err: any) {
      showToast(`导入失败: ${err.message}`, 'error');
    }
  };

  const handleSaveModelPreferences = async () => {
    try {
      setIsSavingModels(true);
      const res = await fetch('/api/config/models', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeDefaultModel: selectedModel,
          primaryModel: selectedModel,
          fallbackModel,
          primaryFallbackModel: fallbackModel,
          auxiliaryModel,
          auxiliaryFallbackModel,
          defaultReasoning: selectedReasoning,
        }),
      });
      const data = await res.json();
      if (data.ok || data.activeDefaultModel) {
        showToast('模型与推理配置已成功持久化保存！', 'success');
      }
    } catch (err: any) {
      showToast(`保存模型配置失败: ${err.message}`, 'error');
    } finally {
      setIsSavingModels(false);
    }
  };

  const loadModelConfig = React.useCallback(async (modelsOnly = false) => {
    try {
      const res = await fetch('/api/config/models');
      const data = await res.json();
      if (!data.ok) return;
      if (Array.isArray(data.models) && data.models.length > 0) setCliModels(data.models);
      if (data.sourceFile) setCliSourceInfo(data.sourceFile);
      if (modelsOnly) return;
      if (Array.isArray(data.reasoningEfforts) && data.reasoningEfforts.length > 0) setCliReasoning(data.reasoningEfforts);
      if (data.activeDefaultModel) setSelectedModel(data.activeDefaultModel);
      if (data.fallbackModel) setFallbackModel(data.fallbackModel);
      if (data.auxiliaryModel) setAuxiliaryModel(data.auxiliaryModel);
      if (data.auxiliaryFallbackModel) setAuxiliaryFallbackModel(data.auxiliaryFallbackModel);
      if (data.defaultReasoning) setSelectedReasoning(data.defaultReasoning);
    } catch (err) {
      console.warn('Load models error:', err);
    }
  }, []);

  useEffect(() => {
    loadModelConfig();
  }, [loadModelConfig]);

  const tabs = [
    { id: 'general', label: '通用', icon: Settings },
    { id: 'appearance', label: '外观与主题', icon: Palette },
    { id: 'providers', label: '模型供应商', icon: KeyRound },
    { id: 'models', label: '模型与推理', icon: Cpu },
    { id: 'shortcuts', label: '快捷键', icon: Keyboard },
    { id: 'storage', label: '存储与数据', icon: HardDrive },
    { id: 'imbot', label: 'IM 机器人', icon: MessageSquare },
    { id: 'billing', label: '配额与账单', icon: CreditCard },
    { id: 'about', label: '关于平台', icon: Info },
  ];

  return (
    <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden select-none bg-surface">
      {/* 1. Official Settings Sidebar / Horizontal Mobile Tabs Nav */}
      <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border-default bg-surface-elevated/40 p-2 md:p-3 overflow-x-auto md:overflow-y-auto shrink-0 flex md:flex-col gap-1 items-center md:items-stretch scrollbar-none">
        <div className="hidden md:block px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          系统设置
        </div>
        <div className="flex md:flex-col gap-1 w-full shrink-0">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`shrink-0 md:w-full flex items-center gap-1.5 md:gap-2.5 px-3 py-1.5 md:py-2 rounded-xl text-xs font-medium transition-colors text-left cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-surface-chip text-text-primary shadow-sm font-semibold'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon className="w-3.5 md:w-4 h-3.5 md:h-4 shrink-0 text-text-secondary" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Official Settings Content Canvas */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6 max-w-3xl w-full">
        {/* ========================================================= */}
        {/* TAB 1: General (通用)                                     */}
        {/* ========================================================= */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">通用设置</h2>
              <p className="text-xs text-text-secondary mt-0.5">配置客户端的基础语言、自动启动与更新偏好</p>
            </div>

            {/* Section: 基础环境 */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                基础环境
              </div>
              <div className="flex flex-col rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
                  <div>
                    <div className="text-xs font-medium text-text-primary">界面显示语言 (Language)</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">选择主界面与系统提示的默认语言</div>
                  </div>
                  <select
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as any)}
                    className="bg-surface border border-border-default px-3 py-1.5 rounded-xl text-xs text-text-primary focus:outline-none"
                  >
                    <option value="zh-CN">简体中文 (Chinese Simplified)</option>
                    <option value="en-US">English (US)</option>
                  </select>
                </div>

                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
                  <div>
                    <div className="text-xs font-medium text-text-primary">开机自动启动</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">系统登录后自动在后台保持会话就绪</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoStart}
                    onChange={(e) => setAutoStart(e.target.checked)}
                    className="w-4 h-4 accent-accent-blue cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <div className="text-xs font-medium text-text-primary">自动检查并提醒更新</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">检测到正式版或测试通道新版本时在侧栏提示</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={autoUpdate}
                    onChange={(e) => setAutoUpdate(e.target.checked)}
                    className="w-4 h-4 accent-accent-blue cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: Appearance (外观与主题)                            */}
        {/* ========================================================= */}
        {activeTab === 'appearance' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">外观与主题</h2>
              <p className="text-xs text-text-secondary mt-0.5">
                深色与浅色双模色阶切换、排版字阶与侧边栏展示偏好
              </p>
            </div>

            {/* Official Theme Selection Cards */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                配色方案 (Color Schemes)
              </div>
              <div className="grid grid-cols-2 gap-3.5">
                {/* Cindy Dark */}
                <div
                  onClick={() => !isDark && toggleTheme()}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    isDark
                      ? 'border-accent-blue bg-surface-elevated shadow-md'
                      : 'border-border-default bg-surface hover:border-text-tertiary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-primary">Cindy Dark (官方深色)</span>
                    {isDark && <CheckCircle2 className="w-4 h-4 text-accent-blue" />}
                  </div>
                  <div className="h-10 w-full bg-[#181818] rounded-xl border border-white/10 flex items-center justify-between px-3 text-[11px] text-white/80 font-mono">
                    <span>#181818</span>
                    <span className="text-[10px] text-white/50">中性近黑底</span>
                  </div>
                </div>

                {/* Cindy Light */}
                <div
                  onClick={() => isDark && toggleTheme()}
                  className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                    !isDark
                      ? 'border-accent-blue bg-surface-elevated shadow-md'
                      : 'border-border-default bg-surface hover:border-text-tertiary'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-text-primary">Cindy Light (暖象牙浅色)</span>
                    {!isDark && <CheckCircle2 className="w-4 h-4 text-accent-blue" />}
                  </div>
                  <div className="h-10 w-full bg-[#F2F2ED] rounded-xl border border-black/10 flex items-center justify-between px-3 text-[11px] text-black/80 font-mono">
                    <span>#F2F2ED</span>
                    <span className="text-[10px] text-black/50">暖象牙底色</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Font & Scaling */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">
                字体与排版
              </div>
              <div className="flex flex-col rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
                  <div>
                    <div className="text-xs font-medium text-text-primary">正文字号大小</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">调整会话列表与对话消息的基础展示字号</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={12}
                      max={18}
                      value={fontSize}
                      onChange={(e) => setFontSize(Number(e.target.value))}
                      className="accent-accent-blue cursor-pointer w-24"
                    />
                    <span className="text-xs font-mono font-bold text-text-primary w-8 text-right">
                      {fontSize}px
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between px-4 py-3.5">
                  <div>
                    <div className="text-xs font-medium text-text-primary">侧边栏紧凑模式</div>
                    <div className="text-[11px] text-text-tertiary mt-0.5">缩小侧边栏条目内边距以在纵向显示更多历史会话</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sidebarCardMode === 'compact'}
                    onChange={(e) => setSidebarCardMode(e.target.checked ? 'compact' : 'standard')}
                    className="w-4 h-4 accent-accent-blue cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: Providers (模型供应商与真实网关持久化)             */}
        {/* ========================================================= */}
        {activeTab === 'providers' && (
          <ProvidersTab
            providers={providers}
            sourceFile={cliSourceInfo}
            onAdd={() => setEditorDraft(emptyDraft())}
            onEdit={(p) => setEditorDraft(draftFromProvider(p))}
            onDelete={handleDeleteProvider}
            onToggleModel={handleToggleProviderModel}
            onRefreshModels={handleRefreshProviderModels}
            onImportJsonFile={handleImportProvidersFile}
          />
        )}

        {editorDraft && (
          <ProviderEditorModal
            draft={editorDraft}
            existingIds={providers.map((p) => p.id)}
            saving={savingProvider}
            onChange={setEditorDraft}
            onCancel={() => setEditorDraft(null)}
            onSave={handleSaveProvider}
          />
        )}

        {/* ========================================================= */}
        {/* TAB 4: Models (模型与推理设置 - 基于 Claude Code CLI 读取)  */}
        {/* ========================================================= */}
        {activeTab === 'models' && (
          <ModelsTab
            cliSourceInfo={cliSourceInfo}
            cliModels={cliModels}
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            cliReasoning={cliReasoning}
            selectedReasoning={selectedReasoning}
            onSelectReasoning={setSelectedReasoning}
            fallbackModel={fallbackModel}
            onChangeFallbackModel={setFallbackModel}
            auxiliaryModel={auxiliaryModel}
            onChangeAuxiliaryModel={setAuxiliaryModel}
            auxiliaryFallbackModel={auxiliaryFallbackModel}
            onChangeAuxiliaryFallbackModel={setAuxiliaryFallbackModel}
            onSave={handleSaveModelPreferences}
            isSaving={isSavingModels}
          />
        )}

        {/* ========================================================= */}
        {/* TAB 5: Shortcuts (快捷键)                                 */}
        {/* ========================================================= */}
        {activeTab === 'shortcuts' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">键盘快捷键</h2>
              <p className="text-xs text-text-secondary mt-0.5">常用全局导航与消息操作快捷键</p>
            </div>

            <div className="flex flex-col rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <tbody className="divide-y divide-border-subtle text-text-secondary">
                  {MOCK_SHORTCUTS.map((s, idx) => (
                    <tr key={idx} className="hover:bg-surface-hover/50">
                      <td className="px-4 py-3.5 text-text-primary font-medium">{s.action}</td>
                      <td className="px-4 py-3.5 text-right">
                        <kbd className="px-2.5 py-1 bg-surface-chip border border-border-default rounded-md font-mono text-[11px] text-text-primary">
                          {s.shortcut}
                        </kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 6: Storage (存储与数据)                               */}
        {/* ========================================================= */}
        {activeTab === 'storage' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">存储与缓存管理</h2>
              <p className="text-xs text-text-secondary mt-0.5">管理本地 SQLite 数据库、媒体快照与日志空间</p>
            </div>

            <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-sm space-y-4 text-xs">
              <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
                <div>
                  <div className="font-bold text-text-primary">本地会话与工作区数据库</div>
                  <div className="text-text-tertiary font-mono text-[11px]">~/Library/Application Support/Cindy/local.db</div>
                </div>
                <span className="text-sm font-bold font-mono text-text-primary">142.8 MB</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-text-primary">执行 SQLite WAL 压缩与清理碎片</div>
                  <div className="text-[11px] text-text-tertiary">清理已删除会话占用的未回收空间</div>
                </div>
                <button
                  onClick={() => {
                    setDbOptimized(true);
                    setTimeout(() => setDbOptimized(false), 2000);
                  }}
                  className="px-3 py-1.5 bg-surface hover:bg-surface-hover border border-border-default rounded-xl font-medium text-text-primary transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${dbOptimized ? 'animate-spin' : ''}`} />
                  <span>{dbOptimized ? '已完成压缩' : '立即优化'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 7: IM Bot (即时通讯平台集成)                          */}
        {/* 自动任务（未来计划）: 规划接入长轮询/Webhook 消息自动消费、IM 会话异步投递及定时汇报任务 */}
        {/* ========================================================= */}
        {activeTab === 'imbot' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text-primary">即时通讯 (IM) 机器人对接</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  自动任务（未来计划）
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">让 AI 伙伴直接入驻企业协同软件群聊与私聊</p>
            </div>

            <div className="grid grid-cols-2 gap-3.5 text-xs">
              <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-text-primary">
                    <span>🕊️ 飞书 (Lark) 机器人</span>
                  </div>
                  <span className="text-[10px] font-mono text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-full">
                    CONNECTED
                  </span>
                </div>
                <p className="text-text-secondary text-[11px]">
                  已连接至「Cindy 研发协同群」，支持自动同步待办与代码评审卡片。
                </p>
              </div>

              <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-text-primary">
                    <span>💬 企业微信 / 微信</span>
                  </div>
                  <span className="text-[10px] font-mono text-text-tertiary bg-surface-chip px-2 py-0.5 rounded-full">
                    未配置
                  </span>
                </div>
                <p className="text-text-secondary text-[11px]">
                  支持通过企微自建应用或 iLink 协议接收工作区警报与离线指令。
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 8: Billing (配额与用量)                               */}
        {/* 自动任务（未来计划）: 规划接入每日用量自动对账、额度预警阈值自动触发及周度账单邮件自动生成任务 */}
        {/* ========================================================= */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text-primary">配额与用量统计</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  自动任务（未来计划）
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-0.5">当前方案 Token 消耗速率及账单明细</p>
            </div>

            <div className="p-5 bg-surface-elevated border border-border-default rounded-2xl shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-text-primary">{MOCK_USER_PROFILE.plan}</div>
                  <div className="text-xs text-text-tertiary">每月自动重置配额 · 下次结算日期 2026-11-28</div>
                </div>
                <span className="text-xs font-mono text-accent-green bg-accent-green/10 px-2.5 py-1 rounded-full font-semibold">
                  ACTIVE
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-text-secondary">
                  <span>当月 Token 消耗</span>
                  <span className="font-mono text-text-primary font-bold">1.82M / 5.00M (36%)</span>
                </div>
                <div className="h-2 bg-surface-chip rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue rounded-full w-[36%]" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 9: About (关于 Cindy)                                 */}
        {/* ========================================================= */}
        {activeTab === 'about' && <AboutTab />}
      </div>
    </div>
  );
}
