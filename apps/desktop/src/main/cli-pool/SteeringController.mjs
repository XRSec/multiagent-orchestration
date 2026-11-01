#!/usr/bin/env node
/**
 * Purpose: Real-time dual-channel steering controller for in-flight partner redirect.
 * Context: Dispatches soft steering via IPC mailboxes and hard steering via interrupt frames.
 * Usage: Invoked by Lead Orchestrator or host when user submits mid-flight amendments.
 * Prerequisites: Node.js 18+, active ClaudeProcessSession
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RUNTIME_ROOT = path.join(os.homedir(), '.multiagent-orchestration');
const MAILBOXES_DIR = path.join(RUNTIME_ROOT, 'mailboxes');

export class SteeringController {
  constructor(processPool) {
    this.pool = processPool;
    if (!fs.existsSync(MAILBOXES_DIR)) {
      fs.mkdirSync(MAILBOXES_DIR, { recursive: true });
    }
  }

  /**
   * Channel 1: Soft Steering (PreToolUse Hook Injection)
   * Writes directive to mailbox for pre-tool interception. Process stays alive.
   */
  softSteer(partnerId, directive, options = {}) {
    const mailboxPath = path.join(MAILBOXES_DIR, `${partnerId}.json`);
    const payload = {
      timestamp: Date.now(),
      action: options.action || 'INJECT', // 'INJECT' | 'ABORT'
      directive
    };

    fs.writeFileSync(mailboxPath, JSON.stringify(payload, null, 2), 'utf-8');
    return { channel: 'SOFT_STEER', mailboxPath, status: 'QUEUED' };
  }

  /**
   * Channel 2: Hard Steering (control_request: interrupt + Turn Redirection)
   * Halts active blocking tool execution, preserves context, and resumes turn.
   */
  hardSteer(partnerId, amendmentText, reason = 'Mid-flight user amendment') {
    const session = this.pool.getSession(partnerId);
    if (!session || session.isTerminated) {
      throw new Error(`Cannot hard steer non-existent or terminated partner session: ${partnerId}`);
    }

    // 1. Issue protocol-level interrupt control frame over stdin
    session.interrupt(reason);

    // 2. Inject amendment message immediately following interrupt
    const formattedAmendment = `[LEAD_STEERING_AMENDMENT]: Requirements revised by host. Immediately abort obsolete branch and proceed with: ${amendmentText}`;
    
    // Slight tick delay to ensure interrupt frame is processed first
    setTimeout(() => {
      try {
        session.sendUserMessage(formattedAmendment);
      } catch (err) {
        console.error(`[SteeringController] Error dispatching post-interrupt message to ${partnerId}:`, err);
      }
    }, 100);

    return { channel: 'HARD_STEER', partnerId, status: 'INTERRUPT_DISPATCHED' };
  }

  /**
   * Adaptive Dispatch: Evaluates state and selects optimal channel.
   */
  adaptiveSteer(partnerId, amendmentText, isLongRunningBlockingTool = false) {
    if (isLongRunningBlockingTool) {
      return this.hardSteer(partnerId, amendmentText);
    }
    return this.softSteer(partnerId, amendmentText);
  }
}
