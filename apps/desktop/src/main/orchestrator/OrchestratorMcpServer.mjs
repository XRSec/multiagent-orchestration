#!/usr/bin/env node
/**
 * Purpose: Host-internal orchestration engine exposing nexus-orchestrator-mcp primitives.
 * Context: Manages task dispatch queues, completion awaits, and mid-flight interrupt breaking.
 * Usage: Bound exclusively to Lead Coordinator session in multiagent app.
 * Prerequisites: Node.js 18+, ClaudeProcessPool, SteeringController
 */

import crypto from 'node:crypto';

export class OrchestratorMcpServer {
  constructor(processPool, steeringController) {
    this.pool = processPool;
    this.steering = steeringController;
    this.tickets = new Map(); // ticketId -> { partnerId, status, result, promiseHooks }
    this.activeWaitResolver = null;
  }

  /**
   * Tool: dispatch_and_queue_partners
   */
  async dispatchAndQueuePartners(assignments) {
    const ticketIds = [];

    for (const item of assignments) {
      const ticketId = `ticket_${crypto.randomUUID().slice(0, 8)}`;
      const { partnerId, task_instruction, quoted_message_ids, output_json_schema } = item;

      // 1. Register ticket
      const ticketEntry = {
        ticketId,
        partnerId,
        status: 'RUNNING',
        task_instruction,
        startTime: Date.now(),
        result: null
      };
      this.tickets.set(ticketId, ticketEntry);
      ticketIds.push(ticketId);

      // 2. Fetch or spawn partner session
      const session = this.pool.getOrCreate(partnerId);
      if (session.isTerminated || !session.process) {
        session.spawn();
      }

      // 3. Assemble task packet
      let fullPrompt = task_instruction;
      if (output_json_schema) {
        fullPrompt += `\n\n[OUTPUT_JSON_SCHEMA_REQUIREMENT]: Output MUST conform strictly to:\n${JSON.stringify(output_json_schema, null, 2)}`;
      }

      // 4. Attach completion listeners
      const onResult = (event) => {
        ticketEntry.status = 'COMPLETED';
        ticketEntry.result = event;
        ticketEntry.durationMs = Date.now() - ticketEntry.startTime;
        this._checkQueueResolution();
      };

      const onError = (err) => {
        ticketEntry.status = 'FAILED';
        ticketEntry.error = err.message;
        this._checkQueueResolution();
      };

      session.once('result', onResult);
      session.once('error', onError);

      // 5. Send task packet to partner stdin
      session.sendUserMessage(fullPrompt);
    }

    return {
      status: 'DISPATCHED',
      dispatched_count: ticketIds.length,
      ticket_ids: ticketIds
    };
  }

  /**
   * Tool: await_partner_queue
   * Yields Lead turn until partner completion or early resolve via user amendment.
   */
  awaitPartnerQueue(ticketIds, waitMode = 'ALL') {
    return new Promise((resolve) => {
      this.activeWaitResolver = {
        ticketIds,
        waitMode,
        resolve
      };
      // Check if already finished before waiting
      this._checkQueueResolution();
    });
  }

  /**
   * Mid-Flight User Amendment Interruption
   * Triggered when the human user speaks in group chat while Lead is awaiting subtasks.
   */
  breakWaitStateWithAmendment(userNewMessage, activeSubtasksSnapshot = []) {
    if (!this.activeWaitResolver) return false;

    const payload = {
      event_type: 'USER_MID_FLIGHT_AMENDMENT',
      user_new_message: userNewMessage,
      active_subtasks: activeSubtasksSnapshot.length > 0 ? activeSubtasksSnapshot : this._getActiveSubtasksSnapshot(),
      instruction: 'User modified requirements mid-execution. Inspect active subtasks and invoke steer_or_repair_partner.'
    };

    const resolver = this.activeWaitResolver.resolve;
    this.activeWaitResolver = null;
    resolver(payload);
    return true;
  }

  /**
   * Tool: steer_or_repair_partner
   */
  async steerOrRepairPartner(partnerId, targetSessionId, mode, instruction) {
    if (mode === 'STEER_IN_FLIGHT') {
      // Dynamic in-flight redirection
      this.steering.adaptiveSteer(partnerId, instruction);
      return {
        status: 'STEERING_DISPATCHED',
        partner_id: partnerId,
        mode
      };
    } else if (mode === 'REPAIR_COMPLETED') {
      // Rework on completed session
      const session = this.pool.getSession(partnerId);
      if (session && !session.isTerminated) {
        session.sendUserMessage(`[LEAD_DEFECT_REPAIR]: Quality check identified defect:\n${instruction}\nPlease revise and output corrected deliverable.`);
        return {
          status: 'REPAIR_DIRECTIVE_SENT',
          partner_id: partnerId,
          mode
        };
      }
      return { status: 'ERROR', message: `Partner session ${partnerId} not active.` };
    }

    return { status: 'INVALID_MODE', mode };
  }

  _getActiveSubtasksSnapshot() {
    const list = [];
    for (const [id, entry] of this.tickets) {
      if (entry.status === 'RUNNING') {
        list.push({
          ticket_id: id,
          partner_id: entry.partnerId,
          status: entry.status,
          running_duration_ms: Date.now() - entry.startTime
        });
      }
    }
    return list;
  }

  _checkQueueResolution() {
    if (!this.activeWaitResolver) return;

    const { ticketIds, waitMode, resolve } = this.activeWaitResolver;
    const targets = ticketIds.map(id => this.tickets.get(id)).filter(Boolean);

    if (waitMode === 'FIRST_COMPLETED') {
      const finished = targets.find(t => t.status === 'COMPLETED' || t.status === 'FAILED');
      if (finished) {
        this.activeWaitResolver = null;
        resolve({
          event_type: 'QUEUE_COMPLETED',
          completed_ticket: finished
        });
      }
    } else {
      // ALL mode
      const allDone = targets.every(t => t.status === 'COMPLETED' || t.status === 'FAILED');
      if (allDone) {
        this.activeWaitResolver = null;
        resolve({
          event_type: 'QUEUE_COMPLETED',
          results: targets
        });
      }
    }
  }
}
