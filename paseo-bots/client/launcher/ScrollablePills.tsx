/**
 * Purpose: Smooth native gesture horizontal scroll container for bot and team companion pills.
 * Context: Operates inside mobile bottom sheets and popovers with pure touch momentum and touch drag fallback.
 * Usage: <ScrollablePills colors={colors}>{pillItems}</ScrollablePills>
 * Prerequisites: React Native and React Native Web environments.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import React, { useEffect, useRef } from "react";
import { Platform, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { domNode } from "../web";

type Colors = PluginTheme["colors"];

interface ScrollablePillsProps {
  children: React.ReactNode;
  colors?: Colors;
}

interface DomTouchEvent {
  touches: ArrayLike<{ clientX: number; clientY: number }>;
  cancelable: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

interface DomMouseEvent {
  preventDefault(): void;
  stopPropagation(): void;
}

export function ScrollablePills({ children }: ScrollablePillsProps) {
  const containerRef = useRef<View>(null);
  const dragInfo = useRef({
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    isDragging: false,
    hasMoved: false,
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const el = domNode(containerRef.current) as (HTMLElement & {
      scrollLeft: number;
      addEventListener(type: string, listener: any, options?: any): void;
      removeEventListener(type: string, listener: any, options?: any): void;
    }) | null;

    if (!el) return;

    const onTouchStart = (e: DomTouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;
      dragInfo.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        startScrollLeft: el.scrollLeft,
        isDragging: false,
        hasMoved: false,
      };
    };

    const onTouchMove = (e: DomTouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      if (!touch) return;

      const deltaX = dragInfo.current.startX - touch.clientX;
      const deltaY = dragInfo.current.startY - touch.clientY;

      if (!dragInfo.current.isDragging) {
        if (Math.abs(deltaX) > 4 && Math.abs(deltaX) > Math.abs(deltaY)) {
          dragInfo.current.isDragging = true;
          dragInfo.current.hasMoved = true;
        }
      }

      if (dragInfo.current.isDragging) {
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
        el.scrollLeft = dragInfo.current.startScrollLeft + deltaX;
      }
    };

    const onTouchEnd = () => {
      if (dragInfo.current.isDragging) {
        setTimeout(() => {
          dragInfo.current.isDragging = false;
        }, 50);
      }
    };

    const onClickCapture = (e: DomMouseEvent) => {
      if (dragInfo.current.hasMoved) {
        e.stopPropagation();
        e.preventDefault();
        dragInfo.current.hasMoved = false;
      }
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    el.addEventListener("click", onClickCapture, true);

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, []);

  if (Platform.OS === "web") {
    const webContainerStyle = {
      width: "100%",
      display: "flex",
      flexDirection: "row",
      flexWrap: "nowrap",
      overflowX: "scroll",
      overflowY: "hidden",
      WebkitOverflowScrolling: "touch",
      touchAction: "pan-x",
      scrollbarWidth: "none",
      msOverflowStyle: "none",
    } as unknown as ViewStyle;

    return (
      <View style={styles.container}>
        <View
          ref={containerRef}
          style={[styles.webScrollWrapper, webContainerStyle]}
        >
          <View style={styles.scrollContent}>
            {children}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        scrollEventThrottle={16}
        directionalLockEnabled
        alwaysBounceHorizontal
        keyboardShouldPersistTaps="handled"
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  webScrollWrapper: {
    width: "100%",
  },
  scrollView: {
    flexGrow: 1,
    width: "100%",
  },
  scrollContent: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
});
