import React from 'react';
import {
  PanelRightClose,
  PanelRightOpen,
  PanelLeft,
  Sun,
  Moon,
  Layers,
  ChevronDown,
  Navigation,
  Search,
  Server,
  Menu,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLocale } from '@/contexts/LocaleContext';
import { triggerHaptic } from '@/utils/haptics';

interface ContentHeaderProps {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onTriggerPeek?: () => void;
  rightSidebarOpen: boolean;
  onToggleRightSidebar: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenCommandPalette?: () => void;
  isMobile?: boolean;
}

export function ContentHeader({
  sidebarCollapsed = false,
  onToggleSidebar,
  onTriggerPeek,
  rightSidebarOpen,
  onToggleRightSidebar,
  isDark,
  onToggleTheme,
  onOpenCommandPalette,
  isMobile = false,
}: ContentHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();

  // Map route to friendly title
  const getRouteTitle = () => {
    const path = location.pathname;
    if (path === '/' || path.startsWith('/cc-agent/new')) return t('新建任务', 'New Chat');
    if (path.startsWith('/cc-agent/files')) return t('工作区文件浏览', 'Workdir Browse');
    if (path.startsWith('/cc-agent/orca')) return t('Orca 多 Agent 协同流', 'Orca Workflow');
    if (path.startsWith('/cc-agent/scheduled')) return t('自动化调度任务', 'Scheduler');
    if (path.startsWith('/cc-agent/')) return t('对话任务', 'Dialogue');
    if (path.startsWith('/bots/list')) return t('伙伴列表', 'Teammates');
    if (path.startsWith('/bots/roster')) return t('阵容与编队', 'Roster');
    if (path.startsWith('/bots/market')) return t('伙伴市场', 'Bot Market');
    if (path.startsWith('/bots/groups')) return t('群组协作', 'Group Chat');
    if (path.startsWith('/bots')) return t('伙伴中心', 'Teammates Hub');
    if (path.startsWith('/skillhub/detail')) return t('技能详情', 'Skill Detail');
    if (path.startsWith('/skillhub')) return t('个性化定制', 'Customizations');
    if (path.startsWith('/plugins')) return t('插件管理', 'Plugins');
    if (path.startsWith('/mcp')) return t('自定义 MCP 服务', 'MCP Servers');
    if (path.startsWith('/settings')) return t('系统设置', 'Settings');
    if (path.startsWith('/maker-experimental')) return t('实验与诊断', 'Diagnostics');
    if (path.startsWith('/issues')) return t('问题跟踪器', 'Issue Tracker');
    if (path.startsWith('/login')) return t('账号登录', 'Sign In');
    return 'Multi-Agent Orchestration';
  };

  return (
    <header className="h-12 border-b border-border-default bg-surface flex items-center justify-between px-3 md:px-4 select-none shrink-0 z-20">
      {/* Left: Web Breadcrumbs & Sidebar Navigation */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {isMobile ? (
          <button
            onClick={onToggleSidebar}
            title="打开导航菜单"
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover active:bg-surface-chip transition-colors cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
        ) : (
          sidebarCollapsed && onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              onMouseEnter={onTriggerPeek}
              title="展开侧边栏 (⌘B，悬停临时预览)"
              className="p-1 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors mr-1 cursor-pointer"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )
        )}

        {!isMobile && <div className="h-4 w-px bg-border-default mx-1" />}

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-semibold text-text-primary truncate">{getRouteTitle()}</span>
          {isMobile && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.2 rounded-full border border-emerald-500/20 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>就绪</span>
            </span>
          )}
          {!isMobile && (
            <>
              <span className="text-text-tertiary">/</span>
              <span className="text-xs text-text-secondary bg-surface-chip px-2 py-0.5 rounded-full font-mono truncate max-w-[200px]">
                {location.pathname}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Center: Quick Page Switcher Dropdown (Desktop Only) */}
      {!isMobile && (
        <div className="flex items-center gap-2">
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-surface-chip hover:bg-surface-hover border border-border-default text-text-secondary transition-colors cursor-pointer">
              <Navigation className="w-3 h-3 text-accent-blue" />
              <span>页面快捷切换</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

          {/* Quick jump menu */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 w-64 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1.5 hidden group-hover:block group-focus-within:block z-50">
            <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary tracking-wider uppercase">
              多智能体核心功能页面
            </div>
            <div className="space-y-0.5 max-h-80 overflow-y-auto">
              <button
                onClick={() => navigate('/cc-agent/new')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>➕ 新建任务 (NewMakerDraft)</span>
                <span className="text-[10px] text-text-tertiary">/cc-agent/new</span>
              </button>
              <button
                onClick={() => navigate('/cc-agent/s-orca-lead-01')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>💬 对话详情 (SessionView)</span>
                <span className="text-[10px] text-text-tertiary">/cc-agent/:id</span>
              </button>
              <button
                onClick={() => navigate('/cc-agent/files/s-orca-lead-01')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>📁 工作区浏览 (WorkdirBrowse)</span>
                <span className="text-[10px] text-text-tertiary">/cc-agent/files</span>
              </button>
              <button
                onClick={() => navigate('/cc-agent/orca/s-orca-lead-01')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>🐙 Orca 多工流 (OrcaWorkflow)</span>
                <span className="text-[10px] text-text-tertiary">/cc-agent/orca</span>
              </button>
              <button
                onClick={() => navigate('/cc-agent/scheduled')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>⏰ 自动化调度 (Scheduler)</span>
                <span className="text-[10px] text-text-tertiary">/cc-agent/scheduled</span>
              </button>

              <div className="h-px bg-border-default my-1" />
              <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary tracking-wider uppercase">
                伙伴与技能
              </div>
              <button
                onClick={() => navigate('/bots')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>🤖 伙伴看板 (BotsHome)</span>
                <span className="text-[10px] text-text-tertiary">/bots</span>
              </button>
              <button
                onClick={() => navigate('/bots/roster')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>👥 阵容管理 (BotRoster)</span>
                <span className="text-[10px] text-text-tertiary">/bots/roster</span>
              </button>
              <button
                onClick={() => navigate('/bots/market')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>🛍️ 伙伴市场 (BotMarket)</span>
                <span className="text-[10px] text-text-tertiary">/bots/market</span>
              </button>
              <button
                onClick={() => navigate('/bots/groups/group-m1')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>👥 伙伴群聊 (BotGroupChat)</span>
                <span className="text-[10px] text-text-tertiary">/bots/groups</span>
              </button>
              <button
                onClick={() => navigate('/skillhub')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>⚡ 个性化定制 (Customizations)</span>
                <span className="text-[10px] text-text-tertiary">/skillhub</span>
              </button>
              <button
                onClick={() => navigate('/skillhub?tab=marketplace')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>🛍️ 插件与技能市场 (Marketplace)</span>
                <span className="text-[10px] text-text-tertiary">/skillhub?tab=marketplace</span>
              </button>

              <div className="h-px bg-border-default my-1" />
              <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary tracking-wider uppercase">
                系统与其它
              </div>
              <button
                onClick={() => navigate('/settings')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>⚙️ 系统设置 (SettingsView)</span>
                <span className="text-[10px] text-text-tertiary">/settings</span>
              </button>
              <button
                onClick={() => navigate('/login')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>🔐 账号登录 (LoginPage)</span>
                <span className="text-[10px] text-text-tertiary">/login</span>
              </button>
              <button
                onClick={() => navigate('/maker-experimental')}
                className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center justify-between text-text-primary"
              >
                <span>🧪 诊断与实验 (Experimental)</span>
                <span className="text-[10px] text-text-tertiary">/maker-experimental</span>
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Right: Actions, Theme Toggle, Right Sidebar Toggle */}
      <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
        <button
          onClick={() => {
            triggerHaptic('light');
            onOpenCommandPalette?.();
          }}
          title="全局搜索与指令菜单 (⌘K)"
          className="flex items-center gap-1.5 px-2 md:px-2.5 py-1 text-xs rounded-full bg-surface-chip hover:bg-surface-hover border border-border-default text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
        >
          <Search className="w-3.5 h-3.5 text-text-tertiary" />
          <span className="hidden sm:inline">搜索</span>
          <kbd className="hidden sm:inline px-1 py-0.2 bg-surface text-[10px] font-mono text-text-tertiary border border-border-subtle rounded">
            ⌘K
          </kbd>
        </button>

        <button
          onClick={() => {
            triggerHaptic('light');
            onToggleTheme();
          }}
          title={isDark ? '切换亮色主题' : '切换暗色主题'}
          className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors cursor-pointer"
        >
          {isDark ? <Sun className="w-4 h-4 text-accent-amber" /> : <Moon className="w-4 h-4 text-accent-blue" />}
        </button>

        {!isMobile && (
          <button
            onClick={onToggleRightSidebar}
            title={rightSidebarOpen ? '收起右侧抽屉' : '展开右侧抽屉'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              rightSidebarOpen
                ? 'bg-surface-hover text-text-primary'
                : 'hover:bg-surface-hover text-text-secondary'
            }`}
          >
            {rightSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
          </button>
        )}
      </div>
    </header>
  );
}
