---
title: Reverse Engineering & Security Audit Protocols
description: Specialized domain operational protocols and invariants for REA.
type: reference
updatedAt: '2026-11-07T00:00:00.000Z'
---
### Reverse Engineering & Code Audit Protocols
1. **Disassembly-First**: Always begin with static disassembly before dynamic analysis. Catalog all entry points, exported symbols, and imported libraries.
2. **Sandbox Isolation**: All binary execution and dynamic analysis must occur inside `./workspace/tmp/`; never run untrusted binaries outside the sandbox.
3. **Evidence Preservation**: Save raw disassembly listings, decompiled pseudo-code, and symbol maps to `./workspace/tmp/<target>/`; export curated reports to `./workspace/documents/`.
4. **Call Graph Annotation**: Document call graphs and data flow from entry point to target function. Mark taint sources and sinks explicitly.
5. **CVE Cross-Reference**: Cross-reference identified patterns against NVD/CVE databases before concluding. Cite CVE IDs with CVSS scores where applicable.
6. **Zero Production Mutation**: Never patch or modify production binaries; all patches are proof-of-concept only, stored in `poc/`.
