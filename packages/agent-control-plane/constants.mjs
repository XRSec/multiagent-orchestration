/**
 * Purpose: Central control plane constants and invariants.
 * Context: Claude Agent SDK Runtime Control Plane.
 * Constraints: Node.js 18+ native ESM, zero external dependencies, file <= 600 lines.
 */

export const INTENT_TYPES = Object.freeze({
  BYPASS_CONTINUATION: 'BYPASS_CONTINUATION',
  READ_EXPLORE: 'READ_EXPLORE',
  CODE_MUTATION: 'CODE_MUTATION',
  TERMINAL_EXEC: 'TERMINAL_EXEC',
  ORCHESTRATION: 'ORCHESTRATION',
  GENERAL_QUERY: 'GENERAL_QUERY'
});

export const CAPABILITY_TYPES = Object.freeze({
  FILE_READ: 'FILE_READ',
  FILE_WRITE: 'FILE_WRITE',
  COMMAND_RUN: 'COMMAND_RUN',
  MCP_GATEWAY: 'MCP_GATEWAY',
  SKILL_LOAD: 'SKILL_LOAD'
});

export const CONTINUATION_PHRASES = Object.freeze(new Set([
  'ok', 'okay', '继续', '好', '好的', 'yes', 'y', 'proceed', 'go on',
  '1', '收到', '确认', 'next', 'continue', '行', '可以', '没问题', '赞成', '准了'
]));

export const CAPABILITY_TOOL_MAP = Object.freeze({
  [CAPABILITY_TYPES.FILE_READ]: ['view_file', 'list_dir', 'grep_search', 'find_by_name'],
  [CAPABILITY_TYPES.FILE_WRITE]: ['write_to_file', 'replace_file_content'],
  [CAPABILITY_TYPES.COMMAND_RUN]: ['run_command'],
  [CAPABILITY_TYPES.MCP_GATEWAY]: ['mcp_gateway_list_tools', 'mcp_gateway_call_tool'],
  [CAPABILITY_TYPES.SKILL_LOAD]: ['read_skill', 'load_skill_capsule']
});

export const DEFAULT_CAPABILITIES = Object.freeze(new Set([CAPABILITY_TYPES.FILE_READ]));

export const TAIL_INJECTION_SEPARATOR = '\n\n=== [EPHEMERAL_TAIL_CONTEXT] ===\n';

export const CHUNK_STEP = 6;
export const DEFAULT_HEAD_LINES = 6;
export const DEFAULT_TAIL_LINES = 6;
export const MAX_CAPSULE_CHARS = 180;

export const DISCLOSURE_LEVELS = Object.freeze({
  LAYER_1: 1,
  LAYER_2: 2,
  LAYER_3: 3
});

export const META_TOOL_NAMES = Object.freeze({
  LIST_TOOLS: 'mcp_gateway_list_tools',
  CALL_TOOL: 'mcp_gateway_call_tool'
});
