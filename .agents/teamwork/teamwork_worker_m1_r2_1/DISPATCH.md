# Dispatch Task: M1 Implementation - 8 Decoupled Core Atomic Capabilities & 8 Unit Test Suites

## Task Description
作为 M1 实施工程师（teamwork_worker），请根据技术勘测报告与架构规约，在 `packages/agent-control-plane/` 下彻底解耦独立实现 8 项核心原子能力，并在 `tests/unit/` 下为每一项能力编写独立的自动化单元测试，确保 `node --test tests/unit/*.mjs` 全部绿灯通过。

## Exclusive Write Ownership
你独占以下文件的创建与修改权限：
- `packages/agent-control-plane/constants.mjs`
- `packages/agent-control-plane/index.mjs`
- `packages/agent-control-plane/helpers/intent-preflight/IntentPreflightHelper.mjs`
- `packages/agent-control-plane/helpers/prompt-cache-lock/PromptCacheLockHelper.mjs`
- `packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs`
- `packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs`
- `packages/agent-control-plane/helpers/prompt-distillation/PromptDistillationHelper.mjs`
- `packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs`
- `packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs`
- `packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs`
- `tests/unit/test-intent-preflight.mjs`
- `tests/unit/test-prompt-cache-lock.mjs`
- `tests/unit/test-progressive-disclosure.mjs`
- `tests/unit/test-step-scrubber.mjs`
- `tests/unit/test-prompt-distillation.mjs`
- `tests/unit/test-tool-slimming.mjs`
- `tests/unit/test-mcp-meta-tooling.mjs`
- `tests/unit/test-skill-capsule.mjs`

## Detailed Implementation Specifications for 8 Helpers
1. **Helper 1 (IntentPreflightHelper)**:
   - 顺延词精准识别：`['ok', 'okay', '继续', '好', '好的', 'yes', 'y', 'proceed', 'go on', '1', '收到', '确认', 'next', 'continue', '行']`。
   - 包含去首尾空白与标点逻辑。若完全命中且存在前一轮快照，触发 `isBypass: true, intentType: 'BYPASS_CONTINUATION'`，耗时 `< 1.0ms`。
   - 非顺延词：词法识别意图并计算最小必要能力掩码（FILE_READ, FILE_WRITE, COMMAND_RUN, MCP_GATEWAY, SKILL_LOAD）。
2. **Helper 2 (PromptCacheLockHelper)**:
   - 静态 System Prompt 片段按优先级确定性组装，计算 SHA-256 哈希 `staticHash` 锁定前缀。
   - 变动指令、时间戳、Steering 指令严格尾部注入（Tail Injection: `\n\n=== [EPHEMERAL_TAIL_CONTEXT] ===\n...`）。
   - 提供 `verifyCacheInvariance(bundleA, bundleB)` 验证静态前缀未被破坏。
3. **Helper 3 (ProgressiveDisclosureHelper)**:
   - Layer 1: 0成本元数据折叠 `[ResourceFolded: ${id} | lines: ${n} | bytes: ${b} | tag: ${tag}]`。
   - Layer 2: 高密微胶囊 Capsule，**硬约束：`capsuleText.length <= 180` 字符**（超出截断为 177 + '...'）。
   - Layer 3: 按需深挖切片窗口 `[Lines ${start}-${end} of ${total}]`，精准返回指定行区间。
4. **Helper 4 (StepScrubberHelper)**:
   - 针对大型工具输出按 Chunk-aligned step=6 周期衰减。
   - `freezeThreshold = Math.floor(currentStep / 6) * 6`。未达阈值的最近输出保持 100% 字节不变（防历史抖动击穿 Cache）。已过阈值的历史输出执行头尾保留（前 6 行 + 后 6 行，中间行折叠），大幅降低 Token。
5. **Helper 5 (PromptDistillationHelper)**:
   - 过滤客套词（"请问", "麻烦你", "可不可以", "please", "could you kindly", "thank you" 等）。
   - 冷热分离：提取静态规约前缀与动态参数，计算 SHA-256 维护确定性前缀 LRU 缓存。
6. **Helper 6 (ToolSlimmingHelper)**:
   - 递归清理 JSON Schema 中 `examples`, `title`, `default`, `markdownDescription` 等冗余字段，压缩 `description`。
   - 依据能力掩码动态筛选最小工具集。
   - 基于工具集合 SHA-256 提供预编译对象缓存。
7. **Helper 7 (McpMetaToolingHelper)**:
   - 将所有外部 MCP 工具折叠为固定的 2 个元工具：`mcp_gateway_list_tools` 与 `mcp_gateway_call_tool`。
   - 本地维护快照索引 `MCPSnapshotStore`，元工具查询在本地内存毫秒级返回，不触发外部 RPC。
   - 提供 `dispatchMetaCall(server, tool, args)` 转发调用。
8. **Helper 8 (SkillCapsuleHelper)**:
   - 解析 Skill Markdown，提取关键规约，蒸馏为 **<= 180 字符**的微胶囊。
   - 基于源文件内容 SHA-256 建立磁盘缓存文件（`{cacheDir}/{skillName}.{sha256}.json`）。二次读取耗时 `< 2ms`；源文件被修改时感知哈希变化并自动热更新。

## Hard Constraints
- 单文件行数严格 `<= 600` 行（目标 120-280 行）。
- 8 项 Helper 彼此之间 **零交叉引用**（Decoupled Invariant）。
- 自动化单测覆盖：8 个单测文件全部绿灯通过（`node --test tests/unit/*.mjs`）。

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-11-02T06:12:05Z
收到指派：实现 M1 8 项核心原子能力并编写自动化单测。
