/**
 * Purpose: Visual viewport and virtual keyboard detection hook for mobile bottom sheets.
 * Context: Monitors window.visualViewport resize and scroll to dynamically calculate keyboard offset.
 * Usage: const { keyboardHeight, viewportHeight } = useVisualViewport();
 * Prerequisites: Web and React Native environments.
 */

import { useEffect, useState } from "react";

export interface ViewportState {
  keyboardHeight: number;
  viewportHeight: number;
}

interface VisualViewportLike {
  height: number;
  offsetTop: number;
  addEventListener(type: "resize" | "scroll", listener: () => void): void;
  removeEventListener(type: "resize" | "scroll", listener: () => void): void;
}

interface WindowWithVisualViewport {
  innerHeight: number;
  visualViewport?: VisualViewportLike | null;
}

function getWindow(): WindowWithVisualViewport | null {
  if (typeof globalThis !== "undefined" && "window" in globalThis) {
    return (globalThis as unknown as { window?: WindowWithVisualViewport }).window ?? null;
  }
  return null;
}

export function useVisualViewport(): ViewportState {
  const [state, setState] = useState<ViewportState>(() => {
    const win = getWindow();
    if (win?.visualViewport) {
      const vv = win.visualViewport;
      const kh = Math.max(0, win.innerHeight - vv.height);
      return {
        keyboardHeight: kh > 80 ? kh : 0,
        viewportHeight: vv.height,
      };
    }
    return { keyboardHeight: 0, viewportHeight: 0 };
  });

  useEffect(() => {
    const win = getWindow();
    if (!win?.visualViewport) return;

    const vv = win.visualViewport;
    const handleViewportChange = () => {
      const kh = Math.max(0, win.innerHeight - vv.height);
      setState({
        keyboardHeight: kh > 80 ? kh : 0,
        viewportHeight: vv.height,
      });
    };

    vv.addEventListener("resize", handleViewportChange);
    vv.addEventListener("scroll", handleViewportChange);

    return () => {
      vv.removeEventListener("resize", handleViewportChange);
      vv.removeEventListener("scroll", handleViewportChange);
    };
  }, []);

  return state;
}
