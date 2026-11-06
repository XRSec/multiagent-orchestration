/**
 * Purpose: Master E2E Test Suite Orchestrator.
 * Context: Executes Tiers 1-4 tests, gathers results, and emits standardized pass/fail report.
 * Usage: npx tsx test/e2e/run-all-e2e.ts
 * Prerequisites: Node.js 22+, tsx runtime.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const PROJECT_ROOT = path.resolve(__dirname, '../..');

interface TierSuite {
  id: string;
  name: string;
  file: string;
  scope: string;
}

const TIER_SUITES: TierSuite[] = [
  {
    id: 'Tier 1',
    name: 'Feature Coverage (Category-Partition)',
    file: 'test/e2e/tier1-feature-coverage.test.ts',
    scope: 'F01-F04, F06-F09, F12, F14-F15, F18-F23',
  },
  {
    id: 'Tier 2',
    name: 'Boundary Value Analysis & Corner Cases',
    file: 'test/e2e/tier2-boundary-corner.test.ts',
    scope: 'F01-F03, F16-F17, BVA Limits & Default-Deny',
  },
  {
    id: 'Tier 3',
    name: 'Cross-Feature Interactions & Combinatorial',
    file: 'test/e2e/tier3-cross-feature.test.ts',
    scope: 'F14-F15, F18, F20-F21, F23 (Concurrency)',
  },
  {
    id: 'Tier 4',
    name: 'Real-World Scenarios & Workload Verification',
    file: 'test/e2e/tier4-real-world-scenarios.test.ts',
    scope: 'F15-F16, F24-F25, F27 (Ego-Browser UI Invariants)',
  },
];

interface TierResult {
  suite: TierSuite;
  passed: boolean;
  durationMs: number;
  testCount: number;
  output: string;
}

function resolveTsxCommand(): { cmd: string; argsPrefix: string[] } {
  const localTsx = path.join(PROJECT_ROOT, 'extensions/CindyR/node_modules/.bin/tsx');
  if (fs.existsSync(localTsx)) {
    return { cmd: localTsx, argsPrefix: [] };
  }
  return { cmd: 'npx', argsPrefix: ['tsx'] };
}

async function runTier(suite: TierSuite): Promise<TierResult> {
  const startTime = Date.now();
  const filePath = path.join(PROJECT_ROOT, suite.file);
  const { cmd, argsPrefix } = resolveTsxCommand();

  return new Promise((resolve) => {
    const child = spawn(
      cmd,
      [...argsPrefix, filePath],
      {
        cwd: PROJECT_ROOT,
        env: { ...process.env, FORCE_COLOR: '1' },
      }
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (exitCode) => {
      const durationMs = Date.now() - startTime;
      const combinedOutput = stdout + stderr;

      // Extract test count from node:test summary
      const match = combinedOutput.match(/ℹ tests\s+(\d+)/);
      const testCount = match ? parseInt(match[1], 10) : 0;

      resolve({
        suite,
        passed: exitCode === 0,
        durationMs,
        testCount,
        output: combinedOutput,
      });
    });
  });
}

async function main() {
  console.log('\n================================================================================');
  console.log('      DUAL TRACK E2E TEST SUITE RUNNER — CLAUDE MULTIAGENT FULLSTACK            ');
  console.log('================================================================================\n');

  const results: TierResult[] = [];
  let totalTests = 0;
  let allPassed = true;

  for (const suite of TIER_SUITES) {
    process.stdout.write(`⏳ Running [${suite.id}] ${suite.name}... `);
    const res = await runTier(suite);
    results.push(res);
    totalTests += res.testCount;

    if (res.passed) {
      console.log(`\x1b[32mPASSED\x1b[0m (${res.testCount} tests, ${res.durationMs}ms)`);
    } else {
      console.log(`\x1b[31mFAILED\x1b[0m (${res.durationMs}ms)`);
      allPassed = false;
      console.log('\n--- Failure Output ---');
      console.log(res.output);
      console.log('----------------------\n');
    }
  }

  console.log('\n================================================================================');
  console.log('                              E2E EXECUTION SUMMARY                             ');
  console.log('================================================================================');
  console.log('| Tier   | Status | Tests | Duration | Scope                                    |');
  console.log('|--------|--------|-------|----------|------------------------------------------|');

  for (const r of results) {
    const status = r.passed ? '\x1b[32mPASS\x1b[0m  ' : '\x1b[31mFAIL\x1b[0m  ';
    const testsStr = String(r.testCount).padEnd(5);
    const durStr = `${r.durationMs}ms`.padEnd(8);
    const scopeStr = r.suite.scope.padEnd(40);
    console.log(`| ${r.suite.id.padEnd(6)} | ${status} | ${testsStr} | ${durStr} | ${scopeStr} |`);
  }
  console.log('================================================================================');

  if (allPassed) {
    console.log(`\n\x1b[32m✓ 100% E2E TEST SUITE PASSED\x1b[0m (${totalTests} total tests across 4 tiers)\n`);
    process.exit(0);
  } else {
    console.error(`\n\x1b[31m❌ E2E TEST SUITE HAS FAILURES\x1b[0m\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal Runner Error:', err);
  process.exit(1);
});
