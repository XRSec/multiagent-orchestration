import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dispatchHookLocally } from "../src/daemon/index.js";
import { matchHook, unwrapToolName } from "../src/hooks/matcher.js";
import { reduceHookResults } from "../src/hooks/reducer.js";
import { HookOrchestrator, resolveTier } from "../src/hooks/orchestrator.js";
import { loadPluginBundle, loadPluginsFromDirectory } from "../src/plugins/loader.js";
import { parseShimCliArgs, normalizeShimPayload } from "../src/shim/index.js";
import type {
  HookDispatchResult,
  HookEventPayload,
  NormalizedPluginBundle,
} from "../src/types.js";

describe("matcher", () => {
  it("matches wildcard * and empty matchers", () => {
    expect(
      matchHook("*", { event_name: "PreToolUse", tool_name: "Bash" })
    ).toBe(true);
    expect(
      matchHook(undefined, { event_name: "PreToolUse", tool_name: "Bash" })
    ).toBe(true);
  });

  it("normalizes Bash <-> terminal / exec_command synonyms", () => {
    expect(
      matchHook("Bash", { event_name: "PreToolUse", tool_name: "terminal" })
    ).toBe(true);
    expect(
      matchHook("Bash", { event_name: "PreToolUse", tool_name: "exec_command" })
    ).toBe(true);
    expect(
      matchHook("terminal", { event_name: "PreToolUse", tool_name: "Bash" })
    ).toBe(true);
  });

  it("normalizes Edit|Write <-> apply_patch / file_editor synonyms", () => {
    expect(
      matchHook("Edit|Write", {
        event_name: "PreToolUse",
        tool_name: "apply_patch",
      })
    ).toBe(true);
    expect(
      matchHook("Edit|Write", {
        event_name: "PreToolUse",
        tool_name: "file_editor",
      })
    ).toBe(true);
    expect(
      matchHook("apply_patch", { event_name: "PreToolUse", tool_name: "Edit" })
    ).toBe(true);
  });

  it("supports regex matchers", () => {
    expect(
      matchHook("/^mcp__github__/", {
        event_name: "PreToolUse",
        tool_name: "mcp__github__create_issue",
      })
    ).toBe(true);
    expect(
      matchHook("/^mcp__github__/", {
        event_name: "PreToolUse",
        tool_name: "mcp__slack__post",
      })
    ).toBe(false);
  });

  it("unwraps sidecar_call_tool args.name into mcp__<server>__<tool>", () => {
    expect(
      unwrapToolName("sidecar_call_tool", {
        server: "github",
        name: "create_issue",
      })
    ).toBe("mcp__github__create_issue");

    expect(
      unwrapToolName("sidecar_call_tool", {
        name: "slack:post_message",
      })
    ).toBe("mcp__slack__post_message");

    expect(
      matchHook("mcp__github__.*", {
        event_name: "PreToolUse",
        tool_name: "sidecar_call_tool",
        tool_input: { server: "github", name: "get_pr" },
      })
    ).toBe(true);
  });
});

describe("reducer", () => {
  it("short-circuits on Deny-Wins", () => {
    const results: HookDispatchResult[] = [
      {
        hook_id: "h1",
        plugin_id: "p1",
        event_name: "PreToolUse",
        status: "ok",
        decision: "allow",
        duration_ms: 5,
      },
      {
        hook_id: "h2",
        plugin_id: "p2",
        event_name: "PreToolUse",
        status: "blocked",
        decision: "deny",
        duration_ms: 5,
        output: { reason: "Unsafe command" },
      },
    ];

    const reduced = reduceHookResults(results, "claude-code");
    expect(reduced.decision).toBe("deny");
    expect(reduced.exitCode).toBe(2);
    expect(reduced.reason).toBe("Unsafe command");
    expect(reduced.permissionDecision).toBe("deny");
  });

  it("folds updatedInput sequentially and auto-adds permissionDecision: allow for codex/claude-code", () => {
    const results: HookDispatchResult[] = [
      {
        hook_id: "h1",
        plugin_id: "p1",
        event_name: "PreToolUse",
        status: "ok",
        decision: "modify",
        duration_ms: 5,
        output: { updatedInput: { a: 1, b: 2 } },
      },
      {
        hook_id: "h2",
        plugin_id: "p2",
        event_name: "PreToolUse",
        status: "ok",
        decision: "modify",
        duration_ms: 5,
        modified_payload: { tool_input: { b: 20, c: 3 } },
      },
    ];

    const reduced = reduceHookResults(results, "codex");
    expect(reduced.decision).toBe("modify");
    expect(reduced.exitCode).toBe(0);
    expect(reduced.updatedInput).toEqual({ a: 1, b: 20, c: 3 });
    expect(reduced.permissionDecision).toBe("allow");
    expect(reduced.stdoutJson?.permissionDecision).toBe("allow");
  });

  it("concatenates namespaced additionalContext and truncates to 12000-token default budget (and respects explicit override)", () => {
    const overDefaultText = "x".repeat(52000);
    const results: HookDispatchResult[] = [
      {
        hook_id: "h1",
        plugin_id: "p1",
        event_name: "PreToolUse",
        status: "ok",
        decision: "allow",
        duration_ms: 5,
        output: { additionalContext: "short note" },
      },
      {
        hook_id: "h2",
        plugin_id: "p2",
        event_name: "PreToolUse",
        status: "ok",
        decision: "allow",
        duration_ms: 5,
        output: { additionalContext: overDefaultText },
      },
    ];

    const reducedDefault = reduceHookResults(results, "claude-code");
    expect(reducedDefault.additionalContext).toContain("[p1:h1] short note");
    expect(reducedDefault.additionalContext).toContain("[p2:h2]");
    expect(reducedDefault.additionalContext!.length).toBeLessThanOrEqual(12000 * 4);
    expect(reducedDefault.additionalContext).toContain("[truncated to token budget]");

    const overCustomText = "y".repeat(12000);
    const reducedCustom = reduceHookResults(
      [
        results[0],
        {
          ...results[1],
          output: { additionalContext: overCustomText },
        },
      ],
      "claude-code",
      { maxContextTokens: 2500 }
    );
    expect(reducedCustom.additionalContext!.length).toBeLessThanOrEqual(2500 * 4);
    expect(reducedCustom.additionalContext).toContain("[truncated to token budget]");
  });

  it("extracts hookSpecificOutput.additionalContext and plain-text output while ignoring JSON-only output", () => {
    const results: HookDispatchResult[] = [
      {
        hook_id: "h1",
        plugin_id: "nowledge-mem",
        event_name: "PreInvocation",
        status: "ok",
        decision: "allow",
        duration_ms: 5,
        output: {
          hookSpecificOutput: {
            hookEventName: "SessionStart",
            additionalContext: "Memory bundle loaded",
          },
        },
      },
      {
        hook_id: "h2",
        plugin_id: "plain-plugin",
        event_name: "PreInvocation",
        status: "ok",
        decision: "allow",
        duration_ms: 3,
        output: "Plain stdout guidance",
      },
      {
        hook_id: "h3",
        plugin_id: "json-only",
        event_name: "PreInvocation",
        status: "ok",
        decision: "allow",
        duration_ms: 2,
        output: '{"decision":"allow"}',
      },
    ];

    const reduced = reduceHookResults(results, "gemini-cli", {
      eventName: "PreInvocation",
    });
    expect(reduced.additionalContext).toContain("[nowledge-mem:h1] Memory bundle loaded");
    expect(reduced.additionalContext).toContain("[plain-plugin:h2] Plain stdout guidance");
    expect(reduced.additionalContext).not.toContain("json-only");
    expect(reduced.stdoutJson).toEqual({
      injectSteps: [{ ephemeralMessage: reduced.additionalContext }],
    });
    expect(reduced.stdoutJson?.additionalContext).toBeUndefined();
    expect(reduced.stdoutJson?.hookSpecificOutput).toBeUndefined();

    const defaultEventReduced = reduceHookResults([results[0]], "claude-code");
    expect(defaultEventReduced.stdoutJson?.additionalContext).toBe(
      defaultEventReduced.additionalContext,
    );
    expect(defaultEventReduced.stdoutJson?.hookSpecificOutput).toEqual({
      hookEventName: "SessionStart",
      additionalContext: defaultEventReduced.additionalContext,
    });
  });

  it("enforces strict Antigravity protojson schema on gemini-cli PreToolUse, PreInvocation, PostToolUse, and deny", () => {
    const allowPreTool = reduceHookResults(
      [
        {
          hook_id: "h-allow",
          plugin_id: "p1",
          event_name: "PreToolUse",
          status: "ok",
          decision: "allow",
          duration_ms: 4,
          output: {
            decision: "allow",
            reason: "Safe command",
            permissionOverrides: ["Bash", "Edit"],
            additionalContext: "Must not appear in PreToolUse protojson",
          },
        },
      ],
      "gemini-cli",
      { eventName: "PreToolUse" },
    );
    expect(allowPreTool.exitCode).toBe(0);
    expect(allowPreTool.permissionDecision).toBeUndefined();
    expect(allowPreTool.stdoutJson).toEqual({
      decision: "allow",
      reason: "Safe command",
      permissionOverrides: ["Bash", "Edit"],
    });
    expect(allowPreTool.stdoutJson?.additionalContext).toBeUndefined();
    expect(allowPreTool.stdoutJson?.hookSpecificOutput).toBeUndefined();

    const forceAskPrecedence = reduceHookResults(
      [
        {
          hook_id: "h-ask",
          plugin_id: "p1",
          event_name: "PreToolUse",
          status: "ok",
          decision: "allow",
          duration_ms: 2,
          output: { decision: "ask", reason: "Soft ask" },
        },
        {
          hook_id: "h-force",
          plugin_id: "p2",
          event_name: "PreToolUse",
          status: "ok",
          decision: "allow",
          duration_ms: 2,
          output: { decision: "force_ask", reason: "Mandatory confirmation" },
        },
      ],
      "gemini-cli",
      { eventName: "PreToolUse" },
    );
    expect(forceAskPrecedence.stdoutJson).toEqual({
      decision: "force_ask",
      reason: "Mandatory confirmation",
    });

    const denyPreTool = reduceHookResults(
      [
        {
          hook_id: "h-deny",
          plugin_id: "p1",
          event_name: "PreToolUse",
          status: "blocked",
          decision: "deny",
          duration_ms: 2,
          output: { decision: "deny", reason: "Blocked by policy" },
        },
      ],
      "gemini-cli",
      { eventName: "PreToolUse" },
    );
    expect(denyPreTool.exitCode).toBe(2);
    expect(denyPreTool.stdoutJson).toEqual({
      decision: "deny",
      reason: "Blocked by policy",
    });
    expect(denyPreTool.stdoutJson?.permissionDecision).toBeUndefined();

    const postTool = reduceHookResults(
      [
        {
          hook_id: "h-post",
          plugin_id: "p1",
          event_name: "PostToolUse",
          status: "ok",
          decision: "allow",
          duration_ms: 2,
          output: { additionalContext: "Post note" },
        },
      ],
      "gemini-cli",
      { eventName: "PostToolUse" },
    );
    expect(postTool.stdoutJson).toBeUndefined();
  });

  it("downgrades deny/block when stop_hook_active is true", () => {
    const results: HookDispatchResult[] = [
      {
        hook_id: "stop1",
        plugin_id: "p1",
        event_name: "Stop",
        status: "blocked",
        decision: "deny",
        duration_ms: 5,
        output: { reason: "Keep working" },
      },
    ];

    const reduced = reduceHookResults(results, "claude-code", {
      stopHookActive: true,
    });
    expect(reduced.decision).toBe("allow");
    expect(reduced.exitCode).toBe(0);
    expect(reduced.stopHookDowngraded).toBe(true);
  });
});

describe("orchestrator", () => {
  let tmpDir: string;
  let hostEnvFile: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sidecar-orch-test-"));
    hostEnvFile = path.join(tmpDir, "host.env");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("resolves tiers 00/10/50/90 and executes in tier order", async () => {
    expect(resolveTier(0)).toBe(0);
    expect(resolveTier(15)).toBe(10);
    expect(resolveTier(undefined)).toBe(50);
    expect(resolveTier(95)).toBe(90);

    const order: string[] = [];
    const inlineHandlers = new Map([
      [
        "h90",
        async () => {
          order.push("h90");
          return { decision: "allow" as const };
        },
      ],
      [
        "h00",
        async () => {
          order.push("h00");
          return { decision: "allow" as const };
        },
      ],
      [
        "h50",
        async () => {
          order.push("h50");
          return { decision: "allow" as const };
        },
      ],
      [
        "h10",
        async () => {
          order.push("h10");
          return { decision: "allow" as const };
        },
      ],
    ]);

    const plugin: NormalizedPluginBundle = {
      plugin_id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      source_runtime: "claude-code",
      root_dir: "/plugins/test",
      hooks: [
        {
          id: "h90",
          plugin_id: "test-plugin",
          event_name: "PreToolUse",
          handler_type: "inline",
          priority: 90,
          enabled: true,
        },
        {
          id: "h00",
          plugin_id: "test-plugin",
          event_name: "PreToolUse",
          handler_type: "inline",
          priority: 0,
          enabled: true,
        },
        {
          id: "h50",
          plugin_id: "test-plugin",
          event_name: "PreToolUse",
          handler_type: "inline",
          priority: 50,
          enabled: true,
        },
        {
          id: "h10",
          plugin_id: "test-plugin",
          event_name: "PreToolUse",
          handler_type: "inline",
          priority: 10,
          enabled: true,
        },
      ],
    };

    const orchestrator = new HookOrchestrator({ inlineHandlers });
    const payload: HookEventPayload = {
      runtime: "claude-code",
      session_id: "s1",
      canonical_cwd: tmpDir,
      event_name: "PreToolUse",
      timestamp: new Date().toISOString(),
      tool_name: "Bash",
    };

    await orchestrator.dispatch(payload, [plugin]);
    expect(order).toEqual(["h00", "h10", "h50", "h90"]);
  });

  it("injects plugin/project env vars and atomically merges CLAUDE_ENV_FILE slices", async () => {
    let capturedEnv: Record<string, string> = {};
    const inlineHandlers = new Map([
      [
        "env-hook",
        async (_payload: HookEventPayload, env: Record<string, string>) => {
          capturedEnv = env;
          await fs.writeFile(env.CLAUDE_ENV_FILE, "FOO=bar\nBAZ=qux\n", "utf8");
          return { decision: "allow" as const };
        },
      ],
    ]);

    const plugin: NormalizedPluginBundle = {
      plugin_id: "my-plugin",
      name: "My Plugin",
      version: "1.0.0",
      source_runtime: "claude-code",
      root_dir: "/opt/plugins/my-plugin",
      metadata: { options: { api_mode: "strict" } },
      hooks: [
        {
          id: "env-hook",
          plugin_id: "my-plugin",
          event_name: "SessionStart",
          handler_type: "inline",
          enabled: true,
        },
      ],
    };

    const orchestrator = new HookOrchestrator({
      hostEnv: { CLAUDE_ENV_FILE: hostEnvFile },
      inlineHandlers,
      pluginDataBaseDir: path.join(tmpDir, "plugin-data"),
    });

    await orchestrator.dispatch(
      {
        runtime: "claude-code",
        session_id: "s1",
        canonical_cwd: tmpDir,
        event_name: "SessionStart",
        timestamp: new Date().toISOString(),
      },
      [plugin]
    );

    expect(capturedEnv.CLAUDE_PLUGIN_ROOT).toBe("/opt/plugins/my-plugin");
    expect(capturedEnv.PLUGIN_ROOT).toBe("/opt/plugins/my-plugin");
    expect(capturedEnv.CLAUDE_PLUGIN_DATA).toBe(
      path.join(tmpDir, "plugin-data", "my-plugin")
    );
    expect(capturedEnv.CLAUDE_PROJECT_DIR).toBe(tmpDir);
    expect(capturedEnv.OPENHANDS_PROJECT_DIR).toBe(tmpDir);
    expect(capturedEnv.CLAUDE_PLUGIN_OPTION_API_MODE).toBe("strict");
    expect(capturedEnv.CLAUDE_ENV_FILE).not.toBe(hostEnvFile);

    const merged = await fs.readFile(hostEnvFile, "utf8");
    expect(merged).toContain("FOO=bar");
    expect(merged).toContain("BAZ=qux");
  });

  it("supports SessionStart <-> PreInvocation fallback without duplicating direct matches", async () => {
    const ran: string[] = [];
    const inlineHandlers = new Map([
      [
        "both-ss",
        async () => {
          ran.push("both-ss");
          return { decision: "allow" as const, output: { additionalContext: "from both-ss" } };
        },
      ],
      [
        "both-pi",
        async () => {
          ran.push("both-pi");
          return { decision: "allow" as const };
        },
      ],
      [
        "only-pi",
        async () => {
          ran.push("only-pi");
          return { decision: "allow" as const, output: { additionalContext: "from only-pi" } };
        },
      ],
      [
        "only-ss",
        async () => {
          ran.push("only-ss");
          return { decision: "allow" as const, output: { additionalContext: "from only-ss" } };
        },
      ],
    ]);

    const bothPlugin: NormalizedPluginBundle = {
      plugin_id: "both-plugin",
      name: "Both Plugin",
      version: "1.0.0",
      source_runtime: "claude-code",
      root_dir: tmpDir,
      hooks: [
        {
          id: "both-ss",
          plugin_id: "both-plugin",
          event_name: "SessionStart",
          matcher: "startup|resume|clear|fork",
          handler_type: "inline",
          enabled: true,
        },
        {
          id: "both-pi",
          plugin_id: "both-plugin",
          event_name: "PreInvocation",
          handler_type: "inline",
          enabled: true,
        },
      ],
    };

    const piOnlyPlugin: NormalizedPluginBundle = {
      plugin_id: "pi-only",
      name: "PI Only",
      version: "1.0.0",
      source_runtime: "native",
      root_dir: tmpDir,
      hooks: [
        {
          id: "only-pi",
          plugin_id: "pi-only",
          event_name: "PreInvocation",
          handler_type: "inline",
          enabled: true,
        },
      ],
    };

    const ssOnlyPlugin: NormalizedPluginBundle = {
      plugin_id: "ss-only",
      name: "SS Only",
      version: "1.0.0",
      source_runtime: "claude-code",
      root_dir: tmpDir,
      hooks: [
        {
          id: "only-ss",
          plugin_id: "ss-only",
          event_name: "SessionStart",
          matcher: "startup|resume|clear|fork",
          handler_type: "inline",
          enabled: true,
        },
      ],
    };

    const orchestrator = new HookOrchestrator({ inlineHandlers });

    const sessionStartRes = await orchestrator.dispatch(
      {
        runtime: "claude-code",
        session_id: "s1",
        canonical_cwd: tmpDir,
        event_name: "SessionStart",
        timestamp: new Date().toISOString(),
      },
      [bothPlugin, piOnlyPlugin]
    );
    expect(ran).toEqual(["both-ss", "only-pi"]);
    expect(sessionStartRes.reduced.stdoutJson?.hookSpecificOutput).toEqual({
      hookEventName: "SessionStart",
      additionalContext: sessionStartRes.reduced.additionalContext,
    });

    ran.length = 0;
    const preInvRes = await orchestrator.dispatch(
      {
        runtime: "gemini-cli",
        session_id: "s2",
        canonical_cwd: tmpDir,
        event_name: "PreInvocation",
        timestamp: new Date().toISOString(),
      },
      [bothPlugin, ssOnlyPlugin]
    );
    expect(ran).toEqual(["both-pi", "only-ss"]);
    expect(preInvRes.reduced.stdoutJson).toEqual({
      injectSteps: [{ ephemeralMessage: preInvRes.reduced.additionalContext }],
    });
    expect(preInvRes.reduced.stdoutJson?.additionalContext).toBeUndefined();
    expect(preInvRes.reduced.stdoutJson?.hookSpecificOutput).toBeUndefined();
  });

  it("resolves relative hooks/nmem_entrypoint.py against plugin.root_dir and sets CLAUDE_PLUGIN_ROOT", async () => {
    const repoDir = path.join(tmpDir, "arbitrary-repo");
    const pluginDir = path.join(tmpDir, "gemini-cli--nowledge-mem", "1.0.0");
    await fs.mkdir(repoDir, { recursive: true });
    await fs.mkdir(path.join(pluginDir, "hooks"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, "hooks", "nmem_entrypoint.py"),
      [
        "import json, os, sys",
        "print(json.dumps({",
        '  "hookSpecificOutput": {',
        '    "hookEventName": "PreInvocation",',
        '    "additionalContext": f"cmd={sys.argv[1]} root={os.environ.get(\'CLAUDE_PLUGIN_ROOT\', \'\')}"',
        "  }",
        "}))",
      ].join("\n"),
      "utf8"
    );

    const plugin: NormalizedPluginBundle = {
      plugin_id: "nowledge-mem-google-antigravity",
      name: "nowledge-mem-google-antigravity",
      version: "0.1.3",
      source_runtime: "native",
      root_dir: pluginDir,
      hooks: [
        {
          id: "nmem-pre-inv",
          plugin_id: "nowledge-mem-google-antigravity",
          event_name: "PreInvocation",
          handler_type: "command",
          command: "python3 hooks/nmem_entrypoint.py session-start || echo {}",
          enabled: true,
        },
      ],
    };

    const orchestrator = new HookOrchestrator({ hostEnv: { PATH: process.env.PATH } });
    const res = await orchestrator.dispatch(
      {
        runtime: "gemini-cli",
        session_id: "s-py",
        canonical_cwd: repoDir,
        event_name: "PreInvocation",
        timestamp: new Date().toISOString(),
      },
      [plugin]
    );

    expect(res.results).toHaveLength(1);
    expect(res.results[0].status).toBe("ok");
    expect(res.reduced.additionalContext).toContain(`cmd=session-start root=${pluginDir}`);
    expect(res.reduced.stdoutJson).toEqual({
      injectSteps: [{ ephemeralMessage: res.reduced.additionalContext }],
    });
    expect(res.reduced.stdoutJson?.additionalContext).toBeUndefined();
    expect(res.reduced.stdoutJson?.hookSpecificOutput).toBeUndefined();
  });
});

describe("loader (versioned & namespaced plugins)", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sidecar-loader-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("loads versioned <platform>--<id>/<version> plugins, namespaced hooks.json, mcp_config.json, and metadata.alias_ids", async () => {
    const cacheDir = path.join(tmpDir, "cache");

    // 1. Gemini-style versioned plugin (0.9.0 vs 1.0.0) with namespaced hooks.json & mcp_config.json
    const gemOld = path.join(cacheDir, "gemini-cli--nowledge-mem", "0.9.0");
    const gemNew = path.join(cacheDir, "gemini-cli--nowledge-mem", "1.0.0");
    await fs.mkdir(gemOld, { recursive: true });
    await fs.mkdir(gemNew, { recursive: true });
    await fs.writeFile(
      path.join(gemOld, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem-google-antigravity", version: "0.1.0" })
    );
    await fs.writeFile(
      path.join(gemNew, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem-google-antigravity", version: "0.1.3" })
    );
    await fs.writeFile(
      path.join(gemNew, "hooks.json"),
      JSON.stringify({
        "nowledge-mem-hooks": {
          PreInvocation: [{ type: "command", command: "python3 hooks/nmem_entrypoint.py session-start", timeout: 10 }],
        },
        "disabled-ns": {
          enabled: false,
          PreToolUse: [{ matcher: "run_command", hooks: [{ type: "command", command: "echo skip" }] }],
        },
      })
    );
    await fs.writeFile(
      path.join(gemNew, "mcp_config.json"),
      JSON.stringify({
        mcpServers: {
          "nowledge-mem": { serverUrl: "http://127.0.0.1:14242/mcp/" },
        },
      })
    );

    // 2. Claude-style versioned plugin (0.7.9 vs 0.7.36) behind a symlinked cache entry
    const claudeTarget = path.join(tmpDir, "external-claude-nmem");
    const claudeOld = path.join(claudeTarget, "0.7.9", ".claude-plugin");
    const claudeNew = path.join(claudeTarget, "0.7.36", ".claude-plugin");
    await fs.mkdir(claudeOld, { recursive: true });
    await fs.mkdir(claudeNew, { recursive: true });
    await fs.writeFile(
      path.join(claudeOld, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem", version: "0.7.9" })
    );
    await fs.writeFile(
      path.join(claudeNew, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem", version: "0.7.36" })
    );
    await fs.symlink(claudeTarget, path.join(cacheDir, "claude-code--nowledge-mem"));

    // Direct bundle check on gemNew
    const directBundle = await loadPluginBundle(gemNew);
    expect(directBundle).not.toBeNull();
    expect(directBundle?.hooks.map((h) => h.event_name)).toEqual(["PreInvocation"]);
    expect(directBundle?.mcp_servers).toEqual({
      "nowledge-mem": { serverUrl: "http://127.0.0.1:14242/mcp/" },
    });

    const bundles = await loadPluginsFromDirectory(cacheDir);
    expect(bundles).toHaveLength(2);

    const gemBundle = bundles.find((b) => b.plugin_id === "nowledge-mem-google-antigravity");
    expect(gemBundle?.version).toBe("0.1.3");
    expect(gemBundle?.root_dir).toBe(gemNew);
    expect(gemBundle?.hooks).toHaveLength(1);
    expect(gemBundle?.hooks[0].event_name).toBe("PreInvocation");
    expect(gemBundle?.mcp_servers).toEqual({
      "nowledge-mem": { serverUrl: "http://127.0.0.1:14242/mcp/" },
    });
    expect(gemBundle?.metadata?.alias_ids).toEqual(
      expect.arrayContaining([
        "gemini-cli--nowledge-mem",
        "nowledge-mem",
        "nowledge-mem-google-antigravity",
      ])
    );

    const claudeBundle = bundles.find((b) => b.plugin_id === "nowledge-mem");
    expect(claudeBundle?.version).toBe("0.7.36");
    expect(claudeBundle?.source_runtime).toBe("claude-code");
    expect(claudeBundle?.metadata?.alias_ids).toEqual(
      expect.arrayContaining(["claude-code--nowledge-mem", "nowledge-mem"])
    );
  });
});

describe("shim (parseShimCliArgs & normalizeShimPayload)", () => {
  it("parses --event and --runtime CLI flags in space and equals forms", () => {
    expect(
      parseShimCliArgs(["--event", "PreToolUse", "--runtime", "gemini-cli"])
    ).toEqual({
      event: "PreToolUse",
      runtime: "gemini-cli",
    });

    expect(
      parseShimCliArgs(["--event=PreInvocation", "--runtime=claude-code"])
    ).toEqual({
      event: "PreInvocation",
      runtime: "claude-code",
    });
  });

  it("normalizes Antigravity payloads with CLI flags and via shape inference without --event", () => {
    const withCli = normalizeShimPayload(
      {
        conversationId: "conv-123",
        workspacePaths: ["/tmp/agy-workspace"],
        toolCall: { name: "Bash", args: { command: "pwd" } },
      },
      {},
      parseShimCliArgs(["--event", "PreToolUse", "--runtime", "gemini-cli"])
    );
    expect(withCli.runtime).toBe("gemini-cli");
    expect(withCli.event_name).toBe("PreToolUse");
    expect(withCli.session_id).toBe("conv-123");
    expect(withCli.canonical_cwd).toBe("/tmp/agy-workspace");
    expect(withCli.tool_name).toBe("Bash");
    expect(withCli.tool_input).toEqual({ command: "pwd" });
    expect(withCli.toolCall).toEqual({ name: "Bash", args: { command: "pwd" } });

    const inferredPreTool = normalizeShimPayload(
      {
        conversationId: "conv-456",
        workspacePaths: ["/tmp/agy-workspace"],
        toolCall: { name: "run_command", args: { CommandLine: "echo ok" } },
      },
      {}
    );
    expect(inferredPreTool.runtime).toBe("gemini-cli");
    expect(inferredPreTool.event_name).toBe("PreToolUse");
    expect(inferredPreTool.session_id).toBe("conv-456");
    expect(inferredPreTool.canonical_cwd).toBe("/tmp/agy-workspace");
    expect(inferredPreTool.tool_name).toBe("run_command");
    expect(inferredPreTool.tool_input).toEqual({ CommandLine: "echo ok" });

    const inferredPostTool = normalizeShimPayload(
      {
        conversationId: "conv-456",
        workspacePaths: ["/tmp/agy-workspace"],
        toolCall: { name: "run_command", args: { CommandLine: "echo ok" } },
        toolResult: { stdout: "ok" },
      },
      {}
    );
    expect(inferredPostTool.runtime).toBe("gemini-cli");
    expect(inferredPostTool.event_name).toBe("PostToolUse");

    const inferredPreInv = normalizeShimPayload(
      {
        conversationId: "conv-789",
        workspacePaths: ["/tmp/agy-workspace"],
        invocationNum: 0,
      },
      {}
    );
    expect(inferredPreInv.runtime).toBe("gemini-cli");
    expect(inferredPreInv.event_name).toBe("PreInvocation");
  });
});

describe("dispatchHookLocally & daemonless shim", () => {
  let tmpHome: string;

  beforeEach(async () => {
    tmpHome = await fs.mkdtemp(path.join(os.tmpdir(), "sidecar-local-hook-"));
    const pluginDir = path.join(tmpHome, "plugins", "cache", "local-plugin", "1.0.0");
    await fs.mkdir(path.join(pluginDir, ".claude-plugin"), { recursive: true });
    await fs.mkdir(path.join(pluginDir, "hooks"), { recursive: true });
    await fs.writeFile(
      path.join(pluginDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "local-plugin", version: "1.0.0" })
    );
    const hookScript = `node -e 'console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", additionalContext: "local-dispatch-ok", updatedInput: { command: "echo local-dispatch-ok" } } }))'`;
    await fs.writeFile(
      path.join(pluginDir, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: hookScript, timeout: 5 }],
            },
          ],
        },
      })
    );
  });

  afterEach(async () => {
    await fs.rm(tmpHome, { recursive: true, force: true });
  });

  it("dispatchHookLocally executes plugin hooks without a running daemon", async () => {
    const res = await dispatchHookLocally(
      {
        payload: {
          runtime: "claude-code",
          session_id: "local-s1",
          canonical_cwd: tmpHome,
          event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { command: "echo hi" },
          timestamp: new Date().toISOString(),
        },
      },
      { sidecarHome: tmpHome }
    );

    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(res.stdoutJson ?? "{}") as {
      permissionDecision?: string;
      updatedInput?: { command?: string };
      hookSpecificOutput?: { additionalContext?: string; updatedInput?: { command?: string } };
    };
    const serialized = JSON.stringify(parsed);
    expect(serialized).toContain("local-dispatch-ok");
  });

  it("shim dispatches hook locally when SIDECAR_NO_DAEMON=1 and when daemon endpoints are unreachable", async () => {
    const runShimProcess = (extraEnv: Record<string, string>) =>
      new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
        const tsxBin = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");
        const shimEntry = path.resolve(process.cwd(), "src", "shim", "index.ts");
        const child = spawn(
          tsxBin,
          [shimEntry, "--event", "PreToolUse", "--runtime", "claude-code"],
          {
            env: {
              ...process.env,
              SIDECAR_HOME: tmpHome,
              ...extraEnv,
            },
            stdio: ["pipe", "pipe", "pipe"],
          }
        );
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => {
          stdout += String(d);
        });
        child.stderr.on("data", (d) => {
          stderr += String(d);
        });
        child.on("error", reject);
        child.on("close", (code) => resolve({ code, stdout, stderr }));
        child.stdin.write(
          JSON.stringify({
            session_id: "shim-s1",
            cwd: tmpHome,
            tool_name: "Bash",
            tool_input: { command: "echo shim" },
          })
        );
        child.stdin.end();
      });

    // 1. Explicit daemonless mode
    const noDaemonRes = await runShimProcess({ SIDECAR_NO_DAEMON: "1" });
    expect(noDaemonRes.code).toBe(0);
    expect(noDaemonRes.stdout).toContain("local-dispatch-ok");

    // 2. Fallback to local dispatch when UDS and HTTP daemon endpoints fail
    const fallbackRes = await runShimProcess({
      SIDECAR_NO_DAEMON: "0",
      SIDECAR_SOCK_PATH: path.join(tmpHome, "nonexistent.sock"),
      SIDECAR_HTTP_URL: "http://127.0.0.1:1/hook",
    });
    expect(fallbackRes.code).toBe(0);
    expect(fallbackRes.stdout).toContain("local-dispatch-ok");
  });
});
