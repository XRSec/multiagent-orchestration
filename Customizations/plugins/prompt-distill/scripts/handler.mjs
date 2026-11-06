#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { SessionStorage } from './storage.mjs';
import { LightweightLLM } from './llm.mjs';
import { extractAssistantTextByTurn } from './transcript.mjs';
import { checkBypass } from './bypass.mjs';
import { verifyDistillation } from './guardrail.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pluginRoot = path.resolve(__dirname, '..');

// ─────────────────────────── 配置与模板加载 ───────────────────────────

function loadConfig() {
  const configPath = path.join(pluginRoot, 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch {}
  return {
    model: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    fallbackModel: 'gemini-3.8-flash',
    baseUrl: process.env.ANTHROPIC_BASE_URL || process.env.CPA_BASE_URL || '',
    timeoutMs: 30000,
    storageDir: '~/.claude/state/prompt-distill',
    enable0msBypass: true,
    enableGuardrails: true,
    slidingWindowDepth: 2,
    decayLambda: 0.35,
    maxStorageMb: 100
  };
}

function loadPromptFile(filename, fallback = '') {
  const filePath = path.join(pluginRoot, 'prompts', filename);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch {}
  return fallback;
}

// ─────────────────────────── 输入解析与协议输出 ───────────────────────────

function readHookStdin() {
  try {
    if (process.stdin.isTTY) return null;
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * 原生规范兼容输出：通过 additionalContext 在尾部追加高信噪比结构化背景
 * 严禁在放行状态下输出 suppressOriginalPrompt: true
 */
function outputEnhancement(additionalContextText, systemMessage = '') {
  const response = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: additionalContextText
    }
  };
  if (systemMessage) {
    response.systemMessage = systemMessage;
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}

/**
 * 快速放行 / Fail-Open 降级
 */
function passThrough(reason = '') {
  const response = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit'
    }
  };
  if (reason) {
    response.systemMessage = `[Prompt Distill 旁路放行] ${reason}`;
  }
  process.stdout.write(JSON.stringify(response) + '\n');
}

// ─────────────────────────── 机会主义垃圾回收 ───────────────────────────

function triggerAsyncGC(storageDir) {
  try {
    const gcScript = path.join(__dirname, 'gc.mjs');
    if (fs.existsSync(gcScript)) {
      const child = spawn(process.execPath, [gcScript, '--run', storageDir], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
  } catch {}
}

// ─────────────────────────── 主调度中枢 ───────────────────────────

async function main() {
  const hookInput = readHookStdin();
  if (!hookInput) {
    process.exit(0);
  }

  const hookEventName = hookInput.hook_event_name || hookInput.hookEventName || 'UserPromptSubmit';
  const sessionId = hookInput.session_id || 'default_session';
  const agentId = hookInput.agent_id || null;
  const config = loadConfig();
  const storage = new SessionStorage(config);

  // ═══════════════════ 生命周期事件 1: PreCompact ═══════════════════
  if (hookEventName === 'PreCompact') {
    try {
      storage.exportSnapshot(sessionId);
    } catch {}
    process.exit(0);
  }

  // ═══════════════════ 生命周期事件 2: SessionStart ═══════════════════
  if (hookEventName === 'SessionStart') {
    const source = hookInput.source || hookInput.session_source || '';
    if (source === 'compact' || hookInput.matcher === 'compact') {
      try {
        // 捕获宿主新生成的基石摘要（若存在）
        const hostSummary = hookInput.summary || '';
        storage.resetOnCompact(sessionId, hostSummary);
      } catch {}
    }
    // 派生非阻塞异步 GC
    triggerAsyncGC(config.storageDir);
    process.exit(0);
  }

  // ═══════════════════ 生命周期事件 3: SessionEnd ═══════════════════
  if (hookEventName === 'SessionEnd') {
    triggerAsyncGC(config.storageDir);
    process.exit(0);
  }

  // ═══════════════════ 生命周期事件 4: UserPromptSubmit ═══════════════════
  const rawPrompt = (hookInput.prompt || '').trim();
  const transcriptPath = hookInput.transcript_path || '';

  if (!rawPrompt) {
    passThrough('空指令');
    return;
  }

  // 1. 0ms 纯规则本地旁路引擎检查
  if (config.enable0msBypass !== false) {
    const bypassCheck = checkBypass(rawPrompt);
    if (bypassCheck.shouldBypass) {
      passThrough(`命中规则旁路 (${bypassCheck.reason})，直接执行`);
      return;
    }
  }

  const llm = new LightweightLLM(config);
  const systemInjection = loadPromptFile('system.md', '你是一个高效的指令结构化与意图提炼引擎。');
  const round1Tpl = loadPromptFile('round1.md', '{{USER_RAW}}');
  const distillTpl = loadPromptFile('distill.md', '{{ASSISTANT_RAW}}');
  const nextTurnTpl = loadPromptFile('next_turn.md', '{{USER_RAW}}');

  try {
    const currentState = storage.readState(sessionId, agentId);
    const lastRound = currentState?.currentRound || 0;
    const currentRound = lastRound + 1;

    // ───────────────── 分支 A：第一轮（会话初始意图提炼与 G0 固化） ─────────────────
    if (currentRound === 1) {
      const userPromptInput = round1Tpl.replace('{{USER_RAW}}', rawPrompt);
      const distilledResult = await llm.complete(userPromptInput, systemInjection);

      // 保真门禁校验
      if (config.enableGuardrails !== false) {
        const guardrailCheck = verifyDistillation(rawPrompt, distilledResult);
        if (!guardrailCheck.valid) {
          passThrough(`保真门禁未通过 (${guardrailCheck.reason})，回退原样放行`);
          return;
        }
      }

      // 持久化存储状态并固化 G0
      storage.recordRound({
        sessionId,
        agentId,
        round: 1,
        rawPrompt,
        distilledPrompt: distilledResult,
        techFacts: [
          `[全局长期目标 G0] ${distilledResult.slice(0, 300)}`
        ]
      });

      // 组装结构化高信噪比背景块，通过 additionalContext 挂载在当前 Turn 尾部
      const additionalContextText = [
        '<structured_distill_context>',
        '[Prompt Distill 前置意图提炼与工程约束 (第 1 轮)]',
        distilledResult,
        '</structured_distill_context>'
      ].join('\n');

      outputEnhancement(additionalContextText, `✨ [Prompt Distill] 全局根目标与首轮任务结构化完成 (模型: ${llm.resolvedModel})`);
      return;
    }

    // ───────────────── 分支 B：第 N 轮（N >= 2）双层记忆与滑动窗口沉淀 ─────────────────
    const prevRoundIndex = lastRound;
    const prevAssistantRaw = extractAssistantTextByTurn(transcriptPath, sessionId, prevRoundIndex);

    let assistantDistilled = '';
    let extractedFacts = [];

    if (prevAssistantRaw && prevAssistantRaw.trim()) {
      const distillPrompt = distillTpl.replace('{{ASSISTANT_RAW}}', prevAssistantRaw.slice(0, 12000));
      assistantDistilled = await llm.complete(distillPrompt, systemInjection);
      extractedFacts.push(`[第 ${prevRoundIndex} 轮产出] ${assistantDistilled.slice(0, 250)}`);
    } else {
      assistantDistilled = '（上一轮主智能体未输出额外非工具正文，状态平稳推进）';
    }

    // 获取双层记忆（G0 + K=2 滑动窗口 + 指数衰减活跃事实）
    const activeCtx = storage.getActiveContext(sessionId, agentId, currentRound);

    const rootObjectiveText = activeCtx.rootObjective || '持续遵循既定架构规范与交付目标';
    const recentDistillationsText = activeCtx.recentDistillations.length > 0
      ? activeCtx.recentDistillations.map(d => `[第 ${d.round} 轮沉淀]: ${d.content}`).join('\n')
      : assistantDistilled;
    const activeFactsText = activeCtx.activeFacts.length > 0
      ? activeCtx.activeFacts.join('\n')
      : '无特殊红线约束';

    const nextTurnInput = nextTurnTpl
      .replace('{{CURRENT_ROUND}}', String(currentRound))
      .replace('{{ROOT_OBJECTIVE}}', rootObjectiveText)
      .replace('{{RECENT_DISTILLATIONS}}', recentDistillationsText)
      .replace('{{ACTIVE_FACTS}}', activeFactsText)
      .replace('{{USER_RAW}}', rawPrompt);

    const distilledResult = await llm.complete(nextTurnInput, systemInjection);

    // 保真门禁校验
    if (config.enableGuardrails !== false) {
      const guardrailCheck = verifyDistillation(rawPrompt, distilledResult);
      if (!guardrailCheck.valid) {
        passThrough(`保真门禁未通过 (${guardrailCheck.reason})，回退原样放行`);
        return;
      }
    }

    // 持久化当前轮次状态与衰减事实
    storage.recordRound({
      sessionId,
      agentId,
      round: currentRound,
      rawPrompt,
      distilledPrompt: distilledResult,
      hostSummary: assistantDistilled,
      techFacts: extractedFacts
    });

    const additionalContextText = [
      '<structured_distill_context>',
      `[Prompt Distill 多轮消歧与上下文增强 (第 ${currentRound} 轮)]`,
      distilledResult,
      '</structured_distill_context>'
    ].join('\n');

    outputEnhancement(
      additionalContextText,
      `✨ [Prompt Distill] 第 ${currentRound} 轮滑动窗口沉淀与消歧完成 (模型: ${llm.resolvedModel})`
    );

  } catch (err) {
    // Fail-Open 优雅降级
    passThrough(`调用异常 (${err?.message || '未知错误'})，安全放行`);
  }
}

main().catch((err) => {
  try {
    passThrough(`中枢未捕获异常 (${err?.message || ''})`);
  } catch {
    process.exit(0);
  }
});
