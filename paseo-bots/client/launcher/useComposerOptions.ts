/**
 * Purpose: Manages provider, model, profile, thinking level, and permission mode selection state and menus for BotLauncherCore.
 * Context: Extracted from BotLauncherCore to stay within the <= 800 line module budget.
 * Usage: const opts = useComposerOptions({ activeBot, host });
 * Prerequisites: useProviders, useAgentProfiles, useMenu, measureAnchor, and i18n.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LayoutRectangle, View } from "react-native";
import type { Bot } from "../../shared/bot";
import { useAgentProfiles, useProviders, type BotHost } from "../data";
import { useT } from "../i18n";
import { measureAnchor, useMenu } from "../ui/Menu";
import type { AgentProfileEntry, ProviderEntry, ProviderModel } from "./ModelPickerPopover";

export function useComposerOptions(params: { activeBot: Bot | undefined; host: BotHost }) {
  const { activeBot, host } = params;
  const { t } = useT();
  const menu = useMenu();
  const providers = useProviders(host);
  const profilesQuery = useAgentProfiles(host);

  const [selectedProvider, setSelectedProvider] = useState<string>(activeBot?.provider ?? "");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(activeBot?.model ?? null);
  const [selectedThinkingId, setSelectedThinkingId] = useState<string | null>(activeBot?.thinkingOptionId ?? null);
  const [selectedModeId, setSelectedModeId] = useState<string | null>(activeBot?.modeId ?? null);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelPickerAnchor, setModelPickerAnchor] = useState<LayoutRectangle | null>(null);

  const modelTriggerRef = useRef<View>(null);
  const thinkingTriggerRef = useRef<View>(null);
  const modeTriggerRef = useRef<View>(null);

  useEffect(() => {
    setSelectedProvider(activeBot?.provider ?? "");
    setSelectedModelId(activeBot?.model ?? null);
    setSelectedThinkingId(activeBot?.thinkingOptionId ?? null);
    setSelectedModeId(activeBot?.modeId ?? null);
  }, [activeBot?.id, activeBot?.provider, activeBot?.model, activeBot?.thinkingOptionId, activeBot?.modeId]);

  const allProviders = useMemo(() => providers.data ?? [], [providers.data]);
  const allProfiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);

  const currentProvider = useMemo(
    () => allProviders.find((p) => p.provider === selectedProvider),
    [allProviders, selectedProvider],
  );
  const selectableModels = useMemo(
    () => (currentProvider?.models ?? []).filter((m) => m.isSelectable !== false),
    [currentProvider],
  );
  const currentModel = useMemo(
    () => selectableModels.find((m) => m.id === selectedModelId) ?? selectableModels.find((m) => m.isDefault) ?? selectableModels[0],
    [selectableModels, selectedModelId],
  );
  const thinkingOptions = useMemo(() => currentModel?.thinkingOptions ?? [], [currentModel]);
  const currentThinking = useMemo(
    () => thinkingOptions.find((opt) => opt.id === selectedThinkingId) ?? thinkingOptions[0],
    [thinkingOptions, selectedThinkingId],
  );
  const modeOptions = useMemo(() => currentProvider?.modes ?? [], [currentProvider]);
  const currentMode = useMemo(
    () => modeOptions.find((m) => m.id === (selectedModeId ?? currentProvider?.defaultModeId)) ?? modeOptions[0],
    [modeOptions, selectedModeId, currentProvider?.defaultModeId],
  );

  const selectProviderAndModel = useCallback(
    (provider: ProviderEntry, model: ProviderModel | null) => {
      if (provider.provider !== selectedProvider) {
        setSelectedProvider(provider.provider);
        setSelectedModeId(provider.defaultModeId ?? null);
      }
      setSelectedModelId(model?.id ?? null);
      const nextOpts = model?.thinkingOptions ?? [];
      if (!nextOpts.some((opt) => opt.id === selectedThinkingId)) {
        setSelectedThinkingId(null);
      }
    },
    [selectedProvider, selectedThinkingId],
  );

  const selectProfile = useCallback((profile: AgentProfileEntry) => {
    setSelectedProvider(profile.provider);
    setSelectedModelId(profile.model ?? null);
    setSelectedModeId(profile.modeId ?? null);
    setSelectedThinkingId(profile.thinkingOptionId ?? null);
  }, []);

  const openModelMenu = useCallback(async () => {
    if (!allProviders.length && !allProfiles.length) return;
    const anchor = await measureAnchor(modelTriggerRef);
    if (!anchor) return;
    setModelPickerAnchor(anchor);
    setModelPickerOpen(true);
  }, [allProviders.length, allProfiles.length]);

  const openThinkingMenu = useCallback(async () => {
    if (!thinkingOptions.length) return;
    const anchor = await measureAnchor(thinkingTriggerRef);
    if (!anchor) return;
    menu.open({
      anchor,
      align: "start",
      width: 200,
      title: t("panel.rowThinking"),
      entries: thinkingOptions.map((opt) => ({
        label: opt.label,
        selected: (selectedThinkingId ?? currentThinking?.id) === opt.id,
        onSelect: () => setSelectedThinkingId(opt.id),
      })),
    });
  }, [thinkingOptions, menu, t, selectedThinkingId, currentThinking?.id]);

  const openModeMenu = useCallback(async () => {
    if (!modeOptions.length) return;
    const anchor = await measureAnchor(modeTriggerRef);
    if (!anchor) return;
    menu.open({
      anchor,
      align: "start",
      width: 220,
      title: t("panel.rowMode"),
      entries: modeOptions.map((m) => ({
        label: m.label,
        selected: (selectedModeId ?? currentProvider?.defaultModeId) === m.id,
        onSelect: () => setSelectedModeId(m.id),
      })),
    });
  }, [modeOptions, menu, t, selectedModeId, currentProvider?.defaultModeId]);

  return {
    selectedProvider,
    selectedModelId,
    selectedThinkingId,
    selectedModeId,
    allProviders,
    allProfiles,
    selectableModels,
    currentModel,
    thinkingOptions,
    currentThinking,
    modeOptions,
    currentMode,
    modelTriggerRef,
    thinkingTriggerRef,
    modeTriggerRef,
    openModelMenu,
    openThinkingMenu,
    openModeMenu,
    modelPickerOpen,
    modelPickerAnchor,
    setModelPickerOpen,
    setSelectedThinkingId,
    setSelectedModeId,
    selectProviderAndModel,
    selectProfile,
  };
}
