import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UnifiedRegistry } from "../src/registry/store.js";
import { handleAdminRequest, renderAdminHtml } from "../src/web/admin.js";

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const stream = Readable.from(payload ? [payload] : []);
  return Object.assign(stream, { method, url }) as unknown as IncomingMessage;
}

function createMockRes(): {
  res: ServerResponse;
  status: () => number;
  headers: () => Record<string, string>;
  text: () => string;
  json: () => Record<string, unknown>;
} {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let rawBody = "";
  const res = {
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      if (hdrs) {
        Object.assign(headers, hdrs);
      }
      return res;
    },
    end(chunk?: string | Buffer) {
      if (chunk) {
        rawBody += String(chunk);
      }
      return res;
    },
  } as unknown as ServerResponse;

  return {
    res,
    status: () => statusCode,
    headers: () => headers,
    text: () => rawBody,
    json: () => JSON.parse(rawBody) as Record<string, unknown>,
  };
}

describe("Web Studio Admin UI & API", () => {
  let tmpDir: string;
  let registry: UnifiedRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidecar-admin-test-"));
    registry = new UnifiedRegistry(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("renderAdminHtml", () => {
    it("renders valid HTML with CDS tokens, all 5 tabs, and IME input guards", () => {
      const html = renderAdminHtml();
      expect(html).toContain("<!doctype html>");
      expect(html).toContain("SidecarMCP Studio");

      // Verify CDS design tokens
      expect(html).toContain("--cds-surface-0");
      expect(html).toContain("--cds-clay");
      expect(html).toContain("--cds-accent");
      expect(html).toContain("--ease-cds");

      // Verify all 5 tabs are present
      expect(html).toContain('data-tab="library"');
      expect(html).toContain('data-tab="discover"');
      expect(html).toContain('data-tab="workspaces"');
      expect(html).toContain('data-tab="hosts"');
      expect(html).toContain('data-tab="trash"');

      // Verify IME composition guards and search setup
      expect(html).toContain("compositionstart");
      expect(html).toContain("compositionend");
      expect(html).toContain("setupSearchInput");
      expect(html).toContain("isComposing");

      // Verify Single Plugin Convergence guidance
      expect(html).toContain("Single Plugin Convergence");

      // Verify Discover surfaces unconverged host copies even when allImported is true
      expect(html).toContain("isBundleConverged");
      expect(html).toContain("(b.mcps && b.mcps.length > 0)");
      expect(html).toContain("(showImported || !isBundleConverged(b))");
    });
  });

  describe("handleAdminRequest routes", () => {
    it("serves HTML at / and /admin and /admin/hosts", async () => {
      for (const path of ["/", "/admin", "/admin/hosts", "/admin/discover"]) {
        const req = createMockReq("GET", path);
        const mock = createMockRes();
        const handled = await handleAdminRequest(req, mock.res, registry);
        expect(handled).toBe(true);
        expect(mock.status()).toBe(200);
        expect(mock.headers()["Content-Type"]).toContain("text/html");
        expect(mock.text()).toContain("SidecarMCP Studio");
      }
    });

    it("serves overview API", async () => {
      const req = createMockReq("GET", "/api/admin/overview");
      const mock = createMockRes();
      const handled = await handleAdminRequest(req, mock.res, registry);
      expect(handled).toBe(true);
      expect(mock.status()).toBe(200);
      const json = mock.json();
      expect(json).toHaveProperty("paths");
      expect(json).toHaveProperty("skills");
      expect(json).toHaveProperty("plugins");
      expect(json).toHaveProperty("mcps");
    });

    it("serves discover API", async () => {
      const req = createMockReq("GET", "/api/admin/discover");
      const mock = createMockRes();
      const handled = await handleAdminRequest(req, mock.res, registry);
      expect(handled).toBe(true);
      expect(mock.status()).toBe(200);
      const json = mock.json();
      expect(json).toHaveProperty("bundles");
    });

    it("serves trash API", async () => {
      const req = createMockReq("GET", "/api/admin/trash");
      const mock = createMockRes();
      const handled = await handleAdminRequest(req, mock.res, registry);
      expect(handled).toBe(true);
      expect(mock.status()).toBe(200);
      const json = mock.json();
      expect(json).toHaveProperty("items");
    });

    it("serves trusted-dirs API", async () => {
      const req = createMockReq("GET", "/api/admin/trusted-dirs");
      const mock = createMockRes();
      const handled = await handleAdminRequest(req, mock.res, registry);
      expect(handled).toBe(true);
      expect(mock.status()).toBe(200);
      const json = mock.json();
      expect(json).toHaveProperty("directories");
    });

    it("serves hosts API", async () => {
      const req = createMockReq("GET", "/api/admin/hosts");
      const mock = createMockRes();
      const handled = await handleAdminRequest(req, mock.res, registry);
      expect(handled).toBe(true);
      expect(mock.status()).toBe(200);
      const json = mock.json();
      expect(json).toHaveProperty("hosts");
    });

    it("returns false for unhandled non-admin routes", async () => {
      const req = createMockReq("GET", "/unhandled/route");
      const mock = createMockRes();
      const handled = await handleAdminRequest(req, mock.res, registry);
      expect(handled).toBe(false);
    });
  });
});
