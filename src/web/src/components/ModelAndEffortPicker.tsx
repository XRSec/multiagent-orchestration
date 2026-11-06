/**
 * Purpose: Merged Model & Reasoning Effort Picker Popover adhering 1:1 to Claude official UI.
 * Context: Reflects user-configured models only (no mocks), uses custom aliases, and embeds effort submenu.
 * Usage: <ModelAndEffortPicker currentModelId={...} onModelChange={...} currentEffort={...} onEffortChange={...} />
 */

import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, ChevronDown, ChevronRight, Check } from 'lucide-react';

export interface ModelItem {
  id: string;
  name: string;
  displayName: string;
  shortLabel: string;
  description: string;
  isDefault?: boolean;
  role?: string;
  provider: string;
}

export interface EffortItem {
  id: string;
  label: string;
  tokens: number;
  isDefault?: boolean;
}

interface ModelAndEffortPickerProps {
  currentModelId: string;
  onModelChange: (modelId: string) => void;
  currentEffort: string;
  onEffortChange: (effortId: string) => void;
  className?: string;
}

export function ModelAndEffortPicker({
  currentModelId,
  onModelChange,
  currentEffort,
  onEffortChange,
  className = '',
}: ModelAndEffortPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEffortSubmenuOpen, setIsEffortSubmenuOpen] = useState(false);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [efforts, setEfforts] = useState<EffortItem[]>([
    { id: 'low', label: '低', tokens: 2000 },
    { id: 'medium', label: '中', tokens: 8000 },
    { id: 'high', label: '高', tokens: 16000 },
    { id: 'extra', label: '额外', tokens: 24000 },
    { id: 'max', label: '最高', tokens: 32000, isDefault: true },
  ]);

  const containerRef = useRef<HTMLDivElement>(null);

  // Load configured models from backend
  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/config/models');
        const data = await res.json();
        if (data.ok && Array.isArray(data.models) && data.models.length > 0) {
          setModels(data.models);
          if (Array.isArray(data.reasoningEfforts) && data.reasoningEfforts.length > 0) {
            setEfforts(data.reasoningEfforts);
          }
          // If no active model chosen, set backend active default
          if (!currentModelId && data.activeDefaultModel) {
            onModelChange(data.activeDefaultModel);
          }
        }
      } catch (err) {
        console.warn('Failed to load models config:', err);
      }
    }
    fetchConfig();
  }, []);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsEffortSubmenuOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Active items lookup
  const activeModel = models.find((m) => m.id === currentModelId) || models[0];
  const activeEffort = efforts.find((e) => e.id === currentEffort || e.label === currentEffort) || efforts[efforts.length - 1];

  const displayModelName = activeModel?.displayName || activeModel?.shortLabel || currentModelId || 'Gemini 3.8 Flash';
  const displayEffortLabel = activeEffort?.label || '最高';

  return (
    <div className={`relative inline-block select-none ${className}`} ref={containerRef}>
      {/* 触发胶囊按钮 (参考 Claude 截图) */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setIsEffortSubmenuOpen(false);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-surface-chip hover:bg-surface-hover text-text-primary text-[11px] font-medium transition-colors border border-border-subtle cursor-pointer shadow-xs"
        title="选择模型及思考深度"
      >
        <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
        <span className="font-mono">{displayModelName}</span>
        <span className="text-text-tertiary">·</span>
        <span className="text-text-secondary">{displayEffortLabel}</span>
        <ChevronDown
          className={`w-3 h-3 text-text-tertiary transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* 主弹窗：模型 · 此会话 (1:1 对齐用户截图) */}
      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-80 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-[11px] text-text-tertiary font-medium">
            模型 · 此会话
          </div>

          {/* 模型列表 */}
          <div className="space-y-0.5 max-h-72 overflow-y-auto">
            {models.map((m, idx) => {
              const isSelected = m.id === (activeModel?.id || currentModelId);
              return (
                <div
                  key={m.id}
                  onClick={() => {
                    onModelChange(m.id);
                    setIsOpen(false);
                  }}
                  className={`flex items-start justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors group ${
                    isSelected
                      ? 'bg-surface-chip text-text-primary font-medium'
                      : 'hover:bg-surface-hover text-text-primary'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold truncate">
                        {m.displayName || m.shortLabel || m.name}
                      </span>
                      {m.isDefault && (
                        <span className="text-[10px] bg-surface-hover border border-border-subtle text-text-tertiary px-1.5 py-0.2 rounded font-normal shrink-0">
                          默认
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <div className="text-[11px] text-text-tertiary mt-0.5 truncate leading-tight">
                        {m.description}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 flex items-center justify-end w-5 h-5 mt-0.5">
                    {isSelected ? (
                      <Check className="w-4 h-4 text-accent-blue" />
                    ) : (
                      <span className="text-[11px] text-text-tertiary opacity-60">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="h-px bg-border-subtle my-1.5" />

          {/* 思考深度行 (含左侧悬浮子菜单) */}
          <div
            className="relative"
            onMouseEnter={() => setIsEffortSubmenuOpen(true)}
            onClick={(e) => {
              e.stopPropagation();
              setIsEffortSubmenuOpen(!isEffortSubmenuOpen);
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-xs transition-colors">
              <span className="text-text-primary font-medium">思考深度</span>
              <div className="flex items-center gap-1 text-text-tertiary">
                <span className="text-text-secondary">{displayEffortLabel}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {/* 思考深度二级子菜单 (向左侧弹出，1:1 对齐用户截图) */}
            {isEffortSubmenuOpen && (
              <div
                className="absolute right-full bottom-0 mr-2 w-64 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2.5 z-60 text-xs animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[11px] text-text-secondary leading-relaxed px-1 pb-2 mb-1.5 border-b border-border-subtle">
                  Higher effort means more thorough responses, but takes longer and uses your limits faster.
                </div>

                <div className="space-y-0.5">
                  {efforts.map((eff) => {
                    const isSelected = eff.id === activeEffort.id || eff.label === activeEffort.label;
                    return (
                      <div
                        key={eff.id}
                        onClick={() => {
                          onEffortChange(eff.id);
                          setIsEffortSubmenuOpen(false);
                          setIsOpen(false);
                        }}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-surface-chip text-text-primary font-medium'
                            : 'hover:bg-surface-hover text-text-primary'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span>{eff.label}</span>
                          {eff.isDefault && (
                            <span className="text-[10px] bg-surface-hover border border-border-subtle text-text-tertiary px-1.5 py-0.2 rounded font-normal">
                              默认
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <Check className="w-4 h-4 text-accent-blue" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
