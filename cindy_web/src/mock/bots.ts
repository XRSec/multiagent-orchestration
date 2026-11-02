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
    id: 'bot-reviewer',
    name: 'Ada',
    title: 'Code Reviewer 架构审查员',
    avatar: '/assets/agent-island-annie.png',
    role: '代码审查与规范把关',
    department: '研发工程组',
    model: 'claude-opus-5-5',
    status: 'online',
    lastMessage: '已完成对 M1 Helper 的代码审查，建议增加内存缓存命中测试',
    lastTime: '10:24',
    unreadCount: 1,
    description: '擅长静态代码分析、性能瓶颈发现与对抗性验证，提供高质量的修改建议。',
    capabilities: ['代码审查', '单元测试覆盖', '架构合规', '内存泄漏检测'],
    systemPrompt: '你是一名资深首席架构师与安全专家，以高标准进行代码审查，直击核心问题并给出改写方案。',
    stats: {
      tasksCompleted: 432,
      rating: 4.95,
      collaborations: 128,
    },
  },
  {
    id: 'bot-dev',
    name: 'Devon',
    title: 'Fullstack Developer 全栈开发',
    avatar: '/assets/agent-island-boli.png',
    role: '业务实现与缺陷修复',
    department: '研发工程组',
    model: 'gpt-5.5',
    status: 'busy',
    lastMessage: '正在同步迁移 Cindy 原生侧边栏组件与样式细节',
    lastTime: '09:40',
    unreadCount: 0,
    description: '精通 React、TypeScript、Node.js 与 Rust，具备端到端落地完整功能的能力。',
    capabilities: ['前端开发', '后端服务', '接口联调', '数据库迁移'],
    systemPrompt: '专注于快速、优雅地编写高质量业务代码，遵循 DRY 原则并保持单元测试完善。',
    stats: {
      tasksCompleted: 890,
      rating: 4.88,
      collaborations: 256,
    },
  },
  {
    id: 'bot-devops',
    name: 'Orion',
    title: 'Cloud & CI/CD 运维专家',
    avatar: '/assets/agent-island-chaku.png',
    role: '流水线编排与环境维护',
    department: '基础平台组',
    model: 'claude-sonnet-5-5',
    status: 'online',
    lastMessage: '构建流水线状态正常，耗时 1.84s',
    lastTime: '昨天',
    unreadCount: 0,
    description: '负责 Docker、K8s 集群调度，自动化构建与灰度发布流水线管理。',
    capabilities: ['GitHub Actions', 'Docker 容器化', '监控告警', '服务部署'],
    systemPrompt: '保障系统高可用与交付效率，严格遵循不可变基础设施原则。',
    stats: {
      tasksCompleted: 310,
      rating: 4.92,
      collaborations: 84,
    },
  },
  {
    id: 'bot-pm',
    name: 'Sophia',
    title: 'Product Strategist 产品参谋',
    avatar: '/assets/agent-island-erika.png',
    role: '需求梳理与用户故事设计',
    department: '产品体验组',
    model: 'gemini-2.5-pro',
    status: 'offline',
    lastMessage: '已更新 Cindy Web 版的交互还原需求清单',
    lastTime: '前天',
    unreadCount: 0,
    description: '深度洞察用户痛点，把复杂模糊的需求转化为清晰可验证的 Acceptance Criteria。',
    capabilities: ['PRD 撰写', '交互路径梳理', '竞品分析', '里程碑拆解'],
    systemPrompt: '从最终用户体验出发，协助明确需求边界，提供精炼有效的产品规划。',
    stats: {
      tasksCompleted: 215,
      rating: 4.9,
      collaborations: 62,
    },
  },
];

export const MOCK_BOT_GROUPS: BotGroupItem[] = [
  {
    id: 'group-m1',
    name: 'Cindy 核心研发协同群',
    memberAvatars: [
      '/assets/agent-island-erika.png',
      '/assets/agent-island-boli.png',
      '/assets/agent-island-annie.png',
      '/assets/agent-island-chaku.png',
    ],
    membersCount: 4,
    lastSpeaker: 'Sophia',
    lastMessage: '大家注意，Cindy Web 端需要完成所有 App UI 页面壳子的完整适配',
    lastTime: '14:20',
    unreadCount: 3,
    isRunning: true,
    runningText: 'Devon 正在编写侧栏…',
  },
  {
    id: 'group-arch',
    name: '架构与性能攻坚组',
    memberAvatars: [
      '/assets/agent-island-annie.png',
      '/assets/agent-island-chaku.png',
    ],
    membersCount: 2,
    lastSpeaker: 'Ada',
    lastMessage: '已锁定上下文去脂方案与三层渐进披露策略',
    lastTime: '昨天',
    unreadCount: 0,
  },
];
