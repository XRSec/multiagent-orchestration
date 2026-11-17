/**
 * Purpose: Compact mobile bottom sheet for selecting model, thinking level, and permission mode.
 * Context: Replaces the 3 separate inline toolbar dropdowns on narrow/mobile screens in BotLauncherCore.
 * Usage: <CompactComposerSheet open={...} onClose={...} colors={colors} ... />
 * Prerequisites: React Native Modal, @getpaseo/plugin/client/react-native Icon, and useComposerOptions state.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useT } from "../i18n";
import { homeIndicatorInset } from "../keyboard";
import { ui } from "../typography";
import type { AgentProfileEntry, ProviderEntry, ProviderModel } from "./ModelPickerPopover";

type SheetView = "root" | "model" | "thinking" | "mode";

interface OptionItem {
  id: string;
  label: string;
}

export interface CompactComposerSheetProps {
  open: boolean;
  onClose: () => void;
  colors: PluginTheme["colors"];
  providers: ProviderEntry[];
  profiles: AgentProfileEntry[];
  selectedProvider: string;
  selectedModelId: string | null;
  currentModelLabel: string;
  thinkingOptions: OptionItem[];
  selectedThinkingId: string | null;
  currentThinkingLabel: string;
  modeOptions: OptionItem[];
  selectedModeId: string | null;
  currentModeLabel: string;
  onSelectModel: (provider: ProviderEntry, model: ProviderModel | null) => void;
  onSelectProfile: (profile: AgentProfileEntry) => void;
  onSelectThinking: (thinkingId: string) => void;
  onSelectMode: (modeId: string) => void;
}

function SheetRow(props: {
  icon: "Sparkles" | "Brain" | "Shield";
  label: string;
  value: string;
  colors: PluginTheme["colors"];
  onPress: () => void;
}) {
  const { icon, label, value, colors, onPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.summaryRow,
        { backgroundColor: pressed ? colors.surface2 : "transparent", borderBottomColor: colors.border },
      ]}
    >
      <View style={styles.summaryLeft}>
        <Icon name={icon} size={16} color={colors.foregroundMuted} />
        <Text style={[styles.summaryLabel, { color: colors.foreground }]}>{label}</Text>
      </View>
      <View style={styles.summaryRight}>
        <Text numberOfLines={1} style={[styles.summaryValue, { color: colors.foregroundMuted }]}>
          {value}
        </Text>
        <Icon name="ChevronRight" size={15} color={colors.foregroundMuted} />
      </View>
    </Pressable>
  );
}

function OptionList(props: {
  options: OptionItem[];
  selectedId: string | null;
  colors: PluginTheme["colors"];
  onSelect: (id: string) => void;
}) {
  const { options, selectedId, colors, onSelect } = props;
  const activeId = selectedId ?? options[0]?.id ?? null;
  return (
    <View style={styles.listSection}>
      {options.map((opt) => {
        const selected = opt.id === activeId;
        return (
          <Pressable
            key={opt.id}
            accessibilityRole="button"
            onPress={() => onSelect(opt.id)}
            style={({ pressed }) => [
              styles.optionRow,
              { backgroundColor: selected || pressed ? colors.surface2 : "transparent" },
            ]}
          >
            <Text numberOfLines={1} style={[styles.optionLabel, { color: colors.foreground }]}>
              {opt.label}
            </Text>
            {selected ? <Icon name="Check" size={16} color={colors.accent} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function CompactComposerSheet(props: CompactComposerSheetProps) {
  const {
    open,
    onClose,
    colors,
    providers,
    profiles,
    selectedProvider,
    selectedModelId,
    currentModelLabel,
    thinkingOptions,
    selectedThinkingId,
    currentThinkingLabel,
    modeOptions,
    selectedModeId,
    currentModeLabel,
    onSelectModel,
    onSelectProfile,
    onSelectThinking,
    onSelectMode,
  } = props;
  const { t } = useT();
  const [view, setView] = useState<SheetView>("root");
  const [drillProviderId, setDrillProviderId] = useState<string | null>(null);
  const bottomInset = homeIndicatorInset();

  useEffect(() => {
    if (!open) {
      setView("root");
      setDrillProviderId(null);
    }
  }, [open]);

  const normalizedProviders = useMemo(
    () =>
      providers.map((p) => ({
        provider: p,
        models: (p.models ?? []).filter((m) => m.isSelectable !== false),
      })),
    [providers],
  );

  const drillItem = useMemo(
    () => (drillProviderId ? normalizedProviders.find((item) => item.provider.provider === drillProviderId) ?? null : null),
    [drillProviderId, normalizedProviders],
  );

  const headerTitle =
    view === "model"
      ? drillItem
        ? drillItem.provider.label ?? drillItem.provider.provider
        : t("panel.rowModel")
      : view === "thinking"
        ? t("panel.rowThinking")
        : view === "mode"
          ? t("panel.rowMode")
          : t("launcher.selectModel");

  const handleBack = () => {
    if (view === "model" && drillProviderId) {
      setDrillProviderId(null);
      return;
    }
    setView("root");
  };

  const isModelSelected = (providerId: string, modelId: string, models: ProviderModel[]) => {
    if (providerId !== selectedProvider) return false;
    if (selectedModelId) return selectedModelId === modelId;
    const defaultModel = models.find((m) => m.isDefault) ?? models[0];
    return defaultModel?.id === modelId;
  };

  const hasModels = providers.length > 0 || profiles.length > 0;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <Pressable accessibilityLabel={t("common.close")} onPress={onClose} style={styles.backdrop} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface1,
              borderColor: colors.border,
              paddingBottom: Math.max(bottomInset, 16),
            },
          ]}
        >
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              {view !== "root" ? (
                <Pressable accessibilityRole="button" onPress={handleBack} hitSlop={8} style={styles.iconBtn}>
                  <Icon name="ChevronLeft" size={18} color={colors.foreground} />
                </Pressable>
              ) : null}
              <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.foreground }]}>
                {headerTitle}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              onPress={onClose}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <Icon name="X" size={18} color={colors.foregroundMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
            {view === "root" ? (
              <View>
                {hasModels ? (
                  <SheetRow
                    icon="Sparkles"
                    label={t("panel.rowModel")}
                    value={currentModelLabel}
                    colors={colors}
                    onPress={() => setView("model")}
                  />
                ) : null}
                {thinkingOptions.length > 0 ? (
                  <SheetRow
                    icon="Brain"
                    label={t("panel.rowThinking")}
                    value={currentThinkingLabel}
                    colors={colors}
                    onPress={() => setView("thinking")}
                  />
                ) : null}
                {modeOptions.length > 0 ? (
                  <SheetRow
                    icon="Shield"
                    label={t("panel.rowMode")}
                    value={currentModeLabel}
                    colors={colors}
                    onPress={() => setView("mode")}
                  />
                ) : null}
              </View>
            ) : null}

            {view === "thinking" ? (
              <OptionList
                options={thinkingOptions}
                selectedId={selectedThinkingId}
                colors={colors}
                onSelect={(id) => {
                  onSelectThinking(id);
                  setView("root");
                }}
              />
            ) : null}

            {view === "mode" ? (
              <OptionList
                options={modeOptions}
                selectedId={selectedModeId}
                colors={colors}
                onSelect={(id) => {
                  onSelectMode(id);
                  setView("root");
                }}
              />
            ) : null}

            {view === "model" && drillItem ? (
              <View style={styles.listSection}>
                {drillItem.models.map((model) => {
                  const selected = isModelSelected(drillItem.provider.provider, model.id, drillItem.models);
                  return (
                    <Pressable
                      key={model.id}
                      accessibilityRole="button"
                      onPress={() => {
                        onSelectModel(drillItem.provider, model);
                        setDrillProviderId(null);
                        setView("root");
                      }}
                      style={({ pressed }) => [
                        styles.optionRow,
                        { backgroundColor: selected || pressed ? colors.surface2 : "transparent" },
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.optionLabel, { color: colors.foreground }]}>
                        {model.label}
                      </Text>
                      {selected ? <Icon name="Check" size={16} color={colors.accent} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {view === "model" && !drillItem ? (
              <View style={styles.listSection}>
                {profiles.length > 0 ? (
                  <View style={styles.subSection}>
                    <Text style={[styles.sectionTitle, { color: colors.foregroundMuted }]}>{t("launcher.profilesTitle")}</Text>
                    {profiles.map((profile) => {
                      const active =
                        profile.provider === selectedProvider &&
                        (profile.model ?? null) === selectedModelId &&
                        (profile.modeId ?? null) === selectedModeId &&
                        (profile.thinkingOptionId ?? null) === selectedThinkingId;
                      return (
                        <Pressable
                          key={profile.id}
                          accessibilityRole="button"
                          onPress={() => {
                            onSelectProfile(profile);
                            setView("root");
                          }}
                          style={({ pressed }) => [
                            styles.optionRow,
                            { backgroundColor: active || pressed ? colors.surface2 : "transparent" },
                          ]}
                        >
                          <Text numberOfLines={1} style={[styles.optionLabel, { color: colors.foreground }]}>
                            {profile.name}
                          </Text>
                          {active ? <Icon name="Check" size={16} color={colors.accent} /> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
                <Text style={[styles.sectionTitle, { color: colors.foregroundMuted }]}>{t("launcher.providersTitle")}</Text>
                {normalizedProviders.map(({ provider, models }) => {
                  const isCurrent = provider.provider === selectedProvider;
                  return (
                    <Pressable
                      key={provider.provider}
                      accessibilityRole="button"
                      onPress={() => {
                        if (models.length > 0) {
                          setDrillProviderId(provider.provider);
                        } else {
                          onSelectModel(provider, null);
                          setView("root");
                        }
                      }}
                      style={({ pressed }) => [
                        styles.optionRow,
                        { backgroundColor: isCurrent || pressed ? colors.surface2 : "transparent" },
                      ]}
                    >
                      <Text numberOfLines={1} style={[styles.optionLabel, { color: colors.foreground }]}>
                        {provider.label ?? provider.provider}
                      </Text>
                      <View style={styles.summaryRight}>
                        <Text style={[styles.countText, { color: colors.foregroundMuted }]}>
                          {models.length > 0 ? t("launcher.modelCount", { count: models.length }) : t("common.default")}
                        </Text>
                        {models.length > 0 ? <Icon name="ChevronRight" size={15} color={colors.foregroundMuted} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropWrap: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    maxHeight: "75%",
    overflow: "hidden",
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: ui(15),
    fontWeight: "600",
    flexShrink: 1,
  },
  iconBtn: {
    padding: 4,
    borderRadius: 6,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingVertical: 6,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  summaryLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
  },
  summaryLabel: {
    fontSize: ui(14),
    fontWeight: "500",
  },
  summaryRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  summaryValue: {
    fontSize: ui(13),
    flexShrink: 1,
  },
  listSection: {
    paddingHorizontal: 8,
    gap: 2,
  },
  subSection: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: ui(11),
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    gap: 8,
  },
  optionLabel: {
    fontSize: ui(14),
    flex: 1,
  },
  countText: {
    fontSize: ui(12),
  },
});
