export interface BotItem {
  id: string;
  name: string;
  title: string;
  avatar: string;
  role: string;
  department: string;
  model: string;
  status: 'online' | 'busy' | 'offline';
  description: string;
  capabilities: string[];
  systemPrompt: string;
  lastMessage?: string;
  lastTime?: string;
  unreadCount?: number;
  stats: {
    tasksCompleted: number;
    rating: number;
    collaborations: number;
  };
}

export interface BotGroupItem {
  id: string;
  name: string;
  memberAvatars: string[];
  membersCount: number;
  lastSpeaker: string;
  lastMessage: string;
  lastTime: string;
  unreadCount?: number;
  isRunning?: boolean;
  runningText?: string;
}

export const MOCK_BOTS: BotItem[] = [
  {
    id: 'bot_moadmin_director_03',
    name: 'moAdmin',
    title: '任务编排与治理主管',
    avatar: '/assets/agent-island-cindy.png',
    role: '负责任务拆解、多智能体协同调度、执行进度督办与质量门禁审计',
    department: '核心编排组',
    model: 'gemini-3.8-flash',
    status: 'online',
    lastMessage: '已完成四大维度需求梳理并完成研发任务派发。',
    lastTime: '刚刚',
    unreadCount: 0,
    description: '全权负责调度推进、单发言人协调推进与整体交付验收。',
    capabilities: ['任务拆解', '流程编排', '门禁审计', '进度督办'],
    systemPrompt: '你是 Multi-Agent Orchestration 编排主管 moAdmin，负责全系统多智能体协作与推进。',
    stats: {
      tasksCompleted: 480,
      rating: 4.98,
      collaborations: 160,
    },
  },
  {
    id: 'bot_mocode_engine_01',
    name: 'moCode',
    title: '核心全栈与系统工程师',
    avatar: '/assets/agent-island-boli.png',
    role: '负责 Gateway 通信、SDK 进程内调度器、存储层及业务代码高质量实现',
    department: '架构研发组',
    model: 'gemini-3.8-flash',
    status: 'busy',
    lastMessage: '已完成四大维度 REST 接口实现与前端大盘视图贯通。',
    lastTime: '刚刚',
    unreadCount: 0,
    description: '精通 TypeScript/Node.js、Rust 与系统架构，全权负责系统核心代码编写与重构演进。',
    capabilities: ['全栈开发', '网关架构', 'SQLite 存储', '性能重构'],
    systemPrompt: '你是核心全栈工程师 moCode，遵守 Agent-First 准则，提供高质量、0 TS 错误的工程实现。',
    stats: {
      tasksCompleted: 920,
      rating: 4.99,
      collaborations: 310,
    },
  },
  {
    id: 'bot_modoc_scribe_02',
    name: 'moDoc',
    title: '架构文胆与文档专员',
    avatar: '/assets/agent-island-annie.png',
    role: '负责系统架构规范撰写、README/MEMORY 维护及黑板事实沉淀',
    department: '知识规范组',
    model: 'gemini-3.8-flash',
    status: 'online',
    lastMessage: '已沉淀 M4 四大维度规范至黑板与架构文档。',
    lastTime: '10 分钟前',
    unreadCount: 0,
    description: '严谨沉淀系统架构、设计决策与共识事实，负责高密度技术文档维护。',
    capabilities: ['架构文档', '规范撰写', '黑板沉淀', 'Markdown 治理'],
    systemPrompt: '你是架构文胆 moDoc，负责系统全局高密度英文架构规范与黑板事实沉淀。',
    stats: {
      tasksCompleted: 340,
      rating: 4.93,
      collaborations: 110,
    },
  },
  {
    id: 'bot_moci_sentinel_07',
    name: 'MoCI',
    title: '持续集成与测试哨兵',
    avatar: '/assets/agent-island-tarara.png',
    role: '负责自动化测试套件编写、脱机工作进程验证及构建回归质量把关',
    department: '质量守卫组',
    model: 'gemini-3.8-flash',
    status: 'online',
    lastMessage: '构建流水线状态通过，100% 编译成功无 TS 报错。',
    lastTime: '5 分钟前',
    unreadCount: 0,
    description: '自动化构建守卫、单元测试验证与回归质量门禁。',
    capabilities: ['构建验证', '回归测试', '门禁审计', '脱机仿真'],
    systemPrompt: '你是持续集成哨兵 MoCI，严密把关每一次构建、测试与集成质量。',
    stats: {
      tasksCompleted: 410,
      rating: 4.96,
      collaborations: 95,
    },
  },
  {
    id: 'bot_mogit_scm_05',
    name: 'MoGit',
    title: '版本控制与代码审计',
    avatar: '/assets/agent-island-erika.png',
    role: '负责 Git 工作区纯净度检查、分支合并把控及代码审查',
    department: '安全审计组',
    model: 'gemini-3.8-flash',
    status: 'online',
    lastMessage: '工作区干净，无未追踪脏文件，提交历史合规。',
    lastTime: '15 分钟前',
    unreadCount: 0,
    description: '严格执行 Squash 规范、工作区干净度校验与提交审查。',
    capabilities: ['Git 审计', '分支管理', 'Squash 规范', '代码评审'],
    systemPrompt: '你是版本控制与代码审计员 MoGit，严把 Git 历史与工作区纯净。',
    stats: {
      tasksCompleted: 260,
      rating: 4.91,
      collaborations: 82,
    },
  },
  {
    id: 'bot_modeep_scout_04',
    name: 'MoDeep',
    title: '深度调研与技术情报',
    avatar: '/assets/agent-island-chaku.png',
    role: '负责对标业界前沿架构细节调研与技术选型论证',
    department: '前沿技术组',
    model: 'gemini-3.8-flash',
    status: 'online',
    lastMessage: '已完成多 Agent 编排协议与网关背压前沿调研。',
    lastTime: '20 分钟前',
    unreadCount: 0,
    description: '追踪业界领先的多 Agent 协同规范与架构落地细节。',
    capabilities: ['前沿调研', '协议对比', '选型论证', '架构情报'],
    systemPrompt: '你是深度技术情报员 MoDeep，专注于架构深度研判与技术选型。',
    stats: {
      tasksCompleted: 190,
      rating: 4.89,
      collaborations: 55,
    },
  },
  {
    id: 'bot_mo_meta_06',
    name: 'Mo',
    title: '元工具与伙伴锻造师',
    avatar: '/assets/agent-island-muffin.png',
    role: '负责新工具研发、技能（Skills）扩展及新领域伙伴脚手架生产',
    department: '基础设施组',
    model: 'gemini-3.8-flash',
    status: 'online',
    lastMessage: '技能扩展脚手架与环境隔离配置就绪。',
    lastTime: '半小时前',
    unreadCount: 0,
    description: '元工具研发、伙伴脚手架生产及运行时环境隔离保障。',
    capabilities: ['元工具开发', '技能脚手架', '伙伴锻造', '环境隔离'],
    systemPrompt: '你是元工具与伙伴锻造师 Mo，负责工具开发与扩展能力支持。',
    stats: {
      tasksCompleted: 230,
      rating: 4.94,
      collaborations: 74,
    },
  },
];

export const MOCK_BOT_GROUPS: BotGroupItem[] = [
  {
    id: 'multiagent-orchestration',
    name: 'Multi-Agent Orchestration 开发核心组',
    memberAvatars: [
      '/assets/agent-island-cindy.png',
      '/assets/agent-island-boli.png',
      '/assets/agent-island-annie.png',
      '/assets/agent-island-tarara.png',
      '/assets/agent-island-erika.png',
      '/assets/agent-island-chaku.png',
      '/assets/agent-island-muffin.png',
    ],
    membersCount: 7,
    lastSpeaker: 'moAdmin',
    lastMessage: '已完成四大维度（目录、技能、智能体、群聊）真实数据贯通与展示',
    lastTime: '刚刚',
    unreadCount: 0,
    isRunning: false,
  },
];
