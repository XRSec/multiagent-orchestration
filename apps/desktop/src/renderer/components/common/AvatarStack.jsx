import React from 'react';
import { Bot, Cpu, Shield, User, Sparkles } from 'lucide-react';

const ICON_MAP = {
  Bot,
  Cpu,
  Shield,
  User,
  Sparkles,
};

const COLOR_PALETTES = [
  'bg-sky-500/20 text-sky-400 border-sky-500/30',
  'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'bg-rose-500/20 text-rose-400 border-rose-500/30',
  'bg-purple-500/20 text-purple-400 border-purple-500/30',
];

const SIZE_CONFIG = {
  xs: { box: 'w-5 h-5 text-[10px]', overlap: '-ml-1.5', iconSize: 10 },
  sm: { box: 'w-7 h-7 text-xs', overlap: '-ml-2', iconSize: 14 },
  md: { box: 'w-9 h-9 text-sm', overlap: '-ml-2.5', iconSize: 18 },
};

function getDeterministicHue(text = '') {
  const str = String(text ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return COLOR_PALETTES[Math.abs(hash) % COLOR_PALETTES.length];
}

function renderAvatarContent(member, iconSize) {
  const avatar = member?.avatar;

  if (typeof avatar === 'string' && avatar.trim().length > 0) {
    if (avatar.startsWith('http') || avatar.startsWith('/') || avatar.startsWith('data:')) {
      return (
        <img
          src={avatar}
          alt={member?.name || 'avatar'}
          className="w-full h-full object-cover rounded-full"
        />
      );
    }

    const IconComp = ICON_MAP[avatar];
    if (IconComp) {
      return (
        <IconComp
          size={iconSize}
          style={{ color: member?.avatarColor || 'currentColor' }}
          className="shrink-0"
        />
      );
    }

    // 单个 emoji 或普通字符
    if (avatar.length <= 2) {
      return <span>{avatar}</span>;
    }
  }

  // 首字母降级
  const initial = String(member?.name || member?.id || '?').charAt(0).toUpperCase();
  return <span className="font-semibold leading-none">{initial}</span>;
}

/**
 * AvatarStack
 * 成员头像水平叠放组件：底色描边物理切割、溢出胶囊与多格式自适应
 */
export default function AvatarStack({
  members = [],
  max = 4,
  size = 'sm',
  className = '',
  showTooltip = true,
  onMemberClick,
}) {
  const cfg = SIZE_CONFIG[size] || SIZE_CONFIG.sm;
  const safeMembers = (Array.isArray(members) ? members : []).filter(Boolean);
  const visibleMembers = safeMembers.slice(0, max);
  const overflowCount = safeMembers.length - max;
  const overflowMembers = overflowCount > 0 ? safeMembers.slice(max) : [];

  return (
    <div className={`inline-flex items-center select-none ${className}`}>
      {visibleMembers.map((member, index) => {
        const identifier = String(member?.name || member?.id || index);
        const colorClass = getDeterministicHue(identifier);
        const hasClick = typeof onMemberClick === 'function';

        return (
          <div
            key={member?.id || index}
            title={showTooltip ? String(member?.name || member?.id || '') : undefined}
            onClick={() => hasClick && onMemberClick(member)}
            className={`relative flex items-center justify-center rounded-full border-2 border-surface ${cfg.box} ${
              index > 0 ? cfg.overlap : ''
            } ${colorClass} ${
              hasClick ? 'cursor-pointer hover:z-20 hover:scale-110 transition-transform' : ''
            }`}
            style={{ zIndex: visibleMembers.length - index }}
          >
            {renderAvatarContent(member, cfg.iconSize)}
          </div>
        );
      })}

      {overflowCount > 0 && (
        <div
          title={
            showTooltip
              ? `更多成员: ${overflowMembers.map((m) => m?.name || m?.id || '?').join(', ')}`
              : undefined
          }
          className={`relative flex items-center justify-center rounded-full border-2 border-surface bg-card text-slate-300 font-mono font-medium ${cfg.box} ${cfg.overlap} z-0 shadow-xs`}
        >
          +{overflowCount}
        </div>
      )}
    </div>
  );
}
