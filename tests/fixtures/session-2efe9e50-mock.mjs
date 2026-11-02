// Purpose: Benchmark mock dataset and reference harness derived from Claude session 2efe9e50.
// Context: Supports 100% offline, zero-cloud E2E testing of the 8 control plane helpers.
// Usage: Imported by tests/test-agent-control-plane-e2e.mjs.
// Prerequisites: Node.js >= 18.0.0, native node:crypto and node:fs.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MOCK_CLAUDE_SESSION_ID = '2efe9e50-4306-497b-8b76-c112ffbd5d78';

export function sha256(content) {
  return crypto.createHash('sha256').update(String(content), 'utf8').digest('hex');
}

// 1. Benchmark 13KB Markdown skill derived from superpowers:using-superpowers in 2efe9e50
export const MOCK_SUPERPOWERS_SKILL_MD = `---
name: using-superpowers
description: Orchestrates autonomous subagents with deep multi-step research and codebase exploration.
triggers:
  - superpowers
  - explore-codebase
  - investigate-deeply
---
# Superpowers Core Protocol v2.4

## Section 1: Executive Directive & Invariant Rules
The Agent must rigorously enforce zero-hallucination code navigation, progressive context revelation, and atomic subagent dispatching.
Every autonomous turn must follow the single-responsibility principle:
1. Parse user directives without courtesies.
2. Formulate execution graphs with bounded step budgets.
3. Validate tool outputs before committing changes.
` + '## Detail Guidelines\n' + 'Rule line: Maintain strict boundary compliance and avoid recursive context growth.\n'.repeat(160);

// 2. Large package.json simulation (~5,200 chars)
export const MOCK_PACKAGE_JSON_LARGE = JSON.stringify({
  name: 'prism-browser-desktop',
  version: '2.4.0',
  description: 'Enterprise chromium multi-session orchestrator with VNC display streaming and profile isolation',
  main: 'dist/main.js',
  scripts: {
    build: 'vite build',
    test: 'node --test tests/*.test.mjs',
    lint: 'eslint . --ext .js,.ts',
    start: 'electron .'
  },
  dependencies: Object.fromEntries(
    Array.from({ length: 80 }, (_, i) => [`@enterprise-lib/module-${i + 1}`, `^${(i % 5) + 1}.0.0`])
  ),
  devDependencies: Object.fromEntries(
    Array.from({ length: 40 }, (_, i) => [`@types/module-${i + 1}`, `^${(i % 3) + 1}.2.0`])
  )
}, null, 2);

// 3. Large grep output simulation (300 lines)
export const MOCK_GREP_OUTPUT_LARGE = Array.from({ length: 300 }, (_, i) => {
  return `apps/desktop/src/modules/billing/tier-${i + 1}.ts:${i * 4 + 10}: export const IS_PRO_TIER_${i + 1} = checkProFeature(${i});`;
}).join('\n');

// 4. Raw tool definitions with verbose schemas and examples (to be slimmed)
export const MOCK_RAW_TOOLS = [
  {
    name: 'Read',
    description: 'Reads the entire contents of a file from disk with UTF-8 encoding. You should use this whenever you need to inspect files. For example, reading package.json or config files.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The absolute file path to read from the disk.', examples: ['/foo/bar.txt'] },
        encoding: { type: 'string', default: 'utf8', description: 'The character encoding of the target file.' }
      },
      required: ['path']
    }
  },
  {
    name: 'Write',
    description: 'Writes the given content to a file, replacing its contents completely. Please make sure directory exists.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The absolute file path to write.', examples: ['/tmp/test.js'] },
        content: { type: 'string', description: 'The content string to be written into the file.' }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'Grep',
    description: 'Fast regex pattern searching inside files across a target workspace directory.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Regex query expression.' },
        path: { type: 'string', description: 'Directory to search within.' }
      },
      required: ['query']
    }
  },
  {
    name: 'Bash',
    description: 'Executes arbitrary shell commands in an interactive or non-interactive bash terminal environment.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command string to execute in bash.' }
      },
      required: ['command']
    }
  }
];

// 5. Reference Implementation: Helper 1 (IntentPreflight)
export class IntentPreflightHelper {
  constructor() {
    this.continuationRegex = /^(ok|okay|继续|好|好的|yes|y|proceed|go\s*on|1|收到|确认|next|continue|行)[\s!.,，。！？~～]*$/i;
  }
  analyze(input, prevContext = {}) {
    const start = performance.now();
    const trimmed = String(input || '').trim();
    if (this.continuationRegex.test(trimmed)) {
      return {
        isBypass: true,
        intentType: 'BYPASS_CONTINUATION',
        requiredCapabilities: new Set(prevContext.lastCapabilities || ['FILE_READ']),
        suggestedTools: prevContext.lastAllowedTools ? [...prevContext.lastAllowedTools] : ['Read', 'Grep'],
        latencyMs: Math.max(0.01, performance.now() - start)
      };
    }
    const caps = new Set();
    const tools = [];
    if (/search|grep|find|查看|分析|读/i.test(trimmed)) {
      caps.add('FILE_READ');
      tools.push('Read', 'Grep');
    }
    if (/edit|write|delete|remove|修改|重构|创建|写|删除|删/i.test(trimmed)) {
      caps.add('FILE_WRITE');
      tools.push('Write');
    }
    if (/pnpm|node|test|运行|编译|bash/i.test(trimmed)) {
      caps.add('COMMAND_RUN');
      tools.push('Bash');
    }
    if (caps.size === 0) {
      caps.add('FILE_READ');
      tools.push('Read');
    }
    return {
      isBypass: false,
      intentType: caps.has('FILE_WRITE') ? 'CODE_MUTATION' : (caps.has('COMMAND_RUN') ? 'TERMINAL_EXEC' : 'READ_EXPLORE'),
      requiredCapabilities: caps,
      suggestedTools: tools,
      latencyMs: Math.max(0.01, performance.now() - start)
    };
  }
}

// 6. Reference Implementation: Helper 2 (PromptCacheLock)
export class PromptCacheLockHelper {
  assembleStaticPrefix(segments = []) {
    const sorted = [...segments].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id));
    const staticPrefix = sorted.map(s => s.content.trim()).join('\n\n');
    return { staticPrefix, staticHash: sha256(staticPrefix) };
  }
  injectTail(staticPrefix, payload = {}) {
    const tailSections = [];
    if (payload.timestampIso) tailSections.push(`Timestamp: ${payload.timestampIso}`);
    if (payload.activeSessionId) tailSections.push(`Session: ${payload.activeSessionId}`);
    if (payload.steeringDirectives?.length) tailSections.push(`Directives: ${payload.steeringDirectives.join('; ')}`);
    if (payload.capsuleInjection) tailSections.push(`Capsules:\n${payload.capsuleInjection}`);
    const tailInjection = `\n\n=== [EPHEMERAL_TAIL_CONTEXT] ===\n${tailSections.join('\n')}`;
    const fullPrompt = `${staticPrefix}${tailInjection}`;
    return {
      staticPrefix,
      staticHash: sha256(staticPrefix),
      tailInjection,
      fullPrompt,
      cacheControlBreakpointIndex: staticPrefix.length
    };
  }
  verifyCacheInvariance(bundleA, bundleB) {
    return bundleA.staticHash === bundleB.staticHash && bundleB.fullPrompt.startsWith(bundleA.staticPrefix);
  }
}

// 7. Reference Implementation: Helper 3 (ProgressiveDisclosure)
export class ProgressiveDisclosureHelper {
  renderLevel1(resourceId, descriptor = {}) {
    const lines = descriptor.totalLines ?? 0;
    const bytes = descriptor.totalBytes ?? 0;
    const tag = descriptor.tag || 'general';
    return {
      resourceId,
      level: 1,
      renderedText: `[ResourceFolded: ${resourceId} | lines: ${lines} | bytes: ${bytes} | tag: ${tag}]`,
      approxTokens: 12
    };
  }
  renderLevel2(resourceId, fullText, maxChars = 180) {
    const lines = String(fullText).trim().split('\n');
    const firstLine = lines[0].slice(0, 80);
    const snippet = lines.slice(0, 3).join(' | ').slice(0, 120);
    const byteSize = Buffer.byteLength(fullText, 'utf8');
    let summary = `[ResourceCapsule: ${resourceId} | bytes: ${byteSize} | head: "${snippet}"]`;
    if (summary.length > maxChars) {
      summary = summary.slice(0, maxChars - 4) + '...]';
    }
    return {
      resourceId,
      level: 2,
      renderedText: summary,
      approxTokens: Math.ceil(summary.length / 4)
    };
  }
  renderLevel3(resourceId, fullText, slice = { startLine: 1, endLine: 20 }) {
    const lines = String(fullText).trim().split('\n');
    const start = Math.max(1, slice.startLine);
    const end = Math.min(lines.length, slice.endLine);
    const sliceContent = lines.slice(start - 1, end).join('\n');
    return {
      resourceId,
      level: 3,
      renderedText: `[Lines ${start}-${end} of ${lines.length}]\n${sliceContent}`,
      approxTokens: Math.ceil(sliceContent.length / 4)
    };
  }
}

// 8. Reference Implementation: Helper 4 (StepScrubber)
export class StepScrubberHelper {
  compressHeadTail(text, headLines = 6, tailLines = 6) {
    const lines = String(text).split('\n');
    if (lines.length <= headLines + tailLines + 2) return text;
    const head = lines.slice(0, headLines).join('\n');
    const tail = lines.slice(-tailLines).join('\n');
    const collapsed = lines.length - headLines - tailLines;
    return `${head}\n... [Scrubbed: ${collapsed} lines collapsed for cache stability] ...\n${tail}`;
  }
  scrubSessionHistory(history = [], currentStep = 1, chunkStep = 6) {
    const freezeThreshold = Math.floor(currentStep / chunkStep) * chunkStep;
    return history.map(entry => {
      if (entry.step < freezeThreshold && !entry.isScrubbed) {
        return {
          ...entry,
          scrubbedOutput: this.compressHeadTail(entry.rawOutput, 6, 6),
          isScrubbed: true
        };
      }
      return entry;
    });
  }
}

// 9. Reference Implementation: Helper 5 (PromptDistillation)
export class PromptDistillationHelper {
  constructor() {
    this.courtesyRegex = /(请问|麻烦你|麻烦您|可不可以|劳驾|非常感谢|多谢|please|could you kindly|thank you|hello)\s*[,，!！]?/gi;
    this.lruCache = new Map();
  }
  stripCourtesy(text) {
    return String(text).replace(this.courtesyRegex, '').replace(/\s{2,}/g, ' ').trim();
  }
  distill(prompt) {
    const cleaned = this.stripCourtesy(prompt);
    const hash = sha256(cleaned);
    if (this.lruCache.has(hash)) {
      return { ...this.lruCache.get(hash), fromCache: true };
    }
    const coldPrefix = cleaned.split(/[:：\n]/)[0].trim();
    const hotParameters = cleaned.slice(coldPrefix.length).trim();
    const result = {
      coldPrefix,
      hotParameters,
      distilledCombined: cleaned,
      prefixHash: sha256(coldPrefix),
      tokensSavedEstimate: Math.max(0, Math.floor((prompt.length - cleaned.length) / 4)),
      fromCache: false
    };
    this.lruCache.set(hash, result);
    return result;
  }
}

// 10. Reference Implementation: Helper 6 (ToolSlimming)
export class ToolSlimmingHelper {
  constructor() {
    this.compiledCache = new Map();
  }
  slimSchema(tool) {
    const copy = JSON.parse(JSON.stringify(tool));
    if (copy.description && copy.description.length > 80) {
      copy.description = copy.description.split('.')[0] + '.';
    }
    if (copy.parameters?.properties) {
      for (const key of Object.keys(copy.parameters.properties)) {
        const prop = copy.parameters.properties[key];
        delete prop.examples;
        delete prop.title;
        delete prop.markdownDescription;
      }
    }
    return copy;
  }
  filterByCapabilities(tools, capabilities = new Set()) {
    return tools.filter(t => {
      if (capabilities.has('FILE_WRITE')) return true;
      if (capabilities.has('COMMAND_RUN') && t.name === 'Bash') return true;
      if (capabilities.has('FILE_READ') && (t.name === 'Read' || t.name === 'Grep' || t.name === 'Glob')) return true;
      return false;
    });
  }
  getOrCompile(tools, capabilities) {
    const slimmed = tools.map(t => this.slimSchema(t));
    const filtered = capabilities ? this.filterByCapabilities(slimmed, capabilities) : slimmed;
    const cacheKey = sha256(JSON.stringify(filtered));
    if (!this.compiledCache.has(cacheKey)) {
      this.compiledCache.set(cacheKey, {
        schemaHash: cacheKey,
        tools: filtered,
        tokenEstimate: Math.ceil(JSON.stringify(filtered).length / 4)
      });
    }
    return this.compiledCache.get(cacheKey);
  }
}

// 11. Reference Implementation: Helper 7 (McpMetaTooling)
export class McpMetaToolingHelper {
  constructor() {
    this.snapshotStore = new Map();
  }
  registerServerSnapshot(serverName, tools = []) {
    for (const tool of tools) {
      this.snapshotStore.set(`${serverName}.${tool.name}`, { serverName, ...tool });
    }
    return sha256(Array.from(this.snapshotStore.keys()).sort().join(','));
  }
  getMetaToolDefinitions() {
    return [
      {
        name: 'gateway_list_tools',
        description: 'Lists all available tools registered under the gateway MCP registry.',
        parameters: { type: 'object', properties: { keyword: { type: 'string' } } }
      },
      {
        name: 'gateway_call_tool',
        description: 'Executes a tool call through the gateway snapshot registry.',
        parameters: {
          type: 'object',
          properties: {
            server: { type: 'string' },
            tool: { type: 'string' },
            arguments: { type: 'object' }
          },
          required: ['server', 'tool']
        }
      }
    ];
  }
  listTools(keyword = '') {
    const list = Array.from(this.snapshotStore.values());
    if (!keyword) return list;
    return list.filter(t => t.name.includes(keyword) || t.description?.includes(keyword));
  }
  async dispatchMetaCall(server, toolName, args = {}) {
    const key = `${server}.${toolName}`;
    const found = this.snapshotStore.get(key);
    if (!found) throw new Error(`MCP tool not found in registry: ${key}`);
    return { ok: true, output: `[Executed ${key} with ${JSON.stringify(args)}]` };
  }
}

// 12. Reference Implementation: Helper 8 (SkillCapsule)
export class SkillCapsuleHelper {
  distill(skillName, markdownContent) {
    const descMatch = markdownContent.match(/description:\s*([^\n]+)/);
    const desc = descMatch ? descMatch[1].trim() : 'Skill capsule';
    const firstRuleMatch = markdownContent.match(/The Agent must[^.\n]+./);
    const rule = firstRuleMatch ? firstRuleMatch[0].trim() : '';
    let capsuleText = `[Skill:${skillName} | ${desc} | ${rule}]`;
    if (capsuleText.length > 180) {
      capsuleText = capsuleText.slice(0, 176) + '...]';
    }
    return {
      skillName,
      sourceHash: sha256(markdownContent),
      capsuleText,
      distilledAtIso: new Date().toISOString()
    };
  }
  loadOrDistill(skillName, content, cacheDir) {
    const hash = sha256(content);
    const cacheFile = path.join(cacheDir, `${skillName}.${hash}.json`);
    if (fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        if (cached.sourceHash === hash) {
          return { ...cached, fromDiskCache: true };
        }
      } catch {
        // Fall back to re-distilling
      }
    }
    const record = this.distill(skillName, content);
    try {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFile, JSON.stringify(record, null, 2), 'utf8');
    } catch {
      // Ignored for in-memory or read-only tests
    }
    return { ...record, fromDiskCache: false };
  }
}
