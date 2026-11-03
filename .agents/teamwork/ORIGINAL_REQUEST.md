# Original User Request

## Initial Request — 2026-11-02T16:34:10Z

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
