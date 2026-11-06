/**
 * Purpose: 0ms deterministic regex fast-path bypassing unnecessary LLM distillation calls.
 * Context: multiagent-orchestration daemon, eliminates 800ms-1500ms latency for short commands.
 * Usage: Invoked on every user prompt submit before dispatching to Distiller.
 * Prerequisites: BlackboardStore instance.
 */

import { BlackboardStore } from '../blackboard/BlackboardStore';

export interface FastPathResult {
  mode: 'BYPASS_TO_CODER' | 'ABORT_ALL' | 'DIRECT_COMMAND' | 'STANDARD_DISTILL';
  message?: string;
}

export function evaluateFastPath(rawInput: string, store: BlackboardStore): FastPathResult {
  const trimmed = rawInput.trim();

  // 1. 极简确认词与短语：直接激活 Backlog 队列首项任务或直通待办
  if (/^(y|yes|ok|sure|好的|继续|推进|确认|执行|可以|行)([,，\s]*(好的|继续|推进|确认|执行|可以|行|吧|的))*$/i.test(trimmed)) {
    const state = store.readState();
    if (state.kanban.activeTask && state.kanban.activeTask.status === 'TODO') {
      return { mode: 'BYPASS_TO_CODER' };
    }
    if (!state.kanban.activeTask && state.kanban.backlog.length > 0) {
      store.mutate('HostFastPath', 'PROMOTE_BACKLOG', (draft) => {
        const next = draft.kanban.backlog.shift()!;
        draft.kanban.activeTask = {
          ...next,
          assignee: 'moCode',
          status: 'TODO',
          stagnationCount: 0,
          rejectionCount: 0,
          crossReviewed: false,
        };
        return `Promoted ${next.id} via fast-path confirmation`;
      });
      return { mode: 'BYPASS_TO_CODER' };
    }
  }

  // 2. 紧急中断词与短语：立即挂起并清空排队任务
  if (/^(no|stop|abort|cancel|revert|暂停|停|回滚)([,，\s]*(立刻|马上|全部|停止|退出|回滚|暂停))*$/i.test(trimmed)) {
    store.mutate('HostFastPath', 'EMERGENCY_ABORT', (draft) => {
      draft.kanban.activeTask = null;
      draft.kanban.backlog = [];
      return 'Emergency abort triggered by human operator';
    });
    return {
      mode: 'ABORT_ALL',
      message: '已响应紧急中止指令：当前活动工单与排队任务已全部安全挂起。',
    };
  }

  // 3. 原生控制台指令直通：免除自然语言改写，防止破坏精密参数
  if (/^(\/|git\s+|npm\s+|pnpm\s+|cargo\s+|pytest\s+)/.test(trimmed)) {
    const cmdId = `CMD-${Date.now().toString().slice(-4)}`;
    store.mutate('HostFastPath', 'DIRECT_COMMAND_TASK', (draft) => {
      draft.kanban.activeTask = {
        id: cmdId,
        title: `执行原生工程指令: ${trimmed.slice(0, 40)}`,
        assignee: 'moCode',
        status: 'TODO',
        specification: `在工作区原样执行以下原生指令并汇报结果: \`${trimmed}\``,
        acceptanceCriteria: '指令以 Exit Code 0 正常退出且无未捕获异常',
        stagnationCount: 0,
        rejectionCount: 0,
        crossReviewed: false,
      };
      return `Created direct command task ${cmdId}`;
    });
    return { mode: 'DIRECT_COMMAND' };
  }

  return { mode: 'STANDARD_DISTILL' };
}
