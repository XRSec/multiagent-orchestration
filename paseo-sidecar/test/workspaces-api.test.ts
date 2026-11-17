import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { loadWorkspacesConfig, resolveWorkspaceProfile } from "../src/config/workspaces.js";
import { UnifiedRegistry } from "../src/registry/store.js";
import { handleWorkspacesApi } from "../src/web/workspaces-api.js";

function createMockReq(method: string, url: string, body?: unknown): IncomingMessage {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const stream = Readable.from(payload ? [payload] : []);
  return Object.assign(stream, { method, url }) as unknown as IncomingMessage;
}

function createMockRes(): {
  res: ServerResponse;
  status: () => number;
  json: () => Record<string, unknown>;
} {
  let statusCode = 200;
  let rawBody = "";
  const res = {
    writeHead(code: number) {
      statusCode = code;
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
    json: () => JSON.parse(rawBody) as Record<string, unknown>,
  };
}

describe("handleWorkspacesApi", () => {
  let tmpDir: string;
  let registry: UnifiedRegistry;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sidecar-ws-api-"));
    registry = new UnifiedRegistry(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when workspaces.yaml does not exist", async () => {
    const req = createMockReq("GET", "/api/admin/workspaces");
    const mockRes = createMockRes();
    const handled = await handleWorkspacesApi(req, mockRes.res, registry);

    expect(handled).toBe(true);
    expect(mockRes.status()).toBe(200);
    expect(mockRes.json()).toEqual({ workspaces: [] });
  });

  it("creates, upserts, and deletes workspaces in workspaces.yaml", async () => {
    const post1 = createMockReq("POST", "/api/admin/workspaces", {
      id: "ws-1",
      name: "Project One",
      canonical_cwd: "/tmp/proj1",
      plugins: ["plugin-a"],
      enabled: true,
    });
    const res1 = createMockRes();
    expect(await handleWorkspacesApi(post1, res1.res, registry)).toBe(true);
    expect(res1.status()).toBe(200);
    expect((res1.json().workspaces as unknown[]).length).toBe(1);

    // Upsert by id
    const post2 = createMockReq("POST", "/api/admin/workspaces", {
      id: "ws-1",
      name: "Project One Updated",
      canonical_cwd: "/tmp/proj1-new",
      plugins: ["plugin-a", "plugin-b"],
      enabled: false,
    });
    const res2 = createMockRes();
    expect(await handleWorkspacesApi(post2, res2.res, registry)).toBe(true);
    expect(res2.status()).toBe(200);
    const listAfterUpsert = res2.json().workspaces as Array<{ id: string; name: string; enabled: boolean }>;
    expect(listAfterUpsert).toHaveLength(1);
    expect(listAfterUpsert[0]?.name).toBe("Project One Updated");
    expect(listAfterUpsert[0]?.enabled).toBe(false);

    // GET reflects persisted YAML
    const getReq = createMockReq("GET", "/api/admin/workspaces");
    const getRes = createMockRes();
    expect(await handleWorkspacesApi(getReq, getRes.res, registry)).toBe(true);
    expect((getRes.json().workspaces as unknown[]).length).toBe(1);

    // DELETE existing
    const delReq = createMockReq("DELETE", "/api/admin/workspaces/ws-1");
    const delRes = createMockRes();
    expect(await handleWorkspacesApi(delReq, delRes.res, registry)).toBe(true);
    expect(delRes.status()).toBe(200);
    expect(delRes.json().workspaces).toEqual([]);

    // DELETE non-existent returns 404
    const delMissing = createMockReq("DELETE", "/api/admin/workspaces/ws-missing");
    const delMissingRes = createMockRes();
    expect(await handleWorkspacesApi(delMissing, delMissingRes.res, registry)).toBe(true);
    expect(delMissingRes.status()).toBe(404);
  });

  it("returns false for unrelated routes", async () => {
    const req = createMockReq("GET", "/api/admin/overview");
    const mockRes = createMockRes();
    const handled = await handleWorkspacesApi(req, mockRes.res, registry);
    expect(handled).toBe(false);
  });

  it("normalizes global aliases ('/', 'global', '*') and resolves fallback with lower specificity", async () => {
    const postGlobal = createMockReq("POST", "/api/admin/workspaces", {
      id: "global-gemini",
      name: "Global Gemini",
      canonical_cwd: "/",
      runtimes: ["gemini-cli"],
      plugins: ["nowledge-mem-google-antigravity"],
    });
    const resGlobal = createMockRes();
    expect(await handleWorkspacesApi(postGlobal, resGlobal.res, registry)).toBe(true);
    expect(resGlobal.status()).toBe(200);

    const postProj = createMockReq("POST", "/api/admin/workspaces", {
      id: "proj-gemini",
      name: "Project Gemini",
      canonical_cwd: "/tmp/my-project",
      runtimes: ["gemini-cli"],
      plugins: ["custom-plugin"],
    });
    const resProj = createMockRes();
    expect(await handleWorkspacesApi(postProj, resProj.res, registry)).toBe(true);

    const loaded = loadWorkspacesConfig(registry.paths.workspacesFile);
    expect(loaded[0]?.canonical_cwd).toBe("*");

    const matchedGlobal = resolveWorkspaceProfile(
      { runtime: "gemini-cli", session_id: "s1", canonical_cwd: "/Users/mock/other-dir" },
      loaded,
    );
    expect(matchedGlobal?.id).toBe("global-gemini");

    const matchedProject = resolveWorkspaceProfile(
      { runtime: "gemini-cli", session_id: "s1", canonical_cwd: "/tmp/my-project/sub" },
      loaded,
    );
    expect(matchedProject?.id).toBe("proj-gemini");
  });
});
