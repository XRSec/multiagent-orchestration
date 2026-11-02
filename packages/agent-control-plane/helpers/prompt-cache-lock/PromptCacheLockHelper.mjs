/**
 * Purpose: PromptCacheLockHelper - Static System Prompt locking & tail injection for KV cache stability.
 * Context: Helper 2 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import crypto from 'node:crypto';
import { TAIL_INJECTION_SEPARATOR } from '../../constants.mjs';

export { TAIL_INJECTION_SEPARATOR };

export class PromptCacheLockHelper {
  constructor() {
    this.lockedBaseHash = null;
    this.lockedBasePrefix = null;
  }

  /**
   * Validate that static system prompt content does not contain volatile dynamic templates.
   */
  validateStaticPurity(content) {
    if (typeof content !== 'string') {
      return { isPure: false, violations: ['Non-string content provided'] };
    }
    const violations = [];
    const DYNAMIC_PATTERNS = [
      { regex: /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, desc: 'ISO timestamp detected' },
      { regex: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, desc: 'UUID detected' },
      { regex: /\$\{(Date\.now\(\)|performance\.now\(\)|Math\.random\(\))\}/, desc: 'Dynamic JS evaluation template detected' }
    ];

    for (const pat of DYNAMIC_PATTERNS) {
      if (pat.regex.test(content)) {
        violations.push(pat.desc);
      }
    }

    return {
      isPure: violations.length === 0,
      violations
    };
  }

  /**
   * Deterministically assemble static prompt segments sorted by priority then id.
   */
  assembleStaticPrefix(segments = []) {
    if (!Array.isArray(segments)) {
      throw new TypeError('segments must be an array');
    }

    // Stable sort: priority ascending, then id alphabetical
    const sorted = [...segments].sort((a, b) => {
      const prioDiff = (a.priority || 100) - (b.priority || 100);
      if (prioDiff !== 0) return prioDiff;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

    const contents = [];
    for (const seg of sorted) {
      if (typeof seg.content === 'string' && seg.content.trim()) {
        contents.push(seg.content.trim());
      }
    }

    const staticPrefix = contents.join('\n\n');
    const staticHash = crypto.createHash('sha256').update(staticPrefix, 'utf8').digest('hex');

    if (this.lockedBaseHash && staticHash !== this.lockedBaseHash) {
      throw new Error(`[PromptCacheLock] Base hash mismatch! Locked: ${this.lockedBaseHash}, Actual: ${staticHash}`);
    }

    return { staticPrefix, staticHash };
  }

  /**
   * Lock the base prefix SHA-256 hash. Any subsequent tampering will throw.
   */
  lockBaseHash(hash, prefix = null) {
    if (typeof hash !== 'string' || hash.length !== 64) {
      throw new Error('lockBaseHash expects a valid 64-char SHA-256 hash');
    }
    if (this.lockedBaseHash && this.lockedBaseHash !== hash) {
      throw new Error(`[PromptCacheLock] Cannot re-lock to different hash. Existing: ${this.lockedBaseHash}, New: ${hash}`);
    }
    this.lockedBaseHash = hash;
    if (prefix) this.lockedBasePrefix = prefix;
  }

  /**
   * Inject ephemeral dynamic context at the end of the prompt behind the cache fence.
   */
  injectTail(staticPrefix, payload = {}) {
    if (typeof staticPrefix !== 'string') {
      throw new TypeError('staticPrefix must be a string');
    }

    const lines = [];
    if (payload.timestampIso) {
      lines.push(`- Turn Timestamp: ${payload.timestampIso}`);
    }
    if (payload.activeSessionId) {
      lines.push(`- Active Session: ${payload.activeSessionId}`);
    }
    if (Array.isArray(payload.steeringDirectives) && payload.steeringDirectives.length > 0) {
      lines.push('- Steering Directives:');
      for (const d of payload.steeringDirectives) {
        lines.push(`  * ${d}`);
      }
    }
    if (payload.turnEphemeralState && typeof payload.turnEphemeralState === 'object') {
      lines.push('- Ephemeral State:');
      for (const [k, v] of Object.entries(payload.turnEphemeralState)) {
        lines.push(`  * ${k}: ${JSON.stringify(v)}`);
      }
    }

    const tailInjection = lines.join('\n');
    const fullPrompt = tailInjection.length > 0
      ? `${staticPrefix}${TAIL_INJECTION_SEPARATOR}${tailInjection}`
      : staticPrefix;

    const staticHash = crypto.createHash('sha256').update(staticPrefix, 'utf8').digest('hex');

    return {
      staticPrefix,
      staticHash,
      tailInjection,
      fullPrompt,
      cacheControlBreakpointIndex: staticPrefix.length
    };
  }

  /**
   * Verify that static prefix hash and content remain invariant across bundles.
   */
  verifyCacheInvariance(bundleA, bundleB) {
    if (!bundleA || !bundleB) return false;
    if (bundleA.staticHash !== bundleB.staticHash) return false;
    if (!bundleB.fullPrompt.startsWith(bundleA.staticPrefix)) return false;
    return true;
  }
}
