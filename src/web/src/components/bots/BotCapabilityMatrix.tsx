/**
 * Purpose: Visual 4-tier capability and permission matrix component for bot configurations.
 * Context: Cindy-aligned companion governance matrix (Chat-only, Config, Basic, Full Access).
 * Usage: Rendered within BotSettingsSubpages or standalone companion settings dialogs.
 * Prerequisites: React, lucide-react, Tailwind CSS design tokens.
 */

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Sliders,
  ShieldCheck,
  Zap,
  ChevronDown,
  ChevronRight,
  Package,
  Sparkles,
  Check,
  AlertTriangle
} from 'lucide-react';

export type PermissionLevel = 'chat' | 'config' | 'basic' | 'full';

export interface BotCapabilityData {
  permissionLevel?: PermissionLevel;
  tools?: string[];
  skills?: string[];
  mcpServers?: Record<string, any>;
  model?: string;
  effort?: string;
}

export interface BotCapabilityMatrixProps {
  botId: string;
  initialCapabilities?: BotCapabilityData;
  onSaveSuccess?: (updated: BotCapabilityData) => void;
}

interface TierInfo {
  id: PermissionLevel;
  name: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  defaultTools: string[];
}

const TIERS: TierInfo[] = [
  {
    id: 'chat',
    name: '仅聊天 (Chat-only)',
    subtitle: '隔离沙箱，禁用终端与写文件，纯自然语言问答交互',
    icon: MessageSquare,
    accentColor: 'text-accent-blue bg-accent-blue/10 border-accent-blue/30',
    defaultTools: ['send_message']
  },
  {
    id: 'config',
    name: '配置管理 (Config)',
    subtitle: '专注人设调优、MCP 与 Skill 启停，不执行工程代码操作',
    icon: Sliders,
    accentColor: 'text-accent-purple bg-accent-purple/10 border-accent-purple/30',
    defaultTools: ['send_message', 'manage_task']
  },
  {
    id: 'basic',
    name: '基础只读 (Basic)',
    subtitle: '允许只读检索（读文件/目录检索），物理阻断修改与写操作',
    icon: ShieldCheck,
    accentColor: 'text-accent-green bg-accent-green/10 border-accent-green/30',
    defaultTools: ['read_file', 'send_message', 'manage_task']
  },
  {
    id: 'full',
    name: '全部权限 (Full Access)',
    subtitle: '开发者完全授权，放行工作区所有修改、代码编写与终端指令',
    icon: Zap,
    accentColor: 'text-accent-orange bg-accent-orange/10 border-accent-orange/30',
    defaultTools: ['read_file', 'write_file', 'edit_file', 'run_command', 'send_message', 'manage_task']
  }
];

const AVAILABLE_TOOLS = [
  { id: 'read_file', label: '读取文件 (read_file)', desc: '查看文件正文内容' },
  { id: 'write_file', label: '新建与写入 (write_file)', desc: '在磁盘创建新文件' },
  { id: 'edit_file', label: '原子替换 (edit_file)', desc: '修改局部文件代码' },
  { id: 'run_command', label: '运行命令 (run_command)', desc: '在指定沙箱内执行命令' },
  { id: 'send_message', label: '发送消息 (send_message)', desc: '向其他伙伴投递消息' },
  { id: 'manage_task', label: '任务调度 (manage_task)', desc: '管理后台子任务生命周期' }
];

export function BotCapabilityMatrix({
  botId,
  initialCapabilities,
  onSaveSuccess
}: BotCapabilityMatrixProps) {
  const [level, setLevel] = useState<PermissionLevel>(
    initialCapabilities?.permissionLevel || 'full'
  );
  const [tools, setTools] = useState<string[]>(
    initialCapabilities?.tools || ['read_file', 'write_file', 'edit_file', 'run_command']
  );
  const [skills, setSkills] = useState<string[]>(
    initialCapabilities?.skills || ['script-standards']
  );
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [isSkillsOpen, setIsSkillsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (initialCapabilities) {
      if (initialCapabilities.permissionLevel) setLevel(initialCapabilities.permissionLevel);
      if (initialCapabilities.tools) setTools(initialCapabilities.tools);
      if (initialCapabilities.skills) setSkills(initialCapabilities.skills);
    }
  }, [initialCapabilities]);

  const handleSelectTier = (tierId: PermissionLevel) => {
    setLevel(tierId);
    const tier = TIERS.find((t) => t.id === tierId);
    if (tier) {
      setTools(tier.defaultTools);
    }
  };

  const toggleTool = (toolId: string) => {
    setTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const payload: BotCapabilityData = {
        permissionLevel: level,
        tools,
        skills,
        mcpServers: initialCapabilities?.mcpServers || {}
      };
      const res = await fetch(`/api/bots/${encodeURIComponent(botId)}/capabilities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capabilities: payload })
      });
      if (res.ok) {
        setSaveStatus('success');
        onSaveSuccess?.(payload);
        setTimeout(() => setSaveStatus(null), 2500);
      } else {
        setSaveStatus('error');
      }
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 text-xs text-text-primary">
      <div>
        <h4 className="text-sm font-bold tracking-tight">四级能力与权限矩阵 (Cindy 规范)</h4>
        <p className="text-text-tertiary text-[11px] mt-0.5">
          设置该伙伴的物理执行边界与权限层级，变更即时持久化到专属沙箱。
        </p>
      </div>

      {/* 1. 四档卡片选择器 */}
      <div className="grid grid-cols-1 gap-2.5">
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          const isSelected = level === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => handleSelectTier(tier.id)}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                isSelected
                  ? 'bg-surface-elevated border-accent-cta ring-1 ring-accent-cta/50 shadow-sm'
                  : 'bg-surface-base border-border-default hover:border-border-hover'
              }`}
            >
              <div
                className={`p-2 rounded-xl flex-shrink-0 mt-0.5 border ${
                  isSelected ? tier.accentColor : 'bg-surface-elevated text-text-tertiary border-border-default'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-text-primary">{tier.name}</span>
                  {isSelected && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-accent-cta">
                      <Check className="w-3 h-3" /> ACTIVE
                    </span>
                  )}
                </div>
                <p className="text-text-secondary text-[11px] mt-0.5 leading-relaxed">
                  {tier.subtitle}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 2. 工具集白名单折叠面板 */}
      <div className="border border-border-default rounded-2xl bg-surface-base overflow-hidden">
        <button
          type="button"
          onClick={() => setIsToolsOpen(!isToolsOpen)}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-text-tertiary" />
            <span className="font-bold text-xs">细粒度工具白名单 ({tools.length} 项已启用)</span>
          </div>
          {isToolsOpen ? (
            <ChevronDown className="w-4 h-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-tertiary" />
          )}
        </button>

        {isToolsOpen && (
          <div className="p-3.5 pt-0 border-t border-border-default/60 space-y-2 mt-2">
            {AVAILABLE_TOOLS.map((t) => {
              const checked = tools.includes(t.id);
              return (
                <label
                  key={t.id}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-elevated cursor-pointer"
                >
                  <div>
                    <div className="font-mono text-xs text-text-primary font-medium">{t.label}</div>
                    <div className="text-[10px] text-text-tertiary">{t.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTool(t.id)}
                    className="w-4 h-4 rounded text-accent-cta focus:ring-accent-cta cursor-pointer"
                  />
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. 挂载 Skills 折叠面板 */}
      <div className="border border-border-default rounded-2xl bg-surface-base overflow-hidden">
        <button
          type="button"
          onClick={() => setIsSkillsOpen(!isSkillsOpen)}
          className="w-full p-3.5 flex items-center justify-between text-left hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-text-tertiary" />
            <span className="font-bold text-xs">挂载系统 Skills ({skills.length} 项已绑定)</span>
          </div>
          {isSkillsOpen ? (
            <ChevronDown className="w-4 h-4 text-text-tertiary" />
          ) : (
            <ChevronRight className="w-4 h-4 text-text-tertiary" />
          )}
        </button>

        {isSkillsOpen && (
          <div className="p-3.5 pt-0 border-t border-border-default/60 space-y-1.5 mt-2">
            {skills.map((s) => (
              <div
                key={s}
                className="p-2 bg-surface-elevated rounded-xl flex items-center justify-between font-mono text-[11px]"
              >
                <span>@{s}</span>
                <span className="text-[10px] text-accent-green font-bold">MOUNTED</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. 保存提交按钮 */}
      <div className="pt-2">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm cursor-pointer disabled:opacity-50"
        >
          {saving ? '正在写入沙箱配置...' : '保存权限与能力配置'}
        </button>

        {saveStatus === 'success' && (
          <p className="text-center text-[11px] text-accent-green font-medium mt-2">
            ✓ 能力矩阵已成功持久化至 `Customizations/agents/{botId}/capabilities.json`
          </p>
        )}
        {saveStatus === 'error' && (
          <p className="text-center text-[11px] text-accent-red font-medium mt-2 flex items-center justify-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> 保存失败，请核查后端网关连接
          </p>
        )}
      </div>
    </div>
  );
}
