/**
 * Purpose: Model providers and model preferences persistence service.
 * Context: Reads and writes Customizations/models.json and user model preferences.
 * Usage: Used by session controller for /api/config/providers and /api/config/models.
 * Prerequisites: Node.js runtime, filesystem access to project and user directories.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PROJECT_ROOT } from '../common.ts';
import { getUserModelsConfigPath } from '../../../storage/Paths.ts';

const PREFERENCES_FILE = path.join(os.homedir(), '.multiagent-orchestration', 'models-preference.json');

export interface ProviderUpdateInput {
  providerId: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: any[];
}

export function loadProvidersConfig(): Record<string, any> {
  try {
    const configPath = getUserModelsConfigPath(PROJECT_ROOT);
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (data && typeof data.providers === 'object') {
        return data.providers;
      }
    }
  } catch (err) {
    console.warn('[provider-config] Failed to load providers config:', err);
  }
  return {};
}

export function updateProviderConfig(input: ProviderUpdateInput): Record<string, any> {
  const configPath = getUserModelsConfigPath(PROJECT_ROOT);
  let fullData: any = { $schema: 'https://pi.dev/schemas/models.schema.json', providers: {} };

  try {
    if (fs.existsSync(configPath)) {
      fullData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!fullData.providers) fullData.providers = {};
    }
  } catch {}

  const current = fullData.providers[input.providerId] || {
    name: input.name || input.providerId,
    baseUrl: '',
    apiKey: '',
    models: []
  };

  if (input.name) current.name = input.name;
  if (input.baseUrl !== undefined) current.baseUrl = input.baseUrl;
  if (input.apiKey !== undefined) current.apiKey = input.apiKey;
  if (Array.isArray(input.models)) current.models = input.models;

  fullData.providers[input.providerId] = current;

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(fullData, null, 2), 'utf8');

  // Synchronize process.env for in-process Claude runner
  if (input.providerId === 'anthropic' || input.providerId === 'cpa') {
    if (current.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = current.baseUrl;
      process.env.CPA_BASE_URL = current.baseUrl;
    }
    if (current.apiKey) {
      process.env.ANTHROPIC_API_KEY = current.apiKey;
      process.env.CPA_API_KEY = current.apiKey;
    }
  }

  return current;
}

export function loadModelPreferences(): Record<string, any> {
  try {
    if (fs.existsSync(PREFERENCES_FILE)) {
      return JSON.parse(fs.readFileSync(PREFERENCES_FILE, 'utf8'));
    }
  } catch {}
  return {};
}

export function saveModelPreferences(prefs: Record<string, any>): void {
  try {
    const dir = path.dirname(PREFERENCES_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = loadModelPreferences();
    const merged = { ...current, ...prefs, updatedAt: Date.now() };
    fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(merged, null, 2), 'utf8');

    // Preferences are strictly scoped to multiagent-orchestration (zero host ~/.claude pollution)
  } catch (err) {
    console.warn('[provider-config] Failed to save model preferences:', err);
  }
}
