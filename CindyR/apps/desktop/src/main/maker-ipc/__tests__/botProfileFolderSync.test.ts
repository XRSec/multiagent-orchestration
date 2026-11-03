/**
 * 文件 → 冻结快照的对账。
 *
 * 最要紧的一条是**不能无限派生**:文件和快照在两边的形状不一样(用户画像在数据库
 * 里躺在 config 里,在磁盘上是独立的 USER.md),比对时没拉回同一个形状的话,每次
 * 对账都判成「变了」,伙伴的版本号会一路涨上去,每开一个任务就换一次版本。
 */

import { describe, expect, it, vi } from 'vitest';

import type { BotProfileFolderContent } from '../botProfileFolder';
import {
  botProfileFolderMatchesSnapshot,
  syncBotProfileFromFolder,
  type BotProfileFolderSyncDeps,
  type BotProfileSnapshot,
} from '../botProfileFolderSync';
import { fingerprintBotProfileText, type BotProfileMirrorMarker } from '../botProfileMirrorMarker';

function folder(overrides: Partial<BotProfileFolderContent> = {}): BotProfileFolderContent {
  return {
    identitySource: '你是纸老虎，一个爱做菜的厨子。',
    userContextSource: 'Chris 住在上海。',
    systemPromptOverride: '',
    config: { model: 'claude-sonnet-4-6', harness: 'claude' },
    ...overrides,
  };
}

function snapshot(overrides: Partial<BotProfileSnapshot> = {}): BotProfileSnapshot {
  return {
    identitySource: '你是纸老虎，一个爱做菜的厨子。',
    config: {
      model: 'claude-sonnet-4-6',
      harness: 'claude',
      userContextSource: 'Chris 住在上海。',
    },
    currentVersion: 3,
    ...overrides,
  };
}

function harness(over: { folder?: BotProfileFolderContent; snapshot?: BotProfileSnapshot | null } = {}) {
  const seedFolder = vi.fn(async () => {});
  const deriveVersion = vi.fn(async () => {});
  return {
    seedFolder,
    deriveVersion,
    deps: {
      readSnapshot: async () => (over.snapshot === undefined ? snapshot() : over.snapshot),
      readFolder: async () => over.folder ?? folder(),
      seedFolder,
      deriveVersion,
    },
  };
}

describe('文件与快照是不是同一份', () => {
  it('两边形状不同但内容相同时判为一致 —— 否则会无限派生新版本', () => {
    // 用户画像:数据库在 config 里,磁盘上是独立文件。
    expect(botProfileFolderMatchesSnapshot(folder(), snapshot())).toBe(true);
  });

  it('宿主 config 副本不参与对账', () => {
    expect(
      botProfileFolderMatchesSnapshot(
        folder({ config: { harness: 'claude', model: 'claude-sonnet-4-6' } }),
        snapshot(),
      ),
    ).toBe(true);
  });

  it('灵魂、用户画像变化会派生，Home config 不能反向改宿主策略', () => {
    expect(botProfileFolderMatchesSnapshot(folder({ identitySource: '换了' }), snapshot())).toBe(
      false,
    );
    expect(botProfileFolderMatchesSnapshot(folder({ userContextSource: '换了' }), snapshot())).toBe(
      false,
    );
    expect(
      botProfileFolderMatchesSnapshot(folder({ config: { model: 'gpt-5.6' } }), snapshot()),
    ).toBe(true);
  });
});

describe('对账', () => {
  it('没改过就什么都不做', async () => {
    const h = harness();
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('unchanged');
    expect(h.seedFolder).not.toHaveBeenCalled();
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });

  it('用户改了 SOUL.md:派生新版本,带上乐观锁', async () => {
    const h = harness({ folder: folder({ identitySource: '我改成了别的' }) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('derived');
    expect(h.deriveVersion).toHaveBeenCalledWith({
      botId: 'bot-a',
      identitySource: '我改成了别的',
      // 写回数据库时用户画像塞回 config —— 那是数据库这边的形状。
      config: {
        model: 'claude-sonnet-4-6',
        harness: 'claude',
        userContextSource: 'Chris 住在上海。',
      },
      expectedCurrentVersion: 3,
    });
  });

  it('家还没建起来:用数据库那份播种,不当成「身份被清空」', async () => {
    const h = harness({ folder: folder({ identitySource: '', userContextSource: '' }) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('seeded');
    expect(h.seedFolder).toHaveBeenCalledWith('bot-a', {
      identitySource: '你是纸老虎，一个爱做菜的厨子。',
      userContextSource: 'Chris 住在上海。',
      config: { model: 'claude-sonnet-4-6', harness: 'claude' },
    });
    // 不能顺手派生版本:什么都没变,只是把文件补回去。
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });

  it('用户把 SOUL.md 删了也走播种,而不是把人格抹成空', async () => {
    const h = harness({ folder: folder({ identitySource: '   ' }) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('seeded');
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });

  it('只缺 SOUL.md 时补种后立刻收进留着的手改 USER.md,不等下一次对账', async () => {
    const h = harness();
    const reads = [
      folder({ identitySource: '', userContextSource: '手改的用户画像' }),
      folder({ userContextSource: '手改的用户画像' }),
    ];
    h.deps.readFolder = async () => reads.shift()!;
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('derived');
    expect(h.seedFolder).toHaveBeenCalledOnce();
    expect(h.deriveVersion).toHaveBeenCalledWith({
      botId: 'bot-a',
      identitySource: '你是纸老虎，一个爱做菜的厨子。',
      config: { model: 'claude-sonnet-4-6', harness: 'claude', userContextSource: '手改的用户画像' },
      expectedCurrentVersion: 3,
    });
  });

  it('数据库里没有这个伙伴时不碰磁盘', async () => {
    const h = harness({ snapshot: null });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('missing');
    expect(h.seedFolder).not.toHaveBeenCalled();
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });

  it('派生一次之后就稳定下来,不会每次对账都涨版本', async () => {
    // 派生完数据库会跟上文件;下一次对账两边一致。
    const changed = folder({ identitySource: '改过的' });
    const first = harness({ folder: changed });
    expect(await syncBotProfileFromFolder('bot-a', first.deps)).toBe('derived');

    const after = harness({
      folder: changed,
      snapshot: snapshot({ identitySource: '改过的', currentVersion: 4 }),
    });
    expect(await syncBotProfileFromFolder('bot-a', after.deps)).toBe('unchanged');
  });
});

describe('镜像指纹:旧镜像按数据库重写,真编辑才派生', () => {
  const OLD = '你是旧的纸老虎。';
  const NEW = snapshot().identitySource;
  const NEW_USER = 'Chris 住在上海。';

  function mirrorHarness(
    over: { folder?: BotProfileFolderContent; marker?: BotProfileMirrorMarker | null } = {},
  ) {
    const base = harness({ folder: over.folder });
    const deriveVersion = vi.fn(async () => 4);
    const rewriteFolder = vi.fn(async () => true);
    const recordMirror = vi.fn(async () => {});
    const readFolderWithMarker = vi.fn(async () => ({
      folder: over.folder ?? folder(),
      marker: over.marker ?? null,
    }));
    const deps: BotProfileFolderSyncDeps = {
      ...base.deps,
      deriveVersion,
      readFolderWithMarker,
      rewriteFolder,
      recordMirror,
    };
    return { deps, deriveVersion, rewriteFolder, recordMirror, readFolderWithMarker };
  }

  const marker = (soul: string, user = NEW_USER): BotProfileMirrorMarker => ({
    schemaVersion: 1,
    soul: fingerprintBotProfileText(soul),
    userContext: fingerprintBotProfileText(user),
  });

  it('文件是宿主上次写的旧内容:mirror-stale,按数据库重写,不派生', async () => {
    const h = mirrorHarness({ folder: folder({ identitySource: OLD }), marker: marker(OLD) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('mirror-stale');
    expect(h.deriveVersion).not.toHaveBeenCalled();
    expect(h.rewriteFolder).toHaveBeenCalledWith('bot-a', ['soul'], 3);
  });

  it('手改的 SOUL.md(指纹不符):派生,并为派生的文本补记指纹', async () => {
    const h = mirrorHarness({ folder: folder({ identitySource: '手改' }), marker: marker(OLD) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('derived');
    expect(h.deriveVersion).toHaveBeenCalledWith(
      expect.objectContaining({ identitySource: '手改', expectedCurrentVersion: 3 }),
    );
    expect(h.recordMirror).toHaveBeenCalledWith('bot-a', { identitySource: '手改' });
    expect(h.rewriteFolder).not.toHaveBeenCalled();
  });

  it('旧 harness(无指纹依赖)行为不变:按文件派生', async () => {
    const h = harness({ folder: folder({ identitySource: OLD }) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('derived');
    expect(h.deriveVersion).toHaveBeenCalledWith(expect.objectContaining({ identitySource: OLD }));
  });

  it('读指纹失败时退回旧行为(无指纹),不因指纹抛错', async () => {
    const h = mirrorHarness({ folder: folder({ identitySource: OLD }) });
    h.readFolderWithMarker.mockRejectedValueOnce(new Error('EACCES'));
    h.deps.readFolder = async () => folder({ identitySource: OLD });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('derived');
    expect(h.deriveVersion).toHaveBeenCalledWith(expect.objectContaining({ identitySource: OLD }));
  });

  it('SOUL 手改 + USER 旧镜像:USER 取快照派生,派生后按新版本重写 USER', async () => {
    const h = mirrorHarness({
      folder: folder({ identitySource: '手改', userContextSource: '旧用户画像' }),
      marker: marker(OLD, '旧用户画像'),
    });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('derived');
    expect(h.deriveVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        identitySource: '手改',
        config: expect.objectContaining({ userContextSource: NEW_USER }),
      }),
    );
    expect(h.rewriteFolder).toHaveBeenCalledWith('bot-a', ['userContext'], 4);
    expect(h.deriveVersion.mock.invocationCallOrder[0]!).toBeLessThan(
      h.rewriteFolder.mock.invocationCallOrder[0]!,
    );
    expect(h.recordMirror).toHaveBeenCalledWith('bot-a', { identitySource: '手改' });
  });

  it('一致时 unchanged 并补记指纹;补记失败仍是 unchanged', async () => {
    const h = mirrorHarness();
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('unchanged');
    expect(h.recordMirror).toHaveBeenCalledOnce();
    expect(h.recordMirror).toHaveBeenCalledWith('bot-a', {
      identitySource: NEW,
      userContextSource: NEW_USER,
    });
    h.recordMirror.mockRejectedValueOnce(new Error('EROFS'));
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('unchanged');
  });

  it('mirror-stale 重写失败:向调用方抛出,且不派生', async () => {
    const h = mirrorHarness({ folder: folder({ identitySource: OLD }), marker: marker(OLD) });
    h.rewriteFolder.mockRejectedValueOnce(new Error('ENOSPC'));
    await expect(syncBotProfileFromFolder('bot-a', h.deps)).rejects.toThrow('ENOSPC');
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });

  it('对账期间版本已前进:跳过重写,mirror-skipped,不派生', async () => {
    const h = mirrorHarness({ folder: folder({ identitySource: OLD }), marker: marker(OLD) });
    h.rewriteFolder.mockResolvedValueOnce(false);
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('mirror-skipped');
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });

  it('重写之后再对账是 unchanged,不会无限派生', async () => {
    const h = mirrorHarness({ folder: folder({ identitySource: OLD }), marker: marker(OLD) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('mirror-stale');
    h.readFolderWithMarker.mockResolvedValue({ folder: folder(), marker: marker(NEW) });
    expect(await syncBotProfileFromFolder('bot-a', h.deps)).toBe('unchanged');
    expect(h.deriveVersion).not.toHaveBeenCalled();
  });
});
