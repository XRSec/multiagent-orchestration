---
doc_id: MULTIAGENT_ORCHESTRATION_UPDATE_LEDGER
version: 2.3.0
description: Architectural evolution, core milestones, and subsystem status ledger.
type: CHANGE_LEDGER_AST
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: ARCHITECTURAL EVOLUTION & MILESTONE LEDGER

## [1] ARCHITECTURE EVOLUTION TIMELINE (v1.0 -> v4.1)
- [1.1] **v1.0 (Legacy CLI Pool)**: Subprocess CLI wrapper with SSE (`/api/events`) and host `~/.claude` credential sharing. Deprecated due to host pollution and unidirectional transport limits.
- [1.2] **v2.0 (4-Dimension Decoupling & Bot 4-Pack Isolation)**: Introduced strict `~/.multiagent-orchestration/` self-contained runtime, per-bot `CLAUDE_CONFIG_DIR` isolation (`settingSources: []`, `strictMcpConfig: true`), and 4-Pack Bot asset specification (`profile.json`, `capabilities.json`, `workbench.json`, `SOUL.md`).
- [1.3] **v3.0 (Unified WebSocket Gateway & Dual-SQLite SSOT)**: Replaced SSE (`EventSource`) with single-port WebSocket Gateway (`ws://127.0.0.1:38080/gateway`) supporting 7 envelope types (`link-open`, `link-accept`, `invoke`, `invoke-result`, `push`, `ping`, `pong`), sequence gap detection, and Dual-SQLite WAL storage (`orchestrator.db` + `blackboard_ssot.db`).
- [1.4] **v4.0 (7 Mo-Bots Matrix & Prompt Distill Engine)**: Expanded core room (`room_multiagent_orchestration`) to 7 specialized Mo-Bots (`moAdmin`, `moCode`, `moDoc`, `MoCI`, `MoGit`, `MoDeep`, `Mo`) with non-blocking pre-flight Prompt Distill (`ANTHROPIC_DEFAULT_HAIKU_MODEL` / `gemini-3.8-flash`) and Web Studio 3-column workbench (`src/web`).
- [1.5] **v4.1 (Architecture Parameter Harmonization & Doc SSOT Alignment)**: Materialized authoritative `models.json`, unified `room.json` orchestration parameters, eliminated residual `/Users/xr` and `~/.claude` paths, repaired skill symlinks (`agent-first-docs`, `script-standards`), and aligned all architectural specifications.

## [2] MILESTONE VERIFICATION LEDGER (M1 - M5 & E2E: F01 - F27)
- [2.1] **[COMPLETED] M1 — Gateway WS Envelope, Storage & Web Client Foundation (`F01–F07`)**:
  - Single-port WebSocket Gateway (`ws://127.0.0.1:38080/gateway` & `GET /health`), 7-type JSON-RPC Envelope codec, `15s/45s` heartbeat (`maxBackpressureBytes: 64 MiB`), Dual-SQLite WAL persistence (`data/orchestrator.db` + `data/blackboard_ssot.db`), `GroupFileRepository` triple-file sync (`room.json`, `GROUP_CHARTER.md`, `GROUP_MEMORY.md`), and complete eradication of SSE (`EventSource`) and mock timers.
- [2.2] **[COMPLETED] M2 — Companion Autonomy, 7 Mo-Bots 4-Pack & Claude SDK Bridge (`F08–F13`)**:
  - 7 Mo-Bots 4-pack assets synchronized across `Customizations/agents/<Bot>/` and `Bots/<Bot>/`, dynamic bot scanner & capability APIs, `MOCK_BOTS` decoupling, `AgentOrchestrator` + `ClaudeSdkRunner` (`@anthropic-ai/claude-agent-sdk`), and structured 7-frame `agent:*` stream events emission.
- [2.3] **[COMPLETED] M3 — Direct Chat, Group Blackboard, Gateway IPC & Safe Lifecycle (`F14–F19`)**:
  - Direct chat P2P lane (`direct:<sessionId>`), `<group-Action>` XML tag parser (`talk`, `collaborate`, `finish`), two-tier turn quota (`single_speaker_mode: true`, `max_consecutive_steps: 5`, `max_turns_per_round: 10`, `max_circles_per_round: 3`, `NO_REPLY`), mandatory `/opt/xrsec/.env/rmfile <target>` safe deletion, and transcript JSONL persistence (`storage/transcripts/{sessionId}.jsonl`).
- [2.4] **[COMPLETED] M4 — Cindy 4-Tier Matrix, Model Config, Prompt Distill & Web Studio (`src/web`, `F20–F23`)**:
  - 3-column Web Studio workbench (`src/web`: `260px` sidebar / `flex-1` timeline / `320px` inspector), `ExecutionStatusCard` strictly mounted **ABOVE** the message bubble (`Process First, Conclusion Last`), `ActiveBotIndicator` 0ms live mount, 4-Tier Capability Matrix (`BotCapabilityMatrix.tsx`), `ModelConfigPanel.tsx`, and 4-stage Prompt Distill pipeline (`~/.multiagent-orchestration/state/prompt-distill`).
- [2.5] **[COMPLETED] M5 & E2E — Full-Link E2E & 27-Feature Verification Matrix (`F24–F27`)**:
  - Verified all 27 features (`F01–F27`) across the 28-test 4-tier E2E suite (`npx tsx test/e2e/run-all-e2e.ts`), adversarial suite (`test/e2e/challenger-adversarial.test.ts`), and Web Studio E2E suite (`test/e2e-web/web-chat-e2e.test.ts`) with zero console/page errors and zero `Invalid Date` occurrences.

## [3] RESOLVED ARCHITECTURAL DRIFT & PARAMETER CORRECTIONS
- [3.1] **Host Isolation Fix**: Migrated `Customizations/plugins/prompt-distill/config.json` and docs `storageDir` from `~/.claude/state/prompt-distill` to `~/.multiagent-orchestration/state/prompt-distill`.
- [3.2] **Skill Symlink Restoration**: Materialized canonical `SKILL.md` definitions for `agent-first-docs`, `script-standards`, `skill-creator-helper`, `ego-browser`, and `nested-child` inside `Customizations/skills/`, replacing broken `/Users/xr/.agents/skills/*` links.
- [3.3] **Bot 4-Pack Standardization**: Synchronized `Bots/<Bot>/` and `Customizations/agents/<Bot>/` across all 7 Mo-Bots (`providerId: "cpa"`, `effort: "high"`, `thinkingLevel: "high"`, relative `defaultWorkingDir`, portable `mcpServers`, and aligned `SOUL.md` & `README.md` CWDs and write scopes).
- [3.4] **Documentation SSOT Alignment**: Corrected legacy references to SSE (`EventSource`), below-bubble `ExecutionStatusCard` placement, `apps/web` workspace path, `<= 600` line budgets, and host `~/.claude` credential inheritance across all repository documentation.

## [4] DOCUMENTATION MILESTONES
- [4.1] **Docs Routing Tree & Operating Model**: Added `docs/INDEX.md` (routing root), `docs/_conventions.md` (doc format, size limits, write-back) and `docs/operating-model.md` (binding delivery rules, task lifecycle, Mo-Bot role mapping, proof contract), routed from `AGENTS.md` §6 (2026-11-07).
