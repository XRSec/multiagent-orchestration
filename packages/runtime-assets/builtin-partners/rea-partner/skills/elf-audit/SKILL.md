---
name: elf-audit
description: Analyze ELF binary headers, export tables, and hardening flags in <= 40 words.
version: 1.0.0
parent_node: ../../PARTNER_MANUAL.md
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash(readelf *)
  - Bash(objdump *)
---

# [0] ROOT: SKILL ELF-AUDIT

* **[1] CHILD ROUTING TABLE**
  * `- [MANUAL](../../PARTNER_MANUAL.md) :: [LOAD_IF: ALWAYS]`

* **[2] I/O & GUARDRAIL CONTRACTS**
  * **[2.1] InputSchema**: `{ target_binary: string, check_hardening: boolean }`
  * **[2.2] OutputSchema**: `{ arch: string, stripped: boolean, hardening: object, exit_code: number }`
  * **[2.3] Invariants**: Target file must exist and have read permissions.

* **[3] EXECUTION DECISION TREE**
  * **[3.1] Step 1 [VALIDATE]**: Check file type via `Bash(file <target_binary>)`.
    * `├── IF NOT ELF` -> `TERM_BLOCK(code: 2, reason: "ERR_NOT_AN_ELF_FILE")`.
    * `└── ELSE` -> goto [3.2].
  * **[3.2] Step 2 [INSPECT HEADERS]**: Run `Bash(readelf -h <target_binary>)` -> parse architecture.
  * **[3.3] Step 3 [CHECK HARDENING]**:
    * `├── IF check_hardening == true`: Run `Bash(readelf -l <target_binary> | grep GNU_RELRO)` and check for canary symbols -> `TERM_OK(OutputSchema)`.
    * `└── ELSE`: `TERM_OK(OutputSchema)`.
