import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Plus,
  Folder,
  SlidersHorizontal,
  Copy,
  Check,
  FileCode,
  FileText,
  Zap,
  Bot,
  Box,
  Terminal,
  ExternalLink,
  Sliders,
  AlignLeft,
  Download,
  Puzzle,
  Package,
  Users,
} from 'lucide-react';
import {
  MOCK_SKILLS,
  MOCK_MCP_SERVERS,
  MOCK_CUSTOM_AGENTS,
  GLOBAL_FOLDERS,
  MCP_CONFIG_PATH,
  SkillItem,
  GlobalFolderOption,
} from '@/mock/skills';
import { MOCK_PLUGINS } from '@/mock/plugins';
import { MOCK_BOTS, BotItem } from '@/mock/bots';
import { useLocale } from '@/contexts/LocaleContext';

type FilterSelection = 'All' | 'Skills' | 'Rules' | 'Built In' | 'Global';

interface FolderChoice {
  id: string;
  name: string;
  path: string;
  label: string;
}

const AVAILABLE_FOLDERS: FolderChoice[] = [
  { id: 'global', name: 'Global', path: '/Users/xr/.agents/skills', label: 'Global 全局库 (~/.agents/skills)' },
  { id: 'cindy', name: 'cindy', path: '/Users/xr/IDEA.localized/cindy', label: 'cindy 桌面项目' },
  { id: 'gate', name: 'gate', path: '/Users/xr/IDEA.localized/gate', label: 'gate 客户端项目' },
  { id: 'clash', name: 'Clash-Rule-Custom', path: '/Users/xr/IDEA.localized/Clash-Rule-Custom', label: '规则定制项目' },
  { id: 'multiagent', name: 'multiagent-orchestration', path: '/Users/xr/IDEA.localized/multiagent-orchestration', label: '多 Agent 协同' },
];

export function SkillhubLocalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLocale();

  // Top Segment: Marketplace | Installed (Image 2 Capsule Style)
  const tabParam = searchParams.get('tab');
  const [topSegment, setTopSegment] = useState<'installed' | 'marketplace'>(
    tabParam === 'marketplace' ? 'marketplace' : 'installed'
  );

  useEffect(() => {
    if (tabParam === 'marketplace') {
      setTopSegment('marketplace');
    } else if (tabParam === 'installed') {
      setTopSegment('installed');
    }
  }, [tabParam]);

  const switchSegment = (seg: 'installed' | 'marketplace') => {
    setTopSegment(seg);
    if (seg === 'marketplace') {
      setSearchParams({ tab: 'marketplace' });
    } else {
      setSearchParams({});
    }
  };

  // Search input
  const [searchQuery, setSearchQuery] = useState('');

  // ==========================================================
  // 对话 ｜ 伙伴 作用域切换器 (用户核心要求)
  // 默认是 对话：文件夹 ｜ 伙伴
  // 切换伙伴后是 对话 ｜ 伙伴：伙伴名称 点击切换
  // ==========================================================
  const [scopeMode, setScopeMode] = useState<'dialogue' | 'bot'>('dialogue');
  const [selectedFolder, setSelectedFolder] = useState<FolderChoice>(AVAILABLE_FOLDERS[0]); // 默认 Global
  const [selectedBot, setSelectedBot] = useState<BotItem>(MOCK_BOTS[0]); // 默认 Ada
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isBotDropdownOpen, setIsBotDropdownOpen] = useState(false);
  const folderDropdownRef = useRef<HTMLDivElement>(null);
  const botDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
      if (botDropdownRef.current && !botDropdownRef.current.contains(event.target as Node)) {
        setIsBotDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter Dropdown state (Image 1 Style: Type [Skills, Rules], Source [Built In, Global])
  const [activeFilter, setActiveFilter] = useState<FilterSelection>('All');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Marketplace Category Sub-filter: all | plugins | skills
  const [marketCategory, setMarketCategory] = useState<'all' | 'plugins' | 'skills'>('all');
  const [installedMarketItems, setInstalledMarketItems] = useState<Record<string, boolean>>({});

  // ==========================================================
  // Toggle Switch States (所有的 plugin skill mcp 都支持开关关闭)
  // ==========================================================
  const [pluginsEnabled, setPluginsEnabled] = useState<Record<string, boolean>>({
    'nowledge-mem-google-antigravity': true,
    'rtk': true,
    'cindy-github': true,
    'cindy-feishu': true,
  });

  const [skillsEnabled, setSkillsEnabled] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    MOCK_SKILLS.forEach((s) => {
      map[s.id] = true;
    });
    return map;
  });

  const [mcpEnabled, setMcpEnabled] = useState<Record<string, boolean>>({
    'mcp-cua-driver': true,
    'mcp-pi-web-access': true,
  });

  const togglePlugin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPluginsEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSkill = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSkillsEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleMcp = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMcpEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Section Collapsed States
  const [pluginsCollapsed, setPluginsCollapsed] = useState(false);
  const [skillsCollapsed, setSkillsCollapsed] = useState(false);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [mcpCollapsed, setMcpCollapsed] = useState(false);

  // "+ See N more" toggle
  const [expandedSkillsList, setExpandedSkillsList] = useState(false);

  // MCP Servers copy path feedback (用户要求：mcp servers 的复制是复制 path)
  const [copiedMcpPath, setCopiedMcpPath] = useState(false);
  const [copiedServerId, setCopiedServerId] = useState<string | null>(null);

  // Filter skills based on search & filter selection
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSkills = MOCK_SKILLS.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(normalizedQuery) ||
      s.description.toLowerCase().includes(normalizedQuery);

    let matchesFilter = true;
    if (activeFilter === 'Skills') {
      matchesFilter = s.type === 'skill';
    } else if (activeFilter === 'Rules') {
      matchesFilter = s.type === 'rule';
    } else if (activeFilter === 'Built In') {
      matchesFilter = s.scope === 'builtin';
    } else if (activeFilter === 'Global') {
      matchesFilter = s.scope === 'global';
    }

    return matchesSearch && matchesFilter;
  });

  const INITIAL_VISIBLE_COUNT = 16;
  const visibleSkills = expandedSkillsList
    ? filteredSkills
    : filteredSkills.slice(0, INITIAL_VISIBLE_COUNT);
  const remainingCount = Math.max(0, filteredSkills.length - INITIAL_VISIBLE_COUNT);

  // Copy MCP Config Path
  const handleCopyMcpConfigPath = () => {
    navigator.clipboard.writeText(MCP_CONFIG_PATH);
    setCopiedMcpPath(true);
    setTimeout(() => setCopiedMcpPath(false), 1500);
  };

  const handleCopyServerPath = (id: string, path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedServerId(id);
    setTimeout(() => setCopiedServerId(null), 1500);
  };

  // Click on Skill -> Navigate to full detail page (用户要求：打开页面而不是显示预览)
  const handleSkillClick = (skill: SkillItem) => {
    navigate(`/skillhub/detail?id=${skill.id}`);
  };

  // Market Plugins Catalogue
  const marketPlugins = [
    {
      id: 'cindy-browser',
      name: 'Playwright Browser',
      author: 'Cindy Core',
      category: 'Automation',
      downloads: '14.2k',
      description: '提供无头与可视化浏览器执行环境，支持自动化 DOM 爬取、截图、点击与页面会话保持。',
    },
    {
      id: 'cindy-postgres',
      name: 'PostgreSQL Database Manager',
      author: 'Community',
      category: 'Data Storage',
      downloads: '8.9k',
      description: '直接连接 PostgreSQL 实例，可视化查询 Schema、执行迁移校验与性能慢查分析。',
    },
    {
      id: 'cindy-figma',
      name: 'Figma Design Token Sync',
      author: 'Design Works',
      category: 'Design Systems',
      downloads: '6.4k',
      description: '直接从 Figma 文件中读取 Design Token、色阶定义与图标，生成 Tailwind 配置。',
    },
    {
      id: 'cindy-docker',
      name: 'Docker Container Runtime',
      author: 'DevOps Team',
      category: 'Infrastructure',
      downloads: '11.0k',
      description: '本地与远程 Docker 容器状态实时监控、镜像构建日志捕获与容器重启调度。',
    },
  ];

  const handleInstallMarketItem = (id: string) => {
    setInstalledMarketItems((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none bg-surface p-8 max-w-5xl mx-auto w-full space-y-7">
      {/* ======================================================== */}
      {/* 1. Header: Customizations / 个性化  Marketplace | Installed */}
      {/* ======================================================== */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            {t('个性化定制', 'Customizations')}
          </h1>
        </div>

        {/* Top-Right Capsule Segmented Pill (1:1 还原用户 Image 2 截图) */}
        <div className="flex items-center bg-[#1F1F1F] p-1 rounded-full border border-white/10 shadow-sm">
          <button
            onClick={() => switchSegment('marketplace')}
            className={`px-4 py-1.5 text-xs rounded-full font-medium transition-all cursor-pointer ${
              topSegment === 'marketplace'
                ? 'bg-[#2E2E2E] text-white shadow-xs font-semibold'
                : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Marketplace
          </button>
          <button
            onClick={() => switchSegment('installed')}
            className={`px-4 py-1.5 text-xs rounded-full font-medium transition-all cursor-pointer ${
              topSegment === 'installed'
                ? 'bg-[#2E2E2E] text-white shadow-xs font-semibold'
                : 'text-[#8E8E93] hover:text-white'
            }`}
          >
            Installed
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. Search & [对话: 文件夹 ｜ 伙伴] 切换条 (用户重点要求)   */}
      {/* ======================================================== */}
      <div className="space-y-3">
        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customizations, plugins, skills..."
            className="w-full pl-10 pr-4 py-2.5 text-xs bg-surface-elevated/70 hover:bg-surface-elevated border border-border-default rounded-xl text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary transition-all shadow-xs"
          />
        </div>

        {/* [对话: 文件夹 ｜ 伙伴] 作用域切换条 */}
        <div className="flex items-center justify-between px-3.5 py-2 bg-surface-elevated/50 border border-border-default rounded-xl text-xs">
          <div className="flex items-center gap-3">
            {/* 对话 ｜ 伙伴 联合切换胶囊 */}
            <div className="flex items-center bg-surface-chip p-0.5 rounded-xl border border-border-subtle shadow-xs">
              {/* 1. 对话端 */}
              {scopeMode === 'dialogue' ? (
                <div className="relative" ref={folderDropdownRef}>
                  <button
                    onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-surface-elevated text-text-primary font-medium rounded-lg shadow-xs text-xs cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <Folder className="w-3.5 h-3.5 text-accent-amber shrink-0" />
                    <span>对话:</span>
                    <span className="font-mono text-text-primary font-semibold">{selectedFolder.name}</span>
                    <ChevronDown className="w-3 h-3 text-text-tertiary" />
                  </button>

                  {/* 文件夹下拉选择框 */}
                  {isFolderDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-80 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-2 z-50 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                        选择对话绑定的生效文件夹
                      </div>
                      {AVAILABLE_FOLDERS.map((f) => (
                        <div
                          key={f.id}
                          onClick={() => {
                            setSelectedFolder(f);
                            setIsFolderDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg cursor-pointer transition-colors text-xs flex items-center justify-between ${
                            selectedFolder.id === f.id
                              ? 'bg-surface-chip text-text-primary font-semibold'
                              : 'hover:bg-surface-hover text-text-secondary'
                          }`}
                        >
                          <div className="flex flex-col truncate">
                            <span className="font-mono text-text-primary font-medium">{f.name}</span>
                            <span className="text-[10px] text-text-tertiary">{f.path}</span>
                          </div>
                          {selectedFolder.id === f.id && (
                            <Check className="w-3.5 h-3.5 text-accent-blue shrink-0 ml-2" />
                          )}
                        </div>
                      ))}
                      <div className="pt-1.5 border-t border-border-subtle flex items-center justify-between px-2 text-[11px]">
                        <span className="text-text-tertiary">自定义本地绝对路径...</span>
                        <button
                          onClick={() => {
                            const path = prompt('请输入文件夹绝对路径:', selectedFolder.path);
                            if (path) {
                              setSelectedFolder({
                                id: 'custom',
                                name: path.split('/').pop() || path,
                                path,
                                label: path,
                              });
                              setIsFolderDropdownOpen(false);
                            }
                          }}
                          className="text-accent-blue hover:underline"
                        >
                          输入路径
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setScopeMode('dialogue')}
                  className="flex items-center gap-1.5 px-3 py-1 text-text-secondary hover:text-text-primary text-xs transition-colors cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5 text-text-tertiary" />
                  <span>对话</span>
                </button>
              )}

              {/* 中间分割线 */}
              <span className="text-text-tertiary opacity-40 px-1 select-none">｜</span>

              {/* 2. 伙伴端 */}
              {scopeMode === 'bot' ? (
                <div className="relative" ref={botDropdownRef}>
                  <button
                    onClick={() => setIsBotDropdownOpen(!isBotDropdownOpen)}
                    className="flex items-center gap-1.5 px-3 py-1 bg-surface-elevated text-text-primary font-medium rounded-lg shadow-xs text-xs cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <img
                      src={selectedBot.avatar}
                      alt=""
                      className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                    />
                    <span>伙伴:</span>
                    <span className="font-semibold text-text-primary">{selectedBot.name}</span>
                    <ChevronDown className="w-3 h-3 text-text-tertiary" />
                  </button>

                  {/* 伙伴下拉选择框 */}
                  {isBotDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1.5 w-72 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-2 z-50 space-y-1">
                      <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                        选择切换具体伙伴角色
                      </div>
                      {MOCK_BOTS.map((bot) => (
                        <div
                          key={bot.id}
                          onClick={() => {
                            setSelectedBot(bot);
                            setIsBotDropdownOpen(false);
                          }}
                          className={`p-2 rounded-lg cursor-pointer transition-colors text-xs flex items-center justify-between ${
                            selectedBot.id === bot.id
                              ? 'bg-surface-chip text-text-primary font-semibold'
                              : 'hover:bg-surface-hover text-text-secondary'
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <img
                              src={bot.avatar}
                              alt=""
                              className="w-6 h-6 rounded-full object-cover border border-border-default shrink-0"
                            />
                            <div className="flex flex-col truncate">
                              <span className="font-semibold text-text-primary">{bot.name}</span>
                              <span className="text-[10px] text-text-tertiary">{bot.title}</span>
                            </div>
                          </div>
                          {selectedBot.id === bot.id && (
                            <Check className="w-3.5 h-3.5 text-accent-purple shrink-0 ml-2" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setScopeMode('bot')}
                  className="flex items-center gap-1.5 px-3 py-1 text-text-secondary hover:text-text-primary text-xs transition-colors cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-text-tertiary" />
                  <span>伙伴</span>
                </button>
              )}
            </div>

            {/* 动态描述路径或伙伴详情 */}
            {scopeMode === 'dialogue' ? (
              <span className="text-text-tertiary font-mono text-[11px] truncate max-w-sm hidden sm:inline">
                {selectedFolder.path}
              </span>
            ) : (
              <span className="text-text-tertiary text-[11px] truncate max-w-sm hidden sm:inline">
                {selectedBot.title} · {selectedBot.model}
              </span>
            )}
          </div>

          {/* 状态徽章 */}
          <div className="flex items-center gap-2 text-text-tertiary text-[11px]">
            {scopeMode === 'dialogue' ? (
              <span className="font-mono text-[10px] bg-surface-chip px-2 py-0.5 rounded text-accent-green font-medium">
                WORKSPACE ACTIVE
              </span>
            ) : (
              <span className="font-mono text-[10px] bg-purple-500/10 px-2 py-0.5 rounded text-accent-purple font-medium">
                BOT BOUND
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MARKETPLACE TAB VIEW (整合 Plugins + Skills 公共生态市场)  */}
      {/* ======================================================== */}
      {topSegment === 'marketplace' && (
        <div className="space-y-6">
          {/* Sub-filter tabs */}
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setMarketCategory('all')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                  marketCategory === 'all'
                    ? 'bg-surface-chip text-text-primary font-semibold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                全部生态 (All)
              </button>
              <button
                onClick={() => setMarketCategory('plugins')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  marketCategory === 'plugins'
                    ? 'bg-surface-chip text-text-primary font-semibold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Puzzle className="w-3.5 h-3.5 text-accent-red" />
                <span>插件市场 (Plugins)</span>
              </button>
              <button
                onClick={() => setMarketCategory('skills')}
                className={`px-3 py-1 rounded-lg font-medium transition-colors flex items-center gap-1.5 ${
                  marketCategory === 'skills'
                    ? 'bg-surface-chip text-text-primary font-semibold'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-accent-green" />
                <span>技能生态 (Skills)</span>
              </button>
            </div>

            <span className="text-[11px] text-text-tertiary">
              来源：SkillHub & Ghost 官方生态源
            </span>
          </div>

          {/* 1. Plugins in Marketplace */}
          {(marketCategory === 'all' || marketCategory === 'plugins') && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Puzzle className="w-3.5 h-3.5 text-accent-red" />
                <span>推荐插件生态 (Ghost Plugins)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {marketPlugins.map((plugin) => (
                  <div
                    key={plugin.id}
                    className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-xs flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-text-primary">
                          {plugin.name}
                        </span>
                        <span className="text-[10px] bg-surface-chip text-text-secondary px-2 py-0.5 rounded-full font-mono">
                          {plugin.category}
                        </span>
                      </div>
                      <div className="text-[11px] text-text-tertiary mt-0.5">
                        作者: {plugin.author} · 下载: {plugin.downloads}
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed mt-1.5 line-clamp-2">
                        {plugin.description}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                      <span className="text-[10px] font-mono text-text-tertiary">
                        ID: {plugin.id}
                      </span>
                      <button
                        onClick={() => handleInstallMarketItem(plugin.id)}
                        disabled={installedMarketItems[plugin.id]}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                          installedMarketItems[plugin.id]
                            ? 'bg-surface-chip text-text-tertiary'
                            : 'bg-accent-cta text-accent-cta-fg hover:bg-accent-hover'
                        }`}
                      >
                        {installedMarketItems[plugin.id] ? (
                          <>
                            <Check className="w-3 h-3 text-accent-green" />
                            <span>已安装</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span>安装到 Global</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Skills in Marketplace */}
          {(marketCategory === 'all' || marketCategory === 'skills') && (
            <div className="space-y-3">
              <div className="text-xs font-bold text-text-primary uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-accent-green" />
                <span>热门技能包 (Skills & Rules)</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {MOCK_SKILLS.slice(0, 6).map((skill) => (
                  <div
                    key={skill.id}
                    className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-xs flex flex-col justify-between space-y-3"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold font-mono text-text-primary">
                          /{skill.name}
                        </span>
                        <span className="text-[10px] bg-surface-chip text-text-secondary px-2 py-0.5 rounded-full font-mono">
                          v{skill.version || '1.0.0'}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary leading-relaxed mt-1.5 line-clamp-2">
                        {skill.description}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-border-subtle flex items-center justify-between">
                      <span className="text-[11px] text-text-tertiary font-mono">
                        {skill.scope.toUpperCase()}
                      </span>
                      <button
                        onClick={() => handleSkillClick(skill)}
                        className="px-3 py-1 bg-surface hover:bg-surface-hover border border-border-default rounded-lg text-xs font-medium text-text-primary transition-colors"
                      >
                        查看定义
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* INSTALLED TAB VIEW: ONE SINGLE PAGE (适配 Claude 一页搞定) */}
      {/* ======================================================== */}
      {topSegment === 'installed' && (
        <div className="space-y-8">
          {/* ====================================================== */}
          {/* SECTION 1: Plugins (2) + Toggle Switch                 */}
          {/* ====================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setPluginsCollapsed(!pluginsCollapsed)}
                className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors"
              >
                <span>Plugins</span>
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
                  {MOCK_PLUGINS.length}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-text-tertiary transition-transform ${
                    pluginsCollapsed ? '-rotate-90' : ''
                  }`}
                />
              </button>

              <button
                onClick={() => switchSegment('marketplace')}
                className="flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create</span>
              </button>
            </div>

            {!pluginsCollapsed && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {MOCK_PLUGINS.slice(0, 2).map((plugin) => {
                  const isPluginOn = pluginsEnabled[plugin.id] !== false;
                  return (
                    <div
                      key={plugin.id}
                      className={`p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between gap-3 shadow-xs hover:shadow-sm transition-all ${
                        !isPluginOn ? 'opacity-55' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Square Avatar with Capital Initial (Antigravity Style) */}
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0 shadow-xs ${
                            plugin.avatarBg || 'bg-[#9E5A54] text-white'
                          }`}
                        >
                          {plugin.avatarChar || plugin.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-text-primary truncate flex items-center gap-1.5">
                            <span>{plugin.id}</span>
                            {!isPluginOn && (
                              <span className="text-[10px] text-text-tertiary font-normal">
                                (已关闭)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-text-secondary truncate mt-0.5">
                            {plugin.description}
                          </div>
                        </div>
                      </div>

                      {/* Toggle Switch + More Button */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => togglePlugin(plugin.id, e)}
                          className={`w-9 h-5 rounded-full p-0.5 transition-colors flex items-center cursor-pointer ${
                            isPluginOn
                              ? 'bg-[#3B82F6]'
                              : 'bg-surface-chip border border-border-default'
                          }`}
                          title={isPluginOn ? '已启用 (点击关闭)' : '已关闭 (点击开启)'}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform shadow-xs ${
                              isPluginOn ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <button className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ====================================================== */}
          {/* SECTION 2: Skills & Rules (22) + Toggle Switch         */}
          {/* ====================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSkillsCollapsed(!skillsCollapsed)}
                className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors"
              >
                <span>Skills & Rules</span>
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
                  {filteredSkills.length}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-text-tertiary transition-transform ${
                    skillsCollapsed ? '-rotate-90' : ''
                  }`}
                />
              </button>

              {/* Scope & Type Filter Dropdown (1:1 还原用户 Image 1 截图) */}
              <div className="relative" ref={filterDropdownRef}>
                <button
                  onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-lg hover:bg-surface-hover transition-colors font-medium border border-border-subtle cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-text-tertiary" />
                  <span>{activeFilter}</span>
                </button>

                {/* Filter Dropdown Popover */}
                {isFilterDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-48 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1.5 z-50 text-xs">
                    {/* All option */}
                    <div
                      onClick={() => {
                        setActiveFilter('All');
                        setIsFilterDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary font-medium"
                    >
                      <span>All</span>
                      {activeFilter === 'All' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                    </div>

                    <div className="h-px bg-border-subtle my-1" />

                    {/* Section: Type */}
                    <div className="px-3 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                      Type
                    </div>
                    <div
                      onClick={() => {
                        setActiveFilter('Skills');
                        setIsFilterDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                    >
                      <span>Skills</span>
                      {activeFilter === 'Skills' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                    </div>
                    <div
                      onClick={() => {
                        setActiveFilter('Rules');
                        setIsFilterDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                    >
                      <span>Rules</span>
                      {activeFilter === 'Rules' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                    </div>

                    <div className="h-px bg-border-subtle my-1" />

                    {/* Section: Source */}
                    <div className="px-3 py-1 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                      Source
                    </div>
                    <div
                      onClick={() => {
                        setActiveFilter('Built In');
                        setIsFilterDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                    >
                      <span>Built In</span>
                      {activeFilter === 'Built In' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                    </div>
                    <div
                      onClick={() => {
                        setActiveFilter('Global');
                        setIsFilterDropdownOpen(false);
                      }}
                      className="px-3 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer flex items-center justify-between text-text-primary"
                    >
                      <span>Global</span>
                      {activeFilter === 'Global' && <Check className="w-3.5 h-3.5 text-text-primary" />}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!skillsCollapsed && (
              <div className="bg-surface-elevated border border-border-default rounded-2xl divide-y divide-border-subtle shadow-xs overflow-hidden">
                {visibleSkills.map((skill) => {
                  const isSkillOn = skillsEnabled[skill.id] !== false;
                  return (
                    <div
                      key={skill.id}
                      onClick={() => handleSkillClick(skill)}
                      className={`px-4 py-2.5 flex items-center gap-3 hover:bg-surface-hover/70 cursor-pointer transition-colors text-xs group ${
                        !isSkillOn ? 'opacity-55' : ''
                      }`}
                    >
                      {/* Skill Slash Command Name */}
                      <span className="font-mono font-bold text-text-primary shrink-0 text-[12px] min-w-[170px]">
                        /{skill.name}
                      </span>

                      {/* Scope Pill Badge: [ Built In | Global ] */}
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 font-sans ${
                          skill.scope === 'builtin'
                            ? 'bg-surface-chip text-text-secondary border border-border-subtle'
                            : 'bg-blue-500/10 text-accent-blue border border-blue-500/20'
                        }`}
                      >
                        {skill.scope === 'builtin' ? 'Built In' : 'Global'}
                      </span>

                      {/* Description */}
                      <span
                        className={`truncate flex-1 text-[11px] leading-relaxed ${
                          !isSkillOn ? 'text-text-disabled line-through' : 'text-text-secondary'
                        }`}
                      >
                        {skill.description}
                      </span>

                      {/* Skill Toggle Switch */}
                      <button
                        type="button"
                        onClick={(e) => toggleSkill(skill.id, e)}
                        className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center shrink-0 cursor-pointer ${
                          isSkillOn
                            ? 'bg-[#3B82F6]'
                            : 'bg-surface-chip border border-border-default'
                        }`}
                        title={isSkillOn ? '已启用 (点击关闭)' : '已关闭 (点击开启)'}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-xs ${
                            isSkillOn ? 'translate-x-3.5' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      <ChevronRight className="w-3.5 h-3.5 text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                })}

                {/* + See N more toggle */}
                {remainingCount > 0 && !expandedSkillsList && (
                  <button
                    onClick={() => setExpandedSkillsList(true)}
                    className="w-full px-4 py-2.5 text-left text-xs text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>See {remainingCount} more</span>
                  </button>
                )}

                {expandedSkillsList && remainingCount > 0 && (
                  <button
                    onClick={() => setExpandedSkillsList(false)}
                    className="w-full px-4 py-2.5 text-center text-xs text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors font-medium cursor-pointer"
                  >
                    收起列表
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ====================================================== */}
          {/* SECTION 3: Custom Agents (0)                           */}
          {/* ====================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setAgentsCollapsed(!agentsCollapsed)}
                className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors"
              >
                <span>Custom Agents</span>
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
                  {MOCK_CUSTOM_AGENTS.length}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-text-tertiary transition-transform ${
                    agentsCollapsed ? '-rotate-90' : ''
                  }`}
                />
              </button>
            </div>

            {!agentsCollapsed && (
              <div className="text-xs text-text-tertiary py-0.5">
                No custom agents yet.
              </div>
            )}
          </div>

          {/* ====================================================== */}
          {/* SECTION 4: MCP Servers (2) + Toggle Switch             */}
          {/* ====================================================== */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setMcpCollapsed(!mcpCollapsed)}
                className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors"
              >
                <span>MCP Servers</span>
                <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
                  {MOCK_MCP_SERVERS.length}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-text-tertiary transition-transform ${
                    mcpCollapsed ? '-rotate-90' : ''
                  }`}
                />
              </button>

              <div className="flex items-center gap-1.5 text-text-tertiary">
                {/* Copy MCP Config Path (用户要求：mcp servers 的复制是复制 path) */}
                <button
                  onClick={handleCopyMcpConfigPath}
                  title={`复制全局 MCP 配置路径: ${MCP_CONFIG_PATH}`}
                  className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-text-primary transition-colors flex items-center gap-1 text-xs cursor-pointer"
                >
                  {copiedMcpPath ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-accent-green" />
                      <span className="text-[10px] text-accent-green font-mono">已复制路径</span>
                    </>
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => alert('新增 MCP Server 配置')}
                  title="Add MCP Server"
                  className="p-1.5 rounded-lg hover:bg-surface-hover hover:text-text-primary transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {!mcpCollapsed && (
              <div className="space-y-1.5">
                {MOCK_MCP_SERVERS.map((server) => {
                  const isMcpOn = mcpEnabled[server.id] !== false;
                  return (
                    <div
                      key={server.id}
                      className={`flex items-center justify-between text-xs text-text-secondary py-1 px-1 font-mono hover:bg-surface-hover/50 rounded-lg group transition-all ${
                        !isMcpOn ? 'opacity-55' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[13px] font-bold ${
                            !isMcpOn ? 'text-text-tertiary line-through' : 'text-text-primary'
                          }`}
                        >
                          {server.name}
                        </span>
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                            isMcpOn ? 'bg-accent-green' : 'bg-text-disabled'
                          }`}
                        />
                        <span className="text-text-tertiary">›</span>
                        <span className="text-text-tertiary font-sans text-xs">
                          {isMcpOn ? `${server.toolsCount} tools enabled` : 'Disabled (已停用)'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Server Specific Path Copy Button */}
                        {server.configPath && (
                          <button
                            onClick={() => handleCopyServerPath(server.id, server.configPath!)}
                            title={`复制此服务路径: ${server.configPath}`}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-hover text-text-tertiary hover:text-text-primary flex items-center gap-1 text-[10px] cursor-pointer"
                          >
                            {copiedServerId === server.id ? (
                              <>
                                <Check className="w-3 h-3 text-accent-green" />
                                <span className="text-accent-green">已复制</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>复制路径</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* MCP Toggle Switch */}
                        <button
                          type="button"
                          onClick={(e) => toggleMcp(server.id, e)}
                          className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center shrink-0 cursor-pointer ${
                            isMcpOn
                              ? 'bg-[#3B82F6]'
                              : 'bg-surface-chip border border-border-default'
                          }`}
                          title={isMcpOn ? '已启用 (点击关闭)' : '已关闭 (点击开启)'}
                        >
                          <div
                            className={`w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-xs ${
                              isMcpOn ? 'translate-x-3.5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
