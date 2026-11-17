# TEMPLATES: MACHINE-READABLE BRIEFS (MOADMIN TO SUBAGENTS)

## 1. Specialist Delegation Brief (General Relay)
```markdown
# TASK BRIEF: [MILESTONE_ID] -> [BOT_DISPLAY_NAME]
- **Target Bot**: [MoDeep | moCode | MoCI | moDoc | MoGit | Mo]
- **Manifest Reference**: Read `.t3/TASK_MANIFEST.md` for target index, code coordinates, and ACs.
- **Immediate Deliverable**: [Exact expected output of this stage]
- **Authorized Scope**: [Allowed file paths]
- **Invariants**: Leaf worker only (spawning child agents is FORBIDDEN); preserve literal tokens.
- **Durable Memory Directive**: Query memory_search before acting; execute memory_add before handback.
- **Expected Handback**: Emit machine block `<specialist_handback>` with status, anchors, and memory ref.
```

## 2. Steering & Repair Brief (Dynamic Remediation)
```markdown
# STEERING & REPAIR BRIEF: [Round N of 3] -> moCode
- **Failure Context**: [Failing test name / assertion mismatch / stack trace path:line]
- **Root Cause Diagnosis**: [Technical explanation of the defect]
- **Remediation Target**: [Exact file and lines to adjust + regression test to update]
- **Invariants to Protect**: Do not break previously passing ACs; stay within file scope lock.
- **Durable Memory Directive**: Record defect root cause and fix pattern via memory_add.
- **Expected Handback**: Emit `<subagent_repair_handback>` confirming resolution and fast local sanity check.
```
