#!/usr/bin/env node
// Purpose: Verify paseo-bots symlinks/junctions (settings and plugin-data) against Paseo home.
// Context: Invoked by .githooks/post-merge and .githooks/post-rewrite after git pull.
// Usage: node scripts/check-paseo-bots-link.mjs [--repo-root <dir>] [--paseo-home <dir>] [--strict]
// Prerequisites: Node.js >= 18, no interactive TTY required.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const LINK_MAPPINGS = [
  {
    id: "plugin-settings",
    label: "paseo-bots-plugin-settings",
    sourceParts: ["paseo-bots-plugin-settings"],
    targetParts: ["plugin-settings", "paseo-bots"],
  },
  {
    id: "plugin-data-library",
    label: "paseo-bots-plugin-data/library",
    sourceParts: ["paseo-bots-plugin-data", "library"],
    targetParts: ["plugin-data", "paseo-bots", "library"],
  },
  {
    id: "plugin-data-shared",
    label: "paseo-bots-plugin-data/shared",
    sourceParts: ["paseo-bots-plugin-data", "shared"],
    targetParts: ["plugin-data", "paseo-bots", "shared"],
  },
];

export function normalizePathForCompare(targetPath, platform = process.platform) {
  const normalized = path.normalize(targetPath);
  if (platform === "win32") {
    const slashed = normalized.replace(/\\/g, "/").toLowerCase();
    return /^[a-z]:\/$/.test(slashed) ? slashed : slashed.replace(/\/+$/, "");
  }
  return normalized === "/" ? "/" : normalized.replace(/\/+$/, "");
}

export function resolveMappings(options = {}) {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const rawPaseoHome = options.paseoHome || env.PASEO_HOME || path.join(homeDir, ".paseo");
  const paseoHome = path.resolve(rawPaseoHome);

  const mappings = LINK_MAPPINGS.map((item) => {
    const sourceDir = path.join(repoRoot, ...item.sourceParts);
    const targetDir = path.join(paseoHome, ...item.targetParts);
    return {
      id: item.id,
      label: item.label,
      sourceDir,
      parentDir: path.dirname(targetDir),
      targetDir,
    };
  });

  return { repoRoot, paseoHome, mappings };
}

export function formatFixCommands(sourceDir, targetDir, platform = process.platform) {
  if (platform === "win32") {
    return [
      `PowerShell: New-Item -ItemType Junction -Path "${targetDir}" -Target "${sourceDir}"`,
      `CMD:        cmd /c mklink /J "${targetDir}" "${sourceDir}"`,
    ];
  }
  return [`ln -s "${sourceDir}" "${targetDir}"`];
}

function isExistingDirectory(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch {
    return false;
  }
}

function failResult(code, message, mapping, platform) {
  return {
    ok: false,
    code,
    message,
    fixCommands: formatFixCommands(mapping.sourceDir, mapping.targetDir, platform),
    mapping,
  };
}

export function checkSingleLink(mapping, platform = process.platform) {
  if (!isExistingDirectory(mapping.sourceDir)) {
    return failResult("SOURCE_MISSING", `[${mapping.label}] Source directory missing: ${mapping.sourceDir}`, mapping, platform);
  }
  if (!isExistingDirectory(mapping.parentDir)) {
    return failResult("PARENT_MISSING", `[${mapping.label}] Target parent directory missing: ${mapping.parentDir}`, mapping, platform);
  }

  let lstat;
  try {
    lstat = fs.lstatSync(mapping.targetDir);
  } catch {
    return failResult("TARGET_MISSING", `[${mapping.label}] Target link missing: ${mapping.targetDir}`, mapping, platform);
  }

  if (!lstat.isSymbolicLink()) {
    return failResult("TARGET_NOT_SYMLINK", `[${mapping.label}] Target exists but is not a symlink/junction: ${mapping.targetDir}`, mapping, platform);
  }

  let targetReal;
  try {
    targetReal = fs.realpathSync(mapping.targetDir);
  } catch {
    return failResult("TARGET_BROKEN_SYMLINK", `[${mapping.label}] Target symlink is broken: ${mapping.targetDir}`, mapping, platform);
  }

  const sourceReal = fs.realpathSync(mapping.sourceDir);
  if (normalizePathForCompare(targetReal, platform) !== normalizePathForCompare(sourceReal, platform)) {
    return failResult("TARGET_WRONG_TARGET", `[${mapping.label}] Target points to ${targetReal}, expected ${sourceReal}`, mapping, platform);
  }

  return {
    ok: true,
    code: "OK",
    message: `[${mapping.label}] link verified: ${mapping.targetDir} -> ${sourceReal}`,
    fixCommands: [],
    mapping,
  };
}

export function checkPaseoBotsLinks(options = {}) {
  const platform = options.platform ?? process.platform;
  const { repoRoot, paseoHome, mappings } = resolveMappings(options);
  const results = mappings.map((mapping) => checkSingleLink(mapping, platform));
  return {
    ok: results.every((result) => result.ok),
    repoRoot,
    paseoHome,
    results,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { strict: false, repoRoot: undefined, paseoHome: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--strict") args.strict = true;
    else if (token === "--repo-root" && i + 1 < argv.length) args.repoRoot = argv[++i];
    else if (token === "--paseo-home" && i + 1 < argv.length) args.paseoHome = argv[++i];
  }
  return args;
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const summary = checkPaseoBotsLinks({ repoRoot: args.repoRoot, paseoHome: args.paseoHome });

  for (const result of summary.results) {
    if (result.ok) {
      console.log(`[OK] ${result.message}`);
    } else {
      console.warn(`[WARN] ${result.message}`);
      console.warn("[WARN] Fix command(s):");
      for (const cmd of result.fixCommands) {
        console.warn(`  ${cmd}`);
      }
    }
  }

  return !summary.ok && args.strict ? 1 : 0;
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  try {
    return normalizePathForCompare(fs.realpathSync(process.argv[1])) ===
      normalizePathForCompare(fs.realpathSync(fileURLToPath(import.meta.url)));
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  process.exitCode = main();
}
