/**
 * SkillsAndSandboxTab.jsx
 * 伙伴配置面板 - 技能与双平面沙箱监视：
 * 展示伙伴已挂载的技能列表、参数及物理沙箱隔离路径。
 * 单文件严格规范：<= 220 行
 */

import React from 'react';
import { FolderGit2, Wrench, ShieldCheck, Terminal, Cpu } from 'lucide-react';

export default function SkillsAndSandboxTab({ partner }) {
  if (!partner) return null;

  const skills = partner.skills || [];
  const sandboxPath = partner.sandboxPath || `~/.multiagent-orchestration/partners/${partner.id}`;
  const runtimeModel = partner.model || 'claude-3-7-sonnet';

  return (
    <div className="space-y-4 text-xs select-none">
      {/* Dual Plane Sandbox Card */}
      <div className="p-3.5 bg-slate-950/70 border border-border/80 rounded-xl space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs">
            <FolderGit2 className="w-4 h-4" />
            <span>双平面物理沙箱 (Dual-Plane Sandbox)</span>
          </div>
          <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded">
            ISOLATED
          </span>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed">
          运行态工作目录与源码仓库完全解耦，伙伴真实 CWD 映射至受保护的沙箱环境。
        </p>

        <div className="bg-black/50 p-2.5 rounded-lg border border-slate-800 font-mono text-[11px] space-y-1 text-slate-300">
          <div className="text-slate-500 text-[10px]">运行态物理路径 (realpath):</div>
          <div className="text-accent break-all">{sandboxPath}</div>
        </div>
      </div>

      {/* Runtime Configuration */}
      <div className="p-3.5 bg-slate-950/70 border border-border/80 rounded-xl space-y-2">
        <div className="flex items-center space-x-2 text-sky-400 font-semibold text-xs">
          <Cpu className="w-4 h-4" />
          <span>驱动引擎参数</span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div className="p-2 bg-slate-900 rounded border border-slate-800">
            <div className="text-slate-500 text-[10px]">底座模型:</div>
            <div className="text-slate-200 truncate">{runtimeModel}</div>
          </div>
          <div className="p-2 bg-slate-900 rounded border border-slate-800">
            <div className="text-slate-500 text-[10px]">PreToolUse 拦截:</div>
            <div className="text-emerald-400">Memory Hook 活跃</div>
          </div>
        </div>
      </div>

      {/* Mounted Skills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center space-x-1.5 font-semibold text-slate-200">
            <Wrench className="w-3.5 h-3.5 text-accent" />
            <span>已挂载技能与工具 ({skills.length})</span>
          </div>
          <span className="text-[10px] font-mono text-slate-500">
            ~/.agents/skills/
          </span>
        </div>

        <div className="space-y-1.5">
          {skills.length === 0 ? (
            <div className="text-slate-500 text-[11px] italic p-3 text-center bg-card/30 rounded-xl">
              暂未挂载专属技能
            </div>
          ) : (
            skills.map((skill, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-xl bg-card/50 border border-border/60 flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                  <span className="font-mono font-medium text-slate-200">
                    {typeof skill === 'string' ? skill : skill.name}
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                  Active
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
