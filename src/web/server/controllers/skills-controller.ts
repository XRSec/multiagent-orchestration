/**
 * Purpose: Skills asset registry scanner, skill documentation parser, status toggle, and real importer.
 * Context: Web server controller managing Dimension 2 (Skills Registry) with true filesystem persistence.
 * Usage: Mounted by Vite plugin middleware to serve /api/skills routes.
 * Prerequisites: Node.js runtime, filesystem access to system and workspace skills directories.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  GLOBAL_SKILLS_DIR,
  USER_MULTIAGENT_SKILLS_DIR,
  CUSTOM_SKILLS_DIR,
  PROJECT_ROOT,
  sendJson,
  sendError,
  parseJsonBody
} from '../common.ts';

export interface ScannedSkill {
  id: string;
  name: string;
  title: string;
  description: string;
  scope: 'global' | 'workspace';
  path: string;
  content: string;
  hasDoc: boolean;
  type?: string;
  version?: string;
  author?: string;
  tools?: string[];
  enabled: boolean;
}

const SKILLS_CONFIG_FILE = path.join(os.homedir(), '.multiagent-orchestration', 'skills-config.json');

interface SkillsConfigFile {
  disabledSkills: string[];
}

function loadSkillsConfig(): SkillsConfigFile {
  try {
    if (fs.existsSync(SKILLS_CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(SKILLS_CONFIG_FILE, 'utf8'));
      if (Array.isArray(data.disabledSkills)) {
        return data;
      }
    }
  } catch {}
  return { disabledSkills: [] };
}

function saveSkillsConfig(config: SkillsConfigFile): void {
  try {
    const dir = path.dirname(SKILLS_CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SKILLS_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.warn('[skills-controller] Failed to save skills config:', err);
  }
}

export function parseSkillDoc(filePath: string): { frontmatter: Record<string, string>; content: string } {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
    const match = frontmatterRegex.exec(raw);
    if (!match) {
      return { frontmatter: {}, content: raw };
    }
    const yamlBlock = match[1];
    const content = match[2];
    const frontmatter: Record<string, string> = {};
    for (const line of yamlBlock.split('\n')) {
      const idx = line.indexOf(':');
      if (idx > 0) {
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
        frontmatter[key] = val;
      }
    }
    return { frontmatter, content };
  } catch {
    return { frontmatter: {}, content: '' };
  }
}

export function scanSkillsInDirectory(baseDir: string, scope: 'global' | 'workspace'): ScannedSkill[] {
  const skills: ScannedSkill[] = [];
  if (!fs.existsSync(baseDir)) return skills;
  const config = loadSkillsConfig();

  try {
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(baseDir, entry.name);

      let targetPath = fullPath;
      try {
        if (fs.lstatSync(fullPath).isSymbolicLink()) {
          targetPath = fs.realpathSync(fullPath);
        }
      } catch {}

      const isDir = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
      if (!isDir) continue;

      let skillDocPath = path.join(targetPath, 'SKILL.md');
      if (!fs.existsSync(skillDocPath)) {
        skillDocPath = path.join(targetPath, 'README.md');
      }

      const hasDoc = fs.existsSync(skillDocPath);
      let frontmatter: Record<string, string> = {};
      let content = '';

      if (hasDoc) {
        const parsed = parseSkillDoc(skillDocPath);
        frontmatter = parsed.frontmatter;
        content = parsed.content;
      }

      const name = frontmatter.name || entry.name;
      const title = frontmatter.title || name;
      const description = frontmatter.description || (content ? content.slice(0, 120).replace(/[#*`\n]/g, ' ') : `${name} 技能组件`);
      const enabled = !config.disabledSkills.includes(entry.name);

      skills.push({
        id: entry.name,
        name,
        title,
        description,
        scope,
        path: fullPath,
        content: content || `# ${name}\n\n${description}`,
        hasDoc,
        type: frontmatter.type || 'skill',
        version: frontmatter.version || '1.0.0',
        author: frontmatter.author || 'Mo',
        enabled
      });
    }
  } catch (e) {
    console.warn('[viteRoomApi] Failed to scan skills in', baseDir, e);
  }

  return skills;
}

export async function handleSkillsRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL
): Promise<boolean> {
  // 2.1 PUT /api/skills/:id/status (Toggle skill switch)
  const statusMatch = pathname.match(/^\/api\/skills\/([^/]+)\/status$/);
  if (statusMatch && method === 'PUT') {
    const skillId = decodeURIComponent(statusMatch[1]).trim();
    try {
      const body = await parseJsonBody(req);
      const enabled = Boolean(body.enabled);
      const config = loadSkillsConfig();
      if (enabled) {
        config.disabledSkills = config.disabledSkills.filter((id) => id !== skillId);
      } else {
        if (!config.disabledSkills.includes(skillId)) {
          config.disabledSkills.push(skillId);
        }
      }
      saveSkillsConfig(config);
      sendJson(res, 200, { ok: true, skillId, enabled });
      return true;
    } catch (err) {
      sendError(res, err, 400);
      return true;
    }
  }

  // 2.2 GET /api/skills
  if (pathname === '/api/skills' && method === 'GET') {
    try {
      const scope = url.searchParams.get('scope') || 'all';
      const globalSkills = scanSkillsInDirectory(GLOBAL_SKILLS_DIR, 'global');
      const userSkills = scanSkillsInDirectory(USER_MULTIAGENT_SKILLS_DIR, 'global');
      const customSkills = scanSkillsInDirectory(CUSTOM_SKILLS_DIR, 'workspace');

      const map = new Map<string, ScannedSkill>();
      if (scope === 'all' || scope === 'global') {
        for (const s of [...globalSkills, ...userSkills]) {
          map.set(s.id, s);
        }
      }
      if (scope === 'all' || scope === 'workspace' || scope === 'project') {
        for (const s of customSkills) {
          map.set(s.id, s);
        }
      }

      const skills = Array.from(map.values());
      sendJson(res, 200, { ok: true, skills });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 2.3 GET /api/skills/:id
  if (pathname.startsWith('/api/skills/') && method === 'GET') {
    const skillId = pathname.slice('/api/skills/'.length).trim();
    try {
      const globalSkills = scanSkillsInDirectory(GLOBAL_SKILLS_DIR, 'global');
      const customSkills = scanSkillsInDirectory(CUSTOM_SKILLS_DIR, 'workspace');
      const found = [...customSkills, ...globalSkills].find((s) => s.id === skillId);
      if (found) {
        sendJson(res, 200, { ok: true, skill: found });
        return true;
      }
      sendError(res, new Error(`Skill ${skillId} not found`), 404);
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 2.4 GET /api/folders/skills
  if (pathname === '/api/folders/skills' && method === 'GET') {
    try {
      const folderPath = url.searchParams.get('folderPath') || PROJECT_ROOT;
      const targetCustom = path.join(folderPath, 'Customizations', 'skills');
      const skills = fs.existsSync(targetCustom)
        ? scanSkillsInDirectory(targetCustom, 'workspace')
        : scanSkillsInDirectory(CUSTOM_SKILLS_DIR, 'workspace');
      sendJson(res, 200, { ok: true, skills });
      return true;
    } catch (err) {
      sendError(res, err, 500);
      return true;
    }
  }

  // 2.5 POST /api/skills/import
  if (pathname === '/api/skills/import' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const sourcePath = body.sourcePath ? path.resolve(body.sourcePath.trim()) : '';
      const rawName = body.skillName || body.name || (sourcePath ? path.basename(sourcePath) : `skill-${Date.now()}`);
      const skillName = rawName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const overwrite = Boolean(body.overwrite);
      const mode = body.mode === 'symlink' ? 'symlink' : 'copy';

      const targetBase = USER_MULTIAGENT_SKILLS_DIR;
      if (!fs.existsSync(targetBase)) fs.mkdirSync(targetBase, { recursive: true });
      const targetDir = path.join(targetBase, skillName);

      if (fs.existsSync(targetDir)) {
        if (!overwrite) {
          sendJson(res, 409, { ok: false, error: `[ALREADY_EXISTS] Skill ${skillName} already exists in ${targetBase}` });
          return true;
        }
        // Remove existing target safely
        try {
          if (fs.lstatSync(targetDir).isSymbolicLink()) {
            fs.unlinkSync(targetDir);
          } else {
            fs.rmSync(targetDir, { recursive: true, force: true });
          }
        } catch {}
      }

      if (sourcePath && fs.existsSync(sourcePath)) {
        if (mode === 'symlink') {
          fs.symlinkSync(sourcePath, targetDir, 'dir');
        } else {
          fs.cpSync(sourcePath, targetDir, { recursive: true });
        }
      } else {
        fs.mkdirSync(targetDir, { recursive: true });
        const docContent = `---
title: ${body.title || skillName}
description: ${body.description || `${skillName} 技能`}
type: ${body.type || 'skill'}
---

# ${body.title || skillName}

${body.content || body.description || '技能说明文档'}
`;
        fs.writeFileSync(path.join(targetDir, 'SKILL.md'), docContent, 'utf8');
      }

      const importedSkill: ScannedSkill = {
        id: skillName,
        name: skillName,
        title: body.title || skillName,
        description: body.description || `${skillName} 技能组件`,
        scope: 'global',
        path: targetDir,
        hasDoc: fs.existsSync(path.join(targetDir, 'SKILL.md')),
        content: `# ${skillName}`,
        enabled: true
      };

      sendJson(res, 200, { ok: true, skill: importedSkill });
      return true;
    } catch (err) {
      sendError(res, err, 400);
      return true;
    }
  }

  return false;
}
