---
doc_id: DOCS-DESIGN-INDEX
status: CURRENT
version: 1.2.0
last_verified: 2026-11-21
language: en-US
---

# Design Documentation Router (Micro-Kernel)

Parent router: [../INDEX.md](../INDEX.md). Routes technical architecture specifications across active production plugins (`paseo-agy-acp`, `paseo-bots`, `paseo-feed`, `paseo-long-session`) and runtime-agnostic Agent design patterns.

## 1. Active Production Plugin Specifications
- **[paseo-agy-acp/INDEX.md](paseo-agy-acp/INDEX.md)** — Load when working on `paseo-agy-acp/`, Antigravity `agy acp` stdio bridging, `PASEO_AGY_BOT_PROMPT_FILE` (`resolveEffectiveSystemPrompt`), compaction thresholds (`resolveCompactionThresholds`), `.system_generated/` Brain observation, Reactive Wakeups, turn termination/timeouts, child subagents, checkpoints/revert, quota polling, or `steer`/`queue` behavior.
  - [paseo-agy-acp/shards/01-dual-plane-and-brain-observer.md](paseo-agy-acp/shards/01-dual-plane-and-brain-observer.md)
  - [paseo-agy-acp/shards/02-turn-lifecycle-and-fail-closed-guards.md](paseo-agy-acp/shards/02-turn-lifecycle-and-fail-closed-guards.md)
  - [paseo-agy-acp/shards/03-subagents-checkpoints-and-steer.md](paseo-agy-acp/shards/03-subagents-checkpoints-and-steer.md)
- **[paseo-bots/INDEX.md](paseo-bots/INDEX.md)** — Load when working on `paseo-bots/`, 15-bot roster (`bot-chief` Global Assistant), 3-Tier Chief of Staff (`L1 -> L2 -> L3`, `TIER_DEPTH_LABEL`, `extractInsulatedReply`), `CompanionSessionManager`, `LIFECYCLE_MOUNT_LABEL` / `PASEO_AGY_BOT_PROMPT_FILE` lifecycle hook, Continuous Feed fusion (`botFeedReadRpc`, `"workflow"` source, `BotFeedPane`), `bots.json` v4 schema, decoupled `souls`/`mcp-servers`, Managed Seats, Session Blackboard, Workflow DAG runner (`workflowRunRpc` / `bots.workflows.run`), Task Pyramid leases/cards, 4-pillar cross-navigation (`Feed <-> Workflow <-> Team <-> Chat`), model fallback chains, Routines, Analytics, or RN/CDS client UI.
  - [paseo-bots/shards/01-configuration-and-storage.md](paseo-bots/shards/01-configuration-and-storage.md)
  - [paseo-bots/shards/02-seat-blackboard-and-prompts.md](paseo-bots/shards/02-seat-blackboard-and-prompts.md)
  - [paseo-bots/shards/03-workflow-engine-and-routing.md](paseo-bots/shards/03-workflow-engine-and-routing.md)
  - [paseo-bots/shards/04-task-pyramid-and-settlement.md](paseo-bots/shards/04-task-pyramid-and-settlement.md)
  - [paseo-bots/shards/05-fallback-routines-and-surfaces.md](paseo-bots/shards/05-fallback-routines-and-surfaces.md)
  - [paseo-bots/shards/06-client-ui-and-cds.md](paseo-bots/shards/06-client-ui-and-cds.md)
- **[paseo-feed/INDEX.md](paseo-feed/INDEX.md)** — Load when working on `paseo-feed/` unified `index.jsonl` single pointer ledger (plus idempotent `.legacy-channels-migrated-v1` migration), `"workflow"` source & metadata propagation, `sendToFeedChannel` cold-start auto-creation (`reason: "created"`), `openAgent` / header chat deep-links, `paseo-bots` feed bridge (`botFeedReadRpc`, `BotFeedPane`), or `paseo-long-session/` proactive 250K compaction and SHA-256 `MEMORY.md` sync handshake (`LONG_SESSION_SYNC_METADATA`).

## 2. Cross-Runtime Agent Architecture Patterns
- **[patterns/INDEX.md](patterns/INDEX.md)** — Load when designing prompt hierarchies, KV cache preservation, skill lazy-loading, group-chat sequencing/anti-loop rules, shared blackboard budgets,Coder-QA arbitration ladders, or multi-agent fan-out ROI.
  - [patterns/shards/01-attention-and-compaction.md](patterns/shards/01-attention-and-compaction.md)
  - [patterns/shards/02-cache-layers-and-instruction-budget.md](patterns/shards/02-cache-layers-and-instruction-budget.md)
  - [patterns/shards/03-groupchat-anti-loop-and-delta.md](patterns/shards/03-groupchat-anti-loop-and-delta.md)
  - [patterns/shards/04-blackboard-budget-and-arbitration.md](patterns/shards/04-blackboard-budget-and-arbitration.md)
  - [patterns/shards/05-multiagent-roi-and-memory.md](patterns/shards/05-multiagent-roi-and-memory.md)

## 3. Paused / Experimental Modules
- `paseo-sidecar/`: Cross-runtime Byte-0 Meta-MCP & hook daemon (`PAUSED / EXPERIMENTAL`; local notes in [../../paseo-sidecar/README.md](../../paseo-sidecar/README.md) and [../research/AI运行时元MCP动态编排架构调研.md](../research/AI%E8%BF%90%E8%A1%8C%E6%97%B6%E5%85%83MCP%E5%8A%A8%E6%80%81%E7%BC%96%E6%8E%92%E6%9E%B6%E6%9E%84%E8%B0%83%E7%A0%94.md)).
