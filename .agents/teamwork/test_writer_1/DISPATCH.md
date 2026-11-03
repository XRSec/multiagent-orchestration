# Test Writer Dispatch: Comprehensive Acceptance Test Suite (tests/test-cli-room.mjs)

## Target Scope
Author the comprehensive acceptance test suite for the CLI room feature:
- Location: `tests/test-cli-room.mjs`
- Comply with:
  - `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md`
  - `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/PROJECT.md`
  - `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/TEST_INFRA.md`
  - `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/spec_miner_1/handoff.md`

## File Ownership
You exclusively own:
- `tests/test-cli-room.mjs`
DO NOT edit files in `scripts/` (owned by worker).

## Test Suite Requirements
Build an automated, non-interactive node test script (`node tests/test-cli-room.mjs`) that validates all 4 tiers:

### Tier 1 - Feature Coverage
1. Partner Scaffolding & Readiness:
   - Validates that executing `ensureCorePartnersReady()` (or running CLI in test mode) creates all 7 core partners in `~/.multiagent-orchestration/partners/`:
     `doc-skill-keeper`, `lead-orchestrator`, `cindy-r`, `rea-partner`, `claude-sdk-architect`, `agent-architect`, `troubleshooting-engineer`.
   - Validates that each partner has valid `manifest.json`, `SOUL.md`, `CLAUDE.md`, and `memories/MEMORY.md`.
2. Room Initialization:
   - Verifies room `multiagent-orchestration` is created under `~/.multiagent-orchestration/groups/multiagent-orchestration/` with `group.json`.
   - Verifies member roster contains all 7 partners.
3. Message Sending & Monotonic Sequence:
   - Sends user message; verifies sequence is 1.
   - Sends second message; verifies sequence is 2.
   - Verifies message fields: `id`, `groupId`, `sequence`, `authorKind`, `content`, `createdAt`.
4. Partner Mention & Driver Dispatch:
   - Sends `@DocSkill 维护官` or `@troubleshooting-engineer` task.
   - In test/mock mode, verifies turn prompt EBNF compliance, subprocess execution/mock reply, and partner message persistence with sequence 3.
5. History Reload & Watermark:
   - Re-loads room history; verifies all 3 messages returned in exact sequence order.
   - Verifies partner watermark `lastSeenSequence` updated.

### Tier 2 - Boundary & Corner Cases
1. Unknown partner mention (e.g. `@non-existent-bot`) does not crash and logs warning.
2. Duplicate message with same `clientId` is detected as duplicate and rejected from sequence increment.
3. Multiple mentions in one message (e.g. `@Nexus @Cindy_R`).
4. Message with empty content or whitespace is rejected gracefully.
5. Large message backlog watermark truncation (>30 messages) adds omission notice.

### Tier 3 - Cross-Feature Combinations
1. Room creation -> multiple messages -> mention dispatch -> reload room history -> assert full sequence continuity.

### Tier 4 - End-to-End CLI Process Execution
1. Spawns `node scripts/cli-room.ts --headless --room multiagent-orchestration --send "Hello team" --mock-run` as a child process.
2. Asserts process exits with code 0.
3. Re-runs `node scripts/cli-room.ts --headless --room multiagent-orchestration --mock-run` to verify historical replay in terminal output.
4. Asserts exit code 0.

## Standards Compliance
- Line count <= 600 lines.
- Top 3-4 line header comment.
- Explicit assertion errors and exit code 0 on all tests passing, exit code 1 on failure.
- Self-contained runner using standard Node `node:assert`, `node:child_process`, `node:fs`.

Write completion report to `.agents/teamwork/test_writer_1/handoff.md`.

## 2026-11-02T15:20:21Z
You are teamwork_test_writer (instance 1).
Your working directory is /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/test_writer_1/
Read /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md first.
Also read:
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/test_writer_1/DISPATCH.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/PROJECT.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/orchestrator/TEST_INFRA.md
- /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/spec_miner_1/handoff.md

Your exclusively owned file to create:
- `tests/test-cli-room.mjs`

Requirements:
Author a comprehensive automated non-interactive acceptance test suite covering Tiers 1-4:
- Tier 1: Feature coverage (7 core partners readiness in `~/.multiagent-orchestration/partners/`, room creation, message sending, monotonic sequence, mention parsing, agent turn execution/mock, history reload, watermark).
- Tier 2: Boundary & corner cases (duplicate clientId, unknown bot mention, multiple mentions, empty message rejection, watermark backlog truncation).
- Tier 3: Cross-feature combinations.
- Tier 4: Real-world CLI subprocess workflow: spawn `scripts/cli-room.ts` in headless mode, send message, re-enter room, verify output and exit code 0.

Strictly comply with `docs/dev-rules/script-standards.md` (<= 600 lines, 3-4 line header comment, exit code 0 on pass, exit code 1 on fail).
Execute and verify the test script where possible, then write your handoff report to `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/test_writer_1/handoff.md`.
When finished, send a message to the caller with summary and handoff.md path.
