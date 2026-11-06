/**
 * Purpose: Workspace file tree traversal, project overview statistics, and file preview API.
 * Context: Web server controller managing Dimension 1 (Workspaces & Directories).
 * Usage: Mounted by Vite plugin middleware to serve /api/workspace and /api/workspaces routes.
 * Prerequisites: Node.js runtime, project root filesystem access.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PROJECT_ROOT, getGitBranch, sendJson, sendError } from '../common.ts';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  language?: string;
  children?: FileNode[];
  gitStatus?: 'modified' | 'added' | 'untracked';
}

export const IGNORED_NAMES = new Set([
  'node_modules',
  '.git',
  'dist',
  '.sessions',
  '.daemon',
  '.DS_Store',
  'tsconfig.tsbuildinfo'
]);

export function buildFileTree(dir: string, baseDir: string, maxDepth: number, currentDepth = 0): FileNode[] {
  if (currentDepth >= maxDepth) return [];
  if (!fs.existsSync(dir)) return [];

  const items: FileNode[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        const children = buildFileTree(fullPath, baseDir, maxDepth, currentDepth + 1);
        items.push({
          id: `dir-${relPath.replace(/[/\\]/g, '_')}`,
          name: entry.name,
          path: relPath,
          type: 'directory',
          children
        });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        let lang = 'plaintext';
        if (['.ts', '.tsx'].includes(ext)) lang = 'typescript';
        else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) lang = 'javascript';
        else if (['.json'].includes(ext)) lang = 'json';
        else if (['.md'].includes(ext)) lang = 'markdown';
        else if (['.css'].includes(ext)) lang = 'css';
        else if (['.html'].includes(ext)) lang = 'html';
        else if (['.sh', '.bash', '.zsh'].includes(ext)) lang = 'shell';

        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch {}

        items.push({
          id: `file-${relPath.replace(/[/\\]/g, '_')}`,
          name: entry.name,
          path: relPath,
          type: 'file',
          size,
          extension: ext,
          language: lang
        });
      }
    }
  } catch {}

  // Sort: directories first, then files
  items.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });

  return items;
}

export function countStats(dir: string, maxDepth = 4, depth = 0): {
  directoriesCount: number;
  filesCount: number;
  categoryCounts: Record<string, number>;
} {
  const result = {
    directoriesCount: 0,
    filesCount: 0,
    categoryCounts: { 'ts/tsx': 0, 'json': 0, 'md': 0, 'other': 0 }
  };

  if (depth > maxDepth || !fs.existsSync(dir)) return result;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_NAMES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        result.directoriesCount++;
        const sub = countStats(full, maxDepth, depth + 1);
        result.directoriesCount += sub.directoriesCount;
        result.filesCount += sub.filesCount;
        for (const [k, v] of Object.entries(sub.categoryCounts)) {
          result.categoryCounts[k] = (result.categoryCounts[k] || 0) + v;
        }
      } else if (entry.isFile()) {
        result.filesCount++;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.ts' || ext === '.tsx') result.categoryCounts['ts/tsx']++;
        else if (ext === '.json') result.categoryCounts['json']++;
        else if (ext === '.md') result.categoryCounts['md']++;
        else result.categoryCounts['other']++;
      }
    }
  } catch {}

  return result;
}

export async function handleWorkspaceRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  // 1.1 GET /api/workspace/overview & /api/workspaces
  if ((pathname === '/api/workspace/overview' || pathname === '/api/workspaces') && method === 'GET') {
    try {
      const gitBranch = getGitBranch();
      const stats = countStats(PROJECT_ROOT);
      const workspaces = [
        {
          id: 'multiagent-orchestration',
          name: 'multiagent-orchestration',
          path: PROJECT_ROOT,
          isCurrent: true,
          branch: gitBranch
        }
      ];

      const coreDirectories = [
        { name: 'src', description: '系统核心存储与网关守护进程', path: path.join(PROJECT_ROOT, 'src') },
        { name: 'src/web', description: 'Web 控制台前端与 API 中间件', path: path.join(PROJECT_ROOT, 'src', 'web') },
        { name: 'Bots', description: '7 位 Mo-Bots 智能体资产与配置', path: path.join(PROJECT_ROOT, 'Bots') },
        { name: 'groups', description: '多智能体协同作战群、章程与黑板', path: path.join(PROJECT_ROOT, 'groups') },
        { name: 'Customizations', description: '定制化技能、插件、模型配置与全局规则', path: path.join(PROJECT_ROOT, 'Customizations') },
        { name: 'docs', description: '系统架构规范、协议与调度收据', path: path.join(PROJECT_ROOT, 'docs') },
        { name: 'test', description: '自动化测试套件与守卫验证', path: path.join(PROJECT_ROOT, 'test') }
      ];

      sendJson(res, 200, {
        ok: true,
        projectRoot: PROJECT_ROOT,
        currentDir: PROJECT_ROOT,
        git: { branch: gitBranch, clean: true },
        stats: {
          totalFiles: stats.filesCount,
          totalDirs: stats.directoriesCount,
          filesCount: stats.filesCount,
          directoriesCount: stats.directoriesCount,
          categoryCounts: stats.categoryCounts,
          gitBranch
        },
        workspaces,
        coreDirectories
      });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 1.2 GET /api/workspace/tree & /api/workspaces/tree
  if ((pathname === '/api/workspace/tree' || pathname === '/api/workspaces/tree') && method === 'GET') {
    try {
      const subPath = url.searchParams.get('dir') || url.searchParams.get('subPath') || '';
      const depth = Math.min(parseInt(url.searchParams.get('depth') || '4', 10), 6);
      const targetDir = path.resolve(PROJECT_ROOT, subPath);

      if (!targetDir.startsWith(PROJECT_ROOT)) {
        sendError(res, new Error('Path boundary violation'), 400);
        return true;
      }

      const tree = buildFileTree(targetDir, PROJECT_ROOT, depth);
      sendJson(res, 200, {
        ok: true,
        targetDir,
        tree
      });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 1.3 GET /api/workspaces/file
  if (pathname === '/api/workspaces/file' && method === 'GET') {
    try {
      const relOrAbsPath = url.searchParams.get('path');
      if (!relOrAbsPath) {
        sendError(res, new Error('File path required'), 400);
        return true;
      }
      const fullPath = path.isAbsolute(relOrAbsPath) ? relOrAbsPath : path.resolve(PROJECT_ROOT, relOrAbsPath);

      if (!fullPath.startsWith(PROJECT_ROOT) && !fullPath.startsWith(os.homedir())) {
        sendError(res, new Error('Path boundary violation'), 400);
        return true;
      }

      if (!fs.existsSync(fullPath)) {
        sendError(res, new Error(`File not found: ${relOrAbsPath}`), 404);
        return true;
      }

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        sendError(res, new Error('Target is a directory'), 400);
        return true;
      }

      if (stat.size > 1024 * 1024) {
        sendJson(res, 200, {
          ok: true,
          name: path.basename(fullPath),
          path: path.relative(PROJECT_ROOT, fullPath),
          size: stat.size,
          extension: path.extname(fullPath),
          content: `// [File size: ${(stat.size / 1024).toFixed(1)} KB exceeds preview limit]`
        });
        return true;
      }

      const content = fs.readFileSync(fullPath, 'utf8');
      sendJson(res, 200, {
        ok: true,
        name: path.basename(fullPath),
        path: path.relative(PROJECT_ROOT, fullPath),
        size: stat.size,
        extension: path.extname(fullPath),
        content
      });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 1.4 GET /api/workspaces/folders
  if (pathname === '/api/workspaces/folders' && method === 'GET') {
    try {
      const folders = [
        {
          id: 'ws-root',
          name: 'multiagent-orchestration',
          path: PROJECT_ROOT,
          label: 'multiagent-orchestration (当前工作区)',
          isCurrent: true
        },
        {
          id: 'ws-parent',
          name: 'IDEA.localized',
          path: path.dirname(PROJECT_ROOT),
          label: 'IDEA.localized (上层工作区)',
          isCurrent: false
        }
      ];
      sendJson(res, 200, { ok: true, folders });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  return false;
}
