/**
 * @file src/daemon/config/UniversalConfigLoader.ts
 * @description Host as Universal Loader: parses global & local configs,
 * validates against Bot capabilities, and isolates bot-level runtime configs.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SENSITIVE_ENV_VARS_TO_STRIP } from '../../storage/RuntimeEnvironment';
import { getUserModelsConfigPath, getUserModelsPreferencePath } from '../../storage/Paths';

export interface ModelPreferences {
  primaryModel?: string;
  primaryFallbackModel?: string;
  auxiliaryModel?: string;
  auxiliaryFallbackModel?: string;
  activeDefaultModel?: string;
  fallbackModel?: string;
  defaultReasoning?: string;
  modelMappings?: Array<{
    role: string;
    displayName: string;
    targetModel: string;
  }>;
}

export interface ModelResolveOptions {
  botId?: string;
  botName?: string;
  botModel?: string;
  botFallbackModel?: string;
  isAuxiliary?: boolean;
}

export interface ResolvedModelEndpoint {
  fullModelId: string;
  modelId: string;
  providerId: string;
  baseUrl: string;
  apiKey?: string;
  apiProtocol: string;
  thinkingLevel?: string;
  catalogModel?: CatalogModel;
}

export interface ModelCostConfig {
  input: number;
  output: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface CatalogModel {
  id: string;
  name: string;
  contextWindow?: number;
  maxOutput?: number;
  maxTokens?: number;
  reasoning?: boolean;
  thinkingLevelMap?: Record<string, string | null>;
  input?: Array<'text' | 'image'>;
  cost?: ModelCostConfig;
}

export interface ProviderConfig {
  name: string;
  baseUrl?: string;
  apiKey?: string;
  api?: string;
  models: CatalogModel[];
}

export interface ModelsConfig {
  $schema?: string;
  version?: string;
  providers: Record<string, ProviderConfig>;
}

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  type?: 'stdio' | 'sse' | 'inprocess';
  url?: string;
}

export interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export interface SkillManifest {
  name: string;
  description: string;
  path: string;
  isGlobal: boolean;
}

export class UniversalConfigLoader {
  private projectRoot: string;
  private hostHome: string;

  constructor(projectRoot: string, hostHome: string = os.homedir()) {
    this.projectRoot = path.resolve(projectRoot);
    this.hostHome = hostHome;
  }

  /**
   * Load and merge MCP servers from host global ~/.claude.json / ~/.claude/mcp.json
   * and local project root .mcp.json.
   * Local overrides global on name collision.
   */
  public loadMergedMcpServers(): Record<string, McpServerConfig> {
    const merged: Record<string, McpServerConfig> = {};

    // 1. Host Global: ~/.claude.json or ~/.claude/mcp.json (Read-only)
    const globalClaudeJson = path.join(this.hostHome, '.claude.json');
    const globalClaudeDirMcp = path.join(this.hostHome, '.claude', 'mcp.json');

    if (fs.existsSync(globalClaudeJson)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(globalClaudeJson, 'utf-8'));
        if (parsed.mcpServers) {
          Object.assign(merged, parsed.mcpServers);
        }
      } catch (err) {
        // Safe skip on read/parse error
      }
    }

    if (fs.existsSync(globalClaudeDirMcp)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(globalClaudeDirMcp, 'utf-8'));
        if (parsed.mcpServers) {
          Object.assign(merged, parsed.mcpServers);
        }
      } catch (err) {
        // Safe skip
      }
    }

    // 2. Project Local: .mcp.json in project root
    const localMcpJson = path.join(this.projectRoot, '.mcp.json');
    if (fs.existsSync(localMcpJson)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(localMcpJson, 'utf-8'));
        if (parsed.mcpServers) {
          for (const [name, config] of Object.entries(parsed.mcpServers)) {
            // Local overrides global
            merged[name] = config as McpServerConfig;
          }
        }
      } catch (err) {
        // Safe skip
      }
    }

    return merged;
  }

  /**
   * Scan skills from centralized directory ~/.agents/skills/, user directory ~/.multiagent-orchestration/skills/,
   * and project-level Customizations/skills & .agents/skills/
   */
  public loadAvailableSkills(): Map<string, SkillManifest> {
    const skills = new Map<string, SkillManifest>();

    // 1. Centralized ~/.agents/skills/
    const centralSkillsDir = path.join(this.hostHome, '.agents', 'skills');
    if (fs.existsSync(centralSkillsDir)) {
      this.scanSkillsInDir(centralSkillsDir, true, skills);
    }

    // 2. User directory ~/.multiagent-orchestration/skills/
    const userSkillsDir = path.join(this.hostHome, '.multiagent-orchestration', 'skills');
    if (fs.existsSync(userSkillsDir)) {
      this.scanSkillsInDir(userSkillsDir, true, skills);
    }

    // 3. Project Customizations/skills/
    const customSkillsDir = path.join(this.projectRoot, 'Customizations', 'skills');
    if (fs.existsSync(customSkillsDir)) {
      this.scanSkillsInDir(customSkillsDir, false, skills);
    }

    // 4. Project local .agents/skills/
    const localSkillsDir = path.join(this.projectRoot, '.agents', 'skills');
    if (fs.existsSync(localSkillsDir)) {
      this.scanSkillsInDir(localSkillsDir, false, skills);
    }

    return skills;
  }

  private scanSkillsInDir(dirPath: string, isGlobal: boolean, outMap: Map<string, SkillManifest>): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const stat = fs.statSync(fullPath, { throwIfNoEntry: false });
        if (!stat || !stat.isDirectory()) continue;

        const skillMd = path.join(fullPath, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          outMap.set(entry.name, {
            name: entry.name,
            description: `Skill ${entry.name}`,
            path: fullPath,
            isGlobal,
          });
        }
      }
    } catch {
      // Directory may not exist or be accessible
    }
  }

  /**
   * Filter and sanitize MCP servers for a specific bot based on its capabilities.json.
   * Cleans sensitive environment variables.
   */
  public resolveBotMcpConfig(
    botDir: string,
    allMcpServers: Record<string, McpServerConfig>
  ): Record<string, McpServerConfig> {
    const capabilitiesFile = path.join(botDir, 'capabilities.json');
    let allowedMcpTools: string[] = ['*'];

    if (fs.existsSync(capabilitiesFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(capabilitiesFile, 'utf-8'));
        if (Array.isArray(parsed.mcp_servers)) {
          allowedMcpTools = parsed.mcp_servers;
        }
      } catch {
        // fallback to default
      }
    }

    const filtered: Record<string, McpServerConfig> = {};
    const allowAll = allowedMcpTools.includes('*');

    for (const [name, serverConfig] of Object.entries(allMcpServers)) {
      if (!allowAll && !allowedMcpTools.includes(name)) {
        continue;
      }

      // Sanitize server environment variables
      const sanitizedEnv: Record<string, string> = {};
      if (serverConfig.env) {
        for (const [k, v] of Object.entries(serverConfig.env)) {
          if (!SENSITIVE_ENV_VARS_TO_STRIP.includes(k as any)) {
            sanitizedEnv[k] = v;
          }
        }
      }

      filtered[name] = {
        ...serverConfig,
        env: Object.keys(sanitizedEnv).length > 0 ? sanitizedEnv : undefined,
      };
    }

    return filtered;
  }

  /**
   * Materialize isolated bot claude_config directory (mcp.json & settings.json)
   * Absolutely never touches host ~/.claude.
   */
  public materializeBotConfig(botDir: string): { configDir: string; mcpPath: string } {
    const configDir = path.join(botDir, 'claude_config');
    fs.mkdirSync(configDir, { recursive: true });

    const allServers = this.loadMergedMcpServers();
    const botServers = this.resolveBotMcpConfig(botDir, allServers);

    const mcpPath = path.join(configDir, 'mcp.json');
    fs.writeFileSync(mcpPath, JSON.stringify({ mcpServers: botServers }, null, 2), 'utf-8');

    const settingsPath = path.join(configDir, 'settings.json');
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          strictMcpConfig: true,
          settingSources: [],
          enableAnalytics: false,
          autoUpdate: false,
        },
        null,
        2
      ),
      'utf-8'
    );

    return { configDir, mcpPath };
  }

  /**
   * Helper to ensure .env in project root is safely loaded into process.env without overriding existing.
   */
  public ensureEnvLoaded(): void {
    const envFile = path.join(this.projectRoot, '.env');
    if (fs.existsSync(envFile)) {
      try {
        const raw = fs.readFileSync(envFile, 'utf-8');
        for (const line of raw.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const idx = trimmed.indexOf('=');
            if (idx > 0) {
              const k = trimmed.slice(0, idx).trim();
              const v = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
              if (!process.env[k]) {
                process.env[k] = v;
              }
            }
          }
        }
      } catch {}
    }
  }

  /**
   * Load and parse models configuration (models.json) following Cindy's specification.
   * Interpolates environment variables (e.g. $CPA_API_KEY, $CPA_BASE_URL).
   * Direct wire configuration without local proxy gateways.
   */
  public loadModelsConfig(): ModelsConfig {
    this.ensureEnvLoaded();
    const configPath = getUserModelsConfigPath(this.projectRoot);
    if (!fs.existsSync(configPath)) {
      return { providers: {} };
    }

    try {
      const rawContent = fs.readFileSync(configPath, 'utf-8');
      const parsed: ModelsConfig = JSON.parse(rawContent);

      if (parsed.providers) {
        for (const [providerId, provider] of Object.entries(parsed.providers)) {
          // Resolve apiKey interpolation
          if (provider.apiKey && provider.apiKey.startsWith('$')) {
            const envVarName = provider.apiKey.slice(1);
            provider.apiKey = process.env[envVarName] || (envVarName === 'CPA_API_KEY' ? process.env.ANTHROPIC_API_KEY : '') || '';
          }
          // Resolve baseUrl interpolation if any
          if (provider.baseUrl && provider.baseUrl.includes('$')) {
            provider.baseUrl = provider.baseUrl.replace(/\$\{([^}]+)\}|\$([A-Za-z0-9_]+)/g, (_, p1, p2) => {
              const varName = p1 || p2;
              return process.env[varName] || (varName === 'CPA_BASE_URL' ? process.env.ANTHROPIC_BASE_URL : '') || '';
            });
          }
        }
      }

      return parsed;
    } catch (err) {
      return { providers: {} };
    }
  }

  /**
   * Load user model preferences (~/.multiagent-orchestration/models-preference.json).
   * Supports Cindy 4-tier model hierarchy:
   * primaryModel, primaryFallbackModel, auxiliaryModel, auxiliaryFallbackModel.
   */
  public loadModelPreferences(): ModelPreferences {
    this.ensureEnvLoaded();
    const prefPath = getUserModelsPreferencePath();
    if (fs.existsSync(prefPath)) {
      try {
        return JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
      } catch {}
    }
    return {};
  }

  /**
   * Cindy 4-level model resolution chain:
   * Main Task: Bot Model -> Bot Fallback -> Global Primary -> Global Primary Fallback
   * Aux Task: Global Auxiliary -> Global Auxiliary Fallback
   */
  public resolveModelEndpoint(targetModel?: string, options?: ModelResolveOptions): ResolvedModelEndpoint {
    const modelsConfig = this.loadModelsConfig();
    const prefs = this.loadModelPreferences();

    const isAuxiliary = options?.isAuxiliary === true;
    const candidates: string[] = [];

    if (isAuxiliary) {
      if (targetModel) candidates.push(targetModel);
      if (prefs.auxiliaryModel) candidates.push(prefs.auxiliaryModel);
      if (prefs.auxiliaryFallbackModel) candidates.push(prefs.auxiliaryFallbackModel);
      candidates.push('gemini-3.5-flash-lite');
    } else {
      if (targetModel) candidates.push(targetModel);
      if (options?.botModel) candidates.push(options.botModel);
      if (options?.botFallbackModel) candidates.push(options.botFallbackModel);
      if (prefs.primaryModel) candidates.push(prefs.primaryModel);
      if (prefs.activeDefaultModel) candidates.push(prefs.activeDefaultModel);
      if (prefs.primaryFallbackModel) candidates.push(prefs.primaryFallbackModel);
      if (prefs.fallbackModel) candidates.push(prefs.fallbackModel);
      candidates.push('gemini-3.8-flash');
    }

    // Deduplicate candidates preserving order
    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));

    let resolvedProviderId = '';
    let resolvedModelId = '';
    let matchedCatalogModel: CatalogModel | undefined = undefined;

    const providers = modelsConfig.providers || {};
    const availableProviderIds = Object.keys(providers);

    for (const cand of uniqueCandidates) {
      if (cand.includes('/')) {
        const [pId, ...rest] = cand.split('/');
        const mId = rest.join('/');
        if (providers[pId]) {
          resolvedProviderId = pId;
          resolvedModelId = mId;
          matchedCatalogModel = providers[pId].models?.find((m) => m.id === mId);
          break;
        }
      } else {
        // Search across all providers for model id match
        for (const [pId, pConfig] of Object.entries(providers)) {
          const match = pConfig.models?.find((m) => m.id === cand);
          if (match) {
            resolvedProviderId = pId;
            resolvedModelId = cand;
            matchedCatalogModel = match;
            break;
          }
        }
        if (resolvedProviderId) break;
      }
    }

    // Fallback to first provider if not found in catalog
    if (!resolvedProviderId && availableProviderIds.length > 0) {
      resolvedProviderId = availableProviderIds[0];
      resolvedModelId = uniqueCandidates[0] ? uniqueCandidates[0].replace(/^.*\//, '') : 'gemini-3.8-flash';
    }

    if (!resolvedProviderId) {
      resolvedProviderId = 'cpa';
      resolvedModelId = uniqueCandidates[0] || 'gemini-3.8-flash';
    }

    const providerObj = providers[resolvedProviderId] || { name: resolvedProviderId, models: [] };

    const effectiveBaseUrl = providerObj.baseUrl || process.env.ANTHROPIC_BASE_URL || process.env.CPA_BASE_URL || '';
    if (!effectiveBaseUrl) {
      throw new Error(
        `[ModelConfig] Missing baseUrl for provider "${resolvedProviderId}". Please configure provider baseUrl in models.json or set ANTHROPIC_BASE_URL / CPA_BASE_URL in environment.`
      );
    }

    const effectiveApiKey = providerObj.apiKey || process.env.ANTHROPIC_API_KEY || process.env.CPA_API_KEY || '';
    const apiProtocol = providerObj.api || 'anthropic-messages';

    return {
      fullModelId: `${resolvedProviderId}/${resolvedModelId}`,
      modelId: resolvedModelId,
      providerId: resolvedProviderId,
      baseUrl: effectiveBaseUrl,
      apiKey: effectiveApiKey,
      apiProtocol,
      catalogModel: matchedCatalogModel,
    };
  }

  /**
   * Get available models across all providers or for a specific provider.
   */
  public getAvailableModels(providerId?: string): CatalogModel[] {
    const config = this.loadModelsConfig();
    if (providerId && config.providers?.[providerId]) {
      return config.providers[providerId].models || [];
    }
    // Return all models across providers
    const all: CatalogModel[] = [];
    for (const p of Object.values(config.providers || {})) {
      if (Array.isArray(p.models)) {
        all.push(...p.models);
      }
    }
    return all;
  }
}

