#!/usr/bin/env node
// Purpose: Extract, clean (cheap LLM), and analyze (reasoning LLM) Antigravity (agy) sessions by date.
// Context: Supports pluggable models & runtimes (OpenAI-compatible, Anthropic, CLI, or extract-only).
// Usage: node tools/agy-session-analyzer/analyze-sessions.mjs --date 2026-11-15 --stage full
// Prerequisites: Node.js >= 20; .env or LLM_* / CPA_* env vars (or --runtime cli / --stage extract).

import fs from "node:fs";
import path from "node:path";
import {
  defaultBrainDir,
  formatDigestMarkdown,
  formatSingleSession,
  loadSessionsInRange,
  parseDateRange,
} from "./lib/session-reader.mjs";
import { loadDotEnv, resolveRuntimeConfig, runAnalysis } from "./lib/runtime-adapter.mjs";

const USAGE = `AGY Session Analyzer - Extract -> Clean (cheap LLM) -> Analyze (reasoning LLM)

Usage:
  node tools/agy-session-analyzer/analyze-sessions.mjs [options]

Date Range Options (default: --days 1):
  --date <YYYY-MM-DD>        Analyze sessions on a specific local date
  --from <YYYY-MM-DD>        Start date (inclusive)
  --to <YYYY-MM-DD>          End date (inclusive)
  --days <N>                 Analyze last N days (default: 1)

Pipeline Stage:
  --stage <extract|clean|full>
                             extract: output raw compacted digest only (no LLM)
                             clean:   run cheap LLM cleaning only
                             full:    cheap LLM clean -> reasoning LLM analyze (default)

Runtime & Model Options (shared fallback + per-stage overrides):
  --runtime <type>           openai | anthropic | cli | dry-run
  --model <name>             Default model (env: LLM_MODEL, default: gemini-2.5-flash)
  --base-url <url>           API base URL (env: LLM_BASE_URL / OPENAI_BASE_URL / CPA_BASE_URL)
  --api-key <key>            API key (env: LLM_API_KEY / OPENAI_API_KEY / CPA_API_KEY)
  --cmd <command>            CLI command for --runtime cli (stdin or {prompt_file})
  --clean-runtime <type>     Override runtime for Stage 1 (clean)
  --clean-model <name>       Override model for Stage 1 (default: --model)
  --clean-base-url <url>     Override base-url for Stage 1
  --clean-api-key <key>      Override api-key for Stage 1
  --clean-cmd <command>      Override CLI cmd for Stage 1
  --analyze-runtime <type>   Override runtime for Stage 2 (analyze)
  --analyze-model <name>     Override model for Stage 2 (default: --model)
  --analyze-base-url <url>   Override base-url for Stage 2
  --analyze-api-key <key>    Override api-key for Stage 2
  --analyze-cmd <command>    Override CLI cmd for Stage 2

I/O Options:
  --brain-dir <path>         Override ~/.gemini/antigravity/brain (env: AGY_BRAIN_DIR)
  --max-sessions <N>         Max sessions to include (default: 50)
  --max-chars <N>            Max digest chars (default: 36000)
  --out <path>               Write final markdown report to file
  --lang <zh|en>             Output language (default: zh)
  --json                     Print structured JSON output
  -h, --help                 Show this help`;

const FLAG_MAP = {
  "--date": "date", "--from": "from", "--to": "to",
  "--runtime": "runtime", "--model": "model", "--base-url": "baseUrl", "--api-key": "apiKey", "--cmd": "cmd",
  "--clean-runtime": "cleanRuntime", "--clean-model": "cleanModel", "--clean-base-url": "cleanBaseUrl",
  "--clean-api-key": "cleanApiKey", "--clean-cmd": "cleanCmd",
  "--analyze-runtime": "analyzeRuntime", "--analyze-model": "analyzeModel", "--analyze-base-url": "analyzeBaseUrl",
  "--analyze-api-key": "analyzeApiKey", "--analyze-cmd": "analyzeCmd",
  "--brain-dir": "brainDir", "--out": "out", "--lang": "lang", "--stage": "stage",
};

function parseArgs(argv) {
  const opts = { days: 1, maxSessions: 50, maxChars: 36000, lang: "zh", stage: "full" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") { opts.help = true; continue; }
    if (a === "--dry-run") { opts.stage = "extract"; continue; }
    if (a === "--json") { opts.json = true; continue; }
    if (a === "--days" || a === "--max-sessions" || a === "--max-chars") {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      const key = a === "--days" ? "days" : a === "--max-sessions" ? "maxSessions" : "maxChars";
      opts[key] = Number(argv[++i]);
      continue;
    }
    if (FLAG_MAP[a]) {
      if (i + 1 >= argv.length) throw new Error(`Missing value for ${a}`);
      opts[FLAG_MAP[a]] = argv[++i];
      continue;
    }
    throw new Error(`Unknown option: ${a}`);
  }
  return opts;
}

function buildCleanPrompt(lang) {
  const outLang = lang === "en" ? "en-US" : "zh-CN";
  return `# Role
You are an elite Agent Workflow & Telemetry Distiller. Your sole objective is to parse raw AGY (Antigravity) session logs—including inline \`<subagent_trace>\` / \`swarm\` telemetry—and extract structured data about **how the user collaborates with the Main Agent**, **how the Main Agent orchestrates Subagents**, and **where execution or routing friction occurred**.

# Core Philosophy (CRITICAL)
1. **Separate "Task Subject" from "Operational Workflow"**:
   - The code or architecture discussed in a session is a one-off task. DO NOT treat business logic or architectural designs as reusable workflows.
   - Observe the *meta-workflow*: How did the user prompt the Agent? Did the user have to nudge the Agent across multiple turns to finish one logical loop? How effectively did the Main Agent delegate to Subagents?
2. **Zero Judgment on User Habits**:
   - Never critique the user's git practices, delegation style, or lack of local pre-checks. The user intentionally delegates heavy lifting to Agents and Subagents.
3. **Redefine "Issues" as Agent & Subagent Friction Only**:
   - Ignore normal business code bugs that the user intentionally asked the Agent to fix.
   - Strictly record **3 types of friction**:
     (a) **Subagent Orchestration Friction**: Main Agent guessing non-existent/unauthorized subagent names (e.g., \`subagent "mogit" not found\`), passing incomplete context to a subagent requiring multiple \`send_message\` round-trips, or over-spawning swarm workers for trivial tasks.
     (b) **Subagent Internal Execution Friction**: Redundant exploration, repeated command failures (\`status=ERR\`), or environment traps inside \`<subagent_trace>\`.
     (c) **Main Agent Routing/Hook Friction**: Broken global hooks/shims in \`<thought_trace>\`, running 4+ redundant \`ls\`/\`rg\` commands to locate standard directories, or violating explicit constraints (e.g., reading files when told not to).
4. **Strict Selectivity on \`reusable_pattern\`**:
   - Set \`reusable_pattern.exists = true\` ONLY if:
     (a) The user executed a predictable multi-turn operational sequence (e.g., Turn 1: bump & push -> Turn 2: check & fix CI via subagent) that can be compressed into a 1-turn autonomous Skill or Subagent pipeline; OR
     (b) The Main Agent or Subagent suffered avoidable routing/delegation friction (e.g., wrong subagent names, missing directory maps) that can be permanently eliminated by pinning a rule in \`AGENTS.md\` or a \`SKILL.md\`.
   - For one-off Q&A, single-time refactoring discussions, or ad-hoc architectural brainstorming without agent friction, you MUST set \`reusable_pattern.exists = false\`.

# Field Extraction Guidelines
- \`summary\`: High-level synthesis (in \`${outLang}\`) of the user's operational patterns, Main-to-Subagent orchestration efficiency, and primary routing bottlenecks across the batch.
- \`core_intent\`: State both the task goal AND the orchestration mode (e.g., "[架构对齐/纯问答] ...", "[多轮Subagent委派/发版闭环] ...", "[Swarm并发编排] ...").
- \`key_steps\`: Describe the **User -> Main Agent -> Subagent interaction chain** (e.g., "1. User prompted X -> Main Agent failed calling subagents \`mogit\`/\`mocode\`, then spawned valid subagent \`018601f7\`; 2. Subagent executed Y..."), NOT a summary of business text.
- \`issues\`: Strictly list Main Agent routing detours, Subagent invocation/handoff errors, internal \`<subagent_trace>\` tool anomalies, or broken hooks. If clean, write \`"无主从 Agent 路由或执行摩擦"\`.
- \`reusable_pattern\`:
  - \`exists\`: Boolean (\`true\` only for genuine Skill compression, Subagent routing table pinning, or Rule optimization candidates).
  - \`description\`: If \`true\`, specify the exact **Skill / Subagent / Rule optimization direction**. If \`false\`, leave as \`""\`.

# Output Format
Respond ONLY with a valid, raw JSON object (no markdown fences, no preamble) matching this exact schema in \`${outLang}\`:

{
  "summary": "string",
  "sessions": [
    {
      "session_id": "string",
      "core_intent": "string",
      "key_steps": [
        "string"
      ],
      "issues": "string",
      "reusable_pattern": {
        "exists": boolean,
        "description": "string"
      }
    }
  ]
}`;
}

function buildAnalyzePrompt(lang) {
  const outLang = lang === "en" ? "en-US" : "zh-CN";
  return `# Role
You are a Staff Agent Harness & Multi-Agent Workflow Optimization Architect. You receive distilled telemetry from AGY (Antigravity) coding sessions, including both Main Agent actions and Subagent/Swarm traces. Your mission is to upgrade the user's **future Agent collaboration velocity** by compressing multi-turn workflows into autonomous Skills, optimizing Main-to-Subagent delegation, and eliminating exploration detours.

# Strict Anti-Patterns (DO NOT VIOLATE)
1. **NO Post-Mortem Preaching or Critique**:
   - The user operates on an **Agent-First Delegation Model** (e.g., pushing directly and letting subagents monitor/fix remote CI, or using minimal 1-line prompts).
   - NEVER lecture the user to "run local tests before pushing", "write better documentation", or "follow manual git workflows". Adapt the Agent/Subagent harness to automate the user's habits—never ask the user to do manual pre-checks for the Agent.
2. **NO Rehashing Solved Session Tasks**:
   - Whatever code, bug, or architecture the user or subagent worked on *inside* a session (e.g., building \`agy-session-analyzer\`, adding locks to \`agy\`, migrating \`~/.sidecar\`, fixing a specific TS error) is **ALREADY DONE**.
   - NEVER output action items telling the user to "finish building the tool from Session X" or "fix the bug discussed in Session Y".
3. **Environment Grounding**:
   - The user develops on **macOS** using **Node.js / TypeScript** CLI wrappers, MCP servers, and multi-agent orchestrators. Do not hallucinate Linux-only bash commands (like \`flock\` file descriptors) when analyzing Node.js scripts.
4. **Filter Out Low-Signal Sessions**:
   - If a session has \`reusable_pattern.exists: false\` and no meaningful Main/Subagent friction, ignore it in your recommendations.

# Optimization Framework (Your 4 Core Levers)
Analyze the sessions exclusively through these four lenses:
1. **Turn Compression (Multi-Turn -> 1-Turn Autonomous Skill / Subagent Loop)**:
   - Identify sessions where the user had to issue 2–3 sequential prompts (or manually trigger a second subagent pass) for a single logical goal (e.g., Prompt 1: "bump & push" -> Prompt 2: "fix CI build").
   - Design a single self-healing \`SKILL.md\` or Subagent task template so the entire loop completes in 1 user turn.
2. **Subagent & Swarm Orchestration Optimization**:
   - Identify where the Main Agent guessed wrong subagent names (e.g., calling \`mogit\`/\`mocode\` and hitting \`status=ERR\`), lost context during handoff (\`invoke_subagent\` -> \`send_message\`), or where a Subagent lacked required rules/skills in its isolated context.
   - Provide explicit Subagent routing declarations and handoff templates to pin in \`AGENTS.md\`.
3. **Exploration Shortcut (Zero-Shot Context Pinning)**:
   - Identify where the Main Agent or Subagent wasted early turns running exploratory \`ls\`/\`rg\`/\`find\` commands to figure out directory layouts.
   - Provide copy-pasteable topology rules for \`AGENTS.md\`.
4. **Harness & Hook Hygiene**:
   - Identify systemic environment friction exposed in \`<thought_trace>\` or \`<subagent_trace>\` (e.g., stale global \`PreToolUse\` hooks pointing to moved directories, CLI flags outputting to \`stderr\` causing grep failures) and provide a 1-step cleanup command.

# Output Structure (Strictly in \`${outLang}\`)
Generate a sharp, high-density Markdown report following this exact structure:

## 一、多轮压缩：单轮自治 Skill 与 Subagent 闭环沉淀（Turn Compression）
*(Only include recurring operational flows where multiple user turns or fragmented subagent calls can be merged into 1 autonomous loop. If none exist, state "本批次无高频多轮操作流需沉淀" and skip the table.)*
- Provide a compact Markdown table: \`Skill / 委派模板名称\` | \`原多轮交互与主从链路\` | \`压缩后的单轮自治闭环（Main -> Subagent 自动步骤）\`
- Beneath the table, provide a ready-to-use \`SKILL.md\` snippet (in high-density \`en-US\` per Agent-First protocol) for the top candidate.

## 二、主从协同与防绕路锚定：AGENTS.md / 路由表补丁（Subagent & Exploration Shortcuts）
*(Target invalid subagent calls like \`mogit\`/\`mocode\`, subagent context misses, wasted \`ls\`/\`rg\` exploration, or recurring mode constraints.)*
- Point out the specific Main Agent or Subagent detour observed (cite \`session_id\`).
- Provide the **exact text block** (in \`en-US\`) to append to \`AGENTS.md\` or the relevant \`SKILL.md\` (e.g., \`## Valid Subagent Registry & Handoff Protocol\`, directory topology map).

## 三、宿主与工具链摩擦清理（Harness Hygiene）
*(Target broken hooks, shim errors, or CLI wrapper quirks exposed in Main or Subagent execution.)*
- Concisely list any underlying harness/hook issues discovered and the exact shell/config command to clean them up.

## 四、按 ROI 排序的配置升级清单（仅限配置、路由与工作流层）
*(List 1–3 concrete changes to Skills, Subagent Routing Rules, or Hooks that immediately save turns or tokens in future sessions. Never include business coding tasks here.)*`;
}

function stageConfig(opts, prefix) {
  return resolveRuntimeConfig({
    runtime: opts[`${prefix}Runtime`] || opts.runtime,
    model: opts[`${prefix}Model`] || opts.model,
    baseUrl: opts[`${prefix}BaseUrl`] || opts.baseUrl,
    apiKey: opts[`${prefix}ApiKey`] || opts.apiKey,
    cmd: opts[`${prefix}Cmd`] || opts.cmd,
  });
}

async function cleanInBatches(sessions, cfg, prompt, maxChars) {
  const batches = [];
  let current = "";
  for (const s of sessions) {
    const block = formatSingleSession(s, 3500);
    if (current && current.length + block.length + 2 > maxChars) {
      batches.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) batches.push(current);
  const cleaned = [];
  for (const batch of batches) {
    cleaned.push(await runAnalysis(cfg, prompt, batch));
  }
  return cleaned.join("\n\n---\n\n");
}

async function main() {
  loadDotEnv();
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (err) {
    console.error(`Input error: ${err.message}`);
    process.exit(2);
  }
  if (opts.help) { console.log(USAGE); process.exit(0); }
  const range = parseDateRange(opts);
  const brainDir = opts.brainDir || defaultBrainDir();
  const sessions = loadSessionsInRange(brainDir, range, { maxSessions: opts.maxSessions });
  if (sessions.length === 0) {
    console.log(`No agy sessions found in range ${range.label} (${brainDir}).`);
    process.exit(0);
  }
  let output;
  if (opts.stage === "extract") {
    output = formatDigestMarkdown(sessions, range, { maxTotalChars: opts.maxChars });
  } else if (opts.stage === "clean") {
    const cleanCfg = stageConfig(opts, "clean");
    output = await cleanInBatches(sessions, cleanCfg, buildCleanPrompt(opts.lang), opts.maxChars);
  } else if (opts.stage === "full") {
    const cleanCfg = stageConfig(opts, "clean");
    const analyzeCfg = stageConfig(opts, "analyze");
    const cleaned = await cleanInBatches(sessions, cleanCfg, buildCleanPrompt(opts.lang), opts.maxChars);
    output = await runAnalysis(analyzeCfg, buildAnalyzePrompt(opts.lang), cleaned);
  } else {
    console.error(`Invalid --stage "${opts.stage}". Use: extract | clean | full`);
    process.exit(2);
  }
  if (opts.out) {
    const outPath = path.resolve(opts.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, "utf8");
  }
  console.log(opts.json ? JSON.stringify({ range: range.label, stage: opts.stage, sessionCount: sessions.length, output }, null, 2) : output);
}

main().catch((err) => {
  const isTimeout = err?.name === "TimeoutError" || /timeout/i.test(err?.message || "");
  console.error(`Error: ${err?.message || err}`);
  process.exit(isTimeout ? 124 : 1);
});
