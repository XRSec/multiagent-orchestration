import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  HostIsolationGuard,
  McpIsolationManager,
  BotRuntime,
  McpAccessDeniedError,
  AlphaWeatherServer,
  BetaCalculatorServer,
  type BotConfig,
} from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Color helpers for clean terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function logStep(stepNum: number, title: string) {
  console.log(`\n${colors.cyan}${colors.bold}[Step ${stepNum}] ${title}${colors.reset}`);
}

function logPass(msg: string) {
  console.log(`  ${colors.green}✓ PASS:${colors.reset} ${msg}`);
}

async function runVerificationSuite() {
  console.log(`${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.bold}   Bot MCP & Plugins Isolation Proof of Concept (PoC) Verification   ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}`);

  // 1. Initialize Host Isolation Surveillance
  logStep(1, 'Initializing HostIsolationGuard surveillance against ~/.claude');
  const guard = HostIsolationGuard.getInstance();
  guard.startSurveillance();
  console.log(`  Target Host Claude Directory: ${guard.getHostClaudeDir()}`);
  logPass('Host ~/.claude surveillance active and fs hooks armed.');

  // Prepare sandbox directory
  const sandboxDir = path.join(projectRoot, 'sandboxes', `run-${Date.now()}`);
  fs.mkdirSync(sandboxDir, { recursive: true });
  const isolationManager = new McpIsolationManager(sandboxDir);

  // Load Bot Configurations
  const alphaConfigPath = path.join(projectRoot, 'configs', 'bot-alpha', 'bot.config.json');
  const betaConfigPath = path.join(projectRoot, 'configs', 'bot-beta', 'bot.config.json');

  const alphaConfig: BotConfig = JSON.parse(fs.readFileSync(alphaConfigPath, 'utf-8'));
  const betaConfig: BotConfig = JSON.parse(fs.readFileSync(betaConfigPath, 'utf-8'));

  // Normalize plugin roots relative to project root
  alphaConfig.pluginPolicy.pluginRoots = alphaConfig.pluginPolicy.pluginRoots.map((r) =>
    path.resolve(projectRoot, r)
  );
  betaConfig.pluginPolicy.pluginRoots = betaConfig.pluginPolicy.pluginRoots.map((r) =>
    path.resolve(projectRoot, r)
  );

  // Central server factories pool
  const serverFactories = {
    alpha_weather_server: () => new AlphaWeatherServer(),
    beta_calculator_server: () => new BetaCalculatorServer(),
  };

  const runtimeAlpha = new BotRuntime(alphaConfig, isolationManager);
  const runtimeBeta = new BotRuntime(betaConfig, isolationManager);

  try {
    // 2. Boot Bot Runtimes
    logStep(2, 'Booting Bot Alpha and Bot Beta with isolated sandboxes');
    await runtimeAlpha.start(serverFactories);
    await runtimeBeta.start(serverFactories);

    const envAlpha = runtimeAlpha.getRuntimeEnv();
    const envBeta = runtimeBeta.getRuntimeEnv();

    console.log(`  Bot Alpha CLAUDE_CONFIG_DIR: ${envAlpha.claudeConfigDir}`);
    console.log(`  Bot Beta  CLAUDE_CONFIG_DIR: ${envBeta.claudeConfigDir}`);

    assert.notEqual(envAlpha.claudeConfigDir, envBeta.claudeConfigDir, 'Config directories must be isolated');
    assert.ok(envAlpha.claudeConfigDir.includes('bot-alpha'), 'Alpha config must be inside bot-alpha sandbox');
    assert.ok(envBeta.claudeConfigDir.includes('bot-beta'), 'Beta config must be inside bot-beta sandbox');
    assert.equal(envAlpha.strictMcpConfig, true, 'Alpha must have strictMcpConfig enabled');
    assert.equal(envBeta.strictMcpConfig, true, 'Beta must have strictMcpConfig enabled');
    assert.deepEqual(envAlpha.settingSources, [], 'Alpha must disallow external setting sources');
    assert.deepEqual(envBeta.settingSources, [], 'Beta must disallow external setting sources');
    logPass('Bot environments successfully booted with distinct, non-overlapping CLAUDE_CONFIG_DIR paths.');

    // 3. Verify MCP Tool Visibility Isolation
    logStep(3, 'Verifying MCP Tool Discovery & Visibility Isolation');
    const alphaTools = await runtimeAlpha.listAvailableTools();
    const betaTools = await runtimeBeta.listAvailableTools();

    const alphaToolNames = alphaTools.map((t) => t.name);
    const betaToolNames = betaTools.map((t) => t.name);

    console.log(`  Bot Alpha Discovered Tools: [${alphaToolNames.join(', ')}]`);
    console.log(`  Bot Beta  Discovered Tools: [${betaToolNames.join(', ')}]`);

    // Bot Alpha asserts
    assert.ok(alphaToolNames.includes('alpha_weather_tool'), 'Bot Alpha must have alpha_weather_tool');
    assert.ok(alphaToolNames.includes('alpha_db'), 'Bot Alpha must have alpha_db');
    assert.ok(!alphaToolNames.includes('beta_calculator_tool'), 'Bot Alpha must NOT see beta_calculator_tool');
    assert.ok(!alphaToolNames.includes('beta_metrics'), 'Bot Alpha must NOT see beta_metrics');

    // Bot Beta asserts
    assert.ok(betaToolNames.includes('beta_calculator_tool'), 'Bot Beta must have beta_calculator_tool');
    assert.ok(betaToolNames.includes('beta_metrics'), 'Bot Beta must have beta_metrics');
    assert.ok(!betaToolNames.includes('alpha_weather_tool'), 'Bot Beta must NOT see alpha_weather_tool');
    assert.ok(!betaToolNames.includes('alpha_db'), 'Bot Beta must NOT see alpha_db');

    logPass('Tool visibility strictly isolated: neither bot can view the other bot tools.');

    // 4. Verify Genuine MCP Tool Execution
    logStep(4, 'Verifying Genuine MCP Tool Execution on Authorized Bots');

    // Test Alpha weather
    const weatherRes = await runtimeAlpha.callTool('alpha_weather_server', 'alpha_weather_tool', {
      location: 'Berlin',
      unit: 'celsius',
    });
    assert.equal(weatherRes.success, true);
    assert.equal(weatherRes.isError, false);
    const weatherData = JSON.parse(weatherRes.content[0].text!);
    assert.equal(weatherData.location, 'Berlin');
    assert.ok(weatherData.temperature.includes('°C'));
    console.log(`  [Bot Alpha] alpha_weather_tool result: ${weatherData.location} -> ${weatherData.temperature}, ${weatherData.condition}`);

    // Test Alpha DB (insert & query)
    await runtimeAlpha.callTool('alpha_weather_server', 'alpha_db', {
      action: 'insert',
      table: 'stations',
      dataJson: JSON.stringify({ code: 'TX-101', city: 'Berlin', active: true }),
    });
    const dbQueryRes = await runtimeAlpha.callTool('alpha_weather_server', 'alpha_db', {
      action: 'query',
      table: 'stations',
    });
    const dbData = JSON.parse(dbQueryRes.content[0].text!);
    assert.equal(dbData.count, 1);
    assert.equal(dbData.records[0].city, 'Berlin');
    console.log(`  [Bot Alpha] alpha_db result: Table '${dbData.table}' contains ${dbData.count} record(s)`);

    // Test Beta calculator
    const calcRes = await runtimeBeta.callTool('beta_calculator_server', 'beta_calculator_tool', {
      operation: 'multiply',
      a: 12,
      b: 8,
    });
    assert.equal(calcRes.success, true);
    const calcData = JSON.parse(calcRes.content[0].text!);
    assert.equal(calcData.result, 96);
    console.log(`  [Bot Beta]  beta_calculator_tool result: 12 * 8 = ${calcData.result}`);

    // Test Beta metrics
    const metricsRes = await runtimeBeta.callTool('beta_calculator_server', 'beta_metrics', {
      metricType: 'memory',
    });
    assert.equal(metricsRes.success, true);
    const metricsData = JSON.parse(metricsRes.content[0].text!);
    assert.ok(metricsData.memory.heapUsedMB);
    console.log(`  [Bot Beta]  beta_metrics result: Heap Used = ${metricsData.memory.heapUsedMB} MB`);

    logPass('Both bots executed their assigned MCP tools genuinely through JSON-RPC protocol.');

    // 5. Verify Cross-Bot Unauthorized Tool Invocation Prevention
    logStep(5, 'Verifying Cross-Bot Tool Invocation Boundary Enforcement');

    // Alpha attempts to call Beta's server
    let alphaBreachBlocked = false;
    try {
      await runtimeAlpha.callTool('beta_calculator_server', 'beta_calculator_tool', {
        operation: 'add',
        a: 1,
        b: 1,
      });
    } catch (err: any) {
      if (err instanceof McpAccessDeniedError) {
        alphaBreachBlocked = true;
        console.log(`  Blocked unauthorized Alpha call to Beta server: ${err.message}`);
      }
    }
    assert.equal(alphaBreachBlocked, true, 'Alpha must be blocked from calling Beta server');

    // Beta attempts to call Alpha's server
    let betaBreachBlocked = false;
    try {
      await runtimeBeta.callTool('alpha_weather_server', 'alpha_weather_tool', {
        location: 'Tokyo',
      });
    } catch (err: any) {
      if (err instanceof McpAccessDeniedError) {
        betaBreachBlocked = true;
        console.log(`  Blocked unauthorized Beta call to Alpha server: ${err.message}`);
      }
    }
    assert.equal(betaBreachBlocked, true, 'Beta must be blocked from calling Alpha server');

    logPass('Cross-bot tool access strictly rejected by policy filter and runtime gate.');

    // 6. Verify Bot Plugins and Skills Isolation
    logStep(6, 'Verifying Bot Plugins and Skills Isolation');
    const alphaPlugins = runtimeAlpha.listAvailablePlugins();
    const betaPlugins = runtimeBeta.listAvailablePlugins();

    const alphaPluginIds = alphaPlugins.map((p) => p.id);
    const betaPluginIds = betaPlugins.map((p) => p.id);

    console.log(`  Bot Alpha Plugins: [${alphaPluginIds.join(', ')}]`);
    console.log(`  Bot Beta  Plugins: [${betaPluginIds.join(', ')}]`);

    assert.deepEqual(alphaPluginIds, ['alpha-weather-suite']);
    assert.deepEqual(betaPluginIds, ['beta-calc-suite']);
    assert.ok(!alphaPluginIds.includes('beta-calc-suite'));
    assert.ok(!betaPluginIds.includes('alpha-weather-suite'));

    logPass('Bot plugins strictly scoped to individual bot plugin directories.');

    // 7. Verify Sandbox Disk State and Config Persistence Isolation
    logStep(7, 'Verifying Sandbox Disk State and Config Persistence Isolation');

    runtimeAlpha.writeConfigArtifact('state/alpha-memory.json', JSON.stringify({ notes: 'Alpha weather log' }));
    runtimeBeta.writeConfigArtifact('state/beta-memory.json', JSON.stringify({ notes: 'Beta calculation cache' }));

    const alphaStateFile = path.join(envAlpha.claudeConfigDir, 'state', 'alpha-memory.json');
    const betaStateFile = path.join(envBeta.claudeConfigDir, 'state', 'beta-memory.json');
    const crossAlphaFile = path.join(envBeta.claudeConfigDir, 'state', 'alpha-memory.json');
    const crossBetaFile = path.join(envAlpha.claudeConfigDir, 'state', 'beta-memory.json');

    assert.ok(fs.existsSync(alphaStateFile), 'Alpha state file must exist in Alpha config dir');
    assert.ok(fs.existsSync(betaStateFile), 'Beta state file must exist in Beta config dir');
    assert.ok(!fs.existsSync(crossAlphaFile), 'Alpha state must NOT leak into Beta config dir');
    assert.ok(!fs.existsSync(crossBetaFile), 'Beta state must NOT leak into Alpha config dir');

    logPass('Artifact persistence strictly isolated inside individual bot CLAUDE_CONFIG_DIR.');

    // 8. Verify Host ~/.claude Isolation Audit
    logStep(8, 'Performing Comprehensive Host ~/.claude Isolation Audit');
    const checkResult = guard.stopSurveillance();

    console.log(`  Audit Result:`);
    console.log(`    Host Claude Dir: ${checkResult.hostClaudeDir}`);
    console.log(`    Host Dir Existed: ${checkResult.hostDirExisted}`);
    console.log(`    Host Dir Touched: ${checkResult.hostDirTouched}`);
    console.log(`    Read Violations: ${checkResult.readViolations.length}`);
    console.log(`    Write Violations: ${checkResult.writeViolations.length}`);
    console.log(`    Files Modified: ${checkResult.hostFilesModified.length}`);
    console.log(`    Is Fully Isolated: ${checkResult.isFullyIsolated}`);

    assert.equal(checkResult.hostDirTouched, false, 'Host ~/.claude must NOT have been touched');
    assert.equal(checkResult.readViolations.length, 0, 'No reads from host ~/.claude permitted');
    assert.equal(checkResult.writeViolations.length, 0, 'No writes to host ~/.claude permitted');
    assert.equal(checkResult.hostFilesModified.length, 0, 'No host ~/.claude files modified');
    assert.equal(checkResult.isFullyIsolated, true, 'System must be fully isolated from host ~/.claude');

    logPass('Host ~/.claude was 100% untouched throughout all operations.');

    // 9. Verify Active Host Attack Interception (Trap Capability)
    logStep(9, 'Verifying Active Guard Defense Against Simulated Unauthorized Host Intrusion');
    guard.startSurveillance();
    let readAttemptTrapped = false;
    let writeAttemptTrapped = false;

    // Simulated rogue read against ~/.claude/settings.json
    try {
      fs.readFileSync(path.join(guard.getHostClaudeDir(), 'settings.json'), 'utf-8');
    } catch (err: any) {
      if (err.message.includes('[HostIsolationGuard Security Violation]')) {
        readAttemptTrapped = true;
      }
    }

    // Simulated rogue write against ~/.claude/rogue-injection.tmp
    try {
      fs.writeFileSync(path.join(guard.getHostClaudeDir(), 'rogue-injection.tmp'), 'danger');
    } catch (err: any) {
      if (err.message.includes('[HostIsolationGuard Security Violation]')) {
        writeAttemptTrapped = true;
      }
    }

    const trapAudit = guard.stopSurveillance();
    assert.equal(readAttemptTrapped, true, 'Rogue read against ~/.claude must be actively trapped and blocked');
    assert.equal(writeAttemptTrapped, true, 'Rogue write against ~/.claude must be actively trapped and blocked');
    assert.equal(trapAudit.readViolations.length, 1, 'Exactly 1 simulated read violation recorded');
    assert.equal(trapAudit.writeViolations.length, 1, 'Exactly 1 simulated write violation recorded');
    assert.equal(trapAudit.hostFilesModified.length, 0, 'No host files were modified despite attack attempts');
    console.log(`  Trapped Violations:`);
    console.log(`    ${trapAudit.readViolations[0]}`);
    console.log(`    ${trapAudit.writeViolations[0]}`);
    logPass('HostIsolationGuard active enforcement verified: illegal operations are immediately aborted.');
  } finally {
    // Cleanup runtimes
    await runtimeAlpha.stop();
    await runtimeBeta.stop();
    guard.stopSurveillance();
  }

  console.log(`\n${colors.green}${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.green}${colors.bold}   ✓ ALL VERIFICATION TESTS PASSED SUCCESSFULLY (Exit Code 0)         ${colors.reset}`);
  console.log(`${colors.green}${colors.bold}========================================================================${colors.reset}\n`);
}

runVerificationSuite().catch((err) => {
  console.error(`\n${colors.red}${colors.bold}VERIFICATION FAILED:${colors.reset}`, err);
  process.exit(1);
});
