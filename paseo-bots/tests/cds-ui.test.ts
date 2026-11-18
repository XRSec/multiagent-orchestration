import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (obj: Record<string, unknown>) => obj.web ?? obj.default },
  Easing: { bezier: () => (t: number) => t },
  AccessibilityInfo: { isReduceMotionEnabled: async () => false, addEventListener: () => ({ remove: () => {} }) },
  Dimensions: { get: () => ({ width: 1024, height: 768 }) },
  Keyboard: { addListener: () => ({ remove: () => {} }) },
  LayoutAnimation: { create: () => ({}), configureNext: () => {}, Types: {}, Properties: {} },
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
});
