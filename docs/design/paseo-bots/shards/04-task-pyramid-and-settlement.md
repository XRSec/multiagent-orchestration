---
doc_id: PASEO-BOTS-SHARD-04-TASK-PYRAMID-SETTLEMENT
status: CURRENT
version: 1.1.0
last_verified: 2026-11-21
language: en-US
---

# Shard 04: Task Pyramid, File Leases & Idempotent Card Settlement

Parent index: [../INDEX.md](../INDEX.md). Formalizes the 3-layer visibility noise-reduction pyramid, `CompanionSessionManager` memory synchronization, the 17-tool `bots` MCP surface (`BOT_TOOLS`), cross-process `O_EXCL` file leases, monotonic `TaskRecord` settlement, idempotent `TaskCard` outbox projection, and `agent.archive.after` / restart reconciliation.

## 1. Three-Layer Visibility Pyramid

Isolate high-volume worker tool churn behind a host-enforced three-layer visibility pyramid (`paseo-bots/server/tasks.ts`, `paseo-bots/server/task-cards.ts`), ensuring raw worker transcripts never flood group orchestrator context windows:

| Pyramid Layer | Carrier & Persistence Coordinate | Visibility & Authority Invariant |
| :--- | :--- | :--- |
| **L1 — Group Overview** | Lead bot's active chat timeline (`cardAgentId`) | Receives solely host-composed `TaskCard` plugin items (`task-card:<taskId>:<version>` or `task-card:<taskId>:workflow`). Appending a card never triggers an LLM turn. |
| **L2 — Task Line** | `$PASEO_HOME/plugin-data/paseo-bots/tasks/<safeId>.json` (`TaskRecord`) | Host-owned state machine uniting mixed `"native"` and `"paseo-bot"` members under monotonic `version`, `budget.fanout`, and `settledAt`. Model prose claiming `"done"` settles nothing. |
| **L3 — Worker Execution** | Child bot chat (`handleId = agentId`) or intra-turn `invoke_subagent` | Encapsulates full tool-call streams, retries, and scratch inspections; surfaces only distilled `<worker_handoff>` summaries or terminal member states upward to L2. |

### Delegated Handoff, Reader Window & Companion Memory Sync (`handoffs.ts`, `companion-session.ts`)
- **Archived Chat Zero-Stale-Reply Guard**: `chatStateOf` (`paseo-bots/server/handoffs.ts`) evaluates `agent.archivedAt` prior to timeline text extraction so `check_chat` reports `"archived"` cleanly without returning stale pre-archive replies.
- **Follow-Up Steering Under Lease**: Sending a follow-up `ask_bot` to an existing `chatId` acquires that chat's file lease (`acquireLease(chatId)`), steers the live conversation (`sendBotMessage`), and returns a delivery verdict without spawning duplicate worker chats.
- **Companion Intent & Short-Turn `memoryPrefix` Retention**: `CompanionSessionManager` (`paseo-bots/server/companion-session.ts`, `globalAssistantOnly: true`) performs intent distillation and SHA-256 `MEMORY.md` synchronization on `LONG_SESSION_SYNC_METADATA`. Client dispatch in `Composer.tsx` and `BotLauncherCore.tsx` skips redundant intent gating on short/bypassed turns while unconditionally adopting non-empty server `res.outgoingText` so pre-pended `memoryPrefix` injections survive post-compaction short turns.

## 2. Built-In `bots` MCP Server Catalog (`BOT_TOOLS`)

Expose 17 host tools to local bot sessions via `TOOLS_MCP_NAME = "bots"` (`BOT_TOOLS` in `paseo-bots/server/tools/index.ts`), narrowing the surface via `toolsForEngine` when a chat binds to `"native"`:

| Tool Name | Source Module | Domain & Engine Visibility Rule |
| :--- | :--- | :--- |
| `list_bots` | `server/tools/bots.ts` | Lists active bots, roles, team memberships, and `contactBots` policies |
| `list_teams` | `server/tools/bots.ts` | Lists configured teams, lead bots, members, and team scopes for cross-team routing (`bot-chief`) |
| `ask_bot` | `server/tools/bots.ts` | Dispatches or steers a Route 2 `"paseo-bot"` chat under file lease; **hidden** when `engine === "native"` (`DISPATCH_ONLY_TOOLS`) |
| `check_chat` | `server/tools/bots.ts` | Reads status (`running`, `permission`, `archived`, `error`, `finished`) and latest reply of a delegated chat; **kept** on `"native"` |
| `search_chats` | `server/tools/chats.ts` | Searches historical bot chat transcripts across turns; **kept** on `"native"` |
| `open_task` | `server/tools/tasks.ts` | Opens or updates an L2 `TaskRecord` (`title`, `groupId`, `acceptance`, `budget.fanout`) |
| `list_tasks` | `server/tools/tasks.ts` | Queries on-disk `TaskRecord` lines ordered by `updatedAt` descending |
| `run_workflow` | `server/tools/workflows.ts` | Validates and launches a Route 3 declarative `WorkflowDefinition` DAG on a task line |
| `resume_workflow` | `server/tools/workflows.ts` | Re-opens and resumes a failed or blocked Route 3 workflow task (`resumeWorkflow`) |
| `get_setup` | `server/tools/setup.ts` | Inspects current bot, team, library skill, and MCP server setup |
| `propose_skill` | `server/tools/skills.ts` | Proposes creating or updating a library `SKILL.md` (requires user review to stamp `reviewedSha`) |
| `propose_routine` | `server/tools/routines.ts` | Proposes a scheduled or webhook `Routine` card for user confirmation |
| `list_routines` | `server/tools/routines.ts` | Lists configured routines and recent run states for the bot |
| `run_routine` | `server/tools/routines.ts` | Triggers an immediate out-of-band run of an existing routine |
| `cancel_routine_run` | `server/tools/routines.ts` | Cancels an active routine run chat |
| `propose_changes` | `server/tools/setup.ts` | Emits setup diff proposals (`paseo-bots/shared/changes.ts`; bypassed for admin CLI mutations per Shard 01) |
| `show_card` | `server/tools/interactions.ts` | Renders structured interactive `INTERACTION_CARD` forms or inline-editable drafts in chat (prefer native `ask_question` for simple confirmations) |

## 3. Cross-Process Atomic File Lease Protocol (`leases.ts`)

Serialize every delegated-chat append and `TaskRecord` mutation through SHA-256 lock files under `$PASEO_HOME/plugin-data/paseo-bots/leases/<sha256>.lock` (`paseo-bots/server/leases.ts`), preventing split-brain writes across daemon restarts or concurrent host workers.

```text
acquireLease(key)
  ├── 1. createExclusive(path, "wx", 0o600) -> readRecord(path)?.nonce === nonce ? LEASE : null
  └── 2. On EEXIST -> staleAt(path, ttlMs)
         ├── Live holder (expiresAt > now) -> return null
         └── Expired / unreadable > ttlMs  -> claimStale(path, stale, nonce)
                ├── rename(path -> <path>.<stale8>.<nonce8>.tombstone)
                ├── Verify moved.nonce === stale.nonce (if mismatch: restore(tombstone, path) & abort)
                └── createExclusive(path) -> confirm read-back nonce === nonce
```

- **Instance-Scoped Holder Identity**: `HOLDER = "<hostname>:<pid>:<instanceUuid>"` is generated per process boot so a restarted daemon never misidentifies a pre-crash lock as active ownership.
- **Bounded Lock Budgets**: Default chat lease TTL is `LEASE_TTL_MS = 120_000` (`RECORD_LIMIT = 4_096` bytes); `withTaskLock` in `tasks.ts` acquires `task:<taskId>` with `ttlMs: 10_000`, polling up to 40 attempts at 25 ms intervals.
- **Nonce-Checked Renewal & Release**:
  - `renewLease(lease, ttlMs)` verifies the on-disk `nonce` equals `lease.nonce` before `atomicWrite`.
  - `releaseLease(lease)` renames `path` to `<path>.<nonce8>.release` first, deleting the file only if `nonce === lease.nonce` and calling `restore` otherwise so a lock taken over after expiry is never unlinked by its former holder.

## 4. Monotonic `TaskRecord`, Slot Reservation & Idempotent Settlement (`tasks.ts`)

Store one JSON file per task (`RECORD_LIMIT = 256 KB`), guarding every read-modify-write under `withTaskLock("task:<taskId>")` and verifying write-back integrity (`stored.version === record.version`) in `writeRecord`.

| `MemberStatus` | Occupies `budget.fanout` (`ACTIVE_MEMBER_STATUSES`) | Lifecycle Semantics |
| :--- | :--- | :--- |
| `"issued"` | **Yes** | Slot reserved prior to or during chat spawn; work in progress |
| `"running"` | **Yes** | Worker turn actively executing |
| `"blocked_permission"` | **Yes** | Parked awaiting user tool/permission approval; retains concurrency slot |
| `"done"` | No | Worker turn finished cleanly; frees concurrency slot |
| `"failed"` | No | Worker turn terminated with `lastError` or handoff failure; frees slot |
| `"blocked_dead"` / `"dead"` | No | Worker archived mid-flight or vanished (legacy `"blocked"` normalizes to `"blocked_dead"` on read); frees slot |

- **Fact-Only Version Increments (`openTask`)**: Re-opening an existing `taskId` with identical `title`, `groupId`, `sourceChatId`, `acceptance`, `budget`, and `workflow` returns the existing record without incrementing `version`; `TaskRecord.sourceChatId` persists the originating conversation coordinate alongside `groupId`.
- **Atomic Fanout Gate (`reserveMemberSlot`, `rekeyMember`)**:
  - Rejects dispatches onto settled lines (`{ accepted: false, reason: "settled" }`).
  - Rejects new parallel members when active members other than `memberKey(member)` reach `budget.fanout` (`{ accepted: false, reason: "fanout", inFlight, cap }`), while always permitting follow-up refreshes to an existing `memberKey`.
  - `rekeyMember(taskId, from, to)` atomically migrates a pre-reserved slot onto the materialized `chatId`.
- **Single-Winner Terminal Settlement (`settleTask`, `evaluateTask`)**:
  - If `existing.settledAt` is already non-null, `settleTask` returns `{ settled: false, record: existing }` untouched so concurrent hooks never overwrite terminal verdicts.
  - `evaluateTask` settles workflow tasks once `workflow.status !== "running"`, and settles standard task lines only when `acceptance` is non-empty, `members.length > 0`, and zero members remain in `ACTIVE_MEMBER_STATUSES`.
- **Bounded Pruning (`pruneSettled`)**: Retains settled task JSON files for at least `PRUNE_SETTLED_MS = 604_800_000` (7 days, swept every `PRUNE_INTERVAL_MS = 6h` under `task:<taskId>` lease) so `TaskCard` projections remain self-contained.

## 5. Outbox Projection, `diedMidFlight` & Restart Recovery (`task-cards.ts`, `task-turns.ts`)

Decouple terminal fact commits from timeline rendering across `paseo-bots/server/task-cards.ts` and `paseo-bots/server/task-turns.ts` (`TaskCardSchema` in `paseo-bots/shared/task-card.ts`, `TASK_MEMBER_CARD` in `paseo-bots/shared/task-member.ts`). `taskCardOf` projects optional `groupId` (`record.groupId`) and `sourceChatId` (`source.sourceChatId ?? source.cardAgentId`) onto every card so UI surfaces navigate straight back to the owning team feed or launching chat:

- **Lead Card Routing (`groupAgentFor`)**: Routes team task cards to `leadId`'s newest unarchived chat (`latestChatOf`, falling back to `requesterAgentId`) and pins `cardAgentId` once via `setCardAgent` so subsequent flushes never split cards across chats.
- **Outbox Persistence & Dual Deduplication (`settleAndPublish`, `flushTaskCards`)**:
  1. Writes pending `TaskCard` payloads (`OUTBOX_LIMIT = 16 KB`) to `$PASEO_HOME/plugin-data/paseo-bots/task-cards/<encodedId>.json` (`queueTaskCard`).
  2. Suppresses replays first via `record.publishedCardIds` (`PUBLISHED_CARD_LIMIT = 8`) and second by scanning the tail 200 projected timeline items (`alreadyPublished`).
  3. Drains residual outbox files every `30_000` ms via `flushTaskCards`.
- **Turn Hook & Native Child Collapse (`recordTurn` on `agent.turn.after`)**: Updates `"paseo-bot"` member status from `chatStateOf(agent)` and extracts current-turn `invoke_subagent` calls (`nativeChildren`, inspecting `detail.input` when `detail.type === "unknown"`) to write `"native"` members directly as terminal `"done"` or `"failed"` in one atomic callback.
- **Closure vs Mid-Flight Death (`recordArchive` on `agent.archive.after`)**:
  - Benign closure (`diedMidFlight === false`): Chat archived after already reaching `"done"` or `"failed"` with no `agent.lastError`.
  - Mid-flight death (`diedMidFlight === true`): Chat archived while carrying `agent.lastError` or sitting in `"issued" | "running" | "blocked_permission"`. Writes `"blocked_dead"` to `TaskRecord` first, appends an idempotent `publishMemberReceipt` (`task-member:<taskId>:<handleId>`) to `requesterAgentId`, and calls `settleAndPublish`.
- **Startup Reconciliation (`recoverInterrupted`)**: Latches once per process on `host.onAttach` (`registerTaskTurns`). Queries `paseo.agents.ref(handleId).refresh()` for open members: skips live running turns and unarchived `blocked_permission` chats, marks missing/archived handles `"blocked_dead"`, `lastError` handles `"failed"`, and clean idle handles `"done"`, then calls `settleAndPublish`.

## 6. Conformance Matrix

| Requirement | Primary Anchor | Verification Command |
| :--- | :--- | :--- |
| `O_EXCL` lock & tombstone stale takeover | `paseo-bots/server/leases.ts`, `acquireLease`, `claimStale` | `npm --prefix paseo-bots test -- leases` |
| Fanout slot accounting & single-winner `settleTask` | `paseo-bots/server/tasks.ts`, `reserveMemberSlot`, `evaluateTask` | `npm --prefix paseo-bots test -- tasks` |
| Outbox queue & 200-entry + `publishedCardIds` dedupe | `paseo-bots/server/task-cards.ts`, `settleAndPublish`, `flushTaskCards` | `npm --prefix paseo-bots test -- task-cards` |
| `diedMidFlight` archive hook & `recoverInterrupted` | `paseo-bots/server/task-turns.ts`, `registerTaskTurns` | `npm --prefix paseo-bots test -- task-turns` |
