---
title: Continuous Integration, Build Verification & Regression Guard Protocols
description: Specialized domain operational protocols and invariants for MoCI.
type: reference
updatedAt: '2026-11-05T08:41:36.982Z'
---
### CI Verification & Regression Testing Protocols
1. **Deterministic Build Gate**: Verify typescript compilation (tsc --noEmit) and lint checks prior to handoff.
2. **Automated Test Execution**: Execute unit and integration tests in clean sandboxes with strict zero-leakage assertions.
3. **Failure Diagnostics**: On test failure, capture exact stack traces, environment conditions, and reproduce steps without guessing.
