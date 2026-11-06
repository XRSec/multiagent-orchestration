/**
 * Purpose: Dedicated interactive chat session page for single bot conversations.
 * Context: Web UI bot session interface with message timeline, voice controls, and configuration drawer.
 * Usage: Route component for /bots/session/:botId.
 * Prerequisites: React, react-router-dom, gateway socket client, dynamic /api/bots.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useGatewaySocket } from '@/hooks/useGatewaySocket';
import { BotSessionHeader } from './components/BotSessionHeader';
import { BotSessionTimeline, BotChatMessage } from './components/BotSessionTimeline';
import {
  BotSessionComposer,
  MentionOption,
  SlashCommandOption,
} from './components/BotSessionComposer';
import { BotSettingsDrawer } from './components/BotSettingsDrawer';
import { BotMemoryItem } from './components/BotSettingsSubpages';
import type { BotItem } from '@/mock/bots';

const DEFAULT_BOT: BotItem = {
  id: 'bot_moadmin_director_03',
  name: 'moAdmin',
  title: '任务编排与治理主管',
  avatar: '/assets/agent-island-cindy.png',
  role: '负责任务拆解、多智能体协同调度、执行进度督办与质量门禁审计',
  department: '治理委员会',
  model: 'gemini-3.8-flash',
  status: 'online',
  description: '全流程督办研发进度、规约落地与跨智能体治理门禁。',
  capabilities: ['编排治理', '质量门禁', '进度调度', '单发言人控制'],
  systemPrompt: '你是 moAdmin，多智能体协同网络的主管。',
  stats: {
    tasksCompleted: 420,
    rating: 4.98,
    collaborations: 128,
  },
};

export function BotSessionPage() {
  const { botId } = useParams();
  const [allBots, setAllBots] = useState<BotItem[]>([DEFAULT_BOT]);
  const [currentBot, setCurrentBot] = useState<BotItem>(DEFAULT_BOT);
  const [isGenerating, setIsGenerating] = useState(false);

  // Gateway socket integration
  const { invoke, subscribe, isConnected } = useGatewaySocket();
  const directSessionId = `direct_${botId || currentBot.id}`;

  // Fetch authentic bots from API
  useEffect(() => {
    let active = true;
    async function loadBots() {
      try {
        const res = await fetch('/api/bots');
        const data = await res.json();
        if (active && data.ok && Array.isArray(data.bots) && data.bots.length > 0) {
          const mapped: BotItem[] = data.bots.map((b: any) => ({
            id: b.id,
            name: b.name,
            title: b.title,
            avatar: b.avatar_url || '/assets/agent-island-cindy.png',
            role: b.role,
            department: b.department,
            model: b.model,
            status: b.status === 'active' || b.status === 'online' ? 'online' : 'busy',
            description: b.description,
            capabilities: Array.isArray(b.capabilities?.tools) ? b.capabilities.tools : ['基础工具'],
            systemPrompt: b.soulSummary || '',
            stats: {
              tasksCompleted: 400,
              rating: 4.95,
              collaborations: 120,
            },
          }));
          setAllBots(mapped);
          const found = mapped.find((b) => b.id === botId || b.name === botId);
          if (found) {
            setCurrentBot(found);
            setBotName(found.name);
            setBotTitle(found.title);
            setBotDepartment(found.department);
            setBotSystemPrompt(found.systemPrompt);
            setBotModel(found.model);
          }
        }
      } catch (err) {
        console.warn('[BotSessionPage] Failed to fetch /api/bots:', err);
      }
    }
    loadBots();
    return () => {
      active = false;
    };
  }, [botId]);

  // Chat messages
  const [messages, setMessages] = useState<BotChatMessage[]>([]);

  // Initial welcome message once bot is loaded
  useEffect(() => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages([
      {
        id: `bm-${Date.now()}`,
        role: 'assistant',
        sender: currentBot.name,
        avatar: currentBot.avatar,
        content: `你好！我是 ${currentBot.name}，负责 ${currentBot.role}。随时把任务或待分析代码发给我，我将基于最新项目上下文为你处理。`,
        timestamp: timeStr,
      },
    ]);
  }, [currentBot.name]);

  // Subscribe to real push streaming frames on directSessionId topic
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe(`direct:${directSessionId}`, (frame: any) => {
      const event = frame.event;
      const data = frame.data || {};
      const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      if (event === 'agent:turn_start') {
        setIsGenerating(true);
      } else if (event === 'agent:text_delta') {
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: updated[lastIdx].content + (data.delta || data.text_delta || ''),
            };
            return updated;
          }
          return prev;
        });
      } else if (event === 'agent:turn_complete') {
        setIsGenerating(false);
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
            const updated = [...prev];
            const content = data.replyContent || updated[lastIdx].content || '任务执行完毕。';
            updated[lastIdx] = {
              ...updated[lastIdx],
              content,
              timestamp: nowStr,
            };
            return updated;
          }
          return prev;
        });
      } else if (event === 'agent:turn_interrupted') {
        setIsGenerating(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isConnected, directSessionId, subscribe]);

  const [inputVal, setInputVal] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Settings Drawer State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Bot Settings fields
  const [botName, setBotName] = useState(currentBot.name);
  const [botTitle, setBotTitle] = useState(currentBot.title);
  const [botDepartment, setBotDepartment] = useState(currentBot.department);
  const [botSystemPrompt, setBotSystemPrompt] = useState(currentBot.systemPrompt);
  const [botAutonomy, setBotAutonomy] = useState<'Auto' | 'Ask'>('Auto');
  const [botModel, setBotModel] = useState(currentBot.model);

  // Memories for this bot
  const [memories] = useState<BotMemoryItem[]>([
    { id: 'mem-1', title: '代码规范要求', content: '单文件小于 600 行，优先使用 TypeScript 严格模式' },
    { id: 'mem-2', title: '用户偏好', content: '喜欢简明直击核心的回答，不需要废话铺垫' },
  ]);

  // Permission Mode State
  const [permissionMode, setPermissionMode] = useState<'Auto' | 'Ask'>('Auto');

  // Voice Call & Voice Input Simulation
  const [isVoiceCallActive, setIsVoiceCallActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Slash (/) & Mention (@) Trigger States
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [showMentionMenu, setShowMentionMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');

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
  const slashCommands: SlashCommandOption[] = [
    { cmd: '/skill', desc: '调用特定技能或运行规则', insert: '/skill ' },
    { cmd: '/clear', desc: '清空当前对话上下文记忆', insert: '/clear' },
    { cmd: '/compact', desc: '压缩对话历史并提炼关键摘要', insert: '/compact' },
    { cmd: '/help', desc: '查看伙伴专属工具与指令清单', insert: '/help' },
    { cmd: '/cost', desc: '查看当前会话的 Token 消耗统计', insert: '/cost' },
  ].filter((c) => c.cmd.toLowerCase().includes(slashQuery));

  // Mention options driven dynamically by allBots
  const mentionItems: MentionOption[] = [
    ...allBots.map((b) => ({
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

  const handleSend = useCallback(async () => {
    const textToSend = inputVal.trim();
    if (!textToSend || isGenerating) return;

    const nowStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: BotChatMessage = {
      id: `bm-${Date.now()}`,
      role: 'user',
      sender: '我',
      avatar: '',
      content: textToSend,
      timestamp: nowStr,
    };

    const pendingAssistantMsg: BotChatMessage = {
      id: `bm-${Date.now() + 1}`,
      role: 'assistant',
      sender: currentBot.name,
      avatar: currentBot.avatar,
      content: '',
      timestamp: nowStr,
    };

    setMessages((prev) => [...prev, userMsg, pendingAssistantMsg]);
    setInputVal('');
    setShowSlashMenu(false);
    setShowMentionMenu(false);
    setIsGenerating(true);

    try {
      const result = await invoke('agent:chat', {
        directSessionId,
        roomId: directSessionId,
        botId: currentBot.id,
        content: textToSend,
        role: 'user',
      });

      if (result && result.replyContent) {
        setMessages((prev) => {
          const lastIdx = prev.length - 1;
          if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
            const updated = [...prev];
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: result.replyContent,
              timestamp: nowStr,
            };
            return updated;
          }
          return prev;
        });
      }
    } catch (err: any) {
      console.error('[BotSessionPage] agent:chat invoke failed:', err);
      setMessages((prev) => {
        const lastIdx = prev.length - 1;
        if (lastIdx >= 0 && prev[lastIdx].role === 'assistant') {
          const updated = [...prev];
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: `协同执行错误: ${err.message || '网关调用异常'}`,
            timestamp: nowStr,
          };
          return updated;
        }
        return prev;
      });
    } finally {
      setIsGenerating(false);
    }
  }, [inputVal, isGenerating, currentBot, invoke, directSessionId]);

  const toggleRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setInputVal((prev) => prev + (prev ? ' ' : '') + '请帮我梳理并执行当前模块的代码优化。');
    } else {
      setIsRecording(true);
    }
  };

  const handleAppendText = (text: string) => {
    setInputVal((prev) => prev + text);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface text-text-primary relative">
      {/* 1. Header */}
      <BotSessionHeader
        bot={currentBot}
        botName={botName}
        botTitle={botTitle}
        botModel={botModel}
        isVoiceCallActive={isVoiceCallActive}
        onToggleVoiceCall={() => setIsVoiceCallActive(!isVoiceCallActive)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 2. Chat Timeline Messages */}
      <BotSessionTimeline messages={messages} />

      {/* 3. Enhanced Composer */}
      <BotSessionComposer
        botName={botName}
        inputVal={inputVal}
        onInputChange={handleInputChange}
        onSend={handleSend}
        onAppendText={handleAppendText}
        textareaRef={textareaRef}
        showSlashMenu={showSlashMenu}
        slashCommands={slashCommands}
        onInsertSlash={insertSlash}
        showMentionMenu={showMentionMenu}
        mentionItems={mentionItems}
        onInsertMention={insertMention}
        isRecording={isRecording}
        recordingDuration={recordingDuration}
        onToggleRecording={toggleRecording}
        permissionMode={permissionMode}
        onTogglePermissionMode={() =>
          setPermissionMode((prev) => (prev === 'Auto' ? 'Ask' : 'Auto'))
        }
      />

      {/* 4. Settings Drawer */}
      <BotSettingsDrawer
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        bot={currentBot}
        botName={botName}
        setBotName={setBotName}
        botTitle={botTitle}
        setBotTitle={setBotTitle}
        botDepartment={botDepartment}
        setBotDepartment={setBotDepartment}
        botSystemPrompt={botSystemPrompt}
        setBotSystemPrompt={setBotSystemPrompt}
        botAutonomy={botAutonomy}
        setBotAutonomy={setBotAutonomy}
        botModel={botModel}
        setBotModel={setBotModel}
        memories={memories}
      />
    </div>
  );
}
