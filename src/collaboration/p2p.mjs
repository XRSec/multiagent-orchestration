import crypto from 'node:crypto';
import { executeClaudeSubprocess } from '../core/claude-subprocess.mjs';
import { parseMapEnvelope } from '../core/map-parser.mjs';
import { defaultRegistry } from '../session/agent-registry.mjs';
import { defaultSessionManager } from '../session/session-manager.mjs';

export const MAX_P2P_DEPTH = 3;
export const ERROR_P2P_MAX_DEPTH = 'E_P2P_MAX_DEPTH';

export class P2PDepthExceededError extends Error {
  constructor(depth, maxDepth = MAX_P2P_DEPTH) {
    super(`P2P recursion bound exceeded: depth ${depth} > max allowed ${maxDepth}`);
    this.name = 'P2PDepthExceededError';
    this.code = ERROR_P2P_MAX_DEPTH;
    this.depth = depth;
    this.maxDepth = maxDepth;
  }
}

export class P2PRouter {
  constructor({
    registry = defaultRegistry,
    sessionManager = defaultSessionManager,
    maxDepth = MAX_P2P_DEPTH,
    defaultTimeoutMs = 60_000,
  } = {}) {
    this.registry = registry;
    this.sessionManager = sessionManager;
    this.maxDepth = maxDepth;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Executes an isolated agent-to-agent side-channel query.
   * Guarantees side-channel isolation (zero public group timeline pollution)
   * and enforces strict call depth bounds <= 3.
   */
  async query({
    srcAgent,
    targetAgent,
    query,
    taskId = crypto.randomUUID(),
    depth = 1,
    timeoutMs,
  }) {
    if (depth > this.maxDepth) {
      throw new P2PDepthExceededError(depth, this.maxDepth);
    }

    if (!query || typeof query !== 'string') {
      throw new Error('P2PRouter: query must be a non-empty string.');
    }

    const targetConfig = this.registry.getAgent(targetAgent);
    if (!targetConfig) {
      throw new Error(`Target agent "${targetAgent}" not found in registry.`);
    }

    // Ephemeral sidechannel session
    const p2pChannelKey = `p2p_${srcAgent}_${targetAgent}_${taskId}`;
    const sessionUuid = this.sessionManager.getOrCreateSessionUuid(p2pChannelKey);

    // Record sidechannel timeline event (marked as sidechannel, excluded from group timeline)
    this.sessionManager.appendTimelineEvent({
      channel: p2pChannelKey,
      sender: srcAgent,
      target: targetAgent,
      action: 'P2P_QUERY',
      content: query,
      metadata: { taskId, depth },
    });

    const p2pPrompt = `### AGENT P2P SIDE-CHANNEL QUERY
Caller: ${srcAgent}
Target: ${targetAgent}
Call Depth: ${depth}/${this.maxDepth}
Task ID: ${taskId}

### TECHNICAL QUERY:
${query}

### INSTRUCTIONS:
This is an isolated peer-to-peer technical consultation.
Provide a concise, factual, and actionable answer. Do NOT emit a full group report.
You may append a MAP envelope with action "COMPLETE" if appropriate:
<!-- CINDY_MAP:BEGIN -->
{
  "version": "1.0.0",
  "action": "COMPLETE",
  "sender": "${targetAgent}",
  "target": "${srcAgent}",
  "task_id": "${taskId}",
  "payload": {
    "summary": "<precise technical answer>"
  }
}
<!-- CINDY_MAP:END -->`;

    const subResult = await executeClaudeSubprocess({
      prompt: p2pPrompt,
      sessionUuid,
      systemPromptPath: targetConfig.systemPromptPath,
      model: targetConfig.defaultModel,
      timeoutMs: timeoutMs || this.defaultTimeoutMs,
    });

    if (!subResult.success) {
      return {
        success: false,
        srcAgent,
        targetAgent,
        taskId,
        depth,
        error: subResult.error?.message || subResult.rawStderr || 'P2P execution failed',
        answer: '',
      };
    }

    const { packet, cleanText } = parseMapEnvelope(subResult.resultText, {
      sender: targetAgent,
      target: srcAgent,
      taskId,
    });

    // Check if downstream triggered another nested P2P query
    if (packet.action === 'P2P_QUERY' && packet.payload.p2p_query) {
      const nextTarget = packet.target;
      // Increment depth
      const nextDepth = depth + 1;
      if (nextDepth > this.maxDepth) {
        throw new P2PDepthExceededError(nextDepth, this.maxDepth);
      }

      const nestedResult = await this.query({
        srcAgent: targetAgent,
        targetAgent: nextTarget,
        query: packet.payload.p2p_query,
        taskId,
        depth: nextDepth,
        timeoutMs,
      });

      return nestedResult;
    }

    const answer = packet.payload.summary || cleanText;

    this.sessionManager.appendTimelineEvent({
      channel: p2pChannelKey,
      sender: targetAgent,
      target: srcAgent,
      action: 'P2P_ANSWER',
      content: answer,
      metadata: { taskId, depth },
    });

    return {
      success: true,
      srcAgent,
      targetAgent,
      taskId,
      depth,
      answer,
      cleanText,
    };
  }
}

export const defaultP2PRouter = new P2PRouter();
