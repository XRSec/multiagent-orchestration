# Dispatch Task: M2 Implementation - SDK Lifecycle Pipeline Orchestration & Driver Integration

## Task Description
作为 M2 核心实施工程师（teamwork_worker），请在 `packages/agent-control-plane/pipeline/` 下实现生命周期流水线编排器（`PipelineContext.mjs`, `ControlPlanePipeline.mjs`, `SdkHooksAdapter.mjs`），更新 `packages/agent-control-plane/index.mjs`，并无缝集成挂载到 `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs`，确保作为底座控制平面静默自动执行。编写独立管道测试 `tests/unit/test-control-plane-pipeline.mjs`，确保单元与集成测试全绿通过。

## Exclusive Write Ownership
你独占以下文件的创建与修改权限：
- `packages/agent-control-plane/pipeline/PipelineContext.mjs`
- `packages/agent-control-plane/pipeline/ControlPlanePipeline.mjs`
- `packages/agent-control-plane/pipeline/SdkHooksAdapter.mjs`
- `packages/agent-control-plane/index.mjs`
- `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs`
- `tests/unit/test-control-plane-pipeline.mjs`

## Detailed Implementation Specifications
1. **`PipelineContext.mjs` (<= 150 lines)**:
   - 管理会话生命周期状态：`sessionId`, `turnIndex`, `stepCounter`, `lastIntent`, `activeCapabilities`, `toolHistory`, `snapshotStore`。
   - 提供状态重置、快照提取与转存接口。
2. **`ControlPlanePipeline.mjs` (<= 250 lines)**:
   - 依赖 8 项解耦的 Helper，实现 5 大生命周期阶段流转：
     - `onUserPromptSubmit(prompt)`: 依次执行 Helper 1 (IntentPreflight) 与 Helper 5 (PromptDistillation)。
     - `prepareSystemPrompt(baseStaticPrompt, dynamicTail)`: 执行 Helper 2 (PromptCacheLock) 实施尾部注入。
     - `filterTools(tools)`: 执行 Helper 6 (ToolSlimming) 按意图能力集裁剪与瘦身。
     - `createMcpGatewayServer()`: 执行 Helper 7 (McpMetaTooling) 折叠为 2 个高阶元工具。
     - `loadSkill(name, content)`: 执行 Helper 8 (SkillCapsule) 蒸馏为 <= 180 字符微胶囊并读写缓存。
     - `handlePreToolUse(input)`: 拦截工具调用，解包元工具调用或注入 steering override。
     - `handlePostToolUse(output)`: 依次执行 Helper 3 (ProgressiveDisclosure: Layer 2 <= 180 字符) 与 Helper 4 (StepScrubber: step=6 阶梯衰减)。
3. **`SdkHooksAdapter.mjs` (<= 120 lines)**:
   - 将 `ControlPlanePipeline` 转换为 `@anthropic-ai/claude-agent-sdk` 的原生 hooks 结构（`PreToolUse`, `PostToolUse` 等）。
4. **`ClaudeAgentSdkDriver.mjs` (修改 <= 40 lines，总行数保持 <= 250 lines)**:
   - 实例化或挂载 `ControlPlanePipeline`，在构建 `queryOptions` 时自动装配 Hooks 与 System Prompt 尾部注入，实现类似 `cindy_help` 的底座 Helper 静默生效。
5. **`tests/unit/test-control-plane-pipeline.mjs`**:
   - 针对完整的 Pipeline 流水线编排编写原生 `node:test` 测试用例，覆盖输入摄入、Prompt 尾部注入、工具过滤、PostToolUse 去脂与 Step=6 阶梯衰减全流程。

## Hard Constraints
- 单文件行数严格 `<= 600` 行（所有文件目标 120-250 行）。
- 原生 Node.js 18+ ESM 语法。
- 保证 `node --test tests/unit/*.mjs` 与 `node --test tests/test-agent-control-plane-e2e.mjs` 全部 100% 绿灯通过。

## MANDATORY INTEGRITY WARNING
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
