# Project: Claude Agent SDK Runtime Control Plane Helper (8 Decoupled Capabilities)

## Architecture
- **Runtime Engine**: `@anthropic-ai/claude-agent-sdk` (Primary Driver in `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs`).
- **Control Plane Package Location**: `packages/agent-control-plane/`
  - Zero third-party runtime bloat, Node.js 18+ native ES Modules (`.mjs`).
  - Unit & Integration Test framework: Node.js native `node:test` + `node:assert/strict` (instant millisecond execution).
- **Directory Layout**:
  - `packages/agent-control-plane/constants.mjs`: Central constants (step=6, capsule_len=180, etc.).
  - `packages/agent-control-plane/helpers/intent-preflight/`: Helper 1 - 意图预检 + 0ms 顺延词直通.
  - `packages/agent-control-plane/helpers/prompt-cache-lock/`: Helper 2 - KV Cache 锁定 + Tail Injection 尾部注入.
  - `packages/agent-control-plane/helpers/progressive-disclosure/`: Helper 3 - 三层渐进披露 (Layer 1 折叠 -> Layer 2 ≤180微胶囊 -> Layer 3 切片).
  - `packages/agent-control-plane/helpers/step-scrubber/`: Helper 4 - Chunk-aligned step=6 历史工具输出阶梯衰减.
  - `packages/agent-control-plane/helpers/prompt-distillation/`: Helper 5 - Prompt 客套精炼 + 冷热前缀缓存.
  - `packages/agent-control-plane/helpers/tool-slimming/`: Helper 6 - Tools Schema 瘦身 + 预编译哈希缓存.
  - `packages/agent-control-plane/helpers/mcp-meta-tooling/`: Helper 7 - MCP 元工具折叠 (gateway.list_tools/call_tool) + 快照缓存.
  - `packages/agent-control-plane/helpers/skill-capsule/`: Helper 8 - Skill 蒸馏 ≤180 字符胶囊 + 强哈希磁盘缓存.
  - `packages/agent-control-plane/pipeline/`: `ControlPlanePipeline.mjs`, `PipelineContext.mjs`, `SdkHooksAdapter.mjs`.
  - `packages/agent-control-plane/index.mjs`: Unified package entrypoint.
- **Code Standards**:
  - Every single file <= 600 lines (500 lines warning, 800 lines hard split). Target: 100-300 lines per file.
  - Decoupling Invariant: The 8 helpers are 100% decoupled with ZERO cross-imports. Communications happen strictly via `PipelineContext`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | 意图预检 (IntentPreflight) | 毫秒级意图分析，顺延词("ok","继续","好"等) 0ms 旁路直通，输出最小必要能力掩码 | M1 | R1, Survey |
| 2 | Prompt Cache 保护 (PromptCacheLock) | 保证 System Prompt 静态基座 SHA-256 绝对锁定，动态变动指令严格尾部注入 (Tail Injection) | M1 | R1, Survey |
| 3 | 三层渐进披露 (ProgressiveDisclosure) | Layer 1 (0成本元数据折叠) -> Layer 2 (≤180字符高密微胶囊) -> Layer 3 (按需深挖切片窗口) | M1 | R1, Survey |
| 4 | 历史工具阶梯衰减 (StepScrubber) | 针对多轮大型工具输出按 Chunk-aligned step=6 周期执行头尾保留+中间折叠衰减，防雪球与 Cache 击穿 | M1 | R1, Survey |
| 5 | Prompt 提炼 + 缓存 (PromptDistillation) | 冗余客套指令精炼清洗，冷热分离静态前缀与动态参数，确定性前缀哈希 LRU 缓存 | M1 | R1, Survey |
| 6 | Tools 提炼 + 缓存 (ToolSlimming) | Schema 冗余字段精炼去除无用描述/示例，依能力动态暴露最小集，预编译哈希缓存 | M1 | R1, Survey |
| 7 | MCP 提炼 + 缓存 (McpMetaTooling) | 外部 MCP 折叠为 2 个元工具 (`gateway.list_tools` + `gateway.call_tool`)，本地快照毫秒索引缓存 | M1 | R1, Survey |
| 8 | Skill 提炼 + 缓存 (SkillCapsule) | 大型技能文件首次加载渐进蒸馏为 ≤180 字符微胶囊，强 SHA-256 哈希校验落盘缓存与热更新感知 | M1 | R1, Survey |
| 9 | 8 项独立单元测试套件 | tests/unit/ 目录下针对 8 项能力分别编写完全独立的自动化单元测试，全绿运行 (31/31 passed) | M1 | R1, Acceptance Criteria |
| 10 | SDK 生命周期管道编排器 | ControlPlanePipeline 协调 5 大生命周期阶段，维护 PipelineContext 会话状态 | M2 | R2, Survey |
| 11 | SdkHooks 适配器与驱动挂载 | 将 Pipeline 挂载到 ClaudeAgentSdkDriver 的 PreToolUse/PostToolUse/UserPromptSubmit 钩子中 | M2 | R2, Survey |
| 12 | 模拟对话测试驱动框架 (Claude ID 2efe9e50) | 以 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 轨迹为特征设计纯内存 Mock 会话回放器 | M3 | R3, Survey |
| 13 | 7 轮连续 Mock 场景验证 | 模拟顺延词直通、KV Cache 锁、工具阶梯衰减(step=6)、三层披露、元工具分发与胶囊缓存的完整流转 | M3 | R3, Survey |
| 14 | E2E 全量测试验收与全绿门禁 | 零外部云端大模型调用，纯 Mock 对话驱动端到端全绿测试套件并更新 package.json 脚本 (21/21 passed) | M3 | R3, Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | 8 项核心原子能力解耦实现与独立单测 | `packages/agent-control-plane/helpers/**`, `tests/unit/**` | none | DONE |
| M2 | SDK 生命周期管道编排与驱动流转挂载 | `packages/agent-control-plane/pipeline/**`, `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs` | M1 | IN_PROGRESS |
| M3 | 基于 Claude ID `2efe9e50` 模拟对话场景的 E2E 驱动验证 | `tests/test-agent-control-plane-e2e.mjs`, E2E 测试闭环验收 | M1, M2 | PLANNED |

## Interface Contracts
### Helper ↔ PipelineContext
- Helper 入参均为纯原生数据或只读上下文，零外部模块交叉依赖。
- `PipelineContext`: 包含 `sessionId`, `turnIndex`, `stepCounter`, `lastIntent`, `activeCapabilities`, `cacheStore`。
### Pipeline ↔ ClaudeAgentSdkDriver
- `prepareQueryOptions(options, userPrompt)`:
  - 处理 userPrompt (意图预检 + Prompt 提炼)
  - 处理 appendSystemPrompt (尾部注入规范)
  - 挂载 In-Process MCP Meta Server (`nexus-control-plane-gateway`)
  - 注入 `PreToolUse` / `PostToolUse` 钩子处理三层披露与 step=6 输出衰减

## Code Layout
- `packages/agent-control-plane/index.mjs`
- `packages/agent-control-plane/constants.mjs`
- `packages/agent-control-plane/helpers/intent-preflight/IntentPreflightHelper.mjs`
- `packages/agent-control-plane/helpers/prompt-cache-lock/PromptCacheLockHelper.mjs`
- `packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs`
- `packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs`
- `packages/agent-control-plane/helpers/prompt-distillation/PromptDistillationHelper.mjs`
- `packages/agent-control-plane/helpers/tool-slimming/ToolSlimmingHelper.mjs`
- `packages/agent-control-plane/helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs`
- `packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs`
- `packages/agent-control-plane/pipeline/PipelineContext.mjs`
- `packages/agent-control-plane/pipeline/ControlPlanePipeline.mjs`
- `packages/agent-control-plane/pipeline/SdkHooksAdapter.mjs`
- `tests/unit/test-intent-preflight.mjs`
- `tests/unit/test-prompt-cache-lock.mjs`
- `tests/unit/test-progressive-disclosure.mjs`
- `tests/unit/test-step-scrubber.mjs`
- `tests/unit/test-prompt-distillation.mjs`
- `tests/unit/test-tool-slimming.mjs`
- `tests/unit/test-mcp-meta-tooling.mjs`
- `tests/unit/test-skill-capsule.mjs`
- `tests/fixtures/session-2efe9e50-mock.mjs`
- `tests/test-agent-control-plane-e2e.mjs`
