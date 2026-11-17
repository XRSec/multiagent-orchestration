import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, SettingsAction, SettingsCard, SettingsSection, SettingsSelect } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { formatPairs, joinArgs, MCP_NAME, RESERVED_MCP_NAMES, parseMcpJson, parsePairs, splitArgs, type BotMcpServer, type LibraryMcpServer, type McpServerConfig } from "../../shared/bot";
import { PASEO_MCP_NAME } from "../../shared/paseo-tools";
import { mcpSourcesRpc } from "../../shared/rpc";
import { formatPluralCount, useT } from "../i18n";
import { Button, FormTextArea, InputField, SheetFooter, TextAreaField } from "../panel/controls";
import { ui } from "../typography";

type Colors = PluginTheme["colors"];

/** The editable part of a library MCP server. */
export type McpDraft = Pick<LibraryMcpServer, "name" | "description" | "config">;

export const BLANK_SERVER: McpDraft = { name: "", description: "", config: { type: "stdio", command: "", args: [], env: {} } };

const URL_PATTERN = /^https?:\/\/\S+$/i;

interface ServerSheetProps {
  colors: Colors;
  initial: McpDraft;
  isNew: boolean;
  /** Names of the library's other servers; a server name must be unique. */
  otherNames: string[];
  onClose(): void;
  onSave(server: McpDraft): void;
}

/** Adds or edits one MCP server: name, how to start or reach it, and its env vars or headers. */
export function ServerSheet({ colors, initial, isNew, otherNames, onClose, onSave }: ServerSheetProps) {
  const { t } = useT();
  const [server, setServer] = useState<McpDraft>(() => JSON.parse(JSON.stringify(initial)) as McpDraft);
  const { config } = server;
  const [pairsText, setPairsText] = useState(() => formatPairs(config.type === "stdio" ? config.env : config.headers));
  const setConfig = (next: McpServerConfig) => setServer({ ...server, config: next });
  const setType = (type: McpServerConfig["type"]) => {
    if (type === config.type) return;
    const next: McpServerConfig =
      type === "stdio" ? { type, command: "", args: [], env: {} } : { type, url: config.type === "stdio" ? "" : config.url, headers: config.type === "stdio" ? {} : config.headers, ...(config.type !== "stdio" && config.oauth !== undefined ? { oauth: config.oauth } : {}) };
    setConfig(next);
    setPairsText(formatPairs(next.type === "stdio" ? next.env : next.headers));
  };

  const name = server.name.trim();
  const nameError = !name
    ? null
    : !MCP_NAME.test(name)
      ? t("library.mcpNameInvalid")
      : RESERVED_MCP_NAMES.includes(name)
        ? (name === PASEO_MCP_NAME ? t("library.mcpNameTakenByPaseo", { name }) : t("library.mcpNameTakenByApps", { name }))
        : otherNames.includes(name)
          ? t("library.mcpNameAlreadyInLibrary", { name })
          : null;
  const urlError = config.type !== "stdio" && config.url.trim() && !URL_PATTERN.test(config.url.trim()) ? t("library.mcpUrlInvalid") : null;
  const complete = !!name && (config.type === "stdio" ? !!config.command.trim() : !!config.url.trim());
  const canSave = complete && !nameError && !urlError;

  return (
    <Modal title={isNew ? t("library.mcpNewTitle") : t("library.mcpEditTitle")} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        <View style={{ marginBottom: 24 }}>
          <SettingsCard>
            <InputField colors={colors} label={t("library.mcpNameLabel")} hint={t("library.mcpNameHint")} error={nameError} initialValue={server.name} placeholder="gmail" onChangeText={(text) => setServer({ ...server, name: text })} />
            <InputField colors={colors} label={t("library.mcpDescriptionLabel")} initialValue={server.description} placeholder={t("library.mcpDescriptionPlaceholder")} onChangeText={(description) => setServer({ ...server, description })} />
            <SettingsSelect
              label={t("library.mcpTransportLabel")}
              value={config.type}
              options={[
                { label: t("library.mcpTransportStdio"), value: "stdio" },
                { label: t("library.mcpTransportHttp"), value: "http" },
                { label: t("library.mcpTransportSse"), value: "sse" },
              ]}
              onValueChange={setType}
            />
            {config.type === "stdio" ? (
              <InputField colors={colors} key="command" label={t("library.mcpCommandLabel")} monospace autoCapitalize="none" autoCorrect={false} initialValue={config.command} placeholder="npx" onChangeText={(command) => setConfig({ ...config, command })} />
            ) : (
              <InputField colors={colors} key={`url-${config.type}`} label={t("library.mcpUrlLabel")} error={urlError} initialValue={config.url} placeholder="https://example.com/mcp" onChangeText={(url) => setConfig({ ...config, url: url.trim() })} />
            )}
            {config.type !== "stdio" ? <SettingsSelect
              label="Authentication"
              value={config.oauth ? "oauth" : "headers"}
              options={[{ label: "Headers or no authentication", value: "headers" }, { label: "OAuth sign-in", value: "oauth" }]}
              hint={config.oauth ? "Save this server, then connect your account. OAuth credentials stay on the host." : "Add any required authentication in Headers below."}
              onValueChange={(value) => setConfig({ ...config, oauth: value === "oauth" })}
            /> : null}
            {config.type === "stdio" ? (
              <InputField colors={colors}
                key="args"
                label={t("library.mcpArgumentsLabel")}
                monospace
                autoCapitalize="none"
                autoCorrect={false}
                hint={t("library.mcpArgumentsHint")}
                initialValue={joinArgs(config.args)}
                placeholder="-y @modelcontextprotocol/server-memory"
                onChangeText={(text) => setConfig({ ...config, args: splitArgs(text) })}
              />
            ) : null}
            <TextAreaField
              key={config.type === "stdio" ? "env" : "headers"}
              colors={colors}
              monospace
              label={config.type === "stdio" ? t("library.mcpEnvironment") : t("library.mcpHeaders")}
              hint={config.type !== "stdio" && config.oauth ? "Optional additional headers, one KEY=value per line. OAuth supplies Authorization." : t("library.mcpPairsHint")}
              value={pairsText}
              onChangeText={(text) => {
                setPairsText(text);
                const pairs = parsePairs(text);
                setConfig(config.type === "stdio" ? { ...config, env: pairs } : { ...config, headers: pairs });
              }}
              autoCapitalize="none"
              autoCorrect={false}
              minHeight={72}
              placeholder={config.type === "stdio" ? "API_KEY=..." : "Authorization=Bearer ..."}
            />
          </SettingsCard>
        </View>
        <SheetFooter>
          <Button colors={colors} size="md" label={t("common.cancel")} onPress={onClose} style={{ flex: 1 }} />
          <Button
            colors={colors}
            size="md"
            variant="default"
            label={isNew ? t("library.mcpAddServer") : t("common.saveChanges")}
            disabled={!canSave}
            onPress={() => onSave({ ...server, name, description: server.description.trim() })}
            style={{ flex: 1 }}
          />
        </SheetFooter>
      </Modal.Content>
    </Modal>
  );
}

/**
 * Adds servers from an `{"mcpServers": {...}}` block: pasted, or read from
 * Claude Code, Claude Desktop or Cursor on this computer. They arrive off.
 */
export function ImportSheet({ colors, onClose, onImport }: { colors: Colors; onClose(): void; onImport(servers: BotMcpServer[]): void }) {
  const { t } = useT();
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const readSources = useRpc(mcpSourcesRpc);
  const sources = useQuery({ queryKey: ["paseo-bots", "mcp-sources"], queryFn: () => readSources({}) });
  return (
    <Modal title={t("library.mcpImportTitle")} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ gap: 0 }}>
        {sources.data?.sources.length ? (
          <SettingsSection title={t("library.mcpImportOnComputer")} info={t("library.mcpImportOnComputerInfo")}>
            <SettingsCard>
              {sources.data.sources.map((source) => (
                <SettingsAction
                  key={source.label}
                  label={source.label}
                  hint={formatPluralCount(t, "server", source.count)}
                  actionLabel={t("common.use")}
                  onPress={() => {
                    setJson(source.json);
                    setError(null);
                  }}
                />
              ))}
            </SettingsCard>
          </SettingsSection>
        ) : null}
        <SettingsSection title="JSON" info={t("library.mcpImportJsonInfo")}>
          <FormTextArea
            colors={colors}
            monospace
            accessibilityLabel={t("library.mcpJsonLabel")}
            value={json}
            onChangeText={(text) => {
              setJson(text);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            minHeight={160}
            placeholder='{"mcpServers": {"fetch": {"command": "uvx", "args": ["mcp-server-fetch"]}}}'
          />
          {error ? (
            <Text accessibilityRole="alert" style={{ fontSize: ui(12), color: colors.statusDanger, marginLeft: 4 }}>
              {error}
            </Text>
          ) : null}
        </SettingsSection>
        <SheetFooter>
          <Button colors={colors} size="md" label={t("common.cancel")} onPress={onClose} style={{ flex: 1 }} />
          <Button
            colors={colors}
            size="md"
            variant="default"
            label={t("library.mcpAddServers")}
            disabled={!json.trim()}
            onPress={() => {
              try {
                onImport(parseMcpJson(json));
              } catch (caught) {
                setError((caught instanceof Error ? caught.message : String(caught)).replace(/\.$/, ""));
              }
            }}
            style={{ flex: 1 }}
          />
        </SheetFooter>
      </Modal.Content>
    </Modal>
  );
}
