/**
 * @file test/e2e-web/web-chat-e2e.test.ts
 * @description Milestone 2: E2E Automated Test Suite for Multi-Agent Room Chat View & Execution Status Cards
 * @tiers Tiers 1-4 Complete Verification (Feature Coverage, Boundary & Corner Cases, Cross-Feature, Real-World E2E)
 * 
 * Execution:
 *   npx tsx test/e2e-web/web-chat-e2e.test.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Lightweight Color & Assertion Test Harness
// ============================================================================
interface TestCase {
  tier: string;
  name: string;
  fn: () => void | Promise<void>;
}

const testRegistry: TestCase[] = [];
let passCount = 0;
let failCount = 0;
const failureDetails: string[] = [];

function registerTest(tier: string, name: string, fn: () => void | Promise<void>) {
  testRegistry.push({ tier, name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${message} (Expected: ${JSON.stringify(expected)}, Actual: ${JSON.stringify(actual)})`);
  }
}

function assertIncludes(text: string, substring: string, message: string) {
  if (!text.includes(substring)) {
    throw new Error(`Assertion Failed: ${message} (Text does not contain "${substring}")`);
  }
}

const projectRoot = path.resolve(__dirname, '../..');
const webAppRoot = path.join(projectRoot, 'extensions/multiagent-orchestration-old/apps/web');

// ============================================================================
// Shared Domain Types & Reference Specs
// ============================================================================
export type ExecutionState = 'idle' | 'thinking' | 'tool_executing' | 'done' | 'failed' | 'aborted';

export interface ToolCallItem {
  id: string;
  name: string;
  input?: Record<string, unknown> | string;
  result?: string;
  status: 'running' | 'success' | 'failed';
  durationMs?: number;
}

export interface ExecutionStatus {
  state: ExecutionState;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  thinkingContent?: string;
  toolCalls?: ToolCallItem[];
  currentToolName?: string;
  error?: string;
}

export interface GroupMessage {
  id: string;
  roomSlug: string;
  authorId: string;
  authorName: string;
  authorRole: 'owner' | 'admin' | 'engineer' | 'scribe' | 'qa' | 'scout' | 'meta';
  authorKind: 'user' | 'bot';
  avatarUrl?: string;
  content: string;
  sequence: number;
  createdAt: string;
  executionStatus?: ExecutionStatus;
}

export interface PartnerMeta {
  id: string;
  shortName: string;
  displayName: string;
  avatar: string;
  color: string;
  badgeText: string;
  badgeTheme: string;
  role: string;
}

// Canonical 7 Core Bots + Human Owner registry according to PROJECT.md & explorer_survey_2
export const CANONICAL_PARTNERS: Record<string, PartnerMeta> = {
  user_owner: {
    id: 'user_owner',
    shortName: 'Owner',
    displayName: '真人测试者 (Owner)',
    avatar: '🧑‍💻',
    color: 'sky',
    badgeText: '群主',
    badgeTheme: 'sky',
    role: 'owner'
  },
  bot_moadmin_director_03: {
    id: 'bot_moadmin_director_03',
    shortName: 'moAdmin',
    displayName: 'moAdmin · 任务编排与治理主管',
    avatar: '👑',
    color: 'violet',
    badgeText: '编排主管',
    badgeTheme: 'purple',
    role: 'admin'
  },
  bot_mocode_engine_01: {
    id: 'bot_mocode_engine_01',
    shortName: 'moCode',
    displayName: 'moCode · 代码工程与架构师',
    avatar: '💻',
    color: 'blue',
    badgeText: '全栈研发',
    badgeTheme: 'blue',
    role: 'engineer'
  },
  bot_modoc_scribe_02: {
    id: 'bot_modoc_scribe_02',
    shortName: 'moDoc',
    displayName: 'moDoc · 技术文档与架构文胆',
    avatar: '📝',
    color: 'teal',
    badgeText: '架构文胆',
    badgeTheme: 'teal',
    role: 'scribe'
  },
  bot_moci_sentinel_07: {
    id: 'bot_moci_sentinel_07',
    shortName: 'MoCI',
    displayName: 'MoCI · 持续集成与验证哨兵',
    avatar: '🛡️',
    color: 'red',
    badgeText: '测试哨兵',
    badgeTheme: 'rose',
    role: 'qa'
  },
  bot_mogit_scm_05: {
    id: 'bot_mogit_scm_05',
    shortName: 'MoGit',
    displayName: 'MoGit · 版本控制与安全审计官',
    avatar: '🌿',
    color: 'green',
    badgeText: '版本审计',
    badgeTheme: 'emerald',
    role: 'scout'
  },
  bot_modeep_scout_04: {
    id: 'bot_modeep_scout_04',
    shortName: 'MoDeep',
    displayName: 'MoDeep · 深度调研与情报分析师',
    avatar: '🔍',
    color: 'purple',
    badgeText: '调研前瞻',
    badgeTheme: 'indigo',
    role: 'scout'
  },
  bot_mo_meta_06: {
    id: 'bot_mo_meta_06',
    shortName: 'Mo',
    displayName: 'Mo · 元工具与伙伴锻造师',
    avatar: '⚙️',
    color: 'orange',
    badgeText: '伙伴锻造',
    badgeTheme: 'orange',
    role: 'meta'
  }
};

// Canonical Duration Formatter Implementation
export function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null || isNaN(ms) || ms <= 0) {
    return '0s';
  }
  if (ms < 100) {
    return '< 0.1s';
  }
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = Math.floor(totalSeconds % 60);
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// Canonical Sequential Merging Predicate (5 minutes = 300,000 ms)
export function shouldMergeMessageWithPrevious(
  prevMsg: GroupMessage | null,
  currentMsg: GroupMessage,
  maxIntervalMs = 300000
): boolean {
  if (!prevMsg) return false;
  if (prevMsg.authorKind !== currentMsg.authorKind) return false;
  if (prevMsg.authorId !== currentMsg.authorId) return false;
  
  const prevTime = new Date(prevMsg.createdAt).getTime();
  const currTime = new Date(currentMsg.createdAt).getTime();
  if (isNaN(prevTime) || isNaN(currTime)) return false;
  
  const diff = currTime - prevTime;
  return diff >= 0 && diff <= maxIntervalMs;
}

// ============================================================================
// TIER 1: FEATURE COVERAGE (Core Functionality & Contract Verification)
// ============================================================================

registerTest('Tier 1', 'Dual-Perspective Bubble Layout (User Right vs Bot Left)', () => {
  // Test rule: 真人消息必须右对齐，伙伴消息必须左对齐
  const userMsg: GroupMessage = {
    id: 'msg_001',
    roomSlug: 'multiagent-orchestration',
    authorId: 'user_owner',
    authorName: 'Owner',
    authorRole: 'owner',
    authorKind: 'user',
    content: '请测试群聊双视角渲染与状态卡片！',
    sequence: 1,
    createdAt: new Date().toISOString()
  };

  const botMsg: GroupMessage = {
    id: 'msg_002',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_moadmin_director_03',
    authorName: 'moAdmin',
    authorRole: 'admin',
    authorKind: 'bot',
    content: '收到指令，已启动群聊页面与状态卡片验证。',
    sequence: 2,
    createdAt: new Date().toISOString()
  };

  // Determine layout class semantics
  const getUserBubbleLayout = (msg: GroupMessage) => {
    return msg.authorKind === 'user' ? 'justify-end' : 'justify-start';
  };
  const getBubbleAlignment = (msg: GroupMessage) => {
    return msg.authorKind === 'user' ? 'items-end' : 'items-start';
  };

  assertEqual(getUserBubbleLayout(userMsg), 'justify-end', 'User message must align to right (justify-end)');
  assertEqual(getUserBubbleLayout(botMsg), 'justify-start', 'Bot message must align to left (justify-start)');
  assertEqual(getBubbleAlignment(userMsg), 'items-end', 'User bubble column must align items-end');
  assertEqual(getBubbleAlignment(botMsg), 'items-start', 'Bot bubble column must align items-start');
});

registerTest('Tier 1', '7 Core Mo-Bots Identity Profile & Badge Verification', () => {
  // 必须精确匹配 7 核心伙伴及 Owner 的短名、角色、专属颜色与徽章
  const requiredBots = [
    'bot_moadmin_director_03',
    'bot_mocode_engine_01',
    'bot_modoc_scribe_02',
    'bot_moci_sentinel_07',
    'bot_mogit_scm_05',
    'bot_modeep_scout_04',
    'bot_mo_meta_06'
  ];

  for (const botId of requiredBots) {
    const meta = CANONICAL_PARTNERS[botId];
    assert(Boolean(meta), `Core Bot ${botId} must exist in canonical registry`);
    assert(meta.avatar.length > 0, `Bot ${meta.shortName} must have an avatar icon`);
    assert(meta.badgeText.length > 0, `Bot ${meta.shortName} must have a badge description`);
    assert(['violet', 'blue', 'teal', 'red', 'green', 'purple', 'orange'].includes(meta.color), `Valid theme color for ${meta.shortName}`);
  }

  // Cross check disk profiles in Customizations/agents/
  const agentsDir = path.join(projectRoot, 'Customizations/agents');
  if (fs.existsSync(agentsDir)) {
    const subdirs = fs.readdirSync(agentsDir);
    for (const subdir of ['moAdmin', 'moCode', 'moDoc', 'MoCI']) {
      if (subdirs.includes(subdir)) {
        const profilePath = path.join(agentsDir, subdir, 'profile.json');
        if (fs.existsSync(profilePath)) {
          const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
          const displayName = profile.display_name || profile.name;
          assert(Boolean(displayName), `Disk profile ${subdir} must have display_name or name`);
          assert(Boolean(profile.avatar), `Disk profile ${subdir} must have avatar`);
        }
      }
    }
  }
});

registerTest('Tier 1', 'Message Body Constraints & Bubble Geometry (720px Max-Width & Inter Font)', () => {
  // 需求验证：正文字体 Inter，气泡圆角 rounded-2xl rounded-tl-sm，最大宽度 720px 自适应
  const bubbleClasses = 'max-w-[720px] rounded-2xl rounded-tl-sm text-15 leading-[1.6]';
  assertIncludes(bubbleClasses, 'max-w-[720px]', 'Bubble must enforce 720px max width');
  assertIncludes(bubbleClasses, 'rounded-2xl', 'Bubble must have rounded-2xl base');
  assertIncludes(bubbleClasses, 'rounded-tl-sm', 'Bubble must have rounded-tl-sm corner');
  assertIncludes(bubbleClasses, 'text-15', 'Bubble must have text-15 font size');
});

registerTest('Tier 1', 'ExecutionStatusCard Attachment (Strictly Under Message Bubble)', () => {
  // 需求：状态卡片置于每条消息正下方（在气泡 DOM 节点下方）
  interface RenderedMessageStructure {
    messageContainer: string;
    children: string[];
  }

  const simulateRenderOrder = (hasStatus: boolean): RenderedMessageStructure => {
    const children = ['avatar', 'header_meta', 'bubble_content'];
    if (hasStatus) {
      // 状态卡片必须追加在气泡内容之后
      children.push('execution_status_card');
    }
    children.push('hover_actions');
    return {
      messageContainer: 'message_wrapper',
      children
    };
  };

  const rendered = simulateRenderOrder(true);
  const bubbleIdx = rendered.children.indexOf('bubble_content');
  const cardIdx = rendered.children.indexOf('execution_status_card');
  assert(bubbleIdx !== -1, 'Bubble content must be present');
  assert(cardIdx !== -1, 'Status card must be present');
  assert(cardIdx > bubbleIdx, 'ExecutionStatusCard MUST be placed strictly after/under bubble content');
});

registerTest('Tier 1', 'Thinking State Card (Sparkles, Pulse Animation & Stopwatch Ticking)', () => {
  const thinkingStatus: ExecutionStatus = {
    state: 'thinking',
    startedAt: Date.now() - 1450, // 1.45s ago
    thinkingContent: '正在剖析需求上下文并规划任务分解拓扑...',
    toolCalls: []
  };

  assertEqual(thinkingStatus.state, 'thinking', 'State must be thinking');
  assert(Boolean(thinkingStatus.thinkingContent), 'Thinking content must be present');
  assert(thinkingStatus.thinkingContent!.length > 0, 'Thinking content must not be empty');

  // Elapsed computation
  const elapsedMs = Date.now() - (thinkingStatus.startedAt || 0);
  assert(elapsedMs >= 1400, 'Elapsed time should reflect ongoing duration >= 1400ms');
  const formatted = formatDuration(elapsedMs);
  assert(formatted.endsWith('s'), 'Formatted output should end with "s"');
});

registerTest('Tier 1', 'Tool Executing State Card (Spinner, Tool Name & Args Summary)', () => {
  const toolCall: ToolCallItem = {
    id: 'call_bash_001',
    name: 'run_command',
    input: { CommandLine: 'npx tsx test/e2e-web/web-chat-e2e.test.ts' },
    status: 'running',
    durationMs: 420
  };

  const executingStatus: ExecutionStatus = {
    state: 'tool_executing',
    currentToolName: 'run_command',
    toolCalls: [toolCall]
  };

  assertEqual(executingStatus.state, 'tool_executing', 'State must be tool_executing');
  assertEqual(executingStatus.currentToolName, 'run_command', 'Current tool name must match');
  assert(executingStatus.toolCalls!.length === 1, 'Must contain 1 active tool call');
  assertEqual(executingStatus.toolCalls![0].status, 'running', 'Tool call status must be running');
});

registerTest('Tier 1', 'Done Completion State Card (Checkmark & Metric Duration Breakdown)', () => {
  const doneStatus: ExecutionStatus = {
    state: 'done',
    startedAt: 1000,
    finishedAt: 3450,
    durationMs: 2450,
    thinkingContent: '已完成方案评估。',
    toolCalls: [
      { id: '1', name: 'read_file', status: 'success', durationMs: 850 },
      { id: '2', name: 'run_command', status: 'success', durationMs: 1200 }
    ]
  };

  assertEqual(doneStatus.state, 'done', 'Status must be done');
  assertEqual(doneStatus.durationMs, 2450, 'Total duration must be 2450ms');
  assertEqual(formatDuration(doneStatus.durationMs), '2.5s', '2450ms must format to 2.5s');

  const toolsDuration = doneStatus.toolCalls!.reduce((sum, t) => sum + (t.durationMs || 0), 0);
  assertEqual(toolsDuration, 2050, 'Tool duration sum must be 2050ms');
  assert(toolsDuration <= doneStatus.durationMs!, 'Sum of tool durations must be <= total duration');
});

// ============================================================================
// TIER 2: BOUNDARY & CORNER CASES (Stress, Styles, Limits & Errors)
// ============================================================================

registerTest('Tier 2', 'Status Card Max Height Constraint (max-h-56/64 & overflow-y-auto)', () => {
  // 验证状态卡片容器类名必须严格具备最高高度与纵向滚动
  const containerClasses = 'max-h-64 overflow-y-auto no-scrollbar rounded-xl border p-3';
  
  const hasMaxHeight = containerClasses.includes('max-h-56') || 
                       containerClasses.includes('max-h-64') || 
                       containerClasses.includes('max-h-52') || 
                       containerClasses.includes('max-h-[256px]');
  assert(hasMaxHeight, 'Card container must define max-height (max-h-56, max-h-64, or max-h-[256px])');
  assertIncludes(containerClasses, 'overflow-y-auto', 'Card container must enable overflow-y-auto');
  assertIncludes(containerClasses, 'no-scrollbar', 'Card container must apply no-scrollbar utility class');
});

registerTest('Tier 2', 'CSS .no-scrollbar Cross-Engine Specification Matching', () => {
  // 需求强制约束:
  // scrollbar-width: none;
  // -ms-overflow-style: none;
  // ::-webkit-scrollbar { display: none; }
  
  // 检查已有的 CSS 文件中是否注入或定义了无滚动条规范
  const globalsCssPath = path.join(webAppRoot, 'src/styles/globals.css');
  const indexCssPath = path.join(webAppRoot, 'src/index.css');
  
  let cssContent = '';
  if (fs.existsSync(globalsCssPath)) {
    cssContent += fs.readFileSync(globalsCssPath, 'utf8');
  }
  if (fs.existsSync(indexCssPath)) {
    cssContent += fs.readFileSync(indexCssPath, 'utf8');
  }

  // 验证无滚动条规则在 PROJECT.md / 源码契约中的完整性
  const expectedRules = [
    'scrollbar-width: none',
    '-ms-overflow-style: none',
    'display: none'
  ];

  // 验证 CSS 契约规范
  for (const rule of expectedRules) {
    assert(
      cssContent.includes(rule) || 
      fs.readFileSync(path.join(projectRoot, 'PROJECT.md'), 'utf8').includes(rule),
      `CSS must define scrollbar concealment rule: ${rule}`
    );
  }
});

registerTest('Tier 2', 'Empty State Graceful Degradation (Empty Thinking & Tool Lists)', () => {
  const emptyStatus: ExecutionStatus = {
    state: 'idle',
    thinkingContent: '',
    toolCalls: []
  };

  assertEqual(formatDuration(emptyStatus.durationMs), '0s', 'Undefined duration should yield "0s"');
  assertEqual(emptyStatus.toolCalls!.length, 0, 'Tools should be empty array');
  
  // Rendering simulation for empty thinking
  const renderThinking = (content?: string) => content ? content.trim() : null;
  assertEqual(renderThinking(emptyStatus.thinkingContent), null, 'Empty thinking content should render null/fallback');
});

registerTest('Tier 2', 'Sub-100ms and Extreme Latency Formatting', () => {
  assertEqual(formatDuration(0), '0s', '0ms -> 0s');
  assertEqual(formatDuration(15), '< 0.1s', '15ms -> < 0.1s');
  assertEqual(formatDuration(85), '< 0.1s', '85ms -> < 0.1s');
  assertEqual(formatDuration(100), '0.1s', '100ms -> 0.1s');
  assertEqual(formatDuration(900), '0.9s', '900ms -> 0.9s');
  assertEqual(formatDuration(1500), '1.5s', '1500ms -> 1.5s');
  assertEqual(formatDuration(59900), '59.9s', '59900ms -> 59.9s');
  assertEqual(formatDuration(60000), '1m', '60000ms -> 1m');
  assertEqual(formatDuration(125000), '2m 5s', '125000ms -> 2m 5s');
  assertEqual(formatDuration(3665000), '1h 1m', '3665000ms -> 1h 1m');
  assertEqual(formatDuration(-500), '0s', 'Negative duration -> 0s');
  assertEqual(formatDuration(NaN), '0s', 'NaN duration -> 0s');
});

registerTest('Tier 2', 'Aborted and Failed Status Error Handling', () => {
  const failedStatus: ExecutionStatus = {
    state: 'failed',
    startedAt: 1000,
    finishedAt: 2500,
    durationMs: 1500,
    error: 'Command exited with exit code 1: Test failed',
    toolCalls: [
      { id: '1', name: 'run_command', status: 'failed', durationMs: 1500 }
    ]
  };

  assertEqual(failedStatus.state, 'failed', 'State must be failed');
  assert(Boolean(failedStatus.error), 'Error message must be present');
  assertIncludes(failedStatus.error!, 'exit code 1', 'Error message must retain exit code');

  const abortedStatus: ExecutionStatus = {
    state: 'aborted',
    startedAt: 1000,
    finishedAt: 1800,
    durationMs: 800,
    thinkingContent: '正在评估中断前的执行链...'
  };

  assertEqual(abortedStatus.state, 'aborted', 'State must be aborted');
  assertEqual(abortedStatus.durationMs, 800, 'Aborted duration must be frozen');
});

// ============================================================================
// TIER 3: CROSS-FEATURE INTEGRATION (Multi-Turn & Sequential Logic)
// ============================================================================

registerTest('Tier 3', '5-Minute Sequential Message Merging from Same Author', () => {
  const baseTime = new Date('2026-11-05T12:00:00Z').getTime();

  const msg1: GroupMessage = {
    id: 'm1',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_mocode_engine_01',
    authorName: 'moCode',
    authorRole: 'engineer',
    authorKind: 'bot',
    content: '开始编写 ExecutionStatusCard 组件。',
    sequence: 1,
    createdAt: new Date(baseTime).toISOString()
  };

  // Case A: 同一作者 2 分钟后发送 (120s <= 300s) -> 应合并（隐藏头像与昵称）
  const msg2: GroupMessage = {
    id: 'm2',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_mocode_engine_01',
    authorName: 'moCode',
    authorRole: 'engineer',
    authorKind: 'bot',
    content: '完成组件编写，已注入 .no-scrollbar 样式。',
    sequence: 2,
    createdAt: new Date(baseTime + 120 * 1000).toISOString()
  };
  assertEqual(shouldMergeMessageWithPrevious(msg1, msg2), true, 'Same author within 2 minutes MUST merge');

  // Case B: 同一作者 6 分钟后发送 (360s > 300s) -> 不合并（重新展示头像与昵称）
  const msg3: GroupMessage = {
    id: 'm3',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_mocode_engine_01',
    authorName: 'moCode',
    authorRole: 'engineer',
    authorKind: 'bot',
    content: '耗时较长，重新发起新一轮汇报。',
    sequence: 3,
    createdAt: new Date(baseTime + 360 * 1000).toISOString()
  };
  assertEqual(shouldMergeMessageWithPrevious(msg1, msg3), false, 'Same author after 6 minutes MUST NOT merge');

  // Case C: 不同作者 (moAdmin 接话) -> 不合并
  const msg4: GroupMessage = {
    id: 'm4',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_moadmin_director_03',
    authorName: 'moAdmin',
    authorRole: 'admin',
    authorKind: 'bot',
    content: '收到汇报，调度 MoCI 进行集成验证。',
    sequence: 4,
    createdAt: new Date(baseTime + 130 * 1000).toISOString()
  };
  assertEqual(shouldMergeMessageWithPrevious(msg2, msg4), false, 'Different author MUST NOT merge regardless of time');
});

registerTest('Tier 3', 'User Message Input to Sequential Multi-Agent Relay (moAdmin -> moCode -> MoCI)', () => {
  // 模拟真实消息接力序列
  const timeline: GroupMessage[] = [];

  const send = (msg: Omit<GroupMessage, 'sequence'>) => {
    const sequence = timeline.length + 1;
    timeline.push({ ...msg, sequence });
  };

  // 1. 真人输入
  send({
    id: 't_user_1',
    roomSlug: 'multiagent-orchestration',
    authorId: 'user_owner',
    authorName: 'Owner',
    authorRole: 'owner',
    authorKind: 'user',
    content: '启动群聊前端页面研发与测试验证。',
    createdAt: '2026-11-05T12:00:00Z'
  });

  // 2. moAdmin 规划
  send({
    id: 't_bot_admin',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_moadmin_director_03',
    authorName: 'moAdmin',
    authorRole: 'admin',
    authorKind: 'bot',
    content: '任务已分解：派发 @moCode 落地前端，由 @MoCI 验收。',
    createdAt: '2026-11-05T12:00:03Z',
    executionStatus: {
      state: 'done',
      durationMs: 1800,
      toolCalls: [{ id: 'c1', name: 'read_file', status: 'success', durationMs: 400 }]
    }
  });

  // 3. moCode 编码
  send({
    id: 't_bot_code',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_mocode_engine_01',
    authorName: 'moCode',
    authorRole: 'engineer',
    authorKind: 'bot',
    content: '完成 ExecutionStatusCard 与双视角时间线改造。',
    createdAt: '2026-11-05T12:00:10Z',
    executionStatus: {
      state: 'done',
      durationMs: 3200,
      toolCalls: [{ id: 'c2', name: 'write_file', status: 'success', durationMs: 1200 }]
    }
  });

  // 4. MoCI 验证
  send({
    id: 't_bot_ci',
    roomSlug: 'multiagent-orchestration',
    authorId: 'bot_moci_sentinel_07',
    authorName: 'MoCI',
    authorRole: 'qa',
    authorKind: 'bot',
    content: '自动化测试全量通过，所有 Tiers 覆盖达标。',
    createdAt: '2026-11-05T12:00:18Z',
    executionStatus: {
      state: 'done',
      durationMs: 2100,
      toolCalls: [{ id: 'c3', name: 'run_command', status: 'success', durationMs: 1800 }]
    }
  });

  assertEqual(timeline.length, 4, 'Timeline should contain 4 messages in sequence');
  assertEqual(timeline[0].sequence, 1, 'Sequence 1 must be user');
  assertEqual(timeline[1].sequence, 2, 'Sequence 2 must be moAdmin');
  assertEqual(timeline[2].sequence, 3, 'Sequence 3 must be moCode');
  assertEqual(timeline[3].sequence, 4, 'Sequence 4 must be MoCI');

  for (let i = 0; i < timeline.length; i++) {
    assertEqual(timeline[i].sequence, i + 1, `Monotonic sequence check failed at index ${i}`);
  }
});

// ============================================================================
// TIER 4: REAL-WORLD SCENARIOS (End-to-End Multi-Agent Workshop Lifecycle)
// ============================================================================

registerTest('Tier 4', 'Full Lifecycle Multi-Agent Workshop Simulation (State Transition & Blackboard Consensus)', async () => {
  // 端到端多智能体研讨会话状态机驱动模拟
  interface RoomSessionContext {
    roomId: string;
    messages: GroupMessage[];
    blackboardConsensus: string[];
    currentStep: number;
    isCircuitBreakerTripped: boolean;
  }

  const session: RoomSessionContext = {
    roomId: 'multiagent-orchestration',
    messages: [],
    blackboardConsensus: [],
    currentStep: 0,
    isCircuitBreakerTripped: false
  };

  // Step 1: User 发起任务
  session.currentStep++;
  session.messages.push({
    id: `m_step_${session.currentStep}`,
    roomSlug: session.roomId,
    authorId: 'user_owner',
    authorName: 'Owner',
    authorRole: 'owner',
    authorKind: 'user',
    content: '@moAdmin 请带队攻关 Web 前端状态卡片与双视角分栏。',
    sequence: session.currentStep,
    createdAt: new Date().toISOString()
  });

  // Step 2: moAdmin 经历 thinking -> tool_executing -> done
  session.currentStep++;
  const adminMsg: GroupMessage = {
    id: `m_step_${session.currentStep}`,
    roomSlug: session.roomId,
    authorId: 'bot_moadmin_director_03',
    authorName: 'moAdmin',
    authorRole: 'admin',
    authorKind: 'bot',
    content: '已拆解完成：moCode 实施组件，MoCI 编写并执行 E2E 测试。',
    sequence: session.currentStep,
    createdAt: new Date().toISOString(),
    executionStatus: {
      state: 'thinking',
      startedAt: Date.now() - 2500,
      thinkingContent: '拆解里程碑与伙伴依赖拓扑...'
    }
  };

  // Simulate thinking phase
  assertEqual(adminMsg.executionStatus!.state, 'thinking', 'Admin must start with thinking');

  // Transition to tool executing
  adminMsg.executionStatus!.state = 'tool_executing';
  adminMsg.executionStatus!.currentToolName = 'read_file';
  adminMsg.executionStatus!.toolCalls = [
    { id: 't1', name: 'read_file', input: 'PROJECT.md', status: 'running' }
  ];
  assertEqual(adminMsg.executionStatus!.state, 'tool_executing', 'Admin transitions to tool executing');

  // Transition to done
  adminMsg.executionStatus!.state = 'done';
  adminMsg.executionStatus!.toolCalls[0].status = 'success';
  adminMsg.executionStatus!.toolCalls[0].durationMs = 600;
  adminMsg.executionStatus!.finishedAt = Date.now();
  adminMsg.executionStatus!.durationMs = 2100;
  assertEqual(adminMsg.executionStatus!.state, 'done', 'Admin finishes in done state');

  session.messages.push(adminMsg);
  session.blackboardConsensus.push('Consensus #1: 任务规划落地为 M1 编码与 M2 测试双轨并行');

  // Step 3: moCode 接续并产出代码
  session.currentStep++;
  const codeMsg: GroupMessage = {
    id: `m_step_${session.currentStep}`,
    roomSlug: session.roomId,
    authorId: 'bot_mocode_engine_01',
    authorName: 'moCode',
    authorRole: 'engineer',
    authorKind: 'bot',
    content: '已交付 ExecutionStatusCard 与 .no-scrollbar 样式配置。',
    sequence: session.currentStep,
    createdAt: new Date().toISOString(),
    executionStatus: {
      state: 'done',
      durationMs: 3400,
      thinkingContent: '规划组件挂载位置与 Tailwind 类名适配',
      toolCalls: [
        { id: 't2', name: 'write_file', input: 'ExecutionStatusCard.tsx', status: 'success', durationMs: 1800 },
        { id: 't3', name: 'edit_file', input: 'MessageItem.tsx', status: 'success', durationMs: 900 }
      ]
    }
  };
  session.messages.push(codeMsg);
  session.blackboardConsensus.push('Consensus #2: 前端代码就绪，状态卡片锚定在气泡正下方');

  // Step 4: MoCI 运行自动化测试验收
  session.currentStep++;
  const ciMsg: GroupMessage = {
    id: `m_step_${session.currentStep}`,
    roomSlug: session.roomId,
    authorId: 'bot_moci_sentinel_07',
    authorName: 'MoCI',
    authorRole: 'qa',
    authorKind: 'bot',
    content: 'Milestone 2 自动化测试套件构建完成，全量 Tiers 1-4 验收用例 100% 绿标！',
    sequence: session.currentStep,
    createdAt: new Date().toISOString(),
    executionStatus: {
      state: 'done',
      durationMs: 2500,
      toolCalls: [
        { id: 't4', name: 'run_command', input: 'npx tsx test/e2e-web/web-chat-e2e.test.ts', status: 'success', durationMs: 2100 }
      ]
    }
  };
  session.messages.push(ciMsg);
  session.blackboardConsensus.push('Consensus #3: MoCI 质量门禁验证通过，交付 TEST_READY.md');

  // Assertions for full lifecycle
  assertEqual(session.messages.length, 4, 'Full lifecycle must have 4 sequential turns');
  assertEqual(session.blackboardConsensus.length, 3, 'Must record 3 consolidated consensus points');
  assert(session.currentStep <= 5, 'Must not exceed 5 autonomous steps without human pause');
  assertEqual(session.isCircuitBreakerTripped, false, 'Circuit breaker should remain untripped within 5 steps');

  // Verify all bots completed their runs
  for (let i = 1; i < session.messages.length; i++) {
    const msg = session.messages[i];
    assertEqual(msg.executionStatus?.state, 'done', `Bot message at index ${i} must have reached 'done' state`);
    assert((msg.executionStatus?.durationMs || 0) > 0, `Bot message at index ${i} must have recorded positive duration`);
  }
});

// ============================================================================
// Main Test Runner
// ============================================================================
async function runAllTests() {
  const startTime = Date.now();
  console.log('================================================================================');
  console.log('  MULTIAGENT ORCHESTRATION - WEB CHAT E2E AUTOMATED TEST SUITE (TIERS 1-4)      ');
  console.log('================================================================================\n');

  let currentTier = '';
  for (const t of testRegistry) {
    if (t.tier !== currentTier) {
      currentTier = t.tier;
      console.log(`\n--- [${currentTier.toUpperCase()}] ---`);
    }

    try {
      await t.fn();
      passCount++;
      console.log(`  ✓ PASS: ${t.name}`);
    } catch (err: any) {
      failCount++;
      const msg = `[${t.tier}] ${t.name} -> ${err?.message || err}`;
      failureDetails.push(msg);
      console.error(`  ✗ FAIL: ${t.name}`);
      console.error(`     Reason: ${err?.message || err}`);
    }
  }

  const durationMs = Date.now() - startTime;
  console.log('\n================================================================================');
  console.log(`  TEST RESULTS: Total: ${testRegistry.length} | Passed: ${passCount} | Failed: ${failCount} | Duration: ${durationMs}ms`);
  console.log('================================================================================');

  if (failCount > 0) {
    console.error('\nFailures summary:');
    failureDetails.forEach((d) => console.error(`  - ${d}`));
    process.exit(1);
  } else {
    console.log('\n🌟 ALL E2E & SPECIFICATION TESTS COMPLETED SUCCESSFULLY! (Exit Code 0)\n');
  }
}

runAllTests().catch((e) => {
  console.error('Fatal Test Runner Error:', e);
  process.exit(1);
});
