/**
 * Purpose: Model provider configurations and persistent chat session management endpoints.
 * Context: Web server controller managing model options and sidebar session state.
 * Usage: Mounted by Vite plugin middleware to serve /api/config/models and /api/sessions routes.
 * Prerequisites: Node.js runtime, model-config-service, and session-storage persistence.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { PROJECT_ROOT, sendJson, sendError, parseJsonBody } from '../common.ts';
import { getModelConfigPayload } from '../model-config-service.ts';
import {
  loadPersistentSessions,
  upsertPersistentSession,
  deletePersistentSession,
  type PersistentSession
} from '../session-storage.ts';
import {
  handleGetSessionMessages,
  handlePostSessionMessage
} from './session-messages-controller.ts';
import {
  loadProvidersConfig,
  updateProviderConfig,
  saveModelPreferences
} from '../services/provider-config-service.ts';

export async function handleSessionAndConfigRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // Config Models (GET & PUT)
  if (pathname === '/api/config/models') {
    if (method === 'GET') {
      try {
        const payload = getModelConfigPayload();
        sendJson(res, 200, payload);
        return true;
      } catch (err) {
        sendError(res, err, 500);
        return true;
      }
    }
    if (method === 'PUT') {
      try {
        const body = await parseJsonBody(req);
        saveModelPreferences(body);
        const updated = getModelConfigPayload();
        sendJson(res, 200, updated);
        return true;
      } catch (err) {
        sendError(res, err, 400);
        return true;
      }
    }
  }

  // Config Providers (GET & PUT)
  if (pathname === '/api/config/providers') {
    if (method === 'GET') {
      try {
        const providers = loadProvidersConfig();
        sendJson(res, 200, { ok: true, providers });
        return true;
      } catch (err) {
        sendError(res, err, 500);
        return true;
      }
    }
    if (method === 'PUT') {
      try {
        const body = await parseJsonBody(req);
        const updated = updateProviderConfig(body);
        sendJson(res, 200, { ok: true, provider: updated });
        return true;
      } catch (err) {
        sendError(res, err, 400);
        return true;
      }
    }
  }

  // Sessions
  if (pathname === '/api/sessions' || pathname.startsWith('/api/sessions/')) {
    // Session messages sub-route: /api/sessions/:sessionId/messages
    const messagesMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
    if (messagesMatch) {
      const sId = decodeURIComponent(messagesMatch[1]);
      if (method === 'GET') {
        return await handleGetSessionMessages(sId, res);
      }
      if (method === 'POST') {
        return await handlePostSessionMessage(sId, req, res);
      }
    }

    const sessionId = pathname.startsWith('/api/sessions/')
      ? pathname.slice('/api/sessions/'.length).trim()
      : null;

    try {
      if (method === 'GET') {
        const sessions = loadPersistentSessions();
        if (sessionId) {
          const found = sessions.find((s) => s.id === sessionId);
          if (found) {
            sendJson(res, 200, { ok: true, session: found });
          } else {
            sendJson(res, 404, { ok: false, error: `Session ${sessionId} not found` });
          }
          return true;
        }
        sendJson(res, 200, { ok: true, sessions });
        return true;
      }

      if (method === 'POST') {
        const body = await parseJsonBody(req);
        const newSession: PersistentSession = {
          id: body.id || `s-${Date.now()}`,
          title: body.title || '新对话',
          workingDir: body.workingDir || PROJECT_ROOT,
          agentKind: body.agentKind || 'claude-code',
          model: body.model || 'claude-fable-5[1M]',
          effort: body.effort || 'high',
          isPinned: Boolean(body.isPinned),
          isMuted: Boolean(body.isMuted),
          status: body.status || 'idle',
          updatedAt: '刚刚',
          messageCount: body.messageCount || 0,
          tokens: body.tokens || '0',
          tags: Array.isArray(body.tags) ? body.tags : [],
          tagColor: body.tagColor,
          archived: Boolean(body.archived),
          forkedFromId: body.forkedFromId
        };
        const updated = upsertPersistentSession(newSession);
        sendJson(res, 201, { ok: true, session: newSession, sessions: updated });
        return true;
      }

      if (method === 'PUT') {
        if (!sessionId) {
          sendJson(res, 400, { ok: false, error: 'Session ID required' });
          return true;
        }
        const body = await parseJsonBody(req);
        const currentList = loadPersistentSessions();
        const existing = currentList.find((s) => s.id === sessionId) || {
          id: sessionId,
          title: '会话',
          workingDir: PROJECT_ROOT,
          agentKind: 'claude-code' as const,
          model: 'claude-fable-5[1M]',
          status: 'idle' as const,
          updatedAt: '刚刚',
          messageCount: 0
        };
        const merged: PersistentSession = {
          ...existing,
          ...body,
          id: sessionId
        };
        const updatedList = upsertPersistentSession(merged);
        sendJson(res, 200, { ok: true, session: merged, sessions: updatedList });
        return true;
      }

      if (method === 'DELETE') {
        if (!sessionId) {
          sendJson(res, 400, { ok: false, error: 'Session ID required' });
          return true;
        }
        const updatedList = deletePersistentSession(sessionId);
        sendJson(res, 200, { ok: true, sessions: updatedList });
        return true;
      }
    } catch (err) {
      sendError(res, err, 400);
      return true;
    }
  }

  return false;
}
