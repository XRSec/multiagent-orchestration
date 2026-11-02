import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BotGroupService,
  botGroupLaneRouteKey,
  botGroupPlanRouteKey,
  botGroupThreadRouteKey,
  MAX_CIRCLES_PER_ROUND,
  MAX_BOT_MESSAGES_PER_ROUND,
} from '../src/session/bot-group-service.mjs';

console.log('[TEST] Starting Cindy Bot Group Room Logic Test Suite...');

const testStorage = path.resolve(process.cwd(), '.sessions_test');
if (fs.existsSync(testStorage)) {
  fs.rmSync(testStorage, { recursive: true, force: true });
}

const service = new BotGroupService(testStorage);

// 1. Test Room Creation
const group = service.createGroup({
  name: '核心多Agent审计群',
  organizerBotId: 'lead-orchestrator',
  memberBotIds: ['lead-orchestrator', 'agent-architect', 'rea-partner'],
});

assert.ok(group.id.startsWith('grp_'), 'Room ID should start with grp_');
assert.equal(group.currentSequence, 0, 'Initial sequence must be 0');

const fetched = service.getGroup(group.id);
assert.equal(fetched.members.length, 3, 'Must register 3 default partner members');
console.log('  ✓ Cindy Group Room entity & member table initialized');

// 2. Test Monotonic Sequence Allocation
const send1 = service.sendMessage({
  groupId: group.id,
  authorKind: 'user',
  authorName: 'XR',
  content: '请开始审计协议',
  clientId: 'cid_001',
});

assert.equal(send1.message.sequence, 1, 'First message sequence must be 1');
assert.equal(send1.isDuplicate, false);

const send2 = service.sendMessage({
  groupId: group.id,
  authorKind: 'bot',
  authorBotId: 'lead-orchestrator',
  authorName: 'Lead Orchestrator',
  content: '收到，正在指派 [@REA Partner](cindy://bot/rea-partner) 执行',
  clientId: 'cid_002',
});

assert.equal(send2.message.sequence, 2, 'Next message sequence must increment to 2');
assert.deepEqual(send2.message.mentionsJson.botIds, ['rea-partner'], 'Must extract cindy://bot/ target');
console.log('  ✓ Monotonic sequence allocation & [Name](cindy://bot/<id>) parsing verified');

// 3. Test Idempotency with client_id
const duplicateSend = service.sendMessage({
  groupId: group.id,
  authorKind: 'user',
  content: '请开始审计协议 (重发)',
  clientId: 'cid_001',
});

assert.equal(duplicateSend.isDuplicate, true, 'Duplicate client_id must be identified');
assert.equal(duplicateSend.message.sequence, 1, 'Duplicate must return existing message seq 1');
assert.equal(service.getGroup(group.id).currentSequence, 2, 'Sequence must not advance on duplicate');
console.log('  ✓ ClientId idempotency prevents duplicate room message writes');

// 4. Test Unseen Delta Slicing for Partners
const deltaForRea = service.getDeltaMessagesForPartner(group.id, 'rea-partner');
assert.equal(deltaForRea.deltas.length, 2, 'REA Partner has not read any messages yet (seen 0)');
assert.equal(deltaForRea.deltas[0].sequence, 1);
assert.equal(deltaForRea.deltas[1].sequence, 2);

// Mark read up to sequence 2
service.markPartnerRead(group.id, 'rea-partner', 2);
const deltaAfterRead = service.getDeltaMessagesForPartner(group.id, 'rea-partner');
assert.equal(deltaAfterRead.deltas.length, 0, 'No unseen messages after marking sequence 2 as read');
console.log('  ✓ Partner last_seen_sequence delta slicing works cleanly');

// 5. Test Dedicated Route Keys
const laneKey = botGroupLaneRouteKey(group.id);
const planKey = botGroupPlanRouteKey(group.id, 'plan_01');
const threadKey = botGroupThreadRouteKey(group.id, 'msg_root_123');

assert.equal(laneKey, `group:${group.id}`);
assert.equal(planKey, `group:${group.id}:plan:plan_01`);
assert.equal(threadKey, `group:${group.id}:thread:msg_root_123`);
console.log('  ✓ Cindy lane, plan, and thread route key topologies validated');

// 6. Test Invariant Constants
assert.equal(MAX_CIRCLES_PER_ROUND, 3);
assert.equal(MAX_BOT_MESSAGES_PER_ROUND, 10);
console.log('  ✓ Round limits (MAX_CIRCLES_PER_ROUND=3, MAX_BOT_MESSAGES=10) intact');

// Cleanup test db
fs.rmSync(testStorage, { recursive: true, force: true });

console.log('[TEST] All Cindy Bot Group Room Logic tests PASSED!\n');
