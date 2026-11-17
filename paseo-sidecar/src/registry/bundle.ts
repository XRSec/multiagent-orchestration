import type { DiscoveredMcp, DiscoveredPlugin, DiscoveredSkill } from "./discover.js";
import type { RuntimeType } from "../types.js";

export interface UnifiedAssetBundle {
  canonicalId: string;
  kinds: Array<"skill" | "plugin" | "mcp">;
  platforms: Array<RuntimeType | "agents">;
  skills: DiscoveredSkill[];
  plugins: DiscoveredPlugin[];
  mcps: DiscoveredMcp[];
  allImported: boolean;
}

export function normalizeCapabilityId(rawId: string): string {
  const cleaned = rawId
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  // Collapse duplicated segment like "nowledge-mem-nowledge-mem" -> "nowledge-mem"
  const half = Math.floor(cleaned.length / 2);
  if (
    cleaned.length % 2 === 1 &&
    cleaned[half] === "-" &&
    cleaned.slice(0, half) === cleaned.slice(half + 1)
  ) {
    return cleaned.slice(0, half);
  }
  return cleaned;
}

export function aggregateDiscoveredBundles(discovered: {
  skills: DiscoveredSkill[];
  plugins: DiscoveredPlugin[];
  mcps: DiscoveredMcp[];
}): UnifiedAssetBundle[] {
  const map = new Map<string, UnifiedAssetBundle>();

  const getOrCreate = (rawId: string): UnifiedAssetBundle => {
    const canonicalId = normalizeCapabilityId(rawId);
    let entry = map.get(canonicalId);
    if (!entry) {
      entry = {
        canonicalId,
        kinds: [],
        platforms: [],
        skills: [],
        plugins: [],
        mcps: [],
        allImported: true,
      };
      map.set(canonicalId, entry);
    }
    return entry;
  };

  const addKind = (entry: UnifiedAssetBundle, kind: "skill" | "plugin" | "mcp") => {
    if (!entry.kinds.includes(kind)) entry.kinds.push(kind);
  };

  const addPlatform = (entry: UnifiedAssetBundle, platform: RuntimeType | "agents") => {
    if (!entry.platforms.includes(platform)) entry.platforms.push(platform);
  };

  for (const s of discovered.skills) {
    const b = getOrCreate(s.id);
    addKind(b, "skill");
    addPlatform(b, s.platform);
    b.skills.push(s);
    if (!s.alreadyImported) b.allImported = false;
  }

  for (const p of discovered.plugins) {
    const b = getOrCreate(p.id);
    addKind(b, "plugin");
    addPlatform(b, p.platform);
    b.plugins.push(p);
    if (!p.alreadyImported) b.allImported = false;
  }

  for (const m of discovered.mcps) {
    const b = getOrCreate(m.id);
    addKind(b, "mcp");
    addPlatform(b, m.platform);
    b.mcps.push(m);
    if (!m.alreadyImported) b.allImported = false;
  }

  return Array.from(map.values()).sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}
