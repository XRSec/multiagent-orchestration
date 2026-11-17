import { describe, expect, it } from "vitest";
import { instantiateWorkflowTemplate, WORKFLOW_TEMPLATES } from "../shared/workflow-templates";
import { validateWorkflowDAG } from "../shared/workflows";
import { newBot } from "../shared/templates";

describe("WORKFLOW_TEMPLATES", () => {
  it("provides at least 2 curated workflow presets", () => {
    expect(WORKFLOW_TEMPLATES.length).toBeGreaterThanOrEqual(2);
    const ids = WORKFLOW_TEMPLATES.map((t) => t.id);
    expect(ids).toContain("tpl-code-delivery");
    expect(ids).toContain("tpl-deep-research");
  });

  it("every template definition forms a valid DAG", () => {
    for (const tpl of WORKFLOW_TEMPLATES) {
      const validation = validateWorkflowDAG(
        tpl.stages.map((s) => ({
          id: s.id,
          name: s.name,
          prompt: s.prompt,
          engine: s.engine,
          botId: "placeholder",
          dependsOn: [...s.dependsOn],
          maxRetries: s.maxRetries,
        })),
      );
      expect(validation.valid, `Template ${tpl.id} should be a valid DAG`).toBe(true);
      expect(validation.layers).toBeDefined();
      expect(validation.layers!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("deep research template features parallel execution layers", () => {
    const deepTpl = WORKFLOW_TEMPLATES.find((t) => t.id === "tpl-deep-research")!;
    const validation = validateWorkflowDAG(
      deepTpl.stages.map((s) => ({
        id: s.id,
        name: s.name,
        prompt: s.prompt,
        engine: s.engine,
        botId: "placeholder",
        dependsOn: [...s.dependsOn],
        maxRetries: s.maxRetries,
      })),
    );
    expect(validation.valid).toBe(true);
    // Layer 0 should contain web-recon and codebase-audit in parallel
    expect(validation.layers![0]).toHaveLength(2);
    expect(validation.layers![0]).toContain("web-recon");
    expect(validation.layers![0]).toContain("codebase-audit");
    // Layer 1 should contain synthesis-report
    expect(validation.layers![1]).toEqual(["synthesis-report"]);
  });

  it("instantiates a template with best matching bots based on role hints", () => {
    const docBot = { ...newBot("agy"), id: "bot-modoc", name: "moDoc", description: "Architecture scribe & documentation steward" };
    const codeBot = { ...newBot("agy"), id: "bot-mocode", name: "moCode", description: "Fullstack developer & code architect" };
    const ciBot = { ...newBot("agy"), id: "bot-moci", name: "MoCI", description: "CI & QA gatekeeper" };
    const dummyBots = [docBot, codeBot, ciBot];

    const codeTpl = WORKFLOW_TEMPLATES.find((t) => t.id === "tpl-code-delivery")!;
    const wf = instantiateWorkflowTemplate(codeTpl, dummyBots);

    expect(wf.name).toBe(codeTpl.name);
    expect(wf.stages).toHaveLength(3);
    expect(wf.stages[0]?.botId).toBe("bot-modoc");
    expect(wf.stages[1]?.botId).toBe("bot-mocode");
    expect(wf.stages[2]?.botId).toBe("bot-moci");
  });
});
