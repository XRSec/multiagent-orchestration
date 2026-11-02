import React, { useState } from 'react';
import {
  FolderTree,
  FileCode,
  ChevronRight,
  ChevronDown,
  Copy,
  ExternalLink,
  MessageSquare,
  Sparkles,
  GitCommit,
  Check,
  PanelRightClose,
  PanelRightOpen,
  Send,
  ArrowUp,
  Folder,
} from 'lucide-react';
import { MOCK_FILE_TREE, FileNode } from '@/mock/files';

export function WorkdirBrowsePage() {
  const [selectedFile, setSelectedFile] = useState<FileNode>(
    MOCK_FILE_TREE[0].children![0] // router.tsx
  );
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'src': true,
    'src/components': false,
  });
  const [copied, setCopied] = useState(false);
  const [railOpen, setRailOpen] = useState(true);
  const [railPrompt, setRailPrompt] = useState('');
  const [railMessages, setRailMessages] = useState([
    {
      role: 'assistant',
      text: '正在浏览 `src/router.tsx`。该文件定义了三层路由树，你可以让我解释路由守卫逻辑或进行改写。',
    },
  ]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCopy = () => {
    if (selectedFile.content) {
      navigator.clipboard.writeText(selectedFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleRailSend = () => {
    if (!railPrompt.trim()) return;
    setRailMessages((prev) => [
      ...prev,
      { role: 'user', text: railPrompt },
      {
        role: 'assistant',
        text: `已收到关于 \`${selectedFile.name}\` 的指令，正在分析该模块相关依赖与改动方案...`,
      },
    ]);
    setRailPrompt('');
  };

  const fileLines = (selectedFile.content || '').split('\n');

  return (
    <div className="flex-1 flex h-full overflow-hidden select-none bg-surface">
      {/* 1. Left: File Tree View */}
      <div className="w-60 border-r border-border-default bg-surface-elevated/40 flex flex-col h-full shrink-0">
        <div className="h-10 px-3 border-b border-border-default flex items-center justify-between text-xs font-semibold text-text-tertiary uppercase tracking-wider">
          <span>文件资源管理器</span>
          <span className="text-[10px] text-accent-green font-mono">Git: main</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
          {MOCK_FILE_TREE.map((node) => (
            <div key={node.id}>
              {node.type === 'directory' ? (
                <div>
                  <div
                    onClick={() => toggleFolder(node.path)}
                    className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg hover:bg-surface-hover cursor-pointer text-text-primary"
                  >
                    {expandedFolders[node.path] ? (
                      <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                    )}
                    <FolderTree className="w-3.5 h-3.5 text-accent-amber" />
                    <span className="font-medium truncate">{node.name}</span>
                  </div>

                  {expandedFolders[node.path] && node.children && (
                    <div className="pl-4 space-y-0.5 border-l border-border-subtle ml-3 mt-0.5">
                      {node.children.map((child) => (
                        <div
                          key={child.id}
                          onClick={() => child.type === 'file' && setSelectedFile(child)}
                          className={`flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer transition-colors ${
                            selectedFile.id === child.id
                              ? 'bg-surface-chip text-text-primary font-semibold'
                              : 'hover:bg-surface-hover text-text-secondary'
                          }`}
                        >
                          <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                          <span className="truncate">{child.name}</span>
                          {child.gitStatus && (
                            <span className="ml-auto text-[10px] font-mono text-accent-green">
                              {child.gitStatus === 'modified' ? 'M' : '?'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  onClick={() => setSelectedFile(node)}
                  className={`flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer transition-colors ${
                    selectedFile.id === node.id
                      ? 'bg-surface-chip text-text-primary font-semibold'
                      : 'hover:bg-surface-hover text-text-secondary'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                  <span className="truncate">{node.name}</span>
                  {node.gitStatus && (
                    <span className="ml-auto text-[10px] font-mono text-accent-green">
                      {node.gitStatus === 'modified' ? 'M' : '?'}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 2. Center: File Body View (Editor + Line Numbers) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
        {/* Editor Top Bar */}
        <div className="h-10 px-4 border-b border-border-default flex items-center justify-between text-xs text-text-secondary bg-surface-elevated/30 shrink-0">
          <div className="flex items-center gap-2 font-mono">
            <span>/Users/xr/IDEA.localized/cindy</span>
            <span>/</span>
            <span className="font-semibold text-text-primary">{selectedFile.path}</span>
            {selectedFile.gitStatus && (
              <span className="text-[10px] bg-accent-green/10 text-accent-green px-1.5 py-0.2 rounded">
                Modified
              </span>
            )}
            <span className="text-text-tertiary text-[10px]">
              ({fileLines.length} 行)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              title="复制代码内容"
              className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1 text-[11px]"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? '已复制' : '复制'}</span>
            </button>

            <button
              onClick={() => setRailOpen(!railOpen)}
              title={railOpen ? '收起会话副轨' : '展开会话副轨'}
              className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
            >
              {railOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Code Content With Clean Line Numbers */}
        <div className="flex-1 overflow-auto flex font-mono text-xs text-text-primary bg-surface/50 select-text">
          {/* Line Numbers */}
          <div className="w-12 py-4 select-none text-right pr-3 text-text-tertiary border-r border-border-subtle bg-surface/80">
            {fileLines.map((_, i) => (
              <div key={i} className="leading-relaxed">
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code text */}
          <pre className="flex-1 p-4 overflow-x-auto leading-relaxed text-[12px]">
            {selectedFile.content || '// 此文件暂无预览内容'}
          </pre>
        </div>
      </div>

      {/* 3. Right: Official CCAgentSessionView Chat Rail */}
      {railOpen && (
        <div className="w-80 border-l border-border-default bg-surface-elevated/40 flex flex-col h-full shrink-0">
          <div className="h-10 px-3 border-b border-border-default flex items-center justify-between text-xs font-semibold text-text-primary shrink-0">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent-blue" />
              <span>代码伴读助手 (Chat Rail)</span>
            </div>
            <button
              onClick={() => setRailOpen(false)}
              className="p-1 rounded hover:bg-surface-hover text-text-tertiary"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
            {railMessages.map((m, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-xl text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-accent-cta text-accent-cta-fg ml-4 rounded-tr-sm'
                    : 'bg-surface border border-border-default text-text-primary mr-4 rounded-tl-sm'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>

          <div className="p-2.5 border-t border-border-default bg-surface shrink-0">
            <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-default rounded-xl px-2 py-1.5">
              <input
                type="text"
                value={railPrompt}
                onChange={(e) => setRailPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRailSend()}
                placeholder="针对当前选中的文件提问..."
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <button
                onClick={handleRailSend}
                disabled={!railPrompt.trim()}
                className="p-1 rounded-lg bg-accent-cta text-accent-cta-fg hover:bg-accent-hover disabled:opacity-40"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
