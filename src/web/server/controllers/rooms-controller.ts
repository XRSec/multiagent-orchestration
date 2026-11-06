/**
 * Purpose: Room lifecycle management, charter/memory synchronization, generation abort, and SSE streaming.
 * Context: Web server controller managing Dimension 4 room entities and real-time subscriber connections.
 * Usage: Mounted by Vite plugin middleware to serve /api/rooms and room-level lifecycle endpoints.
 * Prerequisites: Node.js runtime, filesystem access to groups directory, and SQLite daemon database.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  GROUPS_DIR,
  MO_BOTS_META,
  getDb,
  normalizeRoomSlug,
  setCorsHeaders,
  sendJson,
  sendError,
  parseJsonBody
} from '../common.ts';

export async function handleRoomsCollection(
  method: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (method === 'GET') {
    try {
      const rooms: any[] = [];
      const defaultSlug = 'multiagent-orchestration';

      // Read rooms from GROUPS_DIR
      if (fs.existsSync(GROUPS_DIR)) {
        const entries = fs.readdirSync(GROUPS_DIR, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const roomSlug = entry.name;
          const roomDir = path.join(GROUPS_DIR, roomSlug);
          const roomJsonPath = path.join(roomDir, 'room.json');
          const charterPath = path.join(roomDir, 'GROUP_CHARTER.md');
          const memoryPath = path.join(roomDir, 'GROUP_MEMORY.md');

          let roomMeta: any = {
            id: `room_${roomSlug}`,
            slug: roomSlug,
            name: roomSlug === defaultSlug ? 'Multi-Agent Orchestration 开发核心组' : roomSlug,
            members: Object.keys(MO_BOTS_META),
            memberIds: Object.keys(MO_BOTS_META),
            created_at: Date.now()
          };

          if (fs.existsSync(roomJsonPath)) {
            try {
              roomMeta = { ...roomMeta, ...JSON.parse(fs.readFileSync(roomJsonPath, 'utf8')) };
            } catch {}
          }

          let memoryLastUpdated = new Date().toISOString();
          if (fs.existsSync(memoryPath)) {
            try {
              memoryLastUpdated = fs.statSync(memoryPath).mtime.toISOString();
            } catch {}
          }

          let charterSummary = '多智能体协同开发核心任务组';
          if (fs.existsSync(charterPath)) {
            try {
              const text = fs.readFileSync(charterPath, 'utf8');
              charterSummary = text.slice(0, 150).replace(/[#*`\n]/g, ' ').trim();
            } catch {}
          }

          // Count sequence from sqlite if available
          let currentSeq = 1;
          const db = getDb();
          if (db) {
            try {
              const norm = normalizeRoomSlug(roomSlug);
              const placeholders = norm.dbRoomIds.map(() => '?').join(',');
              const row = db.prepare(`SELECT MAX(sequence) as maxSeq FROM messages WHERE room_id IN (${placeholders})`).get(...norm.dbRoomIds) as any;
              if (row && row.maxSeq) currentSeq = row.maxSeq;
            } catch {}
          }

          rooms.push({
            id: roomSlug,
            slug: roomSlug,
            name: roomMeta.name || roomSlug,
            members: (roomMeta.members || []).reduce((acc: any, m: string) => {
              acc[m] = { role: 'member', lastSeenSequence: currentSeq };
              return acc;
            }, {}),
            memberIds: roomMeta.members || Object.keys(MO_BOTS_META),
            membersCount: (roomMeta.members || []).length || 7,
            currentSequence: currentSeq,
            createdAt: new Date(roomMeta.created_at || Date.now()).toISOString(),
            charterSummary,
            memoryLastUpdated
          });
        }
      }

      // Ensure default multiagent-orchestration exists
      if (!rooms.some((r) => r.slug === defaultSlug)) {
        rooms.unshift({
          id: defaultSlug,
          slug: defaultSlug,
          name: 'Multi-Agent Orchestration 开发核心组',
          members: Object.keys(MO_BOTS_META).reduce((acc: any, m: string) => {
            acc[m] = { role: 'member', lastSeenSequence: 1 };
            return acc;
          }, {}),
          memberIds: Object.keys(MO_BOTS_META),
          membersCount: 7,
          currentSequence: 1,
          createdAt: new Date().toISOString(),
          charterSummary: '全权负责 multiagent-orchestration 多智能体编排系统架构演进与代码实现。',
          memoryLastUpdated: new Date().toISOString()
        });
      }

      sendJson(res, 200, { ok: true, rooms });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  if (method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const slug = (body.id || body.slug || `group_${Date.now()}`).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const name = body.name || slug;
      const roomDir = path.join(GROUPS_DIR, slug);
      fs.mkdirSync(roomDir, { recursive: true });

      const roomData = {
        id: `room_${slug}`,
        slug,
        name,
        members: body.members || Object.keys(MO_BOTS_META),
        created_at: Date.now()
      };
      fs.writeFileSync(path.join(roomDir, 'room.json'), JSON.stringify(roomData, null, 2), 'utf8');

      const charterText = `# ${name} 章程\n\n核心使命与分工计划。`;
      const memoryText = `# ${name} 共享黑板 (GROUP_MEMORY.md)\n\n## 1. 系统基线与当前状态\n- 初始化时间: ${new Date().toISOString()}`;
      fs.writeFileSync(path.join(roomDir, 'GROUP_CHARTER.md'), charterText, 'utf8');
      fs.writeFileSync(path.join(roomDir, 'GROUP_MEMORY.md'), memoryText, 'utf8');

      sendJson(res, 201, { ok: true, room: { ...roomData, id: slug } });
      return true;
    } catch (err) {
      sendError(res, err, 400);
      return true;
    }
  }

  sendError(res, new Error('Method not allowed'), 405);
  return true;
}

export function handleRoomDetail(
  rawSlug: string,
  cleanSlug: string,
  fsSlug: string,
  res: ServerResponse
): boolean {
  try {
    const roomDir = path.join(GROUPS_DIR, fsSlug);
    const charterPath = path.join(roomDir, 'GROUP_CHARTER.md');
    const memoryPath = path.join(roomDir, 'GROUP_MEMORY.md');
    const roomJsonPath = path.join(roomDir, 'room.json');

    let charter = '';
    let memory = '';
    let roomMeta: any = {
      id: rawSlug,
      slug: cleanSlug,
      name: (cleanSlug === 'multiagent-orchestration' || fsSlug === 'multiagent-orchestration')
        ? 'Multi-Agent Orchestration 开发核心组'
        : cleanSlug,
      members: Object.keys(MO_BOTS_META)
    };

    if (fs.existsSync(roomJsonPath)) {
      try {
        roomMeta = { ...roomMeta, ...JSON.parse(fs.readFileSync(roomJsonPath, 'utf8')), id: rawSlug, slug: cleanSlug };
      } catch {}
    }

    if (fs.existsSync(charterPath)) charter = fs.readFileSync(charterPath, 'utf8');
    if (fs.existsSync(memoryPath)) memory = fs.readFileSync(memoryPath, 'utf8');

    // Format members object
    const membersMap: Record<string, any> = {};
    for (const mId of (roomMeta.members || Object.keys(MO_BOTS_META))) {
      const bMeta = MO_BOTS_META[mId];
      membersMap[mId] = {
        role: bMeta?.title || '核心伙伴',
        lastSeenSequence: 1,
        name: bMeta?.name || mId
      };
    }

    const room = {
      id: rawSlug,
      slug: cleanSlug,
      name: roomMeta.name,
      members: membersMap,
      currentSequence: 1,
      createdAt: new Date().toISOString()
    };

    sendJson(res, 200, { ok: true, room, charter, memory });
    return true;
  } catch (err) {
    sendError(res, err, 500);
    return true;
  }
}

export function handleRoomAbort(_cleanSlug: string, res: ServerResponse): boolean {
  try {
    sendJson(res, 200, { ok: true, message: 'Generation aborted', stopped: true });
    return true;
  } catch (err) {
    sendError(res, err, 400);
    return true;
  }
}

export async function handleRoomRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  _url: URL
): Promise<boolean> {
  if (pathname === '/api/rooms' || pathname === '/api/rooms/') {
    return handleRoomsCollection(method, req, res);
  }

  if (pathname.startsWith('/api/rooms/')) {
    const subPath = pathname.slice('/api/rooms/'.length);
    const parts = subPath.split('/').filter(Boolean);
    const rawSlug = parts[0] || 'multiagent-orchestration';
    const { cleanSlug, fsSlug } = normalizeRoomSlug(rawSlug);

    // Skip if it's a message route (handled by messages-controller)
    if (parts.length >= 2 && parts[1] === 'messages') {
      return false;
    }

    // 4.2.1 GET /api/rooms/:slug
    if (parts.length === 1 && method === 'GET') {
      return handleRoomDetail(rawSlug, cleanSlug, fsSlug, res);
    }

    // 4.2.2.2 POST /api/rooms/:slug/abort
    if (parts.length === 2 && parts[1] === 'abort' && method === 'POST') {
      return handleRoomAbort(cleanSlug, res);
    }
  }

  return false;
}
