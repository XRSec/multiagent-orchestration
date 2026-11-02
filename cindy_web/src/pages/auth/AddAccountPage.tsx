import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Building2, User } from 'lucide-react';

export function AddAccountPage() {
  const navigate = useNavigate();

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-screen w-screen bg-surface select-none">
      <div className="w-full max-w-sm flex flex-col items-center space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="self-start flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="flex flex-col items-center text-center space-y-1">
          <UserPlus className="w-10 h-10 text-accent-blue mb-2" />
          <h1 className="text-lg font-bold text-text-primary">添加关联账号</h1>
          <p className="text-xs text-text-secondary">
            添加个人账号或企业组织账号，随时自由切换上下文
          </p>
        </div>

        <div className="w-full space-y-3">
          <div
            onClick={() => navigate('/login')}
            className="p-4 bg-surface-elevated hover:bg-surface-hover border border-border-default rounded-2xl cursor-pointer transition-all flex items-center gap-3.5 shadow-sm"
          >
            <div className="p-2.5 bg-surface-chip rounded-xl text-accent-blue">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-primary">登录新的个人账号</div>
              <div className="text-[11px] text-text-tertiary">使用独立邮箱或手机号</div>
            </div>
          </div>

          <div
            onClick={() => navigate('/login')}
            className="p-4 bg-surface-elevated hover:bg-surface-hover border border-border-default rounded-2xl cursor-pointer transition-all flex items-center gap-3.5 shadow-sm"
          >
            <div className="p-2.5 bg-surface-chip rounded-xl text-accent-purple">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-text-primary">加入团队 / 企业组织</div>
              <div className="text-[11px] text-text-tertiary">通过企业 SSO 或团队邀请码加入</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
