/**
 * Purpose: Mo-Bots agent profiles, workbench configurations, and partner roster API.
 * Context: Web server controller managing Dimension 3 (7 Mo-Bots Roster & Assets).
 * Usage: Mounted by Vite plugin middleware to serve /api/bots and /api/partners routes.
 * Prerequisites: Node.js runtime, MO_BOTS_META mappings, and Customizations/agents directories.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  MO_BOTS_META,
  type PartnerUiMeta,
  CUSTOM_AGENTS_DIR,
  sendJson,
  sendError,
  parseJsonBody
} from '../common.ts';

export interface BotDetail {
  id: string;
  name: string;
  display_name: string;
  title: string;
  role: string;
  department: string;
  description: string;
  avatar: string;
  avatar_url: string;
  avatar_color: string;
  badge_text: string;
  badge_theme: string;
  status: string;
  model: string;
  is_lead?: boolean;
  capabilities?: Record<string, any>;
  workbench?: Record<string, any>;
  soulSummary?: string;
  bot_dir?: string;
}

export function loadAllBots(): BotDetail[] {
  const bots: BotDetail[] = [];
  const processedNames = new Set<string>();

  // 1. First scan physical directories in Customizations/agents/
  if (fs.existsSync(CUSTOM_AGENTS_DIR)) {
    try {
      const entries = fs.readdirSync(CUSTOM_AGENTS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

        const dirName = entry.name;
        processedNames.add(dirName.toLowerCase());

        // Find registered meta if matched by name
        const matchedKey = Object.keys(MO_BOTS_META).find(
          (k) => MO_BOTS_META[k].name.toLowerCase() === dirName.toLowerCase()
        );
        const meta = matchedKey ? MO_BOTS_META[matchedKey] : null;

        const botDir = path.join(CUSTOM_AGENTS_DIR, dirName);
        let profile: any = {};
        let capabilities: any = {};
        let workbench: any = {};
        let soulSummary = '';

        try {
          const pPath = path.join(botDir, 'profile.json');
          if (fs.existsSync(pPath)) profile = JSON.parse(fs.readFileSync(pPath, 'utf8'));
        } catch {}

        try {
          const cPath = path.join(botDir, 'capabilities.json');
          if (fs.existsSync(cPath)) capabilities = JSON.parse(fs.readFileSync(cPath, 'utf8'));
        } catch {}

        try {
          const wPath = path.join(botDir, 'workbench.json');
          if (fs.existsSync(wPath)) workbench = JSON.parse(fs.readFileSync(wPath, 'utf8'));
        } catch {}

        try {
          const sPath = path.join(botDir, 'SOUL.md');
          if (fs.existsSync(sPath)) {
            const raw = fs.readFileSync(sPath, 'utf8');
            soulSummary = raw.slice(0, 300).trim();
          }
        } catch {}

        const botId = matchedKey || `bot_${dirName.toLowerCase()}`;
        const name = profile.name || (meta ? meta.name : dirName);
        const title = profile.title || (meta ? meta.title : 'AI 协同伙伴');
        const role = profile.role || (meta ? meta.role : '自动化任务协同');
        const department = profile.department || (meta ? meta.department : '研发中心');

        bots.push({
          id: botId,
          name,
          display_name: profile.display_name || `${name} · ${title}`,
          title,
          role,
          department,
          description: profile.description || (meta ? meta.description : `${name} 智能伙伴`),
          avatar: profile.avatar || (meta ? meta.avatar : name.slice(0, 2).toUpperCase()),
          avatar_url: profile.avatar_url || (meta ? meta.avatarUrl : '/assets/agent-island-cindy.png'),
          avatar_color: profile.avatar_color || (meta ? meta.color : '#3b82f6'),
          badge_text: profile.badge_text || (meta ? meta.badgeText : '伙伴'),
          badge_theme: profile.badge_theme || (meta ? meta.badgeTheme : 'slate'),
          status: profile.status || 'online',
          model: capabilities.model || profile.model || (meta ? meta.model : 'gemini-3.8-flash'),
          is_lead: meta ? meta.isLead : false,
          capabilities: capabilities || {},
          workbench: workbench || {},
          soulSummary,
          bot_dir: botDir
        });
      }
    } catch (err) {
      console.error('[bots-controller] Failed to read CUSTOM_AGENTS_DIR:', err);
    }
  }

  // 2. Fallback check registeredIds not yet found on filesystem
  const registeredIds = Object.keys(MO_BOTS_META);
  for (const botId of registeredIds) {
    const meta = MO_BOTS_META[botId];
    if (processedNames.has(meta.name.toLowerCase())) continue;

    const botDir = path.join(CUSTOM_AGENTS_DIR, meta.name);
    bots.push({
      id: botId,
      name: meta.name,
      display_name: `${meta.name} · ${meta.title}`,
      title: meta.title,
      role: meta.role,
      department: meta.department,
      description: meta.description,
      avatar: meta.avatar,
      avatar_url: meta.avatarUrl,
      avatar_color: meta.color,
      badge_text: meta.badgeText,
      badge_theme: meta.badgeTheme,
      status: 'offline',
      model: meta.model,
      is_lead: meta.isLead,
      capabilities: {},
      workbench: {},
      soulSummary: '',
      bot_dir: botDir
    });
  }

  return bots;
}

export async function handleBotsRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  // 3.1 GET /api/bots
  if (pathname === '/api/bots' && method === 'GET') {
    try {
      const bots = loadAllBots();
      sendJson(res, 200, { ok: true, bots });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 3.2 POST /api/bots (Wizard to create a new companion)
  if (pathname === '/api/bots' && method === 'POST') {
    try {
      const body = await parseJsonBody<any>(req);
      const name = typeof body.name === 'string' ? body.name.trim() : '';

      if (!name || !/^[a-zA-Z0-9_-]+$/.test(name)) {
        sendError(res, new Error('Invalid bot name. Must contain only alphanumeric, _, -'), 400);
        return true;
      }

      const botDir = path.join(CUSTOM_AGENTS_DIR, name);
      // Security check: ensure path stays inside CUSTOM_AGENTS_DIR
      const resolved = path.resolve(botDir);
      if (!resolved.startsWith(path.resolve(CUSTOM_AGENTS_DIR))) {
        sendError(res, new Error('Path boundary violation'), 400);
        return true;
      }

      if (fs.existsSync(botDir)) {
        sendError(res, new Error(`Bot '${name}' already exists`), 409);
        return true;
      }

      fs.mkdirSync(botDir, { recursive: true });

      const title = body.title || 'AI 协同伙伴';
      const role = body.role || '自动化任务协同';
      const department = body.department || '研发中心';
      const displayName = body.display_name || `${name} · ${title}`;
      const description = body.description || `${name} 智能伙伴`;
      const avatar = body.avatar || name.slice(0, 2).toUpperCase();
      const avatarColor = body.avatar_color || '#3b82f6';
      const model = body.model || 'gemini-3.8-flash';

      const profile = {
        name,
        display_name: displayName,
        title,
        role,
        department,
        description,
        avatar,
        avatar_color: avatarColor,
        status: 'online'
      };

      const capabilities = {
        permissionLevel: body.capabilities?.permissionLevel || 'full',
        permissions: 'trusted',
        model,
        tools: body.capabilities?.tools || ['read_file', 'write_file', 'edit_file', 'run_command'],
        skills: body.capabilities?.skills || ['script-standards'],
        mcpServers: body.capabilities?.mcpServers || {
          'pi-web-search': {
            command: 'node',
            args: ['/Users/xr/.config/magpie/mcp-npm/node_modules/@magpie-mcp/pi-web-access/dist/mcp-cli.js'],
            env: {}
          }
        }
      };

      const workbench = {
        panels: ['chat', 'explorer', 'terminal'],
        activePanel: 'chat',
        theme: 'system',
        defaultWorkingDir: body.workbench?.defaultWorkingDir || '.'
      };

      const soulMd = body.soul || `# ${displayName}\n\n${description}\n\n## 角色职责\n- ${role}\n`;

      fs.writeFileSync(path.join(botDir, 'profile.json'), JSON.stringify(profile, null, 2) + '\n', 'utf8');
      fs.writeFileSync(path.join(botDir, 'capabilities.json'), JSON.stringify(capabilities, null, 2) + '\n', 'utf8');
      fs.writeFileSync(path.join(botDir, 'workbench.json'), JSON.stringify(workbench, null, 2) + '\n', 'utf8');
      fs.writeFileSync(path.join(botDir, 'SOUL.md'), soulMd + '\n', 'utf8');

      const allBots = loadAllBots();
      const created = allBots.find((b) => b.name === name) || {
        id: `bot_${name.toLowerCase()}`,
        name,
        display_name: displayName,
        title,
        role,
        department,
        description,
        avatar,
        avatar_url: '/assets/agent-island-cindy.png',
        avatar_color: avatarColor,
        badge_text: '伙伴',
        badge_theme: 'slate',
        status: 'online',
        model,
        capabilities,
        workbench,
        soulSummary: soulMd.slice(0, 300),
        bot_dir: botDir
      };

      sendJson(res, 201, { ok: true, bot: created });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 3.3 PUT /api/bots/:id/capabilities
  if (pathname.startsWith('/api/bots/') && pathname.endsWith('/capabilities') && method === 'PUT') {
    const rawId = pathname.slice('/api/bots/'.length, -('/capabilities'.length)).trim();
    try {
      const body = await parseJsonBody<any>(req);
      const bots = loadAllBots();
      const found = bots.find((b) => b.id === rawId || b.name === rawId);
      if (!found || !found.bot_dir || !fs.existsSync(found.bot_dir)) {
        sendError(res, new Error(`Bot ${rawId} not found or directory missing`), 404);
        return true;
      }

      const capPath = path.join(found.bot_dir, 'capabilities.json');
      let currentCap: any = {};
      if (fs.existsSync(capPath)) {
        try {
          currentCap = JSON.parse(fs.readFileSync(capPath, 'utf8'));
        } catch {}
      }

      const updatedCap = {
        ...currentCap,
        ...body
      };

      // Ensure permissionLevel is valid if provided
      if (body.permissions && !body.permissionLevel) {
        if (body.permissions === 'full' || body.permissions === 'chat-only' || body.permissions === 'basic' || body.permissions === 'config') {
          updatedCap.permissionLevel = body.permissions;
        }
      }

      fs.writeFileSync(capPath, JSON.stringify(updatedCap, null, 2) + '\n', 'utf8');

      // Sync model to profile if changed
      if (body.model) {
        const profPath = path.join(found.bot_dir, 'profile.json');
        if (fs.existsSync(profPath)) {
          try {
            const prof = JSON.parse(fs.readFileSync(profPath, 'utf8'));
            prof.model = body.model;
            fs.writeFileSync(profPath, JSON.stringify(prof, null, 2) + '\n', 'utf8');
          } catch {}
        }
      }

      sendJson(res, 200, { ok: true, capabilities: updatedCap });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 3.4 GET /api/bots/:id
  if (pathname.startsWith('/api/bots/') && method === 'GET') {
    const botId = pathname.slice('/api/bots/'.length).trim();
    try {
      const bots = loadAllBots();
      const found = bots.find((b) => b.id === botId || b.name === botId);
      if (found) {
        sendJson(res, 200, { ok: true, bot: found });
        return true;
      }
      sendError(res, new Error(`Bot ${botId} not found`), 404);
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 3.5 GET /api/partners (Unified with 7 Mo-Bots)
  if (pathname === '/api/partners' && method === 'GET') {
    try {
      const bots = loadAllBots();
      const partners: PartnerUiMeta[] = bots.map((b) => {
        const meta = MO_BOTS_META[b.id] || {
          avatarUrl: '/assets/agent-island-cindy.png',
          badgeText: '伙伴',
          badgeTheme: 'slate',
          aliases: [b.name]
        };
        return {
          id: b.id,
          name: b.name,
          role: b.role,
          aliases: meta.aliases,
          avatarUrl: meta.avatarUrl,
          badgeText: meta.badgeText,
          badgeTheme: meta.badgeTheme,
          isLead: b.is_lead,
          avatarColor: b.avatar_color,
          department: b.department,
          model: b.model,
          status: b.status,
          description: b.description
        };
      });
      sendJson(res, 200, { ok: true, partners });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  return false;
}
