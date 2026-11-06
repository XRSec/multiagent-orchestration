/**
 * Purpose: Blackboard data models, status types, and strict Token budget constants.
 * Context: multiagent-orchestration daemon runtime, v4.0-PRODUCTION specification.
 * Usage: Import by BlackboardStore, blackboardMcp, and BlackboardOrchestrator.
 * Prerequisites: TypeScript 5.0+ runtime.
 */

export type TaskStatus =
  | 'TODO'
  | 'IN_PROGRESS'
  | 'IN_REVIEW'
  | 'REJECTED'
  | 'VERIFIED'
  | 'DONE'
  | 'BLOCKED_NEED_HUMAN';

export type FailureType =
  | 'ASSERTION_FAILED'
  | 'COMPILATION_ERROR'
  | 'TEST_SUITE_DEFECT'
  | 'ENVIRONMENT_MISSING';

export interface ActiveTask {
  id: string;
  title: string;
  assignee: 'moCode' | 'moCI' | 'moAdmin';
  status: TaskStatus;
  specification: string;
  acceptanceCriteria: string;
  latestSummary?: string;
  outputHash?: string;
  stagnationCount: number;
  rejectionCount: number;
  crossReviewed: boolean;
}

export interface BacklogItem {
  id: string;
  title: string;
  specification: string;
  acceptanceCriteria: string;
}

export interface SlidingDigestEntry {
  epoch: number;
  taskId: string;
  summary: string;
  files: string[];
  unresolved: string;
}

export interface LastVerdict {
  taskId: string | null;
  verdict: 'IDLE' | 'VERIFIED' | 'REJECTED';
  failureType?: FailureType;
  reproCommand?: string;
  errorSnippet?: string;
  diagnosis?: string;
  testIntegrityNote?: string;
}

export interface BlackboardState {
  version: number;
  updatedAt: string;
  rootGoal: {
    objective: string;
    invariants: string[];
    locked: boolean;
  };
  kanban: {
    activeTask: ActiveTask | null;
    backlog: BacklogItem[];
  };
  environment: {
    activeBranch: string;
    touchedFiles: string[];
    envFacts: Record<string, string>;
  };
  slidingDigest: SlidingDigestEntry[];
  audit: {
    lastVerdict: LastVerdict;
  };
}

export const INITIAL_BLACKBOARD_STATE: BlackboardState = {
  version: 1,
  updatedAt: new Date().toISOString(),
  rootGoal: { objective: '', invariants: [], locked: false },
  kanban: { activeTask: null, backlog: [] },
  environment: { activeBranch: 'main', touchedFiles: [], envFacts: {} },
  slidingDigest: [],
  audit: { lastVerdict: { taskId: null, verdict: 'IDLE' } },
};

export const TOKEN_LIMITS = {
  ROOT_OBJECTIVE_CHARS: 300,
  ROOT_INVARIANTS_MAX: 5,
  INVARIANT_CHARS: 120,
  TASK_TITLE_CHARS: 100,
  TASK_SPEC_CHARS: 600,
  TASK_CRITERIA_CHARS: 300,
  TASK_SUMMARY_CHARS: 300,
  DIGEST_CONDENSED_CHARS: 180,
  UNRESOLVED_CHARS: 100,
  MAX_BACKLOG_ITEMS: 5,
  MAX_TOUCHED_FILES: 10,
  MAX_SLIDING_DIGEST: 2,
};

