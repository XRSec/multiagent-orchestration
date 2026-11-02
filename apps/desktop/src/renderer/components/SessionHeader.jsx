import React from 'react';
import { Plus, GitFork, Trash2, Users, Bot, Layers } from 'lucide-react';

export default function SessionHeader({
  session,
  partners,
  onNewChat,
  onForkSession,
  onClearMessages,
}) {
  const isGroup = session.kind === 'group';

  return (
    <header className="h-14 border-b border-border flex items-center justify-between px-6 bg-surface/70 backdrop-blur-md select-none">
      {/* Title & Metadata */}
      <div className="flex items-center space-x-3 min-w-0">
        <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
          {isGroup ? <Users className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <h1 className="font-semibold text-sm text-slate-100 truncate max-w-md">
              {session.title || '新会话'}
            </h1>
            {isGroup ? (
              <span className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full">
                多Agent群聊
              </span>
            ) : (
              <span className="text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full">
                {session.partnerName}
              </span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-2">
            <span>Room: {session.id}</span>
            <span>·</span>
            <span>Seq: #{session.messages ? session.messages.length : 0}</span>
            {isGroup && (
              <>
                <span>·</span>
                <span className="text-slate-400">Organizer: lead-orchestrator</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-2">
        {/* Fork Session */}
        <button
          onClick={() => onForkSession(session.id)}
          title="分叉当前对话 (--fork-session)"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-card hover:bg-slate-700/60 border border-border/80 text-slate-300 hover:text-slate-100 transition-all cursor-pointer"
        >
          <GitFork className="w-3.5 h-3.5 text-slate-400" />
          <span>分叉分支</span>
        </button>

        {/* Clear Messages */}
        <button
          onClick={() => onClearMessages(session.id)}
          title="清空当前消息"
          className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-card border border-transparent hover:border-border transition-all cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>

        {/* Quick New Chat */}
        <button
          onClick={() => onNewChat()}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-slate-950 hover:bg-accent-hover transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新会话</span>
        </button>
      </div>
    </header>
  );
}
