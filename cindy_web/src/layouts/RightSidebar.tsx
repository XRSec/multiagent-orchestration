import React, { useState } from 'react';
import {
  Terminal,
  FolderTree,
  Users,
  Activity,
  FileCode,
  MessageSquare,
  Bot,
  Layers,
  X,
  Play,
  CheckCircle2,
  AlertCircle,
  Copy,
} from 'lucide-react';
import { MOCK_ORCA_WORKFLOW } from '@/mock/orca';
import { MOCK_FILE_TREE } from '@/mock/files';

export function RightSidebar({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'terminal' | 'files' | 'orca' | 'resources'>('terminal');
  const [terminalCommands, setTerminalCommands] = useState<string[]>([
    'pnpm --version',
    'git status --short',
    'pnpm dev',
  ]);
  const [terminalInput, setTerminalInput] = useState('');

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!terminalInput.trim()) return;
    setTerminalCommands((prev) => [...prev, terminalInput]);
    setTerminalInput('');
  };

  return (
    <aside className="w-80 bg-surface-elevated border-l border-border-default flex flex-col h-full select-none shrink-0 transition-all z-10">
      {/* 1. Header with Tab Switching */}
      <div className="h-12 px-3 border-b border-border-default flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'terminal'
                ? 'bg-surface-chip text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>终端</span>
          </button>

          <button
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'files'
                ? 'bg-surface-chip text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>文件</span>
          </button>

          <button
            onClick={() => setActiveTab('orca')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'orca'
                ? 'bg-surface-chip text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>协同</span>
          </button>

          <button
            onClick={() => setActiveTab('resources')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === 'resources'
                ? 'bg-surface-chip text-text-primary'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>资源</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-secondary"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Body based on activeTab */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* TAB: Terminal */}
        {activeTab === 'terminal' && (
          <div className="flex flex-col h-full font-mono text-xs text-text-secondary">
            <div className="flex-1 overflow-y-auto space-y-2 bg-surface p-2.5 rounded-lg border border-border-default">
              <div className="text-text-tertiary text-[11px]">
                Cindy Integrated Terminal Session (zsh)
              </div>
              <div className="text-accent-blue">$ pnpm --version</div>
              <div className="text-text-primary">12.11.2</div>
              <div className="text-accent-blue">$ git status --short</div>
              <div className="text-text-primary">
                M src/router.tsx<br />
                ?? src/mock/
              </div>
              <div className="text-accent-blue">$ pnpm dev</div>
              <div className="text-accent-green">
                ➜  Local:   http://localhost:5173/<br />
                ➜  Network: use --host to expose<br />
                ➜  ready in 128ms.
              </div>

              {terminalCommands.slice(3).map((cmd, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="text-accent-blue">$ {cmd}</div>
                  <div className="text-text-tertiary text-[11px]">[Process finished with exit code 0]</div>
                </div>
              ))}
            </div>

            <form onSubmit={handleCommandSubmit} className="mt-2 flex items-center gap-1.5">
              <span className="text-accent-blue">$</span>
              <input
                type="text"
                value={terminalInput}
                onChange={(e) => setTerminalInput(e.target.value)}
                placeholder="输入命令..."
                className="flex-1 bg-surface border border-border-default rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue"
              />
            </form>
          </div>
        )}

        {/* TAB: Files */}
        {activeTab === 'files' && (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
              工作区文件目录
            </div>
            <div className="space-y-1">
              {MOCK_FILE_TREE.map((node) => (
                <div key={node.id} className="text-xs">
                  <div className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-surface-hover cursor-pointer text-text-primary">
                    {node.type === 'directory' ? (
                      <FolderTree className="w-3.5 h-3.5 text-accent-amber shrink-0" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 text-accent-blue shrink-0" />
                    )}
                    <span className="truncate">{node.name}</span>
                    {node.gitStatus && (
                      <span className="ml-auto text-[10px] font-mono text-accent-green">
                        {node.gitStatus === 'modified' ? 'M' : '?'}
                      </span>
                    )}
                  </div>
                  {node.children && (
                    <div className="pl-4 space-y-1 border-l border-border-subtle ml-2 mt-1">
                      {node.children.map((child) => (
                        <div
                          key={child.id}
                          className="flex items-center gap-1.5 py-1 px-1.5 rounded hover:bg-surface-hover cursor-pointer text-text-secondary"
                        >
                          {child.type === 'directory' ? (
                            <FolderTree className="w-3 h-3 text-accent-amber shrink-0" />
                          ) : (
                            <FileCode className="w-3 h-3 text-accent-blue shrink-0" />
                          )}
                          <span className="truncate text-xs">{child.name}</span>
                          {child.gitStatus && (
                            <span className="ml-auto text-[10px] font-mono text-accent-green">
                              {child.gitStatus === 'modified' ? 'M' : '?'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Orca Workers */}
        {activeTab === 'orca' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                活动 Worker 节点
              </span>
              <span className="text-xs text-accent-blue font-mono">
                {MOCK_ORCA_WORKFLOW.workers.length} 在线
              </span>
            </div>

            <div className="space-y-2">
              {/* Lead */}
              <div className="p-2.5 bg-surface rounded-xl border border-border-default space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-accent-green" />
                    <span className="text-xs font-bold text-text-primary">
                      {MOCK_ORCA_WORKFLOW.lead.label}
                    </span>
                    <span className="text-[10px] bg-accent-blue/10 text-accent-blue px-1.5 py-0.2 rounded font-mono">
                      Lead
                    </span>
                  </div>
                  <span className="text-[10px] text-text-tertiary">
                    {MOCK_ORCA_WORKFLOW.lead.model}
                  </span>
                </div>
                <div className="text-[11px] text-text-secondary">
                  {MOCK_ORCA_WORKFLOW.lead.currentTask}
                </div>
              </div>

              {/* Workers */}
              {MOCK_ORCA_WORKFLOW.workers.map((worker) => (
                <div key={worker.id} className="p-2.5 bg-surface rounded-xl border border-border-default space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          worker.status === 'busy'
                            ? 'bg-accent-amber animate-pulse'
                            : worker.status === 'completed'
                            ? 'bg-accent-green'
                            : 'bg-text-tertiary'
                        }`}
                      />
                      <span className="text-xs font-semibold text-text-primary">
                        {worker.label}
                      </span>
                      <span className="text-[10px] text-text-tertiary font-mono">
                        ({worker.role})
                      </span>
                    </div>
                    <span className="text-[10px] text-text-tertiary">
                      {worker.agent}
                    </span>
                  </div>
                  <div className="text-[11px] text-text-secondary">
                    {worker.currentTask}
                  </div>
                </div>
              ))}
            </div>

            {/* Queue */}
            <div className="pt-2 border-t border-border-default space-y-1.5">
              <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
                待办任务队列
              </span>
              <div className="space-y-1">
                {MOCK_ORCA_WORKFLOW.queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-1.5 bg-surface rounded-lg text-xs flex items-center justify-between text-text-secondary"
                  >
                    <span className="truncate flex-1">{item.task}</span>
                    <span className="text-[10px] text-accent-blue shrink-0 font-mono ml-2">
                      @{item.targetWorker}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: Resources */}
        {activeTab === 'resources' && (
          <div className="space-y-4">
            <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
              运行性能与配额监控
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-surface rounded-xl border border-border-default space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">Token 消耗速度</span>
                  <span className="font-mono font-semibold text-text-primary">42.8k / turn</span>
                </div>
                <div className="h-1.5 bg-surface-chip rounded-full overflow-hidden">
                  <div className="h-full bg-accent-blue w-2/5" />
                </div>
              </div>

              <div className="p-3 bg-surface rounded-xl border border-border-default space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">模型延迟 (Time to First Token)</span>
                  <span className="font-mono font-semibold text-text-primary">380 ms</span>
                </div>
                <div className="h-1.5 bg-surface-chip rounded-full overflow-hidden">
                  <div className="h-full bg-accent-green w-1/4" />
                </div>
              </div>

              <div className="p-3 bg-surface rounded-xl border border-border-default space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-text-secondary">上下文缓存命中率</span>
                  <span className="font-mono font-semibold text-text-primary">87.5%</span>
                </div>
                <div className="h-1.5 bg-surface-chip rounded-full overflow-hidden">
                  <div className="h-full bg-accent-purple w-[87.5%]" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
