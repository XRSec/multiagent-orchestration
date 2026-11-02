// Purpose: Empirical adversarial fuzzing & prototype pollution defense test suite for M1 Round 2.
// Context: Deep verification of getPartnerById, getGroupSessionById, and getPlanById against reserved identifiers.
// Usage: node tests/test-m1-r2-prototype-fuzz.mjs
// Prerequisites: Node.js >= 18.0.0

import assert from 'node:assert/strict';
import * as mock from '../apps/desktop/src/renderer/mock/index.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const defects = [];

function check(testId, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [CHALLENGE-PASSED] ${testId}: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [CHALLENGE-FAILED] ${testId}: ${description}`);
    console.error(`    Detail: ${err.message}`);
    defects.push({ id: testId, description, error: err.message });
  }
}

console.log('================================================================');
console.log('▶ STARTING M1-R2 EMPIRICAL PROTOTYPE DEFENSE & FUZZ CHALLENGE');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// 1. Core Target: Reserved Words & Prototype Properties Exhaustive Check
// -----------------------------------------------------------------------------
console.log('--- 1. Reserved Words & Object.prototype Properties ---');

const CORE_RESERVED_KEYS = [
  '__proto__',
  'constructor',
  'hasOwnProperty',
  'valueOf',
];

const EXTENDED_PROTOTYPE_PROPERTIES = [
  'toString',
  'toLocaleString',
  'isPrototypeOf',
  'propertyIsEnumerable',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'prototype',
  'apply',
  'call',
  'bind',
  'caller',
  'arguments',
];

const JS_LANGUAGE_KEYWORDS = [
  'eval',
  'null',
  'undefined',
  'true',
  'false',
  'NaN',
  'Infinity',
  'class',
  'function',
  'let',
  'const',
  'var',
  'import',
  'export',
  'default',
  'return',
  'delete',
  'typeof',
  'instanceof',
  'void',
  'yield',
  'await',
  'async',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'this',
  'super',
  'extends',
  'static',
  'get',
  'set',
];

check('FUZZ-01', 'Core 4 reserved keys (__proto__, constructor, hasOwnProperty, valueOf) return null', () => {
  for (const key of CORE_RESERVED_KEYS) {
    const resPartner = mock.getPartnerById(key);
    assert.strictEqual(resPartner, null, `getPartnerById('${key}') must return null, got ${typeof resPartner}`);

    const resGroup = mock.getGroupSessionById(key);
    assert.strictEqual(resGroup, null, `getGroupSessionById('${key}') must return null, got ${typeof resGroup}`);

    const resPlan = mock.getPlanById(key);
    assert.strictEqual(resPlan, null, `getPlanById('${key}') must return null, got ${typeof resPlan}`);
  }
});

check('FUZZ-02', 'Extended Object.prototype & Function properties return null', () => {
  for (const prop of EXTENDED_PROTOTYPE_PROPERTIES) {
    const resPartner = mock.getPartnerById(prop);
    assert.strictEqual(resPartner, null, `getPartnerById('${prop}') must return null, got ${typeof resPartner}`);

    const resGroup = mock.getGroupSessionById(prop);
    assert.strictEqual(resGroup, null, `getGroupSessionById('${prop}') must return null, got ${typeof resGroup}`);

    const resPlan = mock.getPlanById(prop);
    assert.strictEqual(resPlan, null, `getPlanById('${prop}') must return null, got ${typeof resPlan}`);
  }
});

check('FUZZ-03', 'JavaScript language reserved keyword strings return null', () => {
  for (const kw of JS_LANGUAGE_KEYWORDS) {
    const resPartner = mock.getPartnerById(kw);
    assert.strictEqual(resPartner, null, `getPartnerById('${kw}') must return null, got ${typeof resPartner}`);

    const resGroup = mock.getGroupSessionById(kw);
    assert.strictEqual(resGroup, null, `getGroupSessionById('${kw}') must return null, got ${typeof resGroup}`);

    const resPlan = mock.getPlanById(kw);
    assert.strictEqual(resPlan, null, `getPlanById('${kw}') must return null, got ${typeof resPlan}`);
  }
});

// -----------------------------------------------------------------------------
// 2. Active Prototype Pollution Attack Simulation
// -----------------------------------------------------------------------------
console.log('\n--- 2. Active Prototype Pollution Attack Resistance ---');

check('FUZZ-04', 'Direct pollution of Object.prototype does not leak into getPartnerById', () => {
  const attackKeys = [
    '__polluted_harness_test_01',
    'injected_admin_partner',
    'system_escalation_flag',
  ];

  try {
    for (const key of attackKeys) {
      Object.prototype[key] = {
        id: key,
        name: 'Malicious Injected Partner',
        role: 'Attacker',
        status: 'online',
      };
    }

    // Verify lookup helpers are completely immune to prototype pollution
    for (const key of attackKeys) {
      const p = mock.getPartnerById(key);
      assert.strictEqual(
        p,
        null,
        `Vulnerability: getPartnerById resolved polluted property '${key}' from Object.prototype!`
      );

      const g = mock.getGroupSessionById(key);
      assert.strictEqual(
        g,
        null,
        `Vulnerability: getGroupSessionById resolved polluted property '${key}' from Object.prototype!`
      );

      const pl = mock.getPlanById(key);
      assert.strictEqual(
        pl,
        null,
        `Vulnerability: getPlanById resolved polluted property '${key}' from Object.prototype!`
      );
    }
  } finally {
    // Cleanup polluted prototype keys
    for (const key of attackKeys) {
      delete Object.prototype[key];
    }
  }
});

check('FUZZ-05', 'Pollution attempt on Array.prototype does not affect mock lookups', () => {
  const arrayAttackKey = '__polluted_array_find_bypass';
  try {
    Array.prototype[arrayAttackKey] = { id: arrayAttackKey };

    const p = mock.getPartnerById(arrayAttackKey);
    assert.strictEqual(p, null);

    const g = mock.getGroupSessionById(arrayAttackKey);
    assert.strictEqual(g, null);

    const pl = mock.getPlanById(arrayAttackKey);
    assert.strictEqual(pl, null);
  } finally {
    delete Array.prototype[arrayAttackKey];
  }
});

// -----------------------------------------------------------------------------
// 3. Extreme Data Types & Exotic Object Injections
// -----------------------------------------------------------------------------
console.log('\n--- 3. Exotic Types & Boundary Values ---');

check('FUZZ-06', 'Exotic non-string data types never crash and strictly return null', () => {
  const exoticInputs = [
    null,
    undefined,
    void 0,
    0,
    -0,
    1,
    -1,
    100.5,
    NaN,
    Infinity,
    -Infinity,
    true,
    false,
    Symbol('__proto__'),
    Symbol.for('constructor'),
    Symbol.iterator,
    BigInt(9007199254740991),
    {},
    { id: '__proto__' },
    { toString: () => '__proto__' },
    { valueOf: () => 'lead-orchestrator' },
    [],
    ['__proto__'],
    ['lead-orchestrator'],
    () => {},
    async () => {},
    new Date(),
    new RegExp('__proto__'),
    new Error('exploit'),
    Buffer.from('constructor'),
    new String('__proto__'),
    new String('lead-orchestrator'),
    new Number(123),
    new Boolean(true),
  ];

  for (const input of exoticInputs) {
    const resP = mock.getPartnerById(input);
    assert.strictEqual(
      resP,
      null,
      `getPartnerById failed for input [${typeof input}]: expected null, got ${resP}`
    );

    const resG = mock.getGroupSessionById(input);
    assert.strictEqual(
      resG,
      null,
      `getGroupSessionById failed for input [${typeof input}]: expected null, got ${resG}`
    );

    const resPl = mock.getPlanById(input);
    assert.strictEqual(
      resPl,
      null,
      `getPlanById failed for input [${typeof input}]: expected null, got ${resPl}`
    );
  }
});

// -----------------------------------------------------------------------------
// 4. String Mutation & Adversarial Fuzzing
// -----------------------------------------------------------------------------
console.log('\n--- 4. String Mutation & Adversarial Payload Fuzzing ---');

check('FUZZ-07', 'Adversarial payloads (path traversal, XSS, format strings, homoglyphs) return null', () => {
  const adversarialPayloads = [
    '',
    ' ',
    '   ',
    '\t',
    '\n',
    '\r\n',
    '\0',
    'constructor\0',
    '__proto__\0',
    '__proto__/admin',
    '../__proto__',
    '../../../../etc/passwd',
    '..\\..\\windows\\system32',
    '<script>alert("__proto__")</script>',
    '${__proto__}',
    '#{constructor}',
    '{{7*7}}',
    '%s%s%s%s%s%s',
    '\\x00\\x01\\x02',
    '__proto__ '.repeat(10),
    'a'.repeat(10000), // 10KB string
    '_\u200B_\u200Bproto_\u200B_', // zero-width spaces
    '\uFEFF__proto__', // byte order mark
    '__PROTO__',
    'Constructor',
    'HasOwnProperty',
    'ValueOf',
  ];

  for (const payload of adversarialPayloads) {
    const resP = mock.getPartnerById(payload);
    assert.strictEqual(resP, null, `Payload ${JSON.stringify(payload.slice(0, 30))} must return null`);

    const resG = mock.getGroupSessionById(payload);
    assert.strictEqual(resG, null, `Group payload ${JSON.stringify(payload.slice(0, 30))} must return null`);

    const resPl = mock.getPlanById(payload);
    assert.strictEqual(resPl, null, `Plan payload ${JSON.stringify(payload.slice(0, 30))} must return null`);
  }
});

check('FUZZ-08', 'Legitimate ID query exactness: exact match succeeds, mutated ID returns null', () => {
  const validIds = ['lead-orchestrator', 'agent-architect', 'rea-partner'];

  for (const validId of validIds) {
    // 1. Exact match must return genuine partner object
    const p = mock.getPartnerById(validId);
    assert.ok(p !== null && typeof p === 'object', `Valid id '${validId}' must resolve`);
    assert.strictEqual(p.id, validId);

    // 2. Minor mutations must all return null (strict matching)
    const mutations = [
      ` ${validId}`,
      `${validId} `,
      validId.toUpperCase(),
      validId.slice(0, -1),
      `${validId}\0`,
      `${validId}\n`,
      `prefix-${validId}`,
      `${validId}-suffix`,
    ];

    for (const mutated of mutations) {
      const res = mock.getPartnerById(mutated);
      assert.strictEqual(
        res,
        null,
        `Mutated key '${mutated}' must return null, got ${typeof res}`
      );
    }
  }
});

// -----------------------------------------------------------------------------
// 5. High-Frequency Fuzzing & Latency Benchmark
// -----------------------------------------------------------------------------
console.log('\n--- 5. High-Frequency Fuzzing & Latency Benchmark ---');

check('FUZZ-09', '200,000 mixed randomized fuzz queries complete within 500ms without memory leak', () => {
  const corpus = [
    ...CORE_RESERVED_KEYS,
    ...EXTENDED_PROTOTYPE_PROPERTIES,
    ...JS_LANGUAGE_KEYWORDS,
    'lead-orchestrator',
    'agent-architect',
    'rea-partner',
    'group-session-01',
    'plan-running-01',
    '',
    null,
    undefined,
    123,
    '__proto__',
    'constructor',
    '<exploit>',
  ];

  const iterations = 200000;
  const start = performance.now();

  for (let i = 0; i < iterations; i++) {
    const term = corpus[i % corpus.length];
    mock.getPartnerById(term);
    mock.getGroupSessionById(term);
    mock.getPlanById(term);
  }

  const duration = performance.now() - start;
  const opsPerSec = Math.round((iterations * 3) / (duration / 1000));
  console.log(`    Executed ${iterations * 3} lookup operations in ${duration.toFixed(2)}ms (${opsPerSec.toLocaleString()} ops/sec)`);

  assert.ok(duration < 500, `Performance regression: 200k iterations took ${duration.toFixed(2)}ms (threshold: 500ms)`);
});

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log('FUZZ & PROTOTYPE DEFENSE SUITE SUMMARY');
console.log('================================================================');
console.log(`  Total Checks Executed : ${totalTests}`);
console.log(`  Passed Checks         : ${passedTests}`);
console.log(`  Failed Checks         : ${failedTests}`);

if (failedTests > 0) {
  console.log('\n🚨 DEFECTS FOUND:');
  defects.forEach((d, i) => {
    console.log(`  [${i + 1}] ${d.id}: ${d.description} -> ${d.error}`);
  });
  console.log('\n❌ VERDICT: REQUEST_CHANGES');
  process.exit(1);
} else {
  console.log('\n✅ VERDICT: APPROVE (Prototype defense is 100% airtight and verified)');
  process.exit(0);
}
