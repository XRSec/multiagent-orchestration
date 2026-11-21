#!/usr/bin/env node
// Purpose: Execute browser automation tasks via ego-browser nodejs runner and assemble structured research results.
// Context: Execution bridge between x-research CLI and local ego-browser runtime.
// Usage: import { runEgoResearch, processThreadItems } from './ego-runner.mjs';
// Prerequisites: ego-browser CLI installed and configured with target profile; Node.js 18+.

import { spawn } from 'node:child_process';
import { buildBrowserScript } from './browser-script.mjs';
import { computeEngagementScore, rankPosts, deduplicatePosts } from './metrics.mjs';

const DATA_START_TAG = '__X_RESEARCH_DATA_START__';
const DATA_END_TAG = '__X_RESEARCH_DATA_END__';

function createRunnerError(message, exitCode = 1) {
  const err = new Error(message);
  err.exitCode = exitCode;
  return err;
}

function forwardProgressLogs(chunk, state) {
  for (const line of chunk.split(/\r?\n/)) {
    if (line === DATA_START_TAG) {
      state.inPayload = true;
      continue;
    }
    if (line === DATA_END_TAG) {
      state.inPayload = false;
      continue;
    }
    if (!state.inPayload && line.includes('[x-research]')) {
      process.stderr.write(line + '\n');
    }
  }
}

function parseRunnerPayload(stdout, stderr) {
  // ego-browser nodejs routes console.log to stderr, so inspect both streams.
  const combined = `${stdout}\n${stderr}`;
  const sIdx = combined.indexOf(DATA_START_TAG);
  const eIdx = combined.indexOf(DATA_END_TAG);
  if (sIdx === -1 || eIdx === -1 || eIdx <= sIdx) {
    const detail = (stderr || stdout).trim();
    throw createRunnerError(`Invalid output from ego-browser runner:\n${detail}`);
  }
  const rawJson = combined.slice(sIdx + DATA_START_TAG.length, eIdx).trim();
  try {
    return JSON.parse(rawJson);
  } catch (e) {
    throw createRunnerError(`Failed to parse runner JSON output: ${e.message}`);
  }
}

export async function executeEgoRunner(payload, timeoutMs = 90000) {
  const scriptContent = buildBrowserScript(payload);

  return new Promise((resolve, reject) => {
    const cp = spawn('ego-browser', ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let isSettled = false;
    const logState = { inPayload: false };

    const timer = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      try { cp.kill('SIGTERM'); } catch (_) {}
      reject(createRunnerError(`TIMEOUT: ego-browser task exceeded deadline of ${timeoutMs}ms`, 124));
    }, timeoutMs);

    cp.stdout.on('data', (d) => { stdout += d.toString(); });
    cp.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      forwardProgressLogs(s, logState);
    });

    cp.on('close', (code) => {
      if (isSettled) return;
      clearTimeout(timer);
      isSettled = true;
      if (code !== 0) {
        const msg = (stderr || stdout).trim();
        reject(createRunnerError(`ego-browser exited with code ${code}:\n${msg}`, code === 124 ? 124 : 1));
        return;
      }
      try {
        resolve(parseRunnerPayload(stdout, stderr));
      } catch (err) {
        reject(err);
      }
    });

    cp.on('error', (err) => {
      if (isSettled) return;
      clearTimeout(timer);
      isSettled = true;
      err.exitCode = 1;
      reject(err);
    });

    cp.stdin.write(scriptContent);
    cp.stdin.end();
  });
}

export function processThreadItems(items, targetId, sortMethod = 'score', maxReplies = 40) {
  if (!Array.isArray(items) || items.length === 0) {
    return {
      targetId,
      parentContext: [],
      mainPost: null,
      authorContinuation: [],
      replies: [],
      sort: sortMethod,
      totalRepliesCaptured: 0
    };
  }

  const foundIdx = items.findIndex((p) => p.id === targetId);
  const mainIdx = foundIdx !== -1 ? foundIdx : 0;
  const mainPost = { ...items[mainIdx] };
  mainPost.score = computeEngagementScore(mainPost);

  const parentContext = items.slice(0, mainIdx).map((item) => ({
    ...item,
    score: computeEngagementScore(item)
  }));

  const mainAuthor = mainPost.authorHandle?.toLowerCase() || '';
  const authorContinuation = [];
  const replies = [];
  let stillAuthorChain = true;

  for (const raw of items.slice(mainIdx + 1)) {
    if (raw.id && mainPost.id && raw.id === mainPost.id) continue;
    const item = { ...raw, score: computeEngagementScore(raw) };
    const itemAuthor = item.authorHandle?.toLowerCase() || '';
    if (stillAuthorChain && mainAuthor && itemAuthor === mainAuthor) {
      authorContinuation.push(item);
    } else {
      stillAuthorChain = false;
      replies.push(item);
    }
  }

  const sortedReplies = rankPosts(replies, sortMethod).slice(0, maxReplies);
  return {
    targetId,
    parentContext,
    mainPost,
    authorContinuation,
    replies: sortedReplies,
    sort: sortMethod,
    totalRepliesCaptured: replies.length
  };
}

export async function runEgoResearch(payload) {
  const runnerResult = await executeEgoRunner(payload, payload.timeoutMs);
  const rawItems = deduplicatePosts(runnerResult.items || []);

  if (payload.subcommand === 'thread') {
    return processThreadItems(rawItems, payload.statusId, payload.sort, payload.maxReplies);
  }

  const processed = rawItems.map((item) => ({
    ...item,
    score: computeEngagementScore(item)
  }));
  const ranked = rankPosts(processed, payload.sort).slice(0, payload.limit);

  if (payload.subcommand === 'search') {
    return {
      query: payload.target,
      tab: payload.tab,
      sort: payload.sort,
      tweets: ranked
    };
  }

  return {
    handle: payload.handle,
    sort: payload.sort,
    tweets: ranked
  };
}
