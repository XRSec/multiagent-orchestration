---
doc_id: DOCS_CONVENTIONS
status: CURRENT
name: docs-conventions
version: 1.4.0
last_verified: 2026-11-07
language: en-US
description: Addendum to documentation-standards.md: read path, routing-layer budgets, fact owners and write-back. Load before writing, moving, splitting or deleting a doc.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md, CLAUDE.md, docs/README.md, docs/standards/documentation-standards.md, src/daemon/transport/DaemonServer.ts, docs/axioms/STANDING_ORDER.md, Customizations/skills/agent-first-docs/SKILL.md]
---

# [0] ROOT: DOCS CONVENTIONS (ADDENDUM)

## [1] ROUTES
- [1.1] [doc-standards](standards/documentation-standards.md) :: [LOAD_IF: any doc write; owner rules D1-D13 and lint, binding first]
- [1.2] [docs-catalogue](README.md) :: [LOAD_IF: need a doc's status or the full doc list]
- [1.3] [docs-index](INDEX.md) :: [LOAD_IF: need to locate the doc that owns a fact]
- [1.4] [operating-model](operating-model/INDEX.md) :: [LOAD_IF: need the delivery rules a doc change is judged by]
- [1.5] [standing-order](axioms/STANDING_ORDER.md) :: [LOAD_IF: need the base line, depth, sibling and node-format limits]

## [2] CONTRACTS
- [2.1] **Routing Tree**: The agent routing layer is `docs/INDEX.md` plus branch `INDEX.md` files (routes only) and the leaves they route; `docs/README.md` is the human catalogue above it.
  - [2.1.1] **Read Path**: Walk `AGENTS.md` -> `docs/INDEX.md` -> branch `INDEX.md` when the route points to one -> leaf, at most 4 reads, and stop at the first doc that answers. Reason: fits the AGENTS.md §1.2 simple-task budget of 5 calls.
  - [2.1.2] **No Speculative Reads**: Never load a doc just in case.
  - [2.1.3] **Evidence**: `docs/reviews/`, logs, git history and past sessions are read only when a doc cites them. Reason: matches AGENTS.md §1.3 Refuse Archaeology.
- [2.2] **Routing-Layer Budget**: Every `INDEX.md` <= 3072 B; leaves of type `DOCS_*` <= 8192 B. Other docs, owner specs included, follow D12 (one concern, soft limit 600 lines, split by concern) and never trigger [3.8]. Depth and sibling limits (<= 8 children per node, route lists included) are in STANDING_ORDER [3.1.2.2].
  - [2.2.1] **Measurement**: Measure the blob, not the working file: `git cat-file -s HEAD:<path>` when committed; for an uncommitted file run `git add -N <path>` (or stage it), then `git cat-file -s :<path>`. Reason: working-tree size depends on local `core.autocrlf`.
  - [2.2.2] **Injected Files**: `CLAUDE.md` is a git symlink to `AGENTS.md`; a checkout without symlink support gets a stub or local router that points to it, so apply the STANDING_ORDER [3.1.1.1] caps to `AGENTS.md` itself.
  - [2.2.3] **Truncation Check**: After editing `AGENTS.md`, `MEMORY.md`, a `SOUL.md` or a `SKILL.md`, confirm its last line appears in the loaded text. Reason: truncation is silent.
- [2.3] **Format**: D1 keys (`doc_id`, `status`, `version`, `last_verified`, `language`) everywhere; `DOCS_*` docs add `name`, `description` (<= 40 tokens), `type`, `parent_node`, `allowed-tools`, `target`, `sources` (paths).
  - [2.3.1] **Body**: `DOCS_*` docs follow STANDING_ORDER [3.1.2] node layout, every line in an indexed node. Docs following documentation-standards without node indexing conform; never reformat them.
  - [2.3.2] **Routes**: One per line, `- [N.M] [name](rel_path) :: [LOAD_IF: <keywords>]`.
  - [2.3.3] **Index Purity**: Route text in an `INDEX.md` holds no numbers, dates, counts or status words. A doc's status is recorded once: in `docs/README.md` (D2) for docs it lists; `DOCS_*` docs, absent from it until the owner adds them, keep status in front matter ([doc-vs-code](operating-model/doc-vs-code.md) [3.6]). Routes never repeat it.
- [2.4] **Wording**: Follow AGENTS.md §2 `@agent-first-docs`; keep personal names verbatim. Write 0 examples, use plain imperatives and reserve `MUST`/`NEVER` for safety, data loss and security; this meets AGENTS.md §2 and STANDING_ORDER [1.3]/[2.1] at once.
- [2.5] **Owner Standard Wins**: This file only adds what documentation-standards leaves open; on conflict the standard wins. Owner docs are never deleted or rewritten from here; a doc-vs-code finding about one goes in [doc-vs-code](operating-model/doc-vs-code.md).
- [2.6] **Fact Owners**: D3 applies; never copy live runtime state (DB rows, logs, generated JSON) into a doc. Owners:
  - [2.6.1] **Bot Ids, Cwd, Write Scope**: AGENTS.md §3.
  - [2.6.2] **Bot Model**: `Customizations/agents/<bot>/capabilities.json` `model` and `modelChain`.
  - [2.6.3] **Gateway Port**: `DaemonServer` `httpPort` default plus the `MO_GATEWAY_URL` override; other literals are copies.
  - [2.6.4] **Room Limits**: Which limits code enforces: [sessions](sessions.md) [6.1].
  - [2.6.5] **Storage Layout**: `MEMORY.md` [4].
  - [2.6.6] **Delivery, Review, Roles, Proof**: [operating-model](operating-model/INDEX.md).
  - [2.6.7] **Sessions And Isolation**: [sessions](sessions.md) for code; owner design in `architecture/session-lifecycle-compaction-and-rewind-specs.md`.
  - [2.6.8] **Read Path And Doc Status**: [2.1.1] (`AGENTS.md` §6 links here); status per doc: `docs/README.md`.
- [2.7] **Scope of Change**: Existing docs are restructured only when a change touches them.
  - [2.7.1] **Open Conflicts**: STANDING_ORDER [4.3] puts schemas in Node [2], these leaves put rules there; D12 gives a 600-line soft limit, STANDING_ORDER [3.1.1.3] 300 lines per leaf; D2 has 4 statuses, `docs/README.md` also uses `UNAUDITED`, `AUDIT`, `MIXED`. No owner ruling; resolving any -> `TERM_ESCALATE` to a human maintainer.
- [2.8] **Proposals**: A design awaiting an owner ruling has `status: PROPOSED` (D2) and binds nothing; ours live in `docs/proposals/` (`type: DOCS_PROPOSAL`), the owner's may sit beside their subject. A ruling moves accepted rules into the leaves and a `docs/decisions/` entry.

## [3] WRITE-BACK TREE
- [3.1] **Fact Changed?**: If the change alters no fact a doc states -> `TERM_OK`. Otherwise -> [3.2].
- [3.2] **In Scope?**: If your write scope (AGENTS.md §3) covers the doc, replace the fact in place in the same commit and bump `version` and `last_verified` -> [3.4]. Otherwise -> [3.3].
- [3.3] **Doc Update Handoff**: Put the doc path and replacement lines under `## Doc update` in your report; moDoc applies them in the same merge -> [3.4].
- [3.4] **Doc vs Code**: For what the system does, code and config win (D8); fix the doc or record the drift under `## Doc vs code` in that doc. A rule on what agents must do (write scopes, delivery rules) still binds while no code enforces it; record the gap the same way -> [3.5].
- [3.5] **Replace, Not Append**: Never add "Update:" paragraphs; git keeps prior versions -> [3.6].
- [3.6] **Grow or Fold**: Split a `DOCS_*` leaf over 8192 B by concern (D12) into a directory with `INDEX.md`; fold a directory with <= 2 children under 4 KB into 1 leaf. Move with `git mv`; delete only via the AGENTS.md §1.7 safe-delete wrapper -> [3.7].
- [3.7] **Owner Ruling?**: A maintainer ruling gets `docs/decisions/YYYY-MM-DD-slug.md` naming what it supersedes, and affected docs are edited in the same change -> `TERM_OK`. A missing or contested ruling -> `TERM_ESCALATE` to a human maintainer.
- [3.8] **Limit Breach**: A [2.2] budget that cannot be met within your scope -> `TERM_BLOCK(2)`.
