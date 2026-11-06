/**
 * Purpose: Precondition-driven native TypeScript FSM orchestrating multi-companion group chat via Blackboard SSOT.
 * Context: multiagent-orchestration daemon, eliminates LLM facilitator latency and token overhead.
 * Usage: Master dispatch engine instantiated by daemon server or CLI runner.
 * Prerequisites: BlackboardStore, Blackboard MCP, Claude Agent SDK runtime.
 */

import * as path from 'node:path';
import { EventEmitter } from 'node:events';
import { BlackboardStore } from '../blackboard/BlackboardStore';
import { createBlackboardMcpServer } from '../blackboard/blackboardMcp';
import {
  createCompactionGuardHooks,
  dangerousCommandGuardHook,
} from '../blackboard/lifecycleHooks';
import { evaluateFastPath, FastPathResult } from './fastPath';
import { ActiveTask, BlackboardState } from '../blackboard/types';

export interface OrchestratorOptions {
  projectRoot: string;
  baseUrl?: string;
  apiKey?: string;
  defaultHaikuModel?: string;
  defaultSonnetModel?: string;
}

export interface TurnRunnerConfig {
  botId: 'moAdmin' | 'moCode' | 'moCI';
  model: string;
  systemPrompt: string;
  allowedTools: string[];
  disallowedTools: string[];
  maxTurns: number;
  maxBudgetUsd: number;
}

function getSdkQuery(): any {
  const candidates = [
    '@anthropic-ai/claude-agent-sdk',
    path.resolve(__dirname, '../../../../extensions/CindyR/node_modules/@anthropic-ai/claude-agent-sdk'),
    path.resolve(__dirname, '../../../../extensions/multiagent-orchestration-old/node_modules/@anthropic-ai/claude-agent-sdk'),
  ];
  for (const c of candidates) {
    try {
      const sdk = require(c);
      if (typeof sdk.query === 'function') {
        return sdk.query;
      }
    } catch {}
  }
  throw new Error('Failed to resolve @anthropic-ai/claude-agent-sdk query API');
}

export class BlackboardOrchestrator extends EventEmitter {
  private store: BlackboardStore;
  private blackboardMcp: any;
  private compactionHooks: ReturnType<typeof createCompactionGuardHooks>;
  private projectRoot: string;
  private baseUrl: string;
  private apiKey: string;
  private haikuModel: string;
  private sonnetModel: string;

  constructor(options: OrchestratorOptions) {
    super();
    this.projectRoot = path.resolve(options.projectRoot);
    this.baseUrl = options.baseUrl || process.env.ANTHROPIC_BASE_URL || process.env.CPA_BASE_URL || '';
    this.apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CPA_API_KEY || '';
    this.haikuModel = options.defaultHaikuModel || 'gemini-3.8-flash';
    this.sonnetModel = options.defaultSonnetModel || 'gemini-3.8-flash';

    this.store = new BlackboardStore(this.projectRoot);
    this.blackboardMcp = createBlackboardMcpServer(this.store);
    this.compactionHooks = createCompactionGuardHooks(this.store, this.projectRoot);
  }

  public getStore(): BlackboardStore {
    return this.store;
  }

  private buildRunnerOptions(config: TurnRunnerConfig): any {
    const sandboxDir = path.join(this.projectRoot, '.claude', 'sandboxes', config.botId);
    return {
      cwd: this.projectRoot,
      model: config.model,
      systemPrompt: {
        type: 'preset',
        preset: 'claude_code',
        append: config.systemPrompt,
      },
      settingSources: [],
      env: {
        ...process.env,
        ANTHROPIC_BASE_URL: this.baseUrl,
        ANTHROPIC_API_KEY: this.apiKey,
        CLAUDE_CONFIG_DIR: sandboxDir,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      },
      mcpServers: {
        blackboard: this.blackboardMcp,
      },
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      permissionMode: config.botId === 'moCode' ? 'acceptEdits' : 'dontAsk',
      maxTurns: config.maxTurns,
      maxBudgetUsd: config.maxBudgetUsd,
      hooks: {
        PreToolUse: [{ hooks: [dangerousCommandGuardHook] }],
        PreCompact: [{ hooks: [this.compactionHooks.preCompactHook] }],
        SessionStart: [{ hooks: [this.compactionHooks.sessionStartCompactHook] }],
      },
    };
  }

  private async dispatchTurn(prompt: string, config: TurnRunnerConfig): Promise<string> {
    const sdkQuery = getSdkQuery();
    const options = this.buildRunnerOptions(config);
    this.emit('bot.start', { botId: config.botId, prompt });

    let reply = '';
    const queryStream = sdkQuery({ prompt, options });

    for await (const msg of queryStream) {
      if (msg.type === 'stream_event' && msg.event?.delta?.text) {
        this.emit('stream.chunk', { botId: config.botId, chunk: msg.event.delta.text });
      } else if (msg.type === 'assistant' && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text' && !reply) {
            reply = block.text;
          }
        }
      } else if (msg.type === 'result' && msg.subtype === 'success') {
        reply = msg.result || reply;
      }
    }

    this.emit('bot.end', { botId: config.botId, reply });
    return reply;
  }

  public async executeUserTurn(rawUserPrompt: string): Promise<string> {
    const fastPath = evaluateFastPath(rawUserPrompt, this.store);
    if (fastPath.mode === 'ABORT_ALL') {
      return fastPath.message || '已中止';
    }

    if (fastPath.mode === 'STANDARD_DISTILL') {
      await this.runDistillerTurn(rawUserPrompt);
    }

    return await this.runFsmLoop();
  }

  private async runDistillerTurn(rawPrompt: string): Promise<void> {
    const prompt = `人类开发者提交了新诉求：\n"${rawPrompt}"\n请先调用 mcp__blackboard__read_slice(projection="distiller_view") 检视全局目标与近期摘要，消除代词歧义，核对代码现场，最后调用 mcp__blackboard__create_task 写入黑板工单。`;
    await this.dispatchTurn(prompt, {
      botId: 'moAdmin',
      model: this.haikuModel,
      systemPrompt: '你是需求架构师 (moAdmin-Distiller)。消除歧义并写入黑板工单，严禁编写代码。',
      allowedTools: [
        'Read',
        'Glob',
        'Grep',
        'mcp__blackboard__read_slice',
        'mcp__blackboard__create_task',
      ],
      disallowedTools: ['Bash', 'Edit', 'Write'],
      maxTurns: 10,
      maxBudgetUsd: 0.15,
    });
  }

  private async runFsmLoop(): Promise<string> {
    let safetyLoopCap = 0;
    while (safetyLoopCap < 15) {
      safetyLoopCap += 1;
      const state = this.store.readState();
      const task = state.kanban.activeTask;

      if (!task) {
        break;
      }

      if (task.status === 'TODO' || task.status === 'IN_PROGRESS') {
        await this.runCoderTurn(task);
      } else if (task.status === 'IN_REVIEW') {
        await this.runQaTurn(task);
      } else if (task.status === 'REJECTED') {
        await this.handleRejectionPolicy(task);
      } else if (task.status === 'VERIFIED') {
        await this.runScribeTurn(task);
      } else if (task.status === 'BLOCKED_NEED_HUMAN') {
        return this.formatBlockedReport(task, state);
      }
    }

    return this.formatFinalDelivery();
  }

  private async runCoderTurn(task: ActiveTask): Promise<void> {
    const prompt = `请调用 mcp__blackboard__read_slice(projection="coder_view") 获取活动工单 ${task.id}。先调用 update_task_status 置为 IN_PROGRESS，编码自测后置为 IN_REVIEW 并附 300 字摘要。`;
    await this.dispatchTurn(prompt, {
      botId: 'moCode',
      model: this.sonnetModel,
      systemPrompt: '你是核心开发工程师 (moCode)。遵循工单规格落地代码，完成自测后翻转状态为 IN_REVIEW。',
      allowedTools: [
        'Bash',
        'Read',
        'Edit',
        'Write',
        'Glob',
        'Grep',
        'mcp__blackboard__read_slice',
        'mcp__blackboard__update_task_status',
      ],
      disallowedTools: ['mcp__blackboard__post_review_verdict', 'mcp__blackboard__commit_digest'],
      maxTurns: 40,
      maxBudgetUsd: 1.5,
    });
  }

  private async runQaTurn(task: ActiveTask): Promise<void> {
    const prompt = `工单 ${task.id} 待审。调用 mcp__blackboard__read_slice(projection="qa_view")，Bash 运行测试用例，调用 mcp__blackboard__post_review_verdict 提交判决。`;
    await this.dispatchTurn(prompt, {
      botId: 'moCI',
      model: this.haikuModel,
      systemPrompt: '你是独立质量审计官 (moCI)。只读裁判，禁止修改代码，根据测试实况出具仲裁。',
      allowedTools: [
        'Bash',
        'Read',
        'Glob',
        'Grep',
        'mcp__blackboard__read_slice',
        'mcp__blackboard__post_review_verdict',
      ],
      disallowedTools: ['Edit', 'Write', 'mcp__blackboard__update_task_status'],
      maxTurns: 15,
      maxBudgetUsd: 0.4,
    });
  }

  private async handleRejectionPolicy(task: ActiveTask): Promise<void> {
    const state = this.store.readState();
    const verdict = state.audit.lastVerdict;

    const needCrossReview =
      (task.rejectionCount === 2 || verdict.failureType === 'TEST_SUITE_DEFECT') &&
      !task.crossReviewed;

    if (needCrossReview) {
      const prompt = `工单 ${task.id} 已连续 2 次质检未通过 (${verdict.failureType})。核查测试脚本本身是否存在断言缺陷，明确判定是业务 Bug 还是测试缺陷。`;
      const report = await this.dispatchTurn(prompt, {
        botId: 'moAdmin',
        model: this.sonnetModel,
        systemPrompt: '你是高级测试架构仲裁官。专项排查测试用例自体缺陷引起的假阴性死锁。',
        allowedTools: ['Read', 'Glob', 'Grep', 'mcp__blackboard__read_slice'],
        disallowedTools: ['Bash', 'Edit', 'Write'],
        maxTurns: 10,
        maxBudgetUsd: 0.3,
      });

      this.store.mutate('HostEscalation', 'CROSS_REVIEW_COMPLETE', (draft) => {
        if (draft.kanban.activeTask) {
          draft.kanban.activeTask.crossReviewed = true;
          draft.kanban.activeTask.status = 'TODO';
          draft.audit.lastVerdict.testIntegrityNote = report.slice(0, 300);
        }
        return 'Completed cross-review for test integrity';
      });
    } else {
      this.store.mutate('HostEscalation', 'RETRY_TODO', (draft) => {
        if (draft.kanban.activeTask) {
          draft.kanban.activeTask.status = 'TODO';
        }
        return `Reset task ${task.id} to TODO for retry #${task.rejectionCount}`;
      });
    }
  }

  private async runScribeTurn(task: ActiveTask): Promise<void> {
    const prompt = `工单 ${task.id} 验收通过。调用 mcp__blackboard__read_slice(projection="scribe_view") 并调用 mcp__blackboard__commit_digest 归档至 K=2 滑动窗口。`;
    await this.dispatchTurn(prompt, {
      botId: 'moAdmin',
      model: this.haikuModel,
      systemPrompt: '你是黑板书记员 (moAdmin-Scribe)。负责提炼闭环事实并维护滑动窗口。',
      allowedTools: ['mcp__blackboard__read_slice', 'mcp__blackboard__commit_digest'],
      disallowedTools: ['Bash', 'Edit', 'Write', 'Glob', 'Grep'],
      maxTurns: 6,
      maxBudgetUsd: 0.08,
    });
  }

  private formatBlockedReport(task: ActiveTask, state: BlackboardState): string {
    const verdict = state.audit.lastVerdict;
    return [
      `⚠️ **[安全熔断告警] 工单 ${task.id} (${task.title}) 触发三级质检熔断，请求人工介入**`,
      `- **累计驳回次数**: ${task.rejectionCount} 次 (停滞指数: ${task.stagnationCount})`,
      `- **故障分类**: ${verdict.failureType ?? 'UNKNOWN'}`,
      `- **复现指令**: \`${verdict.reproCommand ?? 'N/A'}\``,
      `- **核心诊断**: ${verdict.diagnosis ?? '无'}`,
      `- **错误切片**:\n\`\`\`text\n${verdict.errorSnippet ?? '无详细堆栈'}\n\`\`\``,
    ].join('\n');
  }

  private formatFinalDelivery(): string {
    const finalState = this.store.readState();
    const latestDigest = finalState.slidingDigest[finalState.slidingDigest.length - 1];
    return [
      `✅ **[群聊协同交付完成] 黑板版本 v${finalState.version}**`,
      `- **本轮闭环成果**: ${latestDigest?.summary ?? '任务已完成'}`,
      `- **涉及热点文件**: ${finalState.environment.touchedFiles.join(', ') || '无文件变动'}`,
      `- **遗留观察项**: ${latestDigest?.unresolved ?? '无'}`,
    ].join('\n');
  }
}

