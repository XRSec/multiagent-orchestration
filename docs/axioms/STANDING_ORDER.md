---
doc_id: AGENT_FIRST_OPERATIONAL_PROTOCOL
version: 3.0.0
type: SYSTEM_AXIOM_TREE
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: AGENT-FIRST OPERATIONAL PROTOCOL (STANDING ORDER)

* **[1] LINGUISTIC & TOKEN CONSTRAINTS**
  * **[1.1] Internal Artifact Locale**: `100%` of system files (`SOUL.md`, `CLAUDE.md`, `SKILL.md`, `MEMORY.md`, `mcp.json`, schemas, code comments, logs) MUST use `en-US`.
  * **[1.2] External I/O Decoupling**:
    * **[1.2.1]** Human-facing final responses MUST match the user's natural language.
    * **[1.2.2]** Internal specs MUST contain `0` conversational tokens, `0` polite modals (`please`, `should`, `might`, `try to`), and `0` narrative transitions.
  * **[1.3] Modal Vocabulary**: Restrict normative verbs to RFC-2119 primitives: `MUST`, `MUST NOT`, `ONLY`, `NEVER`.

* **[2] MACHINE-ERGONOMIC AXIOMS**
  * **[2.1] Zero-Example Policy**:
    * **[2.1.1]** Internal specs and skills MUST contain `0` tutorial examples, `0` dummy payloads, and `0` decorative diagrams.
    * **[2.1.2]** Express all constraints via formal grammars (EBNF, JSON Schema, TypeScript types, or predicate logic).
  * **[2.2] Numbers-First Quantification**:
    * **[2.2.1]** Every boundary condition MUST begin with an explicit numeric literal (`integer`, `float`, `byte_size`, `ms_timeout`, `exit_code`).
    * **[2.2.2]** Unquantified qualifiers (`short`, `fast`, `concise`, `several`, `appropriate`) are syntax errors.
  * **[2.3] Deterministic I/O Contracts**:
    * **[2.3.1]** Every skill/tool boundary MUST declare strict `InputSchema` and `OutputSchema`.
    * **[2.3.2]** Untyped free-text handoffs between agents are prohibited.

* **[3] TREE-TOPOLOGY LAW (MANDATORY FOR ALL DOCS & SKILLS)**
  * **[3.1] Structural Isomorphism**: Every document and skill MUST be serialized as a rooted, directed acyclic tree $T = (V, E)$ across 3 scales:
    * **[3.1.1] Scale-1: Filesystem Sharding Tree (Inter-File)**
      * **[3.1.1.1] Root Index Budget**: Root files (`CLAUDE.md`, `MEMORY.md`, `SKILL.md`) act strictly as routing tables. Max size: `<= 200` lines AND `<= 25,600` bytes (`25KB`).
      * **[3.1.1.2] Router Description Budget**: Each skill/agent frontmatter `description` MUST be `<= 40` tokens; aggregate descriptions across workspace MUST be `< 15,000` tokens.
      * **[3.1.1.3] Branch & Leaf Sharding**: When content exceeds `200` lines, split into child leaf files (`<= 300` lines/file, max directory depth `<= 3`).
      * **[3.1.1.4] Edge Pointer Syntax**: Root nodes link to child files strictly via: `- [<NodeID>](<relative_path>) :: [LOAD_IF: <boolean_predicate>]`.
    * **[3.1.2] Scale-2: Document AST (Intra-File)**
      * **[3.1.2.1] Single Root**: Exactly `1` `H1` node (`# [0] ...`) per file, preceded by mandatory YAML frontmatter (`doc_id`, `version`, `parent_node`, `allowed-tools`).
      * **[3.1.2.2] Bounded Tree Dimensions**: Max heading/indentation depth `<= 4` (`[X]` -> `[X.Y]` -> `[X.Y.Z]` -> `[X.Y.Z.W]`); max sibling branching factor `<= 8` per parent node.
      * **[3.1.2.3] Explicit Node Addressing**: Every node MUST carry a deterministic hierarchical index (`[1]`, `[1.1]`, `[1.1.1]`).
      * **[3.1.2.4] Zero Orphan Prose**: `0` unindexed paragraphs allowed. Every token outside YAML frontmatter and fenced schema blocks MUST reside inside an indexed tree node (`<= 2` sentences per leaf node).
    * **[3.1.3] Scale-3: Execution Decision Tree (Behavioral Logic)**
      * **[3.1.3.1] Predicate Branching**: Procedural logic inside `SKILL.md` MUST be structured as a finite decision tree:
        * `Non-Leaf Node`: `IF (<condition_predicate>) THEN -> goto [Child_Node_A] ELSE -> goto [Child_Node_B]`
        * `Action Node`: `EXEC <ToolName>(<strict_args>) -> capture <exit_code, stdout>`
      * **[3.1.3.2] Bounded Loop & Retry**: Max retry depth per action node: `<= 2` (`backoff_ms: 1000`).
      * **[3.1.3.3] Terminal Leaf States**: Every execution path MUST terminate in exactly `1` of `3` deterministic leaf states:
        * `TERM_OK(payload)`: Schema validation passed (`exit_code == 0`).
        * `TERM_BLOCK(code: 2, reason: string)`: Guardrail/PreToolUse violation (`exit_code == 2`).
        * `TERM_ESCALATE(err_code: string, context_snapshot: object)`: Unrecoverable dependency failure; yield control to parent/Lead agent.

* **[4] REQUIRED AST SCHEMA FOR ANY `SKILL.md` OR `DOC.md`**
  * **[4.1] Frontmatter Node**: `{ name: string, description: string(<=40_tokens), version: semver, parent_node: path, allowed-tools: string[] }`
  * **[4.2] Node `[1]` (Child Routing Table)**: List of `[NodeID](relative_path) :: [LOAD_IF: <predicate>]` (`0..8` entries).
  * **[4.3] Node `[2]` (I/O & Guardrail Contracts)**:
    * **[4.3.1]** `InputSchema`: JSON Schema / TypeScript type definition.
    * **[4.3.2]** `OutputSchema`: JSON Schema / TypeScript type definition.
    * **[4.3.3]** `Invariants`: Quantified hard prohibitions (`0` exceptions).
  * **[4.4] Node `[3]` (Execution Decision Tree)**: Numbered state-transition tree (`[3.1]` .. `[3.N]`) terminating exclusively in `TERM_OK`, `TERM_BLOCK`, or `TERM_ESCALATE`.
