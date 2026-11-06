/**
 * Purpose: Keyboard-navigable autocomplete menu for @partner mentions matching the 7 core partners.
 * Context: Supports alias/name/role fuzzy matching with Arrow/Enter/Escape navigation in the group composer.
 * Usage: <MentionAutocompleteMenu query={query} partners={partners} onSelect={handleSelect} onClose={handleClose} />
 * Prerequisites: React 19, Tailwind CSS, PartnerInfo types.
 */

import React, { useEffect, useState } from 'react';
import type { PartnerInfo } from '@/types/room';

interface MentionAutocompleteMenuProps {
  query: string;
  partners: PartnerInfo[];
  onSelect: (partner: PartnerInfo) => void;
  onClose: () => void;
}

export const MentionAutocompleteMenu: React.FC<MentionAutocompleteMenuProps> = ({
  query,
  partners,
  onSelect,
  onClose
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Normalize query for filtering
  const cleanQuery = query.toLowerCase().trim();

  const filtered = partners.filter((p) => {
    if (!cleanQuery) return true;
    if (p.name.toLowerCase().includes(cleanQuery)) return true;
    if (p.id.toLowerCase().includes(cleanQuery)) return true;
    if (p.role.toLowerCase().includes(cleanQuery)) return true;
    return p.aliases.some((a) => a.toLowerCase().includes(cleanQuery));
  });

  // Reset selectedIndex when filtered changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [cleanQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex, onSelect, onClose]);

  if (filtered.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-2 w-72 rounded-2xl bg-surface-elevated border border-border-default shadow-xl p-3 z-50 text-xs text-text-tertiary">
        未找到匹配的伙伴: &ldquo;{query}&rdquo;
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-80 max-h-72 overflow-y-auto rounded-2xl bg-surface-elevated border border-border-default shadow-2xl p-1.5 z-50 space-y-1">
      <div className="px-2.5 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
        提及伙伴 (支持上下键与回车选取)
      </div>
      {filtered.map((partner, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <div
            key={partner.id}
            onClick={() => onSelect(partner)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl cursor-pointer transition-colors text-xs ${
              isSelected ? 'bg-surface-chip text-text-primary shadow-xs' : 'hover:bg-surface-hover text-text-secondary'
            }`}
          >
            <img
              src={partner.avatarUrl || '/assets/agent-island-cindy.png'}
              alt={partner.name}
              className="w-7 h-7 rounded-full object-cover border border-border-subtle shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-text-primary truncate">{partner.name}</span>
                {partner.badgeText ? (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                    {partner.badgeText}
                  </span>
                ) : null}
              </div>
              <p className="text-[11px] text-text-tertiary truncate">{partner.role}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
