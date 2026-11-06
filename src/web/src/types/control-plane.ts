/**
 * control-plane.ts
 * Agent Control Plane 核心通讯契约与 TypeScript 类型定义。
 * 覆盖 5 大核心端点:
 * 1. /api/partners
 * 2. /api/groups
 * 3. /api/extensions
 * 4. /api/configs
 * 5. /api/distill/diff
 */

// ==========================================
// 1. 通用响应结构
// ==========================================
export interface ApiResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

// ==========================================
// 2. /api/partners (伙伴/智能体元数据与运行时信息)
// ==========================================
export interface PartnerCapabilities {
  permissions: 'auto' | 'bypassPermissions' | 'ask';
  skills: string[];
  skillMode?: 'inherit' | 'allowlist' | 'blocklist';
  mcpServers: string[];
  mcpMode?: 'inherit' | 'allowlist' | 'blocklist';
  toolsets: string[];
  toolsetMode?: 'inherit' | 'allowlist' | 'blocklist';
  plugins: string[];
  pluginMode?: 'inherit' | 'allowlist' | 'blocklist';
  workingDir?: string | null;
}

export interface PartnerManifest {
  id: string;
  name: string;
  description: string;
  avatar: string;
  avatarColor: string;
  identitySource: string;
  capabilities: PartnerCapabilities;
  isBuiltin: boolean;
  createdAt: number;
  updatedAt: number;
  partnerDir?: string;
}

export interface PartnerCreateInput {
  id?: string;
  name: string;
  description?: string;
  avatar?: string;
  avatarColor?: string;
  identitySource?: string;
  capabilities?: Partial<PartnerCapabilities>;
  createdAt?: number;
}

export interface PartnerUpdateInput {
  name?: string;
  description?: string;
  avatar?: string;
  avatarColor?: string;
  identitySource?: string;
  capabilities?: Partial<PartnerCapabilities>;
}

export interface PartnerListResponse {
  ok: boolean;
  partners: PartnerManifest[];
  error?: string;
}

export interface PartnerDetailResponse {
  ok: boolean;
  partner?: PartnerManifest;
  error?: string;
}

export interface PartnerDeleteResponse {
  ok: boolean;
  id?: string;
  error?: string;
}

// ==========================================
// 3. /api/groups (多智能体协作群组拓扑与上下文配置)
// ==========================================
export interface BotGroupCapabilities {
  skills?: string[];
  mcpServers?: string[];
  plugins?: string[];
}

export interface BotGroupManifest {
  id: string;
  groupId: string;
  name: string;
  title: string;
  kind: 'group';
  description: string;
  botIds: string[];
  memberIds: string[];
  organizerBotId: string;
  leadPartnerId: string;
  replyMode: 'mentioned' | 'all';
  speakingMode: 'auto' | 'sequential';
  projectDir?: string;
  groupDir?: string;
  storageDir?: string;
  workdir?: string;
  mountedDirs?: string[];
  capabilities?: BotGroupCapabilities;
  createdAt: number;
  updatedAt: number;
  messages?: unknown[];
}

export interface BotGroupCreateInput {
  id?: string;
  name: string;
  description?: string;
  botIds?: string[];
  memberIds?: string[];
  organizerBotId?: string;
  leadPartnerId?: string;
  replyMode?: 'mentioned' | 'all';
  speakingMode?: 'auto' | 'sequential';
  projectDir?: string;
  mountedDirs?: string[];
  capabilities?: BotGroupCapabilities;
  messages?: unknown[];
}

export interface BotGroupUpdateInput {
  name?: string;
  title?: string;
  description?: string;
  botIds?: string[];
  memberIds?: string[];
  organizerBotId?: string;
  leadPartnerId?: string;
  replyMode?: 'mentioned' | 'all';
  speakingMode?: 'auto' | 'sequential';
  projectDir?: string;
  mountedDirs?: string[];
  capabilities?: BotGroupCapabilities;
}

export interface BotGroupListResponse {
  ok: boolean;
  groups: BotGroupManifest[];
  error?: string;
}

export interface BotGroupDetailResponse {
  ok: boolean;
  group?: BotGroupManifest;
  error?: string;
}

export interface BotGroupDeleteResponse {
  ok: boolean;
  id?: string;
  error?: string;
}

// ==========================================
// 4. /api/extensions (插件、Tools 与能力扩展清单)
// ==========================================
export interface McpServerItem {
  id: string;
  name: string;
  type: 'in-process' | 'stdio' | 'builtin' | 'plugin-bridge' | 'sse' | string;
  description: string;
  tools: string[];
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
}

export interface SkillItem {
  id: string;
  name: string;
  category: string;
  description: string;
  triggers: string[];
}

export interface PluginItem {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  status: 'installed' | 'available' | string;
  permissions: string[];
}

export interface ExtensionListResponse {
  ok: boolean;
  mcps: McpServerItem[];
  skills: SkillItem[];
  plugins: PluginItem[];
  error?: string;
}

// ==========================================
// 5. /api/configs (控制平面系统与环境级配置参数)
// ==========================================
export type ScopeType = 'partner' | 'folder';

export interface ScopeConfig {
  scopeType: ScopeType;
  scopeId: string;
  name?: string;
  avatar?: string;
  mcpServers: string[];
  mcpMode: 'inherit' | 'allowlist' | 'blocklist' | string;
  skills: string[];
  skillMode: 'inherit' | 'allowlist' | 'blocklist' | string;
  plugins: string[];
  pluginMode: 'inherit' | 'allowlist' | 'blocklist' | string;
  permissions?: 'auto' | 'bypassPermissions' | 'ask' | string;
  workingDir?: string | null;
  updatedAt?: number;
}

export interface SaveConfigInput {
  scopeType: ScopeType;
  scopeId: string;
  mcpServers?: string[];
  mcpMode?: string;
  skills?: string[];
  skillMode?: string;
  plugins?: string[];
  pluginMode?: string;
  permissions?: string;
  workingDir?: string | null;
}

export interface ConfigResponse {
  ok: boolean;
  config: ScopeConfig;
  error?: string;
}

// ==========================================
// 6. /api/distill/diff (多智能体蒸馏/差异比对报告)
// ==========================================
export interface DimensionDiff {
  title: string;
  description: string;
  originalTokens: number;
  distilledTokens: number;
  savedTokens: number;
  reductionRate: string;
  baseline: string;
  distilled: string;
}

export interface DistillationSummary {
  originalTokens: number;
  distilledTokens: number;
  savedTokens: number;
  reductionPercent: string;
  prefixHash: string;
  cacheHit: boolean;
  coldPrefixLength: number;
  hotParamsLength: number;
}

export interface DistillationDiffReport {
  scopeType: ScopeType;
  scopeId: string;
  computedAt: number;
  summary: DistillationSummary;
  dimensions: {
    tools: DimensionDiff;
    mcps: DimensionDiff;
    skills: DimensionDiff;
    plugins: DimensionDiff;
  };
}

export interface DistillDiffResponse {
  ok: boolean;
  report: DistillationDiffReport;
  error?: string;
}

// SSE 事件类型契约
export type DistillStreamEvent =
  | { event: 'start'; data: { scopeType: ScopeType; scopeId: string; timestamp: number } }
  | { event: 'dimension'; data: { dimension: 'tools' | 'mcps' | 'skills' | 'plugins'; data: DimensionDiff } }
  | { event: 'summary'; data: DistillationSummary }
  | { event: 'complete'; data: { ok: boolean; report: DistillationDiffReport } };
