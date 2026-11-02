/**
 * Purpose: SdkPipelineAdapter - Orchestrates the 8 decoupled helpers across Claude Agent SDK lifecycle phases.
 * Context: Integrates with @anthropic-ai/claude-agent-sdk lifecycle (PreToolUse, PostToolUse, UserPromptSubmit).
 * Constraints: Node.js 18+ native ESM, 0 cross-helper coupling, single file <= 400 lines.
 */

import fs from 'node:fs';
import { IntentPreflightHelper } from './helpers/intent-preflight/IntentPreflightHelper.mjs';
import { PromptCacheLockHelper } from './helpers/prompt-cache-lock/PromptCacheLockHelper.mjs';
import { ProgressiveDisclosureHelper } from './helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs';
import { StepScrubberHelper } from './helpers/step-scrubber/StepScrubberHelper.mjs';
import { PromptDistillationHelper } from './helpers/prompt-distillation/PromptDistillationHelper.mjs';
import { ToolSlimmingHelper } from './helpers/tool-slimming/ToolSlimmingHelper.mjs';
import { McpMetaToolingHelper } from './helpers/mcp-meta-tooling/McpMetaToolingHelper.mjs';
import { SkillCapsuleHelper } from './helpers/skill-capsule/SkillCapsuleHelper.mjs';

export class SdkPipelineAdapter {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || null;
    this.stepThreshold = options.stepThreshold || 6;

    // Instantiate all 8 decoupled atomic helpers
    this.intentPreflight = new IntentPreflightHelper(options.intentOptions);
    this.promptCacheLock = new PromptCacheLockHelper(options.cacheLockOptions);
    this.progressiveDisclosure = new ProgressiveDisclosureHelper(options.disclosureOptions);
    this.stepScrubber = new StepScrubberHelper(options.scrubberOptions);
    this.promptDistiller = new PromptDistillationHelper(options.distillerOptions);
    this.toolSlimmer = new ToolSlimmingHelper(options.toolOptions);
    this.mcpMeta = new McpMetaToolingHelper(options.mcpOptions);
    this.skillCapsule = new SkillCapsuleHelper(options.skillOptions);

    // Session-bound mutable state
    this.state = {
      stepCounter: 0,
      turnCounter: 0,
      staticPrefix: '',
      staticHash: '',
      lastCapabilities: new Set(),
      lastAllowedTools: [],
      history: []
    };
  }

  /**
   * Initialize static prompt prefix baseline.
   * Executed once per session cold start to lock the KV Cache prefix.
   */
  initStaticPrefix(segments = []) {
    const { staticPrefix, staticHash } = this.promptCacheLock.assembleStaticPrefix(segments);
    this.state.staticPrefix = staticPrefix;
    this.state.staticHash = staticHash;
    return { staticPrefix, staticHash };
  }

  /**
   * Phase 1: UserPromptSubmit Hook.
   * Sequence:
   * 1. Prompt Distillation (strip courtesies & separate hot/cold).
   * 2. Pre-flight Intent Analysis (0ms bypass on continuations, resolve required capabilities).
   * 3. Tool Slimming (filter & compile minimal active toolset schema).
   * 4. Prompt Cache Lock (lock static prefix and inject dynamic directives into ephemeral tail).
   */
  handleUserPromptSubmit(rawUserInput, context = {}) {
    this.state.turnCounter++;

    // 1. Distill prompt
    const distilledResult = this.promptDistiller.distill(rawUserInput);
    const effectivePrompt = distilledResult.distilledCombined || rawUserInput;

    // 2. Preflight intent & capability routing
    const preflightContext = {
      lastCapabilities: this.state.lastCapabilities,
      lastAllowedTools: this.state.lastAllowedTools,
      ...context
    };
    const preflightResult = this.intentPreflight.analyze(effectivePrompt, preflightContext);

    // Update active capabilities
    this.state.lastCapabilities = preflightResult.requiredCapabilities;
    this.state.lastAllowedTools = preflightResult.allowedTools;

    // 3. Slim tools schema for active capabilities
    const rawTools = context.rawTools || [];
    const slimmedTools = this.toolSlimmer.getOrCompile(rawTools, this.state.lastCapabilities);

    // 4. Lock prompt prefix & inject dynamic directives to tail
    const dynamicDirectives = {
      timestampIso: context.timestampIso || new Date().toISOString(),
      activeSessionId: context.sessionId || 'active-session',
      turnEphemeralState: {
        turn: this.state.turnCounter,
        step: this.state.stepCounter,
        intentType: preflightResult.intentType,
        isBypass: preflightResult.isBypass,
        capsules: context.capsules || []
      },
      steeringDirectives: context.steeringDirectives || []
    };

    const lockedPromptBundle = this.promptCacheLock.injectTail(
      this.state.staticPrefix,
      dynamicDirectives
    );

    return {
      effectivePrompt,
      distilledResult,
      preflightResult,
      slimmedTools,
      lockedPromptBundle
    };
  }

  /**
   * Phase 2: PreToolUse Hook.
   * Sequence:
   * 1. Check capability boundary against active capability mask.
   * 2. If reading a skill document, distill or hit capsule disk cache.
   * 3. If calling MCP gateway, forward to McpMetaTooling dispatch.
   */
  handlePreToolUse(toolCall) {
    const { toolName, args = {} } = toolCall;

    // Skill file interception
    if ((toolName === 'Read' || toolName === 'read') && (args?.filePath?.endsWith('.md') || args?.content)) {
      const skillName = args.skillName || (args.filePath ? args.filePath.replace(/^.*[\\/]/, '').replace(/\.md$/, '') : 'skill');
      if (args.content) {
        const capsule = this.skillCapsule.distillContent(skillName, args.content);
        return { action: 'USE_CAPSULE', capsule };
      }
      if (args.filePath && fs.existsSync(args.filePath)) {
        const capsule = this.skillCapsule.loadOrDistill(skillName, args.filePath, this.cacheDir);
        return { action: 'USE_CAPSULE', capsule };
      }
    }

    // MCP Meta-tool gateway dispatch
    if (toolName === 'call_tool' || toolName === 'mcp_gateway_call_tool' || toolName === 'mcp__gateway__call_tool') {
      const result = this.mcpMeta.dispatchCall(args.server, args.tool, args.arguments || {});
      return { action: 'DISPATCH_MCP', result };
    }

    return { action: 'PASS_THROUGH' };
  }

  /**
   * Phase 3: PostToolUse Hook.
   * Sequence:
   * 1. If tool output is large, compress via Progressive Disclosure Layer 2 capsule.
   * 2. Advance stepCounter and apply chunk-aligned history scrubbing at step threshold.
   */
  handlePostToolUse(toolExecution) {
    this.state.stepCounter++;
    const { toolName, rawOutput, resourceId = toolName } = toolExecution;

    let processedOutput = rawOutput;
    let disclosureInfo = null;

    // Progressive disclosure compression if output exceeds 1200 characters
    if (typeof rawOutput === 'string' && rawOutput.length > 1200) {
      this.progressiveDisclosure.registerResource(resourceId, rawOutput);
      processedOutput = this.progressiveDisclosure.renderLayer2(resourceId, { maxChars: 180 });
      disclosureInfo = {
        level: 2,
        resourceId,
        renderedText: processedOutput,
        compressedLength: processedOutput.length
      };
    }

    // Record into session history
    this.state.history.push({
      step: this.state.stepCounter,
      turnIndex: this.state.stepCounter,
      toolName,
      rawOutput,
      processedOutput,
      isScrubbed: false
    });

    // Chunk-aligned step scrubber at step boundary (e.g. step=6, 12, 18)
    const scrubbedHistory = this.stepScrubber.scrubSessionHistory(
      this.state.history,
      this.state.stepCounter,
      this.stepThreshold
    );
    this.state.history = scrubbedHistory;

    return {
      step: this.state.stepCounter,
      processedOutput,
      disclosureInfo,
      historyLength: this.state.history.length
    };
  }

  /**
   * Phase 4: MCP Tool Registration Hook.
   * Exposes exactly 2 collapsed meta tools to the Claude SDK.
   */
  getMcpMetaTools() {
    return this.mcpMeta.getMetaToolDefinitions();
  }
}
