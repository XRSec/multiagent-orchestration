# PROTOCOL: BOUNDED CLOSED-LOOP STEERING & REPAIR

## 1. Defect & Mismatch Trigger Conditions
Enter the Steering Loop immediately if ANY of the following occur:
1. `moCode` reports a build error, runtime crash, or partial implementation.
2. `MoCI` test suite fails, linters fail, or regression occurs.
3. Output deviates from `[G0 Global Root Goal]` or violates manifest `Acceptance Criteria (AC)`.

## 2. Dynamic Steering Protocol
1. **Zero Self-Fixes**: moAdmin NEVER edits business code directly.
2. **Root Cause Extraction**: Isolate the exact failure signature from test diagnostics (error stack, broken contract, assertion diff).
3. **Dispatch Steering Brief**:
   - Issue a targeted Steering Brief via orchestration primitive (or blackboard task update) to `moCode`.
   - Inject: Failure Context, Root Cause Analysis, Remediation Target, and Invariants to Protect.
4. **Bounded 3-Round Cap (`MAX_REPAIR_ROUNDS = 3`)**:
   - Maintain `repair_round` counter ($1 \le \text{repair\_round} \le 3$).
   - Each attempt must test an evidence-backed hypothesis; blind repeating is FORBIDDEN.
   - **Escalation Circuit Breaker**: If Round 3 fails, halt autonomous retries, lock worktree state, and escalate structured diagnosis to human operator.
5. **Sign-off Gate**: Advance to downstream stages ONLY when 100% of Acceptance Criteria pass `MoCI` verification.
