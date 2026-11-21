import type { PluginButtonRegistration, PluginClientContext, PluginScreenProps } from "@getpaseo/plugin/client";
import { useEffect, type ReactNode } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { BotsSurface } from "./client/BotsSurface";
import { BotLauncherPopover } from "./client/launcher/BotLauncherPopover";
import { BOT_SCREENS, chatScreen, feedScreen, resolveBotScreen, teamChatScreen, teamsScreen, workflowsScreen } from "./client/screen-navigation";
import { NativeConnectCard } from "./client/chat/stream/ConnectCard";
import { ProposalCard } from "./client/chat/stream/ProposalCard";
import { RoutineRunCard } from "./client/chat/stream/RoutineRunCard";
import { InteractionCard } from "./client/chat/stream/InteractionCard";
import { InteractionRecovery } from "./client/chat/stream/InteractionRecovery";
import { INTERACTION_CARD, InteractionIdSchema, InteractionSchema, interactionIdOf } from "./shared/interaction";
import { HandoffCard } from "./client/chat/stream/HandoffCard";
import { TaskCardView } from "./client/chat/stream/TaskCard";
import { ProtocolCard } from "./client/chat/stream/ProtocolCard";
import { CompanionIntentBadge } from "./client/chat/stream/CompanionIntentBadge";
import { Markdown } from "./client/Markdown";
import { nativeTokens } from "./client/native";
import { parseCompanionIntentEnvelope } from "./shared/companion-intent";
import {
  segmentProtocolBlocks,
  transformAssistantProtocolCards,
  transformUserProtocolCards,
} from "./shared/protocol-cards";
import { HANDOFF_CARD, HandoffCardSchema } from "./shared/handoff";
import { TASK_CARD, TaskCardSchema } from "./shared/task-card";
import { requestIntent } from "./client/intent";
import { initPluginI18n, tMsg, translateNow } from "./client/i18n";
import { RoutinesScreen } from "./client/RoutinesScreen";
import { PaseoBotsSidebar, PaseoTeamsSidebar, PaseoWorkflowsSidebar } from "./client/PaseoSidebar";
import { WorkflowsScreen } from "./client/WorkflowsScreen";
import { BackBar } from "./client/library/parts";
import { useTypeScale } from "./client/typography";
import { installTooltips } from "./client/ui/Tooltip";
import { appSignIns } from "./shared/apps";
import { BOT_LABEL } from "./shared/bot";
import { TEAM_SESSION_LABEL } from "./shared/chat";
import { proposalIdOf } from "./shared/proposals";
import { APP_SIGN_IN_CARD, AppSignInSchema, helloRpc, ROUTINE_RUN_CARD, RoutineRunCardSchema } from "./shared/rpc";
import { LEARN_COMMAND, learnPrompt, REMEMBER_COMMAND, rememberPrompt } from "./shared/skills";
import { navigateToAgentChat, setGlobalNavigation } from "./client/navigation";

function registerLauncherButtons(client: PluginClientContext): () => void {
  const registeredPills = new Map<string, PluginButtonRegistration>();
  let stopped = false;

  const buttonDefinition = {
    title: tMsg("launcher.title"),
    label: tMsg("launcher.pillLabel"),
    icon: "Bot",
    behavior: {
      kind: "popover" as const,
      Content: BotLauncherPopover,
      component: BotLauncherPopover,
    },
  };

  const sync = async () => {
    if (stopped) return;
    try {
      const agentsRes = await client.paseo.agents.list().catch(() => null);

      if (stopped) return;

      if (agentsRes?.entries) {
        for (const entry of agentsRes.entries) {
          const agentId = entry.agent?.id;
          const workspaceId = entry.agent?.workspaceId;
          if (!agentId || !workspaceId) continue;
          const key = `${workspaceId}:${agentId}`;
          if (!registeredPills.has(key)) {
            try {
              const reg = client.addComposerPill({
                id: `bot-launcher-pill-${agentId}`,
                workspaceId,
                agentId,
                button: buttonDefinition,
              });
              registeredPills.set(key, reg);
            } catch {
              // ignore duplicate/failed registration
            }
          }
        }
      }
    } catch {
      // ignore transient sync errors
    }
  };

  void sync();
  const interval = setInterval(() => void sync(), 3000);

  const unsubs: (() => void)[] = [];
  try {
    const unsubAgents = client.paseo.agents.subscribe?.(() => void sync());
    if (unsubAgents) unsubs.push(unsubAgents);
  } catch {}

  return () => {
    stopped = true;
    clearInterval(interval);
    for (const u of unsubs) {
      try {
        u();
      } catch {}
    }
    for (const reg of registeredPills.values()) {
      try {
        reg.remove();
      } catch {}
    }
    registeredPills.clear();
  };
}

/** The plugin's screen, under the id of the sidebar item it replaced so saved links still open it. */
const BOTS_SCREEN = "bots";

function BotsPage({ props, title, onBack, children }: { props: PluginScreenProps; title: string; onBack(): void; children: ReactNode }) {
  useTypeScale();
  return <View style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}><BackBar colors={props.theme.colors} title={title} backLabel="Back to Bots" onBack={onBack} />{children}</View>;
}

function registerBotScreen(client: PluginClientContext, definition: typeof BOT_SCREENS[number]) {
  const { id, title } = definition;
  function BotScreenPage(props: PluginScreenProps) {
    const screen = resolveBotScreen(id, props.params);
    return <BotsSurface key={`${props.host.id}:${screen}`} {...props} screen={screen} openScreen={(input) => client.openScreen(input)} />;
  }
  client.addScreen({
    id,
    title: (params) => params.title || (resolveBotScreen(id, params) === "bots" ? "Bots" : title),
    Component: BotScreenPage,
  });
}

export default function contribute(client: PluginClientContext) {
  if ((client as any).navigation) {
    setGlobalNavigation((client as any).navigation);
  }
  // Hands the daemon side its Paseo API so bot routines can run.
  void client.rpc(helloRpc, {}).catch(() => {});
  const stopI18n = initPluginI18n(client);
  const removeTooltips = installTooltips();
  const removeLauncherButtons = registerLauncherButtons(client);
  for (const screen of BOT_SCREENS) {
    registerBotScreen(client, screen);
  }
  client.addSidebarHeaderItem({ id: "bots", title: tMsg("plugin.title"), Component: PaseoBotsSidebar });
  client.addSidebarHeaderItem({ id: "teams", title: tMsg("teams.sidebarTitle"), Component: PaseoTeamsSidebar });
  client.addSidebarHeaderItem({ id: "workflows", title: tMsg("workflows.sidebarTitle"), Component: PaseoWorkflowsSidebar });
  const backToBots = () => client.openScreen({ screenId: BOTS_SCREEN });
  // Existing open tabs/bookmarks from the removed settings page return to Bots.
  function PreviousSettingsRoute() {
    useEffect(() => { void backToBots(); }, []);
    return null;
  }
  function WorkflowsRoute(props: PluginScreenProps) {
    useTypeScale();
    return (
      <WorkflowsScreen
        {...props}
        initialScope={props.params?.scope}
        openScreen={(input) => client.openScreen(input)}
        onOpenFeed={(kind, id) => client.openScreen(feedScreen(kind, id))}
        onOpenTeamChat={(groupId) => client.openScreen(teamChatScreen(groupId))}
        onOpenTeams={() => client.openScreen(teamsScreen())}
        onOpenChat={(chatId, botId) => {
          const opened = navigateToAgentChat(chatId, {
            botId,
            client,
            navigation: props.navigation,
          });
          if (!opened && botId) {
            client.openScreen(chatScreen({ botId, chatId }, botId));
          }
        }}
      />
    );
  }
  client.addScreen({ id: "bot-preferences", title: tMsg("plugin.title"), Component: PreviousSettingsRoute });
  client.addScreen({ id: "bot-routines", title: tMsg("plugin.title"), Component: (props) => <BotsPage props={props} title="Routines" onBack={backToBots}><RoutinesScreen {...props} openScreen={(input) => client.openScreen(input)} /></BotsPage> });
  client.addScreen({ id: "workflows", title: tMsg("workflows.sidebarTitle"), Component: WorkflowsRoute });
  client.addScreen({ id: "bot-workflows", title: tMsg("workflows.sidebarTitle"), Component: WorkflowsRoute });
  client.addCommandCenterItem({
    id: "open-bots",
    title: tMsg("plugin.openBots"),
    icon: "Bot",
    keywords: ["bot", "assistant", "persona", "助手"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: BOTS_SCREEN });
    },
  });
  client.addCommandCenterItem({
    id: "open-teams",
    title: tMsg("teams.openTeams"),
    icon: "Users",
    keywords: ["team", "squad", "fleet", "团队", "舰队"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "teams" });
    },
  });
  client.addCommandCenterItem({
    id: "open-workflows",
    title: tMsg("workflows.openWorkflows"),
    icon: "GitBranch",
    keywords: ["workflow", "pipeline", "dag", "工作流", "流水线"],
    context: "global",
    onSelect({ openScreen }) {
      openScreen({ screenId: "workflows" });
    },
  });
  client.addCommandCenterItem({
    id: "new-bot",
    title: tMsg("plugin.newBot"),
    icon: "Plus",
    keywords: ["bot", "create", "assistant", "新建", "助手"],
    context: "global",
    onSelect({ openScreen }) {
      requestIntent({ kind: "new-bot" });
      openScreen({ screenId: BOTS_SCREEN });
    },
  });
  // Bot chats opened in Paseo's own agent view get the same /learn and skill cards.
  client.addSlashCommand({
    ...LEARN_COMMAND,
    description: tMsg("plugin.learnDescription"),
    argumentHint: tMsg("plugin.learnArgHint"),
    context: "agent",
    async onSubmit({ agent, args, paseo }) {
      if (!agent.labels[BOT_LABEL]) throw new Error(translateNow("plugin.learnOnlyInBotChats"));
      await paseo.agents.ref(agent.id).send(learnPrompt(args));
    },
  });
  client.addSlashCommand({
    ...REMEMBER_COMMAND,
    description: tMsg("plugin.rememberDescription"),
    argumentHint: tMsg("plugin.rememberArgHint"),
    context: "agent",
    async onSubmit({ agent, args, paseo }) {
      if (!agent.labels[BOT_LABEL]) throw new Error(translateNow("plugin.rememberOnlyInBotChats"));
      await paseo.agents.ref(agent.id).send(rememberPrompt(args));
    },
  });
  client.addSlashCommand({
    name: "feed",
    description: tMsg("plugin.feedDescription"),
    argumentHint: tMsg("plugin.feedArgHint"),
    context: "agent",
    onSubmit({ agent, args, openScreen }) {
      const trimmed = args.trim();
      if (trimmed.startsWith("team:")) {
        const id = trimmed.slice("team:".length).trim();
        if (id) {
          openScreen(feedScreen("team", id));
          return;
        }
      }
      if (trimmed.startsWith("bot:")) {
        const id = trimmed.slice("bot:".length).trim();
        if (id) {
          openScreen(feedScreen("bot", id));
          return;
        }
      }
      if (trimmed) {
        openScreen(feedScreen(trimmed.startsWith("team-") ? "team" : "bot", trimmed));
        return;
      }
      const teamId = agent.labels?.[TEAM_SESSION_LABEL]?.trim();
      if (teamId && teamId.startsWith("team-")) {
        openScreen(feedScreen("team", teamId));
        return;
      }
      const botId = agent.labels?.[BOT_LABEL]?.trim();
      if (botId) {
        openScreen(feedScreen("bot", botId));
        return;
      }
      openScreen(feedScreen("bot", ""));
    },
  });
  client.addSlashCommand({
    name: "team",
    description: tMsg("plugin.teamDescription"),
    argumentHint: tMsg("plugin.teamArgHint"),
    context: "agent",
    onSubmit({ agent, args, openScreen }) {
      const trimmed = args.trim();
      if (trimmed) {
        const id = trimmed.startsWith("team:") ? trimmed.slice("team:".length).trim() : trimmed;
        if (id) {
          openScreen(teamChatScreen(id));
          return;
        }
      }
      const teamId = agent.labels?.[TEAM_SESSION_LABEL]?.trim();
      if (teamId && teamId.startsWith("team-")) {
        openScreen(teamChatScreen(teamId));
        return;
      }
      openScreen(teamsScreen());
    },
  });
  client.addSlashCommand({
    name: "workflows",
    description: tMsg("plugin.workflowsDescription"),
    argumentHint: tMsg("plugin.workflowsArgHint"),
    context: "agent",
    onSubmit({ agent, args, openScreen }) {
      const trimmed = args.trim();
      if (trimmed) {
        openScreen(workflowsScreen(trimmed));
        return;
      }
      const teamId = agent.labels?.[TEAM_SESSION_LABEL]?.trim();
      if (teamId && teamId.startsWith("team-")) {
        openScreen(workflowsScreen(`team:${teamId}`));
        return;
      }
      const botId = agent.labels?.[BOT_LABEL]?.trim();
      if (botId) {
        openScreen(workflowsScreen(`bot:${botId}`));
        return;
      }
      openScreen(workflowsScreen());
    },
  });
  client.addTimelineTransformer({
    id: "proposals",
    query: { itemType: "tool_call" },
    transform({ item }) {
      const proposalId = proposalIdOf(item);
      return proposalId ? { items: [{ type: "plugin", kind: "proposal", version: 1, data: { proposalId } }] } : undefined;
    },
  });
  client.addTimelineRenderer({
    kind: "proposal",
    version: 1,
    schema: z.object({ proposalId: z.string() }),
    Component: ({ item, theme, layout }) => <ProposalCard colors={theme.colors} compact={layout.compact} proposalId={item.data.proposalId} />,
  });
  // A bot's request to connect an app, in Paseo's view too.
  client.addTimelineTransformer({
    id: "app-sign-ins",
    query: { itemType: "tool_call" },
    transform({ item }) {
      const signIns = appSignIns(item);
      return signIns.length ? { items: signIns.map((data) => ({ type: "plugin", ...APP_SIGN_IN_CARD, data })) } : undefined;
    },
  });
  client.addTimelineRenderer({
    ...APP_SIGN_IN_CARD,
    schema: AppSignInSchema,
    Component: ({ item, agentId, timestamp, theme }) => <NativeConnectCard colors={theme.colors} signIn={item.data} since={timestamp.getTime()} agentId={agentId} />,
  });
  // A routine's results chat opened in Paseo's view shows its run cards too (no navigation there).
  client.addTimelineRenderer({
    ...ROUTINE_RUN_CARD,
    schema: RoutineRunCardSchema,
    Component: ({ item, theme }) => <RoutineRunCard colors={theme.colors} card={item.data} />,
  });
  client.addTimelineRenderer({
    ...INTERACTION_CARD,
    schema: InteractionSchema,
    Component: ({ item, theme, layout }) => <InteractionCard colors={theme.colors} compact={layout.compact} initial={item.data} />,
  });
  client.addTimelineTransformer({ id: "interactive-card-recovery", query: { itemType: "tool_call" }, transform({ item }) {
    const id = interactionIdOf(item);
    return id ? { items: [{ type: "plugin", kind: "interaction-reference", version: 1, data: { id } }] } : undefined;
  } });
  client.addTimelineRenderer({ kind: "interaction-reference", version: 1, schema: z.object({ id: InteractionIdSchema }), Component: ({ item, agentId }) => <InteractionRecovery id={item.data.id} agentId={agentId} /> });
  client.addTimelineRenderer({
    ...HANDOFF_CARD,
    schema: HandoffCardSchema,
    Component: ({ item, theme, layout, ...rest }) => (
      <HandoffCard
        colors={theme.colors}
        compact={layout.compact}
        card={item.data}
        onOpenChat={(botId, chatId) => {
          navigateToAgentChat(chatId, {
            botId,
            client,
            navigation: (rest as any).navigation,
          });
        }}
      />
    ),
  });
  client.addTimelineRenderer({
    ...TASK_CARD,
    schema: TaskCardSchema,
    Component: ({ item, theme, ...rest }) => (
      <TaskCardView
        colors={theme.colors}
        card={item.data}
        onOpenChat={(chatId, botId) => {
          navigateToAgentChat(chatId, {
            botId,
            client,
            navigation: (rest as any).navigation,
          });
        }}
        onOpenTeamFeed={(groupId) => client.openScreen(feedScreen("team", groupId))}
        onOpenSourceChat={(chatId) => {
          navigateToAgentChat(chatId, {
            client,
            navigation: (rest as any).navigation,
          });
        }}
      />
    ),
  });
  client.addTimelineTransformer({
    id: "companion-intent-user",
    query: { itemType: "user_message" },
    transform({ item }) {
      if (typeof item.text !== "string") return undefined;
      const companion = parseCompanionIntentEnvelope(item.text);
      if (!companion) return undefined;
      return {
        items: [
          {
            type: "plugin",
            kind: "companion-intent-bubble",
            version: 1,
            data: {
              rawUserText: companion.rawUserText,
              turnIndex: companion.turnIndex,
              distilledIntent: companion.distilledIntent,
              compiledPrompt: companion.compiledPrompt,
            },
          },
        ],
      };
    },
  });
  client.addTimelineRenderer({
    kind: "companion-intent-bubble",
    version: 1,
    schema: z.object({
      rawUserText: z.string(),
      turnIndex: z.number(),
      distilledIntent: z.string(),
      compiledPrompt: z.string(),
    }),
    Component: ({ item, theme }) => (
      <View
        style={{
          backgroundColor: nativeTokens(theme.colors).surface3,
          borderRadius: 16,
          borderTopRightRadius: 2,
          paddingHorizontal: 16,
          paddingVertical: 12,
          maxWidth: "85%",
          alignSelf: "flex-end",
          gap: 8,
          marginVertical: 4,
        }}
      >
        <Text
          selectable
          style={{
            color: theme.colors.foreground,
            fontSize: 13,
            lineHeight: 18,
          }}
        >
          {item.data.rawUserText}
        </Text>
        <CompanionIntentBadge colors={theme.colors} companion={item.data} />
      </View>
    ),
  });
  client.addTimelineTransformer({
    id: "protocol-cards-assistant",
    query: { itemType: "assistant_message" },
    transform({ item }) {
      return transformAssistantProtocolCards(item);
    },
  });
  client.addTimelineTransformer({
    id: "protocol-cards-user",
    query: { itemType: "user_message" },
    transform({ item }) {
      return transformUserProtocolCards(item);
    },
  });
  client.addTimelineRenderer({
    kind: "protocol-card",
    version: 1,
    schema: z.object({ text: z.string(), role: z.enum(["user", "assistant"]).optional() }),
    Component: ({ item, theme }) => {
      const segments = segmentProtocolBlocks(item.data.text);
      return (
        <View style={{ gap: 6, marginVertical: 4 }}>
          {segments.map((seg, idx) =>
            seg.kind === "protocol" ? (
              <ProtocolCard key={`proto-${idx}`} colors={theme.colors} segment={seg} />
            ) : item.data.role === "user" ? (
              <Text key={`txt-${idx}`} selectable style={{ color: theme.colors.foreground, fontSize: 13, lineHeight: 18 }}>
                {seg.text}
              </Text>
            ) : (
              <Markdown key={`md-${idx}`} colors={theme.colors} text={seg.text} />
            ),
          )}
        </View>
      );
    },
  });
  return () => {
    removeLauncherButtons();
    stopI18n();
    removeTooltips();
  };
}
