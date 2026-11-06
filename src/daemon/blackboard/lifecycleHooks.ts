/**
 * Purpose: Lifecycle hooks and safety guards defending against compaction brain-split and dangerous commands.
 * Context: multiagent-orchestration daemon, aligns with Claude Agent SDK hook specification.
 * Usage: Integrated into ClaudeSdkRunner options or BlackboardOrchestrator.
 * Prerequisites: BlackboardStore instance.
 */

import * as path from 'node:path';
import { BlackboardStore } from './BlackboardStore';

export interface HookInput {
  hook_event_name: string;
  [key: string]: any;
}

export interface HookOutput {
  continue: boolean;
  suppressOutput?: boolean;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask' | 'defer';
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

export function createCompactionGuardHooks(store: BlackboardStore, projectRoot: string) {
  const snapshotPath = path.join(projectRoot, '.claude', 'blackboard_epoch.json');

  const preCompactHook = async (input: HookInput): Promise<HookOutput> => {
    if (input.hook_event_name !== 'PreCompact') {
      return { continue: true };
    }
    // 严禁返回 hookSpecificOutput，仅执行同步快照落盘
    store.exportSnapshotFile(snapshotPath);
    return {
      continue: true,
      suppressOutput: true,
    };
  };

  const sessionStartCompactHook = async (input: HookInput): Promise<HookOutput> => {
    if (input.hook_event_name !== 'SessionStart') {
      return { continue: true };
    }
    const state = store.readState();
    const digestLines = state.slidingDigest
      .map((d) => `(Epoch ${d.epoch}) ${d.summary}`)
      .join('; ');

    const reanchorMarkdown = [
      '### [BLACKBOARD SSOT RE-ANCHORED AFTER COMPACTION]',
      `- **Global Root Goal**: ${state.rootGoal.objective || '未设定'}`,
      `- **Architectural Invariants**: ${state.rootGoal.invariants.join(' | ') || '无'}`,
      `- **Active Task**: ${
        state.kanban.activeTask
          ? `[${state.kanban.activeTask.id}] ${state.kanban.activeTask.title} (Status: ${state.kanban.activeTask.status})`
          : 'IDLE'
      }`,
      `- **Touched Files**: ${state.environment.touchedFiles.join(', ') || 'None'}`,
      `- **Recent Sliding Digest (K=2)**: ${digestLines || 'None'}`,
    ].join('\n');

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: reanchorMarkdown,
      },
    };
  };

  const coderStopComplianceHook = async (input: HookInput): Promise<HookOutput> => {
    if (input.stop_hook_active === true) {
      return { continue: true };
    }
    const state = store.readState();
    const task = state.kanban.activeTask;
    if (task && task.assignee === 'moCode' && task.status === 'IN_PROGRESS') {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: input.hook_event_name as 'Stop' | 'SubagentStop',
          additionalContext: `检测到工单 ${task.id} 仍处于 IN_PROGRESS 状态。请调用 mcp__blackboard__update_task_status 将状态更新为 IN_REVIEW 并提交 300 字内执行摘要。`,
        },
      };
    }
    return { continue: true };
  };

  return { preCompactHook, sessionStartCompactHook, coderStopComplianceHook };
}

export const dangerousCommandGuardHook = async (input: HookInput): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreToolUse') {
    return { continue: true };
  }

  const toolName = input.tool_name as string;
  const toolInput = (input.tool_input || {}) as Record<string, any>;

  if (toolName === 'Bash' && typeof toolInput.command === 'string') {
    const cmd = toolInput.command;
    const highRiskPattern =
      /(\brm\s+-rf\s+\/|\bgit\s+push\s+--force\b|\bgit\s+reset\s+--hard\b|\bdrop\s+database\b|\bmkfs\b)/i;
    if (highRiskPattern.test(cmd)) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `安全门禁物理阻断：检测到高危破坏性 Shell 指令 (${cmd.slice(0, 60)})`,
        },
      };
    }
  }

  if ((toolName === 'Edit' || toolName === 'Write') && typeof toolInput.file_path === 'string') {
    if (/(^|\/)\.env(\..+)?$/.test(toolInput.file_path)) {
      return {
        continue: true,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: '安全门禁物理阻断：严禁智能体篡改 .env 敏感凭据配置文件',
        },
      };
    }
  }

  return { continue: true };
};

