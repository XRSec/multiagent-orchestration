import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ArrowLeft,
  AtSign,
  ArrowUp,
  Sparkles,
  Bot,
  MessageSquare,
  Shield,
  Layers,
} from 'lucide-react';
import { MOCK_BOTS } from '@/mock/bots';
import { IntentPreflightCard, IntentPreflightData } from '@/components/control-plane/IntentPreflightCard';
import { ProgressiveDisclosureCard } from '@/components/control-plane/ProgressiveDisclosureCard';
import { ToolDecayScrubberCard } from '@/components/control-plane/ToolDecayScrubberCard';

interface GroupMessage {
  id: string;
  sender: string;
  avatar: string;
  content: string;
  timestamp: string;
  badge: string;
  preflight?: IntentPreflightData;
  progressiveResource?: any;
  toolCalls?: any[];
  currentTurnStep?: number;
}

export function BotGroupChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<GroupMessage[]>([
    {
      id: 'g-1',
      sender: 'Sophia (Product)',
      avatar: '/assets/agent-island-erika.png',
      content: '大家注意，Cindy Web 端需要完成所有 App UI 页面壳子的完整适配与 Mock 数据的无缝联调。',
      timestamp: '14:20',
      badge: '产品参谋',
    },
    {
      id: 'g-2',
      sender: 'Devon (Developer)',
      avatar: '/assets/agent-island-boli.png',
      content: '@Sophia 收到！开发端已经将 Vite 6、Tailwind CSS、三层路由树全部就绪，正在搭建各 Feature 页面。',
      timestamp: '14:21',
      badge: '全栈开发',
    },
    {
      id: 'g-3',
      sender: 'Ada (Reviewer)',
      avatar: '/assets/agent-island-annie.png',
      content: '我会紧跟审查代码，重点确认设计系统 Token 映射与响应式抽屉的防溢出边界。',
      timestamp: '14:22',
      badge: '架构审查',
    },
  ]);
  const [inputVal, setInputVal] = useState('');

  const handleSend = () => {
    if (!inputVal.trim()) return;
    const promptText = inputVal.trim();
    const pastUserTurns = messages.filter((m: any) => m.sender === '我');
    const turnIndex = pastUserTurns.length + 1;

    const userMsg = {
      id: `g-${Date.now()}`,
      sender: '我',
      avatar: '/assets/cindy-avatar-account.png',
      content: promptText,
      timestamp: '刚刚',
      badge: '群主',
    };

    // 构建多轮历史去脂蒸馏链
    const distilledHistory = [];
    if (turnIndex > 1) {
      for (let i = 1; i < turnIndex; i++) {
        const prevInput = pastUserTurns[i - 1]?.content || `群需求 #${i}`;
        distilledHistory.push({
          turn: i,
          distilledSummary: `群协作蒸馏：已同步前置「${prevInput.slice(0, 24)}...」分工产物，避免群历史反复重传。`,
        });
      }
    }

    const cleanGoal = promptText.replace(/[请问|麻烦你|谢谢|能否|帮我]/g, '').trim();
    const preflight: IntentPreflightData = {
      turnIndex,
      rawInput: promptText,
      distilledHistory,
      smallModelTranslation: turnIndex === 1
        ? `【群小模型首轮翻译】提取群协同目标：“${cleanGoal}”，自动分配至产品与开发伙伴。`
        : `【群小模型多轮复合翻译】吸收前 ${turnIndex - 1} 轮群蒸馏共识，锁定最新冲刺目标：“${cleanGoal}”，递交群负责人。`,
      intentType: 'GROUP_ORCHESTRATION',
      requiredCapabilities: ['orchestration', 'workflow'],
      suggestedTools: ['dispatch_and_queue', 'await_queue'],
      latencyMs: (0.4 + Math.random() * 0.3).toFixed(2),
      isBypass: false,
    };

    const progressiveResource = {
      resourceId: `group-charter-${turnIndex}`,
      tag: 'GROUP_CHARTER',
      title: 'Cindy 核心研发群协同宪章与分工',
      lines: 96 + turnIndex * 10,
      bytes: 3800 + turnIndex * 200,
      capsuleText: '全员遵守 STANDING_ORDER.md 架构约束；群共享黑板已落盘至 GROUP_MEMORY.md；主干前缀哈希已锁定。',
      fullContent: `# [0] ROOT: GROUP TASKFORCE CHARTER\n\n* [1] INTENT PREFLIGHT: 意图预检完成群指令去脂与多轮蒸馏翻译。\n* [2] DISCLOSURE TIER: 当前展示 Tier 3 全量切片，按需展开保护上下文。\n* [3] STEP SCRUBBER: 历史工具结果在 Step=6 阶梯衰减，首尾保留压缩。`,
    };

    const toolCalls = [
      {
        name: 'orchestrator_sync_blackboard',
        step: Math.max(1, turnIndex * 2 - 2),
        status: 'completed',
        args: { scope: 'group-m1' },
        result: `[Scrubbed Group Blackboard]\nFact #1: 架构规范与单文件限制已建立\n... 18 more blackboard facts collapsed ...`,
      },
      {
        name: 'dispatch_partner_tasks',
        step: turnIndex * 2,
        status: 'completed',
        args: { goal: cleanGoal.slice(0, 24) },
        result: `SUCCESS: 已为 Sophia 及 Devon 派发协同子任务，等待队列确认。`,
      },
    ];

    const replyMsg = {
      id: `g-${Date.now() + 1}`,
      sender: 'Sophia (Product)',
      avatar: '/assets/agent-island-erika.png',
      content: `收到群主指令！已通过小模型完成意图预检与历史蒸馏分析，正在调度群伙伴全力执行：“${cleanGoal}”。`,
      timestamp: '刚刚',
      badge: '产品参谋',
      preflight,
      progressiveResource,
      toolCalls,
      currentTurnStep: turnIndex * 2,
    };

    setMessages((prev: any) => [...prev, userMsg, replyMsg]);
    setInputVal('');
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none bg-surface">
      {/* 1. Group Header */}
      <div className="h-14 px-4 border-b border-border-default bg-surface-elevated/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/bots')}
            className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Users className="w-4 h-4 text-accent-purple" />
              <span>Cindy 核心研发协同群 (M1 Architecture Team)</span>
            </div>
            <div className="text-[10px] text-text-tertiary">
              4 位 AI 伙伴在线 · 协同模式开启
            </div>
          </div>
        </div>

        {/* Member Avatars */}
        <div className="flex items-center -space-x-1.5 overflow-hidden">
          {MOCK_BOTS.map((bot) => (
            <img
              key={bot.id}
              src={bot.avatar}
              alt={bot.name}
              title={bot.name}
              className="w-7 h-7 rounded-full border-2 border-surface object-cover"
            />
          ))}
        </div>
      </div>

      {/* 2. Group Timeline */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl w-full mx-auto">
        {messages.map((m) => (
          <div key={m.id} className="flex gap-3">
            <img
              src={m.avatar}
              alt=""
              className="w-8 h-8 rounded-xl object-cover shrink-0 border border-border-default"
            />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-text-primary">{m.sender}</span>
                <span className="text-[10px] bg-surface-chip text-text-tertiary px-1.5 py-0.2 rounded font-medium">
                  {m.badge}
                </span>
                <span className="text-[10px] text-text-tertiary font-mono ml-auto">
                  {m.timestamp}
                </span>
              </div>
              <div className="p-3 bg-surface-elevated border border-border-default rounded-2xl rounded-tl-sm text-xs text-text-primary leading-relaxed shadow-sm">
                {/* 1. 意图预检分析卡片 */}
                {m.preflight && (
                  <div className="mb-2">
                    <IntentPreflightCard preflight={m.preflight} />
                  </div>
                )}

                <p>{m.content}</p>

                {/* 2. 三层渐进披露卡片 */}
                {m.progressiveResource && (
                  <div className="mt-2">
                    <ProgressiveDisclosureCard {...m.progressiveResource} />
                  </div>
                )}

                {/* 3. 历史工具输出阶梯衰减卡片 */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {m.toolCalls.map((t: any, idx: number) => (
                      <ToolDecayScrubberCard
                        key={idx}
                        toolName={t.name}
                        step={t.step || (idx + 1)}
                        currentTurnStep={m.currentTurnStep || 6}
                        args={t.args}
                        rawOutput={t.result}
                        status={t.status}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Bottom Composer */}
      <div className="p-4 border-t border-border-default bg-surface shrink-0">
        <div className="max-w-3xl mx-auto bg-surface-elevated border border-border-default rounded-2xl shadow-md p-2 flex items-center gap-2">
          <button
            title="提及 @伙伴"
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-tertiary hover:text-text-primary transition-colors"
          >
            <AtSign className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="在群组中发言，输入 @ 提及特定伙伴..."
            className="flex-1 bg-transparent px-2 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputVal.trim()}
            className={`p-2 rounded-xl transition-colors ${
              inputVal.trim()
                ? 'bg-accent-cta text-accent-cta-fg hover:bg-accent-hover'
                : 'bg-surface-chip text-text-disabled cursor-not-allowed'
            }`}
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
