# Bot MCP & Plugins Isolation Proof of Concept (PoC)

## 1. 概述与设计目标 (Overview & Design Goals)

在多 Agent 协同系统（如 Cindy / Paseo）中，每个独立 Bot 必须具备自主管理自身专属 MCP tools（模型上下文协议工具）与 Plugins / Skills 的能力。
同时，架构设计有两项核心安全约束：
1. **Bot 间互不干扰 (Mutual Isolation)**：Bot Alpha 只能发现并调用属于其白名单授权的 MCP 工具与插件，绝不能窥探或执行属于 Bot Beta 的工具；反之亦然。
2. **彻底隔离宿主用户环境 (Zero Host ~/.claude Touch)**：Bot 运行过程中，绝对不得读取、污染或修改宿主操作系统的 `~/.claude` 配置目录（包括 `~/.claude.json`、`~/.claude/settings.json`、`~/.claude/projects/`、历史转录及会话凭证）。

本项目提供了一套完全可独立运行、基于真实 `@modelcontextprotocol/sdk` JSON-RPC 通信与沙箱拓扑的完整 PoC 原型，验证上述隔离方案的可行性与健壮性。

---

## 2. 核心架构设计 (Architecture Design)

```text
                                  [ Bot 统一编排宿主 ]
                                           │
                 ┌─────────────────────────┴─────────────────────────┐
                 ▼                                                   ▼
       ┌───────────────────┐                               ┌───────────────────┐
       │   Bot Alpha 实例   │                               │   Bot Beta 实例   │
       │ (Meteorology&DB)  │                               │  (Math&Telemetry) │
       └─────────┬─────────┘                               └─────────┬─────────┘
                 │                                                   │
  动态沙箱注入   │ CLAUDE_CONFIG_DIR                                 │ CLAUDE_CONFIG_DIR
                 ▼                                                   ▼
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│ sandboxes/.../bots/bot-alpha/   │                 │ sandboxes/.../bots/bot-beta/    │
│  ├── claude_config/             │                 │  ├── claude_config/             │
│  │    ├── settings.json         │                 │  │    ├── settings.json         │
│  │    └── state/                │                 │  │    └── state/                │
│  ├── workspace/                 │                 │  ├── workspace/                 │
│  └── plugins/                   │                 │  └── plugins/                   │
│       └── alpha-weather-suite/  │                 │       └── beta-calc-suite/      │
└────────────────┬────────────────┘                 └────────────────┬────────────────┘
                 │                                                   │
    SDK 隔离策略  │ strictMcpConfig: true             SDK 隔离策略  │ strictMcpConfig: true
    配置源锁定   │ settingSources: []                配置源锁定   │ settingSources: []
                 ▼                                                   ▼
┌─────────────────────────────────┐                 ┌─────────────────────────────────┐
│     AlphaWeatherServer          │                 │    BetaCalculatorServer         │
│  ├── alpha_weather_tool         │                 │  ├── beta_calculator_tool       │
│  └── alpha_db                   │                 │  └── beta_metrics               │
└─────────────────────────────────┘                 └─────────────────────────────────┘
                 │                                                   │
                 └─────────────────────────┬─────────────────────────┘
                                           ▼
                       ┌───────────────────────────────────────┐
                       │    HostIsolationGuard 宿主防护卫士     │
                       │    (监控/拦截对 ~/.claude 的一切读写)   │
                       └───────────────────┬───────────────────┘
                                           ▼
                                 [ 宿主 ~/.claude 目录 ]
                               ( 100% 隔离，0 读写，0 污染 )
```

### 关键组件

1. **`McpIsolationManager`**:
   - 负责为每个 Bot 动态分配并初始化物理隔离的沙箱目录拓扑（`claude_config/`、`workspace/`、`plugins/`）。
   - 动态装配运行时环境变量：注入专用的 `CLAUDE_CONFIG_DIR`，剥离外部残留的敏感鉴权变量。
   - 实现 Bot 白名单策略过滤（`filterAllowedServers`），只允许挂载被授权的 MCP 服务。
   - 挂载 Bot 私有插件（`loadBotPlugins`）。

2. **`BotRuntime`**:
   - 封装 Bot 运行时生命周期，启动由 `InMemoryTransport` 驱动的真实 MCP 服务器实例。
   - 暴露 `listAvailableTools()`、`listAvailablePlugins()`、`callTool()`。
   - 在执行工具前实施运行时访问控制门禁：若 Bot 试图调用越权服务，抛出 `McpAccessDeniedError`。

3. **`HostIsolationGuard`**:
   - 挂载文件系统钩子对宿主 `~/.claude`（及 `~/.claude.json`）实施毫秒级实时监控。
   - 在测试生命周期内记录一切非授权读写违规行为；若有越权访问则直接拦截并阻断。
   - 在生命周期收尾时生成多维审计报告。

4. **真实 MCP 服务实现 (`mcp-servers/`)**:
   - 基于 `@modelcontextprotocol/sdk` 标准的 `McpServer`、`Client` 与 `InMemoryTransport`。
   - `AlphaWeatherServer`: 包含 `alpha_weather_tool`（气象分析）与 `alpha_db`（私有内存数据库）。
   - `BetaCalculatorServer`: 包含 `beta_calculator_tool`（高精度算术运算）与 `beta_metrics`（Node 运行时指标）。

---

## 3. 目录结构 (Directory Layout)

```text
poc/bot-mcp-isolation/
├── package.json                   # 模块声明与 npm test 脚本配置
├── tsconfig.json                  # TypeScript 编译配置
├── README.md                      # 本架构说明与运行指引
├── configs/                       # Bot 专属配置与插件根目录
│   ├── bot-alpha/
│   │   ├── bot.config.json        # Alpha 工具与插件策略声明
│   │   └── plugins/
│   │       └── alpha-weather-suite/
│   │           ├── plugin.json
│   │           └── SKILL.md
│   └── bot-beta/
│       ├── bot.config.json        # Beta 工具与插件策略声明
│       └── plugins/
│           └── beta-calc-suite/
│               ├── plugin.json
│               └── SKILL.md
├── src/                           # 核心源代码
│   ├── types.ts                   # 类型与接口定义
│   ├── HostIsolationGuard.ts      # 宿主 ~/.claude 监控与防护守卫
│   ├── McpIsolationManager.ts     # 沙箱与环境变量隔离管理器
│   ├── BotRuntime.ts              # Bot 运行时生命周期与调用门禁
│   ├── index.ts                   # 统一导出
│   └── mcp-servers/               # 真实 MCP 服务器
│       ├── BaseMcpServer.ts       # 基于 @modelcontextprotocol/sdk 的抽象基类
│       ├── AlphaWeatherServer.ts  # Alpha 专有天气与 DB 服务
│       └── BetaCalculatorServer.ts# Beta 专有算术与监控服务
├── sandboxes/                     # 运行时自动生成的动态沙箱目录
└── test/
    └── verify-isolation.ts        # 全流程自动化验证套件
```

---

## 4. 运行验证方法 (How to Run Verification)

### 前置条件
- Node.js >= 18 (已在 Node v26 上完整验证)
- 本地依赖软链接已建立指向项目 node_modules

### 执行测试命令

在 `poc/bot-mcp-isolation/` 目录下执行：

```bash
npm test
```

或者使用 `npx tsx` 直接运行测试脚本：

```bash
npx tsx test/verify-isolation.ts
```

### 验证项清单 (9 大验证环节)

| 步骤 | 验证内容 | 预期结果 |
|---|---|---|
| Step 1 | 启动 `HostIsolationGuard` 监控宿主 `~/.claude` | 守卫就绪，文件钩子武装 |
| Step 2 | 分别初始化并启动 `Bot Alpha` 与 `Bot Beta` | 动态注入非重叠的独立 `CLAUDE_CONFIG_DIR`，启用 `strictMcpConfig: true` 与 `settingSources: []` |
| Step 3 | 工具发现与可见性检查 (Tool Discovery Isolation) | Alpha 仅见 `alpha_weather_tool`、`alpha_db`；Beta 仅见 `beta_calculator_tool`、`beta_metrics`；互不可见 |
| Step 4 | 真实 MCP 协议调用 (Genuine MCP Execution) | Alpha 成功执行气象查询与私有 DB 写入/读取；Beta 成功执行乘法与系统内存度量 |
| Step 5 | 越权调用拦截 (Access Control Gate) | Alpha 调 Beta 服务抛出 `McpAccessDeniedError`；Beta 调 Alpha 服务同理抛出 |
| Step 6 | 插件/技能隔离 (Plugin & Skill Isolation) | Alpha 仅挂载 `alpha-weather-suite`；Beta 仅挂载 `beta-calc-suite` |
| Step 7 | 磁盘持久化隔离 (Config Persistence Isolation) | 配置文件落盘在各自沙箱的 `claude_config`，零交叉写入 |
| Step 8 | 宿主目录零污染审计 (Host Zero-Touch Audit) | 审计报告确认 `hostDirTouched: false`，`readViolations: 0`，`writeViolations: 0`，`filesModified: 0` |
| Step 9 | 主动入侵拦截测试 (Trap Capability Verification) | 模拟对宿主 `~/.claude` 的非法读写，守卫立即捕获并熔断阻断 |

---

## 5. 验证执行结果示例 (Sample Execution Output)

```text
========================================================================
   Bot MCP & Plugins Isolation Proof of Concept (PoC) Verification   
========================================================================

[Step 1] Initializing HostIsolationGuard surveillance against ~/.claude
  Target Host Claude Directory: <USER_HOME>/.claude
  ✓ PASS: Host ~/.claude surveillance active and fs hooks armed.

[Step 2] Booting Bot Alpha and Bot Beta with isolated sandboxes
  Bot Alpha CLAUDE_CONFIG_DIR: /.../sandboxes/run-1793865514199/bots/bot-alpha/claude_config
  Bot Beta  CLAUDE_CONFIG_DIR: /.../sandboxes/run-1793865514199/bots/bot-beta/claude_config
  ✓ PASS: Bot environments successfully booted with distinct, non-overlapping CLAUDE_CONFIG_DIR paths.

[Step 3] Verifying MCP Tool Discovery & Visibility Isolation
  Bot Alpha Discovered Tools: [alpha_weather_tool, alpha_db]
  Bot Beta  Discovered Tools: [beta_calculator_tool, beta_metrics]
  ✓ PASS: Tool visibility strictly isolated: neither bot can view the other bot tools.

[Step 4] Verifying Genuine MCP Tool Execution on Authorized Bots
  [Bot Alpha] alpha_weather_tool result: Berlin -> 9°C, Clear
  [Bot Alpha] alpha_db result: Table 'stations' contains 1 record(s)
  [Bot Beta]  beta_calculator_tool result: 12 * 8 = 96
  [Bot Beta]  beta_metrics result: Heap Used = 26.07 MB
  ✓ PASS: Both bots executed their assigned MCP tools genuinely through JSON-RPC protocol.

[Step 5] Verifying Cross-Bot Tool Invocation Boundary Enforcement
  Blocked unauthorized Alpha call to Beta server: [Isolation Boundary Violation]: Bot "bot-alpha" is NOT authorized to access MCP server "beta_calculator_server". Allowed servers: [alpha_weather_server]
  Blocked unauthorized Beta call to Alpha server: [Isolation Boundary Violation]: Bot "bot-beta" is NOT authorized to access MCP server "alpha_weather_server". Allowed servers: [beta_calculator_server]
  ✓ PASS: Cross-bot tool access strictly rejected by policy filter and runtime gate.

[Step 6] Verifying Bot Plugins and Skills Isolation
  Bot Alpha Plugins: [alpha-weather-suite]
  Bot Beta  Plugins: [beta-calc-suite]
  ✓ PASS: Bot plugins strictly scoped to individual bot plugin directories.

[Step 7] Verifying Sandbox Disk State and Config Persistence Isolation
  ✓ PASS: Artifact persistence strictly isolated inside individual bot CLAUDE_CONFIG_DIR.

[Step 8] Performing Comprehensive Host ~/.claude Isolation Audit
  Audit Result:
    Host Claude Dir: <USER_HOME>/.claude
    Host Dir Existed: true
    Host Dir Touched: false
    Read Violations: 0
    Write Violations: 0
    Files Modified: 0
    Is Fully Isolated: true
  ✓ PASS: Host ~/.claude was 100% untouched throughout all operations.

[Step 9] Verifying Active Guard Defense Against Simulated Unauthorized Host Intrusion
  Trapped Violations:
    [readFileSync] <USER_HOME>/.claude/settings.json
    [writeFileSync] <USER_HOME>/.claude/rogue-injection.tmp
  ✓ PASS: HostIsolationGuard active enforcement verified: illegal operations are immediately aborted.

========================================================================
   ✓ ALL VERIFICATION TESTS PASSED SUCCESSFULLY (Exit Code 0)         
========================================================================
```
