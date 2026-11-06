import React, { useState } from 'react';
import {
  Sparkles,
  ChevronRight,
  ListTodo,
  CheckCircle2,
  Terminal,
  FileCode
} from 'lucide-react';
import type { ChatMessage, ToolCallItem } from '@/mock/messages';

interface AssistantExecutionCardsProps {
  msg: ChatMessage;
}

export const AssistantExecutionCards: React.FC<AssistantExecutionCardsProps> = ({ msg }) => {
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | null>('t1');

  return (
    <>
      {/* 1. Official ThinkingCard */}
      {msg.thinking && (
        <div className="w-full select-text">
          <button
            onClick={() => setThinkingExpanded(!thinkingExpanded)}
            className="flex items-center gap-1.5 py-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors group/think cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent-purple" />
            <span className="font-normal">
              {thinkingExpanded
                ? '思考过程'
                : `已思考 ${msg.thinking.durationSeconds} 秒`}
            </span>
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                thinkingExpanded ? 'rotate-90' : ''
              }`}
            />
          </button>

          {thinkingExpanded && (
            <div className="mt-1 pl-3 py-1.5 border-l border-border-default text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed select-text italic bg-surface-elevated/40 rounded-r-lg">
              {msg.thinking.text}
            </div>
          )}
        </div>
      )}

      {/* 2. Official TodoListCard */}
      {msg.todos && msg.todos.length > 0 && (
        <div className="w-full bg-surface-elevated/90 backdrop-blur-md border border-border-default rounded-2xl p-3.5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-text-primary pb-1 border-b border-border-subtle">
            <div className="flex items-center gap-1.5">
              <ListTodo className="w-4 h-4 text-accent-blue" />
              <span>任务推进清单</span>
            </div>
            <span className="text-[10px] font-mono text-accent-green font-medium">
              {msg.todos.filter((t: { completed: boolean }) => t.completed).length} / {msg.todos.length} 完成
            </span>
          </div>

          <div className="space-y-1.5 pt-0.5">
            {msg.todos.map((todo: { text: string; completed: boolean }, idx: number) => (
              <div key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
                <CheckCircle2
                  className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                    todo.completed ? 'text-accent-green' : 'text-text-tertiary'
                  }`}
                />
                <span className={todo.completed ? 'line-through text-text-tertiary' : 'text-text-primary'}>
                  {todo.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Official ToolCallCards */}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="w-full space-y-1.5">
          {msg.toolCalls.map((tc: ToolCallItem) => {
            const isExpanded = expandedToolId === tc.id;
            return (
              <div
                key={tc.id}
                className="bg-surface-elevated/90 backdrop-blur-md border border-border-default rounded-xl overflow-hidden text-xs transition-all shadow-sm"
              >
                <div
                  onClick={() => setExpandedToolId(isExpanded ? null : tc.id)}
                  className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-surface-hover/60 transition-colors"
                >
                  <div className="flex items-center gap-2 font-mono">
                    <ChevronRight
                      className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                    <Terminal className="w-3.5 h-3.5 text-accent-amber" />
                    <span className="font-bold text-text-primary">{tc.tool}</span>
                    <span className="text-text-tertiary font-sans truncate max-w-md">
                      {tc.description}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-tertiary font-mono">
                      {tc.executionTimeMs}ms
                    </span>
                    <span className="text-[10px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded font-mono font-medium">
                      SUCCESS
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 py-2.5 bg-surface/70 border-t border-border-subtle font-mono text-[11px] space-y-1.5 text-text-secondary">
                    {tc.args && (
                      <div className="text-text-tertiary">
                        参数: <span className="text-text-primary">{JSON.stringify(tc.args)}</span>
                      </div>
                    )}
                    {tc.output && (
                      <div className="text-text-secondary bg-surface-elevated p-2 rounded-lg border border-border-subtle whitespace-pre-wrap">
                        {tc.output}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Official TurnChangesCard */}
      {msg.diff && (
        <div className="w-full bg-surface-elevated/90 backdrop-blur-md border border-border-default rounded-2xl overflow-hidden text-xs font-mono shadow-sm">
          <div className="px-3.5 py-2 bg-surface flex items-center justify-between border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <FileCode className="w-3.5 h-3.5 text-accent-blue" />
              <span className="font-semibold text-text-primary">{msg.diff.filePath}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-accent-green font-bold">+{msg.diff.additions}</span>
              <span className="text-accent-red font-bold">-{msg.diff.deletions}</span>
            </div>
          </div>
          <pre className="p-3 bg-surface/40 overflow-x-auto text-text-primary leading-relaxed text-[11px]">
            {msg.diff.code}
          </pre>
        </div>
      )}
    </>
  );
};
