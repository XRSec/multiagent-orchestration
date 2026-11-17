---
doc_id: CINDY-BOT-MODEL-FALLBACK-ANALYSIS
status: CURRENT
version: 1.0.0
last_verified: 2026-11-16
language: en-US
---

# Cindy Bot Model Fallback Architecture & Team Bot Adaptation Analysis

## 1. Executive Summary

This investigation explores the codebase of **Cindy** (`makecindy/cindy` at `../cindy` / `$CINDY_ROOT`) to analyze how its secondary / fallback model mechanisms (`modelChain`, `subagentModelFallback`, `readBotFallbackCandidate`) operate. 

The core user mandate specifies:
> *"I only want fallback for Bots inside the team, not for all sessions/chats, because a team Bot might be an essential step in an automated workflow and must not halt."*

Cindy's architectural design adheres to the exact same differentiation: **ordinary user chat sessions and Bot workflow sessions operate under completely decoupled failover domains**. Ordinary user sessions depend on manual retries or global fuzzy catalog guesses, while Bot workflow tasks utilize an **explicit, ordered candidate chain (`modelChain`) that triggers on the very first recoverable fault without waiting for operator intervention**.

---

## 2. Cindy System Identification & Fallback Topology

### 2.1 Cindy Project Identity
- **Repository Location**: `../cindy` (or `$CINDY_ROOT`)
- **Identity**: Cindy is an open-source AI desktop / mobile / headless agent platform supporting multiple runtime harnesses (`claude-code`, `codex`, `pi`).
- **Core Modules for Model Fallback**:
  - `apps/desktop/src/shared/botModelChain.ts`: Bot route candidate chain definitions and selection algorithms (`nextBotModelRoute`).
  - `apps/desktop/src/main/maker-ipc/register.ts`: Session lifecycle coordinator, IPC channels, and auto-resume execution (`maybeApplySessionRuntimeFallback`).
  - `apps/desktop/src/main/maker-ipc/botCandidateRecovery.ts`: Eligibility filtering for recoverable errors (`isBotCandidateUnavailable`).
  - `apps/desktop/src/main/maker-ipc/runtimeSetModel.ts`: Atomic live session model mutation and thread relinking (`applyRuntimeSetModelChange`).
  - `apps/desktop/src/main/maker-host/bot-model-chain-settings-store.ts`: Persistent storage for bot defaults and per-bot overrides.

### 2.2 Data Structure: Ordered Bot Model Chain (`modelChain`)

In `apps/desktop/src/shared/botModelChain.ts`:
```typescript
export const BOT_MODEL_CHAIN_MAX = 5;

export interface BotModelRoute {
  harness: 'claude' | 'codex' | 'pi';
  providerId: string | null;
  model: string;
  agentDeviceId?: string | null;
  effort?: string | null;
  fastMode?: boolean | 'ultrafast';
}
```

A bot profile maintains an ordered array of up to 5 routes. The primary model is candidate index 0, followed by candidate backups.

```typescript
export function nextBotModelRoute(
  value: unknown,
  current: Pick<BotModelRoute, 'harness' | 'model' | 'providerId' | 'agentDeviceId'>,
  visitedRoutes: readonly string[] = [],
  isUsable: (route: BotModelRoute) => boolean = () => true,
): BotModelRoute | null {
  const chain = normalizeBotModelChain(value);
  const currentIndex = botModelRouteIndex(chain, current);
  for (let index = currentIndex + 1; index < chain.length; index += 1) {
    const route = chain[index]!;
    if (!isUsable(route)) continue;
    const runtimeKey = botModelRouteRuntimeKey(route);
    if (visitedRoutes.includes(runtimeKey)) continue;
    return route;
  }
  return null;
}
```

---

## 3. Ordinary Chat vs. Team Bot Fallback Decoupling

In Cindy (`apps/desktop/src/main/maker-ipc/register.ts` lines 17711–17748), ordinary chat sessions and Bot tasks are explicitly segregated:

```typescript
// Bot routes are explicit and ordered. They switch on the first recoverable
// failure and never depend on the generic Session fallback toggle/catalog
// guesser. Ordinary Sessions keep their existing second-attempt behavior.
const botFallback = await readBotFallbackCandidate(sessionId, profiles.effective);
```

| Dimension | Ordinary Chat Sessions | Team Bot / Workflow Sessions |
| :--- | :--- | :--- |
| **Activation Gate** | Requires global user toggle `readSessionRuntimeFallbackSettings().enabled` | **Unconditional**: Activated automatically if `botFallback.isBot === true` |
| **Trigger Threshold** | Requires `episodeAttempt >= 2` (user must see or retry first) | **Turn-1 Fail-Fast**: Triggers immediately on the first recoverable error |
| **Candidate Source** | Fuzzy dynamic guessing from global catalog (`pickSessionRuntimeFallback`) | **Deterministic**: Fixed ordered array (`BotModelRoute[]`) defined in bot configuration |
| **User Disruption** | Displays error banner unless explicitly suppressed | **Suppressed Alert**: Error banner suppressed; auto-retries in background |
| **Workflow Continuity** | Halts and awaits user input | **Zero Interruption**: Turn resumes automatically via `autoRetryLastError` |

---

## 4. Error Eligibility & Decision Matrix

Cindy enforces strict error qualification via `isBotCandidateUnavailable` (`apps/desktop/src/main/maker-ipc/botCandidateRecovery.ts`):

### 4.1 Recoverable Errors (Failover Permitted)
- **HTTP Status Codes**: `401`, `402`, `403`, `429`, `500`, `502`, `503`, `504`, `529`.
- **Quota & Throughput**: `usageLimitExceeded`, `sessionBudgetExceeded`, `insufficient_quota`, `credit balance too low`, `rate limit`.
- **Service & Availability**: `model_not_found`, `model_unavailable`, `provider_server_error`, `upstream-overload`, `pi-gateway-drop`.
- **Infrastructure Start Failures**: `agent-start-failed`, `could not start agent`.
- **Remote Host Route Severance**: `isRemoteAgentRouteLostReason(signals.reason)`.

### 4.2 Non-Recoverable Errors (Fail-Fast Blocked)
Changing models cannot fix these faults; switching would cause infinite loops:
- **User / Operator Denial**: `/user (?:denied|rejected)|approval (?:denied|required)/i`.
- **Context Limit / Prompt Overflow**: `/context.{0,20}(?:overflow|too long)|prompt too long/i`.
- **Local OS Permission Denied**: `/permission denied/i` (local filesystem / shell).
- **Hard Task Budget Exhaustion**: `signals.codexErrorInfo === 'sessionBudgetExceeded'`.

---

## 5. Context Preservation & Seamless Auto-Resume

When an eligible failure occurs:

```
[Turn Failure: 429 / Quota / Overload]
                  │
                  ▼
   isBotCandidateUnavailable(signals) === true
                  │
                  ▼
   interruptedTurnAutoResumeGuard.onInterruptedTurn(sessionId)
   (Suppresses error toast / banner via autoResumeBookkeeping)
                  │
                  ▼
   maybeApplySessionRuntimeFallback(sessionId, attempt, token, requireRouteChange=true)
                  │
                  ├── readBotFallbackCandidate(sessionId, currentRoute)
                  ├── while (candidate):
                  │     Validate candidate provider & login state;
                  │     If candidate invalid, advance to N+1 inside same boundary
                  └── applySessionRuntimeSelection(sessionId, candidate.model, ...)
                        ├── Re-links or forks native SDK thread (e.g. Codex thread relink)
                        └── Retains conversation history & working directory
                  │
                  ▼
   inputCoordinator.autoRetryLastError(sessionId, token)
   (Pushes interrupted payload back to head of queue with new model)
                  │
                  ▼
   [Workflow Step Successfully Completes Without Interruption]
```

### Key Nuance: In-Boundary Fast-Advance
If candidate route 2 is misconfigured or has no valid credentials, Cindy does not emit a failure to the user. Instead, `advanceConfiguredBotRoute` advances to candidate 3 within the exact same recovery loop, ensuring zero human intervention.

---

## 6. Recommendations for Multiagent Orchestration Team Bots

### 6.1 Current Status in `multiagent-orchestration`
- `paseo-bots-plugin-settings/bots.json` already contains `fallbackModels: [{ model: "...", thinkingOptionId: "..." }]`.
- `paseo-bots/shared/bot.ts` defines `FallbackModelSchema`.
- However, naive orchestrators (such as `~/.paseo/plugins/multiagent-orchestrator/index.server.ts`) previously toggled a shared global in-memory index `activeSlotIndex` across all agents, causing model leaks across different sessions.

### 6.2 Target Architecture for Team Bot Fallback
1. **Scope Exclusivity to Team Roster**:
   - Check if an active session or subagent dispatch is tied to a configured bot in `bots.json` (e.g., `bot-moadmin`, `bot-mocode`, `bot-moci`, etc.).
   - Disregard generic user chat sessions; strictly preserve single-turn auto-failover for team agents.
2. **Provider-Bounded Candidate Chains**:
   - Follow the same-provider invariant (`docs/paseo/same-provider-fallback-models.md`): fail over from `gemini-4-hydrogen` to `gemini-3.8-flash` within `agy`, or `claude-3-7-sonnet` to `claude-3-5-sonnet` within Anthropic.
   - Prevent cross-harness credential corruption.
3. **Turn-1 Interception in ACP / Adapter**:
   - When a subagent invocation (`invoke_subagent`) or bot turn reports an eligible upstream error (429/503/Quota), the adapter catches the fault before closing the child context.
   - Re-spawns or switches the subagent using `fallbackModels[0]` with identical prompt, arguments, and workspace bounds.
4. **Exhaustion Circuit Breaker**:
   - If all `fallbackModels` in the chain fail, halt execution cleanly with `outcome: "exhausted"`, notifying `moAdmin` via structured task error instead of spinning indefinitely.
