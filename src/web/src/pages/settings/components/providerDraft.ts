/**
 * Purpose: Pure draft helpers for the provider editor (slug, model draft mapping, validation).
 * Context: Mirrors the server contract in provider-config-service (id slug, anthropic-messages only).
 * Usage: Imported by ProviderEditorModal and SettingsPage.
 * Prerequisites: None (no DOM, no network).
 */

export const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export interface ModelDraft {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  image: boolean;
  enabled?: boolean;
  vendor?: string;
}

export interface ProviderDraft {
  isNew: boolean;
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ModelDraft[];
}

export interface FoundModel {
  id: string;
  name: string;
  contextWindow?: number;
}

export function slugifyProviderId(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export function toModelDraft(m: any): ModelDraft {
  const id = typeof m === 'string' ? m : String(m?.id ?? '');
  return {
    id,
    name: (typeof m === 'object' && m?.name) || id,
    contextWindow: Number(m?.contextWindow) > 0 ? Number(m.contextWindow) : 200000,
    maxTokens: Number(m?.maxTokens) > 0 ? Number(m.maxTokens) : 64000,
    reasoning: Boolean(m?.reasoning),
    image: Array.isArray(m?.input) ? m.input.includes('image') : false,
    enabled: m?.enabled !== false,
    vendor: typeof m?.vendor === 'string' ? m.vendor : undefined,
  };
}

export function fromModelDraft(d: ModelDraft): Record<string, unknown> {
  return {
    id: d.id.trim(),
    name: d.name.trim() || d.id.trim(),
    contextWindow: d.contextWindow,
    maxTokens: d.maxTokens,
    reasoning: d.reasoning,
    input: d.image ? ['text', 'image'] : ['text'],
    enabled: d.enabled !== false,
    ...(d.vendor ? { vendor: d.vendor } : {}),
  };
}

export function emptyDraft(): ProviderDraft {
  return { isNew: true, id: '', name: '', baseUrl: '', apiKey: '', models: [] };
}

export function draftFromProvider(p: { id: string; name: string; baseUrl: string; apiKey?: string; models: any[] }): ProviderDraft {
  return {
    isNew: false,
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: p.apiKey || '',
    models: p.models.map(toModelDraft),
  };
}

export function foundToDraft(f: FoundModel): ModelDraft {
  return { ...toModelDraft({ id: f.id, name: f.name }), contextWindow: f.contextWindow || 200000 };
}

function isUsableBaseUrl(value: string): boolean {
  const v = value.trim();
  if (v.includes('$')) return true;
  try {
    const u = new URL(v);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

/** Returns the first problem as a user-facing message, or null when the draft can be saved. */
export function validateDraft(d: ProviderDraft, existingIds: string[]): string | null {
  if (d.isNew && !PROVIDER_ID_RE.test(d.id)) return '供应商 ID 需为小写字母/数字/下划线/短横线，且不超过 40 位';
  if (d.isNew && existingIds.includes(d.id)) return `供应商 ID「${d.id}」已存在`;
  if (!d.name.trim()) return '请填写供应商名称';
  if (!isUsableBaseUrl(d.baseUrl)) return 'Base URL 必须是 http(s) 地址（可用 $ENV_NAME 引用环境变量）';
  const ids = d.models.map((m) => m.id.trim());
  if (ids.some((id) => !id || /\s/.test(id))) return '模型 ID 不能为空或包含空白字符';
  if (new Set(ids).size !== ids.length) return '模型 ID 存在重复';
  return null;
}
