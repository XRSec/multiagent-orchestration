# 技术勘测与架构评估报告 (Technical Survey & Monorepo Architecture Assessment)

## 1. 核心勘测结论速览 (Executive Summary)
经过对 `multiagent-orchestration` 仓库根目录、`apps/`、`packages/`、`src/`、`tests/`、`docs/` 及相关配置文件的全面勘测：
1. **仓库架构**：当前仓库为 Node.js 原生 ESM 单包多目录架构（Single-package multi-directory monorepo pattern）。根目录由 `package.json` 统一管理依赖，**根目录当前无 `pnpm-workspace.yaml`**（子模块 `extensions/cindy` 内部含有其独立 workspace，但不作用于主仓库）。
2. **测试与类型体系**：主仓库目前采用 Node.js 原生测试体系（`node:test` + `node:assert/strict`），**无 Vitest/Jest/tsconfig.json 依赖**，执行速度极快（全量运行毫秒级），与 `AGENTS.md` 规范深度契合。
3. **SDK 使用现状**：项目已深度依赖 `@anthropic-ai/claude-agent-sdk@^0.3.316`，核心集成点为 `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs`（通过 `query`、`PreToolUse` hooks 及 `appendSystemPrompt` 实现运行时驱动）与 `apps/desktop/src/main/orchestrator/InProcessOrchestratorMcp.mjs`（通过 `createSdkMcpServer` 挂载进程内编排工具）。
4. **控制平面落地方案**：强烈推荐在 `packages/agent-control-plane` 下独立设立控制平面 Helper 模块。8 项核心原子能力按文件夹与独立类彻底解耦，由单文件 `<= 250` 行的精炼模块组成，严格满足单文件 `<= 600` 行规范，并通过 `ControlPlanePipeline` 生命周期流水线与 Claude Agent SDK 的 hook/options 对接。

---

## 2. 观察详情 (Observation)

### 2.1 仓库包管理与工作区结构
- **根目录 package.json** (`/Users/xr/IDEA.localized/multiagent-orchestration/package.json`):
  - `"type": "module"`, `"main": "src/index.mjs"`
  - 核心依赖：`@anthropic-ai/claude-agent-sdk: "^0.3.316"`, `claude-code-parser: "^0.1.1"`, `react: "^19.3.1"`, `react-dom: "^19.3.1"`, `lucide-react: "^1.66.0"`。
  - devDependencies：`@vitejs/plugin-react: "^6.1.2"`, `vite: "^8.3.5"`。
  - 脚本：
    ```json
    "scripts": {
      "start": "node src/index.mjs chat",
      "ui": "vite",
      "test": "node tests/test-sdk-orchestrator.mjs",
      "agents:link": "node scripts/link-agents.mjs"
    }
    ```
- **工作区配置现状**：
  - 执行 `cat pnpm-workspace.yaml` 返回：`cat: pnpm-workspace.yaml: No such file or directory`。
  - `apps/desktop/` 与 `packages/steering-hook/`、`packages/runtime-assets/` 下均无单独的 `package.json`。
  - 子模块 `extensions/cindy/` 是独立 Git submodule（`.gitmodules`），其内部自带独立的 `pnpm-workspace.yaml` 与 `vitest.config.ts`。主仓库代码并未继承该配置。
- **TypeScript 与测试框架**：
  - 主仓库无 `tsconfig.json`。
  - 主仓库测试框架为 Node.js 内置的 `node:test` 与 `node:assert/strict`。执行 `node --test tests/*.test.mjs` 输出 13 个用例全部通过（耗时 82ms）。
  - 执行 `pnpm test`（即 `node tests/test-sdk-orchestrator.mjs`）验证了 SDK In-Process MCP 及 SteeringController，3 个断言全部通过。

### 2.2 Claude Agent SDK 现有使用方式
1. **`apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs` (190 lines)**:
   - Line 13: `import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';`
   - Line 110-137: 在 `queryOptions.hooks` 中挂载 `PreToolUse` 与 `PostToolUse`。在 `PreToolUse` 钩子中，如果检测到 `this.memorySteeringDirective`，原子化清除并返回 `{ additionalContext: "[STEERING_OVERRIDE]: ..." }`。
   - Line 139-148: 组装 `queryOptions`，支持 `appendSystemPrompt`、`cwd`（沙箱隔离）、`abortController`、`maxTurns`、`disallowedTools`、`mcpServers`、`resume`。
   - Line 151-158: 调用 `query({ prompt, options: queryOptions })` 获取异步消息流并分发 `system`、`stream_event`、`tool_use`、`tool_result`、`result` 事件。
2. **`apps/desktop/src/main/orchestrator/InProcessOrchestratorMcp.mjs` (179 lines)**:
   - Line 11: `import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';`
   - Line 17-128: 使用 `tool()` 与 `zod` 注册了 3 个核心编排工具：`dispatch_and_queue_partners`、`await_partner_queue`、`steer_or_repair_partner`。
   - Line 167-171: 通过 `createSdkMcpServer({ name: 'nexus-orchestrator-mcp', version: '1.0.0', tools: [...] })` 组装进程内 MCP 服务，零 IPC 延迟直接挂载到主编排器中。
3. **SDK 导出能力勘测** (`node -e "import('@anthropic-ai/claude-agent-sdk').then(...)"`):
   - 包含核心能力常量：`HOOK_EVENTS`（包括 `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `PreCompact`, `PostCompact`, `InstructionsLoaded` 等共 33 个钩子事件）。
   - 包含常数：`SYSTEM_PROMPT_DYNAMIC_BOUNDARY = "__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__"`。

### 2.3 代码规范与行数限制 (`AGENTS.md` & `docs/dev-rules/script-standards.md`)
- `SCRIPT_STANDARDS_SPEC`:
  - 目标代码行数：`<= 600` 行。
  - 解耦预警阈值：`>= 500` 行。
  - 硬性红线拆分：`> 800` 行（必须拆分为模块化子文件）。
  - 函数圈复杂度 `<= 10`，函数行数 `<= 50`。
  - 文件头部必须包含 3-4 行统一规范注释（Purpose, Context, Usage, Prerequisites）。
  - 双平面隔离：构建平面（`apps/**`, `packages/**`, `scripts/**`）严禁污染运行时沙箱（`~/.multiagent-orchestration/`）。

---

## 3. 逻辑推导链 (Logic Chain)

1. **结构推导**：
   - 观察到：根目录 `package.json` 包含全部依赖，且无 `pnpm-workspace.yaml`，子目录均直接由 Node.js ESM 原生解析机制解析。
   - 观察到：`AGENTS.md` 明确将 `/packages/steering-hook/**` 与 `/apps/desktop/**` 并列定义为 `Build-Time Plane`。
   - 推导结论：在 `packages/` 下建立新的独立模块包 `packages/agent-control-plane` 最契合现有目录拓扑与规范，既保持了纯净的包语义与边界，又无需强行引入复杂重型的 monorepo 隔离构建链路。

2. **解耦推导**：
   - 观察到：需求 R1 要求 8 项核心原子能力彻底解耦，绝不拼成 1 个大杂烩；`SCRIPT_STANDARDS_SPEC` 要求单文件 `<= 600` 行。
   - 推导结论：每个能力应设立独立的目录与核心实现文件（例如 `helpers/intent-preflight/IntentPreflightHelper.mjs`），代码规模各维持在 100~300 行之间。
   - 各 Helper 只暴露纯计算接口或自包含缓存机制，Helper 之间零交叉引用。状态共享与顺序编排完全交由管道中间件容器（`PipelineContext`）管理。

3. **流水线推导**：
   - 观察到：SDK 原生提供 `queryOptions`（`appendSystemPrompt`、`hooks` 等），支持挂载 `PreToolUse`、`PostToolUse` 等 in-memory hook。
   - 观察到：8 项能力的生效阶段分布在：
     - Phase 1（Prompt 阶段）：意图预检 (Helper 1)、Prompt 提炼 (Helper 5)、Prompt Cache 尾部注入保护 (Helper 2)。
     - Phase 2（注册与初始化阶段）：MCP 折叠与快照 (Helper 7)、Tools Schema 精炼 (Helper 6)、Skill 胶囊提取 (Helper 8)。
     - Phase 3（执行中拦截阶段）：上下文三层渐进披露 (Helper 3)、PreToolUse 拦截。
     - Phase 4（多轮上下文衰减阶段）：Step-based 工具输出阶梯衰减 (Helper 4, chunk-aligned step=6)。
   - 推导结论：需要在 `packages/agent-control-plane/pipeline/` 中实现统一的流水线协调器 `ControlPlanePipeline`，提供清晰的阶段生命周期方法（如 `onPromptSubmit`、`prepareSystemPrompt`、`filterToolSchema`、`onPreToolUse`、`scrubHistory`），在进入 SDK 前后精准编排。

4. **测试体系推导**：
   - 观察到：主仓库现有测试（如 `tests/test-sdk-orchestrator.mjs`）使用原生 `node:test` 和 `node:assert/strict`，测试执行瞬时完成（80ms），无构建依赖。
   - 推导结论：控制平面与 8 项 Helper 的单元测试及基于 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 的 Mock 集成测试应统一遵循 `node:test` 规范，放置在 `tests/control-plane/` 目录下，并更新 `package.json` 中的 `pnpm test` 使其全量覆盖。

---

## 4. 控制平面 Helper 架构设计方案建议 (Control Plane Architecture Proposal)

### 4.1 目录拓扑与文件清单
建议在 `/packages/agent-control-plane/` 下创建如下结构：

```text
packages/agent-control-plane/
├── index.mjs                                  # 统一导出门面 (Facade)
├── constants.mjs                              # 常量与阈值 (如 MAX_CAPSULE_LEN=180, SCRUB_STEP=6)
├── pipeline/
│   ├── ControlPlanePipeline.mjs               # 核心流水线编排器 (<= 250 行)
│   ├── PipelineContext.mjs                    # 会话生命周期状态与缓存容器 (<= 150 行)
│   └── SdkHooksAdapter.mjs                    # 映射为 SDK queryOptions / hooks 的适配器 (<= 150 行)
└── helpers/
    ├── intent-preflight/
    │   └── IntentPreflightHelper.mjs          # 能力 1: 毫秒级意图预检 + 0ms 顺延词直通 (<= 200 行)
    ├── prompt-cache-lock/
    │   └── PromptCacheLockHelper.mjs          # 能力 2: 静态 System Prompt 锁定 + 尾部注入 (<= 180 行)
    ├── progressive-disclosure/
    │   └── ProgressiveDisclosureHelper.mjs    # 能力 3: 三层渐进披露 (折叠 -> ≤180字符胶囊 -> 切片) (<= 260 行)
    ├── step-scrubber/
    │   └── StepScrubberHelper.mjs             # 能力 4: Chunk-aligned step=6 工具输出衰减 (<= 200 行)
    ├── prompt-distillation/
    │   └── PromptDistillationHelper.mjs       # 能力 5: 客套去噪与冷热前缀分离 (<= 200 行)
    ├── tool-slimming/
    │   └── ToolSlimmingHelper.mjs             # 能力 6: Schema 精炼与预编译哈希缓存 (<= 220 行)
    ├── mcp-meta-tooling/
    │   └── McpMetaToolingHelper.mjs           # 能力 7: MCP 折叠为 gateway 元工具 + 快照缓存 (<= 250 行)
    └── skill-capsule/
        └── SkillCapsuleHelper.mjs             # 能力 8: Superpowers 式技能提取 ≤180 字符胶囊 (<= 220 行)
```

### 4.2 模块解耦与接口边界设计
1. **纯净接口**：每个 Helper 实现独立的类，入参为基础数据或只读 Context 快照，返回值包含提炼结果与统计指标（如 `cacheHit`, `charSavings` 等）。
2. **零交叉依赖**：Helper 之间不得相互导入。例如 `SkillCapsuleHelper` 不得导入 `PromptCacheLockHelper`。各模块间的产物通信经由 `PipelineContext` 的标准字段中转。
3. **单文件规模保证**：每个文件严格控制在 150~300 行之间，远低于 500 行解耦预警线，完全符合开发规范。

---

## 5. 潜在技术风险与防御建议 (Technical Risks & Safeguards)

1. **System Prompt 缓存击穿风险**：
   - *风险*：如果变动指令直接拼接在 System Prompt 头部或中间，会导致云端 KV Cache 完全失效。
   - *防御*：`PromptCacheLockHelper` 严格校验 System Prompt 基础内容的一致性哈希，变动的动态指令统一追加至 Tail Injection 区段，或利用 SDK 的 `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 标记隔离。
2. **渐进披露与工具输出历史衰减的抖动风险**：
   - *风险*：若多轮对话中历史工具输出频繁被任意长度改写，可能造成历史消息 Token 序列反复变化，导致缓存重算。
   - *防御*：`StepScrubberHelper` 强制执行 Chunk-aligned（周期 step=6），未达周期的轮次保持不可变；达到周期的轮次执行确定性截断（固定头尾长度 + 固定摘要），确保缓存状态稳定。
3. **Monorepo 依赖解析一致性**：
   - *风险*：主仓库未设 `pnpm-workspace.yaml`，若直接在 `packages/agent-control-plane` 引入新 npm 依赖而不更新根 `package.json`，会导致运行时找不到模块。
   - *防御*：所有必要依赖（如 `zod`、`@anthropic-ai/claude-agent-sdk`）继续由根 `package.json` 统一管理，`packages/agent-control-plane` 内部使用原生 ES Module 语法，直接解析共享 node_modules。

---

## 6. 注意事项与限制 (Caveats)
- 本次勘测严格遵循只读原则，未修改任何仓库主干源码。
- `extensions/cindy/` 作为独立 Git submodule，其自身包含有独立的 `pnpm-workspace.yaml` 与 Vitest 体系；主仓库的控制平面 Helper 仅针对主框架 `multiagent-orchestration` 本身进行设计，不应侵入或改动 `extensions/cindy/` 内部。
- 根目录无 `tsconfig.json`，因此不需要为 `.mjs` 代码执行 `tsc`，但需确保所有代码均为原生 ES Module 规范，语法与 Node.js 18+ 原生兼容。

---

## 7. 最终结论 (Conclusion)
1. **仓库架构明确**：为纯原生 Node.js 18+ ESM 架构，无构建打包负担，测试执行效率极高。
2. **落地位点确定**：在 `/packages/agent-control-plane` 下独立设立控制平面包，不仅完全符合 `AGENTS.md` 的双平面隔离，而且能彻底保证 8 项能力的解耦与单文件行数规范（均在 300 行以内）。
3. **流水线编排完备**：通过 `ControlPlanePipeline` 集中调度 4 个阶段，无缝桥接至 `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs` 的 `queryOptions` 与钩子体系。
4. **验证路径通畅**：基于 `node:test` 编写各 Helper 的单元测试及基于 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 的纯 Mock 对话集成测试，可确保无需外部云端模型调用即可全绿通过。

---

## 8. 独立验证方法 (Verification Method)
后续开发与验收人员可执行以下命令验证当前及后续环境一致性：
1. **测试现有 SDK 与编排器**：
   ```bash
   pnpm test
   # 应输出：All Orchestration & In-Memory Steering tests PASSED!
   ```
2. **测试现有原生测试集**：
   ```bash
   node --test tests/*.test.mjs
   # 应输出：13 passed, 0 failed
   ```
3. **检查代码行数合规性**：
   ```bash
   wc -l apps/desktop/src/main/cli-pool/*.mjs apps/desktop/src/main/orchestrator/*.mjs packages/steering-hook/dist/*.js
   # 验证现有核心文件均 <= 600 行
   ```
4. **验证控制平面新增模块行数**（后续实现后）：
   ```bash
   find packages/agent-control-plane -name "*.mjs" | xargs wc -l
   # 必须全部 <= 600 行
   ```
