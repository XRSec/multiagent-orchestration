<!--
name: "Agent Prompt: /security-review slash command"
description: "High-confidence security review protocol targeting exploitable PR vulnerabilities with strict false-positive filtering"
ccVersion: "2.1.318"
variables:
  - "ALLOWED_TOOLS"
-->
---
allowed-tools: ${ALLOWED_TOOLS}, Read, Glob, Grep, LS, Task
description: Complete a security review of the pending changes on the current branch
---

<git_context>
- Status: !`git status`
- Modified files: !`git diff --name-only origin/HEAD...`
- Commits: !`git log --no-decorate origin/HEAD...`
- Diff: !`git diff origin/HEAD...`
</git_context>

<security_review_protocol>
Objective: Identify HIGH-CONFIDENCE (`>= 0.8` / score `8–10`) exploitable security vulnerabilities newly introduced by this diff (omit pre-existing issues, style nits, theoretical risks, and read-only audit — NEVER run bash or write files).

| Target Category | Focus Vectors |
|---|---|
| Input Validation | SQLi, command injection, XXE, template injection, NoSQLi, path traversal |
| Auth & AuthZ | Auth bypass, privilege escalation, session flaws, JWT defects, authz bypass |
| Crypto & Secrets | Hardcoded keys/tokens, weak crypto/randomness, improper key storage, cert validation bypass |
| Injection & RCE | Unsafe deserialization (Pickle, YAML), `eval` injection, XSS (reflected/stored/DOM) |
| Data Exposure | Plaintext secret/PII logging, API leakage, debug info exposure (local-network exploits count as HIGH) |

<false_positive_exclusions>
Automatically exclude:
1. DoS, rate limiting, resource exhaustion, CPU/memory/FD leaks.
2. Secrets/credentials stored on disk if otherwise secured; env vars and CLI flags (assumed trusted).
3. Missing hardening/audit logs, outdated 3P deps, unit/test-only files, markdown docs, `.ipynb`/GitHub Actions/shell-script issues lacking a concrete untrusted-input exploit path.
4. Memory safety in Rust or memory-safe languages; UUID unguessability; log spoofing; path-only SSRF; user content in AI system prompts; regex injection/ReDoS.
5. Client-side JS/TS auth checks (enforced server-side); React/Angular XSS absent `dangerouslySetInnerHTML`/`bypassSecurityTrustHtml`; non-PII logging; low-impact tabnabbing/XS-Leaks/open-redirects/prototype-pollution unless extreme confidence.
</false_positive_exclusions>

<execution_pipeline>
1. **Discovery Sub-Task**: Spawn a sub-task (including full criteria above) to map repo security patterns, trace untrusted data flows across the diff, and surface candidate vulnerabilities.
2. **Parallel False-Positive Filtering**: Spawn one sub-task per candidate in parallel (passing `<false_positive_exclusions>`) to score confidence `1–10` against concrete exploitability.
3. **Output Gate**: Drop findings with confidence `< 8` (retain HIGH/MEDIUM only). Emit Markdown entries containing: `file:line`, `Severity` (`HIGH`/`MEDIUM`/`LOW`), `category`, `Description`, `Exploit Scenario`, and `Recommendation`.
</execution_pipeline>
</security_review_protocol>
