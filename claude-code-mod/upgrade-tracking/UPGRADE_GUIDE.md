# Claude Code Upgrade & Diff Tracking Guide

> **Target Version**: Claude Code `2.1.325` (Baseline)  
> **Repository Base Commit**: `9c7dfd6c75`  
> **Tracking Scope**: 644 core customized prompt shards (595 git-tracked prompt diffs + 49 pre-baseline shards in `piebald-claude-code-system-prompts/system-prompts/`) + 2 `tweakcc` engine patches (`tweakcc/src/`)  
> **Chinese Companion**: See [`UPGRADE_GUIDE_CN.md`](./UPGRADE_GUIDE_CN.md) for concise Chinese protocol.

---

## 1. Architecture Overview

Claude Code modifications in this repository operate across two synchronized layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Claude Code Native Binary                       │
│      (Bun Single-File Executable / Mach-O / ELF with embedded BunFS)   │
│                                                                        │
│   /$bunfs/root/cli.js (Entrypoint)                                     │
│   /$bunfs/root/chunk-*.js (3,000+ code-split JS modules)              │
│   /$bunfs/root/*.md (Text-loader assets, e.g. preamble templates)     │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │
                         tweakcc --apply -y
                                    │
┌───────────────────────────────────┴────────────────────────────────────┐
│                        tweakcc Engine Patches                          │
│                                                                        │
│  • installationDetection.ts: Shim wrapper resolution & file heuristics │
│  • patches/systemPrompts.ts: Delimiter backtracking & backtick escape  │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ reads
┌───────────────────────────────────┴────────────────────────────────────┐
│                   Customized Prompt Shards (595 files)                 │
│      claude-code-mod/piebald-claude-code-system-prompts/system-prompts/│
│                                                                        │
│  • agent-prompt-*.md      (98 files: subagents, reviewers, hooks)      │
│  • system-prompt-*.md     (178 files: safety, formatting, workflows)   │
│  • skill-*.md             (82 files: slash commands, domain skills)    │
│  • tool-description-*.md  (237 files: tool policies, execution rules)  │
└───────────────────────────────────▲────────────────────────────────────┘
                                    │ tracks
┌───────────────────────────────────┴────────────────────────────────────┐
│                   Upgrade Tracking & Diff Archive                      │
│                  claude-code-mod/upgrade-tracking/                     │
│                                                                        │
│  • MANIFEST.json: Machine-readable mapping of all 597 modified files   │
│  • UPGRADE_GUIDE.md: Step-by-step upgrade protocol (this file)         │
│  • diffs/: Unified per-category diffs vs 2.1.325 original upstream     │
│  • generate_archive.mjs: Generator script for full archive regeneration│
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Directory Structure

```
claude-code-mod/upgrade-tracking/
├── MANIFEST.json           # Machine-readable index of all modified prompts & engine files
├── UPGRADE_GUIDE.md        # Upgrade protocol and maintenance procedures
├── generate_archive.mjs    # Automated diff and manifest generator script
└── diffs/
    ├── agent-prompt.diff      # 98 unified diffs for subagent prompts
    ├── system-prompt.diff     # 178 unified diffs for system prompts
    ├── skill.diff             # 82 unified diffs for skill prompts
    ├── tool-description.diff  # 237 unified diffs for tool descriptions
    └── tweakcc-src.diff       # Unified diff for tweakcc engine patches
```

---

## 3. Detecting Upstream Claude Code Changes

When Anthropic releases a new version of `@anthropic-ai/claude-code` (e.g. `2.1.326` or `2.2.0`), perform the following detection steps:

### 3.1 Check Installed Version & Cache
Verify current installed binary vs prompt cache:
```bash
claude --version
# Output: <NEW_VERSION> (Claude Code)
```

Tweakcc automatically downloads the prompt metadata definition to:
`~/.tweakcc/prompt-data-cache/prompts-<NEW_VERSION>.json`

If not present, prefetch it using tweakcc:
```bash
cd claude-code-mod/tweakcc
node dist/index.mjs --list-system-prompts <NEW_VERSION>
```

### 3.2 Automated Upstream Diff Audit
Run the automated audit script against `MANIFEST.json` to detect:
1. **Version bumps**: Prompts where upstream `version` changed.
2. **Variable changes**: Prompts where `${...}` variables were added, removed, or renamed.
3. **Body changes**: Prompts where `pieces` array changed compared to 2.1.325.
4. **Deleted / Renamed prompts**: Prompts that no longer exist in the new version.

```bash
node -e "
import fs from 'fs';
const manifest = JSON.parse(fs.readFileSync('claude-code-mod/upgrade-tracking/MANIFEST.json', 'utf8'));
const newCachePath = '/Users/xr/.tweakcc/prompt-data-cache/prompts-2.1.326.json';

if (!fs.existsSync(newCachePath)) {
  console.error('Target cache does not exist:', newCachePath);
  process.exit(1);
}

const newCache = JSON.parse(fs.readFileSync(newCachePath, 'utf8'));
const newPromptMap = new Map(newCache.prompts.map(p => [p.id, p]));

console.log('=== UPSTREAM CLAUDE CODE UPDATE AUDIT ===');
let versionBumps = 0;
let varChanges = 0;
let deletedPrompts = 0;

for (const [id, item] of Object.entries(manifest.prompts)) {
  const newP = newPromptMap.get(id);
  if (!newP) {
    console.log('[REMOVED/RENAMED]', id);
    deletedPrompts++;
    continue;
  }
  if (newP.version !== item.ccVersion) {
    versionBumps++;
  }
  const newVars = Object.keys(newP.identifierMap).length > 0 ? [...new Set(Object.values(newP.identifierMap))].sort() : [];
  const oldVars = (item.variables || []).slice().sort();
  if (JSON.stringify(newVars) !== JSON.stringify(oldVars)) {
    console.log('[VARS CHANGED]', id, 'Old:', oldVars, 'New:', newVars);
    varChanges++;
  }
}
console.log('Version bumps:', versionBumps);
console.log('Variable changes:', varChanges);
console.log('Removed/renamed:', deletedPrompts);
"
```

---

## 4. Inspecting Native Binary Chunks & JS Modules

Claude Code is distributed as a single-file executable packed with Bun. In `native-binary.backup`, individual chunks are stored in Mach-O / ELF sections.

### 4.1 Unpacking the Entrypoint
To extract the entrypoint `cli.js`:
```bash
cd claude-code-mod/tweakcc
node dist/index.mjs unpack /tmp/cli.extracted.js /Users/xr/.tweakcc/native-binary.backup
```

### 4.2 Inspecting Code-Split Chunks
To search or inspect specific code-split chunks (e.g. `/$bunfs/root/chunk-6fgj334j.js`):
```bash
node -e "
import { extractClaudeJsModulesFromNativeInstallation } from './dist/nativeInstallation-pdDE7BbH.mjs';
const corpus = extractClaudeJsModulesFromNativeInstallation('/Users/xr/.tweakcc/native-binary.backup');
console.log('Total modules:', corpus.modules.length);

// Find module by name or search content
const targetModule = corpus.modules.find(m => m.name === '/$bunfs/root/chunk-6fgj334j.js');
if (targetModule) {
  console.log('Target module size:', targetModule.contents.length);
}
"
```

---

## 5. Tweakcc Engine Patches Maintenance

The `claude-code-mod/tweakcc` repository contains 2 critical architectural fixes in `src/`:

### 5.1 `src/installationDetection.ts`
- **Problem**: When Claude Code is installed via `pnpm` or `npm` shims, `which claude` points to a shell script wrapper (e.g. `#!/bin/sh` with `# cmd-shim-target=...` or `exec ...`). `tweakcc`'s standard heuristic previously misclassified non-node scripts as JavaScript or failed to trace through to the real native binary.
- **Fix**: Added `maybeResolveShimWrapper` to parse shell wrapper shims and Windows `.cmd` shims, resolving the target native binary directly. Updated `detectFileTypeHeuristic` to ignore non-node/bun shebang scripts.
- **Upgrade Verification**: When upgrading `tweakcc`, check that `maybeResolveShimWrapper` is retained and test:
  ```bash
  cd claude-code-mod/tweakcc
  npx vitest run src/installationDetection.test.ts
  ```

### 5.2 `src/patches/systemPrompts.ts`
- **Problem**: In multi-line template literals, indented system prompts were failing delimiter detection. `applySystemPrompts` previously looked only at `content[mIndex - 1]`. When indented with spaces or newlines, it defaulted to double-quotes, failing to escape depth-0 backticks and triggering syntax errors like `SyntaxError: Unexpected identifier 'git'`.
- **Fix**: Added `findEnclosingDelimiter` which backtracks through whitespace to find the true opening delimiter (`\``, `"`, or `'`).
- **Upgrade Verification**: When upgrading `tweakcc`, check that `findEnclosingDelimiter` is retained and test:
  ```bash
  cd claude-code-mod/tweakcc
  npx vitest run src/patches/systemPrompts.test.ts
  ```

---

## 6. Upgrade & Merge Procedure (Step-by-Step)

Follow this standardized procedure when upgrading Claude Code to a new release:

### Step 1: Upstream Release Installation & Backup
1. Update Claude Code via your package manager:
   ```bash
   pnpm update -g @anthropic-ai/claude-code
   ```
2. Verify that `claude --version` reports the new version.
3. Run tweakcc to create a pristine native backup:
   ```bash
   cd claude-code-mod/tweakcc
   node dist/index.mjs --restore
   ```
   Confirm backup exists at `~/.tweakcc/native-binary.backup`.

### Step 2: Run Automated Audit & Conflict Detection
1. Run tweakcc sync to check for upstream conflicts:
   ```bash
   cd claude-code-mod/tweakcc
   node dist/index.mjs --list-system-prompts
   ```
2. Compare the new cache `~/.tweakcc/prompt-data-cache/prompts-<NEW_VERSION>.json` against `MANIFEST.json`.

### Step 3: Resolving Prompt Conflicts
For each prompt identified with upstream changes:
1. **If only `ccVersion` changed**:
   Update `ccVersion: "<NEW_VERSION>"` in the prompt file's frontmatter.
2. **If upstream variables changed**:
   Update the `variables` array in frontmatter and preserve all `${VARIABLE}` interpolations in the markdown body.
3. **If upstream text changed**:
   Review the 3-way diff between:
   - Baseline original (from `upgrade-tracking/diffs/`)
   - Upstream new (from `prompts-<NEW_VERSION>.json`)
   - Current customized (`system-prompts/<prompt-id>.md`)
   Re-apply the AGY agent philosophy principles (terse prose, rule-first tables, structured XML, no self-referential conversational hedges).

### Step 4: Re-build Engine & Apply Customizations
1. Compile tweakcc:
   ```bash
   cd claude-code-mod/tweakcc
   pnpm run build
   ```
2. Apply all customizations:
   ```bash
   node dist/index.mjs --apply -y
   ```
3. Verify output:
   - Check that `540+` prompts are applied successfully.
   - Verify `0` fatal errors or syntax crashes.

### Step 5: Verification & Smoke Testing
1. Test CLI version:
   ```bash
   claude --version
   ```
2. Test CLI execution and help output:
   ```bash
   claude --help
   ```
3. Test a quick prompt execution:
   ```bash
   claude -p "smoke check" --dangerously-skip-permissions
   ```

### Step 6: Regenerate Upgrade Tracking Archive
Run the automated archive generator to update all diffs and `MANIFEST.json`:
```bash
node claude-code-mod/upgrade-tracking/generate_archive.mjs
```
Verify that `MANIFEST.json` and all files under `diffs/` reflect the new version accurately.
Commit the updated tracking files:
```bash
git add claude-code-mod/upgrade-tracking/
git commit -m "chore(upgrade-tracking): update diff archive and manifest for Claude Code <NEW_VERSION>"
```
