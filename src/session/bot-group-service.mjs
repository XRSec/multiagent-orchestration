/**
 * Purpose: Cindy-compatible Bot Group & Room state machine and message router.
 * Context: Reuses Cindy's authoritative bot group chat product rules (docs/product-rules/bot-group-chat.md).
 * Invariants: Monotonic sequence per group, idempotent client_id, dedicated partner lanes, round limits.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Cindy constants
export const MAX_CIRCLES_PER_ROUND = 3;
export const MAX_BOT_MESSAGES_PER_ROUND = 10;
export const MAX_DELTA_MESSAGES = 30;

export function botGroupLaneRouteKey(groupId) {
  return `group:${groupId}`;
}

export function botGroupPlanRouteKey(groupId, planId) {
  return `group:${groupId}:plan:${planId}`;
}

export function botGroupThreadRouteKey(groupId, threadRootId) {
  return `group:${groupId}:thread:${threadRootId}`;
}

export class BotGroupService {
  constructor(storageDir = path.resolve(process.cwd(), '.sessions')) {
    this.storageDir = storageDir;
    this.groupsFile = path.resolve(storageDir, 'bot_groups.json');
    this.messagesFile = path.resolve(storageDir, 'bot_group_messages.json');

    // In-memory tables mirroring Cindy SQLite schema
    this.groups = new Map(); // groupId -> GroupRecord
    this.messages = new Map(); // groupId -> Array<MessageRecord>
    this.members = new Map(); // groupId -> Map<botId, MemberRecord>

    this.init();
  }

  init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    if (fs.existsSync(this.groupsFile)) {
      try {
        const raw = fs.readFileSync(this.groupsFile, 'utf8');
        const list = JSON.parse(raw);
        for (const g of list) {
          this.groups.set(g.id, g);
          const memberMap = new Map();
          for (const m of g.members || []) {
            memberMap.set(m.botId, m);
          }
          this.members.set(g.id, memberMap);
        }
      } catch (err) {
        console.error(`Failed to load groups: ${err.message}`);
      }
    }

    if (fs.existsSync(this.messagesFile)) {
      try {
        const raw = fs.readFileSync(this.messagesFile, 'utf8');
        const dict = JSON.parse(raw);
        for (const [gid, msgs] of Object.entries(dict)) {
          this.messages.set(gid, msgs);
        }
      } catch (err) {
        console.error(`Failed to load messages: ${err.message}`);
      }
    }
  }

  save() {
    try {
      const groupList = Array.from(this.groups.values()).map((g) => {
        const mems = Array.from(this.members.get(g.id)?.values() || []);
        return { ...g, members: mems };
      });
      fs.writeFileSync(this.groupsFile, JSON.stringify(groupList, null, 2), 'utf8');

      const msgDict = Object.fromEntries(this.messages.entries());
      fs.writeFileSync(this.messagesFile, JSON.stringify(msgDict, null, 2), 'utf8');
    } catch (err) {
      console.error(`Failed to persist Cindy group storage: ${err.message}`);
    }
  }

  /**
   * Creates a Cindy-compliant bot group room.
   */
  createGroup({
    id = `grp_${crypto.randomUUID().slice(0, 8)}`,
    name,
    organizerBotId = 'lead-orchestrator',
    projectDir = null,
    memberBotIds = ['lead-orchestrator', 'agent-architect', 'rea-partner'],
    speakingMode = 'auto',
  }) {
    const now = Date.now();
    const groupRecord = {
      id,
      name: name || `群聊 ${id.slice(-4)}`,
      organizerBotId,
      projectDir,
      speakingMode,
      currentSequence: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.groups.set(id, groupRecord);
    this.messages.set(id, []);

    const memberMap = new Map();
    memberBotIds.forEach((botId, idx) => {
      memberMap.set(botId, {
        groupId: id,
        botId,
        position: idx,
        lastSeenSequence: 0,
        joinedAt: now,
      });
    });
    this.members.set(id, memberMap);

    this.save();
    return groupRecord;
  }

  getGroup(groupId) {
    const g = this.groups.get(groupId);
    if (!g) return null;
    const members = Array.from(this.members.get(groupId)?.values() || []);
    return { ...g, members };
  }

  listGroups() {
    return Array.from(this.groups.values())
      .map((g) => {
        const members = Array.from(this.members.get(g.id)?.values() || []);
        return { ...g, members };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Appends an ordered message to the room with sequence and idempotent client_id.
   */
  sendMessage({
    groupId,
    authorKind = 'user', // 'user' | 'bot' | 'human' | 'system'
    authorBotId = null,
    authorName = '用户',
    content = '',
    mentions = { all: false, botIds: [] },
    clientId = null,
    planId = null,
    kind = 'message', // 'message' | 'plan' | 'notice'
  }) {
    const group = this.groups.get(groupId);
    if (!group) {
      throw new Error(`Group room not found: ${groupId}`);
    }

    const roomMsgs = this.messages.get(groupId) || [];

    // Cindy Idempotency Check: if client_id already exists in this group, return existing message
    if (clientId) {
      const existing = roomMsgs.find((m) => m.clientId === clientId);
      if (existing) {
        return { message: existing, isDuplicate: true };
      }
    }

    // Monotonic sequence allocation
    group.currentSequence += 1;
    group.updatedAt = Date.now();
    const nextSeq = group.currentSequence;

    // Detect @ mentions formatted as [Name](cindy://bot/<botId>)
    const mentionRegex = /\[.*?\]\(cindy:\/\/bot\/(.*?)\)/g;
    let match;
    const detectedBotIds = new Set(mentions.botIds || []);
    while ((match = mentionRegex.exec(content)) !== null) {
      detectedBotIds.add(match[1]);
    }

    const messageRecord = {
      id: `msg_${crypto.randomUUID()}`,
      groupId,
      sequence: nextSeq,
      kind,
      authorKind,
      authorBotId,
      authorName,
      content,
      mentionsJson: {
        all: mentions.all || false,
        botIds: Array.from(detectedBotIds),
      },
      planId,
      clientId,
      createdAt: Date.now(),
    };

    roomMsgs.push(messageRecord);
    this.messages.set(groupId, roomMsgs);

    // If message author is a bot, update its lastSeenSequence to current
    if (authorBotId && this.members.get(groupId)?.has(authorBotId)) {
      const mem = this.members.get(groupId).get(authorBotId);
      mem.lastSeenSequence = nextSeq;
    }

    this.save();
    return { message: messageRecord, isDuplicate: false };
  }

  /**
   * Gets unseen delta messages for a partner in this room (Cindy delta slicing).
   */
  getDeltaMessagesForPartner(groupId, botId, limit = MAX_DELTA_MESSAGES) {
    const memberMap = this.members.get(groupId);
    const member = memberMap?.get(botId);
    const lastSeen = member ? member.lastSeenSequence : 0;

    const allMsgs = this.messages.get(groupId) || [];
    const deltas = allMsgs.filter((m) => m.sequence > lastSeen).slice(-limit);

    return {
      deltas,
      lastSeenSequence: lastSeen,
      currentSequence: this.groups.get(groupId)?.currentSequence || 0,
    };
  }

  /**
   * Updates a partner's read pointer in the room.
   */
  markPartnerRead(groupId, botId, sequence) {
    const member = this.members.get(groupId)?.get(botId);
    if (member && sequence > member.lastSeenSequence) {
      member.lastSeenSequence = sequence;
      this.save();
    }
  }

  /**
   * Generates a partner's dedicated lane route key (Cindy architecture).
   */
  getPartnerLaneRouteKey(groupId, botId) {
    return {
      groupId,
      botId,
      laneRouteKey: botGroupLaneRouteKey(groupId),
    };
  }
}

export const defaultBotGroupService = new BotGroupService();
