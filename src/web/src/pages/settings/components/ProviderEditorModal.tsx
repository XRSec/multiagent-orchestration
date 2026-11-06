/**
 * Migrated from cindy/main AddProviderWizard.tsx + ProviderConnectionDialog.tsx + ModelAdvancedDrawer.tsx
 * Supports Step 1 (Cindy Preset Gallery or Custom Endpoint) -> Step 2 (Base URL + Plaintext API Key + /v1/models Fetch + Fine-tuning).
 */

import React, { useState } from 'react';
import {
  X,
  RefreshCw,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Sparkles,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Server,
  KeyRound,
  Globe,
  ExternalLink,
  ArrowLeft,
  Search,
} from 'lucide-react';
import { ProviderLogoMark } from '@/components/icons/ProviderLogoMark';
import {
  CINDY_PROVIDER_PRESETS,
  type CindyProviderPreset,
} from '@/components/settings/cindyProviderPresets';
import {
  type FoundModel,
  type ModelDraft,
  type ProviderDraft,
  foundToDraft,
  slugifyProviderId,
  toModelDraft,
  validateDraft,
} from './providerDraft';

interface Props {
  draft: ProviderDraft;
  existingIds: string[];
  saving: boolean;
  onChange: (next: ProviderDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}

const FETCH_ERROR_TEXT: Record<string, string> = {
  INVALID_URL: 'Base URL 格式无效',
  AUTH_INVALID: 'API Key 鉴权失败或无权限 (401/403)',
  NOT_FOUND: '该网关未暴露 /v1/models 端点，请在下方手动输入模型 ID 添加',
  TIMEOUT: '连接网关超时 (10s)',
  NETWORK: '无法连接到该网关地址',
  BAD_RESPONSE: '网关返回了无法识别的模型列表结构',
  HTTP_ERROR: '上游网关返回异常状态码',
};

const INPUT =
  'w-full bg-surface border border-border-default rounded-xl px-3 py-2 text-text-primary text-xs focus:outline-none focus:border-accent-blue transition-colors';
const NUM =
  'w-24 bg-surface-elevated border border-border-default rounded-lg px-2 py-1 text-text-primary font-mono text-[11px] focus:outline-none focus:border-accent-blue';

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="block text-[11px] font-semibold text-text-secondary">{props.label}</label>
        {props.hint ? <span className="text-[10px] text-text-tertiary">{props.hint}</span> : null}
      </div>
      {props.children}
    </div>
  );
}

function ModelRow(props: {
  model: ModelDraft;
  onChange: (m: ModelDraft) => void;
  onRemove: () => void;
}) {
  const { model: m, onChange, onRemove } = props;
  return (
    <div
      data-testid="provider-model-row"
      className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 px-3 py-2 bg-surface rounded-xl border border-border-subtle hover:border-border-default transition-colors"
    >
      <div className="flex-1 min-w-[160px] truncate">
        <div className="font-mono font-semibold text-text-primary truncate" title={m.id}>
          {m.id}
        </div>
      </div>

      <div className="flex items-center gap-1.5" title="上下文窗口大小 (Context Window Tokens)">
        <span className="text-[10px] text-text-tertiary sm:hidden">上下文:</span>
        <input
          className={NUM}
          type="number"
          min={1024}
          step={1000}
          value={m.contextWindow}
          onChange={(e) => onChange({ ...m, contextWindow: Number(e.target.value) })}
        />
      </div>

      <div className="flex items-center gap-1.5" title="单次最大输出 (Max Output Tokens)">
        <span className="text-[10px] text-text-tertiary sm:hidden">最大输出:</span>
        <input
          className={NUM}
          type="number"
          min={256}
          step={1000}
          value={m.maxTokens}
          onChange={(e) => onChange({ ...m, maxTokens: Number(e.target.value) })}
        />
      </div>

      <label
        title="开启深度思考推理"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer select-none transition-colors ${
          m.reasoning
            ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
            : 'bg-surface-elevated border-border-subtle text-text-tertiary'
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={m.reasoning}
          onChange={(e) => onChange({ ...m, reasoning: e.target.checked })}
        />
        <Sparkles className="w-3 h-3" />
        <span>思考</span>
      </label>

      <label
        title="支持图片多模态输入"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] cursor-pointer select-none transition-colors ${
          m.image
            ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
            : 'bg-surface-elevated border-border-subtle text-text-tertiary'
        }`}
      >
        <input
          type="checkbox"
          className="sr-only"
          checked={m.image}
          onChange={(e) => onChange({ ...m, image: e.target.checked })}
        />
        <ImageIcon className="w-3 h-3" />
        <span>视觉</span>
      </label>

      <button
        type="button"
        onClick={onRemove}
        title="移除该模型"
        className="p-1.5 rounded-lg text-text-tertiary hover:text-accent-red hover:bg-accent-red/10 transition-colors cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function FoundModelsPanel(props: {
  found: FoundModel[];
  have: Set<string>;
  onAdd: (picked: FoundModel[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const fresh = props.found.filter((f) => !props.have.has(f.id));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectAllFresh = () => setPicked(new Set(fresh.map((f) => f.id)));

  return (
    <div
      data-testid="found-models"
      className="p-3 bg-surface rounded-xl border border-accent-blue/30 space-y-2.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-text-secondary font-medium">
          从网关发现 <strong>{props.found.length}</strong> 个模型（{fresh.length} 个可添加）
        </span>
        {fresh.length > 0 && (
          <button
            type="button"
            onClick={selectAllFresh}
            className="text-[11px] text-accent-blue hover:underline cursor-pointer"
          >
            全选未添加
          </button>
        )}
      </div>

      {fresh.length > 0 ? (
        <>
          <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
            {fresh.map((f) => (
              <label
                key={f.id}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer text-[11px] ${
                  picked.has(f.id)
                    ? 'bg-accent-blue/10 border-accent-blue/40 text-text-primary'
                    : 'bg-surface-elevated border-border-subtle text-text-secondary hover:border-border-default'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    type="checkbox"
                    checked={picked.has(f.id)}
                    onChange={() => toggle(f.id)}
                    className="accent-accent-blue"
                  />
                  <span className="font-mono truncate">{f.id}</span>
                </div>
                {f.contextWindow ? (
                  <span className="text-[10px] font-mono text-text-tertiary shrink-0">
                    {Math.round(f.contextWindow / 1000)}K
                  </span>
                ) : null}
              </label>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={picked.size === 0}
              onClick={() => {
                props.onAdd(fresh.filter((f) => picked.has(f.id)));
                setPicked(new Set());
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent-blue text-white text-[11px] font-semibold disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>加入选中模型 ({picked.size})</span>
            </button>
          </div>
        </>
      ) : (
        <div className="text-[11px] text-emerald-400">所有远端发现的模型均已在当前列表中。</div>
      )}
    </div>
  );
}

function useModelFetch(draft: ProviderDraft) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string;
    found: FoundModel[] | null;
  }>({ loading: false, error: '', found: null });

  const run = async () => {
    setState({ loading: true, error: '', found: null });
    try {
      const res = await fetch('/api/config/providers/fetch-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey,
          providerId: draft.isNew ? undefined : draft.id,
        }),
      });
      const data = await res.json();
      if (data.ok) return setState({ loading: false, error: '', found: data.models });
      const base = FETCH_ERROR_TEXT[data.code] || '获取模型列表失败';
      setState({
        loading: false,
        error: data.detail ? `${base}：${data.detail}` : base,
        found: null,
      });
    } catch (err: any) {
      setState({ loading: false, error: `请求失败：${err.message}`, found: null });
    }
  };
  return { ...state, run };
}

export const ProviderEditorModal: React.FC<Props> = ({
  draft,
  existingIds,
  saving,
  onChange,
  onCancel,
  onSave,
}) => {
  const [step, setStep] = useState<'gallery' | 'form'>(draft.isNew ? 'gallery' : 'form');
  const [presetQuery, setPresetQuery] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<CindyProviderPreset | null>(null);
  const [manualId, setManualId] = useState('');
  const [showPlainKey, setShowPlainKey] = useState(true);

  const fetcher = useModelFetch(draft);
  const problem = validateDraft(draft, existingIds);
  const have = new Set(draft.models.map((m) => m.id));
  const setModels = (models: ModelDraft[]) => onChange({ ...draft, models });

  const applyPreset = (preset: CindyProviderPreset) => {
    setSelectedPreset(preset);
    const baseId = slugifyProviderId(preset.id);
    const uniqueId = existingIds.includes(baseId) ? `${baseId}-2` : baseId;
    onChange({
      ...draft,
      id: uniqueId,
      name: preset.name,
      baseUrl: preset.baseUrl.includes('{endpoint}')
        ? 'https://your-gateway.example.com'
        : preset.baseUrl,
      models: preset.models.map((m) => ({
        id: m.id,
        name: m.name || m.id,
        contextWindow: m.contextWindow || 200000,
        maxTokens: m.maxTokens || 64000,
        reasoning: m.reasoning !== false,
        image: Boolean(m.image),
        enabled: true,
      })),
    });
    setStep('form');
  };

  const addManual = () => {
    const id = manualId.trim();
    if (!id || have.has(id)) return;
    setModels([...draft.models, toModelDraft(id)]);
    setManualId('');
  };

  const filteredPresets = CINDY_PROVIDER_PRESETS.filter((p) => {
    const q = presetQuery.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q);
  });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-surface-elevated border border-border-default rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl text-xs overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface/40">
          <div className="flex items-center gap-2.5">
            {draft.isNew && step === 'form' ? (
              <button
                type="button"
                onClick={() => setStep('gallery')}
                className="p-1.5 rounded-xl hover:bg-surface text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                title="返回供应商预设目录"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center text-accent-blue">
                <Server className="w-4 h-4" />
              </div>
            )}
            <div>
              <h3 className="font-bold text-sm text-text-primary">
                {draft.isNew
                  ? step === 'gallery'
                    ? '添加模型供应商 · 选择预设或自定义端点'
                    : `配置供应商：${draft.name || '自定义端点'}`
                  : `编辑供应商：${draft.name}`}
              </h3>
              <p className="text-[11px] text-text-tertiary">
                保存后直接明文写入 <code className="font-mono">Customizations/models.json</code>，下一轮对话立即生效
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-text-tertiary hover:text-text-primary p-1.5 rounded-xl hover:bg-surface cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* STEP 1: Cindy Preset Gallery (Only when adding new provider) */}
        {step === 'gallery' ? (
          <div className="p-6 overflow-y-auto space-y-4 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1 flex items-center">
                <Search className="w-3.5 h-3.5 text-text-tertiary absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  value={presetQuery}
                  onChange={(e) => setPresetQuery(e.target.value)}
                  placeholder="搜索 Cindy 预设供应商 (OpenRouter, DeepSeek, Kimi, 智谱 GLM, 百炼, Ollama...)"
                  className={`${INPUT} pl-8`}
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedPreset(null);
                  setStep('form');
                }}
                className="px-3.5 py-2 rounded-xl bg-accent-blue text-white font-semibold hover:bg-accent-blue/90 transition-colors cursor-pointer shrink-0"
              >
                + 自定义兼容端点
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[52vh] overflow-y-auto pr-1">
              {filteredPresets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border-subtle bg-surface hover:border-accent-blue/50 hover:bg-surface-hover/60 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-surface-elevated border border-border-subtle flex items-center justify-center text-text-primary shrink-0">
                      <ProviderLogoMark providerId={preset.id} size={17} />
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-text-primary truncate group-hover:text-accent-blue transition-colors">
                        {preset.name}
                      </div>
                      <div className="text-[10px] text-text-tertiary font-mono truncate">
                        {preset.baseUrl || '自定义网关地址'}
                      </div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-text-tertiary shrink-0 px-2 py-0.5 rounded bg-surface-elevated border border-border-subtle">
                    {preset.models.length > 0 ? `${preset.models.length} 模型` : '自动发现'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* STEP 2: Provider Connection & Model Fine-Tuning Form */
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            {selectedPreset?.docsUrl ? (
              <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-accent-blue/10 border border-accent-blue/20 text-[11px]">
                <span className="text-text-secondary">
                  已载入 <strong>{selectedPreset.name}</strong> 预设端点与推荐模型
                </span>
                <a
                  href={selectedPreset.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-accent-blue hover:underline font-medium"
                >
                  <span>官方文档与获取 Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : null}

            <div className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <Field label="供应商显示名称" hint="展示在设置与路由面板">
                  <input
                    className={INPUT}
                    value={draft.name}
                    placeholder="例如：Claude / OpenRouter"
                    onChange={(e) =>
                      onChange({
                        ...draft,
                        name: e.target.value,
                        id: draft.isNew ? slugifyProviderId(e.target.value) : draft.id,
                      })
                    }
                  />
                </Field>
                <Field
                  label="供应商 ID (models.json 键名)"
                  hint={draft.isNew ? '自动按名称生成，可手改' : '已存在键名不可修改'}
                >
                  <input
                    className={`${INPUT} font-mono disabled:opacity-60`}
                    value={draft.id}
                    disabled={!draft.isNew}
                    placeholder="my-gateway"
                    onChange={(e) => onChange({ ...draft, id: e.target.value.toLowerCase() })}
                  />
                </Field>
              </div>

              <Field
                label="API Base URL (端点根路径)"
                hint="支持 http(s):// 地址或 $ENV_NAME 变量"
              >
                <div className="relative flex items-center">
                  <Globe className="w-3.5 h-3.5 text-text-tertiary absolute left-3 pointer-events-none" />
                  <input
                    className={`${INPUT} font-mono pl-8`}
                    value={draft.baseUrl}
                    placeholder="https://your-gateway.example.com"
                    onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })}
                  />
                </div>
              </Field>

              <Field
                label="API Key / Token"
                hint="默认直接明文落盘至 models.json，也支持填写 $CPA_API_KEY"
              >
                <div className="relative flex items-center">
                  <KeyRound className="w-3.5 h-3.5 text-text-tertiary absolute left-3 pointer-events-none" />
                  <input
                    className={`${INPUT} font-mono pl-8 pr-9`}
                    type={showPlainKey ? 'text' : 'password'}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.apiKey}
                    placeholder="sk-..."
                    onChange={(e) => onChange({ ...draft, apiKey: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPlainKey((v) => !v)}
                    title={showPlainKey ? '隐藏 Key 显示' : '明文显示 Key'}
                    className="absolute right-2.5 p-1 text-text-tertiary hover:text-text-primary cursor-pointer"
                  >
                    {showPlainKey ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </Field>
            </div>

            {/* Models Discovery & Fine-Tuning */}
            <div className="space-y-3 pt-2 border-t border-border-subtle">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold text-text-primary">
                    可用模型清单与参数 ({draft.models.length})
                  </div>
                  <div className="text-[11px] text-text-tertiary">
                    支持从 <code className="font-mono">/v1/models</code> 自动拉取，或手动输入模型 ID 添加并调优窗口大小
                  </div>
                </div>
                <button
                  type="button"
                  onClick={fetcher.run}
                  disabled={fetcher.loading || !draft.baseUrl.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface border border-border-default hover:bg-surface-hover text-text-primary font-medium disabled:opacity-40 transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      fetcher.loading ? 'animate-spin text-accent-blue' : ''
                    }`}
                  />
                  <span>{fetcher.loading ? '正在拉取...' : '从网关获取模型列表'}</span>
                </button>
              </div>

              {fetcher.error ? (
                <div
                  data-testid="fetch-error"
                  className="flex items-center gap-2 p-2.5 rounded-xl bg-accent-red/10 border border-accent-red/20 text-accent-red text-[11px]"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{fetcher.error}</span>
                </div>
              ) : null}

              {fetcher.found ? (
                <FoundModelsPanel
                  found={fetcher.found}
                  have={have}
                  onAdd={(picked) => setModels([...draft.models, ...picked.map(foundToDraft)])}
                />
              ) : null}

              {/* Quick Add Manual Model Input */}
              <div className="flex gap-2">
                <input
                  className={`${INPUT} font-mono`}
                  value={manualId}
                  placeholder="手动输入模型 ID（回车快速添加），例如: claude-opus-4-6"
                  onChange={(e) => setManualId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addManual();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addManual}
                  disabled={!manualId.trim()}
                  className="inline-flex items-center gap-1 px-3.5 rounded-xl bg-surface border border-border-default hover:bg-surface-hover text-text-primary font-medium disabled:opacity-40 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>添加模型</span>
                </button>
              </div>

              {/* Column Headers */}
              {draft.models.length > 0 && (
                <div className="hidden sm:flex items-center gap-2.5 px-3 text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
                  <span className="flex-1 min-w-[160px]">模型 ID</span>
                  <span className="w-24">上下文窗口</span>
                  <span className="w-24">最大输出</span>
                  <span className="w-28 text-center">能力开关</span>
                  <span className="w-6" />
                </div>
              )}

              {/* Configured Models List */}
              <div className="space-y-2 max-h-60 overflow-y-auto pr-0.5">
                {draft.models.map((m, i) => (
                  <ModelRow
                    key={m.id || i}
                    model={m}
                    onChange={(next) =>
                      setModels(draft.models.map((x, j) => (j === i ? next : x)))
                    }
                    onRemove={() => setModels(draft.models.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border-subtle bg-surface/40 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {step === 'gallery' ? (
              <span className="text-[11px] text-text-tertiary">
                已内置 Cindy 官方 {CINDY_PROVIDER_PRESETS.length} 个供应商预设，点击任意卡片自动填入端点与推荐模型
              </span>
            ) : problem ? (
              <div
                data-testid="draft-problem"
                className="flex items-center gap-1.5 text-amber-400 text-[11px] truncate"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{problem}</span>
              </div>
            ) : (
              <span className="text-[11px] text-text-tertiary">
                协议固定为 <code className="font-mono">anthropic-messages</code>，保留文件中手改的其它高级字段
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl border border-border-default text-text-secondary hover:bg-surface cursor-pointer"
            >
              取消
            </button>
            {step === 'form' && (
              <button
                onClick={onSave}
                disabled={saving || Boolean(problem)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent-blue text-white font-semibold hover:bg-accent-blue/90 disabled:opacity-50 cursor-pointer shadow-sm"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{saving ? '保存中...' : '保存到 models.json'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
