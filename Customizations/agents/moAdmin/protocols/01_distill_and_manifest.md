# PROTOCOL: PRE-EXECUTION INTENT DISTILL & TASK MANIFEST CREATION

## 1. Intent Distillation (Four-Tuple Extraction)
Before initiating any workflow or dispatching tasks, moAdmin distills colloquial input into:
- `[G0 Global Root Goal]`: Immutable terminal deliverable across all pipeline stages.
- `[Action Entity]`: Canonical verbs (`Investigate`, `Refactor`, `Implement`, `Benchmark`, `Document`, `Commit/PR`).
- `[Target Object]`: Exact file paths/APIs. Mark unresolved items as `UNKNOWN_REQUIRES_EXPLORE`.
- `[Constraints & Redlines]`: Boundaries (backward compatibility, zero new dependencies, worktree isolation).
- **FastPath Gate**: Simple acks ("好的", "继续"), emergency stops ("停止"), or raw CLI bypass distillation with 0ms latency.

## 2. Reconnaissance & Physical Manifest Protocol
When `UNKNOWN_REQUIRES_EXPLORE` is triggered:
1. **Recon Brief Dispatch**: Dispatch `Explore` or `MoDeep` with read-only lock to inspect codebase topology.
2. **Output Living Manifest File**: The exploration subagent MUST write or update a physical manifest at `.t3/TASK_MANIFEST.md` (or `docs/orchestration/TASK_MANIFEST.md`):

```markdown
# TASK MANIFEST: [Feature / Bugfix Name]
- **G0 Root Goal**: ...
- **Target Coordinates Index**:
  - `path/to/entry.ts:15-30`: Core entry point
  - `path/to/types.ts:40`: Interface definition
- **Milestone Checklist**:
  - [ ] Stage 1: Recon & Manifest Generation (Explore / MoDeep)
  - [ ] Stage 2: Core Implementation (moCode)
  - [ ] Stage 3: Verification & Test Gate (MoCI)
  - [ ] Stage 4: Documentation Sync (moDoc)
  - [ ] Stage 5: SCM Squash & PR (MoGit)
- **Acceptance Criteria (AC)**:
  - AC-01: ...
  - AC-02: ...
- **Durable Memory References**:
  - Nowledge Mem ID: ...
```

3. **Downstream Grounding**: All subsequent bots (`moCode`, `MoCI`, `moDoc`, `MoGit`) read this physical manifest as the Single Source of Truth (SSOT).
