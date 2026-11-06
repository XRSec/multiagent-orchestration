/**
 * Purpose: Collapsible section displaying configured MCP servers with status and toggle switches.
 * Context: Installed tab view of SkillhubLocalPage.
 * Usage: Rendered inside the installed tab of SkillhubLocalPage.
 * Prerequisites: React, lucide-react, MCP server mock definitions.
 */

import React from 'react';
import { ChevronDown, Copy, Check } from 'lucide-react';
import { MOCK_MCP_SERVERS } from '@/mock/skills';

export interface InstalledMcpSectionProps {
  mcpServers: typeof MOCK_MCP_SERVERS;
  mcpEnabled: Record<string, boolean>;
  mcpCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleMcp: (id: string, e: React.MouseEvent) => void;
  copiedMcpPath: boolean;
  onCopyMcpConfigPath: () => void;
  copiedServerId: string | null;
  onCopyServerPath: (id: string, path: string) => void;
}

export function InstalledMcpSection({
  mcpServers,
  mcpEnabled,
  mcpCollapsed,
  onToggleCollapse,
  onToggleMcp,
  copiedMcpPath,
  onCopyMcpConfigPath,
  copiedServerId,
  onCopyServerPath,
}: InstalledMcpSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm font-bold text-text-primary hover:text-text-secondary transition-colors cursor-pointer"
        >
          <span>MCP Servers</span>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
            {mcpServers.length}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              mcpCollapsed ? '-rotate-90' : ''
            }`}
          />
        </button>

        <div className="flex items-center gap-2">
          {/* Copy MCP Config Path (用户要求：mcp servers 的复制是复制 path) */}
          <button
            type="button"
            onClick={onCopyMcpConfigPath}
            title="复制 MCP 配置文件路径 (~/.gemini/antigravity/mcp_config.json)"
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-lg hover:bg-surface-hover transition-colors font-medium border border-border-subtle cursor-pointer"
          >
            {copiedMcpPath ? (
              <>
                <Check className="w-3.5 h-3.5 text-accent-green" />
                <span className="text-accent-green">已复制配置路径</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-text-tertiary" />
                <span>复制配置路径</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!mcpCollapsed && (
        <div className="space-y-1.5">
          {mcpServers.map((server) => {
            const isMcpOn = mcpEnabled[server.id] !== false;
            return (
              <div
                key={server.id}
                className={`flex items-center justify-between text-xs text-text-secondary py-1 px-1 font-mono hover:bg-surface-hover/50 rounded-lg group transition-all ${
                  !isMcpOn ? 'opacity-55' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[13px] font-bold ${
                      !isMcpOn ? 'text-text-tertiary line-through' : 'text-text-primary'
                    }`}
                  >
                    {server.name}
                  </span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      isMcpOn ? 'bg-accent-green' : 'bg-text-disabled'
                    }`}
                  />
                  <span className="text-text-tertiary">›</span>
                  <span className="text-text-tertiary font-sans text-xs">
                    {isMcpOn ? `${server.toolsCount} tools enabled` : 'Disabled (已停用)'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Server Specific Path Copy Button */}
                  {server.configPath && (
                    <button
                      type="button"
                      onClick={() => onCopyServerPath(server.id, server.configPath!)}
                      title={`复制此服务路径: ${server.configPath}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-surface-hover text-text-tertiary hover:text-text-primary flex items-center gap-1 text-[10px] cursor-pointer"
                    >
                      {copiedServerId === server.id ? (
                        <>
                          <Check className="w-3 h-3 text-accent-green" />
                          <span className="text-accent-green">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>复制路径</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* MCP Toggle Switch */}
                  <button
                    type="button"
                    onClick={(e) => onToggleMcp(server.id, e)}
                    className={`w-8 h-4.5 rounded-full p-0.5 transition-colors flex items-center shrink-0 cursor-pointer ${
                      isMcpOn
                        ? 'bg-[#3B82F6]'
                        : 'bg-surface-chip border border-border-default'
                    }`}
                    title={isMcpOn ? '已启用 (点击关闭)' : '已关闭 (点击开启)'}
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded-full bg-white transition-transform shadow-xs ${
                        isMcpOn ? 'translate-x-3.5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
