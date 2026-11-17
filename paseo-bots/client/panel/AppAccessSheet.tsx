import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, SettingsCard, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { accountLabel, type AppAccount } from "../../shared/apps";
import type { AppRule } from "../../shared/bot";
import { appsToolsRpc } from "../../shared/rpc";
import { APPS_KEY } from "../library/apps";
import { useT } from "../i18n";
import { errorText } from "../native";
import { Button, CardNote, SearchField, SectionMeta, SheetActions } from "./controls";

type Colors = PluginTheme["colors"];
type Mode = "all" | "read" | "chosen";

/**
 * How one bot may use one connected app: the account it's kept to, and all of
 * the app's tools, the read-only ones or chosen ones. The relay enforces both.
 */
export function AppAccessSheet({
  colors,
  app,
  accounts,
  rule,
  onClose,
  onSave,
}: {
  colors: Colors;
  app: { slug: string; name: string };
  /** The app's connected accounts. */
  accounts: readonly AppAccount[];
  rule: AppRule | undefined;
  onClose(): void;
  onSave(rule: AppRule): void;
}) {
  const { t } = useT();
  const appTools = useRpc(appsToolsRpc);
  const tools = useQuery({ queryKey: [...APPS_KEY, "tools", app.slug], queryFn: () => appTools({ slug: app.slug }), staleTime: 10 * 60_000 });
  const list = tools.data?.tools ?? [];
  // An account that has since been disconnected reads as any account.
  const [account, setAccount] = useState(accounts.some((entry) => entry.id === rule?.account) ? rule!.account : null);
  const [mode, setMode] = useState<Mode>(Array.isArray(rule?.tools) ? "chosen" : (rule?.tools ?? "all"));
  const [chosen, setChosen] = useState<string[]>(Array.isArray(rule?.tools) ? rule.tools : []);
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? list.filter((tool) => tool.name.toLowerCase().includes(needle) || tool.slug.toLowerCase().includes(needle)) : list;
  const readOnly = list.filter((tool) => tool.readOnly);

  const pick = (next: Mode) => {
    // Choosing tools starts from the read-only ones.
    if (next === "chosen" && chosen.length === 0) setChosen(readOnly.map((tool) => tool.slug));
    setMode(next);
  };

  return (
    <Modal title={app.name} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        {accounts.length > 1 ? (
          <SettingsSection title={t("panel.accountSection")} info={t("panel.accountInfo")}>
            <SettingsCard>
              <SettingsSelect
                label={t("panel.accountSection")}
                value={account ?? ""}
                options={[{ label: t("panel.anyAccount"), value: "" }, ...accounts.map((entry) => ({ label: accountLabel(entry, app.name), value: entry.id }))]}
                onValueChange={(value) => setAccount(value || null)}
              />
            </SettingsCard>
          </SettingsSection>
        ) : null}
        <SettingsSection title={t("panel.toolsSection")} info={t("panel.toolsAccessInfo")}>
          <SettingsCard>
            <SettingsSelect
              label={t("panel.allowedToolsLabel")}
              hint={mode === "read" && tools.data ? t("panel.readOnlyToolsCountHint", { count: readOnly.length, total: list.length }) : undefined}
              value={mode}
              options={[
                { label: t("panel.allTools"), value: "all" },
                { label: t("panel.readOnly"), value: "read" },
                { label: t("panel.chosenTools"), value: "chosen" },
              ]}
              onValueChange={(value) => pick(value as Mode)}
            />
          </SettingsCard>
        </SettingsSection>
        {mode === "chosen" ? (
          <SettingsSection title={t("panel.chosenTools")} trailing={tools.data ? <SectionMeta colors={colors} text={t("panel.chosenToolsCount", { chosen: chosen.length, total: list.length })} /> : undefined}>
            {list.length > 12 ? (
              <View style={{ marginBottom: 12 }}>
                <SearchField colors={colors} value={query} onChangeText={setQuery} placeholder={t("panel.searchAppTools", { name: app.name })} />
              </View>
            ) : null}
            <SettingsCard>
              {tools.isLoading ? <CardNote colors={colors} loading text={t("panel.loadingTools")} /> : null}
              {tools.error ? <CardNote colors={colors} text={errorText(tools.error)} /> : null}
              {tools.data && shown.length === 0 ? <CardNote colors={colors} text={needle ? t("panel.noToolsMatch") : t("panel.appHasNoTools")} /> : null}
              {shown.map((tool) => (
                <SettingsSwitch
                  key={tool.slug}
                  label={tool.name}
                  hint={tool.readOnly ? t("panel.toolSlugReadOnly", { slug: tool.slug }) : tool.slug}
                  value={chosen.includes(tool.slug)}
                  onValueChange={(on) => setChosen((current) => (on ? [...current, tool.slug] : current.filter((slug) => slug !== tool.slug)))}
                />
              ))}
            </SettingsCard>
          </SettingsSection>
        ) : null}
        <SheetActions>
          <Button colors={colors} variant="ghost" label={t("common.cancel")} onPress={onClose} />
          <Button colors={colors} variant="default" label={t("common.save")} disabled={mode === "chosen" && chosen.length === 0} onPress={() => onSave({ tools: mode === "chosen" ? chosen : mode, account })} />
        </SheetActions>
      </Modal.Content>
    </Modal>
  );
}
