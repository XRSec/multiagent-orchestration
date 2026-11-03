# Handoff Report: Agent Execution Engine & CLI REPL Architecture

## 1. Observation

### 1.1 Agent Execution Engines in Codebase
1. **Headless Subprocess NDJSON Driver (`ClaudeProcessManager.mjs`)**:
   - Location: `apps/desktop/src/main/cli-pool/ClaudeProcessManager.mjs:9-15` & `92-150`
   - Spawns `/opt/homebrew/bin/claude` with flags:
     ```js
     const args = [
       '-p',
       '--input-format', 'stream-json',
       '--output-format', 'stream-json',
       '--verbose',
       '--include-partial-messages',
       '--dangerously-skip-permissions'
     ];
     ```
   - Sets execution environment `cwd: this.partnerDir` (`~/.multiagent-orchestration/partners/<id>`).
   - Uses `claude-code-parser` (`parseLine(line)`, `Translator`, `createMessage`) to parse NDJSON output events (`stream_event`, `tool_use`, `tool_result`, `result`, `system`).
   - Sends input to the child process via `child.stdin.write(JSON.stringify(createMessage.user(text)) + '\n')`.
   - Supports mid-flight interrupts via control frame:
     ```json
     { "type": "control_request", "request_id": "...", "request": { "subtype": "interrupt", "session_id": "...", "reason": "..." } }
     ```

2. **Programmatic Agent SDK Driver (`ClaudeAgentSdkDriver.mjs`)**:
   - Location: `apps/desktop/src/main/cli-pool/ClaudeAgentSdkDriver.mjs:13, 177-184`
   - Imports `query, createSdkMcpServer, tool` from `@anthropic-ai/claude-agent-sdk`.
   - Executes turns via `const stream = query({ prompt, options: queryOptions })` with `for await (const message of stream)`.
   - Supports in-memory `PreToolUse` and `PostToolUse` lifecycle hooks and in-process MCP servers.

3. **Synchronous Turn CLI Runner (`claude-subprocess.mjs`)**:
   - Location: `src/core/claude-subprocess.mjs:37-69`
   - Spawns `claude -p <prompt> --output-format json --dangerously-skip-permissions` with optional `--resume <uuid>`, `--session-id <uuid>`, `--system-prompt-file <path>`.
   - Closes `stdin` immediately, waits for process exit, parses JSON envelope `{ result: "...", session_id: "..." }`.

### 1.2 Partner Configuration & System Prompt Layering
- In `ClaudeProcessManager.mjs:48-90` and `ClaudeAgentSdkDriver.mjs:46-88`:
  - 1. Global Axioms: `~/.multiagent-orchestration/axioms/STANDING_ORDER.md`
  - 2. Harness Contract: `~/.multiagent-orchestration/axioms/00-harness-injection.md`
  - 3. Base Soul: `~/.multiagent-orchestration/axioms/01-partner-base-soul.md` (for specialist partners, `!manifest.is_lead`)
  - 4. Partner-specific `SOUL.md`: `~/.multiagent-orchestration/partners/<id>/SOUL.md`
  - 5. Active Memory Shard: First 200 lines / 25KB of `~/.multiagent-orchestration/partners/<id>/memories/MEMORY.md`
- In `packages/runtime-assets/builtin-partners/`:
  - Pre-existing partners with manifests and SOUL.md: `doc-skill-keeper`, `lead-orchestrator`, `cindy-r`, `rea-partner`, `agent-architect`, `claude-sdk-architect`.
- In `scripts/link-agents.mjs:68-133`:
  - Synchronizes partners into `~/.multiagent-orchestration/partners/<id>/` with real directories for `cwd`, `memories/`, `.claude/skills/`, and symlinks for `manifest.json`, `SOUL.md`, `CLAUDE.md`, and hooks.

### 1.3 Room Persistence & Message Structure (`BotGroupService.mjs`)
- Location: `src/session/bot-group-service.mjs:28-221`
  - `createGroup({ id, name, organizerBotId, memberBotIds })`: sets `currentSequence = 0`, registers members with `lastSeenSequence = 0`.
  - `sendMessage({ groupId, authorKind, authorBotId, authorName, content, mentions, clientId })`:
    - Enforces strictly monotonic `sequence`: `group.currentSequence += 1`.
    - Enforces idempotency via `clientId`.
    - Detects mention links `[Name](cindy://bot/<botId>)`.
    - Persists messages and groups to JSON files (`.sessions/bot_groups.json`, `.sessions/bot_group_messages.json`).
  - `getDeltaMessagesForPartner(groupId, botId, limit)`: retrieves unseen messages where `m.sequence > lastSeenSequence`.
- In `docs/dev-rules/bot-group-orchestration.md`:
  - Group messages must include monotonic `sequence >= 1`, unique `messageId`, timestamp, sender.
  - Deterministic turn prompt grammar: `Header`, `IdentityClause`, `MentionClause`, `DeltaClause` (in `<untrusted-json-block>`), `Instructions`.
  - Silent exit token: `NO_REPLY`.

### 1.4 Runtime & Package Environment
- Command outputs verified:
  - Node version: `v26.10.0`.
  - Node 26 natively executes TypeScript files directly (`node scripts/cli-room.ts` runs without tsx or loaders).
  - Claude Code CLI: `/opt/homebrew/bin/claude` version `2.1.309`.
  - Installed packages: `@anthropic-ai/claude-agent-sdk` (0.3.316), `claude-code-parser` (0.1.1).
  - Node built-in standard library includes `node:readline/promises` for REPL, `node:child_process` for spawning, and `node:util.styleText` for ANSI color rendering.

---

## 2. Logic Chain

1. **Direct Execution Engine Choice**:
   - Observation 1.1 shows two robust execution models: `ClaudeProcessManager` (streaming NDJSON with stdin events) and `claude-subprocess.mjs` (synchronous turn JSON envelope).
   - For an interactive CLI room (`scripts/cli-room.ts`), real-time streaming feedback is paramount when an agent runs tools or outputs text chunks.
   - `ClaudeProcessSession` is already tested and proven in the codebase to handle stdout NDJSON stream parsing (`stream_event`, `tool_use`, `result`) and watchdog stall warnings.
   - Therefore, `scripts/cli-room.ts` can use `ClaudeProcessSession` for streaming turn execution, with fallback or headless turns executed synchronously.

2. **Partner Auto-Readiness (7 Core Partners)**:
   - R2 requires 7 core partners:
     1. DocSkill 维护官 (`doc-skill-keeper`)
     2. Nexus · 多智能体统筹调度官 (`lead-orchestrator`)
     3. Cindy_R (`cindy-r`)
     4. REA 逆向分析伙伴 (`rea-partner`)
     5. 代码工程师 1 (`coder-core`)
     6. 代码工程师 2 (`coder-web`)
     7. 排错工程师 (`troubleshooter`)
   - Observation 1.2 shows that partners 1-4 already exist in `packages/runtime-assets/builtin-partners/` and `~/.multiagent-orchestration/partners/`.
   - Partners 5, 6, and 7 (`coder-core`, `coder-web`, `troubleshooter`) need to be automatically generated in `~/.multiagent-orchestration/partners/` upon initialization if not already present.
   - Reusing existing assets ensures zero manual duplication and preserves dual-plane symlink separation.

3. **Room Selection & Traceable Persistence**:
   - Observation 1.3 shows `BotGroupService` already provides full monotonic sequence tracking, client_id idempotency, and room serialization.
   - The preset room `multiagent-orchestration` (`grp_multiagent_orchestration`) can be pre-seeded or selected via a lightweight REPL prompt at startup.
   - Replaying history upon room entry is accomplished directly by reading all stored messages ordered by `sequence`.

4. **Mention Parsing & Deterministic Prompt Dispatch**:
   - When a user inputs `@doc-skill-keeper <task>` or `@DocSkill 维护官 <task>`, the REPL parses the `@mention`.
   - Per `docs/dev-rules/bot-group-orchestration.md`, the prompt passed to the partner's runner follows the deterministic turn prompt grammar:
     - Includes group name, partner identity, mention notification, and previous messages inside `<untrusted-json-block>`.
   - The target partner process runs in its sandbox (`cwd: ~/.multiagent-orchestration/partners/<botId>`), writes to stdout, streams text to the terminal, and records the reply message in `BotGroupService`.

5. **Headless Acceptance Testing Strategy**:
   - `scripts/cli-room.ts` can accept CLI arguments: `--headless`, `--room <name>`, `--send <message>`, and `--mock-run`.
   - This allows an automated test script (`tests/test-cli-room.mjs`) to run non-interactively, assert exit code 0, and verify:
     - All 7 partner folders and `SOUL.md` files exist.
     - `multiagent-orchestration` room creation and reload.
     - Monotonic sequence advancement (1, 2, ...).
     - Full history persistence and reload.

---

## 3. Caveats

1. **Claude CLI Execution Latency**:
   - Running real turns through `/opt/homebrew/bin/claude` makes network calls to Anthropic's model API, which can take 5-15 seconds per turn.
   - For rapid automated headless regression tests in CI, a `--mock-run` or mock agent subprocess driver should be provided alongside real CLI execution to prevent test timeouts.
2. **Path Dependency on Home Directory**:
   - `~/.multiagent-orchestration` is located in the user's home directory (`os.homedir()`). The initialization script must ensure the required directories exist (`mkdir -p`) before writing partner files.

---

## 4. Conclusion

The architecture for `scripts/cli-room.ts` is fully supported by the existing repository infrastructure with **zero new external dependencies**:
- **Execution Engine**: `ClaudeProcessSession` from `apps/desktop/src/main/cli-pool/ClaudeProcessManager.mjs` for streaming responses, coupled with layered prompt generation.
- **Partner Auto-Readiness**: Startup scanner that reuses existing Cindy partners (`doc-skill-keeper`, `lead-orchestrator`, `cindy-r`, `rea-partner`) and generates the 3 missing partner configs (`coder-core`, `coder-web`, `troubleshooter`) in `~/.multiagent-orchestration/partners/`.
- **REPL & Visualization**: Native `node:readline/promises` with `node:util.styleText` ANSI color formatting, offering room selection, chat replay, and clean prompt input.
- **Persistence & Retracing**: `BotGroupService` handling monotonic `sequence`, unique `messageId`, timestamp, and full room history reload.
- **Headless Test Strategy**: Deterministic CLI test harness (`tests/test-cli-room.mjs`) using `--headless` flags to verify the complete room lifecycle with exit code 0.

---

## 5. Verification Method

To verify these findings and components independently:

1. **Verify Node TypeScript Direct Execution**:
   ```bash
   node -e "const x: string = 'ok'; console.log(x)"
   ```
2. **Verify Claude CLI and Parser Modules**:
   ```bash
   /opt/homebrew/bin/claude --version
   node -e "import('./apps/desktop/src/main/cli-pool/ClaudeProcessManager.mjs').then(() => console.log('Manager OK'))"
   node -e "import('./src/session/bot-group-service.mjs').then(() => console.log('BotGroupService OK'))"
   ```
3. **Verify Existing Partners in Runtime Assets**:
   ```bash
   ls -la packages/runtime-assets/builtin-partners/
   ```
4. **Run Existing Room Logic Tests**:
   ```bash
   node tests/test-cindy-room-logic.mjs
   ```
