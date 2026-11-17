# Claude Code 多智能体提示词方案对比

> 导出自 Google Gemini 深度研究 (Deep Research)
> 导出时间: 2026-11-13 00:18:00

# Claude Code 多智能体（Multi-Agent）架构与提示词工程深度解析：上下文失忆机制、`CLAUDE.md` 与 System Prompt 方案对比及业界主流实践

在基于 Claude Code 构建多智能体（Multi-Agent）协作系统时，**“大上下文窗口是否更容易导致失忆”**以及**“应该通过独立文件夹配置 `CLAUDE.md` 还是修改 System Prompt（替换或追加）来定义智能体角色”**，本质上触及了大模型注意力分配机制（Attention Budget）、指令优先级层级（Instruction Hierarchy）以及 Claude Code 底层请求管线（Agentic Harness）的核心架构权衡 [^1]。

针对你提出的两个核心疑问，结合官方文档与逆向工程实测数据的核心结论如下：

第一，**关于上下文容量与“失忆”的关系**：在未触发压缩（Compaction）的单次长会话中，AI 支持的上下文窗口越大（如从 200K 扩展至 1M Token），发生“指令漂移（Instruction Drift）”和“注意力稀释失忆”的概率确实越高 [^4]。 在 Claude Code 中，“失忆”分为两种截然不同的物理机制。其一是长序列引发的**注意力腐化（Context Rot）与中间迷失（Lost in the Middle）**——窗口越大、自动压缩阈值越高，对话中部堆积的工具调用日志和代码读取内容就越多，模型对早期约束的遵循度就会随序列增长而发生全局衰减 [^4]。其二是触发 `/compact` 后的**有损摘要失忆（Lossy Summarization）**——正如你朋友所言，项目根目录的 `CLAUDE.md` 会在压缩后自动从磁盘重新读取并注入，但对话中途建立的临时工作状态、子目录嵌套的 `CLAUDE.md` 以及超长技能（Skills）正文会被截断或摘要化丢弃 [^6]。更关键的是，`CLAUDE.md` 之所以频繁让人感觉“失忆”，是因为 Claude Code 底层将其封装在第一条 `user` 消息的 `<system-reminder>` 标签内，并附带了一条告知模型“若与当前任务不高度相关则不应响应”的元指令（Meta-instruction） [^8]。

第二，**关于你与朋友的方案对比及业界主流选择**：你朋友采用的“独立文件夹 `CLAUDE.md` + 动态 Workflow”方案，契合了磁盘持久化与任务编排解耦的思路，但若将“角色身份（Persona）”塞入 `CLAUDE.md` 则属于职责错位，极易被系统提醒的相关性过滤逻辑降权 [^12]。而在你的两个方案中，**方案 2（追加 System Prompt，`--append-system-prompt`）在工程安全性与稳定性上远优于方案 1（替换 System Prompt，`--system-prompt`）** [^2]。指令层级研究与社区实测表明，`system` 提示词享有显著高于 `user` 消息的指令特权（社区开发者实测反馈其遵循度约为用户提示词的 3 倍） [^3]，但完全替换 System Prompt 会直接抹除 Claude Code 内置的 110 多个动态提示词模块（包含工具使用策略、安全边界、Git 状态快照以及解析 `<system-reminder>` 的元规则），导致智能体丧失核心工程能力 [^2]。目前，Claude Code 高阶社区与企业团队（如 EPAM 等）的主流标准是“三层上下文解耦架构”**：使用精简的根目录 `CLAUDE.md`（建议控制在 60 行以内，官方上限建议 200 行）存放全局仓库事实，使用**原生自定义子智能体（`.claude/agents/*.md`）**或**`--append-system-prompt-file`**定义角色专属 System Prompt，配合 **Git Worktrees** 实现物理目录隔离，并通过 **Dynamic Workflows（`ultracode`）** 与**确定性 Hooks 控制多智能体编排与质量门禁 [^8]。

## 一、 底层解剖：为什么朋友的 `CLAUDE.md` 方案会在第一条 User 消息中注入且容易被“选择性无视”？

要理解你朋友的方案（为不同伙伴建立专属文件夹、配置不同 `CLAUDE.md` 并开启 Workflow）与你的 System Prompt 方案之间的本质差异，首先需要拆解 Claude Code 向 Anthropic Messages API 发送请求时的真实 JSON 载荷结构 [^14]。

### 1. API 载荷结构与 Prompt Cache（提示词缓存）设计考量

许多开发者误以为 `CLAUDE.md` 是系统提示词的一部分，但通过对 Claude Code 流量的逆向追踪与官方文档确认：项目级和个人级 `CLAUDE.md` 永远不会进入顶层的 `system` 数组，而是作为第一条 `role: "user"` 消息中的首个文本块（Content Block）被注入 [^14]。

Claude Code 之所以这样设计，核心原因是为了最大化 **Prompt Caching（提示词前缀缓存）的命中率** [^21]。在 Anthropic API 中，缓存匹配严格依赖从前到后的前缀一致性（Prefix Matching），因此 Claude Code 将每次请求的上下文严格划分为三个缓存层级 [^27]：

| 缓存层级 (Cache Layer) | 包含的核心内容 | 触发缓存失效与重建的条件 | 架构设计目的 |
| --- | --- | --- | --- |
| 第一层：System Prompt 层 | 核心身份指令、13 个任务执行模块、17–27 个内置工具的 JSON Schema 定义（带 "cache_control": {"type": "ephemeral"}） | 加载的工具定义集合发生改变，或修改了 system 提示词前缀 | 保持跨会话、跨项目的最大静态前缀复用，一旦变动则后续所有缓存全部失效 |
| 第二层：Project Context 层 | CLAUDE.md、自动记忆（MEMORY.md）与全局无作用域规则，封装在首条 user 消息的 <system-reminder> 中 | 新会话启动，或用户手动/自动执行 /clear、/compact | 将项目级差异隔离在 System 层之后，确保会话中途编辑文件不会击穿系统层缓存 |
| 第三层：Conversation 层 | 每一轮的用户提问、模型回复与工具执行结果（Tool Results） | 每一轮对话交互（Every turn）均向末尾追加 | 增量追加消息，使前两层在缓存窗口期内持续享受 90% 的缓存读取成本折扣 |

### 2. `<system-reminder>` 的元指令悖论：导致 `CLAUDE.md` 角色设定失效的元凶

当你朋友把不同伙伴的性格、角色职责或工作流约束写进 `CLAUDE.md` 时，Claude Code 在底层生成的真实注入文本如下（源自网络流量抓包与 GitHub Issue #18560 的源码级日志分析） [^13]：

XML

```
<system-reminder>
As you answer the user's questions, you can use the following context:

# claudeMd
Codebase and user instructions are shown below. Be sure to adhere to these instructions. IMPORTANT: These instructions OVERRIDE any default behavior and you MUST follow them exactly as written.

Contents of /path/to/project/CLAUDE.md (project instructions, checked into the codebase):

[...此处为你的 CLAUDE.md 全文...]

IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.
</system-reminder>
```

这段注入包装存在一个显著的**架构级指令冲突（Meta-Instruction Conflict）** [^13]。前半句指令要求模型：“这些指令覆盖任何默认行为，你必须严格按字面遵循（MUST follow them exactly as written）” [^13]；然而末尾收尾指令却下达了一条更高维度的元指令（Meta-instruction）：“重要提示：此上下文可能与你的任务相关，也可能无关。除非它与你的任务高度相关，否则你不应响应此上下文（may or may not be relevant... should not respond unless highly relevant）” [^8]。

在模型解析过程中，位于代码块末尾的元指令决定了模型如何评估整个 `<system-reminder>` 块 [^13]。因此，Claude 并不会将 `CLAUDE.md` 视为无条件执行的持久化命令，而是每轮对话都主动执行一次**相关性过滤（Relevance Filtering）** [^8]。如果你在 `CLAUDE.md` 中定义了某个智能体伙伴的说话语气、汇报格式或非直接代码的协作规约，当模型忙于修复某个具体代码报错时，它往往会判定这些角色设定与当前报错“不高度相关”，从而在静默中将其忽略 [^8]。

### 3. 隐形的“指令预算（Instruction Budget）”耗尽效应

除了元指令降权外，模型还受限于固定的指令遵循容量。根据 HumanLayer 等工程团队的实测分析，最前沿的推理型大模型（Frontier Thinking LLMs）能够稳定遵循的独立指令上限约为 **150 至 200 条**（非推理模型或小参数模型显著更少） [^8]。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

如根据逆向工程测算的载荷结构所示，在用户尚未输入任何指令时，Claude Code 组装的初始 API 请求载荷就已经达到约 **27,169 Token（空目录）至 30,919 Token（配置了 `CLAUDE.md`、Memory 与 Skills 的项目）** [^21]。其中，仅内置系统提示词本身就包含了 **约 50 条独立指令**，直接占用了模型近三分之一可靠的指令预算 [^8]。当你朋友在文件夹的 `CLAUDE.md` 中再写入 60 条以上的角色规范、代码风格和工作流步骤时，总指令数就会逼近甚至突破 150–200 条的阈值 [^8]。实测表明，一旦超出该预算，大模型的指令遵循质量并非只丢弃最新加入的规则，而是**在所有指令上发生全局均匀衰减（Uniform Decay）**（小模型呈指数级衰减，前沿推理模型呈线性衰减），表现为模型在会话中途“看似随机”地违背早先严格遵守的规约 [^8]。

## 二、 上下文窗口越大，“失忆”的可能性就越大吗？——长上下文腐化与压缩重读的深层博弈

你提出了一个切中要害的工程直觉判断：“如果 AI 支持的上下文越大，是不是意味着失忆的可能性越大？”

在 Claude Code 当前支持的模型矩阵中（包括标准 200K 上下文窗口，以及支持扩展 **1M Token 上下文窗口 `[1m]`** 的 Opus 4.6、Sonnet 4.6、Sonnet 5、Haiku 5.5 与 Fable 系列模型） [^6]，这个问题的答案是：大上下文窗口减少了“因频繁触发压缩摘要而导致的硬截断失忆”，但却显著加剧了“长程对话中的注意力稀释与中间迷失（软失忆）” [^4]。

要彻底理清这一现象，必须区分 Claude Code 运行过程中的两套失忆机制。

### 1. 机制 A：未触发压缩时的“注意力稀释失忆”（窗口越大，风险越高）

很多开发者认为，既然模型支持 100 万 Token（1M Context），把自动压缩阈值（`/autocompact`）调高到 500K 甚至跑满 1M，就能让智能体“永远不失忆” [^6]。然而，Anthropic 团队在《AI 智能体高效上下文工程（Effective Context Engineering for AI Agents）》及多项基准测试中明确指出了 **Context Rot（上下文腐化）** 与 **Attention Budget（有限注意力预算）** 的物理限制 [^4]。

首先是 **n² 注意力稀释效应**。Transformer 架构要求上下文中的每一个 Token 与所有其他 Token 计算成对相关性（n 个 Token 产生 n² 数量级的成对关联） [^4]。当上下文从 3 万 Token 膨胀到 50 万 Token 时，模型的有效注意力权重被大幅摊薄 [^4]。此外，长上下文依赖的位置编码插值（Position Encoding Interpolation）在超长跨度下会出现位置感知精度下降，且预训练语料中超长序列占比远少于短序列，导致模型在长程依赖推理上的精度随长度增加而呈梯度下滑 [^4]。

其次是 **“中间迷失（Lost in the Middle）”与 U 型注意力曲线**。斯坦福与伯克利（Liu et al., 2023）的经典研究及 Chroma 对 18 个主流大模型的评测显示，大模型对上下文窗口中不同位置信息的召回率并非均匀分布，而是呈现显著的 **U 型曲线（首尾高、中间塌陷）** [^5]。位于序列最前端（Primacy，如 `system` 提示词和首条消息中的根目录 `CLAUDE.md`）和最末端（Recency，如最新的用户指令和刚注入的 `<system-reminder>`）的信息享有最高注意力；而位于上下文中间三分之一区域（Middle Zone）的信息，在多文档问答基准中准确率会下跌 15–25 个百分点（例如从首部的 70% 以上跌至中部的 50% 以下，在部分深度中间检索场景下召回率甚至降至约 20%） [^8]。

最后是 **相似内容干扰（Distractor Sensitivity）与多轮对抗漂移**。在 1M 大窗口下，智能体连续执行几十次 `Grep`、`Read` 和 `Bash` 测试，数十万 Token 的代码片段、报错日志和废弃方案堆积在窗口中部 [^5]。这不仅制造了庞大的中部盲区，还会引发“相似内容干扰”——模型容易将中间读取过的旧代码模式与你规定的新规范混淆 [^5]。同时，Anthropic 官方指南针对 Haiku 5.5 等模型特别提示：在长对话或用户持续追问、反驳（Pushback）时，模型容易出现逐步放弃遵守初始 System Prompt 的“指令漂移（Instruction Drift）”现象 [^7]。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

正是为了对抗长对话中的“注意力稀释失忆”，Claude Code 在内部设计了一套补偿机制：**高频注入 `<system-reminder>` 标签** [^28]。在经过十几次工具调用和长篇代码输出后，Claude Code 不仅在用户消息层，还会在工具执行层（Tool Execution Level）**和**工具返回结果层（Tool Result Level）动态插入约 40 种不同类型的 `<system-reminder>`（例如提醒当前处于 Plan Mode、提示文件在磁盘被修改、建议调用 `TodoWrite` 追踪复杂任务进度等），人为将关键约束推向注意力曲线最右侧的“尾部高召回区（Recency）” [^20]。

### 2. 机制 B：触发 `/compact` 压缩后的“摘要截断失忆”与 `CLAUDE.md` 重读真相

你朋友提到“Claude Code 如果触发压缩了会自动重新读取 `CLAUDE.md`”，这一观察**对于项目根目录的 `CLAUDE.md` 完全正确，但对于整个会话上下文而言只说对了一半** [^6]。

当上下文逼近窗口上限（或会话空闲即将超出缓存有效期触发 Idle Compaction，以及用户手动执行 `/compact`）时，Claude Code 并不会用外部脚本简单截断历史，而是由内部的 **Compact Service（压缩服务）** 发起一次特殊的自我摘要请求 [^6]。通过对 Claude Code 内部 `src/services/compact/prompt.ts` 的逆向分析，压缩过程遵循极为严格的协议 [^36]：

首先，系统注入 `NO_TOOLS_PREAMBLE` 指令，**严禁在压缩期间调用任何工具**。由于压缩请求通过共享缓存的分支（Cache-sharing fork）发起，继承了父会话的全部工具集，提示词在开头和结尾以全大写警告：`CRITICAL: Respond with TEXT ONLY. Do NOT call any tools... Tool calls will be REJECTED and will waste your only turn` [^36]。

其次，系统执行 **`BASE_COMPACT_PROMPT` 两阶段生成与 9 大强制摘要模块**。模型必须先在 `<analysis>` 标签中按时间顺序复盘所有消息（该标签随后被 `formatCompactSummary()` 函数剥离，不进入后续上下文），然后输出包含 **9 个固定小节**的 `<summary>` 块：(1) Primary Request and Intent（主要请求与意图）；(2) Key Technical Concepts（核心技术概念）；(3) Files and Code Sections（检查或修改过的文件与代码片段）；(4) Errors and Fixes（遇到的报错与修复过程）；(5) Problem Solving（已解决与排查中的问题）；(6) All User Messages（所有非工具结果的用户消息，要求**原样保留所有安全相关的指令与约束**）；(7) Pending Tasks（待办任务）；(8) Current Work（压缩前一刻正在进行的工作细节）；(9) Optional Next Step（下一步计划） [^36]。

然而，这段约 1,200 Token 的压缩提示词生成的摘要本质上仍是**有损压缩（Lossy Compression）** [^11]。压缩完成后，Claude Code 会重置上下文窗口，并对不同组件执行严格的**差异化重注入策略** [^6]：

| 上下文组件类型 | /compact 压缩后的状态 | 底层重注入规则与“失忆”风险边界 |
| --- | --- | --- |
| System Prompt 与 Output Style | 完整保留 (Preserved) | 架构上独立于对话历史，压缩后无缝继续生效（若会话恢复时传入了新的 --append-system-prompt，会在首次压缩时切换生效）。 |
| 项目根目录 ./CLAUDE.md 与全局 ~/.claude/CLAUDE.md | 从磁盘重新加载 (Reloaded) | 直接从文件系统重新读取最新版本并注入，不仅不会因压缩丢失，反而能使中途编辑的 CLAUDE.md 正式生效。 |
| 自动记忆 MEMORY.md 与无作用域规则 | 从磁盘重新加载 (Reloaded) | 自动重新注入 ~/.claude/projects/<project>/memory/MEMORY.md 的前 200 行或 25 KB。 |
| Git 状态快照与 Plan Mode 计划文件 | 重新加载 (Reloaded) | 若会话启动时带有 Git 快照，压缩后重新读取最新仓库状态；磁盘上的 Plan 文件也会重新注入。 |
| 子目录嵌套 CLAUDE.md（如 src/api/CLAUDE.md） | 被摘要抹除，仅按需重读 (Reloaded On Demand) | 高危失忆点！ 子目录 CLAUDE.md 和带 paths: 的路径规则在压缩时会被当成普通对话历史摘要掉，不会主动重新加载，直到模型在压缩后再次读取该子目录下的文件时才会触发重读。 |
| 已触发加载的技能正文（Invoked Skill Bodies） | 受限部分重注入 (Capped) | 高危失忆点！ 仅重新构建技能描述列表（需 v2.1.304+），已调用的技能正文重注入上限为单技能 5,000 Token、总计 25,000 Token；超出预算时按调用时间从最旧的技能开始直接丢弃。 |
| 最近读取或修改的代码文件 | 受限部分重读 (Max 5) | 仅自动重读最近修改的最多 5 个文件；若单个文件超过 5,000 Token，则不加载正文，仅注入一条 system-reminder-compact-file-reference 路径占位提示，需模型自行调用 Read 工具重读。 |
| Hooks 历史注入内容与口头临时指令 | 被压缩进摘要 (Summarized) | 历史 PostToolUse 等 Hook 添加的上下文及用户在对话中口头交代的规则会被概括压缩，极易丢失细节（但匹配 compact 来源的 SessionStart Hook 会重新执行）。 |

从上表可以得出对你朋友方案的关键推论：如果你朋友在终端里**先 `cd` 进入某个伙伴的专属文件夹**，再启动独立的 `claude` 进程，那么该文件夹下的 `CLAUDE.md` 就是该会话的**根目录 `CLAUDE.md`**，触发压缩后确实会 100% 自动从磁盘重新读取 [^6]。但如果是在**同一个主目录启动 Claude Code**，把不同伙伴的设定放在子文件夹（如 `./agents/frontend/CLAUDE.md`、`./agents/backend/CLAUDE.md`）中让主智能体跨目录读取，这些文件就属于**嵌套 `CLAUDE.md`（Nested `CLAUDE.md`）** [^6]。它们不仅受单文件字符上限约束（200K 窗口限 40,000 字符；Opus 4.6 / Sonnet 4.6 的 1M 窗口限 200,000 字符，后续新版模型 1M 窗口限 150,000 字符，超限直接截断） [^10]，而且一旦触发压缩就会被摘要洗掉，除非智能体在压缩后再次读取该子目录下的文件 [^6]。此外，针对压缩导致的细节丢失，Claude Code 支持在 `CLAUDE.md` 中专门添加 **`Compact Instructions`（压缩指令）** 章节，或者在手动执行 `/compact focus on ...` 时传入保留指令；Compact Service 底层会读取该章节并在生成摘要时遵循你的定制保留规则 [^6]。

## 三、 方案正面对决：替换 System Prompt vs. 追加 System Prompt vs. 朋友的 `CLAUDE.md` 方案

你在实践中采用了**方案 1（替换 System Prompt）**和**方案 2（追加 System Prompt）**。为了直观对比你的两种方案与朋友方案（以及官方其他扩展机制）的优劣，下表梳理了它们在 Claude Code 底层的核心参数差异：

| 对比维度 | 朋友方案：独立文件夹 CLAUDE.md | 你的方案 1：替换 System Prompt (--system-prompt / -file) | 你的方案 2：追加 System Prompt (--append-system-prompt / -file) | 官方原生方案 A：自定义 Output Styles (/output-style) | 官方原生方案 B：自定义 Subagents (.claude/agents/*.md) |
| --- | --- | --- | --- | --- | --- |
| API 注入位置 | 第一条 user 消息的 <system-reminder> 块内 | 顶层 system 数组（完全覆盖默认预设） | 顶层 system 数组（插入在默认指令之后、# Tools 之前） | 作为系统级消息/提醒随每轮请求发送 | 独立子会话的顶层 system 提示词（不继承主会话 System Prompt） |
| 指令遵循权重 | 中低（受 user 角色层级及“不相关可忽略”元指令削弱） | 极高（享有最高 system 权限，且无内置规则干扰） | 高（享有最高 system 权限，社区实测遵循度约为 User 提示词的 3 倍） | 中高（专门控制角色、语气与回复格式） | 极高（专职短平快任务，上下文干净无历史噪音） |
| 内置工具使用策略与安全边界 | 完整保留 | 全部丢失！（需自行编写工具引导与安全规则） | 完整保留 | 默认保留工具，但自定义样式默认省略内置软件工程指令（除非设 keep-coding-instructions: true） | 可通过 tools / disallowedTools 精确裁剪工具权限 |
| Git 状态快照 | 自动注入 | 被移除！（替换默认提示词会导致启动时无 Git 快照） | 自动注入 | 自动注入 | 默认注入（内置 Explore/Plan 除外，也可配置关闭） |
| <system-reminder> 解析兼容性 | 原生兼容 | 断裂！（必须手动补充说明系统提醒来源的声明） | 原生兼容 | 原生兼容 | 原生兼容（可设 omitClaudeMd: true 屏蔽 CLAUDE.md） |
| Prompt Cache（缓存）影响 | 位于第 2 层，所有会话共享第 1 层 System 缓存 | 改变第 1 层前缀，若含动态变量会导致每轮缓存失效（需配合动态边界符） | 改变第 1 层前缀（注：不同机器若 Auto Memory 路径不同，默认无法跨机共享缓存） | 切换样式时作为会话消息投递，保留此前缀缓存（v2.1.251+） | 拥有独立 5 分钟缓存周期，且完全不污染父会话缓存前缀 |
| /compact 压缩后表现 | 根目录文件自动从磁盘重读；子目录文件被摘要抹除 | 完整保留在 system 层 | 完整保留在 system 层（中途修改参数需等压缩后生效） | 完整保留 | 子智能体通常在单次任务内完成，或通过 autoCompactWindow 独立控制 |

### 1. 深度剖析你的方案 1：替换 System Prompt (`--system-prompt` / `--system-prompt-file`)

在大模型指令层级框架（Instruction Hierarchy，Wallace et al., 2024）中，特权等级严格遵循 `system > user > tool` [^3]。将角色设定直接放入 `system` 字段，确实能摆脱 `CLAUDE.md` 在 `user` 消息层被过滤的局限 [^18]。在 Reddit 等社区中，也有部分开发者（如通过 `Piebald-AI/claude-code-system-prompts` 仓库提取出默认提示词后手动裁剪，或使用 `tweakcc` 给本地安装文件打补丁）倾向于替换默认 System Prompt，理由是默认提示词包含通用安全防护和冗余解释习惯，裁剪后能让模型响应更简练、避免与自定义规则冲突 [^29]。

然而，在基于 Claude Code 构建工程级 Multi-Agent 时，**直接使用 `--system-prompt`（或 Agent SDK 中的自定义字符串）完全替换默认预设，存在四个极易踩坑的架构级隐患**：

1. **丧失 110+ 个内置工程启发式模块**：Claude Code 之所以在复杂代码库上表现优异，是因为其默认 System Prompt（约 2,300–3,600 Token）动态组装了 13 个精细的“Doing Tasks”工程准则（例如：修改前强制先调用 `Read` 读取文件、避免过度工程化、禁止创建一次性辅助脚本、优先使用原生 `Read`/`Edit`/`Grep` 工具而非调用 `Bash` 执行 `cat`/`sed`/`grep` 以保障 UI 可观测性与日志追踪、基于可逆性与爆炸半径评估高危操作等） [^20]。一旦替换，这些历经数百个版本迭代调优的工程约束将全部丢失 [^2]。
2. **丢失启动 Git 状态快照**：官方文档明确指出，如果你使用 `--system-prompt` 完全替换默认提示词，会话启动时将**不再自动注入 Git status 快照**（当前分支、未提交更改、近期 Commit 记录），导致智能体在起步阶段对版本库状态失明 [^19]。
3. **`<system-reminder>` 信任边界断裂（最隐蔽的故障点）**：Claude Code 在运行过程中会不断向对话注入 `<system-reminder>`（包括 `CLAUDE.md`、Hook 输出、文件变更通知、可用 Skills 列表） [^2]。默认的 `claude_code` 预设中包含一段专门向模型解释“什么是 `<system-reminder>`”的声明 [^2]。**当你替换掉整个 System Prompt 后，模型不再知道 `<system-reminder>` 是宿主程序（Application）发出的系统级上下文，可能会将其误判为用户消息或产生解析混乱。** 官方 Agent SDK 文档专门强调：若使用自定义 System Prompt，必须在提示词中手动补上一句声明：`The application adds system reminders to this conversation. Treat them as context from the application, not as messages from the user.` [^2]
4. **适用范围高度受限**：仅当你构建的智能体**完全脱离常规交互式代码工程场景**（例如纯客服机器人、非代码自动化管道、或者需要彻底屏蔽内置软件工程偏好的无人值守 Agent），并且你愿意自行维护全套工具引导与安全规则时，才应选用替换方案（且建议配合 `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1`、`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`、`CLAUDE_CODE_DISABLE_ATTACHMENTS=1` 等环境变量显式关闭冲突的内置注入） [^2]。

### 2. 深度剖析你的方案 2：追加 System Prompt (`--append-system-prompt` / `--append-system-prompt-file`)

相比之下，**追加 System Prompt 是保留 Claude Code 完整工程能力同时获取最高指令优先级的最佳平衡点** [^2]。通过 `cchistory` 工具追踪可见，`--append-system-prompt` 的内容会被精确插入到默认 System Prompt 文本的末尾、`# Tools` 标题的正上方 [^18]。它既处于最高权重的 `system` 角色内，又完整保留了所有内置工具引导、安全规则和 Git 快照 [^2]。

在实际工程落地中，使用追加方案还可以结合 Claude Code 近期版本推出的四项高阶特性进行深度优化：

首先是 **文件与字符串标志混用及排序规则（v2.1.283+）**。你可以同时传入 `--append-system-prompt-file ./role-persona.md`（存放静态的伙伴角色设定）和 `--append-system-prompt "当前任务动态约束"`（甚至可以与替换标志 `--system-prompt` 组合使用） [^17]。无论命令行参数书写顺序如何，系统永远**先追加文件内容，空一行后再追加字符串参数内容** [^17]。

其次是 **动态缓存分割符（`__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`，v2.1.275+）**。如果你在自定义或追加的 System Prompt 中混合了“跨会话不变的静态角色规则”和“每次运行变化的动态上下文（如当前时间戳、单次任务 ID）”，直接拼接会导致每次请求的 System Prompt 前缀改变，从而使整条会话的 Prompt Cache 完全失效 [^17]。只需在静态规则与动态内容之间插入一行独立的 `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`，Claude Code 就会自动在此处切分 `system` 数组块并移除该标记行——上方的静态部分保持缓存命中，下方的动态部分按次更新 [^17]。

再次是 **模型代际敏感度调优**。Anthropic 官方指南指出，**Claude Opus 4.5 与 Opus 4.6 对 System Prompt 的响应敏感度显著高于早期模型** [^35]。如果你在追加的 System Prompt 中沿用过去针对旧模型的强硬措辞（如密集使用 `CRITICAL: You MUST ALWAYS...`），在 Opus 4.5/4.6 上容易引发“过度触发（Overtriggering）”，建议将语气软化为清晰、直接的启发式指令 [^4]。

最后要注意 **会话恢复（Resume）时的快照延迟机制**。默认情况下，为了保护缓存前缀，Claude Code 会在会话第一次请求时将 System Prompt 记录为快照（Snapshot） [^2]。如果你用 `claude --resume` 恢复旧会话并传入了修改后的 `--append-system-prompt`，**新提示词在下一轮并不会立即生效，直到该会话触发 `/compact` 压缩后才会切换** [^2]。若在调试角色提示词时需要每次修改立即在恢复会话中生效，可以在 CLI 使用 `--system-prompt-snapshot` 相关配置或在 Agent SDK 中设置 `snapshot: false`（需 TypeScript SDK v0.3.257+ 或 Python SDK v0.2.153+），强制每次请求重建系统提示词 [^2]。

## 四、 大家都在用什么方案？——基于 Claude Code 的多智能体（Multi-Agent）主流架构图谱

回到你最关心的实操问题：“在基于 Claude Code 的情况下，大家都在用什么方案来实现多智能体协作？”

随着 Claude Code 的持续演进（至 2026 年底已迭代至 v2.1.322+） [^29]，早期单纯靠“手工建多个文件夹改 `CLAUDE.md`”或“手工写 Shell 别名拼接 `--system-prompt`”的做法，已经逐步演进为**官方原生五维并行体系**与**社区三层架构范式** [^16]。

### 1. 官方原生多智能体方案矩阵：五种并行范式如何选型？

Claude Code 官方目前已内置了五种原生多任务/多智能体机制，各自对应不同的“计划持有者（Who holds the plan）”与上下文隔离粒度 [^24]：

| 原生多智能体机制 | 核心定义与上下文隔离方式 | 谁负责编排与决策？ | 适用场景与 Token 成本特征 |
| --- | --- | --- | --- |
| 1. Custom Subagents（自定义子智能体） .claude/agents/*.md 或 --agents | 在单次主会话内部派生的专职 Worker，运行在完全独立的上下文窗口，不继承主对话历史，仅向主会话返回最终摘要。 | 主会话中的 Claude 逐轮判断并调用 Agent 工具派发。 | 适合代码探索、独立模块实现、独立 Code Review（防止污染主窗口）。Token 成本较低，支持路由给 Haiku/Sonnet。 |
| 2. Dynamic Workflows（动态工作流与 ultracode） .claude/workflows/ 或 /workflows | Claude 为任务编写一段 JavaScript 编排脚本（调用 agent(), pipeline(), parallel(), phase()），由后台独立运行时执行，可同时调度数十至上百个子智能体。 | JS 脚本持有执行计划！ 循环、分支与中间结果保存在脚本变量中，彻底不占大模型上下文窗口。 | 你朋友开启的正是此机制！ 适合跨全库的 Bug 审计、数百个文件的批量迁移、多视角交叉验证研究（如内置 /deep-research）。 |
| 3. Agent Teams（智能体团队） CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 | 由一个 Team Lead 会话统筹多个独立的 Teammate 实例。拥有共享任务列表（TaskCreate/TaskUpdate，带文件锁防竞争）和点对点邮箱（~/.claude/teams/{team}/inboxes/{agent}.json）。 | Team Lead 分配任务，Teammate 之间通过 SendMessage 自主横向协商与挑战彼此结论。 | 适合需要多角色反复讨论、竞争性假设排查（Competing Hypotheses）或前后端+测试跨层协同的复杂特性。Token 消耗最高（每个伙伴都是完整实例）。 |
| 4. Agent View 与 Background Agents claude agents / /tasks | 在统一面板中派发和监控多个后台独立运行的会话，仅在需要人工审批或输入时介入；派发编辑任务时自动迁入独立 Git Worktree。 | 人类开发者手工派发多个互不依赖的任务卡并异步巡检。 | 适合手头有多张独立的需求卡/Bug 卡并行推进。 |
| 5. Cross-Session Messaging（跨会话通信） /list-agents + SendMessage | 允许你手工打开的多个本地终端会话（甚至跨机器/云端会话）通过本地 Inbox Socket 互相发现并直接传递消息或空闲通知。 | 各会话中的 Claude 按需自动发现（ListAgents）并通报破坏性变更或接口状态。 | 适合你自己开多个终端分别负责不同服务，中途需要同步接口变更而不想手工复制粘贴。 |

#### 为什么官方 `Custom Subagents (.claude/agents/*.md)` 融合了你和朋友的思路？

如果你查看 `.claude/agents/` 下的子智能体定义文件（例如 `.claude/agents/reviewer.md`），会发现它的设计正是“文件化管理的专属 System Prompt” [^22]。文件顶部的 YAML Frontmatter 定义 `name`、`description`、允许使用的 `tools`（如只读权限 `Read, Grep, Glob`）、指定 `model`（如 `sonnet` 或 `haiku`）、权限模式 `permissionMode` 以及最大轮数 `maxTurns`；而 **Frontmatter 下方的所有 Markdown 正文，会直接作为该子智能体的顶层 System Prompt 发送（完全不继承主会话的默认 System Prompt）** [^22]。

此外，子智能体还支持**一键剥离无关的 `CLAUDE.md`（`omitClaudeMd: true`）**。默认情况下，子智能体会加载项目的 `CLAUDE.md` 层级；但如果你的某个子智能体（如纯算法分析或格式校验员）不需要项目全局上下文，只需在 Frontmatter 中设置 `omitClaudeMd: true`，它启动时就会完全跳过用户级、项目级和本地 `CLAUDE.md`，从而节省宝贵的注意力预算 [^22]。同时，定义好的 `.claude/agents/*.md` 不仅能作为单会话内的 Subagent 调用，当开启 Agent Teams 时，你还可以直接指定该 Subagent 名称来生成独立 Teammate，自动复用其工具限制、模型配置与角色 System Prompt [^22]。

#### 你朋友开启的“Claude Code Workflow”到底是什么？

你提到朋友开启了 Claude Code 的 workflow，这对应着 Claude Code 推出的 **Dynamic Workflows（动态工作流，触发关键词及高强度自动编排模式名为 `ultracode`）** [^24]。

在传统的 Subagents 或 Agent Teams 模式中，主智能体（Lead Agent）必须“逐轮（Turn-by-turn）”根据上一个智能体的返回结果决定下一步派发谁，这导致所有中间协调过程都会持续堆积在主智能体的上下文窗口里 [^24]。而开启 Dynamic Workflow（通过在交互式提示词中输入 `ultracode`、直接请求创建 workflow，或通过 `/effort ultracode` 开启全局自动工作流编排）后，Claude 会先针对任务写出一份确定性的 **JavaScript 编排脚本**（保存在 `~/.claude/projects/` 下，也可按 `s` 键保存至 `.claude/workflows/` 复用为斜杠命令），通过 `phase()`、`parallel()`、`pipeline()` 和 `agent()` 原语在后台独立运行时中并发拉起成批的子智能体 [^24]。因为循环控制、条件分支和中间产物全部保存在 JS 脚本的变量中，主会话的上下文窗口始终保持干净，从根源上规避了多轮协调过程中的长上下文失忆问题 [^24]。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

### 2. 社区与企业级实战架构：大家是如何在生产环境落地的？

除了直接调用官方原语外，大型研发团队与资深社区在实践中总结出了三套极具代表性的成熟架构模式。

#### 模式一：三层上下文解耦架构（The Three-Layer Context Architecture）

针对“到底什么该放 `CLAUDE.md`，什么该放角色提示词”的争论，以 BetterClaw 与 Linux 基金会 `AGENTS.md` 规范为代表的社区最佳实践确立了严格的**三层物理隔离法则** [^16]。

第一层是 **Root Invariants（根目录全局不变量，`./CLAUDE.md` 或 `./AGENTS.md`）**，专门回答 *“在这个代码库里，什么对所有智能体永远成立？”* [^16]。其篇幅应严格控制在 **60 行以内**（官方建议上限不超过 200 行） [^8]，仅包含构建、测试、单测执行命令，极易误导模型的遗留废弃目录警告，以及禁止提交密钥等通用红线 [^16]。**切忌在根目录 `CLAUDE.md` 中塞入代码格式化规则（Linter 的工作应交给确定性 Hook）或单一角色的职责描述** [^8]。BetterClaw 引用的苏黎世联邦理工学院（ETH Zurich，2026 年 2 月）实证研究显示，挂载上下文文件会使单任务的推理成本和执行步数增加 **20% 以上**，而自动生成的上下文文件甚至会略微降低任务成功率 [^8]。

第二层是 **Scope Files（目录级作用域文件，如 `packages/api/CLAUDE.md`）**，专门回答 *“在这个特定子文件夹里，有什么局部规约？”*（例如 API 目录的数据库迁移规范、Web 目录的组件无障碍要求） [^16]。其核心铁律是：**Scope 文件只描述地点（目录），绝不描述角色（Role）** [^16]。它们平时不占用主窗口 Token，仅当智能体读写该目录下的文件时才按需加载 [^6]。

第三层是 **Role Files（角色专属系统提示词，`.claude/agents/*.md` 或 `--append-system-prompt-file`）**，专门回答 *“你是谁，你的工具边界与交付契约是什么？”* [^16]。每一个角色的提示词文件应明确包含**四大强制交接契约（Handoff Contract）**：一是**完成定义（Definition of Done）**；二是**结构化返回格式（Return Format）**，要求返回固定 Markdown 标题块、JSON 或落盘文件路径，避免返回散文式长篇叙述；三是**边界约束（Boundary Constraints）**，例如 Coder 不得修改测试文件，Reviewer 不得直接改代码；四是**升级熔断触发器（Escalation Triggers）**，例如连续测试失败超 10 次或耗时超 5 分钟立即停止并上报 [^16]。

#### 模式二：EPAM "Octobots" 生产级多角色独立目录架构（对你朋友方案的工业级升维）

你朋友采用的“为不同伙伴建立不同文件夹配置 `CLAUDE.md`”的做法，在企业级实践中有一个代表性案例——**EPAM 工程团队于 2026 年 4 月公开的 "Octobots" 多智能体研发团队架构** [^23]。EPAM 通过三项关键工程设计解决了普通多文件夹方案中的上下文污染与通信难题：

首先是 **6 个专职角色与三文件目录结构**。EPAM 在 `tmux` 分屏中并行运行 6 个独立的 Claude Code 进程：产品经理（`PM`）、业务分析师（`BA`）、技术负责人（`TL`）、Python 后端（`Py`）、前端（`JS`）和测试（`QA`） [^23]。每个角色拥有独立的配置目录（如 `roles/python-dev/`），内部拆分为三个组件：`SOUL.md` 专门定义伙伴的性格、说话风格与工程直觉（例如 `Py` 冷静严谨、写完代码本能运行 `py_compile`；`QA` 要求所有结论附带截图证据）；`CLAUDE.md` 专门定义该角色的技术工作流、命令规范与操作约束；`.claude/skills/` 与 `.claude/agents/` 则通过软链接（Symlink）共享团队级技能与子智能体 [^23]。

其次是 **独立 Worker 仓库克隆与 SQLite 任务队列（Taskbox）**。为了防止多个智能体同时改代码发生冲突，每个 Worker 在 `octobots/workers/{role}/` 下拥有独立的 Git 仓库克隆和独立分支（以及独立的 Playwright 浏览器实例） [^23]。智能体之间不靠主会话传话，而是通过一个开启了 WAL（Write-Ahead Logging）并发模式的轻量级 SQLite 数据库脚本（`relay.py send --from py --to qa`）异步收发任务消息 [^23]。

最后是 **按 Issue 绑定命名会话（Named Sessions）以规避长上下文失忆**。为了防止某个开发伙伴在连续处理多个需求后上下文撑爆或触发有损压缩失忆，Supervisor 监控脚本将**每一个 GitHub Issue 映射为一个独立的 Claude Code 命名会话（如 Issue `#103` 对应会话 `"py-issue-103"`）** [^23]。当 `QA` 测出 Bug 打回给 `Py` 时，系统执行 `/resume py-issue-103` 精确恢复该需求专属的短上下文，既保留了完整的单任务背景，又避免了跨任务历史堆积引发的上下文腐化 [^23]。

#### 模式三：Git Worktrees 隔离 + 磁盘文件交接 + 确定性 Hooks 质量门禁

在独立开发者与高吞吐量工程团队中，另一套主流方案是“Git Worktrees + 磁盘计划交接 + Fail-Fast Hooks 金字塔” [^42]。

在目录隔离方面，开发者不再手工维护多个项目文件夹副本，而是使用 **Git Worktrees**。只需在启动时加 `--worktree <name>`（如 `claude --worktree feature-auth`），或在 `.claude/agents/worker.md` 的 Frontmatter 中声明 `isolation: worktree`，Claude Code 就会在 `.claude/worktrees/` 下基于独立分支自动创建轻量级工作树检出，并通过四重安全校验强制阻止该智能体修改主检出目录（Main Checkout）的文件 [^44]。

在跨智能体通信方面，主流做法是**通过磁盘文件（`plans/*.md`）而非对话摘要进行冷交接（Cold Handoff）**。工程实测表明，多智能体串联时存在复合可靠性衰减（例如单智能体成功率 95% 时，5 个智能体串联后的端到端成功率会降至约 77%） [^44]。如果让 Planner 智能体把计划返回给主会话，再由主会话转述给 Implementer 智能体，主会话的转述概括极易丢失关键细节 [^42]。让 Planner 将完整设计写入磁盘文件 `plans/<feature>.md`，主会话仅向 Implementer 和 Reviewer 传递文件路径，即可实现零信息损耗的交接 [^42]。

在规则强制执行方面，主流团队**将硬性约束从提示词移入确定性 Hooks**。提示词（无论是 System Prompt 还是 `CLAUDE.md`）本质上都是**非确定性的（Non-deterministic）**——模型在长上下文中始终存在忽略指令的概率 [^30]。因此，应当将所有“不容妥协”的工程红线配置为 `settings.json` 中的 **Claude Code Hooks**：利用 `PreToolUse` 在执行 `Edit|Write` 前运行密钥扫描脚本（`detect-secrets.sh`）；利用 `PostToolUse` 在每次代码修改后自动运行 `prettier` 或 `biome` 格式化，完全不消耗模型指令预算；利用 `TaskCompleted` 或 `Stop` 在智能体宣布任务完成前自动执行类型检查、单元测试与 Diff 体积守卫脚本——若脚本返回退出码 `2`（Exit Code 2），Claude Code 会直接阻断完成状态并将报错信息通过 `stderr` 喂回给智能体，强制其闭环修复 [^8]。

## 五、 架构落地的综合建议：如何重构你的 Multi-Agent 方案？

结合你现有的技术路线（已掌握 `--system-prompt` 与 `--append-system-prompt`）以及你朋友正在探索的方向（多文件夹 `CLAUDE.md` + Workflow），可以按以下四个步骤整合升级你的多智能体架构：

1. **停用全量替换（`--system-prompt`），全面转向“原生 `.claude/agents/*.md` + `--append-system-prompt-file`”**：如果你的多智能体是由一个主会话统筹调度（或者通过 Dynamic Workflows 脚本并发调度），建议直接将每个伙伴的角色定义写成 `.claude/agents/<partner-name>.md`，在 Frontmatter 中锁死该角色所需的最小工具集（`tools`）和隔离模式（`isolation: worktree`），并将角色人设与交接契约写在 Markdown 正文中作为其独立 System Prompt [^16]。如果你是通过外部脚本或 `tmux` 启动多个平级的顶层 Claude Code 独立进程，则应使用 `claude --append-system-prompt-file ./roles/<partner>.md` 注入角色身份与输出契约，既能获得 `system` 级指令遵循权重，又能完整保留内置工具策略、安全检查、Git 快照与 `<system-reminder>` 机制；若包含动态运行参数，务必插入 `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 保护前缀缓存 [^2]。
2. **对 `CLAUDE.md` 实施“60 行瘦身”与压缩保护**：清理 `CLAUDE.md` 中的角色人设、说话语气和代码缩进风格规则，仅保留构建/测试验证命令与仓库级架构红线，将总行数控制在 60–200 行以内，把有限的 100–150 个指令预算槽位留给核心业务逻辑 [^8]。同时在根目录 `CLAUDE.md` 中显式增加 `## Compact Instructions` 段落，写明触发 `/compact` 时必须原样保留的架构状态与关键约束 [^36]。
3. **按任务生命周期管理上下文，拒绝“单会话跑到底”**：不要过度依赖 1M 超长上下文窗口，因为在长窗口下中部的注意力塌陷（Lost in the Middle）比压缩本身更容易引发隐性失误 [^4]。借鉴“一个 Issue / 一张任务卡对应一个独立命名会话（Named Session）”的策略，任务完成后立即 `/clear` 或开启新会话；跨智能体的复杂方案传递一律落盘为 Markdown 规范文档（如 `SPEC.md` 或 `plans/*.md`），通过文件读写替代长对话记忆 [^4]。
4. **引入 Dynamic Workflows（`ultracode`）与确定性 Hooks**：当并行子智能体数量较多、或者需要跨文件批量修改与交叉验证时，使用 `/workflows` 或 `ultracode` 让 Claude 生成 JS 编排脚本在后台驱动子智能体，将中间状态转移到脚本变量中 [^24]；同时将代码格式化、静态检查与测试验证全部收敛到 `PostToolUse` 与 `Stop`/`TaskCompleted` Hooks 中，用 100% 确定性的宿主门禁替代脆弱的提示词叮嘱 [^30]。

---

## 📚 参考文献与引用源

1. [**code.claude.com**｜How Claude Code works - Claude Code Docs](https://code.claude.com/docs/en/how-claude-code-works)
2. [**code.claude.com**｜Modifying system prompts - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts)
3. [**aclanthology.org**｜Many-Tier Instruction Hierarchy in LLM Agents - ACL Anthology](https://aclanthology.org/2026.findings-emnlp.1420.pdf)
4. [**anthropic.com**｜Effective context engineering for AI agents - Anthropic](https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
5. [**mintlify.com**｜Context rot: what it is and how to reduce it with your docs - Mintlify](https://www.mintlify.com/library/context-rot)
6. [**code.claude.com**](https://code.claude.com/docs/en/context-window)
7. [**thepromptbench.com**｜Context Rot, Explained - The Prompt Bench](https://thepromptbench.com/context-engineering/context-rot-explained/)
8. [**humanlayer.dev**](https://www.humanlayer.dev/blog/writing-a-good-claude-md)
9. [**docs.moveworks.com**｜Attention and Limitations - Moveworks documentation](https://docs.moveworks.com/harness/llm-fundamentals/attention-and-limitations)
10. [**code.claude.com**](https://code.claude.com/docs/en/memory)
11. [**golev.com**｜Claude Saves Tokens, Forgets Everything - Alexander Golev](https://golev.com/post/claude-saves-tokens-forgets-everything/)
12. [**ajbuilds.medium.com**｜Your CLAUDE.md Is Probably Broken — Here's How to Tell (And Fix It)](https://ajbuilds.medium.com/your-claude-md-is-probably-broken-heres-how-to-tell-and-fix-it-87cbf24d317d?source=rss------ai-5)
13. [**github.com**｜[BUG] is instructing claude code to not follow](https://github.com/anthropics/claude-code/issues/18560)
14. [**medium.com**](https://medium.com/@georgesung/tracing-claude-codes-llm-traffic-agentic-loop-sub-agents-tool-use-prompts-7796941806f5)
15. [**levelup.gitconnected.com**｜Reverse Engineering Claude Code: How Skills different from Agents](https://levelup.gitconnected.com/reverse-engineering-claude-code-how-skills-different-from-agents-commands-and-styles-b94f8c8f9245)
16. [**betterclaw.io**](https://www.betterclaw.io/blog/agents-md-multi-agent-best-practices)
17. [**code.claude.com**｜CLI reference - Claude Code Docs](https://code.claude.com/docs/en/cli-reference)
18. [**reddit.com**｜When to use '—append-system-prompt' vs CLAUDE.md? : r/ClaudeAI](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/)
19. [**code.claude.com**｜Run Claude Code programmatically - Claude Code Docs](https://code.claude.com/docs/en/headless)
20. [**opc.csdn.net**](https://opc.csdn.net/6a324dc8662f9a54cb80b70d.html)
21. [**claudecodecamp.com**](https://www.claudecodecamp.com/p/inside-claude-code-s-system-prompt)
22. [**code.claude.com**｜Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents)
23. [**epam.com**｜How We Built a Multi-Agent AI System with Claude Code - EPAM](https://www.epam.com/insights/ai/blogs/step-by-step-guide-to-building-a-multi-agent-claude-code-ai-development-team)
24. [**code.claude.com**｜Orchestrate subagents at scale with dynamic workflows - Claude Code](https://code.claude.com/docs/en/workflows)
25. [**reddit.com**｜When does Claude read CLAUDE.md files (and which does it read)](https://www.reddit.com/r/ClaudeCode/comments/1ouaqbq/when_does_claude_read_claudemd_files_and_which/)
26. [**code.claude.com**｜Glossary - Claude Code Docs](https://code.claude.com/docs/en/glossary)
27. [**code.claude.com**｜How Claude Code uses prompt caching](https://code.claude.com/docs/en/prompt-caching)
28. [**roboco.io**｜Claude Code Deep Dive: How Is Claude Code Actually Built?](https://roboco.io/en/posts/claude-code-deep-dive/)
29. [**github.com**｜GitHub - Piebald-AI/claude-code-system-prompts](https://github.com/Piebald-AI/claude-code-system-prompts)
30. [**code.claude.com**｜Best practices for Claude Code - Claude Code Docs](https://code.claude.com/docs/en/best-practices)
31. [**reddit.com**｜Claude Code System Reminder : r/ClaudeCode - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1oqogwu/claude_code_system_reminder/)
32. [**pristren.com**｜Lost in the Middle: Why LLMs Struggle With Long Contexts - Pristren](https://pristren.com/blog/lost-in-middle-attention-paper/)
33. [**harnez.ai**｜Lost in the middle: test context position, not just size - harnez](https://harnez.ai/posts/u-shaped-attention-memory-llms/)
34. [**medium.com**｜The “Lost in the Middle” Problem in LLMs - Medium](https://medium.com/@rajveer.rathod1301/the-lost-in-the-middle-problem-in-llms-b0d88e13f025)
35. [**honeyhive.ai**｜What is a system prompt? - HoneyHive AI](https://www.honeyhive.ai/learn/system-prompt)
36. [**github.com**｜agentic-ai-prompt-research/prompts/21_compact_service.md at main](https://github.com/Leonxlnx/agentic-ai-prompt-research/blob/main/prompts/21_compact_service.md)
37. [**scoutapm.com**｜Prompts, skills, and the AGENTS.md nobody wants to write (and](https://www.scoutapm.com/blog/prompts-skills-and-the-agents-md-nobody-wants-to-write)
38. [**git.mitsea.com**｜claude-code-2603-leak/src/services/compact/prompt.ts at ... - MitseaGit](https://git.mitsea.com/FlintyLemming/claude-code-2603-leak/src/commit/f5a40b86dede580f6543bf8926c9af017eea9409/src/services/compact/prompt.ts)
39. [**github.com**](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-compact-file-reference.md)
40. [**dosu.dev**｜Context Compaction: How to Control What Your Coding Agent](https://dosu.dev/articles/context-compaction-coding-agents)
41. [**code.claude.com**｜Output styles - Claude Code Docs](https://code.claude.com/docs/en/output-styles)
42. [**unlearn.dev**](https://unlearn.dev/blog/build-your-first-multi-agent-workflow)
43. [**reddit.com**｜Don't use Claude Code's Default System Prompt - Reddit](https://www.reddit.com/r/ClaudeCode/comments/1slfnoq/dont_use_claude_codes_default_system_prompt/)
44. [**dev.to**](https://dev.to/javatarz/multi-agent-development-workflows-with-claude-code-n23)
45. [**arxiv.org**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://arxiv.org/abs/2404.13208)
46. [**news.ycombinator.com**｜Claude Code 2.0 - Hacker News](https://news.ycombinator.com/item?id=45416228)
47. [**youtube.com**｜Claude Code answered in English? Use --append-system-prompt](https://www.youtube.com/shorts/IUhSqbFAg_o)
48. [**code.claude.com**｜Run agents in parallel - Claude Code Docs](https://code.claude.com/docs/en/agents)
49. [**code.claude.com**｜Orchestrate teams of Claude Code sessions - Claude Code Docs](https://code.claude.com/docs/en/agent-teams)
50. [**code.claude.com**｜Message your other Claude Code sessions](https://code.claude.com/docs/en/cross-session-messaging)
51. [**code.claude.com**](https://code.claude.com/docs/en/features-overview)
52. [**code.claude.com**｜Week 22 · May 25–29, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w22)
53. [**code.claude.com**｜Week 23 · June 1–5, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w23)
54. [**youtube.com**｜Run Multiple AI Agents in Parallel (Claude Code Tutorial) - YouTube](https://www.youtube.com/watch?v=n35KalqEwJc)
55. [**code.claude.com**｜Run parallel sessions with worktrees - Claude Code Docs](https://code.claude.com/docs/en/worktrees)
56. [**code.claude.com**｜Hooks reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
57. [**empromptu.ai**｜AGENTS.md and CLAUDE.md: Writing Guardrails for AI | Empromptu](https://empromptu.ai/blog/agents-md-claude-md-coding-guardrails)
58. [**code.claude.com**｜Settings files and precedence - Claude Code Docs](https://code.claude.com/docs/en/settings)
59. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
60. [**code.claude.com**｜Use Claude Code features in the SDK](https://code.claude.com/docs/en/agent-sdk/claude-code-features)
61. [**code.claude.com**｜Week 27 · June 29 – July 3, 2026 - Claude Code Docs](https://code.claude.com/docs/en/whats-new/2026-w27)
62. [**markdown.engineering**](https://www.markdown.engineering/learn-claude-code/39-system-prompt)
63. [**aimuse.blog**｜System Prompts Versus User Prompts - AI Muse by kekePower](https://aimuse.blog/article/2025/06/14/system-prompts-versus-user-prompts-empirical-lessons-from-an-18-model-llm-benchmark-on-hard-constraints)
64. [**kompozy.io**｜System Prompt — definition · Kompozy](https://kompozy.io/glossary/system-prompt)
65. [**code.claude.com**｜Common workflows - Claude Code Docs](https://code.claude.com/docs/en/common-workflows)
66. [**code.claude.com**｜Commands - Claude Code Docs](https://code.claude.com/docs/en/commands)
67. [**code.claude.com**｜Automate work with scheduled tasks - Claude Code Docs](https://code.claude.com/docs/en/routines)
68. [**code.claude.com**｜Agent SDK overview - Claude Code Docs](https://code.claude.com/docs/en/agent-sdk/overview)
69. [**ashutoshysingh.com**｜Context Engineering | Ashutosh Singh](https://www.ashutoshysingh.com/learn/context-engineering/)
70. [**ultralytics.com**｜Context Engineering: Curating What AI Sees | Ultralytics](https://www.ultralytics.com/glossary/context-engineering)
71. [**code.claude.com**｜Overview - Claude Code Docs](https://code.claude.com/docs/en/overview)
72. [**reddit.com**｜Workflow: Best Practices for Separating AGENTS.md and CLAUDE](https://www.reddit.com/r/ClaudeWorkflows/comments/1thlmo4/workflow_workflow_best_practices_for_separating/)
73. [**medium.com**｜Learning Claude Code — From Context Engineering to Multi-Agent](https://medium.com/@aayushmnit/learning-claude-code-from-context-engineering-to-multi-agent-workflows-4825e216403f)
74. [**omidsaffari.com**](https://omidsaffari.com/blog/context-rot)
75. [**claudearchitectcertification.com**｜Attention Engineering (D4, 20% of CCA-F) - Claude Certified Architect](https://claudearchitectcertification.com/concepts/attention-engineering)
76. [**arxiv.org**｜Lost in the Middle: How Language Models Use Long Contexts - arXiv](https://arxiv.org/html/2307.03172v3)
77. [**upsolve.ai**｜What Is Context Engineering? Definition & Best Practices in 2026](https://upsolve.ai/blog/context-engineering-guide)
78. [**tianpan.co**｜The Middle-Context Blindness Your Retrieval Pipeline Never](https://tianpan.co/blog/2026/06/02/the-middle-context-blindness-your-retrieval-pipeline-never-measured)
79. [**researchgate.net**｜Lost in the Middle: How Language Models Use Long Contexts](https://www.researchgate.net/publication/378284067_Lost_in_the_Middle_How_Language_Models_Use_Long_Contexts)
80. [**openreview.net**｜The Instruction Hierarchy: Training LLMs to Prioritize Privileged](https://openreview.net/forum?id=vf5M8YaGPY)
81. [**huggingface.co**｜2603/2603.16152.md · huggingchat/papers-content - Hugging Face](https://huggingface.co/buckets/huggingchat/papers-content/tree/2603/2603.16152.md)
82. [**cchistory.mariozechner.at**｜cchistory - Claude Code Version History](https://cchistory.mariozechner.at/)
83. [**reddit.com**｜Hvornår skal man bruge '—append-system-prompt' vs CLAUDE.md](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=da)
84. [**reddit.com**｜Quand utiliser '—append-system-prompt' vs CLAUDE.md - Reddit](https://www.reddit.com/r/ClaudeAI/comments/1myxcsb/when_to_use_appendsystemprompt_vs_claudemd/?tl=fr)
85. [**reddit.com**｜[Workflow] Structuring Multi-Agent Claude Code Workflows with ...](https://www.reddit.com/r/ClaudeWorkflows/comments/1wbzfga/workflow_structuring_multiagent_claude_code/)
86. [**hackergit.org**｜Piebald-AI/claude-code-system-prompts on Hacker News - HackerGit](https://hackergit.org/r/Piebald-AI/claude-code-system-prompts)
87. [**open-repo.com**｜Piebald-AI/claude-code-system-prompts · 12.5K Stars · GitHub 趋势](https://www.open-repo.com/r/Piebald-AI_claude-code-system-prompts.html)
88. [**githubsignals.io**｜piebald-ai/claude-code-system-prompts - GitHub Signals](https://githubsignals.io/repo/piebald-ai/claude-code-system-prompts/)
89. [**github.com**｜system-reminder-send-to-project-memory-brief-trust-boundary.md](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-send-to-project-memory-brief-trust-boundary.md)
90. [**pomoai.com**｜claude-code-system-prompts · 技能与配置 - POMOAI](https://www.pomoai.com/hubs/Piebald-AI/claude-code-system-prompts)
91. [**github.com**｜system-reminder-approved-claude-doc-plan-readback.md - GitHub](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/system-reminder-approved-claude-doc-plan-readback.md)
92. [**github.com**｜claude-code-learn/claude-prompt/user/user.md at main - GitHub](https://github.com/zlh-428/claude-code-learn/blob/main/claude-prompt/user/user.md)
93. [**reddit.com**｜Is CLAUDE.md just a system prompt all agents will read before](https://www.reddit.com/r/ClaudeAI/comments/1lrfs27/is_claudemd_just_a_system_prompt_all_agents_will/)
94. [**kirshatrov.com**｜Reverse engineering Claude Code - Kir Shatrov](https://kirshatrov.com/posts/claude-code-internals)
95. [**news.ycombinator.com**｜Claude.md just has 2 lines. the first points to @CONTRIBUTING](https://news.ycombinator.com/item?id=46331909)
96. [**mihaileric.com**｜Claude Code Demystified: Whirring, Skidaddling, Flibbertigibetting](https://www.mihaileric.com/Demystifying-Claude-Code/)
97. [**medium.com**｜The Complete Guide to Writing Agent System Prompts - Medium](https://medium.com/@fengliu_367/the-complete-guide-to-writing-agent-system-prompts-lessons-from-reverse-engineering-claude-code-09ecd87c7cc1)
98. [**docs.openclaw.ai**｜Prompt caching - OpenClaw Docs](https://docs.openclaw.ai/reference/prompt-caching)
99. [**classic.yarnpkg.com**｜@mariozechner/pi-coding-agent | Yarn](https://classic.yarnpkg.com/en/package/@mariozechner/pi-coding-agent)
100. [**ccafpreparation.com**｜CCAR-F Glossary — 219 Terms, Config Keys and API Fields](https://www.ccafpreparation.com/glossary)
101. [**github.com**｜fak/cmd/fak/guard.go at main - anthony-chaudhary - GitHub](https://github.com/anthony-chaudhary/fak/blob/main/cmd/fak/guard.go)
102. [**github.com**｜cc-viewer/history.md at main - GitHub](https://github.com/weiesky/cc-viewer/blob/main/history.md)
103. [**honeyhive.ai**](https://www.honeyhive.ai/learn/context-rot)
104. [**github.com**](https://github.com/bendyline/gezel/blob/main/docs/prompt-stack.md)

