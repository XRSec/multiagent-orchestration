import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderTree,
  FileCode,
  ChevronRight,
  ChevronDown,
  Copy,
  ExternalLink,
  Sparkles,
  GitCommit,
  Check,
  PanelRightClose,
  PanelRightOpen,
  ArrowUp,
  Folder,
  Layers,
  FileText,
  RefreshCw,
  Search,
  Database,
  HardDrive
} from 'lucide-react';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  gitStatus?: 'modified' | 'added' | 'untracked';
  size?: number;
  extension?: string;
  language?: string;
  content?: string;
}

interface WorkspaceStats {
  totalFiles: number;
  totalDirs: number;
  categoryCounts: Record<string, number>;
  gitBranch: string;
}

interface CoreDirectory {
  name: string;
  description: string;
  path: string;
}

export function WorkdirBrowsePage() {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [contentLoading, setContentLoading] = useState<boolean>(false);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'src': true,
    'src/web': true,
    'Bots': true,
    'groups': true,
    'Customizations': false
  });
  const [copied, setCopied] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const [railPrompt, setRailPrompt] = useState('');
  const [railMessages, setRailMessages] = useState([
    {
      role: 'assistant',
      text: '欢迎查看多智能体编排系统工作区代码。选择左侧文件可实时浏览，并在此向助手提问代码细节。',
    },
  ]);

  const [workspaceStats, setWorkspaceStats] = useState<WorkspaceStats | null>(null);
  const [coreDirectories, setCoreDirectories] = useState<CoreDirectory[]>([]);
  const [projectRoot, setProjectRoot] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [searchFilter, setSearchFilter] = useState<string>('');

  // 1. Fetch workspace overview & file tree
  const loadWorkspaceData = useCallback(async () => {
    try {
      setLoading(true);
      const [overviewRes, treeRes] = await Promise.all([
        fetch('/api/workspace/overview'),
        fetch('/api/workspace/tree?depth=4')
      ]);

      const overviewData = await overviewRes.json();
      const treeData = await treeRes.json();

      if (overviewData.ok) {
        setProjectRoot(overviewData.projectRoot);
        setWorkspaceStats(overviewData.stats);
        setCoreDirectories(overviewData.coreDirectories || []);
      }

      if (treeData.ok && Array.isArray(treeData.tree)) {
        setTree(treeData.tree);
        // Default select first file if available
        const findFirstFile = (nodes: FileNode[]): FileNode | null => {
          for (const node of nodes) {
            if (node.type === 'file') return node;
            if (node.children) {
              const f = findFirstFile(node.children);
              if (f) return f;
            }
          }
          return null;
        };
        const first = findFirstFile(treeData.tree);
        if (first) {
          setSelectedFile(first);
        }
      }
    } catch (e) {
      console.warn('Failed to load workspace data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaceData();
  }, [loadWorkspaceData]);

  // 2. Fetch selected file content
  useEffect(() => {
    if (!selectedFile || selectedFile.type !== 'file') return;
    let isCancelled = false;

    async function loadContent() {
      try {
        setContentLoading(true);
        const res = await fetch(`/api/workspaces/file?path=${encodeURIComponent(selectedFile!.path)}`);
        const data = await res.json();
        if (!isCancelled && data.ok) {
          setFileContent(data.content || '');
        }
      } catch {
        if (!isCancelled) setFileContent('// 读取文件失败或文件不存在');
      } finally {
        if (!isCancelled) setContentLoading(false);
      }
    }

    loadContent();
    return () => {
      isCancelled = true;
    };
  }, [selectedFile]);

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const handleCopy = () => {
    if (fileContent) {
      navigator.clipboard.writeText(fileContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleRailSend = () => {
    if (!railPrompt.trim() || !selectedFile) return;
    setRailMessages((prev) => [
      ...prev,
      { role: 'user', text: railPrompt },
      {
        role: 'assistant',
        text: `已收到针对 \`${selectedFile.name}\` 的提问：“${railPrompt}”。根据系统规范，该模块作为核心工程组件，保持严格的边界隔离与架构纯净度。`,
      },
    ]);
    setRailPrompt('');
  };

  const fileLines = fileContent.split('\n');

  // Filter tree recursively
  const filterTree = (nodes: FileNode[]): FileNode[] => {
    if (!searchFilter.trim()) return nodes;
    const q = searchFilter.toLowerCase();
    const result: FileNode[] = [];

    for (const node of nodes) {
      if (node.type === 'file') {
        if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
          result.push(node);
        }
      } else if (node.type === 'directory' && node.children) {
        const filteredChildren = filterTree(node.children);
        if (filteredChildren.length > 0 || node.name.toLowerCase().includes(q)) {
          result.push({ ...node, children: filteredChildren });
        }
      }
    }
    return result;
  };

  const visibleTree = filterTree(tree);

  // Render tree node recursive component
  const renderNode = (node: FileNode, level = 0) => {
    const isExpanded = expandedFolders[node.path];
    const isSelected = selectedFile?.id === node.id;

    if (node.type === 'directory') {
      return (
        <div key={node.id} className="select-none">
          <div
            onClick={() => toggleFolder(node.path)}
            style={{ paddingLeft: `${Math.max(level * 10, 6)}px` }}
            className="flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-surface-hover cursor-pointer text-text-primary text-xs transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
            )}
            <Folder className="w-3.5 h-3.5 text-accent-amber shrink-0 fill-accent-amber/20" />
            <span className="font-medium truncate">{node.name}</span>
          </div>

          {isExpanded && node.children && (
            <div className="space-y-0.5 border-l border-border-subtle ml-2.5 mt-0.5">
              {node.children.map((child) => renderNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        onClick={() => setSelectedFile(node)}
        style={{ paddingLeft: `${Math.max(level * 10, 8)}px` }}
        className={`flex items-center gap-1.5 py-1 px-2 rounded-lg cursor-pointer text-xs transition-colors ${
          isSelected
            ? 'bg-accent-blue/10 text-accent-blue font-semibold border-l-2 border-accent-blue'
            : 'hover:bg-surface-hover text-text-secondary'
        }`}
      >
        <FileCode className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
        <span className="truncate">{node.name}</span>
        {node.size ? (
          <span className="ml-auto text-[9px] font-mono text-text-tertiary">
            {(node.size / 1024).toFixed(0)}k
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface">
      {/* 0. Top: Workspace KPI Summary Banner */}
      <div className="px-4 py-2.5 border-b border-border-default bg-surface-elevated/60 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-text-primary font-bold">
            <HardDrive className="w-4 h-4 text-accent-blue" />
            <span>工作区目录大盘</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px] text-text-tertiary bg-surface-chip px-2 py-0.5 rounded-md border border-border-default">
            <span>路径:</span>
            <span className="text-text-primary truncate max-w-xs">{projectRoot || '/Users/xr/IDEA.localized/multiagent-orchestration'}</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[11px] text-accent-green bg-accent-green/10 px-2 py-0.5 rounded-md border border-accent-green/20">
            <GitCommit className="w-3 h-3" />
            <span>Git: {workspaceStats?.gitBranch || 'main'}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {workspaceStats && (
            <div className="flex items-center gap-2 text-[11px] text-text-secondary font-mono">
              <span>文件: <strong className="text-text-primary">{workspaceStats.totalFiles}</strong></span>
              <span>目录: <strong className="text-text-primary">{workspaceStats.totalDirs}</strong></span>
              {workspaceStats.categoryCounts && (
                <div className="hidden md:flex items-center gap-1.5 ml-2">
                  <span className="px-1.5 py-0.2 bg-blue-500/10 text-blue-500 rounded text-[10px]">TS/TSX: {workspaceStats.categoryCounts['ts/tsx'] || 0}</span>
                  <span className="px-1.5 py-0.2 bg-amber-500/10 text-amber-500 rounded text-[10px]">JSON: {workspaceStats.categoryCounts['json'] || 0}</span>
                  <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-500 rounded text-[10px]">MD: {workspaceStats.categoryCounts['md'] || 0}</span>
                </div>
              )}
            </div>
          )}
          <button
            onClick={loadWorkspaceData}
            title="刷新文件树"
            className="p-1 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* 1. Left: File Tree View */}
        <div className="w-64 border-r border-border-default bg-surface-elevated/30 flex flex-col h-full shrink-0">
          <div className="p-2 border-b border-border-default">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-surface rounded-lg border border-border-default text-xs">
              <Search className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="搜索文件或目录..."
                className="w-full bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 text-xs">
            {loading && tree.length === 0 ? (
              <div className="p-4 text-center text-text-tertiary text-xs">扫描工作区文件树中...</div>
            ) : visibleTree.length === 0 ? (
              <div className="p-4 text-center text-text-tertiary text-xs">无匹配文件</div>
            ) : (
              visibleTree.map((node) => renderNode(node))
            )}
          </div>

          {/* Quick jump to core dirs */}
          {coreDirectories.length > 0 && (
            <div className="p-2 border-t border-border-default bg-surface-chip/50">
              <div className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider mb-1 px-1">
                核心目录导览
              </div>
              <div className="space-y-0.5">
                {coreDirectories.slice(0, 5).map((cd) => (
                  <div
                    key={cd.name}
                    onClick={() => {
                      setExpandedFolders((prev) => ({ ...prev, [cd.name]: true }));
                    }}
                    className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-surface-hover cursor-pointer text-[11px] text-text-secondary"
                  >
                    <span className="font-mono text-accent-blue truncate">{cd.name}</span>
                    <span className="text-[10px] text-text-tertiary truncate max-w-[100px] text-right">{cd.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Center: File Body View (Editor + Line Numbers) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
          {/* Editor Top Bar */}
          <div className="h-10 px-4 border-b border-border-default flex items-center justify-between text-xs text-text-secondary bg-surface-elevated/40 shrink-0">
            <div className="flex items-center gap-2 font-mono truncate">
              <span className="text-text-tertiary">{projectRoot.split('/').pop() || 'multiagent-orchestration'}</span>
              <span className="text-text-tertiary">/</span>
              <span className="font-semibold text-text-primary">{selectedFile?.path || '未选择文件'}</span>
              {selectedFile && (
                <span className="text-text-tertiary text-[10px]">
                  ({fileLines.length} 行)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopy}
                disabled={!fileContent}
                title="复制代码内容"
                className="p-1 px-2 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1 text-[11px] border border-border-default"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已复制' : '复制'}</span>
              </button>

              <button
                onClick={() => setRailOpen(!railOpen)}
                title={railOpen ? '收起伴读助手' : '展开伴读助手'}
                className="p-1 px-2 rounded-md hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors flex items-center gap-1 text-[11px] border border-border-default"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-purple" />
                <span>{railOpen ? '收起助手' : '伴读助手'}</span>
              </button>
            </div>
          </div>

          {/* Code Content With Clean Line Numbers */}
          <div className="flex-1 overflow-auto flex font-mono text-xs text-text-primary bg-surface/50 select-text">
            {contentLoading ? (
              <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs">
                正在载入文件内容...
              </div>
            ) : !selectedFile ? (
              <div className="flex-1 flex items-center justify-center text-text-tertiary text-xs">
                从左侧选择文件即可实时浏览源代码
              </div>
            ) : (
              <>
                {/* Line Numbers */}
                <div className="w-12 py-3 select-none text-right pr-3 text-text-tertiary border-r border-border-subtle bg-surface/80 shrink-0">
                  {fileLines.map((_, i) => (
                    <div key={i} className="leading-relaxed text-[11px]">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Code text */}
                <pre className="flex-1 p-3 overflow-x-auto leading-relaxed text-[12px]">
                  {fileContent || '// 空文件'}
                </pre>
              </>
            )}
          </div>
        </div>

        {/* 3. Right: Chat Rail */}
        {railOpen && (
          <div className="w-80 border-l border-border-default bg-surface-elevated/40 flex flex-col h-full shrink-0">
            <div className="h-10 px-3 border-b border-border-default flex items-center justify-between text-xs font-semibold text-text-primary shrink-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent-purple" />
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
                  placeholder={selectedFile ? `针对 ${selectedFile.name} 提问...` : '提问...'}
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
    </div>
  );
}
