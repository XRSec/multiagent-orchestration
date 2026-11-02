import React from 'react';
import { Plus, MessageSquare, Users, Trash2, Bot, Shield, Cpu, ChevronRight } from 'lucide-react';

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onNewGroupChat,
  onDeleteSession,
  partners,
}) {
  return (
    <aside className="w-64 bg-surface/95 border-r border-border flex flex-col h-full backdrop-blur-md select-none">
      {/* Top Header & New Chat Button */}
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

        {/* Primary Action: + New Chat */}
        <div className="grid grid-cols-5 gap-1.5 pt-1">
          <button
            onClick={() => onNewChat()}
            className="col-span-4 flex items-center justify-center space-x-2 bg-accent text-slate-950 hover:bg-accent-hover font-medium text-xs py-2 px-3 rounded-xl transition-all shadow-sm active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>新建对话</span>
          </button>

          <button
            onClick={() => onNewGroupChat()}
            title="发起伙伴群聊"
            className="col-span-1 flex items-center justify-center bg-card hover:bg-slate-700/60 border border-border/80 text-slate-300 rounded-xl transition-all hover:text-accent cursor-pointer"
          >
            <Users className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Session History List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        <div className="text-[10px] font-mono font-medium text-slate-500 uppercase px-2 py-1 flex items-center justify-between">
          <span>历史会话</span>
          <span className="text-slate-600">{sessions.length}</span>
        </div>

        {sessions.map((session) => {
          const isActive = session.id === activeSessionId;
          const isGroup = session.kind === 'group';

          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
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
                  {isGroup ? (
                    <Users className="w-3.5 h-3.5" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate leading-tight">
                    {session.title || '新会话'}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                    {session.updatedAt || '刚刚'} · {isGroup ? '多Agent群聊' : session.partnerName}
                  </div>
                </div>
              </div>

              {/* Delete Action on Hover */}
              {sessions.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(session.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-400 text-slate-500 rounded transition-all cursor-pointer absolute right-2"
                  title="删除对话"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Partners Quick Launcher */}
      <div className="p-3 border-t border-border bg-slate-900/70">
        <div className="text-[10px] font-mono text-slate-500 uppercase px-1 mb-2">
          伙伴直连 (1对1私聊)
        </div>
        <div className="space-y-1">
          {partners.map((p) => {
            const Icon = p.icon;
            return (
              <button
                key={p.id}
                onClick={() => onNewChat(p.id)}
                className="w-full flex items-center justify-between p-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-card/60 transition-all text-left cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <Icon className="w-3.5 h-3.5 text-accent/80" />
                  <span className="truncate max-w-[140px]">{p.name}</span>
                </div>
                <ChevronRight className="w-3 h-3 text-slate-600" />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
