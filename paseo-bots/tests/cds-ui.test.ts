import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (obj: Record<string, unknown>) => obj.web ?? obj.default },
  Easing: { bezier: () => (t: number) => t },
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1024, height: 768 }) },
  Keyboard: { addListener: () => ({ remove: () => {} }) },
  LayoutAnimation: { create: vi.fn(), configureNext: vi.fn(), Types: { easeInEaseOut: 1 }, Properties: { opacity: 1 }, Presets: { easeInEaseOut: {} } },
  TurboModuleRegistry: { get: () => null },
  NativeModules: {},
  Animated: { Value: class { setValue() {} }, View: "AnimatedView", timing: () => ({ start: () => {}, stop: () => {} }) },
  Alert: { alert: () => {} },
}));

vi.mock("@getpaseo/plugin/client/ui", () => ({
  FlatList: "FlatList",
  Icon: "Icon",
  useToast: () => ({ error: () => {} }),
}));

import { canPinScrollToEnd, SCROLL_PIN_COOLDOWN_MS } from "../client/chat/Stream";
import { isImeComposing } from "../client/keyboard";
import {
  CDS_WEB_CURVE,
  motionDuration,
  SPRING_BOUNCY,
  SPRING_GENTLE,
  SPRING_HEAVY_SNAP,
  SPRING_SNAPPY,
  triggerLayoutAnimation,
} from "../client/motion";
import { nativeTokens } from "../client/native";

const lightColors = {
  surface0: "#faf9f5",
  surface1: "#f5f4f0",
  surface2: "#eeece6",
  foreground: "#141413",
  foregroundMuted: "#5c5b57",
  border: "#dcdad3",
  accent: "#184f95",
  accentForeground: "#faf9f5",
  statusSuccess: "#299f51",
  statusWarning: "#b37824",
  statusDanger: "#f12e2f",
} as any;

const darkColors = {
  ...lightColors,
  surface0: "#141413",
  surface1: "#1c1c1a",
  surface2: "#262623",
  foreground: "#f0efec",
  foregroundMuted: "#9e9c95",
  border: "#343430",
  accent: "#6da7ec",
  accentForeground: "#141413",
} as any;

describe("CDS UI foundations", () => {
  it("separates brandClay from UI accent in both light and dark themes without #000000/#ffffff", () => {
    const light = nativeTokens(lightColors);
    const dark = nativeTokens(darkColors);

    expect(light.dark).toBe(false);
    expect(light.brandClay).toBe("#d97757");
    expect(light.brandClayPressed).toBe("#c6613f");
    expect(light.brandClay).not.toBe(lightColors.accent);

    expect(dark.dark).toBe(true);
    expect(dark.brandClay).toBe("#cc6b49");
    expect(dark.brandClayPressed).toBe("#b85a39");
    expect(dark.brandClay).not.toBe(darkColors.accent);

    for (const value of [...Object.values(light), ...Object.values(dark)]) {
      if (typeof value === "string") {
        expect(value.toLowerCase()).not.toBe("#000000");
        expect(value.toLowerCase()).not.toBe("#ffffff");
      }
    }
  });

  it("exports calibrated CDS spring presets, web curve, and reduced-motion duration helper", () => {
    expect(SPRING_BOUNCY).toEqual({ stiffness: 600, damping: 30, mass: 1 });
    expect(SPRING_SNAPPY).toEqual({ stiffness: 320, damping: 28, mass: 1 });
    expect(SPRING_GENTLE).toEqual({ stiffness: 380, damping: 18, mass: 1 });
    expect(SPRING_HEAVY_SNAP).toEqual({ stiffness: 1200, damping: 80, mass: 0.1 });
    expect(CDS_WEB_CURVE).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
    expect(motionDuration(200, false)).toBe(200);
    expect(motionDuration(200, true)).toBe(0);
  });

  it("guards CJK IME composition events across direct and nativeEvent shapes", () => {
    expect(isImeComposing(null)).toBe(false);
    expect(isImeComposing(undefined)).toBe(false);
    expect(isImeComposing({ isComposing: false, keyCode: 13 })).toBe(false);
    expect(isImeComposing({ isComposing: true, keyCode: 13 })).toBe(true);
    expect(isImeComposing({ isComposing: false, keyCode: 229 })).toBe(true);
    expect(isImeComposing({ nativeEvent: { isComposing: true, keyCode: 13 } })).toBe(true);
    expect(isImeComposing({ nativeEvent: { keyCode: 229 } })).toBe(true);
  });

  it("enforces the 150ms scroll-pinning cooldown after user scroll input", () => {
    expect(SCROLL_PIN_COOLDOWN_MS).toBe(150);
    expect(canPinScrollToEnd(0, 1000)).toBe(true);
    expect(canPinScrollToEnd(1000, 1050)).toBe(false);
    expect(canPinScrollToEnd(1000, 1149)).toBe(false);
    expect(canPinScrollToEnd(1000, 1150)).toBe(true);
    expect(canPinScrollToEnd(1000, 1300)).toBe(true);
  });

  it("enforces zero hardcoded #000000 / #ffffff / #fff / #000 color literals in client/** source code", () => {
    const clientDir = join(__dirname, "../client");
    const getFiles = (dir: string): string[] => {
      const results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...getFiles(full));
        } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
          results.push(full);
        }
      }
      return results;
    };

    const files = getFiles(clientDir);
    expect(files.length).toBeGreaterThan(15);

    const violations: { file: string; line: number; match: string }[] = [];
    const hexRegex = /#(?:ffffff|000000|fff|000)\b/i;

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      // Strip multiline comments first, then check line by line ignoring single-line comments
      const strippedComments = content.replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat(m.split("\n").length - 1));
      const lines = strippedComments.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const codeOnly = lines[i].replace(/\/\/.*/, "");
        const m = hexRegex.exec(codeOnly);
        if (m) {
          violations.push({ file, line: i + 1, match: m[0] });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("verifies single-stroke border discipline across audited nested pills, chips, and secondary cards", () => {
    const clientDir = join(__dirname, "../client");
    const checkFileContains = (relPath: string, expectedPattern: RegExp | string) => {
      const fullPath = join(clientDir, relPath);
      const content = readFileSync(fullPath, "utf8");
      if (typeof expectedPattern === "string") {
        expect(content).toContain(expectedPattern);
      } else {
        expect(content).toMatch(expectedPattern);
      }
    };

    // Composer ✨ 意图精简 toggle pill uses single-stroke border discipline (borderWidth: 0)
    checkFileContains("chat/Composer.tsx", /borderWidth:\s*0/);

    // TaskStageModal upstream stage cards strip nested 1px borders
    checkFileContains("chat/stream/TaskStageModal.tsx", /borderWidth:\s*0/);

    // WorkflowsScreen scope pills strip double borders
    checkFileContains("WorkflowsScreen.tsx", /borderWidth:\s*0/);

    // WorkflowEditor dependency selection chips strip double borders
    checkFileContains("settings/WorkflowEditor.tsx", /borderWidth:\s*0/);

    // PartnerSettingsModal target selector pills strip double borders
    checkFileContains("settings/PartnerSettingsModal.tsx", /borderWidth:\s*0/);

    // SessionSelector badges strip double borders
    checkFileContains("analytics/SessionSelector.tsx", /borderWidth:\s*0/);
  });

  it("verifies tabular-nums typography invariant across metrics, counts, and duration readouts", () => {
    const clientDir = join(__dirname, "../client");
    const checkFileContainsTabularNums = (relPath: string) => {
      const fullPath = join(clientDir, relPath);
      const content = readFileSync(fullPath, "utf8");
      expect(content).toContain('"tabular-nums"');
    };

    const auditedComponents = [
      "panel/controls.tsx",
      "chat/stream/TaskCard.tsx",
      "chat/stream/TaskStageModal.tsx",
      "chat/stream/CompanionIntentBadge.tsx",
      "chat/stream/RoutineRunCard.tsx",
      "settings/WorkflowPipelinePreview.tsx",
      "settings/WorkflowEditor.tsx",
      "analytics/SessionSelector.tsx",
      "teams/TeamMap.tsx",
      "launcher/BotLauncherStyles.ts",
      "AgyOrphanBanner.tsx",
      "Splash.tsx",
    ];

    for (const relPath of auditedComponents) {
      checkFileContainsTabularNums(relPath);
    }
  });

  it("safely handles LayoutAnimation with reduceMotion gating and partial test mocks", async () => {
    const { LayoutAnimation } = (await import("react-native")) as unknown as { LayoutAnimation: any };
    LayoutAnimation.configureNext = vi.fn();

    // When reduceMotion is true, LayoutAnimation must NOT be triggered
    triggerLayoutAnimation(200, true);
    expect(LayoutAnimation.configureNext).not.toHaveBeenCalled();

    // When reduceMotion is false, LayoutAnimation configureNext is triggered safely
    triggerLayoutAnimation(200, false);
    expect(LayoutAnimation.configureNext).toHaveBeenCalled();
  });
});
