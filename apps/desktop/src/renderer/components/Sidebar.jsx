import React from 'react';
import {
  Plus,
  MessageSquare,
  Users,
  Trash2,
  Bot,
  Shield,
  Cpu,
  Terminal,
  Sparkles,
  Code2,
  Flame,
  Search,
  ChevronRight,
  UserPlus,
  Layers,
} from 'lucide-react';

const ICON_MAP = {
  Bot,
  Cpu,
  Shield,
  Users,
  Terminal,
  Sparkles,
  Code2,
  Flame,
  Search,
};

function resolvePartnerIcon(p) {
  if (typeof p?.icon === 'function') return p.icon;
  if (typeof p?.icon === 'string' && ICON_MAP[p.icon]) return ICON_MAP[p.icon];
  if (typeof p?.avatar === 'string' && ICON_MAP[p.avatar]) return ICON_MAP[p.avatar];
  if (p?.id?.includes('architect')) return Cpu;
  if (p?.id?.includes('rea')) return Shield;
  return Bot;
}

export default function Sidebar({
  sessions = [],
  activeSessionId,
  currentView = 'chat',
  onSelectView,
  onSelectSession,
  onNewChat,
  onNewGroupChat,
  onOpenCreateGroup,
  onOpenCreatePartner,
  onOpenDirectChat,
  onDeleteSession,
  partners = [],
}) {
  // 严格区分：群聊房间归群聊列表，私聊归伙伴自身频道
  const groupSessions = sessions.filter(
    (s) => s.kind === 'group' || (!s.kind && !s.id.startsWith('dm_'))
  );

  const handlePartnerClick = (partnerId) => {
    if (onSelectView) onSelectView('chat');
    if (onOpenDirectChat) {
      onOpenDirectChat(partnerId);
    } else if (onNewChat) {
      onNewChat(partnerId);
    }
  };

  return (
    <aside className="w-64 bg-surface/95 border-r border-border flex flex-col h-full backdrop-blur-md select-none">
      {/* Top Header & Quick Actions */}
      <div className="p-3 border-b border-border/70 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-2">
            <div className="w-5 h-5 rounded bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-xs font-bold font-mono">
              M
            </div>
            <span className="font-semibold text-xs tracking-wider text-slate-200 uppercase">
              Orchestration
            </span>
          </div>
          <span className="text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">
            v1.0
          </span>
        </div>

        {/* Primary Action Buttons: + 创建群聊, + 添加伙伴 */}
        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={() => (onOpenCreateGroup ? onOpenCreateGroup() : onNewGroupChat())}
            className="flex items-center justify-center space-x-1.5 bg-accent text-slate-950 hover:bg-accent-hover font-medium text-xs py-2 px-2.5 rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
          >
            <Users className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>创建群聊</span>
          </button>

          <button
            onClick={() => onOpenCreatePartner && onOpenCreatePartner()}
            className="flex items-center justify-center space-x-1.5 bg-card hover:bg-slate-700/60 border border-border/80 text-slate-200 rounded-xl transition-all hover:text-accent font-medium text-xs py-2 px-2.5 cursor-pointer active:scale-[0.98]"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>添加伙伴</span>
          </button>
        </div>

        {/* System Control Views: 扩展配置 & 蒸馏 Diff 面板 */}
        <div className="pt-1.5 space-y-1">
          <button
            onClick={() => onSelectView && onSelectView('extension-config')}
            className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
              currentView === 'extension-config'
                ? 'bg-indigo-600/20 border-indigo-500/60 text-indigo-300'
                : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span className="truncate">扩展配置 (MCP/Skill/Plugin)</span>
          </button>

          <button
            onClick={() => onSelectView && onSelectView('distillation-diff')}
            className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
              currentView === 'distillation-diff'
                ? 'bg-amber-600/20 border-amber-500/60 text-amber-300'
                : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span className="truncate">去脂蒸馏 Diff 面板</span>
          </button>
        </div>
      </div>

      {/* Middle: 伙伴群聊列表 (Bot Groups) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="text-[10px] font-mono font-medium text-slate-500 uppercase px-2 py-1 flex items-center justify-between">
          <div className="flex items-center space-x-1.5">
            <Users className="w-3 h-3 text-slate-500" />
            <span>伙伴群聊 (Bot Groups)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => (onOpenCreateGroup ? onOpenCreateGroup() : onNewGroupChat())}
              title="创建伙伴群聊"
              className="p-0.5 text-slate-500 hover:text-accent rounded transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <span className="text-slate-600">{groupSessions.length}</span>
          </div>
        </div>

        {groupSessions.length === 0 ? (
          <div className="text-[11px] text-slate-500 text-center py-6 px-3 bg-card/20 rounded-xl border border-dashed border-border/60">
            暂无群聊会话
            <button
              onClick={() => (onOpenCreateGroup ? onOpenCreateGroup() : onNewGroupChat())}
              className="block mx-auto mt-2 text-accent text-xs hover:underline cursor-pointer"
            >
              + 立即创建群聊
            </button>
          </div>
        ) : (
          groupSessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const memberCount =
              session.members?.length ||
              session.memberIds?.length ||
              (session.kind === 'group' ? 3 : 1);

            return (
              <div
                key={session.id}
                onClick={() => {
                  if (onSelectView) onSelectView('chat');
                  onSelectSession(session.id);
                }}
                className={`group relative flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                  isActive
                    ? 'bg-card border-accent/70 text-slate-100 shadow-sm'
                    : 'bg-transparent border-transparent hover:bg-card/50 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0 pr-6">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isActive
                        ? 'bg-accent/20 text-accent'
                        : 'bg-slate-800/80 text-slate-400 group-hover:text-slate-300'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate leading-tight">
                      {session.name || session.title || '新群聊'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5 flex items-center space-x-1.5">
                      <span>{memberCount} 伙伴</span>
                      <span>·</span>
                      <span>{session.updatedAt || '刚刚'}</span>
                    </div>
                  </div>
                </div>

                {/* Delete Action on Hover */}
                {groupSessions.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-500 rounded transition-all cursor-pointer absolute right-2"
                    title="解散群聊"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom: 专属伙伴通讯录 (1对1私聊，每个伙伴有且仅有一个永久私聊频道) */}
      <div className="p-3 border-t border-border bg-slate-900/80">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="flex items-center space-x-1.5">
            <Bot className="w-3 h-3 text-slate-500" />
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
              专属伙伴 (1对1私聊)
            </span>
          </div>
          <button
            onClick={() => onOpenCreatePartner && onOpenCreatePartner()}
            title="添加专属伙伴"
            className="p-0.5 text-slate-500 hover:text-accent rounded transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-1 max-h-52 overflow-y-auto pr-0.5">
          {partners.map((p) => {
            const Icon = resolvePartnerIcon(p);
            // 判定当前选中的是否正是与该伙伴的私聊
            const isPartnerActive =
              activeSessionId === `dm_${p.id}` ||
              activeSessionId === p.id ||
              sessions.find((s) => s.id === activeSessionId && s.partnerId === p.id);

            return (
              <button
                key={p.id}
                onClick={() => handlePartnerClick(p.id)}
                className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all text-left cursor-pointer border ${
                  isPartnerActive
                    ? 'bg-card border-accent/70 text-slate-100 shadow-sm font-medium'
                    : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200 hover:bg-card/50'
                }`}
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{
                      backgroundColor: `${p.avatarColor || '#38bdf8'}20`,
                      color: p.avatarColor || '#38bdf8',
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs leading-tight">{p.name}</div>
                    <div className="text-[10px] text-slate-500 truncate leading-tight mt-0.5 font-mono">
                      {p.role}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1 flex-shrink-0">
                  {p.isLead && (
                    <span className="text-[9px] bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1 py-0.2 rounded">
                      主控
                    </span>
                  )}
                  <ChevronRight
                    className={`w-3.5 h-3.5 transition-colors ${
                      isPartnerActive ? 'text-accent' : 'text-slate-600'
                    }`}
                  />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
