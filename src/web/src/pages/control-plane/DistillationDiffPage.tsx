/**
 * DistillationDiffPage.tsx
 * 架构与提示词去脂蒸馏 Diff 视窗 (Cindy Web 规范):
 * - 分析目标支持：伙伴维度 vs 文件夹维度 (已有会话文件夹 / 项目工作区文件夹 / 自定义路径)
 * - 文件夹下多 Skill 智能识别与去脂缓存命中状态展示
 * - 双栏对照与滑动同步 (Synchronized Scrolling)，杜绝长文本错位
 * - MCP 工具与插件描述 (Tool Descriptions / Pi Skills) 臃肿精简对比
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState, useEffect } from 'react';
import {
  Flame,
  ArrowRight,
  TrendingDown,
  Lock,
  Cpu,
  Zap,
  Puzzle,
  Wrench,
  RefreshCw,
  Folder,
  User,
  History,
  Briefcase,
  CheckCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import { SynchronizedDiffViewer } from '@/components/SynchronizedDiffViewer';

interface WorkspaceFolderOption {
  id: string;
  name: string;
  path: string;
  type: 'session' | 'project';
  mtime?: number;
}

interface FolderSkillItem {
  id: string;
  name: string;
  path: string;
  hasDistillation: boolean;
  originalTokens: number;
  distilledTokens: number;
  reductionRate: string;
  rawContent: string;
  distilledBody: string;
}

export function DistillationDiffPage() {
  const [scopeType, setScopeType] = useState<'partner' | 'folder'>('partner');
  const [bots, setBots] = useState<Array<{ id: string; name: string }>>([
    { id: 'bot_moadmin_director_03', name: 'moAdmin' },
    { id: 'bot_mocode_engine_01', name: 'moCode' },
  ]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('bot_moadmin_director_03');

  useEffect(() => {
    fetch('/api/bots')
      .then((r) => r.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.bots) && data.bots.length > 0) {
          setBots(data.bots.map((b: any) => ({ id: b.id, name: b.name })));
          setSelectedPartnerId(data.bots[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // 默认预设会话目录与项目列表 (保证在接口未就绪或初始加载时下拉框充实且不为空)
  const INITIAL_SESSIONS: WorkspaceFolderOption[] = [
    {
      id: 'curr-session-4743493b',
      name: '当前活跃会话 (4743493b)',
      path: '/Users/xr/.gemini/antigravity-insiders/brain/4743493b-a73d-446c-a52a-0256d83614d2',
      type: 'session'
    },
    {
      id: 'session-orchestrator',
      name: '会话目录 (multiagent-orchestration)',
      path: '/Users/xr/.gemini/antigravity/brain/5e4555ce-dde6-4d4a-8808-a0fc69697373',
      type: 'session'
    }
  ];

  const INITIAL_PROJECTS: WorkspaceFolderOption[] = [
    {
      id: 'curr-workspace',
      name: '当前工程 (multiagent-orchestration)',
      path: '/Users/xr/IDEA.localized/multiagent-orchestration',
      type: 'project'
    },
    {
      id: 'global-skills',
      name: '全局技能库 (~/.agents/skills)',
      path: '/Users/xr/.agents/skills',
      type: 'project'
    }
  ];

  // 文件夹维度分类选择模式: 'session' | 'project' | 'custom'
  const [folderMode, setFolderMode] = useState<'session' | 'project' | 'custom'>('session');
  const [sessionFolders, setSessionFolders] = useState<WorkspaceFolderOption[]>(INITIAL_SESSIONS);
  const [projectFolders, setProjectFolders] = useState<WorkspaceFolderOption[]>(INITIAL_PROJECTS);
  const [selectedFolder, setSelectedFolder] = useState<string>(INITIAL_SESSIONS[0].path);
  const [loadingFolders, setLoadingFolders] = useState(false);

  // 扫描到的文件夹多份 Skills 列表
  const [folderSkills, setFolderSkills] = useState<FolderSkillItem[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');
  const [loadingSkills, setLoadingSkills] = useState(false);

  const [activeCategory, setActiveCategory] = useState<'tools' | 'mcps' | 'skills' | 'plugins'>('skills');

  // 获取会话目录与项目工作区列表
  useEffect(() => {
    async function fetchFolders() {
      setLoadingFolders(true);
      try {
        const res = await fetch('/api/workspaces/folders');
        const data = await res.json();
        if (data.ok) {
          setSessionFolders(data.sessions || []);
          setProjectFolders(data.projects || []);
          if (data.sessions?.length > 0 && folderMode === 'session') {
            setSelectedFolder(data.sessions[0].path);
          }
        }
      } catch (err) {
        console.warn('Fetch workspace folders error:', err);
      } finally {
        setLoadingFolders(false);
      }
    }
    fetchFolders();
  }, []);

  // 当选择的文件夹改变时，扫描该文件夹下的多份 Skill
  useEffect(() => {
    if (scopeType !== 'folder' || !selectedFolder) return;

    async function scanSkills() {
      setLoadingSkills(true);
      try {
        const res = await fetch(`/api/folders/skills?folderPath=${encodeURIComponent(selectedFolder)}`);
        const data = await res.json();
        if (data.ok && Array.isArray(data.skills)) {
          setFolderSkills(data.skills);
          if (data.skills.length > 0) {
            setSelectedSkillId(data.skills[0].id);
          } else {
            setSelectedSkillId('');
          }
        }
      } catch (err) {
        console.warn('Scan folder skills error:', err);
      } finally {
        setLoadingSkills(false);
      }
    }
    scanSkills();
  }, [selectedFolder, scopeType]);

  const handleFolderModeChange = (mode: 'session' | 'project' | 'custom') => {
    setFolderMode(mode);
    if (mode === 'session' && sessionFolders.length > 0) {
      setSelectedFolder(sessionFolders[0].path);
    } else if (mode === 'project' && projectFolders.length > 0) {
      setSelectedFolder(projectFolders[0].path);
    }
  };

  const currentSelectedSkill = folderSkills.find((s) => s.id === selectedSkillId) || folderSkills[0];

  // 维度静态展示数据与 MCP 工具描述优化数据
  const diffData = {
    tools: {
      title: 'Tools Schema Slimming & Parameter Pruning',
      desc: '剥离 $schema、examples、title 等冗余元数据，并将长描述精简为 <=80 字符',
      originalTokens: 840,
      distilledTokens: 380,
      reductionRate: '54.8%',
      baseline: `[\n  {\n    "name": "execute_shell_command",\n    "$schema": "http://json-schema.org/draft-07/schema#",\n    "title": "Execute Bash Shell Command Inside Isolated Environment",\n    "description": "Executes an arbitrary bash command in a subprocess and captures standard output, standard error, exit code, execution timestamps and memory quotas for diagnostic inspection.",\n    "examples": ["ls -la", "git status", "pnpm test"],\n    "parameters": {\n      "type": "object",\n      "properties": {\n        "command": {\n          "type": "string",\n          "title": "Command String",\n          "description": "The shell command line to execute. Must be valid bash syntax.",\n          "examples": ["echo hello"]\n        }\n      },\n      "required": ["command"]\n    }\n  }\n]`,
      distilled: `[\n  {\n    "name": "execute_shell_command",\n    "description": "Executes an arbitrary bash command in a subprocess and captures output...",\n    "parameters": {\n      "type": "object",\n      "properties": {\n        "command": {\n          "type": "string",\n          "description": "The shell command line to execute."\n        }\n      },\n      "required": ["command"]\n    }\n  }\n]`
    },
    mcps: {
      title: 'MCP Tool Descriptions & 2-Level Dispatch Slimming',
      desc: '精简 MCP 与 Plugin 作者臃肿工具描述 (Descriptions) 并收敛二级动态调度',
      originalTokens: 1680,
      distilledTokens: 290,
      reductionRate: '82.7%',
      baseline: `// 原文 Baseline: 常见第三方 MCP / Pi 插件自带冗长臃肿的工具与扩展说明 (极度消耗上下文 Tokens)\n{\n  "server": "mcp-pi-process-tester",\n  "tools": [\n    {\n      "name": "run_pi_agent_turn_process_inspection",\n      "description": "This tool is used by developers and automated test harnesses to initiate a child subprocess execution of Pi agent, stream the resulting NDJSON outputs through stdout buffers, verify that every JSONRPC frame is parsed without memory corruption, and write comprehensive trace diagnostic snapshots to the local storage disk under .pi/tasks/ directory so that subsequent human inspection can verify correctness.",\n      "detail": "Note: Highly recommended to avoid calling this tool concurrently across multiple worker instances because of potential SQLite file lock contention on the host macOS Darwin kernel."\n    },\n    {\n      "name": "read_mcp_source_bundle",\n      "description": "Reads source contents from the specified package URI, handles binary encodings, parses UTF-8 BOM, formats JSON responses into pretty-printed arrays..."\n    }\n  ]\n}`,
      distilled: `// 去脂 Distilled: 剥离废话修饰与警告包装，保留确定性核心执行语义 (首轮仅占 ~290 tokens)\n{\n  "dispatch": "2-level-meta",\n  "tools": [\n    {\n      "name": "run_pi_agent_turn",\n      "description": "Executes Pi agent subprocess, streams NDJSON output, and verifies exit code."\n    },\n    {\n      "name": "read_mcp_source",\n      "description": "Reads and decodes source contents from specified package URI."\n    }\n  ]\n}`
    },
    skills: {
      title: currentSelectedSkill
        ? `Skill: ${currentSelectedSkill.name} (${currentSelectedSkill.hasDistillation ? '已蒸馏' : '未去脂'})`
        : 'Skill Capsule 3-Tier Progressive Disclosure',
      desc: currentSelectedSkill
        ? `位于 ${currentSelectedSkill.path}`
        : '将冗长技能说明书提炼为 <=180 字符的触发胶囊，三层渐进式披露',
      originalTokens: currentSelectedSkill?.originalTokens || 1250,
      distilledTokens: currentSelectedSkill?.distilledTokens || 160,
      reductionRate: currentSelectedSkill?.reductionRate || '87.2%',
      baseline: currentSelectedSkill?.rawContent || `# Multi-Agent Workflow Authoring Guide (2,500 words)\n...`,
      distilled: currentSelectedSkill?.distilledBody || `{\n  "id": "${currentSelectedSkill?.id || 'workflow-authoring'}",\n  "tier1_trigger": ["workflow", "pipeline"],\n  "tier2_capsule": "多阶段子任务编排。仅在显式请求时按需展开完整手册。"\n}`
    },
    plugins: {
      title: 'Plugin Intent Preflight & Scope Pruning',
      desc: '通过意图预检精准识别当前目标，剔除未匹配插件与危险写操作工具',
      originalTokens: 680,
      distilledTokens: 180,
      reductionRate: '73.5%',
      baseline: `// 全量挂载插件所有能力与写权限:\nPlugin: cindy-github (9 tools loaded: pr_review, comment, merge, close, commit_list, file_read, repo_search, workflow_dispatch, delete_branch)\nPlugin: cindy-docs (5 tools loaded: render_pdf, make_docx, make_pptx, make_xlsx, inspect_pdf)`,
      distilled: `// 意图预检：只读审查模式，自动屏蔽写与分支删除工具:\nPlugin: cindy-github [READ-ONLY ACTIVE: get_file_contents, list_repository_commits]\nPruned: merge_pull_request, delete_branch, trigger_workflow_dispatch`
    }
  };

  const currentDim = diffData[activeCategory];

  return (
    <div className="flex-1 flex flex-col h-full bg-surface text-text-primary overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="border-b border-border-default px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-elevated/40">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
            <h1 className="text-base font-bold text-text-primary">提示词与架构去脂蒸馏 Diff 面板</h1>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            实时分析并比对 Tools、MCP 工具描述、Skills、Plugins 的【原 (Baseline)】与【现在 (Distilled)】
          </p>
        </div>

        {/* 维度作用域切换 */}
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg p-1 bg-surface-hover border border-border-default">
            <button
              onClick={() => setScopeType('partner')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'partner'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              伙伴维度
            </button>
            <button
              onClick={() => setScopeType('folder')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                scopeType === 'folder'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              文件夹维度
            </button>
          </div>
        </div>
      </div>

      {/* 分析目标选择条 */}
      <div className="bg-surface-elevated/20 px-6 py-2.5 border-b border-border-default flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-text-secondary font-medium shrink-0">分析目标:</span>
          {scopeType === 'partner' ? (
            <select
              value={selectedPartnerId}
              onChange={(e) => setSelectedPartnerId(e.target.value)}
              className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1 focus:outline-none focus:border-amber-500"
            >
              {bots.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          ) : (
            <div className="flex items-center gap-2">
              {/* 文件夹模式选择 */}
              <div className="inline-flex rounded-md p-0.5 bg-surface border border-border-default text-[11px]">
                <button
                  onClick={() => handleFolderModeChange('session')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    folderMode === 'session' ? 'bg-amber-500/20 text-amber-400 font-semibold' : 'text-text-secondary'
                  }`}
                >
                  <History className="w-3 h-3" />
                  已有会话目录
                </button>
                <button
                  onClick={() => handleFolderModeChange('project')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    folderMode === 'project' ? 'bg-amber-500/20 text-amber-400 font-semibold' : 'text-text-secondary'
                  }`}
                >
                  <Briefcase className="w-3 h-3" />
                  项目工作区
                </button>
                <button
                  onClick={() => handleFolderModeChange('custom')}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${
                    folderMode === 'custom' ? 'bg-amber-500/20 text-amber-400 font-semibold' : 'text-text-secondary'
                  }`}
                >
                  自定义路径
                </button>
              </div>

              {/* 具体选择器 */}
              {folderMode === 'session' ? (
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1.5 min-w-[260px] max-w-md focus:outline-none focus:border-amber-500 font-mono shadow-sm"
                >
                  {sessionFolders.map((s) => (
                    <option key={s.path} value={s.path}>
                      {s.name} ({s.path.split('/').pop()?.slice(0, 8)})
                    </option>
                  ))}
                </select>
              ) : folderMode === 'project' ? (
                <select
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1.5 min-w-[260px] max-w-md focus:outline-none focus:border-amber-500 font-mono shadow-sm"
                >
                  {projectFolders.map((p) => (
                    <option key={p.path} value={p.path}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedFolder}
                  onChange={(e) => setSelectedFolder(e.target.value)}
                  placeholder="输入目标目录绝对路径"
                  className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1.5 min-w-[260px] max-w-md focus:outline-none focus:border-amber-500 font-mono shadow-sm"
                />
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-text-secondary font-mono text-[11px]">
          <Lock className="w-3 h-3 text-accent-purple" />
          <span>蒸馏缓存状态: {folderSkills.some((s) => s.hasDistillation) ? '已激活 (Active Cache)' : '准备就绪'}</span>
        </div>
      </div>

      {/* 文件夹下多 Skill 列表条 (用户明确要求：不止一份 skill，并不是所有 skill 都有去脂结果) */}
      {scopeType === 'folder' && (
        <div className="px-6 py-2 bg-surface-elevated/40 border-b border-border-default flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-text-secondary font-medium shrink-0 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            目标目录技能 ({folderSkills.length}):
          </span>

          {loadingSkills ? (
            <span className="text-text-tertiary flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 animate-spin" />
              正在扫描目录技能...
            </span>
          ) : folderSkills.length === 0 ? (
            <span className="text-text-tertiary">未在当前目录找到独立 SKILL.md</span>
          ) : (
            folderSkills.map((sk) => (
              <button
                key={sk.id}
                onClick={() => {
                  setSelectedSkillId(sk.id);
                  setActiveCategory('skills');
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                  selectedSkillId === sk.id && activeCategory === 'skills'
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-surface border-border-default text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{sk.name}</span>
                {sk.hasDistillation ? (
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle className="w-2.5 h-2.5" />
                    已去脂 ({sk.reductionRate})
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded text-[10px] bg-surface-elevated text-text-tertiary border border-border-subtle">
                    <Clock className="w-2.5 h-2.5" />
                    未去脂
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* 四大维度切换 Tab */}
      <div className="flex border-b border-border-default px-6 bg-surface-elevated/10">
        <button
          onClick={() => setActiveCategory('tools')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'tools'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Wrench className="w-4 h-4" />
          1. Tools 工具瘦身 (-54.8%)
        </button>
        <button
          onClick={() => setActiveCategory('mcps')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'mcps'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Cpu className="w-4 h-4" />
          2. MCP & Plugin 描述去脂 (-82.7%)
        </button>
        <button
          onClick={() => setActiveCategory('skills')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'skills'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Zap className="w-4 h-4" />
          3. Skills 技能胶囊与缓存 (-87.2%)
        </button>
        <button
          onClick={() => setActiveCategory('plugins')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
            activeCategory === 'plugins'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Puzzle className="w-4 h-4" />
          4. Plugins 意图裁剪 (-73.5%)
        </button>
      </div>

      {/* 双栏对照与滑动同步 Diff 视窗 */}
      <div className="flex-1 p-4 overflow-hidden">
        <SynchronizedDiffViewer
          title={currentDim.title}
          originalLabel="【原】Baseline / 未蒸馏全量注入"
          distilledLabel="【现在】Distilled / 去脂蒸馏缓存态"
          originalContent={currentDim.baseline}
          distilledContent={currentDim.distilled}
          originalTokens={currentDim.originalTokens}
          distilledTokens={currentDim.distilledTokens}
          reductionRate={currentDim.reductionRate}
        />
      </div>
    </div>
  );
}
