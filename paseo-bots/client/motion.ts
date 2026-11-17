/**
 * Purpose: Accessibility and motion preferences hooks.
 * Context: Respect user "Reduce Motion" system preferences across web and native.
 * Usage: const reduceMotion = useReduceMotion();
 * Prerequisites: React Native AccessibilityInfo.
 */

import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((val) => {
        if (alive) setReduce(Boolean(val));
      })
      .catch(() => {});

    const sub = AccessibilityInfo.addEventListener?.("reduceMotionChanged", (val: boolean) => {
      if (alive) setReduce(Boolean(val));
    });

    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduce;
}
