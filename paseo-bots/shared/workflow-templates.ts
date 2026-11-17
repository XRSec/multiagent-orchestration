/**
 * Purpose: Curated preset workflow templates for multi-agent DAG pipelines.
 * Context: Used by WorkflowEditor, WorkflowsScreen, and empty-state onboarding.
 * Usage: import { WORKFLOW_TEMPLATES, instantiateWorkflowTemplate } from "../shared/workflow-templates";
 * Prerequisites: Paseo bots and workflow definitions.
 */

import type { Bot } from "./bot";
import { newUuid } from "./uuid";
import type { WorkflowDefinition, WorkflowStageDefinition } from "./workflows";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  tags: readonly string[];
  stages: readonly {
    id: string;
    name: string;
    roleHint: "doc" | "code" | "ci" | "research" | "general";
    engine: "auto" | "native" | "paseo-bot";
    prompt: string;
    dependsOn: readonly string[];
    maxRetries: number;
  }[];
}

function findBestBot(bots: readonly Bot[], roleHint: "doc" | "code" | "ci" | "research" | "general"): string {
  const live = bots.filter((b) => !b.archived);
  if (live.length === 0) return "";

  const hintKeywords: Record<typeof roleHint, string[]> = {
    doc: ["doc", "modoc", "spec", "arch", "write", "writer"],
    code: ["code", "mocode", "dev", "developer", "engineer"],
    ci: ["ci", "moci", "qa", "test", "tester", "audit"],
    research: ["deep", "modeep", "research", "search", "recon", "scout"],
    general: ["admin", "lead", "chief", "assistant"],
  };

  const keywords = hintKeywords[roleHint];
  for (const bot of live) {
    const hay = `${bot.id} ${bot.name} ${bot.description}`.toLowerCase();
    if (keywords.some((kw) => hay.includes(kw))) {
      return bot.id;
    }
  }

  return live[0]?.id ?? "";
}

export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: "tpl-code-delivery",
    name: "Feature Delivery Pipeline",
    description: "3-stage pipeline: Specs & Architecture → Implementation → Code Review & QA.",
    icon: "Layers",
    tags: ["Engineering", "Serial DAG"],
    stages: [
      {
        id: "spec-and-arch",
        name: "Specs & Architecture",
        roleHint: "doc",
        engine: "native",
        prompt: "Analyze the user requirements. Decompose into component boundaries, contract schemas, and explicit acceptance criteria before any coding begins.",
        dependsOn: [],
        maxRetries: 1,
      },
      {
        id: "implementation",
        name: "Feature Implementation",
        roleHint: "code",
        engine: "native",
        prompt: "Implement the feature according to the architectural specs and acceptance criteria. Adhere to repository script standards and safe delete rules.",
        dependsOn: ["spec-and-arch"],
        maxRetries: 2,
      },
      {
        id: "code-review-qa",
        name: "Code Review & QA",
        roleHint: "ci",
        engine: "native",
        prompt: "Review the code changes, run full typecheck and test suites, verify regression safety, and emit a structured PASS/WARN/FAIL verdict.",
        dependsOn: ["implementation"],
        maxRetries: 1,
      },
    ],
  },
  {
    id: "tpl-deep-research",
    name: "Deep Research & Synthesis DAG",
    description: "Parallel web reconnaissance and codebase audit merged into an executive synthesis report.",
    icon: "Compass",
    tags: ["Research", "Parallel DAG"],
    stages: [
      {
        id: "web-recon",
        name: "Web Recon & Benchmarking",
        roleHint: "research",
        engine: "native",
        prompt: "Perform targeted web queries and documentation research on industry patterns, state of the art, and best practices. Cite all sources.",
        dependsOn: [],
        maxRetries: 1,
      },
      {
        id: "codebase-audit",
        name: "Codebase Pattern Audit",
        roleHint: "code",
        engine: "native",
        prompt: "Audit existing repository conventions, dependencies, and integration touchpoints relevant to the objective.",
        dependsOn: [],
        maxRetries: 1,
      },
      {
        id: "synthesis-report",
        name: "Executive Synthesis Report",
        roleHint: "doc",
        engine: "native",
        prompt: "Synthesize findings from both the Web Recon and Codebase Audit stages into an actionable executive report with concrete recommendations.",
        dependsOn: ["web-recon", "codebase-audit"],
        maxRetries: 1,
      },
    ],
  },
  {
    id: "tpl-bug-hotfix",
    name: "Bug Triage & Hotfix DAG",
    description: "2-stage rapid remediation: Reproduce & Root Cause Analysis → Fix & Regression Verification.",
    icon: "Bug",
    tags: ["Maintenance", "Hotfix"],
    stages: [
      {
        id: "triage-and-reproduce",
        name: "Triage & Root Cause Analysis",
        roleHint: "research",
        engine: "native",
        prompt: "Isolate the issue, examine logs and telemetry, reproduce the failure with a minimal test case, and document root causes.",
        dependsOn: [],
        maxRetries: 1,
      },
      {
        id: "fix-and-verify",
        name: "Hotfix & Regression Verification",
        roleHint: "code",
        engine: "native",
        prompt: "Apply minimal surgical fix for the diagnosed root cause and run the full verification test suite to ensure zero regressions.",
        dependsOn: ["triage-and-reproduce"],
        maxRetries: 2,
      },
    ],
  },
];

export function instantiateWorkflowTemplate(template: WorkflowTemplate, bots: readonly Bot[]): WorkflowDefinition {
  const now = new Date().toISOString();
  const stages: WorkflowStageDefinition[] = template.stages.map((s) => ({
    id: s.id,
    name: s.name,
    botId: findBestBot(bots, s.roleHint),
    engine: s.engine,
    prompt: s.prompt,
    dependsOn: [...s.dependsOn],
    maxRetries: s.maxRetries,
  }));

  return {
    id: `wf-${template.id.replace(/^tpl-/, "")}-${newUuid().slice(0, 6)}`,
    name: template.name,
    description: template.description,
    stages,
    createdAt: now,
    updatedAt: now,
  };
}
