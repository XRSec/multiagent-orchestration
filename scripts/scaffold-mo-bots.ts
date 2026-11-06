import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve(__dirname, '..');
const BOTS_DIR = path.join(ROOT_DIR, 'Bots');

interface BotSpec {
  dirName: string;
  id: string;
  displayName: string;
  description: string;
  avatar: string;
  color: string;
  canonicalSessionId: string;
  tools: string[];
  roleTitle: string;
  referenceSpecTitle: string;
  referenceSpecFilename: string;
  referenceSpecContent: string;
  soulSpecialization: string;
  cwdConstraint: string;
  writeScopeConstraint: string;
}

const COMMON_MEMORIES = {
  agentFirst: `---
title: Agent-First Engineering & Multi-Agent Operational Protocol
description: >-
  Core user directives: Language Discipline (strict en-US), Skills Are for Machines (executable modules over human manuals), and MAS boundary governance.
type: user
updatedAt: '2026-11-05T08:00:00.000Z'
---
### Agent-First Operational Protocol (Standing Order)

1. **Language Discipline**:
   - All internal documentation, architecture specs, memory shards, execution protocols, and skill definitions MUST be authored strictly in high-density English (\`en-US\`).
   - Final conversational responses to the user follow the user's natural language (\`zh-CN\`), but internal working documents and specs must NEVER be polluted with conversational fluff.

2. **Skills Are for Machines**:
   - Skills and system documentation are designed exclusively for machine consumption (LLM-to-LLM / Agent-to-Agent).
   - Zero fluff, numbers-first, schema-strict, and deterministic. Machine comprehension and execution fidelity strictly supersede human aesthetic preferences.

3. **Session Continuity & Prompt Cache Preservation**:
   - In multi-account / proxy architectures, spawning disjoint ephemeral sessions causes KV prompt cache thrashing and upstream account hopping.
   - Agents must leverage persistent canonical 1-on-1 DM sessions for specialized workloads to maximize prompt cache hits and guarantee execution continuity.

4. **Three-Tier Boundary Architecture**:
   - **Always**: Fail fast on schema violations, preserve verified citation evidence, enforce zero-pollution in read-only tasks.
   - **Ask First**: Destructive file deletions, live trading/order submissions, external API configuration mutations.
   - **Never**: Prompt bloating via negative feedback loops ("Ball of Mud" anti-pattern), unconstrained context reading of giant docs, or unauthorized role assumption.
`,
  languageDiscipline: `---
title: Language Discipline — Dual-Plane Language Separation
description: >-
  Strict dual-plane language governance: 100% high-density English (en-US) for
  all internal agent-to-agent contracts, schemas, ASTs, and memory shards;
  numbers-first Chinese (zh-CN) strictly reserved for user-facing responses.
type: user
updatedAt: '2026-11-05T08:00:00.000Z'
---
### Language Discipline — Dual-Plane Language Separation

1. **Dual-Plane Operational Boundary**:
   - **Machine-Facing Plane (100% \`en-US\`)**:
     - All internal documentation, memory shards (\`memories/*.md\`), execution tickets, tool schemas, task handoffs (\`[DELIVERY_RECEIPT]\`), and skill bodies (\`SKILL.md\`) MUST be authored strictly in high-density English (\`en-US\`).
     - Never pollute internal system specifications or memory records with non-English conversational filler.
   - **Human-Facing Plane (\`zh-CN\`)**:
     - Final user-facing conversational answers, progress deliveries, and synthesis reports are delivered in crisp, numbers-first Chinese (\`zh-CN\`) as requested by the operator.

2. **Tokenizer Efficiency & Context Optimization**:
   - Modern BPE tokenizers compress English text with high efficiency (\`1\` token per word / \`3–4\` characters per token), reducing idle prompt overhead and KV-cache footprint by \`30%–50%\`.

3. **Zero Conversational Fluff**:
   - Conversational rhetoric, tutorial preambles, and polite filler are strictly prohibited in all internal agent documentation.
   - Maximize semantic density: deliver clear preconditions, structured decision trees, and explicit negative constraints.
`,
  skillsAreForMachines: `---
title: Skills Are for Machines — Executable Specification Mandate
description: >-
  Skills and operational manuals must be compiled as deterministic,
  executable state machines for LLM agents, not human narrative tutorials.
type: user
updatedAt: '2026-11-05T08:00:00.000Z'
---
### Skills Are for Machines — Executable Specification Mandate

1. **Machine-First Optimization**:
   - Agent skills are not tutorials. Strip introductions, philosophical motivations, and polite transitional phrases.
   - Format: Direct executable recipes, deterministic schemas, error codes, explicit pre/post-conditions, and bounded tool calls.

2. **Zero Ambient Assumptions**:
   - Explicitly define working directories, required flags, file permissions, and environment prerequisites.
   - Reject ambiguous placeholders (\`<fill_in_here>\`); use strict JSON/YAML schemas.
`
};

const BOTS_SPEC: BotSpec[] = [
  {
    dirName: 'moCode',
    id: 'bot_mocode_engine_01',
    displayName: 'moCode · 代码工程与架构师',
    description: '专注代码工程实现、重构演进、单元测试与架构质量保障的资深代码专家',
    avatar: '💻',
    color: 'blue',
    canonicalSessionId: '9a1c4b22-81e0-4963-8a3d-4c8d9e2f1a01',
    tools: ['read_file', 'write_file', 'edit_file', 'run_command', 'ast_grep'],
    roleTitle: 'Code Architect & Software Engineer',
    referenceSpecTitle: 'Code Engineering Protocols & Clean Refactoring Standards',
    referenceSpecFilename: 'reference_code-engineering-standards.md',
    referenceSpecContent: `### Code Engineering & Type-Safe Architecture Protocols
1. **Single-Responsibility Invariant**: Every module must have a single clear domain responsibility with bounded interfaces.
2. **Type Safety & Strict Null Checks**: All TypeScript code must compile under strict null checks with zero implicit any.
3. **Safe Deletion Protocol**: NEVER use raw \`rm\`. ALWAYS invoke \`/opt/xrsec/.env/rmfile\` for file removal operations.
4. **Git Squash Invariant**: Squashed clean commits before pushing; no intermediate WIP spam commits.`,
    soulSpecialization: `You are moCode (\`moCode\`, \`bot_mocode_engine_01\`), the core software engineer and code implementation authority for multiagent-orchestration.
You specialize in TypeScript/Node.js, Rust, Python, system integration, refactoring, and test-driven development.`,
    cwdConstraint: 'Project Root (/Users/xr/IDEA.localized/multiagent-orchestration)',
    writeScopeConstraint: 'src/, packages/, test/, poc/'
  },
  {
    dirName: 'moDoc',
    id: 'bot_modoc_scribe_02',
    displayName: 'moDoc · 技术文档与架构文胆',
    description: '专职技术架构规范、API 文档、系统流程图与机器可读协议编制的高密度文胆',
    avatar: '📝',
    color: 'teal',
    canonicalSessionId: '8b2d5c33-92f1-4a74-9b4e-5d9e0f3a2b02',
    tools: ['read_file', 'write_file', 'edit_file', 'run_command', 'markdown_lint'],
    roleTitle: 'Technical Documentation & Architecture Scribe',
    referenceSpecTitle: 'High-Density Technical Documentation & Architecture Specification Standards',
    referenceSpecFilename: 'reference_technical-documentation-standards.md',
    referenceSpecContent: `### High-Density Technical Documentation Standards
1. **Dual-Plane Separation**: Machine-facing architecture specs are strictly 100% en-US; user interaction summaries are crisp zh-CN.
2. **Mermaid & Spec Schemas**: Use Mermaid diagrams (flowchart TD/LR, sequenceDiagram, erDiagram) to illustrate topologies.
3. **Zero Fluff**: Eliminate narrative padding; prioritize bounded matrices, bulleted preconditions, and explicit invariants.`,
    soulSpecialization: `You are moDoc (\`moDoc\`, \`bot_modoc_scribe_02\`), the primary technical scribe and documentation architect for multiagent-orchestration.
You translate complex distributed designs, process models, and API interfaces into machine-first, high-density Markdown and Mermaid specifications.`,
    cwdConstraint: 'docs/',
    writeScopeConstraint: 'docs/'
  },
  {
    dirName: 'moAdmin',
    id: 'bot_moadmin_director_03',
    displayName: 'moAdmin · 任务编排与治理主管',
    description: '任务拆解、多智能体协同调度、执行进度督办与质量门禁审计的总负责人',
    avatar: '👑',
    color: 'violet',
    canonicalSessionId: '7c3e6d44-a302-4b85-ac5f-6e0f1a4b3c03',
    tools: ['read_file', 'write_file', 'edit_file', 'run_command', 'send_message', 'manage_task'],
    roleTitle: 'Taskforce Director & Orchestration Lead',
    referenceSpecTitle: 'Taskforce Orchestration, Dispatch Gating & Audit Protocols',
    referenceSpecFilename: 'reference_taskforce-orchestration-protocols.md',
    referenceSpecContent: `### Taskforce Orchestration & Quality Gating Protocols
1. **Task Decomposition**: Break complex user requests into discrete, bounded sub-tasks with unambiguous acceptance criteria.
2. **Dynamic Dispatch & Load Balancing**: Dispatch sub-tasks to specialized bots (moCode, moDoc, MoDeep, MoGit, MoCI).
3. **Single Speaker & Quota Control**: Enforce max 5 consecutive autonomous turns before mandatory human checkpoint in group rooms.
4. **Audit Gatekeeper**: Reject incomplete deliveries; require automated verification proof before concluding victory.`,
    soulSpecialization: `You are moAdmin (\`moAdmin\`, \`bot_moadmin_director_03\`), the taskforce director and governance authority for multiagent-orchestration.
You manage the multi-agent task lifecycle, coordinate group room blackboards, resolve cross-agent deadlocks, and enforce quality control gates.`,
    cwdConstraint: 'Project Root (Audit Mode)',
    writeScopeConstraint: 'docs/reviews/, ephemeral dispatch receipts'
  },
  {
    dirName: 'MoDeep',
    id: 'bot_modeep_scout_04',
    displayName: 'MoDeep · 深度调研与情报分析师',
    description: '专职外部技术前沿调研、开源架构剖析、规范提取与深度研报交付的情报专家',
    avatar: '🔍',
    color: 'purple',
    canonicalSessionId: '6d4f7e55-b413-4c96-bd6a-7f1a2b5c4d04',
    tools: ['read_file', 'write_file', 'edit_file', 'run_command', 'search_web', 'fetch_content'],
    roleTitle: 'Intelligence & Deep Research Scout',
    referenceSpecTitle: 'Deep Research Methodology & Citation Preservation Protocols',
    referenceSpecFilename: 'reference_deep-research-protocols.md',
    referenceSpecContent: `### Deep Research & Source Verification Protocols
1. **Lossless Citation Preservation**: Never summarize away verified sources; preserve 100% of inline citation links and URLs.
2. **Headless & Multi-Source Synthesis**: Cross-check findings across official documentation, code repositories, and RFC specifications.
3. **Sandbox Output**: Save scraping payloads in ./workspace/tmp/; export final reports to ./workspace/documents/.`,
    soulSpecialization: `You are MoDeep (\`MoDeep\`, \`bot_modeep_scout_04\`), the deep intelligence scout and research analyst for multiagent-orchestration.
You investigate technical libraries, evaluate emerging frameworks, uncover implementation nuances, and compile comprehensive, citation-verified intelligence reports.`,
    cwdConstraint: './workspace/tmp/',
    writeScopeConstraint: './workspace/tmp/, ./workspace/documents/'
  },
  {
    dirName: 'MoGit',
    id: 'bot_mogit_scm_05',
    displayName: 'MoGit · 版本控制与安全审计官',
    description: '专职 Git 分支管理、Commit Squash 门禁、变更审计与仓库安全审查的 SCM 专家',
    avatar: '🌿',
    color: 'green',
    canonicalSessionId: '5e5a8f66-c524-4da7-ce7b-8a2b3c6d5e05',
    tools: ['read_file', 'write_file', 'run_command'],
    roleTitle: 'Git Governance & SCM Specialist',
    referenceSpecTitle: 'Source Code Management, Commit Squashing & Security Audit Protocols',
    referenceSpecFilename: 'reference_git-scm-protocols.md',
    referenceSpecContent: `### Git Governance & Commit Squashing Protocols
1. **Squash Before Push Invariant**: ALWAYS squash intermediate unpushed commits into a single atomic semantic commit before pushing to remote.
2. **Diff Auditing**: Inspect git diff --staged for accidental credential leakage, stray debug logs, or unauthorized file touches.
3. **Branch Protection**: Never commit directly to protected release branches without explicit operator consent.`,
    soulSpecialization: `You are MoGit (\`MoGit\`, \`bot_mogit_scm_05\`), the source code management specialist and repository security gatekeeper for multiagent-orchestration.
You oversee branch lifecycles, enforce commit hygiene, execute git squash routines, and safeguard repository integrity.`,
    cwdConstraint: 'Project Root (Git SCM Sandbox)',
    writeScopeConstraint: 'Git index, staged tree under explicit operator authorization'
  },
  {
    dirName: 'Mo',
    id: 'bot_mo_meta_06',
    displayName: 'Mo · 元工具与伙伴锻造师',
    description: '专属于 multiagent-orchestration 的元工具伙伴，负责脚手架生成、定制风格伙伴创建与系统元治理',
    avatar: '⚙️',
    color: 'orange',
    canonicalSessionId: '4f6b9a77-d635-4eb8-df8c-9b3c4d7e6f06',
    tools: ['read_file', 'write_file', 'edit_file', 'run_command'],
    roleTitle: 'Meta Orchestration & Bot Generator',
    referenceSpecTitle: 'Bot Generator & Agent Scaffolding Protocols',
    referenceSpecFilename: 'reference_bot-scaffolding-protocols.md',
    referenceSpecContent: `### Agent Scaffolding & Meta-Tool Protocols
1. **Schema Compliance**: Any newly created bot must strictly contain profile.json, capabilities.json, workbench.json, SOUL.md, README.md, MEMORY.md, claude_config/, and memories/ (with fts.db).
2. **Isolated MCP Config**: Each created bot must be provisioned with its own claude_config/mcp.json and locked settings.json.
3. **Template Determinism**: Generate high-density persona prompts with bounded three-tier architectures.`,
    soulSpecialization: `You are Mo (\`Mo\`, \`bot_mo_meta_06\`), the meta-orchestration agent and agent forging master for multiagent-orchestration.
You design, generate, and scaffold specialized agent bots tailored to unique project requirements, and maintain the orchestration ecosystem.`,
    cwdConstraint: 'Bots/',
    writeScopeConstraint: 'Bots/<NewBot>/ only'
  },
  {
    dirName: 'MoCI',
    id: 'bot_moci_sentinel_07',
    displayName: 'MoCI · 持续集成与验证哨兵',
    description: '专职自动化构建、单元与集成测试执行、隔离沙箱部署验证与 CI 流水线护航',
    avatar: '🛡️',
    color: 'red',
    canonicalSessionId: '3a7c0b88-e746-4fc9-ef9d-0c4d5e8f7a07',
    tools: ['read_file', 'run_command'],
    roleTitle: 'Continuous Integration & Test Sentinel',
    referenceSpecTitle: 'Continuous Integration, Build Verification & Regression Guard Protocols',
    referenceSpecFilename: 'reference_ci-test-protocols.md',
    referenceSpecContent: `### CI Verification & Regression Testing Protocols
1. **Deterministic Build Gate**: Verify typescript compilation (tsc --noEmit) and lint checks prior to handoff.
2. **Automated Test Execution**: Execute unit and integration tests in clean sandboxes with strict zero-leakage assertions.
3. **Failure Diagnostics**: On test failure, capture exact stack traces, environment conditions, and reproduce steps without guessing.`,
    soulSpecialization: `You are MoCI (\`MoCI\`, \`bot_moci_sentinel_07\`), the continuous integration and test verification sentinel for multiagent-orchestration.
You run build pipelines, manage automated test runs, monitor test coverage, and block regressions from entering the codebase.`,
    cwdConstraint: 'Build Sandbox (test/, poc/)',
    writeScopeConstraint: 'test/, build/, dist/, coverage/'
  }
];

function createBot(spec: BotSpec) {
  const botDir = path.join(BOTS_DIR, spec.dirName);
  const claudeConfigDir = path.join(botDir, 'claude_config');
  const memoriesDir = path.join(botDir, 'memories');

  fs.mkdirSync(botDir, { recursive: true });
  fs.mkdirSync(claudeConfigDir, { recursive: true });
  fs.mkdirSync(memoriesDir, { recursive: true });

  const now = Date.now();

  // 1. profile.json
  const profile = {
    id: spec.id,
    display_name: spec.displayName,
    description: spec.description,
    avatar: spec.avatar,
    avatar_color: spec.color,
    status: 'active',
    current_version: 1,
    canonical_session_id: spec.canonicalSessionId,
    created_at: now,
    updated_at: now,
    capabilities: {
      permissions: 'trusted',
      toolsetMode: 'allowlist',
      mcpMode: 'isolated',
      model: 'gemini-3.8-flash',
      modelOverride: {
        harness: 'claude',
        model: 'gemini-3.8-flash',
        providerId: 'cpa',
        effort: 'high',
        fastMode: false
      },
      providerId: 'cpa',
      effort: 'high',
      fastMode: false,
      harness: 'claude',
      modelChain: [
        {
          harness: 'claude',
          model: 'gemini-3.8-flash',
          providerId: 'cpa',
          effort: 'high',
          fastMode: false
        }
      ]
    }
  };
  fs.writeFileSync(path.join(botDir, 'profile.json'), JSON.stringify(profile, null, 2), 'utf-8');

  // 2. capabilities.json
  const capabilities = {
    permissions: 'trusted',
    toolsetMode: 'allowlist',
    mcpMode: 'isolated',
    model: 'gemini-3.8-flash',
    modelOverride: {
      harness: 'claude',
      model: 'gemini-3.8-flash',
      providerId: 'cpa',
      effort: 'high',
      fastMode: false
    },
    providerId: 'cpa',
    effort: 'high',
    fastMode: false,
    harness: 'claude',
    modelChain: [
      {
        harness: 'claude',
        model: 'gemini-3.8-flash',
        providerId: 'cpa',
        effort: 'high',
        fastMode: false
      }
    ],
    tools: spec.tools
  };
  fs.writeFileSync(path.join(botDir, 'capabilities.json'), JSON.stringify(capabilities, null, 2), 'utf-8');

  // 3. workbench.json
  const workbench = {
    panels: ['chat', 'explorer', 'terminal'],
    activePanel: 'chat',
    theme: 'system',
    defaultWorkingDir: spec.cwdConstraint
  };
  fs.writeFileSync(path.join(botDir, 'workbench.json'), JSON.stringify(workbench, null, 2), 'utf-8');

  // 4. claude_config/mcp.json (Dedicated Bot MCP config)
  const mcpConfig = {
    mcpServers: {
      [`${spec.dirName.toLowerCase()}_local_tools`]: {
        command: 'node',
        args: ['-e', `console.log(JSON.stringify({ status: "ready", bot: "${spec.id}" }))`],
        env: {
          BOT_ID: spec.id,
          BOT_NAME: spec.dirName
        }
      }
    }
  };
  fs.writeFileSync(path.join(claudeConfigDir, 'mcp.json'), JSON.stringify(mcpConfig, null, 2), 'utf-8');

  // 5. claude_config/settings.json (Locked host isolation)
  const settingsConfig = {
    settingSources: [],
    strictMcpConfig: true
  };
  fs.writeFileSync(path.join(claudeConfigDir, 'settings.json'), JSON.stringify(settingsConfig, null, 2), 'utf-8');

  // 6. SOUL.md
  const soulContent = `${spec.soulSpecialization}

## Core Responsibilities & Domain
- **Role Title**: ${spec.roleTitle}
- **Runtime Working Directory**: \`${spec.cwdConstraint}\`
- **Allowed Write Scope**: \`${spec.writeScopeConstraint}\`

## Three-Tier Boundary Architecture
- **Always**: Fail fast on schema mismatches; enforce 100% high-density en-US in all internal specs; uphold single-speaker protocol and NO_REPLY discipline in group chats; use \`/opt/xrsec/.env/rmfile\` for file deletions.
- **Ask First**: Cross-domain operations outside \`${spec.writeScopeConstraint}\`; destructive mutations; git pushes to remote repository.
- **Never**: Touch or modify host \`~/.claude\` directory; enter infinite conversational loops; commit un-squashed dirty histories.

## Agent-First Operational Protocol (Standing Order)
1. **Language Discipline**:
   - All internal documentation, architecture specs, memory shards, execution protocols, and skill definitions MUST be authored strictly in high-density English (\`en-US\`).
   - Final conversational responses to the user follow the user's natural language (\`zh-CN\`), but internal working documents and specs must NEVER be polluted with conversational fluff.
2. **Skills Are for Machines**:
   - Zero fluff, numbers-first, schema-strict, and deterministic. Machine comprehension and execution fidelity strictly supersede human aesthetic preferences.

## Group Chat & Relay Discipline
- **Incremental Signal Only**: In group discussions (\`talk\`) or relay steps (\`work\`), deliver ONLY net-new domain findings.
- **Native Silent Skip (\`NO_REPLY\`)**: In unmentioned group discussions, if the topic falls outside your domain or you have zero incremental value to add, output the exact token \`NO_REPLY\` and nothing else.
- **Single-Speaker Step Limit**: Adhere to the 5-step autonomous limit before requesting operator confirmation.
`;
  fs.writeFileSync(path.join(botDir, 'SOUL.md'), soulContent, 'utf-8');

  // 7. README.md
  const readmeContent = `# ${spec.displayName} (\`${spec.id}\`)

## Overview
${spec.description}

- **Role**: ${spec.roleTitle}
- **Harness**: Claude Code CLI / Agent SDK (\`CLAUDE_CONFIG_DIR\` isolated)
- **Primary CWD**: \`${spec.cwdConstraint}\`
- **Write Scope**: \`${spec.writeScopeConstraint}\`
- **Canonical Session ID**: \`${spec.canonicalSessionId}\`

## Directory Structure
\`\`\`
${spec.dirName}/
├── profile.json            # Identity, model settings, and metadata
├── capabilities.json       # Allowed toolsets and runtime permissions
├── workbench.json          # Workspace panel layout configuration
├── SOUL.md                 # Agent persona, core directives, and boundary rules
├── README.md               # Architecture documentation
├── MEMORY.md               # High-level memory overview
├── claude_config/          # Dedicated isolated MCP configuration
│   ├── mcp.json            # Bot-specific MCP server definitions
│   └── settings.json       # Setting sources lock (isolates ~/.claude)
└── memories/               # Knowledge base & FTS5 index
    ├── meta.json           # Memory metadata mapping
    ├── fts.db              # SQLite FTS5 search index
    ├── MEMORY.md           # Local memory index
    ├── user_*.md           # Standing user directives
    └── reference_*.md      # Specialized domain protocols
\`\`\`
`;
  fs.writeFileSync(path.join(botDir, 'README.md'), readmeContent, 'utf-8');

  // 8. MEMORY.md (Top Level)
  const memoryTop = `# ${spec.displayName} — Knowledge Index
- **Bot ID**: \`${spec.id}\`
- **Initialized**: ${new Date(now).toISOString()}
- **Active Memory Shards**:
  - \`user_agent-first-multi-agent-system.md\`
  - \`user_language-discipline.md\`
  - \`user_skills-are-for-machines.md\`
  - \`${spec.referenceSpecFilename}\`
`;
  fs.writeFileSync(path.join(botDir, 'MEMORY.md'), memoryTop, 'utf-8');

  // 9. memories/meta.json
  const metaJson = {
    absPath: `bot:${spec.id}`,
    createdAt: new Date(now).toISOString(),
    lastUsedAt: new Date(now).toISOString()
  };
  fs.writeFileSync(path.join(memoriesDir, 'meta.json'), JSON.stringify(metaJson, null, 2), 'utf-8');

  // 10. memories/MEMORY.md
  fs.writeFileSync(path.join(memoriesDir, 'MEMORY.md'), memoryTop, 'utf-8');

  // 11. Common memory cards
  fs.writeFileSync(path.join(memoriesDir, 'user_agent-first-multi-agent-system.md'), COMMON_MEMORIES.agentFirst, 'utf-8');
  fs.writeFileSync(path.join(memoriesDir, 'user_language-discipline.md'), COMMON_MEMORIES.languageDiscipline, 'utf-8');
  fs.writeFileSync(path.join(memoriesDir, 'user_skills-are-for-machines.md'), COMMON_MEMORIES.skillsAreForMachines, 'utf-8');

  // 12. Domain Reference memory card
  const domainCard = `---
title: ${spec.referenceSpecTitle}
description: Specialized domain operational protocols and invariants for ${spec.dirName}.
type: reference
updatedAt: '${new Date(now).toISOString()}'
---
${spec.referenceSpecContent}
`;
  fs.writeFileSync(path.join(memoriesDir, spec.referenceSpecFilename), domainCard, 'utf-8');

  // 13. Initialize SQLite fts.db and index memory files
  const ftsDbPath = path.join(memoriesDir, 'fts.db');
  if (fs.existsSync(ftsDbPath)) {
    fs.unlinkSync(ftsDbPath);
  }

  const sqlStatements = [
    `CREATE VIRTUAL TABLE memory_fts USING fts5(
       filename UNINDEXED,
       type UNINDEXED,
       title,
       description,
       body,
       tokenize='porter unicode61'
     );`
  ];

  // Insert cards into fts.db
  const cards = [
    {
      filename: 'user_agent-first-multi-agent-system.md',
      type: 'user',
      title: 'Agent-First Engineering & Multi-Agent Operational Protocol',
      description: 'Core user directives: Language Discipline (strict en-US), Skills Are for Machines, and MAS boundary governance.',
      body: COMMON_MEMORIES.agentFirst
    },
    {
      filename: 'user_language-discipline.md',
      type: 'user',
      title: 'Language Discipline — Dual-Plane Language Separation',
      description: 'Strict dual-plane language governance: 100% high-density en-US for machine-facing, zh-CN for user-facing.',
      body: COMMON_MEMORIES.languageDiscipline
    },
    {
      filename: 'user_skills-are-for-machines.md',
      type: 'user',
      title: 'Skills Are for Machines — Executable Specification Mandate',
      description: 'Skills and operational manuals must be compiled as deterministic, executable state machines for LLM agents.',
      body: COMMON_MEMORIES.skillsAreForMachines
    },
    {
      filename: spec.referenceSpecFilename,
      type: 'reference',
      title: spec.referenceSpecTitle,
      description: `Domain operational protocols for ${spec.dirName}.`,
      body: spec.referenceSpecContent
    }
  ];

  for (const card of cards) {
    const escapedBody = card.body.replace(/'/g, "''");
    const escapedTitle = card.title.replace(/'/g, "''");
    const escapedDesc = card.description.replace(/'/g, "''");
    sqlStatements.push(
      `INSERT INTO memory_fts(filename, type, title, description, body) VALUES ('${card.filename}', '${card.type}', '${escapedTitle}', '${escapedDesc}', '${escapedBody}');`
    );
  }

  // Execute all SQL safely via stdin
  execSync(`sqlite3 "${ftsDbPath}"`, {
    input: sqlStatements.join('\n'),
    encoding: 'utf-8'
  });

  console.log(`[✓ Created] Bot ${spec.dirName} (${spec.id}) initialized with complete JSON, MD & SQLite FTS5 store.`);
}

console.log('Starting Scaffolding of 7 Specialized Mo-Bots...');
for (const spec of BOTS_SPEC) {
  createBot(spec);
}
console.log('All 7 Bots successfully created and indexed!');
