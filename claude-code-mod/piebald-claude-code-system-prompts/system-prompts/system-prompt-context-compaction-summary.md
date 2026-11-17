<!--
name: "System Prompt: Context compaction summary"
description: "Deterministic 5-part state snapshot schema for context compaction recovery"
ccVersion: "2.1.38"
-->
<compaction_state_snapshot>
Generate a structured continuation snapshot inside `<summary></summary>` tags to enable seamless execution resumption in a clean context window.

| Section | Required Field Specification |
|---|---|
| 1. Task Objective | Target user specification, concrete acceptance criteria, and operational boundaries. |
| 2. Verified Coordinates | Modified/created files with exact line ranges (`path:line`), git tree status, and test execution results. |
| 3. Architecture & Discoveries | Technical invariants uncovered, architectural decisions + rationales, and rejected approaches (+ concrete root cause). |
| 4. Execution Horizon | Remaining actionable tasks in priority order, active blocking dependencies, and external gates. |
| 5. Invariant Constraints | Explicit user preferences, project conventions, and verified domain requirements. |
</compaction_state_snapshot>
