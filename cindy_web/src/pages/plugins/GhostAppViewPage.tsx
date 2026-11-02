import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, RefreshCw, ExternalLink } from 'lucide-react';
import { MOCK_PLUGINS } from '@/mock/plugins';

export function GhostAppViewPage() {
  const { ghostId } = useParams();
  const navigate = useNavigate();
  const plugin = MOCK_PLUGINS.find((p) => p.id === ghostId) || MOCK_PLUGINS[1];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface">
      {/* 1. App Webview Top Bar */}
      <div className="h-12 px-4 border-b border-border-default bg-surface-elevated flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/plugins')}
            className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg">{plugin.icon}</span>
            <span className="text-xs font-bold text-text-primary">{plugin.name}</span>
            <span className="text-[10px] bg-surface-chip text-text-tertiary px-1.5 py-0.2 rounded font-mono">
              MCP App Surface
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            title="刷新页面"
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Embedded Web Content Placeholder */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-surface/50">
        <div className="w-16 h-16 rounded-2xl bg-surface-elevated border border-border-default shadow-md flex items-center justify-center text-3xl mb-4">
          {plugin.icon}
        </div>
        <h2 className="text-base font-bold text-text-primary mb-1">
          {plugin.name} 独立交互界面
        </h2>
        <p className="text-xs text-text-secondary max-w-sm leading-relaxed mb-6">
          此视图是由插件通过 MCP Apps 协议与 Ghost 沙箱声明的宿主交互页面，支持双向事件互通。
        </p>

        <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl max-w-md w-full text-left space-y-2 text-xs">
          <div className="text-[11px] font-semibold text-text-tertiary uppercase">
            沙箱连接状态
          </div>
          <div className="flex items-center justify-between font-mono text-text-primary">
            <span>Runtime RPC</span>
            <span className="text-accent-green">CONNECTED</span>
          </div>
          <div className="flex items-center justify-between font-mono text-text-primary">
            <span>Call Channel</span>
            <span className="text-accent-blue">cindy.fs / cindy.fetch</span>
          </div>
        </div>
      </div>
    </div>
  );
}
