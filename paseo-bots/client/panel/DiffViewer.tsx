import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { Platform, Text, View, type TextStyle, type ViewStyle } from "react-native";
import { parseUnifiedDiff, type DiffLine } from "../../shared/tools";
import { MONO_FONT, MONO_PROPS } from "../native";
import { code } from "../typography";

type Colors = PluginTheme["colors"];

const PAD = 12;
const EXTRA_RIGHT = 16;
const EXTRA_BOTTOM = 12;
const CODE_LINE = 18;
const isWeb = Platform.OS === "web";

interface DiffViewerProps {
  colors: Colors;
  diff: string;
  maxHeight?: number;
}

export function DiffViewer({ colors, diff, maxHeight = 300 }: DiffViewerProps) {
  const lines: DiffLine[] = parseUnifiedDiff(diff);

  const mono: TextStyle = {
    fontFamily: MONO_FONT,
    fontSize: code(),
    color: colors.foreground,
    lineHeight: CODE_LINE,
    ...(isWeb ? ({ whiteSpace: "pre", overflowWrap: "normal" } as TextStyle) : {}),
  };

  const lineStyle = (line: DiffLine): { box: ViewStyle; text: TextStyle } => {
    switch (line.type) {
      case "add":
        return { box: { backgroundColor: "rgba(46, 160, 67, 0.15)" }, text: { color: colors.foreground } };
      case "remove":
        return { box: { backgroundColor: "rgba(248, 81, 73, 0.1)" }, text: { color: colors.foreground } };
      case "header":
      default:
        return { box: { backgroundColor: colors.surface1 }, text: { color: colors.foregroundMuted } };
    }
  };

  if (lines.length === 0) return null;

  return (
    <View style={{ backgroundColor: colors.surface1, borderRadius: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden" }}>
      <ScrollView
        style={{ maxHeight }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: EXTRA_BOTTOM }}
        nestedScrollEnabled
        showsVerticalScrollIndicator
      >
        <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator contentContainerStyle={{ flexDirection: "column", paddingRight: EXTRA_RIGHT }}>
          <View style={{ alignSelf: "flex-start", padding: PAD }}>
            {lines.map((line, index) => {
              const style = lineStyle(line);
              const highlight = line.type === "add" ? "rgba(46, 160, 67, 0.4)" : "rgba(248, 81, 73, 0.35)";
              return (
                <View key={index} style={[{ minWidth: "100%", paddingVertical: 2 }, style.box]}>
                  <Text selectable {...MONO_PROPS} style={[mono, style.text]}>
                    {line.segments
                      ? [
                          line.content[0],
                          ...line.segments.map((segment, part) => (
                            <Text key={part} style={segment.changed ? { backgroundColor: highlight } : undefined}>
                              {segment.text}
                            </Text>
                          )),
                        ]
                      : line.content}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
