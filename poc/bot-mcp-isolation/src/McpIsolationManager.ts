import fs from 'node:fs';
import path from 'node:path';
import type {
  BotConfig,
  BotPluginDefinition,
  BotRuntimeEnv,
} from './types.js';

export class McpIsolationManager {
  private readonly baseSandboxDir: string;

  constructor(baseSandboxDir?: string) {
    this.baseSandboxDir = baseSandboxDir || path.resolve(process.cwd(), 'sandboxes');
  }

  /**
   * Sanitizes a botId to ensure it consists only of safe alphanumeric characters, dashes, and underscores.
   * Strips relative path traversal sequences to prevent sandbox escape.
   */
  public sanitizeBotId(botId: string): string {
    const sanitized = botId.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+/, '');
    return sanitized.length > 0 ? sanitized : 'default_bot';
  }

  /**
   * Initializes the physical directory topology for a specific Bot.
   * Ensures that the Bot has its own private CLAUDE_CONFIG_DIR and workspace.
   */
  public prepareBotSandbox(botConfig: BotConfig): {
    botDir: string;
    claudeConfigDir: string;
    workingDir: string;
    pluginsDir: string;
  } {
    const safeBotId = this.sanitizeBotId(botConfig.botId);
    const botsRoot = path.resolve(this.baseSandboxDir, 'bots');
    const botDir = path.resolve(botsRoot, safeBotId);

    // Enforce containment within bots directory
    if (!botDir.startsWith(botsRoot + path.sep)) {
      throw new Error(`[Security Violation]: Invalid botId "${botConfig.botId}" escapes sandbox directory.`);
    }

    const claudeConfigDir = path.join(botDir, 'claude_config');
    const workingDir = path.join(botDir, 'workspace');
    const pluginsDir = path.join(botDir, 'plugins');

    // Create sandbox directories
    fs.mkdirSync(claudeConfigDir, { recursive: true });
    fs.mkdirSync(workingDir, { recursive: true });
    fs.mkdirSync(pluginsDir, { recursive: true });

    // Initialize bot-specific settings inside its isolated claude_config directory
    const botSettingsFile = path.join(claudeConfigDir, 'settings.json');
    if (!fs.existsSync(botSettingsFile)) {
      const initialSettings = {
        botId: botConfig.botId,
        botName: botConfig.botName,
        autoMemoryEnabled: false,
        autoDreamEnabled: false,
        isolatedAt: new Date().toISOString(),
      };
      fs.writeFileSync(botSettingsFile, JSON.stringify(initialSettings, null, 2), 'utf-8');
    }

    return {
      botDir,
      claudeConfigDir,
      workingDir,
      pluginsDir,
    };
  }

  /**
   * Builds the execution environment for the Bot.
   * Key security: Dynamically injects CLAUDE_CONFIG_DIR pointing to the bot sandbox.
   * Sets strict isolation flags.
   */
  public buildRuntimeEnv(botConfig: BotConfig, claudeConfigDir: string, workingDir: string): BotRuntimeEnv {
    const baseEnv = { ...process.env };

    // Strip host sensitive variables
    delete baseEnv.ANTHROPIC_API_KEY;
    delete baseEnv.CLAUDE_CONFIG_DIR;

    const isolatedEnv: Record<string, string> = {
      ...baseEnv as Record<string, string>,
      CLAUDE_CONFIG_DIR: claudeConfigDir,
      BOT_ID: botConfig.botId,
      BOT_NAME: botConfig.botName,
      CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST: '1',
      NODE_ENV: 'test',
    };

    return {
      botId: botConfig.botId,
      claudeConfigDir,
      workingDir,
      strictMcpConfig: true,
      settingSources: [],
      env: isolatedEnv,
    };
  }

  /**
   * Filters candidate MCP servers according to the Bot's MCP policy.
   * Implements strict whitelist isolation.
   */
  public filterAllowedServers(botConfig: BotConfig, candidateServers: string[]): string[] {
    const allowedSet = new Set(botConfig.mcpPolicy.allowedServers);
    return candidateServers.filter((server) => allowedSet.has(server));
  }

  /**
   * Discovers and mounts local plugins belonging exclusively to this Bot.
   */
  public loadBotPlugins(botConfig: BotConfig): BotPluginDefinition[] {
    const results: BotPluginDefinition[] = [];

    for (const root of botConfig.pluginPolicy.pluginRoots) {
      if (!fs.existsSync(root)) continue;

      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const pluginDir = path.join(root, entry.name);
          const manifestPath = path.join(pluginDir, 'plugin.json');
          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
              // Check if allowed
              if (botConfig.pluginPolicy.allowedPlugins.includes(manifest.id || entry.name)) {
                results.push({
                  id: manifest.id || entry.name,
                  name: manifest.name || entry.name,
                  version: manifest.version || '1.0.0',
                  rootPath: pluginDir,
                  skills: manifest.skills || [],
                });
              }
            } catch (err: any) {
              console.warn(`[McpIsolationManager] Failed to parse plugin manifest at ${manifestPath}: ${err.message}`);
            }
          }
        }
      }
    }

    return results;
  }
}
