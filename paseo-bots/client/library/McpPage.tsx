import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsAction, SettingsCard, SettingsRow, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { Bot, LibraryMcpServer } from "../../shared/bot";
import { mcpServerTested, mcpTarget } from "../../shared/library";
import { mcpProbeRpc } from "../../shared/rpc";
import { formatRelativeTime, useT, type TFn } from "../i18n";
import { errorText, MONO_FONT, MONO_PROPS } from "../native";
import { Alert, Button, CardNote, SectionLink, SectionMeta } from "../panel/controls";
import { code, ui } from "../typography";
import { ServerSheet, type McpDraft } from "./McpSheets";
import { McpOAuth } from "./McpOAuth";
import { BotsCard, DangerZone, PageTitle } from "./parts";

type Colors = PluginTheme["colors"];

interface McpPageProps {
  colors: Colors;
  server: LibraryMcpServer;
  bots: Bot[];
  otherNames: string[];
  showTitle: boolean;
  onPatch(patch: Partial<LibraryMcpServer>): void;
  onToggleBot(bot: Bot, on: boolean): void;
  onDelete(): void;
}

/** Keys only: values are usually secrets. */
function keysHint(server: LibraryMcpServer, t: TFn): string | null {
  const { config } = server;
  const keys = Object.keys(config.type === "stdio" ? config.env : config.headers);
  return keys.length ? `${config.type === "stdio" ? t("library.mcpEnvironment") : t("library.mcpHeaders")}: ${keys.join(", ")}` : null;
}

export function McpPage({ colors, server, bots, otherNames, showTitle, onPatch, onToggleBot, onDelete }: McpPageProps) {
  const { t } = useT();
  const probe = useRpc(mcpProbeRpc);
  const [editing, setEditing] = useState(false);
  const [testing, setTesting] = useState(false);
  const testRequest = useRef(0);
  const testRunning = useRef(false);
  const latest = useRef(server);
  latest.current = server;
  const configKey = JSON.stringify(server.config);
  useEffect(() => {
    testRunning.current = false;
    setTesting(false);
    return () => { testRequest.current++; };
  }, [probe]);

  /** Tests the connection; `enable` turns the server on when it connects. */
  const test = async (enable = false) => {
    if (testRunning.current) return;
    const snapshot = latest.current;
    const config = JSON.stringify(snapshot.config);
    const request = ++testRequest.current;
    testRunning.current = true;
    setTesting(true);
    try {
      // OAuth credentials are looked up against the saved server, never an unsaved draft.
      const result = await probe({ config: snapshot.config, serverId: snapshot.id });
      if (request !== testRequest.current || latest.current.id !== snapshot.id || JSON.stringify(latest.current.config) !== config) return;
      const checkedAt = new Date().toISOString();
      onPatch(result.ok ? { tools: result.tools, checkError: null, checkedAt, ...(enable ? { enabled: true } : {}) } : { checkError: result.error, checkedAt });
    } catch (error) {
      if (request === testRequest.current && latest.current.id === snapshot.id && JSON.stringify(latest.current.config) === config) onPatch({ checkError: errorText(error), checkedAt: new Date().toISOString() });
    } finally {
      if (request === testRequest.current) { testRunning.current = false; setTesting(false); }
    }
  };
  const tested = mcpServerTested(server);

  const tools = server.tools ?? [];
  const toolsMeta = testing
    ? t("library.mcpConnecting")
    : server.checkedAt
      ? t("library.mcpChecked", {
          toolsPrefix: server.tools ? t("library.mcpToolsPrefix", { count: tools.length }) : "",
          time: formatRelativeTime(t, server.checkedAt),
        })
      : "";

  return (
    <>
      {showTitle ? <PageTitle colors={colors} title={server.name} /> : null}
      {!server.enabled && !tested ? (
        <View style={{ marginBottom: 24, gap: 12 }}>
          <Alert colors={colors} variant="warning" title={t("library.mcpTestBeforeUseTitle")} description={t("library.mcpTestBeforeUseDesc")} />
          <View style={{ alignItems: "flex-start" }}>
            <Button colors={colors} variant="outline" icon="PlugZap" label={testing ? t("common.testing") : t("library.mcpTestAndTurnOn")} disabled={testing} onPress={() => void test(true)} />
          </View>
        </View>
      ) : null}
      <SettingsSection title={t("library.mcpServerSection")}>
        <SettingsCard>
          <SettingsSwitch
            label={t("common.enabled")}
            hint={tested ? t("library.mcpEnabledHintTested") : t("library.mcpEnabledHintUntested")}
            value={server.enabled}
            disabled={testing}
            onValueChange={(enabled) => (enabled && !tested ? void test(true) : onPatch({ enabled }))}
          />
          <SettingsAction label={t("library.mcpConnectionLabel")} hint={[mcpTarget(server.config), keysHint(server, t)].filter(Boolean).join("\n")} actionLabel={t("common.edit")} onPress={() => setEditing(true)} />
        </SettingsCard>
      </SettingsSection>

      {server.config.type !== "stdio" && server.config.oauth ? <McpOAuth
        key={`${server.id}:${configKey}`}
        serverId={server.id}
        onConnected={(newConnection) => void test(newConnection)}
        onDisconnected={() => {
          testRequest.current++;
          testRunning.current = false;
          setTesting(false);
          onPatch({ enabled: false, tools: null, checkedAt: null, checkError: null });
        }}
      /> : null}

      <SettingsSection
        title={t("library.mcpToolsSection")}
        info={t("library.mcpToolsInfo")}
        trailing={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {toolsMeta ? <SectionMeta colors={colors} text={toolsMeta} /> : null}
            {testing ? null : <SectionLink colors={colors} icon="RefreshCw" label={server.checkedAt ? t("library.mcpTestAgain") : t("library.mcpTestConnection")} onPress={() => void test()} />}
          </View>
        }
      >
        <SettingsCard>
          {testing ? <CardNote colors={colors} loading text={t("library.mcpStartingTools")} /> : null}
          {!testing && server.checkError ? <SettingsRow label={t("library.mcpCouldNotConnect")} error={server.checkError} /> : null}
          {!testing && !server.checkError && server.tools === null ? <CardNote colors={colors} text={t("library.mcpUntestedNote")} /> : null}
          {!testing && !server.checkError && server.tools?.length === 0 ? <CardNote colors={colors} text={t("library.mcpNoToolsNote")} /> : null}
          {!testing && !server.checkError
            ? tools.map((tool) => (
                <View key={tool.name} style={{ paddingVertical: 12, paddingHorizontal: 16, gap: 4 }}>
                  <Text selectable numberOfLines={1} {...MONO_PROPS} style={{ fontFamily: MONO_FONT, fontSize: code(), color: colors.foreground }}>
                    {server.name}/{tool.name}
                  </Text>
                  {tool.description ? (
                    <Text numberOfLines={2} style={{ fontSize: ui(12), color: colors.foregroundMuted }}>
                      {tool.description}
                    </Text>
                  ) : null}
                </View>
              ))
            : null}
        </SettingsCard>
      </SettingsSection>

      <BotsCard colors={colors} bots={bots} noun="server" uses={(bot) => bot.mcpServerIds.includes(server.id)} onToggle={onToggleBot} />

      <DangerZone
        label={t("library.mcpDeleteLabel")}
        hint={t("library.mcpDeleteHint")}
        actionLabel={t("common.delete")}
        confirmTitle={t("library.mcpDeleteConfirmTitle")}
        confirmMessage={t("library.mcpDeleteConfirmMessage", { name: server.name })}
        onConfirm={onDelete}
      />

      {editing ? (
        <ServerSheet
          colors={colors}
          initial={server}
          isNew={false}
          otherNames={otherNames}
          onClose={() => setEditing(false)}
          onSave={(draft: McpDraft) => {
            setEditing(false);
            const changed = JSON.stringify(draft.config) !== JSON.stringify(server.config);
            // Wait for the saved settings to reach this page before testing or signing in.
            // An old in-flight test cannot enable or populate a newly edited connection.
            if (changed) { testRequest.current++; testRunning.current = false; setTesting(false); }
            onPatch({ ...draft, ...(changed ? { enabled: false, tools: null, checkError: null, checkedAt: null } : {}) });
          }}
        />
      ) : null}
    </>
  );
}
