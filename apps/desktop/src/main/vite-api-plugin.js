/**
 * vite-api-plugin.js
 * Vite API & Disk Middleware backed by Agent Control Plane core services:
 * - PartnerCoreService (Partner lifecycle & SOUL.md / MEMORY.md sync)
 * - BotGroupCoreService (Group lifecycle & GROUP_CHARTER.md sync)
 * - ExtensionRegistryService (MCP, Skill, Plugin discovery & config)
 * - DistillationEngineService (Distillation Diff computation)
 * Constraints: Node.js 18+ native ESM, single file <= 500 lines.
 */

import {
  PartnerCoreService,
  BotGroupCoreService,
  ExtensionRegistryService,
  DistillationEngineService
} from '../../../../packages/agent-control-plane/index.mjs';

const partnerService = new PartnerCoreService();
const botGroupService = new BotGroupCoreService({ partnerService });
const extensionRegistry = new ExtensionRegistryService({ partnerService });
const distillationEngine = new DistillationEngineService({ partnerService, extensionRegistry });

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error(`Invalid JSON payload: ${err.message}`));
      }
    });
    req.on('error', reject);
  });
}

export function viteMultiagentApiPlugin() {
  return {
    name: 'vite-multiagent-disk-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const urlStr = req.url || '';
        const url = new URL(urlStr, 'http://localhost');
        const pathname = url.pathname;
        const method = req.method || 'GET';

        // 1. /api/partners
        if (pathname === '/api/partners' || pathname.startsWith('/api/partners/')) {
          try {
            if (method === 'GET') {
              const partnerId = pathname.slice('/api/partners/'.length);
              if (partnerId) {
                const partner = partnerService.getPartner(partnerId);
                return partner ? sendJson(res, 200, { ok: true, partner }) : sendJson(res, 404, { ok: false, error: 'Partner not found' });
              }
              const partners = partnerService.listPartners();
              return sendJson(res, 200, { ok: true, partners });
            }

            if (method === 'POST') {
              const body = await parseJsonBody(req);
              const created = partnerService.createPartner(body);
              return sendJson(res, 201, { ok: true, partner: created });
            }

            if (method === 'PUT') {
              const partnerId = pathname.slice('/api/partners/'.length);
              if (!partnerId) return sendJson(res, 400, { ok: false, error: 'Partner ID required' });
              const body = await parseJsonBody(req);
              const updated = partnerService.updatePartner(partnerId, body);
              return sendJson(res, 200, { ok: true, partner: updated });
            }

            if (method === 'DELETE') {
              const partnerId = pathname.slice('/api/partners/'.length);
              if (!partnerId) return sendJson(res, 400, { ok: false, error: 'Partner ID required' });
              const result = partnerService.deletePartner(partnerId);
              return sendJson(res, 200, result);
            }
          } catch (err) {
            return sendJson(res, 400, { ok: false, error: err.message });
          }
        }

        // 2. /api/groups
        if (pathname === '/api/groups' || pathname.startsWith('/api/groups/')) {
          try {
            if (method === 'GET') {
              const groupId = pathname.slice('/api/groups/'.length);
              if (groupId) {
                const group = botGroupService.getGroup(groupId);
                return group ? sendJson(res, 200, { ok: true, group }) : sendJson(res, 404, { ok: false, error: 'Group not found' });
              }
              const groups = botGroupService.listGroups();
              return sendJson(res, 200, { ok: true, groups });
            }

            if (method === 'POST') {
              const body = await parseJsonBody(req);
              const created = botGroupService.createGroup(body);
              return sendJson(res, 201, { ok: true, group: created });
            }

            if (method === 'PUT') {
              const groupId = pathname.slice('/api/groups/'.length);
              if (!groupId) return sendJson(res, 400, { ok: false, error: 'Group ID required' });
              const body = await parseJsonBody(req);
              const updated = botGroupService.updateGroup(groupId, body);
              return sendJson(res, 200, { ok: true, group: updated });
            }

            if (method === 'DELETE') {
              const groupId = pathname.slice('/api/groups/'.length);
              if (!groupId) return sendJson(res, 400, { ok: false, error: 'Group ID required' });
              const result = botGroupService.deleteGroup(groupId);
              return sendJson(res, 200, result);
            }
          } catch (err) {
            return sendJson(res, 400, { ok: false, error: err.message });
          }
        }

        // 3. /api/extensions (系统发现的 MCP, Skill, Plugin 清单)
        if (pathname === '/api/extensions' && method === 'GET') {
          try {
            const mcps = extensionRegistry.getAvailableMcpServers();
            const skills = extensionRegistry.getAvailableSkills();
            const plugins = extensionRegistry.getAvailablePlugins();
            return sendJson(res, 200, { ok: true, mcps, skills, plugins });
          } catch (err) {
            return sendJson(res, 500, { ok: false, error: err.message });
          }
        }

        // 4. /api/configs (伙伴或文件夹的扩展配置)
        if (pathname === '/api/configs') {
          try {
            const scopeType = url.searchParams.get('scopeType') || 'partner';
            const scopeId = url.searchParams.get('scopeId') || 'lead-orchestrator';

            if (method === 'GET') {
              const config = scopeType === 'folder'
                ? extensionRegistry.resolveForFolder(scopeId)
                : extensionRegistry.resolveForPartner(scopeId);
              return sendJson(res, 200, { ok: true, config });
            }

            if (method === 'POST') {
              const body = await parseJsonBody(req);
              const targetScopeType = body.scopeType || scopeType;
              const targetScopeId = body.scopeId || scopeId;
              const saved = extensionRegistry.saveConfig(targetScopeType, targetScopeId, body);
              return sendJson(res, 200, { ok: true, config: saved });
            }
          } catch (err) {
            return sendJson(res, 400, { ok: false, error: err.message });
          }
        }

        // 5. /api/distill/diff (去脂蒸馏 Diff 分析报告)
        if (pathname === '/api/distill/diff') {
          try {
            const scopeType = url.searchParams.get('scopeType') || 'partner';
            const scopeId = url.searchParams.get('scopeId') || 'lead-orchestrator';
            const report = distillationEngine.computeDiffReport(scopeType, scopeId);
            return sendJson(res, 200, { ok: true, report });
          } catch (err) {
            return sendJson(res, 500, { ok: false, error: err.message });
          }
        }

        next();
      });
    }
  };
}
