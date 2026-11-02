/**
 * Purpose: Unit tests for SkillCapsuleHelper (Helper 8)
 * Usage: node --test tests/unit/test-skill-capsule.mjs
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { SkillCapsuleHelper } from '../../packages/agent-control-plane/helpers/skill-capsule/SkillCapsuleHelper.mjs';

describe('SkillCapsuleHelper Unit Tests (Helper 8)', () => {
  let tmpCacheDir;

  before(() => {
    tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-capsule-test-'));
  });

  after(() => {
    if (fs.existsSync(tmpCacheDir)) {
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    }
  });

  it('Test 8.1: YAML frontmatter 提取与微胶囊 <= 180 字符硬约束', () => {
    const helper = new SkillCapsuleHelper({ maxCapsuleChars: 180 });
    const mockSkill = `---
name: browser-control
description: Advanced headless browser orchestration and multi-profile session manager
triggers: browser, web_search, vps
---
# Main Instructions
` + 'Extremely long detailed guide instructions here. '.repeat(50);

    const record = helper.distillContent('browser-control', mockSkill);
    assert.strictEqual(record.skillName, 'browser-control');
    assert.deepStrictEqual(record.triggers, ['browser', 'web_search', 'vps']);
    assert.ok(record.capsuleText.length <= 180, `微胶囊字符数必须 <= 180，当前为 ${record.capsuleText.length}`);
    assert.ok(record.sourceHash.length === 64, 'SHA-256 哈希值长度必须为 64');
  });

  it('Test 8.2: 强 SHA-256 哈希落盘缓存与二次读取秒级命中', () => {
    const helper = new SkillCapsuleHelper({ cacheDir: tmpCacheDir });
    const skillPath = path.join(tmpCacheDir, 'test-skill.md');
    fs.writeFileSync(skillPath, '# My Test Skill\nDescription text for testing capsule.', 'utf8');

    // 首次加载：触发蒸馏并落盘
    const record1 = helper.loadOrDistill('test-skill', skillPath);
    assert.ok(record1.capsuleText);

    // 验证磁盘文件生成
    const cacheFiles = fs.readdirSync(tmpCacheDir).filter(f => f.endsWith('.json'));
    assert.strictEqual(cacheFiles.length, 1);

    // 二次加载：直接命中磁盘缓存
    const start = performance.now();
    const record2 = helper.loadOrDistill('test-skill', skillPath);
    const duration = performance.now() - start;

    assert.strictEqual(record2.sourceHash, record1.sourceHash);
    assert.strictEqual(record2.capsuleText, record1.capsuleText);
    assert.ok(duration < 10, '二次读取命中缓存耗时应接近 0ms');
  });

  it('Test 8.3: 技能内容修改后热更新感知并自动淘汰旧缓存', () => {
    const helper = new SkillCapsuleHelper({ cacheDir: tmpCacheDir });
    const skillPath = path.join(tmpCacheDir, 'test-hot-reload.md');
    fs.writeFileSync(skillPath, '# Version 1\nInitial instructions', 'utf8');

    const v1 = helper.loadOrDistill('test-hot-reload', skillPath);

    // 修改文件内容模拟热更新
    fs.writeFileSync(skillPath, '# Version 2\nUpdated instructions with new features', 'utf8');

    const v2 = helper.loadOrDistill('test-hot-reload', skillPath);
    assert.notStrictEqual(v2.sourceHash, v1.sourceHash, '源文件哈希必须更新');
    assert.notStrictEqual(v2.capsuleText, v1.capsuleText, '微胶囊内容必须相应更新');

    // 确认旧版本哈希缓存已被淘汰清理
    const cacheFiles = fs.readdirSync(tmpCacheDir).filter(f => f.startsWith('test_hot_reload.') && f.endsWith('.json'));
    assert.strictEqual(cacheFiles.length, 1, '旧缓存文件必须被淘汰，仅保留当前最新缓存');
  });
});
