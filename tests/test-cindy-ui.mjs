// Purpose: 4-Tier acceptance and regression test suite for Cindy UI reimagined interfaces.
// Context: E2E verification covering export contracts, mock data boundaries, line limits, and Vite build.
// Usage: node tests/test-cindy-ui.mjs [--tier 1|2|3|4] [--milestone m1|m2|m3|m4|all] [--strict-all]
// Prerequisites: Node.js >= 18.0.0, pnpm with vite dependencies installed.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const RENDERER_ROOT = path.join(PROJECT_ROOT, 'apps/desktop/src/renderer');

// Parse CLI flags
const args = process.argv.slice(2);
const tierArg = args.includes('--tier') ? Number(args[args.indexOf('--tier') + 1]) : null;
const milestoneArg = args.includes('--milestone') ? args[args.indexOf('--milestone') + 1].toLowerCase() : 'all';
const isStrictAll = args.includes('--strict-all');
const isVerbose = args.includes('--verbose');

let totalAssertions = 0;
let passedAssertions = 0;
let failedAssertions = 0;
let warningsCount = 0;

function pass(msg) {
  totalAssertions++;
  passedAssertions++;
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  warningsCount++;
  console.log(`  ⚠ [WARN] ${msg}`);
}

function fail(msg, err) {
  totalAssertions++;
  failedAssertions++;
  console.error(`  ✗ [FAIL] ${msg}`);
  if (err && (isVerbose || failedAssertions <= 5)) {
    console.error(`    Details: ${err.message || err}`);
  }
}

// ---------------------------------------------------------------------------
// PROJECT SPECIFICATION MANIFEST (Four Interfaces & Component Topology)
// ---------------------------------------------------------------------------
const SPEC_COMPONENTS = [
  // M1: Mock data & common atoms
  { path: 'mock/mockPartners.js', milestone: 'm1', kind: 'mock', name: 'mockPartners' },
  { path: 'mock/mockGroupSessions.js', milestone: 'm1', kind: 'mock', name: 'mockGroupSessions' },
  { path: 'mock/mockPlanData.js', milestone: 'm1', kind: 'mock', name: 'mockPlanData' },
  { path: 'components/common/SlideOverDrawer.jsx', milestone: 'm1', kind: 'atom', name: 'SlideOverDrawer' },
  { path: 'components/common/AvatarStack.jsx', milestone: 'm1', kind: 'atom', name: 'AvatarStack' },
  { path: 'components/common/RoleStatusBadge.jsx', milestone: 'm1', kind: 'atom', name: 'RoleStatusBadge' },

  // M2: Direct Chat & Group Chat Core Views
  { path: 'views/direct-chat/PartnerDirectChatView.jsx', milestone: 'm2', kind: 'view', name: 'PartnerDirectChatView' },
  { path: 'views/group-chat/BotGroupChatView.jsx', milestone: 'm2', kind: 'view', name: 'BotGroupChatView' },
  { path: 'views/group-chat/BotGroupTimelineItem.jsx', milestone: 'm2', kind: 'subview', name: 'BotGroupTimelineItem' },
  { path: 'views/group-chat/BotGroupPlanCard.jsx', milestone: 'm2', kind: 'subview', name: 'BotGroupPlanCard' },
  { path: 'views/group-chat/BotGroupLiveStatus.jsx', milestone: 'm2', kind: 'subview', name: 'BotGroupLiveStatus' },
  { path: 'views/group-chat/BotGroupComposer.jsx', milestone: 'm2', kind: 'subview', name: 'BotGroupComposer' },

  // M3: Partner Drawer & Group Drawer
  { path: 'views/partner-drawer/PartnerSettingsDrawer.jsx', milestone: 'm3', kind: 'drawer', name: 'PartnerSettingsDrawer' },
  { path: 'views/partner-drawer/SoulMemoryEditorTab.jsx', milestone: 'm3', kind: 'subview', name: 'SoulMemoryEditorTab' },
  { path: 'views/partner-drawer/SkillsAndSandboxTab.jsx', milestone: 'm3', kind: 'subview', name: 'SkillsAndSandboxTab' },
  { path: 'views/group-drawer/GroupSettingsDrawer.jsx', milestone: 'm3', kind: 'drawer', name: 'GroupSettingsDrawer' },
  { path: 'views/group-drawer/GroupProfileTab.jsx', milestone: 'm3', kind: 'subview', name: 'GroupProfileTab' },
  { path: 'views/group-drawer/GroupMembersTab.jsx', milestone: 'm3', kind: 'subview', name: 'GroupMembersTab' },
  { path: 'views/group-drawer/GroupDangerZone.jsx', milestone: 'm3', kind: 'subview', name: 'GroupDangerZone' },

  // M4: Global Integration & Creation Dialogs
  { path: 'App.jsx', milestone: 'm4', kind: 'app', name: 'App' },
  { path: 'components/Sidebar.jsx', milestone: 'm4', kind: 'nav', name: 'Sidebar' },
  { path: 'components/SessionHeader.jsx', milestone: 'm4', kind: 'header', name: 'SessionHeader' },
  { path: 'views/dialogs/BotGroupCreateDialog.jsx', milestone: 'm4', kind: 'dialog', name: 'BotGroupCreateDialog' },
  { path: 'views/dialogs/PartnerCreateDialog.jsx', milestone: 'm4', kind: 'dialog', name: 'PartnerCreateDialog' },
];

// ---------------------------------------------------------------------------
// DATA CONTRACT VALIDATORS (Tier 2 Boundaries & Integrity Rules)
// ---------------------------------------------------------------------------
export function validatePartner(p, idx = 0) {
  assert.ok(p && typeof p === 'object', `Partner[${idx}] must be an object`);
  assert.ok(typeof p.id === 'string' && p.id.trim().length > 0, `Partner[${idx}].id must be non-empty string`);
  assert.ok(typeof p.name === 'string' && p.name.trim().length > 0, `Partner[${idx}].name must be non-empty string`);
  assert.ok(typeof p.role === 'string' && p.role.trim().length > 0, `Partner[${idx}].role must be non-empty string`);
  
  const validStatuses = ['idle', 'running', 'offline', 'active', 'busy'];
  assert.ok(validStatuses.includes(p.status), `Partner[${idx}].status '${p.status}' must be in ${JSON.stringify(validStatuses)}`);

  // SOUL.md / MEMORY.md Markdown contract
  assert.ok(typeof p.soulMd === 'string' && p.soulMd.trim().length >= 10, `Partner[${idx}].soulMd must have >=10 chars Markdown`);
  assert.ok(typeof p.memoryMd === 'string' && p.memoryMd.trim().length >= 10, `Partner[${idx}].memoryMd must have >=10 chars Markdown`);

  // Skills array contract
  assert.ok(Array.isArray(p.skills) && p.skills.length > 0, `Partner[${idx}].skills must be non-empty array`);
  p.skills.forEach((s, sIdx) => {
    if (typeof s === 'string') {
      assert.ok(s.trim().length > 0, `Partner[${idx}].skills[${sIdx}] must be valid string`);
    } else {
      assert.ok(typeof s.id === 'string' && s.id.length > 0, `Partner[${idx}].skills[${sIdx}].id must be string`);
      assert.ok(typeof s.name === 'string' && s.name.length > 0, `Partner[${idx}].skills[${sIdx}].name must be string`);
      if (s.enabled !== undefined) {
        assert.equal(typeof s.enabled, 'boolean', `Partner[${idx}].skills[${sIdx}].enabled must be boolean`);
      }
    }
  });

  // Dual-plane sandbox paths contract
  assert.ok(p.sandboxPaths && typeof p.sandboxPaths === 'object', `Partner[${idx}].sandboxPaths must be an object`);
  assert.ok(typeof p.sandboxPaths.runtimeCwd === 'string' && p.sandboxPaths.runtimeCwd.length > 0, `Partner[${idx}].sandboxPaths.runtimeCwd required`);
  assert.ok(typeof p.sandboxPaths.buildTimePlane === 'string' && p.sandboxPaths.buildTimePlane.length > 0, `Partner[${idx}].sandboxPaths.buildTimePlane required`);
  assert.equal(typeof p.sandboxPaths.isSymlinked, 'boolean', `Partner[${idx}].sandboxPaths.isSymlinked must be boolean`);
}

export function validateGroupSession(g, idx = 0) {
  assert.ok(g && typeof g === 'object', `GroupSession[${idx}] must be an object`);
  assert.ok(typeof g.id === 'string' && g.id.trim().length > 0, `GroupSession[${idx}].id must be non-empty`);
  assert.ok(typeof g.name === 'string' && g.name.trim().length > 0, `GroupSession[${idx}].name must be non-empty`);
  assert.ok(typeof g.leadPartnerId === 'string' && g.leadPartnerId.trim().length > 0, `GroupSession[${idx}].leadPartnerId must be non-empty`);
  assert.ok(typeof g.workdir === 'string' && g.workdir.trim().length > 0, `GroupSession[${idx}].workdir must be non-empty`);

  // Speaking mode enum constraint
  const validModes = ['auto', 'sequential'];
  assert.ok(validModes.includes(g.speakingMode), `GroupSession[${idx}].speakingMode '${g.speakingMode}' must be in ${JSON.stringify(validModes)}`);

  // Group members >= 2 protection
  assert.ok(Array.isArray(g.memberIds), `GroupSession[${idx}].memberIds must be an array`);
  assert.ok(g.memberIds.length >= 2, `GroupSession[${idx}].memberIds.length must be >= 2 (found ${g.memberIds.length})`);
  assert.ok(g.memberIds.includes(g.leadPartnerId), `GroupSession[${idx}].leadPartnerId must be present in memberIds`);

  // Messages array contract
  assert.ok(Array.isArray(g.messages), `GroupSession[${idx}].messages must be an array`);
}

export function validatePlanData(plan) {
  assert.ok(plan && typeof plan === 'object', 'Plan data must be an object');
  assert.ok(typeof plan.id === 'string' && plan.id.trim().length > 0, 'Plan.id must be non-empty');
  assert.ok(typeof plan.title === 'string' && plan.title.trim().length > 0, 'Plan.title must be non-empty');
  assert.ok(typeof plan.organizerId === 'string' && plan.organizerId.trim().length > 0, 'Plan.organizerId must be non-empty');

  const validPlanStatuses = ['proposed', 'running', 'done', 'failed', 'paused'];
  assert.ok(validPlanStatuses.includes(plan.status), `Plan.status '${plan.status}' must be in ${JSON.stringify(validPlanStatuses)}`);

  // Step continuity constraint
  assert.ok(Array.isArray(plan.steps) && plan.steps.length >= 1, 'Plan.steps must be non-empty array');
  const baseIndex = plan.steps[0].index;
  assert.ok(baseIndex === 0 || baseIndex === 1, `Plan.steps base index must be 0 or 1, got ${baseIndex}`);

  const validStepStatuses = ['pending', 'running', 'done', 'failed'];
  plan.steps.forEach((step, sIdx) => {
    assert.equal(step.index, baseIndex + sIdx, `Plan step index must be strictly continuous without gaps: expected ${baseIndex + sIdx}, got ${step.index}`);
    assert.ok(typeof step.title === 'string' && step.title.length > 0, `Plan step[${sIdx}].title required`);
    assert.ok(typeof step.assigneeId === 'string' && step.assigneeId.length > 0, `Plan step[${sIdx}].assigneeId required`);
    assert.ok(validStepStatuses.includes(step.status), `Plan step[${sIdx}].status '${step.status}' must be in ${JSON.stringify(validStepStatuses)}`);
    assert.ok(Array.isArray(step.outputFiles), `Plan step[${sIdx}].outputFiles must be an array`);
  });
}

// ---------------------------------------------------------------------------
// TIER 1: FEATURE COVERAGE & EXPORT CONTRACTS
// ---------------------------------------------------------------------------
async function runTier1() {
  console.log('\n================================================================');
  console.log('TIER 1: Feature Coverage & Interface Contracts');
  console.log('================================================================');

  let existingCount = 0;
  let missingCount = 0;

  for (const item of SPEC_COMPONENTS) {
    const fullPath = path.join(RENDERER_ROOT, item.path);
    const exists = fs.existsSync(fullPath);

    if (exists) {
      existingCount++;
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(content.length > 0, `File ${item.path} is empty`);
      
      const hasExport = /export\s+(default|const|function|let|var|class|\{)/.test(content);
      if (hasExport) {
        pass(`[${item.milestone.toUpperCase()}] ${item.path} (Export verified)`);
      } else {
        warn(`[${item.milestone.toUpperCase()}] ${item.path} exists but lacks explicit export`);
      }
    } else {
      missingCount++;
      if (isStrictAll || (milestoneArg !== 'all' && item.milestone === milestoneArg)) {
        fail(`[${item.milestone.toUpperCase()}] Missing expected file: ${item.path}`);
      } else {
        console.log(`  - [PENDING] [${item.milestone.toUpperCase()}] ${item.path}`);
      }
    }
  }

  pass(`Tier 1 inventory check completed (${existingCount} implemented, ${missingCount} pending)`);
}

// ---------------------------------------------------------------------------
// TIER 2: BOUNDARY & INTEGRITY VALIDATION
// ---------------------------------------------------------------------------
async function runTier2() {
  console.log('\n================================================================');
  console.log('TIER 2: Boundary & Integrity Validation (Mock Data & Adversarial Edge Cases)');
  console.log('================================================================');

  // 1. Adversarial Edge Cases to verify contract validators actively reject corrupt data
  console.log('  Testing Adversarial Boundary Conditions (Negative Security Tests):');
  
  // Adversarial: Partner missing soulMd / memoryMd
  assert.throws(() => {
    validatePartner({
      id: 'bad-partner',
      name: 'Bad',
      role: 'Bad',
      status: 'idle',
      soulMd: '', // invalid
      memoryMd: 'valid memory',
      skills: ['s1'],
      sandboxPaths: { runtimeCwd: '/tmp', buildTimePlane: '/tmp', isSymlinked: true }
    });
  }, /soulMd/, 'Validator must reject empty soulMd');
  pass('Boundary test: Rejected partner with empty soulMd');

  // Adversarial: Group with <2 members
  assert.throws(() => {
    validateGroupSession({
      id: 'g-lonely',
      name: 'Solo Group',
      leadPartnerId: 'p1',
      workdir: '/repo',
      speakingMode: 'auto',
      memberIds: ['p1'], // boundary violation: < 2 members
      messages: []
    });
  }, /memberIds\.length must be >= 2/, 'Validator must enforce minimum 2 group members');
  pass('Boundary test: Rejected group with < 2 members');

  // Adversarial: Lead partner not in memberIds
  assert.throws(() => {
    validateGroupSession({
      id: 'g-orphan',
      name: 'Orphan Lead',
      leadPartnerId: 'ghost-lead',
      workdir: '/repo',
      speakingMode: 'auto',
      memberIds: ['p1', 'p2'],
      messages: []
    });
  }, /leadPartnerId must be present in memberIds/, 'Validator must ensure lead is in memberIds');
  pass('Boundary test: Rejected group with leadPartnerId not in memberIds');

  // Adversarial: Invalid speaking mode
  assert.throws(() => {
    validateGroupSession({
      id: 'g-chaos',
      name: 'Chaos Speaking',
      leadPartnerId: 'p1',
      workdir: '/repo',
      speakingMode: 'broadcast_all_simultaneously', // invalid
      memberIds: ['p1', 'p2'],
      messages: []
    });
  }, /speakingMode/, 'Validator must reject invalid speakingMode');
  pass('Boundary test: Rejected invalid speakingMode');

  // Adversarial: Plan with step discontinuity
  assert.throws(() => {
    validatePlanData({
      id: 'plan-gap',
      title: 'Gap Plan',
      organizerId: 'lead',
      status: 'running',
      steps: [
        { index: 0, title: 'Step 0', assigneeId: 'p1', status: 'done', outputFiles: [] },
        { index: 2, title: 'Step 2 (Skip 1)', assigneeId: 'p2', status: 'pending', outputFiles: [] },
      ]
    });
  }, /strictly continuous/, 'Validator must reject discontinuous plan step index');
  pass('Boundary test: Rejected plan with discontinuous step indices');

  // 2. Canonical Real Mock Data Integrity Verification
  console.log('  Testing Canonical / Real Mock Files:');
  const partnersPath = path.join(RENDERER_ROOT, 'mock/mockPartners.js');
  const groupsPath = path.join(RENDERER_ROOT, 'mock/mockGroupSessions.js');
  const planPath = path.join(RENDERER_ROOT, 'mock/mockPlanData.js');

  if (fs.existsSync(partnersPath)) {
    try {
      const mod = await import(pathToFileURL(partnersPath).href);
      const partners = mod.mockPartners || mod.default;
      assert.ok(Array.isArray(partners), 'mockPartners must export an array');
      assert.ok(partners.length >= 3, `Expected at least 3 partners, found ${partners.length}`);
      partners.forEach(validatePartner);
      pass(`mockPartners.js validated (${partners.length} partners comply with all contracts)`);
    } catch (err) {
      fail('mockPartners.js failed boundary validation', err);
    }
  } else {
    console.log('  - [PENDING] apps/desktop/src/renderer/mock/mockPartners.js not yet committed by M1 worker');
  }

  if (fs.existsSync(groupsPath)) {
    try {
      const mod = await import(pathToFileURL(groupsPath).href);
      const groups = mod.mockGroupSessions || mod.default;
      assert.ok(Array.isArray(groups), 'mockGroupSessions must export an array');
      groups.forEach(validateGroupSession);
      pass(`mockGroupSessions.js validated (${groups.length} groups comply with all contracts)`);
    } catch (err) {
      fail('mockGroupSessions.js failed boundary validation', err);
    }
  } else {
    console.log('  - [PENDING] apps/desktop/src/renderer/mock/mockGroupSessions.js not yet committed by M1 worker');
  }

  if (fs.existsSync(planPath)) {
    try {
      const mod = await import(pathToFileURL(planPath).href);
      const plan = mod.mockPlanData || mod.default;
      if (Array.isArray(plan)) {
        plan.forEach(validatePlanData);
      } else {
        validatePlanData(plan);
      }
      pass('mockPlanData.js validated (Plan step continuity & status comply with contracts)');
    } catch (err) {
      fail('mockPlanData.js failed boundary validation', err);
    }
  } else {
    console.log('  - [PENDING] apps/desktop/src/renderer/mock/mockPlanData.js not yet committed by M1 worker');
  }
}

// ---------------------------------------------------------------------------
// TIER 3: CODE QUALITY & LINE LIMITS SCAN (<= 600 Lines Hard Redline)
// ---------------------------------------------------------------------------
function getSourceFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        getSourceFiles(fullPath, fileList);
      }
    } else if (/\.(jsx?|tsx?)$/.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function runTier3() {
  console.log('\n================================================================');
  console.log('TIER 3: Code Quality & Line Limits Scan (<= 600 Lines Rule)');
  console.log('================================================================');

  const files = getSourceFiles(RENDERER_ROOT);
  assert.ok(files.length > 0, 'No renderer source files found for line limit inspection');

  let fileViolations = 0;
  let fileWarnings = 0;
  let totalLines = 0;
  const fileReports = [];

  for (const f of files) {
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n').length;
    totalLines += lines;
    const relPath = path.relative(RENDERER_ROOT, f);

    let status = 'OK';
    if (lines > 600) {
      status = 'FAIL (>600)';
      fileViolations++;
      fail(`File exceeds hard redline of 600 lines: ${relPath} (${lines} lines)`);
    } else if (lines >= 500) {
      status = 'WARN (>=500)';
      fileWarnings++;
      warn(`File is approaching 600 limit: ${relPath} (${lines} lines)`);
    }

    fileReports.push({ relPath, lines, status });
  }

  // Print summary breakdown table
  console.log('  File Line Count Distribution:');
  fileReports.sort((a, b) => b.lines - a.lines);
  fileReports.forEach(r => {
    const bar = '█'.repeat(Math.min(30, Math.round((r.lines / 600) * 30)));
    console.log(`    ${r.lines.toString().padStart(4)} lines [${bar.padEnd(30, ' ')}] ${r.status.padEnd(12)} ${r.relPath}`);
  });

  if (fileViolations === 0) {
    pass(`All ${files.length} renderer source files are strictly <= 600 lines (Total lines: ${totalLines})`);
  }
}

// ---------------------------------------------------------------------------
// TIER 4: BUILD VERIFICATION (pnpm exec vite build)
// ---------------------------------------------------------------------------
function runTier4() {
  console.log('\n================================================================');
  console.log('TIER 4: Build Verification (pnpm exec vite build)');
  console.log('================================================================');

  console.log('  Running: pnpm exec vite build ...');
  const buildResult = spawnSync('pnpm', ['exec', 'vite', 'build'], {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    shell: true,
  });

  if (buildResult.status === 0) {
    pass('Vite production build succeeded with exit code 0');

    // Verify build artifacts
    const distIndex = path.join(PROJECT_ROOT, 'apps/desktop/dist/index.html');
    const distAssets = path.join(PROJECT_ROOT, 'apps/desktop/dist/assets');

    assert.ok(fs.existsSync(distIndex), 'dist/index.html must exist');
    const indexStats = fs.statSync(distIndex);
    assert.ok(indexStats.size > 0, 'dist/index.html size must be > 0');
    pass(`dist/index.html verified (${indexStats.size} bytes)`);

    assert.ok(fs.existsSync(distAssets), 'dist/assets directory must exist');
    const assetFiles = fs.readdirSync(distAssets);
    assert.ok(assetFiles.length > 0, 'dist/assets must contain bundled JS/CSS chunks');
    pass(`dist/assets bundle verified (${assetFiles.length} chunk files found)`);
  } else {
    fail('Vite build failed with non-zero exit code', new Error(buildResult.stderr || buildResult.stdout));
  }
}

// ---------------------------------------------------------------------------
// TEST RUNNER MAIN DISPATCHER
// ---------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();
  console.log('▶ Starting Cindy UI 4-Tier Automated Acceptance Test Suite');
  console.log(`  Root: ${PROJECT_ROOT}`);
  console.log(`  Mode: ${isStrictAll ? 'STRICT-ALL' : 'PROGRESSIVE'} | Milestone: ${milestoneArg}`);

  try {
    if (!tierArg || tierArg === 1) await runTier1();
    if (!tierArg || tierArg === 2) await runTier2();
    if (!tierArg || tierArg === 3) runTier3();
    if (!tierArg || tierArg === 4) runTier4();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log('\n================================================================');
    console.log('TEST SUITE EXECUTION SUMMARY');
    console.log('================================================================');
    console.log(`  Total Assertions : ${totalAssertions}`);
    console.log(`  Passed           : ${passedAssertions}`);
    console.log(`  Failed           : ${failedAssertions}`);
    console.log(`  Warnings         : ${warningsCount}`);
    console.log(`  Duration         : ${duration}s`);

    if (failedAssertions > 0) {
      console.error(`\n❌ TEST SUITE FAILED with ${failedAssertions} error(s).\n`);
      process.exit(1);
    } else {
      console.log('\n✅ TEST SUITE PASSED (All active tiers verified successfully).\n');
      process.exit(0);
    }
  } catch (err) {
    console.error('\n💥 FATAL UNCAUGHT TEST ERROR:', err);
    process.exit(1);
  }
}

main();
