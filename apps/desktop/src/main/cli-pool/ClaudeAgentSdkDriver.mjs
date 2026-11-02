#!/usr/bin/env node
/**
 * Purpose: Native Claude Agent SDK driver providing in-memory hooks and in-process MCP.
 * Context: Primary Electron main runtime driver replacing child_process NDJSON piping.
 * Usage: Invoked by ProcessPool to run autonomous turns with memory-level steering.
 * Prerequisites: @anthropic-ai/claude-agent-sdk v0.3.310+, Node.js 18+
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { query, createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { SdkPipelineAdapter } from '../../../../../packages/agent-control-plane/SdkPipelineAdapter.mjs';

const RUNTIME_ROOT = path.join(os.homedir(), '.multiagent-orchestration');

export class ClaudeAgentSdkDriver extends EventEmitter {
  constructor(options = {}) {
    super();
    this.partnerId = options.partnerId;
    this.partnerDir = options.partnerDir || path.join(RUNTIME_ROOT, 'partners', this.partnerId);
    this.manifest = options.manifest || this._loadManifest();
    
    this.abortController = new AbortController();
    this.memorySteeringDirective = null;
    this.isRunning = false;
    this.activeSessionId = options.sessionId || null;
    this.pipeline = options.pipeline || new SdkPipelineAdapter({
      cacheDir: path.join(RUNTIME_ROOT, 'cache', 'capsules')
    });
  }

  _loadManifest() {
    const manifestPath = path.join(this.partnerDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.warn(`[SdkDriver] Failed to read manifest at ${manifestPath}:`, err.message);
      }
    }
    return { id: this.partnerId, name: this.partnerId, allowed_tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'] };
  }

  _assembleSystemPrompt() {
    const promptParts = [];

    // 1. Base Standing Order Axioms
    const standingOrderPath = path.join(RUNTIME_ROOT, 'axioms', 'STANDING_ORDER.md');
    if (fs.existsSync(standingOrderPath)) {
      promptParts.push(fs.readFileSync(standingOrderPath, 'utf-8'));
    }

    // 2. Harness Contract
    const harnessPath = path.join(RUNTIME_ROOT, 'axioms', '00-harness-injection.md');
    if (fs.existsSync(harnessPath)) {
      promptParts.push(fs.readFileSync(harnessPath, 'utf-8'));
    }

    // 3. Base Soul (specialist partner)
    if (!this.manifest.is_lead) {
      const baseSoulPath = path.join(RUNTIME_ROOT, 'axioms', '01-partner-base-soul.md');
      if (fs.existsSync(baseSoulPath)) {
        promptParts.push(fs.readFileSync(baseSoulPath, 'utf-8'));
      }
    }

    // 4. Partner-specific SOUL.md
    const soulPath = path.join(this.partnerDir, 'SOUL.md');
    if (fs.existsSync(soulPath)) {
      promptParts.push(fs.readFileSync(soulPath, 'utf-8'));
    }

    // 5. Pre-load first 200 lines / 25KB of MEMORY.md
    const memPath = path.join(this.partnerDir, 'memories', 'MEMORY.md');
    if (fs.existsSync(memPath)) {
      try {
        const memContent = fs.readFileSync(memPath, 'utf-8');
        const truncatedLines = memContent.split('\n').slice(0, 200).join('\n');
        promptParts.push(`# ACTIVE MEMORY SHARD (PRE-LOADED)\n${truncatedLines}`);
      } catch (e) {
        console.warn('[SdkDriver] Failed to read memory shard:', e.message);
      }
    }

    return promptParts.join('\n\n');
  }

  /**
   * Set in-memory steering directive for next PreToolUse hook execution
   */
  setSteeringDirective(directive) {
    this.memorySteeringDirective = directive;
  }

  /**
   * Hard cancel or interrupt active execution
   */
  interrupt(reason = 'User or Orchestrator mid-flight interrupt') {
    this.abortController.abort(reason);
    this.abortController = new AbortController(); // Reset for next query
    this.isRunning = false;
    this.emit('interrupted', { reason });
  }

  /**
   * Execute an autonomous query turn through Claude Agent SDK
   */
  async executeTurn(prompt, options = {}) {
    this.isRunning = true;
    const combinedSystemPrompt = this._assembleSystemPrompt();

    // Phase 1: UserPromptSubmit through Control Plane Pipeline
    const preflight = this.pipeline.handleUserPromptSubmit(prompt, {
      sessionId: this.activeSessionId,
      rawTools: (this.manifest.allowed_tools || []).map(name => ({ name }))
    });
    const effectivePrompt = preflight.lockedPromptBundle?.fullPrompt || prompt;

    // In-memory PreToolUse hook configuration
    const hooks = {
      PreToolUse: [
        {
          matcher: '*',
          hook: async (hookArgs) => {
            this.emit('tool_pre_check', hookArgs);
            if (this.memorySteeringDirective) {
              const directive = this.memorySteeringDirective;
              this.memorySteeringDirective = null; // Clear atomically
              return {
                additionalContext: `[STEERING_OVERRIDE]: Requirements revised. Abort obsolete path and proceed with: ${directive}`
              };
            }
            // Phase 2: PreToolUse Control Plane Interception
            const preAction = this.pipeline.handlePreToolUse({
              toolName: hookArgs.tool || hookArgs.toolName,
              args: hookArgs.args || hookArgs.parameters
            });
            if (preAction && preAction.action === 'USE_CAPSULE') {
              return {
                additionalContext: `[CAPSULE_FAST_LOAD]: ${preAction.capsule.capsuleText}`
              };
            }
            return {};
          }
        }
      ],
      PostToolUse: [
        {
          matcher: '*',
          hook: async (hookArgs) => {
            this.emit('tool_post_check', hookArgs);
            // Phase 3: PostToolUse Output Slimming & Step-based Scrubbing
            this.pipeline.handlePostToolUse({
              toolName: hookArgs.tool || hookArgs.toolName,
              rawOutput: hookArgs.output || hookArgs.result || ''
            });
            return {};
          }
        }
      ]
    };

    const queryOptions = {
      cwd: this.partnerDir,
      abortController: this.abortController,
      appendSystemPrompt: combinedSystemPrompt,
      hooks,
      maxTurns: this.manifest.max_turns || 25,
      ...(this.manifest.disallowed_tools?.length ? { disallowedTools: this.manifest.disallowed_tools } : {}),
      ...(options.inProcessMcpServers ? { mcpServers: options.inProcessMcpServers } : {}),
      ...(options.resumeSessionId ? { resume: options.resumeSessionId } : {})
    };

    try {
      const stream = query({
        prompt: effectivePrompt,
        options: queryOptions
      });

      for await (const message of stream) {
        this._handleSdkMessage(message);
      }

      this.isRunning = false;
      this.emit('done');
    } catch (err) {
      this.isRunning = false;
      if (err.name === 'AbortError') {
        this.emit('interrupted', { reason: err.message });
      } else {
        this.emit('error', err);
      }
    }
  }

  _handleSdkMessage(message) {
    // Dispatch normalized events to host listeners
    this.emit('sdk_message', message);

    if (message.type === 'system' && message.session_id) {
      this.activeSessionId = message.session_id;
      this.emit('init', { sessionId: this.activeSessionId, model: message.model });
    } else if (message.type === 'stream_event') {
      this.emit('text_delta', message);
    } else if (message.type === 'tool_use') {
      this.emit('tool_use', message);
    } else if (message.type === 'tool_result') {
      this.emit('tool_result', message);
    } else if (message.type === 'result') {
      this.emit('result', message);
    }
  }
}
