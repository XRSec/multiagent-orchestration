# Dispatch Task: 8 Core Atomic Capabilities Technical Specification & Decomposition

## Task Description
作为技术勘测与架构专家（Explorer 2），请深入分析与梳理需求中规定的 8 项核心原子能力，制定彻底解耦的技术规格、输入输出契约与单测用例设计。

## 8 Core Atomic Capabilities to Analyze
1. **意图预检 (Pre-flight Intent Analysis & Routing)**: 毫秒级分析本轮需求，计算最小必要能力；包含顺延词（"ok", "继续", "好", "yes", "proceed" 等）的 0ms 旁路直通逻辑。
2. **Prompt Cache 保护 (KV Cache Locking)**: System Prompt 绝对静态化保证，变动指令严格采用尾部注入规范（Tail Injection），锁定云端大模型 95%+ KV 缓存命中。
3. **上下文去脂与三层渐进披露 (3-Tier Progressive Disclosure)**:
   - Layer 1: 名称/元数据折叠，0成本
   - Layer 2: <= 180 字符高密微胶囊 Capsule
   - Layer 3: 按需深挖切片 (on-demand slice retrieval)
4. **历史工具输出阶梯衰减 (Step-based Tool Output Scrubbing)**: 多轮执行大型工具输出，按固定步长周期（Chunk-aligned step=6）进行头尾截断与摘要衰减，防雪球效应与 Cache 击穿。
5. **Prompt 提炼 + 缓存 (Prompt Distillation & Prefix Cache)**: 冗余客套指令精炼，静态前缀与动态参数冷热分离，维护确定性前缀缓存。
6. **Tools 提炼 + 缓存 (Tools Schema Slimming & Pre-compiled Cache)**: 工具 Schema 精炼（去无用描述/示例），按意图动态暴露最小集，静态 Schema 哈希预编译缓存。
7. **MCP 提炼 + 缓存 (MCP Meta-Tooling & Snapshot Cache)**: 外部 MCP 接口折叠为元工具（如 `gateway.list_tools` + `gateway.call_tool`），工具列表快照本地缓存。
8. **Skill 提炼 + 缓存 (Skill Distillation & Capsule Cache)**: 巨型技能首次读取后渐进蒸馏为 <= 180 字符胶囊，建立强哈希校验落盘缓存。

## Key Requirements
- 8 项能力必须彻底解耦独立实现，绝不能拼成大杂烩。
- 每个模块均必须设计独立的自动化单元测试用例，全绿运行。
- 单文件代码行数 <= 600 行（500 行预警）。

## Output
在 `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_2/handoff.md` 输出勘测报告。必须包含：
- 8 项能力的独立模块定义、接口类型签名与数据结构
- 各能力的单元测试覆盖策略与关键断言清单
- 彻底解耦的模块间边界设计

## 2026-11-02T05:59:50Z
Received dispatch from dbf02e0c-b5f1-48f7-bdf7-6fb480aab20c:
你被指派为 8 项核心原子能力技术规范与解耦设计专家（Explorer 2）。
工作目录：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_survey_r2_2/
勘测重点：
详细分析并设计 8 项核心原子能力（完全解耦、独立模块实现）：
1. 意图预检 (Pre-flight Intent Analysis & Routing)
2. Prompt Cache 保护 (KV Cache Locking)
3. 上下文去脂与三层渐进披露 (3-Tier Progressive Disclosure)
4. 历史工具输出阶梯衰减 (Step-based Tool Output Scrubbing)
5. Prompt 提炼 + 缓存 (Prompt Distillation & Prefix Cache)
6. Tools 提炼 + 缓存 (Tools Schema Slimming & Pre-compiled Cache)
7. MCP 提炼 + 缓存 (MCP Meta-Tooling & Snapshot Cache)
8. Skill 提炼 + 缓存 (Skill Distillation & Capsule Cache)
产出要求：在工作目录下输出 handoff.md，包含每个能力的独立模块接口签名、数据结构、单测覆盖策略与解耦边界设计。完成后通过 send_message 向协调器汇报。
