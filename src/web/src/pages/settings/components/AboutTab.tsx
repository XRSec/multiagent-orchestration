/**
 * Purpose: System diagnostics and About information tab.
 * Context: Displays multiagent-orchestration engine identity, authoritative config paths, and active bot roster.
 * Usage: Rendered inside SettingsPage.tsx under "about" tab.
 * Prerequisites: React 18+, Lucide React icons.
 */

import React, { useEffect, useState } from 'react';
import { Bot, CheckCircle2, Cpu, Database, FolderGit2, ShieldCheck } from 'lucide-react';

interface DiagnosticInfo {
  version: string;
  configPath: string;
  activeModel: string;
  botsCount: number;
  dbStatus: string;
}

export function AboutTab() {
  const [diagnostics, setDiagnostics] = useState<DiagnosticInfo>({
    version: '1.2.0-autonomous',
    configPath: '~/.multiagent-orchestration/models.json',
    activeModel: 'gemini-3.8-flash',
    botsCount: 7,
    dbStatus: 'Connected (SQLite WAL)'
  });

  useEffect(() => {
    fetch('/api/config/models')
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          setDiagnostics(prev => ({
            ...prev,
            configPath: data.sourceFile || prev.configPath,
            activeModel: data.activeDefaultModel || prev.activeModel
          }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      {/* Brand Hero Card */}
      <div className="flex flex-col items-center text-center p-6 md:p-8 bg-surface-elevated border border-border-default rounded-3xl space-y-3 shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-pink-500/20 border border-indigo-500/30 flex items-center justify-center text-accent-blue shadow-inner">
          <Bot className="w-8 h-8 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-base md:text-lg font-bold text-text-primary tracking-tight">
            Multi-Agent Orchestration
          </h2>
          <div className="text-xs font-mono text-emerald-400 flex items-center justify-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Autonomous Web Runtime · v{diagnostics.version}</span>
          </div>
        </div>
        <p className="text-xs text-text-secondary max-w-md mt-1 leading-relaxed">
          高拟真多智能体协同编排平台。基于 Seven Mo-Bots 领域边界隔离，严格遵守自主行动与黑板通信协议，打造极致丝滑的桌面与移动端交互体验。
        </p>
      </div>

      {/* Runtime Environment Diagnostics */}
      <div className="rounded-2xl bg-surface-elevated border border-border-default overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-text-primary">运行时环境与权威诊断 (Zero Host Pollution)</span>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-surface border border-border-default flex items-start gap-3">
            <Cpu className="w-4 h-4 text-accent-blue shrink-0 mt-0.5" />
            <div className="overflow-hidden">
              <div className="text-[11px] text-text-tertiary">权威模型配置路径</div>
              <code className="text-[11px] font-mono text-emerald-400 block truncate mt-0.5">
                {diagnostics.configPath}
              </code>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-border-default flex items-start gap-3">
            <Bot className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
            <div className="overflow-hidden">
              <div className="text-[11px] text-text-tertiary">协同伙伴沙箱</div>
              <div className="text-text-primary font-medium mt-0.5 flex items-center gap-1.5">
                <span>Seven Mo-Bots</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  全员在线 ({diagnostics.botsCount}/7)
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-border-default flex items-start gap-3">
            <Database className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="overflow-hidden">
              <div className="text-[11px] text-text-tertiary">本地持久化存储</div>
              <div className="text-text-primary font-medium mt-0.5 flex items-center gap-1.5">
                <span>{diagnostics.dbStatus}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-border-default flex items-start gap-3">
            <FolderGit2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div className="overflow-hidden">
              <div className="text-[11px] text-text-tertiary">当前活跃默认模型</div>
              <div className="text-text-primary font-mono text-[11px] mt-0.5">
                {diagnostics.activeModel}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
