import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { getSidecarHome } from "../registry/store.js";
import type { RuntimeType, WorkspaceProfile } from "../types.js";

const RuntimeTypeSchema = z.enum([
  "claude-code",
  "claude-desktop",
  "claude-desktop-3p",
  "codex",
  "openhands",
  "cursor",
  "gemini-cli",
]);

const WorkspaceProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  canonical_cwd: z.string().min(1),
  runtimes: z.array(RuntimeTypeSchema).optional(),
  session_ids: z.array(z.string().min(1)).optional(),
  plugins: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
  priority: z.number().int().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const WorkspacesConfigSchema = z.object({
  version: z.union([z.string(), z.number()]).optional(),
  workspaces: z.array(WorkspaceProfileSchema).default([]),
});

export interface RoutingKey {
  runtime: RuntimeType;
  session_id: string;
  canonical_cwd: string;
}

export const GLOBAL_WORKSPACE_CWD = "*";

export function isGlobalWorkspaceCwd(cwd: string): boolean {
  const trimmed = cwd.trim();
  return (
    trimmed === "*" ||
    trimmed === "/" ||
    trimmed.toLowerCase() === "global" ||
    trimmed === "全局"
  );
}

export function getDefaultWorkspacesConfigPath(customHome?: string): string {
  return path.join(getSidecarHome(customHome), "workspaces.yaml");
}

function normalizeCwd(cwd: string): string {
  const resolved = path.resolve(cwd);
  return resolved.endsWith(path.sep) && resolved.length > 1
    ? resolved.slice(0, -1)
    : resolved;
}

export function normalizeProfileCwd(cwd: string): string {
  return isGlobalWorkspaceCwd(cwd) ? GLOBAL_WORKSPACE_CWD : normalizeCwd(cwd);
}

export function loadWorkspacesConfig(configPath?: string): WorkspaceProfile[] {
  const targetPath = configPath ?? getDefaultWorkspacesConfigPath();
  if (!fs.existsSync(targetPath)) {
    return [];
  }
  const raw = fs.readFileSync(targetPath, "utf-8");
  if (!raw.trim()) {
    return [];
  }
  const parsed = parseYaml(raw);
  const validated = WorkspacesConfigSchema.parse(parsed);
  return validated.workspaces.map((ws) => ({
    ...ws,
    canonical_cwd: normalizeProfileCwd(ws.canonical_cwd),
  }));
}

interface MatchedWorkspaceCandidate {
  profile: WorkspaceProfile;
  score: number;
  cwdLen: number;
}

function collectMatchedWorkspaceCandidates(
  key: RoutingKey,
  profiles: WorkspaceProfile[],
): MatchedWorkspaceCandidate[] {
  const targetCwd = normalizeCwd(key.canonical_cwd);
  const candidates: MatchedWorkspaceCandidate[] = [];

  for (const profile of profiles) {
    if (!profile.enabled) continue;

    const isGlobal = isGlobalWorkspaceCwd(profile.canonical_cwd);
    const profileCwd = isGlobal ? GLOBAL_WORKSPACE_CWD : normalizeCwd(profile.canonical_cwd);
    const isExactCwd = !isGlobal && targetCwd === profileCwd;
    const isPrefixCwd =
      !isGlobal &&
      !isExactCwd &&
      targetCwd.startsWith(profileCwd + path.sep);

    if (!isGlobal && !isExactCwd && !isPrefixCwd) continue;

    if (profile.runtimes && profile.runtimes.length > 0) {
      if (!profile.runtimes.includes(key.runtime)) continue;
    }

    if (profile.session_ids && profile.session_ids.length > 0) {
      if (!profile.session_ids.includes(key.session_id)) continue;
    }

    let score = isExactCwd ? 2 : isPrefixCwd ? 1 : 0;
    if (profile.runtimes && profile.runtimes.length > 0) score += 2;
    if (profile.session_ids && profile.session_ids.length > 0) score += 4;

    candidates.push({
      profile,
      score,
      cwdLen: isGlobal ? 0 : profileCwd.length,
    });
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const prioA = a.profile.priority ?? 0;
    const prioB = b.profile.priority ?? 0;
    if (prioB !== prioA) return prioB - prioA;
    return b.cwdLen - a.cwdLen;
  });

  return candidates;
}

function dedupStringValues(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

/**
 * Resolve a 3D routing key (runtime, session_id, canonical_cwd) to the best
 * matching active WorkspaceProfile.
 *
 * Specificity scoring:
 * - canonical_cwd must match: exact match (+2), parent directory prefix (+1), or Global "*" (+0).
 * - If profile specifies `runtimes`, it must include `key.runtime` (+2).
 * - If profile specifies `session_ids`, it must include `key.session_id` (+4).
 * - Ties are broken by explicit `priority` (higher wins), then longer `canonical_cwd`.
 */
export function resolveWorkspaceProfile(
  key: RoutingKey,
  profiles: WorkspaceProfile[],
): WorkspaceProfile | undefined {
  const candidates = collectMatchedWorkspaceCandidates(key, profiles);
  return candidates[0]?.profile;
}

/**
 * Resolve all enabled matching WorkspaceProfiles from lowest specificity
 * (Global "*") to highest specificity (exact/session-specific), merging
 * inherited plugins, skills, mcp_servers, and env variables while letting
 * scalar fields take the highest-specificity profile's values.
 */
export function resolveEffectiveWorkspaceProfile(
  key: RoutingKey,
  profiles: WorkspaceProfile[],
): WorkspaceProfile | undefined {
  const candidatesDesc = collectMatchedWorkspaceCandidates(key, profiles);
  if (candidatesDesc.length === 0) return undefined;
  if (candidatesDesc.length === 1) return candidatesDesc[0].profile;

  const orderedAsc = [...candidatesDesc].reverse();
  const top = orderedAsc[orderedAsc.length - 1].profile;

  const plugins: string[] = [];
  const seenPlugins = new Set<string>();
  let env: Record<string, string> | undefined;
  let mergedMetadata: Record<string, unknown> | undefined;
  const skillValues: unknown[] = [];
  const mcpValues: unknown[] = [];
  let hasSkillsField = false;
  let hasMcpsField = false;

  for (const { profile } of orderedAsc) {
    for (const pluginId of profile.plugins ?? []) {
      const trimmed = pluginId.trim();
      if (trimmed && !seenPlugins.has(trimmed)) {
        seenPlugins.add(trimmed);
        plugins.push(trimmed);
      }
    }

    if (profile.env) {
      env = { ...(env ?? {}), ...profile.env };
    }

    if (profile.metadata) {
      mergedMetadata ??= {};
      for (const [metaKey, metaVal] of Object.entries(profile.metadata)) {
        if (metaKey === "skills") {
          if (Array.isArray(metaVal)) {
            hasSkillsField = true;
            skillValues.push(...metaVal);
          }
          continue;
        }
        if (metaKey === "mcp_servers") {
          if (Array.isArray(metaVal)) {
            hasMcpsField = true;
            mcpValues.push(...metaVal);
          }
          continue;
        }
        if (metaVal !== undefined) {
          mergedMetadata[metaKey] = metaVal;
        }
      }
    }
  }

  if (hasSkillsField) {
    mergedMetadata ??= {};
    mergedMetadata.skills = dedupStringValues(skillValues);
  }
  if (hasMcpsField) {
    mergedMetadata ??= {};
    mergedMetadata.mcp_servers = dedupStringValues(mcpValues);
  }

  return {
    ...top,
    plugins,
    ...(env ? { env } : {}),
    ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
  };
}
