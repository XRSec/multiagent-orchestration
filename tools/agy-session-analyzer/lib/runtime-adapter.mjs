// Purpose: Pluggable LLM runtime adapter (OpenAI-compatible HTTP, Anthropic HTTP, or arbitrary CLI).
// Context: Decouples session analysis from any fixed model or runtime provider.
// Usage: Imported by analyze-sessions.mjs (loadDotEnv, runAnalysis).
// Prerequisites: Node.js >= 20 (native fetch), optional .env in working directory.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function loadDotEnv(envPath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function resolveRuntimeConfig(opts = {}) {
  const runtime = (opts.runtime || process.env.LLM_RUNTIME || (opts.cmd ? "cli" : "openai")).toLowerCase();
  const model = opts.model || process.env.LLM_MODEL || "gemini-2.5-flash";
  const baseUrl = (
    opts.baseUrl ||
    process.env.LLM_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.CPA_BASE_URL ||
    ""
  ).replace(/\/+$/, "");
  const apiKey =
    opts.apiKey ||
    process.env.LLM_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.CPA_API_KEY ||
    "";
  return {
    runtime,
    model,
    baseUrl,
    apiKey,
    cmd: opts.cmd || process.env.LLM_CLI_CMD || "",
    timeoutMs: opts.timeoutMs || 120000,
  };
}

function buildChatUrl(baseUrl, suffix) {
  if (!baseUrl) throw new Error("Missing baseUrl (pass --base-url or set LLM_BASE_URL / CPA_BASE_URL)");
  return baseUrl.endsWith("/v1") ? `${baseUrl}${suffix}` : `${baseUrl}/v1${suffix}`;
}

async function callOpenAI(cfg, systemPrompt, userPrompt) {
  const url = buildChatUrl(cfg.baseUrl, "/chat/completions");
  const headers = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(cfg.timeoutMs),
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenAI-compatible API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Unexpected API response: ${JSON.stringify(data).slice(0, 300)}`);
  return content;
}

async function callAnthropic(cfg, systemPrompt, userPrompt) {
  const url = buildChatUrl(cfg.baseUrl || "https://api.anthropic.com", "/messages");
  const headers = {
    "Content-Type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (cfg.apiKey) headers["x-api-key"] = cfg.apiKey;
  const res = await fetch(url, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(cfg.timeoutMs),
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.content?.map((b) => b.text || "").join("") || "";
  if (!content) throw new Error(`Unexpected Anthropic response: ${JSON.stringify(data).slice(0, 300)}`);
  return content;
}

function callCliRuntime(cfg, systemPrompt, userPrompt) {
  if (!cfg.cmd) throw new Error("Missing --cmd for cli runtime (e.g. --cmd 'ollama run qwen2.5:7b')");
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;
  let command = cfg.cmd;
  let tmpFile = "";
  let input = fullPrompt;
  if (command.includes("{prompt_file}")) {
    tmpFile = path.join(os.tmpdir(), `agy-analyzer-${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, fullPrompt, "utf8");
    command = command.replaceAll("{prompt_file}", JSON.stringify(tmpFile));
    input = undefined;
  }
  try {
    const res = spawnSync(command, {
      shell: true,
      input,
      encoding: "utf8",
      timeout: cfg.timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (res.error) throw res.error;
    if (res.status !== 0) {
      throw new Error(`CLI runtime exited with ${res.status}: ${(res.stderr || "").slice(0, 300)}`);
    }
    return (res.stdout || "").trim();
  } finally {
    if (tmpFile && fs.existsSync(tmpFile)) fs.rmSync(tmpFile, { force: true });
  }
}

export async function runAnalysis(cfg, systemPrompt, userPrompt) {
  if (cfg.runtime === "dry-run" || cfg.runtime === "stdout") {
    return `${systemPrompt}\n\n---\n\n${userPrompt}`;
  }
  if (cfg.runtime === "openai") return callOpenAI(cfg, systemPrompt, userPrompt);
  if (cfg.runtime === "anthropic") return callAnthropic(cfg, systemPrompt, userPrompt);
  if (cfg.runtime === "cli") return callCliRuntime(cfg, systemPrompt, userPrompt);
  throw new Error(`Unsupported runtime "${cfg.runtime}". Use: openai | anthropic | cli | dry-run`);
}
