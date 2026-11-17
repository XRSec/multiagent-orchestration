import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import matter from '../tweakcc/node_modules/gray-matter/index.js';
import * as Diff from '../tweakcc/node_modules/diff/libesm/index.js';
import { extractClaudeJsModulesFromNativeInstallation } from '../tweakcc/dist/nativeInstallation-pdDE7BbH.mjs';

const REPO_ROOT = '/Users/xr/IDEA.localized/multiagent-orchestration';
const TARGET_DIR = path.join(REPO_ROOT, 'claude-code-mod');
const SYSTEM_PROMPTS_DIR = path.join(TARGET_DIR, 'piebald-claude-code-system-prompts', 'system-prompts');
const TRACKING_DIR = path.join(TARGET_DIR, 'upgrade-tracking');
const DIFFS_DIR = path.join(TRACKING_DIR, 'diffs');
const PROMPTS_CACHE_PATH = '/Users/xr/.tweakcc/prompt-data-cache/prompts-2.1.325.json';
const NATIVE_BACKUP_PATH = '/Users/xr/.tweakcc/native-binary.backup';
const BASE_COMMIT = '9c7dfd6c75';

// State machine from tweakcc for quote decoding and markdown reconstruction
const countPrecedingBackslashes = (e, t) => {
  let n = 0, r = t - 1;
  for (; r >= 0 && e[r] === '\\';) n++, r--;
  return n;
};

const BodyChar = { Code: 0, String: 1, Text: 2, NestedText: 3 };

const scanTemplateBody = e => {
  let t = Array(e.length), n = 0, r = '', i = [];
  for (let a = 0; a < e.length; a++) {
    let o = e[a], s = e[a + 1], c = countPrecedingBackslashes(e, a) % 2 === 0;
    if (n) {
      let e = i.length > 0 && n === i[i.length - 1];
      if (t[a] = e ? BodyChar.NestedText : BodyChar.Code, e) {
        o === '`' && c ? i.pop() : o === '$' && s === '{' && (c && n++, t[++a] = BodyChar.NestedText);
        continue;
      }
      r && (t[a] = BodyChar.String);
      r ? o === r && c && (r = '') : o === '$' && s === '{' ? (c && n++, t[++a] = BodyChar.Code) : o === '"' || o === "'" ? (r = o, t[a] = BodyChar.String) : o === '`' && c ? i.push(n) : o === '{' ? n++ : o === '}' && n--;
      continue;
    }
    t[a] = BodyChar.Text;
    o === '$' && s === '{' && (c && n++, t[++a] = BodyChar.Text);
  }
  return { kinds: t, incomplete: n > 0 || i.length > 0 };
};

const decodeQuoteEscapes = e => {
  let { kinds: t } = scanTemplateBody(e), n = '';
  for (let r = 0; r < e.length; r++) {
    let i = e[r + 1];
    e[r] === '\\' && (i === '"' || i === "'") && (t[r] === BodyChar.Text || t[r] === BodyChar.NestedText) && countPrecedingBackslashes(e, r) % 2 === 0 || (n += e[r]);
  }
  return n;
};

const reconstructContentFromPieces = (pieces, identifiers, identifierMap) => {
  let r = '';
  for (let i = 0; i < pieces.length; i++) {
    r += pieces[i];
    if (i < identifiers.length) {
      let id = identifiers[i];
      let a = identifierMap[String(id)] || ('UNKNOWN_' + id);
      r += a;
    }
  }
  return decodeQuoteEscapes(r);
};

const generateMarkdownFromPrompt = (prompt, customContent) => {
  let content = customContent || reconstructContentFromPieces(prompt.pieces, prompt.identifiers, prompt.identifierMap);
  let vars = Object.keys(prompt.identifierMap).length > 0 ? [...new Set(Object.values(prompt.identifierMap))] : undefined;
  let data = {
    name: prompt.name,
    description: prompt.description,
    ccVersion: prompt.version
  };
  if (vars && vars.length > 0) {
    data.variables = vars;
  }
  return matter.stringify({ content }, data, { delimiters: ['<!--', '-->'] });
};

const md5 = str => crypto.createHash('md5').update(str, 'utf8').digest('hex');

async function main() {
  console.log('Starting Diff Archive & Upgrade Tracking Generation...');

  // Ensure output dirs
  fs.mkdirSync(DIFFS_DIR, { recursive: true });

  // 1. Load prompt data cache
  console.log(`Loading 2.1.325 prompt cache: ${PROMPTS_CACHE_PATH}`);
  const promptCache = JSON.parse(fs.readFileSync(PROMPTS_CACHE_PATH, 'utf8'));
  const promptMap = new Map();
  const promptByName = new Map();
  for (const p of promptCache.prompts) {
    promptMap.set(p.id, p);
    promptByName.set(p.name.trim().toLowerCase(), p);
  }
  console.log(`Loaded ${promptCache.prompts.length} prompt definitions from cache.`);

  // 2. Extract modules from native-binary.backup
  console.log(`Extracting Bun modules from ${NATIVE_BACKUP_PATH}...`);
  const corpus = extractClaudeJsModulesFromNativeInstallation(NATIVE_BACKUP_PATH);
  if (!corpus) {
    throw new Error('Failed to extract Bun corpus from native binary backup');
  }
  console.log(`Extracted ${corpus.modules.length} modules from native binary.`);

  // Filter modules with text content
  const searchableModules = corpus.modules.filter(m => m.contents && m.contents.length > 0).map(m => ({
    name: m.name,
    loader: m.loader,
    isJavaScript: m.isJavaScript,
    text: m.contents.toString('utf8')
  }));
  console.log(`Searchable text/code modules: ${searchableModules.length}`);

  // Helper to find chunk hint for a prompt
  function findChunkHint(p, promptContent) {
    if (p && p.pieces && p.pieces.length > 0) {
      // Sort pieces by length descending
      const sorted = [...p.pieces].sort((a, b) => b.length - a.length);
      for (const pc of sorted) {
        const cleaned = pc.replace(/<<CCVERSION>>/g, '2.1.325').replace(/<<BUILD_TIME>>/g, '2026-11-13T18:52:23Z').trim();
        // Look for clean substrings >= 15 chars
        const matches = cleaned.match(/[a-zA-Z0-9 ,.]{15,}/g) || [];
        for (const m of matches) {
          const sub = m.trim();
          if (sub.length < 15) continue;
          for (const mod of searchableModules) {
            if (mod.text.includes(sub)) {
              return mod.name;
            }
          }
        }
      }
    }

    // Try finding phrases from promptContent
    const lines = promptContent.split('\n').map(l => l.trim()).filter(l => l.length >= 25 && !l.startsWith('<!--') && !l.startsWith('-->'));
    for (const line of lines.slice(0, 10)) {
      const sub = line.slice(0, 40);
      for (const mod of searchableModules) {
        if (mod.text.includes(sub)) {
          return mod.name;
        }
      }
    }

    return null;
  }

  // 3. Get git modified prompt files
  console.log('Querying git diff for modified files...');
  const gitPromptFiles = execSync(`git diff --name-only ${BASE_COMMIT} HEAD -- claude-code-mod/piebald-claude-code-system-prompts/system-prompts/`, {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  }).trim().split('\n').filter(Boolean);

  console.log(`Total git-modified prompt files: ${gitPromptFiles.length}`);

  // Categorize files
  const categoryFiles = {
    'agent-prompt': [],
    'system-prompt': [],
    'skill': [],
    'tool-description': []
  };

  const getCategory = (id) => {
    if (id.startsWith('agent-prompt-')) return 'agent-prompt';
    if (id.startsWith('system-prompt-')) return 'system-prompt';
    if (id.startsWith('skill-')) return 'skill';
    if (id.startsWith('tool-description-')) return 'tool-description';
    return 'other';
  };

  for (const relPath of gitPromptFiles) {
    const filename = path.basename(relPath);
    const id = filename.replace(/\.md$/, '');
    const cat = getCategory(id);
    if (categoryFiles[cat]) {
      categoryFiles[cat].push({ relPath, filename, id });
    } else {
      console.warn(`Unrecognized category for: ${filename}`);
    }
  }

  console.log('Category breakdown:');
  for (const [cat, list] of Object.entries(categoryFiles)) {
    console.log(`  - ${cat}: ${list.length} files`);
  }

  // Process all prompt files
  const manifestPrompts = {};
  const diffOutputs = {
    'agent-prompt': [],
    'system-prompt': [],
    'skill': [],
    'tool-description': []
  };

  let totalPromptsProcessed = 0;
  let totalChunksFound = 0;

  for (const [cat, files] of Object.entries(categoryFiles)) {
    const diffFileName = `diffs/${cat}.diff`;
    console.log(`Processing category: ${cat} (${files.length} files)...`);

    for (const item of files) {
      const fullPath = path.join(REPO_ROOT, item.relPath);
      const currentRaw = fs.readFileSync(fullPath, 'utf8');
      const parsedCurrent = matter(currentRaw, { delimiters: ['<!--', '-->'] });

      // Look up in 2.1.325 cache
      let p = promptMap.get(item.id);
      let matchedViaName = false;
      if (!p && parsedCurrent.data.name) {
        const nameKey = parsedCurrent.data.name.trim().toLowerCase();
        p = promptByName.get(nameKey);
        if (p) matchedViaName = true;
      }

      let originalRaw = '';
      let status = 'customized';
      let ccVersion = parsedCurrent.data.ccVersion || '2.1.325';
      let name = parsedCurrent.data.name || item.id;
      let variables = parsedCurrent.data.variables || [];

      if (p) {
        originalRaw = generateMarkdownFromPrompt(p);
        ccVersion = p.version || ccVersion;
        name = p.name || name;
        if (p.identifierMap && Object.keys(p.identifierMap).length > 0) {
          variables = [...new Set(Object.values(p.identifierMap))];
        }
      } else {
        // Fallback to git base commit 9c7dfd6c75
        status = 'legacy_baseline';
        try {
          originalRaw = execSync(`git show ${BASE_COMMIT}:${item.relPath}`, {
            cwd: REPO_ROOT,
            encoding: 'utf8'
          });
        } catch {
          originalRaw = currentRaw;
        }
      }

      // Find chunk hint
      const chunkHint = findChunkHint(p, originalRaw || currentRaw);
      if (chunkHint) totalChunksFound++;

      const origBytes = Buffer.byteLength(originalRaw, 'utf8');
      const currBytes = Buffer.byteLength(currentRaw, 'utf8');
      const deltaBytes = currBytes - origBytes;

      manifestPrompts[item.id] = {
        promptId: item.id,
        filename: item.filename,
        category: cat,
        name: name,
        ccVersion: String(ccVersion),
        variables: variables,
        originalBytes: origBytes,
        currentBytes: currBytes,
        deltaBytes: deltaBytes,
        originalHash: md5(originalRaw),
        currentHash: md5(currentRaw),
        modulePath: chunkHint,
        chunkHint: chunkHint,
        diffFile: diffFileName,
        status: status,
        cacheIdMatch: p ? p.id : null,
        matchedViaName: matchedViaName
      };

      // Generate unified diff
      const fileHeader = `piebald-claude-code-system-prompts/system-prompts/${item.filename}`;
      const patch = Diff.createTwoFilesPatch(
        `a/${fileHeader}`,
        `b/${fileHeader}`,
        originalRaw,
        currentRaw,
        `(Claude Code 2.1.325 Original)`,
        `(Customized HEAD)`
      );

      const sectionBanner = [
        '# ===================================================================',
        `# File: ${fileHeader}`,
        `# Prompt ID: ${item.id}`,
        `# Category: ${cat}`,
        `# Name: ${name}`,
        `# Claude Code Baseline: v${ccVersion} (${status})`,
        `# Target Chunk: ${chunkHint || 'legacy-custom / unmapped'}`,
        `# Original Size: ${origBytes} bytes | Current Size: ${currBytes} bytes | Delta: ${deltaBytes >= 0 ? '+' : ''}${deltaBytes} bytes`,
        '# ==================================================================='
      ].join('\n');

      diffOutputs[cat].push(`${sectionBanner}\n${patch.trim()}\n`);
      totalPromptsProcessed++;
    }
  }

  // 4. Process tweakcc source files
  console.log('Processing tweakcc source files...');
  const tweakccFiles = [
    {
      relPath: 'claude-code-mod/tweakcc/src/installationDetection.ts',
      description: 'Shim wrapper resolution (maybeResolveShimWrapper) for POSIX & Windows cmd-shims; detectFileTypeHeuristic non-node/bun fix'
    },
    {
      relPath: 'claude-code-mod/tweakcc/src/patches/systemPrompts.ts',
      description: 'Backtrack delimiter detection (findEnclosingDelimiter) for multi-line indented template literals'
    }
  ];

  const manifestTweakcc = [];
  const tweakccDiffSections = [];

  for (const tf of tweakccFiles) {
    const fullPath = path.join(REPO_ROOT, tf.relPath);
    const currentRaw = fs.readFileSync(fullPath, 'utf8');
    const originalRaw = execSync(`git show ${BASE_COMMIT}:${tf.relPath}`, {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    });

    const origBytes = Buffer.byteLength(originalRaw, 'utf8');
    const currBytes = Buffer.byteLength(currentRaw, 'utf8');
    const deltaBytes = currBytes - origBytes;

    manifestTweakcc.push({
      path: tf.relPath,
      description: tf.description,
      originalBytes: origBytes,
      currentBytes: currBytes,
      deltaBytes: deltaBytes,
      originalHash: md5(originalRaw),
      currentHash: md5(currentRaw),
      diffFile: 'diffs/tweakcc-src.diff'
    });

    const patch = Diff.createTwoFilesPatch(
      `a/${tf.relPath}`,
      `b/${tf.relPath}`,
      originalRaw,
      currentRaw,
      `(${BASE_COMMIT})`,
      `(HEAD)`
    );

    const banner = [
      '# ===================================================================',
      `# File: ${tf.relPath}`,
      `# Commit Baseline: ${BASE_COMMIT} -> HEAD`,
      `# Description: ${tf.description}`,
      `# Original Size: ${origBytes} bytes | Current Size: ${currBytes} bytes | Delta: ${deltaBytes >= 0 ? '+' : ''}${deltaBytes} bytes`,
      '# ==================================================================='
    ].join('\n');

    tweakccDiffSections.push(`${banner}\n${patch.trim()}\n`);
  }

  // 5. Write diff files
  console.log('Writing unified diff files to diffs/...');
  for (const [cat, diffs] of Object.entries(diffOutputs)) {
    const outPath = path.join(DIFFS_DIR, `${cat}.diff`);
    const header = [
      `# Unified Diff Archive: ${cat}`,
      `# Base: Claude Code 2.1.325 Original Upstream Baseline`,
      `# Target: Customized Claude Code System Prompts (HEAD)`,
      `# Generated: ${new Date().toISOString()}`,
      `# Total Prompts: ${diffs.length}`,
      '#\n'
    ].join('\n');
    fs.writeFileSync(outPath, header + diffs.join('\n\n'), 'utf8');
    console.log(`  Wrote ${outPath} (${diffs.length} entries, ${fs.statSync(outPath).size} bytes)`);
  }

  // Write tweakcc-src.diff
  const tweakccDiffPath = path.join(DIFFS_DIR, 'tweakcc-src.diff');
  const tweakccHeader = [
    '# Unified Diff Archive: tweakcc-src',
    '# Base: git commit 9c7dfd6c75',
    '# Target: Customized tweakcc engine patches (HEAD)',
    `# Generated: ${new Date().toISOString()}`,
    `# Total Files: ${manifestTweakcc.length}`,
    '#\n'
  ].join('\n');
  fs.writeFileSync(tweakccDiffPath, tweakccHeader + tweakccDiffSections.join('\n\n'), 'utf8');
  console.log(`  Wrote ${tweakccDiffPath} (${manifestTweakcc.length} files, ${fs.statSync(tweakccDiffPath).size} bytes)`);

  // 6. Write MANIFEST.json
  console.log('Writing MANIFEST.json...');
  const manifest = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    generator: 'upgrade-tracking/generate_archive.mjs',
    claudeCodeVersion: '2.1.325',
    gitBaseCommit: BASE_COMMIT,
    gitHeadCommit: execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim(),
    stats: {
      totalModifiedFiles: totalPromptsProcessed + manifestTweakcc.length,
      totalPrompts: totalPromptsProcessed,
      totalTweakccFiles: manifestTweakcc.length,
      chunksLocated: totalChunksFound,
      categories: {
        'agent-prompt': categoryFiles['agent-prompt'].length,
        'system-prompt': categoryFiles['system-prompt'].length,
        'skill': categoryFiles['skill'].length,
        'tool-description': categoryFiles['tool-description'].length,
        'tweakcc-src': manifestTweakcc.length
      }
    },
    diffFiles: {
      'agent-prompt': 'diffs/agent-prompt.diff',
      'system-prompt': 'diffs/system-prompt.diff',
      'skill': 'diffs/skill.diff',
      'tool-description': 'diffs/tool-description.diff',
      'tweakcc-src': 'diffs/tweakcc-src.diff'
    },
    tweakccFiles: manifestTweakcc,
    prompts: manifestPrompts
  };

  const manifestPath = path.join(TRACKING_DIR, 'MANIFEST.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`  Wrote ${manifestPath} (${fs.statSync(manifestPath).size} bytes)`);

  console.log('\nDiff archive generation completed successfully!');
  console.log(`Total prompts: ${totalPromptsProcessed} (Chunks located in native binary: ${totalChunksFound})`);
  console.log(`Tweakcc files: ${manifestTweakcc.length}`);
}

main().catch(err => {
  console.error('Fatal error generating diff archive:', err);
  process.exit(1);
});
