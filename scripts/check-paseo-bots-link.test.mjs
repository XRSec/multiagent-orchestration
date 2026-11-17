#!/usr/bin/env node
// Purpose: Unit tests for scripts/check-paseo-bots-link.mjs across all 3 paseo-bots mappings.
// Context: Verifies link diagnostics, PASEO_HOME overrides, Windows path normalization, and --strict exit codes.
// Usage: node --test scripts/check-paseo-bots-link.test.mjs
// Prerequisites: Node.js >= 18, zero external dependencies.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  LINK_MAPPINGS,
  checkPaseoBotsLinks,
  formatFixCommands,
  main,
  normalizePathForCompare,
  resolveMappings,
} from "./check-paseo-bots-link.mjs";

function createFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-link-test-"));
  const repoRoot = path.join(root, "repo");
  const paseoHome = path.join(root, "paseo-home");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const item of LINK_MAPPINGS) {
    fs.mkdirSync(path.join(repoRoot, ...item.sourceParts), { recursive: true });
    const target = path.join(paseoHome, ...item.targetParts);
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }
  return { root, repoRoot, paseoHome };
}

function linkAllMappings(repoRoot, paseoHome) {
  for (const item of LINK_MAPPINGS) {
    const src = path.join(repoRoot, ...item.sourceParts);
    const dst = path.join(paseoHome, ...item.targetParts);
    fs.symlinkSync(src, dst);
  }
}

test("passes when all 3 mappings are valid symlinks", (t) => {
  const { repoRoot, paseoHome } = createFixture(t);
  linkAllMappings(repoRoot, paseoHome);

  const summary = checkPaseoBotsLinks({ repoRoot, paseoHome });
  assert.equal(summary.ok, true);
  assert.equal(summary.results.length, 3);
  assert.ok(summary.results.every((r) => r.ok && r.code === "OK"));
});

test("reports partial missing target when one mapping is unlinked", (t) => {
  const { repoRoot, paseoHome } = createFixture(t);
  linkAllMappings(repoRoot, paseoHome);
  const sharedTarget = path.join(paseoHome, "plugin-data", "paseo-bots", "shared");
  fs.rmSync(sharedTarget, { recursive: true, force: true });

  const summary = checkPaseoBotsLinks({ repoRoot, paseoHome });
  assert.equal(summary.ok, false);
  const byId = Object.fromEntries(summary.results.map((r) => [r.mapping.id, r]));
  assert.equal(byId["plugin-settings"].ok, true);
  assert.equal(byId["plugin-data-library"].ok, true);
  assert.equal(byId["plugin-data-shared"].ok, false);
  assert.equal(byId["plugin-data-shared"].code, "TARGET_MISSING");
});

test("reports TARGET_NOT_SYMLINK when target is a regular directory", (t) => {
  const { repoRoot, paseoHome } = createFixture(t);
  linkAllMappings(repoRoot, paseoHome);
  const libTarget = path.join(paseoHome, "plugin-data", "paseo-bots", "library");
  fs.rmSync(libTarget, { recursive: true, force: true });
  fs.mkdirSync(libTarget, { recursive: true });

  const summary = checkPaseoBotsLinks({ repoRoot, paseoHome });
  assert.equal(summary.ok, false);
  const libResult = summary.results.find((r) => r.mapping.id === "plugin-data-library");
  assert.equal(libResult.code, "TARGET_NOT_SYMLINK");
});

test("reports TARGET_WRONG_TARGET when symlink points to another directory", (t) => {
  const { root, repoRoot, paseoHome } = createFixture(t);
  linkAllMappings(repoRoot, paseoHome);
  const wrongDir = path.join(root, "wrong-dir");
  fs.mkdirSync(wrongDir, { recursive: true });
  const settingsTarget = path.join(paseoHome, "plugin-settings", "paseo-bots");
  fs.rmSync(settingsTarget, { recursive: true, force: true });
  fs.symlinkSync(wrongDir, settingsTarget);

  const summary = checkPaseoBotsLinks({ repoRoot, paseoHome });
  assert.equal(summary.ok, false);
  const settingsResult = summary.results.find((r) => r.mapping.id === "plugin-settings");
  assert.equal(settingsResult.code, "TARGET_WRONG_TARGET");
});

test("PASEO_HOME env override and --paseo-home precedence", () => {
  const envResolved = resolveMappings({
    repoRoot: "/tmp/repo",
    env: { PASEO_HOME: "/tmp/env-paseo" },
    homeDir: "/tmp/home",
  });
  assert.equal(envResolved.paseoHome, path.resolve("/tmp/env-paseo"));

  const argResolved = resolveMappings({
    repoRoot: "/tmp/repo",
    paseoHome: "/tmp/arg-paseo",
    env: { PASEO_HOME: "/tmp/env-paseo" },
    homeDir: "/tmp/home",
  });
  assert.equal(argResolved.paseoHome, path.resolve("/tmp/arg-paseo"));
});

test("normalizes Windows paths case-insensitively and formats Windows fix commands", () => {
  const a = normalizePathForCompare("C:\\Users\\XR\\Repo\\paseo-bots-plugin-data\\shared\\", "win32");
  const b = normalizePathForCompare("c:/users/xr/repo/paseo-bots-plugin-data/shared", "win32");
  assert.equal(a, b);

  const cmds = formatFixCommands("C:\\repo\\src", "C:\\paseo\\dst", "win32");
  assert.equal(cmds.length, 2);
  assert.match(cmds[0], /New-Item -ItemType Junction/);
  assert.match(cmds[1], /cmd \/c mklink \/J/);
});

test("main returns 0 by default on failure and 1 with --strict", (t) => {
  const { repoRoot, paseoHome } = createFixture(t);

  const origLog = console.log;
  const origWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  t.after(() => {
    console.log = origLog;
    console.warn = origWarn;
  });

  const nonStrictCode = main(["--repo-root", repoRoot, "--paseo-home", paseoHome]);
  assert.equal(nonStrictCode, 0);

  const strictCode = main(["--repo-root", repoRoot, "--paseo-home", paseoHome, "--strict"]);
  assert.equal(strictCode, 1);

  linkAllMappings(repoRoot, paseoHome);
  const okStrictCode = main(["--repo-root", repoRoot, "--paseo-home", paseoHome, "--strict"]);
  assert.equal(okStrictCode, 0);
});
