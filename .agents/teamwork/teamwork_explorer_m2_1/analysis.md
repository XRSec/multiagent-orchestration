# 伙伴私聊视图与多 Agent 时间轴组件深度设计与实现规范

## 1. 核心目标与规格概览

本规范针对 **Milestone M2 伙伴私聊与群聊核心视图** 中分配的两个核心前端视图组件制定完整设计方案与生产级实现规范：
1. `apps/desktop/src/renderer/views/direct-chat/PartnerDirectChatView.jsx`：伙伴 1:1 独立私聊页面；
2. `apps/desktop/src/renderer/views/group-chat/BotGroupTimelineItem.jsx`：多 Agent 差异化时间轴气泡组件。

### 单文件行数规范契约
根据仓库 `AGENTS.md` 及 `docs/dev-rules/script-standards.md`，本项目实行严格的代码行数规范（单文件 `<= 600` 行，`500` 行预警）。本设计两组件均预估在 260~275 行左右，**严格低于 280 行**，远低于 500 行预警门槛，具备极高内聚性与低耦合度。

| 组件文件路径 | 功能职责 | 依赖原子组件/数据源 | 预估行数 | 行数上限与警戒线 |
|---|---|---|---|---|
| `apps/desktop/src/renderer/views/direct-chat/PartnerDirectChatView.jsx` | 伙伴 1:1 私聊页（顶栏、独立对话流、Markdown/代码块、Composer 输入框） | `RoleStatusBadge.jsx`, `mockPartners.js` | 263 行 | <= 280 行 (500 警戒) |
| `apps/desktop/src/renderer/views/group-chat/BotGroupTimelineItem.jsx` | 多 Agent 时间轴单项（专属色彩、连续合并、引用气泡、交接文件药丸） | `RoleStatusBadge.jsx`, `mockGroupSessions.js` | 274 行 | <= 280 行 (500 警戒) |

---

## 2. 组件一：`PartnerDirectChatView.jsx` 架构设计

### 2.1 模块职责与交互契约
- **页面定位**：提供与特定伙伴进行 1:1 点对点深度对话的沉浸式工作台。
- **Props 契约**：
  - `partner`: `Object`（包含 `id, name, role, avatar, avatarColor, status, summaryForLead, soulMd, memoryMd` 等全量元数据）。
  - `onOpenPartnerSettings`: `Function`（可选，点击顶栏「配置」按钮时打开 M3 伙伴配置抽屉 `PartnerSettingsDrawer`）。
  - `onBack`: `Function`（可选，提供从私聊快速切回群聊或侧边栏列表的返回触发器）。
  - `className`: `string`。
- **三大区域解耦**：
  1. **顶栏 (Header)**：高度 `h-14`，背景毛玻璃 `bg-surface/90 backdrop-blur`，左侧伙伴头像与呼吸状态指示器，中部伙伴名与 `RoleStatusBadge`，右侧快捷清空与配置抽屉入口。
  2. **对话流 (Message Stream)**：独立消息状态 `messages`，支持内置预设对话引导（针对 Lead Orchestrator、Agent Architect、REA Partner 的专属引导语）。用户居右（蓝底 `bg-sky-500/15 border-sky-500/30 text-slate-100`），伙伴居左（卡片底 `bg-card/80 border-border/80 text-slate-200`）。支持零依赖 Markdown 与独立语法高亮代码块（含语言标签、一键复制按钮与已复制反馈）。
  3. **私聊输入框 (Composer)**：贴底固定，背景毛玻璃，支持自适应多行 Textarea、`Enter` 发送、`Shift+Enter` 换行、实时字数空状态校验。

### 2.2 完整落地实现源码（263 行）

```jsx
/**
 * PartnerDirectChatView.jsx
 * 伙伴 1:1 独立私聊页面：顶栏元信息、双人独立对话流、Markdown/代码块高亮及输入交互
 * 严格遵循单文件行数规范（<= 280 行）
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
```

---

## 3. 组件二：`BotGroupTimelineItem.jsx` 架构设计

### 3.1 模块职责与交互契约
- **页面定位**：渲染多 Agent 协同群聊中的差异化时间轴发言单元。
- **Props 契约**：
  - `message`: `Object`（包含 `id, sequence, kind, authorKind, authorBotId, authorName, authorRole, avatar, avatarColor, content, createdAt, timestamp, mentions, files, quote, planId`）。
  - `isContinued`: `boolean`（父时间轴根据前后两条消息作者及时间跨度 `< 5分钟` 计算得出）。
  - `onQuote`: `Function(message)`（点击悬停工具栏引用回复按钮）。
  - `onQuoteClick`: `Function(messageId)`（点击引用气泡跳转/高亮原消息）。
  - `renderPlanCard`: `Function(planId, message)`（可选，渲染分工计划卡组件 `BotGroupPlanCard`）。
  - `className`: `string`。
- **核心功能亮点**：
  1. **多作者差异化与角色胶囊**：伙伴专属色彩（`msg.avatarColor`）、角色标签调用 `RoleStatusBadge`。
  2. **同作者连续发言合并机制**：
     - 若 `isContinued === true`，隐藏头像与名称顶栏；
     - 左侧 28px 槽位默认透明，悬停时淡入展示时钟（`time text-[10px] opacity-0 group-hover:opacity-100`）；
     - 上下内边距收紧为 `py-0.5`，呈现连续连贯对话流。
  3. **引用气泡 (Quoted Message)**：
     - 气泡顶部渲染左侧蓝色亮线（`border-l-2 border-sky-400 bg-slate-900/70`），展示被引用者名字与正文摘要，点击响应 `onQuoteClick`。
  4. **交接文件药丸 (Handoff Files)**：
     - 当消息含有 `files` 产物文件时，在底部展示翠绿色高科技胶囊（`border-emerald-500/30 bg-emerald-500/10 text-emerald-300`），悬停显示完整路径。
  5. **Markdown 与 @点名高亮解析**：
     - 正文匹配 `@名称` 转换为高科技点名蓝光胶囊；
     - 代码块独立容器、语法复制反馈；加粗与行内代码精准解析。
  6. **消息种类分支流 (Kind Branching)**：
     - `kind === 'notice'`：系统广播胶囊居中展示；
     - `kind === 'plan'`：调用 `renderPlanCard` 渲染分工计划卡；
     - `kind === 'message'`：双向气泡（用户居右暗蓝底，伙伴居左卡片底）。

### 3.2 完整落地实现源码（274 行）

```jsx
/**
 * BotGroupTimelineItem.jsx
 * 多 Agent 差异化时间轴气泡：专属色彩名称、角色色块胶囊、时间戳、连续发言合并、引用气泡、Markdown及交接文件
 * 严格遵循单文件行数规范（<= 280 行）
 */

import React, { useState } from 'react';
import {
  Bot,
  User,
  Quote,
  Copy,
  Check,
  FileCode,
  Info,
  Calendar,
  Sparkles,
  Cpu,
  Shield,
  Terminal,
} from 'lucide-react';
import RoleStatusBadge from '../../components/common/RoleStatusBadge.jsx';

const AVATAR_ICONS = { Bot, Cpu, Shield, User, Sparkles, Terminal };

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

function TimelineMessageContent({ content }) {
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
            {part.text.split(/(\*\*.*?\*\*|`[^`]+`|@[\w\u4e00-\u9fa5\s-]+?(?=[，。！？\s]|$))/g).map((seg, sIdx) => {
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
              if (seg.startsWith('@') && seg.length > 1) {
                return (
                  <span key={sIdx} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 mx-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-medium">
                    {seg}
                  </span>
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

export default function BotGroupTimelineItem({
  message,
  isContinued = false,
  onQuote,
  onQuoteClick,
  renderPlanCard,
  className = '',
}) {
  const [copied, setCopied] = useState(false);
  if (!message) return null;

  // 1. 系统通知
  if (message.kind === 'notice') {
    return (
      <div className={`flex items-center justify-center py-2 select-none ${className}`}>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1 text-xs text-slate-400 shadow-xs">
          <Info size={12} className="text-sky-400" />
          <span>{message.content}</span>
          <span className="font-mono text-[10px] text-slate-500 ml-1">{message.createdAt}</span>
        </div>
      </div>
    );
  }

  // 2. 计划卡消息（委托给 renderPlanCard 或默认提示）
  if (message.kind === 'plan') {
    if (typeof renderPlanCard === 'function') {
      return (
        <div className={`py-1.5 select-none ${className}`}>
          {renderPlanCard(message.planId, message)}
        </div>
      );
    }
    return (
      <div className={`py-1.5 flex justify-start pl-9 select-none ${className}`}>
        <div className="w-full max-w-2xl rounded-xl border border-sky-500/40 bg-card/90 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-sky-400 mb-2 font-mono">
            <span className="flex items-center gap-1 font-semibold">
              <Calendar size={13} />
              <span>分工计划卡 #{message.planId}</span>
            </span>
            <span>{message.createdAt}</span>
          </div>
          <p className="text-xs text-slate-300">{message.content || '多 Agent 协同分工执行步骤已更新。'}</p>
        </div>
      </div>
    );
  }

  // 3. 普通消息（用户 vs 伙伴）
  const isUser = message.authorKind === 'user';
  const IconComp = AVATAR_ICONS[message.avatar] || (isUser ? User : Bot);

  const handleCopy = () => {
    navigator.clipboard?.writeText(message.content || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`group relative flex min-w-0 items-start gap-2.5 py-0.5 select-none ${isUser ? 'justify-end' : 'justify-start'} ${className}`}>
      {/* 伙伴侧头像与连续发言时间槽 */}
      {!isUser && (
        <div className="flex w-7 shrink-0 justify-end pt-1">
          {isContinued ? (
            <span className="select-none text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {message.createdAt?.slice(0, 5)}
            </span>
          ) : (
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 shadow-sm"
              style={{ borderColor: `${message.avatarColor || '#38bdf8'}40` }}
            >
              <IconComp size={14} style={{ color: message.avatarColor || '#38bdf8' }} />
            </div>
          )}
        </div>
      )}

      {/* 消息主体 */}
      <div className={`flex flex-col min-w-0 max-w-[78%] ${isUser ? 'items-end' : 'items-start'}`}>
        {/* 作者顶栏（非连续发言时展示） */}
        {!isContinued && (
          <div className="mb-1 flex items-center gap-1.5 px-1 text-xs select-none">
            <span
              className="font-semibold"
              style={{ color: !isUser && message.avatarColor ? message.avatarColor : undefined }}
            >
              {message.authorName}
            </span>
            {!isUser && message.authorRole && (
              <RoleStatusBadge role={message.authorRole} showStatusDot={false} size="sm" />
            )}
            <span className="text-[10px] font-mono text-slate-500">{message.createdAt}</span>
          </div>
        )}

        {/* 气泡与悬停工具栏容器 */}
        <div className="relative group/bubble flex items-start gap-1">
          <div
            className={`min-w-0 break-words rounded-2xl px-3.5 py-2.5 text-sm shadow-sm transition-all ${
              isUser
                ? 'rounded-tr-xs border border-sky-500/30 bg-sky-500/15 text-slate-100'
                : 'rounded-tl-xs border border-border/80 bg-card/80 text-slate-200'
            }`}
          >
            {/* 引用气泡 */}
            {message.quote && (
              <div
                onClick={() => onQuoteClick?.(message.quote.messageId)}
                className="mb-2 flex cursor-pointer items-start gap-1.5 rounded-r border-l-2 border-sky-400 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-900/90 transition-colors"
                title="跳转查看被引用消息"
              >
                <Quote size={11} className="shrink-0 text-sky-400 mt-0.5" />
                <div className="min-w-0 truncate">
                  <span className="font-semibold text-slate-200">@{message.quote.authorName}</span>
                  <span className="mx-1">:</span>
                  <span className="truncate text-slate-400">{message.quote.textSnippet}</span>
                </div>
              </div>
            )}

            {/* 正文 */}
            <TimelineMessageContent content={message.content} />

            {/* 交接文件药丸 */}
            {message.files && message.files.length > 0 && (
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5">
                {message.files.map((file, fIdx) => (
                  <div
                    key={fIdx}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300 hover:bg-emerald-500/20 cursor-pointer transition-colors"
                    title={`产物交接文件: ${file}`}
                  >
                    <FileCode size={12} className="text-emerald-400" />
                    <span className="truncate max-w-[200px]">{file}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 悬停浮动操作栏 */}
          <div className="opacity-0 group-hover/bubble:opacity-100 transition-opacity flex items-center gap-1 self-center bg-surface/90 border border-border/80 rounded-lg p-1 shadow-md">
            {onQuote && (
              <button
                onClick={() => onQuote(message)}
                className="p-1 text-slate-400 hover:text-sky-300 hover:bg-card rounded"
                title="引用回复"
              >
                <Quote size={12} />
              </button>
            )}
            <button
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-sky-300 hover:bg-card rounded"
              title="复制消息"
            >
              {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      </div>

      {/* 用户侧头像与连续发言时间槽 */}
      {isUser && (
        <div className="flex w-7 shrink-0 justify-start pt-1">
          {isContinued ? (
            <span className="select-none text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
              {message.createdAt?.slice(0, 5)}
            </span>
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-300 shadow-sm">
              <User size={14} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## 4. 与 M2 其它组件及全局路由的协同方式

1. **与 `BotGroupChatView.jsx` 的集成关系**：
   - `BotGroupChatView` 作为群聊容器，负责遍历 `session.messages`，并在调用 `<BotGroupTimelineItem>` 时计算 `isContinued`：
     ```jsx
     const isContinued = index > 0 && 
       messages[index - 1].authorKind === msg.authorKind &&
       messages[index - 1].authorBotId === msg.authorBotId &&
       Math.abs((msg.timestamp || 0) - (messages[index - 1].timestamp || 0)) < 300000;
     ```
   - 当点击悬停栏中的「引用」时，触发 `setQuote({ messageId: msg.id, authorName: msg.authorName, textSnippet: msg.content.slice(0, 50) })`，将引用状态传递给 `BotGroupComposer`。
2. **与 M3 抽屉组件的联动**：
   - `PartnerDirectChatView` 顶栏右上角「配置」按钮绑定 `onOpenPartnerSettings` 回调，唤起 M3 的 `PartnerSettingsDrawer`。
3. **与 M4 路由导航的联动**：
   - 在 `App.jsx` 中，侧边栏切换到伙伴项时渲染 `<PartnerDirectChatView partner={selectedPartner} />`；切换到群聊项时渲染群聊视图。
