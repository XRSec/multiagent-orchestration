---
doc_id: PASEO-BOTS-FALLBACK-MODELS
status: CURRENT
version: 1.0.0
last_verified: 2026-11-15
language: en-US
---

# Same-Provider Fallback Models Architecture & Runtime Execution Specification

## 1. Scope & Design Rationale

This specification defines the schema, validation rules, runtime failover mechanics, and UI controls for same-provider fallback model execution within the Paseo Bots plugin (`@oliexe/paseo-bots`).

### Architectural Rationale
When LLM requests fail due to transient infrastructure errors (HTTP 429 rate limits, token exhaustion, capacity spikes, temporary service outages, or model deprecations), switching providers during an active session risks prompt cache invalidation, differing system prompt capabilities, and credential mismatch. By restricting automated failovers to models hosted by the **same provider**, agents maintain stable runtime semantics, shared context format compatibility, and seamless failover execution without operator intervention.

---

## 2. Data Model & Schema Definitions

All fallback model structures reside in `<projectRoot>/paseo-bots/shared/bot.ts`.

### 2.1 FallbackModelSchema

Represents a single fallback model candidate bound to a specific thinking intensity level:

```typescript
export const FallbackModelSchema = z.object({
  model: z.string(),
  thinkingOptionId: z.string().nullable().default(null),
});
export type FallbackModel = z.infer<typeof FallbackModelSchema>;
```

### 2.2 BotProviderConfigSchema

Maintains multi-provider primary configurations with provider-scoped fallbacks:

```typescript
export const BotProviderConfigSchema = z.object({
  provider: z.string(),
  model: z.string().nullable().default(null),
  modeId: z.string().nullable().default(null),
  thinkingOptionId: z.string().nullable().default(null),
  fallbackModels: z.array(FallbackModelSchema).default([]),
});
export type BotProviderConfig = z.infer<typeof BotProviderConfigSchema>;
```

### 2.3 BotSchema & BotDefaultsSchema Integration

Fallback models are incorporated directly into the top-level bot and plugin default definitions:
- **`BotSchema`**: Field `fallbackModels: z.array(FallbackModelSchema).default([])`.
- **`BotDefaultsSchema`**: Field `fallbackModels: z.array(FallbackModelSchema).default([])`.
- **Backward Compatibility**: Both schemas assign `.default([])` to `fallbackModels`. Pre-existing `version: 3` configurations without the field parse cleanly without schema violations.

### 2.4 Template Initialization

In `<projectRoot>/paseo-bots/shared/templates.ts`:
- Symbol `newBot`: Initializes new bots with `fallbackModels: []` and `providerConfigs: []`.
- Symbol `botFromPreset`: Preserves preset identity and skills while guaranteeing default empty fallback model arrays.

---

## 3. Proposal Validation & Provider Boundary Invariants

Configuration mutations processed by `applyChanges` (`<projectRoot>/paseo-bots/shared/changes.ts`) enforce strict provider-level guardrails.

### 3.1 Input Validation Schema

```typescript
const FallbackModelInput = z.object({
  model: z.string().min(1).max(200),
  thinking: z.string().max(100).nullable().optional(),
  thinkingOptionId: z.string().max(100).nullable().optional(),
});
```

Accepted within `BotFields.fallback_models` up to a maximum of 20 entries per bot.

### 3.2 Provider-Scoped Model & Thinking Verification

The validation helper `checkAgent` executes runtime verification against known provider snapshots:
1. **Model Membership**: Every entry in `fields.fallbackModels` must exist in `provider.models`. If unknown, throws: `${provider.id} has no fallback model "${fb.model}". Use one of: ...`
2. **Thinking Option Alignment**: If `fb.thinkingOptionId` is specified, it must belong to the fallback model's available `thinking` options. If invalid, throws: `Fallback model "${fb.model}" has no thinking option "${fb.thinkingOptionId}". Use one of: ...`

### 3.3 Provider Switch Invariant

In function `withAgent`:
- If an update changes a bot's `provider` without supplying explicit `fallback_models`, all existing fallback models are cleared to `[]`.
- This invariant guarantees that models configured for one provider (e.g., Anthropic Claude models) cannot leak into another provider (e.g., Antigravity Gemini models).

### 3.4 Change Previews

Function `describeChange` inspects `fallback_models` and outputs markdown change summaries:
- If populated: `fallback models <model-1>, <model-2>`
- If cleared: `no fallback models`

---

## 4. Runtime Error Eligibility & Failover Execution

Failover execution logic is partitioned across `<projectRoot>/paseo-bots/shared/chat.ts` and `<projectRoot>/paseo-bots/server/chats.ts`.

### 4.1 Error Eligibility Classification (`isFallbackEligibleError`)

Automated retries occur only when errors match transient, resource, capacity, or model availability criteria. Function `isFallbackEligibleError` inspects the error message:

1. **Rate Limits & Throughput**:
   Keywords: `rate_limit`, `rate limit`, `ratelimit`, `too many requests`, `429`, `resource_exhausted`, `tokens per minute`, `requests per minute`, `tpm`, `rpm`.
2. **Credit & Quota Exhaustion**:
   Keywords: `quota`, `credit balance`, `insufficient_quota`, `billing`, `exceeded your current quota`.
3. **Infrastructure Capacity & Server Errors**:
   Keywords: `overloaded`, `capacity`, `503`, `service unavailable`, `temporarily unavailable`, `high demand`, `server_error`, `502`, `504`, `internal server error`, `500`, `is overloaded`.
4. **Model Unavailability & Deprecation**:
   Keywords: `model_not_found`, or `model` combined with (`not found`, `unavailable`, `not supported`, `exist`, `unknown`, `deprecated`, `access`, `invalid`, `no longer available`).

**Non-Eligible Errors**:
Authentication errors (`unauthorized`, `invalid_api_key`), local filesystem errors, network disconnects, and syntax validation errors return `false`. The engine fails fast without consuming fallback candidate budgets.

### 4.2 Candidate Resolution & Deduplication (`resolveCandidateModels`)

Function `resolveCandidateModels(bot: Bot, defaultModel: string): FallbackModel[]`:
1. Constructs the primary candidate from `bot.model ?? defaultModel` and `bot.thinkingOptionId ?? null`.
2. Appends configured `bot.fallbackModels` in sequential order.
3. Deduplicates entries matching both identical `model` and `thinkingOptionId`.
4. Returns an array guaranteed to contain at least the primary candidate at index 0.

### 4.3 Chat Creation Retry Loop (`startBotChat`)

When starting a chat session via `startBotChat`:
1. Resolves candidate models via `resolveCandidateModels`.
2. Iterates over candidates sequentially:
   - Invokes `workspace.agents.create` with candidate `model` and `thinkingOptionId`.
   - On success: Returns the created `agent.id`.
   - On failure: Evaluates `isFallbackEligibleError(error)` and checks for a subsequent candidate.
   - If eligible: Emits console warning, triggers `onFallback(fromModel, toModel, error)` callback, and attempts the next candidate.
   - If ineligible or candidates exhausted: Rethrows the terminal error.

### 4.4 Server-Side Execution Wrapper (`runWithModelFallback`)

In `<projectRoot>/paseo-bots/server/chats.ts`, `runWithModelFallback` wraps arbitrary bot asynchronous actions:

```typescript
export interface FallbackEvent {
  botId: string;
  botName: string;
  provider: string;
  fromModel: string;
  toModel: string;
  error: unknown;
  timestamp: string;
}
```

Dispatches structured `FallbackEvent` notifications whenever a candidate model transitions, enabling audit logging and telemetry tracking across the daemon runtime.

---

## 5. Client User Interface Integration

UI controls allow visual configuration of fallback model chains both per-bot and across global defaults.

### 5.1 Per-Bot Model Panel (`client/panel/AgentSections.tsx`)

Located within `ModelSection`:
- **Fallback List**: Displays configured fallback candidates with ordered badges (`StatusBadge` rendering `Fallback 1`, `Fallback 2`).
- **Inline Model & Thinking Selectors**: `InlineSelect` allows changing the candidate model or its thinking level independently per slot.
- **Add Fallback Model**: `AddPickerRow` dynamically presents available models filtered by `unusedFallbackModels`, capped by `MAX_FALLBACK_MODELS`.
- **Remove Action**: `InlineRemoveButton` purges individual fallback slots and reindexes remaining entries.

### 5.2 Global Defaults Settings (`client/settings/BotsSettings.tsx`)

Located within `DefaultsSection`:
- Allows users to define default fallback chains for newly created bots.
- Includes slot selection, removal, and vertical order shifting (`Move up` actions) to prioritize preferred fallback paths.

---

## 6. Test Suite & Verification

The test harness in `<projectRoot>/paseo-bots/tests/fallback-models.test.ts` executes comprehensive automated assertions across all layers:

1. **Schema & Compatibility**:
   - Asserts backward compatibility when parsing version 3 bot configurations lacking `fallbackModels`.
   - Confirms default empty array initialization.
2. **Proposal Engine (`applyChanges`)**:
   - Validates creation and mutation of fallback chains.
   - Verifies rejection of models foreign to the active provider.
   - Verifies rejection of invalid thinking options for fallback models.
   - Confirms clearing of fallback models on unguided provider switches.
3. **Runtime Error Classification**:
   - Asserts true for 429 rate limit, quota exceeded, 503 overload, and model unavailable errors.
   - Asserts false for invalid API key and filesystem errors.
4. **Execution Retries**:
   - Asserts `runWithModelFallback` advances past failing primary models upon eligible errors and records `FallbackEvent`.
   - Asserts `startBotChat` iterates through candidate configs to successfully create an agent upon encountering service overloads.

---

## 7. Conformance Table (D8)

| Component / Symbol | Implementation File | Status | Verification Command |
| :--- | :--- | :--- | :--- |
| `FallbackModelSchema` | `paseo-bots/shared/bot.ts` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| `BotProviderConfigSchema` | `paseo-bots/shared/bot.ts` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| `applyChanges` Fallback Rules | `paseo-bots/shared/changes.ts` | CURRENT | `npm --prefix paseo-bots test tests/fallback-models.test.ts` |
| `isFallbackEligibleError` | `paseo-bots/shared/chat.ts` | CURRENT | `npm --prefix paseo-bots test tests/fallback-models.test.ts` |
| `resolveCandidateModels` | `paseo-bots/shared/chat.ts` | CURRENT | `npm --prefix paseo-bots test tests/fallback-models.test.ts` |
| `startBotChat` Retries | `paseo-bots/shared/chat.ts` | CURRENT | `npm --prefix paseo-bots test tests/fallback-models.test.ts` |
| `runWithModelFallback` | `paseo-bots/server/chats.ts` | CURRENT | `npm --prefix paseo-bots test tests/fallback-models.test.ts` |
| `ModelSection` UI | `paseo-bots/client/panel/AgentSections.tsx` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| `DefaultsSection` UI | `paseo-bots/client/settings/BotsSettings.tsx` | CURRENT | `npm --prefix paseo-bots run typecheck` |
| Full Fallback Test Suite | `paseo-bots/tests/fallback-models.test.ts` | CURRENT | `npm --prefix paseo-bots test` |
