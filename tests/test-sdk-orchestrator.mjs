#!/usr/bin/env node
/**
 * Purpose: Automated verification test for in-process SDK MCP and mid-flight steering.
 * Context: Validates Lead Orchestrator suspension, user amendment break, and tool signatures.
 * Usage: node tests/test-sdk-orchestrator.mjs
 * Prerequisites: Node.js 18+, @anthropic-ai/claude-agent-sdk
 */

import assert from 'node:assert/strict';
import { createInProcessOrchestratorMcp } from '../apps/desktop/src/main/orchestrator/InProcessOrchestratorMcp.mjs';
import { ClaudeAgentSdkDriver } from '../apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs';

console.log('[TEST] Starting Claude Agent SDK Orchestration Test Suite...');

// Mock Driver & Partner Pool
class MockDriver {
  constructor(id) {
    this.id = id;
    this.memorySteeringDirective = null;
  }
  setSteeringDirective(directive) {
    this.memorySteeringDirective = directive;
  }
  async executeTurn() {
    return new Promise(r => setTimeout(r, 200));
  }
}

const mockPool = {
  drivers: new Map(),
  getDriver(id) {
    if (!this.drivers.has(id)) {
      this.drivers.set(id, new MockDriver(id));
    }
    return this.drivers.get(id);
  }
};

// 1. Verify In-Process MCP Server Creation
const { server, breakWaitState } = createInProcessOrchestratorMcp(mockPool, {});
assert.ok(server, 'SDK MCP Server should be successfully instantiated');
console.log('  ✓ In-Process MCP Server instantiated');

// 2. Verify Mid-Flight Amendment Breaking
async function testMidFlightAmendment() {
  const awaitTool = server.instance._registeredTools['await_partner_queue'];
  assert.ok(awaitTool, 'await_partner_queue tool must be registered');

  // Trigger await_partner_queue to suspend the turn
  const waitPromise = awaitTool.handler({
    ticket_ids: ['ticket_fake_1'],
    wait_mode: 'ALL'
  }, {});

  // Simulate human sending mid-flight amendment 30ms later
  setTimeout(() => {
    const broken = breakWaitState('等等，不要分析 v2.1 了，换成 v2.2！');
    assert.strictEqual(broken, true, 'Should successfully break wait state');
  }, 30);

  const result = await waitPromise;
  assert.ok(result.content && result.content[0].text);
  const parsed = JSON.parse(result.content[0].text);
  assert.strictEqual(parsed.event_type, 'USER_MID_FLIGHT_AMENDMENT');
  assert.strictEqual(parsed.user_new_message, '等等，不要分析 v2.1 了，换成 v2.2！');
  console.log('  ✓ Mid-flight amendment successfully breaks pending queue state and delivers payload');
}

// 3. Verify ClaudeAgentSdkDriver Initialization & Memory Steering
function testSdkDriverInitialization() {
  const driver = new ClaudeAgentSdkDriver({ partnerId: 'rea-partner' });
  assert.strictEqual(driver.partnerId, 'rea-partner');
  assert.strictEqual(driver.isRunning, false);

  driver.setSteeringDirective('优先提取导出符号表');
  assert.strictEqual(driver.memorySteeringDirective, '优先提取导出符号表');
  console.log('  ✓ ClaudeAgentSdkDriver supports atomic in-memory steering');
}

await testMidFlightAmendment();
testSdkDriverInitialization();

console.log('[TEST] All Orchestration & In-Memory Steering tests PASSED!');
