/**
 * 企业级分片并发存储与原子持久化基础设施 (v2.0.0-ENTERPRISE)
 * 1. 命名空间分片：区分主 Agent (root.json) 与子智能体 (subagents/agent-${agentId}.json)
 * 2. POSIX 原子文件锁：O_CREAT | O_EXCL 互斥锁 + 基于 PID 的 Stale Lock 探活自愈
 * 3. 同卷原子写入：tmpfile + fsync + rename，杜绝断电或并发读写的半写入
 * 4. 双层记忆体系：全局根目标 G0 (只读不可磨灭) + 局部滑动窗口 K=2 (指数衰减与工程红线)
 * 5. Compaction 协同：快照归档与生命周期重置
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_INTERVAL_MS = 50;
const MAX_LOCK_WAIT_MS = 2500;
const SLIDING_WINDOW_DEPTH = 2; // K = 2
const DECAY_LAMBDA = 0.35;
const DECAY_THRESHOLD = 0.2;

function resolvePath(p) {
  if (!p) return path.join(os.homedir(), '.claude/state/prompt-distill');
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return path.resolve(p);
}

/**
 * 跨进程互斥文件锁管理器
 */
class FileLocker {
  static acquire(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const lockPath = `${filePath}.lock`;
    const startTime = Date.now();

    while (Date.now() - startTime < MAX_LOCK_WAIT_MS) {
      try {
        const payload = JSON.stringify({ pid: process.pid, time: Date.now() });
        fs.writeFileSync(lockPath, payload, { flag: 'wx' });
        return lockPath;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;

        // 检查是否存在陈旧锁 (Stale Lock)
        try {
          const content = fs.readFileSync(lockPath, 'utf8');
          const info = JSON.parse(content);
          const isExpired = Date.now() - info.time > LOCK_TIMEOUT_MS;

          let processDead = false;
          if (info.pid) {
            try {
              process.kill(info.pid, 0); // 探针检测
            } catch (kErr) {
              if (kErr.code === 'ESRCH') processDead = true; // 进程已消亡
            }
          }

          if (isExpired || processDead) {
            // 接管陈旧锁
            try { fs.unlinkSync(lockPath); } catch {}
            continue;
          }
        } catch {
          // 读取或解析损坏，直接清理
          try { fs.unlinkSync(lockPath); } catch {}
          continue;
        }

        // 短暂休眠退避
        const endWait = Date.now() + LOCK_RETRY_INTERVAL_MS;
        while (Date.now() < endWait) {}
      }
    }
    // 超过最大等待，强制放行并打印警告，避免死锁阻塞交互
    return null;
  }

  static release(lockPath) {
    if (lockPath && fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
}

/**
 * 同卷原子覆盖写入
 */
function atomicWriteJsonSync(targetPath, data) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}`;
  const content = JSON.stringify(data, null, 2);

  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeFileSync(fd, content, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(tmpPath, targetPath);
}

export class SessionStorage {
  constructor(config = {}) {
    this.rootDir = resolvePath(config.storageDir || '~/.claude/state/prompt-distill');
    if (!fs.existsSync(this.rootDir)) {
      fs.mkdirSync(this.rootDir, { recursive: true });
    }
  }

  /**
   * 解析会话与智能体命名空间路径
   */
  _getPaths(sessionId, agentId = null) {
    const sessionDir = path.join(this.rootDir, sessionId);
    const metaPath = path.join(sessionDir, 'meta.json');
    let statePath;

    if (agentId) {
      const subDir = path.join(sessionDir, 'subagents');
      statePath = path.join(subDir, `agent-${agentId}.json`);
    } else {
      statePath = path.join(sessionDir, 'root.json');
    }

    return { sessionDir, metaPath, statePath };
  }

  /**
   * 读取会话元数据（含只读根目标 G0）
   */
  readMeta(sessionId) {
    const { metaPath } = this._getPaths(sessionId);
    if (!fs.existsSync(metaPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * 写入会话元数据
   */
  writeMeta(sessionId, metaData) {
    const { metaPath } = this._getPaths(sessionId);
    const lock = FileLocker.acquire(metaPath);
    try {
      const existing = this.readMeta(sessionId) || {};
      const updated = { ...existing, ...metaData, updatedAt: Date.now() };
      atomicWriteJsonSync(metaPath, updated);
      return updated;
    } finally {
      FileLocker.release(lock);
    }
  }

  /**
   * 读取当前 Agent 的执行状态
   */
  readState(sessionId, agentId = null) {
    const { statePath } = this._getPaths(sessionId, agentId);
    if (!fs.existsSync(statePath)) return null;
    try {
      return JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * 更新当前 Agent 的执行状态
   */
  updateState(sessionId, agentId = null, mutator) {
    const { statePath } = this._getPaths(sessionId, agentId);
    const lock = FileLocker.acquire(statePath);
    try {
      const current = this.readState(sessionId, agentId) || {
        sessionId,
        agentId: agentId || 'root',
        currentRound: 0,
        slidingWindow: [], // 保存最近 K 轮沉淀: { round, distillContent, techFacts: [] }
        lastDistilledPrompt: null,
        history: [],
        createdAt: Date.now()
      };

      const next = mutator(current);
      next.updatedAt = Date.now();
      atomicWriteJsonSync(statePath, next);
      return next;
    } finally {
      FileLocker.release(lock);
    }
  }

  /**
   * 记录一轮交互并维护滑动窗口与衰减
   */
  recordRound({ sessionId, agentId = null, round, rawPrompt, distilledPrompt, hostSummary = null, techFacts = [] }) {
    // 1. 如果是首轮且不存在全局根目标，固化 G0 至 meta.json
    if (round === 1) {
      const meta = this.readMeta(sessionId);
      if (!meta || !meta.rootObjective) {
        this.writeMeta(sessionId, {
          sessionId,
          createdAt: Date.now(),
          rootObjective: distilledPrompt || rawPrompt,
          isFrozen: true
        });
      }
    }

    // 2. 更新 Agent 专属状态，维护局部滑动窗口 (K=2)
    return this.updateState(sessionId, agentId, (state) => {
      state.currentRound = round;
      state.lastDistilledPrompt = distilledPrompt;

      // 组装本轮事实条目 (带初识重要度与红线标记)
      const parsedFacts = (techFacts || []).map(fact => {
        const text = typeof fact === 'string' ? fact : (fact.text || '');
        const isRedline = /始终|不要|严禁|必须|保持兼容|向后兼容|不得/i.test(text);
        return {
          text,
          round,
          score: isRedline ? 1.0 : 0.8,
          isRedline
        };
      });

      // 追加到滑动窗口
      state.slidingWindow.push({
        round,
        distillContent: hostSummary || '',
        techFacts: parsedFacts,
        timestamp: Date.now()
      });

      // 截断至最多 K = 2 轮
      if (state.slidingWindow.length > SLIDING_WINDOW_DEPTH) {
        state.slidingWindow = state.slidingWindow.slice(-SLIDING_WINDOW_DEPTH);
      }

      // 记录精简历史索引
      state.history.push({
        round,
        rawPromptLength: (rawPrompt || '').length,
        distilledPromptLength: (distilledPrompt || '').length,
        timestamp: Date.now()
      });

      return state;
    });
  }

  /**
   * 计算衰减后的有效活跃事实与滑动窗口上下文
   */
  getActiveContext(sessionId, agentId = null, currentRound) {
    const meta = this.readMeta(sessionId) || {};
    const state = this.readState(sessionId, agentId);

    const rootObjective = meta.rootObjective || null;
    if (!state || !state.slidingWindow || state.slidingWindow.length === 0) {
      return {
        rootObjective,
        recentDistillations: [],
        activeFacts: []
      };
    }

    const activeFacts = [];
    const recentDistillations = [];

    for (const win of state.slidingWindow) {
      if (win.distillContent) {
        recentDistillations.push({
          round: win.round,
          content: win.distillContent
        });
      }

      for (const fact of (win.techFacts || [])) {
        if (fact.isRedline) {
          activeFacts.push(fact.text); // 永久保留
          continue;
        }
        // 指数时间衰减计算: A_i(N) = A_0 * exp(-lambda * (N - t_i))
        const delta = Math.max(0, currentRound - fact.round);
        const currentScore = fact.score * Math.exp(-DECAY_LAMBDA * delta);
        if (currentScore >= DECAY_THRESHOLD) {
          activeFacts.push(fact.text);
        }
      }
    }

    return {
      rootObjective,
      recentDistillations,
      activeFacts: Array.from(new Set(activeFacts))
    };
  }

  /**
   * PreCompact 钩子触发：归档快照
   */
  exportSnapshot(sessionId) {
    const { sessionDir, metaPath, statePath } = this._getPaths(sessionId);
    const snapDir = path.join(sessionDir, 'snapshots');
    if (!fs.existsSync(snapDir)) {
      fs.mkdirSync(snapDir, { recursive: true });
    }

    const snapshot = {
      timestamp: Date.now(),
      meta: this.readMeta(sessionId),
      rootState: this.readState(sessionId, null)
    };

    const snapFile = path.join(snapDir, `pre_compact_${Date.now()}.json`);
    atomicWriteJsonSync(snapFile, snapshot);
    return snapFile;
  }

  /**
   * SessionStart (matcher: "compact") 钩子触发：重置轮次与局部窗口，吸收宿主新摘要
   */
  resetOnCompact(sessionId, hostTier4Summary = '') {
    // 保留全局根目标，但重置执行轮次为 1，清空局部窗口
    this.updateState(sessionId, null, (state) => {
      state.currentRound = 1;
      state.slidingWindow = [];
      if (hostTier4Summary) {
        state.slidingWindow.push({
          round: 1,
          distillContent: hostTier4Summary,
          techFacts: [{ text: `[宿主Tier4重构摘要] ${hostTier4Summary.slice(0, 300)}...`, round: 1, score: 1.0, isRedline: true }],
          timestamp: Date.now()
        });
      }
      return state;
    });
  }
}
