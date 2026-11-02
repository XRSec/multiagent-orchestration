# Handoff Report — M1 基础 Mock 数据体系规范

## 1. Observation (客观观察)

1. **项目规范与行数约束**：
   - `AGENTS.md` 行 13-14 指出：单文件 `<= 600` 行，`500` 行预警，`800` 行硬拆分。
   - `AGENTS.md` 行 17-25 规范了双平面隔离：构建时平面 `/packages/runtime-assets/**`，运行时平面 `~/.multiagent-orchestration/`。禁止在 runtime-assets 下直接创建名为 `CLAUDE.md` 的文件，而是使用 `PARTNER_MANUAL.md`，并通过 `link-agents.ts` 建立软链接。
2. **当前已有前端代码形态**：
   - `apps/desktop/src/renderer/App.jsx` 当前内嵌了简单占位数组 `PARTNERS`（行 10-41）与 `INITIAL_SESSIONS`（行 43-63），缺乏深度字段（缺少 Markdown 正文、分级记忆、双平面沙箱路径结构、分工计划卡模型、实时执行状态）。
   - `apps/desktop/src/renderer/mock/` 目录尚未创建。
3. **Cindy 桌面端分工计划与时间轴模型参考**：
   - `extensions/cindy/packages/maker-shared/src/botGroupChat.ts` 明确了 BotGroupPlan、BotGroupTimelineItem、LiveStatus 的核心数据结构：
     - 计划卡生命周期状态为：`proposed` | `running` | `waiting` | `done` | `stopped` | `dismissed`（行 367-374）；
     - 步骤状态为：`pending` | `running` | `done` | `failed`（行 375）；
     - 消息类别包括：`message` | `plan` | `round-end` | `notice` | `plan-end`（行 37）；
     - 发言模式为：`auto` | `sequential`（行 31）；回复模式为：`all` | `mentioned`（行 29）。
4. **内置真实伙伴配置**：
   - `packages/runtime-assets/builtin-partners/lead-orchestrator/manifest.json` 与 `SOUL.md`：定义了 `lead-orchestrator` 的专属主控 MCP 工具（`dispatch_and_queue_partners`, `await_partner_queue`, `steer_or_repair_partner`）与决策树。
   - `packages/runtime-assets/builtin-partners/agent-architect/manifest.json` 与 `SOUL.md`：定义了 Agent 架构设计与 AST 规范校验。
   - `packages/runtime-assets/builtin-partners/rea-partner/manifest.json` 与 `SOUL.md`：定义了二进制逆向与协议审计伙伴。
   - `~/.multiagent-orchestration/partners/lead-orchestrator/memories/MEMORY.md` 验证了分级记忆格式（第一部分<=200行）。

---

## 2. Logic Chain (推理链条)

1. **从观察 1 与 4 到 `mockPartners.js` 方案**：
   - 伙伴不仅需要基础展示字段（`id`, `name`, `role`, `avatar`, `status`），在伙伴配置抽屉（M3）中还需要查看和编辑 `SOUL.md` 与 `MEMORY.md`，并展示已挂载技能与双平面沙箱路径。
   - 因此，在 `mockPartners.js` 中将真实 AST Markdown 内容提取为 `soulMd` 与 `memoryMd`，并构建符合双平面隔离规范的 `sandboxPaths: { runtimeCwd, buildTimePlane, isSymlinked, allowedTools, disallowedTools }`。
2. **从观察 2 与 3 到 `mockGroupSessions.js` 方案**：
   - 群聊界面（M2）需要多 Agent 差异化时间轴气泡、实时状态条（`BotGroupLiveStatus`）以及 @ 点名路由交互；群聊配置抽屉（M3）需要支持修改群名称、工作目录、成员管理及发言模式切换。
   - 因此，在 `mockGroupSessions.js` 中将消息流设计为包含多 Agent 协作会话，包含用户指令、主控拆解、计划卡嵌入（`kind: 'plan'`）、Agent 审计输出（附带交接文件 `files`）、系统通知（`kind: 'notice'`），并在会话根对象中提供 `liveStatus` 实时状态快照。
3. **从观察 3 到 `mockPlanData.js` 方案**：
   - Cindy 风格的分工计划卡（`BotGroupPlanCard`）要求能展示步骤状态图标（待执行、进行中、完成、失败）、执行耗时、负责人胶囊以及交接文件药丸，并能在不同全局状态下展现不同操作按钮（如待开始时支持编辑换人与开始；进行中时支持暂停与跟进；完成后支持查看交接文件）。
   - 因此，在 `mockPlanData.js` 中提供 `plan-running-01`（进行中）、`plan-proposed-02`（待开始提案）、`plan-done-03`（已归档）3 套覆盖全状态周期的测试数据集。
4. **单文件规范控制**：
   - 经测试，拆分为独立的 `mockPartners.js` (~260行)、`mockGroupSessions.js` (~170行)、`mockPlanData.js` (~170行) 和 `index.js` (~30行)，完全在 80 - 300 行健康区间内，既解耦又合规。

---

## 3. Caveats (潜在考量与假设)

1. **只读探索边界**：
   - 本任务角色为只读调研探索（Teamwork Explorer），因此未直接将代码写入 `apps/desktop/src/renderer/mock/` 生产目录，而是在本工作区内输出了完整的规范文档 `analysis.md` 以及可直接落地的完整代码原型（`proposed_mockPartners.js`、`proposed_mockGroupSessions.js`、`proposed_mockPlanData.js`、`proposed_index.js`）。
2. **前端图标适配假设**：
   - 头像字段使用 Lucide 图标名称（如 `'Bot'`, `'Cpu'`, `'Shield'`）与颜色值，前端渲染时可通过动态组件映射或预置字典渲染，无需引入额外的外部图片静态资源。

---

## 4. Conclusion (结论)

制定了一套全面覆盖四大界面（伙伴私聊、伙伴群聊、伙伴配置抽屉、群聊配置抽屉）的完整 Mock 数据体系规约：
1. **`mockPartners.js`**：规约并实现了 3 大内置伙伴（`lead-orchestrator`、`agent-architect`、`rea-partner`）的完整字段，包含深度 Markdown 正文、分级记忆、结构化技能清单与双平面沙箱路径。
2. **`mockGroupSessions.js`**：规约并实现了 2 组群聊会话，包含 6 条典型多 Agent 联动时间轴消息（包含计划卡关联、交接文件药丸、@ 点名路由、系统通知），以及动态实时状态条数据结构。
3. **`mockPlanData.js`**：规约并实现了 3 组代表性 Cindy 风格 BotGroupPlan 模型，覆盖 running、proposed、done 三种生命周期，包含步骤耗时、产物文件与状态切换契约。
4. 提供了清晰的下游消费指南，可无缝支持 M2、M3、M4 各功能开发。

---

## 5. Verification Method (验证方法)

1. **原型文件完整性验证**：
   - 检查本工作区生成文件：
     - `file:///Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_1/analysis.md`
     - `file:///Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_1/proposed_mockPartners.js`
     - `file:///Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_1/proposed_mockGroupSessions.js`
     - `file:///Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_1/proposed_mockPlanData.js`
     - `file:///Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/teamwork_explorer_m1_1/proposed_index.js`
2. **代码行数与语法合规性检查**：
   - 运行命令 `wc -l proposed_*.js` 确认所有文件均严格 `<= 600` 行。
   - 运行命令 `node -c proposed_*.js` 验证 ES 模块语法解析零报错。
