/**
 * Purpose: Vite Connect middleware plugin dispatching REST and SSE requests to sub-controllers.
 * Context: Web server orchestrator entry point for multi-agent dashboard and four dimensions APIs.
 * Usage: Registered in vite.config.ts plugins array.
 * Prerequisites: Node.js runtime, Vite dev server environment.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import net from 'node:net';
import {
  PROJECT_ROOT,
  setCorsHeaders,
  clearRoomTimers,
  toSafeIsoString,
  normalizeRoomSlug,
  MO_BOTS_META,
  type PartnerUiMeta
} from './common.ts';
import {
  buildBotExecutionStatus,
  resolveTargetBots
} from './services/bot-execution-service.ts';
import {
  handleWorkspaceRoute,
  type FileNode
} from './controllers/workspace-controller.ts';
import {
  handleSkillsRoute,
  type ScannedSkill
} from './controllers/skills-controller.ts';
import {
  handleBotsRoute,
  type BotDetail
} from './controllers/bots-controller.ts';
import { handleRoomRoute } from './controllers/rooms-controller.ts';
import { handleMessageRoute } from './controllers/messages-controller.ts';
import { handleSessionAndConfigRoute } from './controllers/session-controller.ts';

// Backward compatibility re-exports
export {
  type PartnerUiMeta,
  MO_BOTS_META,
  clearRoomTimers,
  toSafeIsoString,
  normalizeRoomSlug
};
export {
  buildBotExecutionStatus,
  resolveTargetBots
};
export {
  type FileNode,
  type ScannedSkill,
  type BotDetail
};

/**
 * Main Vite room API plugin registering modularized server middlewares
 */

let embeddedDaemonPromise: Promise<any> | null = null;

function isPortListening(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(600);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function ensureEmbeddedGatewayDaemon(): Promise<void> {
  if (embeddedDaemonPromise) return embeddedDaemonPromise;
  embeddedDaemonPromise = (async () => {
    const alreadyUp = await isPortListening(38080, '127.0.0.1');
    if (alreadyUp) {
      return null;
    }
    try {
      const { DaemonServer } = await import('../../daemon/transport/DaemonServer.ts');
      const daemon = new DaemonServer({
        projectRoot: PROJECT_ROOT,
        httpPort: 38080,
        httpHost: '127.0.0.1',
      });
      await daemon.start();
      console.log('✓ [viteRoomApi] Auto-started embedded Gateway Daemon on ws://127.0.0.1:38080/gateway');
      return daemon;
    } catch (err: any) {
      console.warn('[viteRoomApi] Embedded Gateway Daemon startup skipped:', err?.message || err);
      return null;
    }
  })();
  return embeddedDaemonPromise;
}

export function viteRoomApiPlugin() {
  return {
    name: 'vite-room-api-plugin',
    configureServer(server: any) {
      ensureEmbeddedGatewayDaemon();
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const urlStr = req.url || '';
        const url = new URL(urlStr, 'http://localhost');
        const pathname = url.pathname;
        const method = req.method || 'GET';

        // Preflight OPTIONS for CORS
        if (method === 'OPTIONS' && pathname.startsWith('/api/')) {
          setCorsHeaders(res);
          res.statusCode = 204;
          return res.end();
        }

        try {
          // 1. Workspace / Directory routes
          if (await handleWorkspaceRoute(pathname, method, req, res, url)) {
            return;
          }

          // 2. Skills Registry routes
          if (await handleSkillsRoute(pathname, method, req, res, url)) {
            return;
          }

          // 3. Bots / Partners routes
          if (await handleBotsRoute(pathname, method, req, res)) {
            return;
          }

          // 4. Messages routes (under /api/rooms/:slug/messages)
          if (await handleMessageRoute(pathname, method, req, res, url)) {
            return;
          }

          // 5. Rooms lifecycle routes (/api/rooms, /api/rooms/:slug, stream, abort)
          if (await handleRoomRoute(pathname, method, req, res, url)) {
            return;
          }

          // 6. Session & Config routes (/api/config/models, /api/sessions)
          if (await handleSessionAndConfigRoute(pathname, method, req, res)) {
            return;
          }
        } catch (err) {
          console.error('[viteRoomApi] Unhandled middleware error:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
          }
          return;
        }

        // Pass to next middleware
        next();
      });
    }
  };
}
