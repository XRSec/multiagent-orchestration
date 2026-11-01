import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class SessionManager {
  constructor(storageDir = path.resolve(process.cwd(), '.sessions')) {
    this.storageDir = storageDir;
    this.sessionMapFile = path.resolve(storageDir, 'sessions.json');
    this.timelineFile = path.resolve(storageDir, 'timeline.jsonl');
    this.sessions = new Map(); // channelKey -> sessionUuid
    this.timeline = []; // in-memory event buffer

    this.init();
  }

  init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (fs.existsSync(this.sessionMapFile)) {
      try {
        const raw = fs.readFileSync(this.sessionMapFile, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          this.sessions.set(k, v);
        }
      } catch {
        // Fallback to empty map if corrupted
      }
    }
  }

  save() {
    try {
      const obj = Object.fromEntries(this.sessions.entries());
      fs.writeFileSync(this.sessionMapFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
      console.error(`Failed to save session map: ${err.message}`);
    }
  }

  /**
   * Returns existing or assigns a new RFC 4122 UUIDv4 for a logical channel.
   */
  getOrCreateSessionUuid(channelKey) {
    if (this.sessions.has(channelKey)) {
      return this.sessions.get(channelKey);
    }
    const newUuid = crypto.randomUUID();
    this.sessions.set(channelKey, newUuid);
    this.save();
    return newUuid;
  }

  /**
   * Creates a dedicated ephemeral UUID for an agent-to-agent P2P sidechannel.
   */
  createP2pSessionUuid(srcId, targetId, taskId) {
    const channelKey = `p2p_${srcId}_${targetId}_${taskId}`;
    return this.getOrCreateSessionUuid(channelKey);
  }

  /**
   * Appends an event to the append-only timeline.
   */
  appendTimelineEvent({ channel, sender, target = 'ALL', action, content, artifacts = [], metadata = {} }) {
    const event = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      channel,
      sender,
      target,
      action: action || 'MESSAGE',
      content,
      artifacts,
      metadata,
      isSideChannel: channel.startsWith('p2p_'),
    };

    this.timeline.push(event);

    try {
      fs.appendFileSync(this.timelineFile, `${JSON.stringify(event)}\n`, 'utf8');
    } catch (err) {
      console.error(`Failed to append timeline event: ${err.message}`);
    }

    return event;
  }

  /**
   * Retrieves public group timeline events (strictly excluding side-channel P2P).
   */
  getPublicTimeline(channelFilter = null, limit = 50) {
    return this.timeline
      .filter((ev) => !ev.isSideChannel && (!channelFilter || ev.channel === channelFilter))
      .slice(-limit);
  }

  /**
   * Formats recent public timeline context as machine-readable prompt section.
   */
  formatTimelineForPrompt(channelFilter = null, limit = 10) {
    const events = this.getPublicTimeline(channelFilter, limit);
    if (events.length === 0) return 'No previous group events.';

    return events
      .map((ev) => `[${ev.timestamp}] ${ev.sender} -> ${ev.target} (${ev.action}):\n${ev.content}`)
      .join('\n\n---\n\n');
  }
}

export const defaultSessionManager = new SessionManager();
