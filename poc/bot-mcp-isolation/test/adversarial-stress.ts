import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HostIsolationGuard,
  McpIsolationManager,
  BotRuntime,
  McpAccessDeniedError,
  ToolNotFoundError,
  AlphaWeatherServer,
  BetaCalculatorServer,
  type BotConfig,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function banner(msg: string) {
  console.log(`\n${colors.cyan}${colors.bold}=== [ADVERSARIAL STRESS TEST] ${msg} ===${colors.reset}`);
}

function testPass(name: string) {
  console.log(`  ${colors.green}✓ PASS:${colors.reset} ${name}`);
}

function testVuln(name: string, detail: string) {
  console.log(`  ${colors.red}⚠ VULNERABILITY FOUND:${colors.reset} ${name}\n    Detail: ${detail}`);
}

async function runAdversarialSuite() {
  console.log(`${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.bold}   Bot MCP & Plugins Adversarial Stress & Vulnerability Test Suite     ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}`);

  const guard = HostIsolationGuard.getInstance();
  guard.startSurveillance();

  const runId = `adv-${Date.now()}`;
  const sandboxDir = path.join(projectRoot, 'sandboxes', runId);
  fs.mkdirSync(sandboxDir, { recursive: true });
  const isolationManager = new McpIsolationManager(sandboxDir);

  const alphaConfig: BotConfig = {
    botId: 'bot-alpha',
    botName: 'Alpha Agent',
    mcpPolicy: {
      allowedServers: ['alpha_weather_server'],
      sandboxMode: 'isolated',
      networkIsolation: true,
    },
    pluginPolicy: {
      pluginRoots: [path.join(projectRoot, 'configs', 'bot-alpha', 'plugins')],
      allowedPlugins: ['alpha-weather-suite'],
    },
  };

  const betaConfig: BotConfig = {
    botId: 'bot-beta',
    botName: 'Beta Agent',
    mcpPolicy: {
      allowedServers: ['beta_calculator_server'],
      sandboxMode: 'isolated',
      networkIsolation: true,
    },
    pluginPolicy: {
      pluginRoots: [path.join(projectRoot, 'configs', 'bot-beta', 'plugins')],
      allowedPlugins: ['beta-calc-suite'],
    },
  };

  const serverFactories = {
    alpha_weather_server: () => new AlphaWeatherServer(),
    beta_calculator_server: () => new BetaCalculatorServer(),
  };

  const runtimeAlpha = new BotRuntime(alphaConfig, isolationManager);
  const runtimeBeta = new BotRuntime(betaConfig, isolationManager);

  await runtimeAlpha.start(serverFactories);
  await runtimeBeta.start(serverFactories);

  const findings: Array<{ vector: string; severity: string; desc: string }> = [];

  try {
    // -------------------------------------------------------------
    // VECTOR 1: Cross-Bot Server Invocation & Prototype Injection
    // -------------------------------------------------------------
    banner('Vector 1: Server Whitelist & Prototype Forgery Attacks');

    // 1.1 Direct cross-call
    let directCrossBlocked = false;
    try {
      await runtimeAlpha.callTool('beta_calculator_server', 'beta_calculator_tool', { operation: 'add', a: 1, b: 2 });
    } catch (e: any) {
      if (e instanceof McpAccessDeniedError) directCrossBlocked = true;
    }
    assert.equal(directCrossBlocked, true, 'Cross-bot server call must be blocked with McpAccessDeniedError');
    testPass('Direct cross-bot server call blocked by McpAccessDeniedError');

    // 1.2 Calling unmounted / arbitrary server name
    let arbitraryServerBlocked = false;
    try {
      await runtimeAlpha.callTool('malicious_proxy_server', 'exfiltrate', {});
    } catch (e: any) {
      if (e instanceof McpAccessDeniedError) arbitraryServerBlocked = true;
    }
    assert.equal(arbitraryServerBlocked, true, 'Arbitrary unlisted server must be blocked');
    testPass('Unlisted arbitrary server call rejected');

    // 1.3 Prototype pollution / property attack on allowedServers
    let protoAttackBlocked = false;
    try {
      await runtimeAlpha.callTool('toString', 'beta_calculator_tool', {});
    } catch (e: any) {
      if (e instanceof McpAccessDeniedError) protoAttackBlocked = true;
    }
    assert.equal(protoAttackBlocked, true, 'Prototype property lookup rejected');
    testPass('Prototype property attack (toString) rejected');

    // 1.4 Invoking Beta tool name through Alpha server
    let toolNotFound = false;
    try {
      await runtimeAlpha.callTool('alpha_weather_server', 'beta_calculator_tool', { operation: 'add', a: 1, b: 2 });
    } catch (e: any) {
      if (e instanceof ToolNotFoundError) toolNotFound = true;
    }
    assert.equal(toolNotFound, true, 'Invoking Beta tool on Alpha server must throw ToolNotFoundError');
    testPass('Cross-tool name substitution properly returns ToolNotFoundError');

    // -------------------------------------------------------------
    // VECTOR 2: Host Environment Variable Leakage & Tampering
    // -------------------------------------------------------------
    banner('Vector 2: Host Environment Variable Leakage & Tampering');

    // Simulate pre-existing sensitive environment variables on host
    process.env.ANTHROPIC_API_KEY = 'sk-ant-adversarial-secret-key-12345';
    process.env.CLAUDE_CONFIG_DIR = '/Users/xr/.claude';
    process.env.SECRET_BEARER_TOKEN = 'token-xyz-secret';

    const envAlpha = runtimeAlpha.getRuntimeEnv();
    const envBeta = runtimeBeta.getRuntimeEnv();

    assert.equal(envAlpha.env.ANTHROPIC_API_KEY, undefined, 'ANTHROPIC_API_KEY must be stripped from Bot Alpha env');
    assert.equal(envBeta.env.ANTHROPIC_API_KEY, undefined, 'ANTHROPIC_API_KEY must be stripped from Bot Beta env');
    testPass('Host ANTHROPIC_API_KEY successfully stripped from both bots');

    assert.notEqual(envAlpha.env.CLAUDE_CONFIG_DIR, '/Users/xr/.claude', 'Host CLAUDE_CONFIG_DIR must not be inherited');
    assert.notEqual(envBeta.env.CLAUDE_CONFIG_DIR, '/Users/xr/.claude', 'Host CLAUDE_CONFIG_DIR must not be inherited');
    assert.notEqual(envAlpha.env.CLAUDE_CONFIG_DIR, envBeta.env.CLAUDE_CONFIG_DIR, 'CLAUDE_CONFIG_DIR must differ between Alpha and Beta');
    testPass('Bot CLAUDE_CONFIG_DIR overrides host ~/.claude and is isolated per-bot');

    // Environmental tampering test: mutating bot Alpha's env does not mutate Beta's env
    envAlpha.env.CUSTOM_INJECTED_VAR = 'alpha-only';
    assert.equal(envBeta.env.CUSTOM_INJECTED_VAR, undefined, 'Alpha env mutation must not leak into Beta env');
    testPass('Per-bot env mutations do not leak cross-bot');

    // Clean up simulated host env
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CLAUDE_CONFIG_DIR;
    delete process.env.SECRET_BEARER_TOKEN;

    // -------------------------------------------------------------
    // VECTOR 3: Host File System Escape & Guard Trapping
    // -------------------------------------------------------------
    banner('Vector 3: Host File System Access Attempts Trapped by Guard');

    let readTrapped = false;
    let writeTrapped = false;
    let asyncReadTrapped = false;
    let asyncWriteTrapped = false;

    try {
      fs.readFileSync('/Users/xr/.claude/settings.json');
    } catch (e: any) {
      if (e.message.includes('[HostIsolationGuard Security Violation]')) readTrapped = true;
    }
    assert.equal(readTrapped, true, 'Guard must trap sync read of host ~/.claude/settings.json');
    testPass('Host ~/.claude sync read attempt trapped');

    try {
      fs.writeFileSync('/Users/xr/.claude/trojan.tmp', 'malicious data');
    } catch (e: any) {
      if (e.message.includes('[HostIsolationGuard Security Violation]')) writeTrapped = true;
    }
    assert.equal(writeTrapped, true, 'Guard must trap sync write of host ~/.claude/trojan.tmp');
    testPass('Host ~/.claude sync write attempt trapped');

    try {
      await fs.promises.readFile('/Users/xr/.claude.json');
    } catch (e: any) {
      if (e.message.includes('[HostIsolationGuard Security Violation]')) asyncReadTrapped = true;
    }
    assert.equal(asyncReadTrapped, true, 'Guard must trap async read of host ~/.claude.json');
    testPass('Host ~/.claude.json async read attempt trapped');

    try {
      await fs.promises.writeFile('/Users/xr/.claude.json', '{}');
    } catch (e: any) {
      if (e.message.includes('[HostIsolationGuard Security Violation]')) asyncWriteTrapped = true;
    }
    assert.equal(asyncWriteTrapped, true, 'Guard must trap async write of host ~/.claude.json');
    testPass('Host ~/.claude.json async write attempt trapped');

    // -------------------------------------------------------------
    // VECTOR 4: Sandbox Escape & Path Traversal in writeConfigArtifact
    // -------------------------------------------------------------
    banner('Vector 4: Sandbox Escape & Path Traversal in writeConfigArtifact');

    // Attack: Bot Alpha attempts relative path traversal out of its claude_config directory
    // to write into Bot Beta's claude_config or sandbox root
    const escapeTarget = '../../bot-beta/claude_config/backdoor.json';
    const writtenPath = runtimeAlpha.writeConfigArtifact(escapeTarget, JSON.stringify({ pwned: true }));
    const resolvedEscape = path.resolve(writtenPath);
    const betaConfigDir = path.resolve(envBeta.claudeConfigDir);

    console.log(`    Traversed Path target: ${escapeTarget}`);
    console.log(`    Resulting file path:   ${resolvedEscape}`);
    console.log(`    Beta Config Dir:       ${betaConfigDir}`);

    if (resolvedEscape.startsWith(betaConfigDir) && fs.existsSync(resolvedEscape)) {
      testVuln(
        'Path Traversal in writeConfigArtifact',
        `Bot Alpha was able to write outside its claude_config into Bot Beta's claude_config via path traversal (${escapeTarget})!`
      );
      findings.push({
        vector: 'Filesystem Boundary',
        severity: 'HIGH',
        desc: 'writeConfigArtifact lacks path resolution boundary enforcement (path.resolve(target).startsWith(claudeConfigDir)), allowing directory traversal between bot sandboxes.',
      });
      // Clean up the backdoor file safely
      if (fs.existsSync(resolvedEscape)) {
        fs.unlinkSync(resolvedEscape);
      }
    } else {
      testPass('writeConfigArtifact path traversal prevented');
    }

    // -------------------------------------------------------------
    // VECTOR 5: Malformed Arguments & Payload Resilience
    // -------------------------------------------------------------
    banner('Vector 5: Malformed Arguments & Payload Resilience');

    // 5.1 Invalid math operation on beta_calculator
    const malformedOpRes = await runtimeBeta.callTool('beta_calculator_server', 'beta_calculator_tool', {
      // @ts-expect-error invalid enum
      operation: 'modulus',
      a: 10,
      b: 3,
    });
    // MCP tool validation should return isError: true
    assert.equal(malformedOpRes.isError, true, 'Invalid enum operation must return isError: true');
    testPass('Schema validation blocks invalid operation enum without crashing');

    // 5.2 Division by zero
    const divZeroRes = await runtimeBeta.callTool('beta_calculator_server', 'beta_calculator_tool', {
      operation: 'divide',
      a: 10,
      b: 0,
    });
    assert.equal(divZeroRes.isError, true, 'Division by zero must return isError: true');
    testPass('Division by zero gracefully handled with error payload');

    // 5.3 Malformed dataJson in alpha_db
    const malformedJsonRes = await runtimeAlpha.callTool('alpha_weather_server', 'alpha_db', {
      action: 'insert',
      table: 'stations',
      dataJson: 'NOT_VALID_JSON{:::}}',
    });
    assert.equal(malformedJsonRes.isError, true, 'Malformed JSON string must return isError: true');
    testPass('Malformed JSON in tool argument safely handled without unhandled throw');

    // -------------------------------------------------------------
    // VECTOR 6: High Concurrency & Interleaved Stress
    // -------------------------------------------------------------
    banner('Vector 6: High Concurrency Interleaved Load (50 Concurrent Tool Calls)');

    const concurrentOperations: Promise<any>[] = [];
    for (let i = 0; i < 25; i++) {
      // Bot Alpha writes to DB
      concurrentOperations.push(
        runtimeAlpha.callTool('alpha_weather_server', 'alpha_db', {
          action: 'insert',
          table: 'concurrency_test',
          dataJson: JSON.stringify({ index: i, bot: 'alpha' }),
        })
      );
      // Bot Beta computes math
      concurrentOperations.push(
        runtimeBeta.callTool('beta_calculator_server', 'beta_calculator_tool', {
          operation: 'multiply',
          a: i,
          b: 2,
        })
      );
    }

    const concurrentResults = await Promise.all(concurrentOperations);
    assert.equal(concurrentResults.length, 50, 'All 50 operations must complete');
    const allSucceeded = concurrentResults.every((r) => r.success === true && !r.isError);
    assert.equal(allSucceeded, true, 'All concurrent tool executions must succeed');

    // Query Alpha's DB to verify exactly 25 records
    const alphaDbQuery = await runtimeAlpha.callTool('alpha_weather_server', 'alpha_db', {
      action: 'query',
      table: 'concurrency_test',
    });
    const parsedAlphaDb = JSON.parse(alphaDbQuery.content[0].text!);
    assert.equal(parsedAlphaDb.count, 25, 'Alpha DB must contain exactly 25 records');
    testPass('50 interleaved concurrent tool calls completed with zero cross-talk and zero corruption');

    // -------------------------------------------------------------
    // VECTOR 7: Unauthorized Plugin Injection & Tampering
    // -------------------------------------------------------------
    banner('Vector 7: Unauthorized Plugin Root & Malformed Plugin Manifest');

    // Create a fake unapproved plugin inside Alpha's plugin root
    const roguePluginDir = path.join(projectRoot, 'configs', 'bot-alpha', 'plugins', 'rogue-plugin');
    fs.mkdirSync(roguePluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(roguePluginDir, 'plugin.json'),
      JSON.stringify({ id: 'rogue-plugin', name: 'Rogue Infiltrator', version: '6.6.6' })
    );

    // Reload plugins
    const alphaPluginsAfterRogue = isolationManager.loadBotPlugins(alphaConfig);
    const rogueLoaded = alphaPluginsAfterRogue.some((p) => p.id === 'rogue-plugin');
    assert.equal(rogueLoaded, false, 'Unapproved rogue plugin must NOT be loaded even if placed on disk');
    testPass('Unapproved plugin rejected by whitelist filter despite directory presence');

    // -------------------------------------------------------------
    // VECTOR 8: Sandbox Traversal via Malformed botId
    // -------------------------------------------------------------
    banner('Vector 8: Sandbox Escape via Path Traversal in botId');

    const rogueBotConfig: BotConfig = {
      botId: '../../escaped-rogue-bot',
      botName: 'Escaped Bot',
      mcpPolicy: { allowedServers: [], sandboxMode: 'isolated', networkIsolation: true },
      pluginPolicy: { pluginRoots: [], allowedPlugins: [] },
    };

    const rogueSandbox = isolationManager.prepareBotSandbox(rogueBotConfig);
    const expectedBotsRoot = path.join(sandboxDir, 'bots');
    const resolvedRogueDir = path.resolve(rogueSandbox.botDir);

    console.log(`    Rogue botId:          ${rogueBotConfig.botId}`);
    console.log(`    Expected bots root:    ${expectedBotsRoot}`);
    console.log(`    Resolved rogue botDir: ${resolvedRogueDir}`);

    if (!resolvedRogueDir.startsWith(expectedBotsRoot + path.sep)) {
      testVuln(
        'Sandbox Traversal via botId',
        `prepareBotSandbox accepts unvalidated botId with relative traversals ('../../escaped-rogue-bot'), escaping the 'bots/' subfolder into '${resolvedRogueDir}'.`
      );
      findings.push({
        vector: 'Topology Isolation',
        severity: 'MEDIUM',
        desc: 'prepareBotSandbox lacks botId regex/sanitization validation (e.g. ^[a-zA-Z0-9_-]+$), permitting path traversal outside the bots/ parent directory.',
      });
      // Clean up rogue sandbox dir safely
      if (fs.existsSync(resolvedRogueDir)) {
        fs.rmSync(resolvedRogueDir, { recursive: true, force: true });
      }
    } else {
      testPass('botId path traversal prevented');
    }
  } finally {
    await runtimeAlpha.stop();
    await runtimeBeta.stop();
    guard.stopSurveillance();
  }

  // -------------------------------------------------------------
  // Summary & Verdict
  // -------------------------------------------------------------
  console.log(`\n${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.bold}                       ADVERSARIAL STRESS SUMMARY                       ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}`);
  console.log(`  Total Attack Vectors Tested: 8`);
  console.log(`  Identified Vulnerabilities / Edge Cases: ${findings.length}`);
  for (const f of findings) {
    console.log(`  - [${f.severity}] ${f.vector}: ${f.desc}`);
  }
  console.log(`${colors.bold}========================================================================${colors.reset}\n`);

  return findings;
}

runAdversarialSuite()
  .then((findings) => {
    process.exit(0);
  })
  .catch((err) => {
    console.error('Adversarial suite encountered unexpected error:', err);
    process.exit(1);
  });
