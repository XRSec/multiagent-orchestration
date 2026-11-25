/**
 * Purpose: Cross-platform keyboard height, visualViewport tracking, IME composition guard, and safe-area helpers.
 * Context: Used by BotsSurfaceReady, BotLauncherCore, BotFeedPane, ChatStream, and Composer.
 * Usage: Import useKeyboardHeight(), useVisualViewport(), homeIndicatorInset(), and isImeComposing().
 * Prerequisites: React Native runtime or browser window.visualViewport on web.
 */

import { useEffect, useState } from "react";
import { Dimensions, Keyboard, LayoutAnimation, Platform, TurboModuleRegistry, NativeModules, type KeyboardEvent } from "react-native";

export interface ViewportState {
  keyboardHeight: number;
  viewportHeight: number;
}

export interface VisualViewportLike {
  height: number;
  offsetTop?: number;
  addEventListener(type: "resize" | "scroll", listener: () => void): void;
  removeEventListener(type: "resize" | "scroll", listener: () => void): void;
}

export interface WindowWithVisualViewport {
  innerHeight: number;
  visualViewport?: VisualViewportLike | null;
  addEventListener?(type: "resize", listener: () => void): void;
  removeEventListener?(type: "resize", listener: () => void): void;
}

/** Threshold in px to ignore mobile browser URL-bar chrome fluctuations. */
export const WEB_KEYBOARD_MIN_HEIGHT = 80;

function getWebWindow(): WindowWithVisualViewport | null {
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    return (globalThis as unknown as { window?: WindowWithVisualViewport }).window ?? null;
  }
  return null;
}

/** Computes soft-keyboard occlusion height from window.visualViewport. */
export function computeVisualViewportState(win: WindowWithVisualViewport | null | undefined): ViewportState {
  const vv = win?.visualViewport;
  if (!vv) return { keyboardHeight: 0, viewportHeight: 0 };
  const occluded = win.innerHeight - (vv.height + Math.max(0, vv.offsetTop ?? 0));
  return {
    keyboardHeight: occluded > WEB_KEYBOARD_MIN_HEIGHT ? occluded : 0,
    viewportHeight: vv.height,
  };
}

/** Tracks mobile web window.visualViewport resize and scroll for virtual keyboard height. */
export function useVisualViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>(() => computeVisualViewportState(getWebWindow()));

  useEffect(() => {
    const win = getWebWindow();
    const vv = win?.visualViewport;
    if (!win || !vv) return;

    const sync = () => {
      const next = computeVisualViewportState(win);
      setState((prev) =>
        prev.keyboardHeight === next.keyboardHeight && prev.viewportHeight === next.viewportHeight ? prev : next,
      );
    };

    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    win.addEventListener?.("resize", sync);

    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      win.removeEventListener?.("resize", sync);
    };
  }, []);

  return state;
}

export type ImeLikeEvent =
  | {
      isComposing?: boolean;
      keyCode?: number;
      nativeEvent?: unknown;
    }
  | object
  | null
  | undefined;

/**
 * Guard against CJK IME composition Enter/Escape events (Safari/WebKit sends keyCode 229).
 */
export function isImeComposing(event: ImeLikeEvent): boolean {
  if (!event || typeof event !== "object") return false;
  const target = ((event as { nativeEvent?: unknown }).nativeEvent ?? event) as {
    isComposing?: boolean;
    keyCode?: number;
  };
  return Boolean(target?.isComposing) || target?.keyCode === 229;
}

/** Paseo's keyboard shift (keyboard/shift/internal/policy.ts): iOS heights below this are the predictive bar alone. */
const IOS_KEYBOARD_MIN_HEIGHT = 120;

/** Keyboard height from an iOS frame event: 0 when the frame is off screen (hidden or undocked below the fold) or only the accessory bar. */
function iosKeyboardHeight(event: Pick<KeyboardEvent, "endCoordinates">, screenHeight: number): number {
  const { height, screenY } = event.endCoordinates;
  if (!(height > 0) || (Number.isFinite(screenY) && screenY >= screenHeight)) return 0;
  return height < IOS_KEYBOARD_MIN_HEIGHT ? 0 : height;
}

/**
 * Height of the software keyboard, for lifting the composer above it.
 *
 * Plugin surfaces get no keyboard handling from the host, and Paseo's app runs
 * edge-to-edge under react-native-keyboard-controller, so the window doesn't
 * resize on Android either. Mirrors Paseo's shift: on iOS it follows every frame
 * change (keyboardWillChangeFrame, so accessory bars and split keyboards track),
 * treats heights under 120 as no keyboard, and animates with the keyboard's own
 * curve; Android only reports after the fact, so the jump is eased instead.
 */
export function useKeyboardHeight(): number {
  const isWeb = Platform.OS === "web";
  const [nativeHeight, setNativeHeight] = useState(0);
  const webViewport = useVisualViewport();

  useEffect(() => {
    if (isWeb) return;
    const ios = Platform.OS === "ios";
    let current = 0;
    const apply = (next: number, duration: number | undefined) => {
      if (next === current) return;
      current = next;
      if (ios) {
        LayoutAnimation.configureNext(LayoutAnimation.create(duration || 250, LayoutAnimation.Types.keyboard, LayoutAnimation.Properties.opacity));
      } else {
        LayoutAnimation.configureNext(LayoutAnimation.create(duration || 200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
      }
      setNativeHeight(next);
    };
    const subscriptions = ios
      ? [
          Keyboard.addListener("keyboardWillChangeFrame", (event) => apply(iosKeyboardHeight(event, Dimensions.get("screen").height), event.duration)),
          Keyboard.addListener("keyboardWillHide", (event) => apply(0, event.duration)),
        ]
      : [
          Keyboard.addListener("keyboardDidShow", (event) => apply(Math.max(0, event.endCoordinates.height), undefined)),
          Keyboard.addListener("keyboardDidHide", () => apply(0, undefined)),
        ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [isWeb]);

  return isWeb ? webViewport.keyboardHeight : nativeHeight;
}

// ---------------------------------------------------------------- safe area

type SafeAreaModule = { getConstants?: () => { initialWindowMetrics?: { insets?: { bottom?: number } } | null } };
let initialBottomInset: number | null | undefined;

/** The host's own safe-area insets (react-native-safe-area-context's startup metrics), when its module is reachable. */
function readInitialBottomInset(): number | null {
  if (initialBottomInset !== undefined) return initialBottomInset;
  initialBottomInset = null;
  try {
    const module =
      (TurboModuleRegistry.get("RNCSafeAreaContext") as SafeAreaModule | null) ?? (NativeModules.RNCSafeAreaContext as SafeAreaModule | undefined);
    const bottom = module?.getConstants?.().initialWindowMetrics?.insets?.bottom;
    if (typeof bottom === "number" && Number.isFinite(bottom) && bottom >= 0) initialBottomInset = bottom;
  } catch {
    // Not available to plugins on this build.
  }
  return initialBottomInset;
}

/**
 * Bottom safe-area inset below the composer while the keyboard is closed. Paseo's
 * dock pads `insets.bottom` (composer/dock/index.native.tsx). Plugins get no insets
 * API, so this reads the app's startup metrics and otherwise infers the iPhone home
 * indicator from the screen (every iPhone with one is at least 812pt tall).
 */
export function homeIndicatorInset(): number {
  if (Platform.OS === "web") return 0;
  const { width, height } = Dimensions.get("screen");
  const landscape = width > height;
  const measured = readInitialBottomInset();
  if (Platform.OS === "ios") {
    const pad = (Platform as { isPad?: boolean }).isPad === true;
    const portrait = measured ?? (!pad && Math.max(width, height) >= 812 ? 34 : 0);
    // iOS shrinks the home-indicator inset to 21 in landscape.
    return landscape && portrait > 0 ? Math.min(portrait, 21) : portrait;
  }
  return measured ?? 0;
}
