/**
 * Purpose: Test harness and fixture utilities for E2E testing track.
 * Context: multiagent-orchestration E2E test suites (Tiers 1-4).
 * Usage: import { startTestGateway, cleanupTestDir } from './e2e-harness.ts';
 * Prerequisites: Node.js 22+, tsx runtime, /opt/xrsec/.env/rmfile.
 */

import * as net from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { GatewayServer } from '../../../src/daemon/gateway/GatewayServer';
import { GatewayClient } from '../../../src/daemon/gateway/GatewayClient';
import { BackpressureGuard } from '../../../src/daemon/transport/BackpressureGuard';
import { StorageManager } from '../../../src/storage/StorageManager';
import { RuntimeEnvironment } from '../../../src/storage/RuntimeEnvironment';
import { AgentOrchestrator } from '../../../src/daemon/orchestrator/AgentOrchestrator';

export const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Locate a free TCP port dynamically on 127.0.0.1.
 */
export async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

/**
 * Safe deletion using invariant /opt/xrsec/.env/rmfile.
 */
export async function safeRm(targetPath: string): Promise<void> {
  if (!fs.existsSync(targetPath)) return;
  return new Promise((resolve) => {
    execFile('/opt/xrsec/.env/rmfile', ['-rf', targetPath], (err) => {
      if (err) {
        // Fallback check if already removed
        if (!fs.existsSync(targetPath)) resolve();
        else resolve(); // Do not block test teardown
      } else {
        resolve();
      }
    });
  });
}

/**
 * Creates an isolated scratch directory inside sandboxes/.
 */
export function createTestDir(prefix: string): string {
  const dir = path.join(PROJECT_ROOT, 'sandboxes', `e2e-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export interface TestGatewayInstance {
  server: GatewayServer;
  port: number;
  url: string;
  storage: StorageManager;
  runtime: RuntimeEnvironment;
  orchestrator: AgentOrchestrator;
  testDir: string;
  createClient: (options?: { clientName?: string; clientType?: 'cli' | 'desktop' | 'mobile' | 'web'; token?: string }) => Promise<GatewayClient>;
  stop: () => Promise<void>;
}

/**
 * Spawns an isolated GatewayServer instance bound to a random ephemeral port.
 */
export async function startTestGateway(customOptions?: { authToken?: string; prefix?: string }): Promise<TestGatewayInstance> {
  const testDir = createTestDir(customOptions?.prefix || 'gw');
  const port = await getFreePort();
  const backpressure = new BackpressureGuard({
    maxBufferedBytes: 16 * 1024 * 1024,
    leaseTimeoutMs: 15000,
    heartbeatIntervalMs: 5000,
  });

  const storage = new StorageManager(testDir);
  const runtime = new RuntimeEnvironment(PROJECT_ROOT, storage);
  const orchestrator = new AgentOrchestrator({ storage, runtime });

  const server = new GatewayServer({
    host: '127.0.0.1',
    port,
    authToken: customOptions?.authToken,
    backpressure,
  });

  // Register baseline Cindy channels
  server.registerHandler('system:ping', async () => ({ pong: true, timestamp: Date.now() }));
  server.registerHandler('system:status', async () => ({
    pid: process.pid,
    activeConnections: server.getActiveClientsCount(),
    registeredBotsCount: storage.listBots().length,
  }));
  server.registerHandler('agent:list', async () => storage.listBots());
  server.registerHandler('agent:get', async (p: { botId: string }) => {
    const bot = storage.getBot(p?.botId);
    if (!bot) throw new Error(`Bot '${p?.botId}' not found`);
    return bot;
  });
  server.registerHandler('agent:speaker-status', async (p: { roomId: string }) => {
    return orchestrator.getSingleSpeakerStatus(p.roomId);
  });
  server.registerHandler('room:create', async (p: any) => storage.createRoom(p));
  server.registerHandler('room:get', async (p: { roomId: string }) => {
    const room = storage.getRoom(p.roomId);
    if (!room) throw new Error(`Room '${p.roomId}' not found`);
    const blackboard = storage.readBlackboard(p.roomId);
    return { room, blackboard };
  });

  await server.start();
  const actualPort = server.getPort();
  const url = `ws://127.0.0.1:${actualPort}/gateway`;

  const activeClients: GatewayClient[] = [];

  const createClient = async (opts?: { clientName?: string; clientType?: 'cli' | 'desktop' | 'mobile' | 'web'; token?: string }) => {
    const client = new GatewayClient({
      url,
      token: opts?.token ?? customOptions?.authToken,
      clientName: opts?.clientName || 'E2EClient',
      clientType: opts?.clientType || 'web',
      autoReconnect: false,
    });
    await client.connect();
    activeClients.push(client);
    return client;
  };

  const stop = async () => {
    for (const c of activeClients) {
      try { c.disconnect(); } catch {}
    }
    await server.stop();
    await safeRm(testDir);
  };

  return {
    server,
    port: actualPort,
    url,
    storage,
    runtime,
    orchestrator,
    testDir,
    createClient,
    stop,
  };
}

export function assert(condition: boolean, msg: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${msg}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, msg: string): void {
  if (actual !== expected) {
    throw new Error(`Assertion Failed: ${msg} [expected: ${JSON.stringify(expected)}, got: ${JSON.stringify(actual)}]`);
  }
}

export function assertIncludes(haystack: string, needle: string, msg: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(`Assertion Failed: ${msg} [needle "${needle}" not found in string of length ${haystack.length}]`);
  }
}
