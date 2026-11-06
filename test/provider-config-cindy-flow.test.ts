/**
 * Purpose: Integration test suite verifying Cindy-style Provider & Model Configuration flow.
 * Context: Tests provider CRUD, plaintext API key persistence to models.json, /v1/models discovery parser,
 *          hand-edited JSON protection, same-origin guard, and hot route refresh on ClaudeSdkRunner.
 * Usage: npx tsx test/provider-config-cindy-flow.test.ts
 * Prerequisites: Node.js 22.5+/26+.
 */

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  createProviderConfig,
  updateProviderConfig,
  deleteProviderConfig,
  loadProvidersConfig,
  ProviderConfigError,
} from '../src/web/server/services/provider-config-service';
import {
  deriveModelsUrl,
  parseModelsList,
  fetchProviderModels,
} from '../src/web/server/services/provider-model-fetch';
import { isSameOrigin } from '../src/web/server/controllers/provider-config-controller';
import {
  emptyDraft,
  slugifyProviderId,
  validateDraft,
  foundToDraft,
  fromModelDraft,
} from '../src/web/src/pages/settings/components/providerDraft';
import { ClaudeSdkRunner } from '../src/daemon/orchestrator/ClaudeSdkRunner';

async function runTests() {
  console.log('========================================================================');
  console.log('   Cindy-Style Provider & Model Configuration Integration Test Suite    ');
  console.log('========================================================================\n');

  const projectRoot = path.resolve(__dirname, '..');
  const tempHome = path.join(projectRoot, 'sandboxes', `test-provider-cfg-${Date.now()}`);
  fs.mkdirSync(tempHome, { recursive: true });
  process.env.MULTIAGENT_HOME = tempHome;

  try {
    // 1. Create custom provider with plaintext API key & models directly into models.json
    console.log('[Test 1] Creating custom provider and writing plaintext API key to models.json...');
    const created = createProviderConfig({
      name: 'My Custom Gateway',
      baseUrl: 'https://gateway.example.com/',
      apiKey: '  sk-plain-direct-key-12345 \n',
      models: [
        {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6',
          contextWindow: 200000,
          maxTokens: 64000,
          reasoning: true,
          input: ['text', 'image'],
        },
        'claude-sonnet-4-6',
      ],
    });

    assert.equal(created.id, 'my-custom-gateway');
    assert.equal(created.baseUrl, 'https://gateway.example.com');
    assert.equal(created.apiKey, 'sk-plain-direct-key-12345', 'API key must be trimmed and saved in plaintext');
    assert.equal(created.api, 'anthropic-messages');
    assert.equal(created.models.length, 2);

    const diskPath = path.join(tempHome, 'models.json');
    assert.ok(fs.existsSync(diskPath), 'models.json must be written to disk');
    const rawDisk = JSON.parse(fs.readFileSync(diskPath, 'utf-8'));
    assert.equal(rawDisk.providers['my-custom-gateway'].apiKey, 'sk-plain-direct-key-12345');
    console.log('  ✓ PASS: Custom provider and plaintext API key persisted to models.json.\n');

    // 2. Update provider & preserve extra hand-edited model fields (cost, thinkingLevelMap)
    console.log('[Test 2] Updating provider while preserving hand-edited model metadata (cost, thinkingLevelMap)...');
    rawDisk.providers['my-custom-gateway'].models[0].cost = { input: 15, output: 75 };
    rawDisk.providers['my-custom-gateway'].models[0].thinkingLevelMap = { low: 4096, high: 32000 };
    fs.writeFileSync(diskPath, JSON.stringify(rawDisk, null, 2), 'utf-8');

    const updated = updateProviderConfig({
      providerId: 'my-custom-gateway',
      baseUrl: 'https://new-gateway.example.com',
      apiKey: 'sk-updated-key-999',
      models: [
        {
          id: 'claude-opus-4-6',
          name: 'Claude Opus 4.6 Updated',
          contextWindow: 400000,
          maxTokens: 64000,
          reasoning: true,
          input: ['text', 'image'],
        },
      ],
    });

    assert.equal(updated.baseUrl, 'https://new-gateway.example.com');
    assert.equal(updated.apiKey, 'sk-updated-key-999');
    assert.equal(updated.models[0].contextWindow, 400000);
    assert.deepEqual(
      updated.models[0].cost,
      { input: 15, output: 75 },
      'Hand-edited cost field must survive UI model update'
    );
    assert.deepEqual(
      updated.models[0].thinkingLevelMap,
      { low: 4096, high: 32000 },
      'Hand-edited thinkingLevelMap must survive UI model update'
    );
    assert.ok(fs.existsSync(`${diskPath}.bak`), 'One-step .bak file must be created on update');
    console.log('  ✓ PASS: Provider updated and hand-edited fields preserved with .bak backup.\n');

    // 3. Cindy-style /v1/models discovery URL derivation & multi-shape response parsing
    console.log('[Test 3] Testing Cindy-style /v1/models discovery parser (OpenAI, Anthropic & Google shapes)...');
    assert.equal(deriveModelsUrl('https://api.example.com'), 'https://api.example.com/v1/models');
    assert.equal(deriveModelsUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/models');
    assert.equal(deriveModelsUrl('https://api.example.com/custom/models'), 'https://api.example.com/custom/models');

    const parsedOpenAi = parseModelsList({
      data: [
        { id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6', max_input_tokens: 200000 },
        { id: 'gemini-3.8-flash', context_length: 1000000 },
        { id: 'claude-opus-4-6' }, // duplicate should be deduped
      ],
    });
    assert.equal(parsedOpenAi?.length, 2);
    assert.equal(parsedOpenAi?.[0].name, 'Claude Opus 4.6');
    assert.equal(parsedOpenAi?.[0].contextWindow, 200000);
    assert.equal(parsedOpenAi?.[1].contextWindow, 1000000);

    // Mock fetch for fetchProviderModels + verify secret redaction on error
    const okFetchResult = await fetchProviderModels(
      { providerId: 'my-custom-gateway' },
      async (url, init) => {
        const headers = init?.headers as Record<string, string>;
        assert.equal(headers['x-api-key'], 'sk-updated-key-999');
        assert.equal(headers['authorization'], 'Bearer sk-updated-key-999');
        return new Response(
          JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash', context_window: 1000000 }] }),
          { status: 200 }
        );
      }
    );
    assert.equal(okFetchResult.ok, true);
    assert.equal(okFetchResult.models?.[0].id, 'gemini-3.8-flash');

    const errFetchResult = await fetchProviderModels(
      { baseUrl: 'https://bad.example.com', apiKey: 'sk-secret-must-not-leak' },
      async () => new Response('Invalid key: sk-secret-must-not-leak rejected', { status: 401 })
    );
    assert.equal(errFetchResult.ok, false);
    assert.equal(errFetchResult.code, 'AUTH_INVALID');
    assert.ok(
      !errFetchResult.detail?.includes('sk-secret-must-not-leak'),
      'Error detail must redact the raw API key'
    );
    console.log('  ✓ PASS: /v1/models discovery and error secret redaction verified.\n');

    // 4. Hand-edited invalid JSON protection (never overwrite broken hand edits)
    console.log('[Test 4] Verifying protection against overwriting malformed hand-edited models.json...');
    const validBackup = fs.readFileSync(diskPath, 'utf-8');
    fs.writeFileSync(diskPath, '{ "providers": { broken json ', 'utf-8');

    assert.throws(
      () => loadProvidersConfig(),
      (err: any) => err instanceof ProviderConfigError && err.code === 'INVALID_CONFIG'
    );
    assert.equal(
      fs.readFileSync(diskPath, 'utf-8'),
      '{ "providers": { broken json ',
      'Broken hand-edited file must never be overwritten'
    );
    fs.writeFileSync(diskPath, validBackup, 'utf-8');
    console.log('  ✓ PASS: Malformed hand-edited models.json is protected from accidental overwrite.\n');

    // 5. Frontend draft helpers, same-origin guard, hot route refresh & provider deletion
    console.log('[Test 5] Verifying UI draft validation, same-origin guard, runner setRoute & deletion...');
    const draft = emptyDraft();
    draft.name = 'OpenRouter Proxy';
    draft.id = slugifyProviderId(draft.name);
    draft.baseUrl = 'https://openrouter.ai/api';
    draft.apiKey = 'sk-or-v1-test';
    draft.models = [foundToDraft({ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', contextWindow: 200000 })];
    assert.equal(validateDraft(draft, ['cpa']), null);
    assert.equal(fromModelDraft(draft.models[0]).id, 'claude-sonnet-4-6');

    assert.equal(
      isSameOrigin({ headers: { host: 'localhost:5173', origin: 'http://localhost:5173' } } as any),
      true
    );
    assert.equal(
      isSameOrigin({ headers: { host: 'localhost:5173', origin: 'https://evil.example.com' } } as any),
      false
    );

    const runner = new ClaudeSdkRunner({
      botId: 'bot_mocode_engine_01',
      cwd: tempHome,
      claudeConfigDir: path.join(tempHome, 'claude_cfg'),
      baseUrl: 'https://old.example.com',
      apiKey: 'sk-old',
      model: 'claude-sonnet-4-6',
    });
    assert.equal(
      runner.setRoute({ baseUrl: 'https://new-gateway.example.com', apiKey: 'sk-updated-key-999', model: 'claude-opus-4-6' }),
      true
    );
    assert.equal(
      runner.setRoute({ baseUrl: 'https://new-gateway.example.com', apiKey: 'sk-updated-key-999', model: 'claude-opus-4-6' }),
      false
    );

    const delRes = deleteProviderConfig('my-custom-gateway');
    assert.equal(delRes.removed, true);
    assert.equal(delRes.remaining, 0);
    console.log('  ✓ PASS: UI draft helpers, same-origin guard, hot setRoute, and provider deletion verified.\n');

    console.log('========================================================================');
    console.log('   ALL 5 CINDY PROVIDER & MODEL CONFIGURATION TESTS PASSED!             ');
    console.log('========================================================================');
  } finally {
    delete process.env.MULTIAGENT_HOME;
    try {
      execFileSync('/opt/xrsec/.env/rmfile', [tempHome]);
    } catch {}
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
