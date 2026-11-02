import React from 'react';
import { Bot, Shield, Cpu, FolderGit2, CheckCircle2, Clock } from 'lucide-react';

export default function PartnerStudio({ partners, activePartnerId, onSelectPartner }) {
  return (
    <div className="w-72 bg-surface/80 border-r border-border flex flex-col h-full backdrop-blur-md">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-accent" />
          <span className="font-semibold text-sm tracking-wide text-slate-200">
            PARTNER STUDIO
          </span>
        </div>
        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
          3 Online
        </span>
      </div>

      {/* Partners List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <div className="text-[11px] font-mono text-slate-500 uppercase px-2 py-1">
          Registered Partners
        </div>

        {partners.map((partner) => {
          const isSelected = partner.id === activePartnerId;
          const Icon = partner.icon;

          return (
            <div
              key={partner.id}
              onClick={() => onSelectPartner(partner.id)}
              className={`p-3 rounded-xl border transition-all cursor-pointer ${
                isSelected
                  ? 'bg-card border-accent shadow-lg shadow-accent/5'
                  : 'bg-card/40 border-border/60 hover:bg-card/70 hover:border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isSelected ? 'bg-accent/20 text-accent' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-100 flex items-center space-x-1.5">
                      <span>{partner.name}</span>
                      {partner.isLead && (
                        <span className="text-[9px] bg-amber-500/10 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30">
                          LEAD
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate max-w-[140px]">
                      {partner.role}
                    </div>
                  </div>
                </div>

                {/* Queue / Idle Status */}
                <div className="flex items-center mt-1">
                  {partner.status === 'busy' ? (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
                    </span>
                  ) : partner.queueCount > 0 ? (
                    <span className="text-[10px] bg-sky-500/10 text-sky-400 px-1.5 rounded-full border border-sky-500/30 flex items-center gap-1 font-mono">
                      <Clock className="w-2.5 h-2.5" />
                      {partner.queueCount} Q
                    </span>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  )}
                </div>
              </div>

              {/* Submodule / Sandbox Path */}
              <div className="mt-2.5 pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span className="truncate max-w-[160px] text-slate-500">
                  ~/.multiagent/{partner.id}
                </span>
                <span className="text-slate-500">{partner.skills.length} skills</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Dual Plane Footer Status */}
      <div className="p-3 border-t border-border bg-slate-900/60 text-xs">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <FolderGit2 className="w-3.5 h-3.5 text-emerald-400" />
            Dual-Plane Isolation
          </span>
          <span className="text-emerald-400 font-mono text-[10px]">ACTIVE</span>
        </div>
        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
          Runtime cwd decoupled from build source via symlinks.
        </p>
      </div>
    </div>
  );
}
