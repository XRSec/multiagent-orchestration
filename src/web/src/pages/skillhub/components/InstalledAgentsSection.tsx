/**
 * Purpose: Collapsible section displaying custom agents or empty state.
 * Context: Installed tab view of SkillhubLocalPage.
 * Usage: Rendered inside the installed tab of SkillhubLocalPage.
 * Prerequisites: React, lucide-react.
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface InstalledAgentsSectionProps {
  customAgentsCount: number;
  agentsCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function InstalledAgentsSection({
  customAgentsCount,
  agentsCollapsed,
  onToggleCollapse,
}: InstalledAgentsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <span>Custom Agents</span>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
            {customAgentsCount}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              agentsCollapsed ? '-rotate-90' : ''
            }`}
          />
        </button>
      </div>

      {!agentsCollapsed && (
        <div className="text-xs text-text-tertiary py-0.5">
          No custom agents yet.
        </div>
      )}
    </div>
  );
}
