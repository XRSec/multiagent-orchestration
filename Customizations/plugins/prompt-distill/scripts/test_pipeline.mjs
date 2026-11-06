import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const handlerPath = path.join(__dirname, 'handler.mjs');
const testSessionId = `pipeline_sim_${Date.now()}`;

function runHandler(inputPayload) {
  const result = spawnSync('node', [handlerPath], {
    input: JSON.stringify(inputPayload),
    encoding: 'utf8',
    timeout: 35000
  });
  if (result.error) throw result.error;
  return JSON.parse(result.stdout.trim());
}

async function runSimulation() {
  console.log('=== 仿真测试 1: 0ms 旁路指令（“继续”）===');
  const resBypass = runHandler({
    session_id: testSessionId,
    prompt: '继续',
    hook_event_name: 'UserPromptSubmit'
  });
  console.log('旁路响应:', resBypass);
  assert.ok(resBypass.systemMessage.includes('命中规则旁路'), '应命中 0ms 规则旁路');
  assert.strictEqual(resBypass.hookSpecificOutput.additionalContext, undefined, '旁路不输出额外上下文');

  console.log('\n=== 仿真测试 2: 第 1 轮复杂指令提炼与 G0 固化 ===');
  const t0 = Date.now();
  const resRound1 = runHandler({
    session_id: testSessionId,
    prompt: '我想为一个多智能体协同系统开发一个事件总线，必须支持异步发布订阅与死信队列重试，严禁引入重量级外部依赖',
    hook_event_name: 'UserPromptSubmit'
  });
  const t1 = Date.now();
  console.log(`第 1 轮耗时: ${t1 - t0}ms`);
  console.log('第 1 轮输出:', resRound1);
  assert.ok(resRound1.hookSpecificOutput.additionalContext, '必须通过 additionalContext 挂载结构化背景');
  assert.ok(resRound1.hookSpecificOutput.additionalContext.includes('全局根目标'), '应提取出全局根目标 G0');

  console.log('\n=== 仿真测试 3: PreCompact 生命周期快照归档 ===');
  const resPreCompact = spawnSync('node', [handlerPath], {
    input: JSON.stringify({
      session_id: testSessionId,
      hook_event_name: 'PreCompact'
    }),
    encoding: 'utf8'
  });
  assert.strictEqual(resPreCompact.status, 0, 'PreCompact 应成功退出 0');

  console.log('\n=== 仿真测试 4: SessionStart (compact) 生命周期重置 ===');
  const resSessionStart = spawnSync('node', [handlerPath], {
    input: JSON.stringify({
      session_id: testSessionId,
      hook_event_name: 'SessionStart',
      source: 'compact',
      summary: '历史会话已完成事件总线基础定义'
    }),
    encoding: 'utf8'
  });
  assert.strictEqual(resSessionStart.status, 0, 'SessionStart(compact) 应成功退出 0');

  console.log('\n✔ 所有完整管道端到端测试均顺利通过！');
}

runSimulation().catch(err => {
  console.error('仿真失败:', err);
  process.exit(1);
});

