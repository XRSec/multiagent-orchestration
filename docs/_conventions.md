---
doc_id: DOCS_CONVENTIONS
name: docs-conventions
version: 1.1.0
description: How docs are routed, formatted, sized and kept current. Load before writing, moving, splitting or deleting any doc.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
locale: en-US
verified: 2026-11-07
sources: [AGENTS.md, CLAUDE.md, docs/axioms/STANDING_ORDER.md, Customizations/skills/agent-first-docs/SKILL.md]
---

# [0] ROOT: DOCS CONVENTIONS

## [1] ROUTES
- [1.1] [docs-index](INDEX.md) :: [LOAD_IF: need to locate the doc that owns a fact]
- [1.2] [operating-model](operating-model.md) :: [LOAD_IF: need the delivery rules a doc change is judged by]
- [1.3] [standing-order](axioms/STANDING_ORDER.md) :: [LOAD_IF: need the base line, depth, sibling and node-format limits]

## [2] CONTRACTS
- [2.1] **Routing Tree**: Docs form a tree; a branch is a directory whose `INDEX.md` holds routes only, a leaf is one file holding the current truth for one topic.
  - [2.1.1] **Read Path**: Walk `AGENTS.md` -> `docs/INDEX.md` -> leaf in at most 3 reads and stop at the first doc that answers. Reason: keeps reads inside the AGENTS.md §1.2 call budgets.
  - [2.1.2] **No Speculative Reads**: Never load a doc just in case.
- [2.2] **Size Limits**: `INDEX.md` <= 3 KB; leaf <= 8 KB. Line, depth and sibling limits are in STANDING_ORDER [3.1.1.3] and [3.1.2.2].
  - [2.2.1] **Measurement**: Measure the committed blob with `git cat-file -s HEAD:<path>`. Reason: working-tree size depends on local `core.autocrlf`.
  - [2.2.2] **Injected Files**: `CLAUDE.md` is a git symlink to `AGENTS.md`; a checkout without symlink support gets a stub or local router that points to it, so apply the STANDING_ORDER [3.1.1.1] caps to `AGENTS.md` itself.
  - [2.2.3] **Truncation Check**: After editing `AGENTS.md`, `MEMORY.md`, a `SOUL.md` or a `SKILL.md`, confirm its last line appears in the loaded text. Reason: truncation is silent.
- [2.3] **Format**: YAML frontmatter with `doc_id`, `name`, `version`, `description` (<= 40 tokens), `type`, `parent_node`, `allowed-tools`, `target`, `locale`, `verified` (YYYY-MM-DD), `sources` (paths).
  - [2.3.1] **Body**: Node layout follows STANDING_ORDER [3.1.2]; every line outside frontmatter sits in an indexed node.
  - [2.3.2] **Routes**: One per line, `- [N.M] [name](rel_path) :: [LOAD_IF: <keywords>]`.
- [2.4] **Wording**: Follow AGENTS.md §2 `@agent-first-docs`; keep personal names verbatim. Write 0 examples, use plain imperatives and reserve `MUST`/`NEVER` for safety, data loss and security; this meets AGENTS.md §2 and STANDING_ORDER [1.3]/[2.1] at once.
- [2.5] **Index Purity**: Route text in an `INDEX.md` holds no numbers, dates, counts or status words. Reason: they go stale.
- [2.6] **One Fact, One Place**: State a fact in its owning doc and link to it elsewhere. Never copy live runtime state (DB rows, logs, generated JSON) into a doc; name the file or command and what to look for.
- [2.7] **Evidence**: `docs/reviews/`, logs, git history and past sessions are read only when a doc cites them. Reason: matches AGENTS.md §1.3 Refuse Archaeology.
- [2.8] **Scope of Change**: Existing docs are restructured only when a change touches them; untouched directories without `INDEX.md` are exempt until then.
  - [2.8.1] **Open Conflict**: STANDING_ORDER [4.3] requires Node [2] to hold schemas, while these leaves use Node [2] for rules; no owner ruling exists, so resolving it -> `TERM_ESCALATE` to a human maintainer.

## [3] WRITE-BACK TREE
- [3.1] **Fact Changed?**: If the change alters no fact a doc states -> `TERM_OK`. Otherwise -> [3.2].
- [3.2] **In Scope?**: If your write scope (AGENTS.md §3) covers the doc, replace the fact in place in the same commit and bump `version` and `verified` -> [3.4]. Otherwise -> [3.3].
- [3.3] **Doc Update Handoff**: Put the doc path and replacement lines under `## Doc update` in your report; moDoc applies them in the same merge -> [3.4].
- [3.4] **Doc vs Code**: Code and config win; fix the doc or record the drift under `## Doc vs code` in that doc -> [3.5].
- [3.5] **Replace, Not Append**: Never add "Update:" paragraphs; git keeps prior versions -> [3.6].
- [3.6] **Grow or Fold**: Split a leaf over 8 KB into a directory with `INDEX.md`; fold a directory with <= 2 children under 4 KB into 1 leaf. Move with `git mv`; delete only via the AGENTS.md §1.7 safe-delete wrapper -> [3.7].
- [3.7] **Owner Ruling?**: A maintainer ruling gets `docs/decisions/YYYY-MM-DD-slug.md` naming what it supersedes, and affected docs are edited in the same change -> `TERM_OK`. A missing or contested ruling -> `TERM_ESCALATE` to a human maintainer.
- [3.8] **Limit Breach**: A size or route limit in [2.2] that cannot be met within your scope -> `TERM_BLOCK(2)`.
