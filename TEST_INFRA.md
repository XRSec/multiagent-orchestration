# Test Infrastructure & E2E Acceptance Framework: Agent Control Plane

> 4-Tier 自动化验收测试套件架构规范、特性覆盖矩阵与系统底座防护网说明文档。

---

## 1. 架构总览与测试哲学 (Architecture & Philosophy)

为确保 Claude Agent SDK 控制平面辅助能力（8 项解耦能力）具备高确定性、毫秒级执行与生产级质量，本项目构建了基于 Node.js 原生 ES Module (`node:test` + `node:assert/strict`) 的 **4-Tier E2E 自动化验收测试套件**（`tests/test-agent-control-plane-e2e.mjs`）。

```
+-----------------------------------------------------------------------------------------+
|                  Control Plane 4-Tier Automated Acceptance Suite                        |
+-----------------------------------------------------------------------------------------+
| Tier 1: Feature Coverage (8 项解耦核心能力基准契约与原子行为全覆盖)                      |
|   - Helper 1: 意图预检 (IntentPreflight) 与 0ms 顺延词直通                                |
|   - Helper 2: Prompt Cache 锁定 (PromptCacheLock) 与尾部注入 (Tail Injection)             |
|   - Helper 3: 三层渐进披露 (ProgressiveDisclosure: L1折叠 -> L2≤180字符微胶囊 -> L3切片) |
|   - Helper 4: 历史工具输出阶梯衰减 (StepScrubber: Chunk-aligned step=6 周期衰减)          |
|   - Helper 5: Prompt 客套去噪 (PromptDistillation) 与确定性前缀哈希 LRU 缓存             |
|   - Helper 6: Tools Schema 瘦身 (ToolSlimming) 与动态能力最小集暴露                       |
|   - Helper 7: MCP 元工具折叠 (McpMetaTooling: 固定 2 个元工具 gateway.list/call)          |
|   - Helper 8: Skill 蒸馏 (SkillCapsule: ≤180字符微胶囊与 SHA-256 磁盘哈希缓存)            |
+-----------------------------------------------------------------------------------------+
| Tier 2: Boundary & Corner Cases (极端边界条件、对抗性输入与防护网)                       |
|   - 顺延词空白/符号变体识别 (" ok! \n" vs 包含业务动词的复合句拦截)                      |
|   - 超大文本 (>50KB) 与极端行数下微胶囊硬长度 <= 180 字符强约束                           |
|   - Step < 6 严格保持 0 字节抖动，Step = 6 边界精准衰减，Step > 6 历史块固化锁定           |
|   - Schema 嵌套/无 required/深层 properties 优雅瘦身与无畸形截断                         |
|   - Skill 强哈希磁盘缓存感知：源文件 1 字符变动自动触发淘汰并重新蒸馏                    |
|   - MCP 未知 server / tool 异常调用的安全降级与错误隔离                                  |
+-----------------------------------------------------------------------------------------+
| Tier 3: Cross-Feature Interactions & Pipeline Orchestration (管道生命周期跨能力协同)      |
|   - Phase 1 (输入路由期): IntentPreflight + PromptDistillation 协同流动                  |
|   - Phase 2 (上下文装配期): ToolSlimming + McpMetaTooling + SkillCapsule + CacheLock 协同  |
|   - Phase 3 & 4 (调用与响应期): PreToolUse 拦截与 PostToolUse (Disclosure + Scrubber) 协同 |
|   - PipelineContext 会话状态穿透，8 个 Helper 之间 100% 解耦与 0 交叉引用                |
+-----------------------------------------------------------------------------------------+
| Tier 4: Real-World Application (基于 Claude ID 2efe9e50 真实轨迹特征的 7 轮连续 Mock 会话) |
|   - 纯内存 Mock 对话驱动，全程无外部网络、无真实大模型 API 计费调用                     |
|   - Turn 1: 冷启动 + 13KB superpowers 技能蒸馏入库 + 尾部注入                            |
|   - Turn 2: 5,000 字符大型 Read 工具输出触发三层渐进披露 (Layer 2 <= 180 字符)            |
|   - Turn 3: 顺延词 "继续" 0ms 直通，继承能力掩码，保持 Prompt 绝对冻结                  |
|   - Turn 4-5: 连续工具执行，历史快照保持不可变，Step 计数单调累加                        |
|   - Turn 6: Step=6 边界触发历史工具阶梯衰减，大文本体积减少 70%+，防雪球击穿               |
|   - Turn 7: 二次请求挂载 superpowers，强 SHA-256 磁盘缓存命中，零重新蒸馏直接复用       |
+-----------------------------------------------------------------------------------------+
```

### 核心测试哲学
1. **零外部网络与大模型依赖 (Zero Cloud Bloat)**: 纯本地原生运行，不发起任何真实 HTTP/RPC 请求，无 Token 成本消耗。
2. **极速与确定性 (Deterministic Millisecond Execution)**: 原生 `node:test` 驱动，全套套件执行耗时 `< 1.0 秒`。
3. **KV Cache 命中率数学验证**: 依据 Anthropic 官方前缀缓存字节级不可变性规范，通过 SHA-256 严格验证前缀稳定性。
4. **代码红线合规 (Script Standards)**: 测试套件及所有相关模块单文件严格 `<= 600` 行，结构清晰且低耦合。

---

## 2. 特性清单与覆盖矩阵 (Feature Inventory & Coverage Matrix)

| 特性编号 | 能力名称 (Helper) | 核心职责 | Tier 1 | Tier 2 | Tier 3 | Tier 4 | 验收指标 |
|:---:|---|---|:---:|:---:|:---:|:---:|---|
| **F-01** | `IntentPreflight` | 毫秒级意图解析与顺延词直通 | ✅ | ✅ | ✅ | ✅ | 顺延词耗时 `< 1.0ms`，直通标识为 `true` |
| **F-02** | `PromptCacheLock` | 静态 System Prompt 锁定与尾部注入 | ✅ | ✅ | ✅ | ✅ | 静态段 SHA-256 一致率 100%，动态变动尾部隔离 |
| **F-03** | `ProgressiveDisclosure` | 上下文三层渐进披露 | ✅ | ✅ | ✅ | ✅ | Layer 2 胶囊字符数严格 `<= 180` |
| **F-04** | `StepScrubber` | Step=6 周期历史工具阶梯衰减 | ✅ | ✅ | ✅ | ✅ | 步长对齐，历史大文本体积削减 `>= 60%` |
| **F-05** | `PromptDistillation` | Prompt 客套去噪与冷热前缀缓存 | ✅ | ✅ | ✅ | ✅ | 冗余字符精炼率 `>= 30%`，冷前缀哈希稳定 |
| **F-06** | `ToolSlimming` | Schema 瘦身与动态能力最小集 | ✅ | ✅ | ✅ | ✅ | 冗余字段精简率 `>= 40%`，能力掩码精准过滤 |
| **F-07** | `McpMetaTooling` | MCP 元工具折叠与本地快照索引 | ✅ | ✅ | ✅ | ✅ | 外部工具折叠为固定 2 个，元查询本地 0ms 响应 |
| **F-08** | `SkillCapsule` | Skill 蒸馏微胶囊与强哈希磁盘缓存 | ✅ | ✅ | ✅ | ✅ | 胶囊 `<= 180` 字符，磁盘缓存命中耗时 `< 2ms` |
| **F-09** | `PipelineOrchestration` | 5 阶段生命周期管道与上下文穿透 | ❌ | ❌ | ✅ | ✅ | 8 个 Helper 间 0 交叉调用，状态单向流动 |
| **F-10** | `Claude 2efe9e50 E2E` | 7 轮连续 Mock 会话轨迹端到端闭环 | ❌ | ❌ | ❌ | ✅ | 7 轮完整交互全绿流转，状态机完全收敛 |

---

## 3. 4-Tier 覆盖阈值与断言规范 (Coverage Thresholds & Assertions)

### Tier 1: Feature Coverage (基础契约全覆盖)
- **断言目标**: 验证 8 个 Helper 类的核心导出、输入参数签名、标准返回值契约。
- **通过阈值**: 8 项能力基础单元断言全部 `PASS` (100%)。

### Tier 2: Boundary & Corner Cases (对抗性与边界防护)
- **断言目标**:
  1. 顺延词变体：`"继续"`, `"好"`, `"ok"`, `" proceed "`, `"  1  "` 命中直通；`"好的，帮我删除代码"` 严禁直通。
  2. 极长输入：50,000 字符长文本经 Layer 2 披露后，字符长度断言 `length <= 180`。
  3. Step 阶梯：Turn 1~5 历史工具输出完全原样保留（0 字节变化）；Turn 6 精准触发衰减；Turn 7+ 历史已衰减块固化。
  4. 缓存热失效：修改源文件内容后，SHA-256 发生改变，自动更新缓存而非使用旧数据。
- **通过阈值**: 边界测试全部 `PASS`，0 异常抛出遗漏。

### Tier 3: Cross-Feature Interactions & Pipeline (管道协同)
- **断言目标**:
  1. `PipelineContext` 贯穿输入路由、上下文投影、前置拦截、响应衰减等生命周期阶段。
  2. 验证意图预检计算的能力掩码直接决定 ToolsSchemaSlimmer 的过滤清单。
  3. 验证 MCP 元工具与 Skill 微胶囊装配后，其输出被安全纳入 System Prompt 尾部注入区，未破坏静态基座。
- **通过阈值**: 管道流转断言全部 `PASS`。

### Tier 4: Real-World Application (基于 Claude ID 2efe9e50 的 7 轮 Mock 闭环)
- **会话模型来源**: 脱敏提取自 `/Users/xr/.claude/projects/.../2efe9e50-4306-497b-8b76-c112ffbd5d78.jsonl`。
- **7 轮时序断言矩阵**:
  - `Turn 1 (Init & Large Skill)`: Prompt 客套精炼 + Skill 首次蒸馏 (<=180 字符) + 静态前缀锁定。
  - `Turn 2 (Large Tool Output)`: Read 5KB 输出触发 Layer 2 胶囊化 (<=180 字符)。
  - `Turn 3 (Continuation Bypass)`: 顺延词 "继续" 0ms 直通，继承只读能力集，Prompt 静态基座哈希绝对一致。
  - `Turn 4 (Multi-tool Step)`: Step 累积至 4，历史输出保持未衰减。
  - `Turn 5 (Multi-tool Step)`: Step 累积至 5，依然处于 Chunk 窗口内。
  - `Turn 6 (Step=6 Scrubbing Trigger)`: 命中 `step % 6 === 0`，对前 6 步历史大输出统一阶梯衰减，行数大幅减少。
  - `Turn 7 (Cache Hit Verification)`: 技能二次挂载命中 SHA-256 磁盘缓存，耗时 `< 2ms`。
- **通过阈值**: 7 轮 Mock 会话按序成功推进，状态机闭环无死锁。

---

## 4. 运行与验证指令 (Command Reference)

### 4.1 使用 Node.js 原生 Test Runner (推荐)
```bash
node --test tests/test-agent-control-plane-e2e.mjs
```

### 4.2 直接执行脚本运行模式
```bash
node tests/test-agent-control-plane-e2e.mjs
```

### 4.3 分层或指定 Tier 过滤
```bash
# 仅执行 Tier 1 基础能力契约测试
node --test --test-name-pattern="Tier 1" tests/test-agent-control-plane-e2e.mjs

# 仅执行 Tier 4 真实 7 轮 Mock 会话流转
node --test --test-name-pattern="Tier 4" tests/test-agent-control-plane-e2e.mjs
```

### 4.4 检查代码行数合规性
```bash
wc -l tests/test-agent-control-plane-e2e.mjs tests/fixtures/session-2efe9e50-mock.mjs
```
所有文件行数必须严格 `<= 600` 行（符合 `SCRIPT_STANDARDS_SPEC`）。
