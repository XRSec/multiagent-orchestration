---
doc_id: WEB_PARSER_AND_STUDIO_SPEC
version: 1.0.0
type: SPECIFICATION_TREE
parent_node: ../../AGENTS.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: CLAUDE STREAM PARSER & PARTNER STUDIO SPECIFICATION

* **[1] CHILD ROUTING TABLE**
  * `- [AGENTS](../../AGENTS.md) :: [LOAD_IF: need_parent_charter]`
  * `- [STANDING_ORDER](../axioms/STANDING_ORDER.md) :: [LOAD_IF: ALWAYS]`

* **[2] PROTOCOL PARSER LAYER (`claude-code-parser`)**
  * **[2.1] Package Primitive**: `udhaykumarbala/claude-code-parser` (Zero-dependency, 11kB).
  * **[2.2] Core Ingestion API**:
    * `[2.2.1] parseLine(line)`: Type-safe NDJSON parsing into discrete `ClaudeEvent` objects.
    * `[2.2.2] Translator`: Stateful deduplicator handling `--verbose` cumulative snapshot deduplication and multi-agent interleaving via content fingerprinting.
    * `[2.2.3] createMessage`: Structured constructor for `stdin` input frames (`user`, `control_response` for `approve`/`deny`).
  * **[2.3] Historical Session Parser Reference**:
    * Offline `.jsonl` transcript ingestion refers to `afk-agents/afk-viewer` and `dutchdata/claude-transcript`.

* **[3] UI RENDER LAYER (`@assistant-ui/react` + `shadcn/ui` AI ELEMENTS)**
  * **[3.1] Chat Timeline & Branching**:
    * Use `@assistant-ui/react` with `useExternalStoreRuntime` adapter.
    * Support topic forking via `MessageBranch` / `forkFrom` primitives bound to `--resume <id> --fork-session`.
  * **[3.2] Inline Tool Authorization**:
    * Render `control_request` frames as inline `[Approve / Deny]` cards on active tool-use bubbles. Write decision back to `stdin` via `createMessage.approve()`.
  * **[3.3] Specialist Subagent Queue Cards**:
    * Render concurrent workers via `shadcn/ui` AI Elements (`<Trace>`, `<TraceCollapsible>`, `<TraceLine>`).
    * Display live status (`running`), duration counter, model `<Badge>`, and nested tool call streams.

* **[4] PARTNER STUDIO THREE-COLUMN IDE SPECIFICATION**
  * **[4.1] Header Bar**:
    * Displays partner ID, name, avatar, model selector, `max_turns`, and `max_budget_usd`.
    * Symlink Badge: Renders `[Builtin Linked -> Repo]` for symlinked partners vs. `[Local Persistent]` for custom partners.
  * **[4.2] Tab 1: AST Tree Editor (`SOUL.md` & `CLAUDE.md`)**:
    * Left pane: AST Outline Tree (`[0] ROOT`, `[1]`, `[1.1]`) with depth limit verification (`<= 4`).
    * Center pane: Monaco Editor (`@monaco-editor/react`).
    * Bottom status: Real-time Linter bar checking line limits (`<= 200`), bytes (`<= 25KB`), zero orphan prose, and forbidden modals (`should`, `try to`).
  * **[4.3] Tab 2: Dual-Pane Memory Shard Manager**:
    * Left pane: Root Index (`memories/MEMORY.md`, `<= 200` lines, 1-line pointers).
    * Right pane: Leaf Shards (`memories/topics/*.md`, `<= 300` lines) with direct save.
  * **[4.4] Tab 3: MCP & Tool Sandbox Sandbox Panel**:
    * Form-based `mcp.json` editor with `[Test & Discover]` auto-prefixing `mcp__<server>__<tool>`.
    * Tool whitelist builder enforcing trailing space for Bash prefixes (`Bash(git diff *)`).
  * **[4.5] Tab 4: Skills & Token Budget Monitor**:
    * Manages `.claude/skills/*`. Monitors aggregate frontmatter `description` tokens against the 15,000-token warning ceiling.
  * **[4.6] Right-Side Collapsible Drawer**:
    * Embedded `@agent-architect` conversational sidecar for generating English AST nodes via natural language, paired with Monaco Diff Accept/Reject views.
