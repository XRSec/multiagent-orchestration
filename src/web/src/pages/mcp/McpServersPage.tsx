import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  RotateCcw,
  Ban,
  Trash2,
  Check,
  Server,
  Layers,
  Wrench,
  Bot,
} from 'lucide-react';
import { MOCK_MCP_SERVERS, MOCK_CUSTOM_AGENTS, McpServerConfig } from '@/mock/mcp';

export function McpServersPage() {
  const [customAgentsCollapsed, setCustomAgentsCollapsed] = useState(false);
  const [mcpServersCollapsed, setMcpServersCollapsed] = useState(false);

  const [servers, setServers] = useState<McpServerConfig[]>(MOCK_MCP_SERVERS);
  const [collapsedServers, setCollapsedServers] = useState<Record<string, boolean>>({});
  const [activeMenuServerId, setActiveMenuServerId] = useState<string | null>('cua-driver');
  const [copiedConfig, setCopiedConfig] = useState(false);

  const toggleServerCollapse = (id: string) => {
    setCollapsedServers((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyConfig = () => {
    const config = {
      mcpServers: {
        'cua-driver': {
          command: 'node',
          args: ['/Users/xr/.agents/mcp/cua-driver/index.js'],
        },
        'pi-web-access': {
          command: 'node',
          args: ['/Users/xr/.agents/mcp/pi-web-access/index.js'],
        },
      },
    };
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 1500);
  };

  const handleRestart = (id: string) => {
    setActiveMenuServerId(null);
  };

  const handleToggleDisable = (id: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, status: s.status === 'connected' ? 'disabled' : 'connected' }
          : s
      )
    );
    setActiveMenuServerId(null);
  };

  const handleDelete = (id: string) => {
    setServers((prev) => prev.filter((s) => s.id !== id));
    setActiveMenuServerId(null);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto select-none bg-surface p-8 max-w-5xl mx-auto space-y-8">
      {/* ========================================================= */}
      {/* SECTION 1: Custom Agents                                  */}
      {/* ========================================================= */}
      <div className="space-y-3">
        <div
          onClick={() => setCustomAgentsCollapsed(!customAgentsCollapsed)}
          className="flex items-center gap-2 cursor-pointer group"
        >
          <h2 className="text-base font-bold text-text-primary tracking-tight">
            Custom Agents
          </h2>
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
            {MOCK_CUSTOM_AGENTS.length}
          </span>
          <ChevronDown
            className={`w-4 h-4 text-text-tertiary transition-transform ${
              customAgentsCollapsed ? '-rotate-90' : ''
            }`}
          />
        </div>

        {!customAgentsCollapsed && (
          <div className="text-xs text-text-tertiary pt-1">
            No custom agents yet.
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* SECTION 2: MCP Servers                                    */}
      {/* ========================================================= */}
      <div className="space-y-4">
        {/* Section Header */}
        <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
          <div
            onClick={() => setMcpServersCollapsed(!mcpServersCollapsed)}
            className="flex items-center gap-2 cursor-pointer group"
          >
            <h2 className="text-base font-bold text-text-primary tracking-tight">
              MCP Servers
            </h2>
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-surface-chip text-text-tertiary text-xs font-mono font-medium flex items-center justify-center">
              {servers.length}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-text-tertiary transition-transform ${
                mcpServersCollapsed ? '-rotate-90' : ''
              }`}
            />
          </div>

          <div className="flex items-center gap-1.5 text-text-tertiary">
            <button
              onClick={handleCopyConfig}
              title="复制完整 MCP 配置 JSON"
              className="p-1 rounded hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              {copiedConfig ? <Check className="w-4 h-4 text-accent-green" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              title="添加新 MCP 服务"
              className="p-1 rounded hover:bg-surface-hover hover:text-text-primary transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!mcpServersCollapsed && (
          <div className="space-y-6">
            {servers.map((server) => {
              const isCollapsed = collapsedServers[server.id];
              const menuOpen = activeMenuServerId === server.id;

              return (
                <div key={server.id} className="space-y-3 relative">
                  {/* Server Row Header */}
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => toggleServerCollapse(server.id)}
                      className="flex items-center gap-2 cursor-pointer group"
                    >
                      <span className="text-sm font-bold text-text-primary font-mono tracking-tight">
                        {server.name}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          server.status === 'connected' ? 'bg-accent-green' : 'bg-text-tertiary'
                        }`}
                      />
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
                          isCollapsed ? '-rotate-90' : ''
                        }`}
                      />
                      <span className="text-xs text-text-tertiary ml-1">
                        {server.tools.length} tools enabled
                      </span>
                    </div>

                    <button
                      onClick={() => setActiveMenuServerId(menuOpen ? null : server.id)}
                      className="text-text-tertiary hover:text-text-primary p-1 rounded hover:bg-surface-hover text-xs font-mono"
                    >
                      ···
                    </button>
                  </div>

                  {/* Context Menu Dropdown */}
                  {menuOpen && (
                    <div className="absolute right-0 top-6 w-36 bg-surface-elevated border border-border-default rounded-xl shadow-2xl p-1 z-30 text-xs">
                      <button
                        onClick={() => handleRestart(server.id)}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-text-primary flex items-center gap-2 text-left"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-text-secondary" />
                        <span>Restart</span>
                      </button>
                      <button
                        onClick={() => handleToggleDisable(server.id)}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-text-primary flex items-center gap-2 text-left"
                      >
                        <Ban className="w-3.5 h-3.5 text-text-secondary" />
                        <span>{server.status === 'connected' ? 'Disable' : 'Enable'}</span>
                      </button>
                      <button
                        onClick={() => handleDelete(server.id)}
                        className="w-full px-2.5 py-1.5 rounded-lg hover:bg-surface-hover text-accent-red flex items-center gap-2 text-left"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}

                  {/* Tool Badges / Pills */}
                  {!isCollapsed && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {server.tools.map((tool, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 bg-surface-elevated hover:bg-surface-hover border border-border-default rounded-full text-[11px] font-mono text-text-secondary hover:text-text-primary transition-colors cursor-default shadow-xs"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
