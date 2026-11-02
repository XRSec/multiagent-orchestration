import React, { useState, useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Sparkles, Clock, AtSign, Bot } from 'lucide-react';

function resolvePartnerIcon(p) {
  if (typeof p?.icon === 'function') return p.icon;
  return Bot;
}

export default function MessageInput({
  onSendMessage,
  isExecuting,
  activePartnerName,
  partners = [],
}) {
  const [input, setInput] = useState('');
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef(null);

  // Filter candidates based on mention query
  const candidates = partners.filter((p) =>
    p.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
    p.id.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);

    const cursor = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const query = textBeforeCursor.slice(lastAtPos + 1);
      // Valid mention if no whitespace or punctuation
      if (!/[\s\n]/.test(query) && query.length <= 20) {
        setShowMentionPicker(true);
        setMentionQuery(query);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentionPicker(false);
  };

  const handleSelectMention = (partner) => {
    const cursor = textareaRef.current ? textareaRef.current.selectionStart : input.length;
    const textBeforeCursor = input.slice(0, cursor);
    const textAfterCursor = input.slice(cursor);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      // Format as standard Cindy URI wire link: [@Name](cindy://bot/botId)
      const mentionMarkdown = `[@${partner.name}](cindy://bot/${partner.id}) `;
      const nextText = textBeforeCursor.slice(0, lastAtPos) + mentionMarkdown + textAfterCursor;
      setInput(nextText);
      setShowMentionPicker(false);

      setTimeout(() => {
        if (textareaRef.current) {
          const nextCursor = lastAtPos + mentionMarkdown.length;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextCursor, nextCursor);
        }
      }, 10);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if (!input.trim()) return;

    onSendMessage(input.trim());
    setInput('');
    setShowMentionPicker(false);
  };

  const handleKeyDown = (e) => {
    if (showMentionPicker && candidates.length > 0) {
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
        handleSelectMention(candidates[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionPicker(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="p-4 border-t border-border bg-surface/90 backdrop-blur-md relative select-none">
      {/* Mention Popup Menu */}
      {showMentionPicker && candidates.length > 0 && (
        <div className="absolute bottom-[90px] left-6 w-72 bg-card border border-border shadow-2xl rounded-xl overflow-hidden z-50 p-1 space-y-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase px-2 py-1 flex items-center justify-between border-b border-border/50">
            <span>点名呼叫伙伴 (@ Mention)</span>
            <span className="text-[9px] text-slate-600">cindy://bot/ URI 协议</span>
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {candidates.map((partner, idx) => {
              const Icon = resolvePartnerIcon(partner);
              const isSelected = idx === mentionIndex;
              return (
                <div
                  key={partner.id}
                  onClick={() => handleSelectMention(partner)}
                  onMouseEnter={() => setMentionIndex(idx)}
                  className={`flex items-center space-x-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-accent/20 text-accent font-medium'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-accent flex-shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs truncate flex items-center justify-between">
                      <span>{partner.name}</span>
                      <span className="text-[9px] font-mono text-slate-500 truncate max-w-[90px]">
                        cindy://bot/{partner.id}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">
                      {partner.role}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Dynamic Context Ribbon */}
      <div className="flex items-center justify-between mb-2 px-1 text-[11px]">
        {isExecuting ? (
          <div className="flex items-center space-x-1.5 text-sky-400 font-mono">
            <Clock className="w-3.5 h-3.5 animate-spin" />
            <span>{activePartnerName} 正在处理中；此时发送的消息将自动排入流中递送，无需打断</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-slate-500" />
            <span>输入任务指令，打 <code className="bg-slate-800 text-accent px-1 rounded font-mono">@</code> 可定向呼叫伙伴</span>
          </div>
        )}
        <span className="text-slate-500 font-mono text-[10px]">Enter 发送 / Shift+Enter 换行</span>
      </div>

      {/* Input Box */}
      <form onSubmit={handleSubmit} className="relative flex items-end">
        <textarea
          ref={textareaRef}
          rows={2}
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={
            isExecuting
              ? `随时输入补充要求（例如：“顺便把测试用例也加上”），自动排队递送...`
              : `输入指令，打 @ 点名指定伙伴（如 @REA Partner 审计协议）...`
          }
          className="w-full bg-card/60 border border-border focus:border-accent/80 focus:ring-1 focus:ring-accent/50 rounded-2xl p-3 pr-12 text-sm text-slate-100 placeholder-slate-500 resize-none outline-none transition-all shadow-inner font-sans"
        />

        <button
          type="submit"
          disabled={!input.trim()}
          className={`absolute right-2.5 bottom-2.5 p-2 rounded-xl transition-all ${
            input.trim()
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
