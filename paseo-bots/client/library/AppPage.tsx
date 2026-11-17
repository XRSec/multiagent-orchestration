import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, useToast } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { View } from "react-native";
import { accountLabel, type AppAccount, type AppCard } from "../../shared/apps";
import type { Bot } from "../../shared/bot";
import { appsDisconnectRpc, appsRenameRpc } from "../../shared/rpc";
import { RenameDialog } from "../BotDialogs";
import { useT } from "../i18n";
import { confirmDialog, errorText } from "../native";
import { Button } from "../panel/controls";
import { useAppsInvalidate } from "./apps";
import { BotsCard, PageTitle } from "./parts";

type Colors = PluginTheme["colors"];

type AppPageProps = {
  colors: Colors;
  app: AppCard;
  accounts: AppAccount[];
  bots: Bot[];
  showTitle?: boolean;
  onToggleBot: (bot: Bot, on: boolean) => void;
  onDisconnected: () => void;
  onConnect: (alias?: string) => void;
};

/** One connected app: its accounts (named to tell them apart) and which bots may use it. */
export function AppPage({ colors, app, accounts, bots, showTitle, onToggleBot, onDisconnected, onConnect }: AppPageProps) {
  const { t } = useT();
  const statusText: Record<AppAccount["status"], string> = {
    connected: t("library.appStatusConnected"),
    pending: t("library.appStatusPending"),
    failed: t("library.appStatusFailed"),
  };
  const disconnect = useRpc(appsDisconnectRpc);
  const rename = useRpc(appsRenameRpc);
  const invalidate = useAppsInvalidate();
  const toast = useToast();
  const [naming, setNaming] = useState<AppAccount | "new" | null>(null);

  const remove = async (account: AppAccount) => {
    const confirmed = await confirmDialog({
      title: t("library.disconnectAppTitle", { name: app.name }),
      message: t("library.disconnectAppMessage"),
      confirmLabel: t("library.disconnect"),
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await disconnect({ accountId: account.id });
      await invalidate();
      if (accounts.length === 1) onDisconnected();
    } catch (error) {
      toast.error(t("library.couldNotDisconnect", { error: errorText(error) }));
    }
  };

  return (
    <>
      {showTitle ? <PageTitle colors={colors} title={app.name} /> : null}
      <SettingsSection title={t("library.accountsSection")} info={t("library.accountsInfo")}>
        <SettingsCard>
          {accounts.map((account) => (
            <SettingsRow key={account.id} label={accountLabel(account, app.name)} hint={[account.alias ? account.name : null, statusText[account.status]].filter(Boolean).join(" · ")}>
              <View style={{ flexDirection: "row", gap: 4 }}>
                <Button colors={colors} variant="ghost" size="xs" label={t("dialogs.renameSubmit")} onPress={() => setNaming(account)} />
                <Button colors={colors} variant="ghost" size="xs" label={t("library.disconnect")} onPress={() => void remove(account)} />
              </View>
            </SettingsRow>
          ))}
          <SettingsAction label={t("library.addAnotherAccount")} hint={t("library.addAnotherAccountHint")} actionLabel={t("common.connect")} onPress={() => setNaming("new")} />
        </SettingsCard>
      </SettingsSection>
      <BotsCard colors={colors} bots={bots} noun="app" uses={(bot) => bot.apps.includes(app.slug)} onToggle={onToggleBot} />
      {naming ? (
        <RenameDialog
          colors={colors}
          title={naming === "new" ? t("library.addAnotherAccountTitle", { name: app.name }) : t("library.nameThisAccount")}
          initialValue={naming === "new" ? "" : (naming.alias ?? "")}
          placeholder={t("library.accountPlaceholder")}
          submitLabel={naming === "new" ? t("common.continue") : t("common.save")}
          onClose={() => setNaming(null)}
          onSubmit={async (alias) => {
            if (naming === "new") await onConnect(alias);
            else {
              await rename({ accountId: naming.id, alias });
              await invalidate();
            }
            setNaming(null);
          }}
        />
      ) : null}
    </>
  );
}
