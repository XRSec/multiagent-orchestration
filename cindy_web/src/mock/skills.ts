export type SkillScope = 'builtin' | 'global';
export type SkillType = 'skill' | 'rule';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  type?: SkillType;
  kind?: 'skill' | 'agent' | 'command';
  projectGroup?: string;
  sourcePath?: string;
  version?: string;
  author?: string;
  files?: { name: string; size: string; isMain?: boolean }[];
  promptSnippet: string;
}

export interface McpServerItem {
  id: string;
  name: string;
  status: 'connected' | 'disabled';
  toolsCount: number;
  configPath?: string;
}

export interface CustomAgentItem {
  id: string;
  name: string;
  role: string;
  description: string;
}

export interface GlobalFolderOption {
  id: string;
  name: string;
  path: string;
  label: string;
  isDefault?: boolean;
}

export const GLOBAL_FOLDERS: GlobalFolderOption[] = [
  { id: 'agents', name: '~/.agents/skills', path: '/Users/xr/.agents/skills', label: 'Centralized (~/.agents/skills)', isDefault: true },
  { id: 'claude', name: '~/.claude/skills', path: '/Users/xr/.claude/skills', label: 'Claude Code (~/.claude/skills)', isDefault: false },
  { id: 'cindy', name: '~/.cindy/skills', path: '/Users/xr/.cindy/skills', label: 'Cindy Native (~/.cindy/skills)', isDefault: false },
];

export const MCP_CONFIG_PATH = '/Users/xr/.agents/mcp/config.json';

export const MOCK_SKILLS: SkillItem[] = [
  {
    id: 's-agy-customizations',
    name: 'agy-customizations',
    description: 'Comprehensive guide and reference for the Antigravity Customization System. Use for plugins, skills, custom agents, and MCP servers.',
    scope: 'builtin',
    type: 'rule',
    author: 'antigravity',
    version: '1.0.0',
    promptSnippet: `# agy-customizations
Comprehensive guide and reference for the Antigravity Customization System.
- Covers plugins, skills, rules, custom agents, and MCP tools
- Standardized file layouts across global and workspace scopes`,
  },
  {
    id: 's-antigravity-guide',
    name: 'antigravity-guide',
    description: 'Provides a comprehensive guide, quick reference, and sitemap for Google Antigravity features, workflows, and extensions.',
    scope: 'builtin',
    type: 'rule',
    author: 'antigravity',
    version: '1.2.0',
    promptSnippet: `# antigravity-guide
Quick reference manual for Antigravity developer shortcuts, environment variables, and CLI tooling.`,
  },
  {
    id: 's-automation',
    name: 'automation',
    description: 'Interactive guide to design and create a scheduled background automation. Use this skill when scheduling recurring jobs.',
    scope: 'builtin',
    type: 'skill',
    author: 'antigravity',
    version: '2.0.0',
    promptSnippet: `# automation
Designs cron expressions and configures autonomous background tasks with failure alerts.`,
  },
  {
    id: 's-cua-driver',
    name: 'cua-driver',
    description: 'Drive native desktop apps through cua-driver with snapshot-before-action and verify-after-action safety primitives.',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '1.8.0',
    sourcePath: '/Users/xr/.agents/skills/cua-driver/SKILL.md',
    promptSnippet: `# cua-driver
GUI automation primitives for operating desktop windows, clicking buttons, and reading text.`,
  },
  {
    id: 's-ego-browser',
    name: 'ego-browser',
    description: 'When you need a browser, read this Skill by default. Use it to open and operate websites, fill forms, and take screenshots.',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '2.4.0',
    sourcePath: '/Users/xr/.agents/skills/ego-browser/SKILL.md',
    promptSnippet: `# ego-browser
Playwright automation runner with DOM snapshotting and interactive navigation.`,
  },
  {
    id: 's-gemini-research-exporter',
    name: 'gemini-research-exporter',
    description: '解析 Gemini（含 Deep Research / 联网搜索调研）长篇调研数据，保留完整引文与图表结构输出。',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '2.1.0',
    sourcePath: '/Users/xr/.agents/skills/gemini-research-exporter/SKILL.md',
    promptSnippet: `# gemini-research-exporter
提取长篇 Deep Research 报告并格式化为标准 Markdown 研报。`,
  },
  {
    id: 's-generative-ui',
    name: 'generative_ui',
    description: 'How to render rich interactive HTML widgets inline in the chat or as standalone artifacts with real-time state binding.',
    scope: 'builtin',
    type: 'skill',
    author: 'antigravity',
    version: '1.5.0',
    promptSnippet: `# generative_ui
Render reactive UI components conforming to Cindy and Antigravity conversation surfaces.`,
  },
  {
    id: 's-impeccable',
    name: 'impeccable',
    description: 'Use when the user wants to design, redesign, shape, critique, audit, polish, simplify, harden, animate, or improve a frontend.',
    scope: 'global',
    type: 'skill',
    author: 'impeccable',
    version: '3.1.2',
    sourcePath: '/Users/xr/.agents/skills/impeccable/SKILL.md',
    promptSnippet: `# impeccable
High-craft frontend design auditor, token extractor, and visual design review system.`,
  },
  {
    id: 's-migrate-workflows',
    name: 'migrate-workflows',
    description: 'Automatically migrate legacy workflows to modern skills across global and workspace directories.',
    scope: 'builtin',
    type: 'rule',
    author: 'antigravity',
    version: '1.1.0',
    promptSnippet: `# migrate-workflows
Translate legacy workflows into standard skill directory contracts.`,
  },
  {
    id: 's-oil-ui',
    name: 'oil-ui',
    description: '设计、改进和评审网站、App、后台与组件的界面：探索设计方向、生成多风格同屏对比页，并基于真实内容定版式。',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '2.0.0',
    sourcePath: '/Users/xr/.agents/skills/oil-ui/SKILL.md',
    promptSnippet: `# oil-ui
深入版式层级，优化空白留白，统一设计质感与视觉阶梯。`,
  },
  {
    id: 's-permissioned-github',
    name: 'permissioned-github',
    description: 'Guidelines for interacting with GitHub and request permissions from the user when mutating remote repository state.',
    scope: 'builtin',
    type: 'rule',
    author: 'antigravity',
    version: '1.3.0',
    promptSnippet: `# permissioned-github
Safe GitHub operations with confirmation boundaries on PR merge and release publishing.`,
  },
  {
    id: 's-pi-process-testing',
    name: 'pi-process-testing',
    description: 'Test Pi Coding Agent subprocess and session behavior using real CLI/JSON/RPC runtime contracts.',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '1.0.4',
    sourcePath: '/Users/xr/.agents/skills/pi-process-testing/SKILL.md',
    promptSnippet: `# pi-process-testing
Integration harness for child process lifetimes and NDJSON protocol conformance.`,
  },
  {
    id: 's-plugin',
    name: 'plugin',
    description: 'How to manage and create plugins — namespaced bundles of skills, agents, rules, MCP servers, and commands.',
    scope: 'builtin',
    type: 'rule',
    author: 'antigravity',
    version: '2.0.0',
    promptSnippet: `# plugin
Author and package plugin manifests, tools, and background processes.`,
  },
  {
    id: 's-prism',
    name: 'prism',
    description: 'Prism Antidetect Browser & Fingerprint Profile Automation Skill. Controls local Prism Vault profiles and fingerprints.',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '2.2.0',
    sourcePath: '/Users/xr/.agents/skills/prism/SKILL.md',
    promptSnippet: `# prism
Automate fingerprint vaults and proxy configurations on Chromium profiles.`,
  },
  {
    id: 's-run-workflow',
    name: 'run-workflow',
    description: 'How to write and run a dynamic workflow script with the `run_workflow` tool: a Python script orchestrating subagents.',
    scope: 'builtin',
    type: 'skill',
    author: 'antigravity',
    version: '1.4.0',
    promptSnippet: `# run-workflow
Deterministic multi-agent orchestrator script authoring and execution.`,
  },
  {
    id: 's-script-standards',
    name: 'script-standards',
    description: 'Practical engineering standards for automation, ops, and agent-generated scripts: line budgets, error handling, and docs.',
    scope: 'global',
    type: 'rule',
    author: 'xrsec',
    version: '1.4.0',
    sourcePath: '/Users/xr/.agents/skills/script-standards/SKILL.md',
    promptSnippet: `# script-standards
Production script hygiene: <=600 lines, explicit exit codes, defensive error trapping.`,
  },
  // Remaining 6 skills
  {
    id: 's-vps-browser-deployment',
    name: 'vps-browser-deployment',
    description: 'Deploy, manage, tune, and troubleshoot multi-instance Playwright and Chrome on remote VPS Linux environments.',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '2.1.0',
    sourcePath: '/Users/xr/.agents/skills/vps-browser-deployment/SKILL.md',
    promptSnippet: `# vps-browser-deployment
Deploying and tuning headless browser instances on Linux VPS.`,
  },
  {
    id: 's-vps-headless-gemini',
    name: 'vps-headless-gemini',
    description: 'VPS1 无头 Gemini 会话调度器。支持账号池随机轮换、流式会话保持与反封控限流。',
    scope: 'global',
    type: 'skill',
    author: 'xrsec',
    version: '1.2.0',
    sourcePath: '/Users/xr/.agents/skills/vps-headless-gemini/SKILL.md',
    promptSnippet: `# vps-headless-gemini
调度 VPS1 节点上无头 Gemini 进程池的自动化技能。`,
  },
  {
    id: 's-impeccable-asset-producer',
    name: 'impeccable-asset-producer',
    description: 'Produces clean reusable raster assets from approved Impeccable mock references without redesigning the direction.',
    scope: 'global',
    type: 'skill',
    kind: 'agent',
    author: 'impeccable',
    version: '3.0.0',
    sourcePath: '/Users/xr/.agents/skills/impeccable-asset-producer/AGENT.md',
    promptSnippet: `# impeccable-asset-producer
Generates production-ready icons and raster badges matching active design contract.`,
  },
  {
    id: 's-impeccable-documenter',
    name: 'impeccable-documenter',
    description: 'Records DESIGN.md and its sidecar from a finished Impeccable build, deriving the design system from shipped code.',
    scope: 'global',
    type: 'skill',
    kind: 'agent',
    author: 'impeccable',
    version: '2.8.0',
    sourcePath: '/Users/xr/.agents/skills/impeccable-documenter/AGENT.md',
    promptSnippet: `# impeccable-documenter
Derives DESIGN.md tokens and component catalogs from actual shipped source.`,
  },
  {
    id: 's-impeccable-finish-reviewer',
    name: 'impeccable-finish-reviewer',
    description: 'Reviews a finished Impeccable build against its direction contract, the approved comp, and quality bars.',
    scope: 'global',
    type: 'skill',
    kind: 'agent',
    author: 'impeccable',
    version: '2.5.0',
    sourcePath: '/Users/xr/.agents/skills/impeccable-finish-reviewer/AGENT.md',
    promptSnippet: `# impeccable-finish-reviewer
Performs adversarial visual inspection on padding, contrast, and typography.`,
  },
  {
    id: 's-impeccable-manual-edit-applier',
    name: 'impeccable-manual-edit-applier',
    description: 'Applies leased Impeccable live manual copy-edit batches to source and returns canonical Apply results.',
    scope: 'global',
    type: 'skill',
    kind: 'agent',
    author: 'impeccable',
    version: '1.1.0',
    sourcePath: '/Users/xr/.agents/skills/impeccable-manual-edit-applier/AGENT.md',
    promptSnippet: `# impeccable-manual-edit-applier
Applies atomic patch sets directly to source without rewriting surrounding structure.`,
  },
];

export const MOCK_MCP_SERVERS: McpServerItem[] = [
  {
    id: 'mcp-cua-driver',
    name: 'cua-driver',
    status: 'connected',
    toolsCount: 62,
    configPath: '/Users/xr/.agents/mcp/cua-driver',
  },
  {
    id: 'mcp-pi-web-access',
    name: 'pi-web-access',
    status: 'connected',
    toolsCount: 4,
    configPath: '/Users/xr/.agents/mcp/pi-web-access',
  },
];

export const MOCK_CUSTOM_AGENTS: CustomAgentItem[] = [];
