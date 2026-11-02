/**
 * Purpose: PartnerCoreService - Full lifecycle management for AI Partners (Bots).
 * Adheres to Cindy bot profile and memory standards.
 * Constraints: Node.js 18+ native ESM, single file <= 500 lines.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_DIR = path.join(os.homedir(), '.multiagent-orchestration');
const PARTNERS_DIR = path.join(BASE_DIR, 'partners');

export function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

export function validatePartnerId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: '伙伴 ID 不能为空' };
  }
  const normalized = id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(normalized)) {
    return { valid: false, error: '伙伴 ID 必须由小写字母、数字、下划线或短横线组成，且以字母或数字开头' };
  }
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(normalized)) {
    return { valid: false, error: '伙伴 ID 不能是系统保留关键字' };
  }
  return { valid: true, id: normalized };
}

export class PartnerCoreService {
  constructor(options = {}) {
    this.storageDir = options.storageDir || PARTNERS_DIR;
    ensureDir(this.storageDir);
    this._initBuiltinPartners();
  }

  _initBuiltinPartners() {
    const builtinList = [
      {
        id: 'lead-orchestrator',
        name: 'Nexus Lead Orchestrator',
        description: '任务编排与主干仲裁中枢，负责分发子任务与推进群宪章。',
        avatar: '👑',
        avatarColor: 'indigo',
        identitySource: '# Nexus Lead Orchestrator\n负责领导多 Agent 架构协同，分解任务并确保执行收敛。',
        capabilities: {
          permissions: 'bypassPermissions',
          skills: ['workflow-authoring', 'task-decomposition'],
          skillMode: 'allowlist',
          mcpServers: ['nexus-orchestrator-mcp', 'cindy-memory'],
          mcpMode: 'inherit',
          toolsets: ['orchestration', 'control-plane'],
          plugins: ['cindy-github'],
          pluginMode: 'inherit'
        }
      },
      {
        id: 'agent-architect',
        name: 'Agent Architect',
        description: '系统架构师，负责规范约束、模块拓扑与协议设计。',
        avatar: '📐',
        avatarColor: 'emerald',
        identitySource: '# Agent Architect\n负责遵守并推进架构规范，审查代码行数与依赖拓扑。',
        capabilities: {
          permissions: 'auto',
          skills: ['architecture-review', 'spec-enforcement'],
          skillMode: 'allowlist',
          mcpServers: ['cindy-memory'],
          mcpMode: 'inherit',
          toolsets: ['filesystem', 'read-analysis'],
          plugins: [],
          pluginMode: 'inherit'
        }
      },
      {
        id: 'rea-partner',
        name: 'Rea Code Craftsman',
        description: '代码工匠，专注于高质量工程实现、重构与安全删除。',
        avatar: '⚡',
        avatarColor: 'amber',
        identitySource: '# Rea Code Craftsman\n以极简、健壮、模块化实现业务，杜绝过度思考与冗余。',
        capabilities: {
          permissions: 'auto',
          skills: ['safe-refactoring', 'unit-testing'],
          skillMode: 'allowlist',
          mcpServers: ['cindy-memory'],
          mcpMode: 'inherit',
          toolsets: ['filesystem', 'bash-sandbox'],
          plugins: ['cindy-github'],
          pluginMode: 'inherit'
        }
      }
    ];

    for (const b of builtinList) {
      const partnerPath = path.join(this.storageDir, b.id);
      if (!fs.existsSync(partnerPath)) {
        this.createPartner(b, { isBuiltin: true });
      }
    }
  }

  listPartners() {
    ensureDir(this.storageDir);
    const entries = fs.readdirSync(this.storageDir, { withFileTypes: true });
    const partners = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pDir = path.join(this.storageDir, entry.name);
        const manifestFile = path.join(pDir, 'manifest.json');
        if (fs.existsSync(manifestFile)) {
          try {
            const raw = fs.readFileSync(manifestFile, 'utf8');
            const data = JSON.parse(raw);
            partners.push(data);
          } catch (e) {
            console.error(`[PartnerCoreService] Failed to read ${manifestFile}:`, e.message);
          }
        }
      }
    }

    return partners.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }

  getPartner(id) {
    const check = validatePartnerId(id);
    if (!check.valid) return null;
    const manifestFile = path.join(this.storageDir, check.id, 'manifest.json');
    if (!fs.existsSync(manifestFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
    } catch {
      return null;
    }
  }

  createPartner(input, options = {}) {
    if (!input || typeof input !== 'object') {
      throw new Error('伙伴参数无效');
    }

    const rawId = input.id || `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const check = validatePartnerId(rawId);
    if (!check.valid) {
      throw new Error(check.error);
    }
    const partnerId = check.id;

    const partnerDir = path.join(this.storageDir, partnerId);
    if (fs.existsSync(partnerDir) && !options.isBuiltin && !options.overwrite) {
      throw new Error(`[ALREADY_EXISTS] 伙伴 ${partnerId} 已存在`);
    }

    ensureDir(partnerDir);
    ensureDir(path.join(partnerDir, 'memories'));
    ensureDir(path.join(partnerDir, 'skills'));

    const name = (input.name || partnerId).trim();
    const description = (input.description || '自定义协同伙伴').trim();
    const avatar = input.avatar || '🤖';
    const avatarColor = input.avatarColor || 'violet';
    const identitySource = input.identitySource || `# ${name}\n\n${description}`;

    const capabilities = {
      permissions: input.capabilities?.permissions || 'auto',
      skills: Array.isArray(input.capabilities?.skills) ? input.capabilities.skills : [],
      skillMode: input.capabilities?.skillMode || 'inherit',
      mcpServers: input.capabilities?.mcpServers || ['cindy-memory'],
      mcpMode: input.capabilities?.mcpMode || 'inherit',
      toolsets: Array.isArray(input.capabilities?.toolsets) ? input.capabilities.toolsets : ['filesystem'],
      toolsetMode: input.capabilities?.toolsetMode || 'inherit',
      plugins: Array.isArray(input.capabilities?.plugins) ? input.capabilities.plugins : [],
      pluginMode: input.capabilities?.pluginMode || 'inherit',
      workingDir: input.capabilities?.workingDir || null
    };

    const now = Date.now();
    const manifest = {
      id: partnerId,
      name,
      description,
      avatar,
      avatarColor,
      identitySource,
      capabilities,
      isBuiltin: Boolean(options.isBuiltin),
      createdAt: input.createdAt || now,
      updatedAt: now,
      partnerDir
    };

    // 1. 写 manifest.json
    fs.writeFileSync(path.join(partnerDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    // 2. 写 SOUL.md
    fs.writeFileSync(path.join(partnerDir, 'SOUL.md'), identitySource, 'utf8');

    // 3. 写 MEMORY.md (若不存在)
    const memFile = path.join(partnerDir, 'memories', 'MEMORY.md');
    if (!fs.existsSync(memFile)) {
      const initialMem = `# Memory Index: ${name}\n\n_(empty — no memories saved yet for this partner)_\n`;
      fs.writeFileSync(memFile, initialMem, 'utf8');
    }

    return manifest;
  }

  updatePartner(id, patch) {
    const existing = this.getPartner(id);
    if (!existing) {
      throw new Error(`[NOT_FOUND] 伙伴 ${id} 不存在`);
    }

    const updated = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      description: patch.description !== undefined ? patch.description.trim() : existing.description,
      avatar: patch.avatar !== undefined ? patch.avatar : existing.avatar,
      avatarColor: patch.avatarColor !== undefined ? patch.avatarColor : existing.avatarColor,
      identitySource: patch.identitySource !== undefined ? patch.identitySource : existing.identitySource,
      capabilities: {
        ...existing.capabilities,
        ...(patch.capabilities || {})
      },
      updatedAt: Date.now()
    };

    const partnerDir = path.join(this.storageDir, existing.id);
    fs.writeFileSync(path.join(partnerDir, 'manifest.json'), JSON.stringify(updated, null, 2), 'utf8');

    if (patch.identitySource !== undefined) {
      fs.writeFileSync(path.join(partnerDir, 'SOUL.md'), patch.identitySource, 'utf8');
    }

    return updated;
  }

  deletePartner(id) {
    const existing = this.getPartner(id);
    if (!existing) {
      throw new Error(`[NOT_FOUND] 伙伴 ${id} 不存在`);
    }
    if (existing.isBuiltin) {
      throw new Error(`[FORBIDDEN] 内置核心伙伴不能删除`);
    }

    const partnerDir = path.join(this.storageDir, existing.id);
    // 使用标记归档而不是强删
    const archivedDir = path.join(this.storageDir, `_archived_${existing.id}_${Date.now()}`);
    fs.renameSync(partnerDir, archivedDir);
    return { ok: true, id };
  }
}
