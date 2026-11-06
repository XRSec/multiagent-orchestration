import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  X,
  MessageSquare,
  Sliders,
  Code2,
  ArrowRight,
  CornerDownLeft,
  Command,
  ChevronRight,
} from 'lucide-react';
import { MOCK_SESSIONS } from '@/mock/sessions';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open handled by parent, or toggle
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Search results
  const matchingSessions = query.trim()
    ? MOCK_SESSIONS.filter(
        (s) =>
          s.title.toLowerCase().includes(query.toLowerCase()) ||
          s.workingDir.toLowerCase().includes(query.toLowerCase()) ||
          (s.tags && s.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())))
      )
    : [];

  const handleSelectSession = (id: string) => {
    onClose();
    navigate(`/cc-agent/${id}`);
  };

  const handleAction = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 select-none animate-in fade-in duration-150">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
      />

      {/* Dialog Box (Exact Claude Desktop Modal Specs: max-w-[670px] max-h-[550px], centered & responsive) */}
      <div className="relative w-full max-w-[670px] h-[85vh] max-h-[550px] bg-surface-elevated border border-border-default rounded-3xl shadow-2xl overflow-hidden flex flex-col z-10 transition-all text-xs">
        {/* Top Input Bar */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-border-default shrink-0">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="搜索或开始聊天"
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body: flex-1 to fill adaptive height */}
        <div className="flex-1 overflow-y-auto p-2 space-y-4">
          {/* Query is Empty: Show Quick Actions + Recent */}
          {!query.trim() ? (
            <>
              {/* Section 1: 快速操作 */}
              <div className="space-y-1">
                <div className="px-3 py-1 text-[11px] font-semibold text-text-tertiary">
                  快速操作
                </div>

                <div
                  onClick={() => handleAction('/cc-agent/new')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface-chip hover:bg-surface-hover cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 text-text-primary font-medium">
                    <MessageSquare className="w-4 h-4 text-accent-blue" />
                    <span>New chat</span>
                  </div>
                  <span className="hidden sm:inline text-text-tertiary font-mono text-[11px]">↵</span>
                </div>

                <div
                  onClick={() => handleAction('/cc-agent/new')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors text-text-secondary hover:text-text-primary"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="w-4 h-4 text-text-tertiary" />
                    <span>新建任务</span>
                  </div>
                  <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-surface border border-border-default text-[10px] font-mono text-text-tertiary">
                    ⌘ 2
                  </kbd>
                </div>

                <div
                  onClick={() => handleAction('/cc-agent/orca/s-orca-lead-01')}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors text-text-secondary hover:text-text-primary"
                >
                  <div className="flex items-center gap-2.5">
                    <Code2 className="w-4 h-4 text-text-tertiary" />
                    <span>任务</span>
                  </div>
                  <kbd className="hidden sm:inline px-1.5 py-0.5 rounded bg-surface border border-border-default text-[10px] font-mono text-text-tertiary">
                    ⌘ 3
                  </kbd>
                </div>
              </div>

              {/* Section 2: 最近 */}
              <div className="space-y-0.5 pt-1 border-t border-border-subtle">
                <div className="px-3 py-1 text-[11px] font-semibold text-text-tertiary flex items-center gap-1">
                  <span>最近</span>
                  <ChevronRight className="w-3 h-3" />
                </div>

                {MOCK_SESSIONS.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-2.5 flex-1 min-w-0 mr-3">
                      <Code2 className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                      <span className="text-xs text-text-primary truncate">
                        {session.title}
                      </span>
                    </div>
                    <span className="text-[10px] text-text-tertiary shrink-0 font-mono">
                      {session.updatedAt}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            /* Query is Active: Filtered Results (Screenshot 3 Specs) */
            <div className="space-y-1">
              {matchingSessions.length > 0 ? (
                matchingSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => handleSelectSession(session.id)}
                    className="p-3 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors space-y-1 group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-text-primary truncate">
                        <Code2 className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                        <span className="truncate">{session.title}</span>
                      </div>
                      <span className="text-[10px] text-text-tertiary shrink-0 font-mono">
                        {session.updatedAt}
                      </span>
                    </div>

                    {/* Matched Snippet Preview */}
                    <div className="text-[11px] font-mono text-text-tertiary pl-5 truncate">
                      .../{session.workingDir} · {session.model} · {session.tokens} tokens
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-text-tertiary">
                  未找到与 "{query}" 匹配的会话或任务
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Keyboard Navigation Footer */}
        <div className="h-9 px-4 bg-surface flex items-center justify-between text-[11px] text-text-tertiary border-t border-border-default shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span>选择</span>
              <kbd className="px-1 bg-surface-chip rounded text-[10px]">↑</kbd>
              <kbd className="px-1 bg-surface-chip rounded text-[10px]">↓</kbd>
            </span>
            <span className="flex items-center gap-1">
              <span>操作</span>
              <kbd className="px-1 bg-surface-chip rounded text-[10px]">↦</kbd>
            </span>
          </div>

          <div className="flex items-center gap-1">
            <span>打开菜单</span>
            <kbd className="px-1.5 py-0.5 bg-surface-chip rounded text-[10px] font-mono">⌘ K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}
