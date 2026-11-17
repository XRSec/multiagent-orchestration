<!--
name: "Skill: Code Review (Angle E — wrapper/proxy correctness)"
description: "Verifies wrapper, cache, proxy, and decorator implementations forward faithfully without re-entrant registry bypasses"
ccVersion: "2.1.173"
-->
### Angle E — wrapper/proxy correctness

For added/modified wrappers (caches, proxies, decorators, adapters), verify every method delegates to the wrapped `delegate` instance rather than re-entering via a global/session/registry (causing recursion or cache bypass), and confirm all caller-used methods are forwarded.
