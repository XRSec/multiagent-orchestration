# 双 Session 伴生意图编译架构设计

> 导出自 Google Gemini 深度研究 (Deep Research)
> 导出时间: 2026-11-18 18:57:44
> 调研指标: 102082 字符 | 205 篇参考出处

---

## 双 Session 伴生意图编译架构设计

# 双 Session 伴生意图编译与响应正文精简账本架构方案（Paseo + Antigravity ACP 生产级设计）

针对 Paseo 宿主环境（`paseo-bots` 编排插件与 `paseo-agy-acp` 官方无头 ACP 内核适配器）设计「双 Session 伴生意图编译 + 响应正文精简账本（Dual-Session Companion Intent Compiler & Reply Distiller）」**，核心思路契合 2025–2026 年上下文工程（Context Engineering）的主流演进方向：将**「跨轮次干净语义状态追踪与口语指代消解」**同**「重型工具链与代码工作区执行」解耦，避免主模型在数万至数十万 Token 的工具输出（`tool_result`）与中间推理噪声中遗忘早期业务约束或误判中途纠偏。但结合近期实证研究与生产级 Coding Agent 架构剖析，若直接按朴素形态落地——即维护一个不断追加消息的有状态隐藏伴生聊天会话（形态 A），并在前置阶段用改写后的提示词替换用户原话——在编码会话超过 15–25 轮后将面临三大系统性风险：**伴生会话因保留被推翻的旧需求而触发同键冲突注意力劣化（Same-Key Conflict Rot）与缓存过期冷重写成本飙升**、**主会话前缀缓存失效或代码细节在转述中丢失**，以及无工具视野的轻量模型在指代消解时编造文件路径或错误收窄操作范围。

为规避上述陷阱，本方案将你的核心构想收敛升级为「结构化精简账本（Morphology B+ Structured Ledger）+ 原话保留尾部追加契约（Verbatim-First Tail Injection）+ ACP 确定性工具足迹护栏」生产架构：

- **伴生状态底座（弃用无限追加长会话，改用确定性结构化账本 + 静态前缀缓存）**：宿主机通过独立 SQLite（WAL 模式）持久化一份体积恒定（≤ 2,200 Tokens）的 `CompanionLedgerV1` JSON 账本，维护不可变的 `G0` 根目标原话锚点、通过显式增量算子（`ADD` / `SUPERSEDE` / `REVOKE`）对账的活跃约束集、宿主机确定性提取的工作区触点（`workspaceTouchpoints`），以及最近 K = 8 轮精简问答滑动窗口。伴生模型每次仅对「静态缓存 System Prompt + 确定性投影账本」执行单轮无状态推理，从机制上消除 30–100+ 轮场景下的传话筒累积失真（Telephone Game Drift）与同键冲突干扰。
- **主会话注入与缓存保护契约（保留用户原话在前，严守 Byte-0 前缀不可变）**：前置编译产物**绝不替换用户原始输入**，也不触碰 `paseo-agy-acp` 的原生系统提示词快照（`PASEO_AGY_ACP_NATIVE_SYSTEM_CONTEXT=1`）或历史消息序列；而是在当前轮 `session/prompt` 消息末尾采用「用户逐字原话在前 + 尾部追加 `<companion_intent>` 结构化附注（常规态 ≤ 95 Tokens）」的只追加（Append-Only）模式，在不破坏主模型历史 KV Cache 的前提下完成指代绑定与尾部约束复述。
- **编码反脑补三道护栏与亚秒级延迟控制**：前置链路先经 `< 1 ms` 的确定性直通门控过滤 `/slash` 命令、纯确认词、无指代全局操作、大段报错日志粘贴与首轮冷启动；后置阶段从 ACP `session/update` 事件流中用宿主代码确定性提取读写文件路径（`locations`）与终端退出码，补齐小模型的工具执行盲区。配合关闭扩展思考预算的轻量快模型（如 `Gemini 2.5 Flash-Lite` 或 `Claude Haiku 4.5`）、JSON 字段序流式早停（Streaming Early-Exit）及 Admission 准入队列并行掩蔽，可将穿透门控请求的主链路新增延迟压制在 `175–710 ms` 区间内，并辅以 `750 ms` 硬超时无感回退（Fail-Open）。

证据基线说明：受归档解包限制，你上传的 `gemini-dual-session-research-pack.zip` 仅暴露了 11 份内部文档的目录清单与字节大小（印证了前期围绕 Byte-0 缓存分层、注意力压缩、Seat 黑板仲裁、`paseo-agy-acp` 轮次生命周期及 Meta-MCP 动态编排的模块划分），未包含内部文档正文。因此，下文所有宿主层挂载点、RPC 载荷字段与并发锁设计均严格对齐公开可验证的 `tiezbro/paseo-agy-acp`（v2.8.1）、`getpaseo/paseo`（v0.14+ `AgentManager`）、`oliexe/paseo-bots` / `yeyan00/paseo-bots` 源码规范以及 ACP v1/v2 官方协议标准。

## 一、 宿主环境工程约束与业界同类架构深度对标（2025–2026）

### 1.1 Paseo + Antigravity ACP 宿主底座的四项硬约束

将双 Session 伴生层嵌入 Paseo 生态之前，必须先对齐 `paseo` 守护进程、`paseo-bots` 插件与 `paseo-agy-acp` 适配器的真实运行边界，避免在错误的协议层截流或引发状态死锁。

在宿主编排侧，Paseo 守护进程（Node.js 服务端，默认监听 `6767` 端口）通过 `AgentManager` 统一调度会话生命周期、Git Worktree 隔离以及运行期输入策略（`activeTurnBehavior` 支持 `"steer"`、`"queue"` 与 `"interrupt"`）。运行于其上的 `oliexe/paseo-bots` 插件（面向 Paseo 0.16.0+，由 `paseo-plugin.json`、`index.server.ts` 与 `index.client.tsx` 构成）为每个 Bot 维护独立的隐藏工作区、固定角色指令（Soul）、会话启动自动追加的 `MEMORY.md`（上限 200 行或 24 KB）、定时/Webhook 例程（Routines），以及由 Chief of Staff 通过 `ask_bot` 工具携带 `chat_id` 发起的多智能体子任务委派；另一社区协作插件 `yeyan00/paseo-bots`（`paseo-team-tasks`）则通过 `@members` 评论在多主机持久会话间分发任务。这意味着进入底层会话的消息既包含人类开发者的口语简写，也包含机器生成的完整委派提示词——后者本身结构完备，不应再经伴生小模型二次改写。

在底层协议适配侧，`tiezbro/paseo-agy-acp`（v2.8.1，对接官方 `antigravity-acp` 1.4.5 运行时，支持 Claude Opus 5.5、Sonnet 5.5 及 Gemini 系列动态目录发现）通过标准 **ACP（Agent Client Protocol，基于 stdio NDJSON 的 JSON-RPC 协议）** 驱动每个连接器子进程背后的官方无头内核 `agy_acp_server`，规避了内置 CLI 伪终端流在大输出下因全缓冲扫描引发的 CPU 死循环与内存泄漏。该适配器确立了四项直接约束伴生层设计的工程边界：

- **系统提示词快照不可变性**：`paseo-agy-acp` 支持默认单轮包装器模式与原生模式（`PASEO_AGY_ACP_NATIVE_SYSTEM_CONTEXT=1`，当官方内核声明 `agentCapabilities._meta.antigravity.systemPrompt.append: true` 时启用）。在原生模式下，系统上下文在会话创建、加载或恢复时被固化为静态快照，运行期若修改系统上下文必须触发全量会话重载（full session reload）。因此，每轮动态变化的伴生意图绝不能注入 System Prompt，只能附着于当轮 `session/prompt` 消息体。
- **严格的轮次完成信号与空白轮拦截**：连接器不会凭已流式回传的正文分块判定轮次结束，而是严格等待底层轨迹发出 `STATE_FULLY_IDLE` 信号、使 `receive_steps()` 迭代器退出并返回 `session/prompt` JSON-RPC 响应后，才通知 Paseo 将生命周期从 `running` 切换为 `idle`；若模型返回无实质输出的空 `end_turn`，适配器会直接返回显式 JSON-RPC 错误以防脏状态落盘。后置正文精简必须严格挂载在非空合法的 `session/prompt` 响应闭环点之后。
- **跨进程 SQLite Admission 锁隔离**：开启 `AGY_ACP_ADMISSION_ENABLED=true` 后，适配器利用账号级共享目录（`AGY_ACP_STATE_DIR`，权限 `700`）内的 SQLite 事务锁限制并发（默认最多 8 个活跃轮次、2 秒最小启动间隔）。历史上高并发争用曾触发 `ACP database is locked (-32000)` 写锁升级故障，因此伴生账本若采用 SQLite 持久化，必须使用**物理独立的数据库文件**，严禁与 Admission 锁库共用同一连接或锁文件。
- **1 小时空闲进程回收周期**：Paseo 0.14 守护进程的空闲回收器（Idle Recycler）会在会话静置满 **1 小时**后自动终止适配器子进程，并在后续恢复时保留 `sessionId` 重建上下文与 MCP 桥接。这一周期恰好与主流大模型 5 分钟或 1 小时的 Prompt Cache TTL 边界吻合，为“零缓存破坏惩罚的空闲期桥接压缩”提供了天然切入点。

### 1.2 2025–2026 业界标杆系统拆解与架构取舍

梳理 2025–2026 年开源网关、智能体记忆架构与主流 Coding Agent 的实现可以发现，业界在解决多轮指代与长上下文退化时，已普遍放弃“让小模型自由扩写整段用户提示词”，转而采用「受限槽位路由 + 轮间异步状态对账 + 前缀缓存保护」。对于商业闭源 IDE 智能体（如 Cursor 的 Composer 2 多轮强化学习环境与 `.cursorrules`/`.mdc` 规则体系、Windsurf 的 Cascade 工作流以及 Devin 云端智能体），公开文献与评测主要记录了其规则文件加载、外部转录索引（如社区 Session Recall 利用夜间任务将对话提炼入 SQLite）及多阶段恢复表现，并未公开内部双会话重写器的源码细节；而具备完整架构论文或源码级剖析的系统则提供了直接可复用的工程范式：

系统 / 研究标杆（2025–2026）上下文提炼、意图解析与记忆演化核心机制公开实证数据与来源性质对本方案「双 Session 伴生架构」的取舍启示Katanemo Plano / Archgw (Arch-Router-1.5B、Arch-Function、Plano-Orchestrator)基于 Envoy 的智能体数据面网关，支持 filter_chain 查询改写/上下文增强与 prompt_targets 函数参数澄清；通过 4B 或 30B-A3B 编排模型分析最近 10 条会话消息（context[-10:]）解析多轮意图据 Katanemo 论文与技术报告（arXiv:2506.16655），Arch-Router-1.5B 路由延迟为 51 ± 12 ms、准确率 93.17%，优于 Claude 3.7 Sonnet（1,450 ms / 92.79%）与 GPT-4o（836 ms / 89.74%）采纳「受限分类与指代槽位提取」：小模型在请求关键路径上实现高准低延的前提是输出受限 JSON 决策槽位，而非开放式重写大段自然语言。Letta Sleep-time Compute (arXiv:2504.13171) & Context Repositories (2026)利用轮次间隙的空闲时间（Sleep-time）异步重组原始上下文为预计算学习态，降低测试时（Test-time）推理负担；2026 版进一步引入基于 Git 多工作树的版本化记忆与合并冲突消解论文实测在 Stateful GSM-Symbolic 与 AIME 上达到同等准确率所需测试时计算量降低约 5 倍，多查询摊销成本降低 2.5 倍；但在 SWE-Features 编码任务中，因提前发散探索导致修改了更多文件、编辑精度喜忧参半采纳「后置轮间精简 = 微睡眠计算」但禁止越权预规划：在 turnEnded 异步提炼刚结束轮次的事实结论收益显著，但伴生模型绝不能替主 Agent 预判待改代码文件。Mem0 (ECAI 2025, arXiv:2504.19413)两阶段增量记忆管线：第一阶段结合会话摘要与近期消息对提取候选事实（Extraction），第二阶段检索相似记忆并显式判定 ADD、UPDATE、DELETE 或 NOOP（Update）论文报告在 LOCOMO 基准上准确率较 OpenAI Memory 高出 26%，并显著降低检索延迟与 Token 开销直接引入显式状态变更算子：用户中途改需求时，必须通过 SUPERSEDE / REVOKE 将旧约束移出活跃视图，防止新旧矛盾指令并存。Zep / Graphiti (arXiv:2501.13956, 2025)双时态（Bi-temporal）动态知识图谱：底层保留无损原始 Episode，上层提取带有效时间窗 [t_valid, t_invalid] 的语义事实边与实体摘要论文在 LongMemEval 基准上测得最高 18.5% 的整体准确率提升（特定子项 GPT-4o 从 81.4% 升至 92.9%），且因提示词缩减使响应延迟由 2.58s 降至 0.684s采纳「轮次有效区间 [validFromTurn, invalidatedAtTurn) + 原文锚点」：既能追溯历史变更，又确保当前生效约束零歧义。DSPy 声明式多轮重写 (Signatures + Predict / GEPA)将模块输入输出契约（Signature）与推理策略（Predict 直接映射 vs ChainOfThought 思维链）解耦，支持针对特定评估指标自动编译压缩提示词并向小模型迁移官方披露生产案例包括 Shopify 元数据提取（约 550 倍成本缩减）及 AWS 从大模型向小模型的提示词自动迁移前置编译器强制采用 Predict 直出模式：靠清晰的输入账本签名代替小模型冗长的思维链推理，守住首字延迟预算。Claude Code (v2.1.x) (源码剖析论文 arXiv:2604.14228, 2026)每次模型调用前依次评估五级上下文管线：Budget Reduction -> Snip -> Microcompact -> Context Collapse -> Auto-Compact；v2.1.299 在 1 小时缓存即将过期前（静置约 54 分钟、超 200K Tokens）执行空闲压缩，并通过 Sidechain 隔离子代理探索轨迹官方缓存读取费率低至基础价的 10%（据开发者文档汇总，Opus/Sonnet 5.5 低至 5%），5 分钟缓存写入 1.25x；压缩提示词强制要求逐字保留所有用户指令，压缩后重读 CLAUDE.md 与最近 5 个文件采纳「逐字保留用户原话 + 缓存过期前窗口对齐压缩」：印证了任何摘要改写都有丢失聊天内粘贴代码细节的风险，因此绝不能覆盖用户原话。OpenHands V1 & Manus (2025–2026 生产实践)OpenHands 默认启用 LLMSummarizingCondenser(max_size=80, keep_first=4) 保护首轮根目标；Manus 严守前缀稳定与只追加上下文、用 Logits 掩码替代动态增删工具，并在上下文末尾持续重写 todo.md 复述目标OpenHands 报告无压缩运行至第 100 步时平均延迟升至 16s，启用 Condenser 后 API 成本最高降 2 倍且性能无损；从业者实测前缀扰动会导致平均延迟从 2,258 ms 恶化至 3,714 ms（差距约 39%）采纳「钉死 G0 根目标 + 尾部目标复述（Recitation）」：在当前轮用户消息末尾追加精简意图块，恰好以零缓存破坏的方式实现了尾部注意力锚定。

   
### 1.3 伴生形态深度对比：持久长连接会话（形态 A）vs. 结构化精简账本（形态 B / B+）

针对你提出的核心架构抉择——**后台伴生会话应采用「形态 A（始终向同一个后台 Session 追加消息，利用伴生模型自身 KV Cache）」还是「形态 B（宿主持久化 JSON 状态账本，每次组装确定性上下文单轮调用）」**——结合 2026 年两项代表性实证研究（Lumer 等人在 Don't Break the Cache 中跨越 500+ 智能体会话的缓存模式评测，以及 arXiv:2611.04169 针对小模型上下文退化根因的受控实验），可以清晰界定两者的性能拐点与失效机理。

结合上图揭示的底层机理，**形态 A（有状态持久长连接伴生 Session）在多轮编码场景中受制于三重结构性矛盾**：

第一是**后置原始正文驻留与 KV Cache 保全之间的悖论**。按照双边精简构想，轮次结束时需要将主 Agent 回复的完整正文（常见规模约 `650 Tokens`）发给伴生会话提炼摘要。若前置与后置共用同一个有状态伴生 Session，为维持其前缀缓存不被击穿，历史消息必须严格只追加（Append-Only）。这意味着每一轮未精简的主 Agent 原始正文都会永久残留在伴生会话上下文里——按典型参数推算（假设静态提示词 1,200 Tokens、每轮前置输入输出 300 Tokens、后置原始正文加输出 760 Tokens，即每轮净增 1,060 Tokens），伴生上下文在第 30 轮将增至 `33,000 Tokens`，第 50 轮达 `54,200 Tokens`，第 100 轮突破 `107,200 Tokens`。反之，若在后置精简结束后把那段原始正文从伴生历史中剔除、只保留精简结论，该原地修改动作会立即使修改点之后的伴生 KV Cache 失效，实际上退化为宿主机在外部维护历史列表的无状态组装模式。

第二是**编码阅读停顿导致的缓存 TTL 过期惩罚**。主流 API 默认缓存生命周期仅为 **5 分钟**（Anthropic 虽支持 1 小时缓存，但缓存写入成本升至基础单价的 **2.0 倍**，5 分钟写入亦需 **1.25 倍**）；同时，Lumer 等人的评测证实，对不断变化的会话内容强开全量上下文缓存（Full Context Caching），会因动态缓存写入开销在部分模型上引发负向延迟倒退（如 GPT-4o 出现 `-8.8%` 的 TTFT 恶化），而仅缓存静态系统提示词（System Prompt Only）在全部受测模型上均实现了稳定的成本削减与正向 TTFT 提速。真实编码过程中，开发者常因审查 Diff 或本地测试停顿超过 5 分钟，一旦缓存过期，形态 A 累积的数万 Token 伴生历史将触发全额冷预填充，导致原本 200 ms 级的快模型首字延迟升至 **1–2 秒**。

第三是**同键冲突（Same-Key Conflict）引发的小模型精度崩塌**。arXiv:2611.04169 的受控实验揭示了一个反直觉事实：上下文退化（Context Rot）的真正主因并非单纯的长度膨胀，而是**注意力竞争与同键冲突**——向 `Qwen2.5-1.5B` 注入长达 `32K Tokens` 的中性填充文本，其中位损失始终维持在 `≤ 0.006 nats`（准确率 `98%–100%`）；但在长度固定不超过 `2,048 Tokens` 时，只要上下文中存在至少一条共享同一查询键的冲突陈述（例如第 3 轮要求“接口返回驼峰命名”，第 18 轮改口“全部统一改成下划线命名”），五款受测轻量模型的检索准确率便从无冲突时的 `0.97–1.00` 骤降至 **`0.25–0.52`**（`Qwen2.5-1.5B` 的平均损失从 `0.020 nats` 暴涨逾百倍至 `2.238 nats`）。另一项针对多轮指令分片（Context Clash）的行业汇总报告同样指出，跨轮散落与修正的指令会导致主流模型平均性能下滑 **39%**（OpenAI o3 亦从 `98.1` 降至 `64.1`）。形态 A 只能向后追加新意图，无法物理抹除前文已被推翻的旧约束。

因此，工程上推荐采用结合两者长处的「形态 B+：静态前缀缓存 + 确定性结构化账本 + 前后置单轮隔离推理」。其与形态 A、基础形态 B 的综合对比及临界点如下表所示：

评估维度形态 A：有状态持久长连接伴生 Session形态 B：纯无状态结构化账本单轮推理形态 B+（推荐）：静态缓存前缀 + 对账账本 + 前后置物理分离伴生上下文规模演化随轮次线性膨胀（保留后置原文时约 +1,060 Tokens/轮，100 轮超 100K Tokens）严格有界常数级 O(1)（100 轮仍控制在 2,500–3,300 Tokens 内）严格有界常数级 O(1)（前置动态区恒定 ≤ 2,000 Tokens；后置独立调用不污染前置历史）伴生层缓存利用方式依赖会话级全量缓存；>5 分钟停顿触发大体积冷重写，删改原文即破缓存若 System Prompt 低于提供商缓存门槛（1,024–4,096 Tokens），则全程无缓存将静态 System Prompt + 固定校准示例对齐提供商缓存门槛，跨轮次稳定命中 System Prompt Only 缓存第 50–100 轮前置 TTFT随上下文增长及 TTL 过期波动，50K Token 冷启动时延迟可达 1–2s第 1 轮至第 100 轮保持恒定低延迟（约 160–320 ms）第 1 轮至第 100 轮恒定在 150–310 ms，叠加流式首字段早停进一步缩短阻塞窗口中途改需求抗冲突表现脆弱：被推翻的旧约束滞留前缀引发同键注意力竞争，小模型准确率易跌破 50%稳健：宿主机将失效约束移出活跃数组极佳：通过 SUPERSEDE/REVOKE 算子将失效约束移入短期隔离槽并在 3 轮后冷归档优劣反转临界点仅在 < 10 轮、全程间隔 < 5 分钟 且零需求变更的极短对话中实现简单≥ 10–12 轮在延迟稳定性与累计开销上反超形态 A全周期占优（首轮 0ms 异步旁路，第 2 轮起享受无冲突账本与恒定亚秒级延迟）

   
#### 30–100+ 轮防注意力退化（Context Rot）与防传话筒失真（Telephone Game Drift）四重设计

2026 年发表的演化记忆故障分类研究（SSGM 治理框架，arXiv:2603.11768 与 arXiv:2609.23700）明确将多轮递归摘要引发的细节流失定义为**语义漂移（Semantic Drift）**与**传话筒链式失真（Telephone-Game Chains）**：若每一轮都让小模型重新概括上一轮的摘要，经过十余次迭代转述后，精确的技术限定词会被逐渐磨平甚至诱发目标偏移（Goal Drift）。在形态 B+ 账本中，我们通过四项确定性规则阻断累积失真：

- **禁止重写整份账本，仅允许增量补丁算子（Patch-Only State Mutation）**：伴生模型绝不重新输出整张 `activeConstraints` 列表，仅针对本轮发生变化的条目输出 `ADD`、`SUPERSEDE(targetId)` 或 `REVOKE(targetId)` 补丁。未受本轮影响的历史活跃约束由宿主机 TypeScript 代码在内存中**原样字节保留**，即使历经 100 轮也经历 **0 次** 二次 LLM 转述。
- **真值原话锚定（Ground-Truth Verbatim Anchoring）**：借鉴 SSGM 真值锚定原则、Claude Code 逐字保留指令要求与 OpenHands `keep_first` 策略，账本中的 `rootGoal.verbatimAnchor` 与每条约束的 `verbatimEvidence` 均由宿主机直接截取用户原始消息子串写入，不允许模型自由改写。
- **双时态生效窗口裁剪（Bi-Temporal Active Projection）**：参考 Zep/Graphiti 的有效时间窗机制，每条约束记录 `validFromTurn`；一旦被用户推翻，宿主机立即将其从 `activeConstraints` 移入 `recentlyRevokedConstraints`（仅保留 3 轮用于防止上下文回弹误判，随后转入 SQLite 离线审计表），确保前置模型视野中不残留过期的同键竞争项。
- **周期性后台真值校准（Periodic Sleep-Time Reconciliation）**：遵循 SSGM 异步对账与 Letta Sleep-time Compute 思路，每满 20 轮或当活跃约束逼近 12 条上限时，宿主机在 `turnEnded` 后台比对 SQLite 原始用户发言日志与当前活跃约束集，合并重复规则并归档已完成子任务的临时约束，不占用任何前台等待时间。

## 二、 完整目标架构与主 Agent 注入契约（Byte-0 前缀缓存保护）

### 2.1 双通道伴生编译与精简总架构（Paseo + paseo-agy-acp 落位）

在工程落位上，伴生协调器（`CompanionOrchestrator`）最佳挂载位置是 **`paseo-agy-acp` 的 `ACP Connector` 协议代理层内部**（也可封装为独立包同时供 `paseo-bots` 服务端调用）。这样既能直接拦截发往 `agy_acp_server` 的 `session/prompt` 请求并与 `Admission Controller` 并行协同，又能零延迟旁路嗅探底层内核回传的 `session/update` NDJSON 事件流。

围绕上图双通道数据流，六个核心子模块的宿主边界与协议交互定义如下：

子模块名称推荐宿主落位拦截 / 消费的协议消息核心工程职责与隔离要求BypassClassifierpaseo-agy-acp 的 ACP Connector 入站入口session/prompt 请求载荷与 _meta 扩展字段< 1 ms 确定性规则判定：对首轮冷启动、/slash 命令、纯确认词、无指代短工程指令、大段报错栈及 ask_bot 机器委派直接短路放行。PreTurnCompilerACP Connector 内，与 Admission Controller 租约获取并行执行本地内存账本投影 + 轻量模型流式 HTTPS 接口组装静态缓存 System Prompt + CompanionLedger 活跃视图，在 750 ms 硬时限内流式解析 "PASS" 或 "AUGMENT" 载荷。TailPromptInjectorACP Connector 向 agy_acp_server stdin 写入 NDJSON 前一跳出站 session/prompt 消息体最末文本块严格保留用户原始输入在前，在末尾追加经过白名单核验的 <companion_intent> 块；绝不改动 Paseo 前端可见的用户原始消息气泡。ACPFootprintCollectorACP Connector 监听子进程 stdout NDJSON 管道session/update（agent_message_chunk、agent_thought_chunk、tool_call、tool_call_update）及 fs/*、terminal/*流式剥离思考块与长工具输出，在内存中聚合纯响应正文缓冲，并确定性抽取 ToolFootprintDigest（修改/读取路径、命令退出码、错误首行）。PostTurnDistiller收到非空 session/prompt JSON-RPC 正常响应（即 STATE_FULLY_IDLE） 后的异步微任务纯正文缓冲（首尾保留截断，≤ 1,200 Tokens）+ ToolFootprintDigest异步调用轻量模型提炼 distilledAssistantReply 并确认约束补丁，通过乐观锁原子提交至账本存储。CompanionLedgerStore${AGY_ACP_STATE_DIR}/companion-ledger.sqlite（独立文件）session/new、session/load、session/resume、session/close与 Admission 锁库物理分离，开启 PRAGMA journal_mode=WAL; busy_timeout=3000;，按 (providerId, sessionId) 存储账本与原始轮次证据。

   
### 2.2 提示词缓存悖论破解：为何必须「保留用户原话在前 + 尾部追加 `<companion_intent>`」

针对第二个核心设计问题——**编译后的提示词应「直接替换用户原话」，还是「保留用户原话在前 + 尾部追加结构化 `<companion_intent>` 块」**——工程上应坚定选择「保留用户原话在前 + 当前轮尾部追加 `<companion_intent>` 块」。这一决策同时受制于大模型前缀缓存物理定律与编码任务的无损保真要求。

在缓存机制层面，主流推理提供商（Anthropic、OpenAI、Google）的提示词缓存均依赖从首字节（Byte 0 / Token 0）开始的**逐字节精确前缀匹配（Exact Prefix Matching）**——即 TokenPilot 等形式化研究中定义的规范化前缀不变条件 ϕ(m(t))=ϕ(m(t+1))  ⟹  Cprefix′⊆Chit′\phi(m^{(t)}) = \phi(m^{(t+1)}) \implies \mathcal{C}'_{\text{prefix}} \subseteq \mathcal{C}'_{\text{hit}}ϕ(m(t))=ϕ(m(t+1))⟹Cprefix′​⊆Chit′​。在多轮 Agent 会话中，工具 Schema 定义位于最前部，紧随其后的是静态 System Prompt，再往后是第 1 轮至第 N-1 轮累积的完整对话与 `tool_result` 序列。只要我们做到三点——不动态增删 MCP 工具 Schema、不在 System Prompt 中写入时间戳或动态账本、不回溯涂改第 1 至 N-1 轮的任何已发送字符——那么在第 N 轮用户新消息的**最末尾**追加一段 60–95 Tokens 的 `<companion_intent>` 块，**对前 N-1 轮已缓存前缀的破坏率为零**。当会话进入第 N+1 轮时，第 N 轮的用户原话连同尾部的 `<companion_intent>` 自然固化为新的增量缓存前缀，在后续轮次中仅按基础输入单价的 `5%–10%` 计费读取。与此同时，将消歧后的意图与早期硬约束放置在整个上下文窗口的最末端，恰好复现了 Manus 架构中对抗长上下文“中间迷失（Lost-in-the-Middle）”的核心手段——**尾部目标复述（Recitation）**，将关键约束重新拉回模型 Softmax 注意力权重最高的末尾近因区。

在编码准确性层面，直接用小模型的改写文本替换用户原话隐藏着极高的信息折损风险。正如 2026 年初社区复盘的 Claude Code 压缩丢数案例所示，一旦摘要或改写环节抹掉了开发者原话里夹带的精确 CSS 选择器、正则符号、大小写敏感的环境变量名或审慎语气（如把“先查查为什么挂了，别改代码”改写为“排查并修复问题”），主模型便会在缺失原始边界的情况下做出越权修改或盲目猜测。保留用户原话在前、将 `<companion_intent>` 明确声明为“伴生上下文参考附注”，使重型主模型既能逐字读取用户的精确表达，又能低成本获取跨轮次消歧后的约束全景。

### 2.3 与主 Agent 原生多轮工具历史的协同及三级压缩水位线

当主 Agent 上下文内已经保留了完整的原始多轮对话与大量 `tool_result` 时，若 `<companion_intent>` 每轮都把前几轮的问答摘要重复塞入，不仅增加前置生成耗时，还会因“小模型概括措辞”与“主模型原生工具输出”之间的细微出入引发上下文冲突（Context Clash）。为此，主会话与伴生账本通过「静态真值仲裁规则 + 双模按需注入 + 三级压缩水位联动」实现无冗余协同。

首先，在 Bot 的静态初始化角色指令（如 `paseo-bots` 的 Soul 配置或仓库级静态 `AGENTS.md` / `CLAUDE.md`，首轮即进入 Byte-0 缓存前缀） 中一次性写入真值优先级契约：明确告知主模型，消息尾部的 `<companion_intent>` 由无工具视野的轻量状态机生成，专用于解析口语指代与提醒早期未废止的业务约束；凡涉及具体文件路径、行号、函数签名或报错状态，若与主模型原生 `tool_result` 或实时文件读取结果不一致，**一律以原生工具输出与实时工作区文件为准**；但对其中标记为 `[MUST]` / `[MUST_NOT]` 的用户需求约束应严格遵守。

其次，`<companion_intent>` 根据主会话刚是否经历过历史裁剪，动态切换两种输出密度。在常规连续对话期内启用**增量消歧模式（`mode="delta"`）**：此时绝不附带前 K 轮精简问答流水账，仅当本轮存在指代/省略、需求转向或主会话已积累较长工具历史时，才注入解析后的指代候选路径与 1–4 条距离当前较远的早期活跃约束，整块体积严格控制在 `45–95 Tokens`；若本轮用户指令本身清晰完整且无需复述早期约束，编译器直接输出 `"action": "PASS"`，主会话收到 100% 纯净的用户原话。反之，当主会话刚执行完上下文压缩、跨过 Paseo 1 小时空闲进程回收恢复或向新子智能体移交任务后的首轮，自动切换为**跨压缩桥接模式（`mode="bridge"`）**：一次性注入完整的 `G0` 根目标、全部 `activeConstraints`、已完成里程碑、最近修改文件触点及最近 K = 5 轮精简问答对（合计约 `350–550 Tokens`），充当主会话跨越压缩断层的结构化记忆桥梁。

关于**在什么水位下配合压缩或裁剪主 Agent 原生历史**，2026 年多项实证研究（包括 Don't Break the Cache、Context Engineering in 2026 对比实验以及 Asana 的 `20:1` 批量裁剪实践）一致表明：在现代前缀缓存高达 90%–95% 的读取折扣下，逐轮裁剪旧 `tool_result` 会每轮击穿缓存并导致成本反升；最优策略是**平时保持主历史严格只追加，仅在特定低惩罚窗口或高水位红线处做大批次压缩**。具体联动水位设计如下：

水位等级定量触发条件主 Agent 原生历史动作伴生账本（CompanionLedger）协同方式成本与质量权衡依据W1：尾部注意力复述水位主会话累计上下文 > 60,000 Tokens 或连续工具调用 > 8 轮（未达窗口上限）保持 100% 只追加不裁剪，完整复用主会话前缀缓存自动激活 <companion_intent mode="delta"> 中的 effective_constraints 尾部复述缓存读取仅需基础价 5%–10%，用尾部数十 Token 的约束复述低成本对冲长工具输出引发的注意力稀释。W2：缓存预过期空闲水位主会话累计 > 150K–200K Tokens 且 空闲时长逼近缓存 TTL 或宿主回收线（如 1h 缓存闲置达 54 分钟，或接近 Paseo 60 分钟 空闲回收）趁缓存即将自然失效执行空闲压缩或平滑轮转底层会话下一轮用户回归时自动以 <companion_intent mode="bridge"> 注入完整精简账本底座借鉴 Claude Code v2.1.299 空闲压缩算术：既然缓存即将过期、下一轮本就要承担全价冷重写，此时压缩的缓存破坏损失为零，且大幅削减冷恢复延迟。W3：有效注意力硬上限水位逼近模型窗口 80%（200K 窗口取 160K Tokens；1M 窗口因评测显示 >500K 后长程检索明显退化，建议取 350K–400K Tokens）执行批量压缩（保留静态前缀 + 摘要块 + 最近 2–3 轮原始工具轨迹）将账本中的 rootGoal + activeConstraints + workspaceTouchpoints 直接作为主压缩器的强制保留锚点清单第三方网关评测（如 SentinelOne 与 TrueFoundry 披露数据）显示合理压缩可削减最高 86% 输入 Token；用确定性账本锚定可防止主压缩器漏掉关键约束。

   
## 三、 编码/工程场景下的「反过度脑补（Anti-Hallucination）」三道硬护栏

在软件工程场景中，用户经常输入高度凝练的上下文依赖短句（如“把刚才那个接口也改一下”、“不对，撤回重来”、“全部提交 push”）。若无工具视野的轻量模型直接凭对话字面含义去猜文件路径或扩写操作指令，极易编造不存在的模块名，或将全局命令错误限缩到局部文件。为此，本架构构建了「前置确定性直通门控 + 后置确定性 ACP 工具足迹提取 + 出站封闭世界标识符核验」三道硬性护栏。

### 3.1 第一道护栏：确定性零延迟直通门控（Deterministic Bypass Gate，< 1 ms）

在发起任何伴生 LLM 请求前，宿主机先通过纯正则与字符统计规则对输入做毫秒级分流。凡命中下表任一条件的输入，**一律 `0 ms` 零延迟直通（Bypass）主会话**，绝不生成 `<companion_intent>` 干扰主模型执行：

门控规则宿主机确定性匹配判据（耗时 < 1 ms）零延迟直通的防幻觉与性能机理后台账本异步记账行为G0：首轮冷启动直通ledger.lastCommittedTurnSeq === 0（新会话或 /clear 后的第 1 轮）首轮无任何前序上下文可供消解，同步拦截只会平白增加首字延迟，且容易缩窄主模型的初始代码库探索范围。前台 0ms 直通；同时后台并行异步提取 rootGoal（含原话子串锚点）与初始约束落盘，供第 2 轮起调用。G1：斜杠控制命令去首尾空白后以 / 开头（如 /compact、/clear、/new、/steer、/learn）属于 Paseo 客户端或底层 Agent CLI 的控制原语，追加任何附加文本块均可能破坏命令解析。/clear、/new 触发账本 epochId + 1 并清空活跃视图；其余命令直通且不记入业务对话轮。G2：纯确认与选项拍板有效字符数 ≤ 12，完全匹配确认/编号词表（好、好的、继续、可以、行、同意、ok、yes、lgtm、1、2、3、方案1、第一个），且不含否定或转折词（不、别、但、改、除了）主 Agent 上一轮刚在自己原生上下文末尾给出明确方案或请求许可，主模型自身近因记忆完全准确，无需小模型传话。直通主会话；账本将本轮用户意图记为确认上一轮主 Agent 提议。G3：无指代原子工程指令长度 ≤ 35 字符，匹配全局开发动作（如 全部提交 push、跑一下测试、npm test、git status、build 看看、修一下 lint），且零命中指代词集（不含 那个、刚才、上面、它、这个、同样、也、that、it、those、same）以“全部提交 push”为例，主 Agent 运行 git status 即可获取 100% 精确的工作区改动集；若小模型根据账本列举文件名，极易漏掉连带生成的锁文件或配置！直通主会话，严禁附加任何文件范围限定。G4：大段报错日志 / Diff 粘贴总长度 > 1,200 字符且堆栈/代码特征行占比 > 60%（含 Traceback、at ... (file:line)、diff --git 或多行代码块），且随附自然语言说明 < 60 字符、不含跨轮指代词将长堆栈喂给小模型既拖慢首字响应，又易在概括中丢失精确行号；主模型直接解析原始堆栈最可靠。主请求直通（若达 W1 水位需复述硬约束，直接用宿主字符串模板静态拼接 activeConstraints，零 LLM 调用）；后台仅正则截取首行异常名记入账本。G5：多 Bot 结构化委派携带 paseo-bots 的 ask_bot 委派上下文头或定时 Routine 触发标记Chief of Staff 或预设 Routine 的提示词本身已是自包含指令，二次编译属于多余损耗。直通主会话。

   经过 G0–G5 过滤后，真正进入 `PreTurnCompiler` 的恰好是最需要伴生层发力的核心集合——例如含口语指代的短指令（**“把刚才那个接口也改一下”**）、中途推翻纠偏（**“不对，撤回重来，别用事务锁改用乐观锁”**）以及省略主语的追问。

### 3.2 第二道护栏：从 ACP 协议流确定性提取工具足迹（ToolFootprintDigest）

针对你的关键追问——**“除正文外，后置精简时是否需要从主 Agent 工具调用中用宿主机代码确定性提取极简元数据喂给伴生 Session，以解决指代消解盲区？”**——结论是**必须提取，且应完全由宿主机确定性代码从 ACP 协议层结构化提取，不依赖 LLM 解析工具日志**。

在 ACP v1 与 v2 协议规范中，`agy_acp_server` 执行文件读写或终端命令时，会通过 stdio 流式发出结构化的 `session/update` 通知（v1 为 `tool_call` 与 `tool_call_update`，v2 统一为带补丁语义的 `tool_call_update` 与 `terminal_update`）以及编辑器侧文件/终端 RPC 调用（`fs/read_text_file`、`fs/write_text_file`、`terminal/*`）。根据 ACP 官方 Schema，工具调用事件原生包含以下机器可读字段：

- **`locations`（精确代码位置数组）**：包含工具实际触碰的工作区文件路径与行号（原本设计用于让编辑器自动跳转跟随 Agent 视野）；
- **`name` 与 `title`**：编程级工具名与操作描述；
- **`rawInput` / `rawOutput` 与终端退出码（Exit Code）**：记录命令执行结果与进程退出状态。

宿主机 `ACPFootprintCollector` 在轮次进行期间于内存中增量监听上述字段，在 `turnEnded` 时生成一份恒定 **`≤ 180 Tokens` 的 `ToolFootprintDigest`**，既同步写入 `CompanionLedger.workspaceTouchpoints`，又一并传给 `PostTurnDistiller`：

- **`mutatedFiles`**（按最后修改时间倒序排列，最多保留 12 条相对路径及行号区间）：让伴生会话精确掌握“刚才改了哪几个文件”；
- **`inspectedFiles`**（本轮只读未改的关键路径，去重后最多保留 8 条）：支撑“刚才看的那个配置”类指代；
- **`commandOutcomes`**（最近 5 条 Shell 命令截断摘要及 `exitCode`）与 **`errorHeadlines`**（非零退出输出的首行异常签名，最多 2 条）：防止主 Agent 正文语气乐观但实际测试仍处于 `exitCode != 0` 失败态时，伴生账本误将任务记为“已验证通过”。

### 3.3 第三道护栏：出站封闭世界标识符校验（Closed-World Identifier Guard）

为确保万无一失，除了在 Prompt 中规定封闭世界原则外，宿主机在将 `PreTurnCompiler` 输出的 JSON 拼装成 `<companion_intent>` 之前，执行一道耗时 `< 0.5 ms` 的纯代码校验器（`OutboundHallucinationGuard`）：

- **标识符白名单核验**：用正则扫描伴生输出 `inject` 对象中出现的所有类路径字符串（包含 `/`、`\` 或常见源码扩展名如 `.ts`、`.tsx`、`.py`、`.go`、`.rs`、`.json`、`.sql`、`.md`）及反引号代码标识符，构建白名单集合 `W = Tokens(当前用户原话) ∪ Tokens(当前账本全部文本与路径)`。凡是**未在集合 `W` 中精确出现过**的路径或代码符号，一律视为小模型幻觉编造，由宿主机代码直接从 `resolved_targets` 中剔除！
- **多候选歧义强制保留**：当用户说“把刚才那个文件改一下”，而上一轮 `mutatedFiles` 同时包含 `a.ts` 与 `b.ts` 时，禁止小模型擅自二选一，必须将两者并列填入 `candidates: ["a.ts", "b.ts"]` 并标记 `confidence: "AMBIGUOUS_CANDIDATES"`，交由拥有完整代码上下文的主 Agent 最终裁定。
- **高危命令注入拦截**：若用户原话未出现 `reset --hard`、`clean -fd`、`rm -rf`、`--force` 等破坏性字样，而伴生输出中出现了上述词条，校验器立即丢弃该条改写并退回直通模式。

## 四、 并发时序、打断（Steer / Interrupt）与队列（Queue）竞态状态机

在 Paseo 真实使用场景中，用户操作高度异步且存在多种竞态边界。公开 Issue 记录揭示了两类典型宿主并发陷阱：一是 Paseo Issue #4061 反映在 Queue 模式下对排队消息点击 `Send now` 会退化为 `"interrupt"` 中断并替换活跃轮次，造成运行中工作丢失；二是 Paseo Issue #6186 揭示当上一轮尚处于 `startTurn` 启动阶段、底层还未返回 `turnId` 时，紧随其后到达的 `"steer"` 消息因检测不到活跃 `turnId` 而错误触发 `replaceAgentRun`，导致前一条消息被吞没丢失。此外，`paseo-agy-acp` 在取消超时（默认 `30s`）后会发出 `SIGTERM`/`SIGKILL` 强制终止子进程。

为保证账本在任何高频连击、中途纠偏或强行打断下始终严丝合缝，每个会话由唯一的内存协调器 `SessionLedgerCoordinator` 管控，采用「两阶段账本提交（STAGED -> COMMITTED）+ 单调轮次序号 `turnSeq`」状态机。

### 4.1 状态流转契约表

当前状态输入触发事件下一状态协调器原子动作与账本一致性保障IDLE收到新消息或队首出队，命中 BypassClassifierSTAGED_IN_FLIGHT（经 BYPASS_DIRECT）递增 turnSeq；零延迟向 ACP 发出原始提示词；异步记录暂存用户意图。POST_DISTILLING上一轮后置精简尚未返回时，用户极速发出下一轮PRE_COMPILING对上一轮 postTurnPromise 最多等待 150 ms；若仍未完成，立即提取内存 PendingPostTurnSnapshot 拼入前置上下文启动编译。PRE_COMPILING750 ms 内解析出 "PASS" 或 "AUGMENT"STAGED_IN_FLIGHT将 distilled_user_intent 与 staged_constraint_ops 存入内存暂存槽（不写死正式账本）；向 agy_acp_server 发送提示词。PRE_COMPILING超过 750 ms、网络报错或触发幻觉拦截STAGED_IN_FLIGHT（经 FAIL_OPEN_BACKFILL）中止前置流，无感放行用户原话；向后台低优队列投递异步用户意图回填任务。STAGED_IN_FLIGHT运行中收到原生 steer（中途追加纠偏，不终止当前轮）STEER_COMPOSITE将纠偏原话追加至当前 turnSeq 的 steeredMessages[] 数组；同一运行轮共享同一个 turnSeq，待最终结束时合并精简。STAGED_IN_FLIGHT收到 interrupt / session/cancel，且 mutatedFiles 为空、无写副作用命令ABORTED_CLEAN → IDLE纯净回滚（Hard Rollback）：直接丢弃当前轮暂存意图与候选约束补丁，账本状态完全恢复至上一轮提交点。STAGED_IN_FLIGHT收到 interrupt / session/cancel，但工具层已修改磁盘文件或执行非只读命令ABORTED_PARTIAL → IDLE保留脏工作区足迹、挂起未完成意图：不自动固化被中断轮的新增业务目标，但在账本写入 ABORTED_PARTIAL 条目及已修改路径列表，警示下一轮检查半成品现场。STAGED_IN_FLIGHT / STEER_COMPOSITE收到合法非空 session/prompt 完成响应（STATE_FULLY_IDLE）POST_DISTILLING → COMMITTED先同步（< 1 ms）快照保存 PendingPostTurnSnapshot；再异步运行 PostTurnDistiller，完成后按 turn_seq 乐观锁原子落盘并释放内存快照。

   
### 4.2 四大并发竞态边界的工程消解细则

- **0.5 秒极速连发竞态（`turnEnded` 异步窗口重入）**：当第 N-1 轮 `session/prompt` 刚结束时，协调器在发起异步 `PostTurnDistiller` 网络调用前的同一事件循环 Tick 内，先用纯内存操作生成 `PendingPostTurnSnapshot(N-1)`，内含第 N-1 轮前置已提炼的用户需求、主 Agent 响应正文的首尾截断片段（前 300 字符 + 末尾 500 字符，覆盖核心结论与追问）以及确定性提取的 `ToolFootprintDigest`。若用户在 `0.5 秒` 内立即发出第 N 轮请求，协调器执行 `Promise.race([postTurnPromise(N-1), sleep(150)])`：若 150 ms 内第 N-1 轮精简正好完成，直接读取最新落盘账本；若未完成，第 N 轮立即将该内存快照作为临时字段传入 `PreTurnCompiler`，既避免串行卡顿，又保证“刚才上一轮改了什么、问了什么”零丢失。随后当后台第 N-1 轮 `PostTurnDistiller` 真正返回时，严格按主键 `turn_seq = N - 1` 覆写对应历史槽位并执行约束版本合并，绝不冲掉正在飞行中的第 N 轮暂存数据。
- **中途打断重发（Interrupt & Replace）的工作区一致性保护**：正如 `paseo-bots` 文档所强调，点击 Stop 中断智能体只能停止后续步骤，**无法自动撤销智能体已经落盘的文件修改或 Shell 副作用**。因此，当用户中途打断并重发新指令（例如“停一下，方向错了，别改 auth.ts 改 middleware.ts”）时，若简单将上一轮从账本中彻底抹除，下一轮伴生与主会话就会遗忘 `auth.ts` 可能正处于改了一半的破损状态。通过根据 `ACPFootprintCollector` 是否捕获到写操作而拆分为 `ABORTED_CLEAN` 与 `ABORTED_PARTIAL` 两条分支，协调器在存在已写文件时自动向紧随其后的新一轮 `<companion_intent>` 注入 `dirty_state_warning`，提示主 Agent 核查并按需还原上一轮残留修改。
- **启动期 Steer 屏障（规避 `#6186` 启动窗口丢包）**：针对 Paseo 曾出现的“轮次尚在启动、未拿到 `turnId` 时收到 `steer` 导致前序消息被替换丢失”问题，协调器在收到首条消息进入 `PRE_COMPILING` 的瞬间即在内存创建 `activeStartingBarrier`：凡在 `PRE_COMPILING` 及等待 ACP 接受请求期间到达的同会话 `steer` 消息，一律合并追加进当前待发批次，统一合成一次请求下发，实现零丢包且省去多余推理。
- **队列追加（Queue）的出队即时编译原则（Lazy Dequeue JIT）**：当主会话正忙而用户连续向 Paseo 队列压入后续任务 Q1、Q2 甚至排队 `/clear` 命令时，**严禁在消息入队时刻提前调用伴生模型编译**。因为入队时刻当前运行轮尚未产出正文结论与文件改动足迹，且用户在出队前随时可能编辑或删除队列项。所有排队消息必须保持原始文本形态，严格等到前序轮次闭合（或排队 `/clear` 执行完 `epochId` 重置）、队首消息正式出队准备启动的那一刻，再读取最新账本执行 JIT 前置编译。

## 五、 首字延迟预算（TTFT 300–800ms）压制与无感降级（Fail-Open）

### 5.1 2026 轻量快模型延迟与精度权衡及五项削峰手段

为确保前置同步多跳一次 LLM 不会让开发者感到明显卡顿，我们综合 2026 年第三方 API 网关与工程基准实测数据（包括 Crazyrouter 2026 年 4 月推理速度榜单、Contra Collective 针对北美东区各厂商官方端点的实测对比，以及 Katanemo 专用路由模型测试），对候选模型的首字延迟（TTFT）、生成吞吐（TPS）与编码结构化精度进行了横向校准。

如上图数据所示，在 2026 年轻量模型梯队中存在清晰的“极速低价”与“高精编码语义”权衡：据第三方基准测试，`Gemini 2.5 Flash-Lite`（`$0.10 / $0.40` 每百万输入/输出 Token，首字延迟约 `140 ms`，生成速度约 `240 TPS`）与 `Gemini 3.1 Flash`（首字延迟中位数 `220 ms`，吞吐 `168 TPS`，多语言分类准确率 `92.6%`）拥有最快响应速度与最低单价；而 `Claude Haiku 4.5`（`$1.00 / $5.00` 每百万 Token，首字延迟中位数 `280 ms`，吞吐 `142–180 TPS`）则在编码理解（HumanEval `86.2%` 对比 Flash 的 `78.4%`）、工具调用语义（BFCL v3 `91.4%` 对比 `84.7%`）与结构化 JSON 合法率（`99.2%` 对比 `97.6%`）上明显占优，且在生产稳定性上较少出现静默行为漂移。

为了将端到端前置编译耗时（网络传输 + TTFT + 输出生成 + 校验拼装）稳定压入 `300–800 ms` 预算窗口内，工程实现应协同部署五项延迟压制手段：

首先是**强制零思考预算（Zero Thinking Budget）与混合模型分级**。实测开启内部推理链的模型仅思考等待即可耗时 1–19 秒以上，因此伴生调用必须显式关闭一切扩展思考（如 Gemini 配置 `thinkingBudget: 0`、Claude Haiku 4.5 禁用 `thinking` 块）。默认推荐前置编译器可选 `Gemini 2.5 Flash-Lite`（极致速度优先）或 `Claude Haiku 4.5`（复杂编码指代精度优先），而后置精简器因完全异步运行，统一采用 `Gemini 2.5 Flash-Lite` 或 `GPT-4.1 Nano`（均为 `$0.10 / $0.40` 每百万 Token），使每轮伴生双跳的 API 综合成本低至 `0.05 美分` 以下。

其次是**JSON 字段序流式早停（Field-Ordered Streaming Early-Exit）**，这是削减 35%–55% 生成等待的关键技巧。前置输出 Schema 强制要求模型按固定键顺序输出：第 1 个键为 `"action"`（`"PASS"` 或 `"AUGMENT"`，仅占前 6–8 个生成 Token），第 2 个键为发往主会话的极简 `"inject"` 对象（严格限制 ≤ 65 Tokens），第 3 个键才是写给本地账本的 `"ledger_prep"`。宿主机流式扫描 SSE 字节流时，一旦匹配到 `"action":"PASS"`，在首字返回后仅需约 `30–40 ms` 即可立即放行主会话请求；即便命中 `"action":"AUGMENT"`，只要解析到 `"inject"` 对象闭合花括号，便立即通过白名单校验并发出主会话请求，将尾部 `"ledger_prep"` 字段的生成耗时移出用户等待关键路径。

再者是**HTTP/2 常驻连接池保活**、**静态前缀填充对齐缓存门槛**以及**与 `paseo-agy-acp` Admission 准入队列并行掩蔽**。宿主机复用长连接消除 80–150 ms 的每次 TLS 握手开销；将伴生 System Prompt 配合固定校准示例填充至满足目标提供商自动缓存激活阈值（各厂商一般为 `1,024–4,096 Tokens`）；同时在收到请求的第 0 毫秒并行触发 `admission.acquireSeat()` 与 `companion.compilePreTurn()`——在多智能体并发排队或受限于 `2s` 最小启动间隔的场景下，前置编译耗时被准入等待自然掩蔽。

下表展示了穿透确定性门控后的请求在两款推荐模型下的端到端主链路耗时预算（基于上述第三方基准中位数推算）：

前置关键路径环节Gemini 2.5 Flash-Lite 耗时估算Claude Haiku 4.5 耗时估算延迟压制工程保障1. BypassClassifier 判定 + 内存账本视图序列化0.8 ms0.8 ms活跃会话账本驻留内存，零磁盘阻塞读取2. HTTP/2 复用连接请求 + 静态前缀缓存匹配 TTFT140–180 ms260–310 ms关闭 Thinking 预算；复用连接池与静态前缀缓存3a. 流式读到 "action":"PASS" 立即早停放行（~8 Tokens）~175–215 ms~310–365 ms无需等待后续 "ledger_prep" 生成完毕3b. 流式闭合 "inject" 对象早停放行（~65 Tokens）~410–455 ms~640–710 ms"inject" 严格排在 "ledger_prep" 之前并限长4. OutboundHallucinationGuard 白名单核验 + 尾部拼接0.4 ms0.4 ms纯内存 Set 查找与模板拼接主链路有效新增延迟合计（未计 Admission 排队掩蔽）176–456 ms311–711 ms全量落入 300–800 ms 预算上限以内（硬超时 750 ms）

   
### 5.2 Fail-Open 无感回退与故障域隔离熔断

当遇到公网抖动、模型限流（`429`）或偶发慢请求时，伴生层必须做到对前台用户与主内核 **100% 透明无感降级**：

- **`750 ms` 硬截止超时（Hard Deadline Abort）**：每次前置调用挂载 `AbortController` 定时器（默认 `750 ms`）。一旦超时未闭合 `"inject"`，立即中断流等待并**将用户原话原样发往 `agy_acp_server`**；若该轮恰好处于跨压缩/空闲回收后的 `mode="bridge"` 首轮，宿主机直接用 `< 0.5 ms` 的纯确定性代码模板把 SQLite 账本里的 `rootGoal` 与 `activeConstraints` 拼成静态恢复块附在末尾，不依赖实时 LLM 推理即可保住关键约束。
- **后台意图无洞回填（Async Out-of-Band Backfill）**：前置超时放行后，协调器自动在后台异步发起一次放宽超时（`5,000 ms`）的轻量提取任务，趁主 Agent 正在执行数十秒工具链的间隙将本轮 `distilledUserIntent` 补写入暂存槽，确保下一轮账本历史不断档。
- **独立健康域熔断器（Scoped Circuit Breaker）**：遵循多运行时健康状态作用域隔离设计，若伴生模型接口在滑动窗口内连续 3 次超时或返回 `5xx`，伴生协调器自动进入 `60 秒` 静默旁路态（期间所有请求 `0 ms` 直通或走静态模板），60 秒后仅放行单次探测请求验证恢复，绝不阻塞主会话或触发 `paseo-agy-acp` 的会话级报错。

## 六、 最终工程落地方案：Schema、生产级 Prompt 模板与演进路线图

### 6.1 结构化精简账本 JSON Schema（`CompanionLedgerV1`）

宿主机在 SQLite 中持久化如下完整结构，并在每次调用伴生模型前剥离冷归档数据，确保输入 JSON 紧凑稳定：

JSON
```
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CompanionLedgerV1",
  "type": "object",
  "required": [
    "schemaVersion",
    "sessionId",
    "epochId",
    "lastCommittedTurnSeq",
    "rootGoal",
    "activeConstraints",
    "recentlyRevokedConstraints",
    "workspaceTouchpoints",
    "completedMilestones",
    "recentDistilledTurns"
  ],
  "properties": {
    "schemaVersion": { "const": "1.0" },
    "sessionId": { "type": "string", "description": "Bound Paseo / ACP session ID" },
    "epochId": { "type": "integer", "minimum": 1, "description": "Incremented on /clear or /new" },
    "lastCommittedTurnSeq": { "type": "integer", "minimum": 0 },
    "rootGoal": {
      "type": "object",
      "required": ["summary", "verbatimAnchor", "establishedAtTurn"],
      "properties": {
        "summary": { "type": "string", "maxLength": 240 },
        "verbatimAnchor": {
          "type": "string",
          "maxLength": 300,
          "description": "Exact substring copied from user message by host code; never LLM-rewritten"
        },
        "establishedAtTurn": { "type": "integer" }
      }
    },
    "activeConstraints": {
      "type": "array",
      "maxItems": 12,
      "items": {
        "type": "object",
        "required": ["id", "polarity", "rule", "verbatimEvidence", "validFromTurn"],
        "properties": {
          "id": { "type": "string", "pattern": "^C[0-9]+$" },
          "polarity": { "enum": ["MUST", "MUST_NOT", "PREFER"] },
          "rule": { "type": "string", "maxLength": 160 },
          "verbatimEvidence": { "type": "string", "maxLength": 140 },
          "validFromTurn": { "type": "integer" }
        }
      }
    },
    "recentlyRevokedConstraints": {
      "type": "array",
      "maxItems": 3,
      "description": "Retained for 3 turns after SUPERSEDE/REVOKE to prevent bounce-back, then moved to cold audit table",
      "items": {
        "type": "object",
        "required": ["id", "oldRule", "revokedAtTurn", "reason"],
        "properties": {
          "id": { "type": "string" },
          "oldRule": { "type": "string", "maxLength": 120 },
          "revokedAtTurn": { "type": "integer" },
          "reason": { "type": "string", "maxLength": 120 }
        }
      }
    },
    "workspaceTouchpoints": {
      "type": "object",
      "description": "Deterministically populated by host ACPFootprintCollector from ACP session/update events",
      "required": ["recentMutatedFiles", "recentInspectedFiles", "lastCommandOutcomes", "lastErrorHeadlines"],
      "properties": {
        "recentMutatedFiles": {
          "type": "array",
          "maxItems": 12,
          "items": {
            "type": "object",
            "required": ["path", "lastTouchedTurn", "op"],
            "properties": {
              "path": { "type": "string" },
              "lines": { "type": "string" },
              "lastTouchedTurn": { "type": "integer" },
              "op": { "enum": ["write", "edit", "create", "delete"] }
            }
          }
        },
        "recentInspectedFiles": {
          "type": "array",
          "maxItems": 8,
          "items": { "type": "string" }
        },
        "lastCommandOutcomes": {
          "type": "array",
          "maxItems": 5,
          "items": {
            "type": "object",
            "required": ["cmd", "exitCode", "turn"],
            "properties": {
              "cmd": { "type": "string", "maxLength": 80 },
              "exitCode": { "type": "integer" },
              "turn": { "type": "integer" }
            }
          }
        },
        "lastErrorHeadlines": {
          "type": "array",
          "maxItems": 2,
          "items": { "type": "string", "maxLength": 160 }
        }
      }
    },
    "completedMilestones": {
      "type": "array",
      "maxItems": 8,
      "items": { "type": "string", "maxLength": 140 }
    },
    "recentDistilledTurns": {
      "type": "array",
      "maxItems": 8,
      "description": "Sliding window of last K=8 clean (User Intent <-> Assistant Outcome) pairs",
      "items": {
        "type": "object",
        "required": ["turnSeq", "status", "distilledUserIntent", "distilledAssistantReply", "mutatedFiles"],
        "properties": {
          "turnSeq": { "type": "integer" },
          "status": { "enum": ["COMPLETED", "ABORTED_PARTIAL"] },
          "distilledUserIntent": { "type": "string", "maxLength": 200 },
          "distilledAssistantReply": { "type": "string", "maxLength": 240 },
          "mutatedFiles": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}

```

### 6.2 Pre-Turn 前置意图编译器生产级 System Prompt 模板

实现说明：部署时可在末尾静态示例区补充 2–3 组固定领域 Few-Shot 样本，使该静态 System Prompt 长度跨过所选模型提供商的最小前缀缓存阈值（`1,024–4,096 Tokens`），并且严禁在 System Prompt 内拼入任何动态会话字段：

XML
```
You are the Pre-Turn Companion Intent Disambiguator for an autonomous coding agent hosted on Paseo + Antigravity ACP.
You have NO access to tools, the full file tree, or raw terminal logs. Your sole task is to analyze `LEDGER_STATE` and `CURRENT_USER_MESSAGE`, resolve conversational pronouns, ellipses, or requirement pivots, and output a single compact, valid JSON object with NO markdown code fences and NO extra commentary.

### STRICT ANTI-HALLUCINATION & OPERATING LAWS

1. CLOSED-WORLD IDENTIFIER LAW (MANDATORY):
   - NEVER invent, guess, extrapolate, or autocomplete file paths, folder names, class/function identifiers, CLI flags, or commit hashes.
   - Every path or code symbol placed in `inject.resolved_targets` MUST exist character-for-character inside `CURRENT_USER_MESSAGE` OR `LEDGER_STATE` (`workspaceTouchpoints`, `activeConstraints`, `recentDistilledTurns`).
   - When a pronoun ("那个接口", "刚才改的文件", "that handler") could match multiple paths in `workspaceTouchpoints`, include ALL plausible candidates from the ledger and set `"confidence": "AMBIGUOUS_CANDIDATES"`. Never guess one silently.

2. WHEN TO RETURN `"action": "PASS"` (STREAMING FAST EXIT):
   - Return `"action": "PASS"` immediately when `CURRENT_USER_MESSAGE` is already self-contained, clear, free of unresolved pronouns, does not revoke/modify prior constraints, AND `INJECTION_MODE` is `"delta"` with `RECITATION_NEEDED` = `false`.
   - When `"action": "PASS"`, set `"inject": null` and still fill `"ledger_prep"` for clean ledger tracking.

3. WHEN TO RETURN `"action": "AUGMENT"`:
   - User message relies on pronouns, omissions, or implicit comparisons ("把另一个也加上", "按第二种方案改", "同样处理一下鉴权层").
   - User changes direction, adds a guardrail, or revokes an earlier constraint ("别动数据库迁移文件了", "先只分析原因别改代码").
   - User asks to revert/retry ("不对，撤回重来") or responds after an `ABORTED_PARTIAL` turn or non-zero `exitCode`.
   - `RECITATION_NEEDED` is `true` or `INJECTION_MODE` is `"bridge"`.

4. NO SCOPE NARROWING OR SYNTHESIZED DESTRUCTIVE COMMANDS:
   - Never narrow a global request (e.g., "跑全量测试", "全部提交") down to only the files listed in `recentMutatedFiles`.
   - Never introduce `git reset --hard`, `git clean`, `rm -rf`, or `--force` unless those exact words appear in `CURRENT_USER_MESSAGE`.

### EXACT JSON OUTPUT KEY ORDER (REQUIRED FOR STREAMING EARLY-EXIT)

Output keys in this exact sequence:
{
  "action": "PASS" | "AUGMENT",
  "inject": null | {
    "intent_kind": "DISAMBIGUATE" | "PIVOT_CONSTRAINT" | "REVERT_OR_RETRY" | "RECITE_CONSTRAINTS" | "BRIDGE_RECOVERY",
    "clarified_goal": "1-2 concise sentences in the user's language stating resolved intent without inventing paths (max 180 chars)",
    "resolved_targets": [
      { "phrase": "pronoun in user text", "candidates": ["exact/path/from/ledger.ts"], "confidence": "HIGH" | "AMBIGUOUS_CANDIDATES" }
    ],
    "effective_constraints": ["[MUST] ...", "[MUST_NOT] ... (max 4 active constraints relevant to this turn)"],
    "dirty_state_warning": null | "Brief warning ONLY if previous turn status was ABORTED_PARTIAL or last exitCode != 0"
  },
  "ledger_prep": {
    "distilled_user_intent": "Self-contained 1-sentence summary of the user's request in this turn (max 180 chars)",
    "staged_constraint_ops": [
      {
        "op": "ADD" | "SUPERSEDE" | "REVOKE",
        "target_id": null | "C1",
        "polarity": "MUST" | "MUST_NOT" | "PREFER",
        "rule": "Concise normalized constraint",
        "verbatim_quote": "Exact substring from CURRENT_USER_MESSAGE"
      }
    ]
  }
}

### CALIBRATION EXAMPLES

Example A (Pronoun + Constraint Override -> AUGMENT):
Ledger Context: `recentMutatedFiles` = `["ACP Connector/proxy.ts", "Admission Controller/lock.ts"]`; `activeConstraints` = `[C1: MUST Keep SQLite lock wait at 5000ms]`.
User Message: "不对，把刚才那个锁模块的等待时间改成 3000ms，而且千万别影响握手阶段"
Output:
{"action":"AUGMENT","inject":{"intent_kind":"PIVOT_CONSTRAINT","clarified_goal":"将上一轮修改的锁模块等待超时由 5000ms 改为 3000ms，并确保握手阶段不受锁等待阻塞。","resolved_targets":[{"phrase":"刚才那个锁模块","candidates":["Admission Controller/lock.ts"],"confidence":"HIGH"}],"effective_constraints":["[MUST] SQLite 锁等待超时设为 3000ms（覆写原 5000ms）","[MUST_NOT] 阻塞或影响握手（handshake）阶段"],"dirty_state_warning":null},"ledger_prep":{"distilled_user_intent":"将 Admission Controller/lock.ts 的等待时间从 5000ms 调整为 3000ms，要求不阻塞握手阶段。","staged_constraint_ops":[{"op":"SUPERSEDE","target_id":"C1","polarity":"MUST","rule":"SQLite 锁等待超时设为 3000ms","verbatim_quote":"等待时间改成 3000ms"},{"op":"ADD","target_id":null,"polarity":"MUST_NOT","rule":"严禁影响或阻塞握手阶段","verbatim_quote":"千万别影响握手阶段"}]}}

Example B (Clear Self-Contained Query -> PASS):
Ledger Context: `RECITATION_NEEDED` = `false`.
User Message: "检查 vitest.config.ts 里的超时配置是多少"
Output:
{"action":"PASS","inject":null,"ledger_prep":{"distilled_user_intent":"查询 vitest.config.ts 中的测试超时配置。","staged_constraint_ops":[]}}

```

当返回 `"AUGMENT"` 并通过宿主机 `OutboundHallucinationGuard` 白名单核验后，最终发往 `agy_acp_server` 的 `session/prompt` 文本结构如下（完整保留用户原话在前）：

XML
```
不对，把刚才那个锁模块的等待时间改成 3000ms，而且千万别影响握手阶段

<companion_intent mode="delta" turn="6" authority="advisory_disambiguation">
intent: PIVOT_CONSTRAINT — 将上一轮修改的锁模块等待超时由 5000ms 改为 3000ms，并确保握手阶段不受锁等待阻塞。
referents: "刚才那个锁模块" -> [Admission Controller/lock.ts (confidence=HIGH; verify in workspace)]
active_constraints:
- [MUST] SQLite 锁等待超时设为 3000ms（覆写原 5000ms）
- [MUST_NOT] 阻塞或影响握手（handshake）阶段
</companion_intent>

```

### 6.3 Post-Turn 后置响应正文精简与对账器生产级 System Prompt 模板

XML
```
You are the Post-Turn Reply Distiller & Ledger Reconciler for a software engineering agent session.
You are given:
1. `LEDGER_CONTEXT`: Current root goal, active constraints, `STAGED_USER_INTENT`, and `STAGED_CONSTRAINT_OPS` from the start of this turn.
2. `TOOL_FOOTPRINT_DIGEST`: Deterministic ground-truth facts captured from ACP protocol events (`mutatedFiles`, `inspectedFiles`, `commandOutcomes` with exit codes, `errorHeadlines`).
3. `STRIPPED_ASSISTANT_PROSE`: The main agent's visible text response (internal thinking blocks and raw tool outputs already removed).

Output a single valid JSON object (no markdown fences) summarizing the concrete outcome of this turn for future disambiguation.

### STRICT DISTILLATION RULES

1. GROUND TRUTH OVER CONVERSATIONAL TONE:
   - Always reconcile `STRIPPED_ASSISTANT_PROSE` with `TOOL_FOOTPRINT_DIGEST`.
   - If `commandOutcomes` shows a non-zero `exitCode` or `mutatedFiles` is empty when code changes were discussed, state that explicitly (e.g., "仅完成根因定位未改文件" or "已修改 lock.ts 但单测仍失败 exitCode=1").
   - MUST preserve any concrete options, pending confirmation questions, or next-step proposals the assistant asked at the end of its reply (so a subsequent user reply like "好" or "选第 2 个" retains exact context).

2. PATCH-ONLY CONSTRAINT GOVERNANCE:
   - Never rewrite or re-emit unchanged `activeConstraints`.
   - Set `confirm_staged_ops: true` if the turn proceeded under the user's staged constraints; only emit `additional_constraint_ops` if a temporary one-off constraint was explicitly fulfilled and closed in this turn.

3. SLIDING WINDOW MILESTONE ROLL-UP:
   - Only when `EVICTING_OLD_TURN` is non-null (sliding out of the K=8 window) and represents a completed sub-task, condense its outcome into `new_milestone` (<= 120 chars); otherwise output `null`.

### REQUIRED JSON OUTPUT SCHEMA

{
  "distilled_assistant_reply": "1-3 dense factual sentences (max 220 chars) stating: what files/logic changed or were found, verification/exitCode status, and any open question/choice left for the user.",
  "finalized_user_intent": "Copy `STAGED_USER_INTENT` verbatim unless it was null due to pre-turn timeout, in which case summarize `RAW_USER_MESSAGE` in <= 160 chars.",
  "confirm_staged_ops": true | false,
  "additional_constraint_ops": [],
  "root_goal_shift": null | {
    "new_summary": "Populate ONLY if the user initiated an entirely new, unrelated engineering task"
  },
  "new_milestone": null | "Concise completed milestone from `EVICTING_OLD_TURN`"
}

```

### 6.4 分阶段演进路线图（MVP -> V1.5 -> V2.0）

结合 `paseo-agy-acp` 现有的自动化验证矩阵（隔离假内核 stdio 生命周期测试、`@getpaseo/server@0.14.0` 客户端契约测试与守护进程空闲回收测试），建议分三个阶段渐进交付：

阶段划分核心工程交付范围推荐环境变量开关建议工程上线验收红线（Target SLOs）Phase 1：影子旁路验证与基础账本（MVP，第 1–2 周）落地独立 SQLite CompanionLedgerStore 与 ACPFootprintCollector（采集 locations 与 exitCode）；实现 G0–G5 BypassClassifier 与异步 PostTurnDistiller；前置编译先以影子只读模式（Shadow Dry-Run）运行并记录对比日志，暂不向 session/prompt 注入 <companion_intent>。AGY_COMPANION_MODE="shadow"；AGY_COMPANION_MODEL="gemini-2.5-flash-lite"门控规则覆盖日常 35%–50% 的无需改写轮次；经 OutboundHallucinationGuard 校验后未登记幻觉路径漏出率为 0%；Admission SQLite 零锁冲突（0 次 -32000 错误）。Phase 2：流式早停尾部注入与全并发状态机（V1.5，第 3–4 周）切换为活跃尾部追加模式（mode="delta"）；上线 JSON 字段序流式早停、HTTP/2 连接池与 750 ms Fail-Open 异步回填；完整交付 150 ms 极速连发快照桥接、ABORTED_PARTIAL 脏现场警示、启动期 Steer 合并屏障及 Queue 出队即时编译。AGY_COMPANION_MODE="active"；AGY_COMPANION_PRE_TIMEOUT_MS="750"穿透门控请求的前置有效新增延迟目标 P50 ≤ 350 ms、P95 ≤ 700 ms；主会话前缀缓存读取命中率较基线波动 < 1%；打断重发、连击与排队集成用例账本状态 100% 自洽。Phase 3：空闲预过期联动压缩与项目记忆沉淀（V2.0，第 5–6 周）打通 W1/W2/W3 三级水位线（特别是 54 分钟缓存预过期与 Paseo 1 小时进程回收后的 mode="bridge" 桥接注入）；上线每 20 轮后台真值对账；与 paseo-bots 的 /learn 及 MEMORY.md 联动，支持在会话归档时将持久性架构约束一键提议保存为 Bot 长期记忆。AGY_COMPANION_BRIDGE_ON_RESUME="1"；可选本地 Arch-Router-1.5B 承担 50ms 级边缘意图路由在 50–100 轮长程编码回归测试集中，跨轮约束遗忘率与指代返工率显著下降；跨空闲回收/压缩后的续接零断片，充分兑现提示词缓存 41%–80% 的长期 API 成本节省区间。

   [github.comresearch-context-rot-and-management.md - GitHub在新窗口中打开](https://github.com/rodrigorjsf/agent-engineering-toolkit/blob/development/docs/general-llm/research-context-rot-and-management.md)[mnemoverse.comPrompt-Cache Keys: Stable Prefix, KV-Cache Hit Rate - Mnemoverse在新窗口中打开](https://mnemoverse.com/docs/research/agents/kv-cache-context-engineering)[github.comVILA-Lab/Dive-into-Claude-Code: A Systematic Analysis ... - GitHub在新窗口中打开](https://github.com/VILA-Lab/Dive-into-Claude-Code)[developersdigest.techClaude Code Idle Compaction: What It Does and How to Turn It Off在新窗口中打开](https://www.developersdigest.tech/blog/claude-code-idle-compaction-turn-off-cache-cost-2026)[arxiv.orgLength Is Cheap, Competition Is Not: Attention Predicts Context Rot在新窗口中打开](https://arxiv.org/html/2611.04169v1)[zyte.comHow do you manage the context window in Claude Code and ... - Zyte在新窗口中打开](https://www.zyte.com/blog/how-to-manage-context-window-claude-code/)[medium.comPrompt Caching Economics: When 90% Savings Becomes a Trap在新窗口中打开](https://medium.com/@ai_transfer_lab/prompt-caching-economics-when-90-savings-becomes-a-trap-d909736c0917)[blog.getdarwin.aiAI Guardrails in 2026: 9 Hallucination Prevention Strategies B2B在新窗口中打开](https://blog.getdarwin.ai/en/ai-guardrails-hallucination-prevention-2026)[safeguard.shAgent Client Protocol Explained: How Editors Talk to Coding Agents在新窗口中打开](https://safeguard.sh/resources/blog/agent-client-protocol-explained-how-editors-talk-to-coding-agents-and-how-to-secure-it)[arxiv.orgzep:atemporal knowledge graph architecture for agent memory - arXiv在新窗口中打开](https://arxiv.org/pdf/2501.13956)[digitalapplied.comOpen-Source Agent Memory: Mem0 vs Letta vs Zep - Digital Applied在新窗口中打开](https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared)[arxiv.orgGoverning Evolving Memory in LLM Agents: Risks, Mechanisms在新窗口中打开](https://arxiv.org/html/2603.11768v1)[github.comGitHub - tiezbro/paseo-agy-acp在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp)[arxiv.org在新窗口中打开](https://arxiv.org/pdf/2601.06007)[agentclientprotocol.comMigrating from v1 - Agent Client Protocol在新窗口中打开](https://agentclientprotocol.com/protocol/v2/migration)[crazyrouter.comAI Inference Speed Benchmark 2026: Tokens Per Second Compared在新窗口中打开](https://crazyrouter.com/en/blog/ai-inference-speed-benchmark-2026)[contracollective.comClaude Haiku 4.5 vs Gemini 3.1 Flash vs GPT-5.5 Mini: Cheap Tier在新窗口中打开](https://contracollective.com/blog/claude-haiku-4-5-vs-gemini-3-1-flash-vs-gpt-5-5-mini-cheap-tier-2026)[github.comA steer message that arrives while a Codex turn is still starting在新窗口中打开](https://github.com/getpaseo/paseo/issues/6186)[github.compaseo-bots - GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots)[github.combug: send-now on a queued message interrupts the active turn在新窗口中打开](https://github.com/getpaseo/paseo/issues/4061)[exe.devRun Paseo on a remote server - exe.dev在新窗口中打开](https://exe.dev/deploy/paseo)[github.comyeyan00/paseo-bots: Build teams of coding bots across ... - GitHub在新窗口中打开](https://github.com/yeyan00/paseo-bots)[github.com在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp/issues/11)[neoneye.github.ioAgent Memory Atlas在新窗口中打开](https://neoneye.github.io/agent-memory-atlas/)[arxiv.orgComposer 2 Technical Report - arXiv在新窗口中打开](https://arxiv.org/html/2603.24477v2)[researchgate.net(PDF) Comparative Evaluation of Agentic Workflow Capabilities in AI在新窗口中打开](https://www.researchgate.net/publication/410822551_Comparative_Evaluation_of_Agentic_Workflow_Capabilities_in_AI_IDE_Agents_for_Web-Based_Learning_Media_Development)[arxiv.orgDo Security Mechanisms Really Protect Coding Agent Harnesses?在新窗口中打开](https://arxiv.org/html/2610.07639v2)[github.comPlano is an AI-native proxy server and data plane for agentic apps在新窗口中打开](https://github.com/katanemo/plano)[github.combizmindx/archgw: The AI-native proxy server for agents. Arch在新窗口中打开](https://github.com/bizmindx/archgw)[docs.planoai.devOrchestration | Plano Docs v0.4.39在新窗口中打开](https://docs.planoai.dev/guides/orchestration.html)[promptquorum.comPlano Review 2026: Self-Hosted AI Gateway on Envoy在新窗口中打开](https://www.promptquorum.com/power-local-llm/plano-review)[reddit.comopen source intelligent middle-ware for fast and observable agentic在新窗口中打开](https://www.reddit.com/r/LocalLLaMA/comments/1gan3p9/introducing_arch_open_source_intelligent/)[digitalocean.comHow We Built DigitalOcean Inference Router在新窗口中打开](https://www.digitalocean.com/blog/inference-router-architecture)[arxiv.orgArch-Router: Aligning LLM Routing with Human Preferences - arXiv在新窗口中打开](https://arxiv.org/html/2506.16655v1)[arxiv.orgGraph-Native Cognitive Memory for AI Agents - arXiv在新窗口中打开](https://arxiv.org/pdf/2603.17244)[arxiv.orgSleep-time Compute: Beyond Inference Scaling at Test-time - arXiv在新窗口中打开](https://arxiv.org/abs/2504.13171)[arxiv.orgSleep-time Compute: Beyond Inference Scaling at Test-time - arXiv在新窗口中打开](https://arxiv.org/html/2504.13171v1)[letta.comSleep-time Compute - Letta在新窗口中打开](https://www.letta.com/blog/sleep-time-compute/)[dev.toWhat is memory consolidation in long-term AI memory systems?在新窗口中打开](https://dev.to/izgorodin/what-is-memory-consolidation-in-long-term-ai-memory-systems-2j8e)[upsolve.aiAI Agent Memory Explained: Diagrams, Tools & Architecture在新窗口中打开](https://upsolve.ai/blog/ai-agent-memory)[medium.comMem0: Building Production-Ready AI Agents with Scalable Long在新窗口中打开](https://medium.com/@EleventhHourEnthusiast/mem0-building-production-ready-ai-agents-with-scalable-long-term-memory-9c534cd39264)[arxiv.orgZep: A Temporal Knowledge Graph Architecture for Agent Memory在新窗口中打开](https://arxiv.org/abs/2501.13956)[arxiv.orgZep: A Temporal Knowledge Graph Architecture for Agent Memory在新窗口中打开](https://arxiv.org/html/2501.13956v1)[dspy.aiDSPy: Program, don't prompt, your LLMs在新窗口中打开](https://dspy.ai/current/)[towardsdatascience.comContext Engineering — A Comprehensive Hands-On Tutorial with在新窗口中打开](https://towardsdatascience.com/context-engineering-a-comprehensive-hands-on-tutorial-with-dspy/)[claude.comBest practices for computer and browser use with Claude在新窗口中打开](https://claude.com/ja/blog/best-practices-for-computer-and-browser-use-with-claude?destination=%2Fleadership-organisations%2Fpsychopath-c-suite%3Fp%3D&fcdaa149_sort_date=desc)[manus.imContext Engineering for AI Agents: Lessons from Building Manus在新窗口中打开](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)[medium.comContext Engineering for AI Agents: Key Lessons from Manus - Medium在新窗口中打开](https://medium.com/@contextspace/context-engineering-for-ai-agents-key-lessons-from-manus-319ab68e4370)[dev.toOpenHands — Deep Dive & Build-Your-Own Guide - DEV Community在新窗口中打开](https://dev.to/truongpx396/openhands-deep-dive-build-your-own-guide-1al0)[researchgate.net(PDF) The OpenHands Software Agent SDK: A Composable and在新窗口中打开](https://www.researchgate.net/publication/397322275_The_OpenHands_Software_Agent_SDK_A_Composable_and_Extensible_Foundation_for_Production_Agents)[preprints.orgContext Compression for Long-Horizon AI Agents: Lifecycle在新窗口中打开](https://www.preprints.org/manuscript/202607.0924)[grizzlypeaksoftware.comLLM Provider Pricing in 2026: What It Actually Costs Per Task - Library在新窗口中打开](https://www.grizzlypeaksoftware.com/library/comparing-llm-provider-pricing-and-performance-19oanku0)[digitalapplied.comContext Engineering: Agent Reliability Playbook 2026 - Digital Applied在新窗口中打开](https://www.digitalapplied.com/blog/context-engineering-agent-reliability-playbook-2026)[arxiv.orgA Systematization of Security on the Path to AI-Native Operating在新窗口中打开](https://arxiv.org/pdf/2609.23700)[arxiv.orgTokenPilot: Cache-Efficient Context Management for LLM Agents在新窗口中打开](https://arxiv.org/html/2606.17016v2)[ovaledge.comWhat is Context Rot and Why it Breaks Production AI Systems在新窗口中打开](https://www.ovaledge.com/blog/context-rot)[nayakpplaban.medium.comMemory Compaction in AI Agent Harnesses - Plaban Nayak在新窗口中打开](https://nayakpplaban.medium.com/memory-compaction-in-ai-agent-harnesses-ce0ac91b85fa)[louisbouchard.aiContext Engineering in 2026: Why We Stopped Compacting Our在新窗口中打开](https://www.louisbouchard.ai/context-engineering-2026/)[asana.comHow we cut a browser agent's cost 76x and made it 5x faster ... - Asana在新窗口中打开](https://asana.com/inside-asana/cut-browsers-agent-cost)[github.comQueue /clear (and /new, /exit) behind a running turn, like Claude在新窗口中打开](https://github.com/getpaseo/paseo/discussions/6365)[orcaagent.devOrca Agent changelog在新窗口中打开](https://orcaagent.dev/changelog/)[pkg.go.devacp package - kon.kitsu.red/core/acp - Go Packages在新窗口中打开](https://pkg.go.dev/kon.kitsu.red/core/acp)[github.comCodewhale/docs/ARCHITECTURE.md at main - GitHub在新窗口中打开](https://github.com/codewhale-hq/Codewhale/blob/main/docs/ARCHITECTURE.md)[zylos.aiResearch Notes - Zylos在新窗口中打开](https://zylos.ai/research/)[agentclientprotocol.com在新窗口中打开](https://agentclientprotocol.com/protocol/v1/schema)[llmgateway.ioHow to Choose the Right LLM for Your Use Case in 2026在新窗口中打开](https://llmgateway.io/blog/how-to-choose-the-right-llm)[aimultiple.comLLM Latency Benchmark by Use Cases - AIMultiple在新窗口中打开](https://aimultiple.com/llm-latency-benchmark)[huggingface.cokatanemo/Arch-Router-1.5B.gguf - Hugging Face在新窗口中打开](https://huggingface.co/katanemo/Arch-Router-1.5B.gguf)[docs.planoai.devQuickstart | Plano Docs v0.4.39在新窗口中打开](https://docs.planoai.dev/get_started/quickstart)[researchgate.netSleep-time Compute: Beyond Inference Scaling at Test-time在新窗口中打开](https://www.researchgate.net/publication/390893325_Sleep-time_Compute_Beyond_Inference_Scaling_at_Test-time)[github.comaccompanying material for sleep-time compute paper - letta-ai在新窗口中打开](https://github.com/letta-ai/sleep-time-compute)[youtube.comWhat is Sleep Time Compute? - YouTube在新窗口中打开](https://www.youtube.com/watch?v=cZ3sh-57Rqk)[getzep.comContext Lake | Governed context for agents - Zep在新窗口中打开](https://www.getzep.com/platform/context-lake/)[researchgate.netMem0: Building Production-Ready AI Agents with Scalable Long在新窗口中打开](https://www.researchgate.net/publication/396785886_Mem0_Building_Production-Ready_AI_Agents_with_Scalable_Long-Term_Memory)[youtube.comMem0: Building Production-Ready AI Agents with Scalable Long在新窗口中打开](https://www.youtube.com/watch?v=cHQyugatz6M)[github.compaseo - Antigravity via custom ACP provider using agy-acp - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/issues/1745)[reddit.comAntigravity is now working in Paseo through my ACP integration在新窗口中打开](https://www.reddit.com/r/PaseoAI/comments/1vhpqn4/antigravity_is_now_working_in_paseo_through_my/)[codeagentswarm.comPaseo vs CodeAgentSwarm: An Honest Comparison (2026)在新窗口中打开](https://www.codeagentswarm.com/en/guides/paseo-vs-codeagentswarm)[news.ycombinator.comI'm the maintainer of Paseo. I didn't submit this, so it was a nice在新窗口中打开](https://news.ycombinator.com/item?id=48378983)[getmoshi.appPaseo vs Moshi在新窗口中打开](https://getmoshi.app/compare/paseo)[reddit.comAntigravity ACP provider for Paseo that actually works - Reddit在新窗口中打开](https://www.reddit.com/r/PaseoAI/comments/1wpwd0w/antigravity_acp_provider_for_paseo_that_actually/)[moonshotai.github.ioChangelog | Kimi Code CLI Docs在新窗口中打开](https://moonshotai.github.io/kimi-code/en/release-notes/changelog.html)[github.combb/docs/debugging-and-qa.md at main · get-bb/bb - GitHub在新窗口中打开](https://github.com/get-bb/bb/blob/main/docs/debugging-and-qa.md)[blog.csdn.netCodewhale Hooks 全指南：基于终端AI Agent 的11 个生命周期事件在新窗口中打开](https://blog.csdn.net/gitblog_00454/article/details/151417608?utm_source=gitcode_aigc_v1_t0&index=next&type=card&)[github.comoh-my-pi/packages/ai/CHANGELOG.md at main - GitHub在新窗口中打开](https://github.com/can1357/oh-my-pi/blob/main/packages/ai/CHANGELOG.md)[pub.towardsai.netClaude Code Under the Hood: How Context, Tokens, Tools and在新窗口中打开](https://pub.towardsai.net/claude-code-under-the-hood-how-context-tokens-tools-and-subagents-work-51399a5890fe)[web.stanford.eduAgent Context Management - Stanford University在新窗口中打开](https://web.stanford.edu/class/cs224v/lectures_2026/I-context.pdf)[claude.comA guide to the anatomy of effective commerce agents - Claude在新窗口中打开](https://claude.com/de/resources/articles/the-anatomy-of-effective-commerce-agents?utm_source=google&utm_medium=cpc&utm_campaign=ChatOn+%7C+Web+%7C+T2%2F3+%7C+Search+%7C+Website+Mix+%7C+Purch+No+Trial+%7C+07.02.2025&utm_content=739868849737&utm_term=gpt+4o&adset_id=179835817572&ad_id=739868849737&gclid=CjwKCAjw5PK_BhBBEiwAL7GTPdTW0dzh7k5nTkUDMme3yR0txXem-_TBAF7IoJn77q3yyQwnPchZRRoCv2AQAvD_BwE)[arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://arxiv.org/html/2604.14228v3)[omidsaffari.comContext Engineering: How to Keep Agents on Task | Omid Saffari在新窗口中打开](https://omidsaffari.com/blog/context-engineering)[thoughtworks.comTechniques | Technology Radar - Thoughtworks在新窗口中打开](https://www.thoughtworks.com/en-us/radar/techniques)[idcontrol.comState of Agentic AI Security and Governance - ID Control在新窗口中打开](https://idcontrol.com/wp-content/uploads/2026/06/OWASP-State-of-art-AI.pdf)[github.comawesome-agent-skills/README.md at master - GitHub在新窗口中打开](https://github.com/uhub/awesome-agent-skills/blob/master/README.md)[researchgate.net(PDF) Harness Engineering: Anatomy, Architecture, and Evolution of在新窗口中打开](https://www.researchgate.net/publication/413883486_Harness_Engineering_Anatomy_Architecture_and_Evolution_of_Coding_Agents_--_A_Source-Code_Study_of_Eleven_Systems)[aclanthology.orgProceedings of the 2026 Conference on Empirical Methods in在新窗口中打开](https://aclanthology.org/volumes/2026.emnlp-industry/)[research.wvu.eduIssue #6 - May 2026 | Research Office | West Virginia University在新窗口中打开](https://research.wvu.edu/initiatives/wvu-ai-discussion-group/issue-6-may)[leanpub.comDSPy in Depth - Leanpub在新窗口中打开](https://leanpub.com/programmingwithdspy/sample.pdf)[promptingguide.aiRetrieval Augmented Generation (RAG) for LLMs在新窗口中打开](https://www.promptingguide.ai/research/rag)[dspy.aiTutorial: Retrieval-Augmented Generation (RAG) - DSPy在新窗口中打开](https://dspy.ai/current/tutorials/rag/)[trychroma.comContext Rot: How Increasing Input Tokens Impacts LLM Performance在新窗口中打开](https://www.trychroma.com/research/context-rot)[tinyfish.aiContext Rot: How Long Inputs Degrade LLM Accuracy in 2026在新窗口中打开](https://www.tinyfish.ai/blog/context-rot)[hamel.devP6: Context Rot - Hamel Husain's Blog在新窗口中打开](https://hamel.dev/notes/llm/rag/p6-context_rot.html)[getnadir.comContext Rot · Nadir在新窗口中打开](https://getnadir.com/blog/context-rot-long-context-degradation-cost/)[zylos.aiEvolving User Profiles: How Conversational AI Agents Maintain在新窗口中打开](https://zylos.ai/research/2026-07-18-evolving-user-profile-memory-conversational-agents/)[aclanthology.orgLong-Term Agent Memory through Complementary Curation and在新窗口中打开](https://aclanthology.org/2026.findings-aacl.218.pdf)[atlan.comHow to Fix AI Agent Memory Loss: Session Amnesia vs Context - Atlan在新窗口中打开](https://atlan.com/know/ai-agent/how-agents-forget-and-how-to-fix-it/)[arxiv.orgSeparating Memory and Workflow Effects in Predicting Individual在新窗口中打开](https://arxiv.org/html/2609.33321v2)[arxiv.orgEvaluating Memory Structure in LLM Agents - arXiv在新窗口中打开](https://arxiv.org/html/2602.11243v4)[arxiv.orgA Systematization of Security on the Path to AI-Native Operating在新窗口中打开](https://arxiv.org/html/2609.23700v1)[huggingface.coDaily Papers - Hugging Face在新窗口中打开](https://huggingface.co/papers?q=cumulative%20drift)[medium.comWill AI Go Bad? The Wrong Question | by Boris (Bruce) Kriger在新窗口中打开](https://medium.com/@krigerbruce/will-ai-go-bad-the-wrong-question-39381a5049dd)[cdn.prod.website-files.comAgentic AI Security For Dummies®, Cequence Special Edition在新窗口中打开](https://cdn.prod.website-files.com/6a703eb2a09bf183034a34c4/6aad1fadc23cc247a934dcc5_Agentic-AI-Security-For-Dummies_Cequence-Special-Edition.pdf)[openreview.netLarge Language Models for Cybersecurity: A Survey of - OpenReview在新窗口中打开](https://openreview.net/pdf/6476aceae0c5fce7ea9a26558450c7f499a15dc7.pdf)[preprints.orgFrom Solo Control to Enterprise Scale Through Agentic AI在新窗口中打开](https://www.preprints.org/manuscript/202608.1414)[gist.github.comA memory architecture for agentic system - GitHub Gist在新窗口中打开](https://gist.github.com/spikelab/7551c6368e23caa06a4056350f6b2db3?permalink_comment_id=6241076)[huggingface.coDaily Papers - Hugging Face在新窗口中打开](https://huggingface.co/papers?q=CLI%20agent)[symphony42.comThe Definitive Guide to the AI Lexicon | Symphony42 Blog在新窗口中打开](https://www.symphony42.com/definitive-guide-ai-lexicon/)[qai.ioknowledge-distillation skill for Claude Code, Codex and Cursor - QAI在新窗口中打开](https://qai.io/skills/orchestra-research/ai-research-skills/knowledge-distillation)[dev.toAI Weekly: New PC Chips, Credit Pricing, Stateless MCP在新窗口中打开](https://dev.to/alexmercedcoder/ai-weekly-new-pc-chips-credit-pricing-stateless-mcp-1eb9)[taskade.comHow LLMs Got Hands: A History of Tool Use (2026) - Taskade在新窗口中打开](https://www.taskade.com/blog/tool-use-history)[aicoder.comUW & Meta FAIR Introduce Context Language Models (CLMs在新窗口中打开](https://aicoder.com/news/news-20260930-clm-context-language-models-meta-uw)[turingpost.comFOD#110: AI is for Everyone and for a Better Future - Turing Post在新窗口中打开](https://www.turingpost.com/p/fod110)[arxiv.orgSelf-Evolving Coding Agents - arXiv在新窗口中打开](https://arxiv.org/html/2608.03392v2)[github.commureo/CHANGELOG.md at main - GitHub在新窗口中打开](https://github.com/logly/mureo/blob/main/CHANGELOG.md)[chatforest.comChatForest — MCP Reviews, AI Builder Guides & Daily News在新窗口中打开](https://chatforest.com/)[arxiv.orgEvaluating LLM-based Agents for Multi-Turn Conversations: A Survey在新窗口中打开](https://arxiv.org/html/2503.22458v3)[confident-ai.comMulti-Turn LLM Evaluation in 2026: What You Need to Know在新窗口中打开](https://www.confident-ai.com/blog/multi-turn-llm-evaluation-in-2026)[futureagi.comRAG Architecture in 2026: Patterns + Eval - Future AGI在新窗口中打开](https://futureagi.com/blog/rag-architecture-llm-2025/)[aclanthology.orgProceedings of the 2026 Conference on Empirical Methods in在新窗口中打开](https://aclanthology.org/volumes/2026.emnlp-main/)[researchgate.netMulti-Turn Metamorphic Testing for LLM-Based Dialogue Systems在新窗口中打开](https://www.researchgate.net/publication/406448877_MORTAR_Multi-turn_Metamorphic_Testing_for_LLM-based_Dialogue_Systems)[medium.com7 LLM Guardrails That Reduce Hallucinations | by Thinking Loop在新窗口中打开](https://medium.com/@ThinkingLoop/7-llm-guardrails-that-reduce-hallucinations-3d673677fb3f)[arxiv.orgA Survey on Multi-Turn Interactions with Large Language Models在新窗口中打开](https://arxiv.org/html/2504.04717v6)[2026.emnlp.orgAccepted Main Conference Papers - EMNLP 2026在新窗口中打开](https://2026.emnlp.org/program/main_papers/)[openreview.netACL ARR 2026 January - OpenReview在新窗口中打开](https://openreview.net/group?id=aclweb.org/ACL/ARR/2026/January)[github.comPi: message sent while a turn runs fails with 'Agent is already在新窗口中打开](https://github.com/getpaseo/paseo/issues/8940)[newreleases.iogetpaseo/paseo v0.14.0-beta.1 on GitHub - NewReleases.io在新窗口中打开](https://newreleases.io/project/github/getpaseo/paseo/release/v0.14.0-beta.1)[railway.comDeploy & Host Paseo Daemon - Railway在新窗口中打开](https://railway.com/deploy/paseo-daemon)[context7.comPaseo (llmstxt/paseo_sh_llms_txt) | Context7在新窗口中打开](https://context7.com/llmstxt/paseo_sh_llms_txt)[paseo.shDeepAgents Mobile and Desktop App, Open Source - Paseo在新窗口中打开](https://paseo.sh/deepagents)[github.comtiezbro - GitHub在新窗口中打开](https://github.com/tiezbro)[github.comIntegration with agy (antigravity) #2236 - getpaseo paseo - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/discussions/2236)[github.comfeat: Add Google Antigravity 2.0 (agy) support via ACP #1958 - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/issues/1958)[hub.xerj.org@tiezbro: paseo-agy-acp corpus for AI agents | XERJ Hub在新窗口中打开](https://hub.xerj.org/contributors/tiezbro)[6erskills.compaseo-agy-acp - Everything is a Skill - 6er Agent Skills Hub在新窗口中打开](https://www.6erskills.com/skill/tiezbro/paseo-agy-acp)[reddit.comPaseo now integrates seamlessly with Antigravity : r/PaseoAI - Reddit在新窗口中打开](https://www.reddit.com/r/PaseoAI/comments/1vh53cc/paseo_now_integrates_seamlessly_with_antigravity/)[github.comfeat: · Issue #1845 · getpaseo/paseo - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/issues/1845)[splunk.comContext Engineering for AI Agents in Production - Splunk在新窗口中打开](https://www.splunk.com/en_us/blog/artificial-intelligence/context-engineering-production-agents.html)[typingmind.comContext Engineering - AI Skill for Any LLM - TypingMind在新窗口中打开](https://www.typingmind.com/skills/mvschwarz-context-engineering)[hokai.ioContext Engineering Explained: Techniques and Tools (2026) | Hokai在新窗口中打开](https://hokai.io/guides/context-engineering-explained-2026)[tianpan.coSix Context Engineering Techniques That Make Manus Work in在新窗口中打开](https://tianpan.co/blog/2026/03/02/context-engineering-lessons-from-manus)[ar5iv.labs.arxiv.org[2510.26493] Context Engineering 2.0 - ar5iv - arXiv在新窗口中打开](https://ar5iv.labs.arxiv.org/html/2510.26493)[aerospike.comContext Engineering for AI Agents and Where Memory Lives在新窗口中打开](https://aerospike.com/blog/context-engineering-ai-agents/)[aclanthology.orgTokenPilot: Cache-Efficient Context Management for LLM Agents在新窗口中打开](https://aclanthology.org/2026.findings-emnlp.899.pdf)[github.comContext engineering: Tools & ecosystem - GitHub在新窗口中打开](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/ecosystem/context-engineering-tools.md)[agentclientprotocol.comSchema - Agent Client Protocol在新窗口中打开](https://agentclientprotocol.com/protocol/v2/schema)[github.comSpeak the Agent Client Protocol so Penstock runs inside JetBrains在新窗口中打开](https://github.com/enrichmeai/penstock/issues/59)[pypi.orgclawagents · PyPI在新窗口中打开](https://pypi.org/project/clawagents/6.17.2/)[skills.snappy.aisnappy-agent-host在新窗口中打开](https://skills.snappy.ai/skills/snappy-agent-host)[pkg.go.devacp package - github.com/coder/acp-go-sdk - Go Packages在新窗口中打开](https://pkg.go.dev/github.com/coder/acp-go-sdk)[botbus.ioConnect your own agent - BotBus在新窗口中打开](https://botbus.io/en/docs/connect-agent)[openreview.netThe OpenHands Software Agent SDK - OpenReview在新窗口中打开](https://openreview.net/pdf?id=pzVmWs6yGq)[arxiv.orgThe OpenHands Software Agent SDK: A Composable and ... - arXiv在新窗口中打开](https://arxiv.org/pdf/2511.03690)[arxiv.orgAnatomy, Architecture, and Evolution of Coding Agents - arXiv在新窗口中打开](https://arxiv.org/pdf/2609.00006)[cnblogs.comAI Agent框架探秘：拆解OpenHands（8）--- CodeActAgent - 博客园在新窗口中打开](https://www.cnblogs.com/rossiXYZ/p/19620422)[docs.openhands.devllms-full.txt - OpenHands Docs在新窗口中打开](https://docs.openhands.dev/llms-full.txt)[lobehub.comagentforge-context | Skills Marketplace · LobeHub在新窗口中打开](https://lobehub.com/tr/skills/kingxiao-agentforge-agentforge-context)[github.com[Trimming prompt to meet context window limitations] making agent在新窗口中打开](https://github.com/OpenHands/OpenHands/issues/6634)[iternal.aiLLM Comparison 2026: 30+ AI Models Benchmarked & Ranked在新窗口中打开](https://iternal.ai/llm-selection-guide)[ssocialjustice.medium.comThe Numbers Every Architect Should Know - Medium在新窗口中打开](https://ssocialjustice.medium.com/the-numbers-every-architect-should-know-9609b5c118b7)[arxiv.orgA Benchmark for Open-Ended LLM Inference Optimization by AI在新窗口中打开](https://arxiv.org/html/2607.20468v1)[subconscious.devInception Review (2026): Pricing, Pros and Cons | Subconscious在新窗口中打开](https://www.subconscious.dev/providers/inception)[openrouter.aiCompare AI Models: Pricing, Context & Benchmarks - OpenRouter在新窗口中打开](https://openrouter.ai/models)[stackeval.ioStackEval — by backboard.io在新窗口中打开](https://www.stackeval.io/)[github.comiSEngLab/Awesome-Self-Evolving-Coding-Agents - GitHub在新窗口中打开](https://github.com/iSEngLab/Awesome-Self-Evolving-Coding-Agents)[blog.csdn.net为什么大多Code_Agent的主形态是CLI_TUI_2026-04-13 原创在新窗口中打开](https://blog.csdn.net/qq_40126397/article/details/160099806)[jyoung.devResearch Index - John Young在新窗口中打开](https://jyoung.dev/research/)[arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://arxiv.org/pdf/2604.14228)[arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://arxiv.org/html/2604.14228v1)[cloud.tencent.com理论篇】Claude Code的动态工作流，一个while循环凭什么干掉状态机在新窗口中打开](https://cloud.tencent.com/developer/article/2685109)[github.comDeepDive-into-Claude-Code/README_zh.md at main - GitHub在新窗口中打开](https://github.com/coachmanjeet/DeepDive-into-Claude-Code/blob/main/README_zh.md)[aihumanlove.comThe Claude Code arXiv Paper (2604.14228), Explained在新窗口中打开](https://aihumanlove.com/blog/dive-into-claude-code-paper-lessons.html)[alphaxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://www.alphaxiv.org/abs/2604.14228v1)[podcast.do-not-panic.comAugust 2026 - AI Post Transformers在新窗口中打开](https://podcast.do-not-panic.com/2026/08/index.html)[github.comPaseo 适配器验收在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp/blob/main/docs/operations/paseo-adapter-verification.md)[github.compaseo-agy-acp/README.zh-CN.md at main - GitHub在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp/blob/main/README.zh-CN.md)[arxiv.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks在新窗口中打开](https://arxiv.org/abs/2601.06007)[researchgate.netAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks在新窗口中打开](https://www.researchgate.net/publication/399667043_Don't_Break_the_Cache_An_Evaluation_of_Prompt_Caching_for_Long-Horizon_Agentic_Tasks)[semanticscholar.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks在新窗口中打开](https://www.semanticscholar.org/paper/Don%27t-Break-the-Cache%3A-An-Evaluation-of-Prompt-for-Lumer-Nizar/1bcdd41f57ff183ec338ee3b5fe6f1e3a94ab0b2)[digitalapplied.comPrompt Caching in 2026: Cut LLM Costs, Keep Quality在新窗口中打开](https://www.digitalapplied.com/blog/prompt-caching-2026-cut-llm-costs-engineering-guide)[arxiv.orgCache-Aware Dynamic Object Context for Long-Horizon Agents - arXiv在新窗口中打开](https://arxiv.org/html/2609.37012v1)[arxiv.org1Introduction - arXiv在新窗口中打开](https://arxiv.org/html/2611.10022v1)[arxiv.orgSilent and Costly: Characterizing and Detecting Prompt-Caching Mis在新窗口中打开](https://arxiv.org/html/2610.34817v2)[getnadir.comThe Overcaching Tax · Nadir在新窗口中打开](https://getnadir.com/blog/overcaching-tax-agentic-prompt-caching-strategy/)[trendshift.ioOrgoAI/bops — GitHub trending stats & insights | Trendshift在新窗口中打开](https://trendshift.io/repositories/288314)[trendshift.iotechjanitor/botmaker — GitHub trending stats & insights - Trendshift在新窗口中打开](https://trendshift.io/repositories/203950)[trendshift.ioPancakes-Labs/astrbot_plugin_proactive_chat — GitHub trending在新窗口中打开](https://trendshift.io/repositories/191272)[github.compaseo-bots/README.md at main · oliexe/paseo-bots · GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots/blob/main/README.md)[paseo.shBots – Paseo plugin在新窗口中打开](https://paseo.sh/plugins/oliexe/bots)[github.compaseo · GitHub Topics在新窗口中打开](https://github.com/topics/paseo)[github.combirui (rockybi) / starred repositories · GitHub在新窗口中打开](https://github.com/stars/birui/repositories?filter=all)[github.comOndrej Rehacek oliexe - GitHub在新窗口中打开](https://github.com/oliexe)[github.comIssues · oliexe/paseo-bots - GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots/issues)[github.comSecurity - oliexe/paseo-bots - GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots/security)[trendshift.iobotseverywhere-ai/BotsEverywhere — GitHub trending stats & insights在新窗口中打开](https://trendshift.io/repositories/339968)[github.comawesome-grok-bot/README.zh.md at main - GitHub在新窗口中打开](https://github.com/RongleCat/awesome-grok-bot/blob/main/README.zh.md)初始化双轨调研计划我正在并行推进两项任务：一边提取并梳理本地 `dual-session-research-pack` 压缩包内 11 份技术文档中的硬性工程约束，涵盖 `paseo-bots` 与 `paseo-agy-acp` 的核心接口边界、前缀缓存不可变规范及既有上下文压缩模式；一边全面追踪 2025–2026 年间业界前置意图编译与伴生记忆系统的最新实践。完成初步的本地契约提取与外部架构扫描后，我将进一步深入分析双伴生形态的临界点、长对话防退化机制以及高并发轮次状态机。  [github.comPlano is an AI-native proxy server and data plane for agentic apps](https://github.com/katanemo/plano)[docs.planoai.devQuickstart | Plano Docs v0.4.39](https://docs.planoai.dev/get_started/quickstart)[github.combizmindx/archgw: The AI-native proxy server for agents. Arch](https://github.com/bizmindx/archgw)[docs.planoai.devOrchestration | Plano Docs v0.4.39](https://docs.planoai.dev/guides/orchestration.html)[promptquorum.comPlano Review 2026: Self-Hosted AI Gateway on Envoy](https://www.promptquorum.com/power-local-llm/plano-review)[digitalocean.comHow We Built DigitalOcean Inference Router](https://www.digitalocean.com/blog/inference-router-architecture)[huggingface.cokatanemo/Arch-Router-1.5B.gguf - Hugging Face](https://huggingface.co/katanemo/Arch-Router-1.5B.gguf)[reddit.comopen source intelligent middle-ware for fast and observable agentic](https://www.reddit.com/r/LocalLLaMA/comments/1gan3p9/introducing_arch_open_source_intelligent/)[arxiv.orgArch-Router: Aligning LLM Routing with Human Preferences - arXiv](https://arxiv.org/html/2506.16655v1)[arxiv.orgGraph-Native Cognitive Memory for AI Agents - arXiv](https://arxiv.org/pdf/2603.17244)意图路由与网关调研进展我首先针对业界的前置意图路由、网关和长记忆计算方案进行了系统性调研。通过分析发现，如 Katanemo Plano 等网关采用了专用的极轻量级 SLM（约 1.5B 至 4B 参数），能够在毫秒级延迟内完成高精度的路由决策，这验证了将小型模型直接部署在请求路径上以控制首字延迟（TTFT）的可行性。本地约束文档解析途径在解析本地架构与前期调研文档的压缩包时，我注意到直接预览只展示出文件目录的元数据。为了完整获取 `paseo-bots` 和 `paseo-agy-acp` 的核心接口定义、Seat 编排机制及历史缓存红线，下一步我需要调整解析方式，通过运行环境直接解压并深度读取其中的文本内容。下一步研究与比对计划接下来我将同步推进两项核心任务：一方面在本地环境中提取并精读所有的工程规范与约束文件，锁定生命周期钩子与缓存限制；另一方面进一步深挖 Letta、Graphiti、Mem0 以及主流 Coding Agent 的上下文蒸馏、反退化策略及多轮指代消解机制，以便全面整合出最优的双 Session 架构方案。  [arxiv.orgSleep-time Compute: Beyond Inference Scaling at Test-time - arXiv](https://arxiv.org/abs/2504.13171)[arxiv.orgSleep-time Compute: Beyond Inference Scaling at Test-time - arXiv](https://arxiv.org/html/2504.13171v1)[letta.comSleep-time Compute - Letta](https://www.letta.com/blog/sleep-time-compute/)[researchgate.netSleep-time Compute: Beyond Inference Scaling at Test-time](https://www.researchgate.net/publication/390893325_Sleep-time_Compute_Beyond_Inference_Scaling_at_Test-time)[github.comaccompanying material for sleep-time compute paper - letta-ai](https://github.com/letta-ai/sleep-time-compute)[dev.toWhat is memory consolidation in long-term AI memory systems?](https://dev.to/izgorodin/what-is-memory-consolidation-in-long-term-ai-memory-systems-2j8e)[digitalapplied.comOpen-Source Agent Memory: Mem0 vs Letta vs Zep - Digital Applied](https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared)[youtube.comWhat is Sleep Time Compute? - YouTube](https://www.youtube.com/watch?v=cZ3sh-57Rqk)[arxiv.orgZep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/abs/2501.13956)[arxiv.orgzep:atemporal knowledge graph architecture for agent memory - arXiv](https://arxiv.org/pdf/2501.13956)[arxiv.orgZep: A Temporal Knowledge Graph Architecture for Agent Memory](https://arxiv.org/html/2501.13956v1)[upsolve.aiAI Agent Memory Explained: Diagrams, Tools & Architecture](https://upsolve.ai/blog/ai-agent-memory)[getzep.comContext Lake | Governed context for agents - Zep](https://www.getzep.com/platform/context-lake/)[researchgate.netMem0: Building Production-Ready AI Agents with Scalable Long](https://www.researchgate.net/publication/396785886_Mem0_Building_Production-Ready_AI_Agents_with_Scalable_Long-Term_Memory)[youtube.comMem0: Building Production-Ready AI Agents with Scalable Long](https://www.youtube.com/watch?v=cHQyugatz6M)明确业界核心对比基线我刚刚梳理了几个2025至2026年最具代表性的开源伴生记忆与异步计算系统：Letta 的 Sleep-time Compute 展示了利用后台空闲时间预先梳理和重组上下文、从而大幅降低在线计算量的可行性；而 Zep / Graphiti 与 Mem0 则分别代表了时序知识图谱与动态实体增删维护长程记忆的两条主流路径。这为后续在「持久连接 Session」与「结构化账本 Ledger」之间进行架构选型提供了清晰的学术与工业参照。锁定本地文档检索与公开协议核查方向为了确保架构设计精准贴合实际宿主环境，我接下来将在内部检索是否存在 Paseo 相关的公开技术规范或接口定义；同时，我会并行调研 Context Rot（注意力退化）的量化机制，以及 Claude Code、Cursor 等主流 Coding Agent 在上下文蒸馏与工具轨迹剥离方面的生产级取舍。  [github.comGitHub - tiezbro/paseo-agy-acp](https://github.com/tiezbro/paseo-agy-acp)[github.compaseo - Antigravity via custom ACP provider using agy-acp - GitHub](https://github.com/getpaseo/paseo/issues/1745)[github.comfeat: Add Google Antigravity 2.0 (agy) support via ACP #1958 - GitHub](https://github.com/getpaseo/paseo/issues/1958)[reddit.comAntigravity is now working in Paseo through my ACP integration](https://www.reddit.com/r/PaseoAI/comments/1vhpqn4/antigravity_is_now_working_in_paseo_through_my/)[6erskills.compaseo-agy-acp - Everything is a Skill - 6er Agent Skills Hub](https://www.6erskills.com/skill/tiezbro/paseo-agy-acp)[codeagentswarm.comPaseo vs CodeAgentSwarm: An Honest Comparison (2026)](https://www.codeagentswarm.com/en/guides/paseo-vs-codeagentswarm)[hub.xerj.org@tiezbro: paseo-agy-acp corpus for AI agents | XERJ Hub](https://hub.xerj.org/contributors/tiezbro)[news.ycombinator.comI'm the maintainer of Paseo. I didn't submit this, so it was a nice](https://news.ycombinator.com/item?id=48378983)[getmoshi.appPaseo vs Moshi](https://getmoshi.app/compare/paseo)[reddit.comAntigravity ACP provider for Paseo that actually works - Reddit](https://www.reddit.com/r/PaseoAI/comments/1wpwd0w/antigravity_acp_provider_for_paseo_that_actually/)[github.comCodewhale/docs/ARCHITECTURE.md at main - GitHub](https://github.com/codewhale-hq/Codewhale/blob/main/docs/ARCHITECTURE.md)[moonshotai.github.ioChangelog | Kimi Code CLI Docs](https://moonshotai.github.io/kimi-code/en/release-notes/changelog.html)[orcaagent.devOrca Agent changelog](https://orcaagent.dev/changelog/)[github.combb/docs/debugging-and-qa.md at main · get-bb/bb - GitHub](https://github.com/get-bb/bb/blob/main/docs/debugging-and-qa.md)[blog.csdn.netCodewhale Hooks 全指南：基于终端AI Agent 的11 个生命周期事件](https://blog.csdn.net/gitblog_00454/article/details/151417608?utm_source=gitcode_aigc_v1_t0&index=next&type=card&)[github.comoh-my-pi/packages/ai/CHANGELOG.md at main - GitHub](https://github.com/can1357/oh-my-pi/blob/main/packages/ai/CHANGELOG.md)[zyte.comHow do you manage the context window in Claude Code and ... - Zyte](https://www.zyte.com/blog/how-to-manage-context-window-claude-code/)[claude.comBest practices for computer and browser use with Claude](https://claude.com/ja/blog/best-practices-for-computer-and-browser-use-with-claude?destination=%2Fleadership-organisations%2Fpsychopath-c-suite%3Fp%3D&fcdaa149_sort_date=desc)[nayakpplaban.medium.comMemory Compaction in AI Agent Harnesses - Plaban Nayak](https://nayakpplaban.medium.com/memory-compaction-in-ai-agent-harnesses-ce0ac91b85fa)[pub.towardsai.netClaude Code Under the Hood: How Context, Tokens, Tools and](https://pub.towardsai.net/claude-code-under-the-hood-how-context-tokens-tools-and-subagents-work-51399a5890fe)[developersdigest.techClaude Code Idle Compaction: What It Does and How to Turn It Off](https://www.developersdigest.tech/blog/claude-code-idle-compaction-turn-off-cache-cost-2026)[louisbouchard.aiContext Engineering in 2026: Why We Stopped Compacting Our](https://www.louisbouchard.ai/context-engineering-2026/)[web.stanford.eduAgent Context Management - Stanford University](https://web.stanford.edu/class/cs224v/lectures_2026/I-context.pdf)[claude.comA guide to the anatomy of effective commerce agents - Claude](https://claude.com/de/resources/articles/the-anatomy-of-effective-commerce-agents?utm_source=google&utm_medium=cpc&utm_campaign=ChatOn+%7C+Web+%7C+T2%2F3+%7C+Search+%7C+Website+Mix+%7C+Purch+No+Trial+%7C+07.02.2025&utm_content=739868849737&utm_term=gpt+4o&adset_id=179835817572&ad_id=739868849737&gclid=CjwKCAjw5PK_BhBBEiwAL7GTPdTW0dzh7k5nTkUDMme3yR0txXem-_TBAF7IoJn77q3yyQwnPchZRRoCv2AQAvD_BwE)[arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI](https://arxiv.org/html/2604.14228v3)[omidsaffari.comContext Engineering: How to Keep Agents on Task | Omid Saffari](https://omidsaffari.com/blog/context-engineering)[thoughtworks.comTechniques | Technology Radar - Thoughtworks](https://www.thoughtworks.com/en-us/radar/techniques)[neoneye.github.ioAgent Memory Atlas](https://neoneye.github.io/agent-memory-atlas/)[huggingface.coDaily Papers - Hugging Face](https://huggingface.co/papers?q=CLI%20agent)[idcontrol.comState of Agentic AI Security and Governance - ID Control](https://idcontrol.com/wp-content/uploads/2026/06/OWASP-State-of-art-AI.pdf)[github.comawesome-agent-skills/README.md at master - GitHub](https://github.com/uhub/awesome-agent-skills/blob/master/README.md)[researchgate.net(PDF) Harness Engineering: Anatomy, Architecture, and Evolution of](https://www.researchgate.net/publication/413883486_Harness_Engineering_Anatomy_Architecture_and_Evolution_of_Coding_Agents_--_A_Source-Code_Study_of_Eleven_Systems)[arxiv.orgComposer 2 Technical Report - arXiv](https://arxiv.org/html/2603.24477v2)[aclanthology.orgProceedings of the 2026 Conference on Empirical Methods in](https://aclanthology.org/volumes/2026.emnlp-industry/)[research.wvu.eduIssue #6 - May 2026 | Research Office | West Virginia University](https://research.wvu.edu/initiatives/wvu-ai-discussion-group/issue-6-may)[dspy.aiDSPy: Program, don't prompt, your LLMs](https://dspy.ai/current/)[towardsdatascience.comContext Engineering — A Comprehensive Hands-On Tutorial with](https://towardsdatascience.com/context-engineering-a-comprehensive-hands-on-tutorial-with-dspy/)[leanpub.comDSPy in Depth - Leanpub](https://leanpub.com/programmingwithdspy/sample.pdf)[promptingguide.aiRetrieval Augmented Generation (RAG) for LLMs](https://www.promptingguide.ai/research/rag)[dspy.aiTutorial: Retrieval-Augmented Generation (RAG) - DSPy](https://dspy.ai/current/tutorials/rag/)锁定目标适配器公开代码库我通过外部检索成功定位到了本次研究核心目标模块 `paseo-agy-acp` 的公开 GitHub 仓库与历史提交记录。这表明它是一个独立挂载在官方 Antigravity ACP 内核之上的适配代理层，原生实现了基于 JSON-RPC v1 的异步管线、Seat 准入队列与会话状态控制。接下来我需要深入查看该仓库的源码文件树与架构细节，精确对齐其轮次生命周期钩子。主流行星编码智能体上下文实践针对主流编码 Agent 的上下文提炼机制，我发现 Claude Code 和 Cursor 等系统均强调「保护底层提示词缓存（Prompt Caching）前缀」。在实际生产中，频繁对长历史进行总结压缩反而会破坏缓存命中率（Cache Hit），因此业内倾向于将压缩推迟到高阈值之后，并采用独立子智能体（Subagents）来隔离繁重的工具探索过程，仅向主会话返回极简的提炼结果。同时，DSPy 的模块化和特征签名化（Signatures）重写为前置意图编译提供了标准范式。接下来的深入分析方向接下来我将立即探查 `paseo-agy-acp` 仓库源码以获取完整的生命周期架构与状态机切面；同时并行检索 Chroma 关于长对话上下文退化（Context Rot）的测试报告以及 Mem0、Devin 等的记忆提炼机制，并继续核实本地环境变量中是否存在待读取的约束文档。  [trychroma.comContext Rot: How Increasing Input Tokens Impacts LLM Performance](https://www.trychroma.com/research/context-rot)[tinyfish.aiContext Rot: How Long Inputs Degrade LLM Accuracy in 2026](https://www.tinyfish.ai/blog/context-rot)[ovaledge.comWhat is Context Rot and Why it Breaks Production AI Systems](https://www.ovaledge.com/blog/context-rot)[github.comresearch-context-rot-and-management.md - GitHub](https://github.com/rodrigorjsf/agent-engineering-toolkit/blob/development/docs/general-llm/research-context-rot-and-management.md)[hamel.devP6: Context Rot - Hamel Husain's Blog](https://hamel.dev/notes/llm/rag/p6-context_rot.html)[arxiv.orgLength Is Cheap, Competition Is Not: Attention Predicts Context Rot](https://arxiv.org/html/2611.04169v1)[digitalapplied.comContext Engineering: Agent Reliability Playbook 2026 - Digital Applied](https://www.digitalapplied.com/blog/context-engineering-agent-reliability-playbook-2026)[getnadir.comContext Rot · Nadir](https://getnadir.com/blog/context-rot-long-context-degradation-cost/)[digitalapplied.comOpen-Source Agent Memory: Mem0 vs Letta vs Zep - Digital Applied](https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared)[zylos.aiEvolving User Profiles: How Conversational AI Agents Maintain](https://zylos.ai/research/2026-07-18-evolving-user-profile-memory-conversational-agents/)[medium.comMem0: Building Production-Ready AI Agents with Scalable Long](https://medium.com/@EleventhHourEnthusiast/mem0-building-production-ready-ai-agents-with-scalable-long-term-memory-9c534cd39264)[aclanthology.orgLong-Term Agent Memory through Complementary Curation and](https://aclanthology.org/2026.findings-aacl.218.pdf)[atlan.comHow to Fix AI Agent Memory Loss: Session Amnesia vs Context - Atlan](https://atlan.com/know/ai-agent/how-agents-forget-and-how-to-fix-it/)[arxiv.orgSeparating Memory and Workflow Effects in Predicting Individual](https://arxiv.org/html/2609.33321v2)[arxiv.orgEvaluating Memory Structure in LLM Agents - arXiv](https://arxiv.org/html/2602.11243v4)[arxiv.orgGoverning Evolving Memory in LLM Agents: Risks, Mechanisms](https://arxiv.org/html/2603.11768v1)[arxiv.orgA Systematization of Security on the Path to AI-Native Operating](https://arxiv.org/pdf/2609.23700)[arxiv.orgA Systematization of Security on the Path to AI-Native Operating](https://arxiv.org/html/2609.23700v1)[huggingface.coDaily Papers - Hugging Face](https://huggingface.co/papers?q=cumulative%20drift)[medium.comWill AI Go Bad? The Wrong Question | by Boris (Bruce) Kriger](https://medium.com/@krigerbruce/will-ai-go-bad-the-wrong-question-39381a5049dd)[zylos.aiResearch Notes - Zylos](https://zylos.ai/research/)[cdn.prod.website-files.comAgentic AI Security For Dummies®, Cequence Special Edition](https://cdn.prod.website-files.com/6a703eb2a09bf183034a34c4/6aad1fadc23cc247a934dcc5_Agentic-AI-Security-For-Dummies_Cequence-Special-Edition.pdf)[openreview.netLarge Language Models for Cybersecurity: A Survey of - OpenReview](https://openreview.net/pdf/6476aceae0c5fce7ea9a26558450c7f499a15dc7.pdf)[preprints.orgFrom Solo Control to Enterprise Scale Through Agentic AI](https://www.preprints.org/manuscript/202608.1414)[gist.github.comA memory architecture for agentic system - GitHub Gist](https://gist.github.com/spikelab/7551c6368e23caa06a4056350f6b2db3?permalink_comment_id=6241076)[huggingface.coDaily Papers - Hugging Face](https://huggingface.co/papers?q=CLI%20agent)[symphony42.comThe Definitive Guide to the AI Lexicon | Symphony42 Blog](https://www.symphony42.com/definitive-guide-ai-lexicon/)[qai.ioknowledge-distillation skill for Claude Code, Codex and Cursor - QAI](https://qai.io/skills/orchestra-research/ai-research-skills/knowledge-distillation)[dev.toAI Weekly: New PC Chips, Credit Pricing, Stateless MCP](https://dev.to/alexmercedcoder/ai-weekly-new-pc-chips-credit-pricing-stateless-mcp-1eb9)[taskade.comHow LLMs Got Hands: A History of Tool Use (2026) - Taskade](https://www.taskade.com/blog/tool-use-history)[aicoder.comUW & Meta FAIR Introduce Context Language Models (CLMs](https://aicoder.com/news/news-20260930-clm-context-language-models-meta-uw)[researchgate.net(PDF) Comparative Evaluation of Agentic Workflow Capabilities in AI](https://www.researchgate.net/publication/410822551_Comparative_Evaluation_of_Agentic_Workflow_Capabilities_in_AI_IDE_Agents_for_Web-Based_Learning_Media_Development)[turingpost.comFOD#110: AI is for Everyone and for a Better Future - Turing Post](https://www.turingpost.com/p/fod110)[arxiv.orgSelf-Evolving Coding Agents - arXiv](https://arxiv.org/html/2608.03392v2)[github.comtiezbro/paseo-agy-acp: Independent Paseo provider that ... - GitHub](https://github.com/tiezbro/paseo-agy-acp)锁定 Context Rot 成因与反失真框架我重点分析并梳理了长程对话中导致退化的两大核心症结：在上下文方面，相关实验揭示“Context Rot”并非源自物理长度溢出，而是上下文中的高相似干扰项（Distractor）和跨轮指令冲突（Context Clash）严重稀释了注意力预算；在多轮状态演化方面，连续递归摘要极易诱发“传话筒失真（Telephone Game Effect）”。为应对此问题，业界最新演化记忆框架倾向于采用基于实证锚点（Ground Truth Anchoring）与可逆状态回放的结构化账本机制，取代纯粹的无锚点滚动摘要。厘清 ACP 适配器核心契约与并发边界通过深度核查 `paseo-agy-acp` 开源仓库的架构与验收文档，我确认了该适配器的核心工程接口：它基于 JSON-RPC v1（NDJSON）驱动 Google 官方无头内核，内置跨进程的 SQLite 事务锁准入队列（Admission Queue）以及空轮次防伪检查。最为关键的是其支持“原生系统上下文（Native Mode）”模式——即仅在会话创建或加载时锁定注入固定前缀快照。这一特性在工程上为后续实施 Byte-0 前缀缓存不可变规范及伴生账本注入提供了精准的宿主切面。推进宿主调度细节与极速模型基准核查结合对系统压缩与黑板调度模式的研判，下一步我将重点突破两方面细节：一是在 `getpaseo/paseo` 及 ACP 协议事件流中精确定位工具调用（如涉及的文件路径与命令退出码）以及 `steer`/`queue` 并发原语的载荷格式；二是横向测算 2025–2026 年主流极速轻量模型在首字延迟（TTFT）和前缀缓存复用上的表现，以确定满足 300–800ms 延迟预算的最优模型底座。  [github.commureo/CHANGELOG.md at main - GitHub](https://github.com/logly/mureo/blob/main/CHANGELOG.md)[chatforest.comChatForest — MCP Reviews, AI Builder Guides & Daily News](https://chatforest.com/)[arxiv.orgEvaluating LLM-based Agents for Multi-Turn Conversations: A Survey](https://arxiv.org/html/2503.22458v3)[blog.getdarwin.aiAI Guardrails in 2026: 9 Hallucination Prevention Strategies B2B](https://blog.getdarwin.ai/en/ai-guardrails-hallucination-prevention-2026)[confident-ai.comMulti-Turn LLM Evaluation in 2026: What You Need to Know](https://www.confident-ai.com/blog/multi-turn-llm-evaluation-in-2026)[futureagi.comRAG Architecture in 2026: Patterns + Eval - Future AGI](https://futureagi.com/blog/rag-architecture-llm-2025/)[aclanthology.orgProceedings of the 2026 Conference on Empirical Methods in](https://aclanthology.org/volumes/2026.emnlp-main/)[researchgate.netMulti-Turn Metamorphic Testing for LLM-Based Dialogue Systems](https://www.researchgate.net/publication/406448877_MORTAR_Multi-turn_Metamorphic_Testing_for_LLM-based_Dialogue_Systems)[medium.com7 LLM Guardrails That Reduce Hallucinations | by Thinking Loop](https://medium.com/@ThinkingLoop/7-llm-guardrails-that-reduce-hallucinations-3d673677fb3f)[arxiv.orgA Survey on Multi-Turn Interactions with Large Language Models](https://arxiv.org/html/2504.04717v6)[2026.emnlp.orgAccepted Main Conference Papers - EMNLP 2026](https://2026.emnlp.org/program/main_papers/)[openreview.netACL ARR 2026 January - OpenReview](https://openreview.net/group?id=aclweb.org/ACL/ARR/2026/January)[github.combug: send-now on a queued message interrupts the active turn](https://github.com/getpaseo/paseo/issues/4061)[github.comA steer message that arrives while a Codex turn is still starting](https://github.com/getpaseo/paseo/issues/6186)[github.comQueue /clear (and /new, /exit) behind a running turn, like Claude](https://github.com/getpaseo/paseo/discussions/6365)[github.comPi: message sent while a turn runs fails with 'Agent is already](https://github.com/getpaseo/paseo/issues/8940)[newreleases.iogetpaseo/paseo v0.14.0-beta.1 on GitHub - NewReleases.io](https://newreleases.io/project/github/getpaseo/paseo/release/v0.14.0-beta.1)[exe.devRun Paseo on a remote server - exe.dev](https://exe.dev/deploy/paseo)[railway.comDeploy & Host Paseo Daemon - Railway](https://railway.com/deploy/paseo-daemon)[context7.comPaseo (llmstxt/paseo_sh_llms_txt) | Context7](https://context7.com/llmstxt/paseo_sh_llms_txt)[paseo.shDeepAgents Mobile and Desktop App, Open Source - Paseo](https://paseo.sh/deepagents)[github.comGitHub - tiezbro/paseo-agy-acp](https://github.com/tiezbro/paseo-agy-acp)[github.comtiezbro - GitHub](https://github.com/tiezbro)[github.compaseo · GitHub Topics](https://github.com/topics/paseo)[github.comIntegration with agy (antigravity) #2236 - getpaseo paseo - GitHub](https://github.com/getpaseo/paseo/discussions/2236)[github.comfeat: Add Google Antigravity 2.0 (agy) support via ACP #1958 - GitHub](https://github.com/getpaseo/paseo/issues/1958)[hub.xerj.org@tiezbro: paseo-agy-acp corpus for AI agents | XERJ Hub](https://hub.xerj.org/contributors/tiezbro)[github.compaseo-agy-acp/README.zh-CN.md at main - GitHub](https://github.com/tiezbro/paseo-agy-acp/blob/main/README.zh-CN.md)[6erskills.compaseo-agy-acp - Everything is a Skill - 6er Agent Skills Hub](https://www.6erskills.com/skill/tiezbro/paseo-agy-acp)[reddit.comPaseo now integrates seamlessly with Antigravity : r/PaseoAI - Reddit](https://www.reddit.com/r/PaseoAI/comments/1vh53cc/paseo_now_integrates_seamlessly_with_antigravity/)[github.comfeat: · Issue #1845 · getpaseo/paseo - GitHub](https://github.com/getpaseo/paseo/issues/1845)[manus.imContext Engineering for AI Agents: Lessons from Building Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)[medium.comContext Engineering for AI Agents: Key Lessons from Manus - Medium](https://medium.com/@contextspace/context-engineering-for-ai-agents-key-lessons-from-manus-319ab68e4370)[splunk.comContext Engineering for AI Agents in Production - Splunk](https://www.splunk.com/en_us/blog/artificial-intelligence/context-engineering-production-agents.html)[mnemoverse.comPrompt-Cache Keys: Stable Prefix, KV-Cache Hit Rate - Mnemoverse](https://mnemoverse.com/docs/research/agents/kv-cache-context-engineering)[typingmind.comContext Engineering - AI Skill for Any LLM - TypingMind](https://www.typingmind.com/skills/mvschwarz-context-engineering)[hokai.ioContext Engineering Explained: Techniques and Tools (2026) | Hokai](https://hokai.io/guides/context-engineering-explained-2026)[tianpan.coSix Context Engineering Techniques That Make Manus Work in](https://tianpan.co/blog/2026/03/02/context-engineering-lessons-from-manus)[louisbouchard.aiContext Engineering in 2026: Why We Stopped Compacting Our](https://www.louisbouchard.ai/context-engineering-2026/)[ar5iv.labs.arxiv.org[2510.26493] Context Engineering 2.0 - ar5iv - arXiv](https://ar5iv.labs.arxiv.org/html/2510.26493)[arxiv.orgTokenPilot: Cache-Efficient Context Management for LLM Agents](https://arxiv.org/html/2606.17016v2)[aerospike.comContext Engineering for AI Agents and Where Memory Lives](https://aerospike.com/blog/context-engineering-ai-agents/)[asana.comHow we cut a browser agent's cost 76x and made it 5x faster ... - Asana](https://asana.com/inside-asana/cut-browsers-agent-cost)[aclanthology.orgTokenPilot: Cache-Efficient Context Management for LLM Agents](https://aclanthology.org/2026.findings-emnlp.899.pdf)[github.comContext engineering: Tools & ecosystem - GitHub](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/ecosystem/context-engineering-tools.md)[agentclientprotocol.comSchema - Agent Client Protocol](https://agentclientprotocol.com/protocol/v1/schema)[safeguard.shAgent Client Protocol Explained: How Editors Talk to Coding Agents](https://safeguard.sh/resources/blog/agent-client-protocol-explained-how-editors-talk-to-coding-agents-and-how-to-secure-it)[agentclientprotocol.comMigrating from v1 - Agent Client Protocol](https://agentclientprotocol.com/protocol/v2/migration)[agentclientprotocol.comSchema - Agent Client Protocol](https://agentclientprotocol.com/protocol/v2/schema)[pkg.go.devacp package - kon.kitsu.red/core/acp - Go Packages](https://pkg.go.dev/kon.kitsu.red/core/acp)[github.comSpeak the Agent Client Protocol so Penstock runs inside JetBrains](https://github.com/enrichmeai/penstock/issues/59)[pypi.orgclawagents · PyPI](https://pypi.org/project/clawagents/6.17.2/)[skills.snappy.aisnappy-agent-host](https://skills.snappy.ai/skills/snappy-agent-host)[pkg.go.devacp package - github.com/coder/acp-go-sdk - Go Packages](https://pkg.go.dev/github.com/coder/acp-go-sdk)[botbus.ioConnect your own agent - BotBus](https://botbus.io/en/docs/connect-agent)[openreview.netThe OpenHands Software Agent SDK - OpenReview](https://openreview.net/pdf?id=pzVmWs6yGq)[arxiv.orgThe OpenHands Software Agent SDK: A Composable and ... - arXiv](https://arxiv.org/pdf/2511.03690)[researchgate.net(PDF) The OpenHands Software Agent SDK: A Composable and](https://www.researchgate.net/publication/397322275_The_OpenHands_Software_Agent_SDK_A_Composable_and_Extensible_Foundation_for_Production_Agents)[preprints.orgContext Compression for Long-Horizon AI Agents: Lifecycle](https://www.preprints.org/manuscript/202607.0924)[dev.toOpenHands — Deep Dive & Build-Your-Own Guide - DEV Community](https://dev.to/truongpx396/openhands-deep-dive-build-your-own-guide-1al0)[arxiv.orgAnatomy, Architecture, and Evolution of Coding Agents - arXiv](https://arxiv.org/pdf/2609.00006)[cnblogs.comAI Agent框架探秘：拆解OpenHands（8）--- CodeActAgent - 博客园](https://www.cnblogs.com/rossiXYZ/p/19620422)[docs.openhands.devllms-full.txt - OpenHands Docs](https://docs.openhands.dev/llms-full.txt)[lobehub.comagentforge-context | Skills Marketplace · LobeHub](https://lobehub.com/tr/skills/kingxiao-agentforge-agentforge-context)[github.com[Trimming prompt to meet context window limitations] making agent](https://github.com/OpenHands/OpenHands/issues/6634)[crazyrouter.comAI Inference Speed Benchmark 2026: Tokens Per Second Compared](https://crazyrouter.com/en/blog/ai-inference-speed-benchmark-2026)[llmgateway.ioHow to Choose the Right LLM for Your Use Case in 2026](https://llmgateway.io/blog/how-to-choose-the-right-llm)[contracollective.comClaude Haiku 4.5 vs Gemini 3.1 Flash vs GPT-5.5 Mini: Cheap Tier](https://contracollective.com/blog/claude-haiku-4-5-vs-gemini-3-1-flash-vs-gpt-5-5-mini-cheap-tier-2026)[aimultiple.comLLM Latency Benchmark by Use Cases - AIMultiple](https://aimultiple.com/llm-latency-benchmark)[grizzlypeaksoftware.comLLM Provider Pricing in 2026: What It Actually Costs Per Task - Library](https://www.grizzlypeaksoftware.com/library/comparing-llm-provider-pricing-and-performance-19oanku0)[iternal.aiLLM Comparison 2026: 30+ AI Models Benchmarked & Ranked](https://iternal.ai/llm-selection-guide)[ssocialjustice.medium.comThe Numbers Every Architect Should Know - Medium](https://ssocialjustice.medium.com/the-numbers-every-architect-should-know-9609b5c118b7)[arxiv.orgA Benchmark for Open-Ended LLM Inference Optimization by AI](https://arxiv.org/html/2607.20468v1)[subconscious.devInception Review (2026): Pricing, Pros and Cons | Subconscious](https://www.subconscious.dev/providers/inception)[openrouter.aiCompare AI Models: Pricing, Context & Benchmarks - OpenRouter](https://openrouter.ai/models)[stackeval.ioStackEval — by backboard.io](https://www.stackeval.io/)明确前缀缓存保护与协议切面我重点追踪了工业界关于代理系统前缀缓存与增量执行轨迹的工程实践：在前缀保护方面，将易变运行时标记与动态文本强制放置在提示词末尾并保持前段绝对确定（Byte-0 Canonicalization）是避免缓存失效的关键；在宿主协议层面，Antigravity ACP 协议通过 JSON-RPC 的 `session/update` 事件流原生透传 `tool_call`、`locations`（文件路径与行号）以及 `agent_message_chunk`，这使我们在宿主侧确定性地提取 `touchedFiles` 和剥离工具流成为了可能。量化轻量模型延迟与准确度权衡为了确保前置意图编译严格控制在 300 至 800 毫秒首字延迟（TTFT）红线内，我调研了 2026 年主流极速模型家族的性能基准。结果显示，Gemini 2.5 Flash-Lite、Claude Haiku 4.5 与 GPT-4.1 Nano 在关闭繁重推理（Thinking）或采用极简结构化输出模式下，均能稳定达成 140 至 280 毫秒的极低 TTFT 与高 JSON 格式化遵循度，完全满足高频路由与低干扰实时重写的要求。锁定 `paseo-bots` 源码并规划深入读取我同步发现了目标宿主模块 `paseo-bots`（`oliexe/paseo-bots`）在 GitHub 上的公开代码库。接下来，我将对 `paseo-bots` 和 `paseo-agy-acp` 进行精准的源码与接口检索，重点剖析其中的黑板仲裁机制、Seat 编排、以及 `steer`/`queue` 并发调度细节，同时深挖诸如《Don't Break the Cache》与 Coding Agent 上下文压缩的学术实证，力求在工程约束与系统性能间找到最优切面。  [arxiv.orgDo Security Mechanisms Really Protect Coding Agent Harnesses?](https://arxiv.org/html/2610.07639v2)[github.comiSEngLab/Awesome-Self-Evolving-Coding-Agents - GitHub](https://github.com/iSEngLab/Awesome-Self-Evolving-Coding-Agents)[blog.csdn.net为什么大多Code_Agent的主形态是CLI_TUI_2026-04-13 原创](https://blog.csdn.net/qq_40126397/article/details/160099806)[jyoung.devResearch Index - John Young](https://jyoung.dev/research/)[arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI](https://arxiv.org/pdf/2604.14228)[arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI](https://arxiv.org/html/2604.14228v1)[github.comVILA-Lab/Dive-into-Claude-Code: A Systematic Analysis ... - GitHub](https://github.com/VILA-Lab/Dive-into-Claude-Code)[cloud.tencent.com理论篇】Claude Code的动态工作流，一个while循环凭什么干掉状态机](https://cloud.tencent.com/developer/article/2685109)[github.comDeepDive-into-Claude-Code/README_zh.md at main - GitHub](https://github.com/coachmanjeet/DeepDive-into-Claude-Code/blob/main/README_zh.md)[aihumanlove.comThe Claude Code arXiv Paper (2604.14228), Explained](https://aihumanlove.com/blog/dive-into-claude-code-paper-lessons.html)[alphaxiv.orgDive into Claude Code: The Design Space of Today's and Future AI](https://www.alphaxiv.org/abs/2604.14228v1)[podcast.do-not-panic.comAugust 2026 - AI Post Transformers](https://podcast.do-not-panic.com/2026/08/index.html)[github.comOfficial kernel turns remain `running` after assistant output completes](https://github.com/tiezbro/paseo-agy-acp/issues/11)[github.comGitHub - tiezbro/paseo-agy-acp](https://github.com/tiezbro/paseo-agy-acp)[github.comPaseo 适配器验收](https://github.com/tiezbro/paseo-agy-acp/blob/main/docs/operations/paseo-adapter-verification.md)[github.compaseo-agy-acp/README.zh-CN.md at main - GitHub](https://github.com/tiezbro/paseo-agy-acp/blob/main/README.zh-CN.md)[arxiv.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks](https://arxiv.org/abs/2601.06007)[arxiv.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks](https://arxiv.org/pdf/2601.06007)[medium.comPrompt Caching Economics: When 90% Savings Becomes a Trap](https://medium.com/@ai_transfer_lab/prompt-caching-economics-when-90-savings-becomes-a-trap-d909736c0917)[researchgate.netAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks](https://www.researchgate.net/publication/399667043_Don't_Break_the_Cache_An_Evaluation_of_Prompt_Caching_for_Long-Horizon_Agentic_Tasks)[semanticscholar.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks](https://www.semanticscholar.org/paper/Don%27t-Break-the-Cache%3A-An-Evaluation-of-Prompt-for-Lumer-Nizar/1bcdd41f57ff183ec338ee3b5fe6f1e3a94ab0b2)[digitalapplied.comPrompt Caching in 2026: Cut LLM Costs, Keep Quality](https://www.digitalapplied.com/blog/prompt-caching-2026-cut-llm-costs-engineering-guide)[arxiv.orgCache-Aware Dynamic Object Context for Long-Horizon Agents - arXiv](https://arxiv.org/html/2609.37012v1)[arxiv.org1Introduction - arXiv](https://arxiv.org/html/2611.10022v1)[arxiv.orgSilent and Costly: Characterizing and Detecting Prompt-Caching Mis](https://arxiv.org/html/2610.34817v2)[getnadir.comThe Overcaching Tax · Nadir](https://getnadir.com/blog/overcaching-tax-agentic-prompt-caching-strategy/)锁定前端编排库与缓存边界量化在本轮深挖中，我成功获取了前端交互框架 `paseo-bots` 的开源仓精确地址与开发线索，并结合最新实证研究确认了 KV Cache 的严苛红线。研究表明，即便系统提示词前部出现单个字符（Byte-0）的动态变动，也会导致整条对话缓存完全失效；一旦精准守住固定前缀边界，在长达百轮的代理任务中平均可实现 41%–80% 的推理成本缩减，同时将首字延迟降低 13%–31%。这一量化基线为我们决定是将编译意图“直接替换”还是“尾部结构化追加”提供了明确依据。透视编码助手的五级渐进式压缩架构通过解析 Claude Code 的底层源码设计，我提炼出其应对超长会话的“五级上下文削减管线（Budget Reduction -> Snip -> Microcompact -> Context Collapse -> Auto-Compact）”。值得注意的是，它采用只在最后关头触发的模型自摘要机制，并在平时的只读投影视图中保持底层原始历史不变，以换取全链路的可审计性与断点恢复能力；同时利用子智能体（Subagent）物理隔离工具探索的脏数据。这一机制启发我们在双 Session 架构中采用分水岭式的协同裁剪策略。开展形态成本建模与代码仓库精读接下来我将同步推进两项核心分析：首先深入浏览 `paseo-bots` 与 `paseo-agy-acp` 的源码边界以及 `Dive into Claude Code` 深度仓库，提取 `paseo-bots` 在 Seat 调度、黑板仲裁及 ACP 轮次挂起边界上的原始契约；其次，我将编写计算脚本对「持久长连接伴生（形态 A）」「无状态账本推理（形态 B）」与「前缀缓存混合滑动窗口」跨越 1 至 100 轮时的 Token 成本曲线、缓存命中率以及 Context Rot 风险开展定量仿真，为架构选型给出决定性数据支撑。  [trendshift.ioOrgoAI/bops — GitHub trending stats & insights | Trendshift](https://trendshift.io/repositories/288314)[trendshift.iotechjanitor/botmaker — GitHub trending stats & insights - Trendshift](https://trendshift.io/repositories/203950)[trendshift.ioPancakes-Labs/astrbot_plugin_proactive_chat — GitHub trending](https://trendshift.io/repositories/191272)[github.compaseo-bots - GitHub](https://github.com/oliexe/paseo-bots)[github.comyeyan00/paseo-bots: Build teams of coding bots across ... - GitHub](https://github.com/yeyan00/paseo-bots)[github.compaseo-bots/README.md at main · oliexe/paseo-bots · GitHub](https://github.com/oliexe/paseo-bots/blob/main/README.md)[paseo.shBots – Paseo plugin](https://paseo.sh/plugins/oliexe/bots)[github.compaseo · GitHub Topics](https://github.com/topics/paseo)[github.combirui (rockybi) / starred repositories · GitHub](https://github.com/stars/birui/repositories?filter=all)[github.comOndrej Rehacek oliexe - GitHub](https://github.com/oliexe)[github.comIssues · oliexe/paseo-bots - GitHub](https://github.com/oliexe/paseo-bots/issues)[github.comSecurity - oliexe/paseo-bots - GitHub](https://github.com/oliexe/paseo-bots/security)[trendshift.iobotseverywhere-ai/BotsEverywhere — GitHub trending stats & insights](https://trendshift.io/repositories/339968)[github.comOfficial kernel turns remain `running` after assistant output ... - GitHub](https://github.com/tiezbro/paseo-agy-acp/issues/11)[arxiv.orgDon't Break the Cache: An Evaluation of Prompt Caching for ... - arXiv](https://arxiv.org/pdf/2601.06007)[github.comVILA-Lab/Dive-into-Claude-Code: A Systematic Analysis ... - GitHub](https://github.com/VILA-Lab/Dive-into-Claude-Code)锁定最终深度核查方向我刚刚梳理出了几项极具价值的技术基线，包括 `paseo-bots` 的两大潜在代码实现源以及最新的开源协议文档。为确保双 Session 伴生架构在底层协议与成本模型上严丝合缝，我需要做最后一轮精准冲刺：先对比确认哪一版 `paseo-bots` 仓库实际包含了 Seat 编排与黑板仲裁逻辑，并立即读取 `oliexe/paseo-bots` 的实现详情。执行协议抓取与量化建模除了核对宿主插件源码外，我还将直接从官方获取 Antigravity ACP v1 协议的 JSON-RPC 原始定义，以锁定 `session/prompt` 与 `session/cancel` 等控制指令的精确格式。与此同时，我将在分析环境内针对持久伴生会话（形态 A）、无状态账本（形态 B）以及带周期滑动窗口的混合架构（形态 C）在多轮次（1 至 100 轮）下的 Token 开销、缓存命中与成本拐点进行量化建模计算，以此为最终的工程选型提供严密的数据支撑。  [github.comawesome-grok-bot/README.zh.md at main - GitHub](https://github.com/RongleCat/awesome-grok-bot/blob/main/README.zh.md)[agentclientprotocol.comSchema - Agent Client Protocol](https://agentclientprotocol.com/protocol/v1/schema)[github.comoliexe/paseo-bots: Tiny pixel coworkers that live in Paseo ... - GitHub](https://github.com/oliexe/paseo-bots)明确宿主协议与编排框架底层契约我刚刚通过对 `oliexe/paseo-bots` 插件源码及 Agent Client Protocol (ACP) v1 协议规范的深入解析，全面对齐了宿主系统的工程边界。我确认 `paseo-bots` 以插件化方式深度集成于 Paseo，不仅维护着带 200 行/24KB 自动裁剪上限的持久化 `MEMORY.md` 记忆机制，还通过 `ask_bot` 实现 Chief-of-Staff 的多智能体异步/同步委派。而在底层协议层面，ACP 规范明确定义了 `session/cancel` 中断指令（支持随时中止进行中的工具与模型请求并回传取消状态），以及涵盖文本分块和工具调用位置元数据的消息流结构。这些硬性契约为后续设计并发状态机的打断（Steer）与异步账本回滚提供了精准的协议切面。定量仿真确立混合态伴生最优架构针对伴生系统是采用「持久长连接追加（形态 A）」还是「基于 JSON 账本的无状态单轮推理（形态 B）」这一核心决策，我编写了跨越 1 至 100 轮对话的定量成本与延迟仿真模型。计算结果清晰地揭示了两者的临界点：形态 A 的上下文会在百轮时膨胀至超过 10.7 万 Tokens，不仅带来高达数倍的累计推理成本，更会引发严重的长上下文退化；而纯粹的形态 B 虽然上下文恒定，却无法复用前序增量缓存。为此，我合成了兼顾两者优势的「形态 C（Epoch 冻结前缀缓存账本 + 隔离式无状态后置提取）」方案：将前置意图编译与后置正文精简解耦，并按周期冻结底座快照。仿真表明，该方案可在百轮尺度下将上下文严格控制在 3,650 Tokens 以内，累计计算成本仅为形态 A 的约 13.7%，同时将平均首字延迟（TTFT）稳定压制在 180 毫秒左右。完成全局技术选型并输出完整工程蓝图至此，从底层的 Katanemo Plano 轻量路由、Letta 休眠计算、Mem0 与 Graphiti 的实体/双时态记忆演化，到 Claude Code 与 OpenHands 的上下文裁剪实证，以及 Paseo 与 Antigravity ACP 的真实源码契约，所有关键维度的调研均已收官并形成闭环。接下来，我将直接把这些数据与前沿架构整合为一套可落地生产的「双 Session 伴生意图编译 + 响应正文精简账本」完整工程方案，交付涵盖目标拓扑、版本化 JSON 账本 Schema、抗竞态状态机、Bypass 确定性门控规范及生产级 System Prompt 模板在内的系统设计。初步研究收集了大量信息。我正在整理和组织这些信息，以确保整个项目流程顺畅，并涵盖您要求的所有关键点。文字固然好，但有时视觉更能讲述故事。所以，我正在思考如何更好地呈现最重要的观点。就是这样！我要把所有东西都整合起来。记下我最后的想法，润色一切，确保给你我最好的作品。

---

## 📚 参考文献与引用源

1. [**github.com**｜github.comresearch-context-rot-and-management.md - GitHub在新窗口中打开](https://github.com/rodrigorjsf/agent-engineering-toolkit/blob/development/docs/general-llm/research-context-rot-and-management.md)
2. [**mnemoverse.com**｜mnemoverse.comPrompt-Cache Keys: Stable Prefix, KV-Cache Hit Rate - Mnemoverse在新窗口中打开](https://mnemoverse.com/docs/research/agents/kv-cache-context-engineering)
3. [**github.com**｜github.comVILA-Lab/Dive-into-Claude-Code: A Systematic Analysis ... - GitHub在新窗口中打开](https://github.com/VILA-Lab/Dive-into-Claude-Code)
4. [**www.developersdigest.tech**｜developersdigest.techClaude Code Idle Compaction: What It Does and How to Turn It Off在新窗口中打开](https://www.developersdigest.tech/blog/claude-code-idle-compaction-turn-off-cache-cost-2026)
5. [**arxiv.org**｜arxiv.orgLength Is Cheap, Competition Is Not: Attention Predicts Context Rot在新窗口中打开](https://arxiv.org/html/2611.04169v1)
6. [**www.zyte.com**｜zyte.comHow do you manage the context window in Claude Code and ... - Zyte在新窗口中打开](https://www.zyte.com/blog/how-to-manage-context-window-claude-code/)
7. [**medium.com**｜medium.comPrompt Caching Economics: When 90% Savings Becomes a Trap在新窗口中打开](https://medium.com/@ai_transfer_lab/prompt-caching-economics-when-90-savings-becomes-a-trap-d909736c0917)
8. [**blog.getdarwin.ai**｜blog.getdarwin.aiAI Guardrails in 2026: 9 Hallucination Prevention Strategies B2B在新窗口中打开](https://blog.getdarwin.ai/en/ai-guardrails-hallucination-prevention-2026)
9. [**safeguard.sh**｜safeguard.shAgent Client Protocol Explained: How Editors Talk to Coding Agents在新窗口中打开](https://safeguard.sh/resources/blog/agent-client-protocol-explained-how-editors-talk-to-coding-agents-and-how-to-secure-it)
10. [**arxiv.org**｜arxiv.orgzep:atemporal knowledge graph architecture for agent memory - arXiv在新窗口中打开](https://arxiv.org/pdf/2501.13956)
11. [**www.digitalapplied.com**｜digitalapplied.comOpen-Source Agent Memory: Mem0 vs Letta vs Zep - Digital Applied在新窗口中打开](https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared)
12. [**arxiv.org**｜arxiv.orgGoverning Evolving Memory in LLM Agents: Risks, Mechanisms在新窗口中打开](https://arxiv.org/html/2603.11768v1)
13. [**github.com**｜github.comGitHub - tiezbro/paseo-agy-acp在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp)
14. [**arxiv.org**｜arxiv.org在新窗口中打开](https://arxiv.org/pdf/2601.06007)
15. [**agentclientprotocol.com**｜agentclientprotocol.comMigrating from v1 - Agent Client Protocol在新窗口中打开](https://agentclientprotocol.com/protocol/v2/migration)
16. [**crazyrouter.com**｜crazyrouter.comAI Inference Speed Benchmark 2026: Tokens Per Second Compared在新窗口中打开](https://crazyrouter.com/en/blog/ai-inference-speed-benchmark-2026)
17. [**contracollective.com**｜contracollective.comClaude Haiku 4.5 vs Gemini 3.1 Flash vs GPT-5.5 Mini: Cheap Tier在新窗口中打开](https://contracollective.com/blog/claude-haiku-4-5-vs-gemini-3-1-flash-vs-gpt-5-5-mini-cheap-tier-2026)
18. [**github.com**｜github.comA steer message that arrives while a Codex turn is still starting在新窗口中打开](https://github.com/getpaseo/paseo/issues/6186)
19. [**github.com**｜github.compaseo-bots - GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots)
20. [**github.com**｜github.combug: send-now on a queued message interrupts the active turn在新窗口中打开](https://github.com/getpaseo/paseo/issues/4061)
21. [**exe.dev**｜exe.devRun Paseo on a remote server - exe.dev在新窗口中打开](https://exe.dev/deploy/paseo)
22. [**github.com**｜github.comyeyan00/paseo-bots: Build teams of coding bots across ... - GitHub在新窗口中打开](https://github.com/yeyan00/paseo-bots)
23. [**github.com**｜github.com在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp/issues/11)
24. [**neoneye.github.io**｜neoneye.github.ioAgent Memory Atlas在新窗口中打开](https://neoneye.github.io/agent-memory-atlas/)
25. [**arxiv.org**｜arxiv.orgComposer 2 Technical Report - arXiv在新窗口中打开](https://arxiv.org/html/2603.24477v2)
26. [**www.researchgate.net**｜researchgate.net(PDF) Comparative Evaluation of Agentic Workflow Capabilities in AI在新窗口中打开](https://www.researchgate.net/publication/410822551_Comparative_Evaluation_of_Agentic_Workflow_Capabilities_in_AI_IDE_Agents_for_Web-Based_Learning_Media_Development)
27. [**arxiv.org**｜arxiv.orgDo Security Mechanisms Really Protect Coding Agent Harnesses?在新窗口中打开](https://arxiv.org/html/2610.07639v2)
28. [**github.com**｜github.comPlano is an AI-native proxy server and data plane for agentic apps在新窗口中打开](https://github.com/katanemo/plano)
29. [**github.com**｜github.combizmindx/archgw: The AI-native proxy server for agents. Arch在新窗口中打开](https://github.com/bizmindx/archgw)
30. [**docs.planoai.dev**｜docs.planoai.devOrchestration | Plano Docs v0.4.39在新窗口中打开](https://docs.planoai.dev/guides/orchestration.html)
31. [**www.promptquorum.com**｜promptquorum.comPlano Review 2026: Self-Hosted AI Gateway on Envoy在新窗口中打开](https://www.promptquorum.com/power-local-llm/plano-review)
32. [**www.reddit.com**｜reddit.comopen source intelligent middle-ware for fast and observable agentic在新窗口中打开](https://www.reddit.com/r/LocalLLaMA/comments/1gan3p9/introducing_arch_open_source_intelligent/)
33. [**www.digitalocean.com**｜digitalocean.comHow We Built DigitalOcean Inference Router在新窗口中打开](https://www.digitalocean.com/blog/inference-router-architecture)
34. [**arxiv.org**｜arxiv.orgArch-Router: Aligning LLM Routing with Human Preferences - arXiv在新窗口中打开](https://arxiv.org/html/2506.16655v1)
35. [**arxiv.org**｜arxiv.orgGraph-Native Cognitive Memory for AI Agents - arXiv在新窗口中打开](https://arxiv.org/pdf/2603.17244)
36. [**arxiv.org**｜arxiv.orgSleep-time Compute: Beyond Inference Scaling at Test-time - arXiv在新窗口中打开](https://arxiv.org/abs/2504.13171)
37. [**arxiv.org**｜arxiv.orgSleep-time Compute: Beyond Inference Scaling at Test-time - arXiv在新窗口中打开](https://arxiv.org/html/2504.13171v1)
38. [**www.letta.com**｜letta.comSleep-time Compute - Letta在新窗口中打开](https://www.letta.com/blog/sleep-time-compute/)
39. [**dev.to**｜dev.toWhat is memory consolidation in long-term AI memory systems?在新窗口中打开](https://dev.to/izgorodin/what-is-memory-consolidation-in-long-term-ai-memory-systems-2j8e)
40. [**upsolve.ai**｜upsolve.aiAI Agent Memory Explained: Diagrams, Tools & Architecture在新窗口中打开](https://upsolve.ai/blog/ai-agent-memory)
41. [**medium.com**｜medium.comMem0: Building Production-Ready AI Agents with Scalable Long在新窗口中打开](https://medium.com/@EleventhHourEnthusiast/mem0-building-production-ready-ai-agents-with-scalable-long-term-memory-9c534cd39264)
42. [**arxiv.org**｜arxiv.orgZep: A Temporal Knowledge Graph Architecture for Agent Memory在新窗口中打开](https://arxiv.org/abs/2501.13956)
43. [**arxiv.org**｜arxiv.orgZep: A Temporal Knowledge Graph Architecture for Agent Memory在新窗口中打开](https://arxiv.org/html/2501.13956v1)
44. [**dspy.ai**｜dspy.aiDSPy: Program, don't prompt, your LLMs在新窗口中打开](https://dspy.ai/current/)
45. [**towardsdatascience.com**｜towardsdatascience.comContext Engineering — A Comprehensive Hands-On Tutorial with在新窗口中打开](https://towardsdatascience.com/context-engineering-a-comprehensive-hands-on-tutorial-with-dspy/)
46. [**claude.com**｜claude.comBest practices for computer and browser use with Claude在新窗口中打开](https://claude.com/ja/blog/best-practices-for-computer-and-browser-use-with-claude?destination=%2Fleadership-organisations%2Fpsychopath-c-suite%3Fp%3D&fcdaa149_sort_date=desc)
47. [**manus.im**｜manus.imContext Engineering for AI Agents: Lessons from Building Manus在新窗口中打开](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
48. [**medium.com**｜medium.comContext Engineering for AI Agents: Key Lessons from Manus - Medium在新窗口中打开](https://medium.com/@contextspace/context-engineering-for-ai-agents-key-lessons-from-manus-319ab68e4370)
49. [**dev.to**｜dev.toOpenHands — Deep Dive & Build-Your-Own Guide - DEV Community在新窗口中打开](https://dev.to/truongpx396/openhands-deep-dive-build-your-own-guide-1al0)
50. [**www.researchgate.net**｜researchgate.net(PDF) The OpenHands Software Agent SDK: A Composable and在新窗口中打开](https://www.researchgate.net/publication/397322275_The_OpenHands_Software_Agent_SDK_A_Composable_and_Extensible_Foundation_for_Production_Agents)
51. [**www.preprints.org**｜preprints.orgContext Compression for Long-Horizon AI Agents: Lifecycle在新窗口中打开](https://www.preprints.org/manuscript/202607.0924)
52. [**www.grizzlypeaksoftware.com**｜grizzlypeaksoftware.comLLM Provider Pricing in 2026: What It Actually Costs Per Task - Library在新窗口中打开](https://www.grizzlypeaksoftware.com/library/comparing-llm-provider-pricing-and-performance-19oanku0)
53. [**www.digitalapplied.com**｜digitalapplied.comContext Engineering: Agent Reliability Playbook 2026 - Digital Applied在新窗口中打开](https://www.digitalapplied.com/blog/context-engineering-agent-reliability-playbook-2026)
54. [**arxiv.org**｜arxiv.orgA Systematization of Security on the Path to AI-Native Operating在新窗口中打开](https://arxiv.org/pdf/2609.23700)
55. [**arxiv.org**｜arxiv.orgTokenPilot: Cache-Efficient Context Management for LLM Agents在新窗口中打开](https://arxiv.org/html/2606.17016v2)
56. [**www.ovaledge.com**｜ovaledge.comWhat is Context Rot and Why it Breaks Production AI Systems在新窗口中打开](https://www.ovaledge.com/blog/context-rot)
57. [**nayakpplaban.medium.com**｜nayakpplaban.medium.comMemory Compaction in AI Agent Harnesses - Plaban Nayak在新窗口中打开](https://nayakpplaban.medium.com/memory-compaction-in-ai-agent-harnesses-ce0ac91b85fa)
58. [**www.louisbouchard.ai**｜louisbouchard.aiContext Engineering in 2026: Why We Stopped Compacting Our在新窗口中打开](https://www.louisbouchard.ai/context-engineering-2026/)
59. [**asana.com**｜asana.comHow we cut a browser agent's cost 76x and made it 5x faster ... - Asana在新窗口中打开](https://asana.com/inside-asana/cut-browsers-agent-cost)
60. [**github.com**｜github.comQueue /clear (and /new, /exit) behind a running turn, like Claude在新窗口中打开](https://github.com/getpaseo/paseo/discussions/6365)
61. [**orcaagent.dev**｜orcaagent.devOrca Agent changelog在新窗口中打开](https://orcaagent.dev/changelog/)
62. [**pkg.go.dev**｜pkg.go.devacp package - kon.kitsu.red/core/acp - Go Packages在新窗口中打开](https://pkg.go.dev/kon.kitsu.red/core/acp)
63. [**github.com**｜github.comCodewhale/docs/ARCHITECTURE.md at main - GitHub在新窗口中打开](https://github.com/codewhale-hq/Codewhale/blob/main/docs/ARCHITECTURE.md)
64. [**zylos.ai**｜zylos.aiResearch Notes - Zylos在新窗口中打开](https://zylos.ai/research/)
65. [**agentclientprotocol.com**｜agentclientprotocol.com在新窗口中打开](https://agentclientprotocol.com/protocol/v1/schema)
66. [**llmgateway.io**｜llmgateway.ioHow to Choose the Right LLM for Your Use Case in 2026在新窗口中打开](https://llmgateway.io/blog/how-to-choose-the-right-llm)
67. [**aimultiple.com**｜aimultiple.comLLM Latency Benchmark by Use Cases - AIMultiple在新窗口中打开](https://aimultiple.com/llm-latency-benchmark)
68. [**huggingface.co**｜huggingface.cokatanemo/Arch-Router-1.5B.gguf - Hugging Face在新窗口中打开](https://huggingface.co/katanemo/Arch-Router-1.5B.gguf)
69. [**docs.planoai.dev**｜docs.planoai.devQuickstart | Plano Docs v0.4.39在新窗口中打开](https://docs.planoai.dev/get_started/quickstart)
70. [**www.researchgate.net**｜researchgate.netSleep-time Compute: Beyond Inference Scaling at Test-time在新窗口中打开](https://www.researchgate.net/publication/390893325_Sleep-time_Compute_Beyond_Inference_Scaling_at_Test-time)
71. [**github.com**｜github.comaccompanying material for sleep-time compute paper - letta-ai在新窗口中打开](https://github.com/letta-ai/sleep-time-compute)
72. [**www.youtube.com**｜youtube.comWhat is Sleep Time Compute? - YouTube在新窗口中打开](https://www.youtube.com/watch?v=cZ3sh-57Rqk)
73. [**www.getzep.com**｜getzep.comContext Lake | Governed context for agents - Zep在新窗口中打开](https://www.getzep.com/platform/context-lake/)
74. [**www.researchgate.net**｜researchgate.netMem0: Building Production-Ready AI Agents with Scalable Long在新窗口中打开](https://www.researchgate.net/publication/396785886_Mem0_Building_Production-Ready_AI_Agents_with_Scalable_Long-Term_Memory)
75. [**www.youtube.com**｜youtube.comMem0: Building Production-Ready AI Agents with Scalable Long在新窗口中打开](https://www.youtube.com/watch?v=cHQyugatz6M)
76. [**github.com**｜github.compaseo - Antigravity via custom ACP provider using agy-acp - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/issues/1745)
77. [**www.reddit.com**｜reddit.comAntigravity is now working in Paseo through my ACP integration在新窗口中打开](https://www.reddit.com/r/PaseoAI/comments/1vhpqn4/antigravity_is_now_working_in_paseo_through_my/)
78. [**www.codeagentswarm.com**｜codeagentswarm.comPaseo vs CodeAgentSwarm: An Honest Comparison (2026)在新窗口中打开](https://www.codeagentswarm.com/en/guides/paseo-vs-codeagentswarm)
79. [**news.ycombinator.com**｜news.ycombinator.comI'm the maintainer of Paseo. I didn't submit this, so it was a nice在新窗口中打开](https://news.ycombinator.com/item?id=48378983)
80. [**getmoshi.app**｜getmoshi.appPaseo vs Moshi在新窗口中打开](https://getmoshi.app/compare/paseo)
81. [**www.reddit.com**｜reddit.comAntigravity ACP provider for Paseo that actually works - Reddit在新窗口中打开](https://www.reddit.com/r/PaseoAI/comments/1wpwd0w/antigravity_acp_provider_for_paseo_that_actually/)
82. [**moonshotai.github.io**｜moonshotai.github.ioChangelog | Kimi Code CLI Docs在新窗口中打开](https://moonshotai.github.io/kimi-code/en/release-notes/changelog.html)
83. [**github.com**｜github.combb/docs/debugging-and-qa.md at main · get-bb/bb - GitHub在新窗口中打开](https://github.com/get-bb/bb/blob/main/docs/debugging-and-qa.md)
84. [**blog.csdn.net**｜blog.csdn.netCodewhale Hooks 全指南：基于终端AI Agent 的11 个生命周期事件在新窗口中打开](https://blog.csdn.net/gitblog_00454/article/details/151417608?utm_source=gitcode_aigc_v1_t0&index=next&type=card&)
85. [**github.com**｜github.comoh-my-pi/packages/ai/CHANGELOG.md at main - GitHub在新窗口中打开](https://github.com/can1357/oh-my-pi/blob/main/packages/ai/CHANGELOG.md)
86. [**pub.towardsai.net**｜pub.towardsai.netClaude Code Under the Hood: How Context, Tokens, Tools and在新窗口中打开](https://pub.towardsai.net/claude-code-under-the-hood-how-context-tokens-tools-and-subagents-work-51399a5890fe)
87. [**web.stanford.edu**｜web.stanford.eduAgent Context Management - Stanford University在新窗口中打开](https://web.stanford.edu/class/cs224v/lectures_2026/I-context.pdf)
88. [**claude.com**｜claude.comA guide to the anatomy of effective commerce agents - Claude在新窗口中打开](https://claude.com/de/resources/articles/the-anatomy-of-effective-commerce-agents?utm_source=google&utm_medium=cpc&utm_campaign=ChatOn+%7C+Web+%7C+T2%2F3+%7C+Search+%7C+Website+Mix+%7C+Purch+No+Trial+%7C+07.02.2025&utm_content=739868849737&utm_term=gpt+4o&adset_id=179835817572&ad_id=739868849737&gclid=CjwKCAjw5PK_BhBBEiwAL7GTPdTW0dzh7k5nTkUDMme3yR0txXem-_TBAF7IoJn77q3yyQwnPchZRRoCv2AQAvD_BwE)
89. [**arxiv.org**｜arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://arxiv.org/html/2604.14228v3)
90. [**omidsaffari.com**｜omidsaffari.comContext Engineering: How to Keep Agents on Task | Omid Saffari在新窗口中打开](https://omidsaffari.com/blog/context-engineering)
91. [**www.thoughtworks.com**｜thoughtworks.comTechniques | Technology Radar - Thoughtworks在新窗口中打开](https://www.thoughtworks.com/en-us/radar/techniques)
92. [**idcontrol.com**｜idcontrol.comState of Agentic AI Security and Governance - ID Control在新窗口中打开](https://idcontrol.com/wp-content/uploads/2026/06/OWASP-State-of-art-AI.pdf)
93. [**github.com**｜github.comawesome-agent-skills/README.md at master - GitHub在新窗口中打开](https://github.com/uhub/awesome-agent-skills/blob/master/README.md)
94. [**www.researchgate.net**｜researchgate.net(PDF) Harness Engineering: Anatomy, Architecture, and Evolution of在新窗口中打开](https://www.researchgate.net/publication/413883486_Harness_Engineering_Anatomy_Architecture_and_Evolution_of_Coding_Agents_--_A_Source-Code_Study_of_Eleven_Systems)
95. [**aclanthology.org**｜aclanthology.orgProceedings of the 2026 Conference on Empirical Methods in在新窗口中打开](https://aclanthology.org/volumes/2026.emnlp-industry/)
96. [**research.wvu.edu**｜research.wvu.eduIssue #6 - May 2026 | Research Office | West Virginia University在新窗口中打开](https://research.wvu.edu/initiatives/wvu-ai-discussion-group/issue-6-may)
97. [**leanpub.com**｜leanpub.comDSPy in Depth - Leanpub在新窗口中打开](https://leanpub.com/programmingwithdspy/sample.pdf)
98. [**www.promptingguide.ai**｜promptingguide.aiRetrieval Augmented Generation (RAG) for LLMs在新窗口中打开](https://www.promptingguide.ai/research/rag)
99. [**dspy.ai**｜dspy.aiTutorial: Retrieval-Augmented Generation (RAG) - DSPy在新窗口中打开](https://dspy.ai/current/tutorials/rag/)
100. [**www.trychroma.com**｜trychroma.comContext Rot: How Increasing Input Tokens Impacts LLM Performance在新窗口中打开](https://www.trychroma.com/research/context-rot)
101. [**www.tinyfish.ai**｜tinyfish.aiContext Rot: How Long Inputs Degrade LLM Accuracy in 2026在新窗口中打开](https://www.tinyfish.ai/blog/context-rot)
102. [**hamel.dev**｜hamel.devP6: Context Rot - Hamel Husain's Blog在新窗口中打开](https://hamel.dev/notes/llm/rag/p6-context_rot.html)
103. [**getnadir.com**｜getnadir.comContext Rot · Nadir在新窗口中打开](https://getnadir.com/blog/context-rot-long-context-degradation-cost/)
104. [**zylos.ai**｜zylos.aiEvolving User Profiles: How Conversational AI Agents Maintain在新窗口中打开](https://zylos.ai/research/2026-07-18-evolving-user-profile-memory-conversational-agents/)
105. [**aclanthology.org**｜aclanthology.orgLong-Term Agent Memory through Complementary Curation and在新窗口中打开](https://aclanthology.org/2026.findings-aacl.218.pdf)
106. [**atlan.com**｜atlan.comHow to Fix AI Agent Memory Loss: Session Amnesia vs Context - Atlan在新窗口中打开](https://atlan.com/know/ai-agent/how-agents-forget-and-how-to-fix-it/)
107. [**arxiv.org**｜arxiv.orgSeparating Memory and Workflow Effects in Predicting Individual在新窗口中打开](https://arxiv.org/html/2609.33321v2)
108. [**arxiv.org**｜arxiv.orgEvaluating Memory Structure in LLM Agents - arXiv在新窗口中打开](https://arxiv.org/html/2602.11243v4)
109. [**arxiv.org**｜arxiv.orgA Systematization of Security on the Path to AI-Native Operating在新窗口中打开](https://arxiv.org/html/2609.23700v1)
110. [**huggingface.co**｜huggingface.coDaily Papers - Hugging Face在新窗口中打开](https://huggingface.co/papers?q=cumulative%20drift)
111. [**medium.com**｜medium.comWill AI Go Bad? The Wrong Question | by Boris (Bruce) Kriger在新窗口中打开](https://medium.com/@krigerbruce/will-ai-go-bad-the-wrong-question-39381a5049dd)
112. [**cdn.prod.website-files.com**｜cdn.prod.website-files.comAgentic AI Security For Dummies®, Cequence Special Edition在新窗口中打开](https://cdn.prod.website-files.com/6a703eb2a09bf183034a34c4/6aad1fadc23cc247a934dcc5_Agentic-AI-Security-For-Dummies_Cequence-Special-Edition.pdf)
113. [**openreview.net**｜openreview.netLarge Language Models for Cybersecurity: A Survey of - OpenReview在新窗口中打开](https://openreview.net/pdf/6476aceae0c5fce7ea9a26558450c7f499a15dc7.pdf)
114. [**www.preprints.org**｜preprints.orgFrom Solo Control to Enterprise Scale Through Agentic AI在新窗口中打开](https://www.preprints.org/manuscript/202608.1414)
115. [**gist.github.com**｜gist.github.comA memory architecture for agentic system - GitHub Gist在新窗口中打开](https://gist.github.com/spikelab/7551c6368e23caa06a4056350f6b2db3?permalink_comment_id=6241076)
116. [**huggingface.co**｜huggingface.coDaily Papers - Hugging Face在新窗口中打开](https://huggingface.co/papers?q=CLI%20agent)
117. [**www.symphony42.com**｜symphony42.comThe Definitive Guide to the AI Lexicon | Symphony42 Blog在新窗口中打开](https://www.symphony42.com/definitive-guide-ai-lexicon/)
118. [**qai.io**｜qai.ioknowledge-distillation skill for Claude Code, Codex and Cursor - QAI在新窗口中打开](https://qai.io/skills/orchestra-research/ai-research-skills/knowledge-distillation)
119. [**dev.to**｜dev.toAI Weekly: New PC Chips, Credit Pricing, Stateless MCP在新窗口中打开](https://dev.to/alexmercedcoder/ai-weekly-new-pc-chips-credit-pricing-stateless-mcp-1eb9)
120. [**www.taskade.com**｜taskade.comHow LLMs Got Hands: A History of Tool Use (2026) - Taskade在新窗口中打开](https://www.taskade.com/blog/tool-use-history)
121. [**aicoder.com**｜aicoder.comUW & Meta FAIR Introduce Context Language Models (CLMs在新窗口中打开](https://aicoder.com/news/news-20260930-clm-context-language-models-meta-uw)
122. [**www.turingpost.com**｜turingpost.comFOD#110: AI is for Everyone and for a Better Future - Turing Post在新窗口中打开](https://www.turingpost.com/p/fod110)
123. [**arxiv.org**｜arxiv.orgSelf-Evolving Coding Agents - arXiv在新窗口中打开](https://arxiv.org/html/2608.03392v2)
124. [**github.com**｜github.commureo/CHANGELOG.md at main - GitHub在新窗口中打开](https://github.com/logly/mureo/blob/main/CHANGELOG.md)
125. [**chatforest.com**｜chatforest.comChatForest — MCP Reviews, AI Builder Guides & Daily News在新窗口中打开](https://chatforest.com/)
126. [**arxiv.org**｜arxiv.orgEvaluating LLM-based Agents for Multi-Turn Conversations: A Survey在新窗口中打开](https://arxiv.org/html/2503.22458v3)
127. [**www.confident-ai.com**｜confident-ai.comMulti-Turn LLM Evaluation in 2026: What You Need to Know在新窗口中打开](https://www.confident-ai.com/blog/multi-turn-llm-evaluation-in-2026)
128. [**futureagi.com**｜futureagi.comRAG Architecture in 2026: Patterns + Eval - Future AGI在新窗口中打开](https://futureagi.com/blog/rag-architecture-llm-2025/)
129. [**aclanthology.org**｜aclanthology.orgProceedings of the 2026 Conference on Empirical Methods in在新窗口中打开](https://aclanthology.org/volumes/2026.emnlp-main/)
130. [**www.researchgate.net**｜researchgate.netMulti-Turn Metamorphic Testing for LLM-Based Dialogue Systems在新窗口中打开](https://www.researchgate.net/publication/406448877_MORTAR_Multi-turn_Metamorphic_Testing_for_LLM-based_Dialogue_Systems)
131. [**medium.com**｜medium.com7 LLM Guardrails That Reduce Hallucinations | by Thinking Loop在新窗口中打开](https://medium.com/@ThinkingLoop/7-llm-guardrails-that-reduce-hallucinations-3d673677fb3f)
132. [**arxiv.org**｜arxiv.orgA Survey on Multi-Turn Interactions with Large Language Models在新窗口中打开](https://arxiv.org/html/2504.04717v6)
133. [**2026.emnlp.org**｜2026.emnlp.orgAccepted Main Conference Papers - EMNLP 2026在新窗口中打开](https://2026.emnlp.org/program/main_papers/)
134. [**openreview.net**｜openreview.netACL ARR 2026 January - OpenReview在新窗口中打开](https://openreview.net/group?id=aclweb.org/ACL/ARR/2026/January)
135. [**github.com**｜github.comPi: message sent while a turn runs fails with 'Agent is already在新窗口中打开](https://github.com/getpaseo/paseo/issues/8940)
136. [**newreleases.io**｜newreleases.iogetpaseo/paseo v0.14.0-beta.1 on GitHub - NewReleases.io在新窗口中打开](https://newreleases.io/project/github/getpaseo/paseo/release/v0.14.0-beta.1)
137. [**railway.com**｜railway.comDeploy & Host Paseo Daemon - Railway在新窗口中打开](https://railway.com/deploy/paseo-daemon)
138. [**context7.com**｜context7.comPaseo (llmstxt/paseo_sh_llms_txt) | Context7在新窗口中打开](https://context7.com/llmstxt/paseo_sh_llms_txt)
139. [**paseo.sh**｜paseo.shDeepAgents Mobile and Desktop App, Open Source - Paseo在新窗口中打开](https://paseo.sh/deepagents)
140. [**github.com**｜github.comtiezbro - GitHub在新窗口中打开](https://github.com/tiezbro)
141. [**github.com**｜github.comIntegration with agy (antigravity) #2236 - getpaseo paseo - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/discussions/2236)
142. [**github.com**｜github.comfeat: Add Google Antigravity 2.0 (agy) support via ACP #1958 - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/issues/1958)
143. [**hub.xerj.org**｜hub.xerj.org@tiezbro: paseo-agy-acp corpus for AI agents | XERJ Hub在新窗口中打开](https://hub.xerj.org/contributors/tiezbro)
144. [**www.6erskills.com**｜6erskills.compaseo-agy-acp - Everything is a Skill - 6er Agent Skills Hub在新窗口中打开](https://www.6erskills.com/skill/tiezbro/paseo-agy-acp)
145. [**www.reddit.com**｜reddit.comPaseo now integrates seamlessly with Antigravity : r/PaseoAI - Reddit在新窗口中打开](https://www.reddit.com/r/PaseoAI/comments/1vh53cc/paseo_now_integrates_seamlessly_with_antigravity/)
146. [**github.com**｜github.comfeat: · Issue #1845 · getpaseo/paseo - GitHub在新窗口中打开](https://github.com/getpaseo/paseo/issues/1845)
147. [**www.splunk.com**｜splunk.comContext Engineering for AI Agents in Production - Splunk在新窗口中打开](https://www.splunk.com/en_us/blog/artificial-intelligence/context-engineering-production-agents.html)
148. [**www.typingmind.com**｜typingmind.comContext Engineering - AI Skill for Any LLM - TypingMind在新窗口中打开](https://www.typingmind.com/skills/mvschwarz-context-engineering)
149. [**hokai.io**｜hokai.ioContext Engineering Explained: Techniques and Tools (2026) | Hokai在新窗口中打开](https://hokai.io/guides/context-engineering-explained-2026)
150. [**tianpan.co**｜tianpan.coSix Context Engineering Techniques That Make Manus Work in在新窗口中打开](https://tianpan.co/blog/2026/03/02/context-engineering-lessons-from-manus)
151. [**ar5iv.labs.arxiv.org**｜ar5iv.labs.arxiv.org[2510.26493] Context Engineering 2.0 - ar5iv - arXiv在新窗口中打开](https://ar5iv.labs.arxiv.org/html/2510.26493)
152. [**aerospike.com**｜aerospike.comContext Engineering for AI Agents and Where Memory Lives在新窗口中打开](https://aerospike.com/blog/context-engineering-ai-agents/)
153. [**aclanthology.org**｜aclanthology.orgTokenPilot: Cache-Efficient Context Management for LLM Agents在新窗口中打开](https://aclanthology.org/2026.findings-emnlp.899.pdf)
154. [**github.com**｜github.comContext engineering: Tools & ecosystem - GitHub在新窗口中打开](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/guide/ecosystem/context-engineering-tools.md)
155. [**agentclientprotocol.com**｜agentclientprotocol.comSchema - Agent Client Protocol在新窗口中打开](https://agentclientprotocol.com/protocol/v2/schema)
156. [**github.com**｜github.comSpeak the Agent Client Protocol so Penstock runs inside JetBrains在新窗口中打开](https://github.com/enrichmeai/penstock/issues/59)
157. [**pypi.org**｜pypi.orgclawagents · PyPI在新窗口中打开](https://pypi.org/project/clawagents/6.17.2/)
158. [**skills.snappy.ai**｜skills.snappy.aisnappy-agent-host在新窗口中打开](https://skills.snappy.ai/skills/snappy-agent-host)
159. [**pkg.go.dev**｜pkg.go.devacp package - github.com/coder/acp-go-sdk - Go Packages在新窗口中打开](https://pkg.go.dev/github.com/coder/acp-go-sdk)
160. [**botbus.io**｜botbus.ioConnect your own agent - BotBus在新窗口中打开](https://botbus.io/en/docs/connect-agent)
161. [**openreview.net**｜openreview.netThe OpenHands Software Agent SDK - OpenReview在新窗口中打开](https://openreview.net/pdf?id=pzVmWs6yGq)
162. [**arxiv.org**｜arxiv.orgThe OpenHands Software Agent SDK: A Composable and ... - arXiv在新窗口中打开](https://arxiv.org/pdf/2511.03690)
163. [**arxiv.org**｜arxiv.orgAnatomy, Architecture, and Evolution of Coding Agents - arXiv在新窗口中打开](https://arxiv.org/pdf/2609.00006)
164. [**www.cnblogs.com**｜cnblogs.comAI Agent框架探秘：拆解OpenHands（8）--- CodeActAgent - 博客园在新窗口中打开](https://www.cnblogs.com/rossiXYZ/p/19620422)
165. [**docs.openhands.dev**｜docs.openhands.devllms-full.txt - OpenHands Docs在新窗口中打开](https://docs.openhands.dev/llms-full.txt)
166. [**lobehub.com**｜lobehub.comagentforge-context | Skills Marketplace · LobeHub在新窗口中打开](https://lobehub.com/tr/skills/kingxiao-agentforge-agentforge-context)
167. [**github.com**｜github.com[Trimming prompt to meet context window limitations] making agent在新窗口中打开](https://github.com/OpenHands/OpenHands/issues/6634)
168. [**iternal.ai**｜iternal.aiLLM Comparison 2026: 30+ AI Models Benchmarked & Ranked在新窗口中打开](https://iternal.ai/llm-selection-guide)
169. [**ssocialjustice.medium.com**｜ssocialjustice.medium.comThe Numbers Every Architect Should Know - Medium在新窗口中打开](https://ssocialjustice.medium.com/the-numbers-every-architect-should-know-9609b5c118b7)
170. [**arxiv.org**｜arxiv.orgA Benchmark for Open-Ended LLM Inference Optimization by AI在新窗口中打开](https://arxiv.org/html/2607.20468v1)
171. [**www.subconscious.dev**｜subconscious.devInception Review (2026): Pricing, Pros and Cons | Subconscious在新窗口中打开](https://www.subconscious.dev/providers/inception)
172. [**openrouter.ai**｜openrouter.aiCompare AI Models: Pricing, Context & Benchmarks - OpenRouter在新窗口中打开](https://openrouter.ai/models)
173. [**www.stackeval.io**｜stackeval.ioStackEval — by backboard.io在新窗口中打开](https://www.stackeval.io/)
174. [**github.com**｜github.comiSEngLab/Awesome-Self-Evolving-Coding-Agents - GitHub在新窗口中打开](https://github.com/iSEngLab/Awesome-Self-Evolving-Coding-Agents)
175. [**blog.csdn.net**｜blog.csdn.net为什么大多Code_Agent的主形态是CLI_TUI_2026-04-13 原创在新窗口中打开](https://blog.csdn.net/qq_40126397/article/details/160099806)
176. [**jyoung.dev**｜jyoung.devResearch Index - John Young在新窗口中打开](https://jyoung.dev/research/)
177. [**arxiv.org**｜arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://arxiv.org/pdf/2604.14228)
178. [**arxiv.org**｜arxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://arxiv.org/html/2604.14228v1)
179. [**cloud.tencent.com**｜cloud.tencent.com理论篇】Claude Code的动态工作流，一个while循环凭什么干掉状态机在新窗口中打开](https://cloud.tencent.com/developer/article/2685109)
180. [**github.com**｜github.comDeepDive-into-Claude-Code/README_zh.md at main - GitHub在新窗口中打开](https://github.com/coachmanjeet/DeepDive-into-Claude-Code/blob/main/README_zh.md)
181. [**aihumanlove.com**｜aihumanlove.comThe Claude Code arXiv Paper (2604.14228), Explained在新窗口中打开](https://aihumanlove.com/blog/dive-into-claude-code-paper-lessons.html)
182. [**www.alphaxiv.org**｜alphaxiv.orgDive into Claude Code: The Design Space of Today's and Future AI在新窗口中打开](https://www.alphaxiv.org/abs/2604.14228v1)
183. [**podcast.do-not-panic.com**｜podcast.do-not-panic.comAugust 2026 - AI Post Transformers在新窗口中打开](https://podcast.do-not-panic.com/2026/08/index.html)
184. [**github.com**｜github.comPaseo 适配器验收在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp/blob/main/docs/operations/paseo-adapter-verification.md)
185. [**github.com**｜github.compaseo-agy-acp/README.zh-CN.md at main - GitHub在新窗口中打开](https://github.com/tiezbro/paseo-agy-acp/blob/main/README.zh-CN.md)
186. [**arxiv.org**｜arxiv.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks在新窗口中打开](https://arxiv.org/abs/2601.06007)
187. [**www.researchgate.net**｜researchgate.netAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks在新窗口中打开](https://www.researchgate.net/publication/399667043_Don't_Break_the_Cache_An_Evaluation_of_Prompt_Caching_for_Long-Horizon_Agentic_Tasks)
188. [**www.semanticscholar.org**｜semanticscholar.orgAn Evaluation of Prompt Caching for Long-Horizon Agentic Tasks在新窗口中打开](https://www.semanticscholar.org/paper/Don%27t-Break-the-Cache%3A-An-Evaluation-of-Prompt-for-Lumer-Nizar/1bcdd41f57ff183ec338ee3b5fe6f1e3a94ab0b2)
189. [**www.digitalapplied.com**｜digitalapplied.comPrompt Caching in 2026: Cut LLM Costs, Keep Quality在新窗口中打开](https://www.digitalapplied.com/blog/prompt-caching-2026-cut-llm-costs-engineering-guide)
190. [**arxiv.org**｜arxiv.orgCache-Aware Dynamic Object Context for Long-Horizon Agents - arXiv在新窗口中打开](https://arxiv.org/html/2609.37012v1)
191. [**arxiv.org**｜arxiv.org1Introduction - arXiv在新窗口中打开](https://arxiv.org/html/2611.10022v1)
192. [**arxiv.org**｜arxiv.orgSilent and Costly: Characterizing and Detecting Prompt-Caching Mis在新窗口中打开](https://arxiv.org/html/2610.34817v2)
193. [**getnadir.com**｜getnadir.comThe Overcaching Tax · Nadir在新窗口中打开](https://getnadir.com/blog/overcaching-tax-agentic-prompt-caching-strategy/)
194. [**trendshift.io**｜trendshift.ioOrgoAI/bops — GitHub trending stats & insights | Trendshift在新窗口中打开](https://trendshift.io/repositories/288314)
195. [**trendshift.io**｜trendshift.iotechjanitor/botmaker — GitHub trending stats & insights - Trendshift在新窗口中打开](https://trendshift.io/repositories/203950)
196. [**trendshift.io**｜trendshift.ioPancakes-Labs/astrbot_plugin_proactive_chat — GitHub trending在新窗口中打开](https://trendshift.io/repositories/191272)
197. [**github.com**｜github.compaseo-bots/README.md at main · oliexe/paseo-bots · GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots/blob/main/README.md)
198. [**paseo.sh**｜paseo.shBots – Paseo plugin在新窗口中打开](https://paseo.sh/plugins/oliexe/bots)
199. [**github.com**｜github.compaseo · GitHub Topics在新窗口中打开](https://github.com/topics/paseo)
200. [**github.com**｜github.combirui (rockybi) / starred repositories · GitHub在新窗口中打开](https://github.com/stars/birui/repositories?filter=all)
201. [**github.com**｜github.comOndrej Rehacek oliexe - GitHub在新窗口中打开](https://github.com/oliexe)
202. [**github.com**｜github.comIssues · oliexe/paseo-bots - GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots/issues)
203. [**github.com**｜github.comSecurity - oliexe/paseo-bots - GitHub在新窗口中打开](https://github.com/oliexe/paseo-bots/security)
204. [**trendshift.io**｜trendshift.iobotseverywhere-ai/BotsEverywhere — GitHub trending stats & insights在新窗口中打开](https://trendshift.io/repositories/339968)
205. [**github.com**｜github.comawesome-grok-bot/README.zh.md at main - GitHub在新窗口中打开](https://github.com/RongleCat/awesome-grok-bot/blob/main/README.zh.md)

