/**
 * Purpose: StepScrubberHelper - Chunk-aligned step=6 historical tool output decay.
 * Context: Helper 4 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import {
  CHUNK_STEP,
  DEFAULT_HEAD_LINES,
  DEFAULT_TAIL_LINES
} from '../../constants.mjs';

export { CHUNK_STEP, DEFAULT_HEAD_LINES, DEFAULT_TAIL_LINES };

export class StepScrubberHelper {
  constructor(options = {}) {
    this.chunkStep = Number.isInteger(options.chunkStep) && options.chunkStep > 0
      ? options.chunkStep
      : CHUNK_STEP;
    this.headLines = Number.isInteger(options.headLines) && options.headLines >= 0
      ? options.headLines
      : DEFAULT_HEAD_LINES;
    this.tailLines = Number.isInteger(options.tailLines) && options.tailLines >= 0
      ? options.tailLines
      : DEFAULT_TAIL_LINES;
  }

  /**
   * Compute the frozen threshold index based on currentTurn and chunkStep.
   */
  computeFreezeThreshold(currentTurn, chunkStep = this.chunkStep) {
    if (!Number.isInteger(currentTurn) || currentTurn < 0) return 0;
    return Math.floor(currentTurn / chunkStep) * chunkStep;
  }

  /**
   * Determine if a historical turn output should be scrubbed.
   */
  shouldScrub(turnIndex, currentTurn, chunkStep = this.chunkStep) {
    if (!Number.isInteger(turnIndex) || !Number.isInteger(currentTurn)) return false;
    const freezeThreshold = this.computeFreezeThreshold(currentTurn, chunkStep);
    return turnIndex < freezeThreshold;
  }

  /**
   * Compress multi-line string keeping head and tail lines, collapsing the middle.
   */
  compressHeadTail(text, options = {}) {
    if (typeof text !== 'string') return '';
    const headCount = Number.isInteger(options.headLines) ? options.headLines : this.headLines;
    const tailCount = Number.isInteger(options.tailLines) ? options.tailLines : this.tailLines;

    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    const threshold = headCount + tailCount;

    // If total lines <= threshold, collapsing does not reduce tokens
    if (totalLines <= threshold) {
      return text;
    }

    const headPart = lines.slice(0, headCount);
    const tailPart = tailCount > 0 ? lines.slice(totalLines - tailCount) : [];
    const skipped = totalLines - threshold;

    const folded = [
      ...headPart,
      `... [Scrubbed: ${skipped} lines collapsed for cache stability] ...`,
      ...tailPart
    ];

    return folded.join('\n');
  }

  /**
   * Scrub session tool history maintaining byte stability for recent steps.
   */
  scrubSessionHistory(history, currentTurn, options = {}) {
    if (!Array.isArray(history)) return [];
    const chunkStep = options.chunkStep || this.chunkStep;
    const headLines = options.headLines || this.headLines;
    const tailLines = options.tailLines || this.tailLines;

    const freezeThreshold = this.computeFreezeThreshold(currentTurn, chunkStep);

    return history.map(entry => {
      if (!entry || typeof entry !== 'object') return entry;

      const turnIndex = entry.turnIndex;
      const isEligible = typeof turnIndex === 'number' && turnIndex < freezeThreshold;

      if (!isEligible) {
        // Keep recent outputs untouched to avoid cache invalidation
        return { ...entry, isScrubbed: false };
      }

      // Idempotency: return existing scrubbed output if already processed
      if (entry.isScrubbed && entry.scrubbedOutput !== undefined) {
        return entry;
      }

      const rawOutput = typeof entry.rawOutput === 'string'
        ? entry.rawOutput
        : String(entry.rawOutput ?? '');
      const compressed = this.compressHeadTail(rawOutput, { headLines, tailLines });

      return {
        ...entry,
        scrubbedOutput: compressed,
        isScrubbed: true
      };
    });
  }
}
