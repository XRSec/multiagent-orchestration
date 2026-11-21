/**
 * Purpose: Accessibility and calibrated CDS motion physics presets.
 * Context: Respect user "Reduce Motion" system preferences and provide RN-native CDS spring/easing curves.
 * Usage: const reduceMotion = useReduceMotion(); Animated.spring(val, { ...SPRING_SNAPPY, toValue: 1, useNativeDriver: true });
 * Prerequisites: React Native AccessibilityInfo, Animated, Easing, Platform.
 */

import { useEffect, useState } from "react";
import * as RN from "react-native";

export interface CdsSpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export const SPRING_BOUNCY: CdsSpringConfig = { stiffness: 600, damping: 30, mass: 1 };
export const SPRING_SNAPPY: CdsSpringConfig = { stiffness: 320, damping: 28, mass: 1 };
export const SPRING_GENTLE: CdsSpringConfig = { stiffness: 380, damping: 18, mass: 1 };
export const SPRING_HEAVY_SNAP: CdsSpringConfig = { stiffness: 1200, damping: 80, mass: 0.1 };

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sampleX = (u: number) => ((1 - 3 * x2 + 3 * x1) * u * u * u) + ((3 * x2 - 6 * x1) * u * u) + (3 * x1 * u);
  const sampleY = (u: number) => ((1 - 3 * y2 + 3 * y1) * u * u * u) + ((3 * y2 - 6 * y1) * u * u) + (3 * y1 * u);
  const slopeX = (u: number) => 3 * (1 - 3 * x2 + 3 * x1) * u * u + 2 * (3 * x2 - 6 * x1) * u + 3 * x1;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const dx = slopeX(u);
      if (Math.abs(dx) < 1e-6) break;
      u -= (sampleX(u) - t) / dx;
    }
    return sampleY(Math.max(0, Math.min(1, u)));
  };
}

export const CDS_EASE_OUT = cubicBezier(0.16, 1, 0.3, 1);
export const CDS_WEB_CURVE = "cubic-bezier(0.16, 1, 0.3, 1)";

export function motionDuration(ms: number, reduceMotion: boolean): number {
  return reduceMotion ? 0 : ms;
}

/**
 * Safely triggers React Native LayoutAnimation with CDS easeInEaseOut curve and reduced motion gating.
 * Resilient against partial React Native mocks in headless/test environments.
 */
export function triggerLayoutAnimation(ms: number = 200, reduceMotion: boolean = false): void {
  if (reduceMotion) return;
  try {
    const la = (RN as unknown as { LayoutAnimation?: any }).LayoutAnimation;
    if (la && typeof la.configureNext === "function") {
      if (typeof la.create === "function" && la.Types?.easeInEaseOut && la.Properties?.opacity) {
        la.configureNext(la.create(motionDuration(ms, reduceMotion), la.Types.easeInEaseOut, la.Properties.opacity));
      } else if (la.Presets?.easeInEaseOut) {
        la.configureNext(la.Presets.easeInEaseOut);
      }
    }
  } catch {
    // Gracefully ignore environments where LayoutAnimation is not supported
  }
}

type MediaQueryLike = {
  matches: boolean;
  addEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: "change", listener: (event: { matches: boolean }) => void) => void;
};

const win = globalThis as unknown as { matchMedia?: (query: string) => MediaQueryLike };

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(() => {
    if (RN.Platform.OS === "web" && typeof win.matchMedia === "function") {
      return win.matchMedia("(prefers-reduced-motion: reduce)").matches;
    }
    return false;
  });

  useEffect(() => {
    let alive = true;
    let sub: { remove?: () => void } | undefined;
    try {
      const a11y = RN.AccessibilityInfo;
      a11y?.isReduceMotionEnabled?.()
        .then((val) => {
          if (alive) setReduce(Boolean(val));
        })
        .catch(() => {});

      sub = a11y?.addEventListener?.("reduceMotionChanged", (val: boolean) => {
        if (alive) setReduce(Boolean(val));
      });
    } catch {
      // Test environments with partial react-native mocks may omit AccessibilityInfo.
    }

    let mediaQuery: MediaQueryLike | undefined;
    const onMediaChange = (event: { matches: boolean }) => {
      if (alive) setReduce(event.matches);
    };
    if (RN.Platform.OS === "web" && typeof win.matchMedia === "function") {
      mediaQuery = win.matchMedia("(prefers-reduced-motion: reduce)");
      setReduce(mediaQuery.matches);
      mediaQuery.addEventListener?.("change", onMediaChange);
    }

    return () => {
      alive = false;
      sub?.remove?.();
      mediaQuery?.removeEventListener?.("change", onMediaChange);
    };
  }, []);

  return reduce;
}
