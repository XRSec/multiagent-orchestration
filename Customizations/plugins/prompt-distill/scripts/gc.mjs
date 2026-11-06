/**
 * 机会主义异步垃圾回收引擎 (Opportunistic Garbage Collection)
 * SessionStart / SessionEnd 触发脱钩后台执行
 * TTL (7天) + LRU (100MB封顶)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const DEFAULT_TTL_DAYS = 7;
const MAX_STORAGE_BYTES = 100 * 1024 * 1024; // 100 MB
const TARGET_STORAGE_BYTES = 70 * 1024 * 1024; // 70 MB
const RMFILE_PATH = '/opt/xrsec/.env/rmfile';

function safeRemove(targetPath) {
  if (fs.existsSync(RMFILE_PATH)) {
    try {
      execFileSync(RMFILE_PATH, [targetPath], { stdio: 'ignore' });
      return;
    } catch {
      // fallback
    }
  }
  // 安全兜底
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function resolveStorageDir(rawPath) {
  if (!rawPath) return path.join(os.homedir(), '.claude/state/prompt-distill');
  if (rawPath.startsWith('~/')) {
    return path.join(os.homedir(), rawPath.slice(2));
  }
  return path.resolve(rawPath);
}

function getDirSize(dirPath) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        size += getDirSize(fullPath);
      } else if (entry.isFile()) {
        size += fs.statSync(fullPath).size;
      }
    }
  } catch {}
  return size;
}

export function runGC(storageDirRaw) {
  const rootDir = resolveStorageDir(storageDirRaw);
  if (!fs.existsSync(rootDir)) return;

  const now = Date.now();
  const maxAgeMs = DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;

  let sessionDirs = [];
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const sessionPath = path.join(rootDir, entry.name);
        const stats = fs.statSync(sessionPath);
        sessionDirs.push({
          path: sessionPath,
          mtime: stats.mtimeMs,
          size: getDirSize(sessionPath)
        });
      }
    }
  } catch {
    return;
  }

  // 1. TTL 淘汰：超过 7 天直接安全删除
  const remaining = [];
  for (const session of sessionDirs) {
    if (now - session.mtime > maxAgeMs) {
      safeRemove(session.path);
    } else {
      remaining.push(session);
    }
  }

  // 2. LRU 容量硬门限淘汰
  let totalSize = remaining.reduce((acc, cur) => acc + cur.size, 0);
  if (totalSize > MAX_STORAGE_BYTES) {
    // 按 mtime 升序（最老排最前）
    remaining.sort((a, b) => a.mtime - b.mtime);
    for (const session of remaining) {
      if (totalSize <= TARGET_STORAGE_BYTES) break;
      safeRemove(session.path);
      totalSize -= session.size;
    }
  }
}

// 支持直接作为脚本脱钩运行
if (process.argv[2] === '--run') {
  const dir = process.argv[3] || '~/.claude/state/prompt-distill';
  runGC(dir);
}

