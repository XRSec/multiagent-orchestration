/**
 * Purpose: Frontend type definitions for multi-agent bot group chat.
 * Context: Mirrors room-storage.ts and partner-scaffold.ts contracts for web components.
 * Usage: import type { GroupMessage, GroupRecord, PartnerInfo, RoomStreamEvent } from '@/types/room';
 * Prerequisites: TypeScript 5.0+.
 */

export interface GroupMemberInfo {
  role: string;
  lastSeenSequence: number;
  name?: string;
}

export interface GroupRecord {
  id: string; // group_slug e.g. "multiagent-orchestration"
  name: string;
  members: Record<string, GroupMemberInfo>;
  currentSequence: number;
  createdAt: string;
  updatedAt?: string;
  description?: string;
  memberIds?: string[];
}

export type ExecutionState = 'idle' | 'thinking' | 'tool_executing' | 'done' | 'failed' | 'aborted';

export interface ToolCallItem {
  id: string;
  tool: string;
  description?: string;
  args?: Record<string, any> | string;
  output?: any;
  status?: 'running' | 'success' | 'failed';
  durationMs?: number;
  startedAt?: number;
  completedAt?: number;
}

export interface ExecutionStatus {
  state: ExecutionState;
  currentPhaseText?: string;
  thinking?: {
    text?: string;
    durationSeconds?: number;
    durationMs?: number;
    startedAt?: number;
    completedAt?: number;
  };
  tools?: ToolCallItem[];
  latency?: {
    startedAt?: number;
    thinkingMs?: number;
    toolMs?: number;
    totalMs?: number;
    completedAt?: number;
  };
  error?: string;
}

export interface ActiveBotState {
  name: string;
  avatarUrl: string;
  badgeText?: string;
  statusText?: string;
  startedAt?: number;
  currentTool?: string;
  toolDescription?: string;
  executionStatus?: ExecutionStatus;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  sequence: number; // strictly monotonic integer >= 1
  authorKind: 'user' | 'bot';
  authorBotId?: string;
  authorName: string;
  content: string;
  mentionsJson?: { all?: boolean; botIds?: string[] };
  clientId?: string;
  partnerSessionId?: string;
  createdAt: string;
  executionStatus?: ExecutionStatus;
  statusCard?: ExecutionStatus;
}

export interface PartnerInfo {
  id: string;
  name: string;
  role: string;
  aliases: string[];
  avatarUrl?: string;
  badgeText?: string;
  badgeTheme?: string;
  isLead?: boolean;
}

export type RoomStreamEventType =
  | 'turn_start'
  | 'turn_chunk'
  | 'turn_complete'
  | 'all_complete'
  | 'error';

export interface RoomStreamEvent {
  event: RoomStreamEventType;
  botId?: string;
  botName?: string;
  sequence?: number | null;
  chunk?: string;
  reply?: string;
  silent?: boolean;
  message?: GroupMessage;
  error?: string;
  currentSequence?: number;
}
