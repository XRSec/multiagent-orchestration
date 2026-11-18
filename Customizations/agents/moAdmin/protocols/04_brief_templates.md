# TEMPLATES: MACHINE-READABLE BRIEFS (MOADMIN TO WORKERS)

## 1. Atomic Task Brief (`<task_brief>`)
```xml
<task_brief>
- TASK_ID & OBJECTIVE: [One-sentence atomic goal]
- CONTEXT & SCOPE: Read paths [...]; Write paths [...]; Strict boundary ("DO NOT touch files outside [...]")
- IMPLEMENTATION SPEC: [Step-by-step deterministic instructions, interfaces, or patterns; reference .t3/TASK_MANIFEST.md if Tier 2]
- GUARDRAILS: Call budget (<=5 simple / <=15 medium / <=30 complex); 3-Fail Circuit Breaker; Schema-First Probe (for parsers); One-Shot Batch Script (for SSH/runtime diagnosis); leaf worker only (spawning child agents FORBIDDEN).
- VERIFICATION COMMAND: [Exact shell/test/lint command the Worker MUST run before finishing]
- ACCEPTANCE CRITERIA (DoD): [Bullet checklist of binary pass/fail conditions]
- REQUIRED REPORT FORMAT: End response with <worker_handoff> (STATUS, SUMMARY, TOUCHED_FILES, VERIFICATION_PROOF, DOD_CHECKLIST, OPEN_ISSUES).
</task_brief>
```

## 2. Surgical Repair Brief (`<repair_brief>`)
```xml
<repair_brief>
- FAILED_CRITERIA: [Exact DoD item(s) violated or failing assertion/test]
- ROOT_CAUSE_DIAGNOSIS: [Technical explanation of why the previous attempt failed or was rejected]
- SURGICAL_FIX_SPEC: [Exact delta changes required; forbid rewriting working parts; list previously modified file paths when stateless spawn]
- RE-VERIFY_COMMAND: [Exact command to prove the fix]
</repair_brief>
```

## 3. Worker Fixed Handoff Schema (`<worker_handoff>`)
```xml
<worker_handoff>
STATUS: [PASS | PARTIAL | BLOCKED | FAILED]
SUMMARY: [1-3 bullet points of exact changes made]
TOUCHED_FILES: [path/to/file (+added/-removed lines or brief change note) | None]
VERIFICATION_PROOF:
  - Command: `<exact command executed>`
  - Exit_Code: `<code_number>`
  - Key_Output: `<concise 3-10 line excerpt proving pass/fail, never full raw logs>`
DOD_CHECKLIST:
  - [x/!] Criterion 1 -> [1-line evidence or failure reason]
OPEN_ISSUES: [None | Exact blocker or side-effect discovered]
</worker_handoff>
```
