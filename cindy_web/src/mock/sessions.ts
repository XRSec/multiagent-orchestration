export interface SessionItem {
  id: string;
  title: string;
  workingDir: string;
  agentKind: 'claude-code' | 'codex' | 'pi';
  model: string;
  effort?: string;
  isPinned?: boolean;
  status: 'idle' | 'running' | 'completed' | 'error';
  updatedAt: string;
  messageCount: number;
  tokens?: string;
  tags?: string[];
}

export const MOCK_SESSIONS: SessionItem[] = [
  {
    id: 's-orca-lead-01',
    title: 'M1 Helper 架构与多 Agent 协同体系构建',
    workingDir: '/Users/xr/IDEA.localized/cindy',
    agentKind: 'claude-code',
    model: 'claude-opus-5-5',
    effort: 'high',
    isPinned: true,
    status: 'idle',
    updatedAt: '10 分钟前',
    messageCount: 14,
    tokens: '42.8k',
    tags: ['架构', 'Orca', 'Multiagent'],
  },
  {
    id: 's-web-shell-02',
    title: '从 cindy 获取 App UI 页面壳子到 cindy_web',
    workingDir: '/Users/xr/IDEA.localized/cindy_web',
    agentKind: 'claude-code',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    isPinned: true,
    status: 'running',
    updatedAt: '刚刚',
    messageCount: 8,
    tokens: '19.4k',
    tags: ['Web', 'UI', 'Mock'],
  },
  {
    id: 's-gate-web-03',
    title: 'Gate.com 交易桌面客户端暗色主题适配',
    workingDir: '/Users/xr/IDEA.localized/gate-web',
    agentKind: 'codex',
    model: 'gpt-5.5',
    effort: 'high',
    isPinned: false,
    status: 'completed',
    updatedAt: '今天 14:22',
    messageCount: 22,
    tokens: '85.2k',
    tags: ['Electron', 'Tailwind'],
  },
  {
    id: 's-skillhub-04',
    title: 'SkillHub 市场发布自动化检查流程排查',
    workingDir: '/Users/xr/IDEA.localized/cindy',
    agentKind: 'claude-code',
    model: 'claude-haiku-5-5',
    isPinned: false,
    status: 'completed',
    updatedAt: '昨天 19:10',
    messageCount: 6,
    tokens: '12.1k',
    tags: ['Skills', 'CI'],
  },
  {
    id: 's-crawler-05',
    title: 'Prism 浏览器自动化测试脚本优化与抽帧',
    workingDir: '/Users/xr/IDEA.localized/Prism-Browser',
    agentKind: 'pi',
    model: 'gemini-2.5-pro',
    isPinned: false,
    status: 'idle',
    updatedAt: '3 天前',
    messageCount: 31,
    tokens: '112.0k',
    tags: ['Playwright', 'Browser'],
  },
];
