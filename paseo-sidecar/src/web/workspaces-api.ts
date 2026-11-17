import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { loadWorkspacesConfig, normalizeProfileCwd } from "../config/workspaces.js";
import type { UnifiedRegistry } from "../registry/store.js";
import type { WorkspaceProfile } from "../types.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += String(chunk);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function writeWorkspacesFile(filePath: string, workspaces: WorkspaceProfile[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, stringifyYaml({ workspaces }), "utf-8");
}

function normalizeProfile(input: Partial<WorkspaceProfile>): WorkspaceProfile | null {
  if (!input.id || !input.name || !input.canonical_cwd) {
    return null;
  }
  return {
    id: input.id,
    name: input.name,
    canonical_cwd: normalizeProfileCwd(input.canonical_cwd),
    runtimes: input.runtimes,
    session_ids: input.session_ids,
    plugins: Array.isArray(input.plugins) ? input.plugins : [],
    env: input.env,
    enabled: input.enabled ?? true,
    priority: input.priority,
    metadata: input.metadata,
  };
}

export async function handleWorkspacesApi(
  req: IncomingMessage,
  res: ServerResponse,
  registry: UnifiedRegistry,
): Promise<boolean> {
  const url = (req.url ?? "/").split("?")[0];
  const filePath = registry.paths.workspacesFile;

  if (req.method === "GET" && url === "/api/admin/workspaces") {
    const workspaces = loadWorkspacesConfig(filePath);
    sendJson(res, 200, { workspaces });
    return true;
  }

  if (req.method === "POST" && url === "/api/admin/workspaces") {
    let parsed: Partial<WorkspaceProfile>;
    try {
      const raw = await readBody(req);
      parsed = JSON.parse(raw) as Partial<WorkspaceProfile>;
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    const profile = normalizeProfile(parsed);
    if (!profile) {
      sendJson(res, 400, { error: "Missing required fields: id, name, canonical_cwd" });
      return true;
    }

    const workspaces = loadWorkspacesConfig(filePath);
    const idx = workspaces.findIndex((w) => w.id === profile.id || w.name === profile.name);
    if (idx >= 0) {
      workspaces[idx] = profile;
    } else {
      workspaces.push(profile);
    }

    writeWorkspacesFile(filePath, workspaces);
    sendJson(res, 200, { workspace: profile, workspaces });
    return true;
  }

  if (req.method === "DELETE" && url.startsWith("/api/admin/workspaces/")) {
    const id = decodeURIComponent(url.slice("/api/admin/workspaces/".length));
    if (!id) {
      sendJson(res, 400, { error: "Missing workspace id" });
      return true;
    }

    const workspaces = loadWorkspacesConfig(filePath);
    const next = workspaces.filter((w) => w.id !== id);
    if (next.length === workspaces.length) {
      sendJson(res, 404, { error: `Workspace '${id}' not found` });
      return true;
    }

    writeWorkspacesFile(filePath, next);
    sendJson(res, 200, { deleted: true, id, workspaces: next });
    return true;
  }

  return false;
}
