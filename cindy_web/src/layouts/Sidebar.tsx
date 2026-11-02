import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Clock,
  Puzzle,
  Users,
  Settings,
  Search,
  Pin,
  MessageSquare,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronRight,
  LogOut,
  User,
  FlaskConical,
  Bug,
  Plus,
  PanelLeftClose,
  Store,
  Bot,
  Link as LinkIcon,
  Check,
  Folder,
  Layers,
  Flame,
} from 'lucide-react';
import { MOCK_SESSIONS, SessionItem } from '@/mock/sessions';
import { MOCK_BOTS, MOCK_BOT_GROUPS, BotItem, BotGroupItem } from '@/mock/bots';
import { MOCK_USER_PROFILE } from '@/mock/settings';
import { useLocale } from '@/contexts/LocaleContext';

interface SidebarProps {
  width?: number;
  collapsed?: boolean;
  isPeeking?: boolean;
  onToggleCollapse?: () => void;
  onOpenCommandPalette?: () => void;
  onMouseEnterDrawer?: () => void;
  onMouseLeaveDrawer?: () => void;
}

export function Sidebar({
  width = 260,
  collapsed = false,
  isPeeking = false,
  onToggleCollapse,
  onOpenCommandPalette,
  onMouseEnterDrawer,
  onMouseLeaveDrawer,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Section Collapsed States
  const [teammatesCollapsed, setTeammatesCollapsed] = useState(true); // 默认折叠展示精简头像流
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);

  // 伙伴新建菜单下拉 (1:1 还原用户截图)
  const [botMenuOpen, setBotMenuOpen] = useState(false);
  const botMenuRef = useRef<HTMLDivElement>(null);

  // 全部任务筛选下拉 (全部任务 ⌄)
  const [taskFilter, setTaskFilter] = useState<'全部任务' | '进行中' | '已完成' | '置顶任务'>('全部任务');
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const taskFilterRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (botMenuRef.current && !botMenuRef.current.contains(event.target as Node)) {
        setBotMenuOpen(false);
      }
      if (taskFilterRef.current && !taskFilterRef.current.contains(event.target as Node)) {
        setTaskFilterOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter sessions
  const filteredSessions = MOCK_SESSIONS.filter((s) => {
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.workingDir.toLowerCase().includes(searchQuery.toLowerCase());
    if (taskFilter === '进行中') return matchesSearch && s.status === 'running';
    if (taskFilter === '已完成') return matchesSearch && s.status === 'completed';
    if (taskFilter === '置顶任务') return matchesSearch && s.isPinned;
    return matchesSearch;
  });

  // Filter bots & groups
  const filteredGroups = MOCK_BOT_GROUPS.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredBots = MOCK_BOTS.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (b.lastMessage && b.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const pinnedSessions = filteredSessions.filter((s) => s.isPinned);
  const recentSessions = filteredSessions.filter((s) => !s.isPinned);

  const isCurrent = (path: string) => {
    if (path === '/cc-agent/new' && (location.pathname === '/' || location.pathname === '/cc-agent/new')) {
      return true;
    }
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
  };

  // 动态测量折叠态头像行的容器宽度，根据实际可用空间填满一整行，杜绝右侧留白
  const avatarRowRef = useRef<HTMLDivElement>(null);
  const [avatarRowWidth, setAvatarRowWidth] = useState(240);

  useEffect(() => {
    if (!avatarRowRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) {
        setAvatarRowWidth(Math.floor(w));
      }
    });
    observer.observe(avatarRowRef.current);
    return () => observer.disconnect();
  }, [teammatesCollapsed]);

  const allCollapsedBots = [
    { id: 'annie', name: 'Ada', avatar: '/assets/agent-island-annie.png', route: '/bots/bot-reviewer' },
    { id: 'boli', name: 'Cindy 核心群', avatar: '/assets/agent-island-boli.png', route: '/bots/groups/group-m1' },
    { id: 'chaku', name: 'Orion', avatar: '/assets/agent-island-chaku.png', route: '/bots/bot-devops' },
    { id: 'erika', name: 'Sophia', avatar: '/assets/agent-island-erika.png', route: '/bots/bot-pm' },
    { id: 'muffin', name: 'Devon', avatar: '/assets/agent-island-muffin.png', route: '/bots/bot-dev' },
    { id: 'tarara', name: 'Tarara', avatar: '/assets/agent-island-tarara.png', route: '/bots/bot-reviewer' },
    { id: 'whitesnow', name: 'WhiteSnow', avatar: '/assets/agent-island-whitesnow.png', route: '/bots/bot-devops' },
    { id: 'blackcat', name: 'BlackCat', avatar: '/assets/agent-island-blackcat.png', route: '/bots/bot-pm' },
  ];

  // 每个头像 slot 约 36px (28px 尺寸 + 8px gap)，动态算出能放下几个并铺满一整行
  const slotSize = 36;
  const avatarCapacity = Math.max(4, Math.floor((avatarRowWidth + 8) / slotSize));
  const visibleCollapsedAvatars = allCollapsedBots.slice(0, Math.max(3, avatarCapacity - 1));
  const overflowCount = 18 - visibleCollapsedAvatars.length;

  if (collapsed && !isPeeking) {
    return null;
  }

  const isOverlayPeek = collapsed && isPeeking;

  return (
    <aside
      style={{ width }}
      onMouseEnter={onMouseEnterDrawer}
      onMouseLeave={onMouseLeaveDrawer}
      className={
        isOverlayPeek
          ? 'fixed left-0 top-0 bottom-0 z-50 bg-sidebar-bg border-r border-border-default flex flex-col h-full select-none text-xs overflow-hidden shadow-2xl animate-in slide-in-from-left duration-200'
          : 'bg-sidebar-bg border-r border-border-default flex flex-col h-full select-none shrink-0 text-xs overflow-hidden transition-all duration-75'
      }
    >
      {/* 1. Header & Brand (右上角加号替换为侧边栏收起/固定按钮) */}
      <div className="h-12 px-3.5 border-b border-border-default flex items-center justify-between shrink-0">
        <div
          onClick={() => navigate('/cc-agent/new')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <img
            src="/assets/cindy-avatar-lockup.png"
            alt="Cindy"
            className="w-7 h-7 rounded-lg shadow-sm group-hover:scale-105 transition-transform"
          />
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-text-primary">Cindy</span>
            <span className="text-[10px] text-text-tertiary -mt-1 font-mono">Web Edition</span>
          </div>
        </div>

        {/* 侧边栏收起 / 固定点击按钮 */}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            title={isOverlayPeek ? '固定展开侧边栏 (Pin)' : '收起侧边栏 (⌘B)'}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            {isOverlayPeek ? (
              <Pin className="w-4 h-4 text-accent-blue rotate-45" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* 2. Top Nav Actions */}
      <div className="p-2 space-y-0.5 border-b border-border-default shrink-0">
        <button
          onClick={() => navigate('/cc-agent/new')}
          className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            isCurrent('/cc-agent/new')
              ? 'bg-surface-chip text-text-primary font-semibold'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <span className="text-accent-blue font-bold text-sm leading-none">+</span>
          <span>新建对话</span>
        </button>

        <button
          onClick={() => navigate('/cc-agent/scheduled')}
          className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            isCurrent('/cc-agent/scheduled')
              ? 'bg-surface-chip text-text-primary font-semibold'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-accent-amber" />
          <span>自动任务 (Cron)</span>
        </button>

        <button
          onClick={() => navigate('/skillhub')}
          className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            isCurrent('/skillhub')
              ? 'bg-surface-chip text-text-primary font-semibold'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Zap className="w-3.5 h-3.5 text-accent-green" />
          <span>{t('个性化定制', 'Customizations')}</span>
        </button>

        <button
          onClick={() => navigate('/control-plane/extensions')}
          className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            isCurrent('/control-plane/extensions')
              ? 'bg-surface-chip text-text-primary font-semibold'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-accent-purple" />
          <span>扩展配置 (伙伴/文件夹)</span>
        </button>

        <button
          onClick={() => navigate('/control-plane/distill')}
          className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
            isCurrent('/control-plane/distill')
              ? 'bg-surface-chip text-text-primary font-semibold'
              : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-amber-500" />
          <span>去脂蒸馏 Diff 面板</span>
        </button>
      </div>

      {/* 3. Search Bar / Command Palette Trigger (⌘K) */}
      <div className="px-2 py-2 shrink-0">
        <div
          onClick={onOpenCommandPalette}
          className="relative flex items-center cursor-pointer group"
        >
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-text-tertiary group-hover:text-text-primary transition-colors" />
          <div className="w-full pl-8 pr-2 py-1.5 text-xs bg-surface-elevated border border-border-default rounded-xl text-text-tertiary flex items-center justify-between group-hover:border-accent-blue/50 transition-colors shadow-xs">
            <span>搜索或快速跳转...</span>
            <kbd className="px-1.5 py-0.2 bg-surface-chip border border-border-default rounded text-[10px] font-mono text-text-tertiary">
              ⌘K
            </kbd>
          </div>
        </div>
      </div>

      {/* 4. Scrollable Lists Container */}
      <div className="flex-1 overflow-y-auto px-2 space-y-4">
        {/* ========================================================= */}
        {/* SECTION A: 伙伴列表 (1:1 还原用户截图)                    */}
        {/* ========================================================= */}
        <div>
          {/* Header Row: 伙伴 >   [+] 按钮 */}
          <div className="flex items-center justify-between px-2 mb-1.5 relative">
            <button
              onClick={() => setTeammatesCollapsed(!teammatesCollapsed)}
              className="flex items-center gap-1 text-[13px] font-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer group/title"
            >
              <span>伙伴</span>
              <ChevronRight
                className={`w-3.5 h-3.5 text-text-tertiary transition-transform duration-150 ${
                  teammatesCollapsed ? '' : 'rotate-90'
                }`}
              />
            </button>

            {/* Right '+' Menu Button (用户截图所示菜单) */}
            <div className="relative" ref={botMenuRef}>
              <button
                onClick={() => setBotMenuOpen(!botMenuOpen)}
                className="w-5 h-5 rounded hover:bg-surface-hover flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
                title="伙伴操作"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {/* Dropdown Menu (1:1 还原用户截图) */}
              {botMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5">
                  <div
                    onClick={() => {
                      setBotMenuOpen(false);
                      navigate('/bots/market');
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary transition-colors"
                  >
                    <Store className="w-4 h-4 text-text-secondary" />
                    <span>发现伙伴</span>
                  </div>

                  <div
                    onClick={() => {
                      setBotMenuOpen(false);
                      navigate('/bots/roster');
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary transition-colors"
                  >
                    <Bot className="w-4 h-4 text-text-secondary" />
                    <span>新建伙伴</span>
                  </div>

                  <div
                    onClick={() => {
                      setBotMenuOpen(false);
                      navigate('/bots/groups/group-m1');
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary transition-colors"
                  >
                    <Users className="w-4 h-4 text-text-secondary" />
                    <span>新建群聊</span>
                  </div>

                  <div className="h-px bg-border-subtle my-1" />

                  <div
                    onClick={() => {
                      setBotMenuOpen(false);
                      const link = prompt('请输入伙伴邀请链接:');
                      if (link) alert(`已接收邀请: ${link}`);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary transition-colors"
                  >
                    <LinkIcon className="w-4 h-4 text-text-secondary" />
                    <span>输入邀请链接...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Collapsed State: 自适应宽度圆形头像排布 + [+N]，动态铺满一整行 */}
          {teammatesCollapsed ? (
            <div ref={avatarRowRef} className="flex items-center gap-2 px-2 py-1 overflow-hidden w-full">
              {visibleCollapsedAvatars.map((bot) => (
                <button
                  key={bot.id}
                  onClick={() => navigate(bot.route)}
                  title={bot.name}
                  className="w-7 h-7 rounded-full overflow-hidden border border-border-default hover:scale-105 transition-transform shrink-0 shadow-xs cursor-pointer"
                >
                  <img src={bot.avatar} alt={bot.name} className="w-full h-full object-cover" />
                </button>
              ))}

              {/* +14 Pill (点击展开整段列表) */}
              <button
                onClick={() => setTeammatesCollapsed(false)}
                title={`展开伙伴列表 (+${overflowCount})`}
                className="w-7 h-7 rounded-full bg-surface-chip hover:bg-surface-hover flex items-center justify-center text-[11px] font-medium tabular-nums text-text-secondary hover:text-text-primary transition-colors border border-border-subtle shrink-0 cursor-pointer shadow-xs"
              >
                +{overflowCount}
              </button>
            </div>
          ) : (
            /* Expanded State: 完整群聊与单人伙伴列表 */
            <div className="space-y-0.5">
              {filteredGroups.map((group) => {
                const isActive = location.pathname === `/bots/groups/${group.id}`;
                return (
                  <div
                    key={group.id}
                    onClick={() => navigate(`/bots/groups/${group.id}`)}
                    className={`group px-2.5 py-2 rounded-xl cursor-pointer transition-all flex items-start gap-2.5 ${
                      isActive
                        ? 'bg-surface-chip text-text-primary shadow-sm font-medium'
                        : 'hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="relative w-7 h-7 shrink-0 mt-0.5">
                      <img
                        src={group.memberAvatars[0]}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover border border-surface-elevated absolute top-0 left-0 z-10"
                      />
                      <img
                        src={group.memberAvatars[1]}
                        alt=""
                        className="w-5 h-5 rounded-full object-cover border border-surface-elevated absolute bottom-0 right-0 z-0 opacity-80"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {group.name}
                        </span>
                        <span className="text-[10px] text-text-tertiary shrink-0 font-mono">
                          {group.lastTime}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        {group.isRunning ? (
                          <div className="flex items-center gap-1 text-[11px] text-accent-amber truncate font-medium">
                            <Sparkles className="w-3 h-3 animate-spin shrink-0" />
                            <span className="truncate">{group.runningText}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-text-tertiary truncate">
                            {group.lastSpeaker}: {group.lastMessage}
                          </span>
                        )}
                        {group.unreadCount && group.unreadCount > 0 ? (
                          <span className="h-4 min-w-[16px] px-1 bg-[#417CDD] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                            {group.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredBots.map((bot) => {
                const isActive = location.pathname === `/bots/${bot.id}`;
                return (
                  <div
                    key={bot.id}
                    onClick={() => navigate(`/bots/${bot.id}`)}
                    className={`group px-2.5 py-2 rounded-xl cursor-pointer transition-all flex items-start gap-2.5 ${
                      isActive
                        ? 'bg-surface-chip text-text-primary shadow-sm font-medium'
                        : 'hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="relative shrink-0 mt-0.5">
                      <img
                        src={bot.avatar}
                        alt={bot.name}
                        className="w-7 h-7 rounded-xl object-cover border border-border-default bg-surface"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-elevated ${
                          bot.status === 'online'
                            ? 'bg-accent-green'
                            : bot.status === 'busy'
                            ? 'bg-accent-amber animate-pulse'
                            : 'bg-text-tertiary'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {bot.name}
                        </span>
                        <span className="text-[10px] text-text-tertiary shrink-0 font-mono">
                          {bot.lastTime}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <span className="text-[11px] text-text-tertiary truncate">
                          {bot.lastMessage || bot.title}
                        </span>
                        {bot.unreadCount && bot.unreadCount > 0 ? (
                          <span className="h-4 min-w-[16px] px-1 bg-[#417CDD] text-white text-[10px] font-bold rounded-full flex items-center justify-center shrink-0">
                            {bot.unreadCount}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* SECTION B: 全部任务 ⌄ (带筛选下拉与会话列表)             */}
        {/* ========================================================= */}
        <div>
          {/* Header Row: 全部任务 ⌄ (1:1 还原截图) */}
          <div className="flex items-center justify-between px-2 mb-1.5 relative">
            <div className="relative" ref={taskFilterRef}>
              <button
                onClick={() => setTaskFilterOpen(!taskFilterOpen)}
                className="flex items-center gap-1 text-[13px] font-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>{taskFilter}</span>
                <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
              </button>

              {/* Task filter dropdown popover */}
              {taskFilterOpen && (
                <div className="absolute left-0 top-full mt-1 w-36 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1 z-50 text-xs space-y-0.5">
                  {(['全部任务', '进行中', '已完成', '置顶任务'] as const).map((filterOption) => (
                    <div
                      key={filterOption}
                      onClick={() => {
                        setTaskFilter(filterOption);
                        setTaskFilterOpen(false);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between transition-colors ${
                        taskFilter === filterOption
                          ? 'bg-surface-chip text-text-primary font-semibold'
                          : 'hover:bg-surface-hover text-text-secondary'
                      }`}
                    >
                      <span>{filterOption}</span>
                      {taskFilter === filterOption && <Check className="w-3.5 h-3.5 text-accent-blue" />}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => navigate('/cc-agent/new')}
              title="新建会话"
              className="w-5 h-5 rounded hover:bg-surface-hover flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Session Cards List */}
          <div className="space-y-1">
            {filteredSessions.map((session) => {
              const isActive = location.pathname === `/cc-agent/${session.id}`;
              return (
                <div
                  key={session.id}
                  onClick={() => navigate(`/cc-agent/${session.id}`)}
                  className={`group px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                    isActive
                      ? 'bg-surface-chip text-text-primary shadow-sm font-medium'
                      : 'hover:bg-surface-hover text-text-secondary'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm shrink-0 mt-0.5">
                      {session.id.includes('web') ? '🖥️' : session.id.includes('orca') ? '🐙' : '💬'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {session.title}
                        </span>
                        {session.isPinned && (
                          <Pin className="w-3 h-3 text-accent-blue rotate-45 shrink-0" />
                        )}
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate mt-0.5 leading-normal">
                        {session.id.includes('orca')
                          ? '已1:1 像素级完全参考 Cindy 规范'
                          : session.workingDir}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. User Profile Card at Bottom */}
      <div className="p-2 border-t border-border-default relative shrink-0">
        <div
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2">
            <img
              src={MOCK_USER_PROFILE.avatar}
              alt=""
              className="w-7 h-7 rounded-full bg-surface-elevated border border-border-default object-cover"
            />
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-text-primary leading-tight">
                {MOCK_USER_PROFILE.name}
              </span>
              <span className="text-[10px] text-text-tertiary">
                {MOCK_USER_PROFILE.plan}
              </span>
            </div>
          </div>
          <ChevronRight
            className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
              userMenuOpen ? 'rotate-90' : ''
            }`}
          />
        </div>

        {/* User popover */}
        {userMenuOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1.5 z-50">
            <div className="p-2 border-b border-border-default mb-1">
              <div className="flex justify-between text-[11px] font-medium text-text-secondary mb-1">
                <span>月度额度消耗</span>
                <span>36%</span>
              </div>
              <div className="h-1.5 w-full bg-surface-chip rounded-full overflow-hidden">
                <div className="h-full bg-accent-blue rounded-full w-[36%]" />
              </div>
              <div className="text-[10px] text-text-tertiary mt-1">
                1.82M / 5.0M Tokens
              </div>
            </div>

            <button
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/settings');
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-text-primary"
            >
              <Settings className="w-3.5 h-3.5 text-text-secondary" />
              <span>系统设置</span>
            </button>

            <button
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/maker-experimental');
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-text-primary"
            >
              <FlaskConical className="w-3.5 h-3.5 text-accent-purple" />
              <span>诊断与实验</span>
            </button>

            <button
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/issues');
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-text-primary"
            >
              <Bug className="w-3.5 h-3.5 text-accent-amber" />
              <span>问题反馈</span>
            </button>

            <div className="h-px bg-border-default my-1" />

            <button
              onClick={() => {
                setUserMenuOpen(false);
                navigate('/login');
              }}
              className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-accent-red"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>切换 / 退出登录</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
