/**
 * Purpose: "Fetch model list" for a provider form (Cindy provider-model-fetch, Anthropic-compatible subset).
 * Context: Calls GET <baseUrl>/v1/models with the form's key (or the stored one); the key is never echoed back or logged.
 * Usage: fetchProviderModels({ baseUrl, apiKey?, providerId? }) -> structured { ok, models | code }.
 * Prerequisites: Node.js 18+ global fetch; pure parsing helpers are exported for unit tests.
 */

import { readStoredProvider, validateBaseUrl } from './provider-config-service.ts';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export interface DiscoveredModel {
  id: string;
  name: string;
  contextWindow?: number;
}

export type FetchModelsCode = 'INVALID_URL' | 'AUTH_INVALID' | 'NOT_FOUND' | 'TIMEOUT' | 'NETWORK' | 'BAD_RESPONSE' | 'HTTP_ERROR';

export interface FetchModelsResult {
  ok: boolean;
  models?: DiscoveredModel[];
  code?: FetchModelsCode;
  status?: number;
  detail?: string;
  url?: string;
}

export function resolveEnvRef(value: string): string {
  if (!value.includes('$')) return value;
  return value.replace(/\$\{([^}]+)\}|\$([A-Za-z0-9_]+)/g, (_m, a, b) => process.env[a || b] || '');
}

export function deriveModelsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/models$/.test(base)) return base;
  return /\/v1$/.test(base) ? `${base}/models` : `${base}/v1/models`;
}

function contextWindowOf(item: any): number | undefined {
  for (const key of ['context_length', 'context_window', 'max_context_length', 'max_input_tokens']) {
    const n = Number(item?.[key]);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}

function toDiscovered(item: unknown): DiscoveredModel | null {
  if (typeof item === 'string') return item.trim() ? { id: item.trim(), name: item.trim() } : null;
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, any>;
  const rawId = [rec.id, rec.slug, rec.name].find((v) => typeof v === 'string' && v.trim());
  if (!rawId) return null;
  const id = String(rawId).trim().replace(/^models\//, '');
  const label = [rec.display_name, rec.displayName, rec.name].find((v) => typeof v === 'string' && v.trim());
  const contextWindow = contextWindowOf(rec);
  return { id, name: label ? String(label).trim().replace(/^models\//, '') : id, ...(contextWindow ? { contextWindow } : {}) };
}

/** Accepts { data: [...] }, { models: [...] } and bare arrays; returns null for any other shape. */
export function parseModelsList(json: unknown): DiscoveredModel[] | null {
  const rec = json as { data?: unknown; models?: unknown } | null;
  const list = Array.isArray(json) ? json : Array.isArray(rec?.data) ? rec!.data : Array.isArray(rec?.models) ? rec!.models : null;
  if (!list) return null;
  const seen = new Set<string>();
  const out: DiscoveredModel[] = [];
  for (const item of list as unknown[]) {
    const model = toDiscovered(item);
    if (model && !seen.has(model.id)) {
      seen.add(model.id);
      out.push(model);
    }
  }
  return out;
}

function classifyHttp(status: number): FetchModelsCode {
  if (status === 401 || status === 403) return 'AUTH_INVALID';
  return status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR';
}

function redact(text: string, secret: string): string {
  const clipped = text.slice(0, 200);
  return secret ? clipped.split(secret).join('***') : clipped;
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
    headers.authorization = `Bearer ${apiKey}`;
    headers['anthropic-version'] = '2023-06-01';
  }
  return headers;
}

async function requestModels(url: string, apiKey: string, fetchImpl: typeof fetch): Promise<FetchModelsResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { headers: buildHeaders(apiKey), signal: controller.signal, redirect: 'error' });
    const body = await res.text();
    if (!res.ok) return { ok: false, code: classifyHttp(res.status), status: res.status, detail: redact(body, apiKey), url };
    if (body.length > MAX_BODY_BYTES) return { ok: false, code: 'BAD_RESPONSE', detail: 'response too large', url };
    const models = parseModelsList(JSON.parse(body));
    return models ? { ok: true, models, url } : { ok: false, code: 'BAD_RESPONSE', detail: 'unrecognized model list shape', url };
  } catch (err: any) {
    if (err?.name === 'AbortError') return { ok: false, code: 'TIMEOUT', url };
    const code: FetchModelsCode = err instanceof SyntaxError ? 'BAD_RESPONSE' : 'NETWORK';
    return { ok: false, code, detail: redact(String(err?.cause?.code || err?.message || err), apiKey), url };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchProviderModels(
  input: { baseUrl?: string; apiKey?: string; providerId?: string },
  fetchImpl: typeof fetch = fetch
): Promise<FetchModelsResult> {
  const stored = input.providerId ? readStoredProvider(input.providerId) : undefined;
  const baseUrlRaw = (input.baseUrl || stored?.baseUrl || '').trim();
  const apiKey = resolveEnvRef((input.apiKey || stored?.apiKey || '').trim());
  let baseUrl: string;
  try {
    baseUrl = validateBaseUrl(resolveEnvRef(baseUrlRaw), true);
  } catch (err: any) {
    return { ok: false, code: 'INVALID_URL', detail: err.message };
  }
  return requestModels(deriveModelsUrl(baseUrl), apiKey, fetchImpl);
}
