/**
 * Purpose: Bot configuration drawer with subpage navigation and settings management.
 * Context: Settings drawer opened from BotSessionHeader in BotSessionPage.
 * Usage: Rendered conditionally when isSettingsOpen is true in BotSessionPage.
 * Prerequisites: React, react-router-dom, lucide-react, BotItem type.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  X,
  Camera,
  Info,
  ChevronRight,
  User,
  Brain,
  Folder,
  Sliders,
  Volume2,
  Puzzle,
  MessageSquare,
  Clock,
  History,
  Monitor,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { BotItem } from '@/mock/bots';
import {
  BotSettingsSubpages,
  SettingsSubPage,
  BotMemoryItem,
} from './BotSettingsSubpages';
import { useToast } from '@/contexts/ToastContext';

export interface BotSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
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
}

export function BotSettingsDrawer({
  isOpen,
  onClose,
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
}: BotSettingsDrawerProps) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [settingsPage, setSettingsPage] = useState<SettingsSubPage>('home');
  const [, setSavedSettingsNotice] = useState(false);

  if (!isOpen) return null;

  const handleSaveSubSettings = () => {
    setSavedSettingsNotice(true);
    setTimeout(() => {
      setSavedSettingsNotice(false);
      setSettingsPage('home');
    }, 800);
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-end z-50 animate-in fade-in">
      <div className="w-full max-w-[450px] h-full bg-surface border-l border-border-default shadow-2xl flex flex-col justify-between overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Top Bar: 设置 ✕ */}
        <div className="h-14 px-6 border-b border-border-default flex items-center justify-between shrink-0 bg-surface">
          {settingsPage === 'home' ? (
            <h2 className="text-base font-bold text-text-primary tracking-tight">
              设置
            </h2>
          ) : (
            <button
              type="button"
              onClick={() => setSettingsPage('home')}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>返回</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SUBPAGE 1: MAIN SETTINGS MENU (1:1 还原 Image 7 截图) */}
        {settingsPage === 'home' ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
            {/* Top Centered Avatar with Camera Badge + Name */}
            <div className="flex flex-col items-center justify-center pt-2 pb-4 space-y-2 text-center">
              <div className="relative">
                <img
                  src={bot.avatar}
                  alt={botName}
                  className="w-20 h-20 rounded-full object-cover border-2 border-border-default shadow-sm bg-surface-elevated"
                />
                {/* Camera Badge (Image 7) */}
                <div
                  title="更换头像"
                  className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-surface-elevated border border-border-default flex items-center justify-center text-text-secondary shadow-xs cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                </div>
              </div>

              <h3 className="text-base font-bold text-text-primary">
                {botName}
              </h3>
            </div>

            {/* Section 1: 11 Items Main Settings Card (1:1 还原 Image 7) */}
            <div className="bg-surface-elevated border border-border-default rounded-2xl overflow-hidden shadow-xs divide-y divide-border-subtle">
              {/* 1. 资料 */}
              <div
                onClick={() => setSettingsPage('profile')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Info className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">资料</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 2. 性格与说话习惯 */}
              <div
                onClick={() => setSettingsPage('personality')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <User className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">性格与说话习惯</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 3. 记忆 */}
              <div
                onClick={() => setSettingsPage('memory')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Brain className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">记忆</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 4. 关联项目 */}
              <div
                onClick={() => setSettingsPage('projects')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Folder className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">关联项目</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 5. 模型 */}
              <div
                onClick={() => setSettingsPage('model')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Sliders className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">模型</span>
                </div>
                <div className="flex items-center gap-1.5 text-text-tertiary">
                  <span className="text-xs font-mono">{botModel}</span>
                  <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                </div>
              </div>

              {/* 6. 语音 */}
              <div
                onClick={() => showToast('语音设置：已启用系统高精度 Neural TTS 引擎', 'info')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Volume2 className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">语音</span>
                </div>
                <div className="flex items-center gap-1.5 text-text-tertiary">
                  <span className="text-xs">自然清晰 (女)</span>
                  <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                </div>
              </div>

              {/* 7. 能力 */}
              <div
                onClick={() => setSettingsPage('capabilities')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Puzzle className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">能力</span>
                </div>
                <div className="flex items-center gap-1.5 text-text-tertiary">
                  <span className="text-xs font-mono">{bot.capabilities.length} 个启用</span>
                  <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                </div>
              </div>

              {/* 8. 消息平台 */}
              <div
                onClick={() => showToast('消息平台：已与飞书、Telegram 机器人通道互联', 'info')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <MessageSquare className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">消息平台</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 9. 例行任务 */}
              <div
                onClick={() => navigate('/cc-agent/scheduled')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Clock className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">例行任务</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 10. 搜索伙伴历史 */}
              <div
                onClick={() => showToast(`已建立 ${botName} 的全量对话历史索引`, 'success')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <History className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">搜索伙伴历史</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>

              {/* 11. 高级配置 */}
              <div
                onClick={() => setSettingsPage('advanced')}
                className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Sliders className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">高级配置</span>
                </div>
                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
              </div>
            </div>

            {/* Section 2: 主力电脑 Card (1:1 还原 Image 7 截图) */}
            <div className="bg-surface-elevated border border-border-default rounded-2xl overflow-hidden shadow-xs">
              <div
                onClick={() => showToast('主力电脑运行状态：当前即在“这台电脑”执行', 'info')}
                className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
              >
                <div className="flex items-center gap-3 text-text-primary">
                  <Monitor className="w-4 h-4 text-text-secondary" />
                  <span className="font-medium text-[13px]">主力电脑</span>
                </div>
                <div className="flex items-center gap-1.5 text-text-tertiary">
                  <span className="text-xs">这台电脑</span>
                  <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                </div>
              </div>
            </div>

            {/* Section 3: 重启与删除操作 Card (1:1 还原 Image 7 截图) */}
            <div className="bg-surface-elevated border border-border-default rounded-2xl overflow-hidden shadow-xs divide-y divide-border-subtle">
              {/* 重启伙伴 */}
              <button
                type="button"
                onClick={() => showToast(`已重启 ${botName} 进程与上下文！`, 'success')}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover/70 text-left text-[13px] font-medium text-text-primary transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-text-secondary" />
                <span>重启伙伴</span>
              </button>

              {/* 永久删除伙伴 (Red) */}
              <button
                type="button"
                onClick={() => {
                  if (confirm(`确定要永久删除伙伴【${botName}】吗？此操作无法撤销。`)) {
                    navigate('/bots');
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover/70 text-left text-[13px] font-medium text-accent-red hover:text-red-600 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4 text-accent-red" />
                <span>永久删除伙伴</span>
              </button>
            </div>
          </div>
        ) : (
          <BotSettingsSubpages
            settingsPage={settingsPage}
            bot={bot}
            botName={botName}
            setBotName={setBotName}
            botTitle={botTitle}
            setBotTitle={setBotTitle}
            botDepartment={botDepartment}
            setBotDepartment={setBotDepartment}
            botSystemPrompt={botSystemPrompt}
            setBotSystemPrompt={setBotSystemPrompt}
            botAutonomy={botAutonomy}
            setBotAutonomy={setBotAutonomy}
            botModel={botModel}
            setBotModel={setBotModel}
            memories={memories}
            onSaveSubSettings={handleSaveSubSettings}
          />
        )}
      </div>
    </div>
  );
}
