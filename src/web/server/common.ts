/**
 * Purpose: Shared server configurations, constants, DB instances, and HTTP/SSE utilities.
 * Context: Web server orchestrator runtime supporting multi-agent dashboard and API endpoints.
 * Usage: Imported across server sub-controllers and services.
 * Prerequisites: Node.js runtime, project root filesystem access, and SQLite daemon database.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { ORCHESTRATOR_DB_SCHEMA } from '../../storage/DatabaseSchema.ts';

// Resolve project root (src/web/server -> src/web -> src -> projectRoot)
const currentDir = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(currentDir, '../../..');
export const DAEMON_DB_PATH = path.join(PROJECT_ROOT, '.daemon', 'orchestrator.db');
export const GROUPS_DIR = path.join(PROJECT_ROOT, 'groups');
export const CUSTOM_AGENTS_DIR = path.join(PROJECT_ROOT, 'Customizations', 'agents');
export const CUSTOM_SKILLS_DIR = path.join(PROJECT_ROOT, 'Customizations', 'skills');
export const GLOBAL_SKILLS_DIR = path.join(os.homedir(), '.agents', 'skills');
export const USER_MULTIAGENT_SKILLS_DIR = path.join(os.homedir(), '.multiagent-orchestration', 'skills');

export interface PartnerUiMeta {
  id: string;
  name: string;
  role: string;
  aliases: string[];
  avatarUrl: string;
  badgeText: string;
  badgeTheme: string;
  isLead?: boolean;
  avatarColor?: string;
  department?: string;
  model?: string;
  status?: string;
  description?: string;
}

// 7 authentic Mo-Bots metadata mapping
export const MO_BOTS_META: Record<string, {
  name: string;
  role: string;
  title: string;
  department: string;
  avatarUrl: string;
  avatar: string;
  badgeText: string;
  badgeTheme: string;
  color: string;
  isLead?: boolean;
  aliases: string[];
  model: string;
  description: string;
}> = {
  'bot_moadmin_director_03': {
    name: 'moAdmin',
    title: '任务编排与治理主管',
    role: '负责任务拆解、多智能体协同调度、执行进度督办与质量门禁审计',
    department: '核心编排组',
    avatarUrl: '/assets/agent-island-cindy.png',
    avatar: '👑',
    badgeText: '编排主管',
    badgeTheme: 'purple',
    color: '#8b5cf6',
    isLead: true,
    aliases: ['moadmin', 'moAdmin', 'admin', '主管', '编排主管'],
    model: 'claude-opus-4-6',
    description: '全权负责调度推进、单发言人协调推进与整体交付验收。'
  },
  'bot_mocode_engine_01': {
    name: 'moCode',
    title: '核心全栈与系统工程师',
    role: '负责 Gateway 通信、SDK 进程内调度器、存储层及业务代码高质量实现',
    department: '架构研发组',
    avatarUrl: '/assets/agent-island-boli.png',
    avatar: '⚡',
    badgeText: '全栈研发',
    badgeTheme: 'blue',
    color: '#3b82f6',
    aliases: ['mocode', 'moCode', 'code', '研发', '全栈研发'],
    model: 'claude-opus-4-6',
    description: '精通 TypeScript/Node.js、Rust 与系统架构，全权负责系统核心代码编写与重构演进。'
  },
  'bot_modoc_scribe_02': {
    name: 'moDoc',
    title: '架构文胆与文档专员',
    role: '负责系统架构规范撰写、README/MEMORY 维护及黑板事实沉淀',
    department: '知识规范组',
    avatarUrl: '/assets/agent-island-annie.png',
    avatar: '📝',
    badgeText: '架构文胆',
    badgeTheme: 'teal',
    color: '#14b8a6',
    aliases: ['modoc', 'moDoc', 'doc', '文胆', '架构文胆'],
    model: 'claude-sonnet-4-6',
    description: '严谨沉淀系统架构、设计决策与共识事实，负责高密度技术文档维护。'
  },
  'bot_moci_sentinel_07': {
    name: 'MoCI',
    title: '持续集成与测试哨兵',
    role: '负责自动化测试套件编写、脱机工作进程验证及构建回归质量把关',
    department: '质量守卫组',
    avatarUrl: '/assets/agent-island-tarara.png',
    avatar: '🛡️',
    badgeText: '测试哨兵',
    badgeTheme: 'rose',
    color: '#f43f5e',
    aliases: ['moci', 'MoCI', 'ci', '测试', '测试哨兵'],
    model: 'claude-sonnet-4-6',
    description: '自动化构建守卫、单元测试验证与回归质量门禁。'
  },
  'bot_mogit_scm_05': {
    name: 'MoGit',
    title: '版本控制与代码审计',
    role: '负责 Git 工作区纯净度检查、分支合并把控及代码审查',
    department: '安全审计组',
    avatarUrl: '/assets/agent-island-erika.png',
    avatar: '🌿',
    badgeText: '代码审计',
    badgeTheme: 'emerald',
    color: '#10b981',
    aliases: ['mogit', 'MoGit', 'git', '审计', '代码审计'],
    model: 'claude-sonnet-4-6',
    description: '严格执行 Squash 规范、工作区干净度校验与提交审查。'
  },
  'bot_modeep_scout_04': {
    name: 'MoDeep',
    title: '深度调研与技术情报',
    role: '负责对标业界前沿架构细节调研与技术选型论证',
    department: '前沿技术组',
    avatarUrl: '/assets/agent-island-chaku.png',
    avatar: '🔍',
    badgeText: '深度情报',
    badgeTheme: 'indigo',
    color: '#6366f1',
    aliases: ['modeep', 'MoDeep', 'deep', '情报', '深度情报'],
    model: 'claude-opus-4-6',
    description: '追踪业界领先的多 Agent 协同规范与架构落地细节。'
  },
  'bot_mo_meta_06': {
    name: 'Mo',
    title: '元工具与伙伴锻造师',
    role: '负责新工具研发、技能（Skills）扩展及新领域伙伴脚手架生产',
    department: '基础设施组',
    avatarUrl: '/assets/agent-island-muffin.png',
    avatar: '🛠️',
    badgeText: '元工具师',
    badgeTheme: 'orange',
    color: '#f97316',
    aliases: ['mo', 'Mo', 'meta', '锻造师', '元工具师'],
    model: 'claude-opus-4-6',
    description: '元工具研发、伙伴脚手架生产及运行时环境隔离保障。'
  }
};

// Backward compatibility stub; fake timers completely eradicated
export function clearRoomTimers(_slug?: string): boolean {
  return false;
}

export function setCorsHeaders(res: ServerResponse): void {
  if (res.headersSent) return;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With');
}

export function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setCorsHeaders(res);
  res.end(JSON.stringify(data));
}

export function sendError(res: ServerResponse, err: unknown, fallbackStatus = 400): void {
  const msg = err instanceof Error ? err.message : String(err);
  let status = fallbackStatus;
  if (msg.includes('Path boundary') || msg.includes('Invalid groupId')) {
    status = 400;
  } else if (msg.includes('not found') || msg.includes('NOT_FOUND')) {
    status = 404;
  }
  sendJson(res, status, { ok: false, error: msg });
}

export function parseJsonBody<T = any>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({} as T);
      try {
        resolve(JSON.parse(body) as T);
      } catch (err: any) {
        reject(new Error(`Invalid JSON payload: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

// Safe ISO string parser guaranteeing never 'Invalid Date'
export function toSafeIsoString(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'bigint') {
    val = Number(val);
  }
  if (typeof val === 'number') {
    const ms = val < 1e11 ? val * 1000 : val;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const ms = num < 1e11 ? num * 1000 : num;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  }
  return new Date().toISOString();
}

// Room Slug normalizer for hyphen and underscore seamless compatibility
export function normalizeRoomSlug(slug: string): {
  cleanSlug: string;
  fsSlug: string;
  dbRoomIds: string[];
} {
  const raw = (slug || 'multiagent-orchestration').replace(/^room_/, '');
  const hyphenSlug = raw.replace(/_/g, '-');
  const underSlug = raw.replace(/-/g, '_');

  const dbRoomIds = Array.from(new Set([
    slug,
    `room_${raw}`,
    `room_${hyphenSlug}`,
    `room_${underSlug}`,
    hyphenSlug,
    underSlug,
    raw
  ]));

  let fsSlug = hyphenSlug;
  const candidates = [hyphenSlug, underSlug, slug, `room_${underSlug}`, `room_${hyphenSlug}`];
  for (const cand of candidates) {
    if (fs.existsSync(path.join(GROUPS_DIR, cand))) {
      fsSlug = cand;
      break;
    }
  }

  return { cleanSlug: hyphenSlug, fsSlug, dbRoomIds };
}


function migrateWebSqliteSchema(db: DatabaseSync): void {
  try {
    db.exec(ORCHESTRATOR_DB_SCHEMA);
  } catch {}
  const ensureCols = (table: string, cols: Array<[string, string]>) => {
    try {
      const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      const existing = new Set(info.map((c) => c.name));
      for (const [colName, colDef] of cols) {
        if (!existing.has(colName)) {
          db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colDef}`);
        }
      }
    } catch {}
  };
  ensureCols('bots', [['capabilities_json', 'TEXT']]);
  ensureCols('sessions', [
    ['workspace_kind', "TEXT NOT NULL DEFAULT 'project'"],
    ['project_dir', 'TEXT'],
    ['model', "TEXT NOT NULL DEFAULT 'claude-opus-4-6'"],
    ['provider_id', "TEXT DEFAULT 'cpa'"],
    ['effort', "TEXT NOT NULL DEFAULT 'high'"],
    ['permission_mode', "TEXT NOT NULL DEFAULT 'auto'"],
    ['plan_mode_enabled', 'INTEGER NOT NULL DEFAULT 0'],
    ['sdk_session_id', 'TEXT'],
    ['parent_session_id', 'TEXT'],
    ['forked_at_message_id', 'TEXT'],
    ['total_cost_usd', 'REAL NOT NULL DEFAULT 0'],
    ['context_tokens', 'INTEGER NOT NULL DEFAULT 0'],
    ['context_window', 'INTEGER NOT NULL DEFAULT 200000'],
    ['extra_dirs_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['writable_dirs_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['active_turn_started_at', 'INTEGER'],
    ['last_turn_ended_at', 'INTEGER'],
    ['cleared_at', 'INTEGER'],
    ['pinned_at', 'INTEGER'],
    ['list_preview', 'TEXT'],
    ['list_message_count', 'INTEGER'],
  ]);
  ensureCols('messages', [
    ['client_id', 'TEXT'],
    ['tool_use_id', 'TEXT'],
    ['agent_kind', "TEXT DEFAULT 'cc'"],
    ['agent_meta_json', 'TEXT'],
    ['rewind_at', 'INTEGER'],
  ]);
}

// SQLite helper with automatic schema & column migration
let sqliteDb: DatabaseSync | null = null;
export function getDb(): DatabaseSync | null {
  if (sqliteDb) return sqliteDb;
  const candidatePaths = [
    process.env.ORCHESTRATOR_DB_PATH,
    DAEMON_DB_PATH,
    path.join(PROJECT_ROOT, 'data', 'orchestrator.db'),
    path.join(os.homedir(), '.multiagent-orchestration', 'storage', 'orchestrator.db')
  ].filter(Boolean) as string[];

  for (const cand of candidatePaths) {
    if (fs.existsSync(cand)) {
      try {
        sqliteDb = new DatabaseSync(cand);
        migrateWebSqliteSchema(sqliteDb);
        return sqliteDb;
      } catch (e) {
        console.warn('[viteRoomApi] Failed to open sqlite db at', cand, e);
      }
    }
  }

  // If no DB exists yet, initialize at DAEMON_DB_PATH
  try {
    fs.mkdirSync(path.dirname(DAEMON_DB_PATH), { recursive: true });
    sqliteDb = new DatabaseSync(DAEMON_DB_PATH);
    migrateWebSqliteSchema(sqliteDb);
    return sqliteDb;
  } catch (e) {
    console.warn('[viteRoomApi] Failed to initialize sqlite db:', e);
  }
  return sqliteDb;
}

// Git Branch helper
export function getGitBranch(): string {
  try {
    const headPath = path.join(PROJECT_ROOT, '.git', 'HEAD');
    if (fs.existsSync(headPath)) {
      const content = fs.readFileSync(headPath, 'utf8').trim();
      if (content.startsWith('ref: refs/heads/')) {
        return content.replace('ref: refs/heads/', '');
      }
      return content.slice(0, 8);
    }
  } catch {}
  return 'main';
}
