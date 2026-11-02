/**
 * DistillationDiffPage.tsx
 * 架构与提示词去脂蒸馏 Diff 视窗 (Cindy Web 规范):
 * 直观对比 tools, mcps, skills, plugins 四大维度的【原（Baseline）】//【现在（Distilled）】。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState } from 'react';
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
  Copy
} from 'lucide-react';
import { MOCK_BOTS } from '@/mock/bots';

export function DistillationDiffPage() {
  const [scopeType, setScopeType] = useState<'partner' | 'folder'>('partner');
  const [selectedPartnerId, setSelectedPartnerId] = useState(MOCK_BOTS[0]?.id || 'lead-orchestrator');
  const [selectedFolder, setSelectedFolder] = useState('~/.multiagent-orchestration/workspace');
  const [activeCategory, setActiveCategory] = useState<'tools' | 'mcps' | 'skills' | 'plugins'>('tools');
  const [copiedSide, setCopiedSide] = useState<'left' | 'right' | null>(null);

  const diffData = {
    tools: {
      title: 'Tools Schema Slimming',
      desc: '剥离 $schema、examples、title 等冗余元数据，并将长描述精简为 <=80 字符',
      originalTokens: 840,
      distilledTokens: 380,
      reductionRate: '54.8%',
      baseline: `[\n  {\n    "name": "execute_shell_command",\n    "$schema": "http://json-schema.org/draft-07/schema#",\n    "title": "Execute Bash Shell Command Inside Isolated Environment",\n    "description": "Executes an arbitrary bash command in a subprocess and captures standard output, standard error, exit code, execution timestamps and memory quotas for diagnostic inspection.",\n    "examples": ["ls -la", "git status", "pnpm test"],\n    "parameters": {\n      "type": "object",\n      "properties": {\n        "command": {\n          "type": "string",\n          "title": "Command String",\n          "description": "The shell command line to execute. Must be valid bash syntax.",\n          "examples": ["echo hello"]\n        }\n      },\n      "required": ["command"]\n    }\n  }\n]`,
      distilled: `[\n  {\n    "name": "execute_shell_command",\n    "description": "Executes an arbitrary bash command in a subprocess and captures output...",\n    "parameters": {\n      "type": "object",\n      "properties": {\n        "command": {\n          "type": "string",\n          "description": "The shell command line to execute."\n        }\n      },\n      "required": ["command"]\n    }\n  }\n]`
    },
    mcps: {
      title: 'MCP Meta-Tooling 2-Level Dispatch',
      desc: '将数百个平铺 MCP 工具收敛为 list_tools 与 call_tool 两级动态分派',
      originalTokens: 1420,
      distilledTokens: 210,
      reductionRate: '85.2%',
      baseline: `// 平铺暴露所有 MCP 工具（数十个函数签名充斥首轮 System Prompt）:\n- mcp_cindy_memory_read(shard, key, mode)\n- mcp_cindy_memory_write(shard, content, title, description)\n- mcp_cindy_memory_search(query, limit, fts5)\n- mcp_cindy_memory_consolidate(shards, target)\n- mcp_orchestrator_dispatch(task, targetBotId, queueMode)\n- mcp_orchestrator_await_queue(queueId, timeout)\n- mcp_orchestrator_steer(targetBotId, payload, forceInterrupt)\n... (24 more tools)`,
      distilled: `// Control Plane 二级调度元工具 (首轮仅占 ~210 tokens):\n- mcp_list_tools(server: string) // 运行时按需查询指定服务的工具目录\n- mcp_call_tool(server: string, tool: string, args: object) // 宿主沙箱安全下发`
    },
    skills: {
      title: 'Skill Capsule 3-Tier Progressive Disclosure',
      desc: '将冗长技能说明书提炼为 <=180 字符的触发胶囊，三层渐进式披露',
      originalTokens: 1250,
      distilledTokens: 160,
      reductionRate: '87.2%',
      baseline: `# Multi-Agent Workflow Authoring Full Guide (2,500 words)\nWhen users explicitly opt into multiagent orchestration, this skill guides you through:\n1. Writing export const meta = { name, description, phases }\n2. Defining parallel and sequential branches\n3. Verifying outputs with adversarial loops\n\n### Exhaustive Code Examples\nexport const meta = { name: "demo", description: "demo", phases: [{ title: "Review" }] };\nconst results = await pipeline(DIMENSIONS, d => agent(d.prompt));\nreturn results;\n... (多篇幅最佳实践与边界处理案例) ...`,
      distilled: `{\n  "id": "workflow-authoring",\n  "tier1_trigger": ["workflow", "pipeline", "subagents"],\n  "tier2_capsule": "编写 export const meta 与 pipeline/parallel 多阶段子任务编排。仅在显式请求时按需展开完整手册。",\n  "tier3_manualRef": "cindy://skills/workflow-authoring/MANUAL.md (动态渐进按需加载)"\n}`
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

  const copyText = (txt: string, side: 'left' | 'right') => {
    navigator.clipboard?.writeText(txt);
    setCopiedSide(side);
    setTimeout(() => setCopiedSide(null), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-surface text-text-primary overflow-hidden">
      {/* 顶部标题栏 */}
      <div className="border-b border-border-default px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-elevated/40">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500 animate-pulse" />
            <h1 className="text-base font-bold text-text-primary">提示词与架构去脂蒸馏 Diff 面板</h1>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            实时分析并比对 Tools、MCPs、Skills、Plugins 四大维度的【原 (Baseline)】与【现在 (Distilled)】
          </p>
        </div>

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

      {/* 目标对象选择与缓存键状态 */}
      <div className="bg-surface-elevated/20 px-6 py-2.5 border-b border-border-default flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-text-secondary">分析目标:</span>
          {scopeType === 'partner' ? (
            <select
              value={selectedPartnerId}
              onChange={e => setSelectedPartnerId(e.target.value)}
              className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1 focus:outline-none focus:border-amber-500"
            >
              {MOCK_BOTS.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.id})
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={selectedFolder}
              onChange={e => setSelectedFolder(e.target.value)}
              placeholder="输入工作区文件夹路径"
              className="bg-surface border border-border-default text-text-primary text-xs rounded-md px-3 py-1 w-72 focus:outline-none focus:border-amber-500"
            />
          )}
        </div>

        <div className="flex items-center gap-2 text-text-secondary font-mono text-[11px]">
          <Lock className="w-3 h-3 text-accent-purple" />
          <span>前缀缓存键: sha256:e906998105923de...</span>
        </div>
      </div>

      {/* KPI 核心指标卡 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 bg-surface-elevated/10 border-b border-border-default">
        <div className="bg-surface p-3 rounded-xl border border-border-default">
          <div className="text-[11px] text-text-secondary">原始 Token 消耗 (原)</div>
          <div className="text-base font-bold text-text-primary mt-1 font-mono">
            4,190 <span className="text-xs font-normal text-text-tertiary">tok</span>
          </div>
        </div>
        <div className="bg-surface p-3 rounded-xl border border-border-default">
          <div className="text-[11px] text-text-secondary">蒸馏后 Token 消耗 (现在)</div>
          <div className="text-base font-bold text-amber-400 mt-1 font-mono">
            930 <span className="text-xs font-normal text-text-tertiary">tok</span>
          </div>
        </div>
        <div className="bg-surface p-3 rounded-xl border border-border-default">
          <div className="text-[11px] text-text-secondary">净节省 Token</div>
          <div className="text-base font-bold text-emerald-400 mt-1 font-mono">
            -3,260 <span className="text-xs font-normal text-text-tertiary">tok</span>
          </div>
        </div>
        <div className="bg-surface p-3 rounded-xl border border-emerald-900/40 bg-gradient-to-br from-surface to-emerald-950/20">
          <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
            <TrendingDown className="w-3.5 h-3.5" />
            综合去脂率
          </div>
          <div className="text-xl font-black text-emerald-300 mt-0.5 font-mono">
            77.8%
          </div>
        </div>
      </div>

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
          2. MCPs 元工具化 (-85.2%)
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
          3. Skills 技能胶囊 (-87.2%)
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

      {/* 维度详细描述 */}
      <div className="px-6 py-2 bg-surface-elevated/30 border-b border-border-default flex items-center justify-between text-xs text-text-secondary">
        <div>
          <span className="font-semibold text-text-primary">{currentDim.title}</span>：{currentDim.desc}
        </div>
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span>原: {currentDim.originalTokens} tok</span>
          <ArrowRight className="w-3 h-3 text-text-tertiary" />
          <span className="text-amber-400">现在: {currentDim.distilledTokens} tok</span>
          <span className="text-emerald-400 font-bold">(-{currentDim.reductionRate})</span>
        </div>
      </div>

      {/* 双栏对照视窗 */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border-default">
        {/* 左栏：原 */}
        <div className="flex flex-col h-full bg-surface-elevated/20 overflow-hidden">
          <div className="px-4 py-2 bg-surface-elevated/50 border-b border-border-default flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="font-semibold text-text-primary">【原】Baseline / 未蒸馏全量注入</span>
            </div>
            <button
              onClick={() => copyText(currentDim.baseline, 'left')}
              className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              {copiedSide === 'left' ? '已复制' : '复制原文'}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-text-secondary leading-relaxed whitespace-pre-wrap select-text">
            {currentDim.baseline}
          </div>
        </div>

        {/* 右栏：现在 */}
        <div className="flex flex-col h-full bg-surface-elevated/10 overflow-hidden">
          <div className="px-4 py-2 bg-surface-elevated/40 border-b border-border-default flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="font-semibold text-emerald-400">【现在】Distilled / Control Plane 去脂蒸馏态</span>
            </div>
            <button
              onClick={() => copyText(currentDim.distilled, 'right')}
              className="text-[11px] text-text-secondary hover:text-text-primary flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" />
              {copiedSide === 'right' ? '已复制' : '复制结果'}
            </button>
          </div>
          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-emerald-300 leading-relaxed whitespace-pre-wrap select-text bg-surface-elevated/30">
            {currentDim.distilled}
          </div>
        </div>
      </div>
    </div>
  );
}
