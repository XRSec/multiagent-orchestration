/**
 * Purpose: Cindy-aligned Model & Reasoning Effort Picker Popover with official ProviderLogoMark brand icons.
 * Context: Groups enabled models by brand/vendor (ANTHROPIC, 谷歌, OPENAI, etc.) and embeds Thinking Effort submenu.
 * Usage: <ModelAndEffortPicker currentModelId={...} onModelChange={...} currentEffort={...} onEffortChange={...} />
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronDown, ChevronRight, Check } from 'lucide-react';
import { ProviderLogoMark } from '@/components/icons/ProviderLogoMark';
import { resolveModelBrand } from '@/components/settings/UnifiedModelList';

export interface ModelItem {
  id: string;
  name: string;
  displayName: string;
  shortLabel: string;
  description: string;
  isDefault?: boolean;
  role?: string;
  provider: string;
  providerId?: string;
  vendor?: string;
  enabled?: boolean;
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
    { id: 'low', label: '低 (4K)', tokens: 4096 },
    { id: 'medium', label: '中 (16K)', tokens: 16384 },
    { id: 'high', label: '高 (32K)', tokens: 32000, isDefault: true },
    { id: 'max', label: '极高 (64K)', tokens: 64000 },
  ]);

  const containerRef = useRef<HTMLDivElement>(null);

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
          if (!currentModelId && data.activeDefaultModel) {
            onModelChange(data.activeDefaultModel);
          }
        }
      } catch (err) {
        console.warn('Failed to load models config:', err);
      }
    }
    fetchConfig();
  }, [isOpen]);

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

  // Only show models enabled by the switch in ProvidersTab (plus currentModelId if selected)
  const visibleModels = useMemo(
    () => models.filter((m) => m.enabled !== false || m.id === currentModelId),
    [models, currentModelId]
  );

  const groupedByBrand = useMemo(() => {
    const map = new Map<string, { label: string; items: ModelItem[] }>();
    for (const m of visibleModels) {
      const brand = resolveModelBrand({ id: m.id, name: m.displayName || m.name, vendor: m.vendor });
      if (!map.has(brand.key)) {
        map.set(brand.key, { label: brand.label, items: [] });
      }
      map.get(brand.key)!.items.push(m);
    }
    return Array.from(map.entries());
  }, [visibleModels]);

  const activeModel = visibleModels.find((m) => m.id === currentModelId) || visibleModels[0];
  const activeBrand = resolveModelBrand({
    id: activeModel?.id || currentModelId || 'claude-opus-4-6',
    name: activeModel?.displayName,
    vendor: activeModel?.vendor,
  });
  const activeEffort =
    efforts.find((e) => e.id === currentEffort || e.label === currentEffort) ||
    efforts.find((e) => e.id === 'high') ||
    efforts[0];

  const displayModelName =
    activeModel?.displayName || activeModel?.shortLabel || currentModelId || 'Claude Opus 4.6';
  const displayEffortLabel = activeEffort?.id?.toUpperCase() || 'HIGH';

  return (
    <div className={`relative inline-block select-none ${className}`} ref={containerRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setIsEffortSubmenuOpen(false);
        }}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-chip hover:bg-surface-hover text-text-primary text-[11px] font-medium transition-colors border border-border-subtle cursor-pointer shadow-2xs"
        title="选择模型及思考深度"
      >
        <span className="text-text-secondary flex items-center">
          <ProviderLogoMark
            providerId={activeModel?.providerId || 'cpa'}
            logoKind={activeBrand.logoKind}
            size={13}
          />
        </span>
        <span className="truncate max-w-[180px]">{displayModelName}</span>
        <span className="text-text-tertiary">·</span>
        <span className="text-text-secondary font-mono text-[10px]">{displayEffortLabel}</span>
        <ChevronDown
          className={`w-3 h-3 text-text-tertiary transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 bottom-full mb-2 w-80 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 text-[11px] text-text-tertiary font-medium flex items-center justify-between">
            <span>选择对话模型</span>
            <span className="font-mono text-[10px]">{visibleModels.length} 个已启用</span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
            {groupedByBrand.map(([brandKey, group]) => (
              <div key={brandKey} className="space-y-0.5">
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {group.label}
                </div>
                {group.items.map((m) => {
                  const isSelected = m.id === (activeModel?.id || currentModelId);
                  const b = resolveModelBrand({ id: m.id, name: m.displayName, vendor: m.vendor });
                  return (
                    <div
                      key={m.id}
                      onClick={() => {
                        onModelChange(m.id);
                        setIsOpen(false);
                      }}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-surface-chip text-text-primary font-semibold'
                          : 'hover:bg-surface-hover text-text-primary'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-text-secondary shrink-0">
                          <ProviderLogoMark
                            providerId={m.providerId || 'cpa'}
                            logoKind={b.logoKind}
                            size={15}
                          />
                        </span>
                        <span className="text-xs truncate">
                          {m.displayName || m.shortLabel || m.name}
                        </span>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-accent-blue shrink-0" />}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="h-px bg-border-subtle my-1.5" />

          {/* Thinking Effort Submenu */}
          <div
            className="relative"
            onMouseEnter={() => setIsEffortSubmenuOpen(true)}
            onClick={(e) => {
              e.stopPropagation();
              setIsEffortSubmenuOpen(!isEffortSubmenuOpen);
            }}
          >
            <div className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-surface-hover cursor-pointer text-xs transition-colors">
              <span className="text-text-primary font-medium">思考深度 (Effort)</span>
              <div className="flex items-center gap-1 text-text-tertiary">
                <span className="text-text-secondary font-mono">{displayEffortLabel}</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            {isEffortSubmenuOpen && (
              <div
                className="absolute right-full bottom-0 mr-2 w-64 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-2.5 z-60 text-xs animate-in fade-in zoom-in-95 duration-100"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="text-[11px] text-text-secondary leading-relaxed px-1 pb-2 mb-1.5 border-b border-border-subtle">
                  更高的思考档位会分配更多隐式推理 Token，适合复杂架构与调试任务。
                </div>

                <div className="space-y-0.5">
                  {efforts.map((eff) => {
                    const isSelected =
                      eff.id === activeEffort?.id || eff.label === activeEffort?.label;
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
                        <span>{eff.label}</span>
                        {isSelected && <Check className="w-4 h-4 text-accent-blue" />}
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
