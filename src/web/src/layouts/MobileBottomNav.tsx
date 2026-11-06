/**
 * Purpose: Adaptive Mobile Bottom Navigation Bar (pi-web style).
 * Context: Seamless one-thumb mobile navigation for chats, bots, skills, and settings.
 * Usage: <MobileBottomNav />
 * Prerequisites: React 18/19, react-router-dom, lucide-react.
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  Bot,
  Zap,
  Settings,
  PlusCircle,
} from 'lucide-react';
import { triggerHaptic } from '@/utils/haptics';

export function MobileBottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isKeyboardOpen, setIsKeyboardOpen] = React.useState(false);

  // Auto-hide bottom nav when virtual keyboard is active (pi-web mobile experience)
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleFocus = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setIsKeyboardOpen(true);
      }
    };

    const handleBlur = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        setIsKeyboardOpen(false);
      }
    };

    window.addEventListener('focus', handleFocus, true);
    window.addEventListener('blur', handleBlur, true);
    return () => {
      window.removeEventListener('focus', handleFocus, true);
      window.removeEventListener('blur', handleBlur, true);
    };
  }, []);

  if (isKeyboardOpen) return null;

  const navItems = [
    {
      id: 'group-chat',
      label: '群聊',
      path: '/bots/groups/multiagent_orchestration',
      icon: MessageSquare,
      active: location.pathname.startsWith('/bots/groups'),
    },
    {
      id: 'bots',
      label: '伙伴',
      path: '/bots',
      icon: Bot,
      active: location.pathname === '/bots' || location.pathname.startsWith('/bots/roster'),
    },
    {
      id: 'new',
      label: '新建',
      path: '/cc-agent/new',
      icon: PlusCircle,
      active: location.pathname === '/cc-agent/new',
      highlight: true,
    },
    {
      id: 'skills',
      label: '技能',
      path: '/skillhub',
      icon: Zap,
      active: location.pathname.startsWith('/skillhub'),
    },
    {
      id: 'settings',
      label: '设置',
      path: '/settings',
      icon: Settings,
      active: location.pathname.startsWith('/settings'),
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface/95 backdrop-blur-md border-t border-border-default px-2 py-1 flex items-center justify-around select-none shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom))]"
    >
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.active;

        if (item.highlight) {
          return (
            <button
              key={item.id}
              onClick={() => {
                triggerHaptic('medium');
                navigate(item.path);
              }}
              className="flex flex-col items-center justify-center -mt-3 text-accent-blue hover:text-accent-blue/80 active:scale-95 transition-transform"
              title={item.label}
            >
              <div className="w-10 h-10 rounded-full bg-accent-blue text-white flex items-center justify-center shadow-md shadow-accent-blue/30">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] font-medium text-text-secondary mt-0.5">{item.label}</span>
            </button>
          );
        }

        return (
          <button
            key={item.id}
            onClick={() => {
              triggerHaptic('light');
              navigate(item.path);
            }}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
              isActive
                ? 'text-accent-blue font-semibold scale-105'
                : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.4]' : 'stroke-[1.8]'}`} />
            <span className="text-[10px] mt-0.5 tracking-tight">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
