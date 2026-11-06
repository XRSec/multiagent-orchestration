/**
 * @file scripts/dispatch-multiagent-goal.ts
 * @description Direct multi-agent orchestration dispatcher.
 * Uses real ClaudeSdkRunner with tools (bash, read_file, write_file, edit_file, list_dir),
 * thinkingLevel=high, and multi-turn Agent forward loop directly to configured Gateway.
 */

import * as path from 'path';
import { StorageManager } from '../src/storage/StorageManager';
import { RuntimeEnvironment } from '../src/storage/RuntimeEnvironment';
import { AgentOrchestrator } from '../src/daemon/orchestrator/AgentOrchestrator';

async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const daemonDataDir = path.join(projectRoot, '.daemon');
  const storage = new StorageManager(daemonDataDir);
  const runtime = new RuntimeEnvironment(projectRoot, storage);
  const orchestrator = new AgentOrchestrator({ storage, runtime });

  orchestrator.on('stream.chunk', (data) => {
    process.stdout.write(data.chunk);
  });

  const room = storage.getRoom('multiagent-orchestration');
  if (!room) throw new Error('Room "multiagent-orchestration" not found');

  const userGoal = `/goal 完善 multiagent-orchestration web 端\n先做群聊页面，有测试我发的消息，消息 下面 展示运行状态，运行状态设置最高高度，超过激活滚动，无滚动条`;

  console.log('========================================================================');
  console.log('>>> [1/2] 人类用户（旁观者）向 moAdmin 下发 Web 端群聊与状态栏研发指令...');
  console.log('========================================================================\n');

  // Turn 1: Human User -> moAdmin (主管)
  const adminResult = await orchestrator.handleChat({
    roomId: room.id,
    botId: 'bot_moadmin_director_03',
    content: userGoal,
    role: 'user',
  });

  console.log(`\n>>> [moAdmin 主管真实回复 (Sequence: ${adminResult.sequence})]`);
  console.log(adminResult.replyContent);

  // Turn 2: moCode (全栈核心伙伴) 接单执行
  console.log('\n========================================================================');
  console.log('>>> [2/2] 转交发言权至 moCode (全栈工程师)，启动自主工具调用写代码与构建...');
  console.log('========================================================================\n');

  const codeResult = await orchestrator.handleChat({
    roomId: room.id,
    botId: 'bot_mocode_engine_01',
    content: `moCode，请立即接单执行：\n1. 检查前端组件与样式文件；\n2. 使用 write_file / edit_file 落地群聊页面（包含测试用户发的消息）、以及消息下方的运行状态卡片（max-height 限制，overflow-y 滚动，完全隐藏滚动条）；\n3. 执行构建或语法检查确保无误，并汇报完成成果。`,
    role: 'user',
  });

  console.log(`\n>>> [moCode 全栈工程师真实回复 (Sequence: ${codeResult.sequence})]`);
  console.log(codeResult.replyContent);

  console.log('\n========================================================================');
  console.log('>>> 多智能体群聊协同执行阶段闭环完成！');
  console.log('========================================================================');

  storage.close();
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

