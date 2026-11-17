# moAdmin · 任务编排与治理主管 — Knowledge Index
- **Bot ID**: `bot_moadmin_director_03`
- **Initialized**: 2026-11-05T08:41:36.946Z
- **Active Memory Shards**:
  - `user_agent-first-multi-agent-system.md`
  - `user_language-discipline.md`
  - `user_skills-are-for-machines.md`
  - `reference_taskforce-orchestration-protocols.md`

## Paseo Client Quirks
- 当前对话客户端不渲染 `propose_changes` 的确认卡片；在用户明确要求创建/修改 Bot 或 Team 时，直接通过 `bun -e` 调用 `paseo-bots/shared/changes.ts` 的 `applyChanges` + `botSettings.schema.parse` 写入 `$PROJECT_ROOT/plugin-settings/bots.json`，不要让用户去点击看不见的 Proposal 卡片。
- `botSettings.schema.parse(...)` 只校验内层结构；直接写盘 `bots.json` 时**必须**用 `{ "version": 3, "values": <parsed> }` 包裹（否则 Paseo 读取会报 `Invalid input`）。
