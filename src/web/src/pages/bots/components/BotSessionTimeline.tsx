/**
 * Purpose: Chat timeline message list for bot conversations.
 * Context: Web UI Bot session conversation stream.
 * Usage: Rendered inside the scrollable container of BotSessionPage.
 * Prerequisites: React, BotChatMessage type.
 */

import React from 'react';

export interface BotChatMessage {
  id: string;
  role: 'user' | 'assistant';
  sender: string;
  avatar: string;
  content: string;
  timestamp: string;
}

export interface BotSessionTimelineProps {
  messages: BotChatMessage[];
}

export function BotSessionTimeline({ messages }: BotSessionTimelineProps) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-3xl w-full mx-auto">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {m.role === 'assistant' && (
            <img
              src={m.avatar}
              alt=""
              className="w-8 h-8 rounded-full object-cover shrink-0 border border-border-default shadow-xs mt-0.5"
            />
          )}
          <div
            className={`p-3.5 rounded-2xl max-w-xl text-sm leading-relaxed shadow-xs ${
              m.role === 'user'
                ? 'bg-accent-cta text-accent-cta-fg rounded-tr-sm'
                : 'bg-surface-elevated border border-border-default text-text-primary rounded-tl-sm'
            }`}
          >
            <p>{m.content}</p>
            <div className="flex items-center justify-between text-[10px] opacity-60 mt-2 font-mono">
              <span>{m.sender}</span>
              <span>{m.timestamp}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
