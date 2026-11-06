/**
 * Purpose: File-backed session storage for multiagent chat sessions.
 * Context: Replaces ephemeral mock data with real disk persistence under ~/.multiagent-orchestration/sessions.json.
 * Usage: import { listSessions, saveSession, deleteSession } from './session-storage.ts';
 * Prerequisites: Node.js 18+.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

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

const BASE_DIR = path.join(os.homedir(), '.multiagent-orchestration');
const SESSIONS_FILE = path.join(BASE_DIR, 'sessions.json');

const INITIAL_SESSIONS: PersistentSession[] = [
  {
    id: 's-orca-lead-01',
    title: 'M1 Helper 架构与多 Agent 协同体系构建',
    workingDir: '/Users/xr/IDEA.localized/cindy',
    agentKind: 'claude-code',
    model: 'claude-opus-5-5',
    effort: 'high',
    isPinned: true,
    status: 'idle',
    updatedAt: '10 分钟前',
    messageCount: 14,
    tokens: '42.8k',
    tags: ['架构', 'Orca', 'Multiagent'],
  },
  {
    id: 's-web-shell-02',
    title: '从 cindy 获取 App UI 页面壳子到 apps/web',
    workingDir: '/Users/xr/IDEA.localized/multiagent-orchestration/apps/web',
    agentKind: 'claude-code',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    isPinned: true,
    status: 'running',
    updatedAt: '刚刚',
    messageCount: 8,
    tokens: '19.4k',
    tags: ['Web', 'UI'],
  },
  {
    id: 's-gate-web-03',
    title: 'Gate.com 交易桌面客户端暗色主题适配',
    workingDir: '/Users/xr/IDEA.localized/gate-web',
    agentKind: 'codex',
    model: 'gpt-5.5',
    effort: 'low',
    isPinned: false,
    status: 'completed',
    updatedAt: '2 小时前',
    messageCount: 22,
    tokens: '68.1k',
    tags: ['Gate', 'DarkTheme'],
  },
  {
    id: 's-reverse-04',
    title: '逆向 Android 客户端签名防重放协议',
    workingDir: '/Users/xr/reverse-lab',
    agentKind: 'pi',
    model: 'claude-3-7-sonnet',
    isPinned: false,
    status: 'idle',
    updatedAt: '昨天',
    messageCount: 5,
    tokens: '12.3k',
    tags: ['Security', 'Reverse'],
  },
];

function ensureStorageDir(): void {
  if (!fs.existsSync(BASE_DIR)) {
    fs.mkdirSync(BASE_DIR, { recursive: true });
  }
}

export function loadPersistentSessions(): PersistentSession[] {
  ensureStorageDir();
  if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(INITIAL_SESSIONS, null, 2), 'utf8');
    return INITIAL_SESSIONS;
  }
  try {
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : INITIAL_SESSIONS;
  } catch {
    return INITIAL_SESSIONS;
  }
}

export function savePersistentSessions(sessions: PersistentSession[]): void {
  ensureStorageDir();
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

export function upsertPersistentSession(session: PersistentSession): PersistentSession[] {
  const current = loadPersistentSessions();
  const idx = current.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...session, updatedAt: '刚刚' };
  } else {
    current.unshift({ ...session, updatedAt: '刚刚' });
  }
  savePersistentSessions(current);
  return current;
}

export function deletePersistentSession(sessionId: string): PersistentSession[] {
  const current = loadPersistentSessions();
  const filtered = current.filter((s) => s.id !== sessionId);
  savePersistentSessions(filtered);
  return filtered;
}
