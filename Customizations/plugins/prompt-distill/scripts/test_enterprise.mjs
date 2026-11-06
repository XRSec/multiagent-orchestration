import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { checkBypass } from './bypass.mjs';
import { verifyDistillation } from './guardrail.mjs';
import { SessionStorage } from './storage.mjs';

const TEST_DIR = path.join(os.tmpdir(), `prompt_distill_test_${Date.now()}`);

async function runTests() {
  console.log('--- 1. 测试 0ms 纯规则本地旁路引擎 ---');
  assert.strictEqual(checkBypass('继续').shouldBypass, true, '“继续”应命中确认旁路');
  assert.strictEqual(checkBypass('y').shouldBypass, true, '“y”应命中确认旁路');
  assert.strictEqual(checkBypass('ok').shouldBypass, true, '“ok”应命中确认旁路');
  assert.strictEqual(checkBypass('git checkout -b feature').shouldBypass, true, 'git 命令应命中命令旁路');
  assert.strictEqual(checkBypass('npm run build').shouldBypass, true, 'npm 命令应命中命令旁路');
  assert.strictEqual(checkBypass('stop').shouldBypass, true, 'stop 应命中阻断旁路');
  assert.strictEqual(checkBypass('回滚').shouldBypass, true, '回滚 应命中阻断旁路');
  assert.strictEqual(checkBypass('请把之前写的用户注册接口从表单提交改成 JSON 格式并增加单元测试').shouldBypass, false, '复杂工程需求不应命中旁路');
  console.log('✔ 0ms 旁路引擎测试全部通过！\n');

  console.log('--- 2. 测试保真门禁 (Guardrails) ---');
  // 正常结构化输出
  const validCheck = verifyDistillation(
    '重构 auth/login.ts 文件并优化 token 刷新逻辑',
    '[动作] 重构\n[目标] auth/login.ts\n[约束] 优化 token 刷新，保持现有接口兼容'
  );
  assert.strictEqual(validCheck.valid, true, '合规结构化输出应通过');

  // 违规：小模型臆造并输出整段代码
  const hallucinatedCodeCheck = verifyDistillation(
    '重构 auth/login.ts 文件',
    '好的，请看重构后的代码：\n```python\ndef login():\n    print("fake code")\n    return True\n```'
  );
  assert.strictEqual(hallucinatedCodeCheck.valid, false, '输出长代码块应被门禁拦截');

  // 违规：关键路径实体丢失
  const missingEntityCheck = verifyDistillation(
    '修复 src/core/engine.cpp 和 include/header.h 中的内存泄漏',
    '[动作] 修复内存泄漏\n[目标] 核心模块'
  );
  assert.strictEqual(missingEntityCheck.valid, false, '关键文件实体丢失应被拦截');
  console.log('✔ 保真门禁引擎测试全部通过！\n');

  console.log('--- 3. 测试分片存储、原子写与文件锁 ---');
  const storage = new SessionStorage({ storageDir: TEST_DIR });
  const testSessionId = 'session_test_enterprise';

  // 3.1 首轮写入与 G0 固化
  storage.recordRound({
    sessionId: testSessionId,
    round: 1,
    rawPrompt: '开发一个用户认证系统，必须向后兼容旧版 API',
    distilledPrompt: '[G0 根目标] 构建稳定高可用的认证模块，严格保证旧版 API 向后兼容',
    techFacts: ['严禁破坏现有 API 签名', '数据库支持 PostgreSQL']
  });

  const meta = storage.readMeta(testSessionId);
  assert.ok(meta && meta.rootObjective.includes('G0 根目标'), 'G0 根目标应被持久化并固化');

  // 3.2 子智能体隔离测试
  storage.recordRound({
    sessionId: testSessionId,
    agentId: 'subagent_worker_99',
    round: 1,
    rawPrompt: '负责执行数据库迁移脚本',
    distilledPrompt: '[子任务] 执行 migration',
    techFacts: ['迁移表 user_v2']
  });

  const rootState = storage.readState(testSessionId, null);
  const subState = storage.readState(testSessionId, 'subagent_worker_99');
  assert.strictEqual(rootState.agentId, 'root', '主 Agent 应存储在 root.json');
  assert.strictEqual(subState.agentId, 'subagent_worker_99', '子智能体应物理隔离在 subagents 目录');

  // 3.3 滑动窗口截断 (K=2) 与衰减测试
  storage.recordRound({
    sessionId: testSessionId,
    round: 2,
    rawPrompt: '第 2 轮输入',
    distilledPrompt: '第 2 轮提炼',
    hostSummary: '完成了迁移文件创建',
    techFacts: ['新增 auth.ts 文件', '必须保持向后兼容']
  });

  storage.recordRound({
    sessionId: testSessionId,
    round: 3,
    rawPrompt: '第 3 轮输入',
    distilledPrompt: '第 3 轮提炼',
    hostSummary: '完成了单元测试用例编写',
    techFacts: ['测试通过率 100%']
  });

  const stateAfterRound3 = storage.readState(testSessionId, null);
  assert.strictEqual(stateAfterRound3.slidingWindow.length, 2, '滑动窗口深度应严格截断至 K=2');
  assert.strictEqual(stateAfterRound3.slidingWindow[0].round, 2, '滑动窗口最老的一轮应是第 2 轮');
  assert.strictEqual(stateAfterRound3.slidingWindow[1].round, 3, '滑动窗口最新的一轮应是第 3 轮');

  const activeCtx = storage.getActiveContext(testSessionId, null, 3);
  assert.ok(activeCtx.rootObjective.includes('G0 根目标'), 'G0 根目标应全周期稳定输出');
  assert.ok(activeCtx.activeFacts.some(f => f.includes('向后兼容')), '红线约束 (向后兼容) 应不被衰减');
  console.log('✔ 分片存储、原子写与滑动窗口衰减测试全部通过！\n');

  console.log('--- 4. 测试 PreCompact 快照归档与 SessionStart(compact) 状态对齐 ---');
  const snapFile = storage.exportSnapshot(testSessionId);
  assert.ok(fs.existsSync(snapFile), '快照文件必须成功生成');

  // 模拟宿主 Tier 4 深度蒸馏重构
  storage.resetOnCompact(testSessionId, '宿主 Tier 4 重构摘要：完成了认证体系设计与迁移。');
  const stateAfterCompact = storage.readState(testSessionId, null);
  assert.strictEqual(stateAfterCompact.currentRound, 1, 'Compact 后逻辑轮次必须重置为 1');
  assert.strictEqual(stateAfterCompact.slidingWindow.length, 1, '局部窗口应清空并吸收宿主摘要作为基石');
  console.log('✔ PreCompact 快照与 Compact 协同协议测试全部通过！\n');

  // 清理临时测试目录（使用安全删除）
  const rmfilePath = '/opt/xrsec/.env/rmfile';
  if (fs.existsSync(rmfilePath)) {
    try {
      const { execFileSync } = await import('node:child_process');
      execFileSync(rmfilePath, [TEST_DIR], { stdio: 'ignore' });
    } catch {}
  }
}

runTests().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});

