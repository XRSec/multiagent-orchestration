import { BrainTurnObservation } from './brain-observer.ts'
import type { AgyUsageSource } from './usage.ts'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import {
  PROTOCOL_VERSION,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type SessionUpdate,
  type ToolCall,
  type NewSessionResponse,
  type ContentBlock,
  type McpServer,
  type Usage,
} from '@agentclientprotocol/sdk'
import type {
  ProviderError,
  ProviderLaunch,
  ProviderEvent,
  ProviderInput,
  ProviderConfigChanges,
  ProviderSessionConfig,
  ProviderTimelineItem,
  ProviderUsage,
} from '@getpaseo/plugin/server/provider'
import {
  RequestPermissionRequestSchema,
  extractSecurityWarningPromptInfo,
  isPreapprovedMcpTool,
  mapPermissionActions,
  permissionKind,
  pickPermissionOption,
} from './permissions.ts'
import {
  buildTurnError,
  getFileIdentity,
  inspectConversationError,
  readLastStepIndexFromDb,
  sameFile,
  type UpstreamQuotaError,
} from './error-inspection.ts'
import { EditDiffTracker } from './tool-payload.ts'
import {
  buildElicitationResponse,
  formatQuestionAnswersText,
  normalizeElicitationQuestions,
  sameNormalizedQuestions,
  toQuestionPermissionInput,
  type NormalizedQuestion,
} from './questions.ts'
import {
  hasActiveBackgroundWork,
  readInboxState,
  readSubagents,
  readTranscriptRows,
  readLastStepIndex,
  settleBrainTurn,
  type ForegroundAcpSegment,
  type SubagentRecord,
} from './brain.ts'
import { readLatestStepUsage, resolveTranscriptPath } from './brain-io.ts'
import {
  captureTurnFileCheckpoint,
  readSessionCheckpoints,
  readSessionClientMessages,
  recordSessionClientMessage,
  restoreSessionFileCheckpoint,
} from './checkpoints.ts'
import { projectReplayHistory, type HistoryEntry } from './history.ts'
import { SubagentRegistry, isSubagentMessage } from './subagents.ts'
import { dataDirectory, removeSessionArtifacts } from './preflight.ts'
import {
  attachReplayRevertTokens,
  extractUserStepRows,
  makeRevertToken,
  removeForkedConversation,
  revertSession,
  type RevertScope,
} from './revert.ts'
import { connectAcp, type AgySwitchEvent } from './transport.ts'
import {
  beginTurnJournal,
  finishTurnJournal,
  reconcileRunningTurns,
} from './turn-journal.ts'
import {
  PACKAGE_VERSION,
  definedProcessEnv,
  formatErrorMessage,
  record,
  sessionIdPattern,
  setBounded,
} from './common.ts'
import {
  configState,
  addStepUsage,
  FULL_ACCESS_MODE_ID,
  hasPositivePromptUsage,
  Timeline,
  toolDetail,
  promptContent,
  validatePromptImages,
  contextUsage,
  promptUsage,
  type SessionMetadata,
  type StepUsage,
} from './mapping.ts'

type Open = Extract<ProviderInput, { type: 'session.open' }>
type Prompt = Extract<ProviderInput, { type: 'session.prompt' }>
type PermissionResponseInput = Extract<
  ProviderInput,
  { type: 'session.permission' }
>['response']
type PendingQuestionPermission = {
  type: 'question'
  questions: NormalizedQuestion[]
  promise: Promise<PermissionResponseInput | null>
  resolve: (r: PermissionResponseInput | null) => void
  fromElicitation: boolean
  fromBrain: boolean
  timer?: NodeJS.Timeout
}
type PendingPermission =
  | {
      type: 'acp'
      request: RequestPermissionRequest
      resolve: (r: RequestPermissionResponse) => void
      timer?: NodeJS.Timeout
    }
  | PendingQuestionPermission
type Session = Awaited<ReturnType<typeof createSession>>
interface SessionOptions {
  usage: AgyUsageSource
  launch?: ProviderLaunch
  capabilities: readonly string[]
  emit: (event: ProviderEvent) => void
  stallTimeoutMs?: number
  turnStallTimeoutMs?: number
  toolStallTimeoutMs?: number
  toolNoticeMs?: number
  retryTimeoutMs?: number
  permissionTimeoutMs?: number
}

const SKIP_PERMISSIONS_FLAG = '--dangerously-skip-permissions'

/**
 * Run loadSession/resumeSession with an idle gate and bounded timeout to prevent hangs.
 */
export async function runLoadSessionWithReplayIdle<T>(opts: {
  loadOperation: Promise<T>
  fallbackResult: T
  idleGapMs?: number
  timeoutMs?: number
  subscribeActivity?: (listener: () => void) => () => void
}): Promise<T> {
  const {
    loadOperation,
    fallbackResult,
    idleGapMs = 2000,
    timeoutMs = 90_000,
    subscribeActivity,
  } = opts

  let idleTimer: NodeJS.Timeout | undefined
  let overallTimer: NodeJS.Timeout | undefined
  let cleanupActivity: (() => void) | undefined

  const idlePromise = new Promise<T>((resolve) => {
    let hadActivity = false
    const onActivity = () => {
      hadActivity = true
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        if (hadActivity) resolve(fallbackResult)
      }, idleGapMs)
      idleTimer.unref()
    }
    if (subscribeActivity) {
      cleanupActivity = subscribeActivity(onActivity)
    }
    overallTimer = setTimeout(() => {
      resolve(fallbackResult)
    }, timeoutMs)
    overallTimer.unref()
  })

  try {
    return await Promise.race([loadOperation, idlePromise])
  } finally {
    if (idleTimer) clearTimeout(idleTimer)
    if (overallTimer) clearTimeout(overallTimer)
    cleanupActivity?.()
  }
}
const TIER_CACHE_LIMIT = 100
/**
 * Keychain-global credentials generation. A wrapper account switch bumps this once; every
 * session compares its last-seen value and reloads before its next prompt.
 */
let credentialsEpoch = 0

/**
 * A member counts as progress only if its payload cannot be empty of work. Optional or
 * metadata-only payloads are liveness-only: they still render, but never refresh the deadline.
 * Examples: `usage_update` counters, `session_message` (SDK: content optional — "omitted leaves
 * content unchanged"), `subagent_update` (SDK: optional title/description/state).
 */
const TURN_PROGRESS_UPDATES = new Set<SessionUpdate['sessionUpdate']>([
  'user_message_chunk',
  'agent_message_chunk',
  'agent_thought_chunk',
  'tool_call',
  'tool_call_update',
  'plan',
  'plan_update',
  'plan_removed',
  // SessionMessageChunk requires a ContentBlock, so it cannot be metadata-only.
  'session_message_chunk',
])

export function effectiveLaunch(
  launch: ProviderLaunch | undefined,
  skipPermissions?: boolean,
  agent?: string,
): ProviderLaunch | undefined {
  const baseArgs = launch?.args ?? ['acp']
  const nextArgs = [...baseArgs]
  if (skipPermissions && !nextArgs.includes(SKIP_PERMISSIONS_FLAG)) {
    nextArgs.push(SKIP_PERMISSIONS_FLAG)
  }
  if (agent && !nextArgs.includes('--agent')) {
    nextArgs.push('--agent', agent)
  }
  return nextArgs.length === baseArgs.length
    ? launch
    : {
        command: launch?.command ?? 'agy',
        args: nextArgs,
        env: launch?.env ?? definedProcessEnv(),
      }
}

export function sessionParams(cwd: string, config?: ProviderSessionConfig) {
  const providerOptions = config?.providerOptions as
    Record<string, unknown> | undefined
  const settings = config?.settings as Record<string, unknown> | undefined

  const mode =
    (config as { systemPromptMode?: string })?.systemPromptMode ??
    (providerOptions?.systemPromptMode as string | undefined) ??
    (settings?.systemPromptMode as string | undefined)
  const isReplace = mode === 'replace'

  const rawDirs =
    providerOptions?.additionalDirectories ?? settings?.additionalDirectories
  const additionalDirectories = Array.isArray(rawDirs)
    ? rawDirs.filter(
        (dir): dir is string =>
          typeof dir === 'string' && dir.trim().length > 0,
      )
    : []

  const antigravityMeta: {
    systemPrompt?: { replace: string } | { append: string }
    workspaceRoots?: string[]
  } = {}

  if (config?.systemPrompt?.trim()) {
    antigravityMeta.systemPrompt = isReplace
      ? { replace: config.systemPrompt }
      : { append: config.systemPrompt }
  }

  if (additionalDirectories.length > 0) {
    antigravityMeta.workspaceRoots = additionalDirectories
  }

  return {
    cwd,
    mcpServers: config ? mcpServers(config) : [],
    ...(Object.keys(antigravityMeta).length > 0
      ? {
          _meta: {
            antigravity: antigravityMeta,
          },
        }
      : {}),
  }
}

/** Own native runtimes, session identities and their cancellation across a provider connection. */
export class SessionManager {
  private sessions = new Map<string, Session>()
  private opening = new Map<string, Promise<Session>>()
  private transports = new Set<ReturnType<typeof connectAcp>>()
  private closed = false
  private options: SessionOptions
  constructor(options: SessionOptions) {
    this.options = options
  }

  async start(id: string, cwd: string, config?: ProviderSessionConfig) {
    if (this.closed) throw new Error('Provider connection is closed')
    return createSession(id, cwd, config, this.options, this.transports)
  }

  async open(input: Open) {
    const { emit, capabilities } = this.options
    if (this.sessions.has(input.sessionId) || this.opening.has(input.sessionId))
      throw new Error('Session already open')
    const starting = this.start(input.sessionId, input.config.cwd, input.config)
    this.opening.set(input.sessionId, starting)
    try {
      const session = await starting
      this.sessions.set(input.sessionId, session)
      try {
        const data = record(input.persistence?.data)
        if (
          input.persistence &&
          (input.persistence.version !== 1 ||
            typeof data.sessionId !== 'string')
        )
          throw new Error('Invalid agy persistence handle')
        const params = sessionParams(input.config.cwd, input.config)
        session.state.persisted = Boolean(input.persistence)
        session.state.replay = input.history === 'replay'
        if (input.persistence) {
          const canResume =
            input.history === 'skip' &&
            Boolean(
              session.initialized.agentCapabilities?.sessionCapabilities
                ?.resume,
            )
          if (!canResume && !session.initialized.agentCapabilities?.loadSession)
            throw new Error('agy does not support session/load')
          session.state.nativeId = data.sessionId as string
          const fallbackResult: NewSessionResponse = {
            sessionId: session.state.nativeId,
          }
          const loaded = await runLoadSessionWithReplayIdle({
            loadOperation: session.transport.request(
              canResume
                ? session.transport.rpc.resumeSession({
                    ...params,
                    sessionId: session.state.nativeId,
                  })
                : session.transport.rpc.loadSession({
                    ...params,
                    sessionId: session.state.nativeId,
                  }),
              { timeoutMs: 90_000, fatalOnTimeout: false },
            ),
            fallbackResult,
            idleGapMs: 2000,
            timeoutMs: 90_000,
            subscribeActivity: (listener) =>
              session.subscribeReplayActivity(listener),
          })
          session.state.metadata = {
            ...loaded,
            sessionId: session.state.nativeId,
          }
        } else {
          session.state.metadata = await session.transport.request(
            session.transport.rpc.newSession(params),
          )
          session.state.nativeId = session.state.metadata.sessionId
        }
        session.state.metadata.models = session.transport.models
        const dir = this.options.usage.remember(
          this.options.launch,
          input.config.env,
          input.config.cwd,
        )
        if (session.transport.tier?.name)
          setBounded(
            this.options.usage.tiers,
            dir,
            session.transport.tier.name,
            TIER_CACHE_LIMIT,
          )
        await session.drain()
        if (this.closed || session.state.closing || session.state.failed)
          throw new Error('Session closed before open')
        if (input.persistence && !session.state.replay) {
          const [lastStep, existingRows] = await Promise.all([
            readLastStepIndex(session.brainRoot, session.state.nativeId).catch(
              () => -1,
            ),
            readTranscriptRows(session.brainRoot, session.state.nativeId).catch(
              () => [] as Record<string, unknown>[],
            ),
          ])
          session.state.lastKnownStepIndex = lastStep
          session.state.userTurnCount = extractUserStepRows(existingRows).length
        }
        session.state.turnToolCallIds = []
        session.state.turnForegroundAcp = []
        await configureSession(session, input.config, {
          strictThinking: false,
          fallbackStored: true,
        })
        await session.drain()
        if (this.closed || session.state.closing || session.state.failed)
          throw new Error('Session closed before open')
        session.state.opened = true
        emit({
          type: 'session.opened',
          sessionId: input.sessionId,
          requestId: input.requestId,
          cwd: input.config.cwd,
          restoration: 'core',
          capabilities,
          ...(input.config.title ? { title: input.config.title } : {}),
          ...(input.config.persist !== false
            ? {
                persistence: {
                  version: 1,
                  data: { sessionId: session.state.nativeId },
                },
              }
            : {}),
        })
        session.flushConfigFallbackNotices()
        // A daemon restart must not resurrect a running ghost: fail leftover journal turns.
        for (const stale of await reconcileRunningTurns(
          session.appDataDir,
          session.state.nativeId,
        ).catch(() => [])) {
          emit({
            type: 'session.turn',
            sessionId: input.sessionId,
            turnId: stale.turnId,
            state: 'failed',
            error: {
              message: `Turn ${stale.turnId} was still marked running when the bridge restarted; it is failed because no terminal evidence was recorded.`,
            },
          })
        }
        session.publishConfig()
        await session.refreshSubagents()
        await session.flush()
        if (input.persistence && session.state.replay) {
          await session.replayTools()
        }
        if (input.persistence) await session.restoreUsage()
        session.state.loading = false
        session.state.replay = true
        session.flushDeferredUsage()
        await session.waitForCommands()
        if (this.closed || session.state.closing || session.state.failed)
          throw new Error('Session closed before ready')
        session.state.ready = true
        session.startIdleWatcher()
        emit({
          type: 'session.ready',
          sessionId: input.sessionId,
          requestId: input.requestId,
        })
      } catch (error) {
        console.error('[paseo-agy-acp] open() failed:', error)
        const wasOpened = session.state.opened
        const closedExternally = session.state.closedEmitted
        this.sessions.delete(input.sessionId)
        await session.close()
        if (wasOpened && !closedExternally && !session.state.closedEmitted) {
          session.state.closedEmitted = true
          emit({ type: 'session.closed', sessionId: input.sessionId })
        }
        throw error
      }
    } finally {
      this.opening.delete(input.sessionId)
    }
  }

  async handle(input: ProviderInput) {
    const { emit } = this.options
    if (input.type === 'session.open') return this.open(input)
    if (!('sessionId' in input))
      throw new Error(`Unsupported operation: ${input.type}`)
    if (input.type === 'session.close') {
      const session =
        this.sessions.get(input.sessionId) ??
        (await this.opening.get(input.sessionId)?.catch(() => undefined))
      if (!session) throw new Error('Session is not open')
      const wasOpened = session.state.opened
      await session.close()
      this.sessions.delete(session.id)
      if (wasOpened && !session.state.closedEmitted) {
        session.state.closedEmitted = true
        emit({ type: 'session.closed', sessionId: session.id })
      }
      emit({ type: 'request.completed', requestId: input.requestId })
      return
    }
    const session = this.sessions.get(input.sessionId)
    if (!session) throw new Error('Session is not open')
    if (input.type === 'session.prompt')
      return promptSession(session, input, emit)
    if (input.type === 'session.permission') {
      const permission = session.permissions.get(input.permissionId)
      if (!permission) throw new Error('Permission is no longer pending')
      session.permissions.delete(input.permissionId)
      if (permission.timer) clearTimeout(permission.timer)
      if (permission.type === 'acp') {
        const option = pickPermissionOption(
          permission.request.options,
          input.response.behavior,
          input.response.selectedActionId,
        )
        if (!option || option.kind.startsWith('reject')) {
          session.state.deniedToolCallIds.add(
            permission.request.toolCall.toolCallId,
          )
        }
        permission.resolve({
          outcome: option
            ? { outcome: 'selected', optionId: option.optionId }
            : { outcome: 'cancelled' },
        })
      } else {
        permission.resolve(input.response)
      }
      emit({
        type: 'session.permission_resolved',
        sessionId: session.id,
        permissionId: input.permissionId,
      })
      if (input.response.behavior === 'deny' && input.response.interrupt)
        await session.interrupt()
      return
    }
    if (input.type === 'session.configure')
      await configureSession(session, input.changes)
    else if (input.type === 'session.revert') {
      const scope = input.scope
      const requiredCap = `session.revert.${scope}` as const
      if (!this.options.capabilities.includes(requiredCap)) {
        throw new Error(`Unsupported operation: ${requiredCap}`)
      }
      if (session.state.closing || session.state.failed)
        throw new Error('Session is closed')
      if (session.state.opening || session.state.loading)
        throw new Error('Session is still opening')
      if (session.state.turn || session.state.interrupting)
        throw new Error('Cannot revert while a turn is active')
      if (session.state.reverting)
        throw new Error('Session revert is already in progress')
      session.state.reverting = true
      try {
        const result = await session.revert(scope, input.token)
        if (
          scope !== 'files' &&
          result.newNativeId &&
          session.config?.persist !== false
        ) {
          emit({
            type: 'session.persistence',
            sessionId: session.id,
            persistence: {
              version: 1,
              data: { sessionId: result.newNativeId },
            },
          })
        }
      } finally {
        session.state.reverting = false
      }
    } else if (input.type === 'session.interrupt') {
      if (session.state.reverting)
        throw new Error('Cannot interrupt while session is reverting')
      await session.interrupt()
    } else if (input.type === 'session.can_stop_runtime') {
      await session.syncExternalTranscript(false).catch(() => undefined)
      emit({
        type: input.type,
        requestId: input.requestId,
        sessionId: session.id,
        canStop: await session.canStop(),
      })
      return
    } else if (
      (input as { type: string }).type === 'session.refresh' ||
      (input as { type: string }).type === 'session.sync'
    ) {
      await session.syncExternalTranscript(true).catch(() => undefined)
      emit({
        type: 'request.completed',
        requestId: (input as { requestId: string }).requestId,
      })
      return
    } else {
      const unsupported: { type: string } = input
      throw new Error(`Unsupported operation: ${unsupported.type}`)
    }
    emit({ type: 'request.completed', requestId: input.requestId })
  }

  async close() {
    this.closed = true
    const pendingOpens = await Promise.all(
      [...this.opening.values()].map((p) => p.catch(() => undefined)),
    )
    for (const s of pendingOpens) {
      if (s) this.sessions.set(s.id, s)
    }
    await Promise.all([...this.sessions.values()].map((s) => s.close()))
    await Promise.all([...this.transports].map((t) => t.close()))
    this.sessions.clear()
  }
}

/** Bound on the settled-turn background probe so a local SQLite read cannot eat the cancel budget. */
const SETTLED_BACKGROUND_PROBE_MS = 300

/** Resolve `probe` within `timeoutMs`; a timeout means "work may exist", never a silent skip. */
async function backgroundWorkWithin(
  probe: Promise<boolean>,
  timeoutMs = SETTLED_BACKGROUND_PROBE_MS,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      probe,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), timeoutMs)
        timer.unref()
      }),
    ])
  } catch {
    return true
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function createSession(
  id: string,
  cwd: string,
  config: ProviderSessionConfig | undefined,
  options: SessionOptions,
  transports: Set<ReturnType<typeof connectAcp>>,
) {
  const cwdStat = await stat(cwd).catch(() => null)
  if (!cwdStat?.isDirectory()) {
    throw new Error(`Working directory does not exist: ${cwd}`)
  }
  const { launch, capabilities, emit } = options
  const permissions = new Map<string, PendingPermission>()
  const timeline = new Timeline(id)
  const appDataDir = dataDirectory(launch, config?.env, cwd)
  const brainRoot = join(appDataDir, 'brain')
  const supportsRevertAny = capabilities.some(
    (c) =>
      c === 'session.revert.conversation' ||
      c === 'session.revert.files' ||
      c === 'session.revert.both',
  )
  const supportsRevertFiles = capabilities.some(
    (c) => c === 'session.revert.files' || c === 'session.revert.both',
  )
  const state = {
    nativeId: '',
    opened: false,
    persisted: false,
    closing: false,
    silenced: false,
    closedEmitted: false,
    skipPermissions: config?.mode === FULL_ACCESS_MODE_ID,
    turnHadContextUsage: false,
    turnHadModelOutput: false,
    inSettle: false,
    handledElicitations: [] as Array<{
      questions: NormalizedQuestion[]
      answerText: string | null
      wokeUp: boolean
      declined?: boolean
    }>,
    suppressContinuationAcp: false,
    continuationEchoSeen: false,
    preStagedQuestion: undefined as
      | {
          questions: NormalizedQuestion[]
          response: PermissionResponseInput
        }
      | undefined,
    turnToolCallIds: [] as string[],
    turnForegroundAcp: [] as ForegroundAcpSegment[],
    deniedToolCallIds: new Set<string>(),
    lastKnownStepIndex: -1,
    userTurnCount: 0,
    clientMessageIds: new Map<number, string>(),
    wakeup: {
      pendingReplay: false,
      suppressEcho: false,
      carriedUsage: undefined as StepUsage | undefined,
    },
    opening: true,
    loading: true,
    ready: false,
    replay: true,
    reverting: false,
    turn: '',
    turnAbort: null as AbortController | null,
    observation: null as BrainTurnObservation | null,
    turnFinished: false,
    turnStartedAt: 0,
    turnLastProgressAt: 0,
    turnToolFailure: undefined as { id: string; error: string } | undefined,
    interrupting: null as Promise<void> | null,
    failed: false,
    metadata: { sessionId: '' } as NewSessionResponse & SessionMetadata,
    prompts: new Set<string>(),
  }
  const buffered: SessionNotification[] = []
  let collectingHistory = true
  const acpHistory: HistoryEntry[] = []
  const acpToolResults = new Map<
    string,
    { rawOutput: boolean; content: boolean }
  >()
  const acpToolSnapshots = new Map<string, Readonly<ToolCall>>()
  function acpResultProvided(callId: string): boolean {
    const result = acpToolResults.get(callId)
    return result?.rawOutput === true || result?.content === true
  }
  const subagents = new SubagentRegistry({
    sessionId: id,
    cwd,
    brainRoot,
    capabilities,
    emit,
    getNativeId: () => state.nativeId,
    isParentTurnActive: () => Boolean(state.turn),
    isLoading: () => state.loading,
    isUnavailable: () => state.closing || state.failed,
    retryTimeoutMs: options.retryTimeoutMs,
  })
  let notificationLane = Promise.resolve()
  let relaunching = Promise.resolve()
  let credentialsEpochSeen = credentialsEpoch
  const editDiffTracker = new EditDiffTracker()
  const nativeWindowSizes = new Map<string | undefined, number>()
  let usage: ProviderUsage = {}
  const emittedItemSignatures = new Map<string, string>()
  const emittedItemStatuses = new Map<string, string>()
  let lastTranscriptMtimeMs = 0
  let lastTranscriptSize = 0
  let idleSyncInFlight: Promise<void> | undefined
  let idlePollTimer: NodeJS.Timeout | undefined
  let fileWatcher: FSWatcher | undefined
  let deferredUsage = false
  let silentReload: { loadedUsage?: ProviderUsage } | null = null
  let commandsReceived = false
  let emittedCommands: string | undefined
  let commandWaiter: (() => void) | null = null
  let closing: Promise<void> | undefined
  function resolveCommands() {
    commandWaiter?.()
    commandWaiter = null
  }
  async function waitForCommands(timeoutMs = 1000) {
    if (commandsReceived || state.failed || state.closing) return
    let timer: NodeJS.Timeout | undefined
    try {
      await new Promise<void>((resolve) => {
        commandWaiter = resolve
        timer = setTimeout(resolve, timeoutMs)
        timer.unref()
      })
      await drain()
    } finally {
      clearTimeout(timer)
      commandWaiter = null
    }
  }
  async function drain() {
    // ACP dispatches notifications asynchronously relative to response resolution.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await notificationLane
  }
  function publishUsage(next: ProviderUsage) {
    if (!state.opened || state.silenced) return
    usage = { ...usage, ...next }
    deferredUsage = false
    emit({
      type: 'session.usage',
      sessionId: id,
      turnId: state.turn || undefined,
      usage,
    })
  }
  function flushDeferredUsage() {
    if (!deferredUsage || !state.opened || state.silenced) return
    deferredUsage = false
    emit({
      type: 'session.usage',
      sessionId: id,
      turnId: state.turn || undefined,
      usage,
    })
  }
  function terminalize(
    status: 'completed' | 'canceled' | 'failed',
    error?: string,
  ) {
    if (state.silenced) return
    for (const item of timeline.terminalize(
      status,
      error,
      state.deniedToolCallIds,
      {
        runningFails: status === 'completed',
        runningError:
          status === 'completed'
            ? 'Tool did not report a result before the turn ended'
            : undefined,
        // On a tool-clock expiry only the owner gets the timeout diagnostic; every other
        // still-running tool gets its own generic failure, never another tool's name/elapsed.
        runningErrorFor:
          status === 'failed'
            ? (tool) => {
                const failure = state.turnToolFailure
                if (!failure) return undefined
                return failure.id === tool.id
                  ? failure.error
                  : 'Turn ended while this tool was still running'
              }
            : undefined,
      },
    )) {
      emit({ type: 'timeline.item', sessionId: id, item })
    }
  }
  function finishTurnOnce(
    turnId: string,
    status: 'completed' | 'canceled' | 'failed',
    error?: string | ProviderError,
  ) {
    if (state.turn !== turnId || state.turnFinished || state.silenced) return
    state.turnFinished = true
    const errorMessage = typeof error === 'string' ? error : error?.message
    terminalize(status, errorMessage)
    const providerError: ProviderError | undefined =
      status === 'failed' && error
        ? typeof error === 'string'
          ? { message: error }
          : error
        : undefined
    emit({
      type: 'session.turn',
      sessionId: id,
      turnId,
      state: status,
      ...(providerError ? { error: providerError } : {}),
    })
    // Fire-and-forget by design: a crash before this write lands leaves a running journal
    // record, which the next open reconciles to `failed` (fail-closed), never to running.
    void finishTurnJournal(appDataDir, state.nativeId, turnId).catch(
      (error) => {
        console.warn('[paseo-agy-acp] failed to clear turn journal:', error)
      },
    )
  }
  function publishStepContext(lastStep: StepUsage) {
    const { contextWindowUsedTokens, contextWindowMaxTokens } = promptUsage(
      null,
      {
        model: configState(state.metadata).model,
        contextWindowMaxTokens: nativeWindowSizes.get(
          configState(state.metadata).model,
        ),
        lastStep,
      },
    )
    if (contextWindowUsedTokens !== undefined)
      publishUsage({ contextWindowUsedTokens, contextWindowMaxTokens })
  }
  /** Brain-projected items are not yet known to the ACP timeline. */
  function emitItem(item: ProviderTimelineItem, timestamp?: string) {
    if (state.silenced) return
    emittedItemSignatures.set(item.id, JSON.stringify(item))
    if ('status' in item && typeof item.status === 'string') {
      emittedItemStatuses.set(item.id, item.status)
    } else {
      emittedItemStatuses.set(item.id, 'completed')
    }
    timeline.track(item)
    publishItem(item, timestamp)
  }
  /** Link child sessions and publish an item the timeline already tracks. */
  function publishItem(item: ProviderTimelineItem, timestamp?: string) {
    if (state.silenced) return
    subagents.linkSubsession(id, state.nativeId, item)
    if (state.replay)
      emit({
        type: 'timeline.item',
        sessionId: id,
        item,
        ...(timestamp ? { timestamp } : {}),
      })
  }
  async function syncExternalTranscript(force = false): Promise<void> {
    if (
      state.closing ||
      state.failed ||
      state.opening ||
      state.loading ||
      state.silenced ||
      !state.nativeId
    )
      return
    if (state.turn || state.inSettle) return
    if (idleSyncInFlight) return idleSyncInFlight
    idleSyncInFlight = (async () => {
      try {
        const transcriptPath = await resolveTranscriptPath(
          brainRoot,
          state.nativeId,
        ).catch(() => null)
        if (!transcriptPath) return
        const fileStat = await stat(transcriptPath).catch(() => null)
        if (!fileStat) return
        if (
          !force &&
          fileStat.mtimeMs === lastTranscriptMtimeMs &&
          fileStat.size === lastTranscriptSize
        ) {
          return
        }

        const [
          inbox,
          subagentRecords,
          rows,
          checkpoints,
          persistedClientMessages,
        ] = await Promise.all([
          readInboxState(brainRoot, state.nativeId).catch(() => ({
            messages: [],
            readIds: new Set<string>(),
            unconsumedHighPriority: [],
            consumedNonUserCount: 0,
            stepCallIds: new Map<number, string>(),
          })),
          readSubagents(brainRoot, state.nativeId).catch(() => []),
          readTranscriptRows(brainRoot, state.nativeId).catch(
            () => [] as Record<string, unknown>[],
          ),
          supportsRevertAny
            ? readSessionCheckpoints(appDataDir, state.nativeId).catch(() => [])
            : Promise.resolve([]),
          readSessionClientMessages(appDataDir, state.nativeId).catch(
            () => new Map<number, string>(),
          ),
        ])
        if (
          state.closing ||
          state.failed ||
          state.silenced ||
          state.turn ||
          state.inSettle
        )
          return
        subagents.rememberSubagents(subagentRecords)
        const mergedClientMessageIds = new Map(persistedClientMessages)
        for (const [ordinal, clientId] of state.clientMessageIds) {
          mergedClientMessageIds.set(ordinal, clientId)
        }

        const { entries, lastKnownStepIndex } = projectReplayHistory({
          sessionId: id,
          rows,
          inbox,
          subagents: subagentRecords,
          acpHistory: [],
          acpToolCallIds: state.turnToolCallIds,
          acpToolSnapshots,
          acpResultProvided,
        })
        const decoratedEntries = attachReplayRevertTokens(
          entries,
          rows,
          checkpoints,
          {
            clientMessageIds: mergedClientMessageIds,
            includeRevertToken: supportsRevertAny,
          },
        )
        state.userTurnCount = extractUserStepRows(rows).length
        if (lastKnownStepIndex > state.lastKnownStepIndex) {
          state.lastKnownStepIndex = lastKnownStepIndex
        }
        lastTranscriptMtimeMs = fileStat.mtimeMs
        lastTranscriptSize = fileStat.size

        for (const { item, timestamp } of decoratedEntries) {
          if (
            state.closing ||
            state.failed ||
            state.silenced ||
            state.turn ||
            state.inSettle
          )
            break
          const prevStatus = emittedItemStatuses.get(item.id)
          if (
            prevStatus === 'completed' ||
            prevStatus === 'canceled' ||
            prevStatus === 'failed'
          ) {
            continue
          }
          const sig = JSON.stringify(item)
          if (emittedItemSignatures.get(item.id) !== sig) {
            await subagents.waitCurrentReady()
            emitItem(item, timestamp)
          }
        }
        await subagents.waitNestedReady()
        await subagents.syncKilledChildren(subagentRecords)
        if (usage?.contextWindowUsedTokens === undefined) {
          const snapshot = await readLatestStepUsage(
            brainRoot,
            state.nativeId,
          ).catch(() => undefined)
          if (snapshot?.lastStepUsage) {
            publishStepContext(snapshot.lastStepUsage)
          }
        }
      } catch {
        // Ignore background I/O errors during idle sync
      } finally {
        idleSyncInFlight = undefined
      }
    })()
    return idleSyncInFlight
  }

  function startIdleWatcher() {
    if (idlePollTimer || state.closing || state.failed) return
    idlePollTimer = setInterval(() => {
      void syncExternalTranscript(false).catch(() => undefined)
    }, 800)
    idlePollTimer.unref()

    void resolveTranscriptPath(brainRoot, state.nativeId)
      .then((p) => {
        if (state.closing || state.failed || !p) return
        const logsDir = join(brainRoot, state.nativeId, 'logs')
        try {
          fileWatcher = watch(logsDir, () => {
            void syncExternalTranscript(false).catch(() => undefined)
          })
          fileWatcher.unref()
        } catch {
          // Fall back to polling only if watch fails
        }
      })
      .catch(() => undefined)
  }

  function stopIdleWatcher() {
    if (idlePollTimer) {
      clearInterval(idlePollTimer)
      idlePollTimer = undefined
    }
    if (fileWatcher) {
      try {
        fileWatcher.close()
      } catch {}
      fileWatcher = undefined
    }
  }
  async function update(notification: SessionNotification) {
    if (state.closing || state.failed) return
    if (state.nativeId && notification.sessionId !== state.nativeId) return
    if (state.opening) {
      buffered.push(notification)
      return
    }
    if (notification.sessionId !== state.nativeId) return
    const u = notification.update
    // SDK SessionUpdate classification: only work-advancing kinds refresh the turn deadline.
    // Progress: user_message_chunk, agent_message_chunk, agent_thought_chunk, tool_call,
    // tool_call_update, plan, plan_update, plan_removed, session_message_chunk.
    // Liveness-only (still rendered, no deadline refresh): usage_update,
    // available_commands_update, current_mode_update, config_option_update,
    // session_info_update, notice, compaction_update, compaction_summary_chunk,
    // subagent_update, session_message, and any future/unknown member (fail-closed).
    if (state.turn && TURN_PROGRESS_UPDATES.has(u.sessionUpdate))
      state.turnLastProgressAt = Date.now()
    if (u.sessionUpdate === 'config_option_update') {
      state.metadata.configOptions = u.configOptions
      if (silentReload) return
      if (configState({ ...state.metadata, fullAccess: false }).mode === 'plan')
        state.metadata.fullAccess = false
      publishConfig()
    } else if (u.sessionUpdate === 'available_commands_update') {
      const next = u.availableCommands.map((c) => ({
        name: c.name,
        description: c.description,
        argumentHint: c.input?.hint,
      }))
      const serialized = JSON.stringify(next)
      if (state.opened && !state.silenced && serialized !== emittedCommands) {
        emittedCommands = serialized
        emit({
          type: 'session.commands',
          sessionId: id,
          commands: next,
        })
      }
      commandsReceived = true
      resolveCommands()
    } else if (u.sessionUpdate === 'usage_update') {
      if (state.wakeup.suppressEcho || state.suppressContinuationAcp) return
      const next = contextUsage(u)
      if (!next) return
      setBounded(
        nativeWindowSizes,
        configState(state.metadata).model,
        u.size,
        100,
      )
      if (silentReload) {
        silentReload.loadedUsage = { ...silentReload.loadedUsage, ...next }
      } else if (!state.loading || state.replay) {
        if (state.turn) state.turnHadContextUsage = true
        publishUsage(next)
      } else if (!state.ready) {
        usage = { ...usage, ...next }
        deferredUsage = true
      }
    } else {
      if (state.loading && !state.replay) return
      if (state.suppressContinuationAcp) {
        if (u.sessionUpdate === 'user_message_chunk')
          state.continuationEchoSeen = true
        if (
          u.sessionUpdate === 'tool_call' &&
          state.continuationEchoSeen &&
          !state.turnToolCallIds.includes(u.toolCallId)
        )
          state.turnToolCallIds.push(u.toolCallId)
        if (
          state.turn &&
          (u.sessionUpdate === 'agent_message_chunk' ||
            u.sessionUpdate === 'agent_thought_chunk' ||
            u.sessionUpdate === 'tool_call')
        )
          state.turnHadModelOutput = true
        return
      }
      if (u.sessionUpdate === 'user_message_chunk' && !state.loading) {
        state.wakeup.suppressEcho = false
        state.turnToolCallIds = []
        state.turnForegroundAcp = []
        timeline.boundary()
        return
      }
      if (state.wakeup.suppressEcho) return
      const isNewToolCall =
        u.sessionUpdate === 'tool_call' &&
        !state.turnToolCallIds.includes(u.toolCallId)
      if (isNewToolCall) state.turnToolCallIds.push(u.toolCallId)
      if (!state.loading && state.turn && !state.inSettle) {
        if (
          (u.sessionUpdate === 'agent_message_chunk' ||
            u.sessionUpdate === 'agent_thought_chunk') &&
          u.content.type === 'text' &&
          u.content.text.length > 0
        ) {
          const segType =
            u.sessionUpdate === 'agent_message_chunk'
              ? 'assistant_message'
              : 'reasoning'
          const last =
            state.turnForegroundAcp[state.turnForegroundAcp.length - 1]
          if (last && last.type === segType) last.text += u.content.text
          else
            state.turnForegroundAcp.push({
              type: segType,
              text: u.content.text,
            })
        } else if (isNewToolCall) {
          state.turnForegroundAcp.push({
            type: 'tool_call',
            callId: u.toolCallId,
          })
        }
      }
      if (
        state.turn &&
        (u.sessionUpdate === 'agent_message_chunk' ||
          u.sessionUpdate === 'agent_thought_chunk' ||
          u.sessionUpdate === 'tool_call')
      )
        state.turnHadModelOutput = true
      let effectiveUpdate = u
      if (u.sessionUpdate === 'tool_call') {
        await editDiffTracker.capturePending(cwd, u)
      } else if (u.sessionUpdate === 'tool_call_update') {
        await editDiffTracker.capturePending(cwd, u)
        effectiveUpdate = (await editDiffTracker.synthesizeIfMissing(
          cwd,
          u as unknown as Record<string, unknown>,
          timeline.toolCallSnapshot(u.toolCallId) as
            Record<string, unknown> | undefined,
        )) as typeof u
      }
      // Timeline.update already tracks the ACP item.
      const item = timeline.update(effectiveUpdate, state.deniedToolCallIds)
      if (item) {
        if (
          item.type === 'tool_call' &&
          item.detail.type === 'sub_agent' &&
          isSubagentMessage(item.name)
        ) {
          // Terminalization may run while ownership is being read.
          const nativeId = item.detail.childSessionId
          delete item.detail.childSessionId
          await subagents.refreshSubagents()
          // Do not restore a native ID that a later terminalization could publish.
          if (state.closing || state.failed) return
          if (nativeId !== undefined) item.detail.childSessionId = nativeId
        }
        if (
          state.loading &&
          state.persisted &&
          state.replay &&
          collectingHistory
        ) {
          if (
            item.type === 'tool_call' &&
            (u.sessionUpdate === 'tool_call' ||
              u.sessionUpdate === 'tool_call_update')
          ) {
            const result =
              u.sessionUpdate === 'tool_call'
                ? { rawOutput: false, content: false }
                : (acpToolResults.get(item.callId) ?? {
                    rawOutput: false,
                    content: false,
                  })
            if (u.rawOutput != null) result.rawOutput = true
            if (u.content != null)
              result.content = item.status !== 'running' || u.content.length > 0
            acpToolResults.set(item.callId, result)
            const snapshot = timeline.toolCallSnapshot(item.callId)
            if (snapshot) acpToolSnapshots.set(item.callId, snapshot)
            acpHistory.push({
              item,
              resultProvided: acpResultProvided(item.callId),
            })
          } else acpHistory.push({ item })
        } else publishItem(item)
      }
    }
  }
  function publishConfig() {
    if (!state.opened || state.closing || state.failed || state.silenced) return
    emit({
      type: 'session.config',
      sessionId: id,
      config: configState(state.metadata),
    })
  }
  /** Surface a restored-config fallback on the timeline; never a turn or tool event. */
  const pendingConfigFallbacks: Array<{
    key: NativeConfigKey
    stored: string
    effective: string | undefined
  }> = []
  function emitConfigFallback(
    key: NativeConfigKey,
    stored: string,
    effective: string | undefined,
  ) {
    const label = key === 'thought_level' ? 'thinking option' : 'model'
    emit({
      type: 'timeline.item',
      sessionId: id,
      item: {
        id: `${id}:config-fallback:${key}:${stored}`,
        type: 'notification',
        level: 'info',
        message: effective
          ? `Stored ${label} "${stored}" is unavailable to the current account; continuing with "${effective}".`
          : `Stored ${label} "${stored}" is unavailable to the current account; continuing without it.`,
      },
    })
  }
  function noticeConfigFallback(
    key: NativeConfigKey,
    stored: string,
    effective: string | undefined,
  ) {
    if (state.silenced) return
    // Open applies restored config before `session.opened`; hold the notice until the host
    // has a session to attach it to.
    if (!state.opened) {
      pendingConfigFallbacks.push({ key, stored, effective })
      return
    }
    emitConfigFallback(key, stored, effective)
  }
  function flushConfigFallbackNotices() {
    while (pendingConfigFallbacks.length) {
      const { key, stored, effective } = pendingConfigFallbacks.shift()!
      emitConfigFallback(key, stored, effective)
    }
  }
  function cancelPermissions() {
    for (const [permissionId, p] of permissions) {
      if (p.timer) clearTimeout(p.timer)
      if (p.type === 'acp') {
        state.deniedToolCallIds.add(p.request.toolCall.toolCallId)
        p.resolve({ outcome: { outcome: 'cancelled' } })
      } else {
        p.resolve(null)
      }
      if (state.opened && !state.silenced) {
        emit({
          type: 'session.permission_resolved',
          sessionId: id,
          permissionId,
        })
      }
    }
    permissions.clear()
  }
  function askUserQuestion(
    questions: NormalizedQuestion[],
    title?: string,
    source: 'elicitation' | 'brain' = 'elicitation',
  ): {
    promise: Promise<PermissionResponseInput | null>
    entry: PendingQuestionPermission
  } | null {
    if (
      !questions.length ||
      !state.nativeId ||
      !state.turn ||
      state.closing ||
      state.failed
    )
      return null
    for (const p of permissions.values()) {
      if (
        p.type === 'question' &&
        (source === 'elicitation' ? !p.fromElicitation : !p.fromBrain) &&
        sameNormalizedQuestions(p.questions, questions)
      ) {
        if (source === 'elicitation') p.fromElicitation = true
        else p.fromBrain = true
        return { promise: p.promise, entry: p }
      }
    }
    const input = toQuestionPermissionInput(questions)
    const detail = toolDetail({
      title: 'ask_question',
      rawInput: input,
    })
    let resolve!: (r: PermissionResponseInput | null) => void
    const promise = new Promise<PermissionResponseInput | null>((res) => {
      resolve = res
    })
    const permissionId = randomUUID()
    const permissionTimeoutMs = options.permissionTimeoutMs ?? 10 * 60_000
    let timer: NodeJS.Timeout | undefined
    if (permissionTimeoutMs > 0 && Number.isFinite(permissionTimeoutMs)) {
      timer = setTimeout(() => {
        if (!permissions.has(permissionId)) return
        permissions.delete(permissionId)
        resolve(null)
        if (state.opened && !state.silenced) {
          emit({
            type: 'session.permission_resolved',
            sessionId: id,
            permissionId,
          })
        }
      }, permissionTimeoutMs)
      timer.unref()
    }
    const entry: PendingQuestionPermission = {
      type: 'question',
      questions,
      promise,
      resolve,
      fromElicitation: source === 'elicitation',
      fromBrain: source === 'brain',
      timer,
    }
    permissions.set(permissionId, entry)
    emit({
      type: 'session.permission',
      sessionId: id,
      request: {
        id: permissionId,
        name: 'ask_question',
        kind: 'question',
        title: title ?? questions[0]?.question ?? 'Question',
        input,
        detail,
        actions: [
          { id: 'allow', label: 'Submit', behavior: 'allow' },
          { id: 'deny', label: 'Cancel', behavior: 'deny' },
        ],
      },
    })
    return { promise, entry }
  }
  const replayActivityListeners = new Set<() => void>()
  const client = {
    sessionUpdate: (notification: SessionNotification) => {
      for (const listener of replayActivityListeners) {
        try {
          listener()
        } catch {
          /* ignore */
        }
      }
      notificationLane = notificationLane.then(() => update(notification))
      return notificationLane
    },
    requestElicitation: async (params: Record<string, unknown>) => {
      if (
        !state.nativeId ||
        (typeof params.sessionId === 'string' &&
          params.sessionId !== state.nativeId) ||
        !state.turn ||
        state.closing ||
        state.failed
      )
        return { action: 'cancel' }
      const questions = normalizeElicitationQuestions(params)
      if (!questions.length) return { action: 'cancel' }
      if (state.preStagedQuestion) {
        const staged = state.preStagedQuestion
        state.preStagedQuestion = undefined
        if (sameNormalizedQuestions(staged.questions, questions)) {
          return buildElicitationResponse(
            questions,
            staged.response,
            staged.questions,
          )
        }
      }
      const pending = askUserQuestion(
        questions,
        typeof params.message === 'string' && params.message.trim()
          ? params.message.trim()
          : undefined,
        'elicitation',
      )
      if (!pending) return { action: 'cancel' }
      const response = await pending.promise
      if (!response) return { action: 'cancel' }
      if (!pending.entry.fromBrain) {
        state.handledElicitations.push({
          questions,
          answerText:
            formatQuestionAnswersText(pending.entry.questions, response) ||
            null,
          wokeUp: state.inSettle,
          declined: response.behavior === 'deny',
        })
      }
      return buildElicitationResponse(
        questions,
        response,
        pending.entry.questions,
      )
    },
    requestPermission: async (request: RequestPermissionRequest) => {
      const parsed = RequestPermissionRequestSchema.safeParse(request)
      if (
        !parsed.success ||
        !state.nativeId ||
        request.sessionId !== state.nativeId ||
        !state.turn ||
        state.closing ||
        state.failed
      )
        return { outcome: { outcome: 'cancelled' as const } }
      const input = z
        .record(z.string(), z.json())
        .safeParse(record(request.toolCall?.rawInput))
      if (!input.success) return { outcome: { outcome: 'cancelled' as const } }
      const detail = toolDetail(request.toolCall)
      const kind = permissionKind(request, detail)
      await editDiffTracker.capturePending(cwd, request.toolCall)
      if (!state.turn || state.closing || state.failed) {
        return { outcome: { outcome: 'cancelled' as const } }
      }
      const preapproved = isPreapprovedMcpTool(
        request.toolCall.title,
        input.data,
        config?.toolPolicy,
      )
      if (kind !== 'question' && (state.metadata.fullAccess || preapproved)) {
        const allow = pickPermissionOption(request.options, 'allow')
        if (!allow) state.deniedToolCallIds.add(request.toolCall.toolCallId)
        return {
          outcome: allow
            ? { outcome: 'selected' as const, optionId: allow.optionId }
            : { outcome: 'cancelled' as const },
        }
      }
      const securityPrompt = extractSecurityWarningPromptInfo(request.options)
      return new Promise<RequestPermissionResponse>((resolve) => {
        const permissionId = randomUUID()
        const permissionTimeoutMs = options.permissionTimeoutMs ?? 10 * 60_000
        let timer: NodeJS.Timeout | undefined
        if (permissionTimeoutMs > 0 && Number.isFinite(permissionTimeoutMs)) {
          timer = setTimeout(() => {
            if (!permissions.has(permissionId)) return
            permissions.delete(permissionId)
            state.deniedToolCallIds.add(request.toolCall.toolCallId)
            resolve({ outcome: { outcome: 'cancelled' } })
            if (state.opened && !state.silenced) {
              emit({
                type: 'session.permission_resolved',
                sessionId: id,
                permissionId,
              })
            }
          }, permissionTimeoutMs)
          timer.unref()
        }
        permissions.set(permissionId, { type: 'acp', request, resolve, timer })
        emit({
          type: 'session.permission',
          sessionId: id,
          request: {
            id: permissionId,
            name: request.toolCall.title ?? 'Tool',
            kind,
            title: request.toolCall.title ?? undefined,
            ...securityPrompt,
            input: input.data,
            detail,
            actions: mapPermissionActions(request.options),
          },
        })
      })
    },
  }
  const retiring = new WeakSet<ReturnType<typeof connectAcp>>()
  const onExit = (error: Error) => {
    if (state.failed || state.closing) return
    state.failed = true
    state.turnAbort?.abort(error)
    // Finish the active turn through the single-shot path; do not depend on the prompt promise rejecting.
    if (state.turn) finishTurnOnce(state.turn, 'failed', error.message)
    else terminalize('failed', error.message)
    resolveCommands()
    cancelPermissions()
    if (state.ready && !state.silenced)
      emit({
        type: 'session.runtime_failed',
        sessionId: id,
        error: { message: error.message },
      })
  }
  /** A wrapper switch only bumps the global epoch; the reload happens at the next safe point. */
  function handleCredentialsSwitch(event: AgySwitchEvent) {
    if (event.ok !== true) return
    credentialsEpoch += 1
  }
  const rawAgent = config?.providerOptions?.agent
  const agent =
    typeof rawAgent === 'string' && rawAgent.trim()
      ? rawAgent.trim()
      : undefined
  /** Start an owned ACP runtime; it leaves the connection's transports once it exits and stops. */
  function startRuntime(skipPermissions: boolean) {
    const transport = connectAcp(
      effectiveLaunch(launch, skipPermissions, agent),
      cwd,
      config?.env ?? {},
      client,
      (error) => {
        if (transport !== currentTransport || retiring.has(transport)) return
        onExit(error)
      },
      { onSwitch: handleCredentialsSwitch },
    )
    transports.add(transport)
    void transport.stopped.then(() => transports.delete(transport))
    return transport
  }
  function initializeRuntime(transport: ReturnType<typeof connectAcp>) {
    return transport.request(
      transport.rpc.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: { name: 'paseo-agy-acp', version: PACKAGE_VERSION },
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          elicitation: { form: {} },
        },
      }),
    )
  }
  let currentTransport = startRuntime(state.skipPermissions)
  try {
    let currentInitialized = await initializeRuntime(currentTransport)
    async function reloadSessionSilently(opts: {
      targetNativeId: string
      previousMetadata: SessionMetadata
      skipPermissions: boolean
      replayMode: boolean
      preloaded?: NewSessionResponse
      useResume?: boolean
      onRegistered?: () => void
    }): Promise<{
      configChanged: boolean
      loadedUsage?: ProviderUsage
      aborted: boolean
    }> {
      const prev = configState(opts.previousMetadata)
      const prevModels = opts.previousMetadata.models
      const nativeMode = configState({
        ...opts.previousMetadata,
        fullAccess: false,
      }).mode
      const params = sessionParams(cwd, config)
      const next = currentTransport
      const reloadCtx: { loadedUsage?: ProviderUsage } = {}
      silentReload = reloadCtx
      state.loading = true
      state.replay = false
      let configChanged = false
      try {
        const fallbackResult: NewSessionResponse = {
          sessionId: opts.targetNativeId,
        }
        const loaded =
          opts.preloaded ??
          (await runLoadSessionWithReplayIdle({
            loadOperation: next.request(
              opts.useResume
                ? next.rpc.resumeSession({
                    ...params,
                    sessionId: opts.targetNativeId,
                  })
                : next.rpc.loadSession({
                    ...params,
                    sessionId: opts.targetNativeId,
                  }),
              { timeoutMs: 90_000, fatalOnTimeout: false },
            ),
            fallbackResult,
            idleGapMs: 2000,
            timeoutMs: 90_000,
            subscribeActivity: (listener) => {
              replayActivityListeners.add(listener)
              return () => {
                replayActivityListeners.delete(listener)
              }
            },
          }))
        opts.onRegistered?.()
        state.metadata = {
          ...loaded,
          sessionId: opts.targetNativeId,
          models: next.models ?? prevModels,
          fullAccess: opts.skipPermissions,
        }
        await drain()
        if (state.closing) return { configChanged: false, aborted: true }
        if (state.failed || next.closed)
          throw new Error('ACP runtime exited during reload')
        for (const [k, v] of [
          ['model', prev.model],
          ['thought_level', prev.thinkingOption],
          ['mode', opts.replayMode ? nativeMode : undefined],
        ] as const) {
          if (!v) continue
          if (k === 'mode') {
            const applied = await applyNativeConfigOption(
              next,
              opts.targetNativeId,
              state.metadata,
              k,
              v,
            )
            configChanged ||= applied
            continue
          }
          const stored = await applyStoredConfigOption(
            next,
            opts.targetNativeId,
            state.metadata,
            k,
            v,
          )
          configChanged ||= stored.applied
          if (stored.unavailable)
            noticeConfigFallback(
              k,
              v,
              selectedConfigValue(configState(state.metadata), k),
            )
        }
        await drain()
        if (state.closing) return { configChanged: false, aborted: true }
        if (state.failed || next.closed)
          throw new Error('ACP runtime exited during reload')
        state.metadata.fullAccess = opts.skipPermissions
        return {
          configChanged:
            configChanged ||
            JSON.stringify(configState(state.metadata)) !==
              JSON.stringify(prev),
          loadedUsage: reloadCtx.loadedUsage,
          aborted: false,
        }
      } finally {
        silentReload = null
        state.loading = false
        state.replay = true
      }
    }
    /**
     * Reload credentials changed by a wrapper account switch. Serialized with relaunches,
     * never fails the turn: a reload error is logged and the current runtime is kept.
     */
    async function reloadForCredentials(): Promise<void> {
      const targetEpoch = credentialsEpoch
      if (
        targetEpoch === credentialsEpochSeen ||
        state.closing ||
        state.failed ||
        !state.nativeId
      )
        return
      const previousMetadata = state.metadata
      const perform = async (): Promise<void> => {
        try {
          const reloaded = await reloadSessionSilently({
            targetNativeId: state.nativeId,
            previousMetadata,
            skipPermissions: state.skipPermissions,
            replayMode: false,
          })
          if (reloaded.aborted) return
          credentialsEpochSeen = targetEpoch
        } catch (error) {
          console.error(
            '[paseo-agy-acp] account switch reload failed; keeping the current runtime:',
            error,
          )
        }
      }
      const run = relaunching.then(perform, perform)
      relaunching = run.then(
        () => undefined,
        () => undefined,
      )
      await run
    }
    async function doRelaunch(
      skipPermissions: boolean,
      force = false,
    ): Promise<void> {
      if (state.closing) return
      if (state.failed)
        throw new Error('ACP runtime has exited; reopen the session')
      if (
        !force &&
        (state.skipPermissions === skipPermissions ||
          !currentInitialized.agentCapabilities?.loadSession)
      )
        return
      const previousMetadata = state.metadata
      state.observation?.stop()
      state.loading = true
      state.replay = false
      retiring.add(currentTransport)
      try {
        await currentTransport.close().catch((err) => {
          // If the retired transport did not exit before TERMINATION_DEADLINE_MS,
          // close() finally block already killed process groups. Catch this deadline
          // timeout so it does not trigger onExit() or fail the session relaunch.
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('did not exit after termination')) return
          throw err
        })
        if (state.closing) return
        if (state.failed)
          throw new Error('ACP runtime has exited; reopen the session')
        if (!currentInitialized.agentCapabilities?.loadSession)
          throw new Error(
            'agy cannot reload after interruption; reopen the session',
          )
        const next = startRuntime(skipPermissions)
        currentTransport = next
        currentInitialized = await initializeRuntime(next)
        if (state.closing) return
        if (state.failed || next.closed)
          throw new Error('ACP runtime exited during relaunch')
        state.skipPermissions = skipPermissions
        const reloaded = await reloadSessionSilently({
          targetNativeId: state.nativeId,
          previousMetadata,
          skipPermissions,
          replayMode: force,
        })
        if (reloaded.aborted) return
        if (force && reloaded.configChanged) publishConfig()
      } catch (error) {
        if (state.closing) return
        onExit(error instanceof Error ? error : new Error(String(error)))
        void currentTransport.close().catch(() => undefined)
        throw error
      } finally {
        state.wakeup = {
          pendingReplay: false,
          suppressEcho: false,
          carriedUsage: undefined,
        }
        state.turnToolCallIds = []
        state.turnForegroundAcp = []
        state.loading = false
        state.replay = true
      }
    }
    return {
      id,
      cwd,
      config,
      appDataDir,
      brainRoot,
      supportsRevertAny,
      supportsRevertFiles,
      stallTimeoutMs: options.stallTimeoutMs,
      turnStallTimeoutMs: options.turnStallTimeoutMs,
      toolStallTimeoutMs: options.toolStallTimeoutMs,
      toolNoticeMs: options.toolNoticeMs,
      retryTimeoutMs: options.retryTimeoutMs,
      state,
      get initialized() {
        return currentInitialized
      },
      get transport() {
        return currentTransport
      },
      timeline,
      permissions,
      askUserQuestion,
      cancelPermissions,
      publishConfig,
      noticeConfigFallback,
      flushConfigFallbackNotices,
      publishUsage,
      flushDeferredUsage,
      terminalize,
      finishTurnOnce,
      emitItem,
      resetWakeup() {
        state.wakeup = {
          pendingReplay: false,
          suppressEcho: false,
          carriedUsage: undefined,
        }
      },
      subscribeReplayActivity(listener: () => void) {
        replayActivityListeners.add(listener)
        return () => {
          replayActivityListeners.delete(listener)
        }
      },
      hasChild: (nativeId: string) => subagents.hasChild(nativeId),
      hasRunningChildren: () => subagents.hasRunningChildren(),
      getChildFailure: subagents.getChildFailure,
      isChildResumable: (nativeId: string) =>
        subagents.isChildResumable(nativeId),
      syncKilledChildren: subagents.syncKilledChildren,
      rememberSubagents: subagents.rememberSubagents,
      refreshSubagents: subagents.refreshSubagents,
      canLinkChild: subagents.canLinkChild,
      drain,
      waitForCommands,
      syncExternalTranscript,
      startIdleWatcher,
      stopIdleWatcher,
      get contextWindowMaxTokens() {
        return nativeWindowSizes.get(configState(state.metadata).model)
      },
      publishStepContext(lastStep: StepUsage) {
        publishStepContext(lastStep)
      },
      async restoreUsage() {
        if (usage?.contextWindowUsedTokens !== undefined) return
        const snapshot = await readLatestStepUsage(
          brainRoot,
          state.nativeId,
        ).catch(() => undefined)
        if (snapshot?.lastStepUsage)
          this.publishStepContext(snapshot.lastStepUsage)
      },
      async replayTools() {
        if (!state.replay) return
        const [
          inbox,
          subagentRecords,
          rows,
          checkpoints,
          persistedClientMessages,
        ] = await Promise.all([
          readInboxState(brainRoot, state.nativeId),
          readSubagents(brainRoot, state.nativeId),
          readTranscriptRows(brainRoot, state.nativeId),
          supportsRevertAny
            ? readSessionCheckpoints(appDataDir, state.nativeId)
            : Promise.resolve([]),
          readSessionClientMessages(appDataDir, state.nativeId).catch(
            () => new Map<number, string>(),
          ),
        ])
        subagents.rememberSubagents(subagentRecords)
        for (const [ordinal, clientId] of persistedClientMessages) {
          if (!state.clientMessageIds.has(ordinal)) {
            state.clientMessageIds.set(ordinal, clientId)
          }
        }
        // Drain ACP session/load notifications first so turnToolCallIds and acpToolSnapshots are complete;
        // projectReplayHistory() below is purely synchronous and never triggers ACP notifications.
        await drain()
        collectingHistory = false
        const { entries, lastKnownStepIndex } = projectReplayHistory({
          sessionId: id,
          rows,
          inbox,
          subagents: subagentRecords,
          acpHistory: acpHistory.splice(0),
          acpToolCallIds: state.turnToolCallIds,
          acpToolSnapshots,
          acpResultProvided,
        })
        state.userTurnCount = extractUserStepRows(rows).length
        const decoratedEntries = attachReplayRevertTokens(
          entries,
          rows,
          checkpoints,
          {
            clientMessageIds: state.clientMessageIds,
            includeRevertToken: supportsRevertAny,
          },
        )
        if (lastKnownStepIndex > state.lastKnownStepIndex)
          state.lastKnownStepIndex = lastKnownStepIndex
        for (const { item, timestamp } of decoratedEntries) {
          await subagents.waitCurrentReady()
          emitItem(item, timestamp)
        }
        acpToolResults.clear()
        acpToolSnapshots.clear()
        const transcriptPath = await resolveTranscriptPath(
          brainRoot,
          state.nativeId,
        ).catch(() => null)
        if (transcriptPath) {
          const fileStat = await stat(transcriptPath).catch(() => null)
          if (fileStat) {
            lastTranscriptMtimeMs = fileStat.mtimeMs
            lastTranscriptSize = fileStat.size
          }
        }
        // A child opened by the last replayed tool must read its history before a historical kill cancels it.
        await subagents.waitNestedReady()
        await subagents.syncKilledChildren(subagentRecords)
      },
      async revert(scope: RevertScope, token: unknown) {
        let freshSessionResponse: NewSessionResponse | undefined
        const previousNativeId = state.nativeId
        const previousPersisted = state.persisted
        const previousMetadata = {
          ...state.metadata,
          ...(state.metadata.configOptions
            ? { configOptions: [...state.metadata.configOptions] }
            : {}),
        }
        const result = await revertSession({
          appDataDir,
          nativeId: state.nativeId,
          cwd,
          scope,
          token,
          supportsReload: Boolean(
            currentInitialized.agentCapabilities?.sessionCapabilities?.resume ||
            currentInitialized.agentCapabilities?.loadSession,
          ),
          deferFileRestore: true,
          createFreshSession: async () => {
            const fresh = await currentTransport.request(
              currentTransport.rpc.newSession(sessionParams(cwd, config)),
            )
            freshSessionResponse = fresh
            return fresh.sessionId
          },
        })
        if (scope !== 'files' && result.newNativeId) {
          const forkedNativeId = result.newNativeId
          let registeredOnTransport = Boolean(freshSessionResponse)
          try {
            if (state.closing || state.failed) {
              throw new Error('Session is closed')
            }
            const prevFullAccess = Boolean(previousMetadata.fullAccess)
            const canResume = Boolean(
              currentInitialized.agentCapabilities?.sessionCapabilities?.resume,
            )
            if (
              !freshSessionResponse &&
              !canResume &&
              !currentInitialized.agentCapabilities?.loadSession
            ) {
              throw new Error('agy does not support session/load')
            }

            state.nativeId = forkedNativeId
            const reloaded = await reloadSessionSilently({
              targetNativeId: forkedNativeId,
              previousMetadata,
              skipPermissions: prevFullAccess,
              replayMode: true,
              preloaded: freshSessionResponse,
              useResume: canResume,
              onRegistered: () => {
                registeredOnTransport = true
              },
            })
            if (reloaded.aborted || state.closing || state.failed) {
              throw new Error('Session is closed')
            }

            if (scope === 'both' && result.checkpointId) {
              await restoreSessionFileCheckpoint(
                appDataDir,
                previousNativeId,
                result.checkpointId,
              )
            }
            if (result.degradedToFreshSession) {
              console.warn(
                `[paseo-agy-acp] Conversation storage fork failed for ${previousNativeId}; degraded to fresh session ${forkedNativeId}.`,
              )
            }
            if (reloaded.configChanged) {
              publishConfig()
            }
            if (
              previousNativeId &&
              previousNativeId !== state.nativeId &&
              sessionIdPattern.test(previousNativeId)
            ) {
              await currentTransport
                .request(
                  currentTransport.rpc.closeSession({
                    sessionId: previousNativeId,
                  }),
                  { timeoutMs: 1500, fatalOnTimeout: false },
                )
                .catch(() => undefined)
            }

            state.persisted = config?.persist !== false
            state.lastKnownStepIndex = result.lastRetainedStepIndex ?? -1
            state.wakeup = {
              pendingReplay: false,
              suppressEcho: false,
              carriedUsage: undefined,
            }
            state.turnToolCallIds = []
            state.turnForegroundAcp = []
            state.deniedToolCallIds.clear()
            timeline.boundary()

            const [nextRows, nextSubagents, latestUsage, nextClientMessages] =
              await Promise.all([
                readTranscriptRows(brainRoot, state.nativeId).catch(
                  () => [] as Record<string, unknown>[],
                ),
                readSubagents(brainRoot, state.nativeId).catch(
                  () => [] as SubagentRecord[],
                ),
                readLatestStepUsage(brainRoot, state.nativeId).catch(
                  () => undefined,
                ),
                readSessionClientMessages(appDataDir, state.nativeId).catch(
                  () => new Map<number, string>(),
                ),
              ])
            state.clientMessageIds = nextClientMessages
            state.userTurnCount = extractUserStepRows(nextRows).length
            await subagents.reconcileAfterRevert(
              previousNativeId,
              state.nativeId,
              nextSubagents,
            )
            if (latestUsage?.lastStepUsage) {
              this.publishStepContext(latestUsage.lastStepUsage)
            } else if (
              nextRows.length === 0 &&
              usage.contextWindowUsedTokens !== undefined
            ) {
              publishUsage({
                contextWindowUsedTokens: 0,
                ...(this.contextWindowMaxTokens !== undefined
                  ? { contextWindowMaxTokens: this.contextWindowMaxTokens }
                  : {}),
              })
            } else if (reloaded.loadedUsage) {
              publishUsage(reloaded.loadedUsage)
            }
            if (
              config?.persist === false &&
              !previousPersisted &&
              previousNativeId &&
              previousNativeId !== state.nativeId &&
              sessionIdPattern.test(previousNativeId)
            ) {
              await removeForkedConversation(
                appDataDir,
                previousNativeId,
              ).catch(() => undefined)
            }
          } catch (error) {
            state.nativeId = previousNativeId
            state.persisted = previousPersisted
            state.metadata = previousMetadata
            if (
              forkedNativeId !== previousNativeId &&
              sessionIdPattern.test(forkedNativeId)
            ) {
              if (registeredOnTransport && !state.closing && !state.failed) {
                await currentTransport
                  .request(
                    currentTransport.rpc.closeSession({
                      sessionId: forkedNativeId,
                    }),
                    { timeoutMs: 1500, fatalOnTimeout: false },
                  )
                  .catch(() => undefined)
              }
              await removeForkedConversation(appDataDir, forkedNativeId).catch(
                () => undefined,
              )
            }
            if (
              state.closing &&
              !previousPersisted &&
              (config?.persist === false || state.prompts.size === 0) &&
              sessionIdPattern.test(previousNativeId)
            ) {
              await (
                config?.persist === false
                  ? removeForkedConversation
                  : removeSessionArtifacts
              )(appDataDir, previousNativeId).catch(() => undefined)
            }
            throw error
          }
        }
        return result
      },
      async canStop(): Promise<boolean> {
        if (
          state.closing ||
          state.opening ||
          state.loading ||
          state.reverting ||
          state.turn ||
          state.interrupting ||
          permissions.size > 0 ||
          subagents.hasRunningChildren()
        )
          return false
        return !(await hasActiveBackgroundWork(brainRoot, state.nativeId, {
          includeDaemons: true,
          retryTimeoutMs: options.retryTimeoutMs,
        }).catch(() => true))
      },
      async flush() {
        state.opening = false
        for (const item of buffered.splice(0))
          notificationLane = notificationLane.then(() => update(item))
        await notificationLane
      },
      async interrupt(): Promise<void> {
        if (state.reverting)
          throw new Error('Cannot interrupt while session is reverting')
        if (state.interrupting) return state.interrupting
        if (state.closing) return
        if (state.failed)
          throw new Error('ACP runtime has exited; reopen the session')
        // A settled turn with nothing to cancel acknowledges immediately instead of spending
        // the host's 2s cancel budget on RPC and relaunch. A settled turn that left background
        // work still cancels it, and a probe that cannot answer in time is treated as work.
        const settled = !state.turn && state.turnFinished
        const operation = (async () => {
          if (
            settled &&
            permissions.size === 0 &&
            !subagents.hasRunningChildren() &&
            !(await backgroundWorkWithin(
              hasActiveBackgroundWork(brainRoot, state.nativeId, {
                retryTimeoutMs: options.retryTimeoutMs,
              }).catch(() => true),
            ))
          )
            return
          state.turnAbort?.abort()
          cancelPermissions()
          // Children stay registered when canceled so they are neither reopened nor left unclosed.
          const canceling = subagents.cancelRunning()
          await Promise.all(canceling)
          // Native session/cancel leaves background tasks alive; stop their owner when background work is active.
          let needsRelaunch =
            canceling.length > 0 ||
            (await hasActiveBackgroundWork(brainRoot, state.nativeId, {
              retryTimeoutMs: options.retryTimeoutMs,
            }).catch(() => true))
          if (state.closing) return
          if (state.failed)
            throw new Error('ACP runtime has exited; reopen the session')
          try {
            if (needsRelaunch) {
              retiring.add(currentTransport)
              await Promise.all(subagents.cancelAll())
            }
            await currentTransport.request(
              currentTransport.rpc.cancel({ sessionId: state.nativeId }),
              { timeoutMs: 5000, fatalOnTimeout: false },
            )
          } catch (error) {
            // A concurrent close or forced relaunch replaces this runtime; if loadSession is supported, recover via relaunch.
            if (
              !needsRelaunch &&
              !state.closing &&
              !state.failed &&
              currentInitialized.agentCapabilities?.loadSession
            ) {
              needsRelaunch = true
              retiring.add(currentTransport)
            } else if (!state.closing && (!needsRelaunch || state.failed)) {
              throw error
            }
          } finally {
            if (needsRelaunch && !state.closing && !state.failed)
              await this.relaunch(state.skipPermissions, true)
          }
        })()
        state.interrupting = operation
        try {
          await operation
        } finally {
          if (state.interrupting === operation) state.interrupting = null
        }
      },
      relaunch(skipPermissions: boolean, force = false): Promise<void> {
        const run = relaunching.then(
          () => doRelaunch(skipPermissions, force),
          () => doRelaunch(skipPermissions, force),
        )
        relaunching = run.then(
          () => undefined,
          () => undefined,
        )
        return run
      },
      reloadForCredentials,
      close(): Promise<void> {
        if (closing) return closing
        state.closing = true
        stopIdleWatcher()
        const closingObservation = state.observation
        closingObservation?.stop()
        const closingTurnId = state.turn
        state.turnAbort?.abort()
        resolveCommands()
        closing = (async () => {
          cancelPermissions()
          await subagents.closeAll()
          if (closingTurnId) finishTurnOnce(closingTurnId, 'canceled')
          else terminalize('canceled')
          state.silenced = true
          const disposable =
            !state.persisted &&
            (config?.persist === false || state.prompts.size === 0) &&
            sessionIdPattern.test(state.nativeId)
          if (disposable)
            await currentTransport
              .request(
                currentTransport.rpc.closeSession({
                  sessionId: state.nativeId,
                }),
                { timeoutMs: 1500, fatalOnTimeout: false },
              )
              .catch(() => undefined)
          const dir = dataDirectory(launch, config?.env, cwd)
          await closingObservation?.dispose()
          await currentTransport.close().then(
            () => true,
            () => false,
          )
          if (disposable)
            await (
              config?.persist === false
                ? removeForkedConversation
                : removeSessionArtifacts
            )(dir, state.nativeId).catch(() => undefined)
        })()
        return closing
      },
    }
  } catch (error) {
    await currentTransport.close()
    throw error
  }
}

type NativeConfigKey = 'model' | 'thought_level' | 'mode'

function selectedConfigValue(
  current: ReturnType<typeof configState>,
  key: NativeConfigKey,
): string | undefined {
  return key === 'model'
    ? current.model
    : key === 'mode'
      ? current.mode
      : current.thinkingOption
}

function isAdvertisedConfigOption(
  metadata: SessionMetadata,
  current: ReturnType<typeof configState>,
  key: NativeConfigKey,
): boolean {
  return (
    Boolean(
      metadata.configOptions?.some((o) => o.id === key || o.category === key),
    ) &&
    (key !== 'thought_level' || current.thinkingOptions.length > 0)
  )
}

async function applyNativeConfigOption(
  transport: ReturnType<typeof connectAcp>,
  nativeId: string,
  metadata: NewSessionResponse & SessionMetadata,
  key: NativeConfigKey,
  value: string | undefined,
  strict = false,
): Promise<boolean> {
  if (!value) return false
  const option = metadata.configOptions?.find(
    (o) => o.id === key || o.category === key,
  )
  if (!option) {
    if (strict) throw new Error(`agy does not advertise ${key}`)
    return false
  }
  if (option.currentValue === value) return false
  const result = await transport.request(
    transport.rpc.setSessionConfigOption({
      sessionId: nativeId,
      configId: option.id,
      value,
    }),
  )
  metadata.configOptions = result.configOptions
  return true
}

/**
 * Account-scoped model catalogs mean a stored id can vanish between sessions. Only agy's
 * model/thinking availability rejection is recoverable; auth, quota and request failures
 * must surface instead of silently replacing the operator's model.
 */
const NON_AVAILABILITY_TERMS = [
  'api key',
  'unauthorized',
  'forbidden',
  'permission',
  'credential',
  'oauth',
  'sign in',
  'sign-in',
  'billing',
  'quota',
  'capacity',
  'rate limit',
  '429',
  'resource_exhausted',
  'overloaded',
  'exhausted',
  'invalid request',
  'bad request',
  'too long',
  'temporarily',
]
const UNAVAILABLE_MODEL_PHRASES = [
  /\b(unknown|unrecognized|unsupported)\s+model\s*(id|name)?\b/,
  /\bmodel\b[^.!?;]{0,60}?(not found|not supported|unsupported|unavailable|does not exist|no longer available)\b/,
]
const UNAVAILABLE_THINKING_PHRASES = [
  /\b(unknown|unrecognized|unsupported|invalid)\s+(thought_level|thinking(?: option| level)?)\b/,
  /\b(thought_level|thinking(?: option| level)?)\b[^.!?;]{0,60}?(not found|not supported|unsupported|unavailable|invalid|does not exist|no longer available)\b/,
]

function isUnavailableStoredConfig(
  key: NativeConfigKey,
  error: unknown,
): boolean {
  if (key === 'mode') return false
  const message = formatErrorMessage(error).toLowerCase()
  if (NON_AVAILABILITY_TERMS.some((term) => message.includes(term)))
    return false
  return (
    key === 'model' ? UNAVAILABLE_MODEL_PHRASES : UNAVAILABLE_THINKING_PHRASES
  ).some((pattern) => pattern.test(message))
}

/** Apply a restored value, tolerating only the account-scoped availability failure class. */
async function applyStoredConfigOption(
  transport: ReturnType<typeof connectAcp>,
  nativeId: string,
  metadata: NewSessionResponse & SessionMetadata,
  key: 'model' | 'thought_level',
  value: string,
): Promise<{ applied: boolean; unavailable: boolean }> {
  try {
    return {
      applied: await applyNativeConfigOption(
        transport,
        nativeId,
        metadata,
        key,
        value,
      ),
      unavailable: false,
    }
  } catch (error) {
    if (!isUnavailableStoredConfig(key, error)) throw error
    return { applied: false, unavailable: true }
  }
}

export const KNOWN_SETTINGS = new Set([
  'agent',
  'tools',
  'systemPromptMode',
  'promptMode',
  'additionalDirectories',
  'promptFilePath',
  'allowedTools',
])

async function configureSession(
  session: Session,
  changes: ProviderConfigChanges,
  options?: { strictThinking?: boolean; fallbackStored?: boolean },
) {
  if (session.state.closing || session.state.failed)
    throw new Error('ACP runtime has exited; reopen the session')
  if (session.state.reverting)
    throw new Error('Wait for revert to finish before changing configuration')
  if (session.state.turn)
    throw new Error('Wait for the current turn before changing configuration')
  const unknownSettings = changes.settings
    ? Object.keys(changes.settings).filter((key) => !KNOWN_SETTINGS.has(key))
    : []
  if (unknownSettings.length)
    throw new Error('Custom settings are not supported')
  const strictThinking = options?.strictThinking ?? true
  // Switching `model` dynamically adds or removes `thought_level` in `metadata.configOptions`
  // via the native RPC, so `thought_level` must be re-evaluated after `model` is applied.
  const allowMissingThinking = !strictThinking || changes.model != null
  const entries = [
    ['model', changes.model],
    ['thought_level', changes.thinkingOption],
    ['mode', changes.mode],
  ] as const
  const initial = configState(session.state.metadata)
  const initialModel = selectedConfigValue(initial, 'model')
  const initialThinking = selectedConfigValue(initial, 'thought_level')
  const initialMode = selectedConfigValue(initial, 'mode')
  const initialFullAccess = session.state.metadata.fullAccess
  const initialSkipPermissions = session.state.skipPermissions
  const appliedKeys: NativeConfigKey[] = []
  for (const [key, value] of entries) {
    if (value == null) continue
    if (key === 'mode' && value === FULL_ACCESS_MODE_ID) continue
    if (key === 'thought_level' && allowMissingThinking) continue
    if (value === selectedConfigValue(initial, key)) continue
    if (!isAdvertisedConfigOption(session.state.metadata, initial, key))
      throw new Error(`agy does not advertise ${key}`)
  }
  let mutated = false
  try {
    for (const [key, value] of entries) {
      if (value == null) continue
      const current = configState(session.state.metadata)
      if (value === selectedConfigValue(current, key)) continue
      if (!isAdvertisedConfigOption(session.state.metadata, current, key)) {
        if (key === 'thought_level' && allowMissingThinking) continue
        throw new Error(`agy does not advertise ${key}`)
      }
      if (
        key === 'thought_level' &&
        !strictThinking &&
        !current.thinkingOptions.some((o) => o.id === value)
      )
        continue
      if (key === 'mode' && value === FULL_ACCESS_MODE_ID) {
        session.state.metadata.fullAccess = true
        mutated = true
        appliedKeys.push(key)
        const nativeModes = configState({
          ...session.state.metadata,
          fullAccess: false,
        }).modes.map((m) => m.id)
        const target = ['accept-edits', 'default'].find((m) =>
          nativeModes.includes(m),
        )
        await applyNativeConfigOption(
          session.transport,
          session.state.nativeId,
          session.state.metadata,
          key,
          target,
        )
        continue
      }
      if (key === 'mode') {
        if (session.state.skipPermissions) {
          await session.relaunch(false)
        }
        session.state.metadata.fullAccess = false
        mutated = true
        appliedKeys.push(key)
      }
      if (
        options?.fallbackStored &&
        (key === 'model' || key === 'thought_level')
      ) {
        const stored = await applyStoredConfigOption(
          session.transport,
          session.state.nativeId,
          session.state.metadata,
          key,
          value,
        )
        mutated ||= stored.applied
        if (stored.applied) appliedKeys.push(key)
        if (stored.unavailable)
          session.noticeConfigFallback(
            key,
            value,
            selectedConfigValue(configState(session.state.metadata), key),
          )
        continue
      }
      const applied = await applyNativeConfigOption(
        session.transport,
        session.state.nativeId,
        session.state.metadata,
        key,
        value,
        true,
      )
      mutated ||= applied
      if (applied) appliedKeys.push(key)
    }
  } catch (error) {
    if (appliedKeys.length > 0) {
      for (const key of appliedKeys.reverse()) {
        try {
          if (key === 'mode') {
            session.state.metadata.fullAccess = initialFullAccess
            if (initialSkipPermissions !== session.state.skipPermissions) {
              await session
                .relaunch(initialSkipPermissions)
                .catch(() => undefined)
            }
            if (initialMode && initialMode !== FULL_ACCESS_MODE_ID) {
              await applyNativeConfigOption(
                session.transport,
                session.state.nativeId,
                session.state.metadata,
                'mode',
                initialMode,
                false,
              ).catch(() => undefined)
            }
          } else if (key === 'model') {
            if (initialModel) {
              await applyNativeConfigOption(
                session.transport,
                session.state.nativeId,
                session.state.metadata,
                'model',
                initialModel,
                false,
              ).catch(() => undefined)
            }
          } else if (key === 'thought_level') {
            if (initialThinking) {
              await applyNativeConfigOption(
                session.transport,
                session.state.nativeId,
                session.state.metadata,
                'thought_level',
                initialThinking,
                false,
              ).catch(() => undefined)
            }
          }
        } catch {
          /* best-effort rollback */
        }
      }
    }
    session.publishConfig()
    throw error
  }
  session.publishConfig()
}

function mcpServers(config: ProviderSessionConfig): McpServer[] {
  return Object.entries(config.mcpServers).map(([name, server]) =>
    server.type === 'stdio'
      ? {
          name,
          command: server.command,
          args: server.args ?? [],
          env: Object.entries(server.env ?? {}).map(([name, value]) => ({
            name,
            value,
          })),
        }
      : {
          name,
          type: server.type,
          url: server.url,
          headers: Object.entries(server.headers ?? {}).map(
            ([name, value]) => ({ name, value }),
          ),
        },
  )
}

async function promptSession(
  session: Session,
  input: Prompt,
  emit: SessionOptions['emit'],
) {
  const p = input.prompt
  if (session.state.prompts.has(p.clientMessageId)) return
  if (p.clearPendingPermissions) session.cancelPermissions()
  if (session.state.closing) throw new Error('Session is closing')
  if (session.state.opening || session.state.loading)
    throw new Error('Session is not ready')
  if (session.state.reverting) throw new Error('Session is reverting')
  if (session.state.turn) throw new Error('Session already has an active turn')
  if (session.state.failed)
    throw new Error('ACP runtime has exited; reopen the session')
  if (p.delivery === 'steer' || p.outputSchema)
    throw new Error('Steering and output schemas are not supported')
  if (p.input.type === 'message') {
    validatePromptImages(
      p.input.content,
      session.initialized.agentCapabilities?.promptCapabilities?.image,
    )
  }
  // Safe point: pick up a credentials switch observed since the previous prompt.
  await session.reloadForCredentials()
  if (session.state.closing) throw new Error('Session is closing')
  if (session.state.failed)
    throw new Error('ACP runtime has exited; reopen the session')
  const blocks: ContentBlock[] =
    p.input.type === 'command'
      ? [
          {
            type: 'text',
            text: `/${p.input.name} ${p.input.arguments}`.trim(),
          },
        ]
      : p.input.content.map(promptContent)
  const turnId = randomUUID()
  const turnAbort = new AbortController()
  const isCompactCommand =
    (p.input.type === 'command' && p.input.name === 'compact') ||
    (p.input.type === 'message' &&
      blocks.length === 1 &&
      blocks[0].type === 'text' &&
      (blocks[0].text.trim() === '/compact' ||
        blocks[0].text.trim().startsWith('/compact ')))
  const expectsUserEcho =
    p.input.type === 'message' &&
    blocks.some((c) => c.type !== 'text' || c.text.trim().length > 0)
  session.state.turn = turnId
  session.state.turnAbort = turnAbort
  session.state.turnFinished = false
  session.state.turnStartedAt = Date.now()
  session.state.turnLastProgressAt = session.state.turnStartedAt
  session.state.turnToolFailure = undefined
  session.state.turnHadContextUsage = false
  session.state.turnHadModelOutput = false
  session.state.inSettle = false
  session.state.handledElicitations = []
  session.state.suppressContinuationAcp = false
  session.state.preStagedQuestion = undefined
  session.state.turnToolCallIds = []
  session.state.turnForegroundAcp = []
  session.state.deniedToolCallIds.clear()
  const hadPendingReplay = session.state.wakeup.pendingReplay
  const prevCarried = session.state.wakeup.carriedUsage
  const initialTransport = session.transport
  session.state.wakeup.suppressEcho = hadPendingReplay && expectsUserEcho
  session.state.wakeup.pendingReplay = false
  session.state.prompts.add(p.clientMessageId)
  session.timeline.boundary()
  const turnOrdinal = session.state.userTurnCount++
  const userText = blocks
    .map((c) => (c.type === 'text' ? c.text : '[image]'))
    .join('\n')
  const nativeId = session.state.nativeId
  const dbPath = join(session.appDataDir, 'conversations', `${nativeId}.db`)
  const preTurnDbIdentity = getFileIdentity(dbPath)
  let minStepIndex: number | undefined
  let checkpointId: string | undefined
  try {
    const dbStep = readLastStepIndexFromDb(session.appDataDir, nativeId)
    const readStep = await readLastStepIndex(session.brainRoot, nativeId).catch(
      () => -1,
    )
    minStepIndex = Math.max(session.state.lastKnownStepIndex, readStep, dbStep)
    session.state.lastKnownStepIndex = minStepIndex
    if (session.supportsRevertFiles) {
      const checkpoint = await captureTurnFileCheckpoint(
        session.appDataDir,
        nativeId,
        session.cwd,
        minStepIndex,
      ).catch((err) => {
        console.warn(
          `[paseo-agy-acp] turn file checkpoint capture failed for nativeId=${nativeId}:`,
          err,
        )
        return undefined
      })
      if (checkpoint) {
        checkpointId = checkpoint.id
      }
    }
    turnAbort.signal.throwIfAborted()
  } catch (error) {
    if (
      session.state.turn === turnId &&
      session.state.turnAbort === turnAbort
    ) {
      session.state.turnAbort = null
      session.state.turn = ''
      session.state.wakeup.suppressEcho = false
      session.state.prompts.delete(p.clientMessageId)
      session.state.userTurnCount = Math.max(0, session.state.userTurnCount - 1)
    }
    throw error
  }
  session.state.clientMessageIds.set(turnOrdinal, p.clientMessageId)
  void recordSessionClientMessage(
    session.appDataDir,
    nativeId,
    turnOrdinal,
    minStepIndex ?? -1,
    p.clientMessageId,
  ).catch(() => undefined)
  const revertToken = session.supportsRevertAny
    ? makeRevertToken({
        clientMessageId: p.clientMessageId,
        afterStepIndex: minStepIndex,
        turnOrdinal,
        checkpointId,
        text: userText,
      })
    : undefined
  emit({
    type: 'timeline.item',
    sessionId: session.id,
    item: {
      type: 'user_message',
      id: `${session.id}:user:${p.clientMessageId}`,
      text: userText,
      clientMessageId: p.clientMessageId,
      ...(revertToken !== undefined ? { revertToken } : {}),
    },
  })
  emit({
    type: 'session.prompt_result',
    sessionId: session.id,
    clientMessageId: p.clientMessageId,
    result: { type: 'turn', turnId },
  })
  emit({
    type: 'session.turn',
    sessionId: session.id,
    turnId,
    state: 'started',
  })
  let observation: BrainTurnObservation | undefined
  let observationTransport = session.transport
  let continuationActive = false
  let pastWaitPrompt = false
  let suppressedForeground = false
  let effectiveUsage: Usage | null | undefined
  let lastStep: StepUsage | undefined
  let turnWokeUp = false
  let turnWakeupUsage: StepUsage | undefined
  let nextCarriedWakeup: StepUsage | undefined
  let settledPendingReplay = false
  let hasWakeupState = false
  const settleTurnUsageAndWakeup = (isError: boolean) => {
    const runtimeRelaunched = session.transport !== initialTransport
    const replayStillPending =
      !runtimeRelaunched &&
      hadPendingReplay &&
      (!expectsUserEcho ||
        (pastWaitPrompt
          ? suppressedForeground
          : session.state.wakeup.suppressEcho))
    if (runtimeRelaunched) {
      session.state.wakeup.pendingReplay = false
      session.state.wakeup.carriedUsage = undefined
    } else {
      session.state.wakeup.pendingReplay = Boolean(
        settledPendingReplay ||
        (isError &&
          turnWokeUp &&
          !hasWakeupState &&
          !session.state.closing &&
          !session.state.failed) ||
        (replayStillPending && !effectiveUsage && !turnWokeUp),
      )
      session.state.wakeup.carriedUsage = effectiveUsage
        ? nextCarriedWakeup
        : nextCarriedWakeup
          ? addStepUsage(prevCarried, nextCarriedWakeup)
          : prevCarried
    }
    const preserveContext = session.state.turnHadContextUsage && !turnWokeUp
    if (effectiveUsage || turnWakeupUsage) {
      session.publishUsage(
        promptUsage(effectiveUsage, {
          model: configState(session.state.metadata).model,
          contextWindowMaxTokens: session.contextWindowMaxTokens,
          preserveContext,
          lastStep,
          carriedWakeup: prevCarried,
          wakeup: turnWakeupUsage,
        }),
      )
    } else if (lastStep && !preserveContext && (!isError || isCurrent())) {
      session.publishStepContext(lastStep)
    }
  }
  const isCurrent = () =>
    session.state.turn === turnId &&
    session.state.turnAbort === turnAbort &&
    !session.state.closing &&
    !session.state.silenced &&
    session.state.nativeId === nativeId &&
    session.transport === observationTransport
  const stopObservation = () => observation?.stop()
  turnAbort.signal.addEventListener('abort', stopObservation, { once: true })
  const disposeTurnWork = async () => {
    turnAbort.signal.removeEventListener('abort', stopObservation)
    await observation?.dispose()
  }
  const resetTurnState = () => {
    if (
      session.state.turn === turnId &&
      session.state.turnAbort === turnAbort
    ) {
      session.state.observation = null
      session.state.wakeup.suppressEcho = false
      session.state.inSettle = false
      session.state.handledElicitations = []
      session.state.suppressContinuationAcp = false
      session.state.preStagedQuestion = undefined
      session.state.turnAbort = null
      session.state.turn = ''
      session.timeline.boundary()
      session.cancelPermissions()
    }
  }
  let settleForStall!: (error: Error) => void
  const stallSettlement = new Promise<{ ok: false; error: Error }>(
    (resolve) => {
      settleForStall = (error) => resolve({ ok: false, error })
    },
  )
  const turnDeadlineMs = session.turnStallTimeoutMs ?? 120_000
  const toolDeadlineMs = session.toolStallTimeoutMs ?? 600_000
  const toolNoticeMs = session.toolNoticeMs ?? 60_000
  let watchdogTimer: NodeJS.Timeout | undefined
  let watchdogFired = false
  let watchdogRevision = 0
  let toolClockActive = false
  let lastNoticeAt = 0
  let noticeSeq = 0
  // Suspension markers: waiting on the user stops the clock instead of renewing it.
  let pausedAt: number | undefined
  let childWaitStartedAt: number | undefined
  const stopWatchdog = () => {
    if (watchdogTimer) clearTimeout(watchdogTimer)
    watchdogTimer = undefined
  }
  const fireStall = (error: Error) => {
    if (watchdogFired) return
    watchdogFired = true
    settleForStall(error)
    session.state.turnAbort?.abort(error)
    // Never calls transport.fail() directly. session.interrupt() may relaunch the runtime when
    // background work is detected; the watchdog itself only guarantees the turn settles.
    void session.interrupt().catch(() => undefined)
  }
  const armWatchdog = () => {
    const tickMs = Math.min(
      1000,
      Math.max(
        10,
        Math.floor(Math.min(turnDeadlineMs, toolDeadlineMs, toolNoticeMs) / 4),
      ),
    )
    const tick = () => {
      watchdogTimer = undefined
      if (session.state.turn !== turnId || session.state.turnFinished) return
      const now = Date.now()
      const tools = session.timeline.runningTools()
      // Turn progress is not evidence while a tool clock governs; the turn clock is suspended.
      if (
        tools.length === 0 &&
        observation &&
        observation.revision !== watchdogRevision
      ) {
        watchdogRevision = observation.revision
        session.state.turnLastProgressAt = now
      }
      if (session.permissions.size > 0) {
        // User wait: suspend with no renewal. Waking resets the deadline below.
        pausedAt ??= now
        childWaitStartedAt = undefined
        scheduleTick()
        return
      }
      if (session.hasRunningChildren()) {
        // Children that never report are bounded, not exempt indefinitely.
        pausedAt ??= now
        childWaitStartedAt ??= now
        if (now - childWaitStartedAt >= turnDeadlineMs) {
          fireStall(
            Object.assign(
              new Error(
                `Turn ${turnId} waited ${Math.round(turnDeadlineMs / 1000)}s for a child session that never reported; failing it because no terminal evidence arrived.`,
              ),
              { name: 'TurnStalledError' },
            ),
          )
          return
        }
        scheduleTick()
        return
      }
      if (tools.length > 0) {
        // Tool clock: the oldest running tool governs; the turn-silence clock does not accrue.
        const tool = tools.reduce((oldest, candidate) =>
          candidate.startedAt < oldest.startedAt ? candidate : oldest,
        )
        if (!toolClockActive) {
          toolClockActive = true
          lastNoticeAt = tool.startedAt
        }
        const elapsed = now - tool.startedAt
        if (elapsed >= toolDeadlineMs) {
          const message = `Tool "${tool.name}" produced no result within ${Math.round(toolDeadlineMs / 1000)}s (running ${Math.round(elapsed / 1000)}s); failing the turn because the tool clock expired.`
          session.state.turnToolFailure = { id: tool.id, error: message }
          fireStall(
            Object.assign(new Error(message), { name: 'TurnStalledError' }),
          )
          return
        }
        if (now - lastNoticeAt >= toolNoticeMs) {
          // UI heartbeat only: rendered on the timeline, never turn progress or a tool result.
          lastNoticeAt = now
          noticeSeq++
          emit({
            type: 'timeline.item',
            sessionId: session.id,
            item: {
              id: `${session.id}:tool-notice:${tool.id}:${noticeSeq}`,
              type: 'notification',
              level: 'info',
              message: `Tool "${tool.name}" is still running (${Math.round(elapsed / 1000)}s elapsed).`,
            },
          })
        }
        scheduleTick()
        return
      }
      if (toolClockActive) {
        // Last running tool settled: restart the turn clock from a full fresh deadline.
        toolClockActive = false
        lastNoticeAt = 0
        session.state.turnLastProgressAt = now
      }
      if (pausedAt !== undefined) {
        // Wake: restart the deadline from the moment the wait ended.
        pausedAt = undefined
        childWaitStartedAt = undefined
        session.state.turnLastProgressAt = now
      }
      if (now - session.state.turnLastProgressAt >= turnDeadlineMs) {
        fireStall(
          Object.assign(
            new Error(
              `Turn ${turnId} made no progress for ${Math.round(turnDeadlineMs / 1000)}s; failing it because no terminal evidence arrived.`,
            ),
            { name: 'TurnStalledError' },
          ),
        )
        return
      }
      scheduleTick()
    }
    const scheduleTick = () => {
      watchdogTimer = setTimeout(tick, tickMs)
      watchdogTimer.unref()
    }
    scheduleTick()
  }
  const waitPrompt = async (
    operation: ReturnType<typeof session.transport.rpc.prompt>,
  ) => {
    const transport = session.transport
    const outcome = operation.then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    )
    let aborted!: () => void
    const cancellation = new Promise<null>((resolve) => {
      aborted = () => resolve(null)
    })
    turnAbort.signal.addEventListener('abort', aborted, { once: true })
    try {
      if (turnAbort.signal.aborted) aborted()
      let result = await Promise.race([outcome, cancellation, stallSettlement])
      if (!result) {
        if (session.state.closing) throw turnAbort.signal.reason
        await session.state.interrupting
        if (session.state.closing) throw turnAbort.signal.reason
        // Cancel is a notification. Bound convergence with the existing control-request policy, not a flush sleep.
        try {
          result = await transport.request(outcome, { fatalOnTimeout: false })
        } catch (error) {
          if (!session.state.closing && session.transport === transport)
            await session.relaunch(session.state.skipPermissions, true)
          throw error
        }
      }
      if (!result.ok) throw result.error
      return result.value
    } finally {
      turnAbort.signal.removeEventListener('abort', aborted)
    }
  }
  const finalDrain = async () => {
    observation?.stop()
    if (session.state.closing || session.state.silenced) return
    await session.state.interrupting
    await session.drain()
    if (
      session.state.turn !== turnId ||
      session.state.turnAbort !== turnAbort ||
      session.state.closing ||
      session.state.silenced ||
      session.state.nativeId !== nativeId
    )
      return
    if (session.transport !== observationTransport && !turnAbort.signal.aborted)
      return
    observationTransport = session.transport
    await observation?.drain()
  }
  let finalSnapshot: Promise<StepUsage | undefined> | undefined
  const reconcileFinalSnapshot = (fallback?: StepUsage) =>
    (finalSnapshot ??= (async () => {
      await finalDrain()
      if (!isCurrent() || minStepIndex === undefined) return
      const observed = observation?.usage.latest ?? fallback
      // A complete EOF can be newer than streamed rows; it is a measurement, not snapshot commit evidence.
      const snapshot = await readLatestStepUsage(
        session.brainRoot,
        nativeId,
        Math.max(minStepIndex, (observation?.usage.latestStepIndex ?? -1) - 1),
      ).catch(() => undefined)
      if (!isCurrent()) return
      if (snapshot)
        session.state.lastKnownStepIndex = Math.max(
          session.state.lastKnownStepIndex,
          snapshot.lastStepIndex,
        )
      return snapshot?.lastStepUsage ?? observed
    })())
  try {
    turnAbort.signal.throwIfAborted()
    observation = new BrainTurnObservation(
      session.brainRoot,
      nativeId,
      session.id,
      minStepIndex ?? session.state.lastKnownStepIndex,
      {
        isCurrent,
        onUsage: (usage) => {
          if (
            session.state.turnHadContextUsage &&
            !observation?.wokeUp &&
            observation?.phase !== 'continuation'
          )
            return false
          session.publishStepContext(usage)
        },
        onItem: session.emitItem,
        onBoundary: (index, reconciled) => {
          if (!isCurrent() || index < 0) return
          session.state.lastKnownStepIndex = reconciled
            ? index
            : Math.max(session.state.lastKnownStepIndex, index)
        },
      },
    )
    session.state.observation = observation
    observation.start()
    await beginTurnJournal(session.appDataDir, {
      turnId,
      clientMessageId: p.clientMessageId,
      nativeId,
      startedAt: session.state.turnStartedAt,
      status: 'running',
    }).catch((error) => {
      throw new Error(
        `Could not persist the turn journal before dispatch; failing the turn so a restart cannot resurrect it as running: ${formatErrorMessage(error)}`,
      )
    })
    armWatchdog()
    const result = await waitPrompt(
      session.transport.rpc.prompt({
        sessionId: session.state.nativeId,
        prompt: blocks,
      }),
    )
    await session.drain()
    if (!isCurrent() && !turnAbort.signal.aborted)
      throw new Error('ACP runtime replaced during turn')
    suppressedForeground = session.state.wakeup.suppressEcho
    pastWaitPrompt = true
    session.state.wakeup.suppressEcho = false
    effectiveUsage = hasPositivePromptUsage(result.usage)
      ? result.usage
      : undefined
    const mapped = mapTerminalStopReason(result.stopReason)
    let status: 'completed' | 'canceled' | 'failed' = mapped.status
    let turnError: string | ProviderError | undefined = mapped.error
    if (status === 'completed') {
      session.state.inSettle = true
      const settled = await settleBrainTurn(
        session.brainRoot,
        session.state.nativeId,
        session.id,
        session.emitItem,
        {
          signal: turnAbort.signal,
          observation,
          expectCheckpoint: isCompactCommand,
          isRpcActive: () => continuationActive,
          onSubagents: session.rememberSubagents,
          minStepIndex,
          acpToolCallIds: session.state.turnToolCallIds,
          onWakeupState: (wakeup) => {
            hasWakeupState = true
            turnWokeUp = wakeup.wokeUp
            turnWakeupUsage = wakeup.wakeupUsage
            nextCarriedWakeup = wakeup.carriedWakeupUsage
            settledPendingReplay = Boolean(wakeup.pendingReplay)
          },
          foregroundAcp: suppressedForeground
            ? []
            : [...session.state.turnForegroundAcp],
          deniedToolCallIds: session.state.deniedToolCallIds,
          emitForeground: suppressedForeground,
          shouldEmitPreWakeupTool: (item) =>
            session.timeline.isRunning(item.id) ||
            (item.detail.type === 'sub_agent' &&
              item.detail.childSessionId !== undefined &&
              session.canLinkChild(
                item.detail.childSessionId,
                session.state.nativeId,
                item.name,
              ) &&
              // Unknown children open, interrupted ones resume.
              (!session.hasChild(item.detail.childSessionId) ||
                session.isChildResumable(item.detail.childSessionId))),
          onStep: (stepIndex) => {
            if (stepIndex > session.state.lastKnownStepIndex)
              session.state.lastKnownStepIndex = stepIndex
          },
          // A model turn always writes USER_INPUT; give agy a moment to flush it. Native commands may write none.
          transcriptGraceMs:
            session.state.turnHadModelOutput ||
            suppressedForeground ||
            isCompactCommand
              ? 2000
              : 0,
          stallTimeoutMs: session.stallTimeoutMs,
          retryTimeoutMs: session.retryTimeoutMs,
          getChildFailure: session.getChildFailure,
          isWaitingOnUser: () =>
            session.permissions.size > 0 || session.hasRunningChildren(),
          onQuestionSettled: (questions, wokeUp) => {
            const idx = session.state.handledElicitations.findIndex(
              (entry) =>
                entry.wokeUp === wokeUp &&
                sameNormalizedQuestions(entry.questions, questions),
            )
            if (idx >= 0) session.state.handledElicitations.splice(idx, 1)
          },
          onQuestion: async (pendingQuestion) => {
            const handledIndex = session.state.handledElicitations.findIndex(
              (entry) =>
                entry.wokeUp === pendingQuestion.wokeUp &&
                sameNormalizedQuestions(
                  entry.questions,
                  pendingQuestion.questions,
                ),
            )
            if (handledIndex >= 0) {
              const [handled] = session.state.handledElicitations.splice(
                handledIndex,
                1,
              )
              if (pendingQuestion.wokeUp && handled.declined) {
                await session.interrupt()
                return { status: 'canceled' }
              }
              return {
                status: pendingQuestion.wokeUp ? 'answered' : 'already_handled',
                answerText: handled.answerText ?? undefined,
              }
            }
            const pending = session.askUserQuestion(
              pendingQuestion.questions,
              pendingQuestion.questions[0]?.question,
              'brain',
            )
            if (!pending) return { status: 'canceled' }
            const response = await pending.promise
            if (!response || turnAbort.signal.aborted) {
              return { status: 'canceled' }
            }
            if (observation?.error) throw observation.error
            if (!isCurrent())
              throw new Error('ACP runtime replaced during question')
            if (response.behavior === 'deny') {
              await session.interrupt()
              return { status: 'canceled' }
            }
            const answerText =
              formatQuestionAnswersText(pending.entry.questions, response) ||
              'Proceed'
            if (pending.entry.fromElicitation) {
              return { status: 'answered', answerText }
            }
            session.state.preStagedQuestion = {
              questions: pendingQuestion.questions,
              response,
            }
            pendingQuestion.beginContinuation?.(answerText)
            session.state.suppressContinuationAcp = true
            session.state.continuationEchoSeen = false
            continuationActive = true
            if (observation) {
              observation.phase = 'continuation'
              observation.wokeUp = true
            }
            try {
              const contResult = await waitPrompt(
                session.transport.rpc.prompt({
                  sessionId: session.state.nativeId,
                  prompt: [{ type: 'text', text: answerText }],
                }),
              )
              await session.drain()
              if (contResult.stopReason === 'cancelled') {
                return {
                  status: 'canceled',
                  preserveCarriedWakeup: !hasPositivePromptUsage(
                    contResult.usage,
                  ),
                  preservePendingReplay: !session.state.continuationEchoSeen,
                }
              }
            } catch (error) {
              pendingQuestion.restoreContinuationCarry?.(
                !session.state.continuationEchoSeen,
              )
              throw error
            } finally {
              continuationActive = false
              if (observation?.acceptsRows()) observation.phase = 'settling'
              session.state.suppressContinuationAcp = false
              session.state.preStagedQuestion = undefined
            }
            return { status: 'answered', answerText }
          },
        },
      )
      await session.syncKilledChildren()
      status = settled.status
      turnError = settled.error
      lastStep = settled.lastStepUsage
      turnWokeUp = Boolean(settled.wokeUp)
      turnWakeupUsage = settled.wakeupUsage
      nextCarriedWakeup = settled.carriedWakeupUsage
      settledPendingReplay = Boolean(settled.pendingReplay)
      if (
        settled.stalled &&
        !turnAbort.signal.aborted &&
        !session.state.closing &&
        !session.state.failed
      ) {
        await session.interrupt().catch(() => undefined)
      }
    }
    lastStep = await reconcileFinalSnapshot(lastStep)
    turnWokeUp ||= observation?.wokeUp === true
    if (turnAbort.signal.aborted) {
      if (
        turnAbort.signal.reason instanceof Error &&
        turnAbort.signal.reason.name === 'AbortError'
      ) {
        // Stall failures cancel the runtime for cleanup without changing their terminal status.
        if (status !== 'failed') status = 'canceled'
      } else turnAbort.signal.throwIfAborted()
    }
    // Inspection may enrich a failed terminal or resolve a refusal, but it must never
    // downgrade a turn that already has positive terminal evidence (legit stopReason).
    const postTurnDbIdentity = getFileIdentity(dbPath)
    const isSameDb = sameFile(preTurnDbIdentity, postTurnDbIdentity)
    const effectiveMinStep = isSameDb ? minStepIndex : -1
    let inspected: UpstreamQuotaError | undefined
    if (status === 'failed' || result.stopReason === 'refusal') {
      inspected = inspectConversationError(
        session.appDataDir,
        session.state.nativeId,
        effectiveMinStep,
        Date.now(),
        { dbIdentity: isSameDb ? postTurnDbIdentity : undefined },
      )
      const structuredError = buildTurnError(
        result.stopReason,
        inspected,
        typeof turnError === 'string' ? turnError : undefined,
      )
      if (structuredError) {
        status = 'failed'
        turnError = structuredError
      }
    }
    // Shubzkothekar invariant: advance step cursor even on failed turns so stale errors aren't re-read
    const maxDbStep = readLastStepIndexFromDb(
      session.appDataDir,
      session.state.nativeId,
    )
    const candidateStep = Math.max(
      inspected?.stepIndex ?? -1,
      maxDbStep,
      observation?.usage.latestStepIndex ?? -1,
    )
    if (candidateStep > session.state.lastKnownStepIndex) {
      session.state.lastKnownStepIndex = candidateStep
    }
    settleTurnUsageAndWakeup(false)
    await disposeTurnWork()
    if (status !== 'completed') {
      await syncTurnCountFromTranscript(session)
    }
    session.finishTurnOnce(turnId, status, turnError)
    resetTurnState()
  } catch (error) {
    const restartError = session.state.closing
      ? undefined
      : await session.state.interrupting?.then(
          () => undefined,
          (err: unknown) => err,
        )
    lastStep = await reconcileFinalSnapshot(lastStep).catch(
      () => observation?.usage.latest,
    )
    turnWokeUp ||= observation?.wokeUp === true
    settleTurnUsageAndWakeup(true)
    const turnError = restartError ?? error
    const status =
      !restartError &&
      turnAbort.signal.aborted &&
      turnAbort.signal.reason instanceof Error &&
      turnAbort.signal.reason.name === 'AbortError'
        ? 'canceled'
        : 'failed'
    const message = formatErrorMessage(turnError)
    // Advance step cursor on error
    const maxDbStep = readLastStepIndexFromDb(
      session.appDataDir,
      session.state.nativeId,
    )
    const candidateStep = Math.max(
      maxDbStep,
      observation?.usage.latestStepIndex ?? -1,
    )
    if (candidateStep > session.state.lastKnownStepIndex) {
      session.state.lastKnownStepIndex = candidateStep
    }
    await disposeTurnWork()
    await syncTurnCountFromTranscript(session)
    session.finishTurnOnce(turnId, status, message)
    resetTurnState()
  } finally {
    stopWatchdog()
    await disposeTurnWork()
    resetTurnState()
    // Safe point: a switch observed during this turn reloads before the next prompt.
    await session.reloadForCredentials()
  }
}

/** Missing or unknown stop reasons are not terminal evidence; only explicit legit terminals complete. */
function mapTerminalStopReason(reason: string | undefined): {
  status: 'completed' | 'canceled' | 'failed'
  error?: string
} {
  if (reason === 'cancelled') return { status: 'canceled' }
  if (
    reason === 'end_turn' ||
    reason === 'max_tokens' ||
    reason === 'max_turn_requests' ||
    // `refusal` flows through the existing buildTurnError path, which converts it to failed.
    reason === 'refusal'
  )
    return { status: 'completed' }
  return {
    status: 'failed',
    error:
      reason === undefined
        ? 'agy ended the turn without a stop reason; failing it because no terminal evidence was recorded.'
        : `agy returned an unrecognized stop reason "${reason}"; failing the turn because there is no terminal evidence it completed.`,
  }
}

async function syncTurnCountFromTranscript(session: {
  brainRoot: string
  state: {
    closing: boolean
    nativeId: string
    userTurnCount: number
  }
}): Promise<void> {
  if (session.state.closing || !sessionIdPattern.test(session.state.nativeId)) {
    return
  }
  const rows = await readTranscriptRows(
    session.brainRoot,
    session.state.nativeId,
  ).catch(() => null)
  if (rows === null) return
  session.state.userTurnCount =
    rows.length > 0
      ? extractUserStepRows(rows).length
      : Math.max(0, session.state.userTurnCount - 1)
}
