import React, { useState } from 'react';
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
import { MOCK_PROVIDERS, MOCK_SHORTCUTS, MOCK_USER_PROFILE } from '@/mock/settings';
import { useTheme } from '@/contexts/ThemeContext';
import { useLocale } from '@/contexts/LocaleContext';

export function SettingsPage() {
  const { isDark, toggleTheme } = useTheme();
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

  const tabs = [
    { id: 'general', label: '通用', icon: Settings },
    { id: 'appearance', label: '外观与主题', icon: Palette },
    { id: 'providers', label: '模型供应商', icon: KeyRound },
    { id: 'models', label: '模型与推理', icon: Cpu },
    { id: 'shortcuts', label: '快捷键', icon: Keyboard },
    { id: 'storage', label: '存储与数据', icon: HardDrive },
    { id: 'imbot', label: 'IM 机器人', icon: MessageSquare },
    { id: 'billing', label: '配额与账单', icon: CreditCard },
    { id: 'about', label: '关于 Cindy', icon: Info },
  ];

  return (
    <div className="flex-1 flex h-full overflow-hidden select-none bg-surface">
      {/* 1. Official Settings Sidebar Nav */}
      <div className="w-56 border-r border-border-default bg-surface-elevated/40 p-3 space-y-1 overflow-y-auto shrink-0">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          系统设置
        </div>
        <div className="space-y-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-surface-chip text-text-primary shadow-sm font-semibold'
                    : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0 text-text-secondary" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Official Settings Content Canvas */}
      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-3xl">
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
        {/* TAB 3: Providers (模型供应商)                             */}
        {/* ========================================================= */}
        {activeTab === 'providers' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">模型供应商与接入</h2>
              <p className="text-xs text-text-secondary mt-0.5">已配置的后端大模型服务网关与认证状态</p>
            </div>

            <div className="space-y-3">
              {MOCK_PROVIDERS.map((p) => (
                <div
                  key={p.id}
                  className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-sm space-y-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl p-1.5 bg-surface rounded-xl border border-border-subtle">{p.icon}</span>
                      <div>
                        <div className="font-bold text-text-primary">{p.name}</div>
                        <div className="text-[10px] text-text-tertiary font-mono">{p.baseUrl}</div>
                      </div>
                    </div>
                    <span className="text-accent-green bg-accent-green/10 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-semibold">
                      CONNECTED
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-text-tertiary">可用模型:</span>
                      {p.models.map((m, idx) => (
                        <span
                          key={idx}
                          className="bg-surface font-mono text-text-secondary px-2 py-0.5 rounded-md border border-border-subtle text-[10px]"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                    <button className="px-2.5 py-1 bg-surface hover:bg-surface-hover border border-border-default rounded-lg text-text-secondary hover:text-text-primary transition-colors text-[11px]">
                      编辑配置
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: Models (模型与推理设置)                            */}
        {/* ========================================================= */}
        {activeTab === 'models' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">模型与推理配置</h2>
              <p className="text-xs text-text-secondary mt-0.5">默认模型选择、深度思考推理预算与执行策略</p>
            </div>

            <div className="flex flex-col rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm text-xs">
              <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
                <div>
                  <div className="font-medium text-text-primary">默认对话主模型</div>
                  <div className="text-text-tertiary text-[11px] mt-0.5">新建对话时自动加载的基准大模型</div>
                </div>
                <select className="bg-surface border border-border-default px-3 py-1.5 rounded-xl text-text-primary focus:outline-none font-mono">
                  <option value="claude-opus-5-5">Claude Opus 5.5</option>
                  <option value="claude-sonnet-5-5">Claude Sonnet 5.5</option>
                  <option value="gpt-5.5">GPT-5.5 (Codex)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                </select>
              </div>

              <div className="flex items-center justify-between px-4 py-3.5 border-b border-border-subtle">
                <div>
                  <div className="font-medium text-text-primary">默认推理思考档位 (Thinking Effort)</div>
                  <div className="text-text-tertiary text-[11px] mt-0.5">控制模型在回答前展开隐式推理的深度</div>
                </div>
                <select className="bg-surface border border-border-default px-3 py-1.5 rounded-xl text-text-primary focus:outline-none">
                  <option value="high">High (推荐：深度逻辑与架构分析)</option>
                  <option value="medium">Medium (标准思考)</option>
                  <option value="low">Low (极速响应)</option>
                  <option value="max">Max (极限对抗测试)</option>
                </select>
              </div>

              <div className="flex items-center justify-between px-4 py-3.5">
                <div>
                  <div className="font-medium text-text-primary">开启 Fast Mode (极速流式输出)</div>
                  <div className="text-text-tertiary text-[11px] mt-0.5">使用高吞吐输出通道（不降低核心模型版本）</div>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-accent-blue cursor-pointer" />
              </div>
            </div>
          </div>
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
        {/* ========================================================= */}
        {activeTab === 'imbot' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">即时通讯 (IM) 机器人对接</h2>
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
        {/* ========================================================= */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-bold text-text-primary">配额与用量统计</h2>
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
        {activeTab === 'about' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center text-center p-8 bg-surface-elevated border border-border-default rounded-3xl space-y-3 shadow-sm">
              <img src="/assets/cindy-avatar-lockup.png" alt="" className="w-16 h-16 rounded-2xl shadow-md border border-border-default" />
              <h2 className="text-base font-bold text-text-primary">Cindy (Web Edition)</h2>
              <div className="text-xs font-mono text-text-tertiary">Version 1.0.0-beta · Built 2026-11</div>
              <p className="text-xs text-text-secondary max-w-sm mt-1 leading-relaxed">
                Open-source AI Assistant. Designed for autonomous software engineering, multi-agent workflows and high-craft UI experiences.
              </p>

              <div className="pt-4 flex items-center gap-3 text-xs font-medium">
                <a
                  href="https://github.com/makecindy/cindy"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-accent-blue hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>GitHub 仓库</span>
                </a>
                <span className="text-text-tertiary">·</span>
                <span className="text-text-secondary">Apache 2.0 许可证</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
