/**
 * Purpose: Cross-platform keyboard height, safe-area inset, and web scroll helpers for paseo-feed.
 * Context: Used by FeedScreen and FeedComposer to prevent mobile soft-keyboard overlap and stranded scroll.
 * Usage: Import useKeyboardHeight, homeIndicatorInset, scrollWebListToEnd, watchWebListSize, and scrollWebNodeIntoView.
 * Prerequisites: React Native runtime or browser window.visualViewport / ResizeObserver on web.
 */

import { useEffect, useState } from "react";
import { Dimensions, Keyboard, LayoutAnimation, NativeModules, Platform, TurboModuleRegistry, type KeyboardEvent } from "react-native";
import {
  computeVisualViewportKeyboardHeight,
  isImeComposing,
  resolveContainerBottomPadding,
  resolveKeyboardDismissMode,
} from "./feed-helpers.ts";

export {
  computeVisualViewportKeyboardHeight,
  isImeComposing,
  resolveContainerBottomPadding,
  resolveKeyboardDismissMode,
};

const IOS_KEYBOARD_MIN_HEIGHT = 120;

interface VisualViewportLike {
  height: number;
  offsetTop?: number;
  addEventListener(type: "resize" | "scroll", listener: () => void): void;
  removeEventListener(type: "resize" | "scroll", listener: () => void): void;
}

interface WindowLike {
  innerHeight: number;
  visualViewport?: VisualViewportLike | null;
  addEventListener?(type: "resize", listener: () => void): void;
  removeEventListener?(type: "resize", listener: () => void): void;
}

interface WebListNode {
  scrollHeight: number;
  firstElementChild?: unknown;
  scroll?(options: { top: number; behavior: "smooth" | "instant" }): void;
}

type WebListRef = { getScrollableNode?(): unknown } | null;
type ResizeObserverLike = { observe(target: unknown): void; disconnect(): void };

function getWebWindow(): WindowLike | null {
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    return (globalThis as unknown as { window?: WindowLike }).window ?? null;
  }
  return null;
}

function readWebKeyboardHeight(): number {
  if (Platform.OS !== "web") return 0;
  const win = getWebWindow();
  const vv = win?.visualViewport;
  if (!win || !vv) return 0;
  return computeVisualViewportKeyboardHeight(win.innerHeight, vv.height, vv.offsetTop ?? 0);
}

function iosKeyboardHeight(event: Pick<KeyboardEvent, "endCoordinates">, screenHeight: number): number {
  const { height, screenY } = event.endCoordinates;
  if (!(height > 0) || (Number.isFinite(screenY) && screenY >= screenHeight)) return 0;
  return height < IOS_KEYBOARD_MIN_HEIGHT ? 0 : height;
}

/** Tracks soft-keyboard height on iOS, Android, and mobile web (window.visualViewport). */
export function useKeyboardHeight(): number {
  const isWeb = Platform.OS === "web";
  const [height, setHeight] = useState<number>(() => (isWeb ? readWebKeyboardHeight() : 0));

  useEffect(() => {
    if (isWeb) {
      const win = getWebWindow();
      const vv = win?.visualViewport;
      if (!win || !vv) return;
      const sync = () => {
        const next = computeVisualViewportKeyboardHeight(win.innerHeight, vv.height, vv.offsetTop ?? 0);
        setHeight((prev) => (prev === next ? prev : next));
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
    }

    const ios = Platform.OS === "ios";
    let current = 0;
    const apply = (next: number, duration: number | undefined) => {
      if (next === current) return;
      current = next;
      const animType = ios ? LayoutAnimation.Types.keyboard : LayoutAnimation.Types.easeInEaseOut;
      LayoutAnimation.configureNext(LayoutAnimation.create(duration || (ios ? 250 : 200), animType, LayoutAnimation.Properties.opacity));
      setHeight(next);
    };

    const subscriptions = ios
      ? [
          Keyboard.addListener("keyboardWillChangeFrame", (event) =>
            apply(iosKeyboardHeight(event, Dimensions.get("screen").height), event.duration),
          ),
          Keyboard.addListener("keyboardWillShow", (event) =>
            apply(iosKeyboardHeight(event, Dimensions.get("screen").height), event.duration),
          ),
          Keyboard.addListener("keyboardWillHide", (event) => apply(0, event.duration)),
        ]
      : [
          Keyboard.addListener("keyboardDidShow", (event) => apply(Math.max(0, event.endCoordinates.height), undefined)),
          Keyboard.addListener("keyboardDidHide", () => apply(0, undefined)),
        ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [isWeb]);

  return height;
}

type SafeAreaModule = { getConstants?: () => { initialWindowMetrics?: { insets?: { bottom?: number } } | null } };
let initialBottomInset: number | null | undefined;

function readInitialBottomInset(): number | null {
  if (initialBottomInset !== undefined) return initialBottomInset;
  initialBottomInset = null;
  try {
    const mod =
      (TurboModuleRegistry.get("RNCSafeAreaContext") as SafeAreaModule | null) ??
      (NativeModules.RNCSafeAreaContext as SafeAreaModule | undefined);
    const bottom = mod?.getConstants?.().initialWindowMetrics?.insets?.bottom;
    if (typeof bottom === "number" && Number.isFinite(bottom) && bottom >= 0) initialBottomInset = bottom;
  } catch {
    // Safe-area module unavailable in this build.
  }
  return initialBottomInset;
}

/** Returns bottom safe-area inset for devices with a home indicator when keyboard is closed. */
export function homeIndicatorInset(): number {
  if (Platform.OS === "web") return 0;
  const { width, height } = Dimensions.get("screen");
  const landscape = width > height;
  const measured = readInitialBottomInset();
  if (Platform.OS === "ios") {
    const pad = (Platform as { isPad?: boolean }).isPad === true;
    const portrait = measured ?? (!pad && Math.max(width, height) >= 812 ? 34 : 0);
    return landscape && portrait > 0 ? Math.min(portrait, 21) : portrait;
  }
  return measured ?? 0;
}

/** Scrolls a RNW list/scroller DOM node to its true measured scrollHeight. */
export function scrollWebListToEnd(list: WebListRef, animated = false): boolean {
  if (Platform.OS !== "web" || !list?.getScrollableNode) return false;
  const node = list.getScrollableNode() as WebListNode | null;
  if (!node?.scroll) return false;
  node.scroll({ top: node.scrollHeight, behavior: animated ? "smooth" : "instant" });
  return true;
}

/** Observes web list container and inner content size changes for late Markdown layout. */
export function watchWebListSize(list: WebListRef, changed: () => void): () => void {
  if (Platform.OS !== "web" || !list?.getScrollableNode) return () => {};
  const node = list.getScrollableNode() as WebListNode | null;
  if (!node) return () => {};
  changed();
  const ResizeObserverCtor = (globalThis as { ResizeObserver?: new (cb: () => void) => ResizeObserverLike }).ResizeObserver;
  if (!ResizeObserverCtor) return () => {};
  let disposed = false;
  const observer = new ResizeObserverCtor(() => {
    if (!disposed) changed();
  });
  observer.observe(node);
  if (node.firstElementChild) observer.observe(node.firstElementChild);
  return () => {
    disposed = true;
    observer.disconnect();
  };
}

/** Scrolls a web element into nearest visible viewport area when focused on mobile browsers. */
export function scrollWebNodeIntoView(ref: unknown, block: "center" | "nearest" = "nearest"): void {
  if (Platform.OS !== "web" || !ref || typeof ref !== "object") return;
  const candidate = ref as { scrollIntoView?: (opts: { block: string; behavior: string }) => void; getNativeRef?: () => unknown };
  const node = typeof candidate.scrollIntoView === "function"
    ? candidate
    : (candidate.getNativeRef?.() as { scrollIntoView?: (opts: { block: string; behavior: string }) => void } | null);
  node?.scrollIntoView?.({ block, behavior: "smooth" });
}
