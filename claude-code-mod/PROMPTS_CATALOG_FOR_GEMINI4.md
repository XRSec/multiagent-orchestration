# Claude Code 全量 Prompt 与拼装语句全景手册（Gemini 4 润色专用版）

> **目标**：本文档与配套的 [`claude_code_all_prompts_for_gemini4.json`](./claude_code_all_prompts_for_gemini4.json) 汇集了 **Claude Code (v2.1.326)** 内部提取出的全部 **1,206 条** 原子提示词、工具描述、子智能体协议与运行时动态拼接语句。
> 后续由 **Gemini 4** 对这些语句进行工业级专业润色、格式重塑，并注入 AGY 核心智能体哲学。润色后的文件可直接配合 [`tweakcc`](https://github.com/Piebald-AI/tweakcc) 刷回本地二进制运行。

---

## 一、 数据集总览

- **Claude Code 对应版本**：`v2.1.326`（截至 2026年11月最新发布）
- **原子 Prompt 总数**：`1206` 条
- **全量 JSON 数据文件**：[`claude_code_all_prompts_for_gemini4.json`](file:///Users/xr/.gemini/antigravity/scratch/claude-code-mod/claude_code_all_prompts_for_gemini4.json) (2.3 MB)
- **底层分类分布**：
  - **`agent`**: 98 条
  - **`data`**: 292 条
  - **`skill`**: 82 条
  - **`system`**: 438 条
  - **`tool`**: 296 条

---

## 二、 Claude Code 拼装运行时机制（Assembly Architecture）

在将 Prompt 交给 Gemini 4 进行润色前，必须理解 Claude Code **不是单一大模型提示词，而是 6 层动态装配流**：

```text
[1. 静态主干] (Global Cache Scope)
  ├── IntroSection (身份定义 & 网络安全红线)
  ├── SystemSection (输出渲染、权限拒绝、Hook处理)
  ├── DoingTasksSection (工程准则、避免过度抽象、真实报告)
  ├── ActionsSection (爆炸半径与高危操作二次确认)
  ├── UsingYourToolsSection (专用工具优先、并发批处理)
  ├── ToneAndStyleSection (直接、简洁、无废话)
  └── OutputEfficiencySection (Token 压缩)
           │
           ▼
[2. 缓存隔离边界] (__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__)
           │
           ▼
[3. 动态 Section] (Session Dynamic Scope)
  ├── SessionGuidance (会话动态引导)
  ├── MemorySection (MEMORY.md 索引与记忆协议)
  ├── Language / OutputStyle / McpInstructions
  └── Subagent / Swarm Guidance
           │
           ▼
[4. 优先级仲裁器] (buildEffectiveSystemPrompt)
  Override (0) > Coordinator (1) > Agent (2) > Custom (3) > Default (4) + AppendSystemPrompt
           │
           ▼
[5. 运行时上下文注入总线]
  ├── UserContext: CLAUDE.md / AGENTS.md + 当前系统日期
  └── SystemContext: Git Status 脏文件快照 + Cache Breaker
           │
           ▼
[6. 专项任务协议]
  ├── Microcompact: 强力零工具纯文本压缩 (<analysis> + <summary>)
  ├── SessionMemory: 单工具 (Edit) 增量笔记维护
  └── ExtractMemories: 后台无感知原子记忆提取
```

---

## 三、 核心类别代表性 Prompt 及其润色指引

### 1. `system` 分类（共 438 条，含核心主提示词与系统提醒）
- **涵盖范围**：
  - `system-prompt-*` (202条)：控制主 Agent 行为基线（如 `system-prompt-action-safety-and-truthful-reporting.md`、`system-prompt-act-when-ready.md`、`system-prompt-auto-mode.md`）。
  - `system-reminder-*` (236条)：运行态插入的系统提醒（如上下文压缩提醒、新技能可用提醒、文件已存在提醒）。
- **Gemini 4 润色方向**：
  - **精简负向命令**：原版充斥大量重复的“Don't do this... Don't do that...”，应重塑为高密度的 Markdown 表格（`| Fact | Implication |` 或 `| 场景 | 行动规范 |`）。
  - **去除特定模型补丁**：清除内部针对旧评测模型（如 Capybara 防过度注释、防刷分）的补丁字眼，转换为通用的软件工程自律原则。

### 2. `agent` 分类（共 98 条，所有子智能体体系）
- **涵盖范围**：
  - `agent-prompt-explore.md`：只读文件探索子智能体。
  - `agent-prompt-plan-mode-enhanced.md`：增强型规划模式智能体。
  - `agent-prompt-coordinator-worker-instructions.md`：Coordinator 集中调度器提示词。
  - `agent-prompt-code-review-part-*.md`：分阶段（Finder -> Gap Sweep -> Verification -> Reporting）代码审查智能体家族。
  - `agent-prompt-dream-memory-consolidation.md`：长期记忆沉淀与知识图谱合并智能体。
- **Gemini 4 润色方向**：
  - **明确单向契约**：给子智能体注入明确的停止条件（Completion Condition）与结构化回流协议（如 `<task-notification>`）。
  - **强化沙箱意识**：明确区分单轮临时执行（Inherit context）与独立 Git Worktree（Branch 隔离）。

### 3. `tool` 分类（共 296 条，内置工具与参数定义）
- **涵盖范围**：
  - `tool-description-*` (262条)：每个工具在 Tool Definitions 中暴露给模型的描述。
  - `tool-parameter-*` (34条)：参数级格式与语义约束。
- **Gemini 4 润色方向**：
  - **增强工具调用的确定性**：如强化 `FileEdit` 的唯一匹配约束、`FileRead` 的分块行号约束、`Bash` 的非交互式后台任务约束。
  - **支持 RTK 与精简输出**：指导模型在调用工具时优先利用降噪过滤器，提升 Token 利用率。

### 4. `skill` 分类（共 82 条，内置专业技能引导词）
- **涵盖范围**：
  - `/batch`、`/code-review`、`/verify`、`/init`、`/doctor` 等斜杠技能的阶段性指导。
- **Gemini 4 润色方向**：
  - 将其重构为标准化的 `SKILL.md` 格式规范，支持渐进式加载（Progressive Disclosure），避免在不需要时占用前置上下文。

### 5. `data` 分类（共 292 条，数据载荷与环境模板）
- **涵盖范围**：
  - 沙箱配置文件、SDK 交互信封、中断重试模板、遥测上报契约。

---

## 四、 配合 tweakcc 一键 Patch 回本地安装

通过本项目提取并经 Gemini 4 润色后的提示词，可以直接配合刚刚克隆的 [`tweakcc`](./tweakcc) 部署生效：

1. **直接替换对应的 Markdown 文件**：
   `piebald-claude-code-system-prompts/system-prompts/{target_file}.md` 经润色后保存。
2. **运行 tweakcc 进行二进制重打包**：
   ```bash
   cd /Users/xr/.gemini/antigravity/scratch/claude-code-mod/tweakcc
   # tweakcc 会自动识别本地安装的 Claude Code (无论是 pnpm 全局包还是 Mach-O 原生二进制)
   # 并无缝将修改后的 Markdown 替换嵌入二进制的字符串表
   npx tweakcc
   ```
