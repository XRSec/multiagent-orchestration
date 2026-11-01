import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Known active session IDs across the process lifecycle
const knownInitializedSessions = new Set();

/**
 * Resolves the Claude Code CLI binary path.
 * Checks environment variable CLAUDE_BIN_PATH, homebrew default, and system PATH.
 */
export function resolveClaudeBinary() {
  if (process.env.CLAUDE_BIN_PATH && fs.existsSync(process.env.CLAUDE_BIN_PATH)) {
    return process.env.CLAUDE_BIN_PATH;
  }
  const defaultHomebrew = '/opt/homebrew/bin/claude';
  if (fs.existsSync(defaultHomebrew)) {
    return defaultHomebrew;
  }
  return 'claude';
}

/**
 * Spawns a single low-level claude CLI subprocess turn.
 */
function spawnTurn({
  prompt,
  sessionUuid,
  systemPromptPath,
  useResume,
  model,
  timeoutMs = 120_000,
  cwd = process.cwd(),
  env = process.env,
}) {
  return new Promise((resolve) => {
    const claudeBin = resolveClaudeBinary();
    const args = ['-p', prompt, '--output-format', 'json', '--dangerously-skip-permissions'];

    if (sessionUuid) {
      if (useResume) {
        args.push('--resume', sessionUuid);
      } else {
        args.push('--session-id', sessionUuid);
      }
    }

    if (systemPromptPath) {
      args.push('--system-prompt-file', systemPromptPath);
    }

    if (model) {
      args.push('--model', model);
    }

    const startTime = Date.now();
    let timedOut = false;
    let timer = null;
    let forceKillTimer = null;

    const child = spawn(claudeBin, args, {
      cwd,
      env: { ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Close stdin immediately as execution is strictly non-interactive
    child.stdin.end();

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
        forceKillTimer = setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 3000);
      }, timeoutMs);
    }

    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);

      const durationMs = Date.now() - startTime;
      const rawStdout = Buffer.concat(stdoutChunks).toString('utf8');
      const rawStderr = Buffer.concat(stderrChunks).toString('utf8');

      let jsonEnvelope = null;
      let resultText = '';
      let isError = code !== 0 || timedOut;

      try {
        jsonEnvelope = JSON.parse(rawStdout.trim());
        if (jsonEnvelope && typeof jsonEnvelope === 'object') {
          if (typeof jsonEnvelope.result === 'string') {
            resultText = jsonEnvelope.result;
          } else if (jsonEnvelope.result) {
            resultText = JSON.stringify(jsonEnvelope.result);
          }
          if (jsonEnvelope.is_error === true) {
            isError = true;
          }
        }
      } catch {
        // Fallback: search for last valid JSON block in stdout if logging noise occurred
        const jsonMatch = rawStdout.match(/\{[\s\S]*\}$/);
        if (jsonMatch) {
          try {
            jsonEnvelope = JSON.parse(jsonMatch[0]);
            resultText = jsonEnvelope.result || rawStdout.trim();
          } catch {
            resultText = rawStdout.trim();
          }
        } else {
          resultText = rawStdout.trim();
        }
      }

      resolve({
        success: !isError,
        resultText,
        rawStdout,
        rawStderr,
        jsonEnvelope,
        sessionId: jsonEnvelope?.session_id || sessionUuid || null,
        exitCode: code,
        signal,
        durationMs,
        timedOut,
      });
    });

    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      const durationMs = Date.now() - startTime;
      resolve({
        success: false,
        resultText: '',
        rawStdout: '',
        rawStderr: err.message,
        jsonEnvelope: null,
        sessionId: sessionUuid || null,
        exitCode: -1,
        signal: null,
        durationMs,
        timedOut: false,
        error: err,
      });
    });
  });
}

/**
 * High-level runner with self-healing session handling and retry.
 * Handles automatic transition between --session-id and --resume.
 */
export async function executeClaudeSubprocess({
  prompt,
  sessionUuid,
  systemPromptPath,
  timeoutMs = 120_000,
  model,
  cwd,
  env,
  isResume,
}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('ClaudeSubprocess: prompt must be a non-empty string.');
  }

  // Determine initial strategy for session persistence
  let useResume = isResume ?? false;
  if (sessionUuid) {
    if (isResume === undefined) {
      useResume = knownInitializedSessions.has(sessionUuid);
    }
  }

  let res = await spawnTurn({
    prompt,
    sessionUuid,
    systemPromptPath,
    useResume,
    model,
    timeoutMs,
    cwd,
    env,
  });

  // Self-healing recovery: If session was expected to exist but was not found
  if (
    !res.success &&
    sessionUuid &&
    useResume &&
    (res.rawStderr.includes('No conversation found with session ID') ||
      res.rawStdout.includes('No conversation found with session ID'))
  ) {
    knownInitializedSessions.delete(sessionUuid);
    res = await spawnTurn({
      prompt,
      sessionUuid,
      systemPromptPath,
      useResume: false,
      model,
      timeoutMs,
      cwd,
      env,
    });
  }
  // Self-healing recovery: If --session-id was passed but session is already in use
  else if (
    !res.success &&
    sessionUuid &&
    !useResume &&
    (res.rawStderr.includes('already in use') || res.rawStdout.includes('already in use'))
  ) {
    knownInitializedSessions.add(sessionUuid);
    res = await spawnTurn({
      prompt,
      sessionUuid,
      systemPromptPath,
      useResume: true,
      model,
      timeoutMs,
      cwd,
      env,
    });
  }

  if (res.success && sessionUuid) {
    knownInitializedSessions.add(sessionUuid);
  }

  return res;
}
