export interface ToolCallItem {
  id: string;
  tool: string;
  description?: string;
  args?: Record<string, any>;
  output?: string;
  status: 'running' | 'success' | 'error';
  executionTimeMs?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  attachments?: { name: string; size: string; type: string }[];
  thinking?: {
    text: string;
    durationSeconds?: number;
  };
  toolCalls?: ToolCallItem[];
  todos?: { text: string; completed: boolean }[];
  diff?: {
    filePath: string;
    additions: number;
    deletions: number;
    code: string;
  };
}

export const MOCK_MESSAGES: ChatMessage[] = [
  {
    id: 'm1',
    role: 'user',
    content: '从 cindy 中获取 App UI 页面的壳子，所有 UI 页面都需要，存到 cindy_web 数据先用 mock 代替',
    timestamp: '15:20',
    attachments: [
      { name: 'router.tsx', size: '11.8 KB', type: 'code' },
    ],
  },
  {
    id: 'm2',
    role: 'assistant',
    content: '已为您系统勘测 Cindy 桌面端的完整 UI 架构。接下来我们将提取所有核心页面壳子，并在 `cindy_web` 中使用真实还原的样式和结构化 Mock 数据进行组装。',
    timestamp: '15:21',
    thinking: {
      durationSeconds: 4,
      text: `1. 分析 Cindy 桌面端路由架构：包含三层路由结构，涵盖 CCAgent、Bots、SkillHub、Settings、Ghost Plugins、Scheduler、Login 等 16+ 个完整页面。
2. 提取公共设计系统 Token 与色板：保持 Light (暖象牙底 #F2F2ED) 与 Dark (中性近黑 #181818) 主题系统一致。
3. 构建完整交互页面壳子与全方位 Mock 数据体系，保证 Web 独立免依赖运行。`,
    },
    todos: [
      { text: '分析 Cindy 桌面端全部路由与页面组件列表', completed: true },
      { text: '在 cindy_web 中搭建 Vite + React 19 + Tailwind CSS Web 运行环境', completed: true },
      { text: '提取并适配全局主题 Token、导航栏、侧边栏与标题栏壳子', completed: true },
      { text: '逐一还原所有 UI 页面壳子并接入结构化 Mock 数据', completed: true },
      { text: '验证页面完整性、响应式交互与暗色/亮色切换', completed: true },
    ],
    toolCalls: [
      {
        id: 't1',
        tool: 'Bash',
        description: '勘测 Cindy 桌面端路由结构',
        args: { command: 'cat apps/desktop/src/renderer/router.tsx' },
        output: '导出 hashRouter 配置，定义了 cc-agent, bots, skillhub, settings, plugins 等核心路由分支。',
        status: 'success',
        executionTimeMs: 142,
      },
      {
        id: 't2',
        tool: 'Write',
        description: '创建 cindy_web 项目与 UI 页面壳子',
        args: { file_path: '/Users/xr/IDEA.localized/cindy_web' },
        output: '项目骨架初始化完成，已导入 Cindy 原生设计 Token 与媒体素材。',
        status: 'success',
        executionTimeMs: 89,
      },
    ],
    diff: {
      filePath: 'src/router.tsx',
      additions: 124,
      deletions: 0,
      code: `+ export const routes = [
+   { path: '/login', element: <LoginPage /> },
+   { path: '/', element: <MainLayout /> },
+   { path: '/cc-agent', element: <CCAgentSessionView /> },
+   { path: '/bots', element: <BotsHomeView /> },
+   { path: '/skillhub', element: <SkillhubPage /> },
+   { path: '/plugins', element: <GhostPluginPage /> },
+   { path: '/settings', element: <SettingsPage /> },
+ ];`,
    },
  },
];
