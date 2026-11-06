/**
 * @file src/storage/Paths.ts
 * @description Standardized User Data Directory and Agent Resolution for multiagent-orchestration.
 * Uses ~/.multiagent-orchestration as the central user directory, with agents symlinked from
 * Customizations/agents or local Bots.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Get the root user data directory for multiagent-orchestration (~/.multiagent-orchestration).
 */
export function getUserDataDir(): string {
  if (process.env.MULTIAGENT_HOME) {
    return path.resolve(process.env.MULTIAGENT_HOME);
  }
  return path.join(os.homedir(), '.multiagent-orchestration');
}

/**
 * Directory for user-added / linked bots (~/.multiagent-orchestration/agents).
 */
export function getUserAgentsDir(): string {
  return path.join(getUserDataDir(), 'agents');
}

/**
 * Directory for user-added / linked skills (~/.multiagent-orchestration/skills).
 */
export function getUserSkillsDir(): string {
  return path.join(getUserDataDir(), 'skills');
}

/**
 * Directory for database storage (~/.multiagent-orchestration/storage).
 */
export function getUserStorageDir(): string {
  return path.join(getUserDataDir(), 'storage');
}

/**
 * Directory for group rooms (charters, memory blackboards).
 */
export function getUserGroupsDir(): string {
  return path.join(getUserDataDir(), 'groups');
}

/**
 * Directory for chat sessions / transcripts.
 */
export function getUserChatsDir(): string {
  return path.join(getUserDataDir(), 'chats');
}

/**
 * Path to models configuration (~/.multiagent-orchestration/models.json or Customizations/models.json).
 */
export function getUserModelsConfigPath(projectRoot: string = process.cwd()): string {
  const userPath = path.join(getUserDataDir(), 'models.json');
  if (fs.existsSync(userPath)) {
    return userPath;
  }
  const customPath = path.join(projectRoot, 'Customizations', 'models.json');
  if (fs.existsSync(customPath)) {
    return customPath;
  }
  return userPath;
}

/**
 * Path to models preference (~/.multiagent-orchestration/models-preference.json).
 */
export function getUserModelsPreferencePath(): string {
  return path.join(getUserDataDir(), 'models-preference.json');
}

/**
 * Resolve the real directory of a bot by searching:
 * 1. User-added agents directory (~/.multiagent-orchestration/agents/<name>)
 * 2. Customizations agents directory (<projectRoot>/Customizations/agents/<name>)
 * 3. Workspace repository Bots directory (<projectRoot>/Bots/<name>)
 * 4. Built-in partners (<projectRoot>/packages/runtime-assets/builtin-partners/<name>)
 */
export function resolveBotDir(botName: string, projectRoot: string = process.cwd()): string {
  // 1. User-added / linked agents in ~/.multiagent-orchestration/agents/<name>
  const userBotDir = path.join(getUserAgentsDir(), botName);
  if (fs.existsSync(userBotDir)) {
    return userBotDir;
  }

  // 2. Customizations agents directory
  const customBotDir = path.join(projectRoot, 'Customizations', 'agents', botName);
  if (fs.existsSync(customBotDir)) {
    return customBotDir;
  }

  // 3. Project-level Bots directory
  const localBotDir = path.join(projectRoot, 'Bots', botName);
  if (fs.existsSync(localBotDir)) {
    return localBotDir;
  }

  // 4. Builtin partners fallback
  const builtinDir = path.join(projectRoot, 'packages', 'runtime-assets', 'builtin-partners', botName);
  if (fs.existsSync(builtinDir)) {
    return builtinDir;
  }

  return userBotDir;
}

/**
 * Ensure user data directories exist on startup.
 */
export function ensureUserDataDirs(): {
  userDataDir: string;
  agentsDir: string;
  skillsDir: string;
  storageDir: string;
  groupsDir: string;
  chatsDir: string;
} {
  const userDataDir = getUserDataDir();
  const agentsDir = getUserAgentsDir();
  const skillsDir = getUserSkillsDir();
  const storageDir = getUserStorageDir();
  const groupsDir = getUserGroupsDir();
  const chatsDir = getUserChatsDir();

  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(groupsDir, { recursive: true });
  fs.mkdirSync(chatsDir, { recursive: true });

  return { userDataDir, agentsDir, skillsDir, storageDir, groupsDir, chatsDir };
}
