---
doc_id: DOCS-RESEARCH-INDEX
status: CURRENT
version: 2.0.0
last_verified: 2026-11-18
language: en-US
---

# Technical Research Router (Micro-Kernel)

Parent router: [../INDEX.md](../INDEX.md). Point-in-time source audits, peer runtime comparisons, and Paseo host reconnaissance. Normative rules extracted from these studies live in [../design/INDEX.md](../design/INDEX.md); load research files only for historical root-cause evidence or peer benchmarks.

## 1. Antigravity ACP (`paseo-agy-acp`) Audits & Peer Benchmarks
- [agy-acp-stale-run-audit.md](agy-acp-stale-run-audit.md) — Root-cause analysis of unbounded `session/prompt` RPC and idle poller self-lock.
- [agy-acp-gate-report.md](agy-acp-gate-report.md) — 9-round adversarial gate log for Fail-Closed turn termination, two-clock watchdogs, and SQLite inspection.
- [paseo-agy-acp-local-audit.md](paseo-agy-acp-local-audit.md) — Static robustness audit and backlog across 21 server modules in `paseo-agy-acp`.
- [agy-acp-upstream-0.1.3-port-assessment.md](agy-acp-upstream-0.1.3-port-assessment.md) — Commit-level diff vs upstream `v0.1.3` and rationale for retaining 6 custom resilience modules.
- [acp-peer-survey.md](acp-peer-survey.md) — Cross-implementation survey (`claude-code-acp`, `codex-acp`, `goose`, Gemini CLI) proving ACP lacks protocol-level heartbeats/retries.
- [agy-acp-ecosystem-tracking.md](agy-acp-ecosystem-tracking.md) — Ecosystem tracking of `pingdotgg/t3code` and community `agy-acp` adapters.
- [magpie-agy-bridge-comparison.md](magpie-agy-bridge-comparison.md) — Source comparison against `yce-magpie-agy` (turn-owned lifetime, 150s long-tool dedup placeholder, hash-gated resume).
- [t3-code-lifecycle.md](t3-code-lifecycle.md) — `t3code` 4-layer state model (`Run -> RunAttempt -> ExecutionNode -> ProviderTurn`) and startup orphan sweep.

## 2. Paseo Host Reconnaissance & Bot UX Studies
- [2026-11-16-companion-data-desync-analysis.md](2026-11-16-companion-data-desync-analysis.md) — 4-layer fix for companion chat desync during native Antigravity sessions.
- [2026-11-16-paseo-agy-acp-steer-queue-mechanism.md](2026-11-16-paseo-agy-acp-steer-queue-mechanism.md) — Proof that Paseo `steer` falls back to `Interrupt & Replace` (`session/cancel`) on `paseo-agy-acp`.
- [2026-11-16-bot-avatar-storage-architecture-and-decoupling.md](2026-11-16-bot-avatar-storage-architecture-and-decoupling.md) — Zero-Base64 avatar contract (`seed` / preset icons) keeping `bots.json` under 75 KB.
- [2026-11-16-paseo-chat-composer-bot-switch-feasibility.md](2026-11-16-paseo-chat-composer-bot-switch-feasibility.md) — Initial `ComposerTrackBar` & `addComposerPill` host extension recon (superseded in detail by next entry).
- [2026-11-16-paseo-composer-pill-and-surface-slimming-recon.md](2026-11-16-paseo-composer-pill-and-surface-slimming-recon.md) — Host draft-store sandbox boundary and `openAgent` handoff pattern.
- [paseo-plugin-agent-team-research.md](paseo-plugin-agent-team-research.md) — Analysis of `gyuha/agent-team` plugin vs `paseo-bots` Managed Seat isolation.
- [cindy-bot-model-fallback-architecture-report.md](cindy-bot-model-fallback-architecture-report.md) — Team-scoped `modelChain` failover vs interactive fail-fast error domains.

## 3. Prompt Engineering & Paused Meta-MCP Studies
- [Claude Code 多智能体提示词方案对比.md](Claude%20Code%20%E5%A4%9A%E6%99%BA%E8%83%BD%E4%BD%93%E6%8F%90%E7%A4%BA%E8%AF%8D%E6%96%B9%E6%A1%88%E5%AF%B9%E6%AF%94.md) — Empirical mechanics of Context Rot, `/compact` lossy summarization, `<system-reminder>` weighting, and `--append-system-prompt`.
- [AI运行时元MCP动态编排架构调研.md](AI%E8%BF%90%E8%A1%8C%E6%97%B6%E5%85%83MCP%E5%8A%A8%E6%80%81%E7%BC%96%E6%8E%92%E6%9E%B6%E6%9E%84%E8%B0%83%E7%A0%94.md) — **[PAUSED EXPLORATION]** Theoretical foundation for `paseo-sidecar` Byte-0 Meta-MCP & tail hydration.
