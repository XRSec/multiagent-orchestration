/**
 * Purpose: BotGroupCoreService - Full lifecycle management for Bot Groups (Rooms/Teams).
 * Adheres strictly to Cindy botGroupChatService.ts standards.
 * Constraints: Node.js 18+ native ESM, single file <= 500 lines.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE_DIR = path.join(os.homedir(), '.multiagent-orchestration');
const GROUPS_DIR = path.join(BASE_DIR, 'groups');

export const BOT_GROUP_MIN_MEMBERS = 2;
export const BOT_GROUP_MAX_MEMBERS = 32;

function ensureDir(p) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

export class BotGroupCoreService {
  constructor(options = {}) {
    this.storageDir = options.storageDir || GROUPS_DIR;
    this.partnerService = options.partnerService || null;
    ensureDir(this.storageDir);
  }

  listGroups() {
    ensureDir(this.storageDir);
    const entries = fs.readdirSync(this.storageDir, { withFileTypes: true });
    const groups = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('_archived_')) {
        const groupDir = path.join(this.storageDir, entry.name);
        const metaFile = path.join(groupDir, 'group.json');
        if (fs.existsSync(metaFile)) {
          try {
            const raw = fs.readFileSync(metaFile, 'utf8');
            const data = JSON.parse(raw);
            groups.push(data);
          } catch (e) {
            console.error(`[BotGroupCoreService] Failed to read ${metaFile}:`, e.message);
          }
        }
      }
    }

    return groups.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getGroup(groupId) {
    if (!groupId || typeof groupId !== 'string') return null;
    const groupDir = path.join(this.storageDir, groupId);
    const metaFile = path.join(groupDir, 'group.json');
    if (!fs.existsSync(metaFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    } catch {
      return null;
    }
  }

  createGroup(input) {
    if (!input || typeof input !== 'object') {
      throw new Error('群聊参数无效');
    }

    const name = (input.name || '').trim();
    if (!name) {
      throw new Error('[INVALID_PARAMS] 请填写群名称');
    }

    // 成员列表归一化 (兼容 botIds 与 memberIds)
    const rawMembers = Array.isArray(input.botIds)
      ? input.botIds
      : Array.isArray(input.memberIds)
        ? input.memberIds
        : [];
    const botIds = Array.from(new Set(rawMembers.filter(Boolean)));

    if (botIds.length < BOT_GROUP_MIN_MEMBERS || botIds.length > BOT_GROUP_MAX_MEMBERS) {
      throw new Error(`[MEMBER_LIMIT] 群聊需要 ${BOT_GROUP_MIN_MEMBERS}–${BOT_GROUP_MAX_MEMBERS} 位伙伴`);
    }

    // 验证伙伴有效性 (如果注入了 partnerService)
    if (this.partnerService) {
      for (const botId of botIds) {
        const p = this.partnerService.getPartner(botId);
        if (!p) {
          throw new Error(`[MEMBER_UNAVAILABLE] 伙伴 ${botId} 不存在或不可用`);
        }
      }
    }

    // 负责人校验 (organizerBotId 必须是成员之一)
    let organizerBotId = input.organizerBotId || input.leadPartnerId || botIds[0];
    if (!botIds.includes(organizerBotId)) {
      organizerBotId = botIds[0];
    }

    const replyMode = input.replyMode === 'mentioned' ? 'mentioned' : 'all';
    const speakingMode = input.speakingMode === 'sequential' ? 'sequential' : 'auto';

    const groupId = input.id || `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const groupDir = path.join(this.storageDir, groupId);
    ensureDir(groupDir);
    ensureDir(path.join(groupDir, 'plans'));
    ensureDir(path.join(groupDir, 'artifacts'));

    const description = (input.description || '多 Agent 协同任务攻坚群').trim();
    const mountedDirs = Array.isArray(input.mountedDirs) ? input.mountedDirs : [];
    const projectDir = input.projectDir || groupDir;
    const now = Date.now();

    const group = {
      id: groupId,
      groupId,
      name,
      title: name,
      kind: 'group',
      description,
      botIds,
      memberIds: botIds,
      organizerBotId,
      leadPartnerId: organizerBotId,
      replyMode,
      speakingMode,
      projectDir,
      groupDir,
      storageDir: groupDir,
      workdir: projectDir,
      mountedDirs,
      capabilities: {
        skills: Array.isArray(input.capabilities?.skills) ? input.capabilities.skills : [],
        mcpServers: Array.isArray(input.capabilities?.mcpServers) ? input.capabilities.mcpServers : ['cindy-memory'],
        plugins: Array.isArray(input.capabilities?.plugins) ? input.capabilities.plugins : []
      },
      createdAt: now,
      updatedAt: now,
      messages: Array.isArray(input.messages) ? input.messages : []
    };

    // 1. 物理写入 group.json
    fs.writeFileSync(path.join(groupDir, 'group.json'), JSON.stringify(group, null, 2), 'utf8');

    // 2. 物理写入 GROUP_CHARTER.md
    const charter = `# [0] ROOT: ${name} CHARTER\n\n`
      + `* **[1] GOAL**: ${description}\n`
      + `* **[2] ORGANIZER BOT**: ${organizerBotId}\n`
      + `* **[3] MEMBERS**: ${botIds.join(', ')}\n`
      + `* **[4] SPEAKING MODE**: ${speakingMode}\n`
      + `* **[5] REPLY MODE**: ${replyMode}\n`
      + `* **[6] STORAGE**: ${groupDir}\n`
      + `* **[7] MOUNTED REPOSITORIES**:\n`
      + (mountedDirs.length > 0 ? mountedDirs.map(d => `  * ${d}`).join('\n') : '  * (无外部挂载工程)');
    fs.writeFileSync(path.join(groupDir, 'GROUP_CHARTER.md'), charter, 'utf8');

    // 3. 物理写入 GROUP_MEMORY.md (群共享黑板)
    const memory = `# [0] ROOT: ${name} SHARED BLACKBOARD MEMORY\n\n`
      + `* **[1] INITIALIZED**: 群聊物理工作空间于 ${new Date(now).toISOString()} 创立。\n`
      + `* **[2] VERIFIED FACTS**: 协作环境与计划沙箱已就绪。\n`;
    fs.writeFileSync(path.join(groupDir, 'GROUP_MEMORY.md'), memory, 'utf8');

    return group;
  }

  updateGroup(groupId, patch) {
    const existing = this.getGroup(groupId);
    if (!existing) {
      throw new Error(`[NOT_FOUND] 群聊 ${groupId} 不存在`);
    }

    let botIds = existing.botIds || existing.memberIds || [];
    if (patch.botIds || patch.memberIds) {
      const raw = patch.botIds || patch.memberIds;
      botIds = Array.from(new Set(raw.filter(Boolean)));
      if (botIds.length < BOT_GROUP_MIN_MEMBERS || botIds.length > BOT_GROUP_MAX_MEMBERS) {
        throw new Error(`[MEMBER_LIMIT] 群聊需要 ${BOT_GROUP_MIN_MEMBERS}–${BOT_GROUP_MAX_MEMBERS} 位伙伴`);
      }
    }

    let organizerBotId = patch.organizerBotId || patch.leadPartnerId || existing.organizerBotId;
    if (!botIds.includes(organizerBotId)) {
      organizerBotId = botIds[0];
    }

    const updated = {
      ...existing,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
      title: patch.name !== undefined ? patch.name.trim() : existing.title,
      description: patch.description !== undefined ? patch.description.trim() : existing.description,
      botIds,
      memberIds: botIds,
      organizerBotId,
      leadPartnerId: organizerBotId,
      replyMode: patch.replyMode !== undefined ? patch.replyMode : existing.replyMode,
      speakingMode: patch.speakingMode !== undefined ? patch.speakingMode : existing.speakingMode,
      mountedDirs: patch.mountedDirs !== undefined ? patch.mountedDirs : existing.mountedDirs,
      projectDir: patch.projectDir !== undefined ? patch.projectDir : existing.projectDir,
      capabilities: {
        ...existing.capabilities,
        ...(patch.capabilities || {})
      },
      updatedAt: Date.now()
    };

    const groupDir = path.join(this.storageDir, existing.id);
    fs.writeFileSync(path.join(groupDir, 'group.json'), JSON.stringify(updated, null, 2), 'utf8');

    // 同步更新 GROUP_CHARTER.md
    const charter = `# [0] ROOT: ${updated.name} CHARTER\n\n`
      + `* **[1] GOAL**: ${updated.description}\n`
      + `* **[2] ORGANIZER BOT**: ${updated.organizerBotId}\n`
      + `* **[3] MEMBERS**: ${updated.botIds.join(', ')}\n`
      + `* **[4] SPEAKING MODE**: ${updated.speakingMode}\n`
      + `* **[5] REPLY MODE**: ${updated.replyMode}\n`
      + `* **[6] STORAGE**: ${groupDir}\n`
      + `* **[7] MOUNTED REPOSITORIES**:\n`
      + (updated.mountedDirs?.length > 0 ? updated.mountedDirs.map(d => `  * ${d}`).join('\n') : '  * (无外部挂载工程)');
    fs.writeFileSync(path.join(groupDir, 'GROUP_CHARTER.md'), charter, 'utf8');

    return updated;
  }

  addMember(groupId, botId) {
    const existing = this.getGroup(groupId);
    if (!existing) throw new Error(`[NOT_FOUND] 群聊 ${groupId} 不存在`);
    const current = new Set(existing.botIds || existing.memberIds || []);
    if (current.has(botId)) return existing;
    current.add(botId);
    return this.updateGroup(groupId, { botIds: Array.from(current) });
  }

  removeMember(groupId, botId) {
    const existing = this.getGroup(groupId);
    if (!existing) throw new Error(`[NOT_FOUND] 群聊 ${groupId} 不存在`);
    const current = (existing.botIds || existing.memberIds || []).filter(id => id !== botId);
    if (current.length < BOT_GROUP_MIN_MEMBERS) {
      throw new Error(`[MEMBER_LIMIT] 成员移除后少于 ${BOT_GROUP_MIN_MEMBERS} 人，无法继续解约`);
    }
    return this.updateGroup(groupId, { botIds: current });
  }

  deleteGroup(groupId) {
    const existing = this.getGroup(groupId);
    if (!existing) throw new Error(`[NOT_FOUND] 群聊 ${groupId} 不存在`);
    const groupDir = path.join(this.storageDir, existing.id);
    const archivedDir = path.join(this.storageDir, `_archived_${existing.id}_${Date.now()}`);
    fs.renameSync(groupDir, archivedDir);
    return { ok: true, id: groupId };
  }
}
