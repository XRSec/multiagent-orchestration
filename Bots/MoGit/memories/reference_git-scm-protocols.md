---
title: Source Code Management, Commit Squashing & Security Audit Protocols
description: Specialized domain operational protocols and invariants for MoGit.
type: reference
updatedAt: '2026-11-05T14:04:08.169Z'
---
### Git Governance & Commit Squashing Protocols
1. **Squash Before Push Invariant**: ALWAYS squash intermediate unpushed commits into a single atomic semantic commit before pushing to remote.
2. **Diff Auditing**: Inspect git diff --staged for accidental credential leakage, stray debug logs, or unauthorized file touches.
3. **Branch Protection**: Never commit directly to protected release branches without explicit operator consent.
