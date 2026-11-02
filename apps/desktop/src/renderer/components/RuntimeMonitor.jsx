import React from 'react';
import { Activity, ShieldCheck, Terminal, Cpu, GitFork, ArrowDownToLine } from 'lucide-react';

export default function RuntimeMonitor({ activePartner, queueStats }) {
  return (
    <div className="w-80 bg-surface/80 border-l border-border flex flex-col h-full backdrop-blur-md text-xs">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-sm tracking-wide text-slate-200">
            RUNTIME MONITOR
          </span>
        </div>
        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
          HEALTHY
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Claude SDK Driver Spec */}
        <div className="bg-card/40 border border-border/80 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-accent" />
            Claude Agent SDK Driver
          </div>
          <div className="space-y-1.5 text-[11px] font-mono text-slate-400">
            <div className="flex justify-between">
              <span>Engine:</span>
              <span className="text-slate-200">SDK v0.3.316</span>
            </div>
            <div className="flex justify-between">
              <span>Driver Model:</span>
              <span className="text-slate-200">Programmatic Stdio</span>
            </div>
            <div className="flex justify-between">
              <span>Queue Policy:</span>
              <span className="text-emerald-400">Natural Queueing (No Interrupt)</span>
            </div>
          </div>
        </div>

        {/* Message Queue Monitor */}
        <div className="bg-card/40 border border-border/80 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <ArrowDownToLine className="w-3.5 h-3.5 text-sky-400" />
              In-flight Message Queue
            </span>
            <span className="text-[10px] font-mono text-sky-400">
              {queueStats.pendingCount} pending
            </span>
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed">
            用户追加的消息及主从互发消息自动进入该队列，当当前 turn 结束后由 Claude 原生机制读取并处理。
          </p>
          <div className="bg-black/30 rounded p-2 font-mono text-[10px] text-slate-400">
            <div>Current Tick: {queueStats.tick}</div>
            <div>Queue State: {queueStats.isDraining ? 'Draining...' : 'Idle'}</div>
          </div>
        </div>

        {/* In-process Orchestrator MCP Tools */}
        <div className="bg-card/40 border border-border/80 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            In-Process MCP Surface
          </div>
          <div className="space-y-1 font-mono text-[10px]">
            <div className="p-1.5 bg-slate-900/60 rounded border border-slate-800 text-slate-300">
              ⚡ dispatch_and_queue_partners
            </div>
            <div className="p-1.5 bg-slate-900/60 rounded border border-slate-800 text-slate-300">
              ⏳ await_partner_queue
            </div>
            <div className="p-1.5 bg-slate-900/60 rounded border border-slate-800 text-slate-300">
              📨 forward_queued_message
            </div>
          </div>
        </div>

        {/* Active Partner Spec */}
        <div className="bg-card/40 border border-border/80 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
            <Terminal className="w-3.5 h-3.5 text-amber-400" />
            Partner Inspect: {activePartner.id}
          </div>
          <div className="text-[10px] font-mono space-y-1 text-slate-400">
            <div>CWD: ~/.multiagent/{activePartner.id}</div>
            <div>Isolation: Symlinked File Granularity</div>
            <div>Manual: CLAUDE.md (symlinked)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
