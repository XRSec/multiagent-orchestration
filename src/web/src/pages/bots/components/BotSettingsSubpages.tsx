/**
 * Purpose: Subpage detail views for Bot settings (profile, personality, memory, projects, model, capabilities, advanced).
 * Context: Rendered within BotSettingsDrawer when navigating away from the home settings menu.
 * Usage: Subpage renderer component inside BotSettingsDrawer.
 * Prerequisites: React, lucide-react, BotItem type.
 */

import React from 'react';
import { Plus, Folder } from 'lucide-react';
import { BotItem } from '@/mock/bots';
import { BotCapabilityMatrix } from '@/components/bots/BotCapabilityMatrix';
import { useToast } from '@/contexts/ToastContext';

export type SettingsSubPage =
  | 'home'
  | 'profile'
  | 'personality'
  | 'memory'
  | 'projects'
  | 'model'
  | 'capabilities'
  | 'advanced';

export interface BotMemoryItem {
  id: string;
  title: string;
  content: string;
}

export interface BotSettingsSubpagesProps {
  settingsPage: SettingsSubPage;
  bot: BotItem;
  botName: string;
  setBotName: (v: string) => void;
  botTitle: string;
  setBotTitle: (v: string) => void;
  botDepartment: string;
  setBotDepartment: (v: string) => void;
  botSystemPrompt: string;
  setBotSystemPrompt: (v: string) => void;
  botAutonomy: 'Auto' | 'Ask';
  setBotAutonomy: (v: 'Auto' | 'Ask') => void;
  botModel: string;
  setBotModel: (v: string) => void;
  memories: BotMemoryItem[];
  onSaveSubSettings: () => void;
}

export function BotSettingsSubpages({
  settingsPage,
  bot,
  botName,
  setBotName,
  botTitle,
  setBotTitle,
  botDepartment,
  setBotDepartment,
  botSystemPrompt,
  setBotSystemPrompt,
  botAutonomy,
  setBotAutonomy,
  botModel,
  setBotModel,
  memories,
  onSaveSubSettings,
}: BotSettingsSubpagesProps) {
  const { showToast } = useToast();
  return (
    <>
      {/* SUBPAGE: 资料 (Profile) */}
      {settingsPage === 'profile' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">基础资料</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">修改伙伴名称与业务属性</p>
          </div>

          <div className="space-y-3 bg-surface-elevated border border-border-default rounded-2xl p-4">
            <div>
              <label className="text-text-tertiary text-[11px] block mb-1">伙伴称呼</label>
              <input
                type="text"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
                className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-text-tertiary text-[11px] block mb-1">完整头衔与角色</label>
              <input
                type="text"
                value={botTitle}
                onChange={(e) => setBotTitle(e.target.value)}
                className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
            <div>
              <label className="text-text-tertiary text-[11px] block mb-1">所属部门 / 组别</label>
              <input
                type="text"
                value={botDepartment}
                onChange={(e) => setBotDepartment(e.target.value)}
                className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveSubSettings}
            className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm cursor-pointer"
          >
            保存资料
          </button>
        </div>
      )}

      {/* SUBPAGE: 性格与说话习惯 (Personality) */}
      {settingsPage === 'personality' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">性格与说话习惯</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">设定系统人设、表达语气与回答深度规则</p>
          </div>

          <div className="space-y-3 bg-surface-elevated border border-border-default rounded-2xl p-4">
            <label className="text-text-tertiary text-[11px] block">System Prompt (系统提示词)</label>
            <textarea
              value={botSystemPrompt}
              onChange={(e) => setBotSystemPrompt(e.target.value)}
              rows={8}
              className="w-full bg-surface border border-border-default rounded-xl p-3 font-mono text-[11px] text-text-primary focus:outline-none focus:border-accent-blue leading-relaxed resize-none"
            />
            <div className="text-[10px] text-text-tertiary">
              该提示词会作为 System 顶层指令直接注入该伙伴所有的单聊与协同会话中。
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveSubSettings}
            className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm cursor-pointer"
          >
            保存人设与习惯
          </button>
        </div>
      )}

      {/* SUBPAGE: 记忆 (Memory) */}
      {settingsPage === 'memory' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">记忆库</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">该伙伴已掌握的跨会话长期记忆与事实</p>
          </div>

          <div className="space-y-2.5">
            {memories.map((m) => (
              <div
                key={m.id}
                className="p-3 bg-surface-elevated border border-border-default rounded-2xl space-y-1 shadow-xs"
              >
                <div className="font-semibold text-text-primary text-xs">{m.title}</div>
                <div className="text-text-secondary text-[11px]">{m.content}</div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => showToast('已新增测试记忆条目', 'success')}
            className="w-full py-2 border border-border-default rounded-xl hover:bg-surface-hover font-medium text-xs text-text-primary transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加一条记忆</span>
          </button>
        </div>
      )}

      {/* SUBPAGE: 关联项目 (Projects) */}
      {settingsPage === 'projects' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">关联项目与代码库</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">该伙伴有权读取或管理的工作区目录</p>
          </div>

          <div className="space-y-2">
            <div className="p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono">
                <Folder className="w-3.5 h-3.5 text-accent-amber" />
                <span>/Users/xr/IDEA.localized/cindy</span>
              </div>
              <span className="text-[10px] text-accent-green font-mono">DEFAULT</span>
            </div>

            <div className="p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-2 font-mono">
                <Folder className="w-3.5 h-3.5 text-accent-amber" />
                <span>/Users/xr/IDEA.localized/multiagent-orchestration</span>
              </div>
              <span className="text-[10px] text-accent-blue font-mono">LINKED</span>
            </div>
          </div>
        </div>
      )}

      {/* SUBPAGE: 模型 (Model) */}
      {settingsPage === 'model' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">模型配置</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">为 {botName} 挑选专属驱动模型</p>
          </div>

          <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl space-y-3">
            <div>
              <label className="text-text-tertiary text-[11px] block mb-1">首选推理模型</label>
              <select
                value={botModel}
                onChange={(e) => setBotModel(e.target.value)}
                className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary font-mono focus:outline-none"
              >
                <option value="claude-opus-5-5">Claude Opus 5.5 (高推理)</option>
                <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (均衡)</option>
                <option value="gpt-5.5">GPT-5.5 (Codex)</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveSubSettings}
            className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm cursor-pointer"
          >
            保存模型设置
          </button>
        </div>
      )}

      {/* SUBPAGE: 能力 (Capabilities) */}
      {settingsPage === 'capabilities' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <BotCapabilityMatrix
            botId={bot.id}
            initialCapabilities={(bot as any).rawCapabilities || (bot as any).capabilities}
          />
        </div>
      )}

      {/* SUBPAGE: 高级配置 (Advanced) */}
      {settingsPage === 'advanced' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">高级配置与自主度</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">控制审批机制与上下文管理行为</p>
          </div>

          <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-text-primary">默认工具执行审批</div>
                <div className="text-[10px] text-text-tertiary">控制写文件与终端执行的确认策略</div>
              </div>
              <select
                value={botAutonomy}
                onChange={(e) => setBotAutonomy(e.target.value as any)}
                className="bg-surface border border-border-default px-2.5 py-1 rounded-lg text-text-primary font-mono focus:outline-none"
              >
                <option value="Auto">Auto (自动放行常规读写)</option>
                <option value="Ask">Ask (高危操作逐条确认)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={onSaveSubSettings}
            className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm cursor-pointer"
          >
            保存高级配置
          </button>
        </div>
      )}
    </>
  );
}
