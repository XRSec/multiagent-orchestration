/**
 * Purpose: Subpage detail views for Bot settings (profile, personality, memory, projects, model, capabilities, advanced).
 * Context: Rendered within BotSettingsDrawer; the 'model' subpage dynamically loads all models from /api/config/models
 *          and configures the companion's 4-slot model chain (Primary + 3 Fallbacks) and thinking effort.
 * Usage: Subpage renderer component inside BotSettingsDrawer.
 * Prerequisites: React, lucide-react, BotItem type.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Folder, Sparkles, ShieldAlert, Layers, Sliders, Check, RotateCcw } from 'lucide-react';
import { BotItem } from '@/mock/bots';
import { BotCapabilityMatrix } from '@/components/bots/BotCapabilityMatrix';
import { BotModelChainEditor, type BotModelRoute } from '@/components/bots/BotModelChainEditor';
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

interface CatalogModelOption {
  id: string;
  name?: string;
  displayName?: string;
  provider?: string;
  providerId?: string;
  vendor?: string;
  enabled?: boolean;
}

const DEFAULT_FALLBACK_MODELS = [
  { id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5', vendor: 'ANTHROPIC', provider: 'Claude' },
  { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6 (Thinking)', vendor: 'ANTHROPIC', provider: 'Claude' },
  { id: 'claude-sonnet-5-5', displayName: 'Claude Sonnet 5.5', vendor: 'ANTHROPIC', provider: 'Claude' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6 (Thinking)', vendor: 'ANTHROPIC', provider: 'Claude' },
  { id: 'gemini-4-argon-web', displayName: 'gemini-4-argon-web', vendor: '谷歌', provider: 'Claude' },
  { id: 'gemini-4-argon', displayName: 'Gemini 4 Argon', vendor: '谷歌', provider: 'Claude' },
  { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', vendor: '谷歌', provider: 'Claude' },
  { id: 'gemini-3.5-flash-lite', displayName: 'Gemini 3.5 Flash Lite', vendor: '谷歌', provider: 'Claude' },
];

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

  // Dynamic full model catalog loaded from /api/config/models
  const [catalogModels, setCatalogModels] = useState<CatalogModelOption[]>(DEFAULT_FALLBACK_MODELS);
  const [slot2Fallback1, setSlot2Fallback1] = useState<string>('gemini-3.8-flash');
  const [slot3Fallback2, setSlot3Fallback2] = useState<string>('claude-sonnet-4-6');
  const [slot4Fallback3, setSlot4Fallback3] = useState<string>('gemini-3.5-flash-lite');
  const [thinkingLevel, setThinkingLevel] = useState<string>('high');
  const [savingBotModel, setSavingBotModel] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    async function loadModelsAndBotCaps() {
      try {
        const [modelsRes, botRes] = await Promise.all([
          fetch('/api/config/models').then((r) => r.json()).catch(() => null),
          fetch(`/api/bots/${encodeURIComponent(bot.id)}`).then((r) => r.json()).catch(() => null),
        ]);
        if (!active) return;

        if (modelsRes?.ok && Array.isArray(modelsRes.models) && modelsRes.models.length > 0) {
          setCatalogModels(modelsRes.models);
        }

        const caps = botRes?.bot?.capabilities || (bot as any).rawCapabilities || {};
        if (caps.model) setBotModel(caps.model);
        if (caps.fallbackModel) setSlot2Fallback1(caps.fallbackModel);
        if (caps.thinkingLevel) setThinkingLevel(caps.thinkingLevel);

        if (Array.isArray(caps.modelChain) && caps.modelChain.length > 0) {
          const chainIds = caps.modelChain
            .map((item: any) => (typeof item === 'string' ? item : item?.model))
            .filter(Boolean);
          if (chainIds[0]) setBotModel(chainIds[0]);
          if (chainIds[1]) setSlot2Fallback1(chainIds[1]);
          if (chainIds[2]) setSlot3Fallback2(chainIds[2]);
          if (chainIds[3]) setSlot4Fallback3(chainIds[3]);
        }
      } catch {}
    }
    loadModelsAndBotCaps();
    return () => {
      active = false;
    };
  }, [bot.id]);

  // Group models by vendor so all models across all providers are displayed clearly
  const groupedModels = useMemo(() => {
    const groups = new Map<string, CatalogModelOption[]>();
    for (const m of catalogModels) {
      const g = m.vendor
        ? `${m.provider || 'Claude'} · ${m.vendor}`
        : m.provider || '已配置模型';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(m);
    }
    return Array.from(groups.entries());
  }, [catalogModels]);

  const renderGroupedSelect = (
    value: string,
    onChange: (v: string) => void,
    testId: string
  ) => (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary font-mono text-xs focus:outline-none focus:border-accent-blue cursor-pointer"
    >
      {groupedModels.map(([groupLabel, list]) => (
        <optgroup key={groupLabel} label={groupLabel}>
          {list.map((m) => (
            <option key={`${m.providerId || ''}:${m.id}`} value={m.id}>
              {m.displayName && m.displayName !== m.id
                ? `${m.displayName} (${m.id})`
                : m.id}
            </option>
          ))}
        </optgroup>
      ))}
      {!catalogModels.some((m) => m.id === value) && value ? (
        <option value={value}>{value}</option>
      ) : null}
    </select>
  );

  const handleSaveBotModelChain = async () => {
    setSavingBotModel(true);
    try {
      const modelChain = [
        { model: botModel, effort: thinkingLevel },
        { model: slot2Fallback1, effort: thinkingLevel },
        { model: slot3Fallback2, effort: thinkingLevel },
        { model: slot4Fallback3, effort: 'low' },
      ];
      const res = await fetch(`/api/bots/${encodeURIComponent(bot.id)}/capabilities`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: botModel,
          fallbackModel: slot2Fallback1,
          thinkingLevel,
          effort: thinkingLevel,
          modelChain,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '保存失败');
      showToast(`已保存 ${botName} 的 4 级模型路由配置！`, 'success');
      onSaveSubSettings();
    } catch (err: any) {
      showToast(`保存伙伴模型失败: ${err.message}`, 'error');
    } finally {
      setSavingBotModel(false);
    }
  };

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

      {/* SUBPAGE: 模型 (Cindy BotModelChainEditor) */}
      {settingsPage === 'model' && (
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          <div>
            <h3 className="text-sm font-bold text-text-primary">伙伴模型与备用链</h3>
            <p className="text-text-tertiary text-[11px] mt-0.5">
              为 {botName} 配置首选模型与多级故障转移备用链（全量同步自 models.json 共 {catalogModels.length} 个模型）
            </p>
          </div>

          <BotModelChainEditor
            value={[
              { model: botModel, effort: thinkingLevel },
              { model: slot2Fallback1, effort: thinkingLevel },
              { model: slot3Fallback2, effort: thinkingLevel },
              { model: slot4Fallback3, effort: 'low' },
            ]}
            models={catalogModels}
            onRestoreDefault={() => {
              setBotModel('claude-opus-4-6');
              setSlot2Fallback1('gemini-3.8-flash');
              setSlot3Fallback2('claude-sonnet-4-6');
              setSlot4Fallback3('gemini-3.5-flash-lite');
              setThinkingLevel('high');
            }}
            onChange={(nextRoutes: BotModelRoute[]) => {
              if (nextRoutes[0]?.model) setBotModel(nextRoutes[0].model);
              if (nextRoutes[0]?.effort) setThinkingLevel(nextRoutes[0].effort);
              if (nextRoutes[1]?.model) setSlot2Fallback1(nextRoutes[1].model);
              if (nextRoutes[2]?.model) setSlot3Fallback2(nextRoutes[2].model);
              if (nextRoutes[3]?.model) setSlot4Fallback3(nextRoutes[3].model);
            }}
          />

          <button
            type="button"
            disabled={savingBotModel}
            onClick={handleSaveBotModelChain}
            className="w-full py-2.5 bg-accent-blue text-white rounded-full font-bold text-xs hover:bg-accent-blue/90 disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{savingBotModel ? '正在写入 capabilities.json...' : '保存伙伴模型链设置'}</span>
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
