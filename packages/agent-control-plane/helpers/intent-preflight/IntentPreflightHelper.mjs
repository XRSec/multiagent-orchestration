/**
 * Purpose: IntentPreflightHelper - Pre-flight intent analysis & 0ms continuation bypass.
 * Context: Helper 1 of Claude Agent SDK Control Plane.
 * Constraints: Node.js 18+ native ESM, 0 cross-helper dependencies, single file <= 300 lines.
 */

import { performance } from 'node:perf_hooks';
import {
  INTENT_TYPES,
  CAPABILITY_TYPES,
  CONTINUATION_PHRASES,
  CAPABILITY_TOOL_MAP,
  DEFAULT_CAPABILITIES
} from '../../constants.mjs';

const LEADING_PUNCT_REGEX = /^[\s\p{P}\p{S}]+/u;
const TRAILING_PUNCT_REGEX = /[\s\p{P}\p{S}]+$/u;

// Pre-warm V8 Irregexp OneByte & TwoByte (UC16) Unicode property tables at module load
' !warmup! '.replace(LEADING_PUNCT_REGEX, '').replace(TRAILING_PUNCT_REGEX, '');
' !测试! '.replace(LEADING_PUNCT_REGEX, '').replace(TRAILING_PUNCT_REGEX, '');

export {
  INTENT_TYPES,
  CAPABILITY_TYPES,
  CONTINUATION_PHRASES,
  CAPABILITY_TOOL_MAP,
  DEFAULT_CAPABILITIES
};

export class IntentPreflightHelper {
  constructor(options = {}) {
    this.customBypassPhrases = new Set(options.extraBypassPhrases || []);
    // Pre-warm regex & V8 JIT compilation so analyze() latency is sub-millisecond
    this.isContinuationPhrase('  warmup!  ');
  }

  /**
   * Determine if the input text matches continuation keywords.
   * Strips leading and trailing punctuation and spaces.
   */
  isContinuationPhrase(text) {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim().toLowerCase();
    if (!trimmed) return false;
    if (CONTINUATION_PHRASES.has(trimmed) || this.customBypassPhrases.has(trimmed)) {
      return true;
    }
    const cleaned = trimmed
      .replace(LEADING_PUNCT_REGEX, '')
      .replace(TRAILING_PUNCT_REGEX, '');
    if (!cleaned) return false;
    return CONTINUATION_PHRASES.has(cleaned) || this.customBypassPhrases.has(cleaned);
  }

  /**
   * Map set of capability types to concrete tool names.
   */
  resolveToolsForCapabilities(capabilities) {
    const tools = new Set();
    for (const cap of capabilities) {
      const toolList = CAPABILITY_TOOL_MAP[cap] || [];
      for (const t of toolList) {
        tools.add(t);
      }
    }
    return Array.from(tools);
  }

  /**
   * Perform pre-flight intent analysis with sub-millisecond continuation bypass.
   */
  analyze(input, prevContext = null) {
    const startTime = performance.now();
    const rawText = typeof input === 'string' ? input : '';

    // 1. Continuation bypass branch (< 1.0ms execution)
    if (this.isContinuationPhrase(rawText)) {
      const hasPrev = prevContext && prevContext.lastCapabilities && prevContext.lastCapabilities.size > 0;
      const requiredCapabilities = hasPrev
        ? prevContext.lastCapabilities
        : DEFAULT_CAPABILITIES;
      const suggestedTools = hasPrev && prevContext.lastAllowedTools && prevContext.lastAllowedTools.length > 0
        ? prevContext.lastAllowedTools
        : this.resolveToolsForCapabilities(requiredCapabilities);

      return {
        isBypass: true,
        intentType: INTENT_TYPES.BYPASS_CONTINUATION,
        requiredCapabilities,
        suggestedTools,
        latencyMs: Number((performance.now() - startTime).toFixed(4)),
        matchedKeywords: ['CONTINUATION_BYPASS']
      };
    }

    // 2. Lexical pattern matching
    const lower = rawText.toLowerCase();
    const requiredCaps = new Set();
    const matchedKeywords = [];

    const WRITE_PATTERNS = [
      'edit', 'write', 'replace', 'modify', 'create', 'touch', 'fix', 'patch',
      '修改', '编写', '重构', '创建', '更新', '删除', '写入', '修复', '写'
    ];
    const EXEC_PATTERNS = [
      'run', 'exec', 'pnpm', 'npm', 'node', 'test', 'build', 'compile', 'bash', 'terminal',
      '运行', '执行', '测试', '构建', '启动', '编译'
    ];
    const MCP_PATTERNS = ['mcp', 'gateway', 'browser', 'driver', 'cua', '元工具', '外部工具'];
    const SKILL_PATTERNS = ['skill', 'capsule', '技能', '加载技能', 'load_skill'];
    const READ_PATTERNS = [
      'read', 'view', 'grep', 'search', 'find', 'list', 'check', 'inspect',
      '查看', '搜索', '勘测', '阅读', '查阅', '分析', '检查'
    ];

    const matchAny = (patterns) => {
      const hits = [];
      for (const p of patterns) {
        if (lower.includes(p)) hits.push(p);
      }
      return hits;
    };

    const writeHits = matchAny(WRITE_PATTERNS);
    const execHits = matchAny(EXEC_PATTERNS);
    const mcpHits = matchAny(MCP_PATTERNS);
    const skillHits = matchAny(SKILL_PATTERNS);
    const readHits = matchAny(READ_PATTERNS);

    if (writeHits.length > 0) {
      requiredCaps.add(CAPABILITY_TYPES.FILE_WRITE);
      requiredCaps.add(CAPABILITY_TYPES.FILE_READ);
      matchedKeywords.push(...writeHits);
    }
    if (execHits.length > 0) {
      requiredCaps.add(CAPABILITY_TYPES.COMMAND_RUN);
      matchedKeywords.push(...execHits);
    }
    if (mcpHits.length > 0) {
      requiredCaps.add(CAPABILITY_TYPES.MCP_GATEWAY);
      matchedKeywords.push(...mcpHits);
    }
    if (skillHits.length > 0) {
      requiredCaps.add(CAPABILITY_TYPES.SKILL_LOAD);
      matchedKeywords.push(...skillHits);
    }
    if (readHits.length > 0 || requiredCaps.size === 0) {
      requiredCaps.add(CAPABILITY_TYPES.FILE_READ);
      matchedKeywords.push(...readHits);
    }

    let intentType = INTENT_TYPES.GENERAL_QUERY;
    if (requiredCaps.has(CAPABILITY_TYPES.FILE_WRITE)) {
      intentType = INTENT_TYPES.CODE_MUTATION;
    } else if (requiredCaps.has(CAPABILITY_TYPES.COMMAND_RUN)) {
      intentType = INTENT_TYPES.TERMINAL_EXEC;
    } else if (requiredCaps.has(CAPABILITY_TYPES.FILE_READ) && requiredCaps.size === 1) {
      intentType = INTENT_TYPES.READ_EXPLORE;
    }

    return {
      isBypass: false,
      intentType,
      requiredCapabilities: requiredCaps,
      suggestedTools: this.resolveToolsForCapabilities(requiredCaps),
      latencyMs: Number((performance.now() - startTime).toFixed(4)),
      matchedKeywords
    };
  }
}
