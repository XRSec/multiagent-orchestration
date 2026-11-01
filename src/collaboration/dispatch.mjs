import crypto from 'node:crypto';
import { executeClaudeSubprocess } from '../core/claude-subprocess.mjs';
import { parseMapEnvelope } from '../core/map-parser.mjs';
import { defaultRegistry } from '../session/agent-registry.mjs';
import { defaultSessionManager } from '../session/session-manager.mjs';

export class DispatchEngine {
  constructor({
    taskId = crypto.randomUUID(),
    registry = defaultRegistry,
    sessionManager = defaultSessionManager,
    defaultTimeoutSec = 120,
  } = {}) {
    this.taskId = taskId;
    this.registry = registry;
    this.sessionManager = sessionManager;
    this.defaultTimeoutSec = defaultTimeoutSec;
  }

  /**
   * Spawns N concurrent subagent worker processes, enforces barrier synchronization,
   * and aggregates results into a fan-in report.
   */
  async dispatchSubtasks(subtasks) {
    if (!Array.isArray(subtasks) || subtasks.length === 0) {
      throw new Error('DispatchEngine: subtasks must be a non-empty array.');
    }

    this.sessionManager.appendTimelineEvent({
      channel: `grp_disp_${this.taskId}`,
      sender: 'orchestrator',
      target: 'ALL',
      action: 'DISPATCH_FAN_OUT',
      content: `Dispatched ${subtasks.length} concurrent subtasks.`,
      metadata: { taskId: this.taskId, subtasksCount: subtasks.length },
    });

    const executionPromises = subtasks.map((subtask, index) =>
      this.executeWorkerSubtask({ subtask, index })
    );

    // Barrier synchronization
    const settledResults = await Promise.allSettled(executionPromises);

    const aggregatedOutputs = [];
    const collectedArtifacts = new Set();
    let allSucceeded = true;

    for (let i = 0; i < settledResults.length; i++) {
      const settled = settledResults[i];
      const taskMeta = subtasks[i];

      if (settled.status === 'fulfilled') {
        const item = settled.value;
        aggregatedOutputs.push(item);
        if (item.status !== 'SUCCESS') {
          allSucceeded = false;
        }
        for (const art of item.artifacts) {
          collectedArtifacts.add(art);
        }
      } else {
        allSucceeded = false;
        aggregatedOutputs.push({
          target: taskMeta.target,
          status: 'FAILED',
          durationMs: 0,
          error: settled.reason?.message || 'Unknown rejection',
          summary: '',
          cleanText: '',
          artifacts: [],
        });
      }
    }

    const fanInPacket = {
      taskId: this.taskId,
      success: allSucceeded,
      totalSubtasks: subtasks.length,
      artifacts: Array.from(collectedArtifacts),
      results: aggregatedOutputs,
    };

    this.sessionManager.appendTimelineEvent({
      channel: `grp_disp_${this.taskId}`,
      sender: 'host',
      target: 'orchestrator',
      action: 'DISPATCH_FAN_IN',
      content: `Aggregated ${aggregatedOutputs.length} subtask results. Status: ${allSucceeded ? 'ALL_OK' : 'PARTIAL_FAIL'}`,
      artifacts: Array.from(collectedArtifacts),
      metadata: { fanInPacket },
    });

    return fanInPacket;
  }

  async executeWorkerSubtask({ subtask, index }) {
    const { target, instruction, timeout_sec } = subtask;
    const timeoutMs = (timeout_sec || this.defaultTimeoutSec) * 1000;

    const agentConfig = this.registry.getAgent(target);
    if (!agentConfig) {
      return {
        target,
        status: 'FAILED',
        durationMs: 0,
        error: `Target agent "${target}" not found in registry.`,
        summary: '',
        cleanText: '',
        artifacts: [],
      };
    }

    const sessionUuid = this.sessionManager.getOrCreateSessionUuid(
      `disp_${this.taskId}_${target}_${index}`
    );

    const workerPrompt = `### CONCURRENT SUBTASK ASSIGNMENT
Task ID: ${this.taskId}
Assigned Specialist: ${target}

### INSTRUCTION:
${instruction}

### PROTOCOL:
Execute your assigned subtask independently. Upon completion, emit your Machine Action Protocol (MAP) block:
<!-- CINDY_MAP:BEGIN -->
{
  "version": "1.0.0",
  "action": "COMPLETE",
  "sender": "${target}",
  "target": "orchestrator",
  "task_id": "${this.taskId}",
  "payload": {
    "summary": "<dense summary of work done>",
    "artifacts": ["<modified or created files>"]
  }
}
<!-- CINDY_MAP:END -->`;

    const subResult = await executeClaudeSubprocess({
      prompt: workerPrompt,
      sessionUuid,
      systemPromptPath: agentConfig.systemPromptPath,
      model: agentConfig.defaultModel,
      timeoutMs,
    });

    if (subResult.timedOut) {
      return {
        target,
        status: 'TIMEOUT',
        durationMs: subResult.durationMs,
        error: `Subtask exceeded timeout barrier of ${timeout_sec || this.defaultTimeoutSec}s`,
        summary: '',
        cleanText: '',
        artifacts: [],
      };
    }

    if (!subResult.success) {
      return {
        target,
        status: 'FAILED',
        durationMs: subResult.durationMs,
        error: subResult.error?.message || subResult.rawStderr || 'Execution failed',
        summary: '',
        cleanText: '',
        artifacts: [],
      };
    }

    const { packet, cleanText } = parseMapEnvelope(subResult.resultText, {
      sender: target,
      target: 'orchestrator',
      taskId: this.taskId,
    });

    return {
      target,
      status: 'SUCCESS',
      durationMs: subResult.durationMs,
      summary: packet.payload.summary || cleanText,
      cleanText,
      artifacts: packet.payload.artifacts || [],
    };
  }

  /**
   * Synthesizes the fan-in packet into a final report using the Orchestrator.
   */
  async synthesizeReport(fanInPacket, originalUserIntent = '') {
    const orchestrator = this.registry.getOrchestrator();
    if (!orchestrator) {
      throw new Error('Orchestrator not found in registry.');
    }

    const sessionUuid = this.sessionManager.getOrCreateSessionUuid(`orch_synth_${this.taskId}`);

    const subtaskSummaries = fanInPacket.results
      .map(
        (r) =>
          `[Agent: ${r.target}] Status: ${r.status} (${r.durationMs}ms)\nSummary: ${r.summary}\nArtifacts: ${r.artifacts.join(', ') || 'None'}`
      )
      .join('\n\n');

    const synthesisPrompt = `### SYNTHESIS TASK
Task ID: ${this.taskId}
Original User Intent: ${originalUserIntent}

### SUBTASK FAN-IN RESULTS:
${subtaskSummaries}

### INSTRUCTION:
Synthesize a comprehensive, high-density executive report for the user incorporating all subtask deliverables.`;

    const response = await executeClaudeSubprocess({
      prompt: synthesisPrompt,
      sessionUuid,
      systemPromptPath: orchestrator.systemPromptPath,
      model: orchestrator.defaultModel,
      timeoutMs: this.defaultTimeoutSec * 1000,
    });

    const { packet, cleanText } = parseMapEnvelope(response.resultText, {
      sender: orchestrator.id,
      target: 'user',
      taskId: this.taskId,
    });

    return {
      taskId: this.taskId,
      success: response.success,
      executiveReport: cleanText || packet.payload.summary,
      fanInPacket,
    };
  }
}
