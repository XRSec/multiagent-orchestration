/**
 * Purpose: Multi-select session picker (including archived Paseo chats) for DataAnalysisPane.
 * Context: Client analytics configuration panel component.
 * Usage: Rendered inside DataAnalysisPane with sessions from analyticsSessionsListRpc.
 * Prerequisites: AnalyticsSessionItem type and analytics.* i18n keys.
 */
import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, TextInput, View } from "react-native";
import type { AnalyticsSessionItem } from "../../shared/analytics";
import { useT } from "../i18n";
import { isImeComposing } from "../keyboard";
import { ui } from "../typography";

type Colors = PluginTheme["colors"];

export function SessionSelector({
  colors,
  sessions,
  loading,
  includeArchived,
  query,
  selectedIds,
  onToggleArchived,
  onQueryChange,
  onToggleSelect,
  onClear,
  onReload,
}: {
  colors: Colors;
  sessions: AnalyticsSessionItem[];
  loading: boolean;
  includeArchived: boolean;
  query: string;
  selectedIds: string[];
  onToggleArchived: () => void;
  onQueryChange: (q: string) => void;
  onToggleSelect: (id: string) => void;
  onClear: () => void;
  onReload: () => void;
}) {
  const { t } = useT();
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sessions.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          (s.botId?.toLowerCase().includes(q) ?? false) ||
          s.harness.toLowerCase().includes(q),
      )
    : sessions;

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ fontSize: ui(11), fontWeight: "600", letterSpacing: 0.3, color: colors.foregroundMuted }}>
            {t("analytics.sessionsLabel")}
          </Text>
          <Text style={{ fontSize: ui(11), color: selectedIds.length > 0 ? colors.accent : colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
            {selectedIds.length > 0 ? t("analytics.sessionsSelected", { count: selectedIds.length }) : t("analytics.sessionsHint")}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            onPress={onToggleArchived}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 6,
              borderWidth: 0,
              backgroundColor: includeArchived ? colors.surface2 : colors.surface0,
            }}
          >
            <Icon name={includeArchived ? "CheckSquare" : "Square"} size={12} color={includeArchived ? colors.accent : colors.foregroundMuted} />
            <Text style={{ fontSize: ui(11), color: includeArchived ? colors.foreground : colors.foregroundMuted }}>
              {t("analytics.sessionsIncludeArchived")}
            </Text>
          </Pressable>
          {selectedIds.length > 0 ? (
            <Pressable onPress={onClear} style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.surface0, borderWidth: 0 }}>
              <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{t("analytics.sessionsClear")}</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={onReload} style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, backgroundColor: colors.surface0, borderWidth: 0 }}>
            <Icon name="RefreshCw" size={11} color={colors.foregroundMuted} />
            <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{t("analytics.sessionsReload")}</Text>
          </Pressable>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder={t("analytics.sessionsSearchPlaceholder")}
        placeholderTextColor={colors.foregroundMuted}
        onKeyPress={(e) => {
          if (isImeComposing(e)) return;
        }}
        style={{
          fontSize: ui(12),
          color: colors.foreground,
          backgroundColor: colors.surface0,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      />

      <ScrollView style={{ maxHeight: 200, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface0 }} contentContainerStyle={{ padding: 4, gap: 3 }}>
        {loading && filtered.length === 0 ? (
          <Text style={{ fontSize: ui(12), color: colors.foregroundMuted, padding: 8 }}>{t("analytics.sessionsLoading")}</Text>
        ) : filtered.length === 0 ? (
          <Text style={{ fontSize: ui(12), color: colors.foregroundMuted, padding: 8 }}>{t("analytics.sessionsEmpty")}</Text>
        ) : (
          filtered.map((s) => {
            const active = selectedIds.includes(s.id);
            const time = s.updatedAt.slice(5, 16).replace("T", " ");
            return (
              <Pressable
                key={s.id}
                onPress={() => onToggleSelect(s.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  backgroundColor: active ? colors.surface2 : "transparent",
                }}
              >
                <Icon name={active ? "CheckSquare" : "Square"} size={14} color={active ? colors.accent : colors.foregroundMuted} />
                <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surface1, borderWidth: 0 }}>
                  <Text style={{ fontSize: ui(10), fontWeight: "600", color: colors.foregroundMuted }}>{s.harness.toUpperCase()}</Text>
                </View>
                <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: ui(12), fontWeight: active ? "600" : "400", color: colors.foreground }}>
                  {s.title}
                </Text>
                {s.archived ? (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surface1, borderWidth: 0 }}>
                    <Text style={{ fontSize: ui(10), color: colors.foregroundMuted }}>{t("analytics.sessionsArchivedBadge")}</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: ui(11), color: colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>{time}</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
