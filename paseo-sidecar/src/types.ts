export type RuntimeType =
  | "claude-code"
  | "claude-desktop"
  | "claude-desktop-3p"
  | "codex"
  | "openhands"
  | "cursor"
  | "gemini-cli";

export interface HookEventPayload {
  runtime: RuntimeType;
  session_id: string;
  canonical_cwd: string;
  event_name: string;
  timestamp: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: unknown;
  prompt?: string;
  metadata?: Record<string, unknown>;
}

export interface SubHookDescriptor {
  id: string;
  plugin_id: string;
  event_name: string;
  matcher?: string;
  command?: string;
  handler_type: "command" | "mcp" | "http" | "inline";
  timeout_ms?: number;
  priority?: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

export interface NormalizedPluginBundle {
  plugin_id: string;
  name: string;
  version: string;
  source_runtime: RuntimeType | "native";
  root_dir: string;
  hooks: SubHookDescriptor[];
  skills?: string[];
  mcp_servers?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  canonical_cwd: string;
  runtimes?: RuntimeType[];
  session_ids?: string[];
  plugins: string[];
  env?: Record<string, string>;
  enabled: boolean;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  session_id: string;
  runtime: RuntimeType;
  canonical_cwd: string;
  workspace_id?: string;
  started_at: string;
  last_event_at: string;
  event_count: number;
  active: boolean;
  metadata?: Record<string, unknown>;
}

export interface HookDispatchResult {
  hook_id: string;
  plugin_id: string;
  event_name: string;
  status: "ok" | "error" | "blocked" | "skipped" | "timeout";
  decision?: "allow" | "deny" | "modify";
  duration_ms: number;
  output?: unknown;
  error?: string;
  modified_payload?: Partial<HookEventPayload>;
}
