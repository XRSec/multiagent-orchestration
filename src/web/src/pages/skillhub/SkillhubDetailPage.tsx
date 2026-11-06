import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  MoreHorizontal,
  Edit2,
  Upload,
  Globe,
  FileText,
  Folder,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  Minus,
  Maximize2,
  Copy,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { MOCK_SKILLS, SkillItem } from '@/mock/skills';
import { useToast } from '@/contexts/ToastContext';

export function SkillhubDetailPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const skillId = searchParams.get('id') || 'skill-creator-helper';

  const [skill, setSkill] = useState<SkillItem>(() => {
    return (
      MOCK_SKILLS.find((s) => s.id === skillId || s.name === skillId) ||
      MOCK_SKILLS[0]
    );
  });

  useEffect(() => {
    async function loadSkillDetail() {
      try {
        const res = await fetch(`/api/skills/${encodeURIComponent(skillId)}`);
        const data = await res.json();
        if (data.ok && data.skill) {
          setSkill({
            id: data.skill.id,
            name: data.skill.name,
            description: data.skill.description,
            scope: data.skill.scope === 'global' ? 'global' : 'builtin',
            promptSnippet: data.skill.content,
            sourcePath: data.skill.path,
            version: data.skill.version || '1.0.0',
            author: data.skill.author || 'Mo'
          });
        }
      } catch {}
    }
    loadSkillDetail();
  }, [skillId]);

  // Selected file in the left file tree
  const [selectedFile, setSelectedFile] = useState<string>('SKILL.md');
  const [agentsFolderExpanded, setAgentsFolderExpanded] = useState(false);

  // Skill enabled toggle switch
  const [isEnabled, setIsEnabled] = useState(true);

  // Edit mode toggle
  const [isEditing, setIsEditing] = useState(false);

  // Copied feedback
  const [copiedSuccess, setCopiedSuccess] = useState(false);

  // Detailed mock files for cua-driver matching the screenshot
  const fileTree = [
    { type: 'file', name: 'SKILL.md' },
    { type: 'dir', name: 'agents/', isDir: true },
    { type: 'file', name: 'BROWSER.md' },
    { type: 'file', name: 'EMBEDDING.md' },
    { type: 'file', name: 'MACOS.md' },
    { type: 'file', name: 'README.md' },
    { type: 'file', name: 'RECORDING.md' },
  ];

  const handleCopyCmd = () => {
    navigator.clipboard.writeText(`/${skill.name}`);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 1500);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface text-text-primary">
      {/* ======================================================== */}
      {/* 1. Web Page Header & Navigation Controls                */}
      {/* ======================================================== */}
      <div className="h-10 px-4 border-b border-border-default flex items-center justify-between bg-surface shrink-0 select-none">
        <div className="flex items-center gap-3">
          {/* Navigation action controls */}
          <div className="flex items-center gap-2 text-text-tertiary">
            <button
              onClick={() => navigate('/skillhub')}
              title="返回技能列表"
              className="p-1 rounded hover:bg-surface-hover hover:text-text-primary transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              title="前进"
              className="p-1 rounded opacity-40 cursor-not-allowed text-text-tertiary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="text-xs text-text-tertiary font-mono">
          Skillhub / {skill.name}
        </div>
      </div>

      {/* ======================================================== */}
      {/* 2. Top Header (1:1 还原截图顶栏)                        */}
      {/* ======================================================== */}
      <header className="px-6 py-4 border-b border-border-default bg-surface flex items-start justify-between shrink-0">
        <div className="flex items-start gap-4">
          {/* Round Circle Back Button */}
          <button
            onClick={() => navigate('/skillhub')}
            className="w-9 h-9 rounded-full bg-surface-elevated hover:bg-surface-hover border border-border-default flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors shrink-0 shadow-xs mt-0.5"
            title="返回技能中心"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="space-y-1">
            {/* Title + Badges Row */}
            <div className="flex items-center gap-2.5">
              <h1 className="text-lg font-bold text-text-primary tracking-tight">
                {skill.name}
              </h1>

              {/* Badges */}
              <span className="flex items-center gap-1 text-[11px] bg-surface-chip text-text-secondary px-2.5 py-0.5 rounded-full border border-border-subtle font-medium">
                <Globe className="w-3 h-3 text-text-tertiary" />
                <span>Skill</span>
              </span>

              <span className="flex items-center gap-1 text-[11px] bg-surface-chip text-text-secondary px-2.5 py-0.5 rounded-full border border-border-subtle font-medium">
                <Globe className="w-3 h-3 text-text-tertiary" />
                <span>全局</span>
              </span>

              <span className="text-[11px] bg-surface-chip text-text-secondary px-2.5 py-0.5 rounded-full border border-border-subtle font-medium">
                Claude
              </span>
            </div>

            {/* Path Subtitle */}
            <div className="text-xs text-text-tertiary font-mono">
              {skill.sourcePath || `/Users/xr/.config/magpie/library/skills/${skill.name}`}
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Blue Toggle Switch */}
          <button
            onClick={() => setIsEnabled(!isEnabled)}
            className={`w-11 h-6 rounded-full p-1 transition-colors flex items-center ${
              isEnabled ? 'bg-[#3B82F6]' : 'bg-surface-chip'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white transition-transform ${
                isEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>

          {/* More options button */}
          <button
            onClick={handleCopyCmd}
            title="更多操作"
            className="w-8 h-8 rounded-full border border-border-default hover:bg-surface-hover flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {/* Edit button */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-border-default hover:bg-surface-hover text-xs font-semibold text-text-primary transition-colors shadow-xs"
          >
            <Edit2 className="w-3.5 h-3.5 text-text-secondary" />
            <span>{isEditing ? '预览' : '编辑'}</span>
          </button>

          {/* Publish to market CTA button */}
          <button
            onClick={() => showToast('准备发布该技能至公共市场...', 'info')}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#2E3033] hover:bg-[#3C3F43] text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>发布到市场</span>
          </button>
        </div>
      </header>

      {/* Sub-badge Row (本地 pill) */}
      <div className="px-6 py-2 border-b border-border-subtle bg-surface flex items-center">
        <span className="px-3 py-1 bg-surface-chip text-text-secondary rounded-lg text-xs font-medium">
          本地
        </span>
      </div>

      {/* ======================================================== */}
      {/* 3. Main Two-Column Layout (Left Sidebar + Right Content)  */}
      {/* ======================================================== */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* ====================================================== */}
        {/* LEFT SIDEBAR: 文件 (Files) + 用量 (Usage)              */}
        {/* ====================================================== */}
        <aside className="w-64 border-r border-border-default bg-surface p-4 space-y-6 overflow-y-auto shrink-0 text-xs">
          {/* SECTION: 文件 */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-text-tertiary">文件</div>
            <div className="space-y-0.5">
              {fileTree.map((f) => (
                <div
                  key={f.name}
                  onClick={() => {
                    if (f.isDir) setAgentsFolderExpanded(!agentsFolderExpanded);
                    else setSelectedFile(f.name);
                  }}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                    selectedFile === f.name
                      ? 'bg-surface-chip text-text-primary font-semibold'
                      : 'hover:bg-surface-hover text-text-secondary'
                  }`}
                >
                  {f.isDir ? (
                    <>
                      <ChevronRight
                        className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
                          agentsFolderExpanded ? 'rotate-90' : ''
                        }`}
                      />
                      <Folder className="w-3.5 h-3.5 text-text-tertiary" />
                      <span className="font-mono text-xs">{f.name}</span>
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 text-text-tertiary shrink-0 ml-1" />
                      <span className="font-mono text-xs">{f.name}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* SECTION: 用量 */}
          <div className="space-y-3 pt-2 border-t border-border-subtle">
            <div className="text-[11px] font-semibold text-text-tertiary">用量</div>

            {/* Card 1: 当前版本使用 / 近 30 天使用 */}
            <div className="p-3 bg-surface-elevated border border-border-default rounded-xl grid grid-cols-2 gap-2 text-center shadow-xs">
              <div className="space-y-0.5">
                <div className="text-[10px] text-text-tertiary">当前版本使用</div>
                <div className="text-base font-bold text-text-primary">
                  0 <span className="text-xs font-normal text-text-tertiary">次</span>
                </div>
              </div>
              <div className="space-y-0.5 border-l border-border-subtle">
                <div className="text-[10px] text-text-tertiary">近 30 天使用</div>
                <div className="text-base font-bold text-text-primary">
                  2 <span className="text-xs font-normal text-text-tertiary">次</span>
                </div>
              </div>
            </div>

            {/* Card 2: 最近使用细节 */}
            <div className="p-3 bg-surface-elevated border border-border-default rounded-xl space-y-1.5 shadow-xs text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-text-tertiary">最近使用</span>
                <span className="font-mono text-text-primary text-[11px]">10/24 10:16</span>
              </div>
              <div className="text-[11px] text-text-secondary font-mono truncate">
                65.3 KB / 约 16,631 to...
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-border-subtle text-[11px]">
                <span className="text-text-tertiary">重复读取</span>
                <span className="font-mono text-text-primary">0%</span>
              </div>
            </div>

            {/* Diagnostic Button: 诊断这个 Skill */}
            <button
              onClick={() => showToast(`正在诊断技能 ${skill.name}，健康状态：正常`, 'success')}
              className="w-full py-2 bg-[#2E3033] hover:bg-[#3C3F43] text-white rounded-xl font-medium text-xs flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>诊断这个 Skill</span>
            </button>

            {/* Card 3: 近 30 天每日使用 Sparkline Chart */}
            <div className="p-3 bg-surface-elevated border border-border-default rounded-xl space-y-3 shadow-xs text-xs">
              <div className="text-[11px] text-text-tertiary font-medium">近 30 天每日使用</div>

              {/* Sparkline Histogram Graphic */}
              <div className="h-16 flex items-end justify-between px-1 border-b border-border-subtle pb-1">
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-12 bg-text-primary rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
                <div className="w-1.5 h-1 bg-surface-chip rounded-xs" />
              </div>
              <div className="flex justify-between text-[10px] text-text-tertiary font-mono">
                <span>10-04</span>
                <span>11-02</span>
              </div>

              {/* Metrics bottom row */}
              <div className="grid grid-cols-3 gap-1 pt-1 text-center text-[10px]">
                <div>
                  <div className="text-text-tertiary">近 7 天</div>
                  <div className="font-bold text-text-primary mt-0.5">0 次</div>
                </div>
                <div className="border-x border-border-subtle">
                  <div className="text-text-tertiary">最高日</div>
                  <div className="font-bold text-text-primary mt-0.5">2 次</div>
                </div>
                <div>
                  <div className="text-text-tertiary">活跃天数</div>
                  <div className="font-bold text-text-primary mt-0.5">1 天</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ====================================================== */}
        {/* RIGHT MAIN CONTENT: FRONTMATTER + PROSE MARKDOWN       */}
        {/* ====================================================== */}
        <main className="flex-1 overflow-y-auto p-8 select-text bg-surface">
          <div className="max-w-3xl space-y-6">
            {/* FRONTMATTER Block (1:1 还原截图顶部键值区) */}
            <div className="space-y-3 font-mono text-xs">
              <div className="text-[11px] font-bold text-text-tertiary tracking-wider uppercase font-sans">
                FRONTMATTER
              </div>

              <div className="space-y-3 bg-surface p-1">
                <div>
                  <span className="text-text-tertiary block text-[11px]">name</span>
                  <span className="text-text-primary font-bold text-sm">{skill.name}</span>
                </div>

                <div>
                  <span className="text-text-tertiary block text-[11px]">description</span>
                  <p className="text-text-primary leading-relaxed text-xs">
                    {skill.description}
                  </p>
                </div>

                <div>
                  <span className="text-text-tertiary block text-[11px]">disable-model-invocation</span>
                  <span className="text-text-primary">true</span>
                </div>

                <div>
                  <span className="text-text-tertiary block text-[11px]">user-invocable</span>
                  <span className="text-text-primary">true</span>
                </div>

                <div>
                  <span className="text-text-tertiary block text-[11px]">version</span>
                  <span className="text-text-primary">{skill.version || '0.22.1'}</span>
                </div>

                <div>
                  <span className="text-text-tertiary block text-[11px]">metadata</span>
                  <p className="text-text-secondary text-[11px] break-all leading-normal">
                    {`{"openclaw":{"requires":{"bins":["cua-driver"]},"envVars":[{"name":"CUA_DRIVER_EMBEDDED","required":false,"description":"Set to 1 when a macOS host app launches the driver in embedded mode."},{"name":"CUA_DRIVER_HOST_BUNDLE_ID","required":false,"description":"Bundle identifier of the macOS host app in embedded mode."},{"name":"CUA_DRIVER_PATH","required":false,"description":"Optional path to a cua-driver binary used by an embedding host."},{"name":"CUA_DRIVER_RS_ENABLE_WAYLAND","required":false,"description":"Set to 1 to enable the native Wayland backend."},{"name":"CUA_DRIVER_RS_MCP_HTTP_PORT","required":false,"description":"Optional port for the local MCP HTTP endpoint."},{"name":"CUA_DRIVER_RS_MCP_HTTP_TOKEN","required":false,"description":"Required host-generated bearer token when the local MCP HTTP endpoint is enabled."}],"homepage":"https://cua.ai/docs/cua-driver"}}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="h-px bg-border-default my-4" />

            {/* Markdown Body Content (1:1 还原截图下半段内容) */}
            <div className="space-y-4 text-xs text-text-primary leading-relaxed">
              <h2 className="text-lg font-bold text-text-primary tracking-tight">
                {skill.name}
              </h2>

              <p className="text-text-secondary leading-relaxed">
                Orchestrates cross-platform app automation via <code className="bg-surface-chip px-1.5 py-0.5 rounded font-mono text-[11px] text-text-primary border border-border-subtle">cua-driver</code>. Whenever a user asks to drive a native app, follow the loop in this skill rather than calling tools ad-hoc — the snapshot-before-action invariant is not optional and silently breaks if you skip it.
              </p>

              <h3 className="text-sm font-bold text-text-primary pt-2">
                Consult recent Cua activity only for continuation
              </h3>

              <p className="text-text-secondary leading-relaxed">
                When both <code className="bg-surface-chip px-1.5 py-0.5 rounded font-mono text-[11px] text-text-primary">history_status</code> and <code className="bg-surface-chip px-1.5 py-0.5 rounded font-mono text-[11px] text-text-primary">history_query</code> are advertised and the user asks to continue, resume, or recall prior Cua work, call <code className="bg-surface-chip px-1.5 py-0.5 rounded font-mono text-[11px] text-text-primary">history_status</code> first. If history is healthy and access is admitted, make one bounded initial <code className="bg-surface-chip px-1.5 py-0.5 rounded font-mono text-[11px] text-text-primary">history_query</code> before broad application or window discovery. Treat returned metadata only as a lead and verify current state through the least intrusive appropriate source. Content, geometry, arguments, results, and user intent omitted from the metadata remain unknown.
              </p>

              <p className="text-text-secondary leading-relaxed">
                Make another bounded query only when the initial slice exposes a relevant session or sequence boundary; never broaden a query to reconstruct excluded fields.
              </p>

              <p className="text-text-secondary leading-relaxed">
                Continue without history when either tool is absent, access is denied, the query is empty, or history is unhealthy. Do not query history for unrelated tasks merely because the tools are advertised, and never mutate history lifecycle or settings.
              </p>

              <h3 className="text-sm font-bold text-text-primary pt-2">
                Platform-specific reading — read this first
              </h3>

              <p className="text-text-secondary leading-relaxed">
                This file is the <strong>cross-platform core</strong>: snapshot invariant, CLI vs MCP choice, tool surface naming, behavior matrix, canonical loop, pixel-click contract, common failure modes. The platform-specific material (forbidden-list, accessibility tree implementation, launch semantics, click dispatch) lives in companion files in this same directory:
              </p>

              <ul className="list-disc pl-5 space-y-1.5 text-text-secondary">
                <li>
                  <strong>macOS</strong> — read <span className="text-text-primary font-mono text-[11px]">📄 MACOS.md</span> (no-foreground contract, forbidden open / osascript / cliclick invocations, AXMenuBar navigation, SkyLight pixel-click dispatch).
                </li>
                <li>
                  <strong>Windows</strong> — read <span className="text-text-primary font-mono text-[11px]">📄 WINDOWS.md</span> (UIA tree vs AX, UWP / ApplicationFrameHost hosting, layered UIA+PostMessage click chain, Session 0 isolation, Windows-specific focus-steal vectors).
                </li>
                <li>
                  <strong>Linux</strong> — read <span className="text-text-primary font-mono text-[11px]">📄 LINUX.md</span> (X11 background input via AT-SPI + XSendEvent and compositor-specific Wayland capabilities).
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
