/**
 * Purpose: Status glyphs, clock-synced activity rings, and loading skeletons for bot sidebar.
 * Context: Extracted from BotSidebar to enforce strict <= 800 line budget.
 * Usage: import { ChatStatusSlot, StatusBadge, SkeletonRows } from "./BotSidebarStatus";
 * Prerequisites: Paseo client runtime, theme tokens, and React Native Animated.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import type { ChatBucket } from "../shared/sidebar";
import { formatBucketLabel, useT } from "./i18n";
import { useReduceMotion } from "./motion";
import type { NativeTokens } from "./native";

type Colors = PluginTheme["colors"];

export function ChatStatusSlot({ colors, tokens, bucket }: { colors: Colors; tokens: NativeTokens; bucket: ChatBucket }) {
  const { t } = useT();
  let glyph: ReactNode;
  if (bucket === "running") glyph = <StatusRing color={tokens.statusDotRunning} />;
  else if (bucket === "needs_input") glyph = <NeedsInputGlyph colors={colors} tokens={tokens} />;
  else if (bucket === "attention") glyph = <Dot color={tokens.statusDotSuccess} />;
  else if (bucket === "done") glyph = <Dot color={tokens.foregroundExtraMuted} opacity={0.3} />;
  else {
    glyph = (
      <>
        <Icon name="MessageSquare" size={14} color={colors.foregroundMuted} />
        <View style={{ position: "absolute", right: 0, bottom: 0, width: 8, height: 8, borderRadius: 4, borderWidth: 1, borderColor: colors.surface0, backgroundColor: tokens.statusDotDanger }} />
      </>
    );
  }
  return (
    <View accessibilityLabel={formatBucketLabel(t, bucket)} style={{ position: "relative", width: 16, height: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
      {glyph}
    </View>
  );
}

function Dot({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color, opacity }} />;
}

function NeedsInputGlyph({ colors, tokens }: { colors: Colors; tokens: NativeTokens }) {
  return (
    <View style={{ width: 12, height: 12, alignItems: "center", justifyContent: "center" }}>
      <View style={{ width: 11, height: 11, borderRadius: 5.5, backgroundColor: colors.surface0, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 9, height: 9, borderRadius: 4.5, backgroundColor: tokens.statusDotWarning, alignItems: "center", justifyContent: "center" }}>
          <View style={{ width: 1, height: 3, borderRadius: 0.5, backgroundColor: colors.surface0 }} />
          <View style={{ width: 1, height: 1, marginTop: 1, borderRadius: 0.5, backgroundColor: colors.surface0 }} />
        </View>
      </View>
    </View>
  );
}

const BADGE_SIZE = 12;
const BADGE_OFFSET = -4;
const RING_FRAME = 14;

export function StatusBadge({ colors, tokens, bucket, backdrop }: { colors: Colors; tokens: NativeTokens; bucket: ChatBucket; backdrop: string }) {
  const { t } = useT();
  if (bucket === "done") return null;
  const bucketLabel = formatBucketLabel(t, bucket);
  if (bucket === "running") {
    const offset = BADGE_OFFSET - (RING_FRAME - BADGE_SIZE) / 2;
    return (
      <View accessibilityLabel={bucketLabel} style={{ position: "absolute", right: offset, bottom: offset }}>
        <StatusRing color={tokens.statusDotRunning} backdrop={backdrop} />
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={bucketLabel}
      style={{
        position: "absolute",
        right: BADGE_OFFSET,
        bottom: BADGE_OFFSET,
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        borderRadius: BADGE_SIZE / 2,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        backgroundColor: backdrop,
      }}
    >
      {bucket === "needs_input" ? (
        <NeedsInputGlyph colors={colors} tokens={tokens} />
      ) : (
        <Dot color={bucket === "failed" ? tokens.statusDotDanger : tokens.statusDotSuccess} />
      )}
    </View>
  );
}

const RING_PERIOD_MS = 900;
const ringProgress = new Animated.Value(0);
const ringRotation = ringProgress.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });
let ringUsers = 0;
let ringLoop: Animated.CompositeAnimation | null = null;

function useRingClock(reduceMotion: boolean) {
  useEffect(() => {
    if (reduceMotion) return;
    ringUsers += 1;
    if (!ringLoop) {
      ringProgress.setValue(0);
      ringLoop = Animated.loop(
        Animated.timing(ringProgress, { toValue: 1, duration: RING_PERIOD_MS, easing: Easing.linear, useNativeDriver: Platform.OS !== "web" }),
      );
      ringLoop.start();
    }
    return () => {
      ringUsers -= 1;
      if (ringUsers === 0 && ringLoop) {
        ringLoop.stop();
        ringLoop = null;
      }
    };
  }, [reduceMotion]);
  return reduceMotion ? "0deg" : ringRotation;
}

function StatusRing({ color, backdrop }: { color: string; backdrop?: string }) {
  const reduceMotion = useReduceMotion();
  const rotate = useRingClock(reduceMotion);
  const circle = { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 } as const;
  return (
    <View style={{ width: RING_FRAME, height: RING_FRAME, borderRadius: RING_FRAME / 2, alignItems: "center", justifyContent: "center", backgroundColor: backdrop }}>
      <View style={{ ...circle, position: "absolute", borderColor: color, opacity: 0.3 }} />
      <Animated.View style={{ position: "absolute", width: 12, height: 12, transform: [{ rotate }] }}>
        <View style={{ ...circle, borderColor: "transparent", borderTopColor: color, opacity: 0.9 }} />
      </Animated.View>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

export function SkeletonRows({ colors }: { colors: Colors }) {
  const { t } = useT();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const native = Platform.OS !== "web";
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1000, useNativeDriver: native }),
        Animated.timing(pulse, { toValue: 0, duration: 1000, useNativeDriver: native }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] });
  return (
    <View accessibilityLabel={t("sidebar.loadingChats")} style={{ gap: 4 }}>
      {[1, 0.7].map((rowOpacity) => (
        <View key={rowOpacity} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, marginLeft: 4, opacity: rowOpacity }}>
          <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.surface2, opacity }} />
          <Animated.View style={{ flex: 1, height: 12, borderRadius: 2, backgroundColor: colors.surface2, opacity }} />
        </View>
      ))}
    </View>
  );
}
