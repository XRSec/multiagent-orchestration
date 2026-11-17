/**
 * Purpose: Paseo native client UI for Sidecar control plane (managed assets, workspace rules, server status, and discovery/symlink).
 * Context: Registered via index.client.tsx as a Paseo sidebar header item and full screen.
 * Usage: Rendered inside Paseo desktop/mobile/web app hosts using @getpaseo/plugin/client/ui primitives.
 * Prerequisites: @getpaseo/plugin/client, @getpaseo/plugin/client/ui, react, react-native, and ../shared/contracts.
 */
import {
  useRpc,
  type PluginScreenProps,
  type PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import {
  Icon,
  Loading,
  ScrollView,
  SidebarRow,
  useToast,
} from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  sidecarDiscoverRpc,
  sidecarStatusRpc,
  type McpSummary,
  type PluginSummary,
  type SidecarStatusOutput,
  type SkillSummary,
  type WorkspaceRule,
} from "../shared/contracts";

export const SCREEN_ID = "sidecar";

type Theme = PluginScreenProps["theme"];
type TabId = "assets" | "workspaces" | "server";

export function SidecarSidebarItem(props: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="Layers"
      label="Sidecar"
      active={props.currentScreen?.screenId === SCREEN_ID}
      onPress={() => props.openScreen({ screenId: SCREEN_ID })}
    />
  );
}

export function SidecarScreen(props: PluginScreenProps) {
  const { theme, layout } = props;
  const toast = useToast();
  const fetchStatus = useRpc(sidecarStatusRpc);
  const triggerDiscover = useRpc(sidecarDiscoverRpc);

  const [status, setStatus] = useState<SidecarStatusOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("assets");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchStatus({});
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDiscover = async () => {
    if (discovering) return;
    setDiscovering(true);
    try {
      const res = await triggerDiscover({});
      toast.show(
        `发现 ${res.discovered.skills} Skills / ${res.discovered.plugins} Plugins / ${res.discovered.mcps} MCPs；已收敛 ${res.totalMovedSkills} Skills、${res.totalMovedMcps} MCPs`,
      );
      await refresh();
    } catch (err) {
      toast.show(
        `发现与收敛失败：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setDiscovering(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.surface0 }}>
      <TopToolbar
        theme={theme}
        compact={layout.compact}
        status={status}
        loading={loading}
        discovering={discovering}
        onRefresh={() => void refresh()}
        onDiscover={() => void handleDiscover()}
      />

      <TabBar theme={theme} activeTab={tab} status={status} onSelect={setTab} />

      {loading && !status ? (
        <Loading />
      ) : error && !status ? (
        <ErrorBanner theme={theme} message={error} onRetry={() => void refresh()} />
      ) : status ? (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
          {error ? (
            <ErrorBanner theme={theme} message={error} onRetry={() => void refresh()} />
          ) : null}
          {tab === "assets" ? <AssetsSection theme={theme} status={status} /> : null}
          {tab === "workspaces" ? <WorkspacesSection theme={theme} status={status} /> : null}
          {tab === "server" ? <ServerSection theme={theme} status={status} /> : null}
        </ScrollView>
      ) : null}
    </View>
  );
}

function TopToolbar(props: {
  theme: Theme;
  compact: boolean;
  status: SidecarStatusOutput | null;
  loading: boolean;
  discovering: boolean;
  onRefresh(): void;
  onDiscover(): void;
}) {
  const { theme, compact, status, loading, discovering } = props;
  return (
    <View
      style={{
        flexDirection: compact ? "column" : "row",
        alignItems: compact ? "stretch" : "center",
        justifyContent: "space-between",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Icon name="Layers" size={16} color={theme.colors.accent} />
          <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "700" }}>
            Sidecar 控制面
          </Text>
          {status ? (
            <StatusBadge
              theme={theme}
              label={status.adminReachable ? "Server 在线 · 44880" : "Server 未启动"}
              accent={status.adminReachable}
            />
          ) : null}
        </View>
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
          托管目录：{status?.sidecarHome ?? "~/.sidecar"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <ActionButton
          theme={theme}
          icon="RefreshCw"
          label={loading ? "刷新中..." : "刷新"}
          disabled={loading}
          onPress={props.onRefresh}
        />
        <ActionButton
          theme={theme}
          icon="Sparkles"
          label={discovering ? "收敛中..." : "发现并软链接"}
          primary
          disabled={discovering}
          onPress={props.onDiscover}
        />
      </View>
    </View>
  );
}

function TabBar(props: {
  theme: Theme;
  activeTab: TabId;
  status: SidecarStatusOutput | null;
  onSelect(tab: TabId): void;
}) {
  const { theme, activeTab, status } = props;
  const assetCount =
    (status?.skills.length ?? 0) + (status?.plugins.length ?? 0) + (status?.mcps.length ?? 0);
  const wsCount = status?.workspaces.length ?? 0;

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "assets", label: `托管资产 (${assetCount})` },
    { id: "workspaces", label: `Workspace 路由 (${wsCount})` },
    { id: "server", label: "Server 管理" },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      {tabs.map((item) => {
        const active = activeTab === item.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            onPress={() => props.onSelect(item.id)}
            style={({ pressed }: { pressed: boolean }) => ({
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              backgroundColor: active
                ? theme.colors.surface2
                : pressed
                  ? theme.colors.surface1
                  : "transparent",
            })}
          >
            <Text
              style={{
                color: active ? theme.colors.foreground : theme.colors.foregroundMuted,
                fontSize: 13,
                fontWeight: active ? "600" : "500",
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AssetsSection(props: { theme: Theme; status: SidecarStatusOutput }) {
  const { theme, status } = props;
  return (
    <View style={{ gap: 16 }}>
      <AssetGroup
        theme={theme}
        title={`Skills (${status.skills.length})`}
        emptyText="~/.sidecar/skills 暂无托管 Skill，可点击右上角「发现并软链接」收敛宿主资产。"
        items={status.skills.map((skill: SkillSummary) => ({
          key: skill.id,
          title: skill.name,
          subtitle: skill.description || skill.rootPath,
          badge: skill.id,
        }))}
      />
      <AssetGroup
        theme={theme}
        title={`Plugins (${status.plugins.length})`}
        emptyText="~/.sidecar/plugins 暂无托管 Plugin。"
        items={status.plugins.map((plugin: PluginSummary) => ({
          key: `${plugin.sourcePlatform ?? "native"}:${plugin.pluginId}`,
          title: plugin.version ? `${plugin.pluginId} (${plugin.version})` : plugin.pluginId,
          subtitle: `来源: ${plugin.sourcePlatform ?? "native"} · ${plugin.skillsCount} Skills · ${plugin.mcpsCount} MCPs · ${plugin.hooksCount} Hooks`,
          badge: plugin.enabled !== false ? "已启用" : "已禁用",
        }))}
      />
      <AssetGroup
        theme={theme}
        title={`MCP Servers (${status.mcps.length})`}
        emptyText="~/.sidecar/mcps 暂无托管 MCP 配置。"
        items={status.mcps.map((mcp: McpSummary) => ({
          key: mcp.id,
          title: mcp.id,
          subtitle: mcp.commandOrUrl || "-",
          badge: `${mcp.transport} · ${mcp.scope ?? "shared"}`,
        }))}
      />
    </View>
  );
}

function AssetGroup(props: {
  theme: Theme;
  title: string;
  emptyText: string;
  items: Array<{ key: string; title: string; subtitle: string; badge: string }>;
}) {
  const { theme, title, emptyText, items } = props;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700" }}>
          {title}
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 14 }}>
          {emptyText}
        </Text>
      ) : (
        items.map((item, idx) => (
          <View
            key={item.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
                {item.title}
              </Text>
              <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
                {item.subtitle}
              </Text>
            </View>
            <StatusBadge theme={theme} label={item.badge} />
          </View>
        ))
      )}
    </View>
  );
}

function WorkspacesSection(props: { theme: Theme; status: SidecarStatusOutput }) {
  const { theme, status } = props;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          gap: 2,
        }}
      >
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "700" }}>
          Workspace 路由规则 ({status.workspaces.length})
        </Text>
        <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          配置文件：{status.workspacesFile}
        </Text>
      </View>
      {status.workspaces.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, padding: 14 }}>
          未配置 workspaces.yaml 规则，当前所有会话默认使用全局资产路由。
        </Text>
      ) : (
        status.workspaces.map((ws: WorkspaceRule, idx: number) => (
          <View
            key={ws.id}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 10,
              gap: 4,
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: theme.colors.border,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
                {ws.name} ({ws.id})
              </Text>
              <StatusBadge theme={theme} label={ws.enabled ? "启用" : "禁用"} accent={ws.enabled} />
            </View>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
              路径：{ws.canonicalCwd}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              Plugins：{(ws.plugins?.length ?? 0) > 0 ? ws.plugins!.join(", ") : "全部"} · Runtimes：
              {(ws.runtimes?.length ?? 0) > 0 ? ws.runtimes!.join(", ") : "全部"}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function ServerSection(props: { theme: Theme; status: SidecarStatusOutput }) {
  const { theme, status } = props;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 8,
        backgroundColor: theme.colors.surface1,
        padding: 14,
        gap: 10,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 14, fontWeight: "700" }}>
          Server 模式管理入口
        </Text>
        <StatusBadge
          theme={theme}
          label={status.adminReachable ? "运行中 (Reachable)" : "未启动 (Offline)"}
          accent={status.adminReachable}
        />
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        Web 管理台地址：{status.adminUrl}
      </Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 18 }}>
        各 Runtime（Claude Code / Gemini / Codex 等）通过自身安装的 Sidecar 插件（stdio MCP + hook shim）驱动工具与生命周期 Hook；Paseo Sidecar 面板仅作为控制面管理 ~/.sidecar 资产、发现与软链接收敛及联动 `sidecar serve` Web 台。如需通过浏览器访问完整 Web 管理台，可运行 `sidecar serve` 后打开 {status.adminUrl}。
      </Text>
    </View>
  );
}

function ActionButton(props: {
  theme: Theme;
  icon: string;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  onPress(): void;
}) {
  const { theme, icon, label, primary, disabled, onPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: primary ? theme.colors.accent : theme.colors.border,
        backgroundColor: primary
          ? theme.colors.accent
          : pressed
            ? theme.colors.surface2
            : theme.colors.surface0,
        opacity: disabled ? 0.6 : 1,
      })}
    >
      <Icon
        name={icon as never}
        size={13}
        color={primary ? theme.colors.surface0 : theme.colors.foreground}
      />
      <Text
        style={{
          color: primary ? theme.colors.surface0 : theme.colors.foreground,
          fontSize: 12,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusBadge(props: { theme: Theme; label: string; accent?: boolean }) {
  const { theme, label, accent } = props;
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: accent ? theme.colors.accent : theme.colors.border,
        backgroundColor: theme.colors.surface0,
      }}
    >
      <Text
        style={{
          color: accent ? theme.colors.accent : theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function ErrorBanner(props: { theme: Theme; message: string; onRetry(): void }) {
  const { theme, message, onRetry } = props;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.statusWarning,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 12 }}>{message}</Text>
      <ActionButton theme={theme} icon="RefreshCw" label="重试" onPress={onRetry} />
    </View>
  );
}
