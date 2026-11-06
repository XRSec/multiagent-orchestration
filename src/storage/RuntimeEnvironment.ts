import * as fs from 'fs';
import * as path from 'path';
import { StorageManager, BotRecord } from './StorageManager';
import { getUserAgentsDir } from './Paths';

export const SENSITIVE_ENV_VARS_TO_STRIP = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CONFIG_PATH',
  'CLAUDE_USER_CONFIG',
  'CLAUDE_PROJECT_DIR',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
  'SUBAGENT_MODEL',
  'CLAUDE_SUBAGENT_OVERRIDE',
  'CLAUDE_CODE_ENTRY',
  'HOST_CLAUDE_DIR',
  'CLAUDE_HOST_SETTINGS',
  'CLAUDE_DEV_OVERRIDE',
  'CLAUDE_INTERCEPT_PROXY',
];

export interface AssembledTurnContext {
  systemPrompt: string;
  cwd: string;
  env: Record<string, string>;
  deltaMessages: Array<{ role: string; sender: string; content: string }>;
  blackboardSnapshot: { charter: string; memory: string } | null;
}

/**
 * Safe code-point truncation (Scenario E5: never split 4-byte UTF-16 surrogate pairs)
 */
export function safeTruncateContent(text: string, maxCodePoints: number = 600): string {
  const chars = Array.from(text || '');
  if (chars.length <= maxCodePoints) {
    return text;
  }
  return chars.slice(0, maxCodePoints).join('') + '…';
}

export class RuntimeEnvironment {
  private projectRoot: string;
  private storageManager: StorageManager;

  constructor(projectRoot: string, storageManager: StorageManager) {
    this.projectRoot = projectRoot;
    this.storageManager = storageManager;
  }

  /**
   * Resolve bounded Working Directory (CWD) for a specific bot
   */
  public resolveBotCwd(botName: string): string {
    switch (botName) {
      case 'moCode':
        return this.projectRoot;
      case 'moDoc':
        return path.join(this.projectRoot, 'docs');
      case 'moAdmin':
        return this.projectRoot;
      case 'MoDeep':
        return path.join(this.projectRoot, 'workspace', 'tmp');
      case 'MoGit':
        return this.projectRoot;
      case 'Mo': {
        const customAgentDir = path.join(this.projectRoot, 'Customizations', 'agents');
        if (fs.existsSync(customAgentDir)) {
          return customAgentDir;
        }
        const userAgentDir = path.join(getUserAgentsDir(), 'Mo');
        if (fs.existsSync(userAgentDir)) {
          return getUserAgentsDir();
        }
        return path.join(this.projectRoot, 'Bots');
      }
      case 'MoCI':
        return path.join(this.projectRoot, 'test');
      default:
        return this.projectRoot;
    }
  }

  /**
   * Resolve bounded Working Directory based on bot's workbench.json, falling back to resolveBotCwd.
   */
  public resolveBotWorkbenchCwd(botNameOrId: string): string {
    const candidates = [
      path.join(this.projectRoot, 'Customizations', 'agents', botNameOrId, 'workbench.json'),
      path.join(getUserAgentsDir(), botNameOrId, 'workbench.json'),
    ];

    const bot = this.storageManager.getBot(botNameOrId);
    if (bot && bot.bot_dir) {
      candidates.unshift(path.join(bot.bot_dir, 'workbench.json'));
    }

    for (const wbPath of candidates) {
      if (fs.existsSync(wbPath)) {
        try {
          const wb = JSON.parse(fs.readFileSync(wbPath, 'utf-8'));
          if (wb && wb.defaultWorkingDir && typeof wb.defaultWorkingDir === 'string') {
            const rawDir = wb.defaultWorkingDir.trim();
            if (path.isAbsolute(rawDir)) {
              return rawDir;
            }
            return path.resolve(this.projectRoot, rawDir);
          }
        } catch {}
      }
    }

    return this.resolveBotCwd(bot ? bot.name : botNameOrId);
  }

  /**
   * Build clean environment variables with dedicated CLAUDE_CONFIG_DIR and stripped sensitive keys
   */
  public buildSanitizedEnvironment(bot: BotRecord): Record<string, string> {
    const cleanEnv: Record<string, string> = {};

    for (const [key, val] of Object.entries(process.env)) {
      if (val !== undefined && !SENSITIVE_ENV_VARS_TO_STRIP.includes(key)) {
        cleanEnv[key] = val;
      }
    }

    cleanEnv['CLAUDE_CONFIG_DIR'] = bot.claude_config_dir;
    cleanEnv['BOT_ID'] = bot.id;
    cleanEnv['BOT_NAME'] = bot.name;
    cleanEnv['BOT_STATUS'] = bot.status;

    return cleanEnv;
  }

  /**
   * Validate that the Bot's dedicated claude_config directory exists and is properly locked
   */
  public validateBotIsolation(bot: BotRecord): { isIsolated: boolean; reason?: string } {
    if (!fs.existsSync(bot.claude_config_dir)) {
      return {
        isIsolated: false,
        reason: `Config directory does not exist: ${bot.claude_config_dir}`,
      };
    }

    const settingsPath = path.join(bot.claude_config_dir, 'settings.json');
    if (!fs.existsSync(settingsPath)) {
      return { isIsolated: false, reason: `settings.json missing in ${bot.claude_config_dir}` };
    }

    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (!Array.isArray(settings.settingSources) || settings.settingSources.length !== 0) {
        return {
          isIsolated: false,
          reason: 'settingSources is not empty array [] (host leakage risk)',
        };
      }
    } catch {
      return { isIsolated: false, reason: 'Failed to parse settings.json' };
    }

    return { isIsolated: true };
  }

  /**
   * Assemble context for an upcoming turn in a Group Room or DM
   */
  public assembleTurnContext(
    botName: string,
    sessionId: string,
    roomId?: string,
    preFetchedDeltas?: Array<{ id?: string; role?: string; sender: string; content: string; timestamp?: number }>
  ): AssembledTurnContext {
    const bot = this.storageManager.getBot(botName);
    if (!bot) {
      throw new Error(`Bot not registered: ${botName}`);
    }

    const globalAgentsPath = path.join(this.projectRoot, 'Customizations', 'AGENTS.md');
    const globalClaudePath = path.join(this.projectRoot, 'Customizations', 'CLAUDE.md');
    let globalDirectives = '';
    if (fs.existsSync(globalAgentsPath)) {
      globalDirectives = fs.readFileSync(globalAgentsPath, 'utf-8');
    } else if (fs.existsSync(globalClaudePath)) {
      globalDirectives = fs.readFileSync(globalClaudePath, 'utf-8');
    }

    const soulPath = path.join(bot.bot_dir, 'SOUL.md');
    const soulContent = fs.existsSync(soulPath) ? fs.readFileSync(soulPath, 'utf-8') : '';

    const cwd = this.resolveBotCwd(bot.name);
    const env = this.buildSanitizedEnvironment(bot);

    let blackboardSnapshot: { charter: string; memory: string } | null = null;
    let deltaMessages: Array<{ role: string; sender: string; content: string }> = [];

    let combinedSystemPrompt = '';
    if (globalDirectives) {
      combinedSystemPrompt += `# Global Base Directives (Customizations/AGENTS.md)\n${globalDirectives}\n\n`;
    }
    combinedSystemPrompt += `# Partner Personality & Principles (SOUL.md)\n${soulContent}`;

    if (roomId) {
      blackboardSnapshot = this.storageManager.readBlackboard(roomId);
      combinedSystemPrompt += `\n\n## Group Room Charter\n${blackboardSnapshot.charter}`;
      combinedSystemPrompt += `\n\n## Current Blackboard State (GROUP_MEMORY.md)\n${blackboardSnapshot.memory}`;

      if (preFetchedDeltas && preFetchedDeltas.length > 0) {
        deltaMessages = preFetchedDeltas.map((d) => ({
          role: d.role || 'assistant',
          sender: d.sender,
          content: d.content,
        }));
      } else {
        const rawDeltas = this.storageManager.getDeltaMessages(roomId, bot.id);
        deltaMessages = rawDeltas.map((d) => ({
          role: d.sender_role,
          sender: d.sender_id,
          content: d.content,
        }));
      }

      if (deltaMessages.length > 0) {
        // Cap delta slice to latest 30 messages, 600 code points per message (Scenarios E4 & E5)
        const MAX_DELTA_MESSAGES = 30;
        const omittedCount = Math.max(0, deltaMessages.length - MAX_DELTA_MESSAGES);
        const recentDeltas = deltaMessages.slice(-MAX_DELTA_MESSAGES).map((m) => ({
          sender: m.sender,
          role: m.role,
          content: safeTruncateContent(m.content, 600),
        }));

        const omissionHeader =
          omittedCount > 0 ? `(${omittedCount} earlier messages were omitted.)\n` : '';
        combinedSystemPrompt += `\n\n## Incremental Peer Messages Delta (<untrusted-json-block>)\n${omissionHeader}<untrusted-json-block>\n${JSON.stringify(
          recentDeltas,
          null,
          2
        )}\n</untrusted-json-block>`;
      }
    }

    return {
      systemPrompt: combinedSystemPrompt,
      cwd,
      env,
      deltaMessages,
      blackboardSnapshot,
    };
  }

  public assembleContextPrompt(
    botIdOrName: string,
    roomId?: string,
    deltaMessages?: Array<{ id?: string; role?: string; sender: string; content: string; timestamp?: number }>
  ): string {
    const sessionId = roomId ? `session_${roomId}` : 'session_default';
    const turnContext = this.assembleTurnContext(botIdOrName, sessionId, roomId, deltaMessages);
    return turnContext.systemPrompt;
  }

  public getProjectRoot(): string {
    return this.projectRoot;
  }

  public ensureBotWorkspaceDir(botId: string): string {
    const dir = path.join(this.projectRoot, 'workspace', 'bots', botId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  public ensureGroupSandboxDir(roomId: string, botId: string): string {
    const dir = path.join(this.projectRoot, 'sandboxes', 'groups', roomId, botId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}
