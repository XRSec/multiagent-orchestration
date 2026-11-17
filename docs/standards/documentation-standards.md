---
doc_id: STD-DOC-2026
status: CURRENT
version: 1.0.0
last_verified: 2026-11-07
language: en-US
---

# Documentation Standards

Rules for every document in this repository. Each rule exists because the pattern appeared in the current docs and caused drift.

| ID | Rule | Why | Bad | Good |
| :--- | :--- | :--- | :--- | :--- |
| D1 | Start with front matter: `doc_id`, `status`, `version`, `last_verified`, `language` | Readers cannot tell target from implemented | Title only | `status: TARGET` |
| D2 | Use one of four statuses: `CURRENT`, `TARGET`, `PROPOSED`, `HISTORICAL` | A spec and a wish look the same without it | Unmarked design | Status plus a conformance section |
| D3 | One owner per fact. Defaults live in code or config, docs link to them | The same value was copied into six files and diverged | Heartbeat `30s` in three docs, `45s` in code | "Default lease: see `DaemonServer` config" |
| D4 | Cite a file and a symbol, never a line number | Line numbers rot on the next edit | `index.ts:975` | `index.ts`, class `ClaudeCodeAgent` |
| D5 | Every number has a source label: measured with command and date, vendor with name, or design target | Unsourced figures read as facts | "hit rate stable at 88% to 96%" | "design target, not measured" |
| D6 | No absolute claims such as 100%, zero, all, never without a check command beside them | They are false the day one exception appears | "Zero host pollution" | Scoped claim plus the verifying command |
| D7 | No machine-specific absolute paths. Use `$MULTIAGENT_HOME` and `<projectRoot>` | Docs must work on another machine | A user home directory | `$MULTIAGENT_HOME/skills` |
| D8 | Mark implemented versus target per component in a conformance table with re-runnable commands | Drift is found by running the table | "Implemented" in prose | Table of symbol, status, command |
| D9 | Historical documents carry a banner naming the superseding document | Old designs get mistaken for current ones | Old doc, no banner | `status: HISTORICAL`, link to successor |
| D10 | Ledger entries say completed only with the verification they rest on | A ledger line is a claim | "Completed" | "Completed, verified by `<command>`" |
| D11 | Internal specs are en-US. User-facing replies follow the user's language. Do not mix languages inside one section | Mixed text breaks search and review | Chinese paragraph inside an English spec | Separate file or section |
| D12 | One concern per document, soft limit 600 lines. Split by concern, not by size | Large mixed documents hide contradictions | 900-line compendium | Linked focused documents |
| D13 | Relative links must resolve | Dead links hide the real source | Link to a moved file | Checked by the lint below |

## Lint

Read-only checks. Run from the repository root.

```bash
# D1 front matter missing
for f in docs/architecture/*.md docs/protocols/*.md; do head -1 "$f" | grep -q '^---$' || echo "D1 $f"; done
# D4 line-number references
grep -rnE '\.(ts|tsx|md|json):[0-9]+' docs AGENTS.md MEMORY.md PROJECT.md | cut -c1-120
# D7 machine-specific absolute paths
grep -rnE '/Users/[a-z]+' docs AGENTS.md MEMORY.md PROJECT.md | cut -c1-120
# D6 absolute claims to review
grep -rnE '100%|Zero |零污染' docs AGENTS.md MEMORY.md PROJECT.md | cut -c1-120
```

## Status handling for legacy documents

Existing Chinese or mixed-language specs stay as they are until rewritten. They are listed in `docs/README.md` with status `UNAUDITED`. Do not translate or restructure them in bulk. Audit one document at a time against its code, then set its status and `last_verified`.
