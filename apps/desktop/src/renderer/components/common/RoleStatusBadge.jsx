import React from 'react';

const ROLE_STYLES = {
  leader: {
    badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    defaultLabel: '主控调度',
  },
  organizer: {
    badge: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
    defaultLabel: '主控调度',
  },
  reviewer: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    defaultLabel: '审计专家',
  },
  auditor: {
    badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
    defaultLabel: '审计专家',
  },
  worker: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    defaultLabel: '执行伙伴',
  },
  architect: {
    badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    defaultLabel: '架构专家',
  },
  default: {
    badge: 'bg-slate-800/80 text-slate-300 border-slate-700',
    defaultLabel: '伙伴',
  },
};

const STATUS_CONFIG = {
  idle: {
    dot: 'bg-emerald-500',
    ring: '',
    pulse: false,
    label: '在线空闲',
  },
  online: {
    dot: 'bg-emerald-500',
    ring: '',
    pulse: false,
    label: '在线',
  },
  thinking: {
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
    pulse: true,
    label: '思考中',
  },
  running: {
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
    pulse: true,
    label: '运行中',
  },
  busy: {
    dot: 'bg-amber-500',
    ping: 'bg-amber-400',
    pulse: true,
    label: '忙碌中',
  },
  offline: {
    dot: 'bg-slate-500',
    ring: '',
    pulse: false,
    label: '离线',
  },
  error: {
    dot: 'bg-rose-500',
    ping: 'bg-rose-400',
    pulse: true,
    label: '异常中断',
  },
};

/**
 * RoleStatusBadge
 * 伙伴角色徽标与运行状态指示器，支持呼吸灯脉冲与纯点/纯胶囊/组合形态
 */
export default function RoleStatusBadge({
  role,
  status,
  roleLabel,
  statusLabel,
  showStatusDot = true,
  showRoleLabel = true,
  size = 'sm',
  className = '',
}) {
  const roleKey = String(role || '').toLowerCase();
  const roleCfg = ROLE_STYLES[roleKey] || ROLE_STYLES.default;
  const statusKey = String(status || '').toLowerCase();
  const statusCfg = STATUS_CONFIG[statusKey] || (status ? STATUS_CONFIG.idle : null);

  const isSmall = size === 'sm';
  const dotSize = isSmall ? 'h-2 w-2' : 'h-2.5 w-2.5';
  const textSize = isSmall ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  const resolvedRoleText = roleLabel || (role ? roleCfg.defaultLabel : '');
  const resolvedStatusText = statusLabel || statusCfg?.label || '';

  // 1. 仅展示状态圆点
  if (showStatusDot && !showRoleLabel && statusCfg) {
    return (
      <span
        className={`relative inline-flex items-center justify-center ${dotSize} ${className}`}
        title={resolvedStatusText}
        role="status"
        aria-label={resolvedStatusText}
      >
        {statusCfg.pulse && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full ${statusCfg.ping} opacity-75 animate-ping`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${dotSize} ${statusCfg.dot}`} />
      </span>
    );
  }

  // 2. 仅展示角色标签
  if (!showStatusDot && showRoleLabel) {
    return (
      <span
        className={`inline-flex items-center font-medium rounded-full border select-none ${roleCfg.badge} ${textSize} ${className}`}
      >
        {resolvedRoleText}
      </span>
    );
  }

  // 3. 组合模式：呼吸灯圆点 + 角色标签
  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded-full border select-none ${roleCfg.badge} ${textSize} ${className}`}
      title={resolvedStatusText ? `状态: ${resolvedStatusText}` : undefined}
    >
      {showStatusDot && statusCfg && (
        <span
          className={`relative inline-flex items-center justify-center shrink-0 ${dotSize}`}
          role="status"
        >
          {statusCfg.pulse && (
            <span
              className={`absolute inline-flex h-full w-full rounded-full ${statusCfg.ping} opacity-75 animate-ping`}
            />
          )}
          <span className={`relative inline-flex rounded-full ${dotSize} ${statusCfg.dot}`} />
        </span>
      )}
      {showRoleLabel && <span>{resolvedRoleText}</span>}
    </span>
  );
}
