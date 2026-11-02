export interface OrcaWorker {
  id: string;
  label: string;
  role: string;
  agent: 'claude-code' | 'codex' | 'pi';
  model: string;
  effort: string;
  status: 'active' | 'busy' | 'idle' | 'completed';
  currentTask?: string;
  assignedTasks: number;
}

export const MOCK_ORCA_WORKFLOW = {
  workflowId: 'wf-m1-helper-01',
  title: 'M1 Helper 助手体系与架构验证工作流',
  lead: {
    id: 'worker-lead',
    label: 'lead',
    role: 'Lead Architect',
    agent: 'claude-code' as const,
    model: 'claude-opus-5-5',
    status: 'active' as const,
    currentTask: '调度子 Agent 进行模块拆解与静态类型验证',
  },
  workers: [
    {
      id: 'worker-dev-1',
      label: 'dev-ui',
      role: 'UI Page Shells Developer',
      agent: 'claude-code' as const,
      model: 'claude-sonnet-5-5',
      effort: 'medium',
      status: 'busy' as const,
      currentTask: '构建 cindy_web 所有 16+ 个核心页面的组件壳子',
      assignedTasks: 8,
    },
    {
      id: 'worker-mock-2',
      label: 'mock-data',
      role: 'Mock Data Synthesizer',
      agent: 'codex' as const,
      model: 'gpt-5.5',
      effort: 'high',
      status: 'completed' as const,
      currentTask: '生成会话、消息、机器人、技能与设置的结构化 Mock 数据',
      assignedTasks: 5,
    },
    {
      id: 'worker-qa-3',
      label: 'tester',
      role: 'Adversarial QA & Design Inspector',
      agent: 'pi' as const,
      model: 'gemini-2.5-pro',
      effort: 'high',
      status: 'idle' as const,
      currentTask: '等待 UI 构建完成后执行响应式与主题切换验收',
      assignedTasks: 3,
    },
  ],
  queue: [
    { id: 'q1', targetWorker: 'dev-ui', task: '完善 SettingsView 各子分区 Tab 页', status: 'processing' },
    { id: 'q2', targetWorker: 'tester', task: '验证移动端/窄屏下的抽屉式响应', status: 'pending' },
    { id: 'q3', targetWorker: 'lead', task: '合并交付物并更新路由索引', status: 'pending' },
  ],
};
