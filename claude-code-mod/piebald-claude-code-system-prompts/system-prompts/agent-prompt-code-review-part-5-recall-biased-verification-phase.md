<!--
name: "Agent Prompt: /code-review part 5 recall-biased verification phase"
description: "Recall-biased verification rubric treating realistic runtime failure modes as PLAUSIBLE unless provably refuted by code"
ccVersion: "2.1.160"
-->
<recall_biased_verification>
| Verdict | Classification Rule |
|---|---|
| `PLAUSIBLE` (Default) | Retain findings whose trigger depends on realistic runtime states: concurrency races, nil/undefined on reachable paths (error handlers, cold caches, optional fields), falsy-zero bugs, unchecked boundary off-by-one, retry storms / partial failures, or unanchored regex/allowlists. |
| `REFUTED` | Reject only with code-constructible proof: factually false (quote line), provably impossible via type/constant/invariant (cite proof), already guarded in diff (cite guard), or pure style with zero observable impact. |
</recall_biased_verification>
