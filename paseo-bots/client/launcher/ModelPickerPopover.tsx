/**
 * Purpose: Anchored two-level provider, profile & model picker popover matching Paseo's official UX.
 * Context: Positioned directly above (or below) the model trigger button in BotLauncherCore.
 * Usage: <ModelPickerPopover open={...} anchor={...} colors={colors} ... />
 * Prerequisites: useProviders, useAgentProfiles, measureAnchor, and @getpaseo/plugin/client/react-native Icon.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type LayoutRectangle,
} from "react-native";
import type { useAgentProfiles, useProviders } from "../data";
import { useT } from "../i18n";
import { nativeTokens } from "../native";
import { ui } from "../typography";

export type ProviderEntry = NonNullable<ReturnType<typeof useProviders>["data"]>[number];
export type ProviderModel = NonNullable<ProviderEntry["models"]>[number];
export type AgentProfileEntry = NonNullable<ReturnType<typeof useAgentProfiles>["data"]>[number];

export interface ModelPickerPopoverProps {
  open: boolean;
  anchor: LayoutRectangle | null;
  onClose: () => void;
  colors: PluginTheme["colors"];
  providers: ProviderEntry[];
  profiles: AgentProfileEntry[];
  selectedProvider: string;
  selectedModelId: string | null;
  selectedModeId: string | null;
  selectedThinkingId: string | null;
  onSelect: (provider: ProviderEntry, model: ProviderModel | null) => void;
  onSelectProfile: (profile: AgentProfileEntry) => void;
}

function ProviderIcon({ provider, size = 14, color }: { provider: string; size?: number; color: string }) {
  const p = provider.toLowerCase();
  if (p.includes("claude") || p.includes("anthropic")) {
    return <Icon name="Sun" size={size} color={color} />;
  }
  if (p.includes("pi")) {
    return <Icon name="Layers" size={size} color={color} />;
  }
  if (p.includes("agy") || p.includes("antigravity") || p.includes("acp") || p.includes("google")) {
    return <Icon name="Triangle" size={size} color={color} />;
  }
  return <Icon name="Cpu" size={size} color={color} />;
}

const dom = globalThis as unknown as {
  addEventListener?: (type: "keydown", listener: (e: { key: string; stopPropagation(): void }) => void, capture?: boolean) => void;
  removeEventListener?: (type: "keydown", listener: (e: { key: string; stopPropagation(): void }) => void, capture?: boolean) => void;
};

export function ModelPickerPopover(props: ModelPickerPopoverProps) {
  const {
    open,
    anchor,
    onClose,
    colors,
    providers,
    profiles,
    selectedProvider,
    selectedModelId,
    selectedModeId,
    selectedThinkingId,
    onSelect,
    onSelectProfile,
  } = props;
  const { t } = useT();
  const tokens = nativeTokens(colors);
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  const [drillProviderId, setDrillProviderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) {
      setDrillProviderId(null);
      setQuery("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || Platform.OS !== "web" || !dom.addEventListener) return;
    const onKey = (e: { key: string; stopPropagation(): void }) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (drillProviderId) {
          setDrillProviderId(null);
          setQuery("");
        } else {
          onClose();
        }
      }
    };
    dom.addEventListener("keydown", onKey, true);
    return () => dom.removeEventListener?.("keydown", onKey, true);
  }, [open, drillProviderId, onClose]);

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

  const trimmedQuery = query.trim().toLowerCase();

  const filteredModelsAll = useMemo(() => {
    if (!trimmedQuery) return [];
    const results: { provider: ProviderEntry; model: ProviderModel }[] = [];
    for (const item of normalizedProviders) {
      const pName = (item.provider.label ?? item.provider.provider).toLowerCase();
      for (const m of item.models) {
        if (
          m.label.toLowerCase().includes(trimmedQuery) ||
          m.id.toLowerCase().includes(trimmedQuery) ||
          pName.includes(trimmedQuery)
        ) {
          results.push({ provider: item.provider, model: m });
        }
      }
    }
    return results;
  }, [normalizedProviders, trimmedQuery]);

  const drillFilteredModels = useMemo(() => {
    if (!drillItem) return [];
    if (!trimmedQuery) return drillItem.models;
    return drillItem.models.filter(
      (m) => m.label.toLowerCase().includes(trimmedQuery) || m.id.toLowerCase().includes(trimmedQuery),
    );
  }, [drillItem, trimmedQuery]);

  const isModelSelected = (providerId: string, modelId: string, models: ProviderModel[]) => {
    if (providerId !== selectedProvider) return false;
    if (selectedModelId) return selectedModelId === modelId;
    const defaultModel = models.find((m) => m.isDefault) ?? models[0];
    return defaultModel?.id === modelId;
  };

  const formatProfileSummary = (profile: AgentProfileEntry) => {
    const pEntry = providers.find((p) => p.provider === profile.provider);
    const pLabel = pEntry?.label ?? profile.provider;
    const mEntry = pEntry?.models?.find((m) => m.id === profile.model);
    const mLabel = mEntry?.label ?? profile.model ?? "";
    const modeEntry = pEntry?.modes?.find((m) => m.id === profile.modeId);
    const modeLabel = modeEntry?.label ?? profile.modeId ?? "";
    const thinkEntry = mEntry?.thinkingOptions?.find((opt) => opt.id === profile.thinkingOptionId);
    const thinkLabel = thinkEntry?.label ?? profile.thinkingOptionId ?? "";
    return [pLabel, mLabel, modeLabel, thinkLabel].filter(Boolean).join(" · ");
  };

  if (!open || !anchor) return null;

  const cardWidth = Math.min(310, winWidth - 24);
  const left = Math.max(12, Math.min(anchor.x, winWidth - cardWidth - 12));
  const openAbove = anchor.y > 260;
  const maxCardHeight = openAbove
    ? Math.min(anchor.y - 16, 400)
    : Math.min(winHeight - anchor.y - anchor.height - 16, 400);

  const cardPositionStyle = openAbove
    ? { bottom: winHeight - anchor.y + 6, left, maxHeight: maxCardHeight }
    : { top: anchor.y + anchor.height + 6, left, maxHeight: maxCardHeight };

  return (
    <View
      style={[
        styles.overlay,
        Platform.OS === "web" ? ({ position: "fixed" } as any) : StyleSheet.absoluteFillObject,
      ]}
      pointerEvents="box-none"
    >
      <Pressable
        accessibilityLabel={t("common.closeMenu")}
        onPress={onClose}
        style={StyleSheet.absoluteFillObject}
      />
      <View
        style={[
          styles.card,
          cardPositionStyle,
          {
            width: cardWidth,
            backgroundColor: colors.surface1,
            borderColor: tokens.borderAccent,
            shadowColor: tokens.dark ? "rgba(0, 0, 0, 0.45)" : "rgba(0, 0, 0, 0.12)",
          },
        ]}
      >
        {drillItem ? (
          <View style={[styles.drillHeader, { borderBottomColor: colors.border }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setDrillProviderId(null);
                setQuery("");
              }}
              style={({ pressed, hovered }: any) => [
                styles.backBtn,
                { backgroundColor: pressed || hovered ? colors.surface2 : "transparent" },
              ]}
            >
              <Icon name="ChevronLeft" size={15} color={colors.foregroundMuted} />
              <ProviderIcon provider={drillItem.provider.provider} size={14} color={colors.foreground} />
              <Text numberOfLines={1} style={[styles.drillTitle, { color: colors.foreground }]}>
                {drillItem.provider.label ?? drillItem.provider.provider}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <View style={[styles.searchRow, { borderBottomColor: colors.border }]}>
          <Icon name="Search" size={14} color={colors.foregroundMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={drillItem ? t("launcher.searchModels") : t("launcher.searchAllModels")}
            placeholderTextColor={colors.foregroundMuted}
            autoFocus={Platform.OS === "web"}
            style={[
              styles.searchInput,
              { color: colors.foreground },
              Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
            ]}
          />
          {query ? (
            <Pressable accessibilityRole="button" onPress={() => setQuery("")} hitSlop={8}>
              <Icon name="X" size={13} color={colors.foregroundMuted} />
            </Pressable>
          ) : null}
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {drillItem ? (
            drillFilteredModels.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.foregroundMuted }]}>{t("launcher.noMatchingModels")}</Text>
            ) : (
              drillFilteredModels.map((model) => {
                const selected = isModelSelected(drillItem.provider.provider, model.id, drillItem.models);
                return (
                  <Pressable
                    key={model.id}
                    accessibilityRole="button"
                    onPress={() => {
                      onSelect(drillItem.provider, model);
                      onClose();
                    }}
                    style={({ pressed, hovered }: any) => [
                      styles.row,
                      { backgroundColor: selected || pressed || hovered ? colors.surface2 : "transparent" },
                    ]}
                  >
                    <ProviderIcon provider={drillItem.provider.provider} size={13} color={colors.foregroundMuted} />
                    <Text numberOfLines={1} style={[styles.rowLabel, { color: colors.foreground }]}>
                      {model.label}
                    </Text>
                    <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.foregroundMuted }]}>
                      {model.id}
                    </Text>
                    {selected ? <Icon name="Check" size={14} color={colors.foreground} /> : null}
                  </Pressable>
                );
              })
            )
          ) : trimmedQuery ? (
            filteredModelsAll.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.foregroundMuted }]}>{t("launcher.noMatchingModels")}</Text>
            ) : (
              filteredModelsAll.map(({ provider, model }) => {
                const pModels = (provider.models ?? []).filter((m) => m.isSelectable !== false);
                const selected = isModelSelected(provider.provider, model.id, pModels);
                return (
                  <Pressable
                    key={`${provider.provider}:${model.id}`}
                    accessibilityRole="button"
                    onPress={() => {
                      onSelect(provider, model);
                      onClose();
                    }}
                    style={({ pressed, hovered }: any) => [
                      styles.row,
                      { backgroundColor: selected || pressed || hovered ? colors.surface2 : "transparent" },
                    ]}
                  >
                    <ProviderIcon provider={provider.provider} size={13} color={colors.foregroundMuted} />
                    <Text numberOfLines={1} style={[styles.rowLabel, { color: colors.foreground }]}>
                      {model.label}
                    </Text>
                    <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.foregroundMuted }]}>
                      {`${provider.label ?? provider.provider} · ${model.id}`}
                    </Text>
                    {selected ? <Icon name="Check" size={14} color={colors.foreground} /> : null}
                  </Pressable>
                );
              })
            )
          ) : (
            <>
              {profiles.length > 0 ? (
                <View style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: colors.foregroundMuted }]}>{t("launcher.profilesTitle")}</Text>
                  {profiles.map((profile) => {
                    const isProfileActive =
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
                          onClose();
                        }}
                        style={({ pressed, hovered }: any) => [
                          styles.row,
                          { backgroundColor: isProfileActive || pressed || hovered ? colors.surface2 : "transparent" },
                        ]}
                      >
                        <Icon name="Star" size={13} color={colors.foregroundMuted} />
                        <Text numberOfLines={1} style={[styles.rowLabel, { color: colors.foreground }]}>
                          {profile.name}
                        </Text>
                        <Text numberOfLines={1} style={[styles.rowMeta, { color: colors.foregroundMuted }]}>
                          {formatProfileSummary(profile)}
                        </Text>
                        {isProfileActive ? <Icon name="Check" size={14} color={colors.foreground} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={[styles.providersSection, profiles.length > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
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
                          setQuery("");
                        } else {
                          onSelect(provider, null);
                          onClose();
                        }
                      }}
                      style={({ pressed, hovered }: any) => [
                        styles.row,
                        { backgroundColor: isCurrent || pressed || hovered ? colors.surface2 : "transparent" },
                      ]}
                    >
                      <ProviderIcon provider={provider.provider} size={13} color={isCurrent ? colors.accent : colors.foregroundMuted} />
                      <Text numberOfLines={1} style={[styles.rowLabel, { color: colors.foreground, flex: 1 }]}>
                        {provider.label ?? provider.provider}
                      </Text>
                      <Text style={[styles.providerCount, { color: colors.foregroundMuted }]}>
                        {models.length > 0 ? t("launcher.modelCount", { count: models.length }) : t("common.default")}
                      </Text>
                      {models.length > 0 ? <Icon name="ChevronRight" size={13} color={colors.foregroundMuted} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
  },
  card: {
    position: "absolute",
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 10,
  },
  drillHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
    flex: 1,
    minWidth: 0,
  },
  drillTitle: {
    fontSize: ui(13),
    fontWeight: "600",
    flexShrink: 1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    flex: 1,
    fontSize: ui(13),
    padding: 0,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingVertical: 4,
  },
  section: {
    paddingHorizontal: 6,
    paddingBottom: 4,
    gap: 1,
  },
  providersSection: {
    paddingTop: 6,
    paddingBottom: 4,
    paddingHorizontal: 6,
    gap: 1,
  },
  sectionTitle: {
    fontSize: ui(11),
    fontWeight: "500",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 6,
  },
  rowLabel: {
    fontSize: ui(13),
    fontWeight: "500",
    flexShrink: 0,
  },
  rowMeta: {
    fontSize: ui(12),
    flex: 1,
    minWidth: 0,
  },
  providerCount: {
    fontSize: ui(12),
  },
  emptyText: {
    textAlign: "center",
    paddingVertical: 20,
    fontSize: ui(13),
  },
});
