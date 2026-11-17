/**
 * Purpose: Core launchpad component for initiating direct and team agent chats.
 * Context: Shared between composer popover pill and BotsSurface main right pane.
 * Usage: <BotLauncherCore theme={theme} host={host} embedded={...} initialBotId={...} />
 * Prerequisites: Paseo client runtime, @getpaseo/plugin, and PaseoApi connection.
 * Budget Justification: 500-800 lines consolidating responsive mobile/desktop layout, file pickers, and session glide.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Avatar, TeamLogo } from "../Avatar";
import { useBotHost, useHostWorkspaces } from "../data";
import { useT } from "../i18n";
import { nativeTokens } from "../native";
import { getGlobalNavigation } from "../navigation";
import { ui } from "../typography";
import { useBotSettings } from "../useBotSettings";
import {
  createHiddenFileInput,
  createTextMeasurer,
  decodeUtf8,
  domNode,
  listenForImagePaste,
  observeWidth,
  pickFileHandles,
  type FileHandle,
  type TextMeasurer,
} from "../web";
import { EMPTY_LIBRARY, primaryGroupForBot } from "../../shared/bot";
import {
  newAttachmentId,
  normalizeMimeType,
  preflightFile,
  toWire,
  type ComposerAttachment,
} from "../../shared/attachments";
import { resolveBotPlacement, startBotChat, type BotPlacement } from "../../shared/chat";
import { ensureBotHomeRpc, mountRpc, systemPromptRpc } from "../../shared/rpc";
import { newUuid } from "../../shared/uuid";
import { AttachmentThumbStrip } from "./AttachmentThumbStrip";
import { launcherStyles as styles } from "./BotLauncherStyles";
import { CompactComposerSheet } from "./CompactComposerSheet";
import { ENGINE_CHOICES, engineLabelKey, toEngine, type EngineChoice } from "./engineChoice";
import { ModelPickerPopover } from "./ModelPickerPopover";
import { ScrollablePills } from "./ScrollablePills";
import { useComposerOptions } from "./useComposerOptions";
import { useVisualViewport } from "./useVisualViewport";

export interface BotLauncherCoreProps {
  theme: PluginTheme;
  host: { id: string; label: string };
  workspaceId?: string | null;
  navigation?: PluginSurfaceProps["navigation"] | null;
  initialBotId?: string | null;
  initialGroupId?: string | null;
  initialMode?: "direct" | "team";
  intentKey?: number;
  onClose?: () => void;
  embedded?: boolean;
}

const MIN_INPUT_HEIGHT = 28;
const COMPACT_MIN_INPUT_HEIGHT = 44;
const MAX_INPUT_HEIGHT = 200;

function clampInputHeight(height: number, minHeight = MIN_INPUT_HEIGHT): number {
  return Math.max(minHeight, Math.min(MAX_INPUT_HEIGHT, Math.ceil(height)));
}

function isImeComposing(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return Boolean(event.isComposing) || event.keyCode === 229;
}

export function BotLauncherCore(props: BotLauncherCoreProps) {
  const { colors } = props.theme;
  const tokens = nativeTokens(colors);
  const { t } = useT();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { width, height } = useWindowDimensions();
  const isCompact = width < 600 || Platform.OS !== "web";
  const embedded = Boolean(props.embedded);
  const baseMinInputHeight = isCompact ? COMPACT_MIN_INPUT_HEIGHT : MIN_INPUT_HEIGHT;
  const placeholderText = t("launcher.promptPlaceholder");

  const { settings } = useBotSettings();
  const bots = useMemo(() => (settings.status === "ready" ? settings.values.bots.filter((b) => !b.archived) : []), [settings]);
  const groups = useMemo(() => (settings.status === "ready" ? settings.values.groups ?? [] : []), [settings]);
  const library = settings.status === "ready" ? settings.values.library ?? EMPTY_LIBRARY : EMPTY_LIBRARY;

  const localHost = useMemo(
    () => ({ id: props.host?.id ?? "local", label: props.host?.label ?? "Local" }),
    [props.host?.id, props.host?.label],
  );
  const localBotHost = useBotHost(null, localHost);
  const hostWorkspaces = useHostWorkspaces(localBotHost);

  const currentWorkspaceDir = useMemo(() => {
    if (!props.workspaceId || !hostWorkspaces.data) return null;
    return hostWorkspaces.data.find((w) => w.id === props.workspaceId)?.directory ?? null;
  }, [props.workspaceId, hostWorkspaces.data]);

  const defaultBotId = useMemo(() => {
    if (!bots.length) return "";
    const order = settings.status === "ready" ? settings.values.ui?.chatOrder ?? {} : {};
    for (const bot of bots) {
      if (order[bot.id]?.length) return bot.id;
    }
    return bots[0]?.id ?? "";
  }, [bots, settings]);

  const [selectedBotId, setSelectedBotId] = useState<string>(() => props.initialBotId ?? defaultBotId);
  const prevInitialBotRef = useRef({
    initialBotId: props.initialBotId,
    intentKey: props.intentKey,
  });

  useEffect(() => {
    const prev = prevInitialBotRef.current;
    if (prev.initialBotId === props.initialBotId && prev.intentKey === props.intentKey) {
      return;
    }
    prevInitialBotRef.current = { initialBotId: props.initialBotId, intentKey: props.intentKey };
    if (props.initialBotId && (bots.length === 0 || bots.some((b) => b.id === props.initialBotId))) {
      setSelectedBotId(props.initialBotId);
    }
  }, [props.initialBotId, props.intentKey, bots]);

  useEffect(() => {
    if (bots.length === 0) return;
    if (!selectedBotId || !bots.some((b) => b.id === selectedBotId)) {
      if (props.initialBotId && bots.some((b) => b.id === props.initialBotId)) {
        setSelectedBotId(props.initialBotId);
      } else if (defaultBotId) {
        setSelectedBotId(defaultBotId);
      }
    }
  }, [bots, selectedBotId, defaultBotId, props.initialBotId]);

  const userPickedModeRef = useRef(Boolean(props.initialMode));
  const [chatMode, setChatMode] = useState<"direct" | "team">(() =>
    props.initialMode ?? (groups.length > 0 ? "team" : "direct"),
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    () => props.initialGroupId ?? groups[0]?.id ?? "",
  );
  const prevInitialGroupRef = useRef({
    initialGroupId: props.initialGroupId,
    intentKey: props.intentKey,
  });

  useEffect(() => {
    if (props.initialMode) {
      userPickedModeRef.current = true;
      setChatMode(props.initialMode);
    }
  }, [props.initialMode, props.intentKey]);

  useEffect(() => {
    const prev = prevInitialGroupRef.current;
    if (prev.initialGroupId === props.initialGroupId && prev.intentKey === props.intentKey) {
      return;
    }
    prevInitialGroupRef.current = { initialGroupId: props.initialGroupId, intentKey: props.intentKey };
    if (props.initialGroupId && (groups.length === 0 || groups.some((g) => g.id === props.initialGroupId))) {
      setSelectedGroupId(props.initialGroupId);
    }
  }, [props.initialGroupId, props.intentKey, groups]);

  useEffect(() => {
    if (groups.length > 0 && (!selectedGroupId || !groups.some((g) => g.id === selectedGroupId))) {
      if (props.initialGroupId && groups.some((g) => g.id === props.initialGroupId)) {
        setSelectedGroupId(props.initialGroupId);
      } else {
        setSelectedGroupId(groups[0].id);
      }
    }
    if (!userPickedModeRef.current && groups.length > 0 && chatMode !== "team") {
      setChatMode("team");
    }
  }, [groups, selectedGroupId, chatMode, props.initialGroupId]);

  const selectChatMode = useCallback((mode: "direct" | "team") => {
    userPickedModeRef.current = true;
    setChatMode(mode);
  }, []);
  const [promptText, setPromptText] = useState("");
  const promptTextRef = useRef(promptText);
  promptTextRef.current = promptText;
  const [inputHeight, setInputHeight] = useState(baseMinInputHeight);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { keyboardHeight } = useVisualViewport();
  const mainScrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const inputWrapperRef = useRef<View>(null);
  const measurerRef = useRef<TextMeasurer | null>(null);

  const syncWebInputHeight = useCallback(
    (text: string) => {
      if (Platform.OS !== "web") return;
      const sample = text || placeholderText;
      const node = domNode(inputRef.current);
      const measured = measurerRef.current?.measure(node, sample);
      if (typeof measured === "number" && measured > 0) {
        setInputHeight(clampInputHeight(measured, baseMinInputHeight));
        return;
      }
      if (!text) {
        setInputHeight(baseMinInputHeight);
        return;
      }
      const scrollHeight = (node as { scrollHeight?: number } | null)?.scrollHeight;
      if (typeof scrollHeight === "number" && scrollHeight > 0) {
        setInputHeight(clampInputHeight(scrollHeight, baseMinInputHeight));
      }
    },
    [baseMinInputHeight, placeholderText],
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const measurer = createTextMeasurer();
    measurerRef.current = measurer;
    syncWebInputHeight(promptTextRef.current);
    const stopObserve = observeWidth(domNode(inputRef.current), () => {
      syncWebInputHeight(promptTextRef.current);
    });
    return () => {
      stopObserve();
      measurer?.dispose();
      measurerRef.current = null;
    };
  }, [syncWebInputHeight]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      if (!promptText) setInputHeight(baseMinInputHeight);
      return;
    }
    syncWebInputHeight(promptText);
  }, [baseMinInputHeight, promptText, syncWebInputHeight]);

  const onFocusInput = useCallback(() => {
    if (isCompact && !embedded) {
      setTimeout(() => {
        const node = domNode(inputWrapperRef.current);
        if (node && typeof (node as any).scrollIntoView === "function") {
          (node as any).scrollIntoView({ behavior: "smooth", block: "center" });
        }
        mainScrollRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [isCompact, embedded]);

  useEffect(() => {
    if (isCompact && keyboardHeight > 0 && !embedded) {
      const timer = setTimeout(() => {
        mainScrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isCompact, keyboardHeight, embedded]);

  useEffect(() => {
    if (isCompact && embedded && !props.onClose) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [embedded, isCompact, props.onClose]);

  const activeBot = useMemo(() => {
    if (chatMode === "team") {
      const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0];
      if (activeGroup?.leadId) {
        const lead = bots.find((b) => b.id === activeGroup.leadId);
        if (lead) return lead;
      }
    }
    return bots.find((b) => b.id === selectedBotId) ?? bots[0];
  }, [bots, chatMode, selectedBotId, selectedGroupId, groups]);

  const host = useBotHost(activeBot?.hostId ?? null, localHost);
  const ensureHome = useRpc(ensureBotHomeRpc);
  const compose = useRpc(systemPromptRpc);
  const mountServers = useRpc(mountRpc);
  const [isRecording, setIsRecording] = useState(false);
  const [compactSheetOpen, setCompactSheetOpen] = useState(false);
  const [engineChoice, setEngineChoice] = useState<EngineChoice>("default");

  const {
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
  } = useComposerOptions({ activeBot, host });

  const handleVoiceToggle = useCallback(() => {
    if (Platform.OS !== "web") return;
    const g = globalThis as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    };
    const Recognition = g.SpeechRecognition ?? g.webkitSpeechRecognition;
    if (!Recognition) {
      toast.show(t("launcher.voiceUnavailable"));
      return;
    }
    if (isRecording) return;
    try {
      const rec = new Recognition();
      rec.lang = "zh-CN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      setIsRecording(true);
      rec.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setPromptText((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      rec.onerror = () => setIsRecording(false);
      rec.onend = () => setIsRecording(false);
      rec.start();
    } catch {
      setIsRecording(false);
    }
  }, [isRecording, toast, t]);

  const hiddenPickerRef = useRef<{ click(): void; destroy(): void } | null>(null);

  const processFileHandles = useCallback(
    async (handles: FileHandle[]) => {
      for (const handle of handles) {
        const { kind, reason } = preflightFile(handle.name, handle.mimeType, handle.size, true);
        if (reason) {
          toast.error(reason);
          continue;
        }

        try {
          if (kind === "image") {
            const base64 = await handle.readBase64();
            setAttachments((prev) => [
              ...prev,
              {
                kind: "image",
                id: newAttachmentId(),
                name: handle.name,
                mimeType: normalizeMimeType(handle.mimeType),
                size: handle.size,
                data: base64,
              },
            ]);
          } else if (kind === "text") {
            const base64 = await handle.readBase64();
            const text = decodeUtf8(base64);
            setAttachments((prev) => [
              ...prev,
              {
                kind: "text",
                id: newAttachmentId(),
                name: handle.name,
                size: handle.size,
                text,
              },
            ]);
          } else {
            toast.error(t("launcher.fileTooLarge"));
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(msg);
        }
      }
    },
    [t, toast],
  );

  useEffect(() => {
    const picker = createHiddenFileInput({
      accept: "image/*,text/*,.txt,.md,.json,.js,.ts,.py,.csv,*",
      multiple: true,
      onFiles: (handles) => {
        void processFileHandles(handles);
      },
    });
    hiddenPickerRef.current = picker;
    return () => {
      picker.destroy();
      hiddenPickerRef.current = null;
    };
  }, [processFileHandles]);

  const handlePickFiles = useCallback(() => {
    if (hiddenPickerRef.current) {
      hiddenPickerRef.current.click();
    } else {
      void pickFileHandles({
        multiple: true,
        accept: "image/*,text/*,.txt,.md,.json,.js,.ts,.py,.csv,*",
      }).then(processFileHandles);
    }
  }, [processFileHandles]);

  useEffect(() => {
    const node = domNode(inputWrapperRef.current);
    if (!node) return;

    return listenForImagePaste(node, (handles) => {
      void processFileHandles(handles);
    });
  }, [processFileHandles]);

  const handleRemoveAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleLaunch = useCallback(async () => {
    if (isSubmitting) return;
    const rawTrimmed = promptText.trim();
    if (!rawTrimmed && attachments.length === 0) return;
    if (!activeBot) {
      setError(t("launcher.noBotsAvailable"));
      return;
    }
    if (!host.api) {
      setError(t("surface.hostIsOffline", { label: host.label }));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const group = chatMode === "team" ? (groups.find((g) => g.id === selectedGroupId) ?? primaryGroupForBot(activeBot.id, groups)) : null;
      const home = await ensureHome({
        botId: activeBot.id,
        ...(group ? { groupId: group.id, groupName: group.name } : {}),
      });

      let placement: BotPlacement;
      let effectiveWorkspaceDir = currentWorkspaceDir;
      if (props.workspaceId && !effectiveWorkspaceDir && host.api) {
        try {
          const list = await host.api.workspaces.list();
          const found = list.entries.find((w) => w.id === props.workspaceId);
          if (found) {
            effectiveWorkspaceDir = found.workspaceDirectory ?? found.projectRootPath;
          }
        } catch {
          // ignore error and fallback
        }
      }

      if (props.workspaceId && effectiveWorkspaceDir) {
        placement = { path: effectiveWorkspaceDir, projectRoot: null };
      } else {
        placement = resolveBotPlacement(activeBot, group, home);
      }

      const defaultPrompt = attachments.some((a) => a.kind === "image")
        ? t("launcher.defaultImagePrompt")
        : t("launcher.defaultAttachmentPrompt");
      const basePrompt = rawTrimmed || defaultPrompt;

      let effectivePrompt = basePrompt;
      const textAttachments = attachments.filter((a): a is Extract<ComposerAttachment, { kind: "text" }> => a.kind === "text");
      if (textAttachments.length > 0) {
        const textPayload = textAttachments
          .map((att) => `\n\n--- [Attachment: ${att.name}] ---\n${att.text}\n--- [End of ${att.name}] ---`)
          .join("");
        effectivePrompt = `${basePrompt}${textPayload}`;
      }

      const effectiveBot = {
        ...activeBot,
        provider: selectedProvider || activeBot.provider,
        model: selectedModelId,
        thinkingOptionId: selectedThinkingId,
        modeId: selectedModeId,
      };

      const { systemPrompt } = await compose({
        bot: effectiveBot,
        local: host.isLocal,
        message: effectivePrompt,
      });

      const agentId = newUuid();
      const plugin = host.isLocal ? await mountServers({ botId: activeBot.id, agentId }) : {};

      const { images, attachments: wireAttachments } = toWire(attachments);
      const engine = toEngine(engineChoice);

      const newAgentId = await startBotChat(host.api, {
        bot: effectiveBot,
        library,
        ...(host.isLocal ? { agentId } : {}),
        plugin,
        placement,
        prompt: effectivePrompt,
        systemPrompt,
        ...(engine ? { engine } : {}),
        ...(images.length ? { images } : {}),
        ...(wireAttachments.length ? { attachments: wireAttachments } : {}),
      });

      await queryClient.invalidateQueries({
        queryKey: ["paseo-bots", "chats", host.key, activeBot.id],
      });

      setPromptText("");
      setInputHeight(baseMinInputHeight);
      setAttachments([]);
      setIsSubmitting(false);
      props.onClose?.();

      const openAgent = props.navigation?.openAgent ?? getGlobalNavigation()?.openAgent;
      if (openAgent) {
        openAgent({ agentId: newAgentId, serverId: host.key });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setIsSubmitting(false);
      toast.error(msg);
    }
  }, [
    isSubmitting,
    promptText,
    attachments,
    activeBot,
    selectedProvider,
    selectedModelId,
    selectedThinkingId,
    selectedModeId,
    engineChoice,
    host,
    chatMode,
    groups,
    selectedGroupId,
    ensureHome,
    currentWorkspaceDir,
    compose,
    mountServers,
    library,
    queryClient,
    props,
    t,
    toast,
  ]);

  const onKeyPress = (event: { nativeEvent: unknown; preventDefault?: () => void }) => {
    const key = event.nativeEvent as { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number };
    if (isImeComposing(key)) return;

    if (key.key === "Escape" && props.onClose) {
      event.preventDefault?.();
      props.onClose();
      return;
    }

    if (key.key === "Enter" && !key.shiftKey) {
      event.preventDefault?.();
      void handleLaunch();
    }
  };

  const hasBots = bots.length > 0;
  const hasTeams = groups.length > 0;
  const hasContent = promptText.trim().length > 0 || attachments.length > 0;
  const canSubmit = hasBots && hasContent && !isSubmitting;
  const activeGroup = useMemo(
    () => (chatMode === "team" ? (groups.find((g) => g.id === selectedGroupId) ?? groups[0] ?? null) : null),
    [chatMode, groups, selectedGroupId],
  );
  const modeToggle = (
    <View style={[styles.segmentedControl, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        disabled={!hasTeams}
        onPress={() => selectChatMode("team")}
        style={[styles.segmentBtn, chatMode === "team" && { backgroundColor: colors.surface1 }, !hasTeams && { opacity: 0.4 }]}
      >
        <Icon name="Users" size={12} color={chatMode === "team" ? colors.foreground : colors.foregroundMuted} />
        <Text style={[styles.segmentText, { color: chatMode === "team" ? colors.foreground : colors.foregroundMuted }]}>
          {t("launcher.teamMode")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => selectChatMode("direct")}
        style={[styles.segmentBtn, chatMode === "direct" && { backgroundColor: colors.surface1 }]}
      >
        <Icon name="MessageSquare" size={12} color={chatMode === "direct" ? colors.foreground : colors.foregroundMuted} />
        <Text style={[styles.segmentText, { color: chatMode === "direct" ? colors.foreground : colors.foregroundMuted }]}>
          {t("launcher.directMode")}
        </Text>
      </Pressable>
    </View>
  );

  const containerStyle = useMemo(() => {
    if (embedded) {
      return [styles.embeddedContainer, { backgroundColor: colors.surface0 }];
    }
    if (!isCompact) {
      return [
        styles.container,
        {
          width: 440,
          maxHeight: Math.min(height * 0.88, 640),
          borderColor: colors.border,
          borderWidth: 1,
          backgroundColor: colors.surface1,
        },
      ];
    }
    const mobileHeight = Platform.OS === "web" ? "88vh" : Math.round(height * 0.88);
    const mobileMinHeight = Platform.OS === "web" ? "75vh" : Math.round(height * 0.75);
    const mobileMaxHeight = Platform.OS === "web" ? "92vh" : Math.round(height * 0.92);

    return [
      styles.container,
      {
        width: "100%" as const,
        height: mobileHeight as any,
        minHeight: mobileMinHeight as any,
        maxHeight: mobileMaxHeight as any,
        borderColor: "transparent",
        borderWidth: 0,
        backgroundColor: colors.surface1,
        paddingBottom: keyboardHeight > 0 ? keyboardHeight : (Platform.OS === "web" ? "env(safe-area-inset-bottom, 12px)" : 12) as any,
      },
    ];
  }, [colors.border, colors.surface0, colors.surface1, embedded, height, isCompact, keyboardHeight]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : Platform.OS === "android" ? "height" : undefined}
      style={containerStyle}
    >
      <ScrollView
        ref={mainScrollRef}
        style={styles.mainScroll}
        contentContainerStyle={[
          styles.mainScrollContent,
          isCompact && styles.mainScrollContentCompact,
          embedded && styles.mainScrollContentEmbedded,
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Icon name="Bot" size={16} color={colors.accent} />
            <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.title, { color: colors.foreground }]}>
              {embedded && (activeGroup || activeBot)
                ? t("sidebar.newChatWithBot", { name: activeGroup?.name ?? activeBot!.name })
                : t("launcher.title")}
            </Text>
          </View>
          {embedded || props.onClose ? (
            <View style={styles.headerRight}>
              {embedded ? modeToggle : null}
              {props.onClose ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("common.close")}
                  onPress={props.onClose}
                  hitSlop={8}
                  style={({ pressed }) => [styles.closeButton, { opacity: pressed ? 0.7 : 1 }]}
                >
                  <Icon name="X" size={16} color={colors.foregroundMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>

        {!embedded ? <View style={styles.controlsRow}>{modeToggle}</View> : null}

        <View style={styles.selectorSection}>
          <ScrollablePills colors={colors}>
            {chatMode === "direct"
              ? bots.map((b) => {
                  const isSelected = b.id === (activeBot?.id ?? selectedBotId);
                  return (
                    <Pressable
                      key={b.id}
                      accessibilityRole="button"
                      onPress={() => setSelectedBotId(b.id)}
                      style={[
                        styles.pillItem,
                        {
                          borderColor: isSelected ? colors.accent : colors.border,
                          backgroundColor: isSelected ? colors.surface2 : colors.surface1,
                        },
                        Platform.OS === "web" ? ({ touchAction: "pan-x" } as any) : null,
                      ]}
                    >
                      <Avatar avatar={b.avatar} size={18} dark={tokens.dark} />
                      <Text
                        numberOfLines={1}
                        style={[styles.pillText, { color: isSelected ? colors.foreground : colors.foregroundMuted }]}
                      >
                        {b.name}
                      </Text>
                    </Pressable>
                  );
                })
              : groups.map((g) => {
                  const isSelected = g.id === selectedGroupId;
                  return (
                    <Pressable
                      key={g.id}
                      accessibilityRole="button"
                      onPress={() => setSelectedGroupId(g.id)}
                      style={[
                        styles.pillItem,
                        {
                          borderColor: isSelected ? colors.accent : colors.border,
                          backgroundColor: isSelected ? colors.surface2 : colors.surface1,
                        },
                        Platform.OS === "web" ? ({ touchAction: "pan-x" } as any) : null,
                      ]}
                    >
                      <TeamLogo group={g} size={18} dark={tokens.dark} />
                      <Text
                        numberOfLines={1}
                        style={[styles.pillText, { color: isSelected ? colors.foreground : colors.foregroundMuted }]}
                      >
                        {g.name}
                      </Text>
                    </Pressable>
                  );
                })}
          </ScrollablePills>
        </View>

        <View style={styles.engineRow}>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={t("launcher.engineLabel")}
            style={[styles.segmentedControl, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          >
            {ENGINE_CHOICES.map((choice) => {
              const isSelected = choice === engineChoice;
              return (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setEngineChoice(choice)}
                  style={[styles.segmentBtn, isSelected && { backgroundColor: colors.surface1 }]}
                >
                  <Text
                    style={[styles.segmentText, { color: isSelected ? colors.foreground : colors.foregroundMuted }]}
                  >
                    {t(engineLabelKey(choice))}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text numberOfLines={2} style={[styles.engineHint, { color: colors.foregroundMuted }]}>
            {t("launcher.engineHint")}
          </Text>
        </View>

        <View
          ref={inputWrapperRef}
          style={[styles.composerBox, { borderColor: colors.border, backgroundColor: colors.surface1 }]}
        >
          {attachments.length > 0 ? (
            <AttachmentThumbStrip
              attachments={attachments}
              colors={colors}
              onRemove={handleRemoveAttachment}
            />
          ) : null}

          <TextInput
            ref={inputRef}
            multiline
            placeholder={placeholderText}
            placeholderTextColor={colors.foregroundMuted}
            value={promptText}
            onChangeText={setPromptText}
            onContentSizeChange={(e) => {
              if (Platform.OS === "web") return;
              const nextHeight = e.nativeEvent.contentSize?.height;
              if (typeof nextHeight === "number" && nextHeight > 0) {
                setInputHeight(clampInputHeight(nextHeight, baseMinInputHeight));
              }
            }}
            onKeyPress={onKeyPress}
            onFocus={onFocusInput}
            editable={!isSubmitting}
            style={[
              styles.textInput,
              { color: colors.foreground, fontSize: ui(14), minHeight: baseMinInputHeight, height: inputHeight },
              Platform.OS === "web"
                ? ({ outlineStyle: "none", overflowY: inputHeight >= MAX_INPUT_HEIGHT ? "auto" : "hidden" } as object)
                : null,
            ]}
          />

          <View style={styles.composerToolbar}>
            <View style={styles.toolbarLeft}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("launcher.addAttachment")}
                onPress={handlePickFiles}
                style={({ pressed, hovered }: any) => [
                  styles.iconPlusBtn,
                  { backgroundColor: pressed || hovered ? colors.surface2 : "transparent" },
                ]}
              >
                <Icon name="Plus" size={16} color={colors.foregroundMuted} />
                {attachments.length > 0 ? (
                  <View style={[styles.attachBadge, { backgroundColor: colors.accent, position: "absolute", top: -2, right: -4 }]}>
                    <Text style={[styles.attachBadgeText, { color: colors.accentForeground ?? "#fff" }]}>
                      {attachments.length}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              {isCompact ? (
                selectableModels.length > 0 || allProviders.length > 0 || thinkingOptions.length > 0 || modeOptions.length > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setCompactSheetOpen(true)}
                    style={({ pressed, hovered }: any) => [
                      styles.selectorTrigger,
                      { backgroundColor: pressed || hovered ? colors.surface2 : "transparent" },
                    ]}
                  >
                    <Icon name="Sparkles" size={13} color={colors.foregroundMuted} />
                    <Text numberOfLines={1} style={[styles.selectorTriggerText, { color: colors.foreground }]}>
                      {currentModel?.label ?? selectedModelId ?? t("common.default")}
                    </Text>
                  </Pressable>
                ) : null
              ) : (
                <>
                  {selectableModels.length > 0 || allProviders.length > 0 ? (
                    <View ref={modelTriggerRef} collapsable={false}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void openModelMenu()}
                        style={({ pressed, hovered }: any) => [
                          styles.selectorTrigger,
                          { backgroundColor: pressed || hovered ? colors.surface2 : "transparent" },
                        ]}
                      >
                        <Icon name="Sparkles" size={13} color={colors.foregroundMuted} />
                        <Text numberOfLines={1} style={[styles.selectorTriggerText, { color: colors.foreground }]}>
                          {currentModel?.label ?? selectedModelId ?? t("common.default")}
                        </Text>
                        <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
                      </Pressable>
                    </View>
                  ) : null}

                  {thinkingOptions.length > 0 ? (
                    <View ref={thinkingTriggerRef} collapsable={false}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void openThinkingMenu()}
                        style={({ pressed, hovered }: any) => [
                          styles.selectorTrigger,
                          { backgroundColor: pressed || hovered ? colors.surface2 : "transparent" },
                        ]}
                      >
                        <Icon name="Brain" size={13} color={colors.foregroundMuted} />
                        <Text numberOfLines={1} style={[styles.selectorTriggerText, { color: colors.foreground }]}>
                          {currentThinking?.label ?? t("common.default")}
                        </Text>
                        <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
                      </Pressable>
                    </View>
                  ) : null}

                  {modeOptions.length > 0 ? (
                    <View ref={modeTriggerRef} collapsable={false}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => void openModeMenu()}
                        style={({ pressed, hovered }: any) => [
                          styles.selectorTrigger,
                          { backgroundColor: pressed || hovered ? colors.surface2 : "transparent" },
                        ]}
                      >
                        <Icon name="Shield" size={13} color={colors.foregroundMuted} />
                        <Text numberOfLines={1} style={[styles.selectorTriggerText, { color: colors.foreground }]}>
                          {currentMode?.label ?? t("common.default")}
                        </Text>
                        <Icon name="ChevronDown" size={12} color={colors.foregroundMuted} />
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </View>

            <View style={styles.toolbarRight}>
              {Platform.OS === "web" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("launcher.voiceInput")}
                  onPress={handleVoiceToggle}
                  style={({ pressed, hovered }: any) => [
                    styles.micBtn,
                    { backgroundColor: isRecording ? colors.surface2 : pressed || hovered ? colors.surface2 : "transparent" },
                  ]}
                >
                  <Icon name="Mic" size={15} color={isRecording ? colors.accent : colors.foregroundMuted} />
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("launcher.launchButton")}
                disabled={!canSubmit}
                onPress={() => void handleLaunch()}
                style={({ pressed }) => [
                  styles.roundSendBtn,
                  {
                    backgroundColor: canSubmit ? "#15803d" : colors.surface2,
                    opacity: canSubmit ? (pressed ? 0.85 : 1) : 0.6,
                  },
                ]}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Icon name="CornerDownLeft" size={15} color={canSubmit ? "#ffffff" : colors.foregroundMuted} />
                )}
              </Pressable>
            </View>
          </View>
        </View>

        {error ? (
          <View style={styles.errorRow}>
            <Icon name="AlertCircle" size={12} color={colors.statusDanger} />
            <Text style={[styles.errorText, { color: colors.statusDanger }]}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      <ModelPickerPopover
        open={!isCompact && modelPickerOpen}
        anchor={modelPickerAnchor}
        onClose={() => setModelPickerOpen(false)}
        colors={colors}
        providers={allProviders}
        profiles={allProfiles}
        selectedProvider={selectedProvider}
        selectedModelId={selectedModelId}
        selectedModeId={selectedModeId}
        selectedThinkingId={selectedThinkingId}
        onSelect={selectProviderAndModel}
        onSelectProfile={selectProfile}
      />

      <CompactComposerSheet
        open={isCompact && compactSheetOpen}
        onClose={() => setCompactSheetOpen(false)}
        colors={colors}
        providers={allProviders}
        profiles={allProfiles}
        selectedProvider={selectedProvider}
        selectedModelId={selectedModelId}
        currentModelLabel={currentModel?.label ?? selectedModelId ?? t("common.default")}
        thinkingOptions={thinkingOptions}
        selectedThinkingId={selectedThinkingId}
        currentThinkingLabel={currentThinking?.label ?? t("common.default")}
        modeOptions={modeOptions}
        selectedModeId={selectedModeId}
        currentModeLabel={currentMode?.label ?? t("common.default")}
        onSelectModel={selectProviderAndModel}
        onSelectProfile={selectProfile}
        onSelectThinking={setSelectedThinkingId}
        onSelectMode={setSelectedModeId}
      />
    </KeyboardAvoidingView>
  );
}
