# Dispatch History

## 2026-11-02T15:01:39Z

实现 multiagent-orchestration 的 CLI 轻量 REPL 可视化群聊交互脚本，支持选择群聊房间、向群内伙伴发送消息或 @伙伴 调用真实 Agent 进程执行任务，并遵循规范实现消息与会话的持久化回溯。

Working directory: /Users/xr/IDEA.localized/multiagent-orchestration
Integrity mode: development

参考文档: docs/dev-rules/bot-group-orchestration.md, AGENTS.md

## Requirements

### R1. CLI 轻量交互脚本与房间选择
在 `scripts/` 下提供可执行的轻量命令行 REPL 脚本（例如 `scripts/cli-room.ts`）。脚本运行后列出并允许用户选择进入群聊房间（预设群聊名称为 `multiagent-orchestration`）。在房间内支持终端提示符交互输入、查看消息流，以及支持向群内发送消息或使用 `@伙伴名称` 触发指定伙伴执行任务并展示其真实回复。

### R2. 群聊伙伴配置与自动就绪
群聊核心伙伴包括：Cindy 的 DocSkill 维护官、Nexus · 多智能体统筹调度官、Cindy_R、REA、两位写代码工程师、一位排错工程师。脚本运行或初始化时，优先检查并复用项目中已有的 Cindy 相关文档与预设资产（如已有伙伴配置、角色描述与 SOUL.md），避免重复手动构造；在此基础上对缺失的伙伴自动在 `~/.multiagent-orchestration/partners/` 补全生成基础配置与 `SOUL.md`，确保各伙伴在群聊中均可被正确识别、寻址并参与协同。

### R3. 真实 Agent 进程驱动与执行对接
当用户在群聊中 @伙伴 发送任务指令时，基于项目现有的底层 Agent 调度与进程驱动（Claude CLI / Agent 运行时）真实拉起并驱动目标伙伴执行，获取其回复并输出至终端群聊消息流中。

### R4. 消息与会话可回溯机制
严格遵循项目群聊架构规范（`docs/dev-rules/bot-group-orchestration.md`）：
1. 房间聊天记录完整持久化在群聊存储中，支持历史记录全量回溯展示。
2. 每次群聊发生的消息与交互轮次均建立独立会话记录，并完整记录每条消息正文的原始 ID（messageId）、发送方标识（author/sender）、时间戳与单调递增序列号（sequence），确保回溯审计链条完整。

## Acceptance Criteria

### CLI 交互与房间管理
- [ ] 运行脚本能正常进入交互式终端，成功列出并进入 `multiagent-orchestration` 群聊房间。
- [ ] 终端支持接收用户消息输入，并能准确解析 `@伙伴` 指令与文本内容。

### 伙伴配置与就绪
- [ ] 脚本执行后，`~/.multiagent-orchestration/partners/` 中完整包含 7 位群聊伙伴（Cindy DocSkill 维护官、Nexus · 多智能体统筹调度官、Cindy_R、REA、2位代码工程师、1位排错工程师）的有效配置及 `SOUL.md`。
- [ ] 验证对项目中已有 Cindy 预设文档与伙伴资产进行了优先复用，其余缺失伙伴被自动生成补全。

### Agent 驱动与响应
- [ ] 在群聊中 @指定伙伴 发送任务时，能正确调用底层 Agent 运行时拉起真实进程，并将伙伴返回的执行回复正确渲染在终端。

### 消息回溯与持久化验证
- [ ] 群聊记录持久化文件中准确记录了每条消息的原始 ID、发送方、正文、时间戳和递增序列号。
- [ ] 退出脚本后重新进入该房间，历史消息与发送方元数据能完整加载与回溯呈现。
- [ ] 编写并执行自动化测试脚本（例如无交互 CLI 驱动测试），验证房间选择、伙伴初始化、消息记录及元数据回溯全链路无报错，测试退出码为 0。


## 2026-11-02T16:35:03Z

将 multiagent-orchestration 群聊与多智能体协同能力完整接入到 apps/web/ 前端应用中，重点实现群聊房间管理、历史消息流展示、以及 @伙伴 触发真实 Agent 执行与流式渲染。

Integrity mode: development

参考规范与已有实现：
- docs/dev-rules/bot-group-orchestration.md
- scripts/lib/room-storage.ts
- scripts/lib/partner-scaffold.ts
- scripts/lib/agent-driver.ts
- scripts/cli-room.ts

## Requirements

### R1. 房间列表与管理（apps/web/）
在 apps/web/ 前端界面中实现群聊房间的展示与切换，支持查看并选择预设的 multiagent-orchestration 房间及其他可用房间，保持房间状态与底层持久化（~/.multiagent-orchestration/groups/<room_slug>/）同步。

### R2. 历史消息流展示与序列同步
界面完整渲染房间的历史消息流，严格按照底层单调自增 sequence 顺序展示，包含发送者元数据（用户或对应伙伴身份），支持加载与回溯历史消息。

### R3. 消息发送与 @伙伴 驱动交互
提供消息输入框，支持用户发送文本消息；支持通过 @伙伴 语法指定伙伴并触发对应的 Agent 驱动逻辑，将真实 Agent 的响应流式或即时渲染到当前群聊消息流中。

### R4. 数据流桥接与前后端协同
建立 apps/web/ 前端与底层群聊存储（room-storage）及 Agent 驱动（agent-driver）之间的数据通信通道，确保消息收发、Agent 触发与执行状态变更在前端能够即时响应与更新。

## Acceptance Criteria

### 功能完整性
- [ ] apps/web/ 前端可正常列出并切换群聊房间（包括 multiagent-orchestration 预设房间）
- [ ] 房间内消息流按底层 sequence 序列准确渲染，发送者信息与内容完整展示
- [ ] 用户在输入框输入并发送消息后，消息即时追加至房间流并持久化
- [ ] 输入框中包含 @<伙伴名称> 时，能成功触发对应伙伴 Agent 并在界面中渲染其回复

### 工程与构建验证
- [ ] 执行 pnpm typecheck 无类型错误
- [ ] 执行 pnpm test 测试通过
- [ ] 执行 pnpm web:dev 前端服务可正常启动并在浏览器中完成上述核心交互流程
