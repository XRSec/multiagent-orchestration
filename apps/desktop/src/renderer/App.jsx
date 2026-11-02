/**
 * App.jsx
 * Multi-Agent 桌面与 Web 核心容器：
 * 集成 Sidebar 会话管理、伙伴 1:1 私聊视图、伙伴群聊视图、
 * 伙伴配置抽屉（SOUL/MEMORY/Sandbox）与群聊配置抽屉（Profile/Members/DangerZone）。
 * 严格遵循单文件 <= 600 行规范。
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar.jsx';
import NewChatEmptyState from './components/NewChatEmptyState.jsx';
import RuntimeMonitor from './components/RuntimeMonitor.jsx';
import PartnerDirectChatView from './views/direct-chat/PartnerDirectChatView.jsx';
import BotGroupChatView from './views/group-chat/BotGroupChatView.jsx';
import PartnerSettingsDrawer from './views/partner-drawer/PartnerSettingsDrawer.jsx';
import GroupSettingsDrawer from './views/group-drawer/GroupSettingsDrawer.jsx';
import BotGroupCreateDialog from './views/dialogs/BotGroupCreateDialog.jsx';
import PartnerCreateDialog from './views/dialogs/PartnerCreateDialog.jsx';
import ExtensionConfigView from './views/extension-config/ExtensionConfigView.jsx';
import DistillationDiffView from './views/distillation-diff/DistillationDiffView.jsx';

import { mockPartners } from './mock/mockPartners.js';
import { mockGroupSessions } from './mock/mockGroupSessions.js';
import { defaultPlan } from './mock/mockPlanData.js';

const STORAGE_KEY_PARTNERS = 'multiagent_orchestration_partners_v1';
const STORAGE_KEY_SESSIONS = 'multiagent_orchestration_sessions_v1';
const STORAGE_KEY_ACTIVE_SESSION = 'multiagent_orchestration_active_session_id_v1';

function safeLoad(key, fallback) {
  if (typeof window === 'undefined' || !window.localStorage) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(fallback) && !Array.isArray(parsed) ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function safeSave(key, data) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore storage quota errors
  }
}

export default function App() {
  const [partners, setPartners] = useState(() => {
    return safeLoad(STORAGE_KEY_PARTNERS, mockPartners);
  });

  const [sessions, setSessions] = useState(() => {
    const fallbackSessions = mockGroupSessions.map((grp) => ({
      ...grp,
      kind: 'group',
      messages: (grp.messages || []).map((m) =>
        m.kind === 'plan' || m.id === 'msg-plan-demo'
          ? { ...m, plan: defaultPlan }
          : m
      ),
    }));
    return safeLoad(STORAGE_KEY_SESSIONS, fallbackSessions);
  });

  const [activeSessionId, setActiveSessionId] = useState(() => {
    return safeLoad(STORAGE_KEY_ACTIVE_SESSION, 'group-session-01');
  });

  // 持久化监听：伙伴、会话与激活状态在页面刷新时完整保留
  useEffect(() => {
    safeSave(STORAGE_KEY_PARTNERS, partners);
  }, [partners]);

  useEffect(() => {
    safeSave(STORAGE_KEY_SESSIONS, sessions);
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      safeSave(STORAGE_KEY_ACTIVE_SESSION, activeSessionId);
    }
  }, [activeSessionId]);

  // 启动时自动从磁盘扫描并加载已创建的所有物理群聊与伙伴
  useEffect(() => {
    if (typeof window === 'undefined') return;
    fetch('/api/groups')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ok && Array.isArray(data.groups) && data.groups.length > 0) {
          setSessions((prev) => {
            const diskGroupIds = new Set(data.groups.map((g) => g.id));
            const retained = prev.filter((s) => !diskGroupIds.has(s.id));
            return [...data.groups, ...retained];
          });
        }
      })
      .catch((err) => console.warn('[App] Disk groups sync warning:', err.message));

    fetch('/api/partners')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.ok && Array.isArray(data.partners) && data.partners.length > 0) {
          setPartners((prev) => {
            const serverPartnerIds = new Set(data.partners.map((p) => p.id));
            const retained = prev.filter((p) => !serverPartnerIds.has(p.id));
            return [...data.partners, ...retained];
          });
        }
      })
      .catch((err) => console.warn('[App] Disk partners sync warning:', err.message));
  }, []);

  const [currentView, setCurrentView] = useState('chat'); // 'chat' | 'extension-config' | 'distillation-diff'

  const [isExecuting, setIsExecuting] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState(null);

  // Drawer modal states
  const [partnerDrawerState, setPartnerDrawerState] = useState({ isOpen: false, partner: null });
  const [groupDrawerState, setGroupDrawerState] = useState({ isOpen: false, group: null });

  // Creation dialog states
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isCreatePartnerOpen, setIsCreatePartnerOpen] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];
  const isDirect = activeSession?.kind === 'direct';
  const isGroup = activeSession?.kind === 'group';

  // Active partner (for direct chat or active speaker)
  const activePartner =
    partners.find((p) => p.id === (activeSession?.partnerId || activeSession?.targetPartnerId)) ||
    partners[0];

  /**
   * 打开或切换伙伴的唯一 1:1 私聊频道 (Single Canonical DM per Partner)
   * 绝不重复创建，所有对同一伙伴的私聊集中在一个持久频道中
   */
  const handleOpenDirectChat = (partnerId = 'lead-orchestrator') => {
    const targetPartner = partners.find((p) => p.id === partnerId) || partners[0];
    const dmId = `dm_${targetPartner.id}`;

    setSessions((prev) => {
      // 若已有该伙伴的唯一私聊，直接保留
      if (prev.some((s) => s.id === dmId)) {
        return prev;
      }
      // 初始化该伙伴唯一私聊
      const newSession = {
        id: dmId,
        title: `与 ${targetPartner.name} 的私聊`,
        name: `与 ${targetPartner.name} 的私聊`,
        kind: 'direct',
        partnerId: targetPartner.id,
        targetPartnerId: targetPartner.id,
        partnerName: targetPartner.name,
        updatedAt: '刚刚',
        messages: [],
      };
      return [...prev, newSession];
    });

    setActiveSessionId(dmId);
  };

  const handleNewChat = handleOpenDirectChat;

  /**
   * 确认创建群聊 (来自 BotGroupCreateDialog)
   * 立即更新前端状态并在 ~/.multiagent-orchestration/groups/ 真实物理创建目录与配置
   */
  const handleCreateGroup = (newGroup) => {
    setSessions((prev) => [newGroup, ...prev]);
    setActiveSessionId(newGroup.id);

    // 触发后端在 ~/.multiagent-orchestration/groups/ 真实物理创建文件夹与群宪章
    if (typeof window !== 'undefined') {
      fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGroup),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.ok && data.group?.groupDir) {
            console.log('[App] 群聊物理文件夹已在磁盘生成:', data.group.groupDir);
          }
        })
        .catch((err) => console.error('[App] 创建群聊物理文件夹失败:', err));
    }
  };

  /**
   * 确认创建专属伙伴 (来自 PartnerCreateDialog)
   */
  const handleCreatePartner = (newPartner) => {
    setPartners((prev) => [...prev, newPartner]);
    const dmId = `dm_${newPartner.id}`;
    const newDmSession = {
      id: dmId,
      title: `与 ${newPartner.name} 的私聊`,
      name: `与 ${newPartner.name} 的私聊`,
      kind: 'direct',
      partnerId: newPartner.id,
      targetPartnerId: newPartner.id,
      partnerName: newPartner.name,
      updatedAt: '刚刚',
      messages: [],
    };
    setSessions((prev) => {
      if (prev.some((s) => s.id === dmId)) return prev;
      return [...prev, newDmSession];
    });
    setActiveSessionId(dmId);

    // 触发后端在 ~/.multiagent-orchestration/partners/ 真实物理创建伙伴与人设记忆
    if (typeof window !== 'undefined') {
      fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPartner),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.ok && data.partner?.partnerDir) {
            console.log('[App] 伙伴物理配置已在磁盘生成:', data.partner.partnerDir);
          }
        })
        .catch((err) => console.error('[App] 创建伙伴物理文件失败:', err));
    }
  };

  /**
   * 新建伙伴群聊快捷操作
   */
  const handleNewGroupChat = () => {
    setIsCreateGroupOpen(true);
  };

  /**
   * 发送消息处理：无论是私聊还是群聊，统一递增 sequence 并支持运行时排队
   */
  const handleSendMessage = ({ content, isDivision = false }) => {
    const text = typeof content === 'string' ? content : content?.content || '';
    if (!text.trim()) return;

    const currentMsgs = activeSession?.messages || [];
    const nextSeq = currentMsgs.length + 1;
    const isMidFlight = isExecuting;

    const userMsg = {
      id: `user-${Date.now()}`,
      sequence: nextSeq,
      clientId: `cid_${Date.now()}`,
      role: 'user',
      authorKind: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: text,
      isQueuedAmendment: isMidFlight,
    };

    // Update active session messages
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const newTitle = s.messages.length === 0 && s.title.startsWith('与') ? text.slice(0, 16) : s.title;
        return {
          ...s,
          title: newTitle,
          name: newTitle,
          updatedAt: '刚刚',
          messages: [...s.messages, userMsg],
        };
      })
    );

    if (isMidFlight) {
      return; // Queue delivered
    }

    // Trigger mock partner workflow
    triggerWorkflowTurn(text, activeSessionId, isGroup, isDivision);
  };

  const triggerWorkflowTurn = (instruction, sessionId, inGroup, isDivision) => {
    setIsExecuting(true);
    setActiveSpeaker({
      name: inGroup ? 'Lead Orchestrator' : activePartner.name,
      botId: inGroup ? 'lead-orchestrator' : activePartner.id,
      activity: isDivision ? '正在进行任务拆解与分工排期...' : '小模型意图预检介入 -> 主模型规划执行...',
    });

    setTimeout(() => {
      const currentSession = sessions.find((s) => s.id === sessionId);
      const pastUserMsgs = (currentSession?.messages || []).filter((m) => m.role === 'user');
      const turnIndex = Math.max(1, pastUserMsgs.length);

      // 构建多轮历史去脂蒸馏链
      const distilledHistory = [];
      if (turnIndex > 1) {
        for (let i = 1; i < turnIndex; i++) {
          const prevUser = pastUserMsgs[i - 1]?.content || `指令 #${i}`;
          distilledHistory.push({
            turn: i,
            distilledSummary: `去脂提炼：已收敛「${prevUser.slice(0, 22)}...」的核心约束，规避长文本历史重复注入。`,
          });
        }
      }

      // 小模型前置意图翻译
      let intentType = 'CODE_ARCHITECTURE';
      let requiredCaps = ['read', 'architecture'];
      let suggestedTools = ['read_file', 'inspect_ast'];
      if (/测试|test|run/i.test(instruction)) {
        intentType = 'TEST_EXECUTION';
        requiredCaps = ['exec', 'test'];
        suggestedTools = ['execute_bash', 'run_tests'];
      } else if (/写|改|创建|优化|patch|fix/i.test(instruction)) {
        intentType = 'FILE_MUTATION';
        requiredCaps = ['read', 'write'];
        suggestedTools = ['read_file', 'write_file', 'edit_file'];
      }

      const cleanGoal = instruction.replace(/[请问|麻烦你|谢谢|能否|帮我]/g, '').trim();
      const smallModelTranslation = turnIndex === 1
        ? `【小模型首轮翻译】剥离口语客套，锁定核心目标：“${cleanGoal}”，分配对应能力工具集。`
        : `【小模型多轮复合翻译】吸收前 ${turnIndex - 1} 轮蒸馏事实，锁定最新递进意图：“${cleanGoal}”，无缝衔接主模型。`;

      const preflight = {
        turnIndex,
        rawInput: instruction,
        distilledHistory,
        smallModelTranslation,
        intentType,
        requiredCapabilities: requiredCaps,
        suggestedTools,
        latencyMs: (0.42 + Math.random() * 0.35).toFixed(2),
        isBypass: false,
      };

      // 演示用三层渐进披露资源
      const progressiveResource = {
        resourceId: `spec-doc-${turnIndex}`,
        tag: 'ARCHITECTURE_SPEC',
        title: `${inGroup ? '群聊协同' : activePartner.name} 执行策略规范`,
        lines: 64 + turnIndex * 12,
        bytes: 2840 + turnIndex * 300,
        capsuleText: `遵循双平面隔离与单文件<=600行标准；静态前缀已锁定于 PrefixHash 缓存池；意图预检已就绪。`,
        fullContent: `# [0] ROOT: RUNTIME TASK EXECUTION CONSTRAINTS\n\n* [1] INTENT PREFLIGHT: 语言小模型完成多轮蒸馏翻译并送达主模型。\n* [2] DISCLOSURE TIER: 当前展示 Tier 3 全量切片，按需展开保护上下文。\n* [3] STEP SCRUBBER: 历史工具结果在 Step=6 阶梯衰减，首尾保留压缩。`,
      };

      // 演示用阶梯衰减工具输出 (step=1 为久远指纹，step=3 为首尾折叠，step=6 为最新完整)
      const toolCalls = [
        {
          name: 'inspect_project_structure',
          step: Math.max(1, turnIndex * 2 - 2),
          status: 'completed',
          args: { path: './apps/desktop' },
          result: `[Scrubbed Tree Output]\napps/desktop/src/main\napps/desktop/src/renderer\n... 24 more directories collapsed ...`,
        },
        {
          name: suggestedTools[0] || 'read_and_verify_spec',
          step: turnIndex * 2,
          status: 'completed',
          args: { target: cleanGoal.slice(0, 30) },
          result: `PASS: 目标意图「${cleanGoal.slice(0, 20)}」已成功通过控制面校验，执行状态正常。`,
        },
      ];

      const respSeq = (sessions.find((s) => s.id === sessionId)?.messages?.length || 0) + 1;
      let replyMsg;

      if (inGroup && isDivision) {
        // Output new Cindy Plan card
        replyMsg = {
          id: `plan-${Date.now()}`,
          sequence: respSeq,
          role: 'assistant',
          authorKind: 'bot',
          authorName: 'Lead Orchestrator',
          kind: 'plan',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: `收到分工要求：“${instruction}”。语言小模型意图预检与历史蒸馏分析完毕，已为当前群聊生成执行计划：`,
          preflight,
          progressiveResource,
          toolCalls,
          currentTurnStep: turnIndex * 2,
          plan: {
            id: `plan_${Date.now()}`,
            title: `任务分工：${cleanGoal.slice(0, 20)}`,
            status: 'running',
            projectDir: activeSession?.projectDir || '~/.multiagent-orchestration/partners/',
            steps: [
              { id: 'st-1', title: '提取目标协议签名与符号表', botId: 'rea-partner', botName: 'REA Partner', status: 'running' },
              { id: 'st-2', title: '构建端到端回归断言套件', botId: 'agent-architect', botName: 'Agent Architect', status: 'pending' },
            ],
          },
        };
      } else {
        replyMsg = {
          id: `bot-${Date.now()}`,
          sequence: respSeq,
          role: 'assistant',
          authorKind: 'bot',
          authorName: inGroup ? 'Lead Orchestrator' : activePartner.name,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          preflight,
          progressiveResource,
          toolCalls,
          currentTurnStep: turnIndex * 2,
          content: inGroup
            ? `收到群聊协同任务：“${instruction}”。小模型意图预检已完成，已通知 [@REA Partner](cindy://bot/rea-partner) 及 [@Agent Architect](cindy://bot/agent-architect) 加入讨论。`
            : `我是 **${activePartner.name}**。小模型意图预检分析完成，已吸收历史蒸馏上下文；当前指令“${cleanGoal}”正在双平面隔离沙箱中执行。`,
        };
      }

      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, messages: [...s.messages, replyMsg] } : s))
      );

      setIsExecuting(false);
      setActiveSpeaker(null);
    }, 1200);
  };

  /**
   * Plan step interactive action (Cindy style)
   */
  const handleStepAction = (action, stepId) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        return {
          ...s,
          messages: s.messages.map((m) => {
            if (!m.plan) return m;
            return {
              ...m,
              plan: {
                ...m.plan,
                steps: m.plan.steps.map((st) => (st.id === stepId ? { ...st, status: 'done' } : st)),
              },
            };
          }),
        };
      })
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-slate-100 font-sans">
      {/* 1. 左侧 Sidebar (包含新建对话、群聊列表与伙伴直连入口) */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        currentView={currentView}
        onSelectView={setCurrentView}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onNewGroupChat={handleNewGroupChat}
        onOpenCreateGroup={() => setIsCreateGroupOpen(true)}
        onOpenCreatePartner={() => setIsCreatePartnerOpen(true)}
        onOpenDirectChat={handleOpenDirectChat}
        onDeleteSession={(sid) => {
          if (sessions.length <= 1) return;
          const rem = sessions.filter((s) => s.id !== sid);
          setSessions(rem);
          if (activeSessionId === sid) setActiveSessionId(rem[0].id);
        }}
        partners={partners}
      />

      {/* 2. 中间视图分发器 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface/30">
        {currentView === 'extension-config' ? (
          <ExtensionConfigView
            partners={partners}
            onClose={() => setCurrentView('chat')}
          />
        ) : currentView === 'distillation-diff' ? (
          <DistillationDiffView
            partners={partners}
            onClose={() => setCurrentView('chat')}
          />
        ) : activeSession?.messages?.length === 0 ? (
          <NewChatEmptyState
            partners={partners}
            onSelectPrompt={(p) => handleSendMessage({ content: p })}
            onSelectPartner={(pid) => handleNewChat(pid)}
          />
        ) : isDirect ? (
          <PartnerDirectChatView
            partner={activePartner}
            onSendMessage={(txt) => handleSendMessage({ content: txt })}
            onOpenPartnerSettings={(p) => setPartnerDrawerState({ isOpen: true, partner: p })}
          />
        ) : (
          <BotGroupChatView
            group={activeSession}
            partners={partners}
            onSendMessage={handleSendMessage}
            onOpenGroupSettings={(grp) => setGroupDrawerState({ isOpen: true, group: grp })}
            onStepAction={handleStepAction}
            onStartPlan={() => {}}
            isExecuting={isExecuting}
            activeSpeaker={activeSpeaker}
          />
        )}
      </div>

      {/* 3. 右侧运行时监控遥测 (双平面沙箱监视) */}
      <RuntimeMonitor
        activePartner={activePartner}
        queueStats={{ pendingCount: isExecuting ? 1 : 0, tick: 1, isDraining: isExecuting }}
      />

      {/* 4. 伙伴配置抽屉 (SlideOverDrawer) */}
      <PartnerSettingsDrawer
        isOpen={partnerDrawerState.isOpen}
        partner={partnerDrawerState.partner || activePartner}
        onClose={() => setPartnerDrawerState({ isOpen: false, partner: null })}
        onUpdatePartner={(updated) => {
          setPartners((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        }}
      />

      {/* 5. 群聊配置抽屉 (SlideOverDrawer) */}
      <GroupSettingsDrawer
        isOpen={groupDrawerState.isOpen}
        group={groupDrawerState.group || activeSession}
        allPartners={partners}
        onClose={() => setGroupDrawerState({ isOpen: false, group: null })}
        onUpdateGroup={(updated) => {
          setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        }}
        onDissolveGroup={(gid) => {
          const rem = sessions.filter((s) => s.id !== gid);
          setSessions(rem);
          if (activeSessionId === gid) setActiveSessionId(rem[0]?.id || '');
        }}
      />

      {/* 6. 新建群聊模态弹窗 */}
      <BotGroupCreateDialog
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        allPartners={partners}
        onCreateGroup={handleCreateGroup}
      />

      {/* 7. 新建专属伙伴模态向导 */}
      <PartnerCreateDialog
        isOpen={isCreatePartnerOpen}
        onClose={() => setIsCreatePartnerOpen(false)}
        existingPartners={partners}
        onCreatePartner={handleCreatePartner}
      />
    </div>
  );
}
