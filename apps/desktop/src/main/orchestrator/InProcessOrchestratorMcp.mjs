#!/usr/bin/env node
/**
 * Purpose: In-process SDK MCP server providing multi-agent orchestration tools.
 * Context: Runs directly inside Electron main process without IPC/stdio network overhead.
 * Usage: Passed to Lead Orchestrator query options via mcpServers array.
 * Prerequisites: @anthropic-ai/claude-agent-sdk v0.3.310+, zod
 */

import crypto from 'node:crypto';
import { z } from 'zod';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

export function createInProcessOrchestratorMcp(partnerPool, steeringController) {
  const tickets = new Map();
  let activeWaitResolver = null;

  // 1. Tool: dispatch_and_queue_partners
  const dispatchTool = tool(
    'dispatch_and_queue_partners',
    'Decomposes master task and executes orthogonal subtasks in partner worker sandboxes.',
    {
      assignments: z.array(
        z.object({
          partner_id: z.string(),
          task_instruction: z.string(),
          quoted_message_ids: z.array(z.string()).optional(),
          output_json_schema: z.record(z.string(), z.any()).optional()
        })
      )
    },
    async (args) => {
      const ticketIds = [];

      for (const assignment of args.assignments) {
        const ticketId = `ticket_${crypto.randomUUID().slice(0, 8)}`;
        const { partner_id, task_instruction, output_json_schema } = assignment;

        const ticketEntry = {
          ticketId,
          partnerId: partner_id,
          status: 'RUNNING',
          taskInstruction: task_instruction,
          startTime: Date.now(),
          result: null
        };
        tickets.set(ticketId, ticketEntry);
        ticketIds.push(ticketId);

        let finalPrompt = task_instruction;
        if (output_json_schema) {
          finalPrompt += `\n\n[OUTPUT_JSON_SCHEMA]: Return deliverable conforming to:\n${JSON.stringify(output_json_schema)}`;
        }

        // Asynchronously run partner turn
        const driver = partnerPool.getDriver(partner_id);
        if (driver) {
          driver.executeTurn(finalPrompt)
            .then(() => {
              ticketEntry.status = 'COMPLETED';
              ticketEntry.durationMs = Date.now() - ticketEntry.startTime;
              checkQueueResolution();
            })
            .catch((err) => {
              ticketEntry.status = 'FAILED';
              ticketEntry.error = err.message;
              checkQueueResolution();
            });
        }
      }

      const payload = {
        status: 'DISPATCHED',
        dispatched_tickets: ticketIds
      };
      return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    }
  );

  // 2. Tool: await_partner_queue
  const awaitTool = tool(
    'await_partner_queue',
    'Suspends Lead turn until subagent tickets finish or user sends mid-flight amendment.',
    {
      ticket_ids: z.array(z.string()),
      wait_mode: z.enum(['ALL', 'FIRST_COMPLETED']).default('ALL')
    },
    async (args) => {
      return new Promise((resolve) => {
        activeWaitResolver = {
          ticketIds: args.ticket_ids,
          waitMode: args.wait_mode || 'ALL',
          resolve: (result) => {
            resolve({ content: [{ type: 'text', text: JSON.stringify(result) }] });
          }
        };
        checkQueueResolution();
      });
    }
  );

  // 3. Tool: steer_or_repair_partner
  const steerTool = tool(
    'steer_or_repair_partner',
    'Injects dynamic in-flight steering to running partner or requests rework.',
    {
      partner_id: z.string(),
      target_session_id: z.string().optional(),
      mode: z.enum(['STEER_IN_FLIGHT', 'REPAIR_COMPLETED']),
      instruction: z.string()
    },
    async (args) => {
      const driver = partnerPool.getDriver(args.partner_id);
      if (!driver) {
        const errPayload = { status: 'ERROR', message: `Unknown partner: ${args.partner_id}` };
        return { content: [{ type: 'text', text: JSON.stringify(errPayload) }] };
      }

      if (args.mode === 'STEER_IN_FLIGHT') {
        driver.setSteeringDirective(args.instruction);
        const payload = { status: 'STEERING_QUEUED_IN_MEMORY', partner_id: args.partner_id };
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      } else {
        driver.executeTurn(`[LEAD_REPAIR_INSTRUCTION]: ${args.instruction}`);
        const payload = { status: 'REPAIR_DISPATCHED', partner_id: args.partner_id };
        return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
      }
    }
  );

  function checkQueueResolution() {
    if (!activeWaitResolver) return;
    const { ticketIds, waitMode, resolve } = activeWaitResolver;
    const targets = ticketIds.map(id => tickets.get(id)).filter(Boolean);
    if (targets.length === 0) return; // Keep waiting until tickets exist or amendment arrives

    if (waitMode === 'FIRST_COMPLETED') {
      const done = targets.find(t => t.status === 'COMPLETED' || t.status === 'FAILED');
      if (done) {
        const resolver = activeWaitResolver.resolve;
        activeWaitResolver = null;
        resolver({ event_type: 'QUEUE_COMPLETED', target: done });
      }
    } else {
      const allDone = targets.every(t => t.status === 'COMPLETED' || t.status === 'FAILED');
      if (allDone) {
        const resolver = activeWaitResolver.resolve;
        activeWaitResolver = null;
        resolver({ event_type: 'QUEUE_COMPLETED', results: targets });
      }
    }
  }

  // Interruption trigger for human mid-flight amendment
  const breakWaitState = (userNewMessage) => {
    if (!activeWaitResolver) return false;
    const resolver = activeWaitResolver.resolve;
    activeWaitResolver = null;

    resolver({
      event_type: 'USER_MID_FLIGHT_AMENDMENT',
      user_new_message: userNewMessage,
      instruction: 'User amended requirements. Issue steer_or_repair_partner to align subtasks.'
    });
    return true;
  };

  const server = createSdkMcpServer({
    name: 'nexus-orchestrator-mcp',
    version: '1.0.0',
    tools: [dispatchTool, awaitTool, steerTool]
  });

  return {
    server,
    tickets,
    breakWaitState
  };
}
