import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, ScrollView } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { ANALYTICS_ANALYZE_BOT_ID, ANALYTICS_CLEAN_BOT_ID } from "../../shared/analytics";
import type { AnalysisStage, AnalyticsHistoryRecord, AnalyticsRunOutput, AnalyticsSessionItem, HarnessKind } from "../../shared/analytics";
import type { Bot } from "../../shared/bot";
import { analyticsHistoryDeleteRpc, analyticsHistoryListRpc, analyticsRunRpc, analyticsSessionsListRpc } from "../../shared/rpc";
import { useT } from "../i18n";
import { Markdown } from "../Markdown";
import { CONTENT_MAX_WIDTH, nativeTokens } from "../native";
import { Button } from "../panel/controls";
import { ui } from "../typography";
import { tooltip } from "../ui/Tooltip";
import { SessionSelector } from "./SessionSelector";

type Colors = PluginTheme["colors"];
type ResultTab = "report" | "cleaned" | "digest";
type TimePreset = "3h" | "6h" | "12h" | "1d" | "2d" | "3d" | "1w" | "custom";
/** Rolling windows ending now, in hours. */
const PRESET_HOURS: Record<Exclude<TimePreset, "custom">, number> = { "3h": 3, "6h": 6, "12h": 12, "1d": 24, "2d": 48, "3d": 72, "1w": 168 };

function formatLocalYmd(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DataAnalysisPane({
  colors,
  bots,
  compact,
  bottomInset,
  onBack,
}: {
  colors: Colors;
  bots: readonly Bot[];
  compact: boolean;
  bottomInset: number;
  onBack?: () => void;
}) {
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const runAnalytics = useRpc(analyticsRunRpc);
  const listHistory = useRpc(analyticsHistoryListRpc);
  const deleteHistory = useRpc(analyticsHistoryDeleteRpc);
  const listSessions = useRpc(analyticsSessionsListRpc);
  const [harness, setHarness] = useState<HarnessKind>("all");
  const [timePreset, setTimePreset] = useState<TimePreset>("1d");
  const [fromDate, setFromDate] = useState(() => formatLocalYmd(0));
  const [toDate, setToDate] = useState(() => formatLocalYmd(0));
  const [stage, setStage] = useState<AnalysisStage>("full");

  const [sessions, setSessions] = useState<AnalyticsSessionItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(true);
  const [sessionQuery, setSessionQuery] = useState("");
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalyticsHistoryRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyticsRunOutput | null>(null);
  const [tab, setTab] = useState<ResultTab>("report");

  const refreshHistory = async (autoSelectLatest = false) => {
    try {
      const { records } = await listHistory({});
      setHistory(records);
      if (autoSelectLatest && records.length > 0) {
        const latest = records[0]!;
        setSelectedId(latest.id);
        setResult(latest);
        setTab(latest.report ? "report" : latest.cleaned ? "cleaned" : "digest");
      }
    } catch {
      // ignore initial load errors
    }
  };

  const refreshSessions = async (nextArchived = includeArchived, nextHarness = harness) => {
    setSessionsLoading(true);
    try {
      const res = await listSessions({ includeArchived: nextArchived, harness: nextHarness, limit: 100 });
      setSessions(res.sessions);
    } catch {
      // ignore session list load errors
    } finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    void refreshHistory(true);
  }, []);

  useEffect(() => {
    void refreshSessions(includeArchived, harness);
  }, [includeArchived, harness]);

  // Fixed pipeline bots must still exist (and not be archived) on this host.
  const requiredBotIds = stage === "full" ? [ANALYTICS_CLEAN_BOT_ID, ANALYTICS_ANALYZE_BOT_ID] : stage === "clean" ? [ANALYTICS_CLEAN_BOT_ID] : [];
  const missingBotIds = requiredBotIds.filter((id) => !bots.some((b) => b.id === id));
  const botsBlocked = missingBotIds.length > 0;

  const handleRun = async () => {
    setBusy(true);
    setError(null);
    try {
      const dateOpts =
        timePreset === "custom"
          ? { from: fromDate.trim() || undefined, to: toDate.trim() || undefined, days: 1 }
          : { hours: PRESET_HOURS[timePreset], days: 1 };

      const res = await runAnalytics({
        harness,
        ...dateOpts,
        stage,
        maxSessions: 40,
        maxChars: 36_000,
        ...(selectedSessionIds.length > 0 ? { sessionIds: selectedSessionIds } : {}),
      });
      setResult(res);
      setTab(res.report ? "report" : res.cleaned ? "cleaned" : "digest");
      await refreshHistory(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const backLabel = t("teams.backToBots");
  const activeText = result
    ? tab === "report"
      ? result.report || result.cleaned || result.digest
      : tab === "cleaned"
        ? result.cleaned || result.digest
        : result.digest
    : "";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface0 }}>
      <View style={{ height: compact ? 56 : 36, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: compact ? 4 : 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel} {...tooltip(backLabel, "bottom")} onPress={onBack} style={({ pressed }) => ({ padding: 12, borderRadius: 8, backgroundColor: pressed ? tokens.interactionHighlight : "transparent" })}>
            <Icon name="ArrowLeft" size={20} color={colors.foregroundMuted} />
          </Pressable>
        ) : null}
        <Icon name="BarChart2" size={16} color={colors.foregroundMuted} />
        <Text style={{ fontSize: ui(14), fontWeight: "600", color: colors.foreground }}>{t("analytics.title")}</Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: Math.max(24, bottomInset + 20), alignItems: "center" }}>
        <View style={{ width: "100%", maxWidth: compact ? CONTENT_MAX_WIDTH : 1160, gap: 16 }}>
          <Text style={{ fontSize: ui(13), lineHeight: 19, color: colors.foregroundMuted }}>{t("analytics.subtitle")}</Text>

          {/* Single-stroke configuration surface (CDS: borderless segmented controls inside bordered card) */}
          <View style={{ padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, gap: 14 }}>
            <View style={{ flexDirection: compact ? "column" : "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <SegmentedGroup
                  colors={colors}
                  label={t("analytics.harnessLabel")}
                  options={[
                    { id: "all", label: t("analytics.harnessAll") },
                    { id: "agy", label: "AGY" },
                    { id: "claude", label: "Claude" },
                    { id: "pi", label: "Pi" },
                  ]}
                  value={harness}
                  onChange={(v) => setHarness(v as HarnessKind)}
                />
              </View>
              <View style={{ flex: 1.4 }}>
                <SegmentedGroup
                  colors={colors}
                  label={t("analytics.dateLabel")}
                  options={[
                    { id: "3h", label: t("analytics.preset3h") },
                    { id: "6h", label: t("analytics.preset6h") },
                    { id: "12h", label: t("analytics.preset12h") },
                    { id: "1d", label: t("analytics.preset1d") },
                    { id: "2d", label: t("analytics.preset2d") },
                    { id: "3d", label: t("analytics.preset3d") },
                    { id: "1w", label: t("analytics.preset1w") },
                    { id: "custom", label: t("analytics.presetCustom") },
                  ]}
                  value={timePreset}
                  onChange={(v) => setTimePreset(v as TimePreset)}
                />
              </View>
            </View>

            {timePreset === "custom" ? (
              <View style={{ flexDirection: compact ? "column" : "row", gap: 10 }}>
                <FieldInput colors={colors} label={t("analytics.fromDateLabel")} value={fromDate} onChangeText={setFromDate} placeholder="YYYY-MM-DD" />
                <FieldInput colors={colors} label={t("analytics.toDateLabel")} value={toDate} onChangeText={setToDate} placeholder="YYYY-MM-DD" />
              </View>
            ) : null}

            <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.6 }} />

            <SegmentedGroup
              colors={colors}
              label={t("analytics.stageLabel")}
              options={[
                { id: "full", label: t("analytics.stageFull") },
                { id: "clean", label: t("analytics.stageClean") },
                { id: "extract", label: t("analytics.stageExtract") },
              ]}
              value={stage}
              onChange={(v) => setStage(v as AnalysisStage)}
            />

            <View style={{ height: 1, backgroundColor: colors.border, opacity: 0.6 }} />

            <SessionSelector
              colors={colors}
              sessions={sessions}
              loading={sessionsLoading}
              includeArchived={includeArchived}
              query={sessionQuery}
              selectedIds={selectedSessionIds}
              onToggleArchived={() => setIncludeArchived((prev) => !prev)}
              onQueryChange={setSessionQuery}
              onToggleSelect={(id) =>
                setSelectedSessionIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
              }
              onClear={() => setSelectedSessionIds([])}
              onReload={() => void refreshSessions(includeArchived, harness)}
            />

            {missingBotIds.length > 0 ? (
              <Text style={{ fontSize: ui(12), color: colors.statusDanger }}>{t("analytics.botsMissing", { ids: missingBotIds.join(", ") })}</Text>
            ) : null}

            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingTop: 2 }}>
              <Button colors={colors} label={busy ? t("analytics.running") : t("analytics.runButton")} loading={busy} disabled={botsBlocked} onPress={() => void handleRun()} />
            </View>
          </View>

          {error ? (
            <View style={{ padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.statusDanger, backgroundColor: colors.surface1 }}>
              <Text style={{ fontSize: ui(13), color: colors.statusDanger }}>{error}</Text>
            </View>
          ) : null}

          {history.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: ui(11), fontWeight: "600", color: colors.foregroundMuted }}>{t("analytics.historyLabel")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {history.slice(0, 12).map((rec) => {
                  const active = rec.id === selectedId;
                  const time = rec.createdAt.slice(5, 16).replace("T", " ");
                  return (
                    <View
                      key={rec.id}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? colors.accent : colors.border,
                        backgroundColor: active ? colors.surface2 : colors.surface1,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          setSelectedId(rec.id);
                          setResult(rec);
                          setTab(rec.report ? "report" : rec.cleaned ? "cleaned" : "digest");
                        }}
                        style={{ paddingVertical: 5, paddingLeft: 10, paddingRight: 6 }}
                      >
                        <Text style={{ fontSize: ui(12), fontWeight: active ? "600" : "400", color: active ? colors.foreground : colors.foregroundMuted, fontVariant: ["tabular-nums"] }}>
                          {`${time} · ${rec.harness} · ${rec.rangeLabel} (${rec.sessionCount})`}
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={t("analytics.deleteRecord")}
                        onPress={() => {
                          void deleteHistory({ id: rec.id }).then(() => {
                            if (selectedId === rec.id) {
                              setSelectedId(null);
                              setResult(null);
                            }
                            return refreshHistory(selectedId === rec.id);
                          });
                        }}
                        style={{ paddingVertical: 5, paddingRight: 8, paddingLeft: 2 }}
                      >
                        <Icon name="X" size={12} color={colors.foregroundMuted} />
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ) : null}

          {result ? (
            <View style={{ gap: 12 }}>
              {/* KPI summary strip with tabular-nums */}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <MetricCard colors={colors} label={t("analytics.harnessLabel")} value={String(result.sessionCount)} sub={result.rangeLabel} />
                <MetricCard colors={colors} label="Turns" value={String(result.turnCount)} sub={Object.entries(result.byHarness).map(([k, v]) => `${k}:${v}`).join(" · ") || "-"} />
                <MetricCard colors={colors} label="Skills" value={String(result.skillsDetected.length)} sub={result.skillsDetected.slice(0, 2).join(", ") || "-"} />
              </View>

              <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", padding: 4, borderRadius: 10, backgroundColor: colors.surface1, alignSelf: "flex-start" }}>
                {result.report ? <TabPill colors={colors} active={tab === "report"} label={t("analytics.tabReport")} onPress={() => setTab("report")} /> : null}
                {result.cleaned ? <TabPill colors={colors} active={tab === "cleaned"} label={t("analytics.tabCleaned")} onPress={() => setTab("cleaned")} /> : null}
                <TabPill colors={colors} active={tab === "digest"} label={t("analytics.tabDigest")} onPress={() => setTab("digest")} />
              </View>

              <View style={{ padding: 18, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 }}>
                <Markdown colors={colors} text={activeText} />
              </View>
            </View>
          ) : (
            <View style={{ padding: 24, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, alignItems: "center" }}>
              <Text style={{ fontSize: ui(13), color: colors.foregroundMuted }}>{t("analytics.emptyState")}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function SegmentedGroup({ colors, label, options, value, onChange }: { colors: Colors; label: string; options: Array<{ id: string; label: string }>; value: string; onChange(id: string): void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: ui(11), fontWeight: "600", letterSpacing: 0.3, color: colors.foregroundMuted }}>{label}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, padding: 4, borderRadius: 8, backgroundColor: colors.surface0 }}>
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              style={{
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: active ? colors.surface2 : "transparent",
              }}
            >
              <Text style={{ fontSize: ui(12), fontWeight: active ? "600" : "400", color: active ? colors.foreground : colors.foregroundMuted }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function MetricCard({ colors, label, value, sub }: { colors: Colors; label: string; value: string; sub: string }) {
  return (
    <View style={{ flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1, gap: 2 }}>
      <Text style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{label}</Text>
      <Text style={{ fontSize: ui(18), fontWeight: "700", color: colors.foreground, fontVariant: ["tabular-nums"] }}>{value}</Text>
      <Text numberOfLines={1} style={{ fontSize: ui(11), color: colors.foregroundMuted }}>{sub}</Text>
    </View>
  );
}

function FieldInput({ colors, label, value, onChangeText, placeholder }: { colors: Colors; label: string; value: string; onChangeText(v: string): void; placeholder: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ fontSize: ui(11), fontWeight: "600", color: colors.foregroundMuted }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.foregroundMuted}
        style={{
          fontSize: ui(13),
          color: colors.foreground,
          backgroundColor: colors.surface0,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      />
    </View>
  );
}

function TabPill({ colors, active, label, onPress }: { colors: Colors; active: boolean; label: string; onPress(): void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: 5,
        paddingHorizontal: 12,
        borderRadius: 7,
        backgroundColor: active ? colors.surface2 : "transparent",
      }}
    >
      <Text style={{ fontSize: ui(12), fontWeight: active ? "600" : "400", color: active ? colors.foreground : colors.foregroundMuted }}>{label}</Text>
    </Pressable>
  );
}
