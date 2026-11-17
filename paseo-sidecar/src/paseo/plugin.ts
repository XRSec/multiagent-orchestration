import { join } from "node:path";
import { getSidecarHome } from "../registry/store.js";
import type { RuntimeType } from "../types.js";

export const SIDECAR_DEFAULT_SKILLS_DIR = "~/.sidecar/skills";

export function getSidecarSkillsDir(customHome?: string): string {
  return join(getSidecarHome(customHome), "skills");
}

export interface HarnessInjectionMechanism {
  runtime: RuntimeType;
  hookEvents: string[];
  contextChannel: string;
  mcpHubPath: string;
  summary: string;
}

export const HARNESS_INJECTION_MECHANISMS: Record<RuntimeType, HarnessInjectionMechanism> = {
  "claude-code": {
    runtime: "claude-code",
    hookEvents: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "CwdChanged", "Stop"],
    contextChannel: "sidecar-hook-shim stdoutJson.additionalContext & hookSpecificOutput.additionalContext",
    mcpHubPath: "/mcp/sidecar/hub/claude-code",
    summary: "Native plugin hooks via sidecar-hook-shim inject SessionStart/UserPromptSubmit additionalContext plus Streamable HTTP MCP hub fallback (sidecar_load_skill).",
  },
  "claude-desktop": {
    runtime: "claude-desktop",
    hookEvents: ["SessionStart", "PreInvocation", "Stop"],
    contextChannel: "MCP hub prompts/resources & sidecar-hook-shim additionalContext",
    mcpHubPath: "/mcp/sidecar/hub/claude-desktop",
    summary: "Sidecar MCP hub exposes sidecar_discover/sidecar_load_skill alongside shim SessionStart hook context when launched with hook bridge.",
  },
  "claude-desktop-3p": {
    runtime: "claude-desktop-3p",
    hookEvents: ["SessionStart", "PreInvocation", "Stop"],
    contextChannel: "MCP hub & sidecar-hook-shim additionalContext",
    mcpHubPath: "/mcp/sidecar/hub/claude-desktop-3p",
    summary: "Third-party Claude Desktop wrapper receives Sidecar MCP hub tools and shim SessionStart/PreInvocation additionalContext.",
  },
  codex: {
    runtime: "codex",
    hookEvents: ["SessionStart", "PreToolUse", "PostToolUse", "Stop"],
    contextChannel: "sidecar-hook-shim additionalContext & hookSpecificOutput.additionalContext",
    mcpHubPath: "/mcp/sidecar/hub/codex",
    summary: "Codex hooks bridge invokes sidecar-hook-shim for SessionStart skill/memory injection and enforces tool guards via MCP hub fallback.",
  },
  "gemini-cli": {
    runtime: "gemini-cli",
    hookEvents: ["SessionStart", "PreInvocation", "PreToolUse", "PostToolUse", "Stop"],
    contextChannel: "sidecar-hook-shim hookSpecificOutput.additionalContext (BeforeAgent / SessionStart)",
    mcpHubPath: "/mcp/sidecar/hub/gemini-cli",
    summary: "Gemini CLI / Antigravity extension binds PreInvocation & SessionStart to sidecar-hook-shim hookSpecificOutput.additionalContext plus MCP hub tools.",
  },
  cursor: {
    runtime: "cursor",
    hookEvents: ["SessionStart", "PreToolUse", "PostToolUse", "Stop"],
    contextChannel: "sidecar-hook-shim additionalContext & hookSpecificOutput.additionalContext",
    mcpHubPath: "/mcp/sidecar/hub/cursor",
    summary: "Cursor hook shim delivers workspace skill & memory context on SessionStart/beforeSubmitPrompt with MCP hub on-demand loading.",
  },
  openhands: {
    runtime: "openhands",
    hookEvents: ["SessionStart", "PreToolUse", "PostToolUse", "Stop"],
    contextChannel: "sidecar-hook-shim additionalContext & MCP hub",
    mcpHubPath: "/mcp/sidecar/hub/openhands",
    summary: "OpenHands runtime consumes Sidecar SessionStart additionalContext via hook shim and falls back to /mcp/sidecar/hub/openhands.",
  },
};

/** Return the Sidecar hook and skill injection mechanism descriptor for a runtime. */
export function getHarnessInjectionMechanism(runtime: RuntimeType): HarnessInjectionMechanism {
  return HARNESS_INJECTION_MECHANISMS[runtime];
}

export const SIDECAR_DEFAULT_ADMIN_PORT = 44880;

export function getSidecarAdminUrl(port = SIDECAR_DEFAULT_ADMIN_PORT): string {
  return `http://127.0.0.1:${port}/admin`;
}

export interface PaseoPluginManifest {
  id: string;
  name: string;
  description: string;
  requirements: {
    paseo: string;
  };
  build: string[][];
}

export function createPaseoPluginManifest(): PaseoPluginManifest {
  return {
    id: "paseo-sidecar",
    name: "Paseo Sidecar",
    description:
      "Paseo-native Sidecar control plane for workspace-routed Skills, MCPs, and deterministic lifecycle Hooks.",
    requirements: {
      paseo: ">=0.15.0",
    },
    build: [["npm", "install", "--omit=dev"]],
  };
}
