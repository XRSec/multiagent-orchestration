---
doc_id: DOCS_PROPOSAL_SUBAGENT_ENGINE_PYRAMID_REFS
status: PROPOSED
version: 0.1.0
last_verified: 2026-11-10
language: en-US
name: subagent-engine-pyramid-refs
description: PROPOSED follow-up message refs, their delivery verdicts and the reader window. Binds nothing.
type: DOCS_PROPOSAL
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [paseo-bots/server/tools/bots.ts, paseo-bots/server/handoffs.ts, docs/proposals/subagent-engine-pyramid/mechanism.md]
---

# [0] ROOT: FOLLOW-UP REFS (PROPOSED)

## [1] REFS
- [1.1] **Ref**: `continueChat()` returns `{outcome, messageId}`, and `ask_bot` puts that id in its reply, so every append has a handle to check. A send that throws still returns its id, because the provider may have accepted it.
- [1.2] **Verdicts**: `check_chat` takes `ref` and reports `delivered` when a returned entry or its item carries `messageId` equal to the ref; `not visible in this chat's timeline` when the page carries other message ids but not this one; otherwise `recorded, but this chat's timeline exposes no message ids, so delivery cannot be confirmed`.
- [1.3] **Never Guessed**: the verdict reads only returned entries. A timestamp or an agent status cannot separate an accepted send from a delivered message, so neither counts as evidence.
- [1.4] **Capability Gap**: projected timeline items do not expose `messageId` in the published `@getpaseo/plugin` types, so the check is opportunistic. A chat whose projection omits message ids degrades `ref` to an echo, and [1.2] says so instead of reporting `delivered`.
- [1.5] **Window And Resend**: only the last 80 entries are read, so an older ref is reported as likely delivered and must not be resent. No wording may read as `did not arrive` or `not delivered`: a missing ref is a reader limit, not a verdict.
- [1.6] **Runtime Check, Unverified**: the local daemon listens on `127.0.0.1:7006` and requires a daemon password; that credential is not in this checkout's environment, so the projected item shape was not observed. [1.4] stays a risk rather than a fact, and no verdict may claim a delivery the check has not seen.
- [1.7] **Group Cards**: the settled task card never carries a ref; refs stay a follow-up receipt, so a card cannot be used to claim a delivery. Contract: [mechanism](mechanism.md) [7].
