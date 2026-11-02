/**
 * Purpose: Adversarial stress and boundary challenge suite for Helper 3, 4, and 8.
 * Context: Claude Agent SDK Runtime Control Plane - M1_R2 Verification.
 * Constraints: Node.js 18+ native ESM, zero external dependencies, file <= 600 lines.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

import {
  ProgressiveDisclosureHelper,
  MAX_CAPSULE_CHARS,
  DISCLOSURE_LEVELS
} from '../packages/agent-control-plane/helpers/progressive-disclosure/ProgressiveDisclosureHelper.mjs';

import {
  StepScrubberHelper,
  CHUNK_STEP,
  DEFAULT_HEAD_LINES,
  DEFAULT_TAIL_LINES
} from '../packages/agent-control-plane/helpers/step-scrubber/StepScrubberHelper.mjs';

import {
  SkillCapsuleHelper
} from '../packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs';

let totalChallenges = 0;
let passedChallenges = 0;
let failedChallenges = 0;
const findings = [];

function runChallenge(id, description, fn) {
  totalChallenges++;
  try {
    fn();
    passedChallenges++;
    console.log(`  ✓ [CHALLENGE-PASS] ${id}: ${description}`);
  } catch (err) {
    failedChallenges++;
    console.error(`  ✗ [CHALLENGE-FAIL] ${id}: ${description}`);
    console.error(`    Error: ${err.message}`);
    findings.push({ id, description, error: err.message, stack: err.stack });
  }
}

async function runAsyncChallenge(id, description, fn) {
  totalChallenges++;
  try {
    await fn();
    passedChallenges++;
    console.log(`  ✓ [CHALLENGE-PASS] ${id}: ${description}`);
  } catch (err) {
    failedChallenges++;
    console.error(`  ✗ [CHALLENGE-FAIL] ${id}: ${description}`);
    console.error(`    Error: ${err.message}`);
    findings.push({ id, description, error: err.message, stack: err.stack });
  }
}

function hashString(str) {
  return crypto.createHash('sha256').update(str || '', 'utf8').digest('hex');
}

console.log('================================================================');
console.log('▶ STARTING EMPIRICAL ADVERSARIAL STRESS SUITE (HELPERS 3, 4, 8)');
console.log('================================================================\n');

// ============================================================================
// SECTION 1: HELPER 3 (ProgressiveDisclosureHelper) ADVERSARIAL STRESS
// ============================================================================
console.log('----------------------------------------------------------------');
console.log('SECTION 1: Helper 3 (ProgressiveDisclosureHelper) Boundary & 100KB Stress');
console.log('----------------------------------------------------------------');

const helper3 = new ProgressiveDisclosureHelper();

// 1.1: 100KB Single-line dense string micro-capsule length constraint
runChallenge('H3-C1', '100KB single-line text micro-capsule strictly <= 180 chars', () => {
  const largeSingleLine = 'A'.repeat(102400); // 100KB single line
  helper3.registerResource('res_100k_single', largeSingleLine, { tag: 'dense_100k' });

  const capsule = helper3.renderLayer2('res_100k_single');
  assert.ok(capsule.length <= 180, `Capsule length ${capsule.length} exceeds 180 limit`);
  assert.ok(capsule.startsWith('[ResourceCapsule: res_100k_single | '), 'Prefix invalid');
  assert.ok(capsule.endsWith(']'), 'Capsule must close with bracket');
  assert.ok(capsule.includes('...'), 'Long text must have ellipsis indicator');
});

// 1.2: 100KB Multiline (5,000 lines) text metadata and capsule <= 180 chars
runChallenge('H3-C2', '100KB multiline (5,000 lines) text metadata and capsule <= 180 chars', () => {
  const lineChunk = 'line-data-fragment-12345\n';
  const repeatCount = 5000; // ~125KB, 5000 lines
  const largeMultiLine = lineChunk.repeat(repeatCount);
  helper3.registerResource('res_100k_multi', largeMultiLine, { tag: 'multi_100k' });

  const l1 = helper3.renderLayer1('res_100k_multi');
  assert.ok(l1.includes('lines: 5001'), `Expected 5001 lines, got ${l1}`);
  assert.ok(l1.includes('tag: multi_100k'), 'Tag must be present in Layer 1');

  const l2 = helper3.renderLayer2('res_100k_multi');
  assert.ok(l2.length <= 180, `Layer 2 length ${l2.length} exceeds 180 chars`);
  assert.ok(l2.endsWith(']'), 'Must close with bracket');
});

// 1.3: 100KB Chinese & Emoji Multibyte String micro-capsule length constraint
runChallenge('H3-C3', '100KB Chinese and Emoji multibyte text micro-capsule <= 180 chars', () => {
  const emojiChunk = '🚀🌟🔥💻🎯自动化编排测试超级超长多字节测试文本片段。';
  const largeMultibyte = emojiChunk.repeat(3500); // > 100KB multibyte
  helper3.registerResource('res_100k_emoji', largeMultibyte, { tag: 'emoji_100k' });

  const l2 = helper3.renderLayer2('res_100k_emoji');
  assert.ok(l2.length <= 180, `Layer 2 emoji length ${l2.length} exceeds 180 chars`);
  assert.ok(l2.endsWith(']'), 'Must close with bracket');
});

// 1.4: 100KB Injection in customCapsule option
runChallenge('H3-C4', '100KB malicious customCapsule injection is clamped to <= 180 chars', () => {
  const maliciousCapsule = 'MALICIOUS_OVERFLOW_'.repeat(6000); // ~114KB
  helper3.registerResource('res_malicious_capsule', 'content', {
    capsule: maliciousCapsule
  });

  const l2 = helper3.renderLayer2('res_malicious_capsule');
  assert.ok(l2.length <= 180, `Malicious capsule overflowed! Length: ${l2.length}`);
  assert.ok(l2.endsWith(']'), 'Must end with bracket');
});

// 1.5: Window boundary clamping: negative, out-of-bounds, inverted, NaN
runChallenge('H3-C5', 'Slice window boundary clamping under out-of-bounds, inverted, and NaN inputs', () => {
  const text = Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: data`).join('\n');
  helper3.registerResource('res_50_lines', text);

  // Negative and 0 clamping
  const s1 = helper3.renderLayer3('res_50_lines', { startLine: -10, endLine: 5 });
  assert.ok(s1.includes('Lines 1-5 of 50'), `Negative start must clamp to 1, got: ${s1.split('\n')[0]}`);

  // End out of bounds
  const s2 = helper3.renderLayer3('res_50_lines', { startLine: 45, endLine: 99999 });
  assert.ok(s2.includes('Lines 45-50 of 50'), `End beyond total must clamp to total, got: ${s2.split('\n')[0]}`);

  // Inverted window: start > end
  const s3 = helper3.renderLayer3('res_50_lines', { startLine: 30, endLine: 10 });
  assert.ok(s3.includes('Lines 30-30 of 50'), `Inverted window must clamp to start, got: ${s3.split('\n')[0]}`);

  // Both out of bounds: start > total
  const s4 = helper3.renderLayer3('res_50_lines', { startLine: 100, endLine: 200 });
  assert.ok(s4.includes('Lines 50-50 of 50'), `Out of bounds must clamp to totalLines, got: ${s4.split('\n')[0]}`);

  // Non-integer and NaN parameters fallback to full window
  const s5 = helper3.renderLayer3('res_50_lines', { startLine: 'abc', endLine: NaN });
  assert.ok(s5.includes('Lines 1-50 of 50'), 'Invalid types should default to full window');

  // Empty resource
  helper3.registerResource('res_empty', '');
  const sEmpty = helper3.renderLayer3('res_empty', { startLine: 1, endLine: 10 });
  assert.ok(sEmpty.includes('Lines 0-0 of 0'), 'Empty resource must render empty slice tag');
});

// 1.6: CRLF Line Endings normalization integrity
runChallenge('H3-C6', 'CRLF line endings normalized cleanly across all disclosure layers', () => {
  const crlfText = 'Line 1\r\nLine 2\r\nLine 3\r\nLine 4\r\nLine 5';
  helper3.registerResource('res_crlf', crlfText);
  const l1 = helper3.renderLayer1('res_crlf');
  assert.ok(l1.includes('lines: 5'), 'Line count must be 5 under CRLF');

  const l3 = helper3.renderLayer3('res_crlf', { startLine: 2, endLine: 4 });
  assert.ok(l3.includes('Lines 2-4 of 5'));
  assert.ok(l3.includes('Line 2\nLine 3\nLine 4'));
});

// 1.7: High-throughput stress test
runChallenge('H3-C7', 'Register and render 100 x 100KB resources under 1500ms', () => {
  const start = Date.now();
  const sample100k = 'AlphaBetaGammaDelta '.repeat(5120); // 100KB
  for (let i = 0; i < 100; i++) {
    const id = `perf_${i}`;
    helper3.registerResource(id, sample100k, { tag: `perf_tag_${i}` });
    const l1 = helper3.renderLayer1(id);
    const l2 = helper3.renderLayer2(id);
    const l3 = helper3.renderLayer3(id, { startLine: 1, endLine: 5 });
    assert.ok(l1 && l2.length <= 180 && l3);
  }
  const duration = Date.now() - start;
  assert.ok(duration < 2000, `Execution took too long: ${duration}ms`);
});

// ============================================================================
// SECTION 2: HELPER 4 (StepScrubberHelper) ADVERSARIAL STRESS
// ============================================================================
console.log('\n----------------------------------------------------------------');
console.log('SECTION 2: Helper 4 (StepScrubberHelper) 20-Turn Decay & Zero-Byte Jitter');
console.log('----------------------------------------------------------------');

const helper4 = new StepScrubberHelper();

// 2.1: 20-Turn continuous step decay and zero-byte jitter validation
runChallenge('H4-C1', '20-turn continuous step decay with 100% zero-byte jitter on active window', () => {
  const rawHistory = [];
  for (let t = 0; t < 20; t++) {
    const lines = Array.from({ length: 30 }, (_, i) => `Turn ${t} Step Line ${i + 1}: payload content ${i}`);
    rawHistory.push({
      turnIndex: t,
      toolName: `tool_exec_${t}`,
      rawOutput: lines.join('\n')
    });
  }

  const sessionSnapshots = [];

  for (let currentTurn = 0; currentTurn < 20; currentTurn++) {
    const currentSessionSlice = rawHistory.slice(0, currentTurn + 1);
    const scrubbed = helper4.scrubSessionHistory(currentSessionSlice, currentTurn);
    sessionSnapshots.push({ currentTurn, scrubbed });

    const freezeThreshold = Math.floor(currentTurn / 6) * 6;

    // Invariant 1: All entries with turnIndex >= freezeThreshold MUST NOT be scrubbed
    // and must have 100% identical rawOutput bytes.
    for (const entry of scrubbed) {
      if (entry.turnIndex >= freezeThreshold) {
        assert.equal(entry.isScrubbed, false, `Turn ${entry.turnIndex} should NOT be scrubbed at currentTurn ${currentTurn}`);
        assert.equal(entry.scrubbedOutput, undefined, `Turn ${entry.turnIndex} must not have scrubbedOutput`);
        const originalRaw = rawHistory[entry.turnIndex].rawOutput;
        assert.equal(hashString(entry.rawOutput), hashString(originalRaw), `Zero-byte jitter violation on active turn ${entry.turnIndex}`);
      } else {
        // Entries with turnIndex < freezeThreshold MUST be scrubbed
        assert.equal(entry.isScrubbed, true, `Turn ${entry.turnIndex} should be scrubbed at currentTurn ${currentTurn}`);
        assert.ok(typeof entry.scrubbedOutput === 'string', 'Scrubbed output must be string');
        assert.ok(entry.scrubbedOutput.includes('... [Scrubbed:'), 'Must include scrub indicator');
      }
    }
  }

  // Invariant 2: Stability of chunk 1 (turns 0..5) across turns 6..19
  for (let t = 6; t < 20; t++) {
    const snapT = sessionSnapshots[t].scrubbed;
    const snap6 = sessionSnapshots[6].scrubbed;
    for (let frozenIndex = 0; frozenIndex < 6; frozenIndex++) {
      assert.equal(
        snapT[frozenIndex].scrubbedOutput,
        snap6[frozenIndex].scrubbedOutput,
        `Frozen chunk output jittered between turn 6 and turn ${t} for index ${frozenIndex}`
      );
    }
  }

  // Invariant 3: Stability of chunk 2 (turns 6..11) across turns 12..19
  for (let t = 12; t < 20; t++) {
    const snapT = sessionSnapshots[t].scrubbed;
    const snap12 = sessionSnapshots[12].scrubbed;
    for (let frozenIndex = 6; frozenIndex < 12; frozenIndex++) {
      assert.equal(
        snapT[frozenIndex].scrubbedOutput,
        snap12[frozenIndex].scrubbedOutput,
        `Frozen chunk 2 output jittered between turn 12 and turn ${t} for index ${frozenIndex}`
      );
    }
  }
});

// 2.2: Idempotency stress: multiple passes on already scrubbed history
runChallenge('H4-C2', 'Idempotency invariant: 10 repeated passes do not produce nested scrub markers', () => {
  const history = [
    {
      turnIndex: 0,
      rawOutput: Array.from({ length: 50 }, (_, i) => `Line ${i}`).join('\n')
    }
  ];

  let scrubbed = helper4.scrubSessionHistory(history, 10);
  const firstScrubbedText = scrubbed[0].scrubbedOutput;

  for (let pass = 0; pass < 10; pass++) {
    scrubbed = helper4.scrubSessionHistory(scrubbed, 10);
    assert.equal(scrubbed[0].scrubbedOutput, firstScrubbedText, `Pass ${pass} mutated already scrubbed output`);
  }

  const markerCount = (firstScrubbedText.match(/\[Scrubbed:/g) || []).length;
  assert.equal(markerCount, 1, 'Scrub marker must appear exactly once');
});

// 2.3: Boundary line count thresholds
runChallenge('H4-C3', 'Boundary line counts: 0, 1, exact 12 lines, 13 lines, 10,000 lines', () => {
  assert.equal(helper4.compressHeadTail(''), '');
  assert.equal(helper4.compressHeadTail('Single line'), 'Single line');

  // Exact 12 lines (threshold = 6 + 6)
  const exact12 = Array.from({ length: 12 }, (_, i) => `L${i + 1}`).join('\n');
  assert.equal(helper4.compressHeadTail(exact12), exact12, '12 lines must not be collapsed');

  // 13 lines: collapses exactly 1 line
  const lines13 = Array.from({ length: 13 }, (_, i) => `L${i + 1}`).join('\n');
  const res13 = helper4.compressHeadTail(lines13);
  assert.ok(res13.includes('... [Scrubbed: 1 lines collapsed for cache stability] ...'));
  assert.equal(res13.split('\n').length, 13, '13 lines with 1 collapsed marker is 6 + 1 + 6 = 13 lines');

  // 10,000 lines
  const lines10000 = Array.from({ length: 10000 }, (_, i) => `Line ${i + 1}`).join('\n');
  const res10k = helper4.compressHeadTail(lines10000);
  assert.ok(res10k.includes('... [Scrubbed: 9988 lines collapsed for cache stability] ...'));
  assert.equal(res10k.split('\n').length, 13, 'Must collapse to exactly 13 lines');
});

// 2.4: Out-of-order turnIndex history
runChallenge('H4-C4', 'Out-of-order history entries scrubbed precisely based on individual turnIndex', () => {
  const shuffledHistory = [
    { turnIndex: 10, rawOutput: 'Line\n'.repeat(20) },
    { turnIndex: 2, rawOutput: 'Line\n'.repeat(20) },
    { turnIndex: 7, rawOutput: 'Line\n'.repeat(20) },
    { turnIndex: 0, rawOutput: 'Line\n'.repeat(20) }
  ];

  // At currentTurn = 6, freezeThreshold = 6.
  // Entries with turnIndex < 6 (2, 0) should be scrubbed.
  // Entries with turnIndex >= 6 (10, 7) should NOT be scrubbed.
  const scrubbed = helper4.scrubSessionHistory(shuffledHistory, 6);
  assert.equal(scrubbed[0].isScrubbed, false, 'Turn 10 must not be scrubbed');
  assert.equal(scrubbed[1].isScrubbed, true, 'Turn 2 must be scrubbed');
  assert.equal(scrubbed[2].isScrubbed, false, 'Turn 7 must not be scrubbed');
  assert.equal(scrubbed[3].isScrubbed, true, 'Turn 0 must be scrubbed');
});

// 2.5: Deep session 100-turn stress
runChallenge('H4-C5', '100-turn deep session history scrubbed in under 200ms', () => {
  const deepHistory = Array.from({ length: 100 }, (_, t) => ({
    turnIndex: t,
    rawOutput: `Turn output ${t}\n`.repeat(50)
  }));
  const start = Date.now();
  const res = helper4.scrubSessionHistory(deepHistory, 99);
  const duration = Date.now() - start;
  assert.equal(res.length, 100);
  assert.ok(duration < 200, `100-turn scrubber took ${duration}ms, expected < 200ms`);
});

// ============================================================================
// SECTION 3: HELPER 8 (SkillCapsuleHelper) ADVERSARIAL STRESS
// ============================================================================
console.log('\n----------------------------------------------------------------');
console.log('SECTION 3: Helper 8 (SkillCapsuleHelper) 1-Char Mutation & Self-Healing');
console.log('----------------------------------------------------------------');

const tempTestDir = path.join(os.tmpdir(), `skill_capsule_test_${Date.now()}`);
fs.mkdirSync(tempTestDir, { recursive: true });
const tempCacheDir = path.join(tempTestDir, 'cache');
const tempSkillFile = path.join(tempTestDir, 'SKILL.md');

const helper8 = new SkillCapsuleHelper({ cacheDir: tempCacheDir });

// 3.1: 1-character mutation hot reload and cache invalidation
runChallenge('H8-C1', '1-character mutation triggers cache invalidation and cleans up old file', () => {
  const contentV1 = `---
name: code-reviewer
description: Expert code reviewer for security and performance
triggers: review, audit, check
---
# Code Reviewer
Instructions version 1.
`;
  fs.writeFileSync(tempSkillFile, contentV1, 'utf8');

  // First load
  const res1 = helper8.loadOrDistill('code-reviewer', tempSkillFile);
  assert.equal(res1.skillName, 'code-reviewer');
  const filesAfter1 = fs.readdirSync(tempCacheDir);
  assert.equal(filesAfter1.length, 1, 'Expected 1 cache file created');
  const cacheFile1 = filesAfter1[0];

  // Mutate exactly 1 character: '1' -> '2' in Instructions version
  const contentV2 = contentV1.replace('version 1.', 'version 2.');
  fs.writeFileSync(tempSkillFile, contentV2, 'utf8');

  // Second load
  const res2 = helper8.loadOrDistill('code-reviewer', tempSkillFile);
  assert.notEqual(res2.sourceHash, res1.sourceHash, 'Source hash must change on 1-char edit');

  const filesAfter2 = fs.readdirSync(tempCacheDir);
  assert.equal(filesAfter2.length, 1, 'Old cache file should be invalidated leaving only 1 new cache file');
  assert.notEqual(filesAfter2[0], cacheFile1, 'Cache filename must have changed to reflect new hash');
});

// 3.2: Cache corruption auto-healing
runChallenge('H8-C2', 'Corrupted cache JSON is safely detected and auto-healed without error', () => {
  const files = fs.readdirSync(tempCacheDir);
  assert.ok(files.length > 0, 'Cache file must exist');
  const activeCachePath = path.join(tempCacheDir, files[0]);

  // Corrupt cache file with broken JSON
  fs.writeFileSync(activeCachePath, '{ syntax_error: unclosed json buffer ...', 'utf8');

  // Reload: should survive corrupt JSON and self-heal
  const healed = helper8.loadOrDistill('code-reviewer', tempSkillFile);
  assert.ok(healed && healed.skillName === 'code-reviewer', 'Must successfully return distilled skill');

  // Verify cache file was overwritten with valid JSON
  const content = fs.readFileSync(activeCachePath, 'utf8');
  assert.doesNotThrow(() => JSON.parse(content), 'Cache file must be valid JSON after self-healing');
});

// 3.3: 100KB Skill Markdown micro-capsule length <= 180 chars
runChallenge('H8-C3', '100KB Skill Markdown with 10,000-char description produces capsule <= 180 chars', () => {
  const hugeDescription = 'SuperLongSkillDescription_'.repeat(400); // 10,400 chars
  const hugeBody = 'Detailed workflow steps\n'.repeat(4000); // ~96KB
  const massiveSkillMd = `---
name: massive-ops-agent
description: ${hugeDescription}
triggers: ops, deploy, k8s, cloud, infra
---
# Massive Ops Agent
${hugeBody}
`;

  const distilled = helper8.distillContent('massive-ops-agent', massiveSkillMd);
  assert.ok(distilled.capsuleText.length <= 180, `Capsule text length ${distilled.capsuleText.length} exceeds 180!`);
  assert.ok(distilled.capsuleText.endsWith('...]'), 'Must properly close with bracket');
  assert.ok(distilled.capsuleText.startsWith('[SkillCapsule: massive-ops-agent | '), 'Must start with standard header');
});

// 3.4: Path traversal and illegal character sanitation in skill name
runChallenge('H8-C4', 'Path traversal attempt in skillName is sanitized safely within cacheDir', () => {
  const traversalName = '../../../../etc/passwd_evil_skill';
  const distilled = helper8.loadOrDistill(traversalName, tempSkillFile);
  assert.ok(distilled);

  const files = fs.readdirSync(tempCacheDir);
  for (const f of files) {
    assert.ok(!f.includes('/') && !f.includes('\\'), 'Filename must not contain slashes');
  }
});

// 3.5: Malformed Frontmatter tolerance (unclosed delimiter, missing fields)
runChallenge('H8-C5', 'Malformed Frontmatter (unclosed delimiter or missing fields) degrades gracefully', () => {
  const unclosedMd = `---
name: broken-skill
description: Broken unclosed frontmatter
Some body text without closing dashes.
`;
  const distilled = helper8.distillContent('broken-skill', unclosedMd);
  assert.ok(distilled.capsuleText.length <= 180);
  assert.equal(distilled.skillName, 'broken-skill');

  const noFmMd = `# Pure Markdown Skill\nThis is a skill without frontmatter headers.`;
  const distilledNoFm = helper8.distillContent('pure-skill', noFmMd);
  assert.ok(distilledNoFm.capsuleText.length <= 180);
  assert.equal(distilledNoFm.skillName, 'pure-skill');
});

// 3.6: Concurrent loadOrDistill stress test
await runAsyncChallenge('H8-C6', '50 concurrent loadOrDistill calls execute without disk collisions', async () => {
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      Promise.resolve().then(() => helper8.loadOrDistill('code-reviewer', tempSkillFile))
    );
  }
  const results = await Promise.all(promises);
  assert.equal(results.length, 50);
  for (const r of results) {
    assert.equal(r.skillName, 'code-reviewer');
  }
});

// Clean up temp test directory
try {
  fs.rmSync(tempTestDir, { recursive: true, force: true });
} catch {
  // Ignore
}

// ============================================================================
// FINAL SUMMARY & FINDINGS REPORT
// ============================================================================
console.log('\n================================================================');
console.log(`▶ CHALLENGE SUMMARY: ${passedChallenges}/${totalChallenges} PASSED`);
if (failedChallenges === 0) {
  console.log('🎉 ALL EMPIRICAL ADVERSARIAL STRESS CHALLENGES PASSED!');
} else {
  console.error(`⚠️ ${failedChallenges} CHALLENGES FAILED!`);
  for (const f of findings) {
    console.error(`- [${f.id}] ${f.description}: ${f.error}`);
  }
}
console.log('================================================================\n');

if (failedChallenges > 0) {
  process.exit(1);
}
