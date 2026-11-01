#!/usr/bin/env node
/**
 * Purpose: Headless Claude Code CLI subprocess pool manager with NDJSON streaming.
 * Context: Core runtime driver for multiagent-orchestration executing in partner sandboxes.
 * Usage: Manages spawn lifecycle, prompt caching, watchdog timers, and stdin steering.
 * Prerequisites: /opt/homebrew/bin/claude v2.1.220+, claude-code-parser
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { parseLine, Translator, createMessage } from 'claude-code-parser';

const RUNTIME_ROOT = path.join(os.homedir(), '.multiagent-orchestration');
const CLAUDE_BIN = '/opt/homebrew/bin/claude';

export class ClaudeProcessSession extends EventEmitter {
  constructor(options) {
    super();
    this.partnerId = options.partnerId;
    this.partnerDir = options.partnerDir || path.join(RUNTIME_ROOT, 'partners', this.partnerId);
    this.activeSessionId = options.sessionId || null;
    this.manifest = options.manifest || this._loadManifest();
    this.watchdogTimeoutMs = options.watchdogTimeoutMs || 30000;

    this.process = null;
    this.translator = new Translator();
    this.lastByteTimestamp = Date.now();
    this.watchdogTimer = null;
    this.isTerminated = false;
  }

  _loadManifest() {
    const manifestPath = path.join(this.partnerDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        console.warn(`[ClaudeProcessSession] Failed to parse manifest at ${manifestPath}:`, err.message);
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

    // 3. Base Soul (if specialist partner)
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

    // 5. MEMORY.md (First 200 lines / 25KB)
    const memPath = path.join(this.partnerDir, 'memories', 'MEMORY.md');
    if (fs.existsSync(memPath)) {
      try {
        const memContent = fs.readFileSync(memPath, 'utf-8');
        const truncatedLines = memContent.split('\n').slice(0, 200).join('\n');
        promptParts.push(`# ACTIVE MEMORY SHARD (PRE-LOADED)\n${truncatedLines}`);
      } catch (e) {
        console.warn('[ClaudeProcessSession] Error reading memory shard:', e.message);
      }
    }

    return promptParts.join('\n\n');
  }

  spawn() {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--dangerously-skip-permissions'
    ];

    // MCP Config
    const mcpPath = path.join(this.partnerDir, 'mcp.json');
    if (fs.existsSync(mcpPath)) {
      args.push('--mcp-config', './mcp.json');
    }

    // Allowed Tools
    if (Array.isArray(this.manifest.allowed_tools) && this.manifest.allowed_tools.length > 0) {
      args.push('--allowedTools', this.manifest.allowed_tools.join(','));
    }

    // Disallowed Tools
    if (Array.isArray(this.manifest.disallowed_tools) && this.manifest.disallowed_tools.length > 0) {
      args.push('--disallowedTools', this.manifest.disallowed_tools.join(','));
    }

    // Append layered system prompt
    const combinedSystemPrompt = this._assembleSystemPrompt();
    if (combinedSystemPrompt) {
      args.push('--append-system-prompt', combinedSystemPrompt);
    }

    // Environment variables
    const env = {
      ...process.env,
      CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS: '1',
      CLAUDE_CODE_FORWARD_SUBAGENT_TEXT: '1'
    };

    this.process = spawn(CLAUDE_BIN, args, {
      cwd: this.partnerDir,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this._startWatchdog();
    this._attachStreamParsers();

    this.process.on('error', (err) => {
      this.emit('error', err);
    });

    this.process.on('close', (code, signal) => {
      this._stopWatchdog();
      this.isTerminated = true;
      this.emit('close', { code, signal });
    });

    return this;
  }

  _attachStreamParsers() {
    const rlOut = readline.createInterface({
      input: this.process.stdout,
      crlfDelay: Infinity
    });

    rlOut.on('line', (line) => {
      this.lastByteTimestamp = Date.now();
      if (!line.trim()) return;

      const rawEvent = parseLine(line);
      if (!rawEvent) return;

      // Capture session_id from system init frame
      if (rawEvent.type === 'system' && rawEvent.session_id) {
        this.activeSessionId = rawEvent.session_id;
        this.emit('init', { sessionId: this.activeSessionId, model: rawEvent.model });
      }

      // Deduplicate with Translator
      const normalized = this.translator.process(rawEvent);
      if (!normalized) return;

      this.emit('event', normalized);

      if (normalized.type === 'stream_event') {
        this.emit('text_delta', normalized);
      } else if (normalized.type === 'tool_use') {
        this.emit('tool_use', normalized);
      } else if (normalized.type === 'tool_result') {
        this.emit('tool_result', normalized);
      } else if (normalized.type === 'control_request') {
        this.emit('control_request', normalized);
      } else if (normalized.type === 'result') {
        this.emit('result', normalized);
      }
    });

    this.process.stderr.on('data', (chunk) => {
      this.lastByteTimestamp = Date.now();
      const text = chunk.toString();
      this.emit('stderr', text);
    });
  }

  sendUserMessage(text) {
    if (!this.process || this.isTerminated) {
      throw new Error(`Cannot write to terminated process for partner: ${this.partnerId}`);
    }
    const frame = createMessage.user(text);
    this.process.stdin.write(JSON.stringify(frame) + '\n');
  }

  sendControlApproval(requestId, approved = true) {
    if (!this.process || this.isTerminated) return;
    const frame = approved
      ? createMessage.approve(requestId)
      : createMessage.deny(requestId);
    this.process.stdin.write(JSON.stringify(frame) + '\n');
  }

  interrupt(reason = 'Host dynamic steering interrupt') {
    if (!this.process || this.isTerminated) return;
    const interruptFrame = {
      type: 'control_request',
      request_id: `steer_interrupt_${Date.now()}`,
      request: {
        subtype: 'interrupt',
        session_id: this.activeSessionId,
        reason
      }
    };
    this.process.stdin.write(JSON.stringify(interruptFrame) + '\n');
  }

  _startWatchdog() {
    this._stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.isTerminated) return;
      const elapsed = Date.now() - this.lastByteTimestamp;
      if (elapsed > this.watchdogTimeoutMs) {
        console.warn(`[Watchdog] Partner ${this.partnerId} stalled for ${elapsed}ms. Emitting stall warning.`);
        this.emit('stall', { elapsedMs: elapsed, sessionId: this.activeSessionId });
      }
    }, 5000);
  }

  _stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  terminate(signal = 'SIGTERM') {
    this._stopWatchdog();
    if (this.process && !this.isTerminated) {
      this.isTerminated = true;
      this.process.kill(signal);
    }
  }
}

export class ClaudeProcessPool {
  constructor() {
    this.sessions = new Map();
  }

  getOrCreate(partnerId, options = {}) {
    if (this.sessions.has(partnerId)) {
      const existing = this.sessions.get(partnerId);
      if (!existing.isTerminated) {
        return existing;
      }
    }
    const session = new ClaudeProcessSession({ partnerId, ...options });
    this.sessions.set(partnerId, session);
    return session;
  }

  getSession(partnerId) {
    return this.sessions.get(partnerId) || null;
  }

  terminateAll() {
    for (const [id, session] of this.sessions) {
      session.terminate();
    }
    this.sessions.clear();
  }
}
