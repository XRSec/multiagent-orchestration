import { describe, expect, it, afterEach } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveSessionRole,
  sessionRolePrompt,
  teamPrompt,
  teamsPrompt,
  type SessionRoleKind,
} from "../shared/groups";
import {
  promptSections,
  type Bot,
  type BotGroup,
  type PromptContext,
  EMPTY_LIBRARY,
} from "../shared/bot";
import {
  loadTargetProjectRules,
  systemPrompt,
  MAX_PROJECT_RULES_BYTES,
} from "../server/prompt";
import { makeBot } from "./helpers";
import type { WorkflowDefinition } from "../shared/workflows";

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("WP-4: Six-Block Role-Aware Prompt Assembler & Target AGENTS.md Loader", () => {
  describe("SessionRoleKind Classification (resolveSessionRole)", () => {
    const group: Pick<BotGroup, "id" | "leadId"> = { id: "team-core", leadId: "bot-lead" };

    it("classifies as dispatched-worker when isWorkflowStage is true or askedByBotId is provided", () => {
      expect(resolveSessionRole({ botId: "bot-lead", group, isWorkflowStage: true })).toBe("dispatched-worker");
      expect(resolveSessionRole({ botId: "bot-lead", group, askedByBotId: "bot-caller" })).toBe("dispatched-worker");
      expect(resolveSessionRole({ botId: "bot-worker", isWorkflowStage: true })).toBe("dispatched-worker");
    });

    it("classifies as dm when group is missing or null", () => {
      expect(resolveSessionRole({ botId: "bot-1", group: null })).toBe("dm");
      expect(resolveSessionRole({ botId: "bot-1" })).toBe("dm");
    });

    it("classifies as team-lead when group.leadId matches botId", () => {
      expect(resolveSessionRole({ botId: "bot-lead", group })).toBe("team-lead");
    });

    it("classifies as team-direct-specialist when on a team but not the lead", () => {
      expect(resolveSessionRole({ botId: "bot-worker", group })).toBe("team-direct-specialist");
    });
  });

  describe("Session Role Prompt Texts (sessionRolePrompt)", () => {
    const bot = makeBot({ id: "bot-alpha", name: "AlphaBot" });
    const leadBot = makeBot({ id: "bot-lead", name: "LeadBot" });
    const group: BotGroup = {
      id: "team-1",
      name: "Engineering",
      logo: null,
      leadId: "bot-lead",
      memberIds: ["bot-lead", "bot-alpha"],
      instructions: "Follow coding conventions.",
      cwd: null,
      mounts: [],
      createdAt: "2026-09-27T00:00:00.000Z",
      updatedAt: "2026-09-27T00:00:00.000Z",
    };

    it("renders direct assistant contract for dm", () => {
      const text = sessionRolePrompt("dm", { bot });
      expect(text).toContain("Session Role: Direct Assistant");
      expect(text).toContain("personal assistant");
      expect(text).toContain("concisely");
    });

    it("renders chief of staff contract with blackboard manifest and protocol for team-lead", () => {
      const text = sessionRolePrompt("team-lead", {
        bot: leadBot,
        group,
        sessionBoardPath: "/managed/sessions/sess-123",
      });
      expect(text).toContain("Session Role: Team Lead / Chief of Staff");
      expect(text).toContain("/managed/sessions/sess-123/TASK_MANIFEST.md");
      expect(text).toContain("Workflow Orchestration Protocol:");
      expect(text).toContain("ZERO DIRECT EXECUTION");
      expect(text).toContain("<worker_handoff>");
      expect(text).toContain("max 3");
    });

    it("renders domain-bounded specialist contract for team-direct-specialist", () => {
      const text = sessionRolePrompt("team-direct-specialist", { bot, group, leadBot });
      expect(text).toContain("Session Role: Team Specialist");
      expect(text).toContain("domain-bounded specialist");
      expect(text).toContain("LeadBot (bot-lead)");
      expect(text).toContain("ask_bot");
    });

    it("renders worker protocol suffix for dispatched-worker", () => {
      const text = sessionRolePrompt("dispatched-worker", { bot });
      expect(text).toContain("Session Role: Dispatched Worker");
      expect(text).toContain("<worker_protocol>");
      expect(text).toContain("STRICT SCOPE");
      expect(text).toContain("MANDATORY VERIFICATION");
      expect(text).toContain("<worker_handoff>");
    });
  });

  describe("Workflow Catalog Gating in teamPrompt / teamsPrompt", () => {
    const lead = makeBot({ id: "bot-lead", name: "Lead" });
    const member = makeBot({ id: "bot-member", name: "Member" });
    const workflows: WorkflowDefinition[] = [
      {
        id: "wf-ci",
        name: "Continuous Integration",
        description: "Run automated tests",
        stages: [{ id: "s1", name: "Test", botId: "bot-member", prompt: "Run tests", engine: "auto", dependsOn: [], maxRetries: 2 }],
      },
    ];
    const group: BotGroup = {
      id: "team-gate",
      name: "Gate Team",
      logo: null,
      leadId: "bot-lead",
      memberIds: ["bot-lead", "bot-member"],
      instructions: "Team rules.",
      cwd: null,
      mounts: [],
      workflows,
      createdAt: "2026-09-27T00:00:00.000Z",
      updatedAt: "2026-09-27T00:00:00.000Z",
    };

    it("includes workflows catalog when role is team-lead", () => {
      const text = teamPrompt(group, lead, [lead, member], workflows, "team-lead");
      expect(text).toContain('Available workflows for "Gate Team"');
      expect(text).toContain("Continuous Integration");
    });

    it("omits workflows catalog when role is team-direct-specialist, even for lead bot", () => {
      const text = teamPrompt(group, lead, [lead, member], workflows, "team-direct-specialist");
      expect(text).not.toContain('Available workflows for "Gate Team"');
      expect(text).not.toContain("Continuous Integration");
    });

    it("omits workflows catalog when role is dispatched-worker", () => {
      const text = teamPrompt(group, member, [lead, member], workflows, "dispatched-worker");
      expect(text).not.toContain('Available workflows for "Gate Team"');
      expect(text).not.toContain("Continuous Integration");
    });

    it("omits workflows catalog when role is dm", () => {
      const text = teamPrompt(group, lead, [lead, member], workflows, "dm");
      expect(text).not.toContain('Available workflows for "Gate Team"');
    });

    it("omits team section in promptSections when sessionRole is dm", () => {
      const bot = makeBot({ id: "bot-lead" });
      const context: PromptContext = {
        memory: "",
        memoryPath: null,
        recentWork: [],
        playbooks: [],
        skills: [],
        paseoTools: false,
        botTools: false,
        apps: [],
        team: "Team Section Content",
        sessionRole: "dm",
      };
      const sections = promptSections(bot, context);
      expect(sections.find((s) => s.title === "Team")).toBeUndefined();
      expect(sections.find((s) => s.title === "Session role")?.text).toContain("Session Role: Direct Assistant");
    });

    it("includes team section in promptSections when sessionRole is team-lead or team-direct-specialist", () => {
      const bot = makeBot({ id: "bot-lead" });
      const contextLead: PromptContext = {
        memory: "",
        memoryPath: null,
        recentWork: [],
        playbooks: [],
        skills: [],
        paseoTools: false,
        botTools: false,
        apps: [],
        team: "Team Section Content",
        sessionRole: "team-lead",
      };
      expect(promptSections(bot, contextLead).find((s) => s.title === "Team")).toBeDefined();

      const contextSpecialist: PromptContext = {
        ...contextLead,
        sessionRole: "team-direct-specialist",
      };
      expect(promptSections(bot, contextSpecialist).find((s) => s.title === "Team")).toBeDefined();
    });
  });

  describe("Target Project Rules Loader (loadTargetProjectRules)", () => {
    it("loads AGENTS.md within maxBytes without truncation", async () => {
      const repoDir = await makeTempDir("repo-agents-");
      const content = "# Repository Rules\n\nRule 1: Always verify.";
      await writeFile(join(repoDir, "AGENTS.md"), content, "utf8");

      const rules = await loadTargetProjectRules([repoDir]);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.path).toBe(repoDir);
      expect(rules[0]!.rulesFile).toBe(join(repoDir, "AGENTS.md"));
      expect(rules[0]!.rulesExcerpt).toBe(content);
      expect(rules[0]!.truncated).toBe(false);
    });

    it("falls back to CLAUDE.md when AGENTS.md is absent", async () => {
      const repoDir = await makeTempDir("repo-claude-fallback-");
      const content = "# Claude Guidelines\n\nUse conventional commits.";
      await writeFile(join(repoDir, "CLAUDE.md"), content, "utf8");

      const rules = await loadTargetProjectRules([repoDir]);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.path).toBe(repoDir);
      expect(rules[0]!.rulesFile).toBe(join(repoDir, "CLAUDE.md"));
      expect(rules[0]!.rulesExcerpt).toBe(content);
      expect(rules[0]!.truncated).toBe(false);
    });

    it("truncates AGENTS.md at 16384 bytes when oversized", async () => {
      const repoDir = await makeTempDir("repo-large-rules-");
      // 20 KB content
      const largeContent = "A".repeat(20000);
      await writeFile(join(repoDir, "AGENTS.md"), largeContent, "utf8");

      const rules = await loadTargetProjectRules([repoDir], MAX_PROJECT_RULES_BYTES);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.truncated).toBe(true);
      expect(Buffer.byteLength(rules[0]!.rulesExcerpt!, "utf8")).toBe(16384);
      expect(rules[0]!.rulesFile).toBe(join(repoDir, "AGENTS.md"));
    });

    it("handles directories without any rules file gracefully", async () => {
      const emptyDir = await makeTempDir("repo-no-rules-");
      const rules = await loadTargetProjectRules([emptyDir]);
      expect(rules).toHaveLength(1);
      expect(rules[0]!.path).toBe(emptyDir);
      expect(rules[0]!.rulesExcerpt).toBeUndefined();
      expect(rules[0]!.rulesFile).toBeUndefined();
    });
  });

  describe("Six-Block Deterministic Order in promptSections", () => {
    it("emits blocks 1 through 6 in §5.2 deterministic order", () => {
      const bot = makeBot({
        id: "bot-orchestrator",
        name: "Orchestrator",
        title: "Team Lead",
        description: "Directs team tasks",
        soul: "Lead instructions.",
      });

      const context: PromptContext = {
        memory: "Personal memory details",
        memoryPath: "/home/bot-orchestrator/MEMORY.md",
        recentWork: ["- yesterday · Finished task"],
        sessionRole: "team-lead",
        sessionBoardPath: "/managed/session/sess-1",
        team: "Teammates and instructions",
        workdir: "/managed/session/sess-1/seats/bot-orchestrator",
        mounts: ["/repos/app"],
        targetProjects: [
          {
            path: "/repos/app",
            rulesFile: "/repos/app/AGENTS.md",
            rulesExcerpt: "Code rules excerpt",
            truncated: true,
          },
        ],
        skills: [{ name: "reviewer", description: "Reviews code", path: "/skills/reviewer/SKILL.md" }],
        playbooks: [],
        apps: [],
        botTools: true,
        paseoTools: true,
      };

      const sections = promptSections(bot, context);
      const titles = sections.map((s) => s.title);

      // Block 1: Persona, Standing instructions, Memory, Recent work
      expect(titles[0]).toBe("Persona");
      expect(titles[1]).toBe("Standing instructions");
      expect(titles[2]).toBe("Memory");
      expect(titles[3]).toBe("Recent work");

      // Block 2: Session role
      expect(titles[4]).toBe("Session role");
      expect(sections[4]!.text).toContain("Session Role: Team Lead / Chief of Staff");

      // Block 3: Team
      expect(titles[5]).toBe("Team");

      // Block 4: Workspace and Session blackboard
      expect(titles[6]).toBe("Workspace");
      expect(titles[7]).toBe("Session blackboard");
      expect(sections[7]!.text).toContain("Session blackboard: /managed/session/sess-1");
      expect(sections[7]!.text).toContain("Task manifest: /managed/session/sess-1/TASK_MANIFEST.md");
      expect(sections[7]!.text).toContain("Handoff directory: /managed/session/sess-1/handoffs/");

      // Block 5: Target projects
      expect(titles[8]).toBe("Target projects");
      expect(sections[8]!.text).toContain('<project_rules repo="/repos/app">');
      expect(sections[8]!.text).toContain("Code rules excerpt");
      expect(sections[8]!.text).toContain('Read "/repos/app/AGENTS.md" for remaining sections.');
      expect(sections[8]!.text).toContain("</project_rules>");

      // Block 6: Skills, Tools
      expect(titles[9]).toBe("Skills");
      expect(titles[10]).toBe("Bot tools");
      expect(titles[11]).toBe("Paseo tools");
    });
  });

  describe("Integration in systemPrompt (Seat Skills, Run Artifacts, Team Memory)", () => {
    it("loads team root MEMORY.md and trims to 8192 bytes budget", async () => {
      const managedRoot = await makeTempDir("managed-team-mem-");
      const teamRoot = join(managedRoot, "shared", "Teams", "team-qa");
      await mkdir(teamRoot, { recursive: true });

      const memoryContent = "Important shared QA memory notes.\n".repeat(500); // oversized
      await writeFile(join(teamRoot, "MEMORY.md"), memoryContent, "utf8");

      const bot = makeBot({ id: "bot-qa", provider: "claude" });
      const group: BotGroup = {
        id: "team-qa",
        name: "QA Team",
        logo: null,
        leadId: "bot-qa",
        memberIds: ["bot-qa"],
        instructions: "Do not regress.",
        cwd: null,
        mounts: [],
        createdAt: "2026-09-27T00:00:00.000Z",
        updatedAt: "2026-09-27T00:00:00.000Z",
      };

      const result = await systemPrompt(
        {
          bot,
          local: true,
          group,
          teamRootPath: teamRoot,
          syncAgy: false,
          syncClaude: false,
          allowedRootOverride: managedRoot,
        },
        EMPTY_LIBRARY,
        null,
      );

      const teamSection = result.sections.find((s) => s.title === "Team");
      expect(teamSection).toBeDefined();
      expect(teamSection?.text).toContain(`Team shared memory (${join(teamRoot, "MEMORY.md")}):`);
      expect(teamSection?.text).toContain("Important shared QA memory notes.");
    });

    it("invokes syncSeatSkills when seatDir is provided and updates skill paths", async () => {
      const managedRoot = await makeTempDir("seat-skills-test-");
      const seatDir = join(managedRoot, "shared", "Teams", "team-dev", "agents", "bot-dev");
      await mkdir(seatDir, { recursive: true });

      const librarySkillDir = join(managedRoot, "library", "skills", "skill-lint");
      await mkdir(librarySkillDir, { recursive: true });
      await writeFile(join(librarySkillDir, "SKILL.md"), "# Lint Skill\nRun eslint.", "utf8");

      const library = {
        skills: [
          {
            id: "skill-lint",
            description: "Linter tool",
            source: "",
            enabled: true,
            createdAt: "2026-09-27T00:00:00.000Z",
            updatedAt: "2026-09-27T00:00:00.000Z",
          },
        ],
        mcpServers: [],
      };

      const bot = makeBot({ id: "bot-dev", skillIds: ["skill-lint"] });

      const result = await systemPrompt(
        {
          bot,
          local: true,
          seatDir,
          syncAgy: false,
          syncClaude: false,
          allowedRootOverride: managedRoot,
        },
        library,
        null,
      );

      const skillsSection = result.sections.find((s) => s.title === "Skills");
      expect(skillsSection).toBeDefined();
      expect(skillsSection?.text).toContain(join(seatDir, ".agents", "skills", "skill-lint", "SKILL.md"));
    });

    it("invokes writeSessionRunArtifacts and returns promptFilePath and mcpConfigPath", async () => {
      const managedRoot = await makeTempDir("session-artifacts-test-");
      const runsDir = join(managedRoot, "shared", "Teams", "team-dev", "sessions", "sess-test", "runs");
      await mkdir(runsDir, { recursive: true });

      const bot = makeBot({ id: "bot-worker", provider: "claude" });

      const result = await systemPrompt(
        {
          bot,
          local: true,
          runsDir,
          agentId: "bot-worker",
          syncAgy: false,
          syncClaude: false,
          allowedRootOverride: managedRoot,
        },
        EMPTY_LIBRARY,
        null,
      );

      expect(result.promptFilePath).toBe(join(runsDir, "bot-worker.prompt.md"));
      expect(result.mcpConfigPath).toBe(join(runsDir, "bot-worker.mcp.json"));

      const savedPrompt = await readFile(result.promptFilePath!, "utf8");
      expect(savedPrompt).toBe(result.systemPrompt);

      const savedMcp = await readFile(result.mcpConfigPath!, "utf8");
      expect(savedMcp).toContain("mcpServers");
    });
  });
});
