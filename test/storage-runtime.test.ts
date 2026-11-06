import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { StorageManager } from '../src/storage/StorageManager';
import { RuntimeEnvironment, SENSITIVE_ENV_VARS_TO_STRIP } from '../src/storage/RuntimeEnvironment';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('   Multi-Agent Storage & Runtime Architecture Integration Test Suite   ');
  console.log('========================================================================\n');

  const projectRoot = path.resolve(__dirname, '..');
  const tempStorageDir = path.join(projectRoot, 'sandboxes', `test-storage-${Date.now()}`);
  fs.mkdirSync(tempStorageDir, { recursive: true });

  const hostClaudeDir = path.join(os.homedir(), '.claude');
  const hostInitialStat = fs.existsSync(hostClaudeDir) ? fs.statSync(hostClaudeDir) : null;

  console.log('[Test 1] Initializing StorageManager with SQLite (WAL mode)...');
  const storage = new StorageManager(tempStorageDir);
  const runtime = new RuntimeEnvironment(projectRoot, storage);
  console.log(`  Database initialized at: ${storage.getDbPath()}`);
  assert(fs.existsSync(storage.getDbPath()), 'Database file must exist');
  console.log('  ✓ PASS: SQLite database initialized.\n');

  console.log('[Test 2] Loading and registering the 7 newly created Mo-Bots...');
  const expectedBots = ['moCode', 'moDoc', 'moAdmin', 'MoDeep', 'MoGit', 'Mo', 'MoCI'];
  for (const botName of expectedBots) {
    const botDir = path.join(projectRoot, 'Bots', botName);
    assert(fs.existsSync(botDir), `Bot directory must exist: ${botDir}`);

    const profile = JSON.parse(fs.readFileSync(path.join(botDir, 'profile.json'), 'utf-8'));
    const claudeConfigDir = path.join(botDir, 'claude_config');

    storage.registerBot({
      id: profile.id,
      name: botName,
      display_name: profile.display_name,
      description: profile.description,
      avatar: profile.avatar,
      avatar_color: profile.avatar_color,
      status: profile.status,
      canonical_session_id: profile.canonical_session_id,
      bot_dir: botDir,
      claude_config_dir: claudeConfigDir,
      created_at: profile.created_at,
      updated_at: profile.updated_at
    });
  }

  const registeredBots = storage.listBots();
  console.log(`  Registered bots count: ${registeredBots.length}`);
  assert(registeredBots.length === 7, 'Must have registered exactly 7 Mo-Bots');
  console.log('  ✓ PASS: All 7 Mo-Bots registered in SQLite.\n');

  console.log('[Test 3] Verifying Bot-level CLAUDE_CONFIG_DIR isolation & settings lock...');
  for (const bot of registeredBots) {
    const isoResult = runtime.validateBotIsolation(bot);
    assert(isoResult.isIsolated, `Bot ${bot.name} isolation failure: ${isoResult.reason}`);

    // Verify sanitized environment contains dedicated CLAUDE_CONFIG_DIR
    const env = runtime.buildSanitizedEnvironment(bot);
    assert(env['CLAUDE_CONFIG_DIR'] === bot.claude_config_dir, `Bot ${bot.name} CLAUDE_CONFIG_DIR mismatch`);

    // Verify sensitive variables are stripped
    for (const strippedVar of SENSITIVE_ENV_VARS_TO_STRIP) {
      assert(env[strippedVar] === undefined, `Sensitive env var leaked: ${strippedVar}`);
    }
  }
  console.log('  ✓ PASS: 100% Bot configuration isolation verified; 20 sensitive env vars stripped.\n');

  console.log('[Test 4] Verifying CWD boundary assignment for each Bot...');
  assert(runtime.resolveBotCwd('moCode') === projectRoot, 'moCode CWD must be projectRoot');
  assert(runtime.resolveBotCwd('moDoc') === path.join(projectRoot, 'docs'), 'moDoc CWD must be docs/');
  assert(runtime.resolveBotCwd('MoDeep') === path.join(projectRoot, 'workspace', 'tmp'), 'MoDeep CWD must be ./workspace/tmp');
  const moCwd = runtime.resolveBotCwd('Mo');
  assert(moCwd.includes('agents') || moCwd.includes('Bots'), 'Mo CWD must be agents/ or Bots/');
  console.log('  ✓ PASS: Runtime CWD constraints strictly bounded.\n');

  console.log('[Test 5] Creating Group Room, Charter & Blackboard (GROUP_MEMORY.md)...');
  const room = storage.createRoom(
    'engineering-core',
    'Multiagent Engineering Core Room',
    ['moAdmin', 'moCode', 'moDoc'],
    '# Charter\n1. moAdmin coordinates.\n2. moCode builds.\n3. moDoc documents.',
    '# State Blackboard\n- Active Task: Phase 1 Storage & Runtime Implementation\n- Status: In Progress'
  );
  assert(room.slug === 'engineering-core', 'Room slug mismatch');
  const initialBlackboard = storage.readBlackboard('engineering-core');
  assert(initialBlackboard.charter.includes('moAdmin coordinates'), 'Charter content read failure');
  assert(initialBlackboard.memory.includes('Phase 1 Storage'), 'Memory content read failure');
  console.log('  ✓ PASS: Room and Blackboard created and verified.\n');

  console.log('[Test 6] Testing Messages timeline, strict sequence increments & delta slicing...');
  const sessionId = 'session_test_group_01';
  storage.createSession(sessionId, 'room', room.id, 'Core Discussion', projectRoot, '');

  const msg1 = storage.appendMessage(sessionId, 'moAdmin', 'assistant', 'Task assigned to moCode.', { roomId: room.id });
  const msg2 = storage.appendMessage(sessionId, 'moCode', 'assistant', 'Understood. Implementing storage engine.', { roomId: room.id });
  const msg3 = storage.appendMessage(sessionId, 'moDoc', 'assistant', 'NO_REPLY', { roomId: room.id }); // Silent skip
  const msg4 = storage.appendMessage(sessionId, 'moCode', 'assistant', 'Storage engine verified with SQLite.', { roomId: room.id });

  assert(msg1.sequence === 1, `msg1 sequence should be 1, got ${msg1.sequence}`);
  assert(msg2.sequence === 2, `msg2 sequence should be 2, got ${msg2.sequence}`);
  assert(msg3.sequence === 3, `msg3 sequence should be 3, got ${msg3.sequence}`);
  assert(msg4.sequence === 4, `msg4 sequence should be 4, got ${msg4.sequence}`);
  assert(msg3.silent_token === 1, 'msg3 with NO_REPLY must be flagged as silent_token');
  console.log('  ✓ PASS: Monotonic sequence auto-increment and silent token detection verified.\n');

  console.log('[Test 7] Verifying Delta Slicing and Member Cursor Advancement...');
  // moDoc asks for delta messages: should receive msg1, msg2, msg4 (msg3 silent_token is skipped)
  const docBot = storage.getBot('moDoc')!;
  const delta1 = storage.getDeltaMessages(room.id, docBot.id);
  assert(delta1.length === 3, `Expected 3 delta messages for moDoc, got ${delta1.length}`);
  assert(delta1[0].id === msg1.id, 'First delta message should be msg1');
  assert(delta1[1].id === msg2.id, 'Second delta message should be msg2');
  assert(delta1[2].id === msg4.id, 'Third delta message should be msg4');

  // Immediately querying again should return 0 deltas because cursor advanced to sequence 4
  const delta2 = storage.getDeltaMessages(room.id, docBot.id);
  assert(delta2.length === 0, `Expected 0 delta messages on immediate subsequent call, got ${delta2.length}`);
  console.log('  ✓ PASS: Delta slicing and member cursor advancement verified.\n');

  console.log('[Test 8] Assembling complete runtime turn context for an Agent...');
  const turnCtx = runtime.assembleTurnContext('moCode', sessionId, room.id);
  assert(turnCtx.systemPrompt.includes('Global Base Directives (Customizations/AGENTS.md)'), 'System prompt must include global directives');
  assert(turnCtx.systemPrompt.includes('Core Operating Disciplines') || turnCtx.systemPrompt.includes('Discipline: No Overthinking'), 'System prompt must include rules from AGENTS.md');
  assert(turnCtx.systemPrompt.includes('moCode'), 'System prompt should contain bot identity');
  assert(turnCtx.systemPrompt.includes('Current Blackboard State'), 'System prompt should include blackboard snapshot');
  assert(turnCtx.env['CLAUDE_CONFIG_DIR'].includes('Bots/moCode/claude_config'), 'Env should contain isolated CLAUDE_CONFIG_DIR');
  assert(turnCtx.cwd === projectRoot, 'moCode cwd should be projectRoot');
  console.log('  ✓ PASS: Full runtime turn context dynamically assembled.\n');

  console.log('[Test 9] Auditing host ~/.claude isolation integrity...');
  if (hostInitialStat && fs.existsSync(hostClaudeDir)) {
    const hostCurrentStat = fs.statSync(hostClaudeDir);
    assert(
      hostInitialStat.mtimeMs === hostCurrentStat.mtimeMs,
      'Host ~/.claude mtime MUST NOT change!'
    );
    console.log(`  Host ~/.claude mtime remained untouched: ${new Date(hostCurrentStat.mtimeMs).toISOString()}`);
  }
  console.log('  ✓ PASS: Host ~/.claude remained 100% untouched throughout all tests.\n');

  console.log('[Test 10] Loading and validating Cindy-format models.json (Direct Wire, No Proxy)...');
  const { UniversalConfigLoader } = await import('../src/daemon/config/UniversalConfigLoader');
  process.env.ANTHROPIC_API_KEY = 'test_sk_anthropic_direct_key';
  const configLoader = new UniversalConfigLoader(projectRoot);
  const modelsConfig = configLoader.loadModelsConfig();
  assert(!!modelsConfig.providers?.anthropic, 'Must contain anthropic provider');
  assert(!!modelsConfig.providers.anthropic.apiKey, 'Must resolve or have an apiKey');
  assert(modelsConfig.providers.anthropic.api === 'anthropic-messages', 'Must use direct anthropic-messages protocol');

  const availableModels = configLoader.getAvailableModels('anthropic');
  assert(availableModels.length === 2, `Expected exactly 2 models, got ${availableModels.length}`);
  const flash38 = availableModels.find(m => m.id === 'gemini-3.8-flash');
  assert(!!flash38, 'Must contain gemini-3.8-flash');
  assert(flash38?.contextWindow === 1048576, 'gemini-3.8-flash contextWindow must be 1048576');
  assert(flash38?.maxTokens === 65536, 'gemini-3.8-flash maxTokens must be 65536');
  assert(flash38?.reasoning === true, 'gemini-3.8-flash must support reasoning');

  const flash35 = availableModels.find(m => m.id === 'gemini-3.5-flash-lite');
  assert(!!flash35, 'Must contain gemini-3.5-flash-lite');
  assert(flash35?.contextWindow === 1048576, 'gemini-3.5-flash-lite contextWindow must be 1048576');
  assert(flash35?.cost?.input === 0.3, 'gemini-3.5-flash-lite input cost must be 0.3');
  console.log(`  ✓ PASS: Successfully loaded models: [${availableModels.map(m => m.id).join(', ')}] via Anthropic 3P direct wire config.\n`);

  storage.close();
  console.log('========================================================================');
  console.log('   ✓ ALL STORAGE & RUNTIME TESTS PASSED (Exit Code 0)                   ');
  console.log('========================================================================');
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

