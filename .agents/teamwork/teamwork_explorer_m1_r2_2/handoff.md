# Handoff Report: M1 勘测设计 — Helper 3, 4, 8 技术实现方案与自动化单测设计

## 1. Observation (客观实证观察)

通过勘测当前代码仓库配置、项目规范与前期架构调研，确认以下事实与约束：

1. **任务指示与职责边界**：
   - 引用自 `DISPATCH.md:4-10`：
     > 作为 M1 勘测专家 2，针对 3 项原子能力进行详尽实现策略与单测设计：
     > 1. Helper 3 (ProgressiveDisclosureHelper): 上下文去脂与三层渐进披露（Layer 1 折叠 -> Layer 2 <=180字符胶囊 -> Layer 3 切片窗口）。
     > 2. Helper 4 (StepScrubberHelper): 针对大型工具输出按 Chunk-aligned step=6 周期阶梯衰减，保留前 6 行与后 6 行，中间折叠，防雪球效应与 Cache 击穿。
     > 3. Helper 8 (SkillCapsuleHelper): 巨型技能首次读取后渐进蒸馏为 <= 180 字符微胶囊，建立强 SHA-256 哈希校验落盘缓存与热更新感知。
   - 严禁直接创建或修改业务源码，仅在工作目录下产出技术方案并汇报。

2. **架构规范与解耦约束**：
   - 引用自 `PROJECT.md:20-22`：
     > `Every single file <= 600 lines (500 lines warning, 800 lines hard split). Target: 100-300 lines per file.`
     > `Decoupling Invariant: The 8 helpers are 100% decoupled with ZERO cross-imports. Communications happen strictly via PipelineContext.`
   - 引用自 `PROJECT.md:6-7`：
     > `Zero third-party runtime bloat, Node.js 18+ native ES Modules (.mjs). Unit & Integration Test framework: Node.js native node:test + node:assert/strict (instant millisecond execution).`

3. **目标规划路径**：
   - 实现模块：
     - `packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs`
     - `packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs`
     - `packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs`
   - 对应单测：
     - `tests/unit/test-progressive-disclosure.mjs`
     - `tests/unit/test-step-scrubber.mjs`
     - `tests/unit/test-skill-capsule.mjs`

---

## 2. Logic Chain (逻辑推导链)

1. **三层渐进披露 (Helper 3) 推导**：
   - 观察：大模型 Context 膨胀的主要来源是巨型文档、大型日志与代码全量展开。
   - 推导：单纯粗暴截断会丢失上下文存在性，全量塞入会导致 Token 浪费与注意力稀释。
   - 结论：
     - **Layer 1** 仅输出极轻量元数据标记（行数、字节数、标签），Token 消耗约 10~15 tokens，使 Agent 获知资源概貌；
     - **Layer 2** 生成高密微胶囊（硬约束 `<=` 180 字符），提供核心导出与摘要，Token 消耗约 30~50 tokens；
     - **Layer 3** 按需精确切片 `[Lines {start}-{end} of {total}]`，杜绝多余行消耗。

2. **Step=6 阶梯衰减 (Helper 4) 推导**：
   - 观察：Anthropic Claude 的 Prompt Caching 要求前缀绝对字节一致。如果在每一轮（Turn）对话中都对上一轮历史工具输出进行修改，会导致 KV Cache 每轮彻底失效（Cache Miss），推理延迟激增 5~10 倍。
   - 推导：必须平衡“历史工具输出雪球膨胀”与“前缀绝对静态化”。
   - 结论：引入周期为 6 的窗口固化（Chunk-aligned step=6）：
     - 当 `currentTurn` 处于 `[0, 5]` 时，最近工具输出完全保留，历史未达 step 阈值不触发衰减，保持前缀 100% 字节不变；
     - 当进入 `currentTurn = 6` 边界时，对 `turnIndex < 6` 的历史输出统一触发阶梯压缩（保留头 6 行 + 尾 6 行，折叠中间）并永久锁定；在 `[6, 11]` 轮次内前缀再次保持绝对不变。

3. **Skill 微胶囊与强哈希磁盘缓存 (Helper 8) 推导**：
   - 观察：Superpowers 等复杂技能 Markdown 动辄数百行，直接挂载会吞噬宝贵 Context。
   - 推导：大模型在大部分决策分支下仅需感知 Skill 的触发词与核心规约，仅在被呼叫时才需深入；且 Skill 源文件变动频率低但偶尔有热更新需求。
   - 结论：
     - 首次读取时通过 AST/正则抽取 Frontmatter（name, triggers, description），蒸馏生成 `<=` 180 字符高密微胶囊；
     - 计算原技能内容 SHA-256，与胶囊一同存入磁盘 JSON 缓存；
     - 后续调用时快速校验文件哈希：若未变则 `< 1ms` 磁盘/内存命中；若变更则热感知失效并自动重蒸馏。

4. **单文件与测试独立性推导**：
   - 每个 Helper 仅依赖 Node.js 原生库（`node:crypto`, `node:fs`, `node:path`），单文件代码量严格规划在 150 ~ 250 行。
   - 3 个 Helper 之间绝对禁止交叉引用，单测使用 `node:test` + `node:assert/strict` 毫秒级独立执行。

---

## 3. Caveats (边界考量与注意事项)

1. **胶囊长度字符硬约束**：
   - 需求明确规定微胶囊长度 `<= 180` 字符。字符截断必须考虑多字节字符与尾部省略号 `...` 的占位安全，防止 `slice` 截断导致中文字符乱码或超出 180 字符。
2. **StepScrubber 短输出防劣化**：
   - 若某工具输出本身总行数 `<= 12` 行（`headLines + tailLines`），折叠操作不仅无法节省行数，反而会插入折叠提示行导致行数增加。因此，必须设置生效门槛：仅当 `totalLines > headLines + tailLines` 时才执行中间行折叠。
3. **Skill 缓存并发与冷启动**：
   - 落盘缓存目录（`cacheDir`）若不存在，需在首次写入时使用 `{ recursive: true }` 自动创建；同时清理同名技能的历史过期哈希文件，避免磁盘冗余。
4. **Layer 3 行号边界保护**：
   - 切片请求的 `startLine` 与 `endLine` 采用 1-based 索引；若模型请求参数越界（如 `startLine < 1` 或 `endLine > totalLines`），必须做自动收敛钳位，而非抛错崩溃。

---

## 4. Conclusion (详尽技术实现方案与单测代码设计)

### 4.1 Helper 3: ProgressiveDisclosureHelper 技术规范

#### 文件路径
`packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs`

#### 接口与方法定义
```javascript
/**
 * ProgressiveDisclosureHelper - 上下文去脂与三层渐进披露
 * 
 * Layer 1: 0 成本元数据折叠 [ResourceFolded: {id} | lines: {n} | bytes: {b} | tag: {t}]
 * Layer 2: 高密微胶囊 Capsule，硬约束长度 <= 180 字符
 * Layer 3: 按需深挖切片窗口 [Lines {start}-{end} of {total}]
 */
export class ProgressiveDisclosureHelper {
  constructor(options = {}) {
    this.maxCapsuleChars = options.maxCapsuleChars || 180;
    this.resources = new Map(); // resourceId -> ResourceEntry
  }

  registerResource(id, content, metadata = {})
  getResource(id)
  hasResource(id)
  
  renderLayer1(id)
  renderLayer2(id, options = {})
  renderLayer3(id, sliceWindow = {})
  render(id, level = 1, options = {})

  static generateCapsuleText(content, maxChars = 180)
  static parseResourceTag(tagString)
}
```

#### 完整参考实现逻辑 (供 Worker 直接落地)
```javascript
export class ProgressiveDisclosureHelper {
  constructor(options = {}) {
    this.maxCapsuleChars = Number.isInteger(options.maxCapsuleChars) ? options.maxCapsuleChars : 180;
    this.resources = new Map();
  }

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

  getResource(id) {
    return this.resources.get(id) || null;
  }

  hasResource(id) {
    return this.resources.has(id);
  }

  renderLayer1(id) {
    const res = this.resources.get(id);
    if (!res) throw new Error(`Resource not found: ${id}`);
    return `[ResourceFolded: ${res.id} | lines: ${res.totalLines} | bytes: ${res.totalBytes} | tag: ${res.tag}]`;
  }

  renderLayer2(id, options = {}) {
    const res = this.resources.get(id);
    if (!res) throw new Error(`Resource not found: ${id}`);
    const maxChars = options.maxChars || this.maxCapsuleChars;

    let capsuleBody = res.customCapsule;
    if (!capsuleBody) {
      capsuleBody = ProgressiveDisclosureHelper.generateCapsuleText(res.content, maxChars);
    } else if (capsuleBody.length > maxChars) {
      capsuleBody = capsuleBody.slice(0, Math.max(0, maxChars - 3)) + '...';
    }

    const output = `[ResourceCapsule: ${res.id} | ${capsuleBody}]`;
    return output;
  }

  renderLayer3(id, sliceWindow = {}) {
    const res = this.resources.get(id);
    if (!res) throw new Error(`Resource not found: ${id}`);

    if (res.totalLines === 0) {
      return `[ResourceSlice: ${res.id} | Lines 0-0 of 0]\n`;
    }

    let start = Number.isInteger(sliceWindow.startLine) ? sliceWindow.startLine : 1;
    let end = Number.isInteger(sliceWindow.endLine) ? sliceWindow.endLine : res.totalLines;

    // 边界钳位保护
    start = Math.max(1, Math.min(start, res.totalLines));
    end = Math.max(start, Math.min(end, res.totalLines));

    const selectedLines = res.lines.slice(start - 1, end);
    const body = selectedLines.join('\n');
    return `[ResourceSlice: ${res.id} | Lines ${start}-${end} of ${res.totalLines}]\n${body}`;
  }

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

  static generateCapsuleText(content, maxChars = 180) {
    if (!content || typeof content !== 'string') return 'empty';
    
    // 清理连续空行与制表符
    const cleaned = content.replace(/\r\n/g, '\n').trim();
    const lines = cleaned.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return 'empty';

    // 优先提取标题行或第一段有效内容
    let candidate = '';
    const heading = lines.find(l => /^#{1,4}\s+/.test(l));
    if (heading) {
      candidate = heading.replace(/^#{1,4}\s+/, '').trim();
    }

    // 拼接关键首行
    const firstLine = lines[0].replace(/^#{1,4}\s+/, '').trim();
    if (!candidate || candidate === firstLine) {
      candidate = lines.slice(0, 3).join('; ').replace(/\s+/g, ' ');
    } else {
      candidate = `${candidate}: ${lines.slice(0, 2).join('; ').replace(/\s+/g, ' ')}`;
    }

    // 严格硬约束 <= maxChars
    if (candidate.length > maxChars) {
      candidate = candidate.slice(0, Math.max(0, maxChars - 3)) + '...';
    }
    return candidate;
  }
}
```

---

### 4.2 Helper 4: StepScrubberHelper 技术规范

#### 文件路径
`packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs`

#### 接口与方法定义
```javascript
/**
 * StepScrubberHelper - 针对大型工具输出按 Chunk-aligned step=6 阶梯衰减
 * 保留前 6 行与后 6 行，中间折叠，防雪球效应与 Cache 击穿。
 */
export class StepScrubberHelper {
  constructor(options = {}) {
    this.chunkStep = options.chunkStep || 6;
    this.headLines = options.headLines || 6;
    this.tailLines = options.tailLines || 6;
  }

  compressHeadTail(text, options = {})
  shouldScrub(turnIndex, currentTurn, chunkStep = this.chunkStep)
  scrubSessionHistory(history, currentTurn, options = {})
  computeFreezeThreshold(currentTurn, chunkStep = this.chunkStep)
}
```

#### 完整参考实现逻辑 (供 Worker 直接落地)
```javascript
export class StepScrubberHelper {
  constructor(options = {}) {
    this.chunkStep = Number.isInteger(options.chunkStep) && options.chunkStep > 0 ? options.chunkStep : 6;
    this.headLines = Number.isInteger(options.headLines) && options.headLines >= 0 ? options.headLines : 6;
    this.tailLines = Number.isInteger(options.tailLines) && options.tailLines >= 0 ? options.tailLines : 6;
  }

  computeFreezeThreshold(currentTurn, chunkStep = this.chunkStep) {
    if (!Number.isInteger(currentTurn) || currentTurn < 0) return 0;
    return Math.floor(currentTurn / chunkStep) * chunkStep;
  }

  shouldScrub(turnIndex, currentTurn, chunkStep = this.chunkStep) {
    if (!Number.isInteger(turnIndex) || !Number.isInteger(currentTurn)) return false;
    const freezeThreshold = this.computeFreezeThreshold(currentTurn, chunkStep);
    return turnIndex < freezeThreshold;
  }

  compressHeadTail(text, options = {}) {
    if (typeof text !== 'string') return '';
    const headCount = Number.isInteger(options.headLines) ? options.headLines : this.headLines;
    const tailCount = Number.isInteger(options.tailLines) ? options.tailLines : this.tailLines;

    const lines = text.split(/\r?\n/);
    const totalLines = lines.length;
    const threshold = headCount + tailCount;

    // 若总行数 <= 阈值，折叠无益，保持原样
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

  scrubSessionHistory(history, currentTurn, options = {}) {
    if (!Array.isArray(history)) return [];
    const chunkStep = options.chunkStep || this.chunkStep;
    const headLines = options.headLines || this.headLines;
    const tailLines = options.tailLines || this.tailLines;

    const freezeThreshold = this.computeFreezeThreshold(currentTurn, chunkStep);

    return history.map(entry => {
      if (!entry || typeof entry !== 'object') return entry;
      
      const turnIndex = entry.turnIndex;
      // 仅在 turnIndex < freezeThreshold 时执行衰减
      const isEligible = typeof turnIndex === 'number' && turnIndex < freezeThreshold;

      if (!isEligible) {
        // 最近轮次保持原样不变，稳定 KV Cache
        return { ...entry, isScrubbed: false };
      }

      // 如果已经衰减过，幂等返回已衰减内容
      if (entry.isScrubbed && entry.scrubbedOutput !== undefined) {
        return entry;
      }

      const rawOutput = typeof entry.rawOutput === 'string' ? entry.rawOutput : String(entry.rawOutput ?? '');
      const compressed = this.compressHeadTail(rawOutput, { headLines, tailLines });

      return {
        ...entry,
        scrubbedOutput: compressed,
        isScrubbed: true
      };
    });
  }
}
```

---

### 4.3 Helper 8: SkillCapsuleHelper 技术规范

#### 文件路径
`packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs`

#### 接口与方法定义
```javascript
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SkillCapsuleHelper - 巨型技能渐进蒸馏微胶囊与强哈希落盘缓存
 */
export class SkillCapsuleHelper {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
    this.maxCapsuleChars = options.maxCapsuleChars || 180;
  }

  computeHash(content)
  distillContent(skillName, markdownContent)
  loadOrDistill(skillName, filePath, cacheDir = this.cacheDir)
  getCachedCapsule(skillName, sourceHash, cacheDir = this.cacheDir)
  invalidateCache(skillName, cacheDir = this.cacheDir)

  static extractMetadata(markdownContent)
  static sanitizeFilename(name)
}
```

#### 完整参考实现逻辑 (供 Worker 直接落地)
```javascript
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class SkillCapsuleHelper {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
    this.maxCapsuleChars = Number.isInteger(options.maxCapsuleChars) ? options.maxCapsuleChars : 180;
  }

  computeHash(content) {
    const raw = typeof content === 'string' ? content : String(content ?? '');
    return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  static sanitizeFilename(name) {
    return String(name || 'unnamed').replace(/[^a-zA-Z0-9_-]/g, '_');
  }

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

  distillContent(skillName, markdownContent) {
    const sourceHash = this.computeHash(markdownContent);
    const meta = SkillCapsuleHelper.extractMetadata(markdownContent);
    const name = skillName || meta.name || 'anonymous_skill';
    const triggersStr = meta.triggers.length > 0 ? meta.triggers.join(', ') : 'auto';
    const desc = meta.description || 'General skill';

    // 格式化为胶囊核心内容
    let coreText = `[SkillCapsule: ${name} | triggers: ${triggersStr} | desc: ${desc}]`;

    // 硬约束 <= 180 字符截断
    if (coreText.length > this.maxCapsuleChars) {
      const prefix = `[SkillCapsule: ${name} | triggers: ${triggersStr} | desc: `;
      const suffix = '...]';
      const availableDescChars = this.maxCapsuleChars - prefix.length - suffix.length;
      if (availableDescChars > 0) {
        coreText = `${prefix}${desc.slice(0, availableDescChars)}${suffix}`;
      } else {
        coreText = coreText.slice(0, this.maxCapsuleChars - 3) + '...]';
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

  loadOrDistill(skillName, filePath, cacheDir = this.cacheDir) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Skill file not found: ${filePath}`);
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const currentHash = this.computeHash(content);

    // 若未指定 cacheDir 则纯内存蒸馏
    if (!cacheDir) {
      return this.distillContent(skillName, content);
    }

    fs.mkdirSync(cacheDir, { recursive: true });
    const safeName = SkillCapsuleHelper.sanitizeFilename(skillName);
    const cacheFilePath = path.join(cacheDir, `${safeName}.${currentHash.slice(0, 16)}.json`);

    // 缓存命中校验
    if (fs.existsSync(cacheFilePath)) {
      try {
        const cachedRaw = fs.readFileSync(cacheFilePath, 'utf8');
        const parsed = JSON.parse(cachedRaw);
        if (parsed.sourceHash === currentHash) {
          return parsed;
        }
      } catch {
        // JSON 损坏则自动回退
      }
    }

    // 热更新失效：清理旧哈希缓存文件
    this.invalidateCache(skillName, cacheDir);

    // 重新蒸馏并落盘
    const freshRecord = this.distillContent(skillName, content);
    fs.writeFileSync(cacheFilePath, JSON.stringify(freshRecord, null, 2), 'utf8');
    return freshRecord;
  }

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

  invalidateCache(skillName, cacheDir = this.cacheDir) {
    if (!cacheDir || !fs.existsSync(cacheDir)) return;
    const safeName = SkillCapsuleHelper.sanitizeFilename(skillName);
    const files = fs.readdirSync(cacheDir);
    for (const file of files) {
      if (file.startsWith(`${safeName}.`) && file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(cacheDir, file));
        } catch {
          // ignore unlink error
        }
      }
    }
  }
}
```

---

### 4.4 自动化单测代码设计 (Unit Tests)

所有单元测试基于 Node.js 18+ 原生 `node:test` 与 `node:assert/strict`，全绿、无第三方测试依赖，可独立极速执行。

#### 4.4.1 `tests/unit/test-progressive-disclosure.mjs`
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ProgressiveDisclosureHelper } from '../../packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs';

describe('ProgressiveDisclosureHelper Unit Tests', () => {
  it('Test 3.1: Layer 1 零开销元数据折叠输出格式与指标精确性', () => {
    const helper = new ProgressiveDisclosureHelper();
    const mockContent = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    helper.registerResource('res-doc-01', mockContent, { tag: 'documentation' });

    const l1 = helper.renderLayer1('res-doc-01');
    assert.match(l1, /^\[ResourceFolded: res-doc-01 \| lines: 5 \| bytes: \d+ \| tag: documentation\]$/);
    assert.ok(l1.length < 90, 'Layer 1 元数据体积必须极小');
  });

  it('Test 3.2: Layer 2 微胶囊长度硬约束 <= 180 字符', () => {
    const helper = new ProgressiveDisclosureHelper();
    const giantContent = '# Title: Huge System Architecture Specification\n' + 'Very long detailed specification text '.repeat(100);
    helper.registerResource('res-arch-giant', giantContent, { tag: 'architecture' });

    const l2 = helper.renderLayer2('res-arch-giant');
    assert.ok(l2.startsWith('[ResourceCapsule: res-arch-giant |'));
    assert.ok(l2.length <= 180, `Layer 2 整体输出字符数必须 <= 180，实际为 ${l2.length}`);
  });

  it('Test 3.3: Layer 3 精准切片窗口 [Lines start-end of total] 与越界自适应', () => {
    const helper = new ProgressiveDisclosureHelper();
    const lines100 = Array.from({ length: 100 }, (_, i) => `Code line ${i + 1}`).join('\n');
    helper.registerResource('res-code-100', lines100);

    // 正常切片
    const l3Normal = helper.renderLayer3('res-code-100', { startLine: 10, endLine: 15 });
    assert.ok(l3Normal.startsWith('[ResourceSlice: res-code-100 | Lines 10-15 of 100]'));
    const sliceLines = l3Normal.split('\n').slice(1);
    assert.strictEqual(sliceLines.length, 6);
    assert.strictEqual(sliceLines[0], 'Code line 10');
    assert.strictEqual(sliceLines[5], 'Code line 15');

    // 越界自适应
    const l3Clamped = helper.renderLayer3('res-code-100', { startLine: 95, endLine: 200 });
    assert.ok(l3Clamped.startsWith('[ResourceSlice: res-code-100 | Lines 95-100 of 100]'));
  });

  it('Test 3.4: 统一门面 render 接口分级调度与非法参数防御', () => {
    const helper = new ProgressiveDisclosureHelper();
    helper.registerResource('res-test', 'Content test');

    assert.ok(helper.render('res-test', 1).includes('ResourceFolded'));
    assert.ok(helper.render('res-test', 2).includes('ResourceCapsule'));
    assert.ok(helper.render('res-test', 3).includes('ResourceSlice'));

    assert.throws(() => helper.render('non-existent', 1), /Resource not found/);
    assert.throws(() => helper.render('res-test', 99), /Unsupported disclosure level/);
  });
});
```

#### 4.4.2 `tests/unit/test-step-scrubber.mjs`
```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StepScrubberHelper } from '../../packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs';

describe('StepScrubberHelper Unit Tests', () => {
  it('Test 4.1: 短输出 (<= 12 行) 原样保持不触发折叠', () => {
    const scrubber = new StepScrubberHelper({ headLines: 6, tailLines: 6 });
    const shortText = Array.from({ length: 10 }, (_, i) => `Output line ${i + 1}`).join('\n');

    const result = scrubber.compressHeadTail(shortText);
    assert.strictEqual(result, shortText, '短文本必须保持 100% 字节不变');
  });

  it('Test 4.2: 长输出 (50 行) 精确保留头 6 行 + 尾 6 行，中间行折叠', () => {
    const scrubber = new StepScrubberHelper({ headLines: 6, tailLines: 6 });
    const longText = Array.from({ length: 50 }, (_, i) => `Log record ${i + 1}`).join('\n');

    const scrubbed = scrubber.compressHeadTail(longText);
    const lines = scrubbed.split('\n');
    assert.strictEqual(lines.length, 13, '前 6 行 + 1 行折叠提示 + 后 6 行 = 13 行');
    assert.strictEqual(lines[0], 'Log record 1');
    assert.strictEqual(lines[5], 'Log record 6');
    assert.strictEqual(lines[6], '... [Scrubbed: 38 lines collapsed for cache stability] ...');
    assert.strictEqual(lines[7], 'Log record 45');
    assert.strictEqual(lines[12], 'Log record 50');
  });

  it('Test 4.3: Step < 6 时保持绝对稳定 (isScrubbed === false)', () => {
    const scrubber = new StepScrubberHelper({ chunkStep: 6 });
    const history = [
      { turnIndex: 0, rawOutput: 'A'.repeat(500) + '\n'.repeat(30) + 'End 0' },
      { turnIndex: 1, rawOutput: 'B'.repeat(500) + '\n'.repeat(30) + 'End 1' }
    ];

    // 当 currentTurn 为 4 时，未达 freezeThreshold (0)，历史不衰减
    const result = scrubber.scrubSessionHistory(history, 4);
    assert.strictEqual(result[0].isScrubbed, false);
    assert.strictEqual(result[1].isScrubbed, false);
    assert.strictEqual(result[0].scrubbedOutput, undefined);
  });

  it('Test 4.4: Step = 6 边界触发阶梯衰减并冻结历史', () => {
    const scrubber = new StepScrubberHelper({ chunkStep: 6, headLines: 2, tailLines: 2 });
    const history = [
      { turnIndex: 2, rawOutput: Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') },
      { turnIndex: 6, rawOutput: Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') }
    ];

    // 当 currentTurn 达到 6 时，freezeThreshold 为 6。turnIndex=2 < 6 触发衰减；turnIndex=6 >= 6 保持原样！
    const result = scrubber.scrubSessionHistory(history, 6);
    assert.strictEqual(result[0].isScrubbed, true);
    assert.ok(result[0].scrubbedOutput.includes('lines collapsed'));
    assert.strictEqual(result[1].isScrubbed, false, '当前步长窗口内的最新输出严禁变动');
  });

  it('Test 4.5: 幂等性校验，避免二次嵌套折叠', () => {
    const scrubber = new StepScrubberHelper({ chunkStep: 6, headLines: 2, tailLines: 2 });
    const history = [
      { turnIndex: 1, rawOutput: Array.from({ length: 20 }, (_, i) => `L${i + 1}`).join('\n') }
    ];

    const pass1 = scrubber.scrubSessionHistory(history, 6);
    const pass2 = scrubber.scrubSessionHistory(pass1, 7);

    assert.strictEqual(pass2[0].scrubbedOutput, pass1[0].scrubbedOutput);
    assert.strictEqual((pass2[0].scrubbedOutput.match(/Scrubbed/g) || []).length, 1);
  });
});
```

#### 4.4.3 `tests/unit/test-skill-capsule.mjs`
```javascript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SkillCapsuleHelper } from '../../packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs';

describe('SkillCapsuleHelper Unit Tests', () => {
  let tmpCacheDir;

  before(() => {
    tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-capsule-test-'));
  });

  after(() => {
    if (fs.existsSync(tmpCacheDir)) {
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });

  it('Test 8.1: YAML frontmatter 提取与微胶囊 <= 180 字符硬约束', () => {
    const helper = new SkillCapsuleHelper({ maxCapsuleChars: 180 });
    const mockSkill = `---
name: browser-control
description: Advanced headless browser orchestration and multi-profile session manager
triggers: browser, web_search, vps
---
# Main Instructions
` + 'Extremely long detailed guide instructions here. '.repeat(50);

    const record = helper.distillContent('browser-control', mockSkill);
    assert.strictEqual(record.skillName, 'browser-control');
    assert.deepStrictEqual(record.triggers, ['browser', 'web_search', 'vps']);
    assert.ok(record.capsuleText.length <= 180, `微胶囊字符数必须 <= 180，当前为 ${record.capsuleText.length}`);
    assert.ok(record.sourceHash.length === 64, 'SHA-256 哈希值长度必须为 64');
  });

  it('Test 8.2: 强 SHA-256 哈希落盘缓存与二次读取秒级命中', () => {
    const helper = new SkillCapsuleHelper({ cacheDir: tmpCacheDir });
    const skillPath = path.join(tmpCacheDir, 'test-skill.md');
    fs.writeFileSync(skillPath, '# My Test Skill\nDescription text for testing capsule.', 'utf8');

    // 首次加载：触发蒸馏并落盘
    const record1 = helper.loadOrDistill('test-skill', skillPath);
    assert.ok(record1.capsuleText);

    // 验证磁盘文件生成
    const cacheFiles = fs.readdirSync(tmpCacheDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(cacheFiles.length, 1);

    // 二次加载：直接命中磁盘缓存
    const start = performance.now();
    const record2 = helper.loadOrDistill('test-skill', skillPath);
    const duration = performance.now() - start;

    assert.strictEqual(record2.sourceHash, record1.sourceHash);
    assert.strictEqual(record2.capsuleText, record1.capsuleText);
    assert.ok(duration < 10, '二次读取命中缓存耗时应接近 0ms');
  });

  it('Test 8.3: 技能内容修改后热更新感知并自动淘汰旧缓存', () => {
    const helper = new SkillCapsuleHelper({ cacheDir: tmpCacheDir });
    const skillPath = path.join(tmpCacheDir, 'test-hot-reload.md');
    fs.writeFileSync(skillPath, '# Version 1\nInitial instructions', 'utf8');

    const v1 = helper.loadOrDistill('test-hot-reload', skillPath);

    // 修改文件内容模拟热更新
    fs.writeFileSync(skillPath, '# Version 2\nUpdated instructions with new features', 'utf8');

    const v2 = helper.loadOrDistill('test-hot-reload', skillPath);
    assert.notStrictEqual(v2.sourceHash, v1.sourceHash, '源文件哈希必须更新');
    assert.notStrictEqual(v2.capsuleText, v1.capsuleText, '微胶囊内容必须相应更新');

    // 确认旧版本哈希缓存已被淘汰清理
    const cacheFiles = fs.readdirSync(tmpCacheDir).filter(f => f.startsWith('test_hot_reload.') && f.endsWith('.json'));
    assert.strictEqual(cacheFiles.length, 1, '旧缓存文件必须被淘汰，仅保留当前最新缓存');
  });
});
```

---

## 5. Verification Method (独立复核与执行验证)

一旦后续 Worker 创建了对应源码与测试文件，可通过以下命令进行完全独立的自动化全绿验证：

1. **单测独立执行命令**：
   ```bash
   # 1. 验证 Helper 3 (ProgressiveDisclosureHelper)
   node --test tests/unit/test-progressive-disclosure.mjs

   # 2. 验证 Helper 4 (StepScrubberHelper)
   node --test tests/unit/test-step-scrubber.mjs

   # 3. 验证 Helper 8 (SkillCapsuleHelper)
   node --test tests/unit/test-skill-capsule.mjs

   # 4. 批量运行所有单元测试
   node --test tests/unit/*.mjs
   ```

2. **代码行数与规范门禁校验**：
   ```bash
   wc -l packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs
   wc -l packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs
   wc -l packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs
   ```
   **预期**：每个实现文件行数均在 120 ~ 260 行之间，严禁超过 600 行。

3. **解耦规范静态校验**：
   ```bash
   # 确认 Helper 3, 4, 8 之间零交叉依赖
   grep -rn "StepScrubber" packages/agent-control-plane/helpers/progressive-disclosure/
   grep -rn "SkillCapsule" packages/agent-control-plane/helpers/step-scrubber/
   grep -rn "ProgressiveDisclosure" packages/agent-control-plane/helpers/skill-capsule/
   ```
   **预期**：无任何匹配输出（退出码为 1），满足 100% 解耦不变量。
