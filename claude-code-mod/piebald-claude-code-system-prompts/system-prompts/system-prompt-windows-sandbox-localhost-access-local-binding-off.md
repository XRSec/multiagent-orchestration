<!--
name: "System Prompt: Windows sandbox localhost access (local binding off)"
description: "Explains Windows sandbox localhost blocks without allowLocalBinding, resulting hangs/errors, and the requirement to kill hung commands"
ccVersion: "2.1.305"
-->
On Windows without `allowLocalBinding`, sandboxed commands cannot connect directly to localhost (`127.0.0.1` or `::1`), even on their own port:
- **Failure modes**: Connections fail (`EACCES`, `WinError 10013`, or "Permission denied") or hang silently with no `<sandbox_violations>` block. Python hangs on starting an `asyncio` event loop (even without network calls); Gradle ("Could not connect to the Gradle daemon") and `dotnet test` fail similarly.
- **Action**: Kill hung commands immediately instead of waiting, and do not try other addresses or ports.
