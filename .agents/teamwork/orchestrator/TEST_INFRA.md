# E2E Test Infra: multiagent-orchestration Web Group Chat

## Test Philosophy
- Opaque-box, requirement-driven. Derives from ORIGINAL_REQUEST.md.
- Methodology: Category-Partition + Boundary Value Analysis + Real-World Workload Testing.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | Preset Room Discovery & Creation (`multiagent-orchestration`) | ORIGINAL_REQUEST § R1 | 5 | 3 | ✓ |
| 2 | Room Listing & Switching via Web API | ORIGINAL_REQUEST § R1 | 5 | 3 | ✓ |
| 3 | Monotonic Sequence Stream Rendering | ORIGINAL_REQUEST § R2 | 5 | 4 | ✓ |
| 4 | Sender Metadata & Badges (User + 7 Core Partners) | ORIGINAL_REQUEST § R2 | 5 | 3 | ✓ |
| 5 | User Message Submission & Persistence (clientId idempotency) | ORIGINAL_REQUEST § R3 | 5 | 4 | ✓ |
| 6 | `@伙伴` Mention Parsing & Agent Turn Trigger | ORIGINAL_REQUEST § R3 | 5 | 4 | ✓ |
| 7 | Real-time / Streaming Response Handling (SSE) | ORIGINAL_REQUEST § R3, R4 | 5 | 3 | ✓ |
| 8 | Front-to-Back Synchronization & Concurrency Safety | ORIGINAL_REQUEST § R4 | 5 | 4 | ✓ |

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Web server start -> List rooms -> `multiagent-orchestration` auto-discovered with correct sequence & members | F1, F2 | Medium |
| 2 | Switch to room -> Hydrate history messages -> verify strict sequence ascending order and partner badges | F2, F3, F4 | Medium |
| 3 | User inputs message with `@Nexus 规划架构` -> message submitted -> monotonic sequence incremented -> Nexus responds -> reply rendered | F5, F6, F7, F8 | High |
| 4 | Multiple mentions in one turn (e.g. `@DocSkill @排错`) -> sequential turns execute -> watermarks advance | F5, F6, F7, F8 | High |
| 5 | Silent exit (`NO_REPLY`) -> agent produces NO_REPLY -> watermark updates -> no empty bubble rendered | F6, F7, F8 | Medium |

## Coverage Thresholds
- Tier 1: >= 5 per feature area
- Tier 2: Boundary conditions (empty inputs, rapid consecutive submissions, missing partner mentions, path traversal slugs)
- Tier 3: Pairwise combination of mentions + storage + SSE streaming
- Tier 4: Complete end-to-end user session lifecycle test script `tests/test-web-e2e-flow.mjs` exiting with 0.
