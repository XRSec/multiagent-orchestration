为 multiagent-orchestration 项目中的 @anthropic-ai/claude-agent-sdk Runtime 构建系统底座级 / 控制平面（Control Plane）Helper。将 8 项核心原子能力彻底解耦独立实现，并梳理与调整其在 Claude Code Agent SDK 生命周期管道中的精准执行顺序与流转集成。主会话以 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 为基础模拟对话，不调用真实云端大模型，主要用于验证与测试这 8 项辅助能力及管道流转。

Working directory: /Users/xr/IDEA.localized/multiagent-orchestration
Integrity mode: development

## Requirements

### R1. 原子能力彻底解耦独立实现
必须将 8 项核心能力完全拆开独立设计与实现，模块解耦，绝不拼成 1 个大杂烩或所谓的 3 个：
- 能力 1：意图预检（Pre-flight Intent Analysis & Routing），毫秒级分析本轮需求，计算最小必要能力；包含顺延词（"ok", "继续", "好"）的 0ms 旁路直通。
- 能力 2：Prompt Cache 保护（KV Cache Locking），System Prompt 绝对静态化保证，变动指令严格采用尾部注入规范（Tail Injection），锁定云端大模型 95%+ KV 缓存命中。
- 能力 3：上下文去脂与三层渐进披露（3-Tier Progressive Disclosure），Layer 1（名称/元数据折叠，0成本）；Layer 2（≤180 字符高密微胶囊 Capsule）；Layer 3（按需深挖切片）。
- 能力 4：历史工具输出阶梯衰减（Step-based Tool Output Scrubbing），针对多轮执行中累积的大型工具输出，按固定步长周期（Chunk-aligned step=6）进行头尾截断与摘要衰减，既防雪球效应，又防历史抖动击穿 Cache。
- 能力 5：Prompt 提炼 + 缓存（Prompt Distillation & Prefix Cache），冗余客套指令精炼，静态前缀与动态参数冷热分离，维护确定性前缀缓存。
- 能力 6：Tools 提炼 + 缓存（Tools Schema Slimming & Pre-compiled Cache），工具 Schema 精炼（去无用描述/示例），按意图动态暴露最小集，静态 Schema 哈希预编译缓存。
- 能力 7：MCP 提炼 + 缓存（MCP Meta-Tooling & Snapshot Cache），外部 MCP 接口折叠为元工具（如 `gateway.list_tools` + `gateway.call_tool`），工具列表快照本地缓存。
- 能力 8：Skill 提炼 + 缓存（Skill Distillation & Capsule Cache），类似 superpowers 的巨型技能首次读取后渐进蒸馏为 ≤180 字符胶囊，建立强哈希校验落盘缓存。
代码模块遵循项目现有规范与架构（可置于 packages/ 或 apps/），由团队根据 monorepo 架构最佳实践落地。

### R2. SDK 生命周期流水线编排与执行顺序调整
在 Claude Code Agent SDK 生命周期（如 PreToolUse 钩子、Context 过滤管道、Message 转换、MCP 注册）中梳理并调整好各能力的精准执行顺序与流水线流转，确保作为类似 cindy_help 机制的底座 Helper 静默/自动调用。

### R3. 模拟对话驱动验证
以 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 为基准配置模拟对话环境；主会话不发起真实模型调用，全部通过 Mock 对话驱动与测试这 8 项能力的提炼、裁剪、缓存以及 SDK 生命周期管道流转。

## Verification Resources
- 自动化单元测试套件：针对 8 项原子能力分别编写独立的自动化单元测试用例。
- Mock SDK Pipeline 集成测试：基于 mock SDK pipeline 事件流与模拟对话上下文执行集成测试。

## Acceptance Criteria

### 模块解耦与单元测试
- [ ] 8 项原子能力各自作为独立模块解耦实现，各模块无不合理的相互强耦合
- [ ] 每个原子能力模块均有独立、可全绿运行的自动化单元测试用例：
  - [ ] 意图预检模块测试包含对顺延词（"ok", "继续", "好"）的 0ms 旁路直通验证
  - [ ] Prompt Cache 保护模块测试验证 System Prompt 静态化与尾部注入规范
  - [ ] 上下文去脂模块测试验证三层披露（Layer 1 折叠、Layer 2 ≤180 字符微胶囊、Layer 3 按需切片）
  - [ ] 历史工具输出阶梯衰减模块测试验证基于 chunk-aligned step=6 的截断与摘要衰减
  - [ ] Prompt 提炼模块测试验证冷热分离与确定性前缀缓存
  - [ ] Tools 提炼模块测试验证 Schema 精炼与哈希缓存
  - [ ] MCP 提炼模块测试验证元工具折叠（gateway.list_tools/call_tool）与快照缓存
  - [ ] Skill 提炼模块测试验证 ≤180 字符胶囊生成与强哈希校验

### 管道生命周期流转与模拟验证
- [ ] 在 Claude Code Agent SDK 生命周期各阶段（PreToolUse 钩子、Context 过滤管道、Message 转换、MCP 注册）中，8 项能力的执行次序清晰、定义完备
- [ ] 提供基于 Claude ID `2efe9e50-4306-497b-8b76-c112ffbd5d78` 模拟对话场景的 SDK 集成测试，全程无需调用真实外部模型接口，测试运行通过
