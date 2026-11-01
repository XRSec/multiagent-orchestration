import crypto from 'node:crypto';
import { executeClaudeSubprocess } from '../core/claude-subprocess.mjs';
import { parseMapEnvelope, formatMapEnvelope } from '../core/map-parser.mjs';
import { defaultRegistry } from '../session/agent-registry.mjs';
import { defaultSessionManager } from '../session/session-manager.mjs';

export const RelayState = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
};

export class RelayPipeline {
  constructor({
    taskId = crypto.randomUUID(),
    pipeline = ['researcher', 'coder', 'reviewer'],
    registry = defaultRegistry,
    sessionManager = defaultSessionManager,
    maxTurns = 10,
    timeoutMs = 120_000,
  } = {}) {
    this.taskId = taskId;
    this.pipeline = pipeline;
    this.registry = registry;
    this.sessionManager = sessionManager;
    this.maxTurns = maxTurns;
    this.timeoutMs = timeoutMs;

    this.currentStageIndex = 0;
    this.agentStates = new Map();
    for (const agentId of pipeline) {
      this.agentStates.set(agentId, RelayState.IDLE);
    }

    this.artifacts = [];
    this.history = [];
  }

  getStageStatus() {
    return Object.fromEntries(this.agentStates.entries());
  }

  /**
   * Executes the sequential pipeline relay.
   */
  async execute(initialPrompt) {
    let currentAgentId = this.pipeline[0];
    let handoverPayload = {
      summary: initialPrompt,
      next_instructions: initialPrompt,
      artifacts: [],
    };
    let turnCount = 0;

    this.sessionManager.appendTimelineEvent({
      channel: `grp_relay_${this.taskId}`,
      sender: 'orchestrator',
      target: currentAgentId,
      action: 'RELAY_START',
      content: initialPrompt,
      metadata: { taskId: this.taskId, pipeline: this.pipeline },
    });

    while (turnCount < this.maxTurns) {
      turnCount++;
      const agentConfig = this.registry.getAgent(currentAgentId);
      if (!agentConfig) {
        throw new Error(`Agent "${currentAgentId}" not found in registry.`);
      }

      // Mark current agent as ACTIVE
      this.agentStates.set(currentAgentId, RelayState.ACTIVE);

      const sessionUuid = this.sessionManager.getOrCreateSessionUuid(
        `relay_${this.taskId}_${currentAgentId}`
      );

      // Build context prompt
      const stepPrompt = this.buildPromptForStage({
        agentId: currentAgentId,
        turnCount,
        handover: handoverPayload,
        accumulatedArtifacts: this.artifacts,
      });

      const response = await executeClaudeSubprocess({
        prompt: stepPrompt,
        sessionUuid,
        systemPromptPath: agentConfig.systemPromptPath,
        model: agentConfig.defaultModel,
        timeoutMs: this.timeoutMs,
      });

      if (!response.success) {
        this.agentStates.set(currentAgentId, RelayState.FAILED);
        return {
          success: false,
          taskId: this.taskId,
          lastAgent: currentAgentId,
          error: response.error?.message || response.rawStderr || 'Subprocess execution failed',
          artifacts: this.artifacts,
          history: this.history,
        };
      }

      const { packet, cleanText } = parseMapEnvelope(response.resultText, {
        sender: currentAgentId,
        target: 'next_stage',
        taskId: this.taskId,
      });

      // Record stage history
      this.history.push({
        turn: turnCount,
        agent: currentAgentId,
        action: packet.action,
        summary: packet.payload.summary,
        cleanText,
        artifacts: packet.payload.artifacts || [],
      });

      // Incorporate any new artifacts
      if (Array.isArray(packet.payload.artifacts)) {
        for (const art of packet.payload.artifacts) {
          if (!this.artifacts.includes(art)) {
            this.artifacts.push(art);
          }
        }
      }

      // Suspend the current agent
      this.agentStates.set(currentAgentId, RelayState.SUSPENDED);

      this.sessionManager.appendTimelineEvent({
        channel: `grp_relay_${this.taskId}`,
        sender: currentAgentId,
        target: packet.target || 'NEXT',
        action: packet.action,
        content: cleanText || packet.payload.summary,
        artifacts: packet.payload.artifacts || [],
        metadata: { turn: turnCount, packet },
      });

      // Check termination or transition
      if (packet.action === 'COMPLETE') {
        this.agentStates.set(currentAgentId, RelayState.COMPLETED);
        return {
          success: true,
          taskId: this.taskId,
          completedBy: currentAgentId,
          finalSummary: packet.payload.summary || cleanText,
          artifacts: this.artifacts,
          history: this.history,
        };
      }

      if (packet.action === 'RELAY') {
        const designatedTarget = packet.target;

        // Check if this is a reverse relay (rejection)
        if (designatedTarget && this.pipeline.includes(designatedTarget)) {
          const targetIndex = this.pipeline.indexOf(designatedTarget);
          const currentIndex = this.pipeline.indexOf(currentAgentId);

          if (targetIndex < currentIndex) {
            // Rejection / backward handoff
            this.agentStates.set(currentAgentId, RelayState.REJECTED);
          }
          currentAgentId = designatedTarget;
        } else {
          // Normal forward progression
          const currentIndex = this.pipeline.indexOf(currentAgentId);
          if (currentIndex < this.pipeline.length - 1) {
            currentAgentId = this.pipeline[currentIndex + 1];
          } else {
            // End of pipeline reached
            this.agentStates.set(currentAgentId, RelayState.COMPLETED);
            return {
              success: true,
              taskId: this.taskId,
              completedBy: currentAgentId,
              finalSummary: packet.payload.summary || cleanText,
              artifacts: this.artifacts,
              history: this.history,
            };
          }
        }

        handoverPayload = {
          summary: packet.payload.summary,
          next_instructions: packet.payload.next_instructions || packet.payload.summary,
          artifacts: packet.payload.artifacts || [],
        };
      } else {
        // Any other action ends turn or completes
        return {
          success: true,
          taskId: this.taskId,
          completedBy: currentAgentId,
          finalSummary: cleanText || packet.payload.summary,
          artifacts: this.artifacts,
          history: this.history,
        };
      }
    }

    return {
      success: false,
      taskId: this.taskId,
      error: `RelayPipeline exceeded maximum allowed turns (${this.maxTurns})`,
      artifacts: this.artifacts,
      history: this.history,
    };
  }

  buildPromptForStage({ agentId, turnCount, handover, accumulatedArtifacts }) {
    const nextAgentIndex = this.pipeline.indexOf(agentId) + 1;
    const defaultNextTarget = nextAgentIndex < this.pipeline.length ? this.pipeline[nextAgentIndex] : 'orchestrator';

    return `### RELAY STAGE EXECUTION
Task ID: ${this.taskId}
Current Role: ${agentId}
Turn: ${turnCount}

### HANDOVER INSTRUCTIONS:
${handover.next_instructions || handover.summary}

### ACCUMULATED ARTIFACTS:
${accumulatedArtifacts.length > 0 ? accumulatedArtifacts.join('\n') : 'None'}

### PROTOCOL REQUIREMENT:
Perform your specialist duty thoroughly. When finished, append your Machine Action Protocol (MAP) packet:
- To hand off to the next stage, use action "RELAY" with target "${defaultNextTarget}".
- If critical defects are found requiring rework, use action "RELAY" with target pointing back to the preceding agent.
- If the entire mission is finalized and verified, use action "COMPLETE" with target "orchestrator".

<!-- CINDY_MAP:BEGIN -->
{
  "version": "1.0.0",
  "action": "RELAY | COMPLETE",
  "sender": "${agentId}",
  "target": "${defaultNextTarget}",
  "task_id": "${this.taskId}",
  "payload": {
    "summary": "<concise stage result summary>",
    "artifacts": ["<new or modified files>"],
    "next_instructions": "<instructions for next recipient>"
  }
}
<!-- CINDY_MAP:END -->`;
  }
}
