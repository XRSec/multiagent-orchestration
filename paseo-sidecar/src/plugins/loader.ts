/**
 * Purpose: Universal Plugin Manifest Adapter loading hooks, skills, and MCP server configs.
 * Context: Normalizes plugin bundles across Claude, AGY, Codex, and Agent Plugin formats.
 * Usage: loadPluginBundle(rootDir), loadPluginsFromDirectory(pluginsRoot).
 * Prerequisites: Node fs/promises, path.
 * Justification: Multi-runtime manifest, hook, skill, and MCP server normalization under 800 lines.
 */
import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  NormalizedPluginBundle,
  RuntimeType,
  SubHookDescriptor,
} from "../types.js";

export interface RawHookEntry {
  matcher?: string;
  hooks?: Array<{
    type?: string;
    command?: string;
    url?: string;
    timeout?: number;
    timeout_ms?: number;
    priority?: number;
    enabled?: boolean;
  }>;
  type?: string;
  command?: string;
  url?: string;
  timeout?: number;
  timeout_ms?: number;
  priority?: number;
  enabled?: boolean;
}

export interface RawPluginManifest {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  skills?: string[];
  mcpServers?: Record<string, unknown>;
  mcp_servers?: Record<string, unknown>;
  hooks?: Record<string, RawHookEntry[] | RawHookEntry>;
  [key: string]: unknown;
}

interface RawMcpConfig {
  mcpServers?: Record<string, unknown>;
  mcp_servers?: Record<string, unknown>;
}

const SEMVER_RE = /^v?(\d+(?:\.\d+)*)(?:-([0-9A-Za-z.-]+))?$/;

async function readJsonIfExists<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function isDirectoryEntry(
  fullPath: string,
  entry: Dirent,
): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (entry.isSymbolicLink()) {
    try {
      const st = await fs.stat(fullPath);
      return st.isDirectory();
    } catch {
      return false;
    }
  }
  return false;
}

async function isFileEntry(fullPath: string, entry: Dirent): Promise<boolean> {
  if (entry.isFile()) return true;
  if (entry.isSymbolicLink()) {
    try {
      const st = await fs.stat(fullPath);
      return st.isFile();
    } catch {
      return false;
    }
  }
  return false;
}

async function discoverSkillsDir(rootDir: string): Promise<string[]> {
  const skillsDir = path.join(rootDir, "skills");
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = path.join(skillsDir, entry.name);
      if (await isDirectoryEntry(entryPath, entry)) {
        const skillMd = path.join(entryPath, "SKILL.md");
        try {
          await fs.access(skillMd);
          skills.push(entry.name);
        } catch {
          // ignore directories without SKILL.md
        }
      } else if (
        entry.name.endsWith(".md") &&
        (await isFileEntry(entryPath, entry))
      ) {
        skills.push(entry.name.replace(/\.md$/, ""));
      }
    }
    return skills;
  } catch {
    return [];
  }
}

function isRawHookEntry(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.command === "string" ||
    typeof obj.url === "string" ||
    Array.isArray(obj.hooks)
  );
}

function appendHookEntries(
  target: Record<string, RawHookEntry[]>,
  eventName: string,
  entryOrList: unknown,
): void {
  if (!entryOrList || typeof entryOrList !== "object") return;
  const list = Array.isArray(entryOrList) ? entryOrList : [entryOrList];
  const valid = list.filter(
    (item): item is RawHookEntry =>
      Boolean(item && typeof item === "object" && !Array.isArray(item)),
  );
  if (valid.length === 0) return;
  target[eventName] = [...(target[eventName] ?? []), ...valid];
}

function extractHooksMap(rawJson: unknown): Record<string, RawHookEntry[]> {
  const result: Record<string, RawHookEntry[]> = {};
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return result;
  }

  const top = rawJson as Record<string, unknown>;
  if (top.enabled === false) {
    return result;
  }

  if (top.hooks && typeof top.hooks === "object" && !Array.isArray(top.hooks)) {
    for (const [eventName, entryOrList] of Object.entries(
      top.hooks as Record<string, unknown>,
    )) {
      appendHookEntries(result, eventName, entryOrList);
    }
    return result;
  }

  for (const [key, val] of Object.entries(top)) {
    if (
      key === "description" ||
      key === "enabled" ||
      key === "$schema" ||
      key === "version"
    ) {
      continue;
    }
    if (Array.isArray(val)) {
      appendHookEntries(result, key, val);
      continue;
    }
    if (!val || typeof val !== "object") {
      continue;
    }

    const rec = val as Record<string, unknown>;
    if (isRawHookEntry(rec)) {
      appendHookEntries(result, key, rec);
      continue;
    }

    // Namespaced wrapper object, e.g. { "rtk-rewrite": { "enabled": true, "PreToolUse": [...] } }
    if (rec.enabled === false) {
      continue;
    }
    for (const [nestedKey, nestedVal] of Object.entries(rec)) {
      if (
        nestedKey === "enabled" ||
        nestedKey === "description" ||
        nestedKey === "$schema"
      ) {
        continue;
      }
      appendHookEntries(result, nestedKey, nestedVal);
    }
  }

  return result;
}

function mergeHookMaps(
  ...maps: Array<Record<string, RawHookEntry[] | RawHookEntry> | undefined>
): Record<string, RawHookEntry[]> {
  const merged: Record<string, RawHookEntry[]> = {};
  for (const map of maps) {
    if (!map) continue;
    for (const [eventName, entryOrList] of Object.entries(map)) {
      appendHookEntries(merged, eventName, entryOrList);
    }
  }
  return merged;
}

function normalizeHooksMap(
  pluginId: string,
  rawHooks: Record<string, RawHookEntry[] | RawHookEntry> | undefined,
): SubHookDescriptor[] {
  if (!rawHooks || typeof rawHooks !== "object") {
    return [];
  }

  const descriptors: SubHookDescriptor[] = [];
  let index = 0;

  for (const [eventName, entryOrList] of Object.entries(rawHooks)) {
    const entries = Array.isArray(entryOrList) ? entryOrList : [entryOrList];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") continue;

      if (Array.isArray(entry.hooks)) {
        for (const sub of entry.hooks) {
          index += 1;
          const handlerType =
            sub.type === "http" || sub.type === "mcp" || sub.type === "inline"
              ? sub.type
              : "command";
          descriptors.push({
            id: `${pluginId}:${eventName}:${index}`,
            plugin_id: pluginId,
            event_name: eventName,
            matcher: entry.matcher,
            command: sub.command ?? sub.url,
            handler_type: handlerType,
            timeout_ms:
              sub.timeout_ms ??
              (typeof sub.timeout === "number"
                ? sub.timeout * 1000
                : undefined),
            priority: sub.priority ?? 50,
            enabled: sub.enabled ?? entry.enabled ?? true,
          });
        }
      } else if (entry.command || entry.url) {
        index += 1;
        const handlerType =
          entry.type === "http" ||
          entry.type === "mcp" ||
          entry.type === "inline"
            ? entry.type
            : "command";
        descriptors.push({
          id: `${pluginId}:${eventName}:${index}`,
          plugin_id: pluginId,
          event_name: eventName,
          matcher: entry.matcher,
          command: entry.command ?? entry.url,
          handler_type: handlerType,
          timeout_ms:
            entry.timeout_ms ??
            (typeof entry.timeout === "number"
              ? entry.timeout * 1000
              : undefined),
          priority: entry.priority ?? 50,
          enabled: entry.enabled ?? true,
        });
      }
    }
  }

  return descriptors;
}

function stripPlatformPrefix(id: string): string {
  const idx = id.indexOf("--");
  return idx > 0 ? id.slice(idx + 2) : id;
}

function compareVersionsDesc(a: string, b: string): number {
  const ma = SEMVER_RE.exec(a);
  const mb = SEMVER_RE.exec(b);

  if (ma && !mb) return -1;
  if (!ma && mb) return 1;

  if (ma && mb) {
    const pa = ma[1].split(".").map((n) => Number(n));
    const pb = mb[1].split(".").map((n) => Number(n));
    const maxLen = Math.max(pa.length, pb.length);
    for (let i = 0; i < maxLen; i += 1) {
      const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
      if (diff !== 0) return diff;
    }

    const preA = ma[2];
    const preB = mb[2];
    if (!preA && preB) return -1;
    if (preA && !preB) return 1;
    if (preA && preB) {
      return preB.localeCompare(preA, undefined, { numeric: true });
    }
  }

  return b.localeCompare(a, undefined, { numeric: true });
}

function attachAliasIds(
  bundle: NormalizedPluginBundle,
  wrapperDirName: string,
): NormalizedPluginBundle {
  const existingAliases = Array.isArray(bundle.metadata?.alias_ids)
    ? (bundle.metadata.alias_ids as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0,
      )
    : [];

  const aliasIds = Array.from(
    new Set(
      [
        ...existingAliases,
        wrapperDirName,
        stripPlatformPrefix(wrapperDirName),
        bundle.plugin_id,
        stripPlatformPrefix(bundle.plugin_id),
        bundle.name,
        stripPlatformPrefix(bundle.name),
      ].filter((x): x is string => typeof x === "string" && x.trim().length > 0),
    ),
  );

  return {
    ...bundle,
    metadata: {
      ...(bundle.metadata ?? {}),
      alias_ids: aliasIds,
    },
  };
}

function substitutePluginVariables(str: string, rootDir: string): string {
  return str
    .replaceAll("${CLAUDE_PLUGIN_ROOT}", rootDir)
    .replaceAll("$CLAUDE_PLUGIN_ROOT", rootDir)
    .replaceAll("${extensionPath}", rootDir)
    .replaceAll("$extensionPath", rootDir)
    .replaceAll("${pluginDir}", rootDir)
    .replaceAll("$pluginDir", rootDir);
}

function normalizeServerConfig(
  rawCfg: unknown,
  rootDir: string,
): Record<string, unknown> | null {
  if (!rawCfg || typeof rawCfg !== "object" || Array.isArray(rawCfg)) {
    return null;
  }
  const cfg = { ...(rawCfg as Record<string, unknown>) };

  if (typeof cfg.command === "string") {
    cfg.command = substitutePluginVariables(cfg.command, rootDir);
  }

  if (typeof cfg.serverUrl === "string") {
    cfg.serverUrl = substitutePluginVariables(cfg.serverUrl, rootDir);
  }

  if (typeof cfg.url === "string") {
    cfg.url = substitutePluginVariables(cfg.url, rootDir);
  }

  if (Array.isArray(cfg.args)) {
    cfg.args = cfg.args.map((arg) =>
      typeof arg === "string" ? substitutePluginVariables(arg, rootDir) : arg,
    );
  }

  if (cfg.env && typeof cfg.env === "object" && !Array.isArray(cfg.env)) {
    const nextEnv: Record<string, string> = {};
    for (const [k, v] of Object.entries(cfg.env as Record<string, unknown>)) {
      if (typeof v === "string") {
        nextEnv[k] = substitutePluginVariables(v, rootDir);
      } else if (v !== undefined && v !== null) {
        nextEnv[k] = String(v);
      }
    }
    cfg.env = nextEnv;
  }

  if (typeof cfg.cwd === "string") {
    cfg.cwd = substitutePluginVariables(cfg.cwd, rootDir);
  }

  return cfg;
}

const RESERVED_MCP_KEYS = new Set([
  "$schema",
  "version",
  "description",
  "name",
  "id",
  "enabled",
  "skills",
  "hooks",
]);

function extractMcpServersMap(
  rawJson: unknown,
  rootDir: string,
): Record<string, Record<string, unknown>> {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return {};
  }
  const top = rawJson as Record<string, unknown>;
  const serversRaw =
    (top.mcpServers as Record<string, unknown> | undefined) ??
    (top.mcp_servers as Record<string, unknown> | undefined);

  const result: Record<string, Record<string, unknown>> = {};

  if (serversRaw && typeof serversRaw === "object" && !Array.isArray(serversRaw)) {
    for (const [name, cfg] of Object.entries(serversRaw)) {
      const normalized = normalizeServerConfig(cfg, rootDir);
      if (normalized) result[name] = normalized;
    }
    return result;
  }

  for (const [name, cfg] of Object.entries(top)) {
    if (RESERVED_MCP_KEYS.has(name)) continue;
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) continue;
    const rec = cfg as Record<string, unknown>;
    const isServer =
      typeof rec.command === "string" ||
      typeof rec.url === "string" ||
      typeof rec.serverUrl === "string" ||
      rec.type === "http" ||
      rec.type === "stdio" ||
      rec.type === "sse" ||
      Array.isArray(rec.args);
    if (isServer) {
      const normalized = normalizeServerConfig(rec, rootDir);
      if (normalized) result[name] = normalized;
    }
  }

  return result;
}

/**
 * Universal Plugin Manifest Adapter.
 * Supports:
 * - .claude-plugin/plugin.json
 * - Agent Plugins 1.0.0 plugin.json
 * - .codex-plugin/plugin.json
 * - hooks/hooks.json & root hooks.json (including namespaced wrapper objects)
 * - root mcp_config.json & .mcp.json
 */
export async function loadPluginBundle(
  rootDir: string,
): Promise<NormalizedPluginBundle | null> {
  const resolvedRoot = path.resolve(rootDir);

  const [
    claudeManifest,
    codexManifest,
    agentManifest,
    nestedHooksRaw,
    rootHooksRaw,
    mcpConfig,
    dotMcpConfig,
    pluginDotMcpConfig,
  ] = await Promise.all([
    readJsonIfExists<RawPluginManifest>(
      path.join(resolvedRoot, ".claude-plugin", "plugin.json"),
    ),
    readJsonIfExists<RawPluginManifest>(
      path.join(resolvedRoot, ".codex-plugin", "plugin.json"),
    ),
    readJsonIfExists<RawPluginManifest>(
      path.join(resolvedRoot, "plugin.json"),
    ),
    readJsonIfExists<unknown>(path.join(resolvedRoot, "hooks", "hooks.json")),
    readJsonIfExists<unknown>(path.join(resolvedRoot, "hooks.json")),
    readJsonIfExists<unknown>(path.join(resolvedRoot, "mcp_config.json")),
    readJsonIfExists<unknown>(path.join(resolvedRoot, ".mcp.json")),
    readJsonIfExists<unknown>(
      path.join(resolvedRoot, ".claude-plugin", ".mcp.json"),
    ),
  ]);

  const manifest = claudeManifest ?? codexManifest ?? agentManifest;
  if (
    !manifest &&
    !nestedHooksRaw &&
    !rootHooksRaw &&
    !mcpConfig &&
    !dotMcpConfig &&
    !pluginDotMcpConfig
  ) {
    return null;
  }

  let sourceRuntime: RuntimeType | "native" = "native";
  if (claudeManifest || dotMcpConfig || pluginDotMcpConfig) {
    sourceRuntime = "claude-code";
  } else if (codexManifest) {
    sourceRuntime = "codex";
  }

  const dirName = path.basename(resolvedRoot);
  const pluginId = manifest?.id ?? manifest?.name ?? dirName;
  const name = manifest?.name ?? pluginId;
  const version = manifest?.version ?? "1.0.0";

  const mergedRawHooks = mergeHookMaps(
    manifest?.hooks,
    extractHooksMap(nestedHooksRaw),
    extractHooksMap(rootHooksRaw),
  );

  const hooks = normalizeHooksMap(pluginId, mergedRawHooks);
  const discoveredSkills = await discoverSkillsDir(resolvedRoot);
  const skills = Array.from(
    new Set([...(manifest?.skills ?? []), ...discoveredSkills]),
  );

  const mergedMcpServers: Record<string, unknown> = {
    ...extractMcpServersMap(manifest?.mcp_servers, resolvedRoot),
    ...extractMcpServersMap(manifest?.mcpServers, resolvedRoot),
    ...extractMcpServersMap(mcpConfig, resolvedRoot),
    ...extractMcpServersMap(dotMcpConfig, resolvedRoot),
    ...extractMcpServersMap(pluginDotMcpConfig, resolvedRoot),
  };
  const mcpServers =
    Object.keys(mergedMcpServers).length > 0 ? mergedMcpServers : undefined;

  return {
    plugin_id: pluginId,
    name,
    version,
    source_runtime: sourceRuntime,
    root_dir: resolvedRoot,
    hooks,
    skills: skills.length > 0 ? skills : undefined,
    mcp_servers: mcpServers,
    metadata: manifest?.description
      ? { description: manifest.description }
      : undefined,
  };
}

export async function loadPluginsFromDirectory(
  pluginsRoot: string,
): Promise<NormalizedPluginBundle[]> {
  const bundles: NormalizedPluginBundle[] = [];
  try {
    const entries = await fs.readdir(pluginsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const entryPath = path.join(pluginsRoot, entry.name);
      if (!(await isDirectoryEntry(entryPath, entry))) continue;

      const directBundle = await loadPluginBundle(entryPath);
      if (directBundle) {
        bundles.push(attachAliasIds(directBundle, entry.name));
        continue;
      }

      // Inspect version subdirectories (e.g., 0.7.36, 1.0.0) and load highest valid version
      try {
        const subEntries = await fs.readdir(entryPath, { withFileTypes: true });
        const versionDirs: string[] = [];
        for (const sub of subEntries) {
          if (sub.name.startsWith(".")) continue;
          const subPath = path.join(entryPath, sub.name);
          if (await isDirectoryEntry(subPath, sub)) {
            versionDirs.push(sub.name);
          }
        }
        versionDirs.sort(compareVersionsDesc);
        for (const ver of versionDirs) {
          const versionBundle = await loadPluginBundle(
            path.join(entryPath, ver),
          );
          if (versionBundle) {
            bundles.push(attachAliasIds(versionBundle, entry.name));
            break;
          }
        }
      } catch {
        // ignore unreadable wrapper subdirectories
      }
    }
  } catch {
    // directory may not exist yet
  }
  return bundles;
}
