---
doc_id: DOCS_OM_DONE_AND_PROOF
status: CURRENT
name: done-and-proof
version: 1.3.0
last_verified: 2026-11-07
language: en-US
description: Done criteria, proof triad, self-audit and final report table. Load before reporting a task.
type: DOCS_LEAF
parent_node: INDEX.md
allowed-tools: []
target: LLM_PARSER_ONLY
sources: [AGENTS.md, src/daemon/cli.ts, src/daemon/transport/DaemonServer.ts]
---

# [0] ROOT: DONE AND PROOF

## [1] ROUTES
- [1.1] [delivery-rules](delivery-rules.md) :: [LOAD_IF: need the fact or gate rule behind a proof]

## [2] DONE AND PROOF
- [2.1] **Done**: Plans and specs are preparation; a build, fix or connect task is done only when code or config changed and the system works.
- [2.2] **Proof Triad**: A "works" or "ready" claim shows all 3: the diff changed this session; OS listener output with owning PID for the configured `httpPort` that `pnpm gateway:status` reports (`Get-NetTCPConnection -LocalPort <httpPort> -State Listen` or `netstat -ano | findstr <httpPort>`); an end-to-end call (`GET /health` or WS `invoke` -> `invoke-result`) parsed into data.
  - [2.2.1] **Not Ready**: 401, 403, 502, a login redirect or an empty body. `pnpm gateway:status` output alone is not proof.
- [2.3] **Self-Audit**: Keep working instead of reporting if an engineering task changed only markdown, a feature lacks code, an endpoint returns 401/403/502, a blocked item is closing, or 1 verified part covers others.
- [2.4] **Report Table**: Final task reports use columns sub-task | metric | baseline | change (paths, lines) | runtime evidence (gate exit code, PID and port, parsed response) | status (plan only, debugging, blocked, done); group-chat replies follow AGENTS.md §4.
- [2.5] **Null Result**: A measured "no improvement" is a valid result.
