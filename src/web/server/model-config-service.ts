/**
 * Purpose: Model & Reasoning configuration resolver backed by Customizations/models.json.
 * Context: Exposes all provider models (with vendor grouping) and the 4-tier model selection contract.
 * Usage: import { getModelConfigPayload } from './model-config-service.ts';
 * Prerequisites: Node.js 18+, Customizations/models.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PROJECT_ROOT } from './common.ts';
import { getUserModelsConfigPath } from '../../storage/Paths.ts';
import { loadModelPreferences } from './services/provider-config-service.ts';

export interface ConfiguredModelItem {
  id: string;
  name: string;
  displayName: string;
  shortLabel: string;
  description: string;
  isDefault?: boolean;
  providerId: string;
  provider: string;
  vendor: string;
  enabled: boolean;
  contextWindow?: number;
  reasoning?: boolean;
}

export function inferVendorGroup(modelId: string, modelName?: string, explicitVendor?: string): string {
  if (explicitVendor && explicitVendor.trim()) return explicitVendor.trim();
  const lower = `${modelId} ${modelName || ''}`.toLowerCase();
  if (lower.includes('claude') || lower.includes('anthropic') || lower.includes('haiku') || lower.includes('sonnet') || lower.includes('opus') || lower.includes('fable')) {
    return 'ANTHROPIC';
  }
  if (lower.includes('gemini') || lower.includes('google') || lower.includes('argon')) {
    return '谷歌';
  }
  if (lower.includes('gpt') || lower.includes('openai') || lower.includes('o1') || lower.includes('o3')) {
    return 'OPENAI';
  }
  if (lower.includes('deepseek')) return 'DEEPSEEK';
  if (lower.includes('qwen')) return '通义千问';
  return '其他模型';
}

export function getModelConfigPayload() {
  const modelsConfigPath = getUserModelsConfigPath(PROJECT_ROOT);
  let raw: any = { providers: {} };

  if (fs.existsSync(modelsConfigPath)) {
    try {
      raw = JSON.parse(fs.readFileSync(modelsConfigPath, 'utf8'));
    } catch (err) {
      console.warn('[model-config] Failed to parse models.json:', err);
    }
  }

  const prefs = loadModelPreferences();
  const configuredModels: ConfiguredModelItem[] = [];
  const seenIds = new Set<string>();
  const providers = raw.providers || {};

  for (const [pId, pVal] of Object.entries(providers)) {
    const providerObj = pVal as any;
    const providerName = providerObj.name || pId;
    const modelsList = Array.isArray(providerObj.models) ? providerObj.models : [];

    for (const m of modelsList) {
      const mObj = typeof m === 'string' ? { id: m } : m;
      if (!mObj || !mObj.id) continue;
      const vendor = inferVendorGroup(mObj.id, mObj.name, mObj.vendor);
      const enabled = mObj.enabled !== false;
      seenIds.add(mObj.id);
      configuredModels.push({
        id: mObj.id,
        name: `${mObj.name || mObj.id} (${mObj.id})`,
        displayName: mObj.name || mObj.id,
        shortLabel: mObj.name || mObj.id,
        description: mObj.reasoning ? '高精度深度思考推理模型' : '极速高吞吐对话模型',
        providerId: pId,
        provider: providerName,
        vendor,
        enabled,
        contextWindow: mObj.contextWindow || 200000,
        reasoning: Boolean(mObj.reasoning),
      });
    }
  }

  // Also merge any top-level raw.models entries not yet listed in providers
  if (Array.isArray(raw.models)) {
    for (const m of raw.models) {
      if (!m || !m.id || seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      const vendor = inferVendorGroup(m.id, m.displayName || m.name, m.vendor);
      configuredModels.push({
        id: m.id,
        name: `${m.displayName || m.name || m.id} (${m.id})`,
        displayName: m.displayName || m.name || m.id,
        shortLabel: m.displayName || m.name || m.id,
        description: '高精度推理模型',
        providerId: m.providerId || 'cpa',
        provider: m.providerId || 'Claude',
        vendor,
        enabled: m.enabled !== false,
        contextWindow: m.contextWindow || 200000,
        reasoning: true,
      });
    }
  }

  if (configuredModels.length === 0) {
    configuredModels.push(
      {
        id: 'claude-opus-4-6',
        name: 'Claude Opus 4.6 (Thinking) (claude-opus-4-6)',
        displayName: 'Claude Opus 4.6 (Thinking)',
        shortLabel: 'Claude Opus 4.6',
        description: '高精度深度思考推理模型',
        providerId: 'cpa',
        provider: 'Claude',
        vendor: 'ANTHROPIC',
        enabled: true,
        contextWindow: 200000,
        reasoning: true,
      },
      {
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6 (Thinking) (claude-sonnet-4-6)',
        displayName: 'Claude Sonnet 4.6 (Thinking)',
        shortLabel: 'Claude Sonnet 4.6',
        description: '均衡深度思考模型',
        providerId: 'cpa',
        provider: 'Claude',
        vendor: 'ANTHROPIC',
        enabled: true,
        contextWindow: 200000,
        reasoning: true,
      },
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash (gemini-3.8-flash)',
        displayName: 'Gemini 3.8 Flash',
        shortLabel: 'Gemini 3.8',
        description: '高精度深度思考推理模型',
        providerId: 'cpa',
        provider: 'Claude',
        vendor: '谷歌',
        enabled: true,
        contextWindow: 1048576,
        reasoning: true,
      },
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite (gemini-3.5-flash-lite)',
        displayName: 'Gemini 3.5 Flash Lite',
        shortLabel: 'Gemini 3.5 Lite',
        description: '轻量极速低延迟模型',
        providerId: 'cpa',
        provider: 'Claude',
        vendor: '谷歌',
        enabled: true,
        contextWindow: 1048576,
        reasoning: false,
      }
    );
  }

  // 4-Tier Model Hierarchy Resolution
  const primaryModel =
    prefs.primaryModel ||
    prefs.activeDefaultModel ||
    raw.defaultModel ||
    configuredModels[0].id;

  const primaryFallbackModel =
    prefs.primaryFallbackModel ||
    prefs.fallbackModel ||
    raw.defaultFallbackModel ||
    (configuredModels.find((m) => m.id === 'gemini-3.8-flash')?.id ||
      configuredModels[1]?.id ||
      configuredModels[0].id);

  const auxiliaryModel =
    prefs.auxiliaryModel ||
    raw.distillation?.primaryModel ||
    (configuredModels.find((m) => m.id === 'gemini-3.8-flash')?.id ||
      configuredModels[0].id);

  const auxiliaryFallbackModel =
    prefs.auxiliaryFallbackModel ||
    raw.distillation?.fallbackModel ||
    (configuredModels.find((m) => m.id === 'gemini-3.5-flash-lite')?.id ||
      auxiliaryModel);

  for (const m of configuredModels) {
    if (m.id === primaryModel) {
      m.isDefault = true;
    }
  }

  const reasoningEfforts = [
    { id: 'low', label: '低 (4,096 tokens 预算)', tokens: 4096 },
    { id: 'medium', label: '中 (16,384 tokens 预算)', tokens: 16384 },
    { id: 'high', label: '高 (32,000 tokens 预算 - 默认)', tokens: 32000, isDefault: true },
    { id: 'max', label: '极高 (64,000 tokens 预算)', tokens: 64000 },
  ];

  const displaySourcePath = path.isAbsolute(modelsConfigPath)
    ? modelsConfigPath.replace(os.homedir(), '~')
    : modelsConfigPath;

  return {
    ok: true,
    source: 'multiagent-orchestration-engine',
    sourceFile: displaySourcePath,
    activeDefaultModel: primaryModel,
    fallbackModel: primaryFallbackModel,
    primaryModel,
    primaryFallbackModel,
    auxiliaryModel,
    auxiliaryFallbackModel,
    defaultReasoning: prefs.defaultReasoning || raw.defaultEffort || 'high',
    models: configuredModels,
    reasoningEfforts,
  };
}
