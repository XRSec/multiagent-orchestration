/**
 * Purpose: PromptDistillationHelper - Courtesy stripping, cold/hot prompt separation & LRU prefix caching.
 * Context: Helper 5 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import crypto from 'node:crypto';

export class PromptDistillationHelper {
  constructor(options = {}) {
    this.maxCacheSize = Number.isInteger(options.maxCacheSize) && options.maxCacheSize > 0
      ? options.maxCacheSize
      : 200;
    this.prefixLruCache = new Map();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Strip courtesy and colloquial filler phrases while rigorously protecting negative directives.
   */
  stripCourtesy(text) {
    if (typeof text !== 'string') return '';
    let result = text;

    // 1. Protect negative directives from semantic reversal
    const NEGATION_MASK = '__PRESERVE_NEGATION_';
    const negations = [];
    result = result.replace(/(?:请不要|请勿|千万不要|千万别|务必不要|please\s+do\s+not|please\s+don't)/gi, (m) => {
      const token = `${NEGATION_MASK}${negations.length}__`;
      negations.push(m.replace(/^请/i, '').trim());
      return token;
    });

    // 2. Strip filler patterns
    const COURTESY_PATTERNS = [
      /请问一下[，, ]*/g,
      /请问[，, ]*/g,
      /麻烦你[，, ]*/g,
      /麻烦[，, ]*/g,
      /劳驾[，, ]*/g,
      /可不可以[，, ]*/g,
      /能否帮我[，, ]*/g,
      /能否[，, ]*/g,
      /辛苦了[，, ！!.]*/g,
      /非常感谢[，, ！!.]*/g,
      /谢谢你?[，, ！!.]*/g,
      /你好[，, ！!.]*/g,
      /您好[，, ！!.]*/g,
      /could\s+you\s+(?:kindly|please)\s+/gi,
      /would\s+you\s+please\s+/gi,
      /please\s+/gi,
      /thank\s+you(?:\s+very\s+much)?[!.]*/gi,
      /thanks(?:\s+a\s+lot)?[!.]*/gi,
      /hello[!,.]*/gi,
      /hi[!,.]*/gi
    ];

    for (const pat of COURTESY_PATTERNS) {
      result = result.replace(pat, '');
    }

    // 3. Restore protected negation semantics
    for (let i = 0; i < negations.length; i++) {
      result = result.replace(`${NEGATION_MASK}${i}__`, negations[i]);
    }

    // 4. Clean whitespace
    return result
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim();
  }

  /**
   * Separate prompt into cold static constraints and hot dynamic parameters.
   */
  separateColdAndHot(text) {
    if (typeof text !== 'string' || !text.trim()) {
      return { cold: '', hot: '' };
    }

    const lines = text.split('\n');
    const coldLines = [];
    const hotLines = [];

    const COLD_KEYWORDS = ['规范', '要求', '必须', '严禁', '禁止', '格式', '原则', 'role:', 'rules:', 'constraints:'];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      const isCold = COLD_KEYWORDS.some((kw) => lower.includes(kw))
        || /^[#*-]\s*(?:rule|constraint|invariant)/i.test(trimmed);

      if (isCold) {
        coldLines.push(trimmed);
      } else {
        hotLines.push(trimmed);
      }
    }

    return {
      cold: coldLines.join('\n'),
      hot: hotLines.join('\n')
    };
  }

  /**
   * Distill prompt, separate cold/hot zones, and leverage deterministic LRU cache.
   */
  distill(prompt) {
    const raw = typeof prompt === 'string' ? prompt : '';
    const cleaned = this.stripCourtesy(raw);
    const { cold, hot } = this.separateColdAndHot(cleaned);

    const normalizedCold = cold.replace(/\s+/g, ' ').trim();
    const prefixHash = normalizedCold
      ? crypto.createHash('sha256').update(normalizedCold, 'utf8').digest('hex')
      : 'EMPTY_COLD_PREFIX';

    let cacheHit = false;
    if (this.prefixLruCache.has(prefixHash)) {
      cacheHit = true;
      this.cacheHits++;
      const cached = this.prefixLruCache.get(prefixHash);
      this.prefixLruCache.delete(prefixHash);
      this.prefixLruCache.set(prefixHash, cached);
    } else {
      this.cacheMisses++;
      if (this.prefixLruCache.size >= this.maxCacheSize) {
        const oldestKey = this.prefixLruCache.keys().next().value;
        this.prefixLruCache.delete(oldestKey);
      }
      this.prefixLruCache.set(prefixHash, {
        normalizedCold,
        cachedAt: Date.now()
      });
    }

    const distilledCombined = cold && hot ? `${cold}\n\n${hot}` : (cold || hot || cleaned);
    const savedChars = Math.max(0, raw.length - distilledCombined.length);
    const tokensSavedEstimate = Math.max(0, Math.round(savedChars / 3.5));

    return {
      coldPrefix: cold,
      hotParameters: hot,
      distilledCombined,
      prefixHash,
      tokensSavedEstimate,
      cacheHit
    };
  }

  getCacheStats() {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.prefixLruCache.size,
      capacity: this.maxCacheSize
    };
  }

  clearCache() {
    this.prefixLruCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }
}
