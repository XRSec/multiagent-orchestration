/**
 * Purpose: Group room message retrieval, user dispatch orchestration, timer automation, and message recall.
 * Context: Web server controller managing Dimension 4 message pipeline and real-time bot response loops.
 * Usage: Mounted by Vite plugin middleware to serve /api/rooms/:slug/messages endpoints.
 * Prerequisites: Node.js runtime, SQLite daemon database, and bot execution service.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  MO_BOTS_META,
  getDb,
  normalizeRoomSlug,
  toSafeIsoString,
  sendJson,
  sendError,
  parseJsonBody
} from '../common.ts';
import {
  buildBotExecutionStatus,
  resolveTargetBots
} from '../services/bot-execution-service.ts';

export async function handleGetMessages(
  rawSlug: string,
  cleanSlug: string,
  dbRoomIds: string[],
  url: URL,
  res: ServerResponse
): Promise<boolean> {
  try {
    const afterSequenceParam = url.searchParams.get('afterSequence') || url.searchParams.get('since');
    const afterSeq = afterSequenceParam ? parseInt(afterSequenceParam, 10) : 0;

    const db = getDb();
    let messages: any[] = [];
    if (db) {
      try {
        const placeholders = dbRoomIds.map(() => '?').join(',');
        const query = db.prepare(`
          SELECT * FROM messages
          WHERE room_id IN (${placeholders}) AND sequence > ? AND silent_token = 0 AND rewind_at IS NULL AND sender_role != 'message_tombstone'
          ORDER BY sequence ASC
        `);
        const rows = query.all(...dbRoomIds, afterSeq) as any[];
        messages = rows.map((r) => {
          const isBot = r.sender_role === 'assistant' || (typeof r.sender_id === 'string' && r.sender_id.startsWith('bot_'));
          const botMeta = MO_BOTS_META[r.sender_id];
          const authorKind = isBot ? 'bot' : 'user';
          const createdAtIso = toSafeIsoString(r.created_at);

          const msgItem: any = {
            id: r.id,
            groupId: rawSlug,
            sequence: r.sequence,
            authorKind,
            authorBotId: botMeta ? r.sender_id : (isBot ? r.sender_id : undefined),
            authorName: botMeta ? botMeta.name : (r.sender_id === 'human_user' ? '人类用户' : r.sender_id),
            content: r.content,
            createdAt: createdAtIso
          };

          if (r.metadata_json) {
            try {
              const meta = JSON.parse(r.metadata_json);
              if (meta.executionStatus) {
                msgItem.executionStatus = meta.executionStatus;
              }
            } catch {}
          }

          // Fallback: If bot message has no executionStatus in metadata, dynamically construct authentic execution status
          if (!msgItem.executionStatus && authorKind === 'bot') {
            msgItem.executionStatus = buildBotExecutionStatus(
              r.sender_id,
              r.content,
              r.created_at
            );
          }

          return msgItem;
        });
      } catch (e) {
        console.warn('[viteRoomApi] Failed to query sqlite messages:', e);
      }
    }

    sendJson(res, 200, { ok: true, messages });
    return true;
  } catch (err) {
    sendError(res, err, 500);
    return true;
  }
}

export async function handlePostMessage(
  rawSlug: string,
  cleanSlug: string,
  dbRoomIds: string[],
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  try {
    const body = await parseJsonBody(req);
    const content = typeof body.content === 'string' ? body.content.trim() : '';
    if (!content) {
      sendError(res, new Error('Message content cannot be empty.'), 400);
      return true;
    }

    const db = getDb();
    let maxSeq = 1;
    if (db) {
      try {
        const placeholders = dbRoomIds.map(() => '?').join(',');
        const seqRow = db.prepare(`SELECT MAX(sequence) as s FROM messages WHERE room_id IN (${placeholders})`).get(...dbRoomIds) as any;
        if (seqRow && seqRow.s) maxSeq = seqRow.s;
      } catch {}
    }
    const newSeq = maxSeq + 1;
    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const userCreatedAt = new Date().toISOString();

    // Extract mentioned bots
    const mentionedBots: string[] = [];
    for (const [bId, bMeta] of Object.entries(MO_BOTS_META)) {
      if (content.toLowerCase().includes(`@${bMeta.name.toLowerCase()}`) ||
          content.toLowerCase().includes(bId.toLowerCase()) ||
          bMeta.aliases.some((a) => content.includes(`@${a}`))) {
        mentionedBots.push(bId);
      }
    }

    const userMsg = {
      id: msgId,
      groupId: rawSlug,
      sequence: newSeq,
      authorKind: 'user' as const,
      authorName: body.authorName || '人类用户',
      content,
      mentionsJson: { all: false, botIds: mentionedBots },
      createdAt: userCreatedAt
    };

    const targetDbRoomId = dbRoomIds.find((id) => id.startsWith('room_')) || `room_${cleanSlug.replace(/-/g, '_')}`;

    if (db) {
      try {
        db.prepare(`
          INSERT INTO messages (id, session_id, room_id, sender_id, sender_role, content, silent_token, metadata_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).run(
          msgId,
          `session_${targetDbRoomId}`,
          targetDbRoomId,
          'human_user',
          'user',
          content,
          JSON.stringify({ mentions: mentionedBots }),
          Date.now()
        );
      } catch (e) {
        console.warn('[viteRoomApi] Failed to insert message into sqlite:', e);
      }
    }

    // Determine target bots (moAdmin director default fallback if no explicit @bot)
    const targetBots = resolveTargetBots(content, mentionedBots);

    sendJson(res, 200, {
      ok: true,
      message: userMsg,
      mentions: mentionedBots,
      targetBots
    });
    return true;
  } catch (err) {
    sendError(res, err, 400);
    return true;
  }
}

export function handleDeleteMessage(
  targetMsgId: string,
  _cleanSlug: string,
  res: ServerResponse
): boolean {
  try {
    if (!targetMsgId) {
      sendError(res, new Error('Message ID required'), 400);
      return true;
    }
    const db = getDb();
    if (db) {
      try {
        const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(targetMsgId) as any;
        if (row) {
          db.prepare('DELETE FROM messages WHERE id = ?').run(targetMsgId);
          if (row.sender_role === 'user' || row.sender_id === 'human_user') {
            const botRows = db.prepare(`
              SELECT id FROM messages 
              WHERE room_id = ? AND sequence >= ? AND sender_role = 'assistant' AND created_at >= ? AND created_at <= ?
            `).all(row.room_id, row.sequence, row.created_at, row.created_at + 15000) as any[];
            for (const b of botRows) {
              db.prepare('DELETE FROM messages WHERE id = ?').run(b.id);
            }
          }
        }
      } catch (e) {
        console.warn('[viteRoomApi] Failed to delete message:', e);
      }
    }
    sendJson(res, 200, { ok: true, deletedId: targetMsgId });
    return true;
  } catch (err) {
    sendError(res, err, 400);
    return true;
  }
}

export async function handleMessageRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  if (!pathname.startsWith('/api/rooms/')) {
    return false;
  }

  const subPath = pathname.slice('/api/rooms/'.length);
  const parts = subPath.split('/').filter(Boolean);
  const rawSlug = parts[0] || 'multiagent-orchestration';
  const { cleanSlug, dbRoomIds } = normalizeRoomSlug(rawSlug);

  // 4.2.2 /api/rooms/:slug/messages
  if (parts.length === 2 && parts[1] === 'messages') {
    if (method === 'GET') {
      return handleGetMessages(rawSlug, cleanSlug, dbRoomIds, url, res);
    }
    if (method === 'POST') {
      return handlePostMessage(rawSlug, cleanSlug, dbRoomIds, req, res);
    }
    if (method === 'DELETE') {
      const targetMsgId = url.searchParams.get('id') || '';
      return handleDeleteMessage(targetMsgId, cleanSlug, res);
    }
    sendError(res, new Error('Method not allowed'), 405);
    return true;
  }

  // 4.2.2.1 DELETE /api/rooms/:slug/messages/:messageId
  if (parts.length === 3 && parts[1] === 'messages' && method === 'DELETE') {
    const targetMsgId = parts[2];
    return handleDeleteMessage(targetMsgId, cleanSlug, res);
  }

  return false;
}
