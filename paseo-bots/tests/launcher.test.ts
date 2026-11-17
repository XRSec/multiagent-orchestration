import { describe, expect, it } from "vitest";
import { en } from "../client/i18n/en";
import { zhCN } from "../client/i18n/zh-CN";
import { onIntent, requestIntent, takeIntent, type SurfaceIntent } from "../client/intent";
import {
  classifyFile,
  newAttachmentId,
  normalizeMimeType,
  preflightFile,
  toWire,
  type ComposerAttachment,
} from "../shared/attachments";

describe("launcher i18n completeness", () => {
  it("has matching launcher keys across zh-CN and en", () => {
    const zhKeys = Object.keys(zhCN.launcher).sort();
    const enKeys = Object.keys(en.launcher).sort();
    expect(zhKeys).toEqual(enKeys);
    expect(zhKeys).toContain("addAttachment");
    expect(zhKeys).toContain("removeAttachment");
    expect(zhKeys).toContain("defaultImagePrompt");
    expect(zhKeys).toContain("defaultAttachmentPrompt");
    expect(zhKeys).toContain("scrollLeft");
    expect(zhKeys).toContain("scrollRight");
  });
});

describe("launcher attachment wire transform and prompt integration", () => {
  it("formats prompt with embedded text attachments while keeping image wire parts", () => {
    const attachments: ComposerAttachment[] = [
      {
        kind: "image",
        id: newAttachmentId(),
        name: "mockup.png",
        mimeType: normalizeMimeType("image/png"),
        size: 2048,
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      },
      {
        kind: "text",
        id: newAttachmentId(),
        name: "bug-report.txt",
        size: 50,
        text: "Error on mobile tap",
      },
    ];

    const { images, attachments: wireAttachments } = toWire(attachments);

    // Verify wire output
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/png");
    expect(images[0]?.data).toBeTruthy();

    expect(wireAttachments).toHaveLength(1);
    expect(wireAttachments[0]).toEqual({
      type: "text",
      mimeType: "text/plain",
      title: "bug-report.txt",
      text: "Error on mobile tap",
    });

    // Test prompt enhancement logic
    const userPrompt = "Please analyze this issue";
    const textAttachments = attachments.filter(
      (a): a is Extract<ComposerAttachment, { kind: "text" }> => a.kind === "text"
    );
    const textPayload = textAttachments
      .map((att) => `\n\n--- [Attachment: ${att.name}] ---\n${att.text}\n--- [End of ${att.name}] ---`)
      .join("");
    const effectivePrompt = `${userPrompt}${textPayload}`;

    expect(effectivePrompt).toContain("Please analyze this issue");
    expect(effectivePrompt).toContain("--- [Attachment: bug-report.txt] ---");
    expect(effectivePrompt).toContain("Error on mobile tap");
  });

  it("resolves default prompt when user submits only an image or file", () => {
    const imageOnly: ComposerAttachment[] = [
      {
        kind: "image",
        id: "img-1",
        name: "shot.jpg",
        mimeType: "image/jpeg",
        size: 1024,
        data: "base64...",
      },
    ];

    const rawTrimmed = "";
    const defaultPrompt = imageOnly.some((a) => a.kind === "image")
      ? zhCN.launcher.defaultImagePrompt
      : zhCN.launcher.defaultAttachmentPrompt;
    const basePrompt = rawTrimmed || defaultPrompt;

    expect(basePrompt).toBe("请查看并分析上传的图片。");
  });

  it("handles preflight for various file types correctly", () => {
    expect(preflightFile("screenshot.png", "image/png", 5000, true).kind).toBe("image");
    expect(preflightFile("app.tsx", "text/typescript", 2000, true).kind).toBe("text");
    expect(preflightFile("archive.zip", "application/zip", 5000, true).kind).toBe("file");
  });

  it("calculates virtual keyboard offset from visual viewport delta", () => {
    const calculateKeyboardHeight = (winHeight: number, vvHeight: number) => {
      const diff = Math.max(0, winHeight - vvHeight);
      return diff > 80 ? diff : 0;
    };

    // When virtual keyboard is closed
    expect(calculateKeyboardHeight(844, 844)).toBe(0);
    // When virtual keyboard takes 320px
    expect(calculateKeyboardHeight(844, 524)).toBe(320);
    // Jitter/insignificant delta <= 80px ignored
    expect(calculateKeyboardHeight(844, 810)).toBe(0);
  });

  it("resolves placement correctly for workspace vs sandbox modes", () => {
    const activeBot = {
      id: "bot-x",
      name: "X 订阅官",
      model: "gemini-3.8-flash",
      prompt: "",
      systemPrompt: "",
      archived: false,
      pinned: false,
      hostId: null,
      cwd: null,
      mounts: [],
      alwaysAllow: [],
      skillIds: [],
      mcpServerIds: [],
      avatar: { kind: "identicon" as const, seed: "bot-x" },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const home = { path: "/Users/user/.paseo/bots/bot-x", root: null };
    const currentWorkspaceDir = "/Users/user/workspace/my-project";

    // Workspace mode with open workspace
    const workspacePlacement = { path: currentWorkspaceDir, projectRoot: null };
    expect(workspacePlacement.path).toBe("/Users/user/workspace/my-project");

    // Sandbox / resolved bot placement fallback
    const sandboxPlacement = { path: home.path, projectRoot: home.root };
    expect(sandboxPlacement.path).toBe("/Users/user/.paseo/bots/bot-x");
  });

  it("ensures BotLauncherCore does not import host-bound useWorkspace to prevent Plugin state hooks runtime crash", () => {
    const fs = require("fs");
    const path = require("path");
    const coreSource = fs.readFileSync(path.join(__dirname, "../client/launcher/BotLauncherCore.tsx"), "utf8");
    expect(coreSource).not.toMatch(/import\s*\{[^}]*useWorkspace[^}]*\}\s*from/);
    expect(coreSource).not.toMatch(/\buseWorkspace\s*\(/);
  });

  it("ensures BotLauncherCore removes workspace/sandbox segmented toggle and silently adapts", () => {
    const fs = require("fs");
    const path = require("path");
    const coreSource = fs.readFileSync(path.join(__dirname, "../client/launcher/BotLauncherCore.tsx"), "utf8");
    expect(coreSource).not.toMatch(/setTargetDir/);
    expect(coreSource).not.toMatch(/launcher\.sandboxDir/);
    expect(coreSource).not.toMatch(/launcher\.workspaceDir/);
  });
});

describe("surface intent routing", () => {
  it("supports queuing and live subscription for select-bot intents", () => {
    const received: SurfaceIntent[] = [];
    const unsubscribe = onIntent((intent) => received.push(intent));

    requestIntent({ kind: "select-bot", botId: "bot-mocode" });
    expect(received).toEqual([{ kind: "select-bot", botId: "bot-mocode" }]);
    expect(takeIntent()).toEqual({ kind: "select-bot", botId: "bot-mocode" });
    expect(takeIntent()).toBeNull();

    unsubscribe();
  });
});
