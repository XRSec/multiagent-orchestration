# AI运行时元MCP动态编排架构调研

> 导出自 Google Gemini 深度研究 (Deep Research)
> 导出时间: 2026-11-14 12:20:32

# AI Runtime 单入口元 MCP（Meta-MCP）与运行时目录动态供给架构调研报告

在 AI Agent Runtime（智能体运行时）架构设计中，**将 Skill（技能指令包）、MCP Tools（工具集）与 Plugin（插件扩展）统一封装并收敛至单一的“元 MCP 服务（Meta-MCP / Unified MCP Gateway）”后，令所有 Agent Runtime 仅需激活这一个 MCP 端点，并由每个执行步（Runtime Step）在运行期自主检索、按需加载所需能力及动态装配运行时目录（`runtime dir`）**，在工程上是完全可行的，并且已在 2026 年演进为解决大规模智能体“上下文膨胀（Context Bloat）”与“多端配置漂移（Fork and Drift）”的核心架构模式 [^1]。以 Docker MCP Gateway（Dynamic MCP）、Stacklok ToolHive（vMCP Optimizer）、FastMCP 4.2（Skills over MCP）、Bifrost、MCPHub 以及 Anthropic/OpenAI 原生 `ToolSearch` 为代表的现代工具链，已将传统的“启动时全量静态注入”转向“单入口连接 + 元工具（Meta-Tools）渐进式披露（Progressive Disclosure）”架构 [^3]。根据官方工程团队及开源网关基准测试数据，该模式可将初始工具与技能的上下文 Token 消耗降低 **85% 至 98%**——例如 Anthropic 官方工程数据显示 `ToolSearch` 可削减 85% 的 Token 开销，AIRIS MCP Gateway 实测将 59 个工具的 40,300 Token 压缩至 3 个元工具的约 600 Token（降幅 98%），而网关厂商 Maxim AI 的基准测试则报告其 Bifrost Code Mode 在 508 个工具规模下削减了 92.8% 的输入 Token [^3]。

在具体运行机制上，当 Agent Runtime 仅挂载单一的统一 MCP 服务时，该服务在会话初始阶段仅向模型暴露极少量的**原生元工具（Primordial Meta-Tools）**（如 `search_tools`、`load_tool` / `load_capability`、`call_tool` 或沙箱化的 `execute`） [^3]。在每一个 Runtime Step 中，模型根据当前子任务意图，自主调用检索元工具（基于 BM25 关键词或 Frontmatter 向量语义匹配）定位所需的 Skill、Plugin 或底层 MCP Tool [^8]；随后，统一 MCP 服务一方面通过协议扩展（如 `SEP-2640` `io.modelcontextprotocol/skills`）或元工具返回结果，将 `SKILL.md` 操作规程与目标工具的 JSON Schema 按需注入当前步的上下文中 [^5]；另一方面，通过**受控目录同步（Digest-Verified Directory Sync）**、**归档按需解压（Archive Extraction）**或**原子符号链接投影（Canonical Symlink Projection）**，将执行该步骤所必需的脚本（`scripts/`）、参考文档（`references/`）、模板资产（`assets/`）及插件数据动态装配到宿主环境的 `runtime dir`（如 `.agents/`、`.claude/`、`.openhands/` 或 `${PLUGIN_DATA}`）中 [^1]。

在落地这一架构时，系统架构师需重点关注三个工程约束与边界条件：第一是**提示词缓存前缀击穿（Prompt Cache Prefix Busting）**——根据针对 Claude Code 计费与缓存机制的技术剖析，若统一 MCP 服务通过发送原生的 `notifications/tools/list_changed` 动态增删根节点 `tools` 列表，会直接修改 API 请求体第 0 字节（Byte 0）的前缀，导致整个会话的 Prompt Cache 失效，使本可享受 **0.1×（在部分新模型上低至 0.05× 至 0.025×）读取折扣**的历史上下文被迫以 **2.0×（1 小时 TTL）或 1.25×（5 分钟 TTL）的写入费率**全量重建 [^15]；缓存安全的做法是保持 Byte 0 的元工具列表静态不变，将动态拉取的 Schema 与 Skill 内容追加在请求体尾部的 `messages`（Layer 3）中 [^15]。第二是**协议版本演进约束**——MCP `2026-07-28` 协议版本已正式废弃并移除了 `initialize` 握手与客户端 `Roots`（`roots/list`），动态工作区目录的边界控制不能再依赖旧版 `Roots` 机制，而需通过显式的目录装配逻辑与宿主机沙箱策略实现 [^17]。第三是**标准成熟度与宿主生命周期边界**——截至 2026 年下半年，`SEP-2640`（Skills over MCP）在 FastMCP 4.2 与 Microsoft Agent Framework 中仍处于草案或实验性（Experimental）阶段，且现有生态尚无单一开箱即用的开源组件将“元工具网关”与“多宿主动态目录挂载”完全合二为一 [^4]；此外，虽然 Skill 指令、脚本与代理工具调用可在任意 Runtime Step 内实现步内热加载，但涉及宿主底层的原生插件钩子（如 `hooks.json`、`monitors.json` 与 LSP 进程）通常在会话启动时静态绑定，若需在单步内即时生效，需由统一 MCP 服务在自身的受控沙箱或网关中间件中托管执行 [^11]。

## 一、 架构演进背景：为什么需要将 Skill、Plugin 与 Tools 收敛为单一 MCP 入口

在传统的智能体工程实践中，Agent Runtime（如 Claude Code、Cursor、Codex、OpenHands 等）普遍采用“扁平式多源挂载”架构：开发者在项目的 `.mcp.json` 中静态配置多个独立的 MCP Server，在 `.claude/skills/` 或 `.openhands/microagents/` 目录下存放数十个本地 `SKILL.md` 文件夹，并通过特定宿主的插件目录安装各类扩展 [^22]。随着企业级 Agent 接入能力规模的扩大，这种静态分散架构暴露出两个突出的系统性瓶颈。

### 1. 上下文窗口污染与推理性能劣化（Context Bloat & Compaction）

当 Agent Runtime 在会话启动时连接多个 MCP Server 并扫描本地目录时，默认会将所有工具的完整 JSON Schema（包含函数名、长描述、嵌套参数类型及枚举值）以及所有已启用技能的名称与描述全量拼接到系统提示词前缀中 [^21]。

这种全量预加载模式会迅速侵蚀有效上下文空间。根据 Anthropic 工程团队公布的数据（引自行业技术指南），挂载 50 余个常规 MCP 工具的传统方式会在任何工作开始前消耗约 **77,000 Token** [^9]；在开源项目 AIRIS MCP Gateway 于 2025 年 12 月 19 日记录的基准测试中，预加载 59 个工具持续占用了 **40,300 Token**（占 200K 上下文窗口的 20.2%） [^6]；而在 Claude Code 开源仓库 Issue #40314 报告的 HTTP 传输协议 MCP 服务案例中，挂载约 250 个工具的 Schema 会在会话启动时直接内联占用 **120,000 Token**（高达 Sonnet 200K 上下文窗口的 60%） [^27]。在接入数百个工具的重度集成场景下，MCPHub 社区开发者反馈静态工具定义的上下文占用甚至可超过 **300,000 Token** [^28]。

工程实践表明，为保证模型推理质量，Claude Code 等环境中的有效工作上下文水位线通常需控制在 60% 左右，达到 70% 需开始监控，75% 时需运行 `/compact` 压缩历史，超过 80% 则需执行 `/clear` 硬重置 [^25]。静态加载海量无关工具不仅造成高昂的首 Token 计费浪费与推理延迟，还会加速触发上下文窗口压缩（Compaction），并导致模型在过多相似工具定义之间出现选择退化 [^3]。

### 2. 多 Runtime 目录结构的碎片化与“分叉漂移（Fork and Drift）”

在多智能体协同或跨工具链开发的团队中，不同的 Agent Runtime 对 `runtime dir`（运行时工作目录）的目录拓扑、清单格式和组件加载有着不同的规范，导致同一套技能或插件在跨客户端分发时面临严重的“分叉与漂移（Fork and Drift）”问题 [^1]。

在 **Claude Code** 环境（终端、桌面端与 IDE 扩展）中，插件清单必须位于 `.claude-plugin/plugin.json`，并在插件或工作区根目录下组织 `skills/<name>/SKILL.md`、`commands/`、`agents/`、`hooks/hooks.json`、`monitors/monitors.json`、`workflows/`、`bin/`、`.mcp.json` 与 `.lsp.json` [^21]。其运行期状态、会话转录（`projects/*.jsonl`）、大文件工具输出（`tool-results/`）及后台 MCP 任务状态（`mcp-tasks/`）则持久化在全局 `~/.claude/`（或由 `CLAUDE_CONFIG_DIR` 指定的目录）及系统临时目录的 `scratchpad/` 下 [^23]。

相比之下，由 Vercel 提议，Amazon、Anysphere（Cursor）、GitHub、Microsoft、OpenAI 与 Google 于 2026 年 8 月 6 日发布的 **Agent Plugins 1.0.0** 跨厂商开放标准，要求清单文件位于根目录的 `plugin.json`，技能固定存放在不可配置的 `skills/<name>/SKILL.md` 路径下，MCP 声明独立存放在根目录 `mcp.json`，并通过反向域名空间（如 `com.example.client/`）隔离宿主专有扩展 [^1]。与此同时，**OpenAI Codex 与 ChatGPT** 在支持标准 `plugin.json` 的基础上保留了 `.codex-plugin/plugin.json` 兼容清单与 `.app.json` 应用映射，其仓库级插件市场索引位于 `$REPO_ROOT/.agents/plugins/marketplace.json`，并通过 `.codex/config.toml` 控制插件启停 [^30]。而在 **OpenHands** 运行时中，项目定制化依赖仓库根目录下的 `.openhands/` 文件夹，其中包含定义项目专属行为的 `skills/`（原 `.openhands/microagents/`，内含带 `triggers` 等 YAML 前置元数据的 Markdown 文件）、每次接管仓库时自动执行的初始化脚本 `.openhands/setup.sh`，以及拦截生命周期事件与停止门禁（Stop Hooks）的 `.openhands/hooks.json` [^24]。

将所有 Skill、Plugin 与 MCP Tools 统一收敛至一个后端的**元 MCP 服务（Meta-MCP Server）**，由该服务作为单一事实源（Single Source of Truth），并在运行期按当前激活的 Agent Runtime Step 需求动态向本地 `runtime dir` 投射或注入所需文件，能够有效消除多端静态复制与重复打包的维护成本 [^4]。

### 3. 核心概念的职责边界解耦：Tool、Skill 与 Plugin

在构建统一打包架构前，需在系统设计层明确界定三类组件在元 MCP 服务中的语义分工 [^19]：

| 能力原语 | 核心定位（架构角色） | 承载内容与物理形态 | 在单入口 Meta-MCP 中的暴露与激活方式 |
| --- | --- | --- | --- |
| MCP Tool（工具） | “Agent 能做什么”（连接与受控执行层 / 工具箱中的扳手与电钻） | 具有严格输入/输出 JSON Schema 的原子操作函数、实时数据检索接口、API 读写或受控执行端点。 | 初始隐藏于网关注册表后；由 Runtime Step 通过 find_tool / search_tools 检索后，按需拉取 Schema 并通过 call_tool 或沙箱代码调用。 |
| Skill（技能） | “Agent 该如何做”（操作规程与业务逻辑层 / 作业指导书与说明书） | 以 SKILL.md 为核心（含 YAML Frontmatter name、description 及正文步骤、条件分支、边界守则），伴随 references/（长文档/API 避坑指南）、scripts/（确定性执行脚本）与 assets/（输出模板）。 | 通过 SEP-2640（skills/list、skills/get、resources/read）暴露为 skill:// 资源，或封装为 list_skills / get_skill 元工具；触发后按需将三级资产同步或映射至本地 runtime dir。 |
| Plugin（插件） | “能力的组合分发与环境契约单元”（打包容器与生命周期扩展） | 包含 plugin.json 清单，将一组强相关的 Skills、MCP Server 声明（mcp.json）、Subagents（子智能体定义）、Hooks（生命周期钩子）、LSP 服务及 bin/ 可执行文件打包为单一可移植目录。 | 作为 Meta-MCP 后端的能力注册包（Capability Bundle）；当 Runtime Step 激活某插件领域时，Meta-MCP 自动挂载其关联的 MCP 工具集、解锁对应 Skills，并将插件运行所需的环境变量（${PLUGIN_ROOT}、${PLUGIN_DATA}）与脚本装配至工作区。 |

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

## 二、 统一打包范式：将 Skill、MCP Tools 与 Plugin 封装为 MCP 服务的技术路径

要实现“所有 Agent Runtime 仅需激活一个 MCP 服务”，核心前提是将原本散落在本地磁盘的 `SKILL.md`、插件目录以及远端或本地的多个 MCP Tools 统一抽象并封装到单个 MCP Server 的协议表面之下。根据 2026 年的协议规范与开源生态，目前业界主要采用以下三种封装路径（在生产架构中常组合使用）。

### 1. 协议原生扩展路径：Skills over MCP（`SEP-2640` / `io.modelcontextprotocol/skills`）

由 Agentic AI Foundation（AAIF，Linux 基金会旗下机构）与 Skills Over MCP 工作组推进的 **SEP-2640（`io.modelcontextprotocol/skills`）** 提案（截至 2026 年 8 月仍处于演进草案阶段），定义了如何通过同一条 MCP 连接同时交付“执行工具（Tools）”与“操作技能（Skills）”，即“随产品一起交付说明书（Ship the manual with the product）” [^5]。

在能力声明与发现握手上，支持该规范的统一 MCP 服务在响应 `server/discover` 时，会同时声明标准 `resources` 能力与 `io.modelcontextprotocol/skills` 扩展（可选开启 `"directoryRead": true` 以支持 `resources/directory/read`，默认值为 `false`） [^5]。对于尚未实现专用扩展方法的客户端，服务端可通过标准资源路径 `skill://index.json` 或资源模板 `mcp-resource-template`（如 `skill://stripe/{product_area}/{skill_name}/SKILL.md`）暴露轻量级目录索引 [^36]。

客户端与服务端的交互遵循三阶段渐进式协议流：首先，客户端调用 `skills/list` 获取分页的技能目录数组，其中每个原子条目完整包含技能的 `uri`（如 `skill://code-review/SKILL.md`）、原样保留的 YAML `frontmatter`（必须含 `name` 与 `description`）以及 `resources` 文件清单（或针对动态生成内容的 `"dynamic"` 标记），并附带缓存控制参数 `ttlMs` 与 `cacheScope` [^5]；其次，当需要按 URI 精确加载未在列表中全量展示的技能或刷新失效清单时，客户端调用 `skills/get`（传入 `{"uri": "<SKILL_URI>"}`） [^5]；最后，当 Runtime Step 决定采用某个技能时，客户端通过 `resources/read` 按需读取 `skill://<name>/SKILL.md` 正文及其相对路径引用的附属文件（例如正文中的 `references/checklist.md` 会自动相对于技能根目录解析为 `skill://code-review/references/checklist.md`） [^5]。

为保障安全性，`SEP-2640` 引入了严格的完整性清单（Manifest）机制。每个静态技能条目的 `resources` 数组必须列出 `SKILL.md` 及所有附属文件的完整 URI、精确字节大小（`size`）与 **SHA-256 摘要（`digest`）**，规范建议单技能不超过 512 个文件或 16 MiB [^4]。宿主在连接、列表或审批阶段严禁预先拉取文件内容，仅在 Runtime Step 真正需要时按需读取并逐字节核对 SHA-256 签名 [^5]。

在工程框架支持方面，Python 生态的 **FastMCP 4.2** 与 .NET 生态的 **Microsoft Agent Framework（`Microsoft.Agents.AI.Mcp`）** 已率先落地了该模式（两者文档均标注该 API 目前处于实验性阶段） [^4]。在 FastMCP 4.2 中，开发者可通过 `SkillCatalogProvider` 将内存 `Skill` 对象、Python 包或通过重写异步方法 `load_skills()` 从数据库实时读取的动态技能暴露为 MCP 服务（每次请求动态计算）；也可使用 `SkillsDirectoryProvider(root, reload=True)` 直接将磁盘上的 `.claude/skills` 等目录挂载为支持热重载的 MCP 技能源，并通过 `gateway.mount(proxy, namespace="github")` 将多个子 MCP 服务的工具与技能聚合在统一命名空间下（如将 `skill://review/` 映射为 `skill://github/review/`） [^4]。而在 Microsoft Agent Framework 中，`UseMcpSkills(client)` 支持从远端 MCP 服务端（如 Microsoft Foundry Toolbox）动态发现并加载技能，同时提供逐文件按需拉取的 **`skill-md` 模式**，以及将整个技能包（含模板、查找表与核对单）打包为单一 ZIP/TAR/TAR.GZ 归档一次性下载并解压到本地受控目录的 **`archive` 模式** [^13]。

### 2. 工具化包装路径：将 Skills 与 Plugins 映射为标准 MCP Tools

由于部分现有 Agent Runtime 的 MCP 客户端尚未完整实现 `Resources` 原语或 `SEP-2640` 扩展 [^4]，工程界广泛采用的第二种方案是**将 Skill 的检索、读取、脚本执行与工作区导出直接封装为标准 MCP Tools**（代表项目包括 `skills-mcp/skills-mcp`、`jignesh-ponamwar/skills-mcp`、`@tech-leads-club/agent-skills-mcp`、`pm-skills-mcp`、`Skill Server` 与 RockBot 等） [^11]。根据底层资产交付方式的不同，工具化包装可分为三种实现形态：

第一种是**极简包装器 + 本地路径移交模式**（以 `skills-mcp/skills-mcp` 为代表）。服务端仅暴露 `list_skills`（返回约 100 Token 的 ID、名称与描述）和 `get_skill`（返回约 5k Token 的 `SKILL.md` 全文及该文件在本地磁盘上的**绝对路径**，如 `/Users/username/.claude/skills/pdf-processing/SKILL.md`），并辅以 `/init-skills` 会话引导提示词 [^39]。当 Runtime Step 阅读完 `SKILL.md` 发现需要参考 `references/FORMS.md` 或运行 `scripts/fill_form.py` 时，直接利用返回的绝对路径拼接子路径，调用 Agent 自身原生的文件读取或终端执行工具完成第 3 级资源交互 [^39]。

第二种是**六集合向量分层 + 服务端沙箱模式**（以 `jignesh-ponamwar/skills-mcp` 为代表）。面向云端或无本地技能库的环境，该项目基于 FastMCP、Cloudflare Workers 与 Qdrant 向量数据库构建了 **3 层 7 工具渐进式架构** [^11]。其在 Qdrant 中将数据拆分为 6 个独立集合：`skill_frontmatter`（仅对 `description + trigger_phrases` 约 100 Token 使用 `@cf/baai/bge-small-en-v1.5` 生成 384 维向量，避免对完整说明正文做 Embedding 污染向量检索空间）、`skill_body`、`skill_options`、`skill_references`、`skill_scripts` 与 `skill_assets` [^11]。向 Agent 暴露的 7 个元工具按阶段划分为：Tier 1 发现层的 `skills_find_relevant(query, top_k)`（返回语义匹配度得分，如 `test-writer: 0.84`）与 `skills_list_all(limit, offset)`；Tier 2 核心加载层的 `skills_get_body(skill_id, version?)`（一次性返回完整指令正文及 `tier3_manifest` 附属文件清单，避免 N+1 链式请求）与 `skills_get_options(skill_id)`；以及 Tier 3 资产与执行层的 `skills_get_reference(skill_id, filename)`、`skills_get_asset(skill_id, filename)` 与 `skills_run_script(skill_id, filename, input_data)`（仅当 Tier 2 正文明确指示时才按需调用，且脚本源码严禁发往客户端，仅在本地 Python 服务端的隔离 `TemporaryDirectory` 中执行并返回 `stdout`、`stderr` 与 `exit_code`） [^11]。

第三种是**客户端模型采样执行与运行时自演进模式**。例如 `pm-skills-mcp` 除了提供 `list_skills`、`search_skills` 与 `get_skill` 外，还提供 `run_skill(name, input)` 工具，利用 MCP 协议的 `sampling`（反向模型采样）能力，借用客户端宿主已连接的 LLM 完成技能工作流生成并返回最终产物（需要注意的是，在最新 MCP 权限架构评估中，`sampling` 已被标记为不推荐使用的反向通道，且并非所有客户端均支持） [^18]。而在 RockBot 框架中，Agent 不仅拥有 `list_tool_guides` / `get_tool_guide` 基础指南工具和 `mcp_list_services`、`mcp_get_service_details`、`mcp_invoke_tool`、`mcp_register_server`、`mcp_unregister_server` 等动态 MCP 元工具，还具备 `get_skill`、`list_skills`、`save_skill` 与 `delete_skill`，允许智能体在运行过程中将习得的操作经验动态保存为新 Skill [^42]。

### 3. 插件包（Plugin Bundle）与多源 MCP 网关的聚合打包

当需要打包的对象不仅是单一 Skill，而是包含多个 Skills、Subagents、Hooks 与专属 MCP Server 的完整 **Plugin** 时，统一 MCP 服务在后端充当 **感知插件结构的聚合网关（Plugin-Aware Aggregator）**。主流插件打包规范均采用了结构化的目录契约，便于由统一 MCP 服务在后端解析并托管 [^1]：

| 维度 | Agent Plugins 1.0.0 标准（跨厂商通用） | Claude Code 插件规范（Anthropic 专有） | OpenAI Codex / ChatGPT 插件规范 |
| --- | --- | --- | --- |
| 治理与支持方 | Vercel 提议，Amazon、Cursor、GitHub、Microsoft、OpenAI、Google 联合维护（2026-08 发布） | Anthropic（Claude Code 终端、桌面端及 IDE 扩展） | OpenAI（ChatGPT Work 与 Codex 共享通用插件目录） |
| 核心清单路径 | 根目录 plugin.json（闭式 Schema，未知顶层字段报错忽略并继续加载） | .claude-plugin/plugin.json（支持 userConfig 交互式配置提示） | 兼容根目录 plugin.json（通过 extensions.com.openai 扩展）或 .codex-plugin/plugin.json |
| Skills 存放位置 | 固定在根目录 skills/<skill-name>/SKILL.md（不可配置路径） | 根目录 skills/<skill-name>/SKILL.md 或单文件 SKILL.md | 根目录 skills/<skill-name>/SKILL.md（在清单中声明 "skills": "./skills/"） |
| MCP 服务声明 | 独立存放在根目录 mcp.json（严禁内联在 plugin.json 中） | 根目录 .mcp.json（加载后在 /mcp 显示为 plugin:<plugin>:<server>） | 根目录 mcp.json / .mcp.json、.app.json 或在 agents/openai.yaml 的 dependencies.tools 中声明 |
| 路径占位符变量 | 仅限 ${PLUGIN_ROOT}（只读安装目录）与 ${PLUGIN_DATA}（跨更新持久化的可写目录，存 node_modules/虚拟环境/缓存） | ${CLAUDE_PLUGIN_ROOT}（只读版本目录）、${CLAUDE_PLUGIN_DATA}（~/.claude/plugins/data/<id>/）与 ${CLAUDE_PROJECT_DIR} | 遵循 Agent Plugins 1.0.0 规范或通过 $REPO_ROOT/.agents/plugins/marketplace.json 相对路径解析 |
| 专有运行时组件 | 置于顶层反向域名目录（如 com.example.client/）或清单 extensions 字段 | agents/（子智能体）、hooks/hooks.json、monitors/monitors.json、workflows/*.js、bin/（自动加入 PATH）、.lsp.json | hooks/（仅限本地安装的 Codex 桌面插件）、.app.json（MCP Apps UI 映射） |

在后端聚合层，开源生态已涌现出多款成熟的 MCP 聚合器与网关，包括 **MetaMCP**（TypeScript 编写，支持将多个 MCP 编组为 Namespace、重写工具注解并挂载“过滤非活跃工具”等可插拔中间件）、**IBM ContextForge**（Python 编写，Apache 2.0 协议，支持将 MCP、A2A 智能体、REST/gRPC API 联邦化为单一虚拟服务器端点，配备 PostgreSQL 与 Redis 会话亲和性路由）、**MCPJungle**（Go 编写的自托管注册表与网关）、**Docker MCP Gateway** 以及 **Stacklok ToolHive（`thv vmcp`）**，它们均能够将上述插件包中声明的底层 MCP Servers 统一纳管至单个入口端点之后 [^2]。

## 三、 Runtime Step 自主决策机制：元工具（Meta-Tools）、渐进式披露与沙箱编排

当所有 Agent Runtime 仅配置并激活这一个统一的元 MCP 服务后，核心问题转化为：**在具体的每一个 Runtime Step（推理与行动步）中，模型如何在不预加载全量上下文的前提下，自主感知、决策并调用所需的 Skill、Plugin 或 MCP Tool？**

2026 年的工业界实践已形成三大渐进式披露（Progressive Disclosure）决策范式，以及一套关乎推理成本的底层缓存设计准则。

### 1. 范式一：原生元工具路由（Primordial Meta-Tools：Search → Hydrate → Execute）

在该范式下，统一 MCP 服务在 `tools/list` 中主动屏蔽后端成百上千个原始工具，仅向 Agent Runtime 暴露 **2 至 5 个静态的“原生元工具（Primordial Tools）”** [^6]。Runtime Step 通过多步工具调用自主完成“按需发现与动态绑定”。

在 **Docker MCP Gateway（Dynamic MCP 模式）** 中（需 Docker Desktop 4.50+ 及 `docker/mcp-gateway` v0.42+），网关默认仅在上下文中暴露 `mcp-find`（按名称或描述检索目录中的 MCP 服务与工具）、`mcp-add`（将目标 MCP 服务动态挂载至当前会话工作集）、`mcp-remove`（卸载服务）、`mcp-exec`（按名称直接执行工具而无需预先在上下文中加载定义）以及 `mcp-config-set` 与实验性的 `code-mode` [^2]。当某一步需要操作 GitHub 时，Agent 自主调用 `mcp-find` 搜索目录并执行 `mcp-add` 或 `mcp-exec`，后端工具容器默认按次拉起并在调用后释放（也可通过 `--long-lived` 或 `--static` 保持常驻），在官方架构测试中可实现约 60% 至 70% 的 Token 缩减 [^2]。

为了避免动态增删工具触发列表变更，**AIRIS MCP Gateway** 在开启 `DYNAMIC_MCP=true` 后，在 `tools/list` 中严格仅暴露 3 个元工具：`airis-find`（跨服务检索工具摘要，并支持按需唤醒处于 `COLD` 冷关闭状态的服务）、`airis-schema`（按需拉取单一工具的完整输入 JSON Schema）与 `airis-exec`（指定 `server`、`tool` 与 `arguments` 代理执行），将 59 个工具的初始上下文从 40.3K Token 压降至约 **600 Token** [^6]。类似地，Solo.io 的 **Enterprise for agentgateway** 在配置 `spec.entMcp.toolMode: Search` 后，会拦截上游 `tools/list` 响应并替换为 `get_tool`（按名称拉取 Schema）与 `invoke_tool`（代理调用）两个元工具 [^26]。

在本地与云原生虚拟化层面，**Stacklok ToolHive（`thv vmcp`）** 通过 Go 原生命令 `thv vmcp serve --optimizer` 将一组后端 MCP 服务聚合为单一本地虚拟端点（默认监听 `http://127.0.0.1:4483`，并实施严格的 `Host` 请求头回环校验以防 DNS 重绑定攻击），仅向客户端暴露 `find_tool` 与 `call_tool` 两个会话级元工具 [^8]。其检索能力分为四个层级：**Tier 0**（默认透传全部工具）；**Tier 1（`--optimizer`）** 使用进程内 SQLite FTS5 全文关键词检索，零外部依赖；**Tier 2（`--optimizer-embedding`）** 由 ToolHive 的 `EmbeddingServiceManager` 自动拉起并管理 HuggingFace TEI 容器（`thv-embedding-<model-short-hash>`，支持复用已有容器与指数退避健康检查，默认运行 `BAAI/bge-small-en-v1.5`）实现 FTS5 + 语义向量混合检索；**Tier 3** 则对接外部自管 Embedding 服务 [^8]。需要注意的是，由于 `find_tool` / `call_tool` 是会话作用域（Session-Scoped）的，ToolHive 的能力门控（`modern_gate.go`）会将支持 `2026-07-28` 协议的现代客户端协商降级至 `2025-11-25` 协议版本以维持会话状态 [^8]。

在向量数据库与框架级集成方面，**MCPHub（`samanhappy/mcphub` 与 `xiaozhi-mcphub`）** 在开启 `SMART_ROUTING_ENABLED=true` 后，利用 PostgreSQL + `pgvector` 与 OpenAI Embedding 模型对所有后端工具定义进行向量化索引，在 `/mcp/$smart` 端点上仅暴露 `search_tools` 与 `call_tool`（或 `execute`） [^28]。而在 Agent 框架层，**Pydantic AI Harness** 实现了 `ToolSearch` 能力（支持混合调用底层模型原生搜索或本地关键词回退）及 Mastra（`ToolSearchProcessor`，报告约 94% 上下文缩减）、`ya-agent-sdk`（基于 `fastembed` 报告 85%+ 缩减）等同类机制 [^3]。Pydantic AI 在未发现阶段仅暴露 `search_tools(query)` 与 `load_tool(name)` / `load_capability(id=...)`；当 Runtime Step 调用 `load_capability(id=...)` 时，该能力包所属的全部工具将作为一个整体单元被激活，并在历史记录中生成带 `tool_kind='tool-search'` 标记的 `ToolSearchCallPart` 与 `ToolSearchReturnPart`，使回放与审计日志能够清晰区分“能力加载步”与“普通工具调用步” [^3]。

### 2. 范式二：模型提供商原生延迟加载（Provider-Native Deferred Tool Loading）

除了由网关在协议层拦截外，Anthropic（2026 年 1 月 14 日在 Claude Code 推出 MCP Tool Search，2 月 17 日在 API 全面 GA `Tool Search Tool`）与 OpenAI（2026 年 3 月在 Agents SDK v0.11.0 推出 `defer_loading=True` + `ToolSearchTool()`）均已在模型与官方客户端底层支持原生延迟加载 [^3]。

在 Claude Code 中（支持 Claude Opus 4、Sonnet 4、Haiku 4.5 及后续的 4.5 / 5 / 5.5 系列模型），`ENABLE_TOOL_SEARCH` 默认处于 `auto` 阈值模式：当 MCP 工具描述总长度低于上下文窗口的 **10%（约 10K Token）** 时正常全量加载（前端加载的工具与服务说明默认截断上限为 4,096 字符）；一旦达到或超过 10%（或通过 `ENABLE_TOOL_SEARCH=auto:N` 自定义百分比阈值，或设为 `true` 强制开启），所有未标记 `"anthropic/alwaysLoad"` 的工具均被自动设为 `defer_loading: true`，通过 `anthropic-beta` 请求头以轻量级 `tool_reference` 占位符形式发送，同时向模型注入一个仅占约 500 Token 的 `ToolSearch` 工具 [^9]。当 Runtime Step 需要特定能力时，模型自主调用 `ToolSearch`，利用 **Regex 模式**（构造如 `"weather"` 或 `"get_.*_data"` 的正则表达式）或 **BM25 模式**（自然语言探索查询）按需检索，每次仅将最相关的 **3 至 5 个工具（约 3K Token）** 的完整 Schema（长度上限放宽至 16,384 字符，可通过 `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` 调整）加载到会话中 [^9]。此外，Claude Code 支持通过 `MCP_DISCOVERY_CACHE=1` 启用发现缓存，启动时直接从本地缓存读取远端 HTTP/SSE 服务的工具列表，直到首次真正调用工具时才建立网络连接 [^21]。

然而，在跨传输协议与跨云部署时，架构师不能单纯依赖客户端原生的 `ENABLE_TOOL_SEARCH`，主要受制于三项已知工程限制：第一，Azure 托管的 Microsoft Foundry 部署会在服务端拒绝 `ToolSearch` 请求，导致客户端被迫回退到全量预加载 [^51]；第二，当 `ANTHROPIC_BASE_URL` 指向自定义网关、会话开启 HIPAA 合规模式或设置了 `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` 时，Tool Search 会被默认禁用 [^51]；第三，Claude Code 存在已知传输层缺陷（Issue #40314），即 `ENABLE_TOOL_SEARCH` 仅能正确延迟加载本地 `stdio` 传输的 MCP 工具（将其压缩至 `<300 Token`），而对 `http` / `streamable-http` 远端 MCP 服务的工具无法生效，仍会将 ~250 个工具 Schema 全量内联加载并消耗 120K Token [^27]。因此，**在统一元 MCP 服务端内部实现元工具路由或 Code Mode，是确保跨所有客户端宿主与传输协议一致生效的稳健方案** [^6]。

### 3. 范式三：Code Mode（代码生成与沙箱多步编排）

传统的工具调用不仅存在“启动时 Schema 膨胀”问题，还存在显著的“多步往返开销（Round-Trip Overhead）”——若一个 Runtime Step 需要先后调用多个工具并传递中间数据，每次调用都必须经历一次完整的 LLM 上下文往返推理 [^12]。

**Code Mode（代码模式）**（由 Cloudflare 提出，并在 FastMCP 3.1+、Bifrost、Docker MCP Gateway 与 Composio Tool Router 中落地）通过将“多工具声明式调用”转化为“单步沙箱脚本编排”，同时解决了这两个扩展性难题：统一 MCP 服务不再让模型逐个调用工具，而是暴露**发现元工具 + Python/JS 沙箱执行器**，让模型在单个 Runtime Step 内编写一段串联多个工具调用的代码，在服务端沙箱中一次性执行完毕并仅向模型返回最终结果 [^2]。

在 **FastMCP `CodeMode`**（v3.1.0 引入的实验性转换器，`pip install "fastmcp[code-mode]"`）中，只需声明 `mcp = FastMCP("Server", transforms=[CodeMode()])`，原始工具即被隐藏，默认向 LLM 暴露 `search`、`get_schema` 与 `execute` 三个阶段的工具（底层内置 `Search`、`GetSchemas`、`GetTags`、`ListTools` 四种可配置发现器，支持 `"brief"`、`"detailed"` 与 `"full"` 三档详细度） [^12]。Runtime Step 首先使用 `Search`（基于 BM25 排序，默认返回 `"brief"` 单行描述）定位候选工具，接着调用 `GetSchemas`（默认返回 `"detailed"` Markdown 参数签名）了解调用契约，最后调用 `execute` 提交一段 Python 代码 [^12]。在基于 `MontySandboxProvider` 的隔离沙箱内，**唯一可用的外部函数是异步调用 `await call_tool(name, params)`**；沙箱默认施加严格的资源上限：最大总执行时间 `max_feed_duration_secs=30` 秒、最大内存 `max_memory=100_000_000`（100 MB）、最大递归深度 1,000，且每次 `call_tool` 均在当前请求上下文中复用 FastMCP 的权限检查逻辑 [^12]。

在企业级网关与集成平台方面，**Composio Tool Router** 为每个用户会话动态生成专属的 HTTP MCP URL，提供 `COMPOSIO_SEARCH_TOOLS`（跨 1,500+ 至 1,700+ 工具检索）、`Multi Execute Composio Tools`（并行批量执行器）、`Run bash commands`（远程 Bash 沙箱）以及 `Execute Code remotely in work bench`（在持久化远程 Jupyter 沙箱中执行批量工具脚本与远端文件处理） [^54]。而在 Go 原生网关 **Bifrost**（Maxim AI 报告在 5,000 RPS 下内部转发开销仅 11µs）的测试基准中，其通过 4 个元工具与 Python 沙箱实现的 Code Mode 在不同工具规模下展现了显著的降本增效表现：在 6 个 MCP 服务（96 个工具）下减少 58.2% 输入 Token、降低 55.7% 成本并缩短 26.8% 延迟；在 11 个服务（251 个工具）下减少 84.5% 输入 Token、降低 83.4% 成本并缩短 6.8% 延迟；在 16 个服务（508 个工具）下将输入 Token 从 7,510 万削减至 540 万（**减少 92.8% 输入 Token、降低 92.2% 成本、缩短 17.1% 延迟**），且将 LLM 调用轮次减少 3 至 4 倍 [^7]。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

### 4. 核心工程陷阱：动态加载中的“Byte-0 前缀缓存击穿（Prefix Busting）”与规避方案

在设计“由 Runtime Step 自主决定激活哪个工具”时，一个极易被忽视却会导致生产环境 API 账单激增 **10 倍至 20 倍** 的底层陷阱是：**在会话中途使用 MCP 原生的 `notifications/tools/list_changed` 动态修改根工具列表** [^16]。

根据 MCP 协议规范（包括 `2026-07-28` 版本的 `subscriptions/listen` `toolsListChanged`），当服务端调用 `.enable()` / `.disable()`（如 Speakeasy TypeScript SDK 示例中根据认证状态动态启停工具）或动态挂载新服务时，可以向客户端发送 `{"method": "notifications/tools/list_changed"}` 通知，触发客户端重新调用 `tools/list` 刷新可用工具列表 [^57]。例如，`docker/mcp-gateway`（在 `pkg/gateway/reload.go` 中调用 `AddTool` / `RemoveTools`）、`github-mcp-server` v1.0.5 的 `--dynamic-toolsets` 模式以及后台异步缓慢上线的远程连接器（导致工具数在连续轮次间从 `30 → 55 → 85` 动态增长）均触发了这一机制 [^16]。

然而，根据开发者社区（如 Sumedh Bala 与 Primeline 针对 Claude Code 计费与缓存架构的深度解析）对 API 载荷的剖析，每一次大模型 API 请求严格按照以下顺序从第 0 字节（Byte 0）向后渲染组装：`Layer 1（Byte 0 起始位置：tools 工具定义与静态 System Prompt） → Layer 2（中间位置：CLAUDE.md 与项目静态上下文） → Layer 3（尾部动态位置：messages 对话历史、tool_use 与 tool_result）` [^15]。由于大模型推理引擎的 **Prompt Caching（提示词缓存）采用严格的“从第 0 字节开始的逐字节前缀匹配（Strict Byte-Prefix Match）”**（且要求达到模型最低缓存前缀阈值，如 Opus 5 / Fable 5 为 512 Token，Opus 4.8 / Sonnet 5 / Sonnet 4.6 为 1,024 Token，Opus 4.6 / Haiku 4.5 为 4,096 Token），一旦在会话中途通过 `notifications/tools/list_changed` 向根部的 `tools` 数组新增或移除了任何一个工具，就会直接篡改 **Byte 0（Layer 1）** 的字节流 [^15]。这会导致后续所有层级（Layer 2 的项目文档 + Layer 3 累积的数万 Token 历史对话）的缓存键瞬间失效 [^15]。

在计费层面上，缓存命中读取（Cache Read）在大多数模型上仅需基准输入价格的 **0.1×**（90% 折扣；在 Claude Opus 5.5 上享受 95% 折扣即 **0.05×**，在 Fable 5.1 与 Mythos 5.1 上享受 97.5% 折扣即 **0.025×**），而缓存重建写入（Cache Write）在 5 分钟 TTL 档位下为基准输入价格的 **1.25×**（25% 附加费），在 Claude Code 主会话默认采用的 1 小时 TTL 档位下高达基准输入价格的 **2.0×**（100% 附加费） [^15]。如果在多个 Runtime Step 中频繁触发 `list_changed` 修改根部 `tools` 列表，每一次工具增删都会迫使整个长会话承受 **2.0× 对比 0.1×（相差 20 倍）** 的全量冷启动重建惩罚 [^15]。

为了在实现“单 MCP 动态按需加载”的同时维持前缀缓存稳定性，统一 MCP 服务端应当遵循以下两条缓存安全设计准则：第一，采用**单一固定分发器模式（Fixed Dispatcher Meta-Tools）**，即在会话全生命周期内冻结 `tools/list` 暴露的根元工具列表（或使用 `--strict-mcp-config` 锁定启动工具面），永不发送 `list_changed` 通知；当某个 Runtime Step 检索并加载新工具或新 Skill 时，将其完整 JSON Schema 与 `SKILL.md` 正文全部作为 `tool_result` 的内容放置在 **Layer 3（`messages` 数组尾部）**，随后的调用也作为参数传入固定的分发器元工具中 [^6]。第二，当配合原生支持 `ToolSearch` 的宿主使用时，采用名称占位与尾部追加（Tail Appending）机制，即在 Layer 1 仅保留静态工具名称列表，而将运行期按需拉取的完整 Schema 追加在对话历史尾部（Layer 3）而非回写修改 Layer 1 头部，从而保证 Byte-0 前缀跨轮次逐字节一致 [^15]。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

## 四、 MCP 反向驱动 `runtime dir`：动态决定与装配运行时目录的工程实现

在理解了 Runtime Step 如何通过单一 MCP 发现能力后，我们需要解决架构中另一半关键闭环：**为什么已经有了 MCP 协议，Agent Runtime 仍然需要本地 `runtime dir`（运行时目录）？以及这唯一激活的 MCP 服务如何动态决定并控制 `runtime dir` 中装配哪些 Skill、Plugin 和 MCP Tools？**

### 1. 为什么 `runtime dir` 在 MCP 架构下依然不可或缺？

尽管纯 API 查询类工具可以通过远端 HTTP MCP 调用完成，但在复杂的软件工程、文档处理与自动化任务中，Skill 与 Plugin 深度依赖本地工作区文件系统（`runtime dir`） [^1]。正如 Anthropic 在 Agent Skills 研究报告中指出的，具备文件系统与代码执行工具的 Agent 无需将整个技能包一次性读入上下文窗口，这意味着打包进一个 Skill 的背景知识容量在理论上是没有上限的 [^59]。例如，当某一步触发 PDF 处理或 Sentry 错误分析技能时，Agent 仅需先读取 `pdf/SKILL.md` 主干指令，随后按需通过本地 Bash 或 Read 工具读取同目录下的 `forms.md`、`references/sentry-mcp.md` 避坑指南、`assets/template.md` 模板，或直接执行 `python scripts/fill_form.py` 脚本与插件 `bin/` 目录下的可执行文件 [^21]。此外，根据 Agent Plugins 1.0.0 与 Claude Code 规范，插件在运行期需要将虚拟环境、`node_modules`、生成的代码、缓存及导出产物持久化写入 `${PLUGIN_DATA}`（或 `~/.claude/plugins/data/<id>/`、`.skills/exports/`）目录中 [^1]。

### 2. 协议红线：为什么不能依赖旧版 MCP `Roots` 机制？（`2026-07-28` 废弃说明）

在 2025 年代的早期 MCP 设计中，部分开发者曾利用客户端的 **`Roots`（根目录声明，`capabilities.roots`、`roots/list` 与 `notifications/roots/list_changed`）** 来动态更新服务端允许访问的工作区目录 [^17]。但在 2026 年的架构设计中，**不能将动态 `runtime dir` 装配建立在 `Roots` 原语之上**。

一方面，根据官方 `@modelcontextprotocol/server-filesystem` 文档与最新协议规范，**`Roots` 已自协议版本 `2026-07-28` 起被正式废弃（Deprecated）** [^17]。在 `2026-07-28` 协议版本中，传统的 `initialize` 握手与服务端向客户端发起的 `roots/list` 请求已被移除；现代客户端通过发送 `server/discover`（或携带单请求 `_meta` 信封）建立连接，服务端直接绑定启动时的命令行目录参数，完全不再执行 `Roots` 协商步骤 [^17]。另一方面，`Roots` 本质上仅是由客户端向服务端提供的“咨询性（Advisory）文件系统上下文”，不仅不具备操作系统层面的强制安全边界约束力 [^18]，而且其控制方向是“客户端限制服务端能访问哪些路径”（例如通过 `--confine-roots` 将客户端 `Roots` 限制在与服务端命令行目录的交集范围内） [^17]，而非“由统一 MCP 服务决定往 `runtime dir` 注入什么能力”。

### 3. 由单一 MCP 动态装配 `runtime dir` 的四种工程落地模式

为实现“由单个激活的 MCP 决定 `runtime dir` 需要什么 Skill、Plugin 与 MCP Tools”，现代 AI Runtime 发展出了四种具体的目录供给模式（可根据宿主环境是本地 IDE、容器沙箱还是云端受控环境组合选用）：

| 目录供给模式 | 代表框架 / 项目 | 触发与文件落盘机制 | 安全校验与目录隔离机制 | 适用场景 |
| --- | --- | --- | --- | --- |
| 模式 A：基于摘要校验的按需目录水合（Digest-Verified Hydration） | FastMCP 4.2（SkillsClientExtension + read_skill / to_directory） | Runtime Step 选定技能后，客户端调用 await client.read_skill(entry.uri) 拉取清单内全部文件，并调用 skill.to_directory(target / skill.name, overwrite=True) 原子写入本地技能目录（替代了 4.1 废弃的 sync_skills）。 | 落盘前强制检查单技能文件数 ≤512、总体积 ≤16 MiB，逐文件校验 SHA-256 摘要（digest） 与字节大小，并核对 Frontmatter 一致性。 | 本地 Agent 仅需按需拉取特定单个或少量轻量级 Skill 到 .claude/skills/ 等目录。 |
| 模式 B：受控归档流式解压模式（Controlled Archive Unpacking） | Microsoft Agent Framework（.NET Microsoft.Agents.AI.Mcp archive 模式） | 服务端将含大量模板、查找表与参考文档的复杂 Skill 打包为单一 ZIP/TAR/TAR.GZ 归档；客户端触发时一次性下载并解压至 ArchiveSkillsDirectory（如 extracted-skills/）。 | 通过 AgentMcpSkillsSourceOptions 强制实施三项防压缩炸弹配额：ArchiveMaxSizeBytes（最大下载体积）、ArchiveMaxUncompressedSizeBytes（最大解压总字节）与 ArchiveMaxFileCount（最大文件数），超限自动跳过，且默认禁止执行归档内脚本。 | 附带大量 references/ 与 assets/ 文件的复合型企业合规或研发规范包。 |
| 模式 C：单一规范源 + 多宿主原子符号链接投影（Canonical Symlink Projection） | Vercel npx skills CLI、@tech-leads-club/agent-skills、microsoft/skills | 将按需下载的技能/插件统一落盘至工作区单一规范目录 .agents/skills/（或 ./skills/ 及 ${PLUGIN_DATA}），随后动态向 .claude/skills、.cursor/skills、.codex/skills、.github/skills 创建符号链接（并将 CLAUDE.md 软链至 AGENTS.md）。 | 实施 Symlink Guards 防路径穿越，要求所有相对路径必须以 ./ 开头且严禁通过 ../ 逃逸出插件根目录；配合含内容哈希的原子锁文件（Atomic Lockfile）与 agent-skills audit 本地审计日志。 | 同一代码仓库需同时兼容 Claude Code、Cursor、Codex、OpenHands 等 70+ 种不同 Agent Runtime。 |
| 模式 D：零源码落盘的远端执行与 .skills 产物契约（Remote Execution & Artifact Export） | Hasna skills.md（@hasna/skills CLI + skills-mcp + 自托管 skills-serve） | 严禁将全量技能源码安装到 .claude 或 .codex 目录；Agent 通过 skills-mcp 检索远端目录、拉取 SKILL.md 参数说明并触发远端运行（生成 run-id），随后执行 skills exports download <run-id> 将生成物拉回本地。 | 本地仅维护受控的 .skills/ 状态目录契约：.skills/exports/<skill>/<run-id>/（存放生成的 PNG/SVG/Markdown 等产物）、.skills/runs/YYYY-MM-DD/<run-id>/（日志与回执）、.skills/project.json（版本固定 Pins）与 .skills/tmp/（运行期临时草稿）。 | 对源码保密、计费配额或沙箱隔离要求极高，不希望污染宿主配置目录的云端工作流。 |

## 五、 参考架构设计：构建“单 MCP 激活 + 动态 Runtime Dir 装配”的统一控制面

由于目前开源生态中尚无单一现成项目将“Byte-0 缓存安全的元工具网关（如 ToolHive / AIRIS）”与“跨宿主动态符号链接装配器（如 FastMCP `to_directory` + `npx skills` 软链机制）”无缝封装为开箱即用的单二进制文件，团队在 AI Runtime 中落地该目标时，最佳实践是基于 **FastMCP 4.2 + ToolHive/Qdrant 检索层 + 本地目录 Provisioner** 组合构建一个轻量级的**统一运行时编排 MCP 服务（Unified Runtime Orchestrator MCP）** [^4]。

### 1. 极简宿主接入层与统一元工具集设计

在该参考架构下，所有 Agent Runtime（无论是 Claude Code、Codex、OpenHands 还是自研框架）的 MCP 配置文件（如 `.mcp.json`）均仅需注册这一个统一入口 MCP 服务（本地环境通过 `stdio` 启动，容器或 Kubernetes 环境通过 `streamable-http` 连接并挂载共享 Workspace Volume） [^1]。

为确保前文所述的 **Prompt Cache Byte-0 稳定性**，该统一 MCP 服务在会话期间冻结 `tools/list`，仅向模型固定暴露以下 5 个正交元工具，供任意 Runtime Step 自主组合调用 [^3]：

| 元工具名称 | 负责阶段 | 输入参数签名 | 核心职责与对 runtime dir 的影响 |
| --- | --- | --- | --- |
| runtime_search | Step 阶段 1：意图发现 | query: str, kind?: "all" \| "skill" \| "tool" \| "plugin", tags?: list[str], top_k: int = 5 | 在进程内 SQLite FTS5 与向量库（仅对 SKILL.md Frontmatter 的 description + trigger_phrases 及工具摘要做 384 维 Embedding）中执行混合检索，返回 Top-K 候选能力的 ID、匹配得分与 ~100 Token 简述。 |
| runtime_activate | Step 阶段 2：按需水合与目录装配 | ids: list[str], mount_to_runtime_dir: bool = true, target_agent?: "auto" \| "claude" \| "openhands" \| "codex" | 核心控制枢纽：第一，在返回结果（Layer 3 tool_result）中追加目标 SKILL.md 正文、附属文件清单（tier3_manifest）及关联 MCP 工具的完整 JSON Schema；第二，若开启目录挂载，经 SHA-256 摘要与解压配额校验后，将所需 Skill/Plugin 的 scripts/、references/、assets/ 写入 ${WORKSPACE_ROOT}/.agents/skills/<name>（持久化数据写入 ${PLUGIN_DATA}），并向 .claude/skills/ 或 .openhands/microagents/ 创建原子符号链接；第三，在网关后台唤醒或连接该插件声明的子 MCP 服务并加入当前 Session 路由表。 |
| runtime_read_asset | Step 阶段 3：三级资源按需读取 | capability_id: str, relative_path: str | 当运行于无本地磁盘挂载的纯远端环境，或 Agent 需按需读取 tier3_manifest 中列出的特定长篇参考文档（如 references/sentry-mcp.md）时，经清单 URI 边界核验后返回文件内容。 |
| runtime_call_tool | Step 阶段 4A：单工具代理执行 | tool_name: str, arguments: dict | 根据 runtime_activate 已解锁的会话级工具路由表，将调用请求代理转发至对应的后端 MCP Server，执行参数校验与输出截断后返回结构化结果。 |
| runtime_exec_sandbox | Step 阶段 4B：多工具与脚本沙箱编排 | python_code?: str, skill_script?: {"id": str, "script": str, "args": list} | 融合两种沙箱执行能力：一是 Code Mode，在受限 Python 沙箱（30s 超时、100MB 内存上限）中运行模型编写的多步 await call_tool(...) 编排脚本；二是 Skill Script 托管执行，在剥离敏感环境变量的临时目录中安全执行技能附带的 scripts/*.py，并将生成的导出文件落盘至 runtime dir 的 .skills/exports/<skill>/<run-id>/ 目录。 |

### 2. 单步执行（Runtime Step）的完整自治工作流

以一个典型复合任务（如：*“排查 Sentry 过去 72 小时生产环境报错排名前 5 的问题，按根因聚合后生成分析报告”*）为例，单个 Runtime Step 的自治流转仅需四个紧凑阶段：

1. **自主意图检索**：模型在初始状态下仅见上述 5 个元工具，首先调用 `runtime_search(query="Sentry error analysis root cause grouping", kind="all")` [^6]。统一 MCP 返回高置信度匹配项：`skill:sentry-mcp-reference` 与 `plugin:sentry-mcp-server` [^11]。
2. **能力水合与 `runtime dir` 动态装配**：模型调用 `runtime_activate(ids=["skill:sentry-mcp-reference", "plugin:sentry-mcp-server"], mount_to_runtime_dir=true)` [^3]。统一 MCP 服务随即将 `SKILL.md` 的五步分析规程与 Sentry 工具的 JSON Schema 作为 `tool_result` 注入对话尾部（不触碰 Byte 0 缓存前缀） [^11]；同时将附属的 `references/sentry-mcp.md` 校验落盘至 `.agents/skills/sentry-mcp-reference/` 并软链至当前宿主的技能目录，在网关后台完成 Sentry MCP 连接预热 [^4]。
3. **按需加载三级参考文档**：模型遵循刚注入的 `SKILL.md` 第一步强制规程（*“Before doing anything else, read the full MCP reference: references/sentry-mcp.md”*） [^38]，通过本地文件读取或 `runtime_read_asset` 获取 Sentry 查询语法、必填参数组合与分页限制等避坑细节 [^11]。
4. **沙箱编排执行与产物输出**：模型调用 `runtime_exec_sandbox` 提交一段 Python 异步脚本，在服务端沙箱中调用 `await call_tool(...)` 拉取前 50 条高频未解决报错及 Top 5 堆栈详情，在沙箱内完成根因归类与数据清洗，仅将最终结构化的 Markdown 错误报告返回主上下文或写入 `.skills/exports/` 目录 [^12]。

### 3. 架构边界辨析：步内即时热加载 vs. 宿主启动期静态绑定

在工程落地中，架构师需清晰区分哪些组件可在任意 Runtime Step 内实现**步内即时热加载（In-Step Hot Loading）**，哪些组件受制于现有 Agent 宿主的**会话启动期绑定（Session-Start Binding）**：

- **支持在任意 Runtime Step 内即时热加载的组件**：包括所有后端 **MCP Tools**（由统一 MCP 网关在内部路由表中动态解锁并经由 `runtime_call_tool` 或 `runtime_exec_sandbox` 代理调用，宿主无需重连） [^6]，以及所有的 **Skills（`SKILL.md` 正文、三级 `references/` 文档、`assets/` 模板与 `scripts/` 脚本）**（通过 `tool_result` 注入上下文，或将文件动态解压/软链至 `runtime dir` 供 Agent 原生文件与终端工具立即访问） [^4]。
- **受限于宿主会话启动绑定的组件及其网关层绕过方案**：根据 Claude Code、OpenAI Codex 与 OpenHands 的官方文档，插件包内的**原生宿主生命周期钩子（`hooks/hooks.json`、`.openhands/hooks.json`）**、**后台常驻监控器（`monitors/monitors.json`，除非预先配置了延迟启动的 `when` 条件）**、**LSP 语言服务（`.lsp.json`）**、**宿主 Shell `PATH` 注入（`bin/`）**以及**宿主静态扫描的设置文件（`.claude/settings.json`、`.codex/config.toml`）**，均在会话启动（Session Startup）或显式重载插件时由宿主进程读取并绑定（在 Codex 桌面端更新本地插件后甚至需要重启桌面应用才能生效） [^21]。这意味着在某个 Runtime Step 中途单纯往磁盘写入一个 `hooks.json`，宿主并不会在当前步自动挂载该钩子 [^21]。
- **网关中间件代管机制（Gateway-Intercepted Lifecycle）**：若业务要求某个插件附带的质量门禁或后置处理钩子（例如代码编辑后的 `scripts/format.sh` 或任务结束前的 `.openhands/hooks/quality_gate.sh`）在动态激活的当步立即生效，**不应等待宿主重启，而应将该 Hook 注册到统一 MCP 服务的中间件管道（Middleware Pipeline，如 MetaMCP、Bifrost 或自研网关的拦截层）中** [^7]。当后续 Runtime Step 通过统一 MCP 执行工具调用或触发完成动作时，由统一 MCP 网关在服务端或本地工作区直接触发对应的校验脚本；若质量检查未通过（如返回非零退出码），网关直接在 `tool_result` 中向模型返回拒绝原因（如 `{"decision":"deny","reason":"Quality checks failed. Fix them before finishing."}`），从而在不依赖特定宿主内部钩子实现的前提下，实现跨所有 Agent Runtime 的动态插件生命周期控制 [^7]。

## 六、 安全边界与生产级治理（Security, Integrity & Governance）

当赋予单个统一 MCP 服务“动态决定并向 `runtime dir` 注入技能、脚本与工具”的核心控制权时，安全边界也随之集中在该控制面上。恶意或被污染的 Skill 与 MCP 工具可能诱导智能体以当前用户权限执行危险命令、泄露本地敏感数据或造成供应链投毒 [^21]。生产环境部署应强制落实以下四层安全治理规范：

1. **清单摘要锁定与跨源隔离（Manifest Digest Pinning & Origin Tagging）**：严格执行 `SEP-2640` 宿主安全规范，在将任何 Skill 或 Plugin 文件写入 `runtime dir` 或读入上下文前，必须将文件读取范围严格限制在已保留的 `resources` 清单（Manifest）内，逐文件校验精确字节大小与 **SHA-256 摘要（`digest`）**，并逐字段比对 `SKILL.md` 的 YAML Frontmatter [^4]。一旦任何文件发生修改、新增或移除，此前持久化的用户授权必须立即失效并触发刷新重审 [^5]。同时，严禁同名技能静默覆盖，必须为加载的内容打上来源服务器标签（Origin Label），跨服务读取资源或激活嵌套技能（Nested Skills）均需获取显式用户授权，且本地磁盘缓存必须排除在常规文件系统扫描路径之外并保持防篡改属性 [^5]。
2. **提示词注入扫描与脚本沙箱隔离（Prompt Injection Scanning & Script Sandboxing）**：在构建统一技能与插件注册表时，应在 CI/CD 与种子入库阶段引入静态扫描（如 `skills-mcp` 覆盖 9 大攻击类别的 `prompt_injection.py` 与 `validate_skills.py`），阻断含高危提示词注入特征的 `SKILL.md` 入库；在运行期，对外部工具返回的 `tool_result` 部署内容安全护栏（如 Composio Firewall 或 Bifrost 的请求前/返回后双阶段 LLM Judge 审查与脱敏），并对超长工具输出实施强制截断（如 Codex 的 10 KiB / 256 行上限或 `skills-mcp` 的 10,000 字符上限） [^3]。对于动态拉取的远程 `archive` 技能包，应默认禁止执行包内附带的可执行脚本 [^13]；若必须执行技能脚本，应在剥离了宿主机敏感凭证且封锁了 `PATH`、`LD_PRELOAD`、`PYTHONPATH` 环境变量注入的独立临时目录、Docker 容器或操作系统内核级沙箱（如 VS Code OS Kernel Sandboxing）中运行，并配置 30 秒硬超时终止机制 [^2]。
3. **OAuth 2.1 受众绑定与禁止令牌透传（RFC 8707 & Confused-Deputy Prevention）**：遵循 MCP `2025-06-18` 至 `2026-07-28` 授权加固规范，当统一 MCP 服务以远程传输模式运行时，必须作为 OAuth 2.1 资源服务器暴露 RFC 9728 受保护资源元数据，且客户端请求的访问令牌必须使用 **RFC 8707 资源指示符（Resource Indicators）** 显式绑定到单一目标 MCP 服务受众 [^18]。尤为关键的是，**严禁令牌直接透传（No Token Passthrough）**——统一 MCP 网关绝不能将客户端发来的访问令牌直接转发给下游被代理的子 MCP 服务或第三方 API（以防“糊涂副手 Confused-Deputy”攻击），而应在网关层通过工具级虚拟密钥（Virtual Keys，如 Bifrost）、OAuth 令牌交换（Token Exchange）或与外部密钥库（HashiCorp Vault、AWS Secrets Manager 等）集成的每用户加密凭据，为下游调用签发窄作用域的独立凭证 [^7]。
4. **默认拒绝与运行时框架强制执行（Deny-by-Default & Harness Enforcement）**：鉴于美国国家安全局（NSA，2026 年 5 月）等机构的安全评估指出原生 MCP 协议本身缺乏内建的实例化 RBAC 权限交换与令牌生命周期管理，权限控制绝不能交由概率性的大模型自行判断，也不能盲目信任未授信服务端声明的 `readOnlyHint: true` 注解（协议 Schema 默认将未声明工具视为 `destructiveHint: true`） [^18]。访问控制必须在统一 MCP 网关与客户端运行时框架（Harness）层以代码强制执行：实施“默认拒绝（Deny-by-Default）”与“拒绝规则优先于允许规则（Deny Overrides Allow）”策略，支持通过虚拟密钥与单次请求 Header 动态收窄（但绝不允许拓宽）可用工具范围，并对状态变更操作、文件写入及脚本加载工具（如 `load_skill`、`run_skill_script`）保留显式的人工确认（Human-in-the-Loop）门禁 [^7]。

---

## 📚 参考文献与引用源

1. [**techwithibrahim.medium.com**｜Agent Plugins Explained: Skills and MCP in One Folder - Medium](https://techwithibrahim.medium.com/agent-plugins-explained-skills-and-mcp-in-one-folder-9f6e49b517d7)
2. [**bitdoze.com**｜What Is MCP (Model Context Protocol)? Beginner's Guide 2026](https://www.bitdoze.com/mcp-introduction-beginners/)
3. [**github.com**｜Deferred Tool Loading / Tool Search capability · Issue #40 - GitHub](https://github.com/pydantic/pydantic-ai-harness/issues/40)
4. [**gofastmcp.com**｜Skills over MCP - FastMCP](https://gofastmcp.com/docs/servers/skills)
5. [**modelcontextprotocol.io**｜Skills - Model Context Protocol](https://modelcontextprotocol.io/extensions/skills/overview)
6. [**github.com**](https://github.com/agiletec-inc/airis-mcp-gateway/issues/21)
7. [**getmaxim.ai**｜Best Open Source MCP Gateways for Claude Code in 2026 - Maxim AI](https://www.getmaxim.ai/articles/open-source-mcp-gateways-claude-code/)
8. [**github.com**｜Local vMCP CLI Mode - stacklok/toolhive - GitHub](https://github.com/stacklok/toolhive/blob/main/docs/arch/vmcp-local.md)
9. [**atcyrus.com**｜What is MCP Tool Search? The Claude Code feature that fixes - Cyrus](https://www.atcyrus.com/stories/mcp-tool-search-claude-code-context-pollution-guide)
10. [**github.com**](https://github.com/docker/mcp-gateway/issues/187)
11. [**mcpservers.org**｜skills-mcp - Awesome MCP Servers](https://mcpservers.org/servers/jignesh-ponamwar/skills-mcp)
12. [**gofastmcp.com**｜Code Mode - FastMCP](https://gofastmcp.com/docs/servers/transforms/code-mode)
13. [**devblogs.microsoft.com**｜Discover Agent Skills from MCP servers in .NET](https://devblogs.microsoft.com/agent-framework/discover-agent-skills-from-mcp-servers-in-net/)
14. [**github.com**｜GitHub - tech-leads-club/agent-skills](https://github.com/tech-leads-club/agent-skills)
15. [**primeline.cc**｜Claude Code Prompt Caching: The One Rule Behind It - PrimeLine](https://primeline.cc/blog/prompt-caching)
16. [**dev.to**](https://dev.to/sumedhbala/claude-code-costs-act-i-how-the-billing-actually-works-25kn)
17. [**github.com**｜servers/src/filesystem/README.md at main - GitHub](https://github.com/modelcontextprotocol/servers/blob/main/src/filesystem/README.md)
18. [**intuitionlabs.ai**｜MCP Server Permissions Architecture: A Reference Guide](https://intuitionlabs.ai/articles/mcp-permissions-data-boundaries-architecture)
19. [**mcpjam.com**｜MCPJam now supports Skills over MCP](https://www.mcpjam.com/blog/skills-over-mcp-charter)
20. [**github.com**｜metatool-ai/metamcp: MCP Aggregator, Orchestrator, Middleware](https://github.com/metatool-ai/metamcp)
21. [**code.claude.com**｜Plugins overview - Claude Code Docs](https://code.claude.com/docs/en/plugins/overview)
22. [**codelibrary.ai**｜metamcp - MCP Server - AI coding](https://www.codelibrary.ai/mcp/metamcp)
23. [**code.claude.com**｜Explore the .claude directory - Claude Code Docs](https://code.claude.com/docs/en/claude-directory)
24. [**skillsdirectory.com**｜Add Agent (Grade A) - Claude Skill | Skills Directory](https://www.skillsdirectory.com/skills/ranbot-ai-add-agent)
25. [**ai.plainenglish.io**｜The Claude Code project structure I wish I had from day one](https://ai.plainenglish.io/the-claude-code-project-structure-i-wish-i-had-from-day-one-1340effeb90d)
26. [**solo.io**｜MCP Progressive Disclosure: Save Tokens, Retrieve Schemas](https://www.solo.io/blog/mcp-progressive-disclosure)
27. [**github.com**｜[BUG] Tool Search (ENABLE_TOOL_SEARCH) does not defer](https://github.com/anthropics/claude-code/issues/40314)
28. [**reddit.com**｜Anyone else's agent get dumber the more MCP servers you connect?](https://www.reddit.com/r/mcp/comments/1xsn62w/anyone_elses_agent_get_dumber_the_more_mcp/)
29. [**getclaudeskills.com**｜Plugin Structure for Claude Code - Guide and Best Practices](https://www.getclaudeskills.com/skills/plugin-structure-anthropics)
30. [**developers.openai.com**｜Skills – Plugins | OpenAI Developers](https://developers.openai.com/plugins/concepts/skills)
31. [**docs.openhands.dev**｜Repository Customization - OpenHands Docs](https://docs.openhands.dev/openhands/usage/customization/repository)
32. [**yozhef.medium.com**｜Unifying AI skills across Cursor and Claude Code - Medium](https://yozhef.medium.com/unifying-ai-skills-across-cursor-and-claude-code-3c34c44eafd2)
33. [**nimbalyst.com**｜Claude Code Plugins: A 2026 Guide - Nimbalyst](https://nimbalyst.com/blog/claude-code-plugins-guide/)
34. [**gitbook.com**｜MCP vs skill.md — what's the difference and why you need both](https://www.gitbook.com/blog/mcp-vs-skill-md-difference-why-you-need-both)
35. [**alain-airom.medium.com**｜MCP Context Forge Gateway — Try it now! | by Alain Airom (Ayrom)](https://alain-airom.medium.com/mcp-context-forge-gateway-try-it-now-d4fca7c4111e)
36. [**aaif.io**｜Skills Over MCP - Agentic AI Foundation (AAIF)](https://aaif.io/blog/skills-over-mcp)
37. [**dev.to**｜Every Official Skill Repo I Use, From React to Rust - DEV Community](https://dev.to/shreyvijayvargiya/claude-code-skills-directory-every-official-skill-repo-i-use-from-react-to-rust-42e5)
38. [**github.com**｜claude-code-ultimate-guide/examples/skills/mcp-integration](https://github.com/FlorianBruniaux/claude-code-ultimate-guide/blob/main/examples/skills/mcp-integration-reference/SKILL.md)
39. [**github.com**｜Bring Claude's Skills pattern to any MCP-compatible agent - GitHub](https://github.com/skills-mcp/skills-mcp)
40. [**mcpmarket.com**｜Skill Server: Universal Claude Skill Integration for AI Agents](https://mcpmarket.com/server/skill-server)
41. [**modelscope.ai**｜pm-skills-mcp - ModelScope.ai](https://www.modelscope.ai/mcp/servers/mohitagw15856/pm-skills-mcp)
42. [**blog.lhotka.net**｜Agent Resources and Tools - Rockford Lhotka's Blog](https://blog.lhotka.net/2026/03/09/Agent-Resources-And-Tools)
43. [**github.com**｜GitHub - IBM/mcp-context-forge: An AI Gateway, registry, and proxy](https://github.com/IBM/mcp-context-forge)
44. [**sourceforge.net**｜MCPJungle download | SourceForge.net](https://sourceforge.net/projects/mcpjungle.mirror/)
45. [**railway.com**｜Deploy & Host ContextForge - Railway](https://railway.com/deploy/contextforge)
46. [**chatforest.com**｜ChatForest — MCP Reviews, AI Builder Guides & Daily News](https://chatforest.com/)
47. [**pkg.go.dev**｜mcp-snooze command - Go Packages](https://pkg.go.dev/github.com/askmegit/mcp-snooze)
48. [**github.com**｜huangjunsen0406/xiaozhi-mcphub: MCP bridge system optimized](https://github.com/huangjunsen0406/xiaozhi-mcphub/)
49. [**cyberelectro.hu**｜MCPHub: running many MCP servers behind one endpoint](https://cyberelectro.hu/en/tools/mcphub/)
50. [**github.com**｜$smart/call_tool drops nested arguments for strict JSON-schema](https://github.com/samanhappy/mcphub/issues/873)
51. [**code.claude.com**](https://code.claude.com/docs/en/mcp)
52. [**docs.orq.ai**｜Claude Code - Orq.ai Documentation](https://docs.orq.ai/ai-studio/integrations/code-assistants/claude-code)
53. [**medium.com**](https://medium.com/@scalablecto/lets-just-stop-saying-the-problem-with-mcp-is-context-bloat-ab051ac2341e)
54. [**composio.dev**｜Composio MCP Server](https://composio.dev/toolkits/composio)
55. [**composio.dev**｜Metaads MCP Integration with Vercel AI SDK - Composio](https://composio.dev/toolkits/metaads/framework/ai-sdk)
56. [**docs.composio.dev**｜Session - Composio Docs](https://docs.composio.dev/reference/sdk-reference/typescript/session)
57. [**speakeasy.com**｜Dynamic tool discovery in MCP - Speakeasy](https://www.speakeasy.com/mcp/tool-design/dynamic-tool-discovery)
58. [**reddit.com**｜Dumping every MCP tool schema every turn is a harness bug - Reddit](https://www.reddit.com/r/AI_Agents/comments/1x6hoi5/dumping_every_mcp_tool_schema_every_turn_is_a/)
59. [**anthropic.com**｜Equipping agents with Agent Skills - Anthropic](https://www.anthropic.com/research/equipping-agents-for-the-real-world-with-agent-skills)
60. [**skills.md**｜skills.md | API-based skills for agents](https://skills.md/)
61. [**glama.ai**｜Filesystem MCP Server by modelcontextprotocol - Glama](https://glama.ai/mcp/servers/modelcontextprotocol/filesystem)
62. [**npmjs.com**｜@modelcontextprotocol/server-filesystem - NPM](https://www.npmjs.com/package/@modelcontextprotocol/server-filesystem)
63. [**github.com**｜GitHub - microsoft/skills: Skills, MCP servers, Custom Agents, Agents](https://github.com/microsoft/skills)
64. [**ai-sdk.dev**｜Coding Agents - AI SDK](https://ai-sdk.dev/docs/getting-started/coding-agents)
65. [**gitlab.com**｜SKAO / SKA AI Skills - GitLab](https://gitlab.com/ska-telescope/ska-ai-skills)
66. [**composio.dev**｜How to integrate Composio search MCP with Pydantic AI](https://composio.dev/toolkits/composio_search/framework/pydantic-ai)
67. [**github.com**｜GitHub - Paldom/mcp-server-skills: Agent Skills for designing and](https://github.com/paldom/mcp-server-skills)
68. [**metamcp.com**｜MetaMCP](https://metamcp.com/)
69. [**zeabur.com**｜MetaMCP Deploy Guide - Zeabur](https://zeabur.com/templates/H7JF5O)
70. [**github.com**｜a proxy aggregator for multiple remote and local servers #82 - GitHub](https://github.com/sparfenyuk/mcp-proxy/issues/82)
71. [**mcpservers.org**｜MetaMCP - Awesome MCP Servers](https://mcpservers.org/servers/metatool-ai/mcp-server-metamcp)
72. [**mcpmarket.com**｜MetaMCP: Manage Multiple MCP Servers Efficiently](https://mcpmarket.com/server/metamcp)
73. [**github.com**｜MetaMCP - haoruilee/awesome-agent-native-services - GitHub](https://github.com/haoruilee/awesome-agent-native-services/blob/main/services/tool-access-and-integration/metamcp.md)
74. [**skillsllm.com**｜metamcp - MCP Servers on GitHub (2.8k ) | SkillsLLM](https://skillsllm.com/skill/metamcp)
75. [**github.com**｜How do you register MCP servers with this proxy? · Issue #14 - GitHub](https://github.com/metatool-ai/mcp-server-metamcp/issues/14)
76. [**github.com**｜README.md - GitHub](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/plugin-dev/skills/plugin-structure/README.md?plain=1)
77. [**github.com**｜abordage/awesome-mcp: Curated list of Model Context ... - GitHub](https://github.com/abordage/awesome-mcp)
78. [**doc-3jig-1eo0-issuetracker.googleusercontent.com**｜Airlanggayudhoyono@Intel-Mil.Info [497404191] - Issue Tracker](https://doc-3jig-1eo0-issuetracker.googleusercontent.com/issues/497404191)
79. [**deepwiki.com**｜mcpjungle/MCPJungle | DeepWiki](https://deepwiki.com/mcpjungle/MCPJungle)
80. [**speakeasy.com**｜Speakeasy vs IBM ContextForge: Should you run your own MCP](https://www.speakeasy.com/blog/speakeasy-vs-ibm-contextforge)
81. [**docs.fireworks.ai**｜Anthropic compatibility - Fireworks AI Docs](https://docs.fireworks.ai/tools-sdks/anthropic-compatibility)
82. [**epsilla.com**｜Tool Search: Redefining Agent Tool Calling (Epsilla Insights)](https://www.epsilla.com/blogs/2026-04-19-tool-search-redefining-agent-tool-calling-epsilla-)
83. [**learn.chatgpt.com**｜Configuration Reference - ChatGPT Learn](https://learn.chatgpt.com/docs/config-file/config-reference)
84. [**github.com**｜Filesystem MCP Server - README.md - GitHub](https://github.com/modelcontextprotocol/servers/blob/main/src%2Ffilesystem%2FREADME.md)
85. [**docs.akuity.io**｜MCP Server - Akuity Docs](https://docs.akuity.io/self-hosted/mcp-server)
86. [**composio.dev**｜MCP vs function calling: When to use each - Composio](https://composio.dev/content/mcp-vs-function-calling-when-to-use-each)
87. [**context7.com**｜Composio Skills (composio-community/skills) - Context7](https://context7.com/composio-community/skills)
88. [**daily.dev**｜Agent Plugins Explained: Skills and MCP in One Folder - Daily.dev](https://daily.dev/posts/agent-plugins-explained-skills-and-mcp-in-one-folder-oszuhbwpc)
89. [**mcpservers.org**｜Plugin Structure | Claude Skills & Agent Skills Library](https://mcpservers.org/agent-skills/anthropic/plugin-structure)
90. [**youtube.com**｜MCP, Skills, and Plugins Explained for Salesforce Admins - YouTube](https://www.youtube.com/watch?v=8S1uGhSVUzY)
91. [**composio.dev**｜How to integrate Metaads MCP with LangChain - Composio](https://composio.dev/toolkits/metaads/framework/langchain)
92. [**composio.dev**｜Metaads MCP Integration with CrewAI - Composio](https://composio.dev/toolkits/metaads/framework/crew-ai)
93. [**lobehub.com**｜xiaozhi-mcphub | MCP Servers - LobeHub](https://lobehub.com/pl/mcp/huangjunsen0406-xiaozhi-mcphub)
94. [**theagentnative.com**｜MetaMCP - Awesome Agent-Native Services](https://theagentnative.com/services/metamcp/)
95. [**reddit.com**｜Managing ~560 MCP tools in my Open-WebUI setup ... - Reddit](https://www.reddit.com/r/OpenWebUI/comments/1wdqir5/managing_560_mcp_tools_in_my_openwebui_setup/)
96. [**github.com**｜github-mcp-skill/SKILL.md at main · kerim/github-mcp-skill · GitHub](https://github.com/kerim/github-mcp-skill/blob/main/SKILL.md)
97. [**github.com**｜skills/skills/mcp-builder/SKILL.md at main · anthropics/skills - GitHub](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/SKILL.md)
98. [**github.com**｜dotfiles/.claude/skills/mcp-cli/SKILL.md at main · obra/dotfiles · GitHub](https://github.com/obra/dotfiles/blob/main/.claude/skills/mcp-cli/SKILL.md)
99. [**github.com**｜claude-skills/plugins/integrations/skills/mcp-builder/SKILL.md at main](https://github.com/jezweb/claude-skills/blob/main/plugins/integrations/skills/mcp-builder/SKILL.md)
100. [**timerise.ai**｜Our Agent Skills, and What Is Inside Them - Timerise](https://timerise.ai/blog/agent-skills-and-what-is-inside-them)
101. [**github.com**｜pkuppens/skills: Curated and personal list of AI Agent ... - GitHub](https://github.com/pkuppens/skills)
102. [**github.com**｜Releases · OpenHands/OpenHands-CLI - GitHub](https://github.com/OpenHands/OpenHands-CLI/releases)
103. [**samanhappy.com**｜Unlimited Tools, Smart Routing: MCPHub Leads the New Paradigm](https://samanhappy.com/en/writing/smart-routing)
104. [**blog.csdn.net**｜从索引到语义搜索：MCPHub向量嵌入完整生命周期深度解析原创](https://blog.csdn.net/gitblog_00949/article/details/160657602)
105. [**mcp.aibase.com**｜Skills MCP Server - AI Agent](https://mcp.aibase.com/server/1574493236788207666)
106. [**reddit.com**｜Awesome Agent Skills MCP Server – Provides access to over 100](https://www.reddit.com/r/mcp/comments/1s62me8/awesome_agent_skills_mcp_server_provides_access/)
107. [**mcp.so**｜Pm Skills | MCP Server - MCP.so](https://mcp.so/servers/pm-claude-skills)
108. [**docs.surogate.ai**｜Copilot ( +/) | Surogate Docs](https://docs.surogate.ai/develop/tools/copilot/)
109. [**github.com**｜StacklokLabs/skills-mcp: Expose Agent Skills via an MCP ... - GitHub](https://github.com/StacklokLabs/skills-mcp)
110. [**weavz.io**｜Sandbox MCP Integration — 1 Tool | Weavz](https://weavz.io/integrations/advanced-code)
111. [**ai-tldr.dev**｜Code Execution vs More Tools for AI Agents | AI/TLDR](https://ai-tldr.dev/learn/ai-agents/tool-use/code-execution-vs-more-tools/)
112. [**hoangyell.com**](https://hoangyell.com/vercel-skills-explained/)
113. [**blog.csdn.net**](https://blog.csdn.net/gitblog_01403/article/details/149930125)

