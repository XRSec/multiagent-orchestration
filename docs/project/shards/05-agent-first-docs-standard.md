---
doc_id: PROJ-AGENT-FIRST-DOCS
status: CURRENT
version: 1.0.0
last_verified: 2026-11-18
language: en-US
---

# Agent-First Documentation Standard (`agent-first-docs`)

Binding authoring, sharding, lint, and maintenance specification for every markdown file in `<projectRoot>` (`docs/`, `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, `souls/*.md`, and `SKILL.md`). Parent router: [../INDEX.md](../INDEX.md).

## 1. Three Core Pillars

### 1.1 Pillar 1: Language Discipline
- Author all internal repository artifacts (`docs/**/*.md`, `AGENTS.md`, `CLAUDE.md`, `MEMORY.md`, `SKILL.md`, `souls/*.md`, schemas, and code comments) in dense technical `en-US`. Uniform English tokens maximize cross-model retrieval precision, grepability, and instruction adherence.
- Match the human operator's natural language (`zh-CN` by default in this workspace) in user-facing chat replies and executive delivery summaries.
- Preserve code symbols, file paths, CLI flags, config keys, and proper display names (`bot-x`, `小红书订阅官`, `情报中心`) verbatim without translation; never mix prose languages inside one specification section.

### 1.2 Pillar 2: Skills & Docs Are for Machines
- **Rule First**: State the actionable rule in the opening clause, followed immediately by a 1-line rationale; add 1–2 compact edge-case notes only where ambiguity previously caused runtime drift.
- **No Conversational Filler**: Strip greetings, storytelling, historical retrospectives, hedging modals (`might`, `should probably`, `try to`), and decorative ASCII banners.
- **No Demo Code**: Exclude tutorial snippets, toy payloads, and hypothetical usage examples from specs and skills; use fenced blocks strictly for wire-protocol templates (`<task_brief>`, `<worker_handoff>`) or executable read-only verification commands.
- **Modal Calibration**: Use crisp plain imperatives (`Run`, `Mount`, `Verify`, `Cap`) by default; reserve `MUST` and `NEVER` strictly for safety, path-sandbox, and anti-pollution redlines.
- **Clean Markdown Structure**: Author clean standard Markdown headings (`#`, `##`, `###`) and compact tables; never use legacy AST-numbered outlines (`# [0] ROOT` or `[3.1.2.4]`).

### 1.3 Pillar 3: Micro-Kernel Index & Shards Topology

| Artifact Tier | Path Pattern | Line Budget | Structural Contract |
| :--- | :--- | :--- | :--- |
| Root / Branch Router | `docs/INDEX.md`, `docs/*/INDEX.md` | `<= 50–80` lines (`<= 55` target) | Scope, 3–4 core invariants, `LOAD_IF` shard routing table, parent pointer |
| Specification Shard | `docs/*/shards/*.md` | `100–260` lines (`600` soft cap) | Single domain concern anchored to real files, exported symbols, and check commands |
| Skill Entrypoint | `**/skills/<id>/SKILL.md` | `<= 200` lines (`description <= 40` tokens) | Concise trigger metadata + execution rules; factor bulky schemas into skill `references/` |
| Task Blackboard | `<sessionBoard>/TASK_MANIFEST.md`, `.t3/TASK_MANIFEST.md` | Bounded per active task | On-disk objective, scope bounds, itemized DoD checklist, and stage settlement status |

---

## 2. Required YAML Frontmatter Schema

Start every specification router and shard at line 1 with this exact 5-field YAML block:

```yaml
---
doc_id: <DOMAIN-SLUG>
status: CURRENT | REFERENCE | EXPERIMENTAL
version: <semver>
last_verified: YYYY-MM-DD
language: en-US
---
```

---

## 3. Normative Rules Matrix (`D1`–`D13`)

| ID | Rule | Rationale | Violation Pattern | Compliant Pattern |
| :--- | :--- | :--- | :--- | :--- |
| `D1` | Include 5-field YAML frontmatter (`doc_id`, `status`, `version`, `last_verified`, `language`) | Agents immediately verify lifecycle validity and locale | Bare `# Title` on line 1 | Complete 5-field YAML frontmatter |
| `D2` | Set `status` to `CURRENT`, `REFERENCE`, or `EXPERIMENTAL` (`HISTORICAL` on archived notices only) | Separates enforced runtime contracts from upstream docs or paused prototypes | Unmarked design wish | `status: CURRENT` or `status: EXPERIMENTAL` |
| `D3` | Maintain one owner per fact; keep defaults in config/code and link to them | Copying constants across prose files guarantees silent divergence | Duplicating timeout values in 5 docs | Cite `DEFAULT_STALL_TIMEOUT_MS` in `paseo-bots/server/workflow-runner.ts` |
| `D4` | Cite file path and exported symbol name, NEVER a line number | Line numbers invalidate on the very next edit | Appending colon + digits to a source filename | `paseo-bots/server/workflow-runner.ts`, `parseWorkerHandoff` |
| `D5` | Attach a source label to every quantitative figure (config symbol, measured command + date, or budget) | Unlabeled figures read as verified empirical benchmarks | `"Cache hit rate stays at 92%"` | `"Inline cap: MAX_INLINE_UPSTREAM_CHARS (2000)"` |
| `D6` | Back absolute claims with an executable check command or explicit code guard | Unchecked absolutes break silently when one exception lands | Unbacked `"Never leaks state"` | Scoped rule + `assertInsideManagedDataDir` or lint check |
| `D7` | NEVER include machine-specific user home paths; use `$PASEO_HOME`, `<projectRoot>`, or `~` | Documentation must work identically across macOS and Linux hosts | Hardcoded host user home directory | `$PASEO_HOME/plugin-settings/paseo-bots` |
| `D8` | Anchor implemented vs. experimental status to concrete symbols or re-runnable commands | Enables automated zero-trust drift auditing by `bot-moci` and `bot-modoc` | Vague `"Supported by the server"` | Module path + exported function/schema |
| `D9` | Banner paused or superseded documents at the top with status and active replacement link | Prevents agents from reviving retired subsystems | Unmarked stale spec left in tree | Explicit `PAUSED / EXPERIMENTAL` boundary note |
| `D10` | Mark ledger or manifest items done only alongside the exact verification command and exit code | Blocks premature closure without objective runtime proof | Bare `"Completed"` | `"PASS (verified by pnpm test, exit 0)"` |
| `D11` | Keep internal specs pure `en-US` without mixed-language prose paragraphs | Mixed prose breaks grep queries and wastes tokenizer budget | Chinese paragraph inside English shard | Pure `en-US` prose; verbatim identifiers only |
| `D12` | Restrict each shard to one concern (`100–260` target lines, `600` soft cap) | Omnibus documents bury contradictions and rot context windows | `900`-line multi-topic compendium | Micro-kernel `INDEX.md` + focused `shards/*.md` |
| `D13` | Ensure every relative markdown link resolves to an existing path in `<projectRoot>` | Broken links sever progressive-disclosure routing | Pointer to moved or deleted file | Verified clean by the `D13` link check below |

---

## 4. Read-Only Repository Lint Commands

Run these non-mutating checks from `<projectRoot>` before completing any documentation edit (`docs/`, `AGENTS.md`, `MEMORY.md`):

```bash
# D1: Verify mandatory YAML frontmatter on all docs/**/*.md (excluding root catalogue docs/README.md)
find docs -name '*.md' ! -path 'docs/README.md' -exec sh -c 'head -n 1 "$1" | grep -q "^---$" || echo "D1_FAIL: $1"' _ {} \;

# D4: Detect forbidden file:line citations across active docs and root charters
grep -rnE '\.(ts|tsx|mjs|js|md|json):[0-9]+' docs/project docs/design docs/INDEX.md AGENTS.md MEMORY.md 2>/dev/null | cut -c1-120

# D7: Detect forbidden machine-specific user home paths
grep -rnE '/Users/[A-Za-z0-9._-]+' docs/project docs/design docs/INDEX.md AGENTS.md MEMORY.md 2>/dev/null | cut -c1-120

# D13: Verify all relative markdown links resolve on disk
node -e '
const fs = require("fs"), path = require("path");
const walk = d => fs.readdirSync(d, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(d,e.name)) : e.name.endsWith(".md") ? [path.join(d,e.name)] : []);
for (const f of walk("docs/project")) {
  const txt = fs.readFileSync(f, "utf8").replace(/```[\s\S]*?```/g, "");
  for (const m of txt.matchAll(/\[[^\]]+\]\((?!https?:|mailto:|file:|#)([^)#]+)(?:#[^)]*)?\)/g)) {
    const target = path.resolve(path.dirname(f), m[1]);
    if (!fs.existsSync(target)) { console.error(`D13_BROKEN: ${f} -> ${m[1]}`); process.exitCode = 1; }
  }
}
'
```

## 5. Same-Commit In-Place Write-Back & Progressive Read Cap

1. **Atomic Co-Update**: Every commit that modifies an architectural invariant, tool grant, bot roster entry, CLI flag, or path topology updates the exact shard stating that fact in the **same commit** (`AGENTS.md` §5.2).
2. **In-Place Edit over Changelog Append**: Mutate existing tables and rules directly in place and update `last_verified`; never append dated `"Changelog / Update"` postscripts to specification shards.
3. **Catalogue Alignment (`docs/README.md`)**: When adding, archiving, or renaming a branch router or shard under `docs/`, update `docs/INDEX.md`, the parent branch `INDEX.md`, and `docs/README.md` together so zero orphan markdown files exist.
4. **Progressive Read Cap**: Agents traversing `docs/` load `docs/INDEX.md` -> 1 branch `INDEX.md` -> at most `1–2` task-relevant shards per turn (`<= 4` doc reads total before acting) instead of bulk-reading entire directories.
5. **Incremental Legacy Auditing**: Do not bulk-translate legacy or external reference files (`docs/references/`, `docs/research/`); audit one active specification at a time against live source symbols before promoting its status to `CURRENT`.
