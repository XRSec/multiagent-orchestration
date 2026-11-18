import { describe, expect, it } from "vitest";
import { en } from "../client/i18n/en";
import { zhCN } from "../client/i18n/zh-CN";
import {
  formatWorkflowLaunchPrompt,
  resolveAvailableWorkflows,
  shouldRetainWorkflowSelection,
} from "../client/launcher/workflowSelection";
import type { WorkflowDefinition } from "../shared/workflows";

function makeWorkflow(id: string, name: string, stageCount = 1): WorkflowDefinition {
  return {
    id,
    name,
    description: `Description for ${name}`,
    stages: Array.from({ length: stageCount }, (_, i) => ({
      id: `stage-${i + 1}`,
      name: `Stage ${i + 1}`,
      botId: "bot-mocode",
      prompt: "Execute stage",
      engine: "auto" as const,
      dependsOn: [],
      maxRetries: 1,
    })),
  };
}

describe("Workflow Quick-Select resolution in BotLauncher", () => {
  it("returns empty array if no group is provided", () => {
    const globals = [makeWorkflow("wf-global", "Global Pipeline")];
    expect(resolveAvailableWorkflows(null, globals)).toEqual([]);
    expect(resolveAvailableWorkflows(undefined, globals)).toEqual([]);
  });

  it("returns team workflows when no global workflows exist", () => {
    const teamWf = makeWorkflow("wf-team", "Team Workflow");
    const group = { id: "team-1", workflows: [teamWf] };
    const resolved = resolveAvailableWorkflows(group, []);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe("wf-team");
  });

  it("returns global workflows when team has no scoped workflows", () => {
    const globalWf = makeWorkflow("wf-global", "Global Workflow");
    const group = { id: "team-1", workflows: [] };
    const resolved = resolveAvailableWorkflows(group, [globalWf]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe("wf-global");
  });

  it("deduplicates workflows by id, giving team-scoped workflows precedence over global templates", () => {
    const globalWf1 = makeWorkflow("wf-shared", "Global Shared Version");
    const globalWf2 = makeWorkflow("wf-global-only", "Global Only");
    const teamWf1 = makeWorkflow("wf-shared", "Team Specialized Version");
    const teamWf2 = makeWorkflow("wf-team-only", "Team Only");

    const group = { id: "team-ops", workflows: [teamWf1, teamWf2] };
    const resolved = resolveAvailableWorkflows(group, [globalWf1, globalWf2]);

    expect(resolved).toHaveLength(3);
    // Team workflows appear first
    expect(resolved[0]?.id).toBe("wf-shared");
    expect(resolved[0]?.name).toBe("Team Specialized Version"); // Team override wins!
    expect(resolved[1]?.id).toBe("wf-team-only");
    expect(resolved[2]?.id).toBe("wf-global-only");
  });
});

describe("Workflow Quick-Select selection retention on team switch", () => {
  const globalWf = makeWorkflow("wf-global", "Global Pipeline");
  const team1Wf = makeWorkflow("wf-team-1", "Team 1 Pipeline");
  const team2Wf = makeWorkflow("wf-team-2", "Team 2 Pipeline");
  const sharedTeamWf = makeWorkflow("wf-shared-teams", "Shared across both teams");

  const group1 = { id: "group-1", workflows: [team1Wf, sharedTeamWf] };
  const group2 = { id: "group-2", workflows: [team2Wf, sharedTeamWf] };
  const globals = [globalWf];

  it("returns false for null or empty workflowId", () => {
    expect(shouldRetainWorkflowSelection(null, group2, globals)).toBe(false);
    expect(shouldRetainWorkflowSelection(undefined, group2, globals)).toBe(false);
    expect(shouldRetainWorkflowSelection("", group2, globals)).toBe(false);
  });

  it("retains selection when the selected workflow is global", () => {
    expect(shouldRetainWorkflowSelection("wf-global", group2, globals)).toBe(true);
    expect(shouldRetainWorkflowSelection("wf-global", { id: "group-empty", workflows: [] }, globals)).toBe(true);
  });

  it("retains selection if the new team also contains the same workflow", () => {
    expect(shouldRetainWorkflowSelection("wf-shared-teams", group2, globals)).toBe(true);
  });

  it("resets (returns false) if the workflow was team-scoped and does not exist in the new team", () => {
    expect(shouldRetainWorkflowSelection("wf-team-1", group2, globals)).toBe(false);
  });
});

describe("formatWorkflowLaunchPrompt", () => {
  it("formats prompt instructing lead bot to immediately execute run_workflow with workflow_id", () => {
    const prompt = formatWorkflowLaunchPrompt(
      "wf-moadmin-closed-loop",
      "Fix auth token refresh failure",
      "moAdmin 全流程闭环编排",
    );

    expect(prompt).toContain('run_workflow');
    expect(prompt).toContain('workflow_id: "wf-moadmin-closed-loop"');
    expect(prompt).toContain('"moAdmin 全流程闭环编排"');
    expect(prompt).toContain("Task Objective:\nFix auth token refresh failure");
  });

  it("formats prompt cleanly when workflowName is not provided", () => {
    const prompt = formatWorkflowLaunchPrompt("wf-quick-check", "Check system logs");
    expect(prompt).toContain('workflow_id: "wf-quick-check"');
    expect(prompt).toContain("Task Objective:\nCheck system logs");
  });

  it("handles whitespace-only or empty user input", () => {
    const prompt = formatWorkflowLaunchPrompt("wf-cleanup", "   ");
    expect(prompt).toContain('workflow_id: "wf-cleanup"');
    expect(prompt).not.toContain("Task Objective:");
  });

  it("preserves attachment payloads and multiline input in task objective", () => {
    const multilineInput = [
      "Please run analysis on this report.",
      "--- [Attachment: report.txt] ---",
      "Line 1: Status OK",
      "Line 2: Memory 82%",
      "--- [End of report.txt] ---",
    ].join("\n");

    const prompt = formatWorkflowLaunchPrompt("wf-report-analyze", multilineInput, "Report Analysis");
    expect(prompt).toContain('workflow_id: "wf-report-analyze"');
    expect(prompt).toContain("Task Objective:\n" + multilineInput);
  });
});

describe("Workflow Quick-Select i18n keys", () => {
  it("provides matching keys for workflowLabel and workflowFreeChat in both en and zh-CN", () => {
    expect(en.launcher.workflowLabel).toBe("Workflows");
    expect(zhCN.launcher.workflowLabel).toBe("工作流");

    expect(en.launcher.workflowFreeChat).toBe("No Workflow");
    expect(zhCN.launcher.workflowFreeChat).toBe("自由对话");
  });
});

describe("BotLauncherCore workflow quick-select integration", () => {
  it("references workflowSelection methods in BotLauncherCore", () => {
    const fs = require("fs");
    const path = require("path");
    const coreSource = fs.readFileSync(
      path.join(__dirname, "../client/launcher/BotLauncherCore.tsx"),
      "utf8",
    );

    expect(coreSource).toContain("resolveAvailableWorkflows");
    expect(coreSource).toContain("shouldRetainWorkflowSelection");
    expect(coreSource).toContain("formatWorkflowLaunchPrompt");
    expect(coreSource).toContain("selectedWorkflowId");
    expect(coreSource).toContain("availableWorkflows");
    expect(coreSource).toContain("workflowSection");
    expect(coreSource).toContain("stageBadge");
  });
});
