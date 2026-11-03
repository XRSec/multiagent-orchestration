# Handoff Report: Partner Assets, Layout & R2 Strategy Investigation

## 1. Observation (客观事实与直接观测)

### 1.1 资产分布与软链接同步机制
- **脚本路径核实**: 用户任务中提及的 `scripts/link-agents.ts` 实际在代码库中命名为 `scripts/link-agents.mjs`（见 `package.json:16` `"agents:link": "node scripts/link-agents.mjs"`），Node.js 18+ 原生 ESM 运行。
- **构建态资产平面 (Build-Time Plane)**: 位于 `packages/runtime-assets/`:
  - `prompts/`: `00-harness-injection.md`, `01-partner-base-soul.md`
  - `builtin-partners/`: 现有 6 个内置伙伴目录:
    1. `agent-architect`
    2. `cindy-r`
    3. `claude-sdk-architect`
    4. `doc-skill-keeper`
    5. `lead-orchestrator`
    6. `rea-partner`
- **运行态沙箱平面 (Run-Time Plane)**: `scripts/link-agents.mjs:36-133` 会将构建态资产同步到 `~/.multiagent-orchestration/`:
  - 全局规范软链接: `docs/axioms/STANDING_ORDER.md` -> `~/.multiagent-orchestration/axioms/STANDING_ORDER.md`
  - 基础提示词软链接: `packages/runtime-assets/prompts/*` -> `~/.multiagent-orchestration/axioms/*`
  - 动态干预钩子软链接: `packages/steering-hook/dist/pre-tool-steer.js` -> `~/.multiagent-orchestration/hooks/pre-tool-steer.js`
  - 伙伴目录隔离: 在 `~/.multiagent-orchestration/partners/<id>/` 下建立独立沙箱，并创建以下文件映射：
    - `manifest.json` -> `packages/runtime-assets/builtin-partners/<id>/manifest.json`
    - `SOUL.md` -> `packages/runtime-assets/builtin-partners/<id>/SOUL.md`
    - `CLAUDE.md` -> `packages/runtime-assets/builtin-partners/<id>/PARTNER_MANUAL.md` (注: 源码禁止在代码库内创建 `CLAUDE.md`，统一以 `PARTNER_MANUAL.md` 编写后软链接为 `CLAUDE.md`)
    - `memories/MEMORY.md`: 本地初始化生成，前 200 行 / 25KB 在拉起伙伴时由驱动器（`ClaudeAgentSdkDriver.mjs:76-85` 及 `ClaudeProcessManager.mjs:78-87`）自动预加载入上下文。
    - `.claude/settings.json`: 注入 `PreToolUse` 的 `pre-tool-steer.js` 钩子。

### 1.2 当前 `~/.multiagent-orchestration/partners/` 的物理就绪状态
直接观测 `ls -la ~/.multiagent-orchestration/partners/`：
- 当前存在 6 位由 `link-agents.mjs` 软链接就绪的内置伙伴目录：
  - `agent-architect`
  - `cindy-r`
  - `claude-sdk-architect`
  - `doc-skill-keeper`
  - `lead-orchestrator`
  - `rea-partner`
- 另存在 3 个已归档测试目录 `_archived_test-partner-*`。

### 1.3 仓库中已有 Cindy 预设文档与角色资产检索
代码库中存在丰富的 Cindy 原生角色定义与人设规则：
1. **`agents/registry.json` 及对应人设**:
   - `orchestrator`: "Cindy (Orchestrator)" (`agents/orchestrator/system-prompt.md`)
   - `coder`: "Dev (Engineer)" (`agents/coder/system-prompt.md`: "You are the Cindy Coder Subagent, an ultra-focused systems implementation engineer. Your mission is to write clean, modular, tested Node.js/TypeScript code...") 与 `agents/coder/AGENTS.md`
   - `reviewer`: "Audit (Reviewer)" (`agents/reviewer/system-prompt.md`: "You are the Cindy Reviewer Subagent, a strict quality assurance and security auditor. Your mission is to audit implementations, verify edge cases, review git diffs, ensure test coverage, and act as the gatekeeper...") 与 `agents/reviewer/AGENTS.md`
   - `researcher`: "Echo (Researcher)" (`agents/researcher/system-prompt.md`)
2. **`extensions/cindy/apps/desktop/resources/bot-packages/`**:
   - `engineer-bot`: "工程交付伙伴" (`manifest.json` + `skills/engineer-bot-ops` + `skills/engineer-bot-evidence`)
   - `startup-qa-bot`: "产品巡检伙伴" (`manifest.json` + `skills/startup-qa-bot-ops` + `skills/startup-qa-bot-evidence`)
3. **`packages/agent-control-plane/core/PartnerCoreService.mjs`**:
   - 管理伙伴生命周期与 `manifest.json`、`SOUL.md`、`memories/MEMORY.md` 写入。
   - 内置伙伴保护名单 (`BUILTIN_IDS` 第 249-256 行): `lead-orchestrator`, `agent-architect`, `rea-partner`, `cindy-r`, `doc-skill-keeper`, `claude-sdk-architect`。
4. **群聊与消息协议契约**:
   - `docs/dev-rules/bot-group-orchestration.md`: 定义单群存储拓扑（`~/.multiagent-orchestration/groups/<group_slug>/group.json`）、消息单调递增序列号 `sequence`、`lastSeenSequence` 水位线增量切片、`<untrusted-json-block>` 隔离及 EBNF 语法。
   - `src/session/bot-group-service.mjs`: 提供 `BotGroupService`，支持群创建、消息收发、`clientId` 幂等校验、`[Name](cindy://bot/<botId>)` 正则识别及未读增量切片。

---

## 2. Logic Chain (推理链条)

### 2.1 需求目标与 7 位核心伙伴映射推理
- **依据原始需求 R2**: "群聊核心伙伴包括：Cindy 的 DocSkill 维护官、Nexus · 多智能体统筹调度官、Cindy_R、REA、两位写代码工程师、一位排错工程师。"
- **映射比对**:
  1. **Cindy 的 DocSkill 维护官**: 对应现有 `doc-skill-keeper`（名称: "DocSkill 维护官"，bot_id: `bot_1793623102002_docsk2`）。
  2. **Nexus · 多智能体统筹调度官**: 对应现有 `lead-orchestrator`（名称: "Nexus · 多智能体统筹调度官"，bot_id: `bot_1793623923987_m1qetm`，is_lead: `true`）。
  3. **Cindy_R**: 对应现有 `cindy-r`（名称: "Cindy_R"，bot_id: `bot_1793623101001_cndyr1`）。
  4. **REA**: 对应现有 `rea-partner`（名称: "REA 逆向分析伙伴" / "Rea Code Craftsman"）。
  5. **写代码工程师 1**: 对应现有 `claude-sdk-architect`（名称: "Claude SDK 架构师"，bot_id: `bot_1793623103003_clsdk3`），其 summary 表明其专精于 SDK 驱动与控制面代码编写，拥有 `node`, `pnpm test`, `pnpm typecheck` 执行权限，已是完整的代码实现工程师。
  6. **写代码工程师 2**: 目前 6 个内置伙伴中尚缺一位专职业务与测试实现的写代码工程师。但项目中已有成熟资产 `agents/coder/system-prompt.md` 与 `agents/coder/AGENTS.md`（定义了 "Cindy Coder Subagent / Dev (Engineer)"）。因此，第 2 位写代码工程师应复用该资产，将其标准化为伙伴规范目录（标识可为 `coder` 或 `code-engineer`）。
  7. **一位排错工程师**: 目前内置伙伴中尚无专职排错/审查伙伴。但项目中已有成熟资产 `agents/reviewer/system-prompt.md` 与 `agents/reviewer/AGENTS.md`（定义了 "Cindy Reviewer Subagent / Audit (Reviewer)"，职责即为：定位缺陷、审查代码、排查错误、回归验证）。因此，排错工程师应复用该资产，标准化为伙伴规范目录（标识可为 `reviewer` 或 `troubleshoot-engineer`）。
- **推论**: 7 位核心伙伴构成 = 5 位已有内置伙伴（含 Claude SDK 架构师作为代码工程师 1）+ 2 位基于现有 `agents/coder` 和 `agents/reviewer` 资产补全的伙伴（代码工程师 2 与排错工程师）。原有 `agent-architect` 可作为元架构脚手架伙伴并行保留在系统中，无破坏性影响。

### 2.2 伙伴目录契约与文件结构推理
基于 `docs/protocols/partner-contract.md`、`docs/axioms/STANDING_ORDER.md` 及 `scripts/link-agents.mjs`:
每个伙伴在 `~/.multiagent-orchestration/partners/<bot_id>/` 必须具备以下 5 个核心要素：
1. `manifest.json`: 宿主注册元数据，必须包含 `id`, `name`, `model`, `summary_for_lead`, `allowed_tools`, `stateless_by_default` 等字段。
2. `SOUL.md`: 纯文本/AST 核心系统人设与边界定义，遵守单根 H1 `[0] ROOT: ...` 与 `[X.Y.Z]` 拓扑规范，行数 `< 100` 行。
3. `CLAUDE.md`: 运行操作手册（由构建态 `PARTNER_MANUAL.md` 软链接而来，或动态生成）。
4. `memories/MEMORY.md`: 永久记忆索引，初始模板包含 doc_id 与根标题，上限 200 行 / 25KB，执行时被驱动器自动截取预加载。
5. `.claude/settings.json` 与 `workspace/`: 包含 PreToolUse 钩子配置与运行隔离临时目录。

---

## 3. Caveats (注意事项与假设)

1. **命名兼容性**: 在群聊终端中，用户可能输入 `@DocSkill 维护官`、`@Nexus`、`@Cindy_R`、`@REA`、`@代码工程师`、`@排错工程师`，或者输入其实际 id（如 `@doc-skill-keeper`、`@lead-orchestrator`、`@cindy-r`、`@claude-sdk-architect`、`@coder`、`@reviewer`）。CLI REPL 的解析器必须支持通过 id、name、以及中文别名多种模式进行归一化寻址匹配。
2. **双平面隔离铁律 (AGENTS.md 2.2.3)**: 严禁在 `packages/runtime-assets/` 下直接创建名为 `CLAUDE.md` 的文件或名为 `.claude` 的目录。如果通过补全生成内置伙伴源码，必须写为 `PARTNER_MANUAL.md`，再通过 `link-agents.mjs` 软链接至运行态沙箱。
3. **真实 Agent 驱动前提 (R3)**: 若使用 `ClaudeProcessManager.mjs`，依赖本地 `/opt/homebrew/bin/claude`；若使用 `ClaudeAgentSdkDriver.mjs`，需依赖 `@anthropic-ai/claude-agent-sdk` 及有效 API Key / 环境变量。脚本应具备良好的优雅降级或可配置驱动机制。

---

## 4. Conclusion & R2 Strategy (结论与落地策略)

### 4.1 7 位群聊核心伙伴规范清单

| 序号 | 伙伴角色定义 | 推荐伙伴 ID | 显示名称 (`name`) | 资产复用来源 | 补全/就绪方式 |
|---|---|---|---|---|---|
| 1 | **Cindy 的 DocSkill 维护官** | `doc-skill-keeper` | `DocSkill 维护官` | `packages/runtime-assets/builtin-partners/doc-skill-keeper/` | **已就绪** (直接复用现有软链接与配置) |
| 2 | **Nexus · 多智能体统筹调度官** | `lead-orchestrator` | `Nexus · 多智能体统筹调度官` | `packages/runtime-assets/builtin-partners/lead-orchestrator/` | **已就绪** (直接复用，`is_lead: true`) |
| 3 | **Cindy_R** | `cindy-r` | `Cindy_R` | `packages/runtime-assets/builtin-partners/cindy-r/` | **已就绪** (直接复用代码库审计伙伴配置) |
| 4 | **REA** | `rea-partner` | `REA 逆向分析伙伴` | `packages/runtime-assets/builtin-partners/rea-partner/` | **已就绪** (直接复用逆向与安全伙伴配置) |
| 5 | **写代码工程师 1** | `claude-sdk-architect` | `Claude SDK 架构师` (代码工程师 · 核心架构) | `packages/runtime-assets/builtin-partners/claude-sdk-architect/` | **已就绪** (作为主力代码工程师 1 直接复用) |
| 6 | **写代码工程师 2** | `coder` | `代码工程师 (Dev)` | `agents/coder/system-prompt.md` + `agents/coder/AGENTS.md` | **自动补全** (依据 Folder-as-an-Agent 规范生成) |
| 7 | **一位排错工程师** | `reviewer` | `排错工程师 (Audit)` | `agents/reviewer/system-prompt.md` + `agents/reviewer/AGENTS.md` | **自动补全** (依据 Folder-as-an-Agent 规范生成) |

*注：`agent-architect` 继续作为第 8 位元架构伙伴保留在目录中，不干扰群聊 7 核心阵容。*

### 4.2 R2 伙伴自动就绪实施方案
在即将编写的 CLI 初始化模块或 `scripts/cli-room.ts` 启动流程中，实现 `ensureCorePartnersReady()` 幂等检测函数：
1. **优先复用**: 检查 `~/.multiagent-orchestration/partners/` 下是否存在各伙伴目录及 `manifest.json` 与 `SOUL.md`。
2. **自动补全缺失项**:
   - 若 `coder` 不存在，在构建态 `packages/runtime-assets/builtin-partners/coder/`（或直接在运行态沙箱）生成标准 `manifest.json`, `SOUL.md`, `PARTNER_MANUAL.md`，深度复用 `agents/coder/system-prompt.md`。
   - 若 `reviewer` 不存在，生成标准 `manifest.json`, `SOUL.md`, `PARTNER_MANUAL.md`，深度复用 `agents/reviewer/system-prompt.md`。
   - 调用 `node scripts/link-agents.mjs` 重新建立全量软链接与 `.claude/settings.json` 钩子注入。
3. **内存与工作区就绪**: 确保每个伙伴均具备 `memories/MEMORY.md` 与 `workspace/`，并在预置群聊房间（`multiagent-orchestration`）的成员清单中注册全部 7 位伙伴。

---

## 5. Verification Method (独立验证方法)

1. **软链接与资产同步验证**:
   ```bash
   node scripts/link-agents.mjs
   ```
   *预期结果*: 退出码 0，控制台输出各内置伙伴的链接成功提示。
2. **伙伴物理目录与关键文件完整性检查**:
   ```bash
   ls -la ~/.multiagent-orchestration/partners/{doc-skill-keeper,lead-orchestrator,cindy-r,rea-partner,claude-sdk-architect}
   ```
   *预期结果*: 每个目录均包含 `manifest.json`, `SOUL.md`, `CLAUDE.md`, `memories/MEMORY.md`, `.claude/settings.json`, `workspace/`。
3. **既有测试套件回归验证**:
   ```bash
   node tests/test-sdk-orchestrator.mjs
   node tests/test-cindy-room-logic.mjs
   ```
   *预期结果*: 两个测试套件均 100% 通过（PASS），退出码为 0。
