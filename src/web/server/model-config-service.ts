/**
 * Purpose: Model & Reasoning configuration resolver backed by Customizations/models.json.
 * Context: Reflects multiagent-orchestration authoritative model catalog (zero host ~/.claude pollution).
 * Usage: import { getModelConfigPayload } from './model-config-service.ts';
 * Prerequisites: Node.js 18+, Customizations/models.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PROJECT_ROOT } from './common.ts';
import { getUserModelsConfigPath } from '../../storage/Paths.ts';
import { loadModelPreferences } from './services/provider-config-service.ts';

export interface ModelMappingItem {
  role: string;
  displayName: string;
  targetModel: string;
}

export interface ConfiguredModelItem {
  id: string;
  name: string;
  displayName: string;
  shortLabel: string;
  description: string;
  isDefault?: boolean;
  role?: string;
  provider: string;
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

  // Extract all catalog models from providers in models.json
  const configuredModels: ConfiguredModelItem[] = [];
  const providers = raw.providers || {};

  for (const [pId, pVal] of Object.entries(providers)) {
    const providerObj = pVal as any;
    const providerName = providerObj.name || pId;
    const modelsList = Array.isArray(providerObj.models) ? providerObj.models : [];

    for (const m of modelsList) {
      if (!m || !m.id) continue;
      configuredModels.push({
        id: m.id,
        name: `${m.name || m.id} (${m.id})`,
        displayName: m.name || m.id,
        shortLabel: m.name || m.id,
        description: m.reasoning ? '高精度深度思考推理模型' : '极速高吞吐对话模型',
        provider: providerName,
      });
    }
  }

  // Fallback defaults if models.json is empty
  if (configuredModels.length === 0) {
    configuredModels.push(
      {
        id: 'gemini-3.8-flash',
        name: 'Gemini 3.8 Flash (gemini-3.8-flash)',
        displayName: 'Gemini 3.8 Flash',
        shortLabel: 'Gemini 3.8',
        description: '高精度深度思考推理模型 (32k token 预算)',
        provider: 'CPA (3P Gateway)'
      },
      {
        id: 'gemini-3.5-flash-lite',
        name: 'Gemini 3.5 Flash Lite (gemini-3.5-flash-lite)',
        displayName: 'Gemini 3.5 Flash Lite',
        shortLabel: 'Gemini 3.5 Lite',
        description: '轻量极速低延迟模型',
        provider: 'CPA (3P Gateway)'
      }
    );
  }

  const activeModelId = prefs.primaryModel || prefs.activeDefaultModel || configuredModels[0].id;
  const fallbackModel = prefs.primaryFallbackModel || prefs.fallbackModel || (configuredModels[1] ? configuredModels[1].id : configuredModels[0].id);
  const auxiliaryModel = prefs.auxiliaryModel || (configuredModels[1] ? configuredModels[1].id : configuredModels[0].id);
  const auxiliaryFallbackModel = prefs.auxiliaryFallbackModel || auxiliaryModel;

  for (const m of configuredModels) {
    if (m.id === activeModelId) {
      m.isDefault = true;
    }
  }

  const modelMappings: ModelMappingItem[] = prefs.modelMappings && prefs.modelMappings.length > 0
    ? prefs.modelMappings
    : [
        {
          role: 'Lead',
          displayName: '核心主管 (moAdmin)',
          targetModel: 'gemini-3.8-flash'
        },
        {
          role: 'Engineer',
          displayName: '全栈研发 (moCode)',
          targetModel: 'gemini-3.8-flash'
        },
        {
          role: 'Sentinel',
          displayName: '测试哨兵 (MoCI)',
          targetModel: 'gemini-3.8-flash'
        },
        {
          role: 'Scout',
          displayName: '调研侦察 (MoDeep)',
          targetModel: 'gemini-3.5-flash-lite'
        },
        {
          role: 'Subagent',
          displayName: '后台子代理',
          targetModel: 'gemini-3.5-flash-lite'
        }
      ];

  const reasoningEfforts = [
    { id: 'low', label: '低 (4,096 tokens 预算)', tokens: 4096 },
    { id: 'medium', label: '中 (16,384 tokens 预算)', tokens: 16384 },
    { id: 'high', label: '高 (32,000 tokens 预算 - 默认)', tokens: 32000, isDefault: true },
    { id: 'max', label: '极高 (64,000 tokens 预算)', tokens: 64000 }
  ];

  const displaySourcePath = path.isAbsolute(modelsConfigPath)
    ? modelsConfigPath.replace(os.homedir(), '~')
    : modelsConfigPath;

  return {
    ok: true,
    source: 'multiagent-orchestration-engine',
    sourceFile: displaySourcePath,
    activeDefaultModel: activeModelId,
    fallbackModel,
    primaryModel: activeModelId,
    primaryFallbackModel: fallbackModel,
    auxiliaryModel,
    auxiliaryFallbackModel,
    modelMappings,
    models: configuredModels,
    reasoningEfforts
  };
}
