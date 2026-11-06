import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Search,
  Pin,
  Sparkles,
  ChevronDown,
  Plus,
  PanelLeftClose,
  Link as LinkIcon,
  Check,
  BellOff,
} from 'lucide-react';
import type { PersistentSession } from '@/types/session';
import { useSessions } from '@/hooks/useSessions';
import { usePartnerRoster } from '@/hooks/usePartnerRoster';
import type { PartnerInfo } from '@/types/room';
import type { BotGroupItem } from '@/mock/bots';
import { MOCK_BOT_GROUPS } from '@/mock/bots';
import { useLocale } from '@/contexts/LocaleContext';
import { SidebarTopNav } from './components/SidebarTopNav';
import { SidebarUserProfile } from './components/SidebarUserProfile';
import { SessionContextMenu } from '@/components/menus/SessionContextMenu';
import { PartnerContextMenu } from '@/components/menus/PartnerContextMenu';
import { GroupContextMenu } from '@/components/menus/GroupContextMenu';
import { useToast } from '@/contexts/ToastContext';

interface SidebarProps {
  width?: number;
  collapsed?: boolean;
  isPeeking?: boolean;
  isMobile?: boolean;
  onToggleCollapse?: () => void;
  onCloseMobile?: () => void;
  onOpenCommandPalette?: () => void;
  onMouseEnterDrawer?: () => void;
  onMouseLeaveDrawer?: () => void;
}

export function Sidebar({
  width = 260,
  collapsed = false,
  isPeeking = false,
  isMobile = false,
  onToggleCollapse,
  onCloseMobile,
  onOpenCommandPalette,
  onMouseEnterDrawer,
  onMouseLeaveDrawer,
}: SidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();
  const { showToast } = useToast();

  // Real Sessions & Partners Data
  const {
    sessions,
    togglePin,
    toggleMute,
    setTagColor,
    renameSession,
    toggleArchive,
    deleteSession,
    createSession
  } = useSessions();
  const { partners, refresh: refreshPartners } = usePartnerRoster();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [teammatesCollapsed, setTeammatesCollapsed] = useState(true);
  const [botMenuOpen, setBotMenuOpen] = useState(false);
  const botMenuRef = useRef<HTMLDivElement>(null);

  // 全部任务筛选下拉
  const [taskFilter, setTaskFilter] = useState<'全部任务' | '进行中' | '已完成' | '置顶任务'>('全部任务');
  const [taskFilterOpen, setTaskFilterOpen] = useState(false);
  const taskFilterRef = useRef<HTMLDivElement>(null);

  // Context Menus State
  const [sessionMenu, setSessionMenu] = useState<{ session: PersistentSession; x: number; y: number } | null>(null);
  const [partnerMenu, setPartnerMenu] = useState<{ partner: PartnerInfo; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ group: BotGroupItem; x: number; y: number } | null>(null);

  // Pin & Hide state for partners
  const [pinnedPartnerIds, setPinnedPartnerIds] = useState<Set<string>>(new Set());
  const [hiddenPartnerIds, setHiddenPartnerIds] = useState<Set<string>>(new Set());

  // Dynamic rooms from /api/rooms
  const [dynamicGroups, setDynamicGroups] = useState<BotGroupItem[]>([]);

  useEffect(() => {
    let isMounted = true;
    async function loadRooms() {
      try {
        const res = await fetch('/api/rooms');
        const data = await res.json();
        if (data.ok && Array.isArray(data.rooms) && data.rooms.length > 0 && isMounted) {
          const mapped: BotGroupItem[] = data.rooms.map((r: any) => ({
            id: r.id,
            name: r.name || r.id,
            memberAvatars: [
              '/assets/agent-island-cindy.png',
              '/assets/agent-island-boli.png',
              '/assets/agent-island-annie.png',
              '/assets/agent-island-tarara.png',
              '/assets/agent-island-erika.png',
              '/assets/agent-island-chaku.png',
              '/assets/agent-island-muffin.png',
            ],
            membersCount: (r.memberIds || []).length || 7,
            lastSpeaker: 'moAdmin',
            lastMessage: `序列号 #${r.currentSequence || 1} · 7 位伙伴在席`,
            lastTime: '刚刚',
            unreadCount: 0,
            isRunning: false,
          }));
          setDynamicGroups(mapped);
        }
      } catch {}
    }
    loadRooms();
    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

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

  // Filter sessions (Real persistent data)
  const filteredSessions = sessions.filter((s) => {
    if (s.archived && taskFilter !== '全部任务') return false;
    const matchesSearch =
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.workingDir.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.tags && s.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase())));
    if (taskFilter === '进行中') return matchesSearch && s.status === 'running';
    if (taskFilter === '已完成') return matchesSearch && s.status === 'completed';
    if (taskFilter === '置顶任务') return matchesSearch && s.isPinned;
    return matchesSearch;
  });

  // Filter groups
  const allGroups = dynamicGroups.length > 0 ? dynamicGroups : MOCK_BOT_GROUPS;
  const filteredGroups = allGroups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter partners
  const filteredPartners = partners.filter((b) => {
    if (hiddenPartnerIds.has(b.id)) return false;
    return (
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.aliases && b.aliases.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase())))
    );
  });

  // Avatar capacity measurement
  const avatarRowRef = useRef<HTMLDivElement>(null);
  const [avatarRowWidth, setAvatarRowWidth] = useState(240);

  useEffect(() => {
    if (!avatarRowRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setAvatarRowWidth(Math.floor(w));
    });
    observer.observe(avatarRowRef.current);
    return () => observer.disconnect();
  }, [teammatesCollapsed]);

  const slotSize = 36;
  const avatarCapacity = Math.max(4, Math.floor((avatarRowWidth + 8) / slotSize));
  const visibleCollapsedAvatars = filteredPartners.slice(0, Math.max(3, avatarCapacity - 1));
  const overflowCount = Math.max(0, filteredPartners.length - visibleCollapsedAvatars.length);

  const navigateAndClose = (path: string) => {
    navigate(path);
    if (isMobile && onCloseMobile) onCloseMobile();
  };

  if (isMobile && collapsed) return null;
  if (!isMobile && collapsed && !isPeeking) return null;
  const isOverlayPeek = !isMobile && collapsed && isPeeking;
  const isMobileDrawer = isMobile && !collapsed;

  return (
    <aside
      style={{ width: isMobileDrawer ? undefined : width }}
      onMouseEnter={onMouseEnterDrawer}
      onMouseLeave={onMouseLeaveDrawer}
      className={
        isMobileDrawer
          ? 'fixed left-0 top-0 bottom-0 z-50 bg-sidebar-bg/95 backdrop-blur-md border-r border-border-default flex flex-col h-full select-none text-xs overflow-hidden shadow-2xl animate-in slide-in-from-left duration-200 w-[84vw] max-w-[320px]'
          : isOverlayPeek
          ? 'fixed left-0 top-0 bottom-0 z-50 bg-sidebar-bg border-r border-border-default flex flex-col h-full select-none text-xs overflow-hidden shadow-2xl animate-in slide-in-from-left duration-200'
          : 'bg-sidebar-bg border-r border-border-default flex flex-col h-full select-none shrink-0 text-xs overflow-hidden transition-all duration-75'
      }
    >
      {/* 1. Header & Brand */}
      <div className="h-12 px-3.5 border-b border-border-default flex items-center justify-between shrink-0">
        <div
          onClick={() => navigateAndClose('/cc-agent/new')}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 via-purple-500 to-blue-600 flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform text-white font-bold text-xs">
            MO
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-xs text-text-primary tracking-tight">Multi-Agent</span>
            <span className="text-[10px] text-text-tertiary">Orchestration</span>
          </div>
        </div>

        {(onToggleCollapse || onCloseMobile) && (
          <button
            onClick={isMobile ? onCloseMobile : onToggleCollapse}
            title={isMobile ? '关闭菜单' : '收起侧边栏'}
            className="p-1 rounded-md text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2. Top Nav Actions */}
      <SidebarTopNav />

      {/* 3. Search Bar / Command Palette Trigger */}
      <div className="px-2 py-2 shrink-0">
        <div
          onClick={onOpenCommandPalette}
          className="relative flex items-center cursor-pointer group"
        >
          <Search className="w-3.5 h-3.5 absolute left-2.5 text-text-tertiary group-hover:text-text-primary transition-colors" />
          <input
            type="text"
            readOnly
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索任务、伙伴与群聊..."
            className="w-full bg-surface-chip/70 hover:bg-surface-chip border border-border-subtle rounded-xl pl-8 pr-12 py-1.5 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none transition-colors cursor-pointer"
          />
          <kbd className="absolute right-2 px-1.5 py-0.5 bg-surface-elevated border border-border-default rounded text-[10px] font-mono text-text-tertiary">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* 4. Scrollable Lists Container */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4">
        {/* SECTION A: 伙伴与群聊 */}
        <div>
          <div className="sticky top-0 bg-surface z-10 flex items-center justify-between px-2 mb-1.5 py-0.5">
            <button
              onClick={() => setTeammatesCollapsed(!teammatesCollapsed)}
              className="flex items-center gap-1 text-[13px] font-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer select-none"
              title={teammatesCollapsed ? '展开伙伴列表' : '收起伙伴列表'}
            >
              <span>伙伴</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-text-tertiary transition-transform duration-200 ${
                  teammatesCollapsed ? '-rotate-90' : 'rotate-0'
                }`}
              />
            </button>

            <div className="flex items-center gap-1 relative" ref={botMenuRef}>
              <button
                onClick={() => setBotMenuOpen(!botMenuOpen)}
                title="添加伙伴或创建群聊"
                className="w-5 h-5 rounded hover:bg-surface-hover flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>

              {botMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5">
                  <div
                    onClick={() => {
                      setBotMenuOpen(false);
                      navigate('/bots/new');
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary transition-colors"
                  >
                    <span>新建伙伴</span>
                  </div>
                  <div
                    onClick={() => {
                      setBotMenuOpen(false);
                      navigate('/bots/groups/new');
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer text-text-primary transition-colors"
                  >
                    <span>新建群聊</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Collapsed State: Avatars row */}
          {teammatesCollapsed ? (
            <div ref={avatarRowRef} className="flex items-center gap-2 px-2 py-1 overflow-hidden w-full">
              {visibleCollapsedAvatars.map((bot) => (
                <button
                  key={bot.id}
                  onClick={() => navigate(`/bots/${bot.id}`)}
                  title={`${bot.name} (${bot.role})`}
                  className="w-7 h-7 rounded-full overflow-hidden border border-border-default hover:scale-105 transition-transform shrink-0 shadow-xs cursor-pointer"
                >
                  <img src={bot.avatarUrl || '/assets/agent-island-cindy.png'} alt={bot.name} className="w-full h-full object-cover" />
                </button>
              ))}

              <button
                onClick={() => setTeammatesCollapsed(false)}
                title={`展开伙伴与群聊列表 (+${overflowCount})`}
                className="w-7 h-7 rounded-full bg-surface-chip hover:bg-surface-hover flex items-center justify-center text-[11px] font-medium tabular-nums text-text-secondary hover:text-text-primary transition-colors border border-border-subtle shrink-0 cursor-pointer shadow-xs"
              >
                +{overflowCount}
              </button>
            </div>
          ) : (
            /* Expanded State: Groups & Bots List */
            <div className="space-y-0.5">
              {filteredGroups.map((group) => {
                const isActive = location.pathname === `/bots/groups/${group.id}`;
                return (
                  <div
                    key={group.id}
                    onClick={() => navigate(`/bots/groups/${group.id}`)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setGroupMenu({ group, x: e.clientX, y: e.clientY });
                    }}
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
                      <div className="text-[11px] text-text-tertiary truncate mt-0.5">
                        {group.lastSpeaker}: {group.lastMessage}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredPartners.map((bot) => {
                const isActive = location.pathname === `/bots/${bot.id}`;
                const isPinned = pinnedPartnerIds.has(bot.id);
                return (
                  <div
                    key={bot.id}
                    onClick={() => navigate(`/bots/${bot.id}`)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setPartnerMenu({ partner: bot, x: e.clientX, y: e.clientY });
                    }}
                    className={`group px-2.5 py-2 rounded-xl cursor-pointer transition-all flex items-start gap-2.5 ${
                      isActive
                        ? 'bg-surface-chip text-text-primary shadow-sm font-medium'
                        : 'hover:bg-surface-hover text-text-secondary'
                    }`}
                  >
                    <div className="relative shrink-0 mt-0.5">
                      <img
                        src={bot.avatarUrl || '/assets/agent-island-cindy.png'}
                        alt={bot.name}
                        className="w-7 h-7 rounded-xl object-cover border border-border-default bg-surface"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {bot.name}
                        </span>
                        {isPinned && <Pin className="w-3 h-3 text-accent-blue rotate-45 shrink-0" />}
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate mt-0.5">
                        {bot.role}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION B: 全部任务 ⌄ (带筛选下拉与会话列表) */}
        <div>
          <div className="flex items-center justify-between px-2 mb-1.5 relative">
            <div className="relative" ref={taskFilterRef}>
              <button
                onClick={() => setTaskFilterOpen(!taskFilterOpen)}
                className="flex items-center gap-1 text-[13px] font-medium text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <span>{taskFilter}</span>
                <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
              </button>

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
              className="w-5 h-5 rounded hover:bg-surface-hover flex items-center justify-center text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Session Cards List (Persistent Real Data) */}
          <div className="space-y-1">
            {filteredSessions.map((session) => {
              const isActive = location.pathname === `/cc-agent/${session.id}`;
              return (
                <div
                  key={session.id}
                  onClick={() => navigate(`/cc-agent/${session.id}`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSessionMenu({ session, x: e.clientX, y: e.clientY });
                  }}
                  className={`group px-2.5 py-2 rounded-xl cursor-pointer transition-all ${
                    isActive
                      ? 'bg-surface-chip text-text-primary shadow-sm font-medium'
                      : 'hover:bg-surface-hover text-text-secondary'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {/* Tag color dot or icon */}
                    {session.tagColor ? (
                      <span
                        style={{ backgroundColor: session.tagColor }}
                        className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ring-2 ring-surface"
                      />
                    ) : (
                      <span className="text-sm shrink-0 mt-0.5">
                        {session.id.includes('web') ? '🖥️' : session.id.includes('orca') ? '🐙' : '💬'}
                      </span>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-text-primary truncate">
                          {session.title}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          {session.isMuted && <BellOff className="w-3 h-3 text-text-tertiary" />}
                          {session.isPinned && <Pin className="w-3 h-3 text-accent-blue rotate-45" />}
                        </div>
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate mt-0.5 leading-normal">
                        {session.workingDir}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 5. User Profile Footer */}
      <SidebarUserProfile />

      {/* Context Menus */}
      {sessionMenu && (
        <SessionContextMenu
          x={sessionMenu.x}
          y={sessionMenu.y}
          session={sessionMenu.session}
          onClose={() => setSessionMenu(null)}
          onTogglePin={togglePin}
          onRename={(s) => { const t = prompt('重命名会话:', s.title); if (t?.trim()) renameSession(s, t.trim()); }}
          onToggleMute={toggleMute}
          onSetTagColor={setTagColor}
          onCopyLink={(s) => { navigator.clipboard.writeText(`${window.location.origin}/cc-agent/${s.id}`); showToast('已复制任务链接'); }}
          onShare={(s) => { navigator.clipboard.writeText(`${window.location.origin}/cc-agent/${s.id}`); showToast(`已生成共享链接: ${s.title}`); }}
          onMove={() => showToast('已将任务移动至指定目录')}
          onExport={(s) => {
            const blob = new Blob([`# ${s.title}\n\n- ID: ${s.id}\n- 模型: ${s.model}\n`], { type: 'text/markdown;charset=utf-8' });
            Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${s.title}.md` }).click();
          }}
          onOpenNewWindow={(s) => window.open(`/cc-agent/${s.id}`, '_blank')}
          onArchive={toggleArchive}
          onDelete={(s) => { if (confirm(`确定删除会话 "${s.title}" 吗？`)) deleteSession(s.id); }}
        />
      )}

      {partnerMenu && (
        <PartnerContextMenu
          x={partnerMenu.x}
          y={partnerMenu.y}
          partner={partnerMenu.partner}
          isPinned={pinnedPartnerIds.has(partnerMenu.partner.id)}
          isHidden={hiddenPartnerIds.has(partnerMenu.partner.id)}
          onClose={() => setPartnerMenu(null)}
          onTogglePin={(p) => setPinnedPartnerIds((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
          onToggleHide={(p) => setHiddenPartnerIds((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })}
          onDuplicate={async (p) => {
            try {
              const res = await fetch('/api/partners', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: `${p.id}-copy-${Date.now().toString().slice(-4)}`, name: `${p.name} (副本)`, role: p.role, description: `复制自 ${p.name}` })
              });
              if (res.ok) { refreshPartners(); showToast(`已成功复制伙伴: ${p.name} (副本)`, 'success'); }
            } catch { showToast('复制伙伴失败', 'error'); }
          }}
          onDelete={async (p) => {
            if (!confirm(`确定永久删除伙伴 "${p.name}" 吗？`)) return;
            try {
              const res = await fetch(`/api/partners/${p.id}`, { method: 'DELETE' });
              if (res.ok) { refreshPartners(); showToast(`已永久删除伙伴: ${p.name}`, 'info'); }
            } catch { showToast('删除伙伴失败', 'error'); }
          }}
        />
      )}

      {groupMenu && (
        <GroupContextMenu
          x={groupMenu.x}
          y={groupMenu.y}
          group={groupMenu.group}
          onClose={() => setGroupMenu(null)}
          onOpenSettings={(g) => navigate(`/bots/groups/${g.id}`)}
          onArchiveGroup={(g) => showToast(`已归档群聊: ${g.name}`, 'info')}
        />
      )}
    </aside>
  );
}
