/**
 * PartnerCreateDialog.jsx
 * Cindy 风格「新建专属伙伴」模态向导：
 * 支持伙伴名称、英文 ID、角色专长、底层模型、图标/主题色选择及双平面沙箱 SOUL.md 自动生成。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  Bot,
  Shield,
  Cpu,
  Terminal,
  Sparkles,
  Code2,
  Flame,
  Search,
  Check,
  AlertCircle,
  FolderGit2,
} from 'lucide-react';

const AVATAR_OPTIONS = [
  { id: 'Bot', icon: Bot, label: '通用智能' },
  { id: 'Shield', icon: Shield, label: '安全审计' },
  { id: 'Cpu', icon: Cpu, label: '架构核心' },
  { id: 'Terminal', icon: Terminal, label: '系统运维' },
  { id: 'Sparkles', icon: Sparkles, label: '灵感助手' },
  { id: 'Code2', icon: Code2, label: '代码工程' },
  { id: 'Flame', icon: Flame, label: '敏捷调试' },
  { id: 'Search', icon: Search, label: '情报研究' },
];

const COLOR_OPTIONS = [
  { hex: '#38bdf8', label: '天蓝' },
  { hex: '#a855f7', label: '紫晶' },
  { hex: '#10b981', label: '翡翠' },
  { hex: '#f43f5e', label: '玫瑰' },
  { hex: '#f59e0b', label: '琥珀' },
  { hex: '#6366f1', label: '靛蓝' },
];

const MODEL_OPTIONS = [
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', desc: '强推理与实时双向交互 (推荐)' },
  { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', desc: '极致速度与代码生成' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', desc: '深层次架构拆解与形式化验证' },
];

export default function PartnerCreateDialog({
  isOpen,
  onClose,
  existingPartners = [],
  onCreatePartner,
}) {
  const [name, setName] = useState('');
  const [slugId, setSlugId] = useState('');
  const [role, setRole] = useState('');
  const [model, setModel] = useState('claude-3-7-sonnet');
  const [avatar, setAvatar] = useState('Bot');
  const [avatarColor, setAvatarColor] = useState('#38bdf8');
  const [summary, setSummary] = useState('');
  const [allowBash, setAllowBash] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // 每次打开重置状态
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSlugId('');
      setRole('');
      setModel('claude-3-7-sonnet');
      setAvatar('Bot');
      setAvatarColor('#38bdf8');
      setSummary('');
      setAllowBash(false);
      setErrorMessage('');
    }
  }, [isOpen]);

  // ESC 键监听
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // 伙伴名称修改时自动建议 slug ID（若用户未手动修改）
  const handleNameChange = (val) => {
    setName(val);
    setErrorMessage('');
    const suggestedSlug = val
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (suggestedSlug && !slugId.includes('-custom')) {
      setSlugId(suggestedSlug);
    }
  };

  // 生成初始 SOUL.md 模板
  const generateSoulTemplate = (idVal, nameVal, roleVal) => {
    const safeId = idVal || 'new-partner';
    return `---
doc_id: ${safeId.toUpperCase().replace(/-/g, '_')}_SOUL
version: 1.0.0
type: PARTNER_SOUL_AST
parent_node: ../../prompts/00-harness-injection.md
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
${allowBash ? '  - Bash\n' : ''}---

# [0] ROOT: ${nameVal.toUpperCase() || 'CUSTOM PARTNER'} IDENTITY & BOUNDARIES

* **[1] ROLE & JURISDICTION**
  * **[1.1] Identity**: ${nameVal || 'Custom Partner'} (\`${safeId}\`).
  * **[1.2] Responsibility**: ${roleVal || 'Specialized domain tasks and collaborative multi-agent execution'}.
  * **[1.3] Sandbox Boundary**: Strictly confined within \`~/.multiagent-orchestration/partners/${safeId}/workspace\`.
`;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedId = slugId.trim().toLowerCase();
    const trimmedRole = role.trim();

    if (!trimmedName) {
      setErrorMessage('请输入伙伴名称');
      return;
    }
    if (!trimmedId) {
      setErrorMessage('请输入伙伴标识 ID');
      return;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmedId)) {
      setErrorMessage('伙伴标识 ID 仅支持小写字母、数字及中划线 (如: security-auditor)');
      return;
    }
    if (existingPartners.some((p) => p.id === trimmedId)) {
      setErrorMessage(`标识 ID "${trimmedId}" 已存在，请更换`);
      return;
    }
    if (!trimmedRole) {
      setErrorMessage('请输入伙伴角色定位');
      return;
    }

    const soulMd = generateSoulTemplate(trimmedId, trimmedName, trimmedRole);
    const memoryMd = `# [0] ROOT: ${trimmedId.toUpperCase()} MEMORY INDEX\n\n* **[1] VERIFIED FACTS** (Max 200 lines / 25KB)\n  * [1.1] 伙伴于 ${new Date().toLocaleDateString()} 成功初始化。\n`;

    const newPartner = {
      id: trimmedId,
      name: trimmedName,
      role: trimmedRole,
      avatar,
      avatarColor,
      isLead: false,
      status: 'idle',
      queueCount: 0,
      model,
      summaryForLead: summary.trim() || `${trimmedName}：负责 ${trimmedRole}。`,
      identitySource: soulMd,
      capabilities: {
        permissions: 'auto',
        skills: [`${trimmedId}-core-skill`],
        skillMode: 'inherit',
        mcpServers: ['cindy-memory'],
        mcpMode: 'inherit',
        toolsets: allowBash ? ['filesystem', 'bash-sandbox'] : ['filesystem'],
        toolsetMode: 'inherit',
        plugins: [],
        pluginMode: 'inherit'
      },
      soulMd,
      memoryMd,
      skills: [
        {
          id: `${trimmedId}-core-skill`,
          name: `${trimmedName} 核心执行引擎`,
          category: 'domain',
          enabled: true,
          description: `为当前群聊与 1:1 私聊提供 ${trimmedRole} 支持。`,
        },
      ],
      sandboxPaths: {
        runtimeCwd: `~/.multiagent-orchestration/partners/${trimmedId}/workspace`,
        buildTimePlane: `/packages/runtime-assets/builtin-partners/${trimmedId}`,
        isSymlinked: true,
        allowedTools: allowBash ? ['Read', 'Write', 'Edit', 'Glob', 'Bash'] : ['Read', 'Write', 'Edit', 'Glob'],
        disallowedTools: allowBash ? ['Agent'] : ['Agent', 'Bash'],
        statelessByDefault: true,
        maxTurns: 20,
        maxBudgetUsd: 3.0,
      },
    };

    onCreatePartner(newPartner);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-surface border border-border/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-slate-900/60">
          <div className="flex items-center space-x-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center border"
              style={{
                backgroundColor: `${avatarColor}20`,
                borderColor: `${avatarColor}50`,
                color: avatarColor,
              }}
            >
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">新建专属 Agent 伙伴</h2>
              <p className="text-[11px] text-slate-400">配置独立 SOUL 人格、双平面沙箱与专属技能集</p>
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

          {/* 基本信息：名称与 ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">
                伙伴显示名称 <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="例如：安全合规审计伙伴"
                className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent transition-all"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">
                标识 ID (英文 Slug) <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={slugId}
                onChange={(e) => {
                  setSlugId(e.target.value);
                  setErrorMessage('');
                }}
                placeholder="security-compliance-auditor"
                className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs font-mono text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-accent transition-all"
              />
            </div>
          </div>

          {/* 角色定位 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">
              角色职责定位 (Role) <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setErrorMessage('');
              }}
              placeholder="例如：专注 AST 静态分析与二进制协议权限安全审计"
              className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent transition-all"
            />
          </div>

          {/* 底座模型 */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-200">底层模型选择</label>
            <div className="grid grid-cols-3 gap-2">
              {MODEL_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                    model === m.id
                      ? 'bg-accent/15 border-accent text-accent'
                      : 'bg-card/40 border-border/70 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-medium text-slate-200">{m.name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{m.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 头像与主题色选择 */}
          <div className="grid grid-cols-2 gap-4 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">图标外观</label>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = avatar === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAvatar(opt.id)}
                      title={opt.label}
                      className={`h-9 flex items-center justify-center rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-border/60 bg-card/40 text-slate-400 hover:text-slate-200 hover:bg-card/70'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-200">主题配色</label>
              <div className="flex items-center space-x-2 h-9">
                {COLOR_OPTIONS.map((c) => {
                  const isSelected = avatarColor === c.hex;
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setAvatarColor(c.hex)}
                      title={c.label}
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                        isSelected ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-slate-950 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 统筹主控摘要 */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-medium text-slate-200">
              群聊主调度摘要 (summaryForLead)
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="主调度用于判断何时派发任务给此伙伴的语义指引"
              className="w-full bg-card/60 border border-border/80 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-accent transition-all"
            />
          </div>

          {/* 双平面隔离沙箱与权限配置 */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-border/70 space-y-2">
            <div className="flex items-center space-x-2 text-xs font-medium text-slate-300">
              <FolderGit2 className="w-4 h-4 text-accent" />
              <span>双平面沙箱自动隔离配置</span>
            </div>
            <div className="text-[11px] font-mono text-slate-500">
              工作区路径：~/.multiagent-orchestration/partners/{slugId || '<id>'}/workspace
            </div>

            <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={allowBash}
                onChange={(e) => setAllowBash(e.target.checked)}
                className="w-3.5 h-3.5 rounded bg-card border-slate-600 text-accent focus:ring-accent"
              />
              <span>赋予受控 Bash 执行权限 (默认仅限只读与代码编辑工具)</span>
            </label>
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
            创建专属伙伴
          </button>
        </div>
      </div>
    </div>
  );
}
