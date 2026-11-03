/**
 * 文件 → 冻结快照的对账。
 *
 * `botProfileFolder.ts` 让伙伴的档案摊成了文件,但光能写还不够:**用户拿编辑器
 * 改完 SOUL.md、或者伙伴自己用文件工具改完自己的灵魂之后,得有人把这件事收进去**,
 * 否则文件就只是一份写出去没人看的副本 —— 那还不如没有。
 *
 * 这一层就是那个「收进去」的动作:
 *
 *   - 家还没建 → 用数据库里的当前值播种(存量伙伴第一次遇到新版本时走这条);
 *   - 文件与冻结快照不一致、且是用户/伙伴的编辑 → 按文件派生一个新版本;
 *   - 文件与冻结快照不一致、但只是宿主上次镜像失败留下的旧副本 → 按数据库重写文件,
 *     不派生(见下文「镜像指纹」);
 *   - 一致 → 什么都不做(顺带为旧 Home 补写镜像指纹)。
 *
 * 派生而不是就地改,是因为运行中的任务认的是版本号:派生出新版本之后,**进行中的
 * 对话仍然跑在旧版本上,下一轮才换过去** —— 契约 9.3 节的「等待下一轮生效」。
 * 就地改会让一个跑到一半的任务中途换身份。
 *
 * 何时对账:开主任务之前(bots.ts 的 createBotCanonicalSessionImpl),以及伙伴导入
 * 完成之后(bot-import/host.ts)。两处都便宜(没改过就是几次读文件)。
 *
 * 镜像指纹:设置页保存先提交数据库、再把 SOUL.md / USER.md 镜像到文件。镜像失败或
 * 与对账竞态时,文件还是旧内容 —— 若当成用户编辑去派生,就会把刚保存的设置回滚。
 * 所以宿主每次成功写文件后在 Home 根记下 `.host-mirror.json`(每个槽的 sha256)。
 * 逐槽判定(F = 文件,S = 快照,M = 指纹):
 *
 *   - F === S                        → in-sync
 *   - F !== S 且 sha256(F) === M     → stale:没人动过宿主写的文件,数据库已前进
 *   - 其余(无指纹或指纹不符)       → edited:维持原行为,按文件派生
 *
 * stale 槽**永远不会被派生**。重写只在数据库版本自读快照以来未变、且该槽文件仍是
 * 宿主上次写入的字节时进行(由 `rewriteFolder` 在每 Home 锁内复核),否则跳过,留给
 * 下一轮。信任边界:伪造或添加指纹只会让宿主用数据库覆盖文件,不会派生;删除或损坏
 * 指纹会退回旧的「按文件派生」行为,等同于直接改 SOUL.md,不多给任何权限。
 *
 * 纯逻辑 + 注入,不 import Electron 与数据库 —— 判定要能直接单测。
 */

import type { BotProfileFolderContent, BotProfileFolderSeed } from './botProfileFolder.js';
import {
  planBotProfileMirror,
  type BotProfileMirrorMarker,
  type BotProfileMirrorPlan,
  type BotProfileMirrorSlot,
  type BotProfileMirrorTexts,
} from './botProfileMirrorMarker.js';

/** 数据库里那份冻结快照(当前版本行)。 */
export interface BotProfileSnapshot {
  identitySource: string;
  /** `capabilities_json` 解出来的对象,含 `userContextSource`。 */
  config: Record<string, unknown>;
  currentVersion: number;
}

export interface BotProfileFolderSyncDeps {
  readSnapshot: (botId: string) => Promise<BotProfileSnapshot | null>;
  readFolder: (botId: string) => Promise<BotProfileFolderContent>;
  /** 家还没建时用快照播种(内部会顺带搬技能)。 */
  seedFolder: (botId: string, seed: BotProfileFolderSeed) => Promise<void>;
  /**
   * 按文件内容派生一个新版本。实现方走与设置页保存**同一条**事务。
   * 返回派生后的版本号,供 stale 槽在派生之后按新版本复核再重写。
   */
  deriveVersion: (input: {
    botId: string;
    identitySource: string;
    config: Record<string, unknown>;
    expectedCurrentVersion: number;
  }) => Promise<number | void>;
  /** Folder + marker read under the per-Home mirror lock. Absent = legacy (no marker). */
  readFolderWithMarker?: (
    botId: string,
  ) => Promise<{ folder: BotProfileFolderContent; marker: BotProfileMirrorMarker | null }>;
  /**
   * Rewrites the stale slots from the CURRENT DB texts and records the marker,
   * under the per-Home lock, only if the DB version still equals
   * `expectedCurrentVersion`. Returns false when skipped.
   */
  rewriteFolder?: (
    botId: string,
    slots: BotProfileMirrorSlot[],
    expectedCurrentVersion: number,
  ) => Promise<boolean>;
  /** Records hashes for slots whose file bytes still equal `observed` (under the lock). */
  recordMirror?: (botId: string, observed: BotProfileMirrorTexts) => Promise<void>;
}

export type BotProfileFolderSyncOutcome =
  /** 数据库里没有这个伙伴。 */
  | 'missing'
  /** 家还没建,已按数据库播种。 */
  | 'seeded'
  /** 文件比快照新,已派生新版本(下一轮生效)。 */
  | 'derived'
  /** 文件与快照一致。 */
  | 'unchanged'
  /** 文件是宿主上一次镜像失败留下的旧副本,已按数据库重写,不派生。 */
  | 'mirror-stale'
  /** 文件是旧镜像,但数据库版本在对账期间已前进,本轮跳过重写(不派生)。 */
  | 'mirror-skipped';

/**
 * 文件内容与快照是不是同一份。
 *
 * `userContextSource` 在数据库里躺在 `config` 里,在磁盘上是独立的
 * `memories/USER.md`。其余 config 是宿主策略，不能从 Agent 可触达的 Home
 * 反向写回数据库，否则修改 permissions 就能在下一任务自授 trusted。
 */
export function botProfileFolderMatchesSnapshot(
  folder: BotProfileFolderContent,
  snapshot: BotProfileSnapshot,
): boolean {
  if (folder.identitySource !== snapshot.identitySource) return false;
  const { userContextSource: snapshotUserContext } = snapshot.config;
  const expectedUserContext = typeof snapshotUserContext === 'string' ? snapshotUserContext : '';
  if (folder.userContextSource !== expectedUserContext) return false;
  return true;
}

export async function syncBotProfileFromFolder(
  botId: string,
  deps: BotProfileFolderSyncDeps,
): Promise<BotProfileFolderSyncOutcome> {
  const snapshot = await deps.readSnapshot(botId);
  if (!snapshot) return 'missing';

  const { folder, marker } = await readFolderAndMarker(botId, deps);
  // 没有 SOUL.md = 家还没建起来(存量伙伴,或者用户把它删了)。用数据库那份播种,
  // 而不是把伙伴的身份当成"被清空了" —— 删掉一个文件不该等于抹掉一个人格。
  if (!folder.identitySource.trim()) return seedMissingFolder(botId, snapshot, deps);

  return reconcileExistingFolder(botId, folder, marker, snapshot, deps);
}

/** Marker-aware read when wired; a failing combined read falls back to legacy (no marker). */
async function readFolderAndMarker(
  botId: string,
  deps: BotProfileFolderSyncDeps,
): Promise<{ folder: BotProfileFolderContent; marker: BotProfileMirrorMarker | null }> {
  if (deps.readFolderWithMarker) {
    const combined = await deps.readFolderWithMarker(botId).catch(() => null);
    if (combined) return combined;
  }
  return { folder: await deps.readFolder(botId), marker: null };
}

async function seedMissingFolder(
  botId: string,
  snapshot: BotProfileSnapshot,
  deps: BotProfileFolderSyncDeps,
): Promise<BotProfileFolderSyncOutcome> {
  await deps.seedFolder(botId, {
    identitySource: snapshot.identitySource,
    userContextSource: snapshotUserContext(snapshot),
    config: stripUserContext(snapshot.config),
  });
  // 播种只补缺失的文件:旁边留着的手改 USER.md 要在这一轮就收进来,而不是等下一次。
  // 重读后身份仍为空(例如空的 SOUL.md 还在)时绝不派生,不能把人格抹成空。
  const seeded = await deps.readFolder(botId);
  if (!seeded.identitySource.trim()) return 'seeded';
  if (botProfileFolderMatchesSnapshot(seeded, snapshot)) {
    await deps.recordMirror?.(botId, folderTexts(seeded)).catch(() => {});
    return 'seeded';
  }
  await deriveFromTexts(botId, folderTexts(seeded), snapshot, deps);
  return 'derived';
}

async function reconcileExistingFolder(
  botId: string,
  folder: BotProfileFolderContent,
  marker: BotProfileMirrorMarker | null,
  snapshot: BotProfileSnapshot,
  deps: BotProfileFolderSyncDeps,
): Promise<BotProfileFolderSyncOutcome> {
  if (botProfileFolderMatchesSnapshot(folder, snapshot)) {
    // 旧 Home 没有指纹:一致时补写,之后镜像失败才能被认出来。
    await deps.recordMirror?.(botId, folderTexts(folder)).catch(() => {});
    return 'unchanged';
  }
  const plan = planBotProfileMirror(folder, snapshotTexts(snapshot), marker);
  const staleSlots = staleSlotsOf(plan);
  if (plan.identity !== 'edited' && plan.userContext !== 'edited') {
    // 只有旧镜像:按数据库重写,绝不派生。没有重写能力时同样不派生。
    if (!deps.rewriteFolder) return 'mirror-skipped';
    const rewritten = await deps.rewriteFolder(botId, staleSlots, snapshot.currentVersion);
    return rewritten ? 'mirror-stale' : 'mirror-skipped';
  }
  // 有真编辑:编辑槽取文件,stale 槽取快照 —— 旧镜像的文本永远不进派生。
  const edited: BotProfileMirrorTexts = {};
  if (plan.identity === 'edited') edited.identitySource = folder.identitySource;
  if (plan.userContext === 'edited') edited.userContextSource = folder.userContextSource;
  const texts = { ...snapshotTexts(snapshot), ...edited };
  const version = await deriveFromTexts(botId, texts, snapshot, deps);
  // 派生成功后才重写 stale 槽,并以派生出的版本号复核新鲜度。
  if (staleSlots.length > 0 && deps.rewriteFolder && typeof version === 'number') {
    await deps.rewriteFolder(botId, staleSlots, version).catch(() => false);
  }
  await deps.recordMirror?.(botId, edited).catch(() => {});
  return 'derived';
}

async function deriveFromTexts(
  botId: string,
  texts: { identitySource: string; userContextSource: string },
  snapshot: BotProfileSnapshot,
  deps: BotProfileFolderSyncDeps,
): Promise<number | void> {
  return deps.deriveVersion({
    botId,
    identitySource: texts.identitySource,
    // 保留宿主冻结的能力策略，只接纳 Home 中真正属于 Bot 内容的用户画像。
    config: { ...snapshot.config, userContextSource: texts.userContextSource },
    expectedCurrentVersion: snapshot.currentVersion,
  });
}

function staleSlotsOf(plan: BotProfileMirrorPlan): BotProfileMirrorSlot[] {
  const slots: BotProfileMirrorSlot[] = [];
  if (plan.identity === 'stale') slots.push('soul');
  if (plan.userContext === 'stale') slots.push('userContext');
  return slots;
}

type ProfileTexts = { identitySource: string; userContextSource: string };

function folderTexts(folder: BotProfileFolderContent): ProfileTexts {
  return { identitySource: folder.identitySource, userContextSource: folder.userContextSource };
}

function snapshotUserContext(snapshot: BotProfileSnapshot): string {
  const value = snapshot.config.userContextSource;
  return typeof value === 'string' ? value : '';
}

function snapshotTexts(snapshot: BotProfileSnapshot): ProfileTexts {
  return {
    identitySource: snapshot.identitySource,
    userContextSource: snapshotUserContext(snapshot),
  };
}

function stripUserContext(config: Record<string, unknown>): Record<string, unknown> {
  const { userContextSource: _ignored, ...rest } = config;
  return rest;
}
