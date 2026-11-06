/**
 * Purpose: Monotonically ordered message timeline with auto-scroll, multi-select, and fork actions.
 * Context: Guarantees sequence monotonicity and responsive scrolling across long multi-agent conversations.
 * Usage: <MessageTimeline messages={messages} partners={partnerMap} isThinking={isThinking} ... />
 * Prerequisites: React 19, Tailwind CSS, MessageItem, EmptyRoomState.
 */

import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown } from 'lucide-react';
import type { GroupMessage, PartnerInfo } from '@/types/room';
import { MessageItem } from './MessageItem';
import { EmptyRoomState } from './EmptyRoomState';
import { AgentThinkingIndicator } from './AgentThinkingIndicator';

interface MessageTimelineProps {
  messages: GroupMessage[];
  partnerMap: Record<string, PartnerInfo>;
  isThinking?: boolean;
  activeBot?: {
    name: string;
    avatarUrl: string;
    statusText?: string;
    startedAt?: number;
    currentTool?: string;
    toolDescription?: string;
    badgeText?: string;
    executionStatus?: any;
  };
  roomName: string;
  isSelecting?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onForkMessage?: (message: GroupMessage) => void;
  onRecallAndEdit?: (message: GroupMessage) => void;
  onDeleteMessage?: (id: string) => void;
  onStop?: () => void;
  onSelectStarterSuggestion: (prompt: string) => void;
}

export const MessageTimeline: React.FC<MessageTimelineProps> = ({
  messages,
  partnerMap,
  isThinking = false,
  activeBot,
  roomName,
  isSelecting = false,
  selectedIds = new Set(),
  onToggleSelect,
  onForkMessage,
  onRecallAndEdit,
  onDeleteMessage,
  onStop,
  onSelectStarterSuggestion
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isAutoScrollLocked = useRef(true);

  // Guarantee strictly monotonic sequence sort ascending
  const sortedMessages = [...messages].sort((a, b) => a.sequence - b.sequence);

  // Auto-scroll on new message or thinking status if user is near bottom
  useEffect(() => {
    if (isAutoScrollLocked.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, isThinking]);

  // Track scroll position to show/hide "scroll to bottom" pill
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    if (distanceFromBottom > 150) {
      setShowScrollBottom(true);
      isAutoScrollLocked.current = false;
    } else {
      setShowScrollBottom(false);
      isAutoScrollLocked.current = true;
    }
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBottom(false);
    isAutoScrollLocked.current = true;
  };

  if (sortedMessages.length === 0 && !isThinking) {
    return (
      <div className="flex-1 flex flex-col overflow-y-auto">
        <EmptyRoomState roomName={roomName} onSelectSuggestion={onSelectStarterSuggestion} />
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-2 scroll-smooth"
      >
        {sortedMessages.map((msg) => {
          const partner = msg.authorBotId ? partnerMap[msg.authorBotId] : undefined;
          return (
            <MessageItem
              key={msg.id || `seq-${msg.sequence}`}
              message={msg}
              partnerMeta={partner}
              isSelecting={isSelecting}
              isSelected={selectedIds.has(msg.id)}
              onToggleSelect={onToggleSelect}
              onForkMessage={onForkMessage}
              onRecallAndEdit={onRecallAndEdit}
              onDeleteMessage={onDeleteMessage}
            />
          );
        })}

        {isThinking ? (
          <AgentThinkingIndicator
            activeBotName={activeBot?.name}
            activeBotAvatar={activeBot?.avatarUrl}
            statusText={activeBot?.statusText}
            startedAt={activeBot?.startedAt}
            currentTool={activeBot?.currentTool}
            toolDescription={activeBot?.toolDescription}
            badgeText={activeBot?.badgeText}
            executionStatus={activeBot?.executionStatus}
            onStop={onStop}
          />
        ) : null}

        <div ref={bottomRef} className="h-2" />
      </div>

      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 right-6 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-elevated/95 border border-border-default shadow-lg text-xs font-medium text-text-primary hover:bg-surface-chip transition-all animate-in fade-in slide-in-from-bottom-2"
        >
          <ArrowDown className="w-3.5 h-3.5 text-accent-blue" />
          <span>最新消息</span>
        </button>
      )}
    </div>
  );
};
