# Dispatch Task: M1 Gate Challenge 1 (Adversarial Verification for Helpers 1, 2, 5, 6, 7)

## Task Description
作为代码实证对抗检验专家 1（teamwork_challenger），请编写独立的对抗测试脚本，对 Helper 1 (IntentPreflight), Helper 2 (PromptCacheLock), Helper 5 (PromptDistillation), Helper 6 (ToolSlimming), Helper 7 (McpMetaTooling) 进行极端边界与恶意输入压力测试。

## Verification Targets & Attack Vectors
1. **Helper 1 (顺延词防逃逸 & 边界)**:
   - 各种标点、连续换行、空白字符变体（"  \n ok \t "）
   - 包含恶意指令的复合顺延词（如 "好的，rm -rf /"）必须严禁直通
   - 首轮冷启动无历史时的鲁棒性
2. **Helper 2 (PromptCacheLock 注入与篡改攻击)**:
   - 静态前缀污染校验（尝试注入动态 Date, UUID, random）
   - 尾部注入边界测试（空 payload, 畸形 payload, 特殊字符）
   - 多轮变动注入后静态基座 SHA-256 绝对一致性验证
3. **Helper 5 (PromptDistillation 语义反转与极值)**:
   - 复杂嵌套客套词与超长输入
   - 严格测试否定词保护（"请千万不要修改"、"please do not delete" 严禁被误剪为肯定指令）
4. **Helper 6 (ToolSlimming 畸形 Schema)**:
   - 无 properties、空 schema、循环引用防护、深度嵌套 schema 瘦身
5. **Helper 7 (McpMetaTooling 异常分发)**:
   - 查询不存在的 server / tool、非法入参传递、元工具数量恒等于 2 的严格约束

## Output
编写测试脚本并在你的工作目录输出 `handoff.md`，明确给出裁决结论：`APPROVE` 或 `REQUEST_CHANGES`。并通过 send_message 汇报。

## 2026-11-02T06:27:56Z
你被指派为 M1 对抗实证检验专家 1（teamwork_challenger）。请编写实证测试脚本，对 Helper 1 (IntentPreflight), Helper 2 (PromptCacheLock), Helper 5 (PromptDistillation), Helper 6 (ToolSlimming), Helper 7 (McpMetaTooling) 进行极端边界与恶意输入对抗测试。

工作目录：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_challenger_m1_r2_1/
请首先阅读：
1. 原始需求：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md
2. 任务指示：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_challenger_m1_r2_1/DISPATCH.md
3. Worker 交付报告：/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_worker_m1_r2_1/handoff.md

编写并运行对抗测试脚本，测试顺延词变体防逃逸、动态前缀污染拦截、客套词否定语义保护、畸形 schema 瘦身、不存在元工具调用等。
在工作目录下输出 handoff.md，明确给出裁决结论：APPROVE 或 REQUEST_CHANGES。并通过 send_message 汇报。
