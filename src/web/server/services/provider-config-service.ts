/**
 * Purpose: Model provider and model-preference persistence over models.json (plaintext keys, direct file edit).
 * Context: Cindy-style add/edit/delete provider flow; the file is the single source of truth read by UniversalConfigLoader.
 * Usage: Used by provider-config-controller for /api/config/providers and by session controller for /api/config/models.
 * Prerequisites: Node.js runtime, filesystem access to the resolved models.json (see Paths.getUserModelsConfigPath).
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PROJECT_ROOT } from '../common.ts';
import { getUserModelsConfigPath } from '../../../storage/Paths.ts';

const PREFERENCES_FILE = path.join(os.homedir(), '.multiagent-orchestration', 'models-preference.json');

export const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
/** The runtime is Claude Agent SDK only: every upstream must speak Anthropic Messages (directly or via a gateway). */
export const SUPPORTED_API = 'anthropic-messages';
const DEFAULT_CONTEXT_WINDOW = 200000;
const DEFAULT_MAX_TOKENS = 64000;
const MODEL_FIELDS = ['name', 'contextWindow', 'maxTokens', 'reasoning', 'input', 'thinkingLevel', 'thinkingLevelMap', 'cost', 'enabled', 'vendor'];

export type ProviderErrorCode = 'INVALID_PARAMS' | 'ALREADY_EXISTS' | 'NOT_FOUND' | 'INVALID_CONFIG';

export class ProviderConfigError extends Error {
  code: ProviderErrorCode;
  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = 'ProviderConfigError';
    this.code = code;
  }
}

export interface ProviderInput {
  providerId?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: unknown;
}

interface ModelsFile {
  configPath: string;
  data: any;
}

function fail(code: ProviderErrorCode, message: string): never {
  throw new ProviderConfigError(code, message);
}

/** Read models.json. A file that exists but is not valid JSON is never overwritten (hand edits are the norm). */
function readModelsFile(): ModelsFile {
  const configPath = getUserModelsConfigPath(PROJECT_ROOT);
  if (!fs.existsSync(configPath)) {
    return { configPath, data: { $schema: 'https://pi.dev/schemas/models.schema.json', providers: {} } };
  }
  let data: any;
  try {
    data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err: any) {
    fail('INVALID_CONFIG', `models.json is not valid JSON (${err.message}). Fix ${configPath} by hand; nothing was overwritten.`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    fail('INVALID_CONFIG', `models.json must be a JSON object. Fix ${configPath} by hand; nothing was overwritten.`);
  }
  if (!data.providers || typeof data.providers !== 'object') data.providers = {};
  return { configPath, data };
}

/** Atomic replace (temp file + rename) with a one-step .bak of the previous content; 0600 because keys are plaintext. */
function writeSingleModelsFile(targetPath: string, serialized: string): void {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath)) fs.copyFileSync(targetPath, `${targetPath}.bak`);
  const tmp = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, serialized, { mode: 0o600 });
  fs.renameSync(tmp, targetPath);
}

function writeModelsFile(file: ModelsFile): void {
  const { configPath, data } = file;
  const serialized = JSON.stringify(data, null, 2) + '\n';
  writeSingleModelsFile(configPath, serialized);

  if (!process.env.MULTIAGENT_HOME) {
    const customPath = path.join(PROJECT_ROOT, 'Customizations', 'models.json');
    const userPath = path.join(os.homedir(), '.multiagent-orchestration', 'models.json');
    const mirrorPath = path.resolve(configPath) === path.resolve(customPath) ? userPath : customPath;
    try {
      writeSingleModelsFile(mirrorPath, serialized);
    } catch {}
  }
}

export function validateBaseUrl(value: unknown, required: boolean): string {
  const v = typeof value === 'string' ? value.trim() : '';
  if (!v) {
    if (required) fail('INVALID_PARAMS', 'baseUrl is required');
    return '';
  }
  if (v.includes('$')) return v; // $ENV_NAME / ${ENV_NAME} reference, resolved by the loader
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return fail('INVALID_PARAMS', 'baseUrl must be an http(s) URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    fail('INVALID_PARAMS', 'baseUrl must be a plain http(s) URL without credentials, query or fragment');
  }
  return v.replace(/\/+$/, '');
}

const cleanText = (v: unknown, max = 60): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
/** Pasted keys often carry a trailing newline; trim it. */
const cleanKey = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function slugifyProviderId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function positiveInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function mergeModel(prev: any, item: any, id: string): any {
  const merged: any = { ...prev, id };
  for (const key of MODEL_FIELDS) {
    if (item[key] !== undefined) merged[key] = item[key];
  }
  merged.name = cleanText(merged.name, 120) || id;
  merged.contextWindow = positiveInt(merged.contextWindow, DEFAULT_CONTEXT_WINDOW);
  merged.maxTokens = positiveInt(merged.maxTokens, DEFAULT_MAX_TOKENS);
  merged.reasoning = Boolean(merged.reasoning);
  merged.input = Array.isArray(merged.input) && merged.input.length > 0 ? merged.input : ['text'];
  return merged;
}

/** Normalize an incoming model list; fields the UI does not edit (cost, thinkingLevelMap) survive via merge-by-id. */
export function normalizeModels(incoming: unknown, existing: any[]): any[] {
  if (!Array.isArray(incoming)) fail('INVALID_PARAMS', 'models must be an array');
  const byId = new Map<string, any>(existing.filter((m) => m && m.id).map((m) => [m.id, m]));
  const seen = new Set<string>();
  const out: any[] = [];
  for (const raw of incoming as any[]) {
    const item = typeof raw === 'string' ? { id: raw } : raw || {};
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id || id.length > 128 || /[\s\u0000-\u001f]/.test(id)) {
      fail('INVALID_PARAMS', `invalid model id: ${JSON.stringify(item.id)}`);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(mergeModel(byId.get(id) || {}, item, id));
  }
  return out;
}

/** Keep the in-process (web server) runner env in sync for the two built-in gateways; never copy $ENV references. */
function syncProcessEnv(providerId: string, provider: any): void {
  if (providerId !== 'anthropic' && providerId !== 'cpa') return;
  if (provider.baseUrl && !String(provider.baseUrl).includes('$')) {
    process.env.ANTHROPIC_BASE_URL = provider.baseUrl;
    process.env.CPA_BASE_URL = provider.baseUrl;
  }
  if (provider.apiKey && !String(provider.apiKey).startsWith('$')) {
    process.env.ANTHROPIC_API_KEY = provider.apiKey;
    process.env.CPA_API_KEY = provider.apiKey;
  }
}

export function loadProvidersConfig(): Record<string, any> {
  return readModelsFile().data.providers;
}

export function readStoredProvider(providerId: string): any | undefined {
  try {
    return readModelsFile().data.providers[providerId];
  } catch {
    return undefined;
  }
}

function resolveNewProviderId(input: ProviderInput): string {
  const explicit = cleanText(input.providerId, 80).toLowerCase();
  const id = explicit || slugifyProviderId(cleanText(input.name, 80));
  if (!id) fail('INVALID_PARAMS', 'providerId or name is required');
  if (!PROVIDER_ID_RE.test(id)) fail('INVALID_PARAMS', 'providerId must match [a-z0-9][a-z0-9_-]{0,39}');
  return id;
}

export function createProviderConfig(input: ProviderInput): any {
  const file = readModelsFile();
  const id = resolveNewProviderId(input);
  if (file.data.providers[id]) fail('ALREADY_EXISTS', `provider '${id}' already exists`);
  const provider = {
    id,
    name: cleanText(input.name) || id,
    baseUrl: validateBaseUrl(input.baseUrl, true),
    apiKey: cleanKey(input.apiKey),
    api: SUPPORTED_API,
    protocol: 'anthropic-messages-v1',
    timeoutMs: 120000,
    models: input.models === undefined ? [] : normalizeModels(input.models, []),
  };
  file.data.providers[id] = provider;
  writeModelsFile(file);
  syncProcessEnv(id, provider);
  return provider;
}

export function updateProviderConfig(input: ProviderInput): any {
  const file = readModelsFile();
  const id = cleanText(input.providerId, 80);
  const current = id ? file.data.providers[id] : undefined;
  if (!current) fail('NOT_FOUND', `provider '${id}' not found`);
  if (input.name !== undefined) current.name = cleanText(input.name) || current.name;
  if (input.baseUrl !== undefined) current.baseUrl = validateBaseUrl(input.baseUrl, true);
  if (input.apiKey !== undefined) current.apiKey = cleanKey(input.apiKey);
  if (input.models !== undefined) current.models = normalizeModels(input.models, current.models || []);
  writeModelsFile(file);
  syncProcessEnv(id, current);
  return current;
}

export function deleteProviderConfig(providerId: string): { removed: boolean; remaining: number } {
  const file = readModelsFile();
  if (!file.data.providers[providerId]) fail('NOT_FOUND', `provider '${providerId}' not found`);
  delete file.data.providers[providerId];
  writeModelsFile(file);
  return { removed: true, remaining: Object.keys(file.data.providers).length };
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
  } catch (err) {
    console.warn('[provider-config] Failed to save model preferences:', err);
  }
}
