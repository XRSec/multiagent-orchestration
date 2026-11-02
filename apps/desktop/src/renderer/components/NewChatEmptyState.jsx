import React from 'react';
import { Bot, Shield, Cpu, Sparkles, MessageSquare, ArrowRight } from 'lucide-react';

const SUGGESTED_PROMPTS = [
  {
    title: '协议安全审计与测试',
    prompt: '审计现有的双平面映射协议，并用 node 原生测试模块编写回归断言。',
    tag: '多Agent编排',
  },
  {
    title: '架构脚手架生成',
    prompt: '让 Agent Architect 设计一个专门用于逆向分析的伙伴脚手架模板。',
    tag: '架构设计',
  },
  {
    title: '全自动流水线验证',
    prompt: '主控先指派 REA Partner 验证 ELF 边界，再由 Architect 编写配套文档。',
    tag: 'Relay 流水线',
  },
];

const ICON_MAP = { Bot, Cpu, Shield };

function resolvePartnerIcon(p) {
  if (typeof p?.icon === 'function') return p.icon;
  if (typeof p?.icon === 'string' && ICON_MAP[p.icon]) return ICON_MAP[p.icon];
  if (typeof p?.avatar === 'string' && ICON_MAP[p.avatar]) return ICON_MAP[p.avatar];
  if (p?.id?.includes('architect')) return Cpu;
  if (p?.id?.includes('rea')) return Shield;
  return Bot;
}

export default function NewChatEmptyState({ partners, onSelectPrompt, onSelectPartner }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-2xl mx-auto space-y-8 select-none">
      {/* Brand Hero */}
      <div className="space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-accent/20 via-sky-500/10 to-transparent border border-accent/40 flex items-center justify-center text-accent mx-auto shadow-lg shadow-accent/5">
          <Bot className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-semibold text-slate-100 tracking-tight">
          开启多 Agent 智能协同
        </h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          基于 Claude 原生排队机制的编排底座。在下方直接输入指令开始，即使运行途中也可随时补充发言，自动入队递送。
        </p>
      </div>

      {/* Suggested Prompts Cards */}
      <div className="w-full space-y-2">
        <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider text-left px-1">
          快速开始建议
        </div>
        <div className="grid grid-cols-1 gap-2 text-left">
          {SUGGESTED_PROMPTS.map((item, idx) => (
            <div
              key={idx}
              onClick={() => onSelectPrompt(item.prompt)}
              className="group p-3 rounded-xl bg-card/60 hover:bg-card border border-border/80 hover:border-accent/60 transition-all cursor-pointer flex items-center justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-accent transition-colors">
                    {item.title}
                  </span>
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded border border-slate-700">
                    {item.tag}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 truncate max-w-lg">
                  {item.prompt}
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-accent transition-all group-hover:translate-x-0.5" />
            </div>
          ))}
        </div>
      </div>

      {/* Available Partners Lineup */}
      <div className="w-full space-y-2">
        <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider text-left px-1">
          指定专属伙伴
        </div>
        <div className="grid grid-cols-3 gap-2">
          {partners.map((partner) => {
            const Icon = resolvePartnerIcon(partner);
            return (
              <div
                key={partner.id}
                onClick={() => onSelectPartner(partner.id)}
                className="p-3 rounded-xl bg-card/40 hover:bg-card border border-border/60 hover:border-slate-600 transition-all cursor-pointer text-left space-y-1.5"
              >
                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-accent">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-xs font-medium text-slate-200 truncate">
                  {partner.name}
                </div>
                <div className="text-[10px] text-slate-500 truncate">
                  {partner.role}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
