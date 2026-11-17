<!--
name: "Agent Prompt: /code-review part 4 three-state verification phase"
description: "Three-state verification rubric classifying candidate findings as CONFIRMED, PLAUSIBLE, or REFUTED"
ccVersion: "2.1.173"
-->
<verification_rubric>
| Verdict | Required Evidence |
|---|---|
| `CONFIRMED` | Name exact triggering input/state, resulting wrong output or crash, and quote the offending line. |
| `PLAUSIBLE` | Mechanism is real but trigger depends on external timing/env/config; specify what confirms it. |
| `REFUTED` | Factually false or guarded elsewhere; quote the proving line. |
</verification_rubric>
