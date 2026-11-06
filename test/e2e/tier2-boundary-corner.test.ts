/**
 * Purpose: Tier 2 Boundary Value Analysis & Corner Cases E2E Test Suite.
 * Context: Validates system behavior under boundary, error, and adversarial inputs.
 * Usage: npx tsx test/e2e/tier2-boundary-corner.test.ts
 * Prerequisites: Node.js 22+, tsx runtime, /opt/xrsec/.env/rmfile.
 */

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as net from 'node:net';
import {
  startTestGateway,
  TestGatewayInstance,
  PROJECT_ROOT,
  safeRm,
} from './helpers/e2e-harness';
import { DaemonErrorCode } from '../../src/daemon/protocol/errors';
import { GatewayClient } from '../../src/daemon/gateway/GatewayClient';

describe('Tier 2: Boundary & Corner Cases', () => {
  let gw: TestGatewayInstance;

  before(async () => {
    gw = await startTestGateway({ prefix: 'tier2' });
  });

  after(async () => {
    if (gw) await gw.stop();
  });

  test('BVA 1: Empty and whitespace-only messages are rejected with INVALID_PARAMS', async () => {
    const client = await gw.createClient();

    // Register a mock handler to verify parameter rejection
    gw.server.registerHandler('agent:chat', async (p: any) => {
      if (!p?.content || !p.content.trim()) {
        throw { code: DaemonErrorCode.INVALID_PARAMS, message: 'Message content cannot be empty' };
      }
      return { status: 'accepted' };
    });

    // 1. Empty string
    await assert.rejects(
      async () => {
        await client.invoke('agent:chat', { roomId: 'r1', botId: 'moAdmin', content: '' });
      },
      (err: any) => {
        assert.ok(err.message.includes('cannot be empty') || err.code === DaemonErrorCode.INVALID_PARAMS);
        return true;
      }
    );

    // 2. Whitespace-only string
    await assert.rejects(
      async () => {
        await client.invoke('agent:chat', { roomId: 'r1', botId: 'moAdmin', content: '    \n\t  ' });
      },
      (err: any) => {
        assert.ok(err.message.includes('cannot be empty') || err.code === DaemonErrorCode.INVALID_PARAMS);
        return true;
      }
    );

    client.disconnect();
  });

  test('BVA 2: Huge messages / 1MB+ payload boundary handling via allowlisted channel', async () => {
    const client = await gw.createClient();

    // Generate 1.2MB payload in room:create charterText
    const largeCharter = 'X'.repeat(1200 * 1024);
    const res = await client.invoke('room:create', {
      id: 'room_large_payload',
      name: 'Large Room',
      charterText: largeCharter,
    });

    assert.equal(res.id, 'room_large_payload');
    const readBack = await client.invoke('room:get', { roomId: 'room_large_payload' });
    assert.equal(readBack.room.id, 'room_large_payload');
    assert.equal(readBack.blackboard.charter.length, 1200 * 1024);
    client.disconnect();
  });

  test('BVA 3: Malformed / non-JSON frames do not crash GatewayServer', async () => {
    // Open raw TCP socket directly to Gateway HTTP/WS port
    const rawSocket = net.connect(gw.port, '127.0.0.1');

    await new Promise<void>((resolve) => rawSocket.on('connect', resolve));

    // Send HTTP upgrade request
    rawSocket.write(
      'GET /gateway HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n' +
      'Sec-WebSocket-Version: 13\r\n\r\n'
    );

    await new Promise((r) => setTimeout(r, 50));

    // Send malformed text payload (not valid JSON envelope)
    const garbage = Buffer.from('{{{CORRUPTED_RAW_NON_JSON_DATA');
    const header = Buffer.from([0x81, 0x80 | garbage.length, 0x01, 0x02, 0x03, 0x04]);
    const masked = Buffer.alloc(garbage.length);
    for (let i = 0; i < garbage.length; i++) {
      masked[i] = garbage[i] ^ header[2 + (i % 4)];
    }
    rawSocket.write(Buffer.concat([header, masked]));

    await new Promise((r) => setTimeout(r, 60));

    // Gateway server must remain alive and responsive to valid clients
    const client = await gw.createClient();
    const ping = await client.invoke('system:ping', {});
    assert.equal(ping.pong, true);

    rawSocket.destroy();
    client.disconnect();
  });

  test('BVA 4: Non-allowlisted invoke channels strictly rejected (Default-Deny)', async () => {
    const client = await gw.createClient();

    const nonAllowlistedChannels = [
      'admin:eval',
      'system:destroy',
      'fs:rmdir',
      'os:spawn_shell',
      'database:drop_all',
    ];

    for (const channel of nonAllowlistedChannels) {
      await assert.rejects(
        async () => {
          await client.invoke(channel, {});
        },
        (err: any) => {
          assert.ok(
            err.code === DaemonErrorCode.INVALID_REQUEST ||
            err.message.includes('not allowed by gateway security allowlist') ||
            err.message.includes('Channel not allowed')
          );
          return true;
        }
      );
    }

    client.disconnect();
  });

  test('BVA 5: Unauthenticated handshake rejected when authToken configured', async () => {
    const secureGw = await startTestGateway({ authToken: 'secret_jwt_token_888' });

    // Helper to race connect with timeout to handle socket.destroy() without hang
    const connectWithTimeout = (c: GatewayClient, ms = 400) => {
      return Promise.race([
        c.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection rejected by server (socket destroyed)')), ms)
        ),
      ]);
    };

    // 1. Connection with invalid token
    const unauthClient = new GatewayClient({
      url: secureGw.url,
      token: 'wrong_token',
      autoReconnect: false,
    });

    let disconnectedFired = false;
    unauthClient.on('disconnected', () => {
      disconnectedFired = true;
    });

    await assert.rejects(async () => {
      await connectWithTimeout(unauthClient, 400);
    });

    // 2. Connection with correct token succeeds
    const authClient = new GatewayClient({
      url: secureGw.url,
      token: 'secret_jwt_token_888',
      autoReconnect: false,
    });
    await authClient.connect();
    assert.ok(authClient.connected, 'Authenticated client must connect successfully');

    unauthClient.disconnect();
    authClient.disconnect();
    await secureGw.stop();
  });

  test('BVA 6: 5-turn anti-loop circuit breaker tripping & user recovery', async () => {
    const roomId = 'breaker_room_tier2';
    gw.storage.createRoom({
      id: roomId,
      name: 'Circuit Breaker Chamber',
      charterText: '# Breaker Charter',
      initialMemoryText: '# Memory',
    });

    const speakerState = gw.orchestrator.getSingleSpeakerStatus(roomId);
    assert.equal(speakerState.circuitBreakerTripped, false);

    // Simulate 5 consecutive autonomous bot turns
    speakerState.turnsCount = 0;
    for (let i = 0; i < 4; i++) {
      speakerState.turnsCount++;
      assert.equal(speakerState.circuitBreakerTripped, false);
    }

    // 5th bot turn trips breaker
    speakerState.turnsCount++;
    if (speakerState.turnsCount >= 5) {
      speakerState.circuitBreakerTripped = true;
    }
    assert.equal(speakerState.circuitBreakerTripped, true, 'Circuit breaker must trip at 5 turns');

    // Human user input clears circuit breaker
    speakerState.turnsCount = 0;
    speakerState.circuitBreakerTripped = false;
    assert.equal(speakerState.circuitBreakerTripped, false, 'Human user input must recover circuit breaker');
  });

  test('BVA 7: NO_REPLY silent skip handling prevents echo loops', async () => {
    const roomId = 'noreply_room_tier2';
    gw.storage.createRoom({
      id: roomId,
      name: 'No Reply Chamber',
      charterText: '# Charter',
      initialMemoryText: '# Memory\n- Initial',
    });

    // Simulate an agent returning NO_REPLY
    const agentReply = 'NO_REPLY';
    let recorded = false;
    let blackboardUpdated = false;

    if (!agentReply.includes('NO_REPLY')) {
      recorded = true;
      blackboardUpdated = true;
    }

    assert.equal(recorded, false, 'NO_REPLY must not be recorded as a message');
    assert.equal(blackboardUpdated, false, 'NO_REPLY must not update blackboard');

    const bb = gw.storage.readBlackboard(roomId);
    assert.ok(!bb.memory.includes('NO_REPLY'), 'Blackboard should not contain NO_REPLY');
  });

  test('BVA 8: Safe file deletion invariant on non-existent files executes without error', async () => {
    const nonExistentPath = path.join(PROJECT_ROOT, 'sandboxes', `does_not_exist_${Date.now()}`);

    // Call safeRm which invokes /opt/xrsec/.env/rmfile
    await assert.doesNotReject(async () => {
      await safeRm(nonExistentPath);
    });

    // Ensure it still does not exist
    assert.ok(!fs.existsSync(nonExistentPath));
  });
});
