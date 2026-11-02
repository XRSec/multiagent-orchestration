import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Paperclip,
  Mic,
  MicOff,
  ArrowUp,
  Bot,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  UserPlus,
  Phone,
  PhoneOff,
  Activity,
  Plus,
  X,
  Check,
  FileCode,
  Image as ImageIcon,
  Folder,
  Sliders,
  Copy,
  RotateCcw,
  Zap,
  ChevronDown,
  Volume2,
  Trash2,
  Save,
  Brain,
  Layers,
  ChevronRight,
  Info,
  User,
  MessageSquare,
  Clock,
  History,
  Monitor,
  Camera,
  Puzzle,
  FileText,
} from 'lucide-react';
import { MOCK_BOTS, BotItem } from '@/mock/bots';
import { MOCK_SKILLS } from '@/mock/skills';

interface BotChatMessage {
  id: string;
  role: 'user' | 'assistant';
  sender: string;
  avatar: string;
  content: string;
  timestamp: string;
}

interface MentionOption {
  name: string;
  subtitle: string;
  type: 'bot' | 'file';
  avatar?: string;
  insert: string;
}

type SettingsSubPage =
  | 'home'
  | 'profile'
  | 'personality'
  | 'memory'
  | 'projects'
  | 'model'
  | 'capabilities'
  | 'advanced';

export function BotSessionPage() {
  const { botId } = useParams();
  const navigate = useNavigate();
  const bot = MOCK_BOTS.find((b) => b.id === botId) || MOCK_BOTS[0];

  // Chat messages
  const [messages, setMessages] = useState<BotChatMessage[]>([
    {
      id: 'bm-1',
      role: 'assistant',
      sender: bot.name,
      avatar: bot.avatar,
      content: `你好！我是 ${bot.name}，负责 ${bot.role}。随时把任务或待分析代码发给我，我将基于最新项目上下文为你处理。`,
      timestamp: '14:30',
    },
  ]);

  const [inputVal, setInputVal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Settings Drawer State (1:1 参考 Cindy 伙伴设置页面 Image 7)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsSubPage>('home');

  // Bot Settings fields
  const [botName, setBotName] = useState(bot.name);
  const [botTitle, setBotTitle] = useState(bot.title);
  const [botDepartment, setBotDepartment] = useState(bot.department);
  const [botSystemPrompt, setBotSystemPrompt] = useState(bot.systemPrompt);
  const [botAutonomy, setBotAutonomy] = useState<'Auto' | 'Ask'>('Auto');
  const [botModel, setBotModel] = useState(bot.model);
  const [savedSettingsNotice, setSavedSettingsNotice] = useState(false);

  // Mock Memories for this bot
  const [memories, setMemories] = useState([
    { id: 'mem-1', title: '代码规范要求', content: '单文件小于 600 行，优先使用 TypeScript 严格模式' },
    { id: 'mem-2', title: '用户偏好', content: '喜欢简明直击核心的回答，不需要废话铺垫' },
  ]);

  // Permission Mode State (输入框内权限配置)
  const [permissionMode, setPermissionMode] = useState<'Auto' | 'Ask'>('Auto');

  // '+' Attachment / Actions Menu
  const [isPlusMenuOpen, setIsPlusMenuOpen] = useState(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);

  // Voice Call & Voice Input Simulation (右侧支持语音)
  const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Slash (/) & Mention (@) Trigger States (优化 / 和 @ 自动联想菜单)
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(event.target as Node)) {
        setIsPlusMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Voice recording timer simulation
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setRecordingDuration(0);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  // Handle typing & inspect '/' or '@'
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputVal(val);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);

    // Detect Slash /
    const slashMatch = textBeforeCursor.match(/\/([a-zA-Z0-9_-]*)$/);
    if (slashMatch) {
      setShowSlashMenu(true);
      setSlashQuery(slashMatch[1].toLowerCase());
      setShowMentionMenu(false);
    } else {
      setShowSlashMenu(false);
    }

    // Detect Mention @
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_一-龥]*)$/);
    if (mentionMatch) {
      setShowMentionMenu(true);
      setMentionQuery(mentionMatch[1].toLowerCase());
      setShowSlashMenu(false);
    } else {
      setShowMentionMenu(false);
    }
  };

  // Slash commands options
  const slashCommands = [
    { cmd: '/skill', desc: '调用特定技能或运行规则', insert: '/skill ' },
    { cmd: '/clear', desc: '清空当前对话上下文记忆', insert: '/clear' },
    { cmd: '/compact', desc: '压缩对话历史并提炼关键摘要', insert: '/compact' },
    { cmd: '/help', desc: '查看伙伴专属工具与指令清单', insert: '/help' },
    { cmd: '/cost', desc: '查看当前会话的 Token 消耗统计', insert: '/cost' },
  ].filter((c) => c.cmd.toLowerCase().includes(slashQuery));

  // Mention options (伙伴与文件)
  const mentionItems: MentionOption[] = [
    ...MOCK_BOTS.map((b) => ({
      name: b.name,
      subtitle: b.title,
      type: 'bot' as const,
      avatar: b.avatar,
      insert: `@${b.name} `,
    })),
    {
      name: 'router.tsx',
      subtitle: 'src/router.tsx',
      type: 'file' as const,
      insert: '@src/router.tsx ',
    },
    {
      name: 'SKILL.md',
      subtitle: 'skills/SKILL.md',
      type: 'file' as const,
      insert: '@SKILL.md ',
    },
  ].filter((m) => m.name.toLowerCase().includes(mentionQuery));

  const insertSlash = (insertText: string) => {
    setInputVal((prev) => {
      const idx = prev.lastIndexOf('/');
      return prev.slice(0, idx) + insertText;
    });
    setShowSlashMenu(false);
    textareaRef.current?.focus();
  };

  const insertMention = (insertText: string) => {
    setInputVal((prev) => {
      const idx = prev.lastIndexOf('@');
      return prev.slice(0, idx) + insertText;
    });
    setShowMentionMenu(false);
    textareaRef.current?.focus();
  };

  const handleSend = () => {
    if (!inputVal.trim()) return;
    const userMsg: BotChatMessage = {
      id: `bm-${Date.now()}`,
      role: 'user',
      sender: '我',
      avatar: '',
      content: inputVal,
      timestamp: '刚刚',
    };
    const replyMsg: BotChatMessage = {
      id: `bm-${Date.now() + 1}`,
      role: 'assistant',
      sender: botName,
      avatar: bot.avatar,
      content: `收到，已开始按【${bot.role}】专业标准处理任务：“${inputVal}”。正在生成上下文方案...`,
      timestamp: '刚刚',
    };
    setMessages((prev) => [...prev, userMsg, replyMsg]);
    setInputVal('');
    setShowSlashMenu(false);
    setShowMentionMenu(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setInputVal((prev) => prev + (prev ? ' ' : '') + '请帮我梳理并执行当前模块的代码优化。');
    } else {
      setIsRecording(true);
    }
  };

  const handleSaveSubSettings = () => {
    setSavedSettingsNotice(true);
    setTimeout(() => {
      setSavedSettingsNotice(false);
      setSettingsPage('home');
    }, 800);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface text-text-primary relative">
      {/* ======================================================== */}
      {/* 1. Official Cindy BotSessionContentHeader (顶栏)         */}
      {/* ======================================================== */}
      <div className="h-14 px-4 border-b border-border-default bg-surface flex items-center justify-between shrink-0 z-20">
        {/* 左上角：点击进入伙伴设置页面 (按需求：点击左上角进入伙伴设置页面) */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/bots')}
            title="返回伙伴列表"
            className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          {/* 伙伴头像与名称胶囊 (点击即可打开伙伴设置抽屉) */}
          <button
            onClick={() => {
              setSettingsPage('home');
              setIsSettingsOpen(true);
            }}
            title="点击查看并配置伙伴设置"
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-surface-hover transition-colors cursor-pointer group"
          >
            <div className="relative">
              <img
                src={bot.avatar}
                alt=""
                className="w-7 h-7 rounded-full object-cover border border-border-default shadow-xs"
              />
              <span
                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full border border-surface ${
                  bot.status === 'online'
                    ? 'bg-accent-green'
                    : bot.status === 'busy'
                    ? 'bg-accent-amber'
                    : 'bg-text-tertiary'
                }`}
              />
            </div>

            <div className="flex items-center gap-1.5 text-left">
              <span className="text-sm font-bold text-text-primary group-hover:text-accent-blue transition-colors">
                {botName}
              </span>
              <span className="text-xs text-text-tertiary font-normal">
                ({botTitle.split(' ')[0]})
              </span>
              <span className="text-[10px] bg-surface-chip text-text-secondary px-1.5 py-0.2 rounded-md font-mono">
                {botModel.split('-')[1] || botModel}
              </span>
            </div>
          </button>
        </div>

        {/* 右上角操作区 (借鉴 Cindy Desktop: 拉群、近况、语音通话、设置齿轮) */}
        <div className="flex items-center gap-1.5">
          {/* 拉入群聊 */}
          <button
            onClick={() => navigate('/bots/groups/group-m1')}
            title="创建或拉入群组协同"
            className="p-2 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <UserPlus className="w-4 h-4" />
          </button>

          {/* 伙伴近况 / 任务浮层 */}
          <button
            onClick={() => alert(`${botName} 当前近况：\n· 已完成任务：${bot.stats.tasksCompleted} 次\n· 好评率：${bot.stats.rating}\n· 状态：正常在线就绪`)}
            title="伙伴近况"
            className="p-2 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <Activity className="w-4 h-4 text-accent-green" />
          </button>

          {/* 实时语音通话 (Voice Call) */}
          <button
            onClick={() => setIsVoiceCallActive(!isVoiceCallActive)}
            title={isVoiceCallActive ? '挂断语音' : '开启双向实时语音'}
            className={`p-2 rounded-full transition-colors ${
              isVoiceCallActive
                ? 'bg-accent-red text-white animate-pulse'
                : 'hover:bg-surface-hover text-text-tertiary hover:text-text-primary'
            }`}
          >
            {isVoiceCallActive ? <PhoneOff className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </button>

          {/* 伙伴设置齿轮按钮 (同样通往设置页面) */}
          <button
            onClick={() => {
              setSettingsPage('home');
              setIsSettingsOpen(true);
            }}
            title="伙伴设置"
            className="p-2 rounded-full hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 语音通话悬浮条 (如果开启了 Voice Call) */}
      {isVoiceCallActive && (
        <div className="h-10 px-4 bg-accent-blue/10 border-b border-accent-blue/20 flex items-center justify-between text-xs text-accent-blue">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 animate-bounce" />
            <span className="font-medium">与 {botName} 实时语音通话中...</span>
          </div>
          <button
            onClick={() => setIsVoiceCallActive(false)}
            className="px-2 py-0.5 bg-accent-red text-white text-[11px] rounded-lg hover:bg-red-600 transition-colors"
          >
            挂断
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* 2. Chat Timeline Messages                                */}
      {/* ======================================================== */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 max-w-3xl w-full mx-auto">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {m.role === 'assistant' && (
              <img
                src={m.avatar}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0 border border-border-default shadow-xs mt-0.5"
              />
            )}
            <div
              className={`p-3.5 rounded-2xl max-w-xl text-sm leading-relaxed shadow-xs ${
                m.role === 'user'
                  ? 'bg-accent-cta text-accent-cta-fg rounded-tr-sm'
                  : 'bg-surface-elevated border border-border-default text-text-primary rounded-tl-sm'
              }`}
            >
              <p>{m.content}</p>
              <div className="flex items-center justify-between text-[10px] opacity-60 mt-2 font-mono">
                <span>{m.sender}</span>
                <span>{m.timestamp}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ======================================================== */}
      {/* 3. Enhanced Composer: '+' 菜单, 权限配置, 语音, / 与 @ 优化 */}
      {/* ======================================================== */}
      <div className="p-4 border-t border-border-default bg-surface shrink-0 relative">
        <div className="max-w-3xl mx-auto relative">
          {/* A. '/' 斜杠命令联想弹窗 (按需求优化) */}
          {showSlashMenu && slashCommands.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                快捷指令 (Slash Commands)
              </div>
              {slashCommands.map((c) => (
                <div
                  key={c.cmd}
                  onClick={() => insertSlash(c.insert)}
                  className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors flex items-center justify-between"
                >
                  <span className="font-mono font-bold text-accent-blue">{c.cmd}</span>
                  <span className="text-text-tertiary text-[11px] truncate max-w-[150px]">
                    {c.desc}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* B. '@' 提及联想弹窗 (按需求优化) */}
          {showMentionMenu && mentionItems.length > 0 && (
            <div className="absolute bottom-full left-8 mb-2 w-72 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5 animate-in fade-in slide-in-from-bottom-2">
              <div className="px-2 py-1 text-[10px] font-bold text-text-tertiary uppercase tracking-wider">
                提及伙伴或引用文件 (@ Mentions)
              </div>
              {mentionItems.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => insertMention(item.insert)}
                  className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer transition-colors flex items-center gap-2"
                >
                  {item.type === 'bot' && item.avatar ? (
                    <img src={item.avatar} alt="" className="w-5 h-5 rounded-full object-cover" />
                  ) : (
                    <FileCode className="w-4 h-4 text-accent-blue" />
                  )}
                  <div className="flex flex-col truncate">
                    <span className="font-semibold text-text-primary text-xs">@{item.name}</span>
                    <span className="text-[10px] text-text-tertiary">{item.subtitle}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* C. Composer Card Box */}
          <div className="bg-surface-elevated border border-border-default rounded-2xl shadow-lg p-2.5 flex flex-col focus-within:border-accent-blue/50 transition-all">
            {/* 正在录音时的声波视觉提示 */}
            {isRecording ? (
              <div className="py-3 px-3 flex items-center justify-between bg-surface rounded-xl border border-border-subtle animate-pulse mb-2">
                <div className="flex items-center gap-2 text-xs text-accent-red font-medium">
                  <span className="w-2.5 h-2.5 rounded-full bg-accent-red animate-ping" />
                  <span>正在语音录音... 00:0{recordingDuration}</span>
                </div>
                <button
                  onClick={toggleRecording}
                  className="px-2.5 py-1 bg-accent-red text-white text-xs rounded-lg font-medium hover:bg-red-600 transition-colors"
                >
                  完成转写
                </button>
              </div>
            ) : null}

            {/* Input Textarea */}
            <textarea
              ref={textareaRef}
              value={inputVal}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`给 ${botName} 发送专属任务，输入 / 触发指令，输入 @ 提及伙伴与文件...`}
              rows={2}
              className="w-full bg-transparent resize-none border-none text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none p-1 leading-relaxed"
            />

            {/* Bottom Actions Row */}
            <div className="flex items-center justify-between pt-2 border-t border-border-subtle text-xs">
              <div className="flex items-center gap-1.5">
                {/* 1. '+' 扩展菜单按钮 (按需求支持 '+') */}
                <div className="relative" ref={plusMenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsPlusMenuOpen(!isPlusMenuOpen)}
                    className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                    title="添加内容与附件 (+)"
                  >
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* '+' Menu Dropdown */}
                  {isPlusMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-52 bg-surface-elevated border border-border-default rounded-2xl shadow-2xl p-1.5 z-50 text-xs space-y-0.5">
                      <div
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                          setInputVal((prev) => prev + ' @file:src/App.tsx ');
                        }}
                        className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer flex items-center gap-2 text-text-primary"
                      >
                        <FileCode className="w-3.5 h-3.5 text-accent-blue" />
                        <span>添加代码文件引用</span>
                      </div>
                      <div
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                          alert('上传本地截图');
                        }}
                        className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer flex items-center gap-2 text-text-primary"
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-accent-green" />
                        <span>上传图片或截图</span>
                      </div>
                      <div
                        onClick={() => {
                          setIsPlusMenuOpen(false);
                          setInputVal((prev) => prev + ' /skill ');
                        }}
                        className="px-2.5 py-1.5 rounded-xl hover:bg-surface-hover cursor-pointer flex items-center gap-2 text-text-primary"
                      >
                        <Zap className="w-3.5 h-3.5 text-accent-amber" />
                        <span>插入技能执行指令</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 2. 权限配置按钮 (按需求支持权限配置：Auto / Ask) */}
                <button
                  type="button"
                  onClick={() => setPermissionMode((prev) => (prev === 'Auto' ? 'Ask' : 'Auto'))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-surface-hover text-text-secondary text-xs transition-colors cursor-pointer border border-border-subtle"
                  title="切换工具执行权限"
                >
                  <Shield
                    className={`w-3.5 h-3.5 ${
                      permissionMode === 'Auto' ? 'text-accent-green' : 'text-accent-amber'
                    }`}
                  />
                  <span className="font-mono text-[11px]">
                    {permissionMode === 'Auto' ? 'Auto (自动审批)' : 'Ask (手动确认)'}
                  </span>
                </button>
              </div>

              {/* Right Side: Voice Input + Send Button (按需求右侧支持语音) */}
              <div className="flex items-center gap-2">
                {/* 语音录音按钮 */}
                <button
                  type="button"
                  onClick={toggleRecording}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isRecording
                      ? 'bg-accent-red text-white'
                      : 'hover:bg-surface-hover text-text-secondary hover:text-text-primary'
                  }`}
                  title={isRecording ? '点击停止并转写' : '语音输入 (按住或点击)'}
                >
                  {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>

                {/* 发送按钮 */}
                <button
                  onClick={handleSend}
                  disabled={!inputVal.trim()}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    inputVal.trim()
                      ? 'bg-accent-cta text-accent-cta-fg shadow-md hover:bg-accent-hover'
                      : 'bg-surface-chip text-text-disabled cursor-not-allowed'
                  }`}
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================== */}
      {/* 4. Official Cindy BotSettingsDrawer (1:1 像素级还原 Image 7)*/}
      {/* ======================================================== */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-end z-50 animate-in fade-in">
          <div className="w-[450px] h-full bg-surface border-l border-border-default shadow-2xl flex flex-col justify-between overflow-hidden">
            {/* Top Bar: 设置 ✕ */}
            <div className="h-14 px-6 border-b border-border-default flex items-center justify-between shrink-0 bg-surface">
              {settingsPage === 'home' ? (
                <h2 className="text-base font-bold text-text-primary tracking-tight">
                  设置
                </h2>
              ) : (
                <button
                  onClick={() => setSettingsPage('home')}
                  className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>返回</span>
                </button>
              )}

              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* ================================================== */}
            {/* SUBPAGE 1: MAIN SETTINGS MENU (1:1 还原 Image 7 截图) */}
            {/* ================================================== */}
            {settingsPage === 'home' && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
                {/* Top Centered Avatar with Camera Badge + Name */}
                <div className="flex flex-col items-center justify-center pt-2 pb-4 space-y-2 text-center">
                  <div className="relative">
                    <img
                      src={bot.avatar}
                      alt={botName}
                      className="w-20 h-20 rounded-full object-cover border-2 border-border-default shadow-sm bg-surface-elevated"
                    />
                    {/* Camera Badge (Image 7) */}
                    <div
                      title="更换头像"
                      className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-surface-elevated border border-border-default flex items-center justify-center text-text-secondary shadow-xs cursor-pointer hover:bg-surface-hover transition-colors"
                    >
                      <Camera className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-text-primary">
                    {botName}
                  </h3>
                </div>

                {/* Section 1: 11 Items Main Settings Card (1:1 还原 Image 7) */}
                <div className="bg-surface-elevated border border-border-default rounded-2xl overflow-hidden shadow-xs divide-y divide-border-subtle">
                  {/* 1. 资料 */}
                  <div
                    onClick={() => setSettingsPage('profile')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Info className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">资料</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 2. 性格与说话习惯 */}
                  <div
                    onClick={() => setSettingsPage('personality')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <User className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">性格与说话习惯</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 3. 记忆 */}
                  <div
                    onClick={() => setSettingsPage('memory')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Brain className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">记忆</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 4. 关联项目 */}
                  <div
                    onClick={() => setSettingsPage('projects')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Folder className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">关联项目</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 5. 模型 */}
                  <div
                    onClick={() => setSettingsPage('model')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Sparkles className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">模型</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-text-tertiary">
                        {botModel.split('-')[1] || botModel}
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                    </div>
                  </div>

                  {/* 6. 语音 (用户指定：mock，不需实现真实功能) */}
                  <div
                    onClick={() => alert('语音配置：默认使用本地 Neural 语音引擎')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Volume2 className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">语音</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 7. 能力 */}
                  <div
                    onClick={() => setSettingsPage('capabilities')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Puzzle className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">能力</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-text-tertiary">
                        {bot.capabilities.length} 项已启用
                      </span>
                      <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                    </div>
                  </div>

                  {/* 8. 消息平台 (用户指定：mock，不需实现真实功能) */}
                  <div
                    onClick={() => alert('消息平台：已与飞书、Telegram 机器人通道互联')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <MessageSquare className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">消息平台</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 9. 例行任务 (用户指定：mock，不需实现真实功能) */}
                  <div
                    onClick={() => navigate('/cc-agent/scheduled')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Clock className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">例行任务</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 10. 搜索伙伴历史 */}
                  <div
                    onClick={() => alert(`已建立 ${botName} 的全量对话历史索引`)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <History className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">搜索伙伴历史</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>

                  {/* 11. 高级配置 */}
                  <div
                    onClick={() => setSettingsPage('advanced')}
                    className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Sliders className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">高级配置</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                  </div>
                </div>

                {/* Section 2: 主力电脑 Card (1:1 还原 Image 7 截图) */}
                <div className="bg-surface-elevated border border-border-default rounded-2xl overflow-hidden shadow-xs">
                  <div
                    onClick={() => alert('主力电脑运行状态：当前即在“这台电脑”执行')}
                    className="flex items-center justify-between px-4 py-3.5 hover:bg-surface-hover/70 cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3 text-text-primary">
                      <Monitor className="w-4 h-4 text-text-secondary" />
                      <span className="font-medium text-[13px]">主力电脑</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-text-tertiary">
                      <span className="text-xs">这台电脑</span>
                      <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-text-primary transition-colors" />
                    </div>
                  </div>
                </div>

                {/* Section 3: 重启与删除操作 Card (1:1 还原 Image 7 截图) */}
                <div className="bg-surface-elevated border border-border-default rounded-2xl overflow-hidden shadow-xs divide-y divide-border-subtle">
                  {/* 重启伙伴 */}
                  <button
                    onClick={() => alert(`已重启 ${botName} 进程与上下文！`)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover/70 text-left text-[13px] font-medium text-text-primary transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4 text-text-secondary" />
                    <span>重启伙伴</span>
                  </button>

                  {/* 永久删除伙伴 (Red) */}
                  <button
                    onClick={() => {
                      if (confirm(`确定要永久删除伙伴【${botName}】吗？此操作无法撤销。`)) {
                        navigate('/bots');
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-hover/70 text-left text-[13px] font-medium text-accent-red hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-accent-red" />
                    <span>永久删除伙伴</span>
                  </button>
                </div>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 资料 (Profile)                            */}
            {/* ================================================== */}
            {settingsPage === 'profile' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">基础资料</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">修改伙伴名称与业务属性</p>
                </div>

                <div className="space-y-3 bg-surface-elevated border border-border-default rounded-2xl p-4">
                  <div>
                    <label className="text-text-tertiary text-[11px] block mb-1">伙伴称呼</label>
                    <input
                      type="text"
                      value={botName}
                      onChange={(e) => setBotName(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                  <div>
                    <label className="text-text-tertiary text-[11px] block mb-1">完整头衔与角色</label>
                    <input
                      type="text"
                      value={botTitle}
                      onChange={(e) => setBotTitle(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                  <div>
                    <label className="text-text-tertiary text-[11px] block mb-1">所属部门 / 组别</label>
                    <input
                      type="text"
                      value={botDepartment}
                      onChange={(e) => setBotDepartment(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary focus:outline-none focus:border-accent-blue"
                    />
                  </div>
                </div>

                <button
                  onClick={handleSaveSubSettings}
                  className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm"
                >
                  保存资料
                </button>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 性格与说话习惯 (Personality)              */}
            {/* ================================================== */}
            {settingsPage === 'personality' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">性格与说话习惯</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">设定系统人设、表达语气与回答深度规则</p>
                </div>

                <div className="space-y-3 bg-surface-elevated border border-border-default rounded-2xl p-4">
                  <label className="text-text-tertiary text-[11px] block">System Prompt (系统提示词)</label>
                  <textarea
                    value={botSystemPrompt}
                    onChange={(e) => setBotSystemPrompt(e.target.value)}
                    rows={8}
                    className="w-full bg-surface border border-border-default rounded-xl p-3 font-mono text-[11px] text-text-primary focus:outline-none focus:border-accent-blue leading-relaxed resize-none"
                  />
                  <div className="text-[10px] text-text-tertiary">
                    该提示词会作为 System 顶层指令直接注入该伙伴所有的单聊与协同会话中。
                  </div>
                </div>

                <button
                  onClick={handleSaveSubSettings}
                  className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm"
                >
                  保存人设与习惯
                </button>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 记忆 (Memory)                             */}
            {/* ================================================== */}
            {settingsPage === 'memory' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">记忆库</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">该伙伴已掌握的跨会话长期记忆与事实</p>
                </div>

                <div className="space-y-2.5">
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 bg-surface-elevated border border-border-default rounded-2xl space-y-1 shadow-xs"
                    >
                      <div className="font-semibold text-text-primary text-xs">{m.title}</div>
                      <div className="text-text-secondary text-[11px]">{m.content}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => alert('已新增测试记忆条目')}
                  className="w-full py-2 border border-border-default rounded-xl hover:bg-surface-hover font-medium text-xs text-text-primary transition-colors flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加一条记忆</span>
                </button>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 关联项目 (Projects)                       */}
            {/* ================================================== */}
            {settingsPage === 'projects' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">关联项目与代码库</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">该伙伴有权读取或管理的工作区目录</p>
                </div>

                <div className="space-y-2">
                  <div className="p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono">
                      <Folder className="w-3.5 h-3.5 text-accent-amber" />
                      <span>/Users/xr/IDEA.localized/cindy</span>
                    </div>
                    <span className="text-[10px] text-accent-green font-mono">DEFAULT</span>
                  </div>

                  <div className="p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono">
                      <Folder className="w-3.5 h-3.5 text-accent-amber" />
                      <span>/Users/xr/IDEA.localized/multiagent-orchestration</span>
                    </div>
                    <span className="text-[10px] text-accent-blue font-mono">LINKED</span>
                  </div>
                </div>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 模型 (Model)                              */}
            {/* ================================================== */}
            {settingsPage === 'model' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">模型配置</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">为 {botName} 挑选专属驱动模型</p>
                </div>

                <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl space-y-3">
                  <div>
                    <label className="text-text-tertiary text-[11px] block mb-1">首选推理模型</label>
                    <select
                      value={botModel}
                      onChange={(e) => setBotModel(e.target.value)}
                      className="w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary font-mono focus:outline-none"
                    >
                      <option value="claude-opus-5-5">Claude Opus 5.5 (高推理)</option>
                      <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (均衡)</option>
                      <option value="gpt-5.5">GPT-5.5 (Codex)</option>
                      <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSaveSubSettings}
                  className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm"
                >
                  保存模型设置
                </button>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 能力 (Capabilities)                       */}
            {/* ================================================== */}
            {settingsPage === 'capabilities' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">绑定能力与工具集</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">为该伙伴开启或限制工具执行权限</p>
                </div>

                <div className="space-y-2">
                  {bot.capabilities.map((cap, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-surface-elevated border border-border-default rounded-2xl flex items-center justify-between"
                    >
                      <div className="font-medium text-text-primary">{cap}</div>
                      <span className="text-[10px] text-accent-green font-mono">ENABLED</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ================================================== */}
            {/* SUBPAGE: 高级配置 (Advanced)                       */}
            {/* ================================================== */}
            {settingsPage === 'advanced' && (
              <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-text-primary">高级配置与自主度</h3>
                  <p className="text-text-tertiary text-[11px] mt-0.5">控制审批机制与上下文管理行为</p>
                </div>

                <div className="p-4 bg-surface-elevated border border-border-default rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-text-primary">默认工具执行审批</div>
                      <div className="text-[10px] text-text-tertiary">控制写文件与终端执行的确认策略</div>
                    </div>
                    <select
                      value={botAutonomy}
                      onChange={(e) => setBotAutonomy(e.target.value as any)}
                      className="bg-surface border border-border-default px-2.5 py-1 rounded-lg text-text-primary font-mono focus:outline-none"
                    >
                      <option value="Auto">Auto (自动放行常规读写)</option>
                      <option value="Ask">Ask (高危操作逐条确认)</option>
                    </select>
                  </div>
                </div>

                <button
                  onClick={handleSaveSubSettings}
                  className="w-full py-2.5 bg-accent-cta text-accent-cta-fg rounded-xl font-bold text-xs hover:bg-accent-hover transition-colors shadow-sm"
                >
                  保存高级配置
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
