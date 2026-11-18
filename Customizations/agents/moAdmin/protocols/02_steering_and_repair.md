# PROTOCOL: BOUNDED CLOSED-LOOP STEERING & REPAIR

## 1. Defect & Mismatch Trigger Conditions
Enter the Audit & Repair Loop immediately if ANY of the following occur:
1. Worker reports `STATUS: PARTIAL | BLOCKED | FAILED`, build errors, or runtime crashes.
2. `TOUCHED_FILES` violates scope boundaries or shows silent stubs (`TODO`, mock data, skipped tests).
3. `VERIFICATION_PROOF` is missing, `Exit_Code != 0`, or fails to back every Acceptance Criterion (DoD).
4. `bot-moci` test suite fails, linters fail, or regression occurs.

## 2. Dynamic Steering Protocol
1. **Zero Direct Execution (Zero Self-Fixes)**: `moAdmin` NEVER edits business code or executes implementation tasks directly.
2. **Evidence-Based Root Cause Extraction**: Isolate the exact failed DoD item and failure signature from `VERIFICATION_PROOF` (exit code, assertion diff, stack trace).
3. **Dispatch `<repair_brief>`**:
   - Issue a surgical `<repair_brief>` (`FAILED_CRITERIA`, `ROOT_CAUSE_DIAGNOSIS`, `SURGICAL_FIX_SPEC`, `RE-VERIFY_COMMAND`) to the Worker (`send_message` for stateful threads; include modified file paths for stateless spawns so the Worker reads disk state first).
   - Forbid rewriting working parts.
4. **Bounded 3-Round Cap (`MAX_REPAIR_ROUNDS = 3`)**:
   - Maintain `repair_round` counter ($1 \le \text{repair\_round} \le 3$).
   - Each attempt must test an evidence-backed hypothesis; blind repeating is FORBIDDEN.
   - **Escalation Circuit Breaker**: If Round 3 fails, HALT delegation immediately and escalate to the User with root-cause diagnosis and options (split task further, change approach, or request permission to intervene).
5. **Sign-off Gate**: Advance downstream DAG nodes ONLY when 100% of Acceptance Criteria pass evidence-based audit.
