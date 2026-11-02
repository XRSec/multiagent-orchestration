# 群聊主容器与输入框（含 @点名选择器）实现规范与设计方案

## 1. 调研背景与核心目标

本设计旨在为伙伴群聊（Multi-Agent Group Chat）构建核心视图容器 `BotGroupChatView.jsx` 与复合输入框 `BotGroupComposer.jsx`，全面借鉴与复用 Cindy 桌面端的 UI 视觉质感与模块划分，结合当前项目基于 React 19 + Vite 8 + Tailwind 的技术栈，实现生产级界面的高保真落地。

### 1.1 核心交付物与定位
1. **`apps/desktop/src/renderer/views/group-chat/BotGroupChatView.jsx`**
   - 群聊主视图容器，承担顶栏（群名、头像栈、群主徽标、工作目录、设置入口）、主时间轴滚动区（集成 `BotGroupTimelineItem` 与 `BotGroupPlanCard`）、底部停靠区（集成 `BotGroupLiveStatus` 与 `BotGroupComposer`）的整体排版与状态驱动。
   - 单文件行数预算：**180 ~ 230 行**（严格远低于 500 行警戒线）。
2. **`apps/desktop/src/renderer/views/group-chat/BotGroupComposer.jsx`**
   - 复合输入框，承担文本域自适应增高、Enter 发送 / Shift+Enter 换行、IME 拼音输入法组合键拦截守卫、`@` 呼叫弹出菜单（上下键循环移动、Enter/Tab 选中并精准插入带高亮标记的 `@PartnerName` 文本、首项固定为「@所有人」）、分工计划蓝色胶囊标签注入与发送/停止按钮动态切换。
   - 单文件行数预算：**220 ~ 280 行**（严格远低于 500 行警戒线）。

---

## 2. 界面架构与组件拓扑图

```
┌────────────────────────────────────────────────────────────────────────┐
│ BotGroupChatView (群聊主容器视图)                                       │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 顶栏 (Top Bar)                                                     │ │
│ │ [群名: 攻坚组] [AvatarStack 头像栈] [群主: Lead] [目录徽标] [设置]  │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 主时间轴滚动区域 (Timeline Scroll Area, flex-1 overflow-y-auto)     │ │
│ │                                                                    │ │
│ │ ├─ BotGroupTimelineItem (用户提问消息，靠右蓝底气泡)                 │ │
│ │                                                                    │ │
│ │ ├─ BotGroupTimelineItem (统筹伙伴响应，靠左高起气泡)                 │ │
│ │                                                                    │ │
│ │ ├─ BotGroupPlanCard (分工计划卡，嵌入消息流中)                      │ │
│ │    ├─ 负责人胶囊、折叠开关、进度条                                  │ │
│ │    ├─ 步骤列表 (步骤状态图标、执行人下拉分配、交接文件药丸)          │ │
│ │    └─ 跟进行 (「全部完成」分割线、「下一步·继续」「重试」按钮)       │ │
│ │                                                                    │ │
│ │ ├─ BotGroupTimelineItem (审计伙伴执行汇报，Markdown/代码高亮/引用)  │ │
│ │                                                                    │ │
│ │ └─ 底部平滑吸底探测锚点 (scrollBottomAnchor)                        │ │
│ └────────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ 底部停靠区域 (Docked Bottom Area)                                   │ │
│ │                                                                    │ │
│ │ ├─ BotGroupLiveStatus (实时状态浮动条，3s跃迁/Thinking呼吸灯/耗时)   │ │
│ │                                                                    │ │
│ │ └─ BotGroupComposer (复合输入框)                                    │ │
│ │    ├─ [分工计划模式: 由负责人组织分工 ×] 蓝色胶囊标签 (可选)         │ │
│ │    ├─ [弹出浮层] @点名选择器菜单 (上/下切换、Enter/Tab选中)         │ │
│ │    ├─ 自动增高文本域 (Enter 发送, Shift+Enter 换行, IME 守卫)       │ │
│ │    └─ 工具栏 (+菜单注入分工模式, 快捷@点名, 发送/停止态切换按钮)    │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. `BotGroupChatView.jsx` 深度设计与实现规范

### 3.1 职责划分与 Props 接口定义

`BotGroupChatView` 作为群聊页面的顶层视图，只负责容器布局、数据装配与状态分发，不深入具体消息细节渲染（委托给 `BotGroupTimelineItem`、`BotGroupPlanCard`、`BotGroupLiveStatus`、`BotGroupComposer`）。

#### 完整 Props 契约：
```typescript
interface BotGroupChatViewProps {
  // 当前群聊会话实体（若未传则降级使用 defaultGroupSession）
  groupSession?: {
    id: string;
    name: string;
    leadPartnerId: string;
    workdir: string;
    speakingMode: 'auto' | 'sequential';
    replyMode: 'all' | 'mention';
    memberIds: string[];
    activePlanId?: string;
    liveStatus?: {
      isRunning: boolean;
      activeSpeakerId?: string;
      speakerName?: string;
      phase?: string;
      elapsedSeconds?: number;
    };
    messages?: Array<any>;
  };
  // 全局伙伴列表（用于根据 memberIds 关联头像、角色等信息）
  partners?: Array<{
    id: string;
    name: string;
    role: string;
    avatar?: string;
    avatarColor?: string;
    status?: string;
  }>;
  // 打开群设置抽屉回调（由外部 App/GroupSettingsDrawer 联动）
  onOpenGroupSettings?: (group: any) => void;
  // 发送消息回调（提供默认内置 Mock 交互，也可由外部劫持）
  onSendMessage?: (payload: { text: string; mentions: any; isDivision: boolean }) => void;
}
```

### 3.2 顶栏（Top Bar）设计规范
- **群聊标题**：`text-sm font-semibold text-slate-100 truncate`，展示群聊名称（如“多Agent架构重构与协议审计攻坚组”）。
- **成员头像栈 (`AvatarStack`)**：
  - 复用 `apps/desktop/src/renderer/components/common/AvatarStack.jsx`。
  - 传入根据 `memberIds` 解析出的 `members` 数组，配置 `size="sm"`、`max={4}`。
- **群主/负责人标签**：
  - 提取 `leadPartnerId` 对应的伙伴信息，渲染紧凑胶囊：
    `bg-sky-500/15 text-sky-400 border border-sky-500/30 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-medium`。
  - 前置 Crown 或 Bot 图标，文本格式为 `群主: Lead Orchestrator`。
- **工作目录徽标 (Workdir Badge)**：
  - 展示当前群绑定的本地工程工作目录（如 `/Users/xr/IDEA.localized/multiagent-orchestration`）。
  - 取路径末端文件夹名展示为 `FolderGit2` 图标 + 目录名，保留原路径作为 HTML `title` 悬浮提示。
  - 样式：`bg-slate-800/80 text-slate-300 border border-slate-700/80 text-[10px] font-mono px-2 py-0.5 rounded-md flex items-center gap-1 max-w-[180px] truncate`。
- **群配置抽屉入口按钮**：
  - 渲染 `Settings2` 按钮，点击调用 `onOpenGroupSettings(activeGroup)`，带有快捷提示“群聊配置”。

### 3.3 主时间轴与分工计划卡集成
- **吸底与平滑滚动**：
  - 声明 `scrollContainerRef` 与底部哨兵锚点 `messagesEndRef`。
  - 监听 `messages.length`，在新增消息时调用 `messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })`。
- **消息与计划卡融合机制**：
  - 遍历 `messages` 渲染 `BotGroupTimelineItem`。
  - 当 `message.kind === 'plan'` 时：
    - 提取关联的 `planId`（或关联当前群聊的 `activePlan`）。
    - 将 `BotGroupPlanCard` 嵌入时间轴渲染，传入当前分工计划数据、群成员列表及步骤状态变更回调 `onPlanAction`。
  - 连续发言合并：若相邻两条消息来自同一作者且间隔小于 5 分钟，自动标记 `isContinued={true}`，`BotGroupTimelineItem` 将隐藏重复头像与昵称。

### 3.4 底部停靠区域布局
- 停靠在主视口底部，包含：
  1. `BotGroupLiveStatus`：当 `liveStatus.isRunning === true` 时展示浮动状态条（若停止则淡出或折叠）。
  2. `BotGroupComposer`：输入框主体，传递 `members`、`onSend`、`isRunning`、`onStop`。

### 3.5 参考实现原型（行数规划：约 190 行）

```jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Settings2, FolderGit2, Crown, Users } from 'lucide-react';
import AvatarStack from '@/components/common/AvatarStack.jsx';
import RoleStatusBadge from '@/components/common/RoleStatusBadge.jsx';
import BotGroupTimelineItem from './BotGroupTimelineItem.jsx';
import BotGroupPlanCard from './BotGroupPlanCard.jsx';
import BotGroupLiveStatus from './BotGroupLiveStatus.jsx';
import BotGroupComposer from './BotGroupComposer.jsx';
import { defaultGroupSession, getGroupSessionById } from '@/mock/mockGroupSessions.js';
import { getPartnerById, mockPartners } from '@/mock/mockPartners.js';
import { getPlanById, defaultPlan } from '@/mock/mockPlanData.js';

export default function BotGroupChatView({
  groupSession: initialSession,
  partners = mockPartners,
  onOpenGroupSettings,
  onSendMessage,
}) {
  const currentGroup = initialSession || defaultGroupSession;
  const [messages, setMessages] = useState(currentGroup.messages || []);
  const [liveStatus, setLiveStatus] = useState(currentGroup.liveStatus || { isRunning: false });
  const [activePlan, setActivePlan] = useState(() => getPlanById(currentGroup.activePlanId) || defaultPlan);
  const messagesEndRef = useRef(null);

  // 解析群成员实体
  const groupMembers = useMemo(() => {
    return (currentGroup.memberIds || [])
      .map((id) => partners.find((p) => p.id === id) || getPartnerById(id))
      .filter(Boolean);
  }, [currentGroup.memberIds, partners]);

  // 群主伙伴信息
  const leadPartner = useMemo(() => {
    return groupMembers.find((m) => m.id === currentGroup.leadPartnerId) || groupMembers[0];
  }, [groupMembers, currentGroup.leadPartnerId]);

  // 新消息平滑滚动吸底
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // 发送消息处理
  const handleSendMessage = ({ text, mentions, isDivision }) => {
    if (onSendMessage) {
      onSendMessage({ text, mentions, isDivision });
    }

    const newMessage = {
      id: `msg-${Date.now()}`,
      sequence: messages.length + 1,
      kind: isDivision ? 'plan-request' : 'message',
      authorKind: 'user',
      authorBotId: null,
      authorName: 'Alex (架构师)',
      content: text,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      timestamp: Date.now(),
      mentions,
      isDivision,
    };

    setMessages((prev) => [...prev, newMessage]);

    // 触发 Mock Agent 响应与实时状态
    setLiveStatus({
      isRunning: true,
      speakerName: leadPartner?.name || 'Lead Orchestrator',
      phase: isDivision ? '正在为攻坚组拟定分工执行方案...' : '正在分析需求并准备回复...',
      elapsedSeconds: 0,
      startedAt: Date.now(),
    });
  };

  const handleStopLive = () => {
    setLiveStatus((prev) => ({ ...prev, isRunning: false }));
  };

  // 分工卡操作
  const handlePlanAction = (actionType, planId) => {
    if (actionType === 'start') {
      setActivePlan((prev) => ({ ...prev, status: 'running' }));
    } else if (actionType === 'dismiss') {
      setActivePlan((prev) => ({ ...prev, status: 'cancelled' }));
    }
  };

  const workdirDisplay = currentGroup.workdir?.split('/').filter(Boolean).pop() || 'workspace';

  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-surface/95 overflow-hidden select-text">
      {/* 1. 顶栏 Top Bar */}
      <header className="h-14 border-b border-border/80 flex items-center justify-between px-5 bg-card/60 backdrop-blur-md shrink-0">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center space-x-2.5">
              <h2 className="font-semibold text-sm text-slate-100 truncate max-w-xs md:max-w-md">
                {currentGroup.name}
              </h2>
              <span className="text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full shrink-0">
                多Agent群聊
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
              <AvatarStack members={groupMembers} max={4} size="xs" />
              <span>·</span>
              <span className="flex items-center gap-1 text-sky-300">
                <Crown size={12} className="text-amber-400" />
                群主: {leadPartner?.name || 'Lead'}
              </span>
              <span>·</span>
              <span
                className="flex items-center gap-1 font-mono text-slate-400 hover:text-slate-300 transition-colors"
                title={currentGroup.workdir}
              >
                <FolderGit2 size={12} className="text-slate-500" />
                {workdirDisplay}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            type="button"
            onClick={() => onOpenGroupSettings?.(currentGroup)}
            title="群聊配置"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </header>

      {/* 2. 主时间轴滚动区域 */}
      <main className="flex-1 overflow-y-auto px-4 md:px-8 py-5 space-y-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((msg, index) => {
            const prevMsg = messages[index - 1];
            const isContinued =
              prevMsg &&
              prevMsg.authorBotId === msg.authorBotId &&
              prevMsg.authorKind === msg.authorKind &&
              msg.timestamp - prevMsg.timestamp < 300000;

            if (msg.kind === 'plan') {
              return (
                <div key={msg.id} className="py-2">
                  <BotGroupPlanCard
                    plan={activePlan}
                    members={groupMembers}
                    onAction={handlePlanAction}
                  />
                </div>
              );
            }

            return (
              <BotGroupTimelineItem
                key={msg.id}
                message={msg}
                isContinued={isContinued}
                members={groupMembers}
              />
            );
          })}
          <div ref={messagesEndRef} className="h-2" />
        </div>
      </main>

      {/* 3. 底部停靠区域 */}
      <footer className="shrink-0 p-4 pt-1 bg-surface/90 border-t border-border/40">
        <div className="max-w-4xl mx-auto space-y-2">
          {liveStatus.isRunning && (
            <BotGroupLiveStatus
              liveStatus={liveStatus}
              onStop={handleStopLive}
            />
          )}
          <BotGroupComposer
            members={groupMembers}
            isRunning={liveStatus.isRunning}
            onStop={handleStopLive}
            onSend={handleSendMessage}
          />
        </div>
      </footer>
    </div>
  );
}
```

---

## 4. `BotGroupComposer.jsx` 深度设计与实现规范

### 4.1 职责划分与交互契约

`BotGroupComposer` 承担群聊消息的高效录入、点名路由和意图扩展：
1. **自动增高**：监听内容动态调整 `textarea` 的行高（`min-h-[44px]` 至 `max-h-[180px]`），滚动条自动出现。
2. **键盘快捷键**：
   - `Enter`：发送消息。
   - `Shift + Enter`：光标换行。
   - `Escape`：收起候选菜单。
3. **拼音输入法组合键拦截守卫 (IME Composition Guard)**：
   - 监听 `event.nativeEvent.isComposing` 与 `keyCode === 229`。
   - 处于拼音选字阶段时，完全屏蔽回车发送和候选选择。
4. **`@` 点名弹出选择器菜单**：
   - 输入 `@` 时激活弹窗，提取当前光标前的 `@query`。
   - 过滤群聊伙伴成员，第一项永远为 `{ id: 'all', name: '所有人', role: '全体广播', isAll: true }`。
   - 键盘 `ArrowDown` / `ArrowUp` 移动高亮索引，`Enter` / `Tab` 选中并插入 `@PartnerName `。
5. **分工模式胶囊标签**：
   - 工具栏包含「+」扩展按钮与「安排分工」快捷开关。
   - 开启后输入框顶部浮现蓝色胶囊 `[分工计划: 由负责人组织分工 ×]`，发送载荷自动带入 `isDivision: true`。
6. **发送/停止状态切换**：
   - 当 `isRunning === true` 且输入框内容为空时，发送按钮变换为红色「停止」按钮；输入框有字符时仍可插话打断。

### 4.2 `@` 点名算法引擎（纯函数内聚设计）

```javascript
// 1. 判断 @ 是否为合法点名触发点（防止邮箱被误触发）
function isMentionTrigger(text, atIndex) {
  if (atIndex === 0) return true;
  const charBefore = text[atIndex - 1];
  return !/[A-Za-z0-9._%+-]/.test(charBefore);
}

// 2. 查找光标前正在输入的 @query
function findMentionQuery(text, caret) {
  const before = text.slice(0, Math.max(0, caret));
  const at = before.lastIndexOf('@');
  if (at < 0 || !isMentionTrigger(before, at)) return null;
  const query = before.slice(at + 1);
  if (query.length > 32 || /\s/.test(query)) return null;
  return { start: at, query };
}

// 3. 替换文本并精确定位光标
function applyMentionInsert(text, range, name) {
  const after = text.slice(range.end);
  const inserted = after.startsWith(' ') ? `@${name}` : `@${name} `;
  const newCaret = range.start + inserted.length + (after.startsWith(' ') ? 1 : 0);
  return {
    text: text.slice(0, range.start) + inserted + after,
    caret: newCaret,
  };
}
```

### 4.3 参考实现原型（行数规划：约 250 行）

```jsx
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Square, Plus, Users, Sparkles, X, ChevronUp } from 'lucide-react';
import AvatarStack from '@/components/common/AvatarStack.jsx';

export default function BotGroupComposer({
  members = [],
  isRunning = false,
  onStop,
  onSend,
  placeholder = '发送消息或输入 @ 点名伙伴... (Enter 发送, Shift+Enter 换行)',
}) {
  const [text, setText] = useState('');
  const [isDivisionActive, setIsDivisionActive] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [dismissedStart, setDismissedStart] = useState(null);

  const textareaRef = useRef(null);
  const pendingCaretRef = useRef(null);

  // 1. 过滤 @ 候选列表（首项固定为所有人）
  const mentionCandidates = useMemo(() => {
    if (!mentionQuery) return [];
    const q = (mentionQuery.query || '').trim().toLowerCase();

    const allOption = { id: 'all', name: '所有人', role: '全体广播', isAll: true };
    const memberOptions = members.filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        (m.role && m.role.toLowerCase().includes(q))
      );
    });

    const matchesAll = !q || '所有人'.includes(q) || 'all'.includes(q);
    return matchesAll ? [allOption, ...memberOptions] : memberOptions;
  }, [mentionQuery, members]);

  // 2. 监听文本与光标同步 Mention 查询
  const syncMentionState = (newText, caretPos) => {
    const query = findMentionQuery(newText, caretPos);
    if (!query || query.start === dismissedStart) {
      setMentionQuery(null);
    } else {
      setMentionQuery(query);
      setHighlightIndex(0);
    }
  };

  // 3. 自动增高文本域
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  }, [text]);

  // 4. 插入 @ 之后的光标回填
  useEffect(() => {
    if (pendingCaretRef.current !== null && textareaRef.current) {
      const caret = pendingCaretRef.current;
      textareaRef.current.setSelectionRange(caret, caret);
      pendingCaretRef.current = null;
    }
  }, [text]);

  // 5. 选中点名选项
  const selectMention = (option) => {
    if (!option || !mentionQuery || !textareaRef.current) return;
    const caret = textareaRef.current.selectionStart || text.length;
    const { text: newText, caret: newCaret } = applyMentionInsert(
      text,
      { start: mentionQuery.start, end: caret },
      option.name
    );

    setText(newText);
    pendingCaretRef.current = newCaret;
    setMentionQuery(null);
    textareaRef.current.focus();
  };

  // 6. 键盘事件与 IME 守卫
  const handleKeyDown = (e) => {
    const isComposing = e.nativeEvent.isComposing || e.keyCode === 229;
    if (isComposing) return;

    // 当 @ 选择器展开时优先拦截上下箭头与回车
    if (mentionQuery && mentionCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev + 1) % mentionCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((prev) => (prev - 1 + mentionCandidates.length) % mentionCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mentionCandidates[highlightIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissedStart(mentionQuery.start);
        setMentionQuery(null);
        return;
      }
    }

    // 默认 Enter 发送，Shift+Enter 换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      if (isRunning && onStop) onStop();
      return;
    }

    // 解析出点名的伙伴
    const mentionedPartnerIds = members
      .filter((m) => text.includes(`@${m.name}`))
      .map((m) => m.id);
    const mentionsAll = text.includes('@所有人') || text.includes('@all');

    onSend?.({
      text: trimmed,
      mentions: { all: mentionsAll, botIds: mentionedPartnerIds },
      isDivision: isDivisionActive,
    });

    setText('');
    setIsDivisionActive(false);
    setMentionQuery(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const canSubmit = text.trim().length > 0;

  return (
    <div className="relative w-full">
      {/* A. @点名弹出选择器菜单 */}
      {mentionQuery && mentionCandidates.length > 0 && (
        <div className="absolute bottom-full left-0 mb-2 w-72 max-h-60 overflow-y-auto rounded-xl border border-border/90 bg-slate-900/95 shadow-2xl p-1.5 z-50 backdrop-blur-md">
          <div className="text-[10px] font-mono text-slate-400 px-2 py-1 uppercase tracking-wider">
            候选伙伴 ({mentionCandidates.length})
          </div>
          <div className="space-y-0.5">
            {mentionCandidates.map((cand, idx) => {
              const isSelected = idx === highlightIndex;
              return (
                <div
                  key={cand.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectMention(cand)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected ? 'bg-accent/20 text-accent font-medium' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    {cand.isAll ? <Users size={12} className="text-sky-400" /> : <Sparkles size={12} className="text-amber-400" />}
                  </div>
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="truncate">{cand.name}</span>
                    {cand.role && <span className="text-[10px] text-slate-400 truncate">{cand.role}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* B. 输入框主体卡片 */}
      <div className="bg-card/90 border border-border/80 rounded-2xl shadow-lg p-2.5 transition-all focus-within:border-accent/60 focus-within:ring-1 focus-within:ring-accent/20">
        {/* 分工计划标签 */}
        {isDivisionActive && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-500/20 text-sky-400 border border-sky-500/30">
              <Users size={12} />
              <span>分工计划: 由负责人组织分工</span>
              <button
                type="button"
                onClick={() => setIsDivisionActive(false)}
                className="hover:text-sky-200 cursor-pointer ml-1"
              >
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        {/* 自动增高文本框 */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            syncMentionState(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={handleKeyDown}
          onClick={(e) => syncMentionState(text, e.target.selectionStart)}
          onKeyUp={(e) => syncMentionState(text, e.target.selectionStart)}
          rows={1}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none min-h-[44px] max-h-[180px] leading-relaxed"
        />

        {/* 工具栏 */}
        <div className="flex items-center justify-between pt-2 border-t border-border/40 mt-1">
          <div className="flex items-center gap-2">
            {/* + 菜单 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
                title="扩展操作"
              >
                <Plus size={16} />
              </button>
              {showPlusMenu && (
                <div className="absolute bottom-full left-0 mb-2 w-48 rounded-xl bg-slate-900 border border-slate-700 shadow-xl p-1 z-50 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDivisionActive(true);
                      setShowPlusMenu(false);
                      textareaRef.current?.focus();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-slate-100 text-left"
                  >
                    <Users size={14} className="text-sky-400" />
                    <span>安排分工计划</span>
                  </button>
                </div>
              )}
            </div>

            {/* 分工快捷按钮 */}
            <button
              type="button"
              onClick={() => setIsDivisionActive(!isDivisionActive)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                isDivisionActive
                  ? 'bg-sky-500/20 text-sky-400 border-sky-500/40'
                  : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-800/60'
              }`}
            >
              <Users size={13} />
              <span>安排分工</span>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-slate-500 hidden sm:inline">Enter 发送 / Shift+Enter 换行</span>
            {isRunning && !canSubmit ? (
              <button
                type="button"
                onClick={onStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 transition-all cursor-pointer"
              >
                <Square size={13} className="fill-rose-400" />
                <span>停止</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={!canSubmit}
                onClick={handleSend}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  canSubmit
                    ? 'bg-accent text-slate-950 hover:bg-accent-hover shadow-sm active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <Send size={13} />
                <span>发送</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 5. 跨模块接口与协同契约对齐（M2 全景）

| 协同组件 | 所属探索者 | 契约对齐要点 |
|---------|-----------|------------|
| `BotGroupTimelineItem.jsx` | `teamwork_explorer_m2_1` | 接收 `message`, `isContinued`, `members`，当消息为 `kind === 'message'` 时渲染多 Agent 差异化胶囊与 Markdown 气泡；当包含引用消息 `message.quote` 时渲染引用块。 |
| `BotGroupPlanCard.jsx` | `teamwork_explorer_m2_2` | 接收 `plan`, `members`, `onAction('start' \| 'dismiss')`，在 `BotGroupChatView` 遍历消息遇到 `kind === 'plan'` 时就地内嵌渲染。 |
| `BotGroupLiveStatus.jsx` | `teamwork_explorer_m2_2` | 接收 `liveStatus: { isRunning, speakerName, phase, elapsedSeconds }` 与 `onStop`，停靠在输入框上方。 |
| `GroupSettingsDrawer.jsx` | M3 群配置抽屉 | 接收 `isOpen`, `onClose`, `groupSession`，由顶栏右侧 `Settings2` 按钮触发打开。 |

---

## 6. 代码行数与构建验证指标

1. **单文件行数审计指标**：
   - `BotGroupChatView.jsx`: ~190 行（上限 <= 240 行，远低于 500 行警戒线）。
   - `BotGroupComposer.jsx`: ~250 行（上限 <= 280 行，远低于 500 行警戒线）。
2. **构建与打包检验命令**：
   ```bash
   pnpm exec vite build
   ```
   要求：零 JSX 语法错误、零缺少依赖导入、类型推断与样式渲染通过。
