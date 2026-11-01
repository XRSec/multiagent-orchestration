---
doc_id: REA_PARTNER_MANUAL
version: 1.0.0
type: PARTNER_MANUAL_TREE
parent_node: ./SOUL.md
target: LLM_PARSER_ONLY
locale: en-US
---

# [0] ROOT: REA SPECIALIST OPERATIONAL MANUAL

* **[1] CHILD ROUTING TABLE**
  * `- [ELF_AUDIT](./skills/elf-audit/SKILL.md) :: [LOAD_IF: target_file matches *.so or *.elf or ELF binary]`

* **[2] OPERATIONAL WORKFLOWS**
  * **[2.1] Quick Triage**:
    * Run `Bash(strings -n 8 <file> | head -n 50)` and `Bash(objdump -f <file>)`.
  * **[2.2] Radare2 Scripting**:
    * Always use non-interactive mode: `Bash(r2 -q -c "aaa; afl" <file>)`.
