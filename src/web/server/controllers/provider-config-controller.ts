/**
 * Purpose: REST controller for provider CRUD and "fetch model list" under /api/config/providers.
 * Context: Plaintext keys live in models.json by design, so these routes reject cross-origin callers and emit no CORS headers.
 * Usage: Delegated from handleSessionAndConfigRoute before any other /api/config handling.
 * Prerequisites: provider-config-service, provider-model-fetch.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { parseJsonBody } from '../common.ts';
import {
  ProviderConfigError,
  createProviderConfig,
  deleteProviderConfig,
  loadProvidersConfig,
  updateProviderConfig,
  type ProviderErrorCode,
} from '../services/provider-config-service.ts';
import { fetchProviderModels } from '../services/provider-model-fetch.ts';

const STATUS_BY_CODE: Record<ProviderErrorCode, number> = {
  INVALID_PARAMS: 400,
  NOT_FOUND: 404,
  ALREADY_EXISTS: 409,
  INVALID_CONFIG: 422,
};

/** Same-origin only: a foreign page must not be able to read or rewrite the key file through the browser. */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function sendPlain(res: ServerResponse, status: number, data: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

function sendProviderError(res: ServerResponse, err: unknown): void {
  if (err instanceof ProviderConfigError) {
    sendPlain(res, STATUS_BY_CODE[err.code], { ok: false, code: err.code, error: err.message });
    return;
  }
  sendPlain(res, 500, { ok: false, error: err instanceof Error ? err.message : String(err) });
}

async function handleCollection(method: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (method === 'GET') {
    sendPlain(res, 200, { ok: true, providers: loadProvidersConfig() });
    return true;
  }
  if (method === 'POST') {
    const provider = createProviderConfig(await parseJsonBody(req));
    sendPlain(res, 201, { ok: true, providerId: provider.id, provider });
    return true;
  }
  if (method === 'PUT') {
    const provider = updateProviderConfig(await parseJsonBody(req));
    sendPlain(res, 200, { ok: true, providerId: provider.id, provider });
    return true;
  }
  return false;
}

export async function handleProviderConfigRoute(
  pathname: string,
  method: string,
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  if (pathname !== '/api/config/providers' && !pathname.startsWith('/api/config/providers/')) return false;
  if (!isSameOrigin(req)) {
    sendPlain(res, 403, { ok: false, error: 'cross-origin request rejected' });
    return true;
  }
  try {
    if (pathname === '/api/config/providers') return await handleCollection(method, req, res);
    if (pathname === '/api/config/providers/fetch-models' && method === 'POST') {
      sendPlain(res, 200, await fetchProviderModels(await parseJsonBody(req)));
      return true;
    }
    const match = pathname.match(/^\/api\/config\/providers\/([^/]+)$/);
    if (match && method === 'DELETE') {
      sendPlain(res, 200, { ok: true, ...deleteProviderConfig(decodeURIComponent(match[1])) });
      return true;
    }
  } catch (err) {
    sendProviderError(res, err);
    return true;
  }
  return false;
}
