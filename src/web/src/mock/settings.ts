export interface ProviderConfig {
  id: string;
  name: string;
  icon: string;
  status: 'connected' | 'disconnected';
  baseUrl?: string;
  defaultModel: string;
  models: string[];
}

export const MOCK_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    icon: '⚡',
    status: 'connected',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5-5',
    models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1'],
  },
  {
    id: 'openai',
    name: 'OpenAI (GPT / Codex)',
    icon: '🟢',
    status: 'connected',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.5',
    models: ['gpt-5.5', 'gpt-5-mini', 'o3', 'o1-preview'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    icon: '✨',
    status: 'connected',
    baseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-1.5-pro'],
  },
  {
    id: 'ollama',
    name: 'Ollama (Local Models)',
    icon: '🦙',
    status: 'connected',
    baseUrl: 'http://localhost:11434',
    defaultModel: 'deepseek-r1:32b',
    models: ['deepseek-r1:32b', 'llama3.3:70b', 'qwen2.5-coder:32b'],
  },
];

export const MOCK_SHORTCUTS = [
  { action: '新建对话 / 创建任务', shortcut: '⌘ N' },
  { action: '快速聚焦搜索框', shortcut: '⌘ F' },
  { action: '展开 / 收起侧边栏', shortcut: '⌘ B' },
  { action: '切换右侧功能抽屉 (Terminal / Files)', shortcut: '⌘ J' },
  { action: '发送消息', shortcut: 'Enter' },
  { action: '换行', shortcut: 'Shift + Enter' },
  { action: '清空当前草稿输入', shortcut: 'Escape' },
];

export const MOCK_USER_PROFILE = {
  name: 'XRSec',
  email: 'xr@cindy.app',
  avatar: '/assets/cindy-avatar-account.png',
  plan: 'Cindy Pro (Ultimate)',
  quota: {
    usedTokens: 1820400,
    totalTokens: 5000000,
    resetDate: '2026-11-28',
  },
};
