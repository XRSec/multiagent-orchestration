import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { parseBriefFields, segmentProtocolBlocks } from "../shared/protocol-cards";

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  Pressable: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  View: ({ children, ...props }: any) => <div {...props}>{children}</div>,
}));

vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: ({ name }: { name: string }) => <i data-icon={name} />,
  Markdown: ({ children }: { children: React.ReactNode }) => <div data-testid="markdown">{children}</div>,
}));

vi.mock("../client/i18n", () => ({
  useT: () => ({ t: (k: string) => k }),
}));

vi.mock("../client/native", () => ({
  nativeTokens: () => ({ dark: false, surface3: "#eee" }),
  withAlpha: (hex: string, alpha: number) => `${hex}:${alpha}`,
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { MarkdownText, ProtocolCard } from "../client/chat/stream/ProtocolCard";

const MOCK_COLORS = {
  surface0: "#fff",
  surface1: "#f8f9fa",
  surface2: "#f1f3f5",
  border: "#dee2e6",
  foreground: "#111",
  foregroundMuted: "#666",
  accent: "#2563eb",
  statusSuccess: "#16a34a",
  statusWarning: "#eab308",
  statusDanger: "#dc2626",
} as any;

describe("segmentProtocolBlocks (DoD-3A parser)", () => {
  it("parses <task_brief>, <repair_brief>, and <worker_handoff> outside code fences", () => {
    const input = [
      "Intro prose",
      "<task_brief>",
      "- WORKFLOW: moAdmin Closed Loop",
      "- STAGE_ID: mocode-impl",
      "- STAGE_NAME: Implementation",
      "</task_brief>",
      "Middle prose",
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY: Implemented all 3 DoD items.",
      "TOUCHED_FILES: client/BotsSurfaceReady.tsx",
      "VERIFICATION_PROOF:",
      "  - Command: `npm test`",
      "  - Exit_Code: `0`",
      "DOD_CHECKLIST:",
      "  - [x] DoD-1 fixed",
      "OPEN_ISSUES: None",
      "</worker_handoff>",
    ].join("\n");

    const segments = segmentProtocolBlocks(input);
    expect(segments.map((s) => s.kind)).toEqual(["text", "protocol", "text", "protocol"]);
    const brief = segments[1] as Extract<(typeof segments)[number], { kind: "protocol" }>;
    expect(brief.tag).toBe("task_brief");
    expect(brief.fields.STAGE_ID).toBe("mocode-impl");

    const handoff = segments[3] as Extract<(typeof segments)[number], { kind: "protocol" }>;
    expect(handoff.tag).toBe("worker_handoff");
    expect(handoff.handoff?.status).toBe("PASS");
    expect(handoff.handoff?.verificationProof).toContain("npm test");
    expect(handoff.handoff?.dodChecklist).toContain("DoD-1 fixed");
  });

  it("extracts protocol cards from markdown-wrapped (code-fenced) blocks while preserving non-protocol code", () => {
    const input = [
      "Here is my implementation code:",
      "```typescript",
      "function runWorkflow() { return true; }",
      "```",
      "And here is the handoff block:",
      "```xml",
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY: Implemented all requirements.",
      "</worker_handoff>",
      "```",
      "~~~md",
      "<task_brief>",
      "- **STAGE_ID**: next-step",
      "- **WORKFLOW**: Closed Loop",
      "</task_brief>",
      "~~~",
      "Outro note",
    ].join("\n");

    const segments = segmentProtocolBlocks(input);
    expect(segments.map((s) => s.kind)).toEqual(["text", "protocol", "protocol", "text"]);

    // First segment is text containing the non-protocol code block
    expect(segments[0]?.kind).toBe("text");
    expect(segments[0]?.kind === "text" && segments[0].text).toContain("function runWorkflow");

    // Second segment is the fenced worker_handoff extracted cleanly
    const handoff = segments[1] as Extract<(typeof segments)[number], { kind: "protocol" }>;
    expect(handoff.tag).toBe("worker_handoff");
    expect(handoff.handoff?.status).toBe("PASS");
    expect(handoff.handoff?.summary).toBe("Implemented all requirements.");

    // Third segment is the fenced task_brief extracted cleanly
    const brief = segments[2] as Extract<(typeof segments)[number], { kind: "protocol" }>;
    expect(brief.tag).toBe("task_brief");
    expect(brief.fields.STAGE_ID).toBe("next-step");
    expect(brief.fields.WORKFLOW).toBe("Closed Loop");

    // Fourth segment is outro text
    expect(segments[3]?.kind === "text" && segments[3].text).toBe("Outro note");
  });

  it("handles indented and blockquoted protocol blocks", () => {
    const indented = [
      "  <worker_handoff>",
      "    STATUS: BLOCKED",
      "    SUMMARY: Waiting for lock",
      "  </worker_handoff>",
    ].join("\n");
    const segs1 = segmentProtocolBlocks(indented);
    expect(segs1).toHaveLength(1);
    expect(segs1[0]?.kind).toBe("protocol");
    if (segs1[0]?.kind === "protocol") {
      expect(segs1[0].handoff?.status).toBe("BLOCKED");
      expect(segs1[0].handoff?.summary).toBe("Waiting for lock");
    }

    const blockquoted = [
      "> <repair_brief>",
      "> - PREVIOUS_ERROR: build failure",
      "> - DOD_CHECKLIST: recompile",
      "> </repair_brief>",
    ].join("\n");
    const segs2 = segmentProtocolBlocks(blockquoted);
    expect(segs2).toHaveLength(1);
    expect(segs2[0]?.kind).toBe("protocol");
    if (segs2[0]?.kind === "protocol") {
      expect(segs2[0].fields.PREVIOUS_ERROR).toBe("build failure");
      expect(segs2[0].fields.DOD_CHECKLIST).toBe("recompile");
    }
  });

  it("parses real session adb63af4 style message with report header and trailing handoff", () => {
    const msg = [
      "### MoCI 质量审计与回归验证报告",
      "",
      "**QA 裁决：`PASS`**",
      "",
      "#### 1. 变更范围与反模式审计",
      "- **变更文件核查**：`mocode-impl` 的变更集中于 workflow-runner.ts 等文件。",
      "",
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY:",
      "- QA Verdict: PASS. Verified paseo-bots test suite.",
      "TOUCHED_FILES: None",
      "VERIFICATION_PROOF:",
      "  - Command: `npm test`",
      "  - Exit_Code: `0`",
      "DOD_CHECKLIST:",
      "  - [x] DoD-1 verified",
      "OPEN_ISSUES: None",
      "</worker_handoff>",
    ].join("\n");

    const segments = segmentProtocolBlocks(msg);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.kind).toBe("text");
    expect(segments[0]?.kind === "text" && segments[0].text).toContain("### MoCI 质量审计与回归验证报告");

    expect(segments[1]?.kind).toBe("protocol");
    if (segments[1]?.kind === "protocol") {
      expect(segments[1].tag).toBe("worker_handoff");
      expect(segments[1].handoff?.status).toBe("PASS");
      expect(segments[1].handoff?.verificationProof).toContain("npm test");
      expect(segments[1].handoff?.dodChecklist).toContain("DoD-1 verified");
    }
  });

  it("parseBriefFields parses markdown-bold headers and multiline sections", () => {
    const body = [
      "- **WORKFLOW**: Closed Loop",
      "- **STAGE_ID**: mocode-impl",
      "- **STAGE_NAME**: **Implementation**",
      "- **UPSTREAM_CONTEXT**:",
      "  ### From moAdmin:",
      "  Detailed requirements here.",
    ].join("\n");

    const fields = parseBriefFields(body);
    expect(fields.WORKFLOW).toBe("Closed Loop");
    expect(fields.STAGE_ID).toBe("mocode-impl");
    expect(fields.STAGE_NAME).toBe("Implementation");
    expect(fields.UPSTREAM_CONTEXT).toContain("Detailed requirements here.");
  });

  it("ignores <worker_protocol> instruction templates wrapping protocol blocks", () => {
    const input = [
      "Here is the instruction prompt:",
      "<worker_protocol>",
      "Output `<worker_handoff>` with STATUS, SUMMARY, TOUCHED_FILES.",
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY: Fake template example",
      "</worker_handoff>",
      "</worker_protocol>",
      "Real trailing text",
    ].join("\n");

    const segments = segmentProtocolBlocks(input);
    expect(segments.some((s) => s.kind === "protocol")).toBe(false);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.every((s) => s.kind === "text")).toBe(true);
  });

  it("ignores placeholder template status values like [PASS | PARTIAL and never renders a fake PASS card", () => {
    const inputWithBrackets = [
      "Please report progress using this template:",
      "<worker_handoff>",
      "STATUS: [PASS | PARTIAL | BLOCKED | FAILED]",
      "SUMMARY: [Concise summary here]",
      "TOUCHED_FILES: none",
      "</worker_handoff>",
      "Follow this strictly.",
    ].join("\n");

    const segs1 = segmentProtocolBlocks(inputWithBrackets);
    expect(segs1.some((s) => s.kind === "protocol")).toBe(false);

    const inputWithPipes = [
      "<worker_handoff>",
      "STATUS: PASS | PARTIAL",
      "SUMMARY: placeholder status",
      "</worker_handoff>",
    ].join("\n");

    const segs2 = segmentProtocolBlocks(inputWithPipes);
    expect(segs2.some((s) => s.kind === "protocol")).toBe(false);
  });

  it("parses unclosed/truncated <task_brief> containing structured brief keys cleanly up to structured block end", () => {
    // 1. Truncated streaming at the end of message
    const truncatedStreaming = [
      "<task_brief>",
      "- WORKFLOW: moAdmin Closed Loop",
      "- STAGE_ID: mocode-impl",
      "- OBJECTIVE: Fix ProtocolCard Markdown rendering",
    ].join("\n");

    const segs1 = segmentProtocolBlocks(truncatedStreaming);
    expect(segs1).toHaveLength(1);
    expect(segs1[0]?.kind).toBe("protocol");
    if (segs1[0]?.kind === "protocol") {
      expect(segs1[0].tag).toBe("task_brief");
      expect(segs1[0].fields.WORKFLOW).toBe("moAdmin Closed Loop");
      expect(segs1[0].fields.STAGE_ID).toBe("mocode-impl");
      expect(segs1[0].fields.OBJECTIVE).toBe("Fix ProtocolCard Markdown rendering");
    }

    // 2. Unclosed task_brief followed by user trailing text
    const unclosedWithProse = [
      "Header instructions:",
      "<task_brief>",
      "- WORKFLOW: moAdmin Closed Loop",
      "- STAGE_ID: mocode-impl",
      "- OBJECTIVE: Fix bugs",
      "",
      "Please make sure all tests pass before finishing.",
    ].join("\n");

    const segs2 = segmentProtocolBlocks(unclosedWithProse);
    expect(segs2.map((s) => s.kind)).toEqual(["text", "protocol", "text"]);
    const briefSeg = segs2[1] as Extract<(typeof segs2)[number], { kind: "protocol" }>;
    expect(briefSeg.tag).toBe("task_brief");
    expect(briefSeg.fields.OBJECTIVE).toBe("Fix bugs");
    expect(segs2[2]?.kind === "text" && segs2[2].text).toContain("Please make sure all tests pass");

    // 3. Unclosed task_brief inside code fence
    const fencedUnclosed = [
      "```markdown",
      "<task_brief>",
      "- WORKFLOW: Closed Loop",
      "- STAGE_ID: stage-1",
      "- OBJECTIVE: Fenced unclosed brief",
      "```",
    ].join("\n");

    const segs3 = segmentProtocolBlocks(fencedUnclosed);
    expect(segs3).toHaveLength(1);
    expect(segs3[0]?.kind).toBe("protocol");
    if (segs3[0]?.kind === "protocol") {
      expect(segs3[0].fields.STAGE_ID).toBe("stage-1");
      expect(segs3[0].fields.OBJECTIVE).toBe("Fenced unclosed brief");
    }

    // 4. Unclosed task_brief without structured brief keys is treated as plain text
    const noKeys = "<task_brief>\nJust some random unstructured text without any keys";
    const segs4 = segmentProtocolBlocks(noKeys);
    expect(segs4).toHaveLength(1);
    expect(segs4[0]?.kind).toBe("text");
  });
});

describe("ProtocolCard (DoD-3A UI)", () => {
  it("renders status colors and expands collapsible VERIFICATION_PROOF and DOD_CHECKLIST", async () => {
    const raw = [
      "<worker_handoff>",
      "STATUS: BLOCKED",
      "SUMMARY: Waiting for upstream fix",
      "TOUCHED_FILES: server/tasks.ts",
      "VERIFICATION_PROOF: npm test -> failed",
      "DOD_CHECKLIST: - [ ] DoD-2",
      "OPEN_ISSUES: Missing lock",
      "</worker_handoff>",
    ].join("\n");
    const [segment] = segmentProtocolBlocks(raw);
    expect(segment?.kind).toBe("protocol");
    if (segment?.kind !== "protocol") return;

    let renderer: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ProtocolCard colors={MOCK_COLORS} segment={segment} />);
    });

    // Collapsed initially: verification proof header is not mounted yet
    expect(renderer!.root.findAll((n) => n.children.includes("workflows.protocolVerificationProof"))).toHaveLength(0);
    // Blocked orange accent color applied to badge
    const badgeTexts = renderer!.root.findAll((n) => n.children.includes("BLOCKED"));
    expect(badgeTexts.length).toBeGreaterThan(0);
    expect(badgeTexts[0]!.props.style.color).toBe("#F97316");

    // Expand card
    const headerBtn = renderer!.root.findAllByType("button")[0]!;
    await act(async () => {
      headerBtn.props.onPress();
    });

    expect(renderer!.root.findAll((n) => n.children.includes("workflows.protocolVerificationProof"))).toHaveLength(1);
    expect(renderer!.root.findAll((n) => n.children.includes("workflows.protocolDodChecklist"))).toHaveLength(1);
  });

  it("renders MarkdownText for summary, dodChecklist, openIssues, objective while keeping verificationProof in monospace", async () => {
    const rawHandoff = [
      "<worker_handoff>",
      "STATUS: PASS",
      "SUMMARY: Implemented `feature` with **bold** text.",
      "TOUCHED_FILES: client/file.ts",
      "VERIFICATION_PROOF: vitest run -> PASS",
      "DOD_CHECKLIST: - [x] DoD item completed",
      "OPEN_ISSUES: - [ ] Known issue with `edge-case`",
      "</worker_handoff>",
    ].join("\n");

    const [segHandoff] = segmentProtocolBlocks(rawHandoff);
    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(<ProtocolCard colors={MOCK_COLORS} segment={segHandoff as any} />);
    });

    // Subtitle / summary renders via MarkdownText
    const initialMd = renderer.root.findAll((n) => n.props["data-testid"] === "markdown");
    expect(initialMd.length).toBeGreaterThan(0);
    expect(initialMd.some((n) => n.children.includes("Implemented `feature` with **bold** text."))).toBe(true);

    // Expand card to view collapsible sections
    const headerBtn = renderer.root.findAllByType("button")[0]!;
    await act(async () => {
      headerBtn.props.onPress();
    });

    // Open Issues is defaultExpanded, renders via MarkdownText
    const expandedMd = renderer.root.findAll((n) => n.props["data-testid"] === "markdown");
    expect(expandedMd.some((n) => n.children.includes("- [ ] Known issue with `edge-case`"))).toBe(true);

    // Expand DOD_CHECKLIST collapsible section
    const dodBtn = renderer.root
      .findAllByType("button")
      .find((b) => b.findAll((n) => n.children.includes("workflows.protocolDodChecklist")).length > 0);
    expect(dodBtn).toBeDefined();
    await act(async () => {
      dodBtn!.props.onPress();
    });

    const afterDodMd = renderer.root.findAll((n) => n.props["data-testid"] === "markdown");
    expect(afterDodMd.some((n) => n.children.includes("- [x] DoD item completed"))).toBe(true);

    // Expand VERIFICATION_PROOF section
    const proofBtn = renderer.root
      .findAllByType("button")
      .find((b) => b.findAll((n) => n.children.includes("workflows.protocolVerificationProof")).length > 0);
    expect(proofBtn).toBeDefined();
    await act(async () => {
      proofBtn!.props.onPress();
    });

    // VERIFICATION_PROOF is rendered as monospace Text, not Markdown
    const monoSpans = renderer.root.findAll(
      (n) => n.type === "span" && n.props.style?.fontFamily === "monospace" && n.children.includes("vitest run -> PASS")
    );
    expect(monoSpans.length).toBe(1);

    // Test Markdown rendering for <task_brief> OBJECTIVE
    const rawBrief = [
      "<task_brief>",
      "- WORKFLOW: CI Workflow",
      "- STAGE_ID: test-stage",
      "- OBJECTIVE: Complete **all** tests with `vitest`",
      "</task_brief>",
    ].join("\n");

    const [segBrief] = segmentProtocolBlocks(rawBrief);
    await act(async () => {
      renderer = create(<ProtocolCard colors={MOCK_COLORS} segment={segBrief as any} />);
    });
    const expandBriefBtn = renderer.root.findAllByType("button")[0]!;
    await act(async () => {
      expandBriefBtn.props.onPress();
    });

    // Expand Objective section
    const objBtn = renderer.root
      .findAllByType("button")
      .find((b) => b.findAll((n) => n.children.includes("Objective") || n.children.includes("workflows.stagePromptTitle")).length > 0);
    expect(objBtn).toBeDefined();
    await act(async () => {
      objBtn!.props.onPress();
    });

    const briefMd = renderer.root.findAll((n) => n.props["data-testid"] === "markdown");
    expect(briefMd.some((n) => n.children.includes("Complete **all** tests with `vitest`"))).toBe(true);

    // Directly test MarkdownText component standalone
    await act(async () => {
      renderer = create(<MarkdownText colors={MOCK_COLORS} text="Standalone `test` **markdown**" />);
    });
    const standaloneMd = renderer.root.findByProps({ "data-testid": "markdown" });
    expect(standaloneMd.children).toEqual(["Standalone `test` **markdown**"]);
  });
});
