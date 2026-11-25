// The plugin's own tools, served to every local bot chat as the MCP server
// "bots": other bots, past chats, the setup, and proposals (skills, routines,
// setup changes, app connections) the user confirms in the chat.

export const TOOLS_MCP_NAME = "bots";

export function isAgyProvider(provider: string): boolean {
  return provider === "antigravity" || provider === "agy" || provider === "agy-acp";
}

export function isClaudeProvider(provider: string): boolean {
  return /^claude(\b|-)/.test(provider);
}

export function isCodexProvider(provider: string): boolean {
  return /^codex(\b|-)/.test(provider);
}

export type ProviderFamily = "agy" | "claude" | "codex";

export function providerFamily(provider: string): ProviderFamily | null {
  if (isAgyProvider(provider)) return "agy";
  if (isClaudeProvider(provider)) return "claude";
  if (isCodexProvider(provider)) return "codex";
  return null;
}

/** The runtime's own dispatch tool: the entry the "native" engine keeps and the "paseo-bot" engine drops. */
export const INVOKE_SUBAGENT_TOOL = "invoke_subagent";

/** Native base tools available for Antigravity (antigravity / agy / agy-acp) runtime. */
export const AGY_BASE_TOOLS = [
  "read_file",
  "edit_file",
  "write_file",
  "run_command",
  "manage_task",
  "search_web",
  "invoke_subagent",
  "define_subagent",
  "manage_subagents",
  "send_message",
  "schedule",
  "ask_question",
] as const;

/** Native base tools available for Claude Code runtime. */
export const CLAUDE_BASE_TOOLS = [
  "Read",
  "Edit",
  "Write",
  "Bash",
  "Glob",
  "Grep",
  "WebSearch",
  "WebFetch",
  "Task",
  "TodoWrite",
  "Skill",
] as const;

/** Native base tools available for OpenAI Codex runtime. */
export const CODEX_BASE_TOOLS = [
  "exec",
  "read_file",
  "write_file",
  "edit_file",
  "view_image",
  "web_search",
] as const;

/** Returns the native base tool catalog for a given provider. */
export function providerBaseTools(provider: string): readonly string[] {
  if (isAgyProvider(provider)) return AGY_BASE_TOOLS;
  if (isClaudeProvider(provider)) return CLAUDE_BASE_TOOLS;
  if (isCodexProvider(provider)) return CODEX_BASE_TOOLS;
  return [];
}

export const CANONICAL_CAPABILITIES = [
  "file_read",
  "file_edit",
  "file_write",
  "file_search",
  "shell",
  "web_search",
  "web_fetch",
  "view_image",
  "subagent_call",
  "subagent_manage",
  "task_manage",
  "skill",
  "schedule",
  "ask_user",
] as const;

export type CanonicalCapability = (typeof CANONICAL_CAPABILITIES)[number];

/** Canonical capability -> native provider tool names. */
export const CAPABILITY_MAP: Record<CanonicalCapability, Record<ProviderFamily, readonly string[]>> = {
  file_read: { agy: ["read_file"], claude: ["Read"], codex: ["read_file"] },
  file_edit: { agy: ["edit_file"], claude: ["Edit"], codex: ["edit_file"] },
  file_write: { agy: ["write_file"], claude: ["Write"], codex: ["write_file"] },
  file_search: { agy: [], claude: ["Glob", "Grep"], codex: [] },
  shell: { agy: ["run_command"], claude: ["Bash"], codex: ["exec"] },
  web_search: { agy: ["search_web"], claude: ["WebSearch"], codex: ["web_search"] },
  web_fetch: { agy: [], claude: ["WebFetch"], codex: [] },
  view_image: { agy: [], claude: [], codex: ["view_image"] },
  subagent_call: { agy: [INVOKE_SUBAGENT_TOOL], claude: ["Task"], codex: [] },
  subagent_manage: { agy: ["define_subagent", "manage_subagents", "send_message"], claude: [], codex: [] },
  task_manage: { agy: ["manage_task"], claude: ["TodoWrite"], codex: [] },
  skill: { agy: [], claude: ["Skill"], codex: [] },
  schedule: { agy: ["schedule"], claude: [], codex: [] },
  ask_user: { agy: ["ask_question"], claude: [], codex: [] },
};

const FAMILY_NATIVE_TOOLS: Record<ProviderFamily, ReadonlySet<string>> = {
  agy: new Set(AGY_BASE_TOOLS),
  claude: new Set(CLAUDE_BASE_TOOLS),
  codex: new Set(CODEX_BASE_TOOLS),
};

const OTHER_TOOL_TO_CAPABILITIES: ReadonlyMap<string, readonly CanonicalCapability[]> = (() => {
  const index = new Map<string, CanonicalCapability[]>();
  for (const cap of CANONICAL_CAPABILITIES) {
    const entry = CAPABILITY_MAP[cap];
    for (const family of ["agy", "claude", "codex"] as const) {
      for (const tool of entry[family]) {
        const list = index.get(tool) ?? [];
        if (!list.includes(cap)) list.push(cap);
        index.set(tool, list);
      }
    }
  }
  return index;
})();

/**
 * Resolves a tool list (canonical capabilities, native tools, cross-provider
 * tools, or MCP/custom tools) to the target provider's native tool names.
 * Unsupported capabilities are dropped cleanly; results are deduplicated.
 */
export function resolveToolsForProvider(tools: readonly string[], provider: string): string[] {
  const family = providerFamily(provider);
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  };

  for (const raw of tools) {
    const tool = raw.trim();
    if (!tool) continue;
    if (!family) {
      push(tool);
      continue;
    }
    if (FAMILY_NATIVE_TOOLS[family].has(tool)) {
      push(tool);
      continue;
    }
    if ((CANONICAL_CAPABILITIES as readonly string[]).includes(tool)) {
      for (const mapped of CAPABILITY_MAP[tool as CanonicalCapability][family]) {
        push(mapped);
      }
      continue;
    }
    const crossCaps = OTHER_TOOL_TO_CAPABILITIES.get(tool);
    if (crossCaps) {
      for (const cap of crossCaps) {
        for (const mapped of CAPABILITY_MAP[cap][family]) {
          push(mapped);
        }
      }
      continue;
    }
    // Pass through MCP tools (e.g. bots/custom) and unknown native tools unchanged.
    push(tool);
  }
  return result;
}

export const CANONICAL_PERMISSION_MODES = ["full_access"] as const;
export type CanonicalPermissionMode = (typeof CANONICAL_PERMISSION_MODES)[number];

/** Canonical permission mode -> native provider modeId. */
export const PERMISSION_MODE_MAP: Record<CanonicalPermissionMode, Record<ProviderFamily, string>> = {
  full_access: {
    agy: "full-access",
    claude: "bypassPermissions",
    codex: "full-access",
  },
};

/**
 * Resolves a canonical, cross-provider, or native permission modeId for the
 * target provider. Unknown/native modeIds pass through unchanged.
 */
export function resolveModeIdForProvider(modeId: string | null | undefined, provider: string): string | undefined {
  const trimmed = modeId?.trim();
  if (!trimmed) return undefined;
  const family = providerFamily(provider);
  if (!family) return trimmed;
  if ((CANONICAL_PERMISSION_MODES as readonly string[]).includes(trimmed)) {
    return PERMISSION_MODE_MAP[trimmed as CanonicalPermissionMode][family];
  }
  for (const mode of CANONICAL_PERMISSION_MODES) {
    const entry = PERMISSION_MODE_MAP[mode];
    if (entry[family] === trimmed) return trimmed;
    if (entry.agy === trimmed || entry.claude === trimmed || entry.codex === trimmed) {
      return entry[family];
    }
  }
  return trimmed;
}

const BOT_TOOL_NAMES = ["list_bots", "list_teams", "ask_bot", "check_chat", "search_chats", "open_task", "list_tasks", "run_workflow", "resume_workflow", "get_setup", "propose_skill", "propose_routine", "propose_changes", "connect_app", "show_card", "list_routines", "run_routine", "cancel_routine_run"] as const;
export type BotToolName = (typeof BOT_TOOL_NAMES)[number];

/**
 * Tools that only read or only propose something the user confirms, so they
 * run without a permission prompt. Asking another bot is left to the bot's
 * "Contact other bots" setting.
 */
export const QUIET_TOOLS: readonly BotToolName[] = ["list_bots", "list_teams", "check_chat", "search_chats", "open_task", "list_tasks", "run_workflow", "resume_workflow", "get_setup", "propose_skill", "propose_routine", "propose_changes", "connect_app", "show_card", "list_routines"];

/**
 * The bot tool a timeline tool call is, whatever the provider calls it:
 * Claude `mcp__bots__ask_bot`, Codex `bots.ask_bot`, others `bots_ask_bot`.
 */
export function botToolName(name: string): BotToolName | null {
  const match = /^(?:mcp__)?bots(?:__|\.|_)([a-z_]+)$/.exec(name.trim());
  const tool = match?.[1];
  return tool && (BOT_TOOL_NAMES as readonly string[]).includes(tool) ? (tool as BotToolName) : null;
}

/** Providers that accept exact MCP tool grants (Paseo refuses the chat for others). */
export function supportsToolGrants(provider: string): boolean {
  return /^(claude|codex|opencode)(\b|$)/.test(provider);
}

/** The prompt section for the plugin's own tools, given to chats that get them (bots on the plugin's host). */
export function botToolsPrompt(canAsk: boolean): string {
  const others = canAsk ? "list_bots / list_teams to discover bots and teams, and ask_bot to ask one for help (check_chat follows up)" : "list_bots / list_teams to discover bots and teams";
  return `Your own tools come from the MCP server "bots". Use propose_routine for your own recurring or webhook-started work (rather than Paseo schedules) and propose_skill to keep a way of working for next time. Use run_workflow to execute defined multi-stage team or global workflows. When the user asks you to set up or change bots, teams, skills, MCP servers or defaults, read get_setup and put all the changes in one propose_changes call. The user confirms proposals on a card in the chat. Use search_chats to look through your past chats and daily log, and ${others}. If a tool call to 'bots' encounters a transient network error or connection refused (e.g. during a plugin reload window), retry once or fallback to native agent tools (e.g. invoke_subagent or delegate_task) if available.`;
}
