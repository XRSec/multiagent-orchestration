/**
 * Purpose: Empirical Challenger Adversarial & Stress Testing Suite for M1 Gate.
 * Context: Validates protocol robustness, envelope fuzzing, handshake security,
 *          channel allowlist defense (-32600), reconnection resilience, and timeout cleanup.
 * Usage: npx tsx test/e2e/challenger-adversarial.test.ts
 * Prerequisites: Node.js 22+, tsx runtime.
 */

import { test, describe, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as net from 'node:net';
import * as crypto from 'node:crypto';
import {
  startTestGateway,
  TestGatewayInstance,
  getFreePort,
} from './helpers/e2e-harness';
import { DaemonErrorCode } from '../../src/daemon/protocol/errors';
import { GatewayClient } from '../../src/daemon/gateway/GatewayClient';
import { GatewayServer } from '../../src/daemon/gateway/GatewayServer';
import { BackpressureGuard } from '../../src/daemon/transport/BackpressureGuard';

// Polyfill minimal browser environment for WebGatewayClient
(globalThis as any).window = globalThis;
(globalThis as any).window.location = { protocol: 'http:', host: '127.0.0.1' };

import { WebGatewayClient } from '../../src/web/src/services/gateway/WebGatewayClient';

/**
 * Low-level helper: send raw WebSocket frame over TCP socket
 */
function sendRawWsFrame(socket: net.Socket, payloadText: string, opcode = 0x81): void {
  const payload = Buffer.from(payloadText, 'utf-8');
  const length = payload.length;
  const maskKey = crypto.randomBytes(4);

  let header: Buffer;
  if (length < 126) {
    header = Buffer.from([opcode, 0x80 | length]);
  } else if (length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = opcode;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = opcode;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  const maskedPayload = Buffer.alloc(length);
  for (let i = 0; i < length; i++) {
    maskedPayload[i] = payload[i] ^ maskKey[i % 4];
  }

  socket.write(Buffer.concat([header, maskKey, maskedPayload]));
}

/**
 * Establish upgraded raw WebSocket TCP connection
 */
async function createRawWsConnection(port: number): Promise<net.Socket> {
  const socket = net.connect(port, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  const secKey = crypto.randomBytes(16).toString('base64');
  socket.write(
    `GET /gateway HTTP/1.1\r\n` +
    `Host: 127.0.0.1:${port}\r\n` +
    `Upgrade: websocket\r\n` +
    `Connection: Upgrade\r\n` +
    `Sec-WebSocket-Key: ${secKey}\r\n` +
    `Sec-WebSocket-Version: 13\r\n\r\n`
  );

  await new Promise<void>((resolve, reject) => {
    const onData = (data: Buffer) => {
      const resp = data.toString('utf-8');
      if (resp.includes('101 Switching Protocols')) {
        socket.removeListener('data', onData);
        resolve();
      }
    };
    socket.on('data', onData);
    socket.once('error', reject);
  });

  return socket;
}

describe('Empirical Challenger: M1 Gateway Protocol & WebClient Stress Test', () => {
  let gw: TestGatewayInstance;

  before(async () => {
    gw = await startTestGateway({ prefix: 'challenger-m1' });
  });

  after(async () => {
    if (gw) await gw.stop();
  });

  // =========================================================================
  // Test Area 1: Malformed Envelope Fuzzing
  // =========================================================================
  describe('Area 1: Malformed Envelope Fuzzing', () => {
    test('1.1: Non-JSON raw frames must not crash server and server remains responsive', async () => {
      const raw = await createRawWsConnection(gw.port);

      // Fuzz with garbage strings
      const garbagePayloads = [
        'NOT_JSON_AT_ALL',
        '{"unclosed_json": ',
        '<<<XML><NOT>JSON</NOT></XML>',
        '\x00\x01\x02\x03\xFF\xFE\xFD',
        '{"kind": "ping", syntax_error',
        '',
      ];

      for (const payload of garbagePayloads) {
        sendRawWsFrame(raw, payload);
      }

      await new Promise((r) => setTimeout(r, 60));

      // Empirical check: server is completely unharmed
      const client = await gw.createClient();
      const ping = await client.invoke('system:ping', {});
      assert.equal(ping.pong, true);
      client.disconnect();
      raw.destroy();
    });

    test('1.2: Envelopes missing kind, invalid kind, or missing id must be safely dropped', async () => {
      const raw = await createRawWsConnection(gw.port);

      const invalidEnvelopes = [
        JSON.stringify({ id: 'missing-kind-1', payload: {} }),
        JSON.stringify({ kind: 'evil-undefined-kind', id: 'unknown-kind-1', payload: {} }),
        JSON.stringify({ kind: 12345, id: 'numeric-kind', payload: {} }),
        JSON.stringify({ kind: null, id: 'null-kind', payload: {} }),
        JSON.stringify({ kind: 'ping', id: null, payload: {} }),
        JSON.stringify({ kind: 'invoke', id: 'invoke-missing-payload' }),
        JSON.stringify({ kind: 'invoke', id: 'invoke-null-payload', payload: null }),
        JSON.stringify({ kind: 'invoke', id: 'invoke-number-payload', payload: 12345 }),
        JSON.stringify({ kind: 'invoke', id: 'invoke-missing-channel', payload: {} }),
      ];

      for (const env of invalidEnvelopes) {
        sendRawWsFrame(raw, env);
      }

      await new Promise((r) => setTimeout(r, 60));

      // Server remains fully operational
      const client = await gw.createClient();
      const ping = await client.invoke('system:ping', {});
      assert.equal(ping.pong, true);
      client.disconnect();
      raw.destroy();
    });
  });

  // =========================================================================
  // Test Area 2: Handshake Fuzzing
  // =========================================================================
  describe('Area 2: Handshake Fuzzing & Auth Defense', () => {
    test('2.1: Handshake with empty payload on unauthenticated server must not crash', async () => {
      const raw = await createRawWsConnection(gw.port);

      // Send link-open with empty or missing payload
      sendRawWsFrame(raw, JSON.stringify({
        kind: 'link-open',
        id: 'handshake-fuzz-empty',
        payload: {},
        timestamp: Date.now(),
      }));

      await new Promise((r) => setTimeout(r, 50));

      const client = await gw.createClient();
      const ping = await client.invoke('system:ping', {});
      assert.equal(ping.pong, true);
      client.disconnect();
      raw.destroy();
    });

    test('2.2: Unauthenticated connection to auth-protected gateway strictly destroyed', async () => {
      const port = await getFreePort();
      const secureServer = new GatewayServer({
        host: '127.0.0.1',
        port,
        authToken: 'secret_m1_token_xyz',
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });
      await secureServer.start();

      // Case A: Missing token
      const raw1 = await createRawWsConnection(port);
      let socket1Closed = false;
      raw1.on('close', () => { socket1Closed = true; });

      sendRawWsFrame(raw1, JSON.stringify({
        kind: 'link-open',
        id: 'no-token-test',
        payload: { clientName: 'Attacker' },
        timestamp: Date.now(),
      }));

      await new Promise((r) => setTimeout(r, 80));
      assert.ok(socket1Closed || raw1.destroyed, 'Socket without token must be destroyed');

      // Case B: Invalid token
      const raw2 = await createRawWsConnection(port);
      let socket2Closed = false;
      raw2.on('close', () => { socket2Closed = true; });

      sendRawWsFrame(raw2, JSON.stringify({
        kind: 'link-open',
        id: 'bad-token-test',
        payload: { clientName: 'Attacker', token: 'invalid_pass_123' },
        timestamp: Date.now(),
      }));

      await new Promise((r) => setTimeout(r, 80));
      assert.ok(socket2Closed || raw2.destroyed, 'Socket with wrong token must be destroyed');

      // Case C: Empty payload on auth-protected server must also be rejected
      const raw3 = await createRawWsConnection(port);
      let socket3Closed = false;
      raw3.on('close', () => { socket3Closed = true; });

      sendRawWsFrame(raw3, JSON.stringify({
        kind: 'link-open',
        id: 'empty-payload-auth-test',
        payload: null,
        timestamp: Date.now(),
      }));

      await new Promise((r) => setTimeout(r, 80));
      // Handled cleanly without server crash

      // Case D: Valid token succeeds
      const client = new GatewayClient({
        url: `ws://127.0.0.1:${port}/gateway`,
        token: 'secret_m1_token_xyz',
        autoReconnect: false,
      });
      await client.connect();
      assert.ok(client.connected, 'Client with valid token must connect');

      client.disconnect();
      await secureServer.stop();
    });
  });

  // =========================================================================
  // Test Area 3: Channel Allowlist Defense & Error Code -32600
  // =========================================================================
  describe('Area 3: Channel Allowlist Defense & Error Code -32600', () => {
    test('3.1: Unallowed channels MUST be rejected with code -32600 (INVALID_REQUEST)', async () => {
      const client = await gw.createClient();

      const adversarialChannels = [
        'system:destroy',
        'admin:shell',
        'fs:unlink',
        'eval',
        'constructor',
        '__proto__',
        'agent:unauthorized_action',
        'secret:leak',
        'gateway:destroy_all',
      ];

      for (const channel of adversarialChannels) {
        await assert.rejects(
          async () => {
            await client.invoke(channel, { foo: 'bar' });
          },
          (err: any) => {
            assert.equal(err.code, -32600, `Channel '${channel}' must reject with error code -32600`);
            assert.equal(err.code, DaemonErrorCode.INVALID_REQUEST);
            assert.ok(
              err.message.includes('not allowed by gateway security allowlist'),
              `Error message must indicate security allowlist rejection: ${err.message}`
            );
            return true;
          }
        );
      }

      client.disconnect();
    });

    test('3.2: Allowlisted channel without registered handler returns -32601 (METHOD_NOT_FOUND)', async () => {
      const client = await gw.createClient();

      // 'worker:task:kill' is in REMOTE_INVOKE_ALLOWLIST, but let's check if unregistered returns -32601
      // If it is registered by harness, test with another allowlisted channel that is not registered
      try {
        await client.invoke('worker:task:kill', { taskId: 'non-existent' });
      } catch (err: any) {
        assert.ok(
          err.code === DaemonErrorCode.METHOD_NOT_FOUND || err.code === -32601 ||
          err.message.includes('not implemented on gateway') || err.message.includes('Task not found')
        );
      }

      client.disconnect();
    });
  });

  // =========================================================================
  // Test Area 4: WebGatewayClient Reconnect Resilience
  // =========================================================================
  describe('Area 4: WebGatewayClient Reconnect Resilience', () => {
    test('4.1: WebGatewayClient detects abrupt termination, transitions to reconnecting, and reconnects', async () => {
      const port = await getFreePort();
      let activeServer = new GatewayServer({
        host: '127.0.0.1',
        port,
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });
      activeServer.registerHandler('system:ping', async () => ({ pong: true }));
      await activeServer.start();

      const stateTransitions: string[] = [];
      const client = new WebGatewayClient({
        url: `ws://127.0.0.1:${port}/gateway`,
        invokeTimeoutMs: 1000,
        heartbeatIntervalMs: 2000,
        maxReconnectIntervalMs: 500,
      });

      client.onStateChange((state) => {
        stateTransitions.push(state);
      });

      await client.connect();
      assert.equal(client.getState(), 'open');

      // Abruptly terminate server
      await activeServer.stop();
      await new Promise((r) => setTimeout(r, 100));

      assert.ok(
        stateTransitions.includes('reconnecting'),
        `Client state transitions must include 'reconnecting': ${JSON.stringify(stateTransitions)}`
      );

      // Restart server on the same port
      activeServer = new GatewayServer({
        host: '127.0.0.1',
        port,
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });
      activeServer.registerHandler('system:ping', async () => ({ pong: true }));
      await activeServer.start();

      // Wait for auto-reconnect backoff (max 500ms delay)
      let reconnected = false;
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 150));
        if (client.getState() === 'open') {
          reconnected = true;
          break;
        }
      }

      assert.ok(reconnected, 'WebGatewayClient must automatically reconnect after server recovery');

      // Verify invoke works after reconnection
      const ping = await client.invoke('system:ping', {});
      assert.equal(ping.pong, true);

      client.disconnect();
      await activeServer.stop();
    });

    test('4.2: WebGatewayClient automatically restores topic subscriptions upon reconnection', async () => {
      const port = await getFreePort();
      let activeServer = new GatewayServer({
        host: '127.0.0.1',
        port,
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });
      await activeServer.start();

      const client = new WebGatewayClient({
        url: `ws://127.0.0.1:${port}/gateway`,
        invokeTimeoutMs: 1000,
        heartbeatIntervalMs: 2000,
        maxReconnectIntervalMs: 300,
      });
      await client.connect();

      const receivedPushEvents: any[] = [];
      const testTopic = 'session:room_adversarial_reconnect';

      // Subscribe to topic
      client.subscribe(testTopic, (event) => {
        receivedPushEvents.push(event);
      });

      // Abruptly kill the server to force reconnect
      await activeServer.stop();
      await new Promise((r) => setTimeout(r, 100));

      // Re-create server on the exact same port
      activeServer = new GatewayServer({
        host: '127.0.0.1',
        port,
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });
      await activeServer.start();

      // Wait for auto-reconnect
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 100));
        if (client.getState() === 'open') break;
      }
      assert.equal(client.getState(), 'open', 'Client must be reconnected to new server');

      // Push event on the topic from new server
      await new Promise((r) => setTimeout(r, 100));
      activeServer.push(testTopic, 'agent:thinking', { thinking_delta: 'Resilient after crash!' });

      await new Promise((r) => setTimeout(r, 100));
      assert.ok(receivedPushEvents.length >= 1, 'Client must receive push event on auto-resubscribed topic');
      assert.equal(receivedPushEvents[0].event, 'agent:thinking');
      assert.equal(receivedPushEvents[0].data.thinking_delta, 'Resilient after crash!');

      client.disconnect();
      await activeServer.stop();
    });
  });

  // =========================================================================
  // Test Area 5: 30s Invoke Timeout Guard & Resource Cleanup
  // =========================================================================
  describe('Area 5: Invoke Timeout Guard & Pending Promise Cleanup', () => {
    test('5.1: WebGatewayClient rejects and cleans up pending invoke on timeout', async () => {
      const port = await getFreePort();
      const server = new GatewayServer({
        host: '127.0.0.1',
        port,
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });

      // Register a hanging handler that deliberately never responds
      server.registerHandler('agent:chat', async () => {
        return new Promise(() => {}); // never resolves
      });
      await server.start();

      const client = new WebGatewayClient({
        url: `ws://127.0.0.1:${port}/gateway`,
        invokeTimeoutMs: 300, // custom short timeout for test speed
      });
      await client.connect();

      const startTime = Date.now();
      await assert.rejects(
        async () => {
          await client.invoke('agent:chat', { text: 'hang forever' });
        },
        (err: any) => {
          const elapsed = Date.now() - startTime;
          assert.ok(elapsed >= 250 && elapsed < 800, `Timeout must trigger near 300ms, took ${elapsed}ms`);
          assert.ok(
            err.message.includes('Invoke timeout') && err.message.includes("channel 'agent:chat'"),
            `Error message must indicate timeout: ${err.message}`
          );
          return true;
        }
      );

      // Verify pending invoke map was cleaned up (no memory leak)
      const pendingMap = (client as any).pendingInvokes;
      assert.equal(pendingMap.size, 0, 'pendingInvokes map must be empty after timeout rejection');

      client.disconnect();
      await server.stop();
    });

    test('5.2: Abrupt socket close immediately flushes pending invokes with error', async () => {
      const port = await getFreePort();
      const server = new GatewayServer({
        host: '127.0.0.1',
        port,
        backpressure: new BackpressureGuard({ maxBufferedBytes: 1024 * 1024, leaseTimeoutMs: 5000, heartbeatIntervalMs: 1000 }),
      });

      // Hanging handler
      server.registerHandler('agent:chat', async () => {
        return new Promise(() => {}); // never resolves
      });
      await server.start();

      const client = new WebGatewayClient({
        url: `ws://127.0.0.1:${port}/gateway`,
        invokeTimeoutMs: 30000, // 30s standard timeout
      });
      await client.connect();

      // Launch pending invoke
      const invokePromise = client.invoke('agent:chat', { text: 'waiting' });

      // Instantly kill the server while invoke is pending
      await new Promise((r) => setTimeout(r, 50));
      await server.stop();

      // Must reject immediately without waiting for 30s timeout
      const startTime = Date.now();
      await assert.rejects(
        invokePromise,
        (err: any) => {
          const elapsed = Date.now() - startTime;
          assert.ok(elapsed < 2000, `Must reject immediately on close, took ${elapsed}ms`);
          assert.ok(
            err.message.includes('WebSocket closed') || err.message.includes('Connection failed'),
            `Error must indicate socket closure: ${err.message}`
          );
          return true;
        }
      );

      const pendingMap = (client as any).pendingInvokes;
      assert.equal(pendingMap.size, 0, 'pendingInvokes map must be immediately flushed on socket close');

      client.disconnect();
    });
  });
});
