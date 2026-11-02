import React, { useState } from 'react';
import { Bot, Shield, Cpu } from 'lucide-react';
import Sidebar from './components/Sidebar.jsx';
import SessionHeader from './components/SessionHeader.jsx';
import ChatTimeline from './components/ChatTimeline.jsx';
import MessageInput from './components/MessageInput.jsx';
import NewChatEmptyState from './components/NewChatEmptyState.jsx';
import RuntimeMonitor from './components/RuntimeMonitor.jsx';

const PARTNERS = [
  {
    id: 'lead-orchestrator',
    name: 'Lead Orchestrator',
    role: '主控多Agent调度器与会话路由器',
    icon: Bot,
    isLead: true,
    status: 'idle',
    queueCount: 0,
    skills: ['dispatch', 'relay', 'p2p-route'],
  },
  {
    id: 'agent-architect',
    name: 'Agent Architect',
    role: 'Agent 架构与脚手架设计伙伴',
    icon: Cpu,
    isLead: false,
    status: 'idle',
    queueCount: 0,
    skills: ['scaffold-partner', 'schema-validator'],
  },
  {
    id: 'rea-partner',
    name: 'REA Partner',
    role: '二进制与协议安全审计专家',
    icon: Shield,
    isLead: false,
    status: 'idle',
    queueCount: 0,
    skills: ['elf-audit', 'memory-trace'],
  },
];

const INITIAL_SESSIONS = [
  {
    id: 'session-demo-01',
    title: '协议安全审计与回归验证',
    kind: 'group',
    partnerId: 'lead-orchestrator',
    partnerName: '多Agent编排群',
    updatedAt: '10:24',
    messages: [
      {
        id: 'msg-init',
        role: 'assistant',
        senderName: 'Lead Orchestrator',
        timestamp: '10:24',
        content:
          '已接入多 Agent 运行平面。副 Agent 协作采用 Claude 原生消息排队机制：任何中途指示无需打断，在下方输入后自动排队递送。',
      },
    ],
  },
];

export default function App() {
  const [partners, setPartners] = useState(PARTNERS);
  const [sessions, setSessions] = useState(INITIAL_SESSIONS);
  const [activeSessionId, setActiveSessionId] = useState('session-demo-01');
  const [isExecuting, setIsExecuting] = useState(false);
  const [queueStats, setQueueStats] = useState({
    pendingCount: 0,
    tick: 1,
    isDraining: false,
  });

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const activePartner =
    partners.find((p) => p.id === activeSession?.partnerId) || partners[0];

  /**
   * 新建对话（单聊或指定伙伴）
   */
  const handleNewChat = (partnerId = 'lead-orchestrator') => {
    const partner = partners.find((p) => p.id === partnerId) || partners[0];
    const newId = `session-${Date.now().toString(36)}`;
    const newSession = {
      id: newId,
      title: `与 ${partner.name} 的对话`,
      kind: 'direct',
      partnerId: partner.id,
      partnerName: partner.name,
      updatedAt: '刚刚',
      messages: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  /**
   * 新建伙伴群聊（多 Agent 编排群）
   */
  const handleNewGroupChat = () => {
    const newId = `group-${Date.now().toString(36)}`;
    const newSession = {
      id: newId,
      title: `多 Agent 协同群聊 #${sessions.length + 1}`,
      kind: 'group',
      partnerId: 'lead-orchestrator',
      partnerName: '多Agent编排群',
      updatedAt: '刚刚',
      messages: [],
    };

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newId);
  };

  /**
   * 分叉对话（--fork-session）
   */
  const handleForkSession = (sourceSessionId) => {
    const src = sessions.find((s) => s.id === sourceSessionId);
    if (!src) return;

    const forkId = `fork-${Date.now().toString(36)}`;
    const forkedSession = {
      ...src,
      id: forkId,
      title: `${src.title} (分叉)`,
      updatedAt: '刚刚',
      messages: [...src.messages],
    };

    setSessions((prev) => [forkedSession, ...prev]);
    setActiveSessionId(forkId);
  };

  /**
   * 删除会话
   */
  const handleDeleteSession = (sessionId) => {
    if (sessions.length <= 1) return;
    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining[0].id);
    }
  };

  /**
   * 清空消息
   */
  const handleClearMessages = (sessionId) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, messages: [] } : s))
    );
  };

  /**
   * 自然发送消息：统一入口，支持运行途中随时追加（排队机制）
   */
  const handleSendMessage = (text) => {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    const isMidFlight = isExecuting;

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      timestamp,
      content: text,
      isQueuedAmendment: isMidFlight,
    };

    // 更新当前会话消息列表及标题
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const newTitle =
          s.messages.length === 0 && s.title.startsWith('与')
            ? text.slice(0, 18)
            : s.title;

        return {
          ...s,
          title: newTitle,
          updatedAt: '刚刚',
          messages: [...s.messages, userMsg],
        };
      })
    );

    // 若当前正在执行中：按照 Claude 原生排队机制压入队列
    if (isMidFlight) {
      setQueueStats((prev) => ({
        ...prev,
        pendingCount: prev.pendingCount + 1,
        tick: prev.tick + 1,
      }));

      setPartners((prev) =>
        prev.map((p) =>
          p.id === 'rea-partner'
            ? { ...p, queueCount: p.queueCount + 1 }
            : p
        )
      );
      return;
    }

    // 空闲状态：启动多 Agent 流水线
    runAgentWorkflow(text, activeSessionId);
  };

  const runAgentWorkflow = (instruction, targetSessionId) => {
    setIsExecuting(true);
    setPartners((prev) =>
      prev.map((p) => (p.isLead ? { ...p, status: 'busy' } : p))
    );

    setTimeout(() => {
      const orchestratorTurnMsg = {
        id: `orch-${Date.now()}`,
        role: 'assistant',
        senderName: 'Lead Orchestrator',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `收到任务：“${instruction}”。\n正在规划协作拓扑并派发并行任务：`,
        toolCalls: [
          {
            name: 'dispatch_and_queue_partners',
            status: 'completed',
            args: {
              subtasks: [
                { target: 'rea-partner', instruction: '校验协议报文与内存边界' },
                { target: 'agent-architect', instruction: '设计配套测试套件' },
              ],
            },
            result: { ticketIds: ['tk_rea_01', 'tk_arch_02'], status: 'queued' },
          },
        ],
        subagentTasks: [
          {
            ticketId: 'tk_rea_01',
            target: 'rea-partner',
            instruction: '校验协议报文与内存边界',
            status: 'running',
            pendingMessagesCount: 0,
          },
          {
            ticketId: 'tk_arch_02',
            target: 'agent-architect',
            instruction: '设计配套测试套件',
            status: 'running',
            pendingMessagesCount: 0,
          },
        ],
      };

      setSessions((prev) =>
        prev.map((s) =>
          s.id === targetSessionId
            ? { ...s, messages: [...s.messages, orchestratorTurnMsg] }
            : s
        )
      );

      setPartners((prev) =>
        prev.map((p) => (!p.isLead ? { ...p, status: 'busy' } : p))
      );

      setTimeout(() => {
        setQueueStats((prev) => ({ ...prev, pendingCount: 0, isDraining: false }));
        setPartners((prev) =>
          prev.map((p) => ({ ...p, status: 'idle', queueCount: 0 }))
        );
        setIsExecuting(false);

        const synthesisMsg = {
          id: `synthesis-${Date.now()}`,
          role: 'assistant',
          senderName: 'Lead Orchestrator',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content:
            '### 协同任务执行完成报告\n\n' +
            '1. **REA Partner**：已完成协议边界分析并注入沙箱校验。\n' +
            '2. **Agent Architect**：已根据规范生成测试套件。\n\n' +
            '所有子任务已全部完成并汇总。',
          toolCalls: [
            {
              name: 'await_partner_queue',
              status: 'resolved',
              args: { ticketIds: ['tk_rea_01', 'tk_arch_02'] },
              result: { code: 0, message: 'All subagents converged.' },
            },
          ],
        };

        setSessions((prev) =>
          prev.map((s) =>
            s.id === targetSessionId
              ? { ...s, messages: [...s.messages, synthesisMsg] }
              : s
          )
        );
      }, 6500);
    }, 1200);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-slate-100">
      {/* 1. 左侧会话侧边栏（包含新建对话、历史会话、伙伴直连） */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onNewGroupChat={handleNewGroupChat}
        onDeleteSession={handleDeleteSession}
        partners={partners}
      />

      {/* 2. 中间主工作区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface/30">
        <SessionHeader
          session={activeSession}
          partners={partners}
          onNewChat={handleNewChat}
          onForkSession={handleForkSession}
          onClearMessages={handleClearMessages}
        />

        {activeSession.messages.length === 0 ? (
          <NewChatEmptyState
            partners={partners}
            onSelectPrompt={(p) => handleSendMessage(p)}
            onSelectPartner={(partnerId) => handleNewChat(partnerId)}
          />
        ) : (
          <ChatTimeline
            messages={activeSession.messages}
            activePartner={activePartner}
          />
        )}

        <MessageInput
          onSendMessage={handleSendMessage}
          isExecuting={isExecuting}
          activePartnerName={activePartner.name}
          partners={partners}
        />
      </div>

      {/* 3. 右侧运行态遥测与双平面沙箱监视器 */}
      <RuntimeMonitor activePartner={activePartner} queueStats={queueStats} />
    </div>
  );
}
