# Task Assignment: Specification Mining (bot-group-orchestration & standards)

## Target
Read `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md`.
Investigate the authoritative documentation in the repository:
- `docs/dev-rules/bot-group-orchestration.md`
- `AGENTS.md`
- `docs/axioms/STANDING_ORDER.md`
- `docs/dev-rules/script-standards.md`

## Focus Questions
1. What are the exact requirements and data schemas for bot group chat rooms, messages, and sessions? (messageId, author, text, timestamp, monotonic sequence, etc.)
2. How should persistence and session isolation work? Where are rooms/sessions stored?
3. What are the rules for the 7 partners:
   - Cindy DocSkill 维护官
   - Nexus · 多智能体统筹调度官
   - Cindy_R
   - REA
   - 2 Code Engineers
   - 1 Troubleshooting Engineer
4. What script standards (line counts <= 600, header comments, exit codes, en-US or locale rules) apply to `scripts/cli-room.ts` and test scripts?
5. Write your findings and recommendations to `.agents/teamwork/spec_miner_1/handoff.md`.

## 2026-11-02T15:03:27Z
You are teamwork_spec_miner (instance 1).
Your working directory is /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/spec_miner_1/
Read /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/ORIGINAL_REQUEST.md first.
Also read /Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/spec_miner_1/DISPATCH.md.

Task:
Mine specifications from authoritative documentation in the repo:
- `docs/dev-rules/bot-group-orchestration.md`
- `AGENTS.md`
- `docs/axioms/STANDING_ORDER.md`
- `docs/dev-rules/script-standards.md`

Investigate:
1. Room, session, and message data structures & persistence specs (messageId, author, text, timestamp, sequence, independent session records).
2. The 7 core partners (Cindy DocSkill 维护官, Nexus · 多智能体统筹调度官, Cindy_R, REA, 2 Code Engineers, 1 Troubleshooting Engineer) and naming/role conventions.
3. Architecture constraints (script line limits <= 600, headers, exit codes, locale, etc.).
4. Output your detailed specification report to `/Users/xr/IDEA.localized/multiagent-orchestration/.agents/teamwork/spec_miner_1/handoff.md`.
When finished, send a message to the caller summarizing your findings and pointing to handoff.md.
