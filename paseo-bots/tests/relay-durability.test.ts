import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_RELAY_PORT,
  probeRelayHealth,
  Relay,
  resolvePreferredPort,
  resyncMcpArtifacts,
} from "../server/relay";
import { fakeHost, makeBot } from "./helpers";

describe("Relay Durability & First-Hop Resilience", () => {
  let tempDir: string | null = null;
  let activeRelay: Relay | null = null;
  let blockingServer: Server | null = null;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "relay-durability-test-"));
  });

  afterEach(async () => {
    if (activeRelay) {
      await activeRelay.stop();
      activeRelay = null;
    }
    if (blockingServer) {
      await new Promise<void>((resolve) => blockingServer!.close(() => resolve()));
      blockingServer = null;
    }
    if (tempDir) {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
      tempDir = null;
    }
    delete process.env.PASEO_BOTS_PORT;
  });

  describe("resolvePreferredPort", () => {
    it("defaults to 0 in Vitest to avoid test port collisions", () => {
      expect(resolvePreferredPort(54645)).toBe(0);
      expect(resolvePreferredPort(null)).toBe(0);
      expect(resolvePreferredPort(undefined)).toBe(0);
    });

    it("resolves DEFAULT_RELAY_PORT (54645) in production when savedPort is empty or invalid", () => {
      expect(resolvePreferredPort(null, { isTest: false })).toBe(DEFAULT_RELAY_PORT);
      expect(resolvePreferredPort(undefined, { isTest: false })).toBe(DEFAULT_RELAY_PORT);
      expect(resolvePreferredPort(0, { isTest: false })).toBe(DEFAULT_RELAY_PORT);
      expect(resolvePreferredPort(-1, { isTest: false })).toBe(DEFAULT_RELAY_PORT);
      expect(resolvePreferredPort(999999, { isTest: false })).toBe(DEFAULT_RELAY_PORT);
    });

    it("preserves valid savedPort in production", () => {
      expect(resolvePreferredPort(54645, { isTest: false })).toBe(54645);
      expect(resolvePreferredPort(55000, { isTest: false })).toBe(55000);
      expect(resolvePreferredPort(8080, { isTest: false })).toBe(8080);
    });

    it("respects PASEO_BOTS_PORT environment variable with highest precedence", () => {
      process.env.PASEO_BOTS_PORT = "57001";
      expect(resolvePreferredPort(54645, { isTest: true })).toBe(57001);
      expect(resolvePreferredPort(null, { isTest: false })).toBe(57001);
      delete process.env.PASEO_BOTS_PORT;
    });
  });

  describe("Health Check Endpoints & probeRelayHealth", () => {
    it("responds 200 on /health and /bots/health with relay state", async () => {
      const host = fakeHost([makeBot({ id: "bot-moadmin" })]);
      activeRelay = new Relay(host, []);
      const port = await activeRelay.start({ port: 0 });

      expect(activeRelay.isListening).toBe(true);
      expect(activeRelay.port).toBe(port);

      // Test GET /health
      const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
      expect(healthRes.status).toBe(200);
      const healthData = (await healthRes.json()) as { ok: boolean; status: string; port: number; pid: number };
      expect(healthData.ok).toBe(true);
      expect(healthData.status).toBe("healthy");
      expect(healthData.port).toBe(port);
      expect(healthData.pid).toBe(process.pid);

      // Test GET /bots/health
      const botsHealthRes = await fetch(`http://127.0.0.1:${port}/bots/health`);
      expect(botsHealthRes.status).toBe(200);
      const botsHealthData = (await botsHealthRes.json()) as { ok: boolean };
      expect(botsHealthData.ok).toBe(true);

      // Test HEAD /health
      const headRes = await fetch(`http://127.0.0.1:${port}/health`, { method: "HEAD" });
      expect(headRes.status).toBe(200);

      // Test unsupported method POST /health -> 405
      const postRes = await fetch(`http://127.0.0.1:${port}/health`, { method: "POST" });
      expect(postRes.status).toBe(405);
    });

    it("probeRelayHealth returns true for active relay and false for dead or invalid ports", async () => {
      const host = fakeHost([makeBot({ id: "bot-moadmin" })]);
      activeRelay = new Relay(host, []);
      const port = await activeRelay.start({ port: 0 });

      const isLive = await probeRelayHealth(port, 500);
      expect(isLive).toBe(true);

      // Unused port should fast-fail without hanging
      const deadPort = port === 65530 ? 65529 : port + 1;
      const isDead = await probeRelayHealth(deadPort, 200);
      expect(isDead).toBe(false);

      expect(await probeRelayHealth(0)).toBe(false);
      expect(await probeRelayHealth(-1)).toBe(false);
    });
  });

  describe("Clean Shutdown & Connection Drain", () => {
    it("stop() thoroughly drains connections and frees port for immediate rebind", async () => {
      const host = fakeHost([makeBot({ id: "bot-moadmin" })]);
      activeRelay = new Relay(host, []);
      const port = await activeRelay.start({ port: 0 });

      // Start a keep-alive request
      await fetch(`http://127.0.0.1:${port}/health`);

      // Cleanly stop
      await activeRelay.stop();
      expect(activeRelay.isListening).toBe(false);
      expect(activeRelay.port).toBeNull();

      // Immediately rebind a server on that exact port to ensure no EADDRINUSE
      const rebindServer = createServer((_req, res) => res.end("rebound"));
      await new Promise<void>((resolve, reject) => {
        rebindServer.once("error", reject);
        rebindServer.listen(port, "127.0.0.1", () => {
          rebindServer.off("error", reject);
          resolve();
        });
      });

      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(await res.text()).toBe("rebound");

      await new Promise<void>((resolve) => rebindServer.close(() => resolve()));
    });
  });

  describe("EADDRINUSE Retry & Port Recovery", () => {
    it("retries when port is temporarily occupied and successfully binds once released", async () => {
      // Find an ephemeral port first
      const probe = createServer();
      const port = await new Promise<number>((resolve) => {
        probe.listen(0, "127.0.0.1", () => {
          const p = (probe.address() as { port: number }).port;
          probe.close(() => resolve(p));
        });
      });

      // Now block that port with blockingServer
      blockingServer = createServer((_req, res) => res.end("blocked"));
      await new Promise<void>((resolve) => blockingServer!.listen(port, "127.0.0.1", resolve));

      // After 50ms, release the blocking server
      setTimeout(() => {
        if (blockingServer) {
          blockingServer.close();
          blockingServer = null;
        }
      }, 50);

      const host = fakeHost([makeBot({ id: "bot-moadmin" })]);
      activeRelay = new Relay(host, []);

      // Relay will retry with 50ms interval up to 5 times
      const boundPort = await activeRelay.start({ port, maxRetries: 4, retryDelayMs: 40 });
      expect(boundPort).toBe(port);
      expect(activeRelay.port).toBe(port);
    });

    it("falls back to ephemeral port 0 if target port remains blocked after retries", async () => {
      // Permanently block an ephemeral port
      blockingServer = createServer((_req, res) => res.end("blocked"));
      const blockedPort = await new Promise<number>((resolve) => {
        blockingServer!.listen(0, "127.0.0.1", () => {
          resolve((blockingServer!.address() as { port: number }).port);
        });
      });

      const host = fakeHost([makeBot({ id: "bot-moadmin" })]);
      activeRelay = new Relay(host, []);

      // Retry 1 time only with 10ms delay, then should fallback to 0
      const actualPort = await activeRelay.start({ port: blockedPort, maxRetries: 1, retryDelayMs: 10 });
      expect(actualPort).toBeGreaterThan(0);
      expect(actualPort).not.toBe(blockedPort);
      expect(activeRelay.port).toBe(actualPort);
    });
  });

  describe("resyncMcpArtifacts", () => {
    it("scans and rewrites loopback ports in *.mcp.json files", async () => {
      const runsDir = join(tempDir!, "runs");
      await mkdir(runsDir, { recursive: true });

      const file1 = join(runsDir, "bot-moadmin.mcp.json");
      const file2 = join(tempDir!, ".mcp.json");
      const unrelated = join(tempDir!, "config.json");

      const content1 = JSON.stringify({
        mcpServers: {
          bots: {
            type: "http",
            url: "http://127.0.0.1:54645/bots/bot-moadmin/agent-123",
          },
        },
      });

      const content2 = JSON.stringify({
        mcpServers: {
          apps: {
            type: "http",
            url: "http://localhost:54645/mcp/bot-moadmin",
          },
        },
      });

      const content3 = JSON.stringify({
        other: "http://127.0.0.1:54645/other",
      });

      await writeFile(file1, content1, "utf8");
      await writeFile(file2, content2, "utf8");
      await writeFile(unrelated, content3, "utf8");

      const updated = await resyncMcpArtifacts(54645, 59999, tempDir!);
      expect(updated).toBe(2);

      const newContent1 = await readFile(file1, "utf8");
      expect(newContent1).toContain("127.0.0.1:59999");
      expect(newContent1).not.toContain("54645");

      const newContent2 = await readFile(file2, "utf8");
      expect(newContent2).toContain("localhost:59999");
      expect(newContent2).not.toContain("54645");

      // Unrelated json file without .mcp.json extension should not be touched
      const newContent3 = await readFile(unrelated, "utf8");
      expect(newContent3).toBe(content3);
    });

    it("returns 0 when oldPort equals newPort or ports are invalid", async () => {
      expect(await resyncMcpArtifacts(54645, 54645, tempDir!)).toBe(0);
      expect(await resyncMcpArtifacts(0, 54645, tempDir!)).toBe(0);
      expect(await resyncMcpArtifacts(54645, -1, tempDir!)).toBe(0);
    });
  });
});
