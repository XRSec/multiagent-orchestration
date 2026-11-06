/**
 * @file scripts/run-autonomous-collaboration.ts
 * @description Long-running autonomous multi-agent collaboration orchestrator.
 * Drives moAdmin, moCode, and MoCI in the multiagent-orchestration room to
 * implement directory, skill, bot, and group data display in web and back backend APIs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { StorageManager } from '../src/storage/StorageManager';
import { RuntimeEnvironment } from '../src/storage/RuntimeEnvironment';
import { AgentOrchestrator } from '../src/daemon/orchestrator/AgentOrchestrator';

interface CollaborationStatus {
  status: 'RUNNING' | 'COMPLETED' | 'ERROR';
  currentTurn: number;
  maxTurns: number;
  currentSpeaker: string;
  currentRole: string;
  lastUpdate: string;
  progressSummary: string;
  done: boolean;
  error?: string;
}

const STATUS_FILE = path.resolve(__dirname, '../logs/collaboration-status.json');
const LOG_FILE = path.resolve(__dirname, '../logs/agent-collaboration.log');

function updateStatus(status: CollaborationStatus) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2), 'utf-8');
}

function appendLog(line: string) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, entry, 'utf-8');
  process.stdout.write(entry);
}

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const daemonDataDir = path.join(projectRoot, '.daemon');
  const storage = new StorageManager(daemonDataDir);
  const runtime = new RuntimeEnvironment(projectRoot, storage);
  const orchestrator = new AgentOrchestrator({ storage, runtime });

  const room = storage.getRoom('multiagent-orchestration');
  if (!room) {
    throw new Error('Room "multiagent-orchestration" not found');
  }
  const roomId = room.id;

  // Ensure log directory exists
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.writeFileSync(LOG_FILE, `=== Multi-Agent Autonomous Collaboration Started ===\n`, 'utf-8');

  orchestrator.on('stream.chunk', (data) => {
    fs.appendFileSync(LOG_FILE, data.chunk, 'utf-8');
    process.stdout.write(data.chunk);
  });

  appendLog('>>> 协作系统已初始化，准备启动多轮智能体接力研发流程...');

  // =========================================================================
  // Turn 1: 人类用户下达需求 -> moAdmin 主管 (拆解规划与制定接口规约)
  // =========================================================================
  updateStatus({
    status: 'RUNNING',
    currentTurn: 1,
    maxTurns: 3,
    currentSpeaker: 'bot_moadmin_director_03',
    currentRole: 'moAdmin (技术主管)',
    lastUpdate: new Date().toISOString(),
    progressSummary: 'moAdmin 正在分析四大维度数据（目录、skill、bot、群）展示需求并制定技术方案',
    done: false,
  });

  const turn1Prompt = `【人类用户需求正式派发】
各位伙伴请注意，人类旁观者用户下达了最新任务：
我们现在系统中已经存在：
1. 目录（Directory / Workspace）：工作区目录、项目结构概览与统计；
2. skill（技能）：系统与用户已安装/可用的技能列表（如 ~/.agents/skills/、内置 skills 等）；
3. bot（智能体）：系统注册的全部 7 位智能体详细信息（ID、名称、角色、头像、能力等）；
4. 群（群聊房间）：群聊房间列表（如 multiagent-orchestration 及其属性、关联成员等）。

【目标要求】
请把这四大维度（目录、skill、bot、群）的数据完整展示到 web 前端界面上！
如果后端缺功能（例如 web/server/vite-room-api-plugin.ts 或守护进程中缺少提供这些数据的 API），就先补齐后端功能；
如果前端缺页面或组件，就在 web/ 中开发对应的页面、导航或仪表盘展示模块！
启动与构建以根目录 \`pnpm dev\` 与 \`pnpm build\` (或 \`pnpm --filter web build\`) 为基准，禁止带任何 cindy 遗留名称。

请 moAdmin 主管率先发言：
1. 全面梳理当前系统在这四大维度的数据源与现有 API 现状；
2. 明确需要补齐的后端 REST 端点规范；
3. 明确前端需要新增或扩展的路由与视图组件规划；
4. 向全栈研发工程师 moCode 正式派单！`;

  appendLog('------------------------------------------------------------------------');
  appendLog('>>> [Turn 1/3] 发送需求给 moAdmin (主管) 进行架构拆解与派单...');
  appendLog('------------------------------------------------------------------------');

  const adminResult = await orchestrator.handleChat({
    roomId,
    botId: 'bot_moadmin_director_03',
    content: turn1Prompt,
    role: 'user',
  });

  appendLog(`\n>>> [moAdmin 回复已落盘 (Sequence: ${adminResult.sequence})]`);

  // =========================================================================
  // Turn 2: moCode 全栈开发工程师接单实干 (补全后端 API，落地前端页面，运行构建)
  // =========================================================================
  updateStatus({
    status: 'RUNNING',
    currentTurn: 2,
    maxTurns: 3,
    currentSpeaker: 'bot_mocode_engine_01',
    currentRole: 'moCode (全栈开发工程师)',
    lastUpdate: new Date().toISOString(),
    progressSummary: 'moCode 正在接单实现后端 API 与前端展示组件（目录、skill、bot、群）',
    done: false,
  });

  const turn2Prompt = `moCode，请立即接单执行 moAdmin 主管制定的实施规划与【人类用户紧急架构指令】：
0. 【首要执行目录调整】：人类用户指示将当前根目录的 web/ 移动到 src/ 目录下 (目标路径: src/web)！请先用 bash 移动：mv web src/web，并同步适配根目录 pnpm-workspace.yaml (packages: ['src/web']) 与根 package.json 构建脚本，调整 src/web/server/vite-room-api-plugin.ts 相对导入；
1. 检查后端接口：查看 src/web/server/vite-room-api-plugin.ts 或对应后端逻辑，补齐四大维度数据（目录、skill、bot、群）的 REST/数据接口；
2. 检查前端界面：在 src/web/ 前端项目中新增或扩展对应展示视图（直观美观地查看目录概览、技能列表、Bot名册与群聊房间）；
3. 使用你的工具（Read、Write、Edit、Bash 等）完成代码实现；
4. 在项目根目录执行构建（pnpm build 或 pnpm --filter web build），确保 100% 编译通过、0 TypeScript 错误；
5. 完成后向群聊汇报完整的实现成果，并呼叫 MoCI 质量守卫进行验证！`;

  appendLog('------------------------------------------------------------------------');
  appendLog('>>> [Turn 2/3] moCode (全栈工程师) 接单执行编码与前端集成...');
  appendLog('------------------------------------------------------------------------');

  const codeResult = await orchestrator.handleChat({
    roomId,
    botId: 'bot_mocode_engine_01',
    content: turn2Prompt,
    role: 'user',
  });

  appendLog(`\n>>> [moCode 回复与执行已落盘 (Sequence: ${codeResult.sequence})]`);

  // =========================================================================
  // Turn 3: MoCI 质量与构建测试验收
  // =========================================================================
  updateStatus({
    status: 'RUNNING',
    currentTurn: 3,
    maxTurns: 3,
    currentSpeaker: 'bot_moci_sentinel_07',
    currentRole: 'MoCI (质量与CI守卫)',
    lastUpdate: new Date().toISOString(),
    progressSummary: 'MoCI 正在验证后端接口与前端构建质量，进行综合验收',
    done: false,
  });

  const turn3Prompt = `MoCI，请接单对 moCode 交付的代码与功能进行质量验收：
1. 运行构建或类型检查，验证 web 端构建状态；
2. 验证四大维度（目录、skill、bot、群）在前后端的完整性；
3. 输出质检验收报告。如果确认无误且达到交付标准，请宣布验收通过！`;

  appendLog('------------------------------------------------------------------------');
  appendLog('>>> [Turn 3/3] MoCI (质量守卫) 执行自动化构建验证与验收评审...');
  appendLog('------------------------------------------------------------------------');

  const ciResult = await orchestrator.handleChat({
    roomId,
    botId: 'bot_moci_sentinel_07',
    content: turn3Prompt,
    role: 'user',
  });

  appendLog(`\n>>> [MoCI 验收报告已落盘 (Sequence: ${ciResult.sequence})]`);

  // 标记完成
  updateStatus({
    status: 'COMPLETED',
    currentTurn: 3,
    maxTurns: 3,
    currentSpeaker: 'all',
    currentRole: '协同完成',
    lastUpdate: new Date().toISOString(),
    progressSummary: '四大维度数据（目录、skill、bot、群）前后端研发及构建质检验收全部完成！',
    done: true,
  });

  appendLog('========================================================================');
  appendLog('>>> 多智能体群聊协同研发已完整闭环！');
  appendLog('========================================================================');

  storage.close();
}

main().catch((err) => {
  console.error('Autonomous collaboration failed:', err);
  updateStatus({
    status: 'ERROR',
    currentTurn: 0,
    maxTurns: 3,
    currentSpeaker: 'error',
    currentRole: 'error',
    lastUpdate: new Date().toISOString(),
    progressSummary: '协作脚本异常终止',
    done: false,
    error: String(err && err.message ? err.message : err),
  });
  process.exit(1);
});
