#!/usr/bin/env node
/**
 * Purpose: Synchronize runtime partner symlinks with dual-plane physical isolation.
 * Context: Triggered on predev or when packages/runtime-assets change.
 * Usage: node scripts/link-agents.mjs (or npm run agents:link)
 * Prerequisites: Node.js 18+, write permissions to ~/.multiagent-orchestration/
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const RUNTIME_ROOT = path.join(os.homedir(), '.multiagent-orchestration');
const BUILTIN_DIR = path.join(REPO_ROOT, 'packages/runtime-assets/builtin-partners');
const PROMPTS_DIR = path.join(REPO_ROOT, 'packages/runtime-assets/prompts');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function forceSymlink(target, linkPath) {
  ensureDir(path.dirname(linkPath));
  if (fs.existsSync(linkPath) || fs.lstatSync(linkPath, { throwIfNoEntry: false })) {
    fs.rmSync(linkPath, { recursive: true, force: true });
  }
  fs.symlinkSync(target, linkPath);
}

try {
  console.log('[link-agents] Initializing Multi-Agent Dual-Plane Runtime at:', RUNTIME_ROOT);

  // 1. Base Runtime Folders
  const axiomsDir = path.join(RUNTIME_ROOT, 'axioms');
  const hooksDir = path.join(RUNTIME_ROOT, 'hooks');
  const mailboxesDir = path.join(RUNTIME_ROOT, 'mailboxes');
  const partnersDir = path.join(RUNTIME_ROOT, 'partners');
  const dbDir = path.join(RUNTIME_ROOT, 'db');
  ensureDir(axiomsDir);
  ensureDir(hooksDir);
  ensureDir(mailboxesDir);
  ensureDir(partnersDir);
  ensureDir(dbDir);

  // 2. Link Global Axioms & Runtime Base Prompts
  const standingOrderSrc = path.join(REPO_ROOT, 'docs/axioms/STANDING_ORDER.md');
  if (fs.existsSync(standingOrderSrc)) {
    forceSymlink(standingOrderSrc, path.join(axiomsDir, 'STANDING_ORDER.md'));
    console.log('  [Axiom Linked] STANDING_ORDER.md');
  }

  if (fs.existsSync(PROMPTS_DIR)) {
    for (const file of fs.readdirSync(PROMPTS_DIR)) {
      forceSymlink(path.join(PROMPTS_DIR, file), path.join(axiomsDir, file));
      console.log(`  [Prompt Linked] ${file}`);
    }
  }

  // 3. Link Steering Hook
  const hookSrc = path.join(REPO_ROOT, 'packages/steering-hook/dist/pre-tool-steer.js');
  if (fs.existsSync(hookSrc)) {
    forceSymlink(hookSrc, path.join(hooksDir, 'pre-tool-steer.js'));
    console.log('  [Hook Linked] pre-tool-steer.js');
  }

  // 4. Link Builtin Partners (File-Level with Rename & Settings Injection)
  if (fs.existsSync(BUILTIN_DIR)) {
    const partners = fs.readdirSync(BUILTIN_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const partnerId of partners) {
      const srcDir = path.join(BUILTIN_DIR, partnerId);
      const destDir = path.join(partnersDir, partnerId);

      // Real directories for cwd isolation, local memories, and sandbox workspace
      ensureDir(destDir);
      ensureDir(path.join(destDir, '.claude/skills'));
      ensureDir(path.join(destDir, 'memories/topics'));
      ensureDir(path.join(destDir, 'workspace'));

      // File-level symlinks (PARTNER_MANUAL.md -> CLAUDE.md prevents repo pollution)
      forceSymlink(path.join(srcDir, 'manifest.json'), path.join(destDir, 'manifest.json'));
      forceSymlink(path.join(srcDir, 'SOUL.md'), path.join(destDir, 'SOUL.md'));
      forceSymlink(path.join(srcDir, 'PARTNER_MANUAL.md'), path.join(destDir, 'CLAUDE.md'));

      if (fs.existsSync(path.join(srcDir, 'mcp.json'))) {
        forceSymlink(path.join(srcDir, 'mcp.json'), path.join(destDir, 'mcp.json'));
      }

      if (fs.existsSync(path.join(srcDir, 'skills'))) {
        const skills = fs.readdirSync(path.join(srcDir, 'skills'));
        for (const skill of skills) {
          forceSymlink(path.join(srcDir, 'skills', skill), path.join(destDir, '.claude/skills', skill));
        }
      }

      // Initialize local MEMORY.md if not present (never symlinked back to git repo)
      const memFile = path.join(destDir, 'memories/MEMORY.md');
      if (!fs.existsSync(memFile)) {
        fs.writeFileSync(
          memFile,
          `---\ndoc_id: ${partnerId.toUpperCase()}_MEMORY_ROOT\nversion: 1.0.0\n---\n# [0] ROOT: VERIFIED MEMORY INDEX (Max 200 lines / 25KB)\n`,
          'utf-8'
        );
      }

      // Inject PreToolUse steering hook into partner's local .claude/settings.json
      fs.writeFileSync(
        path.join(destDir, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                matcher: '*',
                hooks: [
                  {
                    type: 'command',
                    command: `node ${path.join(hooksDir, 'pre-tool-steer.js')}`
                  }
                ]
              }
            ]
          }
        }, null, 2),
        'utf-8'
      );

      console.log(`  [Partner Linked] ${partnerId} -> ${destDir}`);
    }
  }

  console.log('[link-agents] Dual-plane isolation setup complete. Runtime cwd is decoupled from build repo.');
  process.exit(0);
} catch (error) {
  console.error('[link-agents] Fatal error during synchronization:', error);
  process.exit(1);
}
