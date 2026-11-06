import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lock,
  Mail,
  Smartphone,
  ArrowRight,
  ShieldCheck,
  Check,
  Globe,
  Sparkles,
} from 'lucide-react';

export function LoginPage() {
  const navigate = useNavigate();
  const [loginMethod, setLoginMethod] = useState<'email' | 'phone'>('email');
  const [identifier, setIdentifier] = useState('xr@cindy.app');
  const [code, setCode] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/cc-agent/new');
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 h-screen w-screen bg-surface select-none overflow-y-auto">
      <div className="w-full max-w-sm flex flex-col items-center space-y-6">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src="/assets/head-image-dark.png"
            alt="Cindy"
            className="w-16 h-16 rounded-2xl shadow-xl border border-border-default object-cover"
          />
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            登录 Cindy 账号
          </h1>
          <p className="text-xs text-text-secondary">
            跨设备同步你的会话历史、AI 伙伴阵容与云端插件
          </p>
        </div>

        {/* Card */}
        <div className="w-full bg-surface-elevated border border-border-default rounded-3xl p-6 shadow-xl space-y-5">
          {/* Method Selector Tabs */}
          <div className="flex bg-surface-chip p-1 rounded-xl">
            <button
              onClick={() => setLoginMethod('email')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                loginMethod === 'email'
                  ? 'bg-surface-elevated text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              邮箱验证码
            </button>
            <button
              onClick={() => setLoginMethod('phone')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                loginMethod === 'phone'
                  ? 'bg-surface-elevated text-text-primary shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              手机短信登录
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-text-tertiary">
                {loginMethod === 'email' ? '电子邮箱地址' : '手机号码 (+86)'}
              </label>
              <div className="relative">
                {loginMethod === 'email' ? (
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                ) : (
                  <Smartphone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
                )}
                <input
                  type={loginMethod === 'email' ? 'email' : 'tel'}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={loginMethod === 'email' ? 'name@example.com' : '138 0000 0000'}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-surface border border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-blue"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px]">
                <label className="font-semibold text-text-tertiary">6 位数字验证码</label>
                <button type="button" className="text-accent-blue hover:underline">
                  发送验证码
                </button>
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                maxLength={6}
                className="w-full px-3 py-2 text-center text-sm font-mono tracking-widest bg-surface border border-border-default rounded-xl text-text-primary focus:outline-none focus:border-accent-blue"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl text-xs font-bold hover:bg-accent-hover transition-colors shadow-md flex items-center justify-center gap-1.5"
            >
              <span>立即登录</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Social Logins */}
          <div className="pt-2 border-t border-border-subtle space-y-3">
            <div className="text-[10px] font-semibold text-text-tertiary text-center uppercase tracking-wider">
              或者使用第三方授权登录
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-medium">
              <button
                onClick={() => navigate('/cc-agent/new')}
                className="py-2 px-3 bg-surface hover:bg-surface-hover border border-border-default rounded-xl text-text-primary transition-colors flex items-center justify-center gap-2"
              >
                <span> Apple</span>
              </button>
              <button
                onClick={() => navigate('/cc-agent/new')}
                className="py-2 px-3 bg-surface hover:bg-surface-hover border border-border-default rounded-xl text-text-primary transition-colors flex items-center justify-center gap-2"
              >
                <span>G Google</span>
              </button>
            </div>
          </div>
        </div>

        {/* Guest Skip */}
        <button
          onClick={() => navigate('/cc-agent/new')}
          className="text-xs text-text-tertiary hover:text-text-primary transition-colors"
        >
          暂不登录，以访客模式体验 →
        </button>
      </div>
    </div>
  );
}
