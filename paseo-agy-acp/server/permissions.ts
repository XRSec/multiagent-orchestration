import { z } from 'zod'
import type {
  ProviderPermissionAction,
  ProviderPermissionRequest,
  ProviderToolCallDetail,
  ProviderToolPolicy,
} from '@getpaseo/plugin/server/provider'
import {
  classifyPlanModeTool,
  cleanToolName,
  isAskQuestionName,
  record,
  str,
  unwrapToolTitle,
} from './common.ts'

export const SECURITY_WARNING_MAX_CHARS = 512

export interface SecurityWarning {
  title?: string
  message?: string
}

/** Validate the permission fields consumed by the bridge before creating pending work. */
export const RequestPermissionRequestSchema = z.object({
  sessionId: z.string().min(1),
  toolCall: z
    .object({
      toolCallId: z.string().min(1),
      title: z.string().nullish(),
      rawInput: z.json().optional(),
    })
    .passthrough(),
  options: z
    .array(
      z.object({
        optionId: z.string().min(1),
        name: z.string(),
        kind: z.enum([
          'allow_once',
          'allow_always',
          'reject_once',
          'reject_always',
        ]),
        _meta: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .min(1),
})

/** Multiple options of the same allow_* kind represent a multiple-choice question rather than a binary approval. */
function isChooserRequest(options: ReadonlyArray<{ kind: string }>): boolean {
  const seen = new Set<string>()
  for (const option of options) {
    if (!option.kind.startsWith('allow')) continue
    if (seen.has(option.kind)) return true
    seen.add(option.kind)
  }
  return false
}

/** Select the matching ACP permission option for an allow/deny decision, preferring *_once when no optionId is specified. */
export function pickPermissionOption<
  T extends { optionId: string; kind: string },
>(
  options: readonly T[],
  behavior: 'allow' | 'deny',
  selectedActionId?: string,
): T | undefined {
  const prefix = behavior === 'allow' ? 'allow' : 'reject'
  if (selectedActionId) {
    return options.find(
      (o) => o.optionId === selectedActionId && o.kind.startsWith(prefix),
    )
  }
  const preferred = `${prefix}_once`
  return (
    options.find((o) => o.kind === preferred) ??
    options.find((o) => o.kind.startsWith(prefix))
  )
}

function boundWarningText(value: unknown): string | undefined {
  const s = str(value)?.trim()
  if (!s) return undefined
  return s.length <= SECURITY_WARNING_MAX_CHARS
    ? s
    : `${s.slice(0, SECURITY_WARNING_MAX_CHARS - 3)}...`
}

/** Extract bounded security warning metadata from an allow_always permission option. */
export function extractSecurityWarning(option: {
  kind: string
  _meta?: Record<string, unknown> | null
}): SecurityWarning | undefined {
  if (option.kind !== 'allow_always') return undefined
  const raw = option._meta?.['agy.security.warning']
  if (raw === undefined || raw === null) return undefined
  if (typeof raw === 'string') {
    const message = boundWarningText(raw)
    return message ? { message } : undefined
  }
  const obj = record(raw)
  const title = boundWarningText(obj.title)
  const message = boundWarningText(obj.message)
  if (!title && !message) return undefined
  return {
    ...(title ? { title } : {}),
    ...(message ? { message } : {}),
  }
}

/** Map ACP permission options to Paseo actions, marking warned allow_always options as danger. */
export function mapPermissionActions(
  options: ReadonlyArray<{
    optionId: string
    name: string
    kind: string
    _meta?: Record<string, unknown> | null
  }>,
): ProviderPermissionAction[] {
  return options.map((o) => {
    const warning = extractSecurityWarning(o)
    return {
      id: o.optionId,
      label: o.name,
      behavior: o.kind.startsWith('allow') ? 'allow' : 'deny',
      ...(warning ? { variant: 'danger' as const } : {}),
    }
  })
}

/** Build prompt description and metadata when an option carries agy.security.warning. */
export function extractSecurityWarningPromptInfo(
  options: ReadonlyArray<{
    kind: string
    _meta?: Record<string, unknown> | null
  }>,
): {
  description?: string
  metadata?: ProviderPermissionRequest['metadata']
} {
  for (const option of options) {
    const warning = extractSecurityWarning(option)
    if (!warning) continue
    const parts = [warning.title, warning.message].filter(Boolean)
    const combined = boundWarningText(parts.join(': '))
    return {
      ...(combined ? { description: combined } : {}),
      metadata: {
        securityWarning: {
          ...(warning.title ? { title: warning.title } : {}),
          ...(warning.message ? { message: warning.message } : {}),
        },
      },
    }
  }
  return {}
}

/** Classify an ACP permission request into Paseo's permission kinds. */
export function permissionKind(
  request: {
    options: ReadonlyArray<{ kind: string }>
    toolCall: { toolCallId?: string; title?: string | null; kind?: unknown }
  },
  detail: ProviderToolCallDetail,
): 'question' | 'mode' | 'plan' | 'tool' {
  const explicitRawName = str(record(request.toolCall).name)
  const identity =
    explicitRawName !== undefined
      ? cleanToolName(explicitRawName)
      : unwrapToolTitle(request.toolCall.title ?? '')
  if (
    isChooserRequest(request.options) ||
    isAskQuestionName(identity) ||
    request.toolCall.toolCallId?.startsWith('interaction_')
  )
    return 'question'
  if (
    classifyPlanModeTool(
      explicitRawName,
      request.toolCall.title,
      str(request.toolCall.kind),
    ) !== undefined
  )
    return 'mode'
  if (detail.type === 'plan') return 'plan'
  return 'tool'
}

/** Check whether an ACP tool call matches an exact MCP preapproval grant in config.toolPolicy. */
export function isPreapprovedMcpTool(
  title: string | null | undefined,
  input: Record<string, unknown>,
  policy: ProviderToolPolicy | undefined,
): boolean {
  if (!policy?.preapproved.length) return false
  const cleaned = cleanToolName(title ?? '')
  const lazyServer = str(input.ServerName ?? input.serverName ?? input.server)
  const lazyTool = str(input.ToolName ?? input.toolName ?? input.tool)
  return policy.preapproved.some((grant) => {
    if (grant.kind !== 'mcp') return false
    if (
      cleaned === 'call_mcp_tool' &&
      lazyServer === grant.server &&
      lazyTool === grant.tool
    )
      return true
    return (
      cleaned === `mcp__${grant.server}__${grant.tool}` ||
      cleaned === `${grant.server}:${grant.tool}`
    )
  })
}
