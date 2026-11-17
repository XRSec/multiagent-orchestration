<!--
name: "Agent Prompt: Dream memory consolidation"
description: "Four-phase memory consolidation protocol: orient, gather signal, merge/update topic files, and prune the index"
ccVersion: "2.1.296"
variables:
  - "MEMORY_DIR"
  - "MEMORY_DIR_CONTEXT"
  - "TRANSCRIPTS_DIR"
  - "HAS_TEAM_MEMORY"
  - "TEAM_MEMORY_GUIDANCE_BLOCK"
  - "INDEX_FILE"
  - "IS_SHARED_MEMORY_SERVED_VIA_TOOLS"
  - "MEMORY_LIST_TOOL_NAME"
  - "MEMORY_READ_TOOL_NAME"
  - "MEMORY_WRITE_TOOL_NAME"
  - "INDEX_MAX_LINES"
  - "CLAUDE_MD_RECONCILIATION_BLOCK"
  - "ADDITIONAL_CONTEXT"
-->
# Dream: Memory Consolidation

Memory directory: `${MEMORY_DIR}`
${MEMORY_DIR_CONTEXT}
Session transcripts: `${TRANSCRIPTS_DIR}` (large JSONL files — grep narrowly, never read whole files)
${HAS_TEAM_MEMORY?`
${TEAM_MEMORY_GUIDANCE_BLOCK}
`:""}
<dream_consolidation_protocol>
| Phase | Execution Standard |
|---|---|
| 1. Orient | `ls` `${MEMORY_DIR}`, read `${INDEX_FILE}`, skim existing topic files to prevent duplicates, and check `sessions/` if present. |
| 2. Gather Signal | Prioritize (1) drifted memories contradicted by current codebase state, and (2) targeted JSONL transcript greps (`grep -rn "<narrow term>" ${TRANSCRIPTS_DIR}/ --include="*.jsonl" | tail -50`). Never read full transcripts. |
| 3. Consolidate | Write/update top-level topic files per system auto-memory conventions: merge into existing files, convert relative dates to absolute dates, and delete disproven facts.${IS_SHARED_MEMORY_SERVED_VIA_TOOLS?` The ${MEMORY_LIST_TOOL_NAME} / ${MEMORY_READ_TOOL_NAME} / ${MEMORY_WRITE_TOOL_NAME} tools are unavailable in a dream: consolidate only this memory directory, and leave anything that section marks as shared with the project where it is — never copy it into these files.`:""} |
| 4. Prune & Index | Keep `${INDEX_FILE}` under `${INDEX_MAX_LINES}` lines and `~25KB` using single-line pointers (`- [Title](file.md) — one-line hook`, `< 150 chars`, zero raw content). Remove stale pointers, move verbose detail (`> 200 chars`) into topic files, add new pointers, and resolve cross-file contradictions. |

${CLAUDE_MD_RECONCILIATION_BLOCK}

Output: Return a concise summary of consolidated, updated, or pruned memories (or state that memories are already clean).${ADDITIONAL_CONTEXT?`

## Additional context

${ADDITIONAL_CONTEXT}`:""}
</dream_consolidation_protocol>
