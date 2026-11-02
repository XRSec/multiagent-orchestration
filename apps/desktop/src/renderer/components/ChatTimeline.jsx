import React from 'react';
import { Bot, User, Wrench, ChevronDown, ChevronRight, CornerDownRight, ListOrdered } from 'lucide-react';
import IntentPreflightCard from './control-plane/IntentPreflightCard.jsx';
import ProgressiveDisclosureCard from './control-plane/ProgressiveDisclosureCard.jsx';
import ToolDecayScrubberCard from './control-plane/ToolDecayScrubberCard.jsx';

export default function ChatTimeline({ messages, activePartner }) {
  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5 select-none">
      {messages.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-slate-500">
          <Bot className="w-12 h-12 text-slate-600 mb-3 stroke-[1.5]" />
          <div className="text-sm font-medium text-slate-300">
            {activePartner.name} 就绪
          </div>
          <div className="text-xs text-slate-500 max-w-sm mt-1">
            直接在下方输入任务开始多 Agent 协作。输入 <code className="bg-slate-800 text-accent px-1 rounded font-mono">@</code> 可定向呼叫伙伴。
          </div>
        </div>
      ) : (
        messages.map((msg) => (
          <TimelineMessageItem key={msg.id} msg={msg} />
        ))
      )}
    </div>
  );
}

/**
 * 核心：解析正文中的 [名称](cindy://bot/<botId>) 链接，并渲染为高保真 AgentReferenceChip 胶囊
 */
function renderMessageContentWithChips(text) {
  if (!text) return null;

  // 正则匹配 [名字](cindy://bot/<botId>)
  const regex = /\[(.*?)\]\(cindy:\/\/bot\/(.*?)\)/g;
  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // 文本前缀
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    const label = match[1];
    const botId = match[2];

    // 渲染为高科技风格 Agent 胶囊卡片
    parts.push(
      <span
        key={match.index}
        className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 rounded-md bg-accent/15 border border-accent/40 text-accent text-xs font-medium align-baseline shadow-sm hover:bg-accent/25 transition-all cursor-pointer group"
        title={`协议底层映射: cindy://bot/${botId}`}
      >
        <Bot className="w-3 h-3 text-accent" />
        <span>{label}</span>
        <span className="text-[9px] font-mono opacity-50 hidden group-hover:inline ml-0.5">
          #{botId}
        </span>
      </span>
    );

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function TimelineMessageItem({ msg }) {
  const isUser = msg.role === 'user';
  const isQueuedAmendment = msg.isQueuedAmendment;

  if (isUser) {
    return (
      <div className="flex justify-end items-start space-x-3">
        <div className="flex flex-col items-end max-w-2xl">
          <div className="flex items-center space-x-2 mb-1">
            {isQueuedAmendment && (
              <span className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <ListOrdered className="w-3 h-3" />
                排队递送中 (In-flight Queue)
              </span>
            )}
            {msg.sequence && (
              <span className="text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1 rounded">
                #{msg.sequence}
              </span>
            )}
            <span className="text-[11px] text-slate-400">你</span>
          </div>

          <div
            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
              isQueuedAmendment
                ? 'bg-sky-950/40 border border-sky-700/50 text-sky-100 rounded-tr-sm shadow-md'
                : 'bg-accent/15 border border-accent/30 text-slate-100 rounded-tr-sm'
            }`}
          >
            {renderMessageContentWithChips(msg.content)}
          </div>
          {isQueuedAmendment && (
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

  // Assistant / Subagent Turn
  return (
    <div className="flex items-start space-x-3 max-w-3xl">
      <div className="w-8 h-8 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent flex-shrink-0">
        <Bot className="w-4 h-4" />
      </div>

      <div className="flex-1 space-y-3">
        <div className="flex items-center space-x-2">
          {msg.sequence && (
            <span className="text-[10px] font-mono text-slate-500 bg-slate-800/80 px-1 rounded">
              #{msg.sequence}
            </span>
          )}
          <span className="text-xs font-semibold text-slate-200">
            {msg.senderName || 'Orchestrator'}
          </span>
          <span className="text-[10px] font-mono text-slate-500">{msg.timestamp}</span>
        </div>

        {/* 1. 意图预检分析卡片 (小模型前置分析 & 多轮蒸馏上下文) */}
        {msg.preflight && (
          <IntentPreflightCard preflight={msg.preflight} />
        )}

        {/* Text Body */}
        {msg.content && (
          <div className="bg-card/50 border border-border/70 rounded-2xl rounded-tl-sm p-4 text-sm text-slate-200 leading-relaxed space-y-2 whitespace-pre-wrap">
            {renderMessageContentWithChips(msg.content)}
          </div>
        )}

        {/* 2. 三层渐进披露卡片 (Tier 1 折叠 -> Tier 2 微胶囊 -> Tier 3 全量切片) */}
        {msg.progressiveResource && (
          <ProgressiveDisclosureCard {...msg.progressiveResource} />
        )}

        {/* 3. 历史工具输出阶梯衰减卡片 (Step Decay Scrubber) */}
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="space-y-2">
            {msg.toolCalls.map((tool, idx) => (
              <ToolDecayScrubberCard
                key={idx}
                toolName={tool.name}
                step={tool.step || (idx + 1)}
                currentTurnStep={msg.currentTurnStep || 6}
                args={tool.args}
                rawOutput={typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
                status={tool.status}
              />
            ))}
          </div>
        )}

        {/* Subagent Fan-out Queue Cards */}
        {msg.subagentTasks && msg.subagentTasks.length > 0 && (
          <div className="bg-slate-900/80 border border-sky-900/50 rounded-xl p-3 space-y-2.5">
            <div className="text-[11px] font-mono text-sky-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold">
                <Bot className="w-3.5 h-3.5" />
                副 Agent 异步执行队列 (Fan-out Tasks)
              </span>
              <span className="text-slate-500 text-[10px]">
                支持随时追加消息入队
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {msg.subagentTasks.map((task) => (
                <div
                  key={task.ticketId}
                  className="bg-card/90 border border-border/80 rounded-lg p-2.5 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse"></span>
                    <span className="font-semibold text-slate-200">{task.target}</span>
                    <span className="text-slate-400 text-[11px] truncate max-w-[280px]">
                      {task.instruction}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    {task.pendingMessagesCount > 0 && (
                      <span className="text-[10px] bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/30 font-mono">
                        +{task.pendingMessagesCount} 待消费消息
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                      {task.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ tool }) {
  const [expanded, setExpanded] = React.useState(false);

  return (
    <div className="border border-border/70 bg-slate-900/70 rounded-xl overflow-hidden text-xs">
      <div
        onClick={() => setExpanded(!expanded)}
        className="px-3 py-2 bg-slate-800/40 hover:bg-slate-800/70 flex items-center justify-between cursor-pointer border-b border-border/40"
      >
        <div className="flex items-center space-x-2 text-slate-300">
          <Wrench className="w-3.5 h-3.5 text-accent" />
          <span className="font-mono font-medium text-accent">{tool.name}</span>
          <span className="text-slate-500 text-[11px]">({tool.status || 'completed'})</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
      </div>

      {expanded && (
        <div className="p-3 bg-black/40 font-mono text-[11px] text-slate-400 space-y-2 overflow-x-auto">
          <div>
            <div className="text-slate-500 mb-1">Arguments:</div>
            <pre className="text-slate-300">{JSON.stringify(tool.args, null, 2)}</pre>
          </div>
          {tool.result && (
            <div className="pt-2 border-t border-slate-800">
              <div className="text-slate-500 mb-1">Result:</div>
              <pre className="text-emerald-400">{JSON.stringify(tool.result, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
