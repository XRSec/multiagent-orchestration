/**
 * Purpose: Frontend type definitions for persistent chat sessions and messages.
 * Context: Mirrors session-storage and session-messages contract for UI components.
 * Usage: import type { PersistentSession, ChatMessage, ToolCallItem } from '@/types/session';
 * Prerequisites: TypeScript 5.0+.
 */

export interface PersistentSession {
  id: string;
  title: string;
  workingDir: string;
  agentKind: 'claude-code' | 'codex' | 'pi';
  model: string;
  effort?: string;
  isPinned?: boolean;
  isMuted?: boolean;
  status: 'idle' | 'running' | 'completed' | 'error';
  updatedAt: string;
  messageCount: number;
  tokens?: string;
  tags?: string[];
  tagColor?: string;
  archived?: boolean;
  forkedFromId?: string;
}

export interface ToolCallItem {
  id: string;
  tool: string;
  description?: string;
  args?: Record<string, any>;
  output?: string;
  status: 'running' | 'success' | 'error';
  executionTimeMs?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  authorKind?: 'user' | 'bot';
  authorName?: string;
  content: string;
  timestamp: string;
  attachments?: { name: string; size: string; type: string }[];
  thinking?: {
    text: string;
    durationSeconds?: number;
  };
  toolCalls?: ToolCallItem[];
  todos?: { text: string; completed: boolean }[];
  diff?: {
    filePath: string;
    additions: number;
    deletions: number;
    code: string;
  };
  executionStatus?: any;
}
