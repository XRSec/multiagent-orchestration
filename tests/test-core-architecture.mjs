/**
 * tests/test-core-architecture.mjs
 * 核心底层架构单元测试：验证 PartnerCoreService、BotGroupCoreService、
 * ExtensionRegistryService 及 DistillationEngineService。
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  PartnerCoreService,
  validatePartnerId,
  BotGroupCoreService,
  ExtensionRegistryService,
  DistillationEngineService
} from '../packages/agent-control-plane/index.mjs';

const testDir = path.join(os.tmpdir(), `test-cindy-arch-${Date.now()}`);
fs.mkdirSync(testDir, { recursive: true });

console.log('--- 1. Testing PartnerCoreService & ID Validation ---');
const pCheckBad = validatePartnerId('BAD_NAME!');
assert.equal(pCheckBad.valid, false, 'Invalid partner ID should be rejected');
const pCheckGood = validatePartnerId('alpha-bot_1');
assert.equal(pCheckGood.valid, true, 'Valid partner ID should pass');

const partnerService = new PartnerCoreService({ storageDir: path.join(testDir, 'partners') });
const partners = partnerService.listPartners();
assert.ok(partners.length >= 3, 'Builtin partners should be initialized automatically');

const newBot = partnerService.createPartner({
  id: 'test-craftsman',
  name: 'Test Craftsman',
  description: 'A test craftsman partner',
  avatar: '🛠️',
  capabilities: {
    skills: ['unit-testing'],
    mcpServers: ['cindy-memory']
  }
});
assert.equal(newBot.id, 'test-craftsman');
assert.ok(fs.existsSync(path.join(testDir, 'partners', 'test-craftsman', 'manifest.json')));
assert.ok(fs.existsSync(path.join(testDir, 'partners', 'test-craftsman', 'SOUL.md')));
assert.ok(fs.existsSync(path.join(testDir, 'partners', 'test-craftsman', 'memories', 'MEMORY.md')));

console.log('--- 2. Testing BotGroupCoreService (Cindy Bot Group Standard) ---');
const groupService = new BotGroupCoreService({
  storageDir: path.join(testDir, 'groups'),
  partnerService
});

// 验证少于2人被拒绝
assert.throws(() => {
  groupService.createGroup({ name: 'Solo Group', botIds: ['test-craftsman'] });
}, /MEMBER_LIMIT/);

// 创建合法群聊 (2人以上)
const group = groupService.createGroup({
  name: '架构攻坚专项群',
  description: '底层架构与蒸馏控制面协同组',
  botIds: ['lead-orchestrator', 'test-craftsman'],
  organizerBotId: 'lead-orchestrator',
  speakingMode: 'auto',
  replyMode: 'all'
});
assert.ok(group.id.startsWith('grp_'));
assert.equal(group.name, '架构攻坚专项群');
assert.ok(fs.existsSync(path.join(testDir, 'groups', group.id, 'group.json')));
assert.ok(fs.existsSync(path.join(testDir, 'groups', group.id, 'GROUP_CHARTER.md')));
assert.ok(fs.existsSync(path.join(testDir, 'groups', group.id, 'GROUP_MEMORY.md')));

console.log('--- 3. Testing ExtensionRegistryService ---');
const extService = new ExtensionRegistryService({
  partnerService,
  workspaceDir: process.cwd()
});
const mcps = extService.getAvailableMcpServers();
assert.ok(mcps.length >= 3, 'Available MCPs should include builtins');
const skills = extService.getAvailableSkills();
assert.ok(skills.length >= 4, 'Available skills should include builtins');
const plugins = extService.getAvailablePlugins();
assert.ok(plugins.length >= 2, 'Available plugins should include builtins');

const partnerConfig = extService.resolveForPartner('test-craftsman');
assert.equal(partnerConfig.scopeType, 'partner');
assert.deepEqual(partnerConfig.skills, ['unit-testing']);

const folderConfig = extService.resolveForFolder(path.join(testDir, 'sandbox-folder'));
assert.equal(folderConfig.scopeType, 'folder');

console.log('--- 4. Testing DistillationEngineService (4 Dimensions Diff) ---');
const distillEngine = new DistillationEngineService({
  partnerService,
  extensionRegistry: extService
});

const report = distillEngine.computeDiffReport('partner', 'test-craftsman');
assert.ok(report.summary.originalTokens > 0, 'Original tokens should be counted');
assert.ok(report.summary.distilledTokens > 0, 'Distilled tokens should be counted');
assert.ok(report.summary.savedTokens > 0, 'Tokens saved should be positive');
assert.ok(report.dimensions.tools, 'Tools distillation diff present');
assert.ok(report.dimensions.mcps, 'MCPs distillation diff present');
assert.ok(report.dimensions.skills, 'Skills distillation diff present');
assert.ok(report.dimensions.plugins, 'Plugins distillation diff present');

console.log(`[Test Result] Token Reduction Rate: ${report.summary.reductionPercent}`);
console.log(`[Test Result] Saved Tokens: ${report.summary.savedTokens}`);
console.log(`[Test Result] Prefix Hash: ${report.summary.prefixHash}`);

// 清理测试临时目录
fs.rmSync(testDir, { recursive: true, force: true });
console.log('All Core Architecture tests PASSED successfully!');
