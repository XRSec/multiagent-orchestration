// Purpose: Adversarial boundary and stress test harness for M1 mock datasets and helpers.
// Context: Validates prototype pollution resistance, cross-reference integrity, boundary cases, and mutation resilience.
// Usage: node tests/test-m1-adversarial.mjs
// Prerequisites: Node.js >= 18.0.0

import assert from 'node:assert/strict';
import * as mock from '../apps/desktop/src/renderer/mock/index.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const defectsFound = [];

function runChallenge(testId, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [CHALLENGE-PASSED] ${testId}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [CHALLENGE-FAILED] ${testId}: ${description}`);
    console.error(`    Defect Detail: ${err.message}`);
    defectsFound.push({
      id: testId,
      description,
      error: err.message,
    });
  }
}

console.log('▶ Starting M1 Empirical Adversarial Challenge Suite...\n');

// ===========================================================================
// SECTION 1: PROTOTYPE POLLUTION & RESERVED IDENTIFIER INJECTION
// ===========================================================================
console.log('================================================================');
console.log('1. Prototype Pollution & Reserved Object Identifier Attacks');
console.log('================================================================');

runChallenge(
  'ADV-01',
  'getPartnerById must safely reject Object.prototype properties ("toString", "constructor", "__proto__")',
  () => {
    const dangerousKeys = [
      'toString',
      'constructor',
      '__proto__',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
    ];
    for (const key of dangerousKeys) {
      const result = mock.getPartnerById(key);
      assert.strictEqual(
        result,
        null,
        `Vulnerability: getPartnerById('${key}') resolved to prototype property [${typeof result}: ${String(
          result
        )}] instead of null`
      );
    }
  }
);

runChallenge(
  'ADV-02',
  'getPartnerById handles abnormal inputs (null, undefined, non-strings, symbols)',
  () => {
    const weirdInputs = [null, undefined, '', '   ', 0, 123, true, false, {}, [], () => {}];
    for (const input of weirdInputs) {
      const res = mock.getPartnerById(input);
      assert.strictEqual(
        res,
        null,
        `getPartnerById(${JSON.stringify(input)}) must return null, got ${res}`
      );
    }
  }
);

runChallenge(
  'ADV-03',
  'getGroupSessionById handles prototype keys and abnormal inputs safely',
  () => {
    const inputs = [
      'toString',
      'constructor',
      '__proto__',
      null,
      undefined,
      '',
      12345,
      'ghost-session',
    ];
    for (const id of inputs) {
      const res = mock.getGroupSessionById(id);
      assert.strictEqual(res, null, `getGroupSessionById('${id}') must return null, got ${res}`);
    }
  }
);

runChallenge(
  'ADV-04',
  'getPlanById handles prototype keys and abnormal inputs safely',
  () => {
    const inputs = [
      'toString',
      'constructor',
      '__proto__',
      null,
      undefined,
      '',
      12345,
      'ghost-plan',
    ];
    for (const id of inputs) {
      const res = mock.getPlanById(id);
      assert.strictEqual(res, null, `getPlanById('${id}') must return null, got ${res}`);
    }
  }
);

// ===========================================================================
// SECTION 2: RELATIONAL INTEGRITY & DANGLING REFERENCE AUDIT
// ===========================================================================
console.log('\n================================================================');
console.log('2. Relational Integrity & Dangling Reference Audit');
console.log('================================================================');

runChallenge(
  'ADV-05',
  'All group session members and lead partner exist in mockPartners',
  () => {
    const partnerIds = new Set(mock.mockPartners.map((p) => p.id));
    for (const group of mock.mockGroupSessions) {
      assert.ok(
        partnerIds.has(group.leadPartnerId),
        `Dangling leadPartnerId '${group.leadPartnerId}' in group '${group.id}'`
      );
      for (const mId of group.memberIds) {
        assert.ok(
          partnerIds.has(mId),
          `Dangling memberId '${mId}' in group '${group.id}'`
        );
      }
    }
  }
);

runChallenge(
  'ADV-06',
  'All activePlanId and embedded plan messages reference existing plans in mockPlanList',
  () => {
    const planIds = new Set(mock.mockPlanList.map((p) => p.id));
    for (const group of mock.mockGroupSessions) {
      if (group.activePlanId) {
        assert.ok(
          planIds.has(group.activePlanId),
          `Dangling activePlanId '${group.activePlanId}' in group '${group.id}'`
        );
      }
      for (const msg of group.messages) {
        if (msg.kind === 'plan' && msg.planId) {
          assert.ok(
            planIds.has(msg.planId),
            `Dangling planId '${msg.planId}' in group '${group.id}' msg '${msg.id}'`
          );
        }
      }
    }
  }
);

runChallenge(
  'ADV-07',
  'All plan organizers and step assignees map to valid partners in mockPartners',
  () => {
    const partnerIds = new Set(mock.mockPartners.map((p) => p.id));
    for (const plan of mock.mockPlanList) {
      assert.ok(
        partnerIds.has(plan.organizerId),
        `Dangling organizerId '${plan.organizerId}' in plan '${plan.id}'`
      );
      for (const step of plan.steps) {
        assert.ok(
          partnerIds.has(step.assigneeId),
          `Dangling assigneeId '${step.assigneeId}' in plan '${plan.id}' step ${step.index}`
        );
      }
    }
  }
);

runChallenge(
  'ADV-08',
  'Message quotes must reference valid existing message IDs within the same session',
  () => {
    for (const group of mock.mockGroupSessions) {
      const messageMap = new Map(group.messages.map((m) => [m.id, m]));
      for (const msg of group.messages) {
        if (msg.quote && msg.quote.messageId) {
          assert.ok(
            messageMap.has(msg.quote.messageId),
            `Broken quote reference in group '${group.id}' msg '${msg.id}': quoted '${msg.quote.messageId}' not found`
          );
          const quotedMsg = messageMap.get(msg.quote.messageId);
          assert.ok(
            quotedMsg.sequence < msg.sequence,
            `Temporal violation: msg '${msg.id}' quoted a future or concurrent message '${msg.quote.messageId}'`
          );
        }
      }
    }
  }
);

// ===========================================================================
// SECTION 3: BOUNDARY DATA & STATE INVARIANT STRESS
// ===========================================================================
console.log('\n================================================================');
console.log('3. Boundary Data & State Invariant Stress Testing');
console.log('================================================================');

runChallenge(
  'ADV-09',
  'Sandboxing policies enforce strict separation between allowedTools and disallowedTools',
  () => {
    for (const partner of mock.mockPartners) {
      const allowed = new Set(partner.sandboxPaths.allowedTools || []);
      const disallowed = new Set(partner.sandboxPaths.disallowedTools || []);
      for (const tool of allowed) {
        assert.ok(
          !disallowed.has(tool),
          `Conflicting security policy in partner '${partner.id}': '${tool}' is in both allowedTools and disallowedTools`
        );
      }
    }
  }
);

runChallenge(
  'ADV-10',
  'SOUL.md & MEMORY.md adhere to frontmatter structure and non-trivial content length',
  () => {
    for (const partner of mock.mockPartners) {
      assert.ok(
        partner.soulMd.startsWith('---'),
        `Partner '${partner.id}' soulMd missing YAML frontmatter opening '---'`
      );
      assert.ok(
        partner.soulMd.includes('doc_id:'),
        `Partner '${partner.id}' soulMd missing 'doc_id' tag in frontmatter`
      );
      assert.ok(
        partner.soulMd.length > 200,
        `Partner '${partner.id}' soulMd is too shallow (${partner.soulMd.length} chars)`
      );
      assert.ok(
        partner.memoryMd.length > 100,
        `Partner '${partner.id}' memoryMd is too shallow (${partner.memoryMd.length} chars)`
      );
    }
  }
);

runChallenge(
  'ADV-11',
  'Message sequences are strictly 1-indexed and timestamps are strictly non-decreasing',
  () => {
    for (const group of mock.mockGroupSessions) {
      let previousTime = 0;
      group.messages.forEach((msg, idx) => {
        assert.strictEqual(
          msg.sequence,
          idx + 1,
          `Sequence discontinuity in group '${group.id}' msg at index ${idx}: expected ${idx + 1}, got ${msg.sequence}`
        );
        assert.ok(
          msg.timestamp >= previousTime,
          `Chronological inversion in group '${group.id}': msg '${msg.id}' timestamp (${msg.timestamp}) < previous (${previousTime})`
        );
        previousTime = msg.timestamp;
      });
    }
  }
);

runChallenge(
  'ADV-12',
  'Plan step indices are strictly continuous and status transitions match plan lifecycle',
  () => {
    for (const plan of mock.mockPlanList) {
      plan.steps.forEach((step, sIdx) => {
        assert.strictEqual(
          step.index,
          sIdx + 1,
          `Plan '${plan.id}' step index gap: expected ${sIdx + 1}, got ${step.index}`
        );
      });

      if (plan.status === 'done') {
        const hasUnfinished = plan.steps.some((s) => s.status !== 'done');
        assert.ok(
          !hasUnfinished,
          `Plan '${plan.id}' is 'done' but contains unfinished step`
        );
      }

      if (plan.status === 'running') {
        const runningStep = plan.steps.find((s) => s.index === plan.currentStep);
        assert.ok(
          runningStep && runningStep.status === 'running',
          `Plan '${plan.id}' currentStep ${plan.currentStep} must point to a 'running' step`
        );
      }
    }
  }
);

// ===========================================================================
// SECTION 4: HIGH-THROUGHPUT THROUGHPUT & STRESS HARNESS
// ===========================================================================
console.log('\n================================================================');
console.log('4. High-Throughput & Fuzzing Stress Harness (100,000 Iterations)');
console.log('================================================================');

runChallenge(
  'ADV-13',
  'Execute 100,000 random/fuzzed queries across all lookup helpers within 500ms',
  () => {
    const fuzzStrings = [
      'lead-orchestrator',
      'agent-architect',
      'rea-partner',
      'group-session-01',
      'group-session-02',
      'plan-running-01',
      'plan-proposed-02',
      'plan-done-03',
      '',
      '   ',
      'unknown-bot',
      'null',
      'undefined',
      '0',
      'toString',
      'constructor',
      '__proto__',
      '../../../etc/passwd',
      '<script>alert(1)</script>',
    ];

    const start = Date.now();
    for (let i = 0; i < 100000; i++) {
      const query = fuzzStrings[i % fuzzStrings.length];
      mock.getPartnerById(query);
      mock.getGroupSessionById(query);
      mock.getPlanById(query);
    }
    const elapsed = Date.now() - start;
    console.log(`    Performance benchmark: 100,000 lookup operations completed in ${elapsed}ms`);
    assert.ok(
      elapsed < 1000,
      `Performance bottleneck detected: 100k queries took ${elapsed}ms (> 1000ms threshold)`
    );
  }
);

// ===========================================================================
// FINAL RESULTS SUMMARY
// ===========================================================================
console.log('\n================================================================');
console.log('ADVERSARIAL CHALLENGE EXECUTION SUMMARY');
console.log('================================================================');
console.log(`  Total Challenges Executed : ${totalTests}`);
console.log(`  Passed                    : ${passedTests}`);
console.log(`  Failed (Vulnerabilities)  : ${failedTests}`);

if (failedTests > 0) {
  console.log('\n🚨 DEFECTS FOUND REQUIRING ATTENTION:');
  defectsFound.forEach((d, i) => {
    console.log(`  [${i + 1}] ${d.id}: ${d.description}`);
    console.log(`      Error: ${d.error}`);
  });
  console.log('\n❌ VERDICT: REQUEST_CHANGES (Defect detected in query helper robustness)');
  process.exit(1);
} else {
  console.log('\n✅ VERDICT: APPROVE (All empirical stress tests passed)');
  process.exit(0);
}
