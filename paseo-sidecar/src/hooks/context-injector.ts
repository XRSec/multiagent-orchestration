import fs from "node:fs";
import path from "node:path";
import type { SkillEntry, UnifiedRegistry } from "../registry/store.js";
import type { NormalizedPluginBundle, RuntimeType, WorkspaceProfile } from "../types.js";

export type SkillInjectionMode = "inline" | "manifest";

export const SIDECAR_SKILL_MANDATE =
  "[Sidecar Skill Mandate] The following checked skills are pre-injected in full. Apply them directly without calling sidecar_discover or sidecar_load_skill.";

export const NOWLEDGE_MEM_MANDATE =
  "[Nowledge-Mem Mandate] Use injected SessionStart memory context directly without redundant startup queries; run a single targeted nmem/memory search only when exact historical evidence is missing.";

const DELIVERY_MECHANISMS: Record<RuntimeType, string> = {
  "claude-code":
    "Claude Code SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP hub sidecar_load_skill fallback",
  "claude-desktop":
    "Claude Desktop SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP stdio hub sidecar_load_skill fallback",
  "claude-desktop-3p":
    "Claude Desktop 3P SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP stdio hub sidecar_load_skill fallback",
  codex:
    "Codex SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP hub sidecar_load_skill fallback",
  "gemini-cli":
    "Gemini CLI / Antigravity PreInvocation & SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP hub sidecar_load_skill fallback",
  cursor:
    "Cursor SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP hub sidecar_load_skill fallback",
  openhands:
    "OpenHands SessionStart hook stdoutJson (additionalContext + hookSpecificOutput); MCP hub sidecar_load_skill fallback",
};

export interface BuildWorkspaceSkillInjectionParams {
  registry: UnifiedRegistry;
  profile?: WorkspaceProfile;
  activePlugins: NormalizedPluginBundle[];
  runtime: RuntimeType;
  mode?: SkillInjectionMode;
  explicitSkills?: string[];
  alreadyInjectedContext?: string;
}

export interface WorkspaceSkillInjectionResult {
  injectedContext: string;
  injectedSkillIds: string[];
  mode: SkillInjectionMode;
  deliveryMechanism: string;
}

interface ResolvedSkillContent {
  id: string;
  name: string;
  description: string;
  skillMdPath: string;
  rawContent: string;
}

function stripScalarQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseSkillFrontmatter(
  content: string,
  fallbackId: string,
): { name: string; description: string } {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return { name: fallbackId, description: "" };
  }

  const endIdx = normalized.indexOf("\n---\n", 4);
  const altEndIdx = normalized.endsWith("\n---") ? normalized.length - 4 : -1;
  const closeIdx = endIdx !== -1 ? endIdx : altEndIdx;
  if (closeIdx === -1) {
    return { name: fallbackId, description: "" };
  }

  const lines = normalized.slice(4, closeIdx).split("\n");
  let name = fallbackId;
  let description = "";

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = /^([A-Za-z0-9_-]+):(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1];
    const rest = (match[2] ?? "").trim();
    if (key === "name") {
      const parsed = stripScalarQuotes(rest);
      if (parsed) name = parsed;
    } else if (key === "description") {
      if (rest === "|" || rest === "|-" || rest === ">" || rest === ">-") {
        const blockLines: string[] = [];
        while (i + 1 < lines.length && /^\s+/.test(lines[i + 1] ?? "")) {
          i += 1;
          blockLines.push((lines[i] ?? "").trim());
        }
        description = blockLines.filter(Boolean).join(" ");
      } else {
        description = stripScalarQuotes(rest);
      }
    }
  }

  return { name, description };
}

function isSafeSkillId(skillId: string): boolean {
  return (
    skillId.length > 0 &&
    !skillId.includes("..") &&
    !skillId.includes("/") &&
    !skillId.includes("\\")
  );
}

function isReadableFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveSkillContent(
  skillId: string,
  standaloneById: Map<string, SkillEntry>,
  standaloneByName: Map<string, SkillEntry>,
  activePlugins: NormalizedPluginBundle[],
): ResolvedSkillContent | null {
  if (!isSafeSkillId(skillId)) return null;

  const standalone = standaloneById.get(skillId) ?? standaloneByName.get(skillId);
  if (standalone && isReadableFile(standalone.skillMdPath)) {
    const rawContent = fs.readFileSync(standalone.skillMdPath, "utf-8");
    return {
      id: standalone.id,
      name: standalone.name,
      description: standalone.description,
      skillMdPath: standalone.skillMdPath,
      rawContent,
    };
  }

  for (const plugin of activePlugins) {
    const candidates = [
      path.join(plugin.root_dir, "skills", skillId, "SKILL.md"),
      path.join(plugin.root_dir, "skills", `${skillId}.md`),
    ];
    for (const candidatePath of candidates) {
      if (!isReadableFile(candidatePath)) continue;
      const rawContent = fs.readFileSync(candidatePath, "utf-8");
      const fm = parseSkillFrontmatter(rawContent, skillId);
      return {
        id: skillId,
        name: fm.name,
        description: fm.description,
        skillMdPath: candidatePath,
        rawContent,
      };
    }
  }

  return null;
}

function isNowledgeMemPlugin(plugin: NormalizedPluginBundle): boolean {
  const candidates: string[] = [plugin.plugin_id, plugin.name];
  const aliasIds = plugin.metadata?.alias_ids;
  if (Array.isArray(aliasIds)) {
    for (const alias of aliasIds) {
      if (typeof alias === "string") {
        candidates.push(alias);
      }
    }
  }
  return candidates.some((id) => id.toLowerCase().includes("nowledge-mem"));
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function getDeliveryMechanism(runtime: RuntimeType): string {
  return (
    DELIVERY_MECHANISMS[runtime] ??
    "SessionStart / PreInvocation hook additionalContext & hookSpecificOutput; MCP hub sidecar_load_skill fallback"
  );
}

/**
 * Builds workspace skill injection content (inline full SKILL.md or manifest index)
 * along with the Nowledge-Mem deduplication mandate when a nowledge-mem plugin is active.
 */
export function buildWorkspaceSkillInjection(
  params: BuildWorkspaceSkillInjectionParams,
): WorkspaceSkillInjectionResult {
  const rawSkills =
    params.explicitSkills !== undefined
      ? params.explicitSkills
      : Array.isArray(params.profile?.metadata?.skills)
        ? params.profile.metadata.skills
        : [];

  const requestedSkillIds: string[] = [];
  const seenSkills = new Set<string>();
  for (const item of rawSkills) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seenSkills.has(trimmed)) continue;
    seenSkills.add(trimmed);
    requestedSkillIds.push(trimmed);
  }

  const mode: SkillInjectionMode =
    params.mode ??
    (params.profile?.metadata?.skill_injection_mode === "manifest"
      ? "manifest"
      : "inline");

  const resolvedSkills: ResolvedSkillContent[] = [];
  if (requestedSkillIds.length > 0) {
    const standaloneSkills = params.registry.listStandaloneSkills();
    const standaloneById = new Map<string, SkillEntry>();
    const standaloneByName = new Map<string, SkillEntry>();
    for (const entry of standaloneSkills) {
      standaloneById.set(entry.id, entry);
      if (!standaloneByName.has(entry.name)) {
        standaloneByName.set(entry.name, entry);
      }
    }

    for (const skillId of requestedSkillIds) {
      const resolved = resolveSkillContent(
        skillId,
        standaloneById,
        standaloneByName,
        params.activePlugins,
      );
      if (resolved) {
        resolvedSkills.push(resolved);
      }
    }
  }

  const sections: string[] = [];
  if (resolvedSkills.length > 0) {
    if (mode === "inline") {
      const blocks = resolvedSkills.map(
        (skill) =>
          `<skill id="${escapeXmlAttr(skill.id)}" name="${escapeXmlAttr(skill.name)}" path="${escapeXmlAttr(skill.skillMdPath)}">\n${skill.rawContent.trim()}\n</skill>`,
      );
      sections.push(
        [
          '<injected_skills mode="inline">',
          SIDECAR_SKILL_MANDATE,
          "",
          ...blocks,
          "</injected_skills>",
        ].join("\n"),
      );
    } else {
      const lines = resolvedSkills.map(
        (skill) =>
          `- id: ${skill.id} | name: ${skill.name} | description: ${skill.description || "(none)"} | skillMdPath: ${skill.skillMdPath}`,
      );
      sections.push(
        [
          '<injected_skills mode="manifest">',
          "[Sidecar Skill Manifest] Checked workspace skills (load on demand via sidecar_load_skill or skillMdPath):",
          ...lines,
          "</injected_skills>",
        ].join("\n"),
      );
    }
  }

  const nowledgeMemActive = params.activePlugins.some(isNowledgeMemPlugin);
  const alreadyHasMandate = (params.alreadyInjectedContext ?? "").includes(
    "[Nowledge-Mem Mandate]",
  );
  if (nowledgeMemActive && !alreadyHasMandate) {
    sections.push(NOWLEDGE_MEM_MANDATE);
  }

  return {
    injectedContext: sections.join("\n\n"),
    injectedSkillIds: resolvedSkills.map((s) => s.id),
    mode,
    deliveryMechanism: getDeliveryMechanism(params.runtime),
  };
}
