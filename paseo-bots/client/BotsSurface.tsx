/**
 * Purpose: Primary surface container and settings lifecycle gate for bots.
 * Context: Runs inside Paseo client workspace runtime.
 * Usage: Contributed via client.addSurface("bots", BotsSurface).
 * Prerequisites: Paseo client runtime, @getpaseo/plugin.
 */

import type { PluginOpenScreenInput, PluginScreenProps, PluginSurfaceProps } from "@getpaseo/plugin/client";
import type { BotScreen } from "./screen-navigation";
import { ActivityIndicator, Text, View } from "react-native";
import { SettingsAction, SettingsCard } from "@getpaseo/plugin/client/ui";
import { AvatarTheme } from "./Avatar";
import { useT } from "./i18n";
import { confirmDialog, nativeTokens } from "./native";
import { MenuProvider } from "./ui/Menu";
import { useTooltipTheme } from "./ui/Tooltip";
import { ui } from "./typography";
import { useBotSettings } from "./useBotSettings";
import { BotsSurfaceReady } from "./BotsSurfaceReady";

interface BotsSurfaceProps extends PluginScreenProps {
  screen?: BotScreen;
  openScreen?(input: PluginOpenScreenInput): void;
}

export function BotsSurface(props: BotsSurfaceProps) {
  const { colors } = props.theme;
  useTooltipTheme(colors);
  return (
    <MenuProvider colors={colors} compact={props.layout.compact}>
      <AvatarTheme dark={nativeTokens(colors).dark}>
        <BotsSurfaceContent {...props} />
      </AvatarTheme>
    </MenuProvider>
  );
}

function BotsSurfaceContent(props: PluginSurfaceProps & Partial<PluginScreenProps>) {
  const { colors } = props.theme;
  const { t } = useT();
  const { settings, latest, commit } = useBotSettings();

  if (settings.status !== "ready") {
    return (
      <View
        style={{
          flex: 1,
          padding: 24,
          gap: 12,
          backgroundColor: colors.surface0,
          justifyContent: settings.status === "loading" ? "center" : "flex-start",
          alignItems: settings.status === "loading" ? "center" : "stretch",
        }}
      >
        {settings.status === "loading" ? (
          <ActivityIndicator size="large" color={colors.foregroundMuted} accessibilityLabel={t("surface.loadingBots")} />
        ) : (
          <Text style={{ fontSize: ui(14), color: colors.statusDanger }}>{t("surface.couldNotReadBots", { error: settings.error })}</Text>
        )}
        {settings.status === "invalid" ? (
          <SettingsCard>
            <SettingsAction label={t("surface.resetBots")} hint={t("surface.resetBotsHint")} actionLabel={t("common.reset")} onPress={() => void confirmDialog({ title: t("surface.resetBots"), message: t("surface.resetBotsHint"), confirmLabel: t("common.reset"), destructive: true }).then((confirmed) => confirmed && settings.reset())} />
          </SettingsCard>
        ) : null}
      </View>
    );
  }

  return <BotsSurfaceReady {...props} settings={settings} latest={latest} commit={commit} />;
}
