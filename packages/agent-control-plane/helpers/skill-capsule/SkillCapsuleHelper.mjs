/**
 * Purpose: SkillCapsuleHelper - Markdown skill distillation into <=180 char capsules with SHA-256 disk cache.
 * Context: Helper 8 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_CAPSULE_CHARS } from '../../constants.mjs';

export { MAX_CAPSULE_CHARS };

export class SkillCapsuleHelper {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
    this.maxCapsuleChars = Number.isInteger(options.maxCapsuleChars)
      ? options.maxCapsuleChars
      : MAX_CAPSULE_CHARS;
  }

  /**
   * Compute deterministic SHA-256 hash of text content.
   */
  computeHash(content) {
    const raw = typeof content === 'string' ? content : String(content ?? '');
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  /**
   * Sanitize string for filesystem-safe filename.
   */
  static sanitizeFilename(name) {
    return String(name || 'unnamed').replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * Extract frontmatter metadata and first section from markdown skill.
   */
  static extractMetadata(markdownContent) {
    if (!markdownContent || typeof markdownContent !== 'string') {
      return { name: '', description: '', triggers: [], body: '' };
    }

    const lines = markdownContent.split(/\r?\n/);
    let inFrontmatter = false;
    const frontmatterLines = [];
    const bodyLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0 && line.trim() === '---') {
        inFrontmatter = true;
        continue;
      }
      if (inFrontmatter) {
        if (line.trim() === '---') {
          inFrontmatter = false;
        } else {
          frontmatterLines.push(line);
        }
      } else {
        bodyLines.push(line);
      }
    }

    let name = '';
    let description = '';
    const triggers = [];

    for (const fm of frontmatterLines) {
      const match = fm.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
      if (match) {
        const key = match[1].toLowerCase();
        const val = match[2].trim().replace(/^['"]|['"]$/g, '');
        if (key === 'name') name = val;
        else if (key === 'description') description = val;
        else if (key === 'triggers') {
          val.split(',').map(t => t.trim()).filter(Boolean).forEach(t => triggers.push(t));
        }
      }
    }

    const body = bodyLines.join('\n').trim();
    if (!description && bodyLines.length > 0) {
      const firstMeaningful = bodyLines.find(l => l.trim().length > 0 && !l.startsWith('#'));
      if (firstMeaningful) description = firstMeaningful.trim();
    }

    return { name, description, triggers, body };
  }

  /**
   * Distill skill into a high-density micro-capsule with <= 180 char hard constraint.
   */
  distillContent(skillName, markdownContent) {
    const sourceHash = this.computeHash(markdownContent);
    const meta = SkillCapsuleHelper.extractMetadata(markdownContent);
    const name = skillName || meta.name || 'anonymous_skill';
    const triggersStr = meta.triggers.length > 0 ? meta.triggers.join(', ') : 'auto';
    const desc = meta.description || 'General skill';

    let coreText = `[SkillCapsule: ${name} | triggers: ${triggersStr} | desc: ${desc}]`;

    // Hard invariant: length <= 180 chars
    if (coreText.length > this.maxCapsuleChars) {
      const prefix = `[SkillCapsule: ${name} | triggers: ${triggersStr} | desc: `;
      const suffix = '...]';
      const availableDescChars = this.maxCapsuleChars - prefix.length - suffix.length;
      if (availableDescChars > 0) {
        coreText = `${prefix}${desc.slice(0, availableDescChars)}${suffix}`;
      } else {
        coreText = coreText.slice(0, Math.max(0, this.maxCapsuleChars - 4)) + '...]';
      }
    }

    return {
      skillName: name,
      sourceHash,
      capsuleText: coreText,
      triggers: meta.triggers,
      distilledAtIso: new Date().toISOString()
    };
  }

  /**
   * Load capsule from disk cache or distill fresh and persist.
   */
  loadOrDistill(skillName, filePath, cacheDir = this.cacheDir) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Skill file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const currentHash = this.computeHash(content);

    if (!cacheDir) {
      return this.distillContent(skillName, content);
    }

    fs.mkdirSync(cacheDir, { recursive: true });
    const safeName = SkillCapsuleHelper.sanitizeFilename(skillName);
    const cacheFilePath = path.join(cacheDir, `${safeName}.${currentHash.slice(0, 16)}.json`);

    // Verify cache hit
    if (fs.existsSync(cacheFilePath)) {
      try {
        const cachedRaw = fs.readFileSync(cacheFilePath, 'utf8');
        const parsed = JSON.parse(cachedRaw);
        if (parsed.sourceHash === currentHash) {
          return parsed;
        }
      } catch {
        // Fall through on JSON parse error
      }
    }

    // Cache invalidation: clean up outdated version caches
    this.invalidateCache(skillName, cacheDir);

    // Distill fresh capsule and persist to disk
    const freshRecord = this.distillContent(skillName, content);
    fs.writeFileSync(cacheFilePath, JSON.stringify(freshRecord, null, 2), 'utf8');
    return freshRecord;
  }

  /**
   * Retrieve cached capsule without disk write if valid.
   */
  getCachedCapsule(skillName, sourceHash, cacheDir = this.cacheDir) {
    if (!cacheDir) return null;
    const safeName = SkillCapsuleHelper.sanitizeFilename(skillName);
    const cacheFilePath = path.join(cacheDir, `${safeName}.${sourceHash.slice(0, 16)}.json`);
    if (!fs.existsSync(cacheFilePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Remove cached entries for the specified skill name.
   */
  invalidateCache(skillName, cacheDir = this.cacheDir) {
    if (!cacheDir || !fs.existsSync(cacheDir)) return;
    const safeName = SkillCapsuleHelper.sanitizeFilename(skillName);
    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.startsWith(`${safeName}.`) && file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(cacheDir, file));
        } catch {
          // Ignore unlink errors
        }
      }
    }
  }
}
