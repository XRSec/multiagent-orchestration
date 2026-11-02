/**
 * PartnerDirectChatView.jsx
 * 伙伴 1:1 独立私聊页面：顶栏元信息、双人独立对话流、Markdown/代码块高亮及输入交互
 * 严格遵循单文件行数规范（<= 300 行）
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  Trash2,
  Sliders,
  ArrowLeft,
  Bot,
  User,
  Copy,
  Check,
  Sparkles,
  Cpu,
  Shield,
  Terminal,
} from 'lucide-react';
import RoleStatusBadge from '../../components/common/RoleStatusBadge.jsx';

const AVATAR_ICONS = { Bot, Cpu, Shield, User, Sparkles, Terminal };

const DEFAULT_PRESETS = {
  'lead-orchestrator': [{
    id: 'dm-lead-1', role: 'assistant',
    content: '我是 **Lead Orchestrator**，负责多 Agent 调度编排与会话路由。\n各伙伴通信通道保活中，随时可下达架构攻坚或分工调度指令。',
    timestamp: '10:14:00',
  }],
  'agent-architect': [{
    id: 'dm-arch-1', role: 'assistant',
    content: '我是 **Agent Architect**，专精于伙伴沙箱构建与 AST 校验。\n已针对 `~/.multiagent-orchestration/partners/` 建立双平面隔离白名单：\n```json\n{\n  "symlinkIntegrity": true,\n  "forbiddenTools": ["rm", "curl", "wget"]\n}\n```\n需要我为新模块初始化脚手架吗？',
    timestamp: '10:15:20',
  }],
  'rea-partner': [{
    id: 'dm-rea-1', role: 'assistant',
    content: '我是 **REA Partner**，专精二进制逆向与 NDJSON 协议审计。\n已完成目标 ELF 符号表提取，发现 1 处潜在最大行长边界风险，报告已就绪。',
    timestamp: '10:16:45',
  }],
};

const PROMPT_SUGGESTIONS = [
  '审查当前沙箱隔离策略与权限白名单',
  '汇报当前多 Agent 执行队列负载',
  '针对协议边界溢出给出修复补丁',
];

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-3 py-1 text-slate-400">
        <span className="text-[10px] font-semibold uppercase text-sky-400">{language || 'code'}</span>
        <button onClick={handleCopy} className="flex items-center gap-1 text-[11px] hover:text-slate-200" title="复制代码">
          {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          <span>{copied ? '已复制' : '复制'}</span>
        </button>
      </div>
      <pre className="p-2.5 overflow-x-auto text-slate-200 leading-relaxed font-mono"><code>{code}</code></pre>
    </div>
  );
}

function DirectChatMessageBody({ content }) {
  if (!content) return null;
  const parts = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', text: content.slice(lastIndex, match.index) });
    parts.push({ type: 'code', language: match[1], code: match[2].trimEnd() });
    lastIndex = codeBlockRegex.lastIndex;
  }
  if (lastIndex < content.length) parts.push({ type: 'text', text: content.slice(lastIndex) });

  return (
    <div className="space-y-1.5 leading-relaxed text-sm">
      {parts.map((part, idx) => {
        if (part.type === 'code') return <CodeBlock key={idx} language={part.language} code={part.code} />;
        return (
          <div key={idx} className="whitespace-pre-wrap break-words">
            {part.text.split(/(\*\*.*?\*\*|`[^`]+`)/g).map((seg, sIdx) => {
              if (seg.startsWith('**') && seg.endsWith('**')) {
                return <strong key={sIdx} className="font-semibold text-sky-300">{seg.slice(2, -2)}</strong>;
              }
              if (seg.startsWith('`') && seg.endsWith('`')) {
                return (
                  <code key={sIdx} className="rounded bg-slate-800 px-1 py-0.5 font-mono text-xs text-sky-300 border border-slate-700/60">
                    {seg.slice(1, -1)}
                  </code>
                );
              }
              return seg;
            })}
          </div>
        );
      })}
    </div>
  );
}

export default function PartnerDirectChatView({ partner, onOpenPartnerSettings, onBack, className = '' }) {
  const partnerId = partner?.id || 'lead-orchestrator';
  const initialList = useMemo(() => DEFAULT_PRESETS[partnerId] || DEFAULT_PRESETS['lead-orchestrator'], [partnerId]);
  const [messages, setMessages] = useState(initialList);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef(null);

  useEffect(() => {
    setMessages(DEFAULT_PRESETS[partnerId] || [{
      id: `dm-${partnerId}-init`, role: 'assistant',
      content: `我是 **${partner?.name || '伙伴'}**（${partner?.role || '专有领域专家'}），很高兴与您私聊。\n随时可就专有领域提出任务与疑问。`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }]);
  }, [partnerId, partner?.name, partner?.role]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const text = inputText.trim();
    if (!text) return;
    const now = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    const userMsg = { id: `dm-user-${Date.now()}`, role: 'user', content: text, timestamp: now };
    const botReply = {
      id: `dm-bot-${Date.now() + 1}`, role: 'assistant',
      content: `收到关于「${text.slice(0, 18)}${text.length > 18 ? '...' : ''}」的指令。\n已针对当前上下文完成分析，正在保持点对点通道持续同步。`,
      timestamp: now,
    };
    setMessages((prev) => [...prev, userMsg, botReply]);
    setInputText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const IconComp = AVATAR_ICONS[partner?.avatar] || Bot;

  return (
    <div className={`flex h-full flex-1 flex-col bg-background text-slate-100 select-none ${className}`}>
      {/* 顶栏 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-surface/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button onClick={onBack} className="p-1 text-slate-400 hover:text-slate-200 transition-colors" title="返回">
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 shadow-sm" style={{ borderColor: `${partner?.avatarColor || '#38bdf8'}40` }}>
            <IconComp size={18} style={{ color: partner?.avatarColor || '#38bdf8' }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-slate-100 text-sm">{partner?.name || '伙伴'}</span>
              <RoleStatusBadge role={partner?.role} status={partner?.status || 'idle'} size="sm" />
            </div>
            <p className="truncate text-xs text-slate-400 font-mono">{partner?.role || '专属伙伴'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setMessages([])} className="flex items-center gap-1 rounded-lg border border-border/60 bg-card/60 px-2.5 py-1 text-xs text-slate-300 hover:text-rose-400" title="清空私聊记录">
            <Trash2 size={13} />
            <span>清空</span>
          </button>
          {onOpenPartnerSettings && (
            <button onClick={onOpenPartnerSettings} className="flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-xs text-sky-300 hover:bg-sky-500/20" title="配置伙伴 SOUL 与沙箱">
              <Sliders size={13} />
              <span>配置</span>
            </button>
          )}
        </div>
      </header>

      {/* 对话流 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-500 px-4">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10">
              <IconComp size={28} style={{ color: partner?.avatarColor || '#38bdf8' }} />
            </div>
            <h3 className="font-medium text-slate-200 text-base">{partner?.name} 私聊通道</h3>
            <p className="mt-1 max-w-md text-xs text-slate-400 leading-relaxed">{partner?.summaryForLead || '与该伙伴建立点对点 1:1 独立私聊。输入任务可直接获得专属领域支持。'}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 max-w-lg">
              {PROMPT_SUGGESTIONS.map((item, idx) => (
                <button key={idx} onClick={() => setInputText(item)} className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-500/50 hover:text-sky-300 transition-colors">
                  {item}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div key={msg.id} className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
                {!isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800" style={{ borderColor: `${partner?.avatarColor || '#38bdf8'}40` }}>
                    <IconComp size={14} style={{ color: partner?.avatarColor || '#38bdf8' }} />
                  </div>
                )}
                <div className={`flex flex-col max-w-[80%] ${isUser ? 'items-end' : 'items-start'}`}>
                  <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-slate-400">
                    <span className="font-medium text-slate-300">{isUser ? '你' : partner?.name}</span>
                    <span>·</span>
                    <span className="font-mono">{msg.timestamp}</span>
                  </div>
                  <div className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${isUser ? 'rounded-tr-xs border border-sky-500/30 bg-sky-500/15 text-slate-100' : 'rounded-tl-xs border border-border/80 bg-card/80 text-slate-200'}`}>
                    <DirectChatMessageBody content={msg.content} />
                  </div>
                </div>
                {isUser && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300">
                    <User size={14} />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入框 */}
      <footer className="border-t border-border/80 bg-surface/90 p-3 backdrop-blur">
        <div className="rounded-xl border border-border/80 bg-slate-900/90 p-2 shadow-inner focus-within:border-sky-500/50 transition-colors">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`发消息给 ${partner?.name || '伙伴'}... (Enter 发送，Shift+Enter 换行)`}
            rows={2}
            className="w-full resize-none bg-transparent px-2 text-sm text-slate-100 placeholder-slate-500 outline-none leading-relaxed font-sans"
          />
          <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 px-2">
            <span>Shift + Enter 换行</span>
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1 font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 transition-all text-xs"
            >
              <span>发送</span>
              <Send size={12} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
