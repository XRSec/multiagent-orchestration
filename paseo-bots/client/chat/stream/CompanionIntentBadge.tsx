/**
 * Purpose: Collapsible badge for displaying companion distilled intent and compiled prompt inside user message bubble.
 * Context: Rendered directly below rawUserText in the same surface3 grey user bubble.
 * Usage: <CompanionIntentBadge colors={colors} companion={companion} />
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import type { ParsedCompanionIntent } from "../../../shared/companion-intent";
import { useT } from "../../i18n";
import { triggerLayoutAnimation, useReduceMotion } from "../../motion";
import { nativeTokens } from "../../native";
import { ui } from "../../typography";

type Colors = PluginTheme["colors"];

export interface CompanionIntentBadgeProps {
  colors: Colors;
  companion: ParsedCompanionIntent;
}

export function CompanionIntentBadge({ colors, companion }: CompanionIntentBadgeProps) {
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const reduceMotion = useReduceMotion();
  const [expanded, setExpanded] = useState(false);

  const isWeb = Platform.OS === "web";

  const toggleExpanded = () => {
    triggerLayoutAnimation(200, reduceMotion);
    setExpanded((prev) => !prev);
  };

  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: 0,
        backgroundColor: tokens.brandClaySoft,
        marginTop: 6,
        overflow: "hidden",
        alignSelf: "stretch",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? t("companion.collapseTooltip") : t("companion.expandTooltip")}
        accessibilityState={{ expanded }}
        onPress={toggleExpanded}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 10,
          paddingVertical: 6,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 }}>
          <Icon name="Sparkles" size={13} color={tokens.brandClay} />
          <Text
            numberOfLines={1}
            ellipsizeMode="tail"
            style={{
              fontSize: ui(11),
              fontWeight: "500",
              color: colors.foregroundMuted,
              flexShrink: 1,
            }}
          >
            {t("companion.distilledIntentLabel")} · {companion.distilledIntent}
          </Text>
        </View>
        <Icon
          name={expanded ? "ChevronUp" : "ChevronDown"}
          size={13}
          color={colors.foregroundMuted}
        />
      </Pressable>

      {expanded && (
        <View style={{ borderTopWidth: 1, borderTopColor: tokens.borderAccent, paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: ui(11), fontWeight: "600", letterSpacing: 0.2, color: tokens.brandClay, fontVariant: ["tabular-nums"] }}>
              {t("companion.distilledRequirement")} (T{companion.turnIndex})
            </Text>
            <Text
              selectable
              style={[
                { fontSize: ui(12), lineHeight: 16, color: colors.foreground },
                isWeb ? ({ overflowWrap: "anywhere" } as object) : null,
              ]}
            >
              {companion.distilledIntent}
            </Text>
          </View>

          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: ui(11), fontWeight: "600", letterSpacing: 0.2, color: tokens.brandClay }}>
              {t("companion.compiledPrompt")}
            </Text>
            <View
              style={{
                borderRadius: 6,
                borderWidth: 0,
                padding: 8,
                marginTop: 2,
                backgroundColor: colors.surface1,
              }}
            >
              <Text
                selectable
                style={[
                  { fontSize: ui(11), lineHeight: 15, color: colors.foreground },
                  isWeb
                    ? ({
                        overflowWrap: "anywhere",
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                      } as object)
                    : null,
                ]}
              >
                {companion.compiledPrompt}
              </Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
