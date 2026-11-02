/**
 * BotGroupComposer.jsx
 * Cindy 风格的群聊输入框：
 * 支持 @ 点名候选弹窗、cindy://bot/ URI 格式注入、随时输入排队指示、
 * 以及分工模式标签切换。
 * 单文件严格规范：<= 230 行
 */

import React, { useState, useRef } from 'react';
import { Send, Sparkles, Clock, AtSign, Paperclip, FolderGit2 } from 'lucide-react';

export default function BotGroupComposer({
  onSendMessage,
  isExecuting = false,
  members = [],
  placeholder = '输入消息，打 @ 点名伙伴...',
}) {
  const [text, setText] = useState('');
  const [isDivisionMode, setIsDivisionMode] = useState(false);
  const [showMention, setShowMention] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);

  const candidates = members.filter((m) =>
    (m.name || m.botId || '').toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);

    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const lastAt = textBefore.lastIndexOf('@');

    if (lastAt !== -1) {
      const q = textBefore.slice(lastAt + 1);
      if (!/[\s\n]/.test(q) && q.length <= 20) {
        setShowMention(true);
        setMentionQuery(q);
        setMentionIndex(0);
        return;
      }
    }
    setShowMention(false);
  };

  const handlePickMention = (partner) => {
    const cursor = textareaRef.current ? textareaRef.current.selectionStart : text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const lastAt = before.lastIndexOf('@');

    if (lastAt !== -1) {
      const pName = partner.name || partner.botId;
      const mentionWire = `[@${pName}](cindy://bot/${partner.botId || partner.id}) `;
      const nextText = before.slice(0, lastAt) + mentionWire + after;
      setText(nextText);
      setShowMention(false);

      setTimeout(() => {
        if (textareaRef.current) {
          const nextPos = lastAt + mentionWire.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextPos, nextPos);
        }
      }, 10);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!text.trim()) return;

    onSendMessage({
      content: text.trim(),
      isDivision: isDivisionMode,
    });
    setText('');
    setIsDivisionMode(false);
    setShowMention(false);
  };

  const handleKeyDown = (e) => {
    if (showMention && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handlePickMention(candidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMention(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="p-3 border-t border-border bg-surface/90 backdrop-blur-md relative select-none">
      {/* Mention Picker Popup */}
      {showMention && candidates.length > 0 && (
        <div className="absolute bottom-[90px] left-4 w-72 bg-card border border-border shadow-2xl rounded-xl overflow-hidden z-50 p-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase px-2 py-1 flex items-center justify-between border-b border-border/50">
            <span>点名群内伙伴 (@ Mention)</span>
            <span className="text-[9px] text-slate-600">cindy://bot/ 协议</span>
          </div>

          <div className="max-h-44 overflow-y-auto space-y-0.5 mt-1">
            {candidates.map((cand, idx) => (
              <div
                key={cand.botId || cand.id || idx}
                onClick={() => handlePickMention(cand)}
                onMouseEnter={() => setMentionIndex(idx)}
                className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${
                  idx === mentionIndex
                    ? 'bg-accent/20 text-accent font-medium'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="text-xs font-semibold">{cand.name || cand.botId}</div>
                <div className="text-[10px] font-mono text-slate-500 truncate">
                  cindy://bot/{cand.botId || cand.id}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ribbon Bar */}
      <div className="flex items-center justify-between mb-2 px-1 text-[11px]">
        <div className="flex items-center space-x-2">
          {isExecuting ? (
            <span className="flex items-center space-x-1.5 text-sky-400 font-mono">
              <Clock className="w-3.5 h-3.5 animate-spin" />
              <span>伙伴处理中；发消息将无缝排入对话，无需打断</span>
            </span>
          ) : (
            <span className="text-slate-400 flex items-center space-x-1.5">
              <Sparkles className="w-3.5 h-3.5 text-slate-500" />
              <span>输入指令，打 @ 点名或勾选分工模式</span>
            </span>
          )}

          {/* Division Tag */}
          {isDivisionMode && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              <FolderGit2 className="w-3 h-3" />
              分工模式：交由负责人出安排
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsDivisionMode(!isDivisionMode)}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-all cursor-pointer ${
            isDivisionMode
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-semibold'
              : 'bg-card text-slate-400 border-border hover:text-slate-200'
          }`}
        >
          {isDivisionMode ? '取消分工' : '+ 安排分工'}
        </button>
      </div>

      {/* Form Input */}
      <form onSubmit={handleSubmit} className="relative flex items-end">
        <textarea
          ref={textareaRef}
          rows={2}
          value={text}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={isExecuting ? '随时输入补充建议，自动排队递送...' : placeholder}
          className="w-full bg-card/60 border border-border focus:border-accent/80 focus:ring-1 focus:ring-accent/50 rounded-2xl p-3 pr-12 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none transition-all shadow-inner font-sans"
        />

        <button
          type="submit"
          disabled={!text.trim()}
          className={`absolute right-2.5 bottom-2.5 p-2 rounded-xl transition-all ${
            text.trim()
              ? 'bg-accent text-slate-950 hover:bg-accent-hover shadow-md shadow-accent/20 cursor-pointer'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
          title="发送消息"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
