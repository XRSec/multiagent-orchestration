---
doc_id: DOCS_GROUPCHAT_INDEX
status: CURRENT
name: groupchat-architecture
version: 1.1.0
last_verified: 2026-11-10
language: zh-CN
description: Group chat agent architecture branch index covering 10 core dimensions.
type: DOCS_BRANCH_INDEX
parent_node: ../INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [docs/standards/documentation-standards.md, docs/_conventions.md, docs/architecture/companion-groupchat-blackboard-v4-production-full-spec.md, docs/architecture/cindy-chat-mechanisms-and-blackboard-system.md]
---

# [0] ROOT: GROUPCHAT AGENT ARCHITECTURE SHARDS

## [1] ROUTES: TEN CORE DIMENSIONS
- [1.1] [storage-topology](01-storage-topology-and-workspaces.md) :: [LOAD_IF: partner private storage, group storage, mountedDirs zero-pollution, or execution sandbox isolation]
- [1.2] [session-channels](02-session-channel-and-lanes.md) :: [LOAD_IF: 1:1 DM session, persistent hidden group lanes, thread session isolation, or multi-lane concurrency]
- [1.3] [single-speaker-fsm](03-single-speaker-and-interjection-fsm.md) :: [LOAD_IF: native TS FSM speaker arbitration, speaker priority queue, single-speaker invariant, or user interjection steering]
- [1.4] [sequence-monotonicity](04-sequence-monotonicity-and-delta-injection.md) :: [LOAD_IF: monotonic sequence numbers, lastSeenSequence watermarks, delta slicing, or untrusted json isolation]
- [1.5] [shared-blackboard](05-shared-blackboard-and-token-budget.md) :: [LOAD_IF: blackboard five scopes, 1400-token budget slicing, compactTouchedFiles, or SHA-256 stall detection]
- [1.6] [anti-loop-defense](06-anti-loop-defense-and-silent-skip.md) :: [LOAD_IF: five-dimensional anti-loop defense, explicit mention gate, NO_REPLY silent skip, or autonomous turn budget]
- [1.7] [quality-ladder](07-three-tier-quality-ladder-and-arbitration.md) :: [LOAD_IF: three-tier quality ladder, self-healing, cross-review arbitration, or deadlock circuit breaker]
- [1.8] [sdk-harness-reality](08-claude-agent-sdk-harness-reality.md) :: [LOAD_IF: Claude Agent SDK child_process lifecycle, NDJSON streams, ephemeral memory, or session auto-recovery]
- [1.9] [lifecycle-and-security](09-lifecycle-gates-and-permission-pipeline.md) :: [LOAD_IF: PreCompact schema crash guard, tool whitelist matching, PreToolUse permission pipeline, or safe deletion]
- [1.10] [blackboard-sqlite-mcp](10-blackboard-sqlite-and-mcp-protocol.md) :: [LOAD_IF: SQLite WAL schema DDL, transparent version increments, CAS concurrency, or blackboard MCP tool contracts]

## [2] REVERSE ROUTES
- [2.1] [task-pyramid](../../proposals/subagent-engine-pyramid/INDEX.md) :: [LOAD_IF: deciding how worker engines sit behind this group, or which of these shards a task line still obeys; it keeps the blackboard, anti-loop and single-speaker shards binding, and replaces the lane shard at task scope]
