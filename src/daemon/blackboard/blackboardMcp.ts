/**
 * Purpose: Blackboard MCP Server exporting read/write tools for multi-companion cluster.
 * Context: multiagent-orchestration daemon, aligns with Claude Agent SDK in-process bridge.
 * Usage: Injected into ClaudeSdkRunner allowedMcpServers or launched via stdio.
 * Prerequisites: BlackboardStore initialized, @anthropic-ai/claude-agent-sdk.
 */

import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { z } from 'zod';
import {
  BlackboardState,
  ActiveTask,
  TaskStatus,
  TOKEN_LIMITS,
} from './types';
import { BlackboardStore, compactTouchedFiles } from './BlackboardStore';

function getSdkTools(): { tool: any; createSdkMcpServer: any } {
  const candidates = [
    '@anthropic-ai/claude-agent-sdk',
    path.resolve(__dirname, '../../../../extensions/CindyR/node_modules/@anthropic-ai/claude-agent-sdk'),
    path.resolve(__dirname, '../../../../extensions/multiagent-orchestration-old/node_modules/@anthropic-ai/claude-agent-sdk'),
  ];
  for (const c of candidates) {
    try {
      const sdk = require(c);
      if (typeof sdk.tool === 'function' && typeof sdk.createSdkMcpServer === 'function') {
        return { tool: sdk.tool, createSdkMcpServer: sdk.createSdkMcpServer };
      }
    } catch {}
  }
  throw new Error('Failed to resolve @anthropic-ai/claude-agent-sdk tool APIs');
}

function selectProjection(state: BlackboardState, projection: string): unknown {
  switch (projection) {
    case 'coder_view':
      return {
        version: state.version,
        rootGoal: state.rootGoal,
        activeTask: state.kanban.activeTask,
        environment: state.environment,
        lastFailure: state.audit.lastVerdict.verdict === 'REJECTED' ? state.audit.lastVerdict : null,
        recentDigest: state.slidingDigest.slice(-1),
      };
    case 'qa_view':
      return {
        version: state.version,
        invariants: state.rootGoal.invariants,
        activeTask: state.kanban.activeTask,
        touchedFiles: state.environment.touchedFiles,
        previousRejections: state.kanban.activeTask?.rejectionCount ?? 0,
      };
    case 'distiller_view':
      return {
        version: state.version,
        rootGoal: state.rootGoal,
        activeTask: state.kanban.activeTask,
        backlog: state.kanban.backlog,
        slidingDigest: state.slidingDigest,
        environment: state.environment,
      };
    case 'scribe_view':
      return {
        version: state.version,
        activeTask: state.kanban.activeTask,
        lastVerdict: state.audit.lastVerdict,
        slidingDigest: state.slidingDigest,
        touchedFiles: state.environment.touchedFiles,
      };
    default:
      return state;
  }
}

export function createBlackboardMcpServer(store: BlackboardStore) {
  const { tool, createSdkMcpServer } = getSdkTools();

  const readSliceTool = tool(
    'read_slice',
    '按需读取共享黑板受限视图投影。支持: all, coder_view, qa_view, distiller_view, scribe_view',
    {
      projection: z
        .enum(['all', 'coder_view', 'qa_view', 'distiller_view', 'scribe_view'])
        .default('coder_view')
        .describe('按当前智能体角色选择最小化上下文投影视图'),
    },
    async ({ projection }: { projection: string }) => {
      const state = store.readState();
      const payload = selectProjection(state, projection);
      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      };
    }
  );

  const createTaskTool = tool(
    'create_task',
    'moAdmin (Distiller) 专用：初始化全局根目标（首轮）并向黑板写入高信噪比工程工单。',
    {
      rootObjective: z.string().max(TOKEN_LIMITS.ROOT_OBJECTIVE_CHARS).optional().describe('首轮必填：全局核心目标'),
      invariants: z.array(z.string().max(TOKEN_LIMITS.INVARIANT_CHARS)).max(TOKEN_LIMITS.ROOT_INVARIANTS_MAX).optional(),
      taskId: z.string().describe('工单唯一标识，如 TASK-101'),
      title: z.string().max(TOKEN_LIMITS.TASK_TITLE_CHARS).describe('工单一句话主旨'),
      specification: z.string().max(TOKEN_LIMITS.TASK_SPEC_CHARS).describe('消歧后精确技术规格与路径约束'),
      acceptanceCriteria: z.string().max(TOKEN_LIMITS.TASK_CRITERIA_CHARS).describe('自动化测试命令或明确断言'),
    },
    async (args: any) => {
      try {
        const nextState = store.mutate('moAdmin:Distiller', 'CREATE_TASK', (draft) => {
          if (!draft.rootGoal.locked && args.rootObjective) {
            draft.rootGoal = {
              objective: args.rootObjective.slice(0, TOKEN_LIMITS.ROOT_OBJECTIVE_CHARS),
              invariants: (args.invariants || []).map((i: string) => i.slice(0, TOKEN_LIMITS.INVARIANT_CHARS)),
              locked: true,
            };
          }
          const newTask: ActiveTask = {
            id: args.taskId,
            title: args.title.slice(0, TOKEN_LIMITS.TASK_TITLE_CHARS),
            assignee: 'moCode',
            status: 'TODO',
            specification: args.specification.slice(0, TOKEN_LIMITS.TASK_SPEC_CHARS),
            acceptanceCriteria: args.acceptanceCriteria.slice(0, TOKEN_LIMITS.TASK_CRITERIA_CHARS),
            stagnationCount: 0,
            rejectionCount: 0,
            crossReviewed: false,
          };

          if (!draft.kanban.activeTask) {
            draft.kanban.activeTask = newTask;
          } else {
            draft.kanban.backlog.push({
              id: newTask.id,
              title: newTask.title,
              specification: newTask.specification,
              acceptanceCriteria: newTask.acceptanceCriteria,
            });
            if (draft.kanban.backlog.length > TOKEN_LIMITS.MAX_BACKLOG_ITEMS) {
              draft.kanban.backlog = draft.kanban.backlog.slice(0, TOKEN_LIMITS.MAX_BACKLOG_ITEMS);
            }
          }
          return `Created task ${args.taskId}`;
        });

        return {
          content: [{ type: 'text', text: `工单 ${args.taskId} 已成功写入黑板 (当前版本 v${nextState.version})。` }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }
  );

  const updateTaskStatusTool = tool(
    'update_task_status',
    'moCode 专用：认领活动工单或提交代码改动进入质检阶段。服务端自动校验状态机迁移。',
    {
      taskId: z.string(),
      newStatus: z.enum(['IN_PROGRESS', 'IN_REVIEW']),
      summary: z.string().max(TOKEN_LIMITS.TASK_SUMMARY_CHARS).describe('300字内精炼摘要，严禁超5行代码块'),
      touchedFiles: z.array(z.string()).optional().describe('本次新建或修改的文件相对路径清单'),
    },
    async ({ taskId, newStatus, summary, touchedFiles }: any) => {
      try {
        const nextState = store.mutate('moCode', `TRANSITION_${newStatus}`, (draft) => {
          const task = draft.kanban.activeTask;
          if (!task || task.id !== taskId) {
            throw new Error(`更新拒绝：当前活动工单不是 ${taskId}`);
          }

          const validTransitions: Record<TaskStatus, TaskStatus[]> = {
            TODO: ['IN_PROGRESS'],
            REJECTED: ['IN_PROGRESS'],
            IN_PROGRESS: ['IN_REVIEW'],
            IN_REVIEW: [],
            VERIFIED: [],
            DONE: [],
            BLOCKED_NEED_HUMAN: [],
          };

          if (!validTransitions[task.status]?.includes(newStatus)) {
            throw new Error(`非法状态迁移：禁止从 ${task.status} 直接跳变至 ${newStatus}`);
          }

          const currentHash = crypto.createHash('sha256').update(summary.trim()).digest('hex');
          if (newStatus === 'IN_REVIEW' && task.outputHash === currentHash) {
            task.stagnationCount += 1;
          } else if (newStatus === 'IN_REVIEW') {
            task.outputHash = currentHash;
          }

          task.status = newStatus;
          task.latestSummary = summary.slice(0, TOKEN_LIMITS.TASK_SUMMARY_CHARS);

          if (touchedFiles && touchedFiles.length > 0) {
            draft.environment.touchedFiles = compactTouchedFiles([
              ...draft.environment.touchedFiles,
              ...touchedFiles,
            ]);
          }
          return `Task ${taskId} -> ${newStatus}: ${summary.slice(0, 120)}`;
        });

        return {
          content: [{ type: 'text', text: `工单 ${taskId} 已成功迁移至 ${newStatus} (黑板版本 v${nextState.version})。` }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }
  );

  const postReviewVerdictTool = tool(
    'post_review_verdict',
    'moCI (QA Reviewer) 专用：提交独立测试仲裁决议。驳回时必须附带结构化报错分类与复现命令。',
    {
      taskId: z.string(),
      verdict: z.enum(['VERIFIED', 'REJECTED']),
      failureType: z
        .enum(['ASSERTION_FAILED', 'COMPILATION_ERROR', 'TEST_SUITE_DEFECT', 'ENVIRONMENT_MISSING'])
        .optional(),
      reproCommand: z.string().max(150).optional().describe('精确复现命令'),
      errorSnippet: z.string().max(400).optional().describe('核心报错栈追踪或失败断言行号'),
      diagnosis: z.string().max(200).describe('精炼的故障根因诊断与修复建议'),
    },
    async (args: any) => {
      try {
        const nextState = store.mutate('moCI:Reviewer', `VERDICT_${args.verdict}`, (draft) => {
          const task = draft.kanban.activeTask;
          if (!task || task.id !== args.taskId) {
            throw new Error(`仲裁失败：未找到活动工单 ${args.taskId}`);
          }

          if (args.verdict === 'VERIFIED') {
            task.status = 'VERIFIED';
            task.assignee = 'moAdmin';
            draft.audit.lastVerdict = {
              taskId: task.id,
              verdict: 'VERIFIED',
              diagnosis: args.diagnosis?.slice(0, 200),
            };
            return `Task ${task.id} VERIFIED`;
          }

          task.rejectionCount += 1;
          draft.audit.lastVerdict = {
            taskId: task.id,
            verdict: 'REJECTED',
            failureType: args.failureType ?? 'ASSERTION_FAILED',
            reproCommand: args.reproCommand?.slice(0, 150),
            errorSnippet: args.errorSnippet?.slice(0, 400),
            diagnosis: args.diagnosis?.slice(0, 200),
          };

          if (task.rejectionCount >= 3 || task.stagnationCount >= 2) {
            task.status = 'BLOCKED_NEED_HUMAN';
            return `Task ${task.id} circuit breaker tripped (rejections=${task.rejectionCount})`;
          }

          task.status = 'REJECTED';
          task.assignee = 'moCode';
          return `Task ${task.id} REJECTED (#${task.rejectionCount}): ${args.failureType}`;
        });

        return {
          content: [{
            type: 'text',
            text: `质检判决已写入黑板：当前工单状态为 ${nextState.kanban.activeTask?.status} (v${nextState.version})。`,
          }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }
  );

  const commitDigestTool = tool(
    'commit_digest',
    'moAdmin (Scribe) 专用：将已验证工单压缩归档入 K=2 滑动窗口，并激活 Backlog 中的下一项任务。',
    {
      taskId: z.string(),
      condensedSummary: z.string().max(TOKEN_LIMITS.DIGEST_CONDENSED_CHARS).describe('高度提炼的闭环技术事实'),
      unresolvedNotes: z.string().max(TOKEN_LIMITS.UNRESOLVED_CHARS).default('无').describe('遗留观察项或无'),
    },
    async ({ taskId, condensedSummary, unresolvedNotes }: any) => {
      try {
        const nextState = store.mutate('moAdmin:Scribe', 'COMMIT_DIGEST', (draft) => {
          const task = draft.kanban.activeTask;
          if (!task || task.id !== taskId || task.status !== 'VERIFIED') {
            throw new Error(`归档拒绝：工单 ${taskId} 尚未处于 VERIFIED 状态`);
          }

          const nextEpoch =
            draft.slidingDigest.length > 0
              ? draft.slidingDigest[draft.slidingDigest.length - 1].epoch + 1
              : 1;

          draft.slidingDigest.push({
            epoch: nextEpoch,
            taskId: task.id,
            summary: condensedSummary.slice(0, TOKEN_LIMITS.DIGEST_CONDENSED_CHARS),
            files: draft.environment.touchedFiles.slice(0, 5),
            unresolved: unresolvedNotes.slice(0, TOKEN_LIMITS.UNRESOLVED_CHARS),
          });

          while (draft.slidingDigest.length > TOKEN_LIMITS.MAX_SLIDING_DIGEST) {
            draft.slidingDigest.shift();
          }

          draft.audit.lastVerdict = { taskId: null, verdict: 'IDLE' };
          const nextBacklog = draft.kanban.backlog.shift();
          if (nextBacklog) {
            draft.kanban.activeTask = {
              id: nextBacklog.id,
              title: nextBacklog.title,
              assignee: 'moCode',
              status: 'TODO',
              specification: nextBacklog.specification,
              acceptanceCriteria: nextBacklog.acceptanceCriteria,
              stagnationCount: 0,
              rejectionCount: 0,
              crossReviewed: false,
            };
          } else {
            draft.kanban.activeTask = null;
          }
          return `Archived task ${taskId} into slidingDigest (epoch ${nextEpoch})`;
        });

        store.checkpointWal();

        return {
          content: [{
            type: 'text',
            text: `工单 ${taskId} 已成功沉淀入 K=2 滑动窗口 (黑板版本 v${nextState.version})。`,
          }],
        };
      } catch (err: any) {
        return { isError: true, content: [{ type: 'text', text: err.message }] };
      }
    }
  );

  return createSdkMcpServer({
    name: 'blackboard',
    version: '4.0.0',
    tools: [readSliceTool, createTaskTool, updateTaskStatusTool, postReviewVerdictTool, commitDigestTool],
  });
}

