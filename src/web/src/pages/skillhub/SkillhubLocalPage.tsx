/**
 * Purpose: Local customizations and skillhub page for managing plugins, skills, agents, and MCP.
 * Context: Web UI Skillhub page with Marketplace and Installed views.
 * Usage: Route component for /skillhub and /skillhub/local.
 * Prerequisites: React, react-router-dom, Skillhub components and modals.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MOCK_MCP_SERVERS,
  MOCK_CUSTOM_AGENTS,
  MCP_CONFIG_PATH,
  SkillItem,
} from '@/mock/skills';
import { MOCK_PLUGINS } from '@/mock/plugins';
import type { BotItem } from '@/mock/bots';
import { useLocale } from '@/contexts/LocaleContext';
import { ImportSkillModal } from '@/components/ImportSkillModal';
import {
  SkillScopeToolbar,
  AVAILABLE_FOLDERS,
  FolderChoice,
} from './components/SkillScopeToolbar';
import {
  SkillhubMarketplaceTab,
  MarketPluginItem,
} from './components/SkillhubMarketplaceTab';
import { InstalledPluginsSection } from './components/InstalledPluginsSection';
import {
  InstalledSkillsSection,
  FilterSelection,
} from './components/InstalledSkillsSection';
import { InstalledAgentsSection } from './components/InstalledAgentsSection';
import { InstalledMcpSection } from './components/InstalledMcpSection';

const MARKET_PLUGINS: MarketPluginItem[] = [
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

  // 对话 ｜ 伙伴 作用域切换器
  const [scopeMode, setScopeMode] = useState<'dialogue' | 'bot'>('dialogue');
  const [selectedFolder, setSelectedFolder] = useState<FolderChoice>(AVAILABLE_FOLDERS[0]);
  const defaultBot: BotItem = {
    id: 'moAdmin',
    name: 'moAdmin',
    title: '任务编排与治理主管',
    avatar: '/assets/agent-island-cindy.png',
    role: '负责任务拆解与多智能体协同调度',
    department: '治理委员会',
    model: 'gemini-3.8-flash',
    status: 'online',
    description: '全流程督办研发进度。',
    capabilities: ['任务编排', '架构规范'],
    systemPrompt: '',
    stats: { tasksCompleted: 400, rating: 4.95, collaborations: 120 }
  };
  const [bots, setBots] = useState<BotItem[]>([defaultBot]);
  const [selectedBot, setSelectedBot] = useState<BotItem>(defaultBot);

  useEffect(() => {
    fetch('/api/bots')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.bots) && data.bots.length > 0) {
          const mapped: BotItem[] = data.bots.map((b: any) => ({
            id: b.id,
            name: b.name,
            title: b.title,
            avatar: b.avatar_url || '/assets/agent-island-cindy.png',
            role: b.role,
            department: b.department,
            model: b.model,
            status: 'online',
            description: b.description,
            capabilities: Array.isArray(b.capabilities?.tools) ? b.capabilities.tools : [],
            systemPrompt: b.soulSummary || '',
            stats: { tasksCompleted: 100, rating: 5.0, collaborations: 20 },
          }));
          setBots(mapped);
          setSelectedBot(mapped[0]);
        }
      })
      .catch(() => {});
  }, []);

  // Filter selection
  const [activeFilter, setActiveFilter] = useState<FilterSelection>('All');

  // Marketplace Category Sub-filter: all | plugins | skills
  const [marketCategory, setMarketCategory] = useState<'all' | 'plugins' | 'skills'>('all');
  const [installedMarketItems, setInstalledMarketItems] = useState<Record<string, boolean>>({});

  // Toggle switch states
  const [pluginsEnabled, setPluginsEnabled] = useState<Record<string, boolean>>({
    'nowledge-mem-google-antigravity': true,
    'rtk': true,
    'cindy-github': true,
    'cindy-feishu': true,
  });

  const [skillsEnabled, setSkillsEnabled] = useState<Record<string, boolean>>({});

  const [mcpEnabled, setMcpEnabled] = useState<Record<string, boolean>>({
    'mcp-cua-driver': true,
    'mcp-pi-web-access': true,
  });

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [customSkills, setCustomSkills] = useState<SkillItem[]>([]);
  const [serverSkills, setServerSkills] = useState<SkillItem[]>([]);

  const loadSkills = useCallback(async () => {
    try {
      const scopeParam =
        selectedFolder.id === 'workspace'
          ? 'workspace'
          : selectedFolder.id === 'global'
          ? 'global'
          : 'all';
      const res = await fetch(`/api/skills?scope=${scopeParam}`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.skills)) {
        const mapped: SkillItem[] = data.skills.map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          scope: s.scope === 'global' ? 'global' : 'builtin',
          type: s.type === 'rule' ? 'rule' : 'skill',
          promptSnippet: s.content,
          sourcePath: s.path,
          version: s.version || '1.0.0',
          author: s.author || 'Mo',
        }));
        setServerSkills(mapped);

        const enabledMap: Record<string, boolean> = {};
        data.skills.forEach((s: any) => {
          enabledMap[s.id] = s.enabled !== false;
        });
        setSkillsEnabled((prev) => ({ ...prev, ...enabledMap }));
      }
    } catch (e) {
      console.warn('Failed to load skills:', e);
    }
  }, [selectedFolder]);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Section Collapsed States
  const [pluginsCollapsed, setPluginsCollapsed] = useState(false);
  const [skillsCollapsed, setSkillsCollapsed] = useState(false);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [mcpCollapsed, setMcpCollapsed] = useState(false);

  // "+ See N more" toggle
  const [expandedSkillsList, setExpandedSkillsList] = useState(false);

  // MCP Servers copy path feedback
  const [copiedMcpPath, setCopiedMcpPath] = useState(false);
  const [copiedServerId, setCopiedServerId] = useState<string | null>(null);

  // Filter skills based on search & filter selection
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const baseSkills = serverSkills;
  const allSkillsList = [...customSkills, ...baseSkills];
  const filteredSkills = allSkillsList.filter((s) => {
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

  // Toggle Handlers
  const togglePlugin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPluginsEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSkill = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = !skillsEnabled[id];
    setSkillsEnabled((prev) => ({ ...prev, [id]: nextVal }));
    try {
      await fetch(`/api/skills/${encodeURIComponent(id)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextVal }),
      });
    } catch (err) {
      console.warn('Failed to toggle skill status:', err);
    }
  };

  const toggleMcp = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMcpEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  const handleSkillClick = (skill: SkillItem) => {
    navigate(`/skillhub/detail?id=${skill.id}`);
  };

  const handleInstallMarketItem = (id: string) => {
    setInstalledMarketItems((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none bg-surface p-3.5 sm:p-8 max-w-5xl mx-auto w-full space-y-4 sm:space-y-7">
      {/* 1. Header: Customizations / 个性化  Marketplace | Installed */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 sm:pb-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
            {t('个性化定制', 'Customizations')}
          </h1>
        </div>

        {/* Top-Right Capsule Segmented Pill */}
        <div className="flex items-center self-start sm:self-auto bg-[#1F1F1F] p-1 rounded-full border border-white/10 shadow-sm">
          <button
            type="button"
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
            type="button"
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

      {/* 2. Search & [对话: 文件夹 ｜ 伙伴] 切换条 */}
      <SkillScopeToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        scopeMode={scopeMode}
        onScopeModeChange={setScopeMode}
        selectedFolder={selectedFolder}
        onSelectFolder={setSelectedFolder}
        selectedBot={selectedBot}
        onSelectBot={setSelectedBot}
        bots={bots}
      />

      {/* 3. Marketplace View */}
      {topSegment === 'marketplace' && (
        <SkillhubMarketplaceTab
          marketCategory={marketCategory}
          onMarketCategoryChange={setMarketCategory}
          marketPlugins={MARKET_PLUGINS}
          installedMarketItems={installedMarketItems}
          onInstallMarketItem={handleInstallMarketItem}
          popularSkills={serverSkills}
          onSkillClick={handleSkillClick}
        />
      )}

      {/* 4. Installed View */}
      {topSegment === 'installed' && (
        <div className="space-y-8">
          <InstalledPluginsSection
            plugins={MOCK_PLUGINS}
            pluginsEnabled={pluginsEnabled}
            pluginsCollapsed={pluginsCollapsed}
            onToggleCollapse={() => setPluginsCollapsed(!pluginsCollapsed)}
            onTogglePlugin={togglePlugin}
            onNavigateMarketplace={() => switchSegment('marketplace')}
          />

          <InstalledSkillsSection
            filteredSkillsCount={filteredSkills.length}
            skillsCollapsed={skillsCollapsed}
            onToggleCollapse={() => setSkillsCollapsed(!skillsCollapsed)}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            activeFilter={activeFilter}
            onSelectFilter={setActiveFilter}
            visibleSkills={visibleSkills}
            skillsEnabled={skillsEnabled}
            onToggleSkill={toggleSkill}
            onSkillClick={handleSkillClick}
            expandedSkillsList={expandedSkillsList}
            remainingCount={remainingCount}
            onToggleExpand={() => setExpandedSkillsList(!expandedSkillsList)}
          />

          <InstalledAgentsSection
            customAgentsCount={MOCK_CUSTOM_AGENTS.length}
            agentsCollapsed={agentsCollapsed}
            onToggleCollapse={() => setAgentsCollapsed(!agentsCollapsed)}
          />

          <InstalledMcpSection
            mcpServers={MOCK_MCP_SERVERS}
            mcpEnabled={mcpEnabled}
            mcpCollapsed={mcpCollapsed}
            onToggleCollapse={() => setMcpCollapsed(!mcpCollapsed)}
            onToggleMcp={toggleMcp}
            copiedMcpPath={copiedMcpPath}
            onCopyMcpConfigPath={handleCopyMcpConfigPath}
            copiedServerId={copiedServerId}
            onCopyServerPath={handleCopyServerPath}
          />
        </div>
      )}

      {/* 5. 自定义 Skill 导入与实体管理弹窗 */}
      <ImportSkillModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          loadSkills();
        }}
      />
    </div>
  );
}
