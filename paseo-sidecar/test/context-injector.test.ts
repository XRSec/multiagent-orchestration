import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveEffectiveWorkspaceProfile,
  resolveWorkspaceProfile,
} from "../src/config/workspaces.js";
import { startDaemon, type DaemonInstance } from "../src/daemon/index.js";
import {
  buildWorkspaceSkillInjection,
  NOWLEDGE_MEM_MANDATE,
  SIDECAR_SKILL_MANDATE,
} from "../src/hooks/context-injector.js";
import { UnifiedRegistry } from "../src/registry/store.js";
import type {
  NormalizedPluginBundle,
  RuntimeType,
  WorkspaceProfile,
} from "../src/types.js";

const tempDirs: string[] = [];
const daemons: DaemonInstance[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  for (const daemon of daemons.splice(0)) {
    await daemon.close();
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("resolveEffectiveWorkspaceProfile", () => {
  it("merges Global '*' base profile with prefix/exact project profiles in specificity order", () => {
    const profiles: WorkspaceProfile[] = [
      {
        id: "global-claude",
        name: "Global Claude",
        canonical_cwd: "*",
        runtimes: ["claude-code"],
        plugins: ["nowledge-mem"],
        env: { SHARED_KEY: "from-global", GLOBAL_ONLY: "1" },
        enabled: true,
        metadata: {
          skills: ["agent-first-docs"],
          mcp_servers: ["nmem-mcp"],
          skill_injection_mode: "manifest",
        },
      },
      {
        id: "parent-workspace",
        name: "Parent Workspace",
        canonical_cwd: "/tmp/work",
        runtimes: ["claude-code"],
        plugins: ["rtk"],
        env: { SHARED_KEY: "from-parent", PARENT_ONLY: "2" },
        enabled: true,
        metadata: {
          skills: ["script-standards", "agent-first-docs"],
          mcp_servers: [],
        },
      },
      {
        id: "exact-project",
        name: "Exact Project",
        canonical_cwd: "/tmp/work/app",
        runtimes: ["claude-code"],
        plugins: ["nowledge-mem", "custom-plugin"],
        env: { SHARED_KEY: "from-exact", EXACT_ONLY: "3" },
        enabled: true,
        priority: 10,
        metadata: {
          skills: ["oil-ui"],
          mcp_servers: ["github"],
          skill_injection_mode: "inline",
        },
      },
      {
        id: "disabled-project",
        name: "Disabled",
        canonical_cwd: "/tmp/work/app",
        runtimes: ["claude-code"],
        plugins: ["should-not-appear"],
        enabled: false,
        priority: 99,
      },
    ];

    expect(
      resolveEffectiveWorkspaceProfile(
        {
          runtime: "codex",
          session_id: "s1",
          canonical_cwd: "/tmp/work/app",
        },
        profiles,
      ),
    ).toBeUndefined();

    // Only global + parent match when cwd is a sibling directory
    const siblingEffective = resolveEffectiveWorkspaceProfile(
      {
        runtime: "claude-code",
        session_id: "s1",
        canonical_cwd: "/tmp/work/other",
      },
      profiles,
    );
    expect(siblingEffective?.id).toBe("parent-workspace");
    expect(siblingEffective?.plugins).toEqual(["nowledge-mem", "rtk"]);
    expect(siblingEffective?.metadata?.skills).toEqual([
      "agent-first-docs",
      "script-standards",
    ]);
    // Parent omitted skill_injection_mode, so it inherits "manifest" from global
    expect(siblingEffective?.metadata?.skill_injection_mode).toBe("manifest");

    // Exact match merges all three active layers and overrides skill_injection_mode
    const exactEffective = resolveEffectiveWorkspaceProfile(
      {
        runtime: "claude-code",
        session_id: "s1",
        canonical_cwd: "/tmp/work/app",
      },
      profiles,
    );
    expect(exactEffective?.id).toBe("exact-project");
    expect(exactEffective?.name).toBe("Exact Project");
    expect(exactEffective?.plugins).toEqual([
      "nowledge-mem",
      "rtk",
      "custom-plugin",
    ]);
    expect(exactEffective?.metadata?.skills).toEqual([
      "agent-first-docs",
      "script-standards",
      "oil-ui",
    ]);
    expect(exactEffective?.metadata?.mcp_servers).toEqual([
      "nmem-mcp",
      "github",
    ]);
    expect(exactEffective?.metadata?.skill_injection_mode).toBe("inline");
    expect(exactEffective?.env).toEqual({
      GLOBAL_ONLY: "1",
      PARENT_ONLY: "2",
      EXACT_ONLY: "3",
      SHARED_KEY: "from-exact",
    });

    // Backward-compatible resolveWorkspaceProfile remains untouched
    const rawBest = resolveWorkspaceProfile(
      {
        runtime: "claude-code",
        session_id: "s1",
        canonical_cwd: "/tmp/work/app",
      },
      profiles,
    );
    expect(rawBest?.id).toBe("exact-project");
    expect(rawBest?.plugins).toEqual(["nowledge-mem", "custom-plugin"]);
  });
});

describe("buildWorkspaceSkillInjection", () => {
  it("formats inline and manifest modes, includes Sidecar Skill Mandate, and deduplicates Nowledge-Mem Mandate", () => {
    const homeDir = makeTempDir("sidecar-inj-home-");
    const registry = new UnifiedRegistry(homeDir);

    const standaloneSkillDir = path.join(registry.paths.skillsDir, "alpha-rule");
    fs.mkdirSync(standaloneSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(standaloneSkillDir, "SKILL.md"),
      "---\nname: alpha-rule\ndescription: Alpha standalone rule\n---\n\n# Alpha\nAlways do A.\n",
      "utf-8",
    );

    const pluginRoot = path.join(homeDir, "plugin-nmem");
    fs.mkdirSync(path.join(pluginRoot, "skills"), { recursive: true });
    fs.writeFileSync(
      path.join(pluginRoot, "skills", "beta-flat.md"),
      "---\nname: beta-flat\ndescription: Beta flat plugin skill\n---\n\nAlways do B.\n",
      "utf-8",
    );

    const nmemPlugin: NormalizedPluginBundle = {
      plugin_id: "nowledge-mem-google-antigravity",
      name: "nowledge-mem-google-antigravity",
      version: "0.1.3",
      source_runtime: "native",
      root_dir: pluginRoot,
      hooks: [],
      skills: ["beta-flat"],
      metadata: {
        alias_ids: [
          "gemini-cli--nowledge-mem",
          "nowledge-mem",
          "nowledge-mem-google-antigravity",
        ],
      },
    };

    const profile: WorkspaceProfile = {
      id: "ws-inline",
      name: "Workspace Inline",
      canonical_cwd: "/tmp/proj",
      plugins: ["nowledge-mem-google-antigravity"],
      enabled: true,
      metadata: {
        skills: ["alpha-rule", "beta-flat"],
        skill_injection_mode: "inline",
      },
    };

    const inlineRes = buildWorkspaceSkillInjection({
      registry,
      profile,
      activePlugins: [nmemPlugin],
      runtime: "gemini-cli",
    });

    expect(inlineRes.mode).toBe("inline");
    expect(inlineRes.injectedSkillIds).toEqual(["alpha-rule", "beta-flat"]);
    expect(inlineRes.deliveryMechanism).toContain("PreInvocation");
    expect(inlineRes.deliveryMechanism).toContain("additionalContext");
    expect(inlineRes.deliveryMechanism).toContain("sidecar_load_skill");
    expect(inlineRes.injectedContext).toContain('<injected_skills mode="inline">');
    expect(inlineRes.injectedContext).toContain(SIDECAR_SKILL_MANDATE);
    expect(inlineRes.injectedContext).toContain("Always do A.");
    expect(inlineRes.injectedContext).toContain("Always do B.");
    expect(inlineRes.injectedContext).toContain(NOWLEDGE_MEM_MANDATE);

    // Manifest mode + alreadyInjectedContext containing [Nowledge-Mem Mandate]
    const manifestRes = buildWorkspaceSkillInjection({
      registry,
      profile,
      activePlugins: [nmemPlugin],
      runtime: "claude-code",
      mode: "manifest",
      alreadyInjectedContext: `Memory snippet\n\n${NOWLEDGE_MEM_MANDATE}`,
    });

    expect(manifestRes.mode).toBe("manifest");
    expect(manifestRes.injectedSkillIds).toEqual(["alpha-rule", "beta-flat"]);
    expect(manifestRes.injectedContext).toContain(
      '<injected_skills mode="manifest">',
    );
    expect(manifestRes.injectedContext).toContain("id: alpha-rule");
    expect(manifestRes.injectedContext).toContain("Alpha standalone rule");
    expect(manifestRes.injectedContext).toContain("skillMdPath:");
    expect(manifestRes.injectedContext).not.toContain("Always do A.");
    expect(manifestRes.injectedContext).not.toContain("[Nowledge-Mem Mandate]");

    for (const rt of [
      "claude-code",
      "claude-desktop",
      "claude-desktop-3p",
      "codex",
      "gemini-cli",
      "cursor",
      "openhands",
    ] satisfies RuntimeType[]) {
      const check = buildWorkspaceSkillInjection({
        registry,
        activePlugins: [],
        runtime: rt,
        explicitSkills: [],
      });
      expect(check.deliveryMechanism.length).toBeGreaterThan(10);
      expect(check.deliveryMechanism).toContain("hookSpecificOutput");
    }
  });
});

describe("daemon default onHookEvent and /api/admin/injection-preview", () => {
  it("dispatches SessionStart/PreInvocation hooks, merges workspace skill injection, and serves injection-preview", async () => {
    const sidecarHome = makeTempDir("sidecar-daemon-e2e-");
    const projectDir = makeTempDir("sidecar-proj-e2e-");
    const sockDir = makeTempDir("sidecar-sock-e2e-");

    // 1. Standalone skill in sidecarHome/skills
    const skillDir = path.join(sidecarHome, "skills", "clean-code");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillDir, "SKILL.md"),
      "---\nname: clean-code\ndescription: Keep diffs minimal\n---\n\nUse concise helpers.\n",
      "utf-8",
    );

    // 2. Versioned cached plugin: gemini-cli--nowledge-mem/1.0.0 with PreInvocation + PreToolUse hooks
    const pluginDir = path.join(
      sidecarHome,
      "plugins",
      "cache",
      "gemini-cli--nowledge-mem",
      "1.0.0",
    );
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({
        name: "nowledge-mem-google-antigravity",
        version: "1.0.0",
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pluginDir, "hooks.json"),
      JSON.stringify({
        "nowledge-mem-hooks": {
          PreInvocation: [
            {
              type: "command",
              command: `node -e "process.stdout.write(JSON.stringify({ hookSpecificOutput: { additionalContext: 'Restored memory bundle for session.' } }))"`,
              timeout: 5,
            },
          ],
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: `node -e "process.stdout.write(JSON.stringify({ updatedInput: { checked: true } }))"`,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    // 3. Workspaces config: Global '*' inherits plugin, project adds checked skill
    fs.writeFileSync(
      path.join(sidecarHome, "workspaces.yaml"),
      [
        "workspaces:",
        "  - id: global-agy",
        "    name: Global Agy",
        '    canonical_cwd: "*"',
        "    runtimes: [gemini-cli, claude-code]",
        "    plugins: [gemini-cli--nowledge-mem]",
        "    enabled: true",
        "    metadata:",
        "      skills: []",
        "  - id: proj-e2e",
        "    name: Project E2E",
        `    canonical_cwd: ${JSON.stringify(projectDir)}`,
        "    runtimes: [gemini-cli, claude-code]",
        "    plugins: []",
        "    enabled: true",
        "    metadata:",
        "      skills: [clean-code]",
        "      skill_injection_mode: inline",
      ].join("\n"),
      "utf-8",
    );

    const daemon = await startDaemon({
      httpPort: 0,
      sockPath: path.join(sockDir, "hook.sock"),
      sidecarHome,
    });
    daemons.push(daemon);

    // A. POST /hook with SessionStart (gemini-cli does NOT fall back to PreInvocation) + defensive payload normalization (cwd -> canonical_cwd)
    const hookRes = await fetch(`${daemon.httpUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          runtime: "gemini-cli",
          cwd: projectDir,
          hook_event_name: "SessionStart",
        },
      }),
    });
    expect(hookRes.status).toBe(200);
    const hookJson = (await hookRes.json()) as {
      exitCode: number;
      stdoutJson?: string;
      stderrText?: string;
    };
    expect(hookJson.exitCode).toBe(0);
    expect(hookJson.stdoutJson).toBeTruthy();

    const stdoutParsed = JSON.parse(hookJson.stdoutJson!) as {
      injectSteps?: Array<{ ephemeralMessage?: string }>;
      additionalContext?: unknown;
      hookSpecificOutput?: unknown;
    };
    expect(stdoutParsed.additionalContext).toBeUndefined();
    expect(stdoutParsed.hookSpecificOutput).toBeUndefined();
    expect(stdoutParsed.injectSteps).toHaveLength(1);
    const sessionEphemeral = stdoutParsed.injectSteps![0].ephemeralMessage ?? "";
    expect(sessionEphemeral).not.toContain("Restored memory bundle for session.");
    expect(sessionEphemeral).toContain("Use concise helpers.");
    expect(sessionEphemeral).toContain(SIDECAR_SKILL_MANDATE);
    expect(sessionEphemeral).toContain(NOWLEDGE_MEM_MANDATE);

    // A2. POST /hook with direct PreInvocation event returns strict protojson injectSteps (no additionalContext/hookSpecificOutput)
    const preInvRes = await fetch(`${daemon.httpUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          runtime: "gemini-cli",
          canonical_cwd: projectDir,
          event_name: "PreInvocation",
          invocationNum: 0,
        },
      }),
    });
    expect(preInvRes.status).toBe(200);
    const preInvJson = (await preInvRes.json()) as {
      exitCode: number;
      stdoutJson?: string;
    };
    expect(preInvJson.exitCode).toBe(0);
    const preInvOut = JSON.parse(preInvJson.stdoutJson!) as {
      injectSteps?: Array<{ ephemeralMessage?: string }>;
      additionalContext?: unknown;
      hookSpecificOutput?: unknown;
    };
    expect(preInvOut.additionalContext).toBeUndefined();
    expect(preInvOut.hookSpecificOutput).toBeUndefined();
    expect(preInvOut.injectSteps).toHaveLength(1);
    const preInvEphemeral = preInvOut.injectSteps![0].ephemeralMessage ?? "";
    expect(preInvEphemeral).toContain("Restored memory bundle for session.");
    expect(preInvEphemeral).toContain("Use concise helpers.");
    expect(preInvEphemeral).toContain(SIDECAR_SKILL_MANDATE);
    expect(preInvEphemeral).toContain(NOWLEDGE_MEM_MANDATE);

    // A3. Subsequent gemini-cli PreInvocation (invocationNum: 2) does NOT re-inject workspace skills
    const subseqRes = await fetch(`${daemon.httpUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          conversationId: "conv-subseq",
          workspacePaths: [projectDir],
          invocationNum: 2,
          initialNumSteps: 5,
        },
      }),
    });
    expect(subseqRes.status).toBe(200);
    const subseqJson = (await subseqRes.json()) as {
      exitCode: number;
      stdoutJson?: string;
    };
    expect(subseqJson.exitCode).toBe(0);
    const subseqOut = JSON.parse(subseqJson.stdoutJson!) as {
      injectSteps?: Array<{ ephemeralMessage?: string }>;
      additionalContext?: unknown;
      hookSpecificOutput?: unknown;
    };
    expect(subseqOut.additionalContext).toBeUndefined();
    expect(subseqOut.hookSpecificOutput).toBeUndefined();
    expect(subseqOut.injectSteps).toHaveLength(1);
    const subseqEphemeral = subseqOut.injectSteps![0].ephemeralMessage ?? "";
    expect(subseqEphemeral).toContain("Restored memory bundle for session.");
    expect(subseqEphemeral).not.toContain("Use concise helpers.");
    expect(subseqEphemeral).not.toContain(SIDECAR_SKILL_MANDATE);
    expect(subseqEphemeral).not.toContain(NOWLEDGE_MEM_MANDATE);

    // B. POST /hook with PreToolUse preserves updatedInput and permissionDecision for claude-code
    const toolRes = await fetch(`${daemon.httpUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          runtime: "claude-code",
          canonical_cwd: projectDir,
          event_name: "PreToolUse",
          tool_name: "Bash",
          tool_input: { cmd: "echo hi" },
        },
      }),
    });
    expect(toolRes.status).toBe(200);
    const toolJson = (await toolRes.json()) as {
      exitCode: number;
      stdoutJson?: string;
    };
    expect(toolJson.exitCode).toBe(0);
    const toolOut = JSON.parse(toolJson.stdoutJson!) as {
      updatedInput?: Record<string, unknown>;
      permissionDecision?: string;
    };
    expect(toolOut.updatedInput).toEqual({ checked: true });
    expect(toolOut.permissionDecision).toBe("allow");

    // C. POST /api/admin/injection-preview returns resolved profile, active plugins, and manifest/inline preview
    const previewRes = await fetch(
      `${daemon.httpUrl}/api/admin/injection-preview`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runtime: "gemini-cli",
          cwd: projectDir,
          mode: "manifest",
        }),
      },
    );
    expect(previewRes.status).toBe(200);
    const previewJson = (await previewRes.json()) as {
      ok: boolean;
      runtime: string;
      cwd: string;
      profileId: string;
      activePluginIds: string[];
      mode: string;
      deliveryMechanism: string;
      injectedSkillIds: string[];
      injectedContext: string;
    };
    expect(previewJson.ok).toBe(true);
    expect(previewJson.runtime).toBe("gemini-cli");
    expect(previewJson.cwd).toBe(path.resolve(projectDir));
    expect(previewJson.profileId).toBe("proj-e2e");
    expect(previewJson.activePluginIds).toEqual([
      "nowledge-mem-google-antigravity",
    ]);
    expect(previewJson.mode).toBe("manifest");
    expect(previewJson.deliveryMechanism).toContain("PreInvocation");
    expect(previewJson.injectedSkillIds).toEqual(["clean-code"]);
    expect(previewJson.injectedContext).toContain(
      '<injected_skills mode="manifest">',
    );
    expect(previewJson.injectedContext).toContain("clean-code");
    expect(previewJson.injectedContext).toContain(NOWLEDGE_MEM_MANDATE);
  });

  it("infers Antigravity PreToolUse payloads and preserves strict protojson allow/ask/force_ask/deny decisions", async () => {
    const sidecarHome = makeTempDir("sidecar-agy-pretool-home-");
    const projectDir = makeTempDir("sidecar-agy-pretool-proj-");
    const sockDir = makeTempDir("sidecar-agy-pretool-sock-");

    const pluginDir = path.join(
      sidecarHome,
      "plugins",
      "cache",
      "gemini-cli--policy-guard",
      "1.0.0",
    );
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({ name: "policy-guard", version: "1.0.0" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(pluginDir, "hooks.json"),
      JSON.stringify({
        guard: {
          PreToolUse: [
            {
              matcher: "*",
              hooks: [
                {
                  type: "command",
                  command: `node -e "const d = JSON.parse(require('fs').readFileSync(0,'utf8')); const cmd = d.toolCall?.args?.CommandLine || ''; if (cmd.includes('deny')) { console.log(JSON.stringify({ decision: 'deny', reason: 'Denied command' })); process.exit(2); } if (cmd.includes('force')) { console.log(JSON.stringify({ decision: 'force_ask', reason: 'Force confirm' })); } else if (cmd.includes('ask')) { console.log(JSON.stringify({ decision: 'ask', reason: 'Ask confirm' })); } else { console.log(JSON.stringify({ decision: 'allow', permissionOverrides: ['Bash'], additionalContext: 'ignore me' })); }"`,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(sidecarHome, "workspaces.yaml"),
      [
        "workspaces:",
        "  - id: global-agy-guard",
        "    name: Global Agy Guard",
        '    canonical_cwd: "*"',
        "    runtimes: [gemini-cli]",
        "    plugins: [policy-guard]",
        "    enabled: true",
      ].join("\n"),
      "utf-8",
    );

    const daemon = await startDaemon({
      httpPort: 0,
      sockPath: path.join(sockDir, "hook.sock"),
      sidecarHome,
    });
    daemons.push(daemon);

    const postPreTool = async (commandLine: string) => {
      const res = await fetch(`${daemon.httpUrl}/hook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            conversationId: "conv-agy-1",
            workspacePaths: [projectDir],
            toolCall: { name: "run_command", args: { CommandLine: commandLine } },
          },
        }),
      });
      expect(res.status).toBe(200);
      return (await res.json()) as { exitCode: number; stdoutJson?: string };
    };

    const allowRes = await postPreTool("echo allow");
    expect(allowRes.exitCode).toBe(0);
    expect(JSON.parse(allowRes.stdoutJson!)).toEqual({
      decision: "allow",
      permissionOverrides: ["Bash"],
    });

    const askRes = await postPreTool("echo ask");
    expect(askRes.exitCode).toBe(0);
    expect(JSON.parse(askRes.stdoutJson!)).toEqual({
      decision: "ask",
      reason: "Ask confirm",
    });

    const forceRes = await postPreTool("echo force");
    expect(forceRes.exitCode).toBe(0);
    expect(JSON.parse(forceRes.stdoutJson!)).toEqual({
      decision: "force_ask",
      reason: "Force confirm",
    });

    const denyRes = await postPreTool("echo deny");
    expect(denyRes.exitCode).toBe(2);
    const denyParsed = JSON.parse(denyRes.stdoutJson!) as Record<string, unknown>;
    expect(denyParsed).toEqual({
      decision: "deny",
      reason: "Denied command",
    });
    expect(denyParsed.permissionDecision).toBeUndefined();
    expect(denyParsed.additionalContext).toBeUndefined();
    expect(denyParsed.hookSpecificOutput).toBeUndefined();
  });

  it("deduplicates claude-code--nowledge-mem vs gemini-cli--nowledge-mem by runtime", async () => {
    const sidecarHome = makeTempDir("sidecar-dedup-home-");
    const projectDir = makeTempDir("sidecar-dedup-proj-");
    const sockDir = makeTempDir("sidecar-dedup-sock-");

    // 1. claude-code--nowledge-mem/0.7.36
    const claudeDir = path.join(
      sidecarHome,
      "plugins",
      "cache",
      "claude-code--nowledge-mem",
      "0.7.36",
    );
    fs.mkdirSync(path.join(claudeDir, ".claude-plugin"), { recursive: true });
    fs.mkdirSync(path.join(claudeDir, "hooks"), { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: "nowledge-mem", version: "0.7.36" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(claudeDir, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          SessionStart: [
            {
              matcher: "startup",
              hooks: [
                {
                  type: "command",
                  command: `node -e "console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'claude-nmem-ctx' } }))"`,
                  timeout: 5,
                },
              ],
            },
          ],
        },
      }),
      "utf-8",
    );

    // 2. gemini-cli--nowledge-mem/1.0.0 (loads with plugin_id: nowledge-mem-google-antigravity)
    const geminiDir = path.join(
      sidecarHome,
      "plugins",
      "cache",
      "gemini-cli--nowledge-mem",
      "1.0.0",
    );
    fs.mkdirSync(geminiDir, { recursive: true });
    fs.writeFileSync(
      path.join(geminiDir, "plugin.json"),
      JSON.stringify({ name: "nowledge-mem-google-antigravity", version: "0.1.3" }),
      "utf-8",
    );
    fs.writeFileSync(
      path.join(geminiDir, "hooks.json"),
      JSON.stringify({
        "nowledge-mem-hooks": {
          PreInvocation: [
            {
              type: "command",
              command: `node -e "console.log(JSON.stringify({ hookSpecificOutput: { additionalContext: 'gemini-nmem-ctx' } }))"`,
              timeout: 5,
            },
          ],
        },
      }),
      "utf-8",
    );

    fs.writeFileSync(
      path.join(sidecarHome, "workspaces.yaml"),
      [
        "workspaces:",
        "  - id: global-shared",
        "    name: Global Shared",
        '    canonical_cwd: "*"',
        "    plugins: [nowledge-mem]",
        "    enabled: true",
      ].join("\n"),
      "utf-8",
    );

    const daemon = await startDaemon({
      httpPort: 0,
      sockPath: path.join(sockDir, "hook.sock"),
      sidecarHome,
    });
    daemons.push(daemon);

    // Verify preview activePluginIds per runtime
    const gemPreview = await fetch(`${daemon.httpUrl}/api/admin/injection-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "gemini-cli", cwd: projectDir }),
    }).then((r) => r.json() as Promise<{ activePluginIds: string[] }>);
    expect(gemPreview.activePluginIds).toEqual(["nowledge-mem-google-antigravity"]);

    const claudePreview = await fetch(`${daemon.httpUrl}/api/admin/injection-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "claude-code", cwd: projectDir }),
    }).then((r) => r.json() as Promise<{ activePluginIds: string[] }>);
    expect(claudePreview.activePluginIds).toEqual(["nowledge-mem"]);

    // Verify /hook dispatches only runtime-matched variant
    const gemHook = await fetch(`${daemon.httpUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          conversationId: "conv-dedup",
          workspacePaths: [projectDir],
          invocationNum: 0,
        },
      }),
    }).then((r) => r.json() as Promise<{ exitCode: number; stdoutJson?: string }>);
    expect(gemHook.exitCode).toBe(0);
    const gemOut = JSON.parse(gemHook.stdoutJson!) as {
      injectSteps?: Array<{ ephemeralMessage?: string }>;
      additionalContext?: unknown;
      hookSpecificOutput?: unknown;
    };
    expect(gemOut.additionalContext).toBeUndefined();
    expect(gemOut.hookSpecificOutput).toBeUndefined();
    expect(gemOut.injectSteps?.[0]?.ephemeralMessage).toContain("gemini-nmem-ctx");
    expect(gemOut.injectSteps?.[0]?.ephemeralMessage).not.toContain("claude-nmem-ctx");

    const claudeHook = await fetch(`${daemon.httpUrl}/hook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: {
          runtime: "claude-code",
          canonical_cwd: projectDir,
          hook_event_name: "SessionStart",
        },
      }),
    }).then((r) => r.json() as Promise<{ exitCode: number; stdoutJson?: string }>);
    expect(claudeHook.exitCode).toBe(0);
    const claudeOut = JSON.parse(claudeHook.stdoutJson!) as {
      additionalContext?: string;
      hookSpecificOutput?: { additionalContext?: string };
    };
    expect(claudeOut.additionalContext).toContain("claude-nmem-ctx");
    expect(claudeOut.additionalContext).not.toContain("gemini-nmem-ctx");
    expect(claudeOut.hookSpecificOutput?.additionalContext).toContain("claude-nmem-ctx");
  });
});
