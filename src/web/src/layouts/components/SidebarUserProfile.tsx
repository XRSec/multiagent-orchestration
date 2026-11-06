import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  Settings,
  FlaskConical,
  Bug,
  LogOut
} from 'lucide-react';
import { MOCK_USER_PROFILE } from '@/mock/settings';

export const SidebarUserProfile: React.FC = () => {
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <div className="p-2 border-t border-border-default relative shrink-0">
      <div
        onClick={() => setUserMenuOpen(!userMenuOpen)}
        className="flex items-center justify-between p-2 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors"
      >
        <div className="flex items-center gap-2">
          <img
            src={MOCK_USER_PROFILE.avatar}
            alt=""
            className="w-7 h-7 rounded-full bg-surface-elevated border border-border-default object-cover"
          />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-text-primary leading-tight">
              {MOCK_USER_PROFILE.name}
            </span>
            <span className="text-[10px] text-text-tertiary">
              {MOCK_USER_PROFILE.plan}
            </span>
          </div>
        </div>
        <ChevronRight
          className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
            userMenuOpen ? 'rotate-90' : ''
          }`}
        />
      </div>

      {/* User popover */}
      {userMenuOpen && (
        <div className="absolute bottom-full left-2 right-2 mb-1.5 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1.5 z-50">
          <div className="p-2 border-b border-border-default mb-1">
            <div className="flex justify-between text-[11px] font-medium text-text-secondary mb-1">
              <span>月度额度消耗</span>
              <span>36%</span>
            </div>
            <div className="h-1.5 w-full bg-surface-chip rounded-full overflow-hidden">
              <div className="h-full bg-accent-blue rounded-full w-[36%]" />
            </div>
            <div className="text-[10px] text-text-tertiary mt-1">
              1.82M / 5.0M Tokens
            </div>
          </div>

          <button
            onClick={() => {
              setUserMenuOpen(false);
              navigate('/settings');
            }}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-text-primary cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-text-secondary" />
            <span>系统设置</span>
          </button>

          <button
            onClick={() => {
              setUserMenuOpen(false);
              navigate('/maker-experimental');
            }}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-text-primary cursor-pointer"
          >
            <FlaskConical className="w-3.5 h-3.5 text-accent-purple" />
            <span>诊断与实验</span>
          </button>

          <button
            onClick={() => {
              setUserMenuOpen(false);
              navigate('/issues');
            }}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-text-primary cursor-pointer"
          >
            <Bug className="w-3.5 h-3.5 text-accent-amber" />
            <span>问题反馈</span>
          </button>

          <div className="h-px bg-border-default my-1" />

          <button
            onClick={() => {
              setUserMenuOpen(false);
              navigate('/login');
            }}
            className="w-full text-left px-2.5 py-1.5 text-xs rounded-lg hover:bg-surface-hover flex items-center gap-2 text-accent-red cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>切换 / 退出登录</span>
          </button>
        </div>
      )}
    </div>
  );
};
