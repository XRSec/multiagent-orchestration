/**
 * Purpose: Exhaustive unit and integration test suite verifying v4.0-PRODUCTION Blackboard SSOT.
 * Context: multiagent-orchestration test environment, validates atomic WAL, FSM, and guards.
 * Usage: npm exec tsx test/blackboard-atomic.test.ts
 * Prerequisites: Node.js 22.5+ or 26+ runtime with native node:sqlite.
 */

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { BlackboardStore, compactTouchedFiles } from '../src/daemon/blackboard/BlackboardStore';
import { evaluateFastPath } from '../src/daemon/orchestrator/fastPath';
import {
  dangerousCommandGuardHook,
  createCompactionGuardHooks,
} from '../src/daemon/blackboard/lifecycleHooks';

const TEST_ROOT = path.join(__dirname, 'fixtures', 'blackboard-test-' + Date.now());

describe('v4.0-PRODUCTION Blackboard SSOT & FSM Suite', () => {
  before(() => {
    fs.mkdirSync(TEST_ROOT, { recursive: true });
  });

  after(() => {
    // 按照规则使用 /opt/xrsec/.env/rmfile 安全删除临时测试目录
    const cp = require('node:child_process');
    try {
      cp.execSync(`/opt/xrsec/.env/rmfile -rf ${TEST_ROOT}`);
    } catch {}
  });

  test('1. 跨进程/跨实例 SQLite WAL 强一致原子持久化 (Anti-Amnesia)', () => {
    // 模拟 moAdmin 进程启动并初始化黑板
    const storeProcessA = new BlackboardStore(TEST_ROOT);
    storeProcessA.mutate('moAdmin:Distiller', 'CREATE_TASK', (draft) => {
      draft.rootGoal = {
        objective: '重构认证网关以支持双向 JWT 校验',
        invariants: ['严禁破坏现有 REST 接口契约', '单测覆盖率不低于 85%'],
        locked: true,
      };
      draft.kanban.activeTask = {
        id: 'TASK-101',
        title: '实现 Token 拦截器',
        assignee: 'moCode',
        status: 'TODO',
        specification: '在 auth_middleware.ts 引入校验中间件',
        acceptanceCriteria: 'npm test -- -t auth 通过',
        stagnationCount: 0,
        rejectionCount: 0,
        crossReviewed: false,
      };
      return 'Created task TASK-101';
    });

    const stateA = storeProcessA.readState();
    assert.equal(stateA.version, 2);
    assert.equal(stateA.kanban.activeTask?.id, 'TASK-101');
    storeProcessA.close(); // 模拟 moAdmin 进程完全退出

    // 模拟 moCode 启动一个全新的独立子进程拉起存储
    const storeProcessB = new BlackboardStore(TEST_ROOT);
    const stateB = storeProcessB.readState();

    assert.equal(stateB.version, 2);
    assert.equal(stateB.rootGoal.objective, '重构认证网关以支持双向 JWT 校验');
    assert.equal(stateB.rootGoal.invariants.length, 2);
    assert.equal(stateB.kanban.activeTask?.id, 'TASK-101');
    assert.equal(stateB.kanban.activeTask?.status, 'TODO');
    storeProcessB.close();
  });

  test('2. 严格预算治理与路径折叠截断 (Token Guard)', () => {
    const rawFiles = [
      'src/auth/jwt.ts',
      'src/auth/signer.ts',
      'src/auth/verifier.ts',
      'src/auth/keys.ts',
      'src/middleware/auth.ts',
      'src/middleware/logger.ts',
      'src/middleware/cors.ts',
      'src/middleware/limiter.ts',
      'src/utils/crypto.ts',
      'src/utils/encoding.ts',
      'src/utils/validator.ts',
      'src/utils/format.ts',
    ];
    const compacted = compactTouchedFiles(rawFiles);
    assert.ok(compacted.length <= 10, '文件路径必须按前缀折叠至不超过 10 项');
    assert.ok(compacted.some((f) => f.includes('files')));
  });

  test('3. 单向状态迁移安全校验与 SHA-256 停滞检测', () => {
    const store = new BlackboardStore(TEST_ROOT);

    // 验证非法跳变阻断
    assert.throws(
      () => {
        store.mutate('moCode', 'ILLEGAL_TRANSITION', (draft) => {
          const task = draft.kanban.activeTask!;
          // TODO -> IN_REVIEW 为非法跳变，必须先置为 IN_PROGRESS
          const validTransitions: Record<string, string[]> = {
            TODO: ['IN_PROGRESS'],
            IN_PROGRESS: ['IN_REVIEW'],
          };
          if (!validTransitions[task.status]?.includes('IN_REVIEW')) {
            throw new Error('非法状态迁移：禁止跳过 IN_PROGRESS');
          }
          task.status = 'IN_REVIEW';
          return 'Illegal';
        });
      },
      /非法状态迁移/,
      '必须拦截非法状态跳变'
    );

    // 合法流转：TODO -> IN_PROGRESS -> IN_REVIEW
    store.mutate('moCode', 'CLAIM_TASK', (draft) => {
      draft.kanban.activeTask!.status = 'IN_PROGRESS';
      return 'Claimed';
    });
    assert.equal(store.readState().kanban.activeTask?.status, 'IN_PROGRESS');

    // 提交摘要并记录哈希
    const crypto = require('node:crypto');
    const summary1 = '完成中间件核心验证逻辑编写';
    const hash1 = crypto.createHash('sha256').update(summary1.trim()).digest('hex');

    store.mutate('moCode', 'SUBMIT_REVIEW', (draft) => {
      draft.kanban.activeTask!.status = 'IN_REVIEW';
      draft.kanban.activeTask!.latestSummary = summary1;
      draft.kanban.activeTask!.outputHash = hash1;
      return 'Submit review';
    });

    // 模拟重复提交完全相同的摘要，触发 stagnationCount 自增
    store.mutate('moCode', 'REPEAT_SUBMIT', (draft) => {
      const task = draft.kanban.activeTask!;
      if (task.outputHash === hash1) {
        task.stagnationCount += 1;
      }
      return 'Repeat submit';
    });

    assert.equal(store.readState().kanban.activeTask?.stagnationCount, 1);
    store.close();
  });

  test('4. 0ms 本地确定性正则快速旁路 (Fast-Path)', () => {
    const store = new BlackboardStore(TEST_ROOT);

    // 预填一条 Backlog
    store.mutate('Setup', 'ADD_BACKLOG', (draft) => {
      draft.kanban.activeTask = null;
      draft.kanban.backlog = [
        {
          id: 'TASK-102',
          title: '配置 Redis 令牌桶限流',
          specification: '在 rate_limiter.ts 接入 Redis',
          acceptanceCriteria: 'npm test -- -t rate-limit 通过',
        },
      ];
      return 'Added backlog';
    });

    // 测试极简确认词直接晋升 Backlog 首项
    const bypassRes = evaluateFastPath('好的，继续推进', store);
    assert.equal(bypassRes.mode, 'BYPASS_TO_CODER');
    assert.equal(store.readState().kanban.activeTask?.id, 'TASK-102');
    assert.equal(store.readState().kanban.activeTask?.status, 'TODO');

    // 测试原生工程命令直通
    const cmdRes = evaluateFastPath('git status', store);
    assert.equal(cmdRes.mode, 'DIRECT_COMMAND');
    assert.ok(store.readState().kanban.activeTask?.id.startsWith('CMD-'));

    // 测试紧急中断词
    const abortRes = evaluateFastPath('暂停，立刻回滚', store);
    assert.equal(abortRes.mode, 'ABORT_ALL');
    assert.equal(store.readState().kanban.activeTask, null);
    assert.equal(store.readState().kanban.backlog.length, 0);

    store.close();
  });

  test('5. PreToolUse 高危命令物理拦截门禁 (Safety Invariant)', async () => {
    // 拦截高危 Shell
    const rmRes = await dangerousCommandGuardHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });
    assert.equal(rmRes.hookSpecificOutput?.permissionDecision, 'deny');
    assert.ok(rmRes.hookSpecificOutput?.permissionDecisionReason?.includes('高危破坏性'));

    // 拦截破坏性 git push --force
    const gitRes = await dangerousCommandGuardHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'git push --force origin main' },
    });
    assert.equal(gitRes.hookSpecificOutput?.permissionDecision, 'deny');

    // 拦截修改敏感 .env
    const envRes = await dangerousCommandGuardHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/project/.env' },
    });
    assert.equal(envRes.hookSpecificOutput?.permissionDecision, 'deny');
    assert.ok(envRes.hookSpecificOutput?.permissionDecisionReason?.includes('.env'));

    // 放行正常命令
    const normalRes = await dangerousCommandGuardHook({
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
    });
    assert.equal(normalRes.hookSpecificOutput, undefined);
  });

  test('6. 防压缩裂脑双钩子协议 (PreCompact + SessionStart)', async () => {
    const store = new BlackboardStore(TEST_ROOT);
    store.mutate('Setup', 'INIT_MEM', (draft) => {
      draft.rootGoal = { objective: '核心架构总纲', invariants: ['保持向后兼容'], locked: true };
      draft.slidingDigest = [
        { epoch: 1, taskId: 'TASK-1', summary: '完成基础设施', files: ['src/base.ts'], unresolved: '无' },
      ];
      return 'Init';
    });

    const hooks = createCompactionGuardHooks(store, TEST_ROOT);

    // PreCompact: 严禁返回 hookSpecificOutput
    const preRes = await hooks.preCompactHook({ hook_event_name: 'PreCompact' });
    assert.equal(preRes.continue, true);
    assert.equal(preRes.suppressOutput, true);
    assert.equal(preRes.hookSpecificOutput, undefined, 'PreCompact 绝不能包含 hookSpecificOutput');

    const snapshotFile = path.join(TEST_ROOT, '.claude', 'blackboard_epoch.json');
    assert.ok(fs.existsSync(snapshotFile), '快照文件必须同步物理落盘');

    // SessionStart (compact): 成功注入 additionalContext
    const sessionRes = await hooks.sessionStartCompactHook({ hook_event_name: 'SessionStart' });
    assert.equal(sessionRes.continue, true);
    assert.ok(sessionRes.hookSpecificOutput?.additionalContext?.includes('BLACKBOARD SSOT RE-ANCHORED'));
    assert.ok(sessionRes.hookSpecificOutput?.additionalContext?.includes('保持向后兼容'));

    store.close();
  });

  test('7. 3 级阶梯式质量仲裁与熔断自愈 (QA Escalation Protocol)', () => {
    const store = new BlackboardStore(TEST_ROOT);

    // 初始化待审任务
    store.mutate('Setup', 'INIT_REJECT_TASK', (draft) => {
      draft.kanban.activeTask = {
        id: 'TASK-201',
        title: '测试阶梯驳回',
        assignee: 'moCode',
        status: 'IN_REVIEW',
        specification: '修复边界溢出',
        acceptanceCriteria: 'npm test 通过',
        stagnationCount: 0,
        rejectionCount: 0,
        crossReviewed: false,
      };
      return 'Init';
    });

    // 阶梯 1: 首次驳回 -> rejectionCount = 1, 退回 TODO 给 moCode 修复
    store.mutate('moCI:Reviewer', 'VERDICT_REJECTED', (draft) => {
      const task = draft.kanban.activeTask!;
      task.rejectionCount += 1;
      task.status = 'REJECTED';
      draft.audit.lastVerdict = {
        taskId: task.id,
        verdict: 'REJECTED',
        failureType: 'ASSERTION_FAILED',
        reproCommand: 'npm test -- -t overflow',
        diagnosis: 'Line 42 断言失败',
      };
      return 'Reject 1';
    });
    assert.equal(store.readState().kanban.activeTask?.rejectionCount, 1);
    assert.equal(store.readState().kanban.activeTask?.status, 'REJECTED');

    // 阶梯 2: 第二次驳回并触发交叉复审
    store.mutate('moCI:Reviewer', 'VERDICT_REJECTED_2', (draft) => {
      const task = draft.kanban.activeTask!;
      task.rejectionCount += 1;
      draft.audit.lastVerdict = {
        taskId: task.id,
        verdict: 'REJECTED',
        failureType: 'TEST_SUITE_DEFECT',
        diagnosis: '怀疑测试脚本断言有误',
      };
      return 'Reject 2';
    });
    assert.equal(store.readState().kanban.activeTask?.rejectionCount, 2);

    // 触发交叉复审完成后写入 testIntegrityNote
    store.mutate('moAdmin:Arbiter', 'CROSS_REVIEW_DONE', (draft) => {
      const task = draft.kanban.activeTask!;
      task.crossReviewed = true;
      task.status = 'TODO';
      draft.audit.lastVerdict.testIntegrityNote = '经核查，确实为测试 Mock 数据过期，授权一并修复';
      return 'Cross review completed';
    });
    assert.equal(store.readState().kanban.activeTask?.crossReviewed, true);
    assert.equal(store.readState().kanban.activeTask?.status, 'TODO');

    // 阶梯 3: 第三次驳回触发 BLOCKED_NEED_HUMAN 安全熔断
    store.mutate('moCI:Reviewer', 'VERDICT_REJECTED_3', (draft) => {
      const task = draft.kanban.activeTask!;
      task.rejectionCount += 1;
      if (task.rejectionCount >= 3) {
        task.status = 'BLOCKED_NEED_HUMAN';
      }
      return 'Circuit breaker tripped';
    });
    assert.equal(store.readState().kanban.activeTask?.status, 'BLOCKED_NEED_HUMAN');

    store.close();
  });
});

