import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, Zap, Flame } from 'lucide-react';
import { useLocale } from '@/contexts/LocaleContext';

export const SidebarTopNav: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLocale();

  const isCurrent = (path: string) => {
    if (path === '/cc-agent/new' && (location.pathname === '/' || location.pathname === '/cc-agent/new')) {
      return true;
    }
    return location.pathname === path || (path !== '/' && location.pathname.startsWith(path));
  };

  return (
    <div className="p-2 space-y-0.5 border-b border-border-default shrink-0">
      <button
        onClick={() => navigate('/cc-agent/new')}
        className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
          isCurrent('/cc-agent/new')
            ? 'bg-surface-chip text-text-primary font-semibold'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <span className="text-accent-blue font-bold text-sm leading-none">+</span>
        <span>新建对话</span>
      </button>

      <button
        onClick={() => navigate('/cc-agent/scheduled')}
        className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
          isCurrent('/cc-agent/scheduled')
            ? 'bg-surface-chip text-text-primary font-semibold'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <Clock className="w-3.5 h-3.5 text-accent-amber" />
        <span>自动任务 (Cron)</span>
      </button>

      <button
        onClick={() => navigate('/skillhub')}
        className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
          isCurrent('/skillhub')
            ? 'bg-surface-chip text-text-primary font-semibold'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <Zap className="w-3.5 h-3.5 text-accent-green" />
        <span>{t('个性化定制', 'Customizations')}</span>
      </button>

      <button
        onClick={() => navigate('/control-plane/distill')}
        className={`flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
          isCurrent('/control-plane/distill')
            ? 'bg-surface-chip text-text-primary font-semibold'
            : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
        }`}
      >
        <Flame className="w-3.5 h-3.5 text-amber-500" />
        <span>去脂蒸馏 Diff 面板</span>
      </button>
    </div>
  );
};
