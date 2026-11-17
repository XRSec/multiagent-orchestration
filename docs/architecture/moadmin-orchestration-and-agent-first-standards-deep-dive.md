# moAdmin 编排架构、用户真实需求翻译与 Agent-First 协议深度设计规范全集

> **文档标识**：`ARCH-SPEC-2026-MOADMIN-CORE`  
> **文档版本**：v2.2.0-ENTERPRISE  
> **生效时间**：2026-11-06  
> **适用范围**：multiagent-orchestration, Cindy Multi-Bot Engine, Claude Code SDK Runtime  
> **核心原则**：宿主代码确定性治理 (Deterministic Host Orchestration) · 高信噪比背景增强 · 缓存友好 · Agent-First 机器纪律

---

## 目录

1. [执行摘要与全局架构全景](#1-执行摘要与全局架构全景)
2. [群聊伙伴 moAdmin 设计原理 (专员 A 调度中枢)](#2-群聊伙伴-moadmin-设计原理-专员-a-调度中枢)
3. [用户真实需求翻译理念 (Prompt Distill 架构哲学)](#3-用户真实需求翻译理念-prompt-distill-架构哲学)
4. [多轮 LLM 交互需求演进与长序列防漂移体系](#4-多轮-llm-交互需求演进与长序列防漂移体系)
5. [群聊、话题与私聊三层消息模型与黑板系统](#5-群聊话题与私聊三层消息模型与黑板系统)
6. [Agent 实例拓扑与跨群秘书拆分边界 (A/B 架构推演)](#6-agent-实例拓扑与跨群秘书拆分边界-ab-架构推演)
7. [Agent-First 协议与规范落地 (CLAUDE.md 与 agent-first-docs)](#7-agent-first-协议与规范落地-claudemd-与-agent-first-docs)
8. [脚本工程规范演进与重构 (Script Standards)](#8-脚本工程规范演进与重构-script-standards)
9. [系统落地资产与拓扑映射全表](#9-系统落地资产与拓扑映射全表)

---

## 1. 执行摘要与全局架构全景

在多智能体（Multi-Agent）群聊和工程交付体系中，单纯的“让几个 AI 进一个大聊天室”必定引发三大工程灾难：
1. **上下文雪崩与幻觉共振**：多 Bot 抢答，互相引用未经验证的推测，导致上下文迅速失控，Token 费用指数级爆炸；
2. **死循环与回声震颤**：缺乏中心状态机，Bot 之间因礼貌寒暄和自发 `@` 形成无限递归调用；
3. **人类意图与机器执行脱节**：人类的口语表达是模糊、跳跃、代词化的，而底层代码工具需要精准的文件路径、确定性参数和严格红线。

本项目通过确立 **“宿主代码确定性治理”**、**“专员 A (moAdmin) 任务总控”**、**“Prompt Distill 意图提炼门禁”** 与 **“Agent-First 机读协议”**，构建了工业级多智能体协同流水线。

```mermaid
flowchart TD
    User([人类所有者]) -->|口语化粗糙指令| PromptDistill[Prompt Distill 拦截门禁]
    
    subgraph S1["意图提炼与安全网关"]
        PromptDistill -->|0ms规则命中| FastPass[0ms 直通放行: CLI/确认词/紧急阻断]
        PromptDistill -->|未命中| LightLLM[轻量小模型提炼: 四要素结构化]
        LightLLM --> Guardrail{保真门禁校验}
        Guardrail -->|失真/代码注入| FailOpen[Fail-Open: 原文透传]
        Guardrail -->|通过| Augment[尾端追加: G0/Action/Target/Constraints]
    end

    FastPass --> Router{消息路由器}
    FailOpen --> Router
    Augment --> Router

    subgraph S2["确定性编排总线 (moAdmin)"]
        Router -->|无显式@点名| moAdmin[moAdmin 自动接管: Fallback Dispatch]
        Router -->|显式@指定Bot| Dispatcher[单发言人调度器]
        moAdmin -->|意图澄清与拆解| TaskPlan[生成任务卡: talk / work]
        TaskPlan --> Dispatcher
    end

    subgraph S3["执行平面与数据隔离"]
        Dispatcher -->|单调步进 1..5| BotRoster["专业伙伴 (moCode / moDoc / MoCI / MoDeep)"]
        BotRoster -->|Patch 提交| Blackboard[(共享黑板: GROUP_MEMORY.md)]
        BotRoster -->|无增量输出| NoReply[NO_REPLY 拦截: 0气泡静默退出]
        BotRoster -->|步骤>=5| Suspend[挂起卡片: 等待人类点击继续]
    end
```

---

## 2. 群聊伙伴 moAdmin 设计原理 (专员 A 调度中枢)

`moAdmin`（`bot_moadmin_director_03`）在 7 位核心伙伴中处于指挥枢纽地位，担任 **任务编排主管、任务拆解与兜底协调员（Orchestration Director & Fallback Coordinator）**。

### 2.1 角色定义与最小特权边界 (Separation of Concerns)
* **职能定位**：专职负责倾听用户输入、澄清模糊目标、分析多轮上下文、生成执行计划、管理共享黑板、分配专业伙伴。
* **写权限硬红线**：
  * **允许写入**：`groups/`、`docs/`、`logs/`；
  * **严禁越权**：**严禁直接修改业务代码（`src/`、`packages/`）**。
* **设计哲理**：调度者绝不能既当裁判员又当运动员。涉及代码修改必须派发给 `moCode`，文档编写派发给 `moDoc`，测试验证派发给 `MoCI`。

### 2.2 Fallback 接管机制 (无显式 @ 时的兜底保障)
在多 Bot 场景中，强迫用户每次输入都精确 `@` 某位 Bot 会带来极高的认知负荷。
* **判定逻辑**：当人类在群中发送消息，且文本中未包含任何显式的 `@Bot` 或富文本 Bot URI 时；
* **宿主行为**：系统自动将消息所有权指派给 `moAdmin`。`moAdmin` 作为“总接待秘书”接管，读取共享黑板最新水位，完成意图翻译与拆分，杜绝全员哄抢或全员静默。

### 2.3 确定性单发言人编排：讨论卡 (talk) 与分工卡 (work)
系统全面废弃多 Agent 自主抢答，采用宿主状态机控制的单发言人流转：
* **讨论卡 (`talk`)**：
  * 适用场景：多视角方案论证、技术方案权衡、方案评审；
  * 行为特征：串行唤醒各被点名的 Bot，在群时间线输出思考；
  * **5 步人工接力断言**：前 5 位 Bot 自动顺延，第 6 位起强制进入 `SUSPENDED_WAIT_CONTINUE` 挂起状态。若人类不点击「继续」，系统坚决不自发拉起后续 Bot。
* **分工卡 (`work`)**：
  * 适用场景：工程攻坚、代码重构、测试流水线；
  * 行为特征：`moAdmin` 输出结构化执行计划（DAG Step 序列），每位伙伴在独立沙箱执行，完成后停步等待人类验收或交给下一步伙伴。

### 2.4 插话与抢占协议 (Mid-Flight Steering)
当任务长时间运行，人类需要介入纠偏时：
* **宏观抢占**：人类输入新指令瞬间，宿主作废当前未完成的旧队列，释放排队任务；
* **软插话 (Soft Steering)**：利用 `PreToolUse` 钩子，将插话内容作为 `additionalContext` 在下次工具调用前注入；
* **硬插话 (Hard Steering)**：通过流式信道发送 `control_request: interrupt` 强杀子进程并原子复位。

---

## 3. 用户真实需求翻译理念 (Prompt Distill 架构哲学)

### 3.1 人类语言的低信噪比与三态特征
人类交互往往具有：
1. **模糊性**（如“把刚才那个登录改改，不要旧的了”）；
2. **情绪与代词省略**（“它怎么又挂了”、“按刚才说的办”）；
3. **目标与实现手段脱节**（表达的是体验痛点，但底层需要精准的 API 路径、入参和兼容性约束）。

如果直接将口语喂给大模型，会导致模型产生严重的**过度脑补（Overthinking）**与**幻觉性代码生成**。

### 3.2 核心哲学：高信噪比背景增强，绝非篡改用户输入
在底层运行时中，暴力改写用户消息会带来两大灾难：
1. **破坏转录本审计原貌**：宿主依赖底层 JSONL 历史日志，篡改历史会导致审计失真；
2. **打碎 KV 前缀缓存 (Prompt Cache)**：前缀哪怕改动一个字节，断点之后的所有缓存全部失效，导致 Token 费用飙升且延迟恶化。

**Prompt Distill 的解法**：保持用户原始输入 100% 字节不变，通过 Hook 机制将结构化的“高信噪比增强元数据”**挂载在当前轮次的尾端**。

### 3.3 0ms 纯规则本地旁路引擎 (Deterministic Fast-Path)
为了防止小模型对简短命令“过度脑补”，下列输入一律通过正则毫秒级直通，坚决不调 LLM：
* **确认词**：`^(y|yes|ok|sure|continue|继续|好的|执行|推进|行|可以)$/i` $\to$ `<1ms` 透传；
* **原生 CLI 命令**：`^(\/.*|git\s+.*|npm\s+.*|pnpm\s+.*|cargo\s+.*|pytest.*)` $\to$ 透明放行；
* **紧急中断**：`^(no|stop|abort|cancel|revert|回滚|放弃|别动|停止)$/i` $\to$ 直通放行，确保刹车最高优先级。

### 3.4 保真安全门禁 (Fidelity Guardrail Engine)
未命中旁路的内容由前置轻量小模型提炼，但必须通过三重严格门禁校验：
1. **代码块拦截**：剥夺翻译小模型的代码生成权，若意外生成可执行代码块（` ```ts ` 等），判定越权立即拦截；
2. **实体覆盖校验**：提取用户原始输入中的文件名（`.ts`, `.py`）、Git Commit Hash、CLI 参数，提炼产物若丢失超过 50%，判定失真；
3. **膨胀率断言**：提炼产物长度不得超过原始输入的 3.5 倍（杜绝小模型注水）。
* **Fail-Open 降级策略**：门禁任何一项失败，立即原样透传用户原始输入，保证系统高可用。

### 3.5 结构化四要素元数据标准
通过门禁后，交付给主执行模型的增强背景固定包含四要素：
* **`[全局根目标 G0]`**：本次长程任务不可磨灭的根本诉求；
* **`[动作实体 Action]`**：明确的动词（重构、迁移、修复、下线）；
* **`[目标对象 Target]`**：涉及的具体模块、服务、路径或接口；
* **`[工程红线与约束 Constraints]`**：不可突破的边界（如“向后兼容”、“零新增依赖”）。

### 3.6 经济学推演与 KV Cache 保护
* **前缀一致性**：由于 System Prompt、Tools 定义与历史消息全部位于报文前端且未被篡改，Anthropic KV Cache 命中率稳定在 **88%~96%**；
* **成本收益**：API 输入计费享受 `0.1x` 的 Cache Read 费率，首字输出时间（TTFT）维持在毫秒级。

---

## 4. 多轮 LLM 交互需求演进与长序列防漂移体系

### 4.1 马尔可夫长序列认知漂移 (Semantic Drift) 困境
在一阶自回归链条 $P_N = f(P_{N-1}, D_{N-1}, U_N)$ 中，当交互轮次 $N \ge 8$ 后，最开始确立的高阶红线（如“保留原有 API 签名”）会被海量局部调试细节冲淡并最终被模型遗忘。

### 4.2 三层时间衰减模型
为兼顾长期记忆与局部上下文纯净，系统设计了分层记忆体系：

```
┌───────────────────────────────────────────────────────────────────────┐
│                      Prompt Distill 分层记忆体系                      │
│                                                                       │
│  [Tier 1: 全局长期锚点 G0]                                           │
│  - 在第 1 轮由小模型提炼并写入 meta.json                              │
│  - 全生命周期只读受控，永不衰减，永不被自回归重新摘要                 │
│                                                                       │
│  [Tier 2: 局部动态滑动窗口 (K=2)]                                     │
│  - 截断长链，仅维护深度 K=2 的局部事实切片 (D_{N-1}, D_{N-2})        │
│  - 超出窗口的细节交由 Git 代码库与宿主转录本自身去承载                │
│                                                                       │
│  [Tier 3: 指数时间衰减模型]                                           │
│  - 普通事实权重: A_i(N) = A_0 * exp(-0.35 * (N - t_i))                │
│  - 当评分低于阈值 0.2 时物理注销                                     │
│  - 【红线豁免机制】凡包含"必须"、"严禁"、"向后兼容"等断言:             │
│    强制锁定 lambda = 0，享受永久记忆，永不衰减！                     │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.3 宿主 Compact 协同 (消除双重摘要与状态裂脑)
当上下文达到阈值触发宿主原生 `/compact` 压缩时：
1. 挂接 `PreCompact` 钩子，导出当前记忆切片快照并释放文件锁；
2. 宿主主模型完成全量多维摘要重构；
3. 触发 `SessionStart(matcher: "compact")`：系统将轮次计数器物理重置为 1，清空过期的滑动窗口，以宿主的新摘要为唯一新基底重新锚定，**彻底杜绝插件摘要与宿主摘要相互打架的“状态裂脑”**。

---

## 5. 群聊、话题与私聊三层消息模型与黑板系统

### 5.1 会话上下文三层隔离体系 (RouteKey 隔离模型)

| 会话形态 | RouteKey 规范 | 角色与生命周期 | 上下文边界与存储位置 |
|---|---|---|---|
| **私聊主会话 (DM)** | `dm_<botId>` | `role = 'canonical'`；每个 Bot 全局唯一单例 | 仅人类与该 Bot 点对点任务，严禁混入群聊发言；存储于 `partners/<botId>/workspace` |
| **群聊专线隐藏会话** | `group:<groupId>` | `role = 'group_lane'`；每个 (group, bot) 单例复用 | 仅消费群增量切片，常驻复用以最大化利用 Prompt Cache；存储于 `chat-workspaces/<hash>` |
| **话题独立子会话 (Thread)** | `group:<groupId>:thread:<rootMessageId>` | `role = 'thread_lane'`；动态按需开辟 | 全量拉取该根消息子树（上限100条），独立触发 `/compact`，不污染主群水位线 |

### 5.2 统一消息模型与可见性字段 (Unified Storage)
无需为私聊、群聊和话题各建一套存储表，系统采用**单份消息日志 + 可见性过滤**的经典模型：

```json
{
  "id": "msg_1793928192_001",
  "ts": 1793928192000,
  "author": { "id": "user_xr", "kind": "human" },
  "channel": "public",
  "threadRootId": null,
  "replyToId": null,
  "visibleTo": ["all"],
  "content": "请评估网关重构方案"
}
```
* **公聊**：`channel: "public"`, `visibleTo: ["all"]`；
* **话题**：`threadRootId: "msg_1793928192_001"`, 继承父消息可见性；
* **私聊**：`channel: "dm"`, `visibleTo: ["user_xr", "bot_mocode_engine_01"]`。

### 5.3 任务 (Task) 是一等公民与多任务黑板隔离架构演进
> ⚠️ **实现状态区分说明**：
> - 🟢 **当前代码库生产已落地**：群级共享黑板 `GROUP_MEMORY.md` + 阶段性分工文件 `plans/plan_*.json`（单任务单黑板模式）；
> - 🔵 **会话讨论演进提案 (Proposed)**：当单群同时承载多个复杂流水线时，演进为“任务一等公民”目录模型：

```
[当前代码库落地结构 (Current In-Tree)]:
~/.multiagent-orchestration/groups/<group_slug>/
├── group.json                    # 群元数据与成员列表
├── GROUP_CHARTER.md              # 群章程与全局规则
├── GROUP_MEMORY.md               # 【当前核心】群共享黑板总线
├── plans/                        # 阶段性分工结构体 (plan_*.json)
└── artifacts/                    # 产物与交付成果暂存区

[未来多任务并发演进提案 (Proposed Evolution)]:
~/.multiagent-orchestration/groups/<group_slug>/
├── memory.md                     # 群级长期只读事实
├── tasks.md                      # 任务索引表 (Task ID、状态、一句话进展)
└── tasks/<task_id>/
    ├── blackboard.md             # 该任务专属黑板 (隔离数据不串供)
    ├── chat.jsonl                # 任务内专属消息流
    └── summary.md                # 任务阶段性总结
```

### 5.4 共享黑板 (GROUP_MEMORY.md) 与读写并发控制
* **写入互斥锁 (`withRoomLock`)**：
  群内所有对黑板和消息的修改均通过 `withRoomLock` 串行排队，配合 Node.js `AsyncLocalStorage` 避免重入死锁，杜绝多 Agent 写入冲撞。
* **增量切片提取 (Delta Slicing)**：
  轮到某 Bot 发言时，宿主只提取该 Bot 离线期间未见过的增量：  
  `WHERE sequence > lastSeenSequence AND authorBotId != self`
  * **条数有界**：单次拉取 $\le 12 \sim 30$ 条；
  * **字符有界**：单条内容截断 $\le 600$ 字符（使用 `Array.from()` 对 Unicode Code Point 进行整体安全截断，保护 4 字节 Emoji 代理对不损坏）；
* **写回即推进水位**：Bot 发言落盘后，立即将其 `lastSeenSequence` 推进至最新序列，从根源消除自我回声。

### 5.5 五维防循环死锁防御 (Anti-Loop Defense)
1. **用户所有者铁律 (Owner-Only Trigger)**：唯有人类消息才能开启新一轮调度；Bot 发言完毕立即结算，严禁自发开启新轮次；
2. **禁止输出 @ 唤醒**：Bot 生成文本中的 `@其他Bot` 纯作为展示文本，调度器绝不扫描 Bot 输出中的 `@` 来派发任务；
3. **静默退出原语 (`NO_REPLY`)**：若无新增增量价值，Bot 输出 `NO_REPLY`。宿主识别后：**0 气泡渲染**、推进读位、无缝流转下一位；
4. **确定性配额与全员静默熔断**：单轮最多循环 3 圈（`MAX_CIRCLES = 3`），最多 10 条回复。整圈全员 `NO_REPLY` 立即提前熔断整轮；Agent 间 P2P 询问嵌套深度超过 3 级直接抛出 `E_P2P_MAX_DEPTH` 强行阻断；
5. **后台防闲聊**：1 小时内代输入次数 $\le 6$ 次，24 小时生命周期上限。

---

## 6. Agent 实例拓扑与跨群秘书拆分边界 (A/B 架构推演)

> ⚠️ **实现状态区分说明**：
> - 🟢 **当前代码库落地实现**：由单一 `moAdmin` 统一兼顾需求翻译与群内任务拆解派发；
> - 🔵 **架构推演方案 (Design Trade-off)**：本节探讨针对单群与跨群不同场景下的架构演进方向。

### 6.1 并行执行方式对比：多个 Subagent vs 多个伙伴实例

| 维度 | 方案 A：单个伙伴内启多个 Subagent | 方案 B：中心编排启动多个伙伴实例 (独立会话) |
|---|---|---|
| **调用发起方** | 由主 Agent 内部通过工具（如 `invoke_subagent`）派发 | 由 `moAdmin` 统一在调度层派发 |
| **会话隔离性** | 运行在父会话分支，仅把简报回传给父 Agent | 完全独立的新会话，拥有独立的 `sessionId` |
| **可观测性与控制** | 较弱；子任务中间过程折叠在父会话中 | **极强**；每个实例均有独立卡片、状态监控、可随时单独暂停或恢复 |
| **工程代码冲突** | 容易共用同一个代码目录发生写冲撞 | 天然可配置不同的沙箱隔离目录与白名单 |
| **推荐适用场景** | 适合快速只读调研、辅助性信息检索 | **适合核心工程攻坚、多模块并行编写、代码审查** |

### 6.2 秘书 A 与项目经理 B 的解耦判据 (跨群 vs 单群)
是否需要将专员 A 进一步拆分成“翻译秘书 A”与“项目主管 B”？取决于 A 的生命周期与归属：

```
                    ┌────────────────────────────┐
                    │  专员 A 的生命周期与归属？  │
                    └─────────────┬──────────────┘
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
         [游走于多个不同的群]              [绑定在单一具体群]
                 │                                 │
                 ▼                                 ▼
        【拆分为 A + B 架构】               【不拆分，保持单一 A】
   ┌───────────────────────────┐      ┌───────────────────────────┐
   │ A (用户侧私人秘书):       │      │ 单一 A (即当前的 moAdmin): │
   │ - 持有用户偏好/习惯/术语  │      │ - 同时兼顾用户需求翻译与  │
   │ - 使用小模型，极速翻译    │      │   群内任务拆解派发        │
   │ - 跨群跟随用户游走        │      │ - 零额外跳数，低延迟      │
   │                           │      │ - 避免多一跳带来的信息损耗│
   │ B (群侧项目经理):         │      └───────────────────────────┘
   │ - 持有本群黑板与工程上下文│
   │ - 使用强模型，负责拆解派发│
   └───────────────────────────┘
```

---

## 7. Agent-First 协议与规范落地 (CLAUDE.md 与 agent-first-docs)

### 7.1 为什么需要“面向机器”编写文档 (Agent-First)？
传统技术文档是写给人类阅读的，充满了客套、委婉、冗长段落和背景重述。在 LLM 驱动的自主体系中：
* **内部资产必须为高密度 `en-US`**：英文在底层 Tokenizer 中的切词最紧凑、语义表征信噪比最高，能直接节约 40% Token 并提升推理精准度；
* **保真门禁原则**：用户面向交互严格遵从用户自然语言；**用户的原话、实体名、代码标识符、路径必须 100% 保持原语言原貌，严禁翻译**。

### 7.2 新一代模型的意图理解法则 (摒弃单纯大写 MUST 堆砌)
早期 Prompt 往往充斥着大写的 `MUST` / `NEVER`。对于最新一代高推理能力的大模型，这种写法存在反作用：
1. **过度触发**：模型在遇到边缘特殊情况时也会僵化死板地套用禁令；
2. **缺乏泛化力**：只写规则不写理由，模型无法在新场景中举一反三。
* **现代法则**：**规则优先（Rule First） + 单行决策理由（One-line Rationale） + 1~2 个正反例（Examples）**。普通流程使用普通祈使句，`MUST`/`NEVER` 严格保留给安全隔离、数据丢失、权限越权等物理红线。

### 7.3 确定性由代码与 Schema 保证，文档只表述意图
严禁在文档中空喊口号（如“请务必保证 JSON 格式正确”）。格式的确定性必须由 JSON Schema、AST 校验器、Git Hooks、Lint 工具（如 ESLint / Ruff / ShellCheck）和宿主拦截器（Exit 2）强制执行。

### 7.4 规范落地实体

#### 1. 常驻 `CLAUDE.md`（保存于中央 Skill 目录与工程根目录）
```markdown
## Agent-First Docs
- Internal artifacts (specs, skills, memory shards, protocols, CLAUDE.md sections) are written for LLM readers in dense en-US.
- User-facing replies use the user's language. Never translate user quotes, names, or identifiers.
- Lead with the rule, add a one-line reason, add 1-2 examples only for edge cases. No filler, pleasantries, or restating.
- Prefer numbers, tables, and schemas over prose for structured content.
- Enforce formats via schemas and host validation, not wording. Docs state intent and decision criteria.
- Plain imperatives by default. Reserve MUST/NEVER for hard constraints (safety, data loss, irreversible actions).
- When writing or editing such artifacts, load skill `agent-first-docs`.
```

#### 2. 按需加载权威技能：`agent-first-docs/SKILL.md`
```markdown
---
name: agent-first-docs
description: Use when writing or editing documentation consumed by LLMs/agents - specs, SKILL.md files, memory shards, protocols, CLAUDE.md sections. Not for user-facing replies, human READMEs, or marketing copy.
---

# Agent-First Docs

## Rules
1. Language: en-US. Keep user quotes, names, identifiers in original language.
2. Density: rule first, then one-line rationale. Cut greetings, hedging, restatement.
3. Structure: tables/JSON/numbered steps for structured content; prose only for reasoning.
4. Rationale: every non-obvious rule states why. Rules without reasons fail on unseen cases.
5. Examples: 1-2 per edge case, one positive, one negative if ambiguity is likely.
6. Emphasis: MUST/NEVER only for hard constraints. Everything else is plain imperative.
7. Determinism: formats are enforced by schemas/validators in code. Do not rely on wording.
8. Scope: one doc, one purpose. Link to reference files instead of inlining.

## Skills
- `description` = trigger conditions: when to use, when not to.
- Body short; heavy detail in referenced files loaded on demand.
- Maintain a human index: one line per skill (purpose, owner, updated).

## Memory shards
- One fact per line. Include source and date.
- Stated facts only. No inferences. Update in place; do not duplicate.

## Pre-save checklist
- Would an agent with zero context act correctly from this alone?
- Any rule missing its reason? Any MUST that is not a hard constraint?
- Any user text translated or paraphrased where it should be verbatim?
```

---

## 8. 脚本工程规范演进与重构 (Script Standards)

旧版 `script-standards` 存在“警告线（500行）低于目标线（600行）”、“硬编码个人绝对路径 `/opt/xrsec/.env/rmfile` 破坏迁移性”、“`disable-model-invocation: true` 导致模型无法自动使用”等自相矛盾。经重构后的标准规范如下：

#### 权威技能文件：`script-standards/SKILL.md`
```markdown
---
name: script-standards
description: Use when writing, editing, or reviewing automation, ops, or analysis scripts (bash, Node.js, Python), including agent-generated ones. Not for application code or library packages.
---

# Script Standards

Goal: single-purpose scripts that headless agents and CI can run, parse, and re-run safely.
Planes: dev plane = repo scripts in `scripts/`; runtime plane = scripts written or run by agents in `partners/<id>/workspace/`.

## 1. Size and complexity
Why: a script should be reviewable in one read. Agents cannot count lines, so enforce by lint or hook.

| Item | Rule |
|---|---|
| File length | <=500 normal; 500-800 needs a one-line justification in the header; >800 split into runner + modules (`scripts/<tool>/` or `./lib/`) |
| Function length | <=50 lines |
| Cyclomatic complexity | <=10 |
| Abstraction | Minimal. No class hierarchies, metaprogramming, or heavy frameworks |
| Legacy edits | Leave cleaner than found. No unsolicited rewrites |

Enforce with: shellcheck, eslint (`complexity`, `max-lines`), ruff `C901`.

## 2. Header
3-4 comment lines right after the shebang (or docstring start):
1. Purpose  2. Context (why it exists)  3. Usage with core flags  4. Prerequisites (env vars, binaries; omit if none)

```bash
#!/usr/bin/env bash
# Purpose: Sync runtime partner symlinks and scaffold workspace sandboxes.
# Context: Runs on predev or when packages/runtime-assets change.
# Usage: ./scripts/link-agents.sh [--dry-run]
# Requires: bash 4+, node 18+

set -euo pipefail
trap 'echo "[ERROR] failed at line $LINENO" >&2' ERR
```

## 3. Runtime discipline
- Bash: `set -euo pipefail` is the first statement after the header, plus an ERR trap.
- Node: ES modules, `node:*` built-ins, handle `unhandledRejection` explicitly.
- Python: 3.10+, stdlib first. Why: fewer install failures in sandboxes.

## 4. Interface contract
- Inputs only via flags, env vars, or stdin. No interactive prompts (`read -p`, `input()`, `readline()`). Why: they hang headless runs.
- stdout = results (offer `--json` for machine parsing). stderr = logs.
- Provide `--help`. Provide `--dry-run` for anything that mutates state.
- Re-run safe (idempotent). If not, say so in the header and guard with a lockfile.
- Long-running scripts set a timeout.

| Code | Meaning |
|---|---|
| 0 | OK (`TERM_OK`) |
| 1 | General error: unhandled exception, missing dependency |
| 2 | Input or guardrail violation (`TERM_BLOCK`); matches PreToolUse hook block |
| 124 | Timeout |

## 5. Safety
- Write boundaries: dev plane writes only `dist/`, `.cache/`, `tmp/`. Runtime plane writes only `./workspace/` or OS temp. Enforce via sandbox or permission config, not wording.
- Deletion: no bare recursive `rm -rf`. If `$SAFE_RM` is set, use it. Otherwise delete only validated paths: `"${TARGET:?}"`, non-empty, inside the allowed root.
- Secrets: never hardcode keys, tokens, passwords, or absolute home paths. Dev: `[ -f .env ] && source .env`. Runtime: inherit parent env or MCP auth.

## 6. Placement
| Kind | Location |
|---|---|
| General dev/ops tools | `scripts/` |
| Partner workspace scripts | `partners/<id>/workspace/` or `packages/<pkg>/scripts/` |
| Browser/profiling automation | `ego-script/` or a dedicated package |
| Ephemeral diagnostics | prefix `tmp_` or `scratch_`; delete or archive when resolved |
```

---

## 9. 系统落地资产与拓扑映射全表

系统中所有落地文件严格遵循 Centralized Skills 标准（实体在中央，多处建软链）：

| 标准类型 | 权威中央实体路径 | 项目工作区软链映射 | 运行时软链映射 | 核心职责说明 |
|---|---|---|---|---|
| **机读文档规范** | `~/.agents/skills/agent-first-docs/` | `Customizations/skills/agent-first-docs` | `~/.multiagent-orchestration/skills/agent-first-docs` | 涵盖机读语言纪律、Skill/Memory 编写标准、Pre-save 检查清单 |
| **机读规范别名** | *(软链至 agent-first-docs)* | `Customizations/skills/skill-creator-helper` | `~/.multiagent-orchestration/skills/skill-creator-helper` | 兼容旧系统 `@skill-creator-helper` 引用，防软链断裂 |
| **脚本工程规范** | `~/.agents/skills/script-standards/` | `Customizations/skills/script-standards` | `~/.multiagent-orchestration/skills/script-standards` | 涵盖行数预算、头注释、零TTY挂起、标准退出码、`$SAFE_RM` 安全删除 |
| **常驻治理协议** | `AGENTS.md` / `CLAUDE.md` | `Customizations/AGENTS.md` | *(由宿主引擎自动继承)* | 常驻轻量级全局治理协议，包含 7 位 Mo-Bots 职责边界与协作纪律 |
| **意图蒸馏架构** | `docs/architecture/prompt_distill_design.md` | — | — | 详细定义 0ms 本地旁路、保真门禁、G0 不灭锚点与 KV Cache 保护 |
| **群聊黑板规范** | `docs/architecture/cindy-chat-mechanisms-and-blackboard-system.md` | — | — | 详细定义私聊/群聊/话题隔离、共享黑板、单发言人与五维防循环 |

---
*(规范文档结束 · 状态：生产已对齐)*
