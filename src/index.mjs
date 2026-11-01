#!/usr/bin/env node

import readline from 'node:readline';
import crypto from 'node:crypto';
import { executeClaudeSubprocess } from './core/claude-subprocess.mjs';
import { parseMapEnvelope } from './core/map-parser.mjs';
import { defaultRegistry } from './session/agent-registry.mjs';
import { defaultSessionManager } from './session/session-manager.mjs';
import { RelayPipeline } from './collaboration/relay.mjs';
import { DispatchEngine } from './collaboration/dispatch.mjs';
import { defaultP2PRouter } from './collaboration/p2p.mjs';

function printHeader() {
  console.log('====================================================');
  console.log(' Cindy Multi-Agent Orchestration Engine (Claude CLI)');
  console.log('====================================================');
}

/**
 * Executes a single conversational turn with Orchestrator, dynamically
 * dispatching MAP protocol actions when emitted.
 */
async function runOrchestratorTurn(userInput, groupId = 'main') {
  const orchestrator = defaultRegistry.getOrchestrator();
  if (!orchestrator) {
    throw new Error('Orchestrator agent not registered.');
  }

  const groupChannel = `grp_${groupId}`;
  const sessionUuid = defaultSessionManager.getOrCreateSessionUuid(groupChannel);

  // Append user message to public group timeline
  defaultSessionManager.appendTimelineEvent({
    channel: groupChannel,
    sender: 'user',
    target: 'orchestrator',
    action: 'MESSAGE',
    content: userInput,
  });

  const timelineContext = defaultSessionManager.formatTimelineForPrompt(groupChannel, 5);

  const prompt = `### INCOMING GROUP TIMELINE CONTEXT
${timelineContext}

### USER INPUT
${userInput}

### INSTRUCTIONS:
Assess user intent and decide on the best topology:
1. Direct response / MENTION_ASSIGN to a specialist.
2. RELAY pipeline across stages.
3. DISPATCH concurrent subtasks.
Append your Machine Action Protocol (MAP) packet if delegating:
<!-- CINDY_MAP:BEGIN -->
{
  "version": "1.0.0",
  "action": "RELAY | DISPATCH | P2P_QUERY | MENTION_ASSIGN | COMPLETE",
  "sender": "orchestrator",
  "target": "<agent_id> | ALL",
  "task_id": "${crypto.randomUUID()}",
  "payload": {
    "summary": "<summary>",
    "subtasks": []
  }
}
<!-- CINDY_MAP:END -->`;

  console.log('\n[Orchestrator] Cindy is thinking...');
  const response = await executeClaudeSubprocess({
    prompt,
    sessionUuid,
    systemPromptPath: orchestrator.systemPromptPath,
    model: orchestrator.defaultModel,
  });

  if (!response.success) {
    console.error('[Error] Subprocess turn failed:', response.error?.message || response.rawStderr);
    return;
  }

  const { packet, cleanText } = parseMapEnvelope(response.resultText, {
    sender: 'orchestrator',
    target: 'user',
  });

  if (cleanText) {
    console.log(`\n[Orchestrator]:\n${cleanText}\n`);
  }

  // Handle downstream MAP actions
  if (packet.action === 'DISPATCH' && Array.isArray(packet.payload.subtasks)) {
    console.log(`\n[Action: DISPATCH] Executing ${packet.payload.subtasks.length} concurrent subtasks...`);
    const engine = new DispatchEngine({ taskId: packet.task_id });
    const fanIn = await engine.dispatchSubtasks(packet.payload.subtasks);
    console.log(`[Dispatch] Subtasks settled. Aggregating executive report...`);
    const synthesized = await engine.synthesizeReport(fanIn, userInput);
    console.log(`\n[Executive Report]:\n${synthesized.executiveReport}\n`);
  } else if (packet.action === 'RELAY') {
    console.log(`\n[Action: RELAY] Handing off to pipeline starting at: ${packet.target}...`);
    const pipeline = new RelayPipeline({ taskId: packet.task_id });
    const result = await pipeline.execute(packet.payload.next_instructions || packet.payload.summary);
    if (result.success) {
      console.log(`\n[Relay Completed by ${result.completedBy}]:\n${result.finalSummary}\n`);
    } else {
      console.error(`\n[Relay Failed]: ${result.error}\n`);
    }
  } else if (packet.action === 'MENTION_ASSIGN') {
    const target = packet.target;
    console.log(`\n[Action: MENTION_ASSIGN] Forwarding to specialist @${target}...`);
    const agent = defaultRegistry.getAgent(target);
    if (agent) {
      const targetUuid = defaultSessionManager.getOrCreateSessionUuid(`dm_user_${target}`);
      const specRes = await executeClaudeSubprocess({
        prompt: packet.payload.next_instructions || packet.payload.summary || userInput,
        sessionUuid: targetUuid,
        systemPromptPath: agent.systemPromptPath,
        model: agent.defaultModel,
      });
      const parsedSpec = parseMapEnvelope(specRes.resultText, { sender: target, target: 'user' });
      console.log(`\n[@${target}]:\n${parsedSpec.cleanText || parsedSpec.packet.payload.summary}\n`);
    }
  }
}

async function startInteractiveChat() {
  printHeader();
  console.log('Interactive Multi-Agent Session. Type "exit" or "quit" to leave.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question('User > ', async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        promptUser();
        return;
      }
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        rl.close();
        process.exit(0);
      }
      try {
        await runOrchestratorTurn(trimmed);
      } catch (err) {
        console.error('Error during execution:', err);
      }
      promptUser();
    });
  };

  promptUser();
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'agents': {
      console.log('Registered Agents:');
      for (const agent of defaultRegistry.getAllAgents()) {
        console.log(` - [${agent.role.toUpperCase()}] ${agent.id} (${agent.name}): ${agent.description}`);
      }
      break;
    }
    case 'relay': {
      const prompt = args.join(' ') || 'Implement a minimal LRU Cache in Node.js with tests.';
      console.log(`Starting Relay Pipeline with prompt: "${prompt}"...`);
      const pipeline = new RelayPipeline();
      const res = await pipeline.execute(prompt);
      console.log('Relay Result:', JSON.stringify(res, null, 2));
      break;
    }
    case 'dispatch': {
      const prompt = args.join(' ') || 'Audit protocol and prepare Node.js test harness.';
      console.log(`Starting Dispatch Engine for task: "${prompt}"...`);
      const engine = new DispatchEngine();
      const fanIn = await engine.dispatchSubtasks([
        {
          target: 'researcher',
          instruction: 'Analyze current protocol invariants in AGENTS.md.',
          timeout_sec: 60,
        },
        {
          target: 'coder',
          instruction: 'Draft test assertions for MAP packet validator.',
          timeout_sec: 60,
        },
      ]);
      console.log('Synthesizing report...');
      const report = await engine.synthesizeReport(fanIn, prompt);
      console.log('\n--- Final Synthesis Report ---\n', report.executiveReport);
      break;
    }
    case 'p2p': {
      const [src, target, ...q] = args;
      if (!src || !target || q.length === 0) {
        console.log('Usage: node src/index.mjs p2p <srcAgent> <targetAgent> <query>');
        process.exit(1);
      }
      console.log(`Executing P2P query from ${src} to ${target}...`);
      const p2pRes = await defaultP2PRouter.query({
        srcAgent: src,
        targetAgent: target,
        query: q.join(' '),
      });
      console.log('P2P Result:', JSON.stringify(p2pRes, null, 2));
      break;
    }
    case 'chat':
    default: {
      if (args.length > 0) {
        await runOrchestratorTurn(args.join(' '));
      } else {
        await startInteractiveChat();
      }
      break;
    }
  }
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
