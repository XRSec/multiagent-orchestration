/**
 * PartnerSettingsDrawer.jsx
 * 伙伴配置抽屉主容器：
 * 集成 SlideOverDrawer，提供灵魂记忆编辑器（SoulMemoryEditorTab）与
 * 技能沙箱监视器（SkillsAndSandboxTab）的双 Tab 导航与持久化保存。
 * 单文件严格规范：<= 230 行
 */

import React, { useState } from 'react';
import { Bot, Cpu, Shield, Sparkles, Sliders, Layers } from 'lucide-react';
import SlideOverDrawer from '../../components/common/SlideOverDrawer.jsx';
import RoleStatusBadge from '../../components/common/RoleStatusBadge.jsx';
import SoulMemoryEditorTab from './SoulMemoryEditorTab.jsx';
import SkillsAndSandboxTab from './SkillsAndSandboxTab.jsx';

const ICONS = { Bot, Cpu, Shield, Sparkles };

export default function PartnerSettingsDrawer({
  isOpen,
  onClose,
  partner,
  onUpdatePartner,
}) {
  const [activeTab, setActiveTab] = useState('editor'); // 'editor' | 'sandbox'

  if (!partner) return null;

  const IconComponent = ICONS[partner.icon] || Bot;

  return (
    <SlideOverDrawer
      isOpen={isOpen}
      onClose={onClose}
      title="伙伴配置与沙箱详情"
      subtitle={`${partner.name} · ${partner.id}`}
      width="w-[520px]"
    >
      <div className="space-y-5 text-xs select-none">
        {/* Partner Profile Summary Card */}
        <div className="p-3.5 bg-card/60 border border-border/80 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent flex-shrink-0">
              <IconComponent className="w-5 h-5" />
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-slate-100">
                  {partner.name}
                </span>
                <RoleStatusBadge status={partner.status || 'idle'} role={partner.role} />
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-xs">
                {partner.role}
              </div>
            </div>
          </div>

          {partner.isLead && (
            <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
              LEAD
            </span>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border/70">
          <button
            onClick={() => setActiveTab('editor')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'editor'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            人设与长期记忆 (SOUL / MEMORY)
          </button>

          <button
            onClick={() => setActiveTab('sandbox')}
            className={`pb-2 px-3 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'sandbox'
                ? 'border-accent text-accent font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            技能与沙箱隔离 (Sandbox)
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === 'editor' ? (
          <SoulMemoryEditorTab
            partner={partner}
            onSave={(updated) => onUpdatePartner?.(updated)}
          />
        ) : (
          <SkillsAndSandboxTab partner={partner} />
        )}
      </div>
    </SlideOverDrawer>
  );
}
