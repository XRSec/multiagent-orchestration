/**
 * Purpose: Manage storage, retrieval, and persistence of decoupled MCP server (.json) files.
 * Context: Paseo bots plugin server runtime, decoupling library.mcpServers from bots.json.
 * Usage: import { readMcpServer, writeMcpServer, resolveMcpServersDir, listAllMcpServers } from "./mcp-servers";
 * Prerequisites: Node.js runtime with access to plugin settings storage.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LibraryMcpServerSchema, type LibraryMcpServer } from "../shared/bot";
import { resolveCurrentDir } from "./bot-home";

const currentDir = resolveCurrentDir(typeof import.meta !== "undefined" ? import.meta.url : undefined);

function assertValidMcpServerId(id: string): string {
  const trimmed = id.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`Invalid MCP server ID for path: "${id}"`);
  }
  return trimmed;
}

/**
 * Resolves the directory holding decoupled MCP server files (`mcp-servers/`).
 * Checks customDir override, environment overrides, Paseo plugin-settings, and local repository paths.
 */
export function resolveMcpServersDir(customDir?: string): string {
  if (customDir) return customDir;
  if (process.env.PASEO_BOTS_MCP_SERVERS_DIR) return process.env.PASEO_BOTS_MCP_SERVERS_DIR;
  if (process.env.PASEO_BOTS_SETTINGS_DIR) return join(process.env.PASEO_BOTS_SETTINGS_DIR, "mcp-servers");

  const paseoHome = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const defaultPath = join(paseoHome, "plugin-settings", "paseo-bots", "mcp-servers");
  if (process.env.PASEO_HOME || existsSync(defaultPath)) return defaultPath;

  const repoCandidate = resolve(currentDir, "../../paseo-bots-plugin-settings/mcp-servers");
  if (existsSync(repoCandidate)) return repoCandidate;

  const cwdParentCandidate = resolve(process.cwd(), "..", "paseo-bots-plugin-settings", "mcp-servers");
  if (existsSync(cwdParentCandidate)) return cwdParentCandidate;

  const cwdCandidate = resolve(process.cwd(), "paseo-bots-plugin-settings", "mcp-servers");
  if (existsSync(cwdCandidate)) return cwdCandidate;

  const repoCandidateParent = dirname(repoCandidate);
  if (existsSync(repoCandidateParent)) return repoCandidate;

  return defaultPath;
}

export function mcpServerPath(serverId: string, dir?: string): string {
  const validId = assertValidMcpServerId(serverId);
  return join(resolveMcpServersDir(dir), `${validId}.json`);
}

/**
 * Reads an MCP server configuration JSON file asynchronously.
 * Falls back to fallback (or null) if the file does not exist or is invalid.
 */
export async function readMcpServer(
  serverId: string,
  fallback?: LibraryMcpServer | null,
  dir?: string
): Promise<LibraryMcpServer | null> {
  const filePath = mcpServerPath(serverId, dir);
  try {
    const raw = await readFile(filePath, "utf8");
    return LibraryMcpServerSchema.parse(JSON.parse(raw));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback ?? null;
    }
    return fallback ?? null;
  }
}

/**
 * Reads an MCP server configuration JSON file synchronously.
 * Falls back to fallback (or null) if the file does not exist or is invalid.
 */
export function readMcpServerSync(
  serverId: string,
  fallback?: LibraryMcpServer | null,
  dir?: string
): LibraryMcpServer | null {
  const filePath = mcpServerPath(serverId, dir);
  try {
    const raw = readFileSync(filePath, "utf8");
    return LibraryMcpServerSchema.parse(JSON.parse(raw));
  } catch {
    return fallback ?? null;
  }
}

/**
 * Writes an MCP server configuration to a JSON file asynchronously.
 * Ensures the target directory exists and ends with a newline.
 */
export async function writeMcpServer(server: LibraryMcpServer, dir?: string): Promise<string> {
  const filePath = mcpServerPath(server.id, dir);
  await mkdir(dirname(filePath), { recursive: true });
  const content = JSON.stringify(server, null, 2) + "\n";
  await writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Writes an MCP server configuration to a JSON file synchronously.
 * Ensures the target directory exists and ends with a newline.
 */
export function writeMcpServerSync(server: LibraryMcpServer, dir?: string): string {
  const filePath = mcpServerPath(server.id, dir);
  mkdirSync(dirname(filePath), { recursive: true });
  const content = JSON.stringify(server, null, 2) + "\n";
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * Deletes an MCP server JSON file asynchronously using Node fs.rm.
 */
export async function deleteMcpServer(serverId: string, dir?: string): Promise<boolean> {
  const filePath = mcpServerPath(serverId, dir);
  try {
    await rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes an MCP server JSON file synchronously using Node fs.rmSync.
 */
export function deleteMcpServerSync(serverId: string, dir?: string): boolean {
  const filePath = mcpServerPath(serverId, dir);
  try {
    rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all decoupled MCP servers from the target directory asynchronously.
 */
export async function listAllMcpServers(dir?: string): Promise<LibraryMcpServer[]> {
  const targetDir = resolveMcpServersDir(dir);
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    const servers: LibraryMcpServer[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -5);
      const server = await readMcpServer(id, null, dir);
      if (server) servers.push(server);
    }
    return servers.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/**
 * Lists all decoupled MCP servers from the target directory synchronously.
 */
export function listAllMcpServersSync(dir?: string): LibraryMcpServer[] {
  const targetDir = resolveMcpServersDir(dir);
  try {
    const entries = readdirSync(targetDir, { withFileTypes: true });
    const servers: LibraryMcpServer[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const id = entry.name.slice(0, -5);
      const server = readMcpServerSync(id, null, dir);
      if (server) servers.push(server);
    }
    return servers.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}
