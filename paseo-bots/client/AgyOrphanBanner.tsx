/**
 * Purpose: Orphaned Antigravity agent warning banner with batch disable/delete actions.
 * Context: Extracted from BotsSurfaceReady to enforce <= 800 line budget.
 * Usage: <AgyOrphanBanner ... />
 * Prerequisites: Paseo client runtime, @getpaseo/plugin.
 */

import type { PluginTheme } from "@getpaseo/plugin";
import { Text, View } from "react-native";
import type { OrphanedAgyAgentEntry } from "../shared/rpc";
import { useT } from "./i18n";
import { nativeTokens } from "./native";
import { Button } from "./panel/controls";

type Colors = PluginTheme["colors"];

export interface AgyOrphanBannerProps {
  colors: Colors;
  orphans: readonly OrphanedAgyAgentEntry[];
  busy: boolean;
  onDisable: () => void;
  onDelete: () => void;
  onDismiss: () => void;
}

export function AgyOrphanBanner({ colors, orphans, busy, onDisable, onDelete, onDismiss }: AgyOrphanBannerProps) {
  const { t } = useT();
  const tokens = nativeTokens(colors);

  if (orphans.length === 0) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.surface1,
        borderBottomWidth: 1,
        borderBottomColor: tokens.borderAccent,
      }}
    >
      <Text style={{ color: colors.foreground, fontSize: 13, flex: 1, minWidth: 180, fontVariant: ["tabular-nums"] }} numberOfLines={2}>
        {t("settings.agyOrphans.surfaceNotice", {
          count: orphans.length,
          files: orphans.map((o) => o.fileName).join(", "),
        })}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Button colors={colors} variant="ghost" label={t("settings.agyOrphans.surfaceDisable")} disabled={busy} onPress={onDisable} />
        <Button colors={colors} variant="outline" label={t("settings.agyOrphans.surfaceDelete")} loading={busy} disabled={busy} onPress={onDelete} />
        <Button colors={colors} variant="ghost" label={t("settings.agyOrphans.surfaceDismiss")} disabled={busy} onPress={onDismiss} />
      </View>
    </View>
  );
}
