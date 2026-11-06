import React, { useState } from 'react';
import {
  Users,
  GitFork,
  ArrowRight,
  Sparkles,
  Bot,
  Activity,
  Layers,
  CheckCircle2,
  Play,
  RotateCcw,
  Send,
  Plus,
  ArrowUp,
  Clock,
  Terminal,
} from 'lucide-react';
import { MOCK_ORCA_WORKFLOW } from '@/mock/orca';

export function OrcaWorkflowPage() {
  const [workflow, setWorkflow] = useState(MOCK_ORCA_WORKFLOW);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('worker-dev-1');
  const [steerMsg, setSteerMsg] = useState('');
  const [steerLogs, setSteerLogs] = useState<string[]>([
    'Lead [claude-opus-5-5]: 派发任务至 dev-ui',
    'Worker dev-ui [claude-sonnet-5-5]: 开始构建所有 16+ 个核心页面的组件壳子',
    'Worker mock-data [gpt-5.5]: Mock 数据结构合成完成',
  ]);

  const selectedWorker = workflow.workers.find((w) => w.id === selectedWorkerId);

  const handleSteer = () => {
    if (!steerMsg.trim() || !selectedWorker) return;
    setSteerLogs((prev) => [
      ...prev,
      `[Steer -> @${selectedWorker.label}]: ${steerMsg}`,
      `Worker @${selectedWorker.label}: 收到插话指令，正在将其合并至当前执行上下文...`,
    ]);
    setSteerMsg('');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface p-6 space-y-5">
      {/* 1. Header */}
      <div className="flex items-center justify-between pb-3 border-b border-border-default shrink-0">
        <div>
          <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-blue" />
            <span>{workflow.title}</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            持久化 Orca 多 Worker 拓扑网络、任务派发与协同插话
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-accent-green bg-accent-green/10 px-2.5 py-1 rounded-full font-mono font-medium">
            <span className="w-2 h-2 rounded-full bg-accent-green animate-pulse" />
            <span>ACTIVE WORKFLOW</span>
          </span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold shadow-sm hover:bg-accent-hover transition-colors">
            <Plus className="w-3.5 h-3.5" />
            <span>创建新 Worker</span>
          </button>
        </div>
      </div>

      {/* 2. Visual Multi-Agent Architecture Graph */}
      <div className="bg-surface-elevated border border-border-default rounded-2xl p-4 shadow-sm space-y-3 shrink-0">
        <div className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider">
          协同拓扑网络 (Orchestration Topology)
        </div>

        {/* Lead -> Workers Flow */}
        <div className="flex items-center justify-center gap-6 py-2 overflow-x-auto">
          {/* Lead Card */}
          <div className="p-4 bg-surface rounded-2xl border border-accent-blue/50 shadow-sm w-64 shrink-0 text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-accent-green" />
              <span className="text-[10px] bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full font-mono font-bold">
                LEAD ORCHESTRATOR
              </span>
            </div>
            <div className="text-xs font-bold text-text-primary">{workflow.lead.role}</div>
            <div className="text-[10px] text-text-tertiary font-mono">
              {workflow.lead.model}
            </div>
            <p className="text-[11px] text-text-secondary leading-snug pt-1 border-t border-border-subtle">
              {workflow.lead.currentTask}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center text-text-tertiary shrink-0">
            <ArrowRight className="w-5 h-5 text-accent-blue animate-pulse" />
            <span className="text-[10px] font-mono mt-1">Dispatch</span>
          </div>

          {/* Workers Column */}
          <div className="flex flex-col gap-2 w-80 shrink-0">
            {workflow.workers.map((worker) => (
              <div
                key={worker.id}
                onClick={() => setSelectedWorkerId(worker.id)}
                className={`p-3 bg-surface rounded-xl border cursor-pointer transition-all ${
                  selectedWorkerId === worker.id
                    ? 'border-accent-blue shadow-md'
                    : 'border-border-default hover:border-text-tertiary'
                }`}
              >
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
                    <span className="text-xs font-bold text-text-primary">
                      @{worker.label}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-mono">
                      ({worker.role})
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-accent-blue bg-surface-chip px-1.5 py-0.2 rounded">
                    {worker.model}
                  </span>
                </div>
                <div className="text-[11px] text-text-secondary truncate mt-1">
                  {worker.currentTask}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Selected Worker Details & Task Steering */}
      {selectedWorker && (
        <div className="flex-1 bg-surface-elevated border border-border-default rounded-2xl p-4 shadow-sm flex flex-col space-y-3 min-h-0">
          <div className="flex items-center justify-between pb-2 border-b border-border-subtle shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-accent-blue" />
              <span className="text-sm font-bold text-text-primary">
                Worker 监控与插话干预: @{selectedWorker.label}
              </span>
              <span className="text-xs text-text-secondary font-mono">({selectedWorker.role})</span>
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-text-tertiary">
              <span>Agent: {selectedWorker.agent}</span>
              <span>Model: {selectedWorker.model}</span>
              <span>已处理: {selectedWorker.assignedTasks} 项任务</span>
            </div>
          </div>

          {/* Execution Stream Logs */}
          <div className="flex-1 overflow-y-auto bg-surface rounded-xl p-3 border border-border-default font-mono text-xs space-y-1.5">
            {steerLogs.map((log, idx) => (
              <div key={idx} className="leading-relaxed text-text-secondary">
                <span className="text-text-tertiary mr-2 text-[10px]">{`[${idx + 1}]`}</span>
                <span>{log}</span>
              </div>
            ))}
          </div>

          {/* Steer Input */}
          <div className="pt-2 border-t border-border-subtle flex items-center gap-2 shrink-0">
            <input
              type="text"
              value={steerMsg}
              onChange={(e) => setSteerMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSteer()}
              placeholder={`给 @${selectedWorker.label} 注入实时协同插话 (Steer)，不中断当前运行...`}
              className="flex-1 bg-surface border border-border-default rounded-xl px-3 py-2 text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-blue"
            />
            <button
              onClick={handleSteer}
              disabled={!steerMsg.trim()}
              className="px-4 py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold hover:bg-accent-hover transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
              <span>发送协同插话</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
