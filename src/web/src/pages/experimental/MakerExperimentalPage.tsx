import React, { useState } from 'react';
import {
  FlaskConical,
  Activity,
  Play,
  RotateCcw,
  CheckCircle2,
  Terminal,
  Cpu,
  Layers,
} from 'lucide-react';

export function MakerExperimentalPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [pingResults, setPingResults] = useState<
    { channel: string; latency: number; status: 'ok' | 'slow' }[]
  >([
    { channel: 'Native IPC Pipe', latency: 0.8, status: 'ok' },
    { channel: 'Local SQLite WAL', latency: 1.2, status: 'ok' },
    { channel: 'Claude Model Gateway', latency: 285.0, status: 'ok' },
    { channel: 'Ghost Plugins RPC', latency: 2.4, status: 'ok' },
  ]);

  const handleTest = () => {
    setIsRunning(true);
    setTimeout(() => {
      setPingResults([
        { channel: 'Native IPC Pipe', latency: 0.7, status: 'ok' },
        { channel: 'Local SQLite WAL', latency: 1.1, status: 'ok' },
        { channel: 'Claude Model Gateway', latency: 242.0, status: 'ok' },
        { channel: 'Ghost Plugins RPC', latency: 2.1, status: 'ok' },
      ]);
      setIsRunning(false);
    }, 600);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none bg-surface p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border-default">
        <div>
          <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-accent-purple" />
            <span>Maker 实验与性能诊断 (Diagnostics)</span>
          </h1>
          <p className="text-xs text-text-secondary mt-1">
            监控宿主 IPC 通道延迟、SQLite 本地缓存响应时间与模型路由健康度
          </p>
        </div>

        <button
          onClick={handleTest}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-semibold shadow-sm hover:bg-accent-hover transition-colors"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? '诊断中...' : '重新运行基准测试'}</span>
        </button>
      </div>

      {/* Latency Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {pingResults.map((r, idx) => (
          <div
            key={idx}
            className="p-4 bg-surface-elevated border border-border-default rounded-2xl shadow-sm space-y-2"
          >
            <div className="flex justify-between items-center text-xs">
              <span className="text-text-secondary truncate">{r.channel}</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-accent-green shrink-0" />
            </div>
            <div className="text-xl font-bold font-mono text-text-primary">
              {r.latency} <span className="text-xs font-normal text-text-tertiary">ms</span>
            </div>
            <div className="h-1 bg-surface-chip rounded-full overflow-hidden">
              <div className="h-full bg-accent-green w-1/3" />
            </div>
          </div>
        ))}
      </div>

      {/* Live Event Stream Log */}
      <div className="bg-surface-elevated border border-border-default rounded-2xl p-4 shadow-sm space-y-3 flex-1 flex flex-col min-h-[300px]">
        <div className="flex items-center justify-between text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          <span>实时事件总线捕获 (Event Bus Stream)</span>
          <span className="text-[10px] text-accent-green font-mono">Listening...</span>
        </div>

        <div className="flex-1 overflow-auto bg-surface p-3 rounded-xl border border-border-default font-mono text-[11px] text-text-secondary space-y-1.5 leading-relaxed">
          <div className="text-text-tertiary">[2026-11-02 15:20:01.102] [IPC] Channel: maker.agent.boot initialized</div>
          <div className="text-accent-blue">[2026-11-02 15:20:01.105] [DB] Ensure localDb partition ready: user_123</div>
          <div className="text-text-primary">[2026-11-02 15:20:01.120] [Vite] Hot Module Replacement active</div>
          <div className="text-accent-green">[2026-11-02 15:20:01.340] [Orchestrator] Team lead session bound: s-orca-lead-01</div>
          <div className="text-text-tertiary">[2026-11-02 15:20:02.001] [Heartbeat] Remote link ping 14ms (healthy)</div>
        </div>
      </div>
    </div>
  );
}
