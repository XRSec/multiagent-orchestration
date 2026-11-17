# Task Manifest: Paseo Bots Architecture Upgrades

- **Status**: `DONE`
- **Follows**: `92744364-9fee-47a6-88b2-f3d78c8e8739`

## Completed: Scenario 1 — Paseo `claude` Provider Compatibility for `bot-moadmin`
- **Status**: `DONE`
- **Scope**: `paseo-bots/shared/bot.ts`, `paseo-bots-plugin-settings/bots.json`, `paseo-bots` test suite

## Goal
Enable `bot-moadmin` to run under Paseo `claude` provider while keeping `agy` as default (`1A`) and restricting Claude `baseTools` to `["Task", "TodoWrite", "Skill"]` with zero direct file/shell permissions (`2A` variant).

## Acceptance Criteria
- [x] AC-1: `resolveBotBaseTools` in `paseo-bots/shared/bot.ts` isolates `providerConfigs[].baseTools` per provider without cross-provider leakage.
- [x] AC-2: `bot-moadmin` in `paseo-bots-plugin-settings/bots.json` sets `claude` `baseTools` to `["Task", "TodoWrite", "Skill"]` and updates `soul` for dual `agy`/`claude` orchestration routing without requiring file read/write tools.
- [x] AC-3: `paseo-bots` tests (`sync-moadmin.test.ts` + new `resolveBotBaseTools` tests) pass via `MoCI`.

## Execution Log
- Stage 1 (`IN_PROGRESS`): Dispatched `bot-mocode` for implementation (`AC-1`, `AC-2`, unit tests); `bot-moci` queued for verification (`AC-3`).
- Stage 2 (`DONE`): `MoCI` issued `PASS` — `npm run typecheck` exit 0; `npm test` 28 files / 287 tests passed (`base-tools.test.ts` 7/7, `bot.test.ts` 29/29, `sync-moadmin.test.ts` 1/1).

---

## Completed: Parallel Architecture Upgrades (`DONE`)

### Task A — Unified Tool & Permission Mapping + Dual Agent Markdown Sync (Full Edition)
- **Status**: `DONE`
- **Goal**: Canonical capability & permission mode mapping in `paseo-bots/shared/bot-tools.ts` (`full_access` -> `full-access`/`bypassPermissions`), runtime resolution in `bot.ts`, dynamic mapping in `agy-agents.ts`, and new `claude-agents.ts` syncing `.claude/agents/<id>.md`.
- **Execution**: `MoCI` issued `PASS` — `npm run typecheck` exit 0; `npm test` 30 files / 297 tests passed, zero host `~/.claude` pollution.

### Task B — Team-Scoped Workspace (`cwd` / `mounts` on Team, Memory on Bot)
- **Status**: `DONE`
- **Goal**: Add `cwd` & `mounts` to `BotGroupSchema`/`TeamFileTeamSchema`, resolve session placement via `group.cwd -> bot.cwd -> ensureBotHome`, isolate `## Workspace` mounts per team, support `changes.ts`, and migrate repo workspace mount (`$PROJECT_ROOT`) from all 11 bots to `team-mwgv59i8dfdv` in `paseo-bots-plugin-settings/bots.json`.
- **Execution**: `MoCI` issued `PASS` — `npm run typecheck` exit 0; `npm test` 30 files / 297 tests passed, zero host `~/.claude` pollution.

---

## Completed: `paseo-agy-acp` Hardening (`DONE`)

### Task C — `paseo-agy-acp` P0/P1/P2 Hardening (T3 Code Parity)
- **Status**: `DONE`
- **Scope**: `paseo-agy-acp/`
- **Checklist**:
  - [x] P0 #1: Silent quota/API error detection (`stopReason: refusal` + SQLite `step_type = 17`) & `resetAt` parsing
  - [x] P0 #2: Hot-switch `full-access` without `agy acp` process restart
  - [x] P1 #3: Propagate `_meta["agy.security.warning"]` on `allow_always`
  - [x] P1 #4: Bounded tool payload truncation + pre-edit unified diff synthesis
  - [x] P2 #5: `interaction_*` question detection
  - [x] P2 #6: Per-process isolated `TMPDIR` & async Node `fs.promises.rm` cleanup
- **Execution**: `MoCI` issued `PASS` — `npm run verify` exit 0 (`format:check` PASS, `tsc --noEmit` PASS, `npm test` 404/404 passed, `npm pack --dry-run` PASS).
- **Correction (2026-11-17)**: The "T3 Code Parity" label above overstates parity. The six listed items do not cover turn termination detection or turn-level retry; real parity work is tracked in `## Completed: ACP Turn Termination Invariant (P0)` below.

---

## Completed: `paseo-agy-acp` `configOptions` Upgrade (`DONE`)

### Task D — `paseo-agy-acp` Pure `configOptions` Upgrade & `open()` Error Propagation
- **Status**: `DONE`
- **Scope**: `paseo-agy-acp/` (`mapping.ts`, `session.ts`, `provider.ts`)
- **Checklist**:
  - [x] Remove legacy `models` fallback (`mapping.ts`, `session.ts`, `provider.ts`) and standardize on `agy >= 1.5.3` `configOptions`.
  - [x] Emit `session.opened` only after `configureSession()` succeeds in `SessionManager.open()` so setup failures propagate directly instead of being masked as `Provider session ... closed`.
- **Execution**: `MoCI` issued `PASS` — `npm run verify` exit 0 (`format:check` PASS, `tsc --noEmit` PASS, `npm test` 405/405 passed, `npm pack --dry-run` PASS).

---

## Completed: Paseo Bots Chat Reload & Cache Invalidation (`DONE`)

### Task E — 助手页面对话增加“重新加载 / 刷新”选项及同步机制
- **Status**: `DONE`
- **Scope**: `paseo-bots/client/useChat.ts`, `paseo-bots/client/ChatPane.tsx`, `paseo-bots/client/BotsSurface.tsx`, `paseo-bots/client/i18n/`, `paseo-bots/tests/use-chat.test.ts`
- **Goal**: 解决助手页面对话与外部不同步、缺少手动重置刷新机制、非 running 状态下零轮询、侧边栏重复点击不重新挂载的问题。
- **Acceptance Criteria**:
  - [x] AC-1 [状态与数据层]: 在 `paseo-bots/client/useChat.ts` 中扩展 `ChatState`，增加 `reloading: boolean` 与 `reload(): Promise<void>`。`reload()` 主动刷新 agent 快照、重置 `endCursor`/`startCursor`/排队状态、通过 `handle.timeline.refetch` 重新拉取最新的 tail 消息流，并全量覆盖旧的 entries 缓存。
  - [x] AC-2 [UI 与交互层]: 在 `paseo-bots/client/ChatPane.tsx` 顶部栏 `Header`（在 `Search` 按钮左侧）增加重新加载按钮，图标使用 `RotateCw`，加载中时展示旋转动画/置灰，文案使用 i18n 词条。
  - [x] AC-3 [协同与级联更新]: 在 `paseo-bots/client/BotsSurface.tsx` 中将 `reload` 与侧边栏查询缓存失效（`queryClient.invalidateQueries`）联动，确保对话列表与对话内容一并同步；且若用户在侧边栏点击当前已选中的对话时，也触发静默 reload。
  - [x] AC-4 [多语言支持]: 在 `paseo-bots/client/i18n/zh-CN.ts` 与 `en.ts` 中补充 `reloadChat` 与 `reloadingChat` 词条。
  - [x] AC-5 [质量与测试]: 编写/补充针对 `useChat.reload()` 的单元测试，确保测试套件全部通过，`tsc --noEmit` 零类型报错。并在 `.t3/TASK_MANIFEST.md` 中记录本次任务与 AC 状态。
- **Execution**: `bot-mocode` implementation complete:
  - `npm run typecheck` passed (exit 0, zero TS errors).
  - `npm test` passed (33 files / 312 tests passed, including `tests/use-chat.test.ts` 5/5, `tests/i18n.test.ts` 8/8).
  - `bun test tests/use-chat.test.ts` passed (5/5 tests passed).

---

## Completed: Team Bot 专属的无感自愈模型回退机制 (Cindy 模式) (`DONE`)

### Task F — Team Bot 专属无感自愈模型降级重试与静默接续机制
- **Status**: `DONE`
- **Scope**: `paseo-bots/shared/bot.ts`, `paseo-bots/shared/chat.ts`, `paseo-bots/server/chats.ts`, `paseo-bots/client/chat/Composer.tsx`, `paseo-bots/tests/fallback-models.test.ts`
- **Goal**: 在多智能体工作流（Workflow Pipeline）中，为 Team Bot 补齐运行时的真正自愈降级重试机制（参考 Cindy 模式），当首轮遭遇可恢复错误时压制异常并自动切换至同 Provider 备用模型重试，实现无感自愈。
- **Acceptance Criteria**:
  - [x] AC-1（范围守卫 Scope Guard）: 自动回退机制仅针对 Team Bot（`bots.json` 中定义且配置了 `fallbackModels` 的 Bot），绝不影响普通无 Bot 的普通会话。
  - [x] AC-2（配置结构与解析修复）: 修复 `paseo-bots/shared/bot.ts` 中的 `botProviderConfigs` 函数，确保 `fallbackModels` 解析时支持 `providerConfigs?.[0]?.fallbackModels ?? bot.fallbackModels ?? []`；并在 `buildAgentConfig` 及调用方中正确传递暴露 `fallbackModels`。
  - [x] AC-3（可恢复错误拦截与同 Provider 切换）: 针对 Team Bot 识别可恢复错误（`Unknown model ID`, `429`, `500/502/503/529`, `streamGenerateContent failed`, Quota 耗尽等），保持同 Provider 范围内回退，严禁跨 Provider 切换。
  - [x] AC-4（会话与 Workflow 静默自愈 Auto-Resume）: 会话创建（`startBotChat`）以及已有会话后续消息发送（`send` / `deliver` / turn 执行层）中，首轮遇可恢复错误时压制报错、自动切至下一个 `fallbackModel` 重新投递；全部耗尽抛出结构化失败（`ModelFallbackExhaustedError` with `outcome: "exhausted"`）。
  - [x] AC-5（单元测试与回归验证）: 在 `paseo-bots` 测试套件中编写针对 Team Bot 降级自愈的单元测试用例，覆盖配置解析、自动降级重试成功、普通会话不受影响，且确保现有测试套件全部通过（`npm test` / `bun test` 34 files / 332 tests passed）。
- **Execution Log**:
  - Stage 1 (`DONE`): Implemented Scope Guard (`isTeamBotEligibleForFallback`), config parsing fix in `botProviderConfigs` & `buildAgentConfig`, recoverable error recognition (`Unknown model ID`, `streamGenerateContent`, `529`, etc.), silent auto-resume in `startBotChat`, `sendBotMessage`, and `runWithModelFallback`, wired into `Composer.deliver`.
  - Stage 2 (`DONE`): Extended `tests/fallback-models.test.ts` with 12 new comprehensive unit tests covering all ACs (total 27/27 tests). `npm run typecheck` passed (exit 0), `bun test tests/fallback-models.test.ts` passed (27/27), full `npm test` suite passed (34 files / 332 tests passed).

---

## Completed: 彻底解决“伙伴/助手与外部对话不同步、慢半拍”问题 (`DONE`)

### Task G — Antigravity 与 Paseo 伙伴跨进程对话实时同步、运行态放行与零延迟流式优化
- **Status**: `DONE`
- **Scope**: `paseo-agy-acp/server/session.ts`, `paseo-agy-acp/server/brain.ts`, `paseo-agy-acp/server/brain-io.ts`, `paseo-bots/client/useChat.ts`
- **Goal**: 彻底根治外部对话在 Paseo 内静默丢失、子任务结算期间运行中卡片与助理流水线文本被硬编码过滤、重新加载未击穿至磁盘、以及前端流式调度 80ms 防抖 RPC 反查导致慢半拍的问题。
- **Acceptance Criteria**:
  - [x] AC-1 [paseo-agy-acp 外部会话常驻监听与同步]: 在 `paseo-agy-acp/server/session.ts` 中实现 `startIdleWatcher()` 与 `syncExternalTranscript()`，在会话进入 ready 态后建立 800ms 周期性巡检与 `logs/` 目录 `fs.watch` 双轨机制。检测到底层 `transcript_full.jsonl` 文件 `mtime` 或 `size` 变化时，自动增量重放新 turn 并通过 `emitItem` 推送到 Paseo Daemon Timeline，实现外部原生对话自动对齐。
  - [x] AC-2 [paseo-agy-acp 运行中卡片与助理文本实时放行]: 在 `paseo-agy-acp/server/brain.ts:756` 中放行 `item.detail.type === 'sub_agent'` 的运行态工具调用卡片，消除子任务执行期间前端长达数分钟的空白等待。
  - [x] AC-3 [击穿重载与强制磁盘对齐]: 在 `paseo-agy-acp/server/session.ts` 中扩展 `session.can_stop_runtime` 与 `session.refresh`/`session.sync` 操作，在重新加载或状态轮询时执行非阻塞磁盘转录增量对齐；引入 `emittedItemStatuses` 区分终端与运行态，防止历史 ACP 快照被回退。
  - [x] AC-4 [paseo-bots 消除慢半拍流式延迟]: 优化 `paseo-bots/client/useChat.ts`，将 `"after"` 流式防抖调度延迟从 `80ms` 缩减至 `16ms`（60fps 帧预算），`"tail"` 调度延迟归零即时触发；`timelineSub` 增强兼容 `replacement` 及 `agent.timeline.replacement` 事件；运行时轮询从 2500ms 缩减至 1200ms，重载重试步长从 20ms 降至 10ms，消除视觉卡顿与延迟。
  - [x] AC-5 [测试与门禁验证]: `paseo-agy-acp` 405 个测试全部通过（405 pass, 0 fail，`npm run check` 零报错）；`paseo-bots` 34 个测试文件 / 332 个测试全部通过（332 pass, 0 fail，`npm run typecheck` 零报错）。
- **Execution Log**:
  - Stage 1 (`DONE`): Exported `resolveTranscriptPath` in `brain-io.ts`. Added idle watcher + FS watcher in `session.ts` with signature and terminal status tracking (`emittedItemStatuses`) to prevent duplicates and preserve ACP snapshots. Added RPC alignment in `SessionManager.handle`.
  - Stage 2 (`DONE`): Allowed running subagent tool call cards in `brain.ts`.
  - Stage 3 (`DONE`): Refactored `useChat.ts` stream scheduling debounce (80ms -> 16ms, tail -> 0ms) and timeline subscription event resolution.
  - Stage 4 (`DONE`): Passed all 405 tests in `paseo-agy-acp` (`npm run check` + `npm test`), and all 332 tests in `paseo-bots` (`npm test` + `npm run typecheck`).

---

## Completed: 输入框胶囊悬浮发射台与助手页面 6500+ 行代码大瘦身 (`DONE`)

### Task H — 落地输入框胶囊悬浮发射台（BotLauncherPopover）与助手页面 6500+ 行代码大瘦身
- **Status**: `DONE`
- **Scope**: `paseo-bots/client/launcher/BotLauncherPopover.tsx`, `paseo-bots/index.client.tsx`, `paseo-bots/client/BotsSurface.tsx`, `paseo-bots/client/navigation.ts`, `paseo-bots/client/chat/` (safe delete), `paseo-bots/client/timeline/`, `paseo-bots/client/panel/DiffViewer.tsx`
- **Goal**: 遵循“方案 1：胶囊升起悬浮窗（Popover Mini-Launcher）”，在 Paseo 原生输入框注入常驻胶囊入口，升起轻量悬浮发射台；携带 initialPrompt 创建会话并直跳 Paseo 原生会话页，做到零中间跳变；彻底移除 `client/chat/` 约 6500+ 行自绘聊天代码，使 `BotsSurface` 回归纯净的 Bot 配置与团队管理面板。
- **Acceptance Criteria**:
  - [x] AC-1 [悬浮发射台组件]: 新建 `paseo-bots/client/launcher/BotLauncherPopover.tsx`，符合 Paseo Popover 契约，支持 `selectedBotId`、`chatMode`（私聊/团队）、`targetDir`（当前工作区/Bot沙箱）、`promptText` 多行输入、快捷键（Enter 提交 / Shift+Enter 换行 / Esc 关闭）、防重提交与 loading 态，并在创建后通过 `navigation.openAgent` 直跳原生会话。
  - [x] AC-2 [胶囊入口注入]: 在 `paseo-bots/index.client.tsx` 动态注册 `client.addComposerPill`（`🤖 伙伴` / `🤖 发起伙伴对话`）与 `client.addHeaderButton`（工作区全局兜底），挂载 `BotLauncherPopover`。
  - [x] AC-3 [BotsSurface 瘦身与会话直跳]: 重构 `BotsSurface.tsx` 会话点击事件，点击列表项直调 `navigation.openAgent`；右侧主区域常态化展示 `BotPanel` 或 `TeamMap`，彻底移除自绘 `SelectedChat` 与 `ChatPane`。
  - [x] AC-4 [彻底安全删除自绘聊天代码]: 迁移 Paseo 原生 Timeline Renderers（`ProposalCard`, `NativeConnectCard`, `RoutineRunCard` 等）至 `client/timeline/`，使用 Node `fs.rmSync` 安全删除 `client/chat/` 全套代码及 `ChatPane.tsx` / `AttachmentPill.tsx` / `sent-attachments.ts`，共削减 7300+ 行冗余自绘代码。
  - [x] AC-5 [质量与编译测试]: `npm run typecheck`（`tsc --noEmit`）零报错，Vitest 测试套件全部通过（31 files / 273 tests pass）。
- **Execution Log**:
  - Stage 1 (`DONE`): Initialized Task H manifest, schema analysis and architecture design complete. Dispatched `bot-mocode` for step-by-step implementation.
  - Stage 2 (`DONE`): `bot-mocode` implementation and cleanup complete:
    - Implemented `paseo-bots/client/launcher/BotLauncherPopover.tsx` with full support for bot/team selection, directory target toggle, prompt typing, Enter/Esc hotkeys, and direct `navigation.openAgent` glide.
    - Updated `paseo-bots/client/i18n/` with `launcher` translations and pill label `🤖 伙伴` (`🤖 Bots`).
    - Wired `client.addComposerPill` and `client.addHeaderButton` in `paseo-bots/index.client.tsx`.
    - Streamlined `paseo-bots/client/BotsSurface.tsx`: sidebar clicks directly invoke `navigation.openAgent`, main area permanently hosts `BotPanel` / `TeamMap` / `DataAnalysisPane`.
    - Implemented `DiffViewer.tsx` in `client/panel/` to cleanly decouple memory journal diff inspection from deleted custom stream components.
    - Preserved `shared/tools` tests in `tests/tools.test.ts`.
    - Safely deleted `client/chat/`, `ChatPane.tsx`, `AttachmentPill.tsx`, `sent-attachments.ts`, `tests/composer.test.ts`, and `tests/stream.test.ts` via Node `fs.rmSync` (safe delete invariant).
    - Verification: `npm run typecheck` returned 0 errors; `npm test` passed 31/31 test files (273/273 tests). `paseo-agy-acp` passed all 405 tests. Net diff: -7333 lines.

---

## Completed: 移动端发射台攻坚：对齐原生“选择模型”高规格 + 纯手势横滑 + 清理主机页面“+”按钮 (`DONE`)

### Task I — 移动端发射台体验攻坚与宿主入口净化
- **Status**: `DONE`
- **Scope**: `paseo-bots/client/launcher/BotLauncherPopover.tsx`, `paseo-bots/client/launcher/useVisualViewport.ts`, `paseo-bots/client/launcher/ScrollablePills.tsx`, `paseo-bots/client/launcher/BotLauncherStyles.ts`, `paseo-bots/index.client.tsx`, `paseo-bots/tests/launcher.test.ts`
- **Goal**: 响应用户核心反馈，彻底攻坚移动端输入法遮挡与操作体验：1）弹窗对齐 Paseo 原生“选择模型”全高规格（`height: 88vh`, `minHeight: 75vh`），结合 `visualViewport` 视口联动在软键盘唤起时动态顶起输入区；2）彻底移除滚动条翻页箭头，实现原生物理手指惯性横滑；3）彻底清理工作区 HeaderButton，消除主机页面混淆的“+”按钮。
- **Acceptance Criteria**:
  - [x] AC-1 [对齐选择模型高规格与键盘动态顶起]: 新增 `useVisualViewport.ts` 监听视口尺寸变化，移动端容器高度设定为 `height: "88vh"`, `minHeight: "75vh"`, `maxHeight: "92vh"`；在软键盘弹起时动态注入 `paddingBottom: keyboardHeight` 并自动滚动输入框至可视区上方，彻底杜绝软键盘遮挡输入框。
  - [x] AC-2 [纯原生物理手势横向滑动]: 重构 `ScrollablePills.tsx`，彻底删除 `ChevronLeft` / `ChevronRight` 翻页箭头与自动点击代码；注入 `touch-action: pan-x`, `-webkit-overflow-scrolling: touch`, `scrollbar-width: none`，并在 `BotLauncherStyles.ts` 中设定伙伴胶囊 `flexShrink: 0`，实现如丝般顺滑的手指原生物理横滑。
  - [x] AC-3 [彻底清理主机页面多余“+”按钮]: 在 `index.client.tsx` 中彻底移除 `client.addHeaderButton` 注册与工作区轮询逻辑，保留纯净唯一的输入框胶囊 `client.addComposerPill`，消除主机工作区页面的混淆按钮。
  - [x] AC-4 [编译与测试门禁]: `npm run typecheck` 零报错；`paseo-bots` 全量测试通过（33 files / 283 tests pass）；`paseo-agy-acp` 全量测试通过（405 tests pass）。
- **Execution Log**:
  - Implemented `useVisualViewport.ts` with SSR-safe `window.visualViewport` tracking for keyboard height offset calculation.
  - Refactored `BotLauncherPopover.tsx` container layout for compact/mobile viewports: high-spec `88vh` / `75vh` vertical bounds, automatic ScrollView repositioning on input focus, and responsive mobile header with close button.
  - Redesigned `ScrollablePills.tsx`: removed all floating arrow buttons and state, configured native touch momentum and non-shrinking pills.
  - Cleaned `index.client.tsx`: wiped out `registeredHeaderButtons` and `client.addHeaderButton` calls, keeping only the composer pill.
  - Added unit test in `tests/launcher.test.ts` verifying visual viewport keyboard height offset calculation.
  - Verification: `npm run typecheck` passed (0 errors); `paseo-bots` passed 33/33 test files (283/283 tests); `paseo-agy-acp` passed all 405 tests.

---

## Completed: ACP Turn Termination Invariant (P0)

- **Status**: `DONE`
- **Scope**: `paseo-agy-acp/server/` (`session.ts`, `mapping.ts`, `brain.ts`, `brain-observer.ts`), `paseo-agy-acp/tests/`
- **Operator symptom**: 任务已经停了，但是显示还在运行中，并且好像没有重试机制 — a turn is dead but surfaced as running, indefinitely.

### Invariant

A turn MUST NOT be surfaced as `running` or `completed` without positive terminal evidence; absent positive terminal evidence the turn is `failed`. Positive evidence is one of: an ACP `session/prompt` response carrying a terminal `stopReason`, a provider transcript terminal row, or a transport exit/EOF event. Silence is not evidence.

### Acceptance Criteria

- **AC-1 — Bounded prompt + turn activity watchdog.** The `session/prompt` await at `paseo-agy-acp/server/session.ts:2410` must be guaranteed to settle. A silent turn terminates as `failed` within the turn-liveness deadline. Waiting on the user (pending permission, running child) suspends the deadline rather than tripping it, and never resets progress forever. Requires `turnStartedAt`/`turnLastActivityAt` in the turn record at `session.ts:488-537`, refreshed from `sessionUpdate` (`session.ts:1140-1141`), observation `onItem`/`onUsage` (`session.ts:2390-2405`), and `BrainTurnObservation.revision` (`brain-observer.ts:87-95`); the `state.turn` early-return at `session.ts:709` must not blind the watchdog; `isWaitingOnUser` (`session.ts:2481-2482`) and the `lastActivity` reset at `brain.ts:994` must be bounded. Verifiable by assertion: with `session/prompt` held open and zero transcript rows, a `session.turn{state:'failed'}` is emitted within the deadline; with a pending permission, no failure fires, and on permission resolution the deadline resumes from the suspension point.
- **AC-2 — Structural terminal on exit.** `onExit` at `paseo-agy-acp/server/session.ts:1249` must terminalize the active turn directly through the single `finishTurnOnce` funnel (`session.ts:638-660`, idempotent via `turnFinished` at `session.ts:643`), single-shot, not by relying on the pending `session/prompt` promise rejecting. Verifiable by assertion: simulating provider exit mid-turn emits exactly one terminal `session.turn` and leaves `state.turn` cleared; a second exit path cannot double-emit.
- **AC-3 — In-flight turn journal + reconciliation.** A turn must be journaled as `running` (`{turnId, clientMessageId, nativeId, startedAt, status:'running'}`) before `session/prompt` dispatch and cleared on `finishTurnOnce`; the journal extends the currently persisted `{sessionId}` record at `session.ts:281`. Any orphaned `running` row found at session open must be reconciled to `failed` so a restart never resurrects a running ghost. Verifiable by assertion: a process killed mid-turn followed by session open yields a `failed` terminal for the orphaned turn and no `running` entry survives.
- **AC-4 — No-terminal-evidence = failed.** Three fabricated-success sites must surface failure instead of synthesizing success: missing `stopReason` defaulting to `completed` at `paseo-agy-acp/server/session.ts:2425-2426`; a running tool forced to `completed` with `error: null` in `terminalize` (`server/mapping.ts:772-801`, no-result branch at `:798`); and a silent SQLite quota error discarded when the inbox is settled at `server/brain.ts:978` (gate `brain.ts:974-980`). Verifiable by assertion: each site, exercised with absent evidence, produces `failed` (or an explicit non-success terminal), never `completed`.

### Execution Log

- **R1 — gate `FAIL`.** Two defects closed. `server/brain.ts` `finishTurn` omitted `runningFails`, so `timeline.terminalize` synthesized fabricated success (`completed`, `error: null`) for tools still running on the subagent path; the flag now forces `failed` with `"Tool did not report a result before the turn ended"`. Separately, the user-wait branch renewed the turn deadline forever (`server/session.ts:2367-2369`); the wait now suspends with no renewal and restarts the deadline only on wake.
- **R2 — repair.** Canonical `isCompletePlannerResponse` (`server/brain-io.ts`) replaces the ad-hoc "prompt finished" predicate at the parent and child settlement sites. The heartbeat callback is split: progress kinds refresh `turnLastProgressAt`; liveness-only kinds render but never refresh the deadline.
- **R3 — gate `PASS`.** PASS-class verification of the fail-closed default (unknown `sessionUpdate` member treated as liveness-only), the journal write throwing before `session/prompt` dispatch, the cancel path, and `transport.fail()` unreachability from the new watchdog.

### Target Coordinates Index

| Path:line | Role |
|---|---|
| `paseo-agy-acp/server/session.ts:2410-2415` | Unbounded `waitPrompt` await — AC-1 insertion point |
| `paseo-agy-acp/server/session.ts:488-537` | Turn state schema — add liveness timestamps |
| `paseo-agy-acp/server/session.ts:638-660` | `finishTurnOnce` single terminal funnel (idempotency latch `:643`) |
| `paseo-agy-acp/server/session.ts:709` | Idle watcher early-return while a turn is set — watchdog path must bypass |
| `paseo-agy-acp/server/session.ts:1249-1262` | `onExit` — AC-2 direct terminalization |
| `paseo-agy-acp/server/session.ts:2125-2136` | Turn ownership setters (`state.turn`, `turnFinished`) |
| `paseo-agy-acp/server/session.ts:281` | Persisted `{sessionId}` record — extend to turn journal (AC-3) |
| `paseo-agy-acp/server/session.ts:2183` | `recordSessionClientMessage` — journal ordinal/minStep |
| `paseo-agy-acp/server/session.ts:2390-2405` | Observation `onItem`/`onUsage` heartbeat sources |
| `paseo-agy-acp/server/session.ts:2425-2426` | Missing `stopReason` defaulting to `completed` — AC-4 |
| `paseo-agy-acp/server/session.ts:2481-2482` | `isWaitingOnUser` — bound the deadline, do not reset |
| `paseo-agy-acp/server/mapping.ts:772-801` | `terminalize` — forced-completed with `error: null` at `:798` — AC-4 |
| `paseo-agy-acp/server/brain.ts:974-980` | Silent SQLite quota error gate — `isSettled` discard at `:978` — AC-4 |
| `paseo-agy-acp/server/brain.ts:991-1003` | Parent stall clocks; `tracking` forces — reachable only post-RPC |
| `paseo-agy-acp/server/brain-observer.ts:87-95` | `BrainTurnObservation.revision` heartbeat |
| `paseo-agy-acp/server/brain-observer.ts:165-171` | Turn observation poller (200ms) |
| `paseo-agy-acp/server/error-inspection.ts:249-308` | SQLite error inspection — read-only reference |
| `paseo-agy-acp/server/error-inspection.ts:314-331` | `buildTurnError` refusal mapping — read-only reference |
| `paseo-agy-acp/tests/turn-terminal-invariant.test.ts` | New — AC-1 / AC-2 / AC-3 (journal + reconciliation) / AC-4 assertions |
| `paseo-agy-acp/tests/two-clock-tool-budget.test.ts` | P1 — two-clock budget, notice, and per-tool attribution assertions |

### Milestones

- **M1 — Manifest** (this section, `modoc`): `DONE`.
- **M2 — Implementation** (`mocode`): `DONE` — AC-1 through AC-4; bounded prompt watchdog, structural exit terminal, turn journal, no-evidence failure.
- **M3 — Verification gate** (`moci`): `DONE` — `npm run verify` exit 0; 456 tests; serial 3-run determinism evidence (three consecutive full serial runs with identical pass counts).
- **M4 — Docs sync** (`modoc`): `DONE` — `paseo-agy-acp/docs/reference.md` reconciled to the shipped behavior: two-clock turn/tool budget with `toolNoticeMs` heartbeat, user-wait suspension and uncapped approval wait, progress classification, fail-closed `stopReason` and running-tool terminals, runtime-exit single terminal, and turn-journal reconciliation on open.

### Evidence

- `docs/research/agy-acp-stale-run-audit.md` — coordinate-level defect audit (stuck-state matrix, insertion points P1-P9, verdict).
- `docs/research/t3-code-lifecycle.md` — parity reference (stream-end-without-terminal failure, startup/shutdown reconciliation sweep).
- `docs/research/acp-peer-survey.md` — peer survey (protocol has no inactivity timer; run-owner drop guard; resume decoupled from turns).

### Open Decisions

1. `bot-prism` — OPEN, unresolved; operator has not answered. The working-tree `paseo-bots-plugin-settings/bots.json` contains a 14th bot with a non-null `cwd`, which fails `paseo-bots/tests/souls.test.ts:231` (expects `13` bots) and `paseo-bots/tests/team-workspace.test.ts:143` (`expect(bot.cwd).toBeNull()`). Intent unresolved: deliberate addition (tests must be updated) vs runtime-state pollution (config should be reverted).
2. **Deferred** — Uncommitted analytics/launcher-engine work remains staged out of history pending baseline resolution.

---

## Completed: ACP Two-Clock Tool Budget & Visible Progress (P1)

- **Status**: `DONE`
- **Scope**: `paseo-agy-acp/server/` (`session.ts`, `mapping.ts`, `brain.ts`, `turn-journal.ts`), `paseo-agy-acp/tests/`

### Two-Clock Model

A turn is bounded by two clocks. The turn-silence clock (`turnStallTimeoutMs`, default 120s) accrues only while no tool is running and no user or child wait is active. The tool clock (`toolStallTimeoutMs`, default 600s) accrues from the oldest running tool for as long as it runs. While a tool runs the turn clock is frozen, not extended; after the last tool settles the turn clock restarts at a full deadline. Expiry of either clock is a terminal `failed`.

### Visible Progress

`toolNoticeMs` (default 60s) emits a repeating `timeline.item` / `notification` while the tool clock is active. The notice is UI heartbeat only: it must never refresh progress, a tool result, or either deadline.

### Per-Tool Timeout Attribution

The tool whose clock expired carries its own name and elapsed time in its `failed` error. Every other still-running tool carries `"Turn ended while this tool was still running"`.

### Progress Classification

A `sessionUpdate` member counts as progress only if its payload cannot be empty of work. Optional or metadata-only payloads (`usage_update`, `session_message`, `subagent_update`, notices, config/mode/session-info updates, and any unknown future member) render but never refresh the deadline; classification is fail-closed for unknown members.

### Operator Rationale

Thresholds favor fast failure over long silence; visibility replaces a longer deadline. Operator, verbatim (zh-CN): "这个时间不应该太久，否则体感比较差".

### Target Coordinates Index

| Path | Role |
|---|---|
| `paseo-agy-acp/server/session.ts` | Watchdog tick, `turnToolFailure`, option defaults (`turnStallTimeoutMs`, `toolStallTimeoutMs`, `toolNoticeMs`) |
| `paseo-agy-acp/server/mapping.ts` | `runningTools`, `startedAt` preservation, `runningErrorFor` resolution |
| `paseo-agy-acp/server/brain.ts` | `finishTurn` |
| `paseo-agy-acp/server/turn-journal.ts` | Turn journal (`beginTurnJournal` / `finishTurnJournal` / `reconcileRunningTurns`) |
| `paseo-agy-acp/tests/two-clock-tool-budget.test.ts` | Two-clock budget, notice, per-tool attribution |
| `paseo-agy-acp/tests/turn-terminal-invariant.test.ts` | Turn terminal invariant, journal, progress classification |

### Known Residual Risks

1. `tests/transport.test.ts:59` process-group shutdown flake — pre-existing; `server/transport.ts` is not in the P0/P1 diff; green in 3/3 serial full runs.
2. `session_message` excluded from progress (content optional) — if agy ever delivers genuine work only as a complete `session_message`, a false stall is possible. Reachability: UNKNOWN.
3. Host rendering of the `notification` timeline item is not verifiable in this repo — the union contract matches exactly (`provider.d.ts`), the renderer is external.
4. User-wait suspension has no cap — by design; a human may take hours to answer.

---

## Completed: ACP Open-Time Model Availability Fallback

- **Status**: `DONE`
- **Scope**: `paseo-agy-acp/` (`server/session.ts`, `tests/mock-acp.ts`, `tests/open-config-fallback.test.ts`)

### Operator Symptom

A Paseo native conversation for `bot-prism` became unusable. `open()` failed with `_RequestError: Unknown model ID: gemini-4-hydrogen` roughly every 3-4 seconds from 2026-11-17T04:20 to 04:31 (~200 occurrences). A session that cannot open cannot be messaged and cannot switch models: the switch itself requires an open session. Model availability is account-scoped — the same id can exist on one account and be absent on another — so an id persisted from a different account or catalog generation is not evidence of operator error.

### Invariant

A stored or restored model that the active account does not serve must never prevent a session from opening; only an explicit operator choice may fail.

### Non-Goal Trap

Authentication, quota/capacity and request-validation failures must surface, never be silently converted into a model substitution. Converting them would mask credential or entitlement problems behind an apparently healthy session.

### Application Sites

- **Open** — `configureSession` (`paseo-agy-acp/server/session.ts`, open path): an unavailable stored model falls back to an available model so the session opens.
- **Reload / fork** — `reloadSessionSilently`: the same fallback applies to the restored model.
- **Explicit switch** — `session.configure` stays strict: an operator-chosen unavailable model fails, with no fallback.

### Effective Model and Notice

The applied model is written back to the session's effective config, so reload and revert build their metadata from the already-effective value and never re-apply the dead id from cache. A visible `timeline.item` / `notification` names both the unavailable stored model and the model in effect. The notice is buffered while the session is not yet opened and flushed once after `session.opened`; it is emitted as a timeline notification, never as a turn or tool event, and is not re-emitted on reload.

### Availability Predicate

Denylist-first, then anchored availability phrase. The denylist (`api key`, `unauthorized`, `forbidden`, `permission`, `credential`, `oauth`, `sign in`, `sign-in`, `billing`, `quota`, `capacity`, `rate limit`, `429`, `resource_exhausted`, `overloaded`, `exhausted`, `invalid request`, `bad request`, `too long`, `temporarily`) rejects before any phrase match, so credential, quota, capacity and request-validation errors surface. Only then may a model/thinking availability phrase (unknown/unrecognized/unsupported/not found/not supported/does not exist/no longer available) select the fallback.

### Gate Summary

- **Round 1 — FAIL.** The predicate was over-broad: it matched `invalid`/`unavailable` alongside a model term, swallowing authentication (`Invalid API key for model ...`), quota/capacity (`model temporarily unavailable`) and request-validation (`invalid request: model parameters`) errors into a silent substitution.
- **Round 2 — PASS.** Denylist-first predicate with anchored availability phrases; 20 probe strings classified correctly — availability positives accepted, auth/quota/request/timeout/abort strings rejected. Negative controls assert the original error text, zero `session.opened` events and zero notification items.
- **Gate**: `npm run verify` exit 0; test count 466 passing.

### Target Coordinates Index

| Path | Role |
|---|---|
| `paseo-agy-acp/server/session.ts` | Availability predicate, `configureSession` open fallback, `reloadSessionSilently`, effective-model write-back, buffered notice |
| `paseo-agy-acp/tests/mock-acp.ts` | Mock surface for open/reload fallback and rejection assertions |
| `paseo-agy-acp/tests/open-config-fallback.test.ts` | Fallback, notice, write-back and negative-control assertions |

### Residual Risks

1. `temporarily` in the denylist blocks `model temporarily removed` — transient removal surfaces rather than silently substituting; accepted.
2. Plain `invalid model id` deliberately does not match an availability phrase — bare `invalid` was the Round 1 false-positive vector; not a genuine account-scoped removal message.
3. Stale model-catalog reporting (`next.models ?? prevModels`) is a separate, still-open work item.

### Open Decisions

1. `bot-prism` — OPEN, unresolved; the operator has not decided. The fallback makes the conversation openable; whether the stored `gemini-4-hydrogen` reference is corrected, removed, or left to fall back per open remains the operator's call.
