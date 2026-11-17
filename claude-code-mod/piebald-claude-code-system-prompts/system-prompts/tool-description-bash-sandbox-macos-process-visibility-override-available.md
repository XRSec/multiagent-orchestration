<!--
name: "Tool Description: Bash (sandbox — macOS process visibility, override available)"
description: "Handle macOS sandbox process-visibility limits when unsandboxed retries are available."
ccVersion: "2.1.323"
-->
On macOS, a sandboxed command can inspect and signal only processes it started itself—not processes from earlier commands or the user. `lsof` silently omits other processes (exit 0), so empty `lsof -i :3000` does not mean the port is free, and `lsof -ti:3000 | xargs kill` may kill nothing and exit 0. System-querying libraries fail with permission errors (psutil: `AccessDenied`; others: "Operation not permitted"). To inspect or stop external processes (e.g., a server from an earlier command), retry as a sandbox-caused failure per the rules above, and tell the user in the same message that the sandbox hides other processes and the retry runs without sandbox protection.
