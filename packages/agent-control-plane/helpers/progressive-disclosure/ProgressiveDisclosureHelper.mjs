/**
 * Purpose: ProgressiveDisclosureHelper - 3-Tier progressive disclosure & context de-bloating.
 * Context: Helper 3 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import { MAX_CAPSULE_CHARS, DISCLOSURE_LEVELS } from '../../constants.mjs';

export { MAX_CAPSULE_CHARS, DISCLOSURE_LEVELS };

export class ProgressiveDisclosureHelper {
  constructor(options = {}) {
    this.maxCapsuleChars = Number.isInteger(options.maxCapsuleChars)
      ? options.maxCapsuleChars
      : MAX_CAPSULE_CHARS;
    this.resources = new Map();
  }

  /**
   * Register a raw resource into the control plane store.
   */
  registerResource(id, content, metadata = {}) {
    if (!id || typeof id !== 'string') {
      throw new TypeError('Resource ID must be a non-empty string');
    }
    const rawText = typeof content === 'string' ? content : String(content ?? '');
    const lines = rawText.length === 0 ? [] : rawText.split(/\r?\n/);
    const totalLines = lines.length;
    const totalBytes = Buffer.byteLength(rawText, 'utf8');

    const entry = {
      id,
      content: rawText,
      lines,
      totalLines,
      totalBytes,
      tag: metadata.tag || 'general',
      sourcePath: metadata.sourcePath || null,
      customCapsule: metadata.capsule || null,
      updatedAt: Date.now()
    };
    this.resources.set(id, entry);
    return entry;
  }

  /**
   * Retrieve resource descriptor entry by ID.
   */
  getResource(id) {
    return this.resources.get(id) || null;
  }

  /**
   * Check if resource ID exists in store.
   */
  hasResource(id) {
    return this.resources.has(id);
  }

  /**
   * Layer 1: Zero-token folded metadata tag.
   */
  renderLayer1(id) {
    const res = this.resources.get(id);
    if (!res) throw new Error(`Resource not found: ${id}`);
    return `[ResourceFolded: ${res.id} | lines: ${res.totalLines} | bytes: ${res.totalBytes} | tag: ${res.tag}]`;
  }

  /**
   * Layer 2: High-density micro-capsule.
   * Hard invariant: total output length must be <= maxChars (default 180).
   */
  renderLayer2(id, options = {}) {
    const res = this.resources.get(id);
    if (!res) throw new Error(`Resource not found: ${id}`);
    const maxChars = Number.isInteger(options.maxChars) ? options.maxChars : this.maxCapsuleChars;

    const prefix = `[ResourceCapsule: ${res.id} | `;
    const suffix = ']';
    const overhead = prefix.length + suffix.length;
    const bodyBudget = Math.max(0, maxChars - overhead);

    let capsuleBody = res.customCapsule;
    if (!capsuleBody) {
      capsuleBody = ProgressiveDisclosureHelper.generateCapsuleText(res.content, bodyBudget);
    }
    if (capsuleBody.length > bodyBudget) {
      capsuleBody = capsuleBody.slice(0, Math.max(0, bodyBudget - 3)) + '...';
    }

    const output = `${prefix}${capsuleBody}${suffix}`;
    if (output.length > maxChars) {
      return output.slice(0, maxChars - 4) + '...]';
    }
    return output;
  }

  /**
   * Layer 3: On-demand sliced window [Lines start-end of total].
   */
  renderLayer3(id, sliceWindow = {}) {
    const res = this.resources.get(id);
    if (!res) throw new Error(`Resource not found: ${id}`);

    if (res.totalLines === 0) {
      return `[ResourceSlice: ${res.id} | Lines 0-0 of 0]\n`;
    }

    let start = Number.isInteger(sliceWindow.startLine) ? sliceWindow.startLine : 1;
    let end = Number.isInteger(sliceWindow.endLine) ? sliceWindow.endLine : res.totalLines;

    // Boundary clamp protection
    start = Math.max(1, Math.min(start, res.totalLines));
    end = Math.max(start, Math.min(end, res.totalLines));

    const selectedLines = res.lines.slice(start - 1, end);
    const body = selectedLines.join('\n');
    return `[ResourceSlice: ${res.id} | Lines ${start}-${end} of ${res.totalLines}]\n${body}`;
  }

  /**
   * Unified entry for progressive rendering (levels 1, 2, 3).
   */
  render(id, level = 1, options = {}) {
    switch (Number(level)) {
      case 1:
        return this.renderLayer1(id);
      case 2:
        return this.renderLayer2(id, options);
      case 3:
        return this.renderLayer3(id, options);
      default:
        throw new Error(`Unsupported disclosure level: ${level}`);
    }
  }

  /**
   * Pure utility: Extract condensed summary <= maxChars from raw text.
   */
  static generateCapsuleText(content, maxChars = 180) {
    if (!content || typeof content !== 'string') return 'empty';

    const cleaned = content.replace(/\r\n/g, '\n').trim();
    const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return 'empty';

    let candidate = '';
    const heading = lines.find(l => /^#{1,4}\s+/.test(l));
    if (heading) {
      candidate = heading.replace(/^#{1,4}\s+/, '').trim();
    }

    const firstLine = lines[0].replace(/^#{1,4}\s+/, '').trim();
    if (!candidate || candidate === firstLine) {
      candidate = lines.slice(0, 3).join('; ').replace(/\s+/g, ' ');
    } else {
      candidate = `${candidate}: ${lines.slice(0, 2).join('; ').replace(/\s+/g, ' ')}`;
    }

    if (candidate.length > maxChars) {
      candidate = candidate.slice(0, Math.max(0, maxChars - 3)) + '...';
    }
    return candidate;
  }
}
