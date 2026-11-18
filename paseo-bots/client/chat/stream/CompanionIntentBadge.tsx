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
import { ui } from "../../typography";

type Colors = PluginTheme["colors"];

export interface CompanionIntentBadgeProps {
  colors: Colors;
  companion: ParsedCompanionIntent;
}

export function CompanionIntentBadge({ colors, companion }: CompanionIntentBadgeProps) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);

  const isWeb = Platform.OS === "web";

  return (
    <View
      style={{
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface2,
        marginTop: 6,
        overflow: "hidden",
        alignSelf: "stretch",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={expanded ? t("companion.collapseTooltip") : t("companion.expandTooltip")}
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((prev) => !prev)}
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
          <Icon name="Sparkles" size={13} color={colors.accent} />
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
        <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}>
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: ui(11), fontWeight: "600", letterSpacing: 0.2, color: colors.accent }}>
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
            <Text style={{ fontSize: ui(11), fontWeight: "600", letterSpacing: 0.2, color: colors.accent }}>
              {t("companion.compiledPrompt")}
            </Text>
            <View
              style={{
                borderRadius: 6,
                borderWidth: 1,
                padding: 8,
                marginTop: 2,
                backgroundColor: colors.surface1,
                borderColor: colors.border,
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
