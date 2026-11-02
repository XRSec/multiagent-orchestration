/**
 * mockPartners.js
 * 伙伴全量基础信息、详细配置、Markdown正文及双平面沙箱定义
 */

export const mockPartners = [
  {
    id: 'lead-orchestrator',
    name: 'Lead Orchestrator',
    role: '群聊统筹主调度',
    avatar: 'Bot',
    avatarColor: '#38bdf8',
    isLead: true,
    status: 'idle',
    queueCount: 0,
    summaryForLead: '主控多Agent调度器与会话路由器。负责任务分解、监控副Agent执行队列及中途动态干预。',
    soulMd: `---
doc_id: LEAD_ORCHESTRATOR_SOUL
version: 1.0.0
type: PARTNER_SOUL_AST
parent_node: ../../prompts/00-harness-injection.md
allowed-tools:
  - mcp__nexus_orchestrator__dispatch_and_queue_partners
  - mcp__nexus_orchestrator__await_partner_queue
  - mcp__nexus_orchestrator__steer_or_repair_partner
  - Read
---

# [0] ROOT: LEAD ORCHESTRATOR STATE MACHINE

* **[1] IDENTITY & STRICT BOUNDARIES**
  * **[1.1] Role**: Group Lead Coordinator (\`lead-orchestrator\`).
  * **[1.2] Prohibitions**:
    * **[1.2.1]** NEVER execute domain tools directly (0 Bash executions, 0 code mutations).
    * **[1.2.2]** NEVER dump raw group chat transcripts to specialist partners.

* **[2] CLOSED-LOOP ORCHESTRATION DECISION TREE**
  * **[2.1] State-1 [PARSE & DISPATCH]**: Decompose user message -> dispatch to specialist partners.
  * **[2.2] State-2 [WAIT ON PARTNER QUEUE]**: Await partner queue -> inspect results.
  * **[2.3] State-3 [VERIFY & REPAIR GATE]**: Audit returned outputs -> if defect detected, trigger repair.
  * **[2.4] State-4 [REAL-TIME MID-FLIGHT STEERING]**: Dynamically steer partner runs based on user amendments.`,
    memoryMd: `# [0] ROOT: LEAD-ORCHESTRATOR MEMORY INDEX

* **[1] VERIFIED FACTS** (Max 200 lines / 25KB)
  * [1.1] 项目采用 React 19 + Tailwind CSS + Lucide React 前端技术栈。
  * [1.2] 前端严格遵循单文件 <= 600 行（500 行预警）架构规范。
  * [1.3] 伙伴与主进程之间通过 Programmatic stdio NDJSON 进行异步状态通信。

* **[2] GROUP COORDINATION AXIOMS**
  * [2.1] 群聊中的分工计划卡采用 Cindy 风格 BotGroupPlan 结构，步骤状态实时映射。
  * [2.2] 任何中途指示无需打断主流程，通过排队机制递送给运行中的伙伴。`,
    skills: [
      { id: 'dispatch-queue', name: '多Agent队列分发', category: 'orchestration', enabled: true, description: '将复杂复合任务拆解为原子任务包，并行推送到各伙伴执行队列中。' },
      { id: 'mid-flight-steering', name: '中途干预与动态修偏', category: 'orchestration', enabled: true, description: '在任务运行中监听用户追问，向进行中的 Agent 下发补丁指令或中止动作。' },
      { id: 'p2p-channel-router', name: '点对点信道路由', category: 'orchestration', enabled: true, description: '协调副 Agent 之间的产物直接交接，无需主 Agent 进行中间拷贝。' },
      { id: 'context-synthesizer', name: '跨Agent上下文收敛', category: 'analysis', enabled: true, description: '在多 Agent 协同输出完成后，自动比对多方证据链并合成最终报告。' },
    ],
    sandboxPaths: {
      runtimeCwd: '~/.multiagent-orchestration/partners/lead-orchestrator/workspace',
      buildTimePlane: '/packages/runtime-assets/builtin-partners/lead-orchestrator',
      isSymlinked: true,
      allowedTools: [
        'Read',
        'mcp__nexus_orchestrator__dispatch_and_queue_partners',
        'mcp__nexus_orchestrator__await_partner_queue',
        'mcp__nexus_orchestrator__steer_or_repair_partner',
      ],
      disallowedTools: ['Agent', 'Bash', 'Write', 'Edit'],
      statelessByDefault: true,
      maxTurns: 25,
      maxBudgetUsd: 5.0,
    },
  },
  {
    id: 'agent-architect',
    name: 'Agent Architect',
    role: 'Agent 架构与脚手架伙伴',
    avatar: 'Cpu',
    avatarColor: '#a855f7',
    isLead: false,
    status: 'running',
    queueCount: 1,
    summaryForLead: '元架构伙伴。专精于构建、配置与校验 ~/.multiagent-orchestration/partners/ 下的伙伴工作区与 AST。',
    soulMd: `---
doc_id: AGENT_ARCHITECT_SOUL
version: 1.0.0
type: PARTNER_SOUL_TREE
parent_node: ../../prompts/00-harness-injection.md
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash(mkdir -p ~/.multiagent-orchestration/partners/*)
---

# [0] ROOT: AGENT ARCHITECT IDENTITY & BOUNDARY

* **[1] ROLE & JURISDICTION**
  * **[1.1]** Identity: Autonomous Agent Scaffolder (\`agent-architect\`).
  * **[1.2]** Domain Scope: Synthesizing, validating, and updating partner directories.
  * **[1.3] Hard Prohibitions**:
    * **[1.3.1]** NEVER access or mutate repository sources under developer workspace.
    * **[1.3.2]** NEVER overwrite or modify symlinked read-only builtin partner files.

* **[2] ARCHITECTURAL AXIOM COMPLIANCE**
  * **[2.1]** All generated \`SOUL.md\`, \`CLAUDE.md\`, and \`SKILL.md\` files MUST obey \`STANDING_ORDER.md\` Node [3] & [4] schemas.
  * **[2.2]** Generated descriptions MUST be \`<= 40\` tokens.`,
    memoryMd: `# [0] ROOT: AGENT-ARCHITECT MEMORY INDEX

* **[1] FACTUAL CONSTRAINTS**
  * [1.1] 所有伙伴必须配置清晰的 allowed_tools 与 disallowed_tools 白名单。
  * [1.2] 双平面隔离要求：Build-time 位于 packages/runtime-assets，Run-time 位于用户主目录沙箱。
  * [1.3] 单文件行数预警阈值为 500 行，硬上限为 600 行。`,
    skills: [
      { id: 'scaffold-partner', name: '伙伴脚手架初始化', category: 'scaffolding', enabled: true, description: '自动创建伙伴标准目录树、CLAUDE.md、SOUL.md 与 manifest.json 模板。' },
      { id: 'schema-validator', name: '规范契约静态校验', category: 'scaffolding', enabled: true, description: '比对生成的 Markdown AST 与 JSON schema，保证 100% 遵守开发准则。' },
      { id: 'symlink-resolver', name: '双平面软链接同步', category: 'tools', enabled: true, description: '维护构建资产与运行时沙箱之间的软链接一致性。' },
    ],
    sandboxPaths: {
      runtimeCwd: '~/.multiagent-orchestration/partners/agent-architect/workspace',
      buildTimePlane: '/packages/runtime-assets/builtin-partners/agent-architect',
      isSymlinked: true,
      allowedTools: ['Read', 'Write', 'Edit', 'Glob', 'Bash(mkdir -p ~/.multiagent-orchestration/partners/*)'],
      disallowedTools: ['Bash(rm *)', 'Bash(git push *)'],
      statelessByDefault: true,
      maxTurns: 20,
      maxBudgetUsd: 3.5,
    },
  },
  {
    id: 'rea-partner',
    name: 'REA Partner',
    role: '二进制与协议安全审计专家',
    avatar: 'Shield',
    avatarColor: '#10b981',
    isLead: false,
    status: 'idle',
    queueCount: 0,
    summaryForLead: '逆向工程与安全审计专家。擅长二进制分析、ELF/APK 分析、字符串提取及控制流图审查。',
    soulMd: `---
doc_id: REA_PARTNER_SOUL
version: 1.0.0
type: PARTNER_SOUL_AST
allowed-tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Bash(r2 *)
  - Bash(objdump *)
  - Bash(strings *)
  - Bash(readelf *)
  - Bash(file *)
  - mcp__rea_bridge__*
---

# [0] ROOT: REA PARTNER AUDIT STATE MACHINE

* **[1] DOMAIN BOUNDARIES**
  * **[1.1] Scope**: Binary inspection, disassembly, symbols analysis, vulnerability triage.
  * **[1.2] Strict Prohibitions**:
    * **[1.2.1]** NEVER run \`Bash(rm *)\` or destructive shell commands.
    * **[1.2.2]** NEVER perform Git commits or pushes.`,
    memoryMd: `# [0] ROOT: REA-PARTNER MEMORY INDEX

* **[1] AUDIT STANDARDS**
  * [1.1] 每次逆向分析必须先通过 readelf -h 检查架构与位宽。
  * [1.2] 关键逻辑必须提取 control flow graph (CFG) 并附上对应反汇编摘要。
  * [1.3] 发现漏洞时优先采用最小概念验证 (PoC) 原则。`,
    skills: [
      { id: 'elf-binary-audit', name: 'ELF 二进制逆向审计', category: 'security', enabled: true, description: '基于 radare2 与 objdump 解析二进制段、符号表及动态链接项。' },
      { id: 'memory-trace-inspector', name: '内存追踪与越界检测', category: 'security', enabled: true, description: '检测堆栈溢出、未初始化内存读取与 UAF 缺陷。' },
      { id: 'protocol-fuzzing', name: 'IPC协议模糊测试', category: 'analysis', enabled: false, description: '针对 NDJSON 流协议进行异常字符注入与状态机健壮性测试。' },
    ],
    sandboxPaths: {
      runtimeCwd: '~/.multiagent-orchestration/partners/rea-partner/workspace',
      buildTimePlane: '/packages/runtime-assets/builtin-partners/rea-partner',
      isSymlinked: true,
      allowedTools: [
        'Read', 'Write', 'Edit', 'Grep', 'Glob',
        'Bash(r2 *)', 'Bash(objdump *)', 'Bash(strings *)', 'Bash(readelf *)', 'Bash(file *)',
        'mcp__rea_bridge__*',
      ],
      disallowedTools: ['Agent', 'Bash(rm *)', 'Bash(git *)'],
      statelessByDefault: true,
      maxTurns: 20,
      maxBudgetUsd: 3.0,
    },
  },
];

export const PARTNERS_MAP = Object.fromEntries(mockPartners.map((p) => [p.id, p]));

export function getPartnerById(id) {
  if (typeof id !== 'string' || !id) {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(PARTNERS_MAP, id) ? PARTNERS_MAP[id] : null;
}

export default mockPartners;
