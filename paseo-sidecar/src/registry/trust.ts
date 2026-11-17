import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { RuntimeType } from "../types.js";

export interface TrustedProjectEntry {
  path: string;
  platform: RuntimeType;
  trusted: boolean;
}

export function discoverTrustedDirectories(customHomeDir?: string): TrustedProjectEntry[] {
  const home = customHomeDir ?? homedir();
  const seen = new Map<string, TrustedProjectEntry>();

  // 1. Parse ~/.claude.json projects map
  const claudeJson = join(home, ".claude.json");
  if (existsSync(claudeJson)) {
    try {
      const parsed = JSON.parse(readFileSync(claudeJson, "utf8")) as {
        projects?: Record<string, { hasTrustDialogAccepted?: boolean }>;
      };
      if (parsed.projects) {
        for (const [dirPath, cfg] of Object.entries(parsed.projects)) {
          if (cfg?.hasTrustDialogAccepted !== false && existsSync(dirPath)) {
            seen.set(dirPath, { path: dirPath, platform: "claude-code", trusted: true });
          }
        }
      }
    } catch {
      // ignore malformed json
    }
  }

  // 2. Parse ~/.gemini/antigravity-cli trusted workspaces (if present)
  const agyTrustFiles = [
    join(home, ".gemini", "antigravity-cli", "trusted_workspaces.json"),
    join(home, ".gemini", "antigravity-cli", "settings.json"),
  ];
  for (const file of agyTrustFiles) {
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as {
        trustedWorkspaces?: string[];
        trustedFolders?: string[];
        projects?: Record<string, unknown>;
      };
      const candidates = [
        ...(parsed.trustedWorkspaces ?? []),
        ...(parsed.trustedFolders ?? []),
        ...Object.keys(parsed.projects ?? {}),
      ];
      for (const dirPath of candidates) {
        if (typeof dirPath === "string" && existsSync(dirPath) && !seen.has(dirPath)) {
          seen.set(dirPath, { path: dirPath, platform: "gemini-cli", trusted: true });
        }
      }
    } catch {
      // ignore malformed json
    }
  }

  return Array.from(seen.values()).sort((a, b) => a.path.localeCompare(b.path));
}
