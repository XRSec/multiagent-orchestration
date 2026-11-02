# Handoff Report: 8 项核心原子能力技术规范与解耦设计 (Explorer 2)

## 1. Observation

通过直接勘测当前仓库配置、现有架构实现及需求文档，确认以下事实：

1. **需求基准**：
   - 引用自 `ORIGINAL_REQUEST.md:12-23`：
     > "必须将 8 项核心能力完全拆开独立设计与实现，模块解耦，绝不拼成 1 个大杂烩或所谓的 3 个：能力 1（意图预检）、能力 2（Prompt Cache 保护）、能力 3（上下文去脂与三层渐进披露）、能力 4（历史工具输出阶梯衰减）、能力 5（Prompt 提炼 + 缓存）、能力 6（Tools 提炼 + 缓存）、能力 7（MCP 提炼 + 缓存）、能力 8（Skill 提炼 + 缓存）。"
   - 引用自 `ORIGINAL_REQUEST.md:36-47`：
     > 每个原子能力模块均必须具备独立、可全绿运行的自动化单元测试用例。

2. **代码规范与工程基线**：
   - 引用自 `AGENTS.md:13-14`：
     > `代码行数规范: - [SCRIPT_STANDARDS](./docs/dev-rules/script-standards.md) (单文件 <= 600 行，500 行预警，800 行硬拆分)`。
   - 引用自 `AGENTS.md:17-19`：
     > `Runtime Engine Hierarchy: Primary Driver (Electron Main): @anthropic-ai/claude-agent-sdk`。
   - 现有 `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs:111-137` 目前仅配置了简易的 `PreToolUse` / `PostToolUse` 钩子，尚未挂载控制平面 8 项辅助能力管道。

---

## 2. Logic Chain

基于上述事实与目标，推导出 8 项核心原子能力的解耦设计原则与架构落地推导链：

1. **解耦原则 (Decoupling Invariant)**：
   - 8 项能力严禁设计成一个包含全局 state 的上帝类或混淆成 3 个粗粒度模块。
   - 每个能力作为一个独立且自包含的纯模块（Class 或纯函数闭包），拥有独立的生命周期输入/输出契约（Contract），彼此之间通过显式数据结构传递，杜绝隐式上下文穿透与相互依赖。
2. **性能与缓存对齐原则 (Cache & Latency Invariant)**：
   - 大模型调用最核心的延迟与成本瓶颈在于 KV Cache 失效。
   - 能力 2（KV Cache Locking）、能力 4（Step=6 阶梯衰减）、能力 5（确定性前缀缓存）、能力 6（静态 Schema 编译缓存）共同服务于**前缀绝对稳定性**与**Cache 命中率锁定（95%+）**。
3. **单文件与测试完备性**：
   - 每个模块代码量控制在 120 ~ 280 行，远低于 500 行预警线和 600 行硬限制。
   - 每个能力配套独立针对性的自动化单测文件，覆盖顺延词直通、<=180 字符胶囊硬约束、Step=6 边界衰减、哈希碰撞与缓存击穿等极端边界用例。

---

## 3. 8 项核心原子能力详细技术规格与模块设计

### 3.1 能力 1：意图预检 (Pre-flight Intent Analysis & Routing)

#### 3.1.1 模块定位与职责
在 Agent Turn 启动前执行毫秒级（纯内存/正则/词法）意图预检。识别当前 Turn 的执行类型，计算最小必要能力与工具集合；对于常见的顺延词（"ok", "继续", "好", "yes" 等），提供 0ms 旁路直通逻辑，直接继承上一轮能力配置。

#### 3.1.2 接口签名与数据结构
```typescript
export type IntentType = 
  | 'BYPASS_CONTINUATION'  // 顺延词直通
  | 'READ_EXPLORE'         // 只读探索分析
  | 'CODE_MUTATION'        // 代码编写与变更
  | 'TERMINAL_EXEC'        // 命令执行
  | 'ORCHESTRATION'        // 调度与协作
  | 'GENERAL_QUERY';       // 普通问答

export type CapabilityType = 
  | 'FILE_READ' 
  | 'FILE_WRITE' 
  | 'COMMAND_RUN' 
  | 'MCP_GATEWAY' 
  | 'SKILL_LOAD';

export interface TurnContextSnapshot {
  lastIntentType?: IntentType;
  lastCapabilities?: Set<CapabilityType>;
  lastAllowedTools?: string[];
  turnIndex: number;
}

export interface IntentAnalysisResult {
  isBypass: boolean;
  intentType: IntentType;
  requiredCapabilities: Set<CapabilityType>;
  suggestedTools: string[];
  latencyMs: number;
  matchedKeywords?: string[];
}

export interface IIntentAnalyzer {
  analyze(input: string, prevContext?: TurnContextSnapshot): IntentAnalysisResult;
  isContinuationPhrase(input: string): boolean;
}
```

#### 3.1.3 核心实现机制
- **顺延词精准识别表**：
  `['ok', 'okay', '继续', '好', '好的', 'yes', 'y', 'proceed', 'go on', '1', '收到', '确认', 'next', 'continue', '行']`。
- **直通分支**：若输入去除首尾标点后完全匹配顺延词：
  - `isBypass = true`
  - `intentType = 'BYPASS_CONTINUATION'`
  - 继承 `prevContext.lastCapabilities`，执行耗时 `< 0.2ms`。
- **常规意图词法分类器**：
  - 包含 "search", "grep", "find", "查看", "分析" -> 激活 `FILE_READ`。
  - 包含 "edit", "write", "修改", "重构", "创建" -> 激活 `FILE_WRITE`。
  - 包含 "pnpm", "node", "test", "运行", "编译" -> 激活 `COMMAND_RUN`。

#### 3.1.4 单测用例与断言清单
- **Test 1.1 (顺延词 0ms 旁路直通)**：
  - 输入：`"好"`, `"继续"`, `"ok"`, `" proceed "`。
  - 断言：`result.isBypass === true`, `result.latencyMs < 1.0`, `result.intentType === 'BYPASS_CONTINUATION'`, 能力集完整继承自上一轮快照。
- **Test 1.2 (非顺延词混合输入拦截)**：
  - 输入：`"好的，帮我把 index.mjs 删除了"`。
  - 断言：`result.isBypass === false`, 判定为 `CODE_MUTATION`，激活 `FILE_WRITE`。
- **Test 1.3 (只读能力最小集收敛)**：
  - 输入：`"查看下当前目录结构和 package.json"`。
  - 断言：`result.requiredCapabilities` 仅包含 `FILE_READ`，`suggestedTools` 仅包含 `view_file`, `list_dir`，严格排除写工具。

---

### 3.2 能力 2：Prompt Cache 保护 (KV Cache Locking)

#### 3.2.1 模块定位与职责
保证云端大模型 KV Cache 命中率 `>= 95%`。强制实施 System Prompt 绝对静态化规范，变动指令严格采用尾部注入规范（Tail Injection），消除任何引起静态前缀抖动的因素。

#### 3.2.2 接口签名与数据结构
```typescript
export interface StaticPromptSegment {
  id: string;
  priority: number;
  content: string;
}

export interface TailInjectionPayload {
  timestampIso?: string;
  steeringDirectives?: string[];
  activeSessionId?: string;
  turnEphemeralState?: Record<string, unknown>;
}

export interface AssembledPromptBundle {
  staticPrefix: string;
  staticHash: string;
  tailInjection: string;
  fullPrompt: string;
  cacheControlBreakpointIndex: number;
}

export interface IKVCacheLocker {
  assembleStaticPrefix(segments: StaticPromptSegment[]): { staticPrefix: string; staticHash: string };
  injectTail(staticPrefix: string, payload: TailInjectionPayload): AssembledPromptBundle;
  verifyCacheInvariance(bundleA: AssembledPromptBundle, bundleB: AssembledPromptBundle): boolean;
}
```

#### 3.2.3 核心实现机制
- **静态段确定性排序**：按 `priority` 升序或字典序稳定排序并拼接静态片段（Axioms, Harness, Base Soul, Tools Schema），计算 SHA-256 哈希 `staticHash`。
- **尾部注入隔离区 (Tail Injection Fence)**：
  - 动态变更内容统一格式化为 `\n\n=== [EPHEMERAL_TAIL_CONTEXT] ===\n...` 附加在 Prompt 终点。
  - 严禁在静态前缀中间插值变量。
- **Cache Invariance 校验**：任意多轮对话中，断言 `bundleA.staticHash === bundleB.staticHash` 且 `bundleB.fullPrompt.startsWith(bundleA.staticPrefix)`。

#### 3.2.4 单测用例与断言清单
- **Test 2.1 (静态前缀确定性哈希)**：
  - 无论何时重组包含相同内容与优先级的静态段，哈希值绝对一致。
- **Test 2.2 (尾部注入保持前缀不变)**：
  - 注入不同的 timestamp 和 steeringDirectives，断言 `bundle.fullPrompt.startsWith(bundle.staticPrefix) === true`。
- **Test 2.3 (前缀污染拦截)**：
  - 在静态段中非法插入动态时间戳，触发校验告警或静态哈希变化检测。

---

### 3.3 能力 3：上下文去脂与三层渐进披露 (3-Tier Progressive Disclosure)

#### 3.3.1 模块定位与职责
解决超大文档、Memory 与历史文件导致 Context 暴增的问题。将资源分为三层披露：Layer 1（0成本元数据折叠） -> Layer 2（≤180 字符微胶囊 Capsule） -> Layer 3（按需深挖切片）。

#### 3.3.2 接口签名与数据结构
```typescript
export type DisclosureLevel = 1 | 2 | 3;

export interface ResourceDescriptor {
  resourceId: string;
  sourcePath?: string;
  totalBytes: number;
  totalLines: number;
  rawContentHash: string;
  tag: string;
}

export interface SliceWindow {
  startLine: number;
  endLine: number;
}

export interface RenderedResource {
  resourceId: string;
  level: DisclosureLevel;
  renderedText: string;
  approxTokens: number;
}

export interface IProgressiveDisclosureManager {
  register(descriptor: ResourceDescriptor, fullContent: string): void;
  renderLevel1(resourceId: string): RenderedResource;
  renderLevel2(resourceId: string, maxChars?: number): RenderedResource;
  renderLevel3(resourceId: string, slice?: SliceWindow): RenderedResource;
  setResourceLevel(resourceId: string, level: DisclosureLevel): void;
}
```

#### 3.3.3 核心实现机制
- **Layer 1 (Folded Metadata)**：
  - 输出格式：`[ResourceFolded: {resourceId} | lines: {totalLines} | bytes: {totalBytes} | tag: {tag}]`。Token 消耗仅约 10~15 tokens。
- **Layer 2 (Micro-Capsule)**：
  - 提取首部概括、关键词、核心函数/接口，生成极简胶囊摘要。
  - **硬约束**：`capsuleText.length <= 180` 字符。
  - 输出格式：`[ResourceCapsule: {resourceId} | {capsuleText}]`。Token 消耗约 30~50 tokens。
- **Layer 3 (On-Demand Slice)**：
  - 仅按需返回 `[startLine, endLine]` 区间内容，超出区间予以截断，并标注 `[Lines {startLine}-{endLine} of {totalLines}]`。

#### 3.3.4 单测用例与断言清单
- **Test 3.1 (Layer 1 零开销元数据)**：
  - 注册 10,000 行大文件，Layer 1 渲染文本行数 `<= 1`，字符数 `<= 80`。
- **Test 3.2 (Layer 2 微胶囊长度硬约束)**：
  - 对 50KB 源码生成 Layer 2 胶囊，断言 `capsule.renderedText.length <= 180`。
- **Test 3.3 (Layer 3 精准切片窗口)**：
  - 请求切片 `startLine: 10, endLine: 20`，断言返回恰好 11 行内容，包含切片元标识。

---

### 3.4 能力 4：历史工具输出阶梯衰减 (Step-based Tool Output Scrubbing)

#### 3.4.1 模块定位与职责
防止多轮交互中大型工具输出产生雪球效应，同时**杜绝每轮微调历史输出导致 KV Cache 每轮被彻底击穿**。采用基于固定步长（Chunk-aligned step = 6）的周期衰减策略。

#### 3.4.2 接口签名与数据结构
```typescript
export interface ToolHistoryEntry {
  turnIndex: number;
  toolCallId: string;
  toolName: string;
  rawInput: Record<string, unknown>;
  rawOutput: string;
  scrubbedOutput?: string;
  isScrubbed: boolean;
}

export interface IToolOutputScrubber {
  scrubSessionHistory(history: ToolHistoryEntry[], currentTurn: number, chunkStep?: number): ToolHistoryEntry[];
  compressHeadTail(text: string, headLines?: number, tailLines?: number): string;
}
```

#### 3.4.3 核心实现机制
- **Chunk-aligned 步长窗口计算**：
  - 设 `chunkStep = 6`。当前 Turn 为 `T`。
  - 固化窗口阈值：`freezeThreshold = Math.floor(T / chunkStep) * chunkStep`。
  - 对于 `turnIndex < freezeThreshold` 的历史工具输出，统一执行衰减压缩并永久锁定（不再重复变动）。
  - 对于 `turnIndex >= freezeThreshold` 的最近输出，**完全保持原样不变**，保证近 6 轮交互内前置历史前缀 100% 字节不变，持续命中 KV Cache！
- **头尾保留压缩算法**：
  - 保留前 6 行（包含退出码、命令回显、开头结果）与后 6 行（错误总结、完成状态），中间行折叠为：`\n... [Scrubbed: {skippedLines} lines collapsed for cache stability] ...\n`。

#### 3.4.4 单测用例与断言清单
- **Test 4.1 (Step < 6 时保持绝对稳定)**：
  - 当前 Turn 为 1 到 5 时，历史工具输出未被衰减（`isScrubbed === false`），输出字节完全不变。
- **Test 4.2 (Step = 6 边界触发阶梯衰减)**：
  - 当 Turn 达到 6 时，Turn 0~5 的历史工具输出统一触发衰减，大文本体积减少 80%+。
- **Test 4.3 (头尾信息保真性)**：
  - 断言压缩后仍完整保留第一行与最后一行关键信息。

---

### 3.5 能力 5：Prompt 提炼 + 缓存 (Prompt Distillation & Prefix Cache)

#### 3.5.1 模块定位与职责
剔除用户与系统 Prompt 中的冗余客套指令，实现冷热分离（Cold Static Directives vs Hot Parameters），并基于规范化 SHA-256 维护确定性前缀缓存。

#### 3.5.2 接口签名与数据结构
```typescript
export interface DistilledPromptResult {
  coldPrefix: string;
  hotParameters: string;
  distilledCombined: string;
  prefixHash: string;
  tokensSavedEstimate: number;
}

export interface IPromptDistiller {
  distill(prompt: string): DistilledPromptResult;
  stripCourtesy(text: string): string;
  separateColdAndHot(text: string): { cold: string; hot: string };
}
```

#### 3.5.3 核心实现机制
- **客套词规则过滤库**：
  过滤 `"请问", "麻烦你", "可不可以", "劳驾", "please", "could you kindly", "thank you", "hello"` 等口语填充词。
- **冷热分离启发式抽取**：
  - 冷区 (Cold)：角色定义、任务规约、技术约束、输出格式要求等规则性语句（提取至前缀缓存）。
  - 热区 (Hot)：目标文件名、行号范围、具体提问参数等动态变量。
- **确定性前缀哈希**：对冷区正规化（去多余空白、统一换行）后计算 SHA-256，命中内存 LRU 缓存。

#### 3.5.4 单测用例与断言清单
- **Test 5.1 (客套词精准清洗)**：
  - 输入：`"麻烦你帮我看一下这个文件，如果可以的话请指出其中的错误，非常感谢！"`。
  - 产出精简为核心动宾短语，断言节省字符数 > 30%。
- **Test 5.2 (冷热分离与哈希幂等性)**：
  - 输入两次相同规则但不同参数的指令，断言 `coldPrefix` 完全相同，`prefixHash` 严格一致。

---

### 3.6 能力 6：Tools 提炼 + 缓存 (Tools Schema Slimming & Pre-compiled Cache)

#### 3.6.1 模块定位与职责
精炼工具的 JSON Schema，去除冗长 examples 和无用说明文本；按意图预检结果仅动态暴露最小必要工具集；将精炼后的静态 Schema 哈希预编译为对象缓存。

#### 3.6.2 接口签名与数据结构
```typescript
export interface RawToolSchema {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

export interface CompiledToolSet {
  schemaHash: string;
  tools: RawToolSchema[];
  tokenEstimate: number;
}

export interface IToolsSchemaSlimmer {
  slimSchema(tool: RawToolSchema): RawToolSchema;
  filterByCapabilities(tools: RawToolSchema[], capabilities: Set<string>): RawToolSchema[];
  getOrCompile(tools: RawToolSchema[], capabilities?: Set<string>): CompiledToolSet;
}
```

#### 3.6.3 核心实现机制
- **Schema 瘦身清洗**：
  - 递归清理 `examples`, `title`, `default`, `markdownDescription` 等非核心元数据。
  - 将 `description` 压缩为一行要点描述（截断超长废话）。
- **能力投影过滤**：
  - 若能力集仅有 `FILE_READ`，从全部工具中精准筛选出 `['Read', 'Glob', 'Grep']`，自动过滤掉 `['Edit', 'Write', 'Bash']`。
- **哈希缓存**：以 `tools_hash + capabilities_key` 为键，内存缓存编译产物，避免深拷贝与 JSON 解析开销。

#### 3.6.4 单测用例与断言清单
- **Test 6.1 (Schema 精炼体积缩减)**：
  - 输入含冗余 examples 和 200 字 description 的 Tool，精炼后体积缩减 >= 40%，且 `required` 和 `type` 字段完好保留。
- **Test 6.2 (动态能力最小集过滤)**：
  - 传入全量 8 个工具，限定能力为 `FILE_READ`，断言返回列表仅含只读工具。
- **Test 6.3 (预编译哈希缓存引用命中)**：
  - 连续调用 `getOrCompile`，第二次直接返回相同引用对象（`assert.strictEqual(setA, setB)`）。

---

### 3.7 能力 7：MCP 提炼 + 缓存 (MCP Meta-Tooling & Snapshot Cache)

#### 3.7.1 模块定位与职责
将数十甚至上百个外部 MCP 工具折叠为固定的 2 个高阶元工具（`gateway.list_tools` 与 `gateway.call_tool`），并将全部工具列表在本地生成快照索引与缓存，避免 Context 爆炸并实现 0ms 本地元数据查询。

#### 3.7.2 接口签名与数据结构
```typescript
export interface MCPToolItem {
  serverName: string;
  toolName: string;
  description: string;
  inputSchema: Record<string, any>;
  tags?: string[];
}

export interface MCPSnapshotStore {
  version: string;
  snapshotHash: string;
  tools: Map<string, MCPToolItem>;
}

export interface IMCPMetaToolManager {
  registerServerSnapshot(serverName: string, tools: MCPToolItem[]): string;
  getMetaToolDefinitions(): RawToolSchema[];
  listToolsFromSnapshot(serverName?: string, keyword?: string): MCPToolItem[];
  dispatchMetaCall(serverName: string, toolName: string, args: Record<string, any>): Promise<any>;
}
```

#### 3.7.3 核心实现机制
- **元工具暴露**：仅向大模型注入 2 个工具：
  1. `mcp_gateway_list_tools`: 参数 `{ server?: string, keyword?: string }`。
  2. `mcp_gateway_call_tool`: 参数 `{ server: string, tool: string, arguments: object }`。
- **本地快照与毫秒查询**：
  - 服务端连接建立时，一次性全量缓存各 Server 的工具定义到 `MCPSnapshotStore`。
  - 模型执行 `mcp_gateway_list_tools` 时，直接在本地内存检索，不触发网络 RPC。
- **分发路由**：`mcp_gateway_call_tool` 接收到调用后，在本地快照中校验 Schema 合法性，直接转发给对应的 MCP 真实连接执行。

#### 3.7.4 单测用例与断言清单
- **Test 7.1 (元工具折叠收敛)**：
  - 注册 50 个来自 3 个不同 MCP Server 的工具，调用 `getMetaToolDefinitions()`，返回工具数量恒等于 2。
- **Test 7.2 (本地快照快速检索)**：
  - 查询 keyword 为 `"browser"` 的工具，断言毫秒级返回匹配项，且 Schema 结构完整。
- **Test 7.3 (元工具分发调用)**：
  - 调用 `dispatchMetaCall('driver', 'click', { x: 10, y: 20 })`，成功分发至模拟驱动并返回执行结果。

---

### 3.8 能力 8：Skill 提炼 + 缓存 (Skill Distillation & Capsule Cache)

#### 3.8.1 模块定位与职责
针对大型技能文件（如 500+ 行 markdown），首次读取后自动蒸馏为 `<= 180 字符` 的微胶囊；基于文件 SHA-256 强哈希建立本地磁盘缓存，实现零开销复用与热更新感知。

#### 3.8.2 接口签名与数据结构
```typescript
export interface SkillCapsuleRecord {
  skillName: string;
  sourceHash: string;
  capsuleText: string; // 必须 <= 180 字符
  triggers: string[];
  distilledAtIso: string;
}

export interface ISkillDistiller {
  distill(skillName: string, markdownContent: string): SkillCapsuleRecord;
  loadOrDistill(skillName: string, filePath: string, cacheDir: string): SkillCapsuleRecord;
  verifyHashMatch(sourceContent: string, cachedHash: string): boolean;
}
```

#### 3.8.3 核心实现机制
- **微胶囊蒸馏算法**：
  - 解析 YAML Frontmatter，提取 `name`, `description`, `triggers`。
  - 提取正文首要约束，使用极简句式压缩组合。
  - 校验长度：`if (capsule.length > 180) capsule = capsule.slice(0, 177) + '...'`。
- **强哈希校验与落盘缓存**：
  - 缓存路径：`{cacheDir}/{skillName}.{sha256}.json`。
  - 读取时比对 `sourceHash`：
    - 若匹配：直接从磁盘读取 JSON，耗时 `< 1ms`；
    - 若不匹配（文件被修改）：重新蒸馏，写入新文件并淘汰过期缓存。

#### 3.8.4 单测用例与断言清单
- **Test 8.1 (<= 180 字符胶囊硬约束)**：
  - 传入 1,000 行复杂的 Skill Markdown，断言 `record.capsuleText.length <= 180`。
- **Test 8.2 (强哈希落盘与命中)**：
  - 首次调用产生磁盘缓存文件；修改内存中缓存后再次调用，直接命中磁盘且源哈希匹配。
- **Test 8.3 (文件修改热更新失效)**：
  - 修改 Skill 源文件内容，调用 `loadOrDistill`，断言原缓存失效，生成新的 hash 并重新写入。

---

## 4. 8 项能力的解耦边界与数据流转拓扑

```
[用户输入 / Turn 开始]
         │
         ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 1. IntentAnalyzer (意图预检)                                  │
 │    - 顺延词匹配 ("ok", "继续") ──(是)──► [0ms 旁路直通]       │
 │    - 计算最小必要能力集 (requiredCapabilities)                 │
 └───────┬──────────────────────────────────────────────┬──────┘
         │                                              │
         ▼                                              ▼
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ 5. PromptDistiller        │          │ 6. ToolsSchemaSlimmer     │
 │    - 剥离客套词           │          │    - 依能力筛选最小工具集 │
 │    - 冷热分离 & 前缀哈希  │          │    - 去冗余示例 & Schema  │
 └───────┬───────────────────┘          └───────┬───────────────────┘
         │                                      │
         ▼                                      ▼
 ┌───────────────────────────┐          ┌───────────────────────────┐
 │ 8. SkillDistiller         │          │ 7. MCPMetaToolManager     │
 │    - <=180字符微胶囊      │          │    - 折叠为 2 个元工具    │
 │    - 强哈希磁盘缓存       │          │    - 本地快照索引检索     │
 └───────┬───────────────────┘          └───────┬───────────────────┘
         │                                      │
         └───────────────────┬──────────────────┘
                             ▼
 ┌─────────────────────────────────────────────────────────────┐
 │ 2. KVCacheLocker (Prompt Cache 保护)                        │
 │    - 静态 System Prompt + Tools Schema 绝对前缀锁定          │
 │    - 动态 Steering / 时间戳严格尾部注入 (Tail Injection)   │
 └───────────────────────────┬─────────────────────────────────┘
                             │
                             ▼
                  [Claude Agent SDK 轮次执行]
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
 ┌───────────────────────────┐   ┌─────────────────────────────┐
 │ 4. ToolOutputScrubber     │   │ 3. ProgressiveDisclosure    │
 │    - Step=6 阶梯衰减      │   │    - Layer 1 元数据折叠     │
 │    - 防雪球效应 & 稳固前缀│   │    - Layer 2 <=180微胶囊    │
 └───────────────────────────┘   │    - Layer 3 按需切片       │
                                 └─────────────────────────────┘
```

---

## 5. Caveats

1. **顺延词上下文完整性依赖**：
   - 0ms 旁路直通依赖前一轮的 `TurnContextSnapshot`。若前一轮会话不存在（即第一轮输入直接是 "ok"），模块将降级为默认安全配置（只读查询意图），不能盲目直通。
2. **大模型 Token 计算估算差异**：
   - 胶囊长度以字符数 `length <= 180` 作为严格确定性度量。实际在不同 tokenizer 下约为 30 ~ 60 tokens。
3. **Step=6 边界衰减的权衡**：
   - 在第 6、12、18 轮次边界处，因为需要重写历史工具输出，该特定轮次会不可避免地触发一次新的 KV Cache 写入。这是为了换取后续 5 轮绝对稳定的必然代价。

---

## 6. Conclusion

1. 8 项核心原子能力在功能职责、接口定义、内部状态与测试设计上已实现**彻底解耦**。
2. 每一个模块均被设计为遵循 Node.js ESM 规范的独立纯类/纯函数，单文件行数预期在 120 ~ 280 行之间，完全符合 `<= 600` 行与单文件职责纯粹性的工程规范。
3. 为每个模块均制定了清晰完备的自动化单测断言清单，直接可作为下一阶段测试编写与实现的验收基准。

---

## 7. Verification Method

通过独立自动化测试用例，可对本设计涉及的 8 项模块进行独立全绿验证：

1. **测试套件结构规划**：
   - `tests/unit/intent-analyzer.test.mjs`：覆盖顺延词 0ms 旁路、常规意图分类。
   - `tests/unit/kv-cache-locker.test.mjs`：覆盖前缀确定性哈希、尾部注入不变性。
   - `tests/unit/progressive-disclosure.test.mjs`：覆盖三层披露、<=180 字符微胶囊硬约束。
   - `tests/unit/tool-output-scrubber.test.mjs`：覆盖 Step=6 周期衰减、头尾保留。
   - `tests/unit/prompt-distiller.test.mjs`：覆盖客套词精炼、冷热分离。
   - `tests/unit/tools-schema-slimmer.test.mjs`：覆盖 Schema 瘦身、最小能力集过滤、编译缓存。
   - `tests/unit/mcp-meta-tool.test.mjs`：覆盖元工具折叠收敛（固定 2 个）、快照毫秒检索。
   - `tests/unit/skill-distiller.test.mjs`：覆盖 <=180 字符微胶囊、SHA-256 强哈希落盘缓存。
2. **执行命令**：
   - 运行独立单元测试：`node --test tests/unit/*.test.mjs`
   - 断言所有测试用例全绿通过，零依赖泄漏。
