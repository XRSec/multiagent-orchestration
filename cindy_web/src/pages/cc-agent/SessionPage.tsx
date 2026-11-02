import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  ChevronRight,
  ChevronDown,
  Terminal,
  FileCode,
  CheckCircle2,
  ListTodo,
  Paperclip,
  Mic,
  ArrowUp,
  Folder,
  Copy,
  RotateCcw,
  GitFork,
  Activity,
  Clock,
  Check,
  CheckCheck,
  MessageSquare,
  HelpCircle,
  X,
  Send,
  Sliders,
} from 'lucide-react';
import { MOCK_MESSAGES } from '@/mock/messages';
import { SlashCommandMenu, SlashCommand } from '@/components/SlashCommandMenu';
import { ComposerCard } from '@/components/ComposerCard';

export function CCAgentSessionView() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState(MOCK_MESSAGES);
  const [inputPrompt, setInputPrompt] = useState('');
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [expandedToolId, setExpandedToolId] = useState<string | null>('t1');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Slash commands popover
  const showSlashMenu = inputPrompt.startsWith('/') || inputPrompt.startsWith('//');

  // BTW Side Chat Modal
  const [showBtwModal, setShowBtwModal] = useState(false);
  const [btwQuery, setBtwQuery] = useState('');
  const [btwList, setBtwList] = useState<
    { q: string; a: string; time: string }[]
  >([
    {
      q: '为什么新建会话不支持 /btw 侧聊？',
      a: '因为 /btw（侧边提问）的设计初衷是「基于已有会话的执行上下文」进行旁路追问而不污染主 Prompt 缓存；新会话尚无上下文积累，因此直接在主对话提问即可。',
      time: '15:10',
    },
  ]);

  const handleSend = () => {
    if (!inputPrompt.trim()) return;

    // Check if user submitted a /btw or //btw command
    if (inputPrompt.startsWith('/btw') || inputPrompt.startsWith('//btw')) {
      const qText = inputPrompt.replace(/^(\/\/|\/)btw\s*/, '').trim() || '当前上下文说明';
      setBtwList((prev) => [
        ...prev,
        {
          q: qText,
          a: `[侧边答复] 针对您的独立提问：“${qText}”，已在不影响主会话 Token 缓存与执行流的前提下完成快速查阅与解答。`,
          time: '刚刚',
        },
      ]);
      setShowBtwModal(true);
      setInputPrompt('');
      return;
    }

    const newMessage = {
      id: `m-${Date.now()}`,
      role: 'user' as const,
      content: inputPrompt,
      timestamp: '刚刚',
    };
    setMessages((prev) => [...prev, newMessage]);
    setInputPrompt('');
  };

  const handleSelectSlashCommand = (cmd: SlashCommand) => {
    if (cmd.name === 'mcp') {
      navigate('/mcp');
      return;
    }
    if (cmd.name === 'skills') {
      navigate('/skillhub');
      return;
    }
    if (cmd.name === 'plugin') {
      navigate('/plugins');
      return;
    }
    if (cmd.name === 'config' || cmd.name === 'storage' || cmd.name === 'theme') {
      navigate('/settings');
      return;
    }
    if (cmd.name === 'workflows' || cmd.name === 'tasks') {
      navigate('/cc-agent/orca/s-orca-lead-01');
      return;
    }
    if (cmd.name === 'btw') {
      setShowBtwModal(true);
      setInputPrompt('');
      return;
    }
    if (cmd.name === 'goal') {
      setInputPrompt('[Goal] ');
      return;
    }
    // Default fill command into prompt
    setInputPrompt(`/${cmd.name} `);
  };

  const handleSendBtw = () => {
    if (!btwQuery.trim()) return;
    setBtwList((prev) => [
      ...prev,
      {
        q: btwQuery,
        a: `[侧边答复] 关于“${btwQuery}”：基于当前对话第 2 轮上下文，这是一个旁路技术分析，不会写回主任务会话树。`,
        time: '刚刚',
      },
    ]);
    setBtwQuery('');
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface relative">
      {/* 1. Official Session Status Bar */}
      <div className="h-9 px-4 border-b border-border-default bg-surface flex items-center justify-between text-xs text-text-secondary shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary cursor-pointer transition-colors">
            <Folder className="w-3.5 h-3.5 text-accent-amber" />
            <span>/Users/xr/IDEA.localized/cindy</span>
          </div>
          <span className="text-text-tertiary">|</span>
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <Activity className="w-3.5 h-3.5 text-accent-green" />
            <span>19.4k tokens</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick BTW Button */}
          <button
            onClick={() => setShowBtwModal(true)}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-surface-chip hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            title="侧边提问 (不污染主对话上下文)"
          >
            <MessageSquare className="w-3 h-3 text-accent-blue" />
            <span>/btw 侧问</span>
          </button>

          <span className="text-[11px] text-text-tertiary font-mono flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>4.2s</span>
          </span>
        </div>
      </div>

      {/* 2. Official MessageStream (Canvas Surface Layout) */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-7 max-w-3xl w-full mx-auto">
        {messages.map((msg) => (
          <div key={msg.id} className="space-y-3 group">
            {/* USER MESSAGE: Right-aligned card bubble */}
            {msg.role === 'user' && (
              <div className="flex flex-col items-end">
                <div className="bg-surface-elevated border border-border-default rounded-2xl rounded-tr-sm p-3.5 max-w-xl shadow-sm text-text-primary text-sm leading-relaxed">
                  <p>{msg.content}</p>

                  {/* Attachment chips */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border-subtle">
                      {msg.attachments.map((att, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-1.5 bg-surface-chip px-2 py-1 rounded-md text-xs text-text-secondary font-mono"
                        >
                          <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                          <span>{att.name}</span>
                          <span className="text-text-tertiary text-[10px]">({att.size})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-tertiary mt-1 px-1">
                  <span>{msg.timestamp}</span>
                </div>
              </div>
            )}

            {/* ASSISTANT MESSAGE */}
            {msg.role === 'assistant' && (
              <div className="flex flex-col items-start space-y-3.5 w-full">
                {/* 1. Official ThinkingCard */}
                {msg.thinking && (
                  <div className="w-full select-none">
                    <button
                      onClick={() => setThinkingExpanded(!thinkingExpanded)}
                      className="flex items-center gap-1.5 py-1 text-xs text-text-tertiary hover:text-text-secondary transition-colors group/think"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-accent-purple" />
                      <span className="font-normal">
                        {thinkingExpanded
                          ? '思考过程'
                          : `已思考 ${msg.thinking.durationSeconds} 秒`}
                      </span>
                      <ChevronRight
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${
                          thinkingExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </button>

                    {thinkingExpanded && (
                      <div className="mt-1 pl-3 py-1.5 border-l border-border-default text-xs text-text-secondary font-mono whitespace-pre-wrap leading-relaxed select-text italic bg-surface-elevated/30 rounded-r-lg">
                        {msg.thinking.text}
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Official TodoListCard */}
                {msg.todos && msg.todos.length > 0 && (
                  <div className="w-full bg-surface-elevated border border-border-default rounded-2xl p-3.5 space-y-2 shadow-sm">
                    <div className="flex items-center justify-between text-xs font-semibold text-text-primary pb-1 border-b border-border-subtle">
                      <div className="flex items-center gap-1.5">
                        <ListTodo className="w-4 h-4 text-accent-blue" />
                        <span>任务推进清单</span>
                      </div>
                      <span className="text-[10px] font-mono text-accent-green font-medium">
                        {msg.todos.filter((t) => t.completed).length} / {msg.todos.length} 完成
                      </span>
                    </div>

                    <div className="space-y-1.5 pt-0.5">
                      {msg.todos.map((todo, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-xs text-text-secondary">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                              todo.completed ? 'text-accent-green' : 'text-text-tertiary'
                            }`}
                          />
                          <span className={todo.completed ? 'line-through text-text-tertiary' : 'text-text-primary'}>
                            {todo.text}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Official ToolCallCards */}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="w-full space-y-1.5">
                    {msg.toolCalls.map((tc) => {
                      const isExpanded = expandedToolId === tc.id;
                      return (
                        <div
                          key={tc.id}
                          className="bg-surface-elevated border border-border-default rounded-xl overflow-hidden text-xs transition-all shadow-sm"
                        >
                          <div
                            onClick={() => setExpandedToolId(isExpanded ? null : tc.id)}
                            className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-surface-hover/60 transition-colors"
                          >
                            <div className="flex items-center gap-2 font-mono">
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-text-tertiary transition-transform ${
                                  isExpanded ? 'rotate-90' : ''
                                }`}
                              />
                              <Terminal className="w-3.5 h-3.5 text-accent-amber" />
                              <span className="font-bold text-text-primary">{tc.tool}</span>
                              <span className="text-text-tertiary font-sans truncate max-w-md">
                                {tc.description}
                              </span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-text-tertiary font-mono">
                                {tc.executionTimeMs}ms
                              </span>
                              <span className="text-[10px] text-accent-green bg-accent-green/10 px-1.5 py-0.5 rounded font-mono font-medium">
                                SUCCESS
                              </span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-3 py-2.5 bg-surface/70 border-t border-border-subtle font-mono text-[11px] space-y-1.5 text-text-secondary">
                              {tc.args && (
                                <div className="text-text-tertiary">
                                  参数: <span className="text-text-primary">{JSON.stringify(tc.args)}</span>
                                </div>
                              )}
                              {tc.output && (
                                <div className="text-text-secondary bg-surface-elevated p-2 rounded-lg border border-border-subtle whitespace-pre-wrap">
                                  {tc.output}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 4. Official TurnChangesCard */}
                {msg.diff && (
                  <div className="w-full bg-surface-elevated border border-border-default rounded-2xl overflow-hidden text-xs font-mono shadow-sm">
                    <div className="px-3.5 py-2 bg-surface flex items-center justify-between border-b border-border-subtle">
                      <div className="flex items-center gap-2">
                        <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                        <span className="font-semibold text-text-primary">{msg.diff.filePath}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-accent-green font-bold">+{msg.diff.additions}</span>
                        <span className="text-accent-red font-bold">-{msg.diff.deletions}</span>
                      </div>
                    </div>
                    <pre className="p-3 bg-surface/40 overflow-x-auto text-text-primary leading-relaxed text-[11px]">
                      {msg.diff.code}
                    </pre>
                  </div>
                )}

                {/* 5. Main Markdown Prose Text */}
                <div className="text-sm text-text-primary leading-relaxed select-text space-y-2 pt-1">
                  <p>{msg.content}</p>
                </div>

                {/* 6. Official MessageActionBar */}
                <div className="flex items-center gap-3 text-xs text-text-tertiary pt-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleCopy(msg.id, msg.content)}
                    className="flex items-center gap-1 hover:text-text-primary transition-colors"
                  >
                    {copiedId === msg.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-accent-green" />
                        <span className="text-accent-green">已复制</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>复制</span>
                      </>
                    )}
                  </button>

                  <button className="flex items-center gap-1 hover:text-text-primary transition-colors">
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>重新生成</span>
                  </button>

                  <button className="flex items-center gap-1 hover:text-text-primary transition-colors">
                    <GitFork className="w-3.5 h-3.5" />
                    <span>分支 (Fork)</span>
                  </button>

                  <span className="text-[10px] text-text-tertiary font-mono ml-auto">
                    {msg.timestamp}
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 3. Official Sticky Bottom Composer (右上角文件夹/分支/worktree, 左下角+/权限, 右侧模型/推理/语音/发送) */}
      <div className="p-4 border-t border-border-default bg-surface shrink-0 relative">
        <div className="max-w-3xl mx-auto relative">
          <ComposerCard
            prompt={inputPrompt}
            onPromptChange={setInputPrompt}
            onSend={handleSend}
            isNewChat={false}
            onSelectSlashCommand={handleSelectSlashCommand}
            placeholder="回复 Cindy、键入 / 触发指令，或 /btw 侧边提问..."
          />
        </div>
      </div>

      {/* 4. Official BTW 侧边提问浮动抽屉 (Side Chat / BTW) */}
      {showBtwModal && (
        <div className="absolute right-4 top-12 bottom-24 w-96 bg-surface-elevated border border-border-default rounded-3xl shadow-2xl flex flex-col z-40 overflow-hidden text-xs animate-in slide-in-from-right-4 duration-200">
          {/* Header */}
          <div className="p-3.5 border-b border-border-default bg-surface flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-accent-blue" />
              <div>
                <div className="font-bold text-text-primary text-xs">/btw 侧边提问通道</div>
                <div className="text-[10px] text-text-tertiary">不写入主对话上下文，零污染推理</div>
              </div>
            </div>
            <button
              onClick={() => setShowBtwModal(false)}
              className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {btwList.map((item, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="bg-surface-chip p-2.5 rounded-xl text-text-primary font-medium text-xs">
                  {item.q}
                </div>
                <div className="bg-surface p-2.5 rounded-xl border border-border-subtle text-text-secondary text-[11px] leading-relaxed">
                  {item.a}
                  <div className="text-[10px] text-text-tertiary text-right mt-1 font-mono">
                    {item.time}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="p-3 border-t border-border-default bg-surface shrink-0">
            <div className="flex items-center gap-1.5 bg-surface-elevated border border-border-default rounded-xl px-2.5 py-1.5">
              <input
                type="text"
                value={btwQuery}
                onChange={(e) => setBtwQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendBtw()}
                placeholder="针对当前上下文旁路提问..."
                className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <button
                onClick={handleSendBtw}
                disabled={!btwQuery.trim()}
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
