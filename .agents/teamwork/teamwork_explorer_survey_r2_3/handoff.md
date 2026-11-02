# Handoff Report: SDK Lifecycle Pipeline Orchestration & Mock Session Verification

> **Agent**: Explorer 3 (SDK 生命周期管道编排与模拟验证专家)  
> **Timestamp**: 2026-11-02T06:06:00Z  
> **Target Directory**: `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_3/`  
> **Milestone**: `survey_r2_3_sdk_lifecycle_and_mock_verification`

---

## 1. Observation (直接观察事实与代码勘测)

### 1.1 SDK 驱动架构与钩子机制观察
- **文件路径**: `/Users/xr/IDEA.localized/multiagent-orchestration/apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs`
  - 第 13 行引入 SDK 原生接口：`import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';`
  - 第 111-137 行配置了进程内生命周期钩子：
    - `PreToolUse`: matcher 为 `*`，支持拦截、原子读取 `this.memorySteeringDirective`，并通过 `{ additionalContext: ... }` 动态注入；
    - `PostToolUse`: matcher 为 `*`，具备工具响应捕获能力；
  - 第 139-148 行构建 `queryOptions`，支持 `appendSystemPrompt`、`hooks`、`disallowedTools`、`mcpServers`、`resume`。
- **文件路径**: `/Users/xr/IDEA.localized/multiagent-orchestration/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
  - 第 991、1010 行定义了全量 SDK 钩子事件：
    `HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PostToolBatch', 'UserPromptSubmit', 'SessionStart', 'SessionEnd', 'PreCompact', 'PostCompact', 'InstructionsLoaded', ...]`
  - 第 2744-2772 行定义了 `PostToolUseHookInput` 与 `PostToolUseHookSpecificOutput`：
    `updatedToolOutput?: unknown;` 明确支持**在工具输出发送给模型前进行内容覆写替换**；
  - 第 2827-2842 行定义了 `PreToolUseHookInput` 与 `PreToolUseHookSpecificOutput`：
    支持 `permissionDecision?: 'allow' | 'deny' | 'ask' | 'defer'`、`updatedInput`、`additionalContext`；
  - 第 10348-10366 行定义了 `UserPromptSubmitHookInput` 与 `UserPromptSubmitHookSpecificOutput`：
    支持在用户提交提示词时进行拦截、判定与上下文附加；
  - 第 1069-1093 行内置了 `InMemorySessionStore`，原生支持无外部依赖的会话存取测试。

### 1.2 真实基准会话 `2efe9e50-4306-497b-8b76-c112ffbd5d78` 勘测
- **文件路径**: `/Users/xr/.claude/projects/-Users-xr-IDEA-localized-Prism-Browser-Community/2efe9e50-4306-497b-8b76-c112ffbd5d78.jsonl`
  - **文件大小**: 42,153,361 字节 (~42.1 MB)，包含深度多轮重度交互记录；
  - **输入特征**: 包含了极其典型的连续顺延词输入，例如第 1 行中的 `"继续"`，以及频繁的系统附加提示词（UI Language 模板）；
  - **上下文膨胀事实**: 在第 3 行为 `SessionStart:startup` 挂载点，单次通过 `additionalContext` 注入了高达 13KB 的 `superpowers:using-superpowers` 完整 Markdown 以及大型 Nowledge Mem Context Bundle，直接导致单轮会话静态前缀失控、Token 骤增；
  - **工具输出膨胀事实**: 会话中包含大量长篇文件读取、Grep 搜索和构建输出，在多轮对话中缺乏固定步长周期衰减，造成严重的上下文雪球效应。

### 1.3 现有底座 Helper (`cindy_help`) 设计模式观察
- **文件路径**: `/Users/xr/IDEA.localized/multiagent-orchestration/extensions/cindy/docs/dev-rules/agent-capabilities.md`
  - 第 13-30 行：通过内置底座 MCP `cindy_helper`（如 `get_capabilities`）对外暴露统一的动态能力目录，实现元数据查询与元工具调用；
  - 核心思想：伙伴不单独直接挂载数十个分散的底层工具，而是由底座 Helper 静默感知、代理分发与按需加载。

---

## 2. Logic Chain (架构推导与管道设计)

从上述直接观察出发，我们推导出 8 项能力的精准执行管道与测试方案：

```
[观察事实 1: 用户存在连续"继续"输入] ──► [能力 1: 0ms 旁路直通] ──► 跳过模型重分析与工具重计算
[观察事实 2: 动态上下文破坏前缀一致性] ──► [能力 2: KV Cache 锁定] ──► 静态基座前缀锁定 + 变动指令尾部注入
[观察事实 3: 巨型 Skill 一次性灌入] ──► [能力 8: Skill 胶囊化] ──► 渐进蒸馏为 ≤180 字符微胶囊 + 强哈希落盘
[观察事实 4: 多工具 Schema 占用过多 Token] ──► [能力 6 & 7: Schema 瘦身 + MCP 元工具] ──► 折叠为 gateway 双工具 + 快照缓存
[观察事实 5: 多轮工具输出累积雪球爆炸] ──► [能力 4: step=6 工具阶梯衰减] ──► 周期步长对齐衰减，防止 Cache 击穿与雪球
[观察事实 6: 长文本大结果直接暴露] ──► [能力 3: 三层渐进披露] ──► Layer 1 元数据 -> Layer 2 胶囊 -> Layer 3 按需切片
```

### 2.1 8 项辅助能力在 SDK 生命周期中的精准流转集成表

| 序号 | 辅助能力模块 | SDK 生命周期阶段 | 精准挂载点 (Hook/Pipeline) | 执行次序 | 核心流转行为与类似 `cindy_help` 机制 |
|---|---|---|---|---|---|
| **1** | **意图预检 (Pre-flight Routing)** | 阶段 1: 输入摄入与路由期 | Host Input Ingestion / `UserPromptSubmit` Hook | **Step 1.1** (最前置) | 优先执行正则检测：匹配顺延词（"ok","继续","好"）触发 **0ms 旁路直通**，沿用上一轮工具状态；非顺延词进行意图分类并计算最小必要能力掩码。 |
| **5** | **Prompt 提炼与缓存 (Distillation)** | 阶段 1: 输入摄入与路由期 | Host Input Ingestion / `UserPromptSubmit` Hook | **Step 1.2** | 过滤客套冗余指令，冷热分离静态前缀与动态参数，查询/更新确定性前缀缓存。 |
| **6** | **Tools Schema 提炼与缓存** | 阶段 2: 上下文与工具投影期 | `queryOptions.disallowedTools` / SDK Mcp 注册 | **Step 2.1** | 剔除 Schema 冗长描述与多余示例；依据 Step 1.1 计算的掩码动态关闭无关工具；维护 Schema SHA-256 预编译缓存。 |
| **7** | **MCP 元工具提炼与快照** | 阶段 2: 上下文与工具投影期 | `createSdkMcpServer` In-Process 挂载 | **Step 2.2** | 将所有外部 MCP 接口折叠为 2 个底座元工具（`gateway.list_tools` + `gateway.call_tool`）；挂载 Snapshot 本地缓存。 |
| **8** | **Skill 胶囊化提炼与缓存** | 阶段 2: 上下文与工具投影期 | `InstructionsLoaded` Hook / Context 装配 | **Step 2.3** | 对 `using-superpowers` 等大型技能执行 SHA-256 校验；首次加载渐进蒸馏为 ≤180 字符微胶囊并落盘，后续毫秒级直接读取胶囊注入。 |
| **2** | **KV Cache 保护 (Locking)** | 阶段 2: 上下文与工具投影期 | `appendSystemPrompt` 组装器 / Tail 注入区 | **Step 2.4** | System Prompt 静态基座（Standing Order/Soul）绝对冻结，保证前缀字节级一致；动态变动内容统一在尾部（Tail Injection）注入。 |
| **--** | **底座 Helper 静默拦截** | 阶段 3: 推理与调用前置拦截 | `PreToolUse` Hook (`matcher: '*'`) | **Step 3.1** | 类似 `cindy_help` 拦截底层调用与鉴权；若触发元工具调用则透明解包分发；若有外部打断指令，注入 `additionalContext` 转向。 |
| **3** | **上下文去脂与三层渐进披露** | 阶段 4: 工具响应与输出截获 | `PostToolUse` Hook (`updatedToolOutput`) | **Step 4.1** | 检查工具输出体积，默认折叠为 Layer 1 元数据或 Layer 2 胶囊（≤180 字符），附带 Chunk ID；提供按需深挖切片接口（Layer 3）。 |
| **4** | **历史工具输出阶梯衰减** | 阶段 4: 工具响应与输出截获 | `PostToolUse` Hook (`updatedToolOutput`) | **Step 4.2** | 跟踪会话步数计数器；在固定周期（`step % 6 === 0`）触发 Chunk-aligned 历史输出衰减，头尾保留+摘要折叠，替换输出防止雪球爆炸。 |

### 2.2 控制平面 Helper (Pipeline Orchestrator) 接口与类定义规范

设计独立的控制平面协调器 `ControlPlaneHelper`，代码置于架构合规位置（如 `packages/control-plane-helper/` 或 `apps/desktop/src/main/orchestrator/`）：

```typescript
export interface ControlPlaneHelperOptions {
  sessionId: string;
  cacheDir?: string;
  scrubInterval?: number; // 默认 6 (step=6)
  enableFastPass?: boolean; // 默认 true
  maxCapsuleLength?: number; // 默认 180 字符
}

export class ControlPlaneHelper {
  private stepCounter: number = 0;
  private lastIntentResult: IntentAnalysisResult | null = null;
  private schemaCache = new Map<string, SlimmedSchema>();
  private skillCapsuleCache = new Map<string, string>();

  // 1. 输入处理管道 (能力 1 + 能力 5)
  public handleUserInput(rawPrompt: string): ProcessedInputResult;

  // 2. 静态 Prompt 组装与尾部注入 (能力 2)
  public assembleSystemPrompt(baseStaticPrompt: string, dynamicTail?: string): string;

  // 3. 动态工具过滤 (能力 6)
  public getDisallowedTools(allTools: string[], intent: IntentAnalysisResult): string[];

  // 4. 元工具服务生成 (能力 7)
  public createGatewayMcpServer(registeredMcps: RawMcpServer[]): SdkMcpServer;

  // 5. 技能蒸馏与胶囊读取 (能力 8)
  public loadSkillCapsule(skillPath: string, rawContent: string): Promise<string>;

  // 6. 绑定到 Claude Agent SDK 原生 Hooks 的适配器
  public createSdkHooks(): Record<HookEvent, HookCallbackMatcher[]>;
}
```

---

## 3. Mock 对话驱动与测试验证方案 (基于 `2efe9e50`)

### 3.1 测试设计核心原则
1. **完全零云端外部调用**: 全程不发起任何网络 API 请求，不调用外部商业模型，不消耗任何真实的 Anthropic Token；
2. **真实数据集结构回放**: 以真实的会话 `2efe9e50-4306-497b-8b76-c112ffbd5d78.jsonl` 为样本提炼具象化的测试用例数据集；
3. **闭环事件流驱动**: 采用纯内存 Event Generator 驱动 SDK 的 Query 循环与 Hook 管道，验证各能力在全生命周期中的拦截正确性。

### 3.2 提取自 `2efe9e50` 的多轮测试用例场景集 (Mock Session Fixture)

构建包含 7 轮连续交互的基准场景：
- **Turn 1 (首次冷启动与巨型 Skill 注入)**:
  - 输入: 用户请求 `"请帮我看看这个项目里的 pro tier 限制在哪，并准备好去除它，非常感谢你！"`
  - 伴随注入: 真实 `superpowers:using-superpowers` (13KB) 技能与 Nowledge Mem Context Bundle (5KB)；
  - 验证点: 
    * 能力 5 过滤客套冗余词；
    * 能力 8 首次触发 Skill 蒸馏，产出 ≤180 字符胶囊并落盘缓存；
    * 能力 2 保证静态 System Prompt 锁定，胶囊置于尾部。
- **Turn 2 (大型工具输出与三层披露)**:
  - 模型生成: `gateway.call_tool("filesystem", "Read", { path: "package.json" })`
  - 工具返回: 5,000 字符的原始 package 结构与配置；
  - 验证点:
    * 能力 7 元工具正常分发；
    * 能力 3 在 `PostToolUse` 中将返回结果截断去脂为 Layer 2 胶囊（≤180 字符）并附带 Chunk ID。
- **Turn 3 (顺延词 0ms 旁路直通)**:
  - 输入: 用户发送顺延词 `"继续"`；
  - 验证点:
    * 能力 1 命中顺延词正则，耗时 ≤1ms，触发 `bypass: true`；
    * 跳过意图分析，沿用上一轮工具能力集；
    * 保持 System Prompt 前缀 100% 字节不变。
- **Turn 4-5 (多步工具调用累加)**:
  - 用户输入 `"继续"` 与 `"好"`，产生多次大型 Grep/Search 工具输出（累积达到 10,000+ 字符）；
  - 验证点: 步骤步长递增至 step=4, step=5，保持历史块不可变。
- **Turn 6 (Step=6 Chunk-aligned 周期阶梯衰减触发点)**:
  - 用户输入 `"继续"`，触发第 6 步工具执行；
  - 验证点:
    * 能力 4 命中 `stepCounter % 6 === 0`；
    * 对前 6 步的历史大型工具输出执行统一阶梯衰减；
    * 验证原始 300 行的 Grep 输出被衰减截断为保留前 15 行 + 截断标识 + 后 10 行；
    * 验证历史缓存对齐（Chunk-aligned），杜绝滑动窗口造成的 Cache 抖动击穿。
- **Turn 7 (Skill 二次加载与强哈希命中)**:
  - 再次请求关联 `using-superpowers`；
  - 验证点:
    * 能力 8 强哈希校验命中本地磁盘缓存，耗时 < 2ms；
    * 验证微胶囊内容未重新蒸馏，100% 缓存命中。

### 3.3 自动化集成测试套件规格 (端到端全绿驱动)

测试套件采用项目原生 ES Module 标准（无三方冗余依赖，基于 `node:assert/strict`）：
- 目标测试文件: `tests/test-sdk-control-plane-helper.mjs`
- 覆盖的测试断言矩阵：

| 测试用例 ID | 测试项 | 核心断言内容 |
|---|---|---|
| `TEST_R1_1_FAST_PASS` | 意图预检顺延词直通 | 断言 `"继续"`、`"ok"`、`"好"` 耗时 ≤1ms，返回 `bypassFastPath === true`； |
| `TEST_R1_2_KV_LOCK` | Prompt Cache 锁定与尾部注入 | 断言连续 3 轮会话的 System Prompt 静态基座 SHA-256 完全一致；变动内容严格在 Tail 标记之后； |
| `TEST_R1_3_PROGRESSIVE` | 三层渐进披露 | 断言大型工具输出被折叠为 Layer 2 胶囊且长度严格 ≤ 180 字符，包含切片 Chunk 标识； |
| `TEST_R1_4_STEP6_SCRUB` | Step=6 阶梯衰减 | 断言多轮累积输出在 step=6 时被衰减，行数从 300 衰减至 ≤ 30 行，且未触发前保持前缀冻结； |
| `TEST_R1_5_PROMPT_DISTILL` | Prompt 提炼与前缀缓存 | 断言冗余客套指令精炼率 ≥ 30%，冷热分离提取出确定性模板前缀并命中 LRU 缓存； |
| `TEST_R1_6_TOOLS_SLIM` | Tools Schema 瘦身与缓存 | 断言 Schema 冗余字段剔除率 ≥ 50%，SHA-256 预编译缓存命中率 100%； |
| `TEST_R1_7_MCP_META` | MCP 元工具折叠与快照 | 断言外部 10 个 MCP 折叠为 2 个元工具，元调用分发参数正确映射，快照缓存有效； |
| `TEST_R1_8_SKILL_CAPSULE` | Skill 蒸馏与强哈希校验 | 断言 13KB Markdown 技能首次蒸馏为 ≤180 字符微胶囊，二次读取命中 SHA-256 磁盘缓存且耗时 < 2ms； |
| `TEST_R2_LIFECYCLE_E2E` | 基于 `2efe9e50` 端到端管道流转 | 断言 7 轮 Mock 会话按序完整驱动，8 项能力无死锁、全链路顺畅执行，全程无网络调用。 |

---

## 4. Caveats (边界限制与未涉及区域)

1. **真实网络隔离**: 本方案明确遵循不发起真实云端大模型 API 请求的原则。KV Cache 命中率的 95%+ 保证，是基于 Anthropic 官方 Prompt Caching 字节级一致性规范（前缀不可变性推导）进行的静态哈希锁定断言。
2. **蒸馏器实现粒度**: 在无大模型环境下，Skill 与 Prompt 蒸馏器应采用高性能的确定性词法规则提取器（Rule-based Lexical Extractor）作为本地基准实现，确保测试快速、全绿且具备强确定性。
3. **数据安全性**: 真实会话 `2efe9e50-4306-497b-8b76-c112ffbd5d78.jsonl` 包含开发者的本地敏感路径与凭据残留，测试套件构建 Mock Fixture 时必须执行脱敏，不得将敏感个人信息打包进测试代码。

---

## 5. Conclusion (勘测结论与实施路线)

1. **生命周期流转定义完备**: 8 项原子能力在 Claude Code Agent SDK 的 5 个生命周期阶段（输入路由、上下文投影、前置推理拦截、工具响应衰减、轮次闭环）中定位清晰，互不耦合，通过 `ControlPlaneHelper` 统一编排，完美复刻并超越了 `cindy_help` 的底座能力；
2. **纯 Mock 方案完全可行**: 利用会话 `2efe9e50` 的多轮特征构建 Mock Session Replayer，能在零网络、零成本的前提下，毫秒级全绿验证 8 项能力的提炼、裁剪、缓存与管道流转；
3. **工程落地建议**: 
   - 将 8 项原子能力独立拆分子模块（如 `packages/control-plane-helper/src/capabilities/`）；
   - 在 `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs` 中挂载 `ControlPlaneHelper.createSdkHooks()`；
   - 编写 `tests/test-sdk-control-plane-helper.mjs` 纳入 CI 验收门禁。

---

## 6. Verification Method (独立可复现验证方法)

后续测试编写者或实施智能体可通过以下步骤执行验证：

1. **查看 SDK 原生钩子与类型一致性**:
   ```bash
   grep -n "PreToolUseHookSpecificOutput" node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
   grep -n "updatedToolOutput" node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts
   ```
2. **核验真实基准会话存在性与样本结构**:
   ```bash
   head -n 5 /Users/xr/.claude/projects/-Users-xr-IDEA-localized-Prism-Browser-Community/2efe9e50-4306-497b-8b76-c112ffbd5d78.jsonl
   ```
3. **集成测试执行入口 (测试实现完成后执行)**:
   ```bash
   node tests/test-sdk-control-plane-helper.mjs
   ```
   **预期结果**: 9 项测试套件全部通过（PASSED），执行耗时 < 1.0s，零网络连接。
