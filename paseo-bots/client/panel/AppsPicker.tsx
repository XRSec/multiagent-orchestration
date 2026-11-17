import { Icon, SettingsCard, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { accountLabel, withAppRule, type AppAccount } from "../../shared/apps";
import type { AppRule } from "../../shared/bot";
import { useBotHost } from "../data";
import { formatPluralCount, useT, type TFn } from "../i18n";
import { connectedApps, useAppsAccounts, useAppsCatalog, useAppsStatus } from "../library/apps";
import { AppLogo } from "../library/parts";
import { openLibrary } from "../navigation";
import { AppAccessSheet } from "./AppAccessSheet";
import type { PanelProps } from "./BotPanel";
import { CardNote, PressableRow, RowText, SectionLink, Switch } from "./controls";

/** A bot's limits on an app in a few words: "Read-only · work". */
function ruleHint(t: TFn, rule: AppRule | undefined, accounts: readonly AppAccount[], appName: string): string | null {
  if (!rule) return null;
  const account = accounts.find((entry) => entry.id === rule.account);
  const tools = rule.tools === "read" ? t("panel.readOnly") : Array.isArray(rule.tools) ? formatPluralCount(t, "tool", rule.tools.length) : null;
  return [tools, account ? accountLabel(account, appName) : null].filter(Boolean).join(" · ") || null;
}

/**
 * The apps connected on this host, with a switch each for this bot, like the
 * skill and MCP server pickers. Apps are connected in Skills & Tools; a row
 * opens the bot's limits on the app.
 */
export function AppsPicker({ colors, bot, localHost, onPatch }: Pick<PanelProps, "colors" | "bot" | "localHost" | "onPatch">) {
  const { t } = useT();
  const statusHint = {
    connected: null,
    pending: t("library.appStatusPending"),
    failed: t("panel.appStatusFailedPicker"),
  } as const;
  const host = useBotHost(bot.hostId, localHost);
  const status = useAppsStatus();
  const configured = status.data?.configured ?? false;
  const accounts = useAppsAccounts(configured);
  const catalog = useAppsCatalog(configured);
  const apps = connectedApps(accounts.data?.accounts ?? [], catalog.data?.apps ?? []);
  const [editing, setEditing] = useState<string | null>(null);
  const editingApp = apps.find((app) => app.slug === editing);
  const appAccounts = (slug: string) => (accounts.data?.accounts ?? []).filter((account) => account.slug === slug && account.status === "connected");
  const toggle = (slug: string, on: boolean) => onPatch({ apps: on ? [...new Set([...bot.apps, slug])] : bot.apps.filter((entry) => entry !== slug) });

  return (
    <SettingsSection
      title={t("library.connectedAppsTitle")}
      info={t("panel.connectedAppsInfo")}
      trailing={<SectionLink colors={colors} icon="ArrowUpRight" label={t("panel.skillsToolsLink")} onPress={() => openLibrary({ kind: "apps" })} />}
    >
      <SettingsCard>
        {!host.isLocal ? <CardNote colors={colors} text={t("panel.onlyLocalApps")} /> : null}
        {host.isLocal && status.data && !configured ? <CardNote colors={colors} text={t("library.notSetUpYet")} /> : null}
        {host.isLocal && configured && accounts.isLoading ? <CardNote colors={colors} loading text={t("common.loading")} /> : null}
        {host.isLocal && configured && !accounts.isLoading && apps.length === 0 ? <CardNote colors={colors} text={t("library.noAppsConnectedYet")} /> : null}
        {host.isLocal && configured
          ? apps.map((app) => (
              <PressableRow key={app.slug} colors={colors} accessibilityLabel={t("panel.appToolsAndAccountA11y", { name: app.name })} onPress={() => setEditing(app.slug)}>
                {({ hovered }) => (
                  <>
                    <AppLogo colors={colors} app={app} />
                    <RowText colors={colors} label={app.name} hint={statusHint[app.status] ?? ruleHint(t, bot.appRules[app.slug], appAccounts(app.slug), app.name)} />
                    <Switch colors={colors} label={t("panel.useItemA11y", { name: app.name })} value={bot.apps.includes(app.slug)} onValueChange={(on) => toggle(app.slug, on)} />
                    <Icon name="ChevronRight" size={14} color={hovered ? colors.foreground : colors.foregroundMuted} />
                  </>
                )}
              </PressableRow>
            ))
          : null}
      </SettingsCard>
      {editingApp ? (
        <AppAccessSheet
          colors={colors}
          app={editingApp}
          accounts={appAccounts(editingApp.slug)}
          rule={bot.appRules[editingApp.slug]}
          onClose={() => setEditing(null)}
          onSave={(rule) => {
            onPatch({ appRules: withAppRule(bot.appRules, editingApp.slug, rule) });
            setEditing(null);
          }}
        />
      ) : null}
    </SettingsSection>
  );
}
