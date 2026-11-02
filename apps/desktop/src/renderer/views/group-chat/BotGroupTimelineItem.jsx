/**
 * BotGroupTimelineItem.jsx
 * Cindy 风格的群聊时间线单条消息气泡：
 * 支持多作者头像、序列号标识、用户气泡靠右/伙伴靠左、Markdown/代码块解析、
 * cindy://bot/ 实体芯片化高亮、分工计划卡嵌套及排队补丁指示。
 * 单文件严格规范：<= 260 行
 */

import React, { useState } from 'react';
import { Bot, User, CornerDownRight, ListOrdered, Copy, Check, Wrench } from 'lucide-react';
import BotGroupPlanCard from './BotGroupPlanCard.jsx';
import IntentPreflightCard from '../../components/control-plane/IntentPreflightCard.jsx';
import ProgressiveDisclosureCard from '../../components/control-plane/ProgressiveDisclosureCard.jsx';
import ToolDecayScrubberCard from '../../components/control-plane/ToolDecayScrubberCard.jsx';

export default function BotGroupTimelineItem({
  message,
  onStepAction,
  onStartPlan,
}) {
  const isUser = message.role === 'user' || message.authorKind === 'user';
  const isQueued = message.isQueuedAmendment;
  const isPlan = message.kind === 'plan' || !!message.plan;

  if (isUser) {
    return (
      <div className="flex justify-end items-start space-x-3 mb-4 select-none">
        <div className="flex flex-col items-end max-w-2xl">
          <div className="flex items-center space-x-2 mb-1">
            {isQueued && (
              <span className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ListOrdered className="w-3 h-3" />
                排队递送中 (In-flight Queue)
              </span>
            )}
            {message.sequence && (
              <span className="text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1 rounded">
                #{message.sequence}
              </span>
            )}
            <span className="text-[11px] text-slate-400">你</span>
          </div>

          <div
            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              isQueued
                ? 'bg-sky-950/40 border border-sky-700/50 text-sky-100 rounded-tr-sm shadow-md'
                : 'bg-accent/15 border border-accent/30 text-slate-100 rounded-tr-sm'
            }`}
          >
            {renderContentWithMentionChips(message.content)}
          </div>

          {isQueued && (
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              <CornerDownRight className="w-3 h-3 text-sky-400" />
              已作为排队消息压入 Agent 运行流，将在当前步骤完成后无缝消费
            </div>
          )}
        </div>

        <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
          <User className="w-4 h-4" />
        </div>
      </div>
    );
  }

  // Assistant / Partner Turn
  const senderName = message.senderName || message.authorName || '伙伴';
  const timestamp = message.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="flex items-start space-x-3 max-w-3xl mb-4 select-none">
      <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
        <Bot className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center space-x-2">
          {message.sequence && (
            <span className="text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1 rounded">
              #{message.sequence}
            </span>
          )}
          <span className="text-xs font-semibold text-slate-200">{senderName}</span>
          <span className="text-[10px] font-mono text-slate-500">{timestamp}</span>
        </div>

        {/* 1. 意图预检分析卡片 */}
        {message.preflight && (
          <IntentPreflightCard preflight={message.preflight} />
        )}

        {/* Text Content */}
        {message.content && (
          <div className="bg-card/50 border border-border/70 rounded-2xl rounded-tl-sm p-4 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
            {renderContentWithMentionChips(message.content)}
          </div>
        )}

        {/* 2. 三层渐进披露卡片 */}
        {message.progressiveResource && (
          <ProgressiveDisclosureCard {...message.progressiveResource} />
        )}

        {/* Embedded Cindy Plan Card */}
        {isPlan && (
          <BotGroupPlanCard
            plan={message.plan}
            onStepAction={onStepAction}
            onStartPlan={onStartPlan}
          />
        )}

        {/* 3. 历史工具输出阶梯衰减卡片 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {message.toolCalls.map((t, idx) => (
              <ToolDecayScrubberCard
                key={idx}
                toolName={t.name}
                step={t.step || (idx + 1)}
                currentTurnStep={message.currentTurnStep || 6}
                args={t.args}
                rawOutput={typeof t.result === 'string' ? t.result : JSON.stringify(t.result, null, 2)}
                status={t.status}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolBadge({ tool }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-slate-800 bg-slate-950/60 rounded-lg text-xs font-mono overflow-hidden">
      <div
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 flex items-center justify-between bg-slate-900/50 hover:bg-slate-900 cursor-pointer"
      >
        <div className="flex items-center space-x-2 text-sky-400">
          <Wrench className="w-3.5 h-3.5" />
          <span>{tool.name}</span>
          <span className="text-[10px] text-slate-500">({tool.status || 'ok'})</span>
        </div>
        <span className="text-[10px] text-slate-500">{open ? '收起' : '展开'}</span>
      </div>
      {open && (
        <div className="p-2.5 bg-black/40 text-[11px] text-slate-400 overflow-x-auto space-y-1">
          <div>Args: <pre className="text-slate-300">{JSON.stringify(tool.args, null, 2)}</pre></div>
          {tool.result && <div>Result: <pre className="text-emerald-400">{JSON.stringify(tool.result, null, 2)}</pre></div>}
        </div>
      )}
    </div>
  );
}

function renderContentWithMentionChips(text) {
  if (!text) return null;
  const regex = /\[(.*?)\]\(cindy:\/\/bot\/(.*?)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const label = match[1];
    const botId = match[2];
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-medium align-baseline shadow-sm hover:bg-accent/25 transition-all cursor-pointer group"
        title={`cindy://bot/${botId}`}
      >
        <Bot className="w-3 h-3 text-accent" />
        <span>{label}</span>
      </span>
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}
