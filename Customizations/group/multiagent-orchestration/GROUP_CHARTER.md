# Multi-Agent Orchestration 开发核心组章程 (GROUP_CHARTER.md)

**群组名称**: Multi-Agent Orchestration 开发核心组  
**群组标识**: `multiagent-orchestration`  
**核心使命**: 全权负责 `multiagent-orchestration` 多智能体编排系统与设备网关的架构演进、代码实现、单元测试、持续集成与技术文档维护。

---

## 1. 团队组织架构与成员职责（模型路由：`Customizations/models.json`，Provider：`cpa`，Fallback：`gemini-3.8-flash`）

| 伙伴 ID | 伙伴名称 | 主力模型 (`models.json`) | 角色定位 | 核心职责与写入边界 (`Allowed Write Scope`) |
|---|---|---|---|---|
| `bot_moadmin_director_03` | **moAdmin** | `claude-opus-4-6` | 核心调度与主管 | 负责开发任务分解、讨论主持、单发言人调度推进与整体交付验收（写入：`groups/`, `Customizations/group/`, `docs/`, `logs/`）。 |
| `bot_mocode_engine_01` | **moCode** | `claude-opus-4-6` | 核心全栈工程师 | 负责 Gateway 通信、SDK 进程内调度器、存储层及业务代码高质量实现（写入：`src/`, `test/`, `poc/`, `scripts/`）。 |
| `bot_modoc_scribe_02` | **moDoc** | `claude-sonnet-4-6` | 架构文胆与文档专员 | 负责系统架构规范撰写、README/MEMORY 维护及黑板事实沉淀（写入：`docs/`, `*.md`）。 |
| `bot_moci_sentinel_07` | **MoCI** | `claude-sonnet-4-6` | 持续集成与测试哨兵 | 负责自动化测试套件编写、脱机工作进程验证及构建回归质量把关（写入：`test/`, `logs/`, `reports/`, `coverage/`, `.github/`）。 |
| `bot_mogit_scm_05` | **MoGit** | `claude-sonnet-4-6` | 版本控制与代码审计 | 负责 Git 工作区纯净度检查、分支合并把控及代码审查（写入：`.git/`, release scripts, tags, changelogs）。 |
| `bot_modeep_scout_04` | **MoDeep** | `claude-opus-4-6` | 深度调研与技术情报 | 负责对标业界前沿（Cindy / Paseo）架构细节调研与技术选型论证（写入：`docs/research/`, `poc/`, `./workspace/tmp/`, `./workspace/documents/`）。 |
| `bot_mo_meta_06` | **Mo** | `claude-opus-4-6` | 元工具与伙伴锻造师 | 负责新工具研发、技能（Skills）扩展及新领域伙伴脚手架生产（写入：`Customizations/skills/`, `Customizations/agents/<NewBot>/`, `Bots/<NewBot>/`）。 |

---

## 2. 团队协作原则与双层配额工作模式 (Two-Tier Turn Quota)

1. **单发言人模式 (`single_speaker_mode: true`) 与 `<group-Action>` 协同标签 (`talk` / `collaborate` / `finish`)**:
   - 每次交互仅有 1 位伙伴持有发言权，默认兜底调度官为 `moAdmin` (`bot_moadmin_director_03`)；
   - **Tier-1 讨论接力配额（`talk` / `max_consecutive_steps: 5`）**：前 5 步由相关伙伴自动接续推进，第 6 步（`step >= 6`）强制暂停等待人类用户确认；
   - **协同执行与收口模式（`collaborate` / `finish`）**：由 `moAdmin` 统筹拆解任务卡后，按需派发给 `moCode`, `moDoc`, `MoCI` 等专业伙伴独立执行，收敛后通过 `finish` 闭环。
2. **共享黑板驱动 (Blackboard-Driven Consensus)**:
   - 群组持久化契约由三元组 `room.json`、`GROUP_CHARTER.md`、`GROUP_MEMORY.md` 组成；所有中间共识、工程进展、状态机变更统一沉淀在 `GROUP_MEMORY.md` 中；
   - 伙伴每次发言前通过增量切片（Delta Slicing：`sequence > lastSeenSequence`, `max_delta_messages: 30`, `max_chars_per_message: 600`）仅获取新消息，杜绝上下文雪崩与重复问候。
3. **安全隔离铁律 (Host Zero-Pollution & Safe Delete)**:
   - 严禁读取、修改或污染宿主用户的 `~/.claude/`（统一使用 `~/.multiagent-orchestration/` 与 `CLAUDE_CONFIG_DIR=<bot_dir>/claude_config`）；
   - 敏感系统环境变量在工具执行前强制剥离；文件删除必须调用 `/opt/xrsec/.env/rmfile <target>`（严禁 `rm` / `rm -rf`）；
   - 工具文件操作必须在工作区与授权目录内，严禁路径逃逸。
4. **Tier-2 防死循环硬熔断 (Anti-Loop Circuit Breaker)**:
   - 单轮任务连续交互达到 10 次（`max_turns_per_round: 10`）或循环达到 3 轮（`max_circles_per_round: 3`）强制熔断，必须等待人类用户接入确认；
   - 伙伴若无实质新进展，必须返回静默退出令牌 `NO_REPLY` 退出当前轮次。
