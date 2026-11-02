export interface GhostPluginItem {
  id: string;
  name: string;
  icon: string;
  avatarChar?: string;
  avatarBg?: string;
  description: string;
  version: string;
  author: string;
  status: 'enabled' | 'disabled' | 'update_available';
  category: string;
  isInstalled: boolean;
  permissions: string[];
  toolsProvided: string[];
  hasMainView?: boolean;
}

export const MOCK_PLUGINS: GhostPluginItem[] = [
  {
    id: 'nowledge-mem-google-antigravity',
    name: 'nowledge-mem-google-antigravity',
    icon: 'N',
    avatarChar: 'N',
    avatarBg: 'bg-[#9E5A54] text-white',
    description: 'Google Antigravity plugin for Nowledge Mem workspace synchronization and thread recall.',
    version: '1.0.0',
    author: 'Nowledge Lab',
    status: 'enabled',
    category: 'Memory & State',
    isInstalled: true,
    permissions: ['Read local thread index', 'Write memory shards'],
    toolsProvided: ['nowledge-mem:save', 'nowledge-mem:search', 'nowledge-mem:status'],
  },
  {
    id: 'rtk',
    name: 'rtk',
    icon: 'R',
    avatarChar: 'R',
    avatarBg: 'bg-[#A67C52] text-white',
    description: 'Antigravity plugin for transparent command recall, output condensation and token budgeting.',
    version: '0.8.2',
    author: 'XRSec',
    status: 'enabled',
    category: 'CLI Acceleration',
    isInstalled: true,
    permissions: ['Intercept subprocess stdout', 'Manage token cache'],
    toolsProvided: ['rtk:bypass', 'rtk:recall'],
  },
  {
    id: 'cindy-github',
    name: 'GitHub',
    icon: '🐙',
    avatarChar: 'G',
    avatarBg: 'bg-[#24292e] text-white',
    description: '深入集成 GitHub，管理 Issues、Pull Requests、Actions 运行日志并直接回复 Code Review。',
    version: '1.4.2',
    author: 'Cindy Core',
    status: 'enabled',
    category: '开发工具',
    isInstalled: true,
    permissions: ['读取仓库代码', '管理 PR 与评审', '触发 Actions'],
    toolsProvided: ['call_tool', 'list_tools', 'create_pull_request_review', 'get_actions_log'],
  },
  {
    id: 'cindy-feishu',
    name: '飞书协作助手',
    icon: '🕊️',
    avatarChar: 'F',
    avatarBg: 'bg-[#3370FF] text-white',
    description: '连接飞书群聊与多维表格，支持消息机器人、任务下发与审批流程联动。',
    version: '2.1.0',
    author: 'Lizi Open',
    status: 'enabled',
    category: '协同办公',
    isInstalled: true,
    permissions: ['发送飞书群消息', '读取多维表格', '同步知识库'],
    toolsProvided: ['send_feishu_message', 'sync_bitable', 'get_approval_instance'],
    hasMainView: true,
  },
];
