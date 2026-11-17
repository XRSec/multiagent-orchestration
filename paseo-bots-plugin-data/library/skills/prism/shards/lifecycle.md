# Prism Execution Lifecycle Protocol

Mandatory operational contracts for Profile execution and CDP resource management.

## 1. Single-Instance Execution Contract
1. **Pre-flight Probe**: Query `prism_get_profile_status` for target `profileId` or `serialNumber`. Never launch an already running instance.
2. **Guaranteed Teardown**: Every invocation of `prism_start_profile` MUST pair with an unconditional exit path calling `prism_close_profile`. In script environments, enforce via language-native `try...finally` or deferred traps.
3. **Task Session Cleanup**: If task sessions are created via `prism_create_task_session`, explicitly invoke `prism_close_task_session` prior to closing the parent profile.

## 2. Extraction Budget Protocol
1. **No Raw DOM**: Dumping raw HTML or outerHTML into agent context violates call efficiency standards.
2. **Deterministic Extraction Sequence**:
   - Primary: `prism_get_markdown` for textual content and reading articles.
   - Tabular: `prism_get_table` for tables, transaction lists, and grids.
   - Scoped: `prism_get_text` with explicit CSS selectors for localized values.
3. **Output Cap**: Truncate or paginate extracted text exceeding 5,000 tokens before saving to disk.

## 3. Fault Recovery
- If `prism_health` returns `ok: false`, invoke `prism_start_service` or `prism_restart_service` exactly once.
- If connection remains down after restart, halt and alert operator. Do not repeat service restarts in a loop.
