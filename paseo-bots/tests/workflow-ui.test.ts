import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { formatElapsedDuration } from "../shared/workflows";
import { taskCardOf, type TaskCardWorkflowStage } from "../shared/task-card";
import { navigateToAgentChat, setGlobalNavigation } from "../client/navigation";
import { TaskStageModal } from "../client/chat/stream/TaskStageModal";
import { TaskCardView, MAX_ACTIVE_DURATION_MS } from "../client/chat/stream/TaskCard";

vi.mock("@getpaseo/plugin/client", () => ({
  useSettings: () => ({ status: "ready", values: { bots: [] } }),
}));

vi.mock("../client/motion", () => ({
  useReduceMotion: () => false,
}));

vi.mock("@getpaseo/plugin/client/react-native", () => ({
  copyText: vi.fn(async () => {}),
  useToast: () => ({ show: vi.fn(), error: vi.fn() }),
  Modal: Object.assign(
    ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? children : null),
    { Content: ({ children }: { children: React.ReactNode }) => children },
  ),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "web", select: (o: Record<string, unknown>) => o.web ?? o.default },
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
}));

vi.mock("@getpaseo/plugin/client/ui", () => ({
  Icon: "Icon",
}));

vi.mock("../client/Avatar", () => ({
  Avatar: "Avatar",
}));

vi.mock("../client/i18n", () => ({
  useT: () => ({ t: (k: string) => k }),
}));

vi.mock("../client/panel/controls", () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) =>
    React.createElement("button", { "data-testid": "button", "data-label": label, onClick: onPress }, label),
  StatusBadge: "StatusBadge",
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("formatElapsedDuration", () => {
  it("returns null when start is absent or invalid", () => {
    expect(formatElapsedDuration(null, null)).toBeNull();
    expect(formatElapsedDuration(undefined, undefined)).toBeNull();
    expect(formatElapsedDuration("not-a-date", null)).toBeNull();
  });

  it("formats seconds correctly", () => {
    const start = new Date(1000000000000).toISOString();
    const end = new Date(1000000042000).toISOString(); // +42s
    expect(formatElapsedDuration(start, end)).toBe("42s");
  });

  it("formats minutes and seconds correctly", () => {
    const start = new Date(1000000000000).toISOString();
    const end = new Date(1000000095000).toISOString(); // +95s = 1m 35s
    expect(formatElapsedDuration(start, end)).toBe("1m 35s");
  });

  it("returns 0s when end is equal to start", () => {
    const start = new Date(1000000000000).toISOString();
    expect(formatElapsedDuration(start, start)).toBe("0s");
  });
});

describe("taskCardOf with workflow stages and durations", () => {
  it("preserves stage prompt, output, chatId, startedAt, and completedAt", () => {
    const card = taskCardOf({
      taskId: "task-123",
      title: "Test Task",
      status: "running",
      version: 1,
      settledAt: null,
      members: [],
      workflow: {
        workflowId: "wf-1",
        workflowName: "Pipeline",
        status: "running",
        startedAt: "2026-03-01T10:00:00Z",
        completedAt: null,
        stages: [
          {
            id: "stage-1",
            name: "Research",
            botId: "bot-modeep",
            engine: "native",
            status: "done",
            dependsOn: [],
            retries: 0,
            maxRetries: 1,
            output: "Research completed successfully.",
            chatId: "chat-xyz",
            startedAt: "2026-03-01T10:00:00Z",
            completedAt: "2026-03-01T10:00:30Z",
            prompt: "Do deep research",
          },
        ],
      },
    });

    expect(card.workflow).toBeDefined();
    expect(card.workflow?.startedAt).toBe("2026-03-01T10:00:00Z");
    const stage = card.workflow?.stages[0];
    expect(stage?.output).toBe("Research completed successfully.");
    expect(stage?.chatId).toBe("chat-xyz");
    expect(stage?.prompt).toBe("Do deep research");
    expect(stage?.startedAt).toBe("2026-03-01T10:00:00Z");
    expect(stage?.completedAt).toBe("2026-03-01T10:00:30Z");
  });
});

describe("navigateToAgentChat", () => {
  afterEach(() => {
    setGlobalNavigation(null);
  });
  it("invokes navigation.openAgent with exact stage chatId", () => {
    const openAgent = vi.fn();
    const result = navigateToAgentChat("chat-stage-123", {
      botId: "bot-modeep",
      navigation: { openAgent },
    });

    expect(result).toBe(true);
    expect(openAgent).toHaveBeenCalledTimes(1);
    expect(openAgent).toHaveBeenCalledWith({ agentId: "chat-stage-123" });
    expect(openAgent).not.toHaveBeenCalledWith({ agentId: "bot-modeep" });
  });

  it("invokes getGlobalNavigation().openAgent with stage.chatId", () => {
    const openAgent = vi.fn();
    setGlobalNavigation({ openAgent });

    const result = navigateToAgentChat("chat-xyz", { botId: "bot-mocode" });
    expect(result).toBe(true);
    expect(openAgent).toHaveBeenCalledWith({ agentId: "chat-xyz" });
    setGlobalNavigation(null);
  });

  it("correctly identifies chatId even if caller passes (botId, chatId) order", () => {
    const openAgent = vi.fn();
    const result = navigateToAgentChat("bot-mocode", "chat-stage-456", {
      navigation: { openAgent },
    });

    expect(result).toBe(true);
    expect(openAgent).toHaveBeenCalledWith({ agentId: "chat-stage-456" });
    expect(openAgent).not.toHaveBeenCalledWith({ agentId: "bot-mocode" });
  });

  it("invokes client.navigation.openChat or client.navigateToAgent", () => {
    const openChat = vi.fn();
    const result1 = navigateToAgentChat("chat-789", {
      client: { navigation: { openChat } },
    });
    expect(result1).toBe(true);
    expect(openChat).toHaveBeenCalledWith("chat-789");

    const navigateToAgent = vi.fn();
    const result2 = navigateToAgentChat("chat-789", {
      client: { navigateToAgent },
    });
    expect(result2).toBe(true);
    expect(navigateToAgent).toHaveBeenCalledWith("chat-789");
  });

  it("does not create a new chat via openScreen when openAgent is available", () => {
    const openAgent = vi.fn();
    const openScreen = vi.fn();
    const result = navigateToAgentChat("chat-target", {
      botId: "bot-mocode",
      navigation: { openAgent },
      client: { openScreen },
    });

    expect(result).toBe(true);
    expect(openAgent).toHaveBeenCalledWith({ agentId: "chat-target" });
    expect(openScreen).not.toHaveBeenCalled();
  });
});

describe("TaskStageModal onOpenChat navigation", () => {
  const dummyColors = {
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#888",
    accent: "#0f0",
  } as any;

  it("invokes onOpenChat with stage.chatId and closes modal cleanly when clicking 打开伙伴对话", () => {
    const onOpenChat = vi.fn();
    const onClose = vi.fn();

    const stage: TaskCardWorkflowStage = {
      id: "stage-1",
      name: "Code Audit",
      botId: "bot-mocode",
      engine: "native",
      status: "done",
      dependsOn: [],
      retries: 0,
      maxRetries: 1,
      output: "Audit finished",
      chatId: "0c5d6313-stage-session",
      startedAt: "2026-03-01T10:00:00Z",
      completedAt: "2026-03-01T10:00:30Z",
    };

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        React.createElement(TaskStageModal, {
          open: true,
          onClose,
          stage,
          workflowName: "CI Workflow",
          colors: dummyColors,
          onOpenChat,
        }),
      );
    });

    const buttons = renderer!.root.findAllByProps({ "data-testid": "button" });
    const openChatBtn = buttons.find((b) => b.props["data-label"] === "workflows.openAgentChat");
    expect(openChatBtn).toBeDefined();

    act(() => {
      openChatBtn!.props.onClick();
    });

    // Verifies onOpenChat was called with exact stage.chatId as first argument
    expect(onOpenChat).toHaveBeenCalledTimes(1);
    expect(onOpenChat).toHaveBeenCalledWith("0c5d6313-stage-session", "bot-mocode");
    // Verifies onClose was called cleanly to dismiss the modal
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render open chat button when stage.chatId is missing", () => {
    const onOpenChat = vi.fn();
    const onClose = vi.fn();

    const stage: TaskCardWorkflowStage = {
      id: "stage-2",
      name: "Pending Stage",
      botId: "bot-modeep",
      engine: "native",
      status: "pending",
      dependsOn: [],
      retries: 0,
      maxRetries: 1,
      chatId: null,
    };

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        React.createElement(TaskStageModal, {
          open: true,
          onClose,
          stage,
          workflowName: "CI Workflow",
          colors: dummyColors,
          onOpenChat,
        }),
      );
    });

    const buttons = renderer!.root.findAllByProps({ "data-testid": "button" });
    const openChatBtn = buttons.find((b) => b.props["data-label"] === "workflows.openAgentChat");
    expect(openChatBtn).toBeUndefined();
  });
});

describe("TaskCardView live timer bounds and stalled indicator (P0-3)", () => {
  const dummyColors = {
    surface0: "#000",
    surface1: "#111",
    surface2: "#222",
    border: "#333",
    foreground: "#fff",
    foregroundMuted: "#888",
    accent: "#0f0",
    statusWarning: "#fa0",
    statusSuccess: "#0f0",
    statusDanger: "#f00",
  } as any;

  it("displays Stalled indicator when elapsed time exceeds MAX_ACTIVE_DURATION_MS (30m)", () => {
    const startedAt = new Date(Date.now() - (MAX_ACTIVE_DURATION_MS + 5 * 60 * 1000)).toISOString();
    const card = taskCardOf({
      taskId: "task-stalled-test",
      title: "Stalled Workflow",
      status: "running",
      version: 1,
      settledAt: null,
      members: [],
      workflow: {
        workflowId: "wf-stalled",
        workflowName: "Stalled WF",
        status: "running",
        startedAt,
        completedAt: null,
        stages: [
          {
            id: "stage-1",
            name: "Audit Stage",
            botId: "bot-mocode",
            engine: "native",
            status: "running",
            dependsOn: [],
            retries: 0,
            maxRetries: 1,
            startedAt,
          },
        ],
      },
    });

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        React.createElement(TaskCardView, {
          colors: dummyColors,
          card,
        }),
      );
    });

    const texts = renderer!.root.findAllByType("Text" as any);
    const hasStalledText = texts.some((t) => t.props.children === "Stalled");
    expect(hasStalledText).toBe(true);
  });

  it("does not display Stalled indicator when workflow is completed or under 30m", () => {
    const startedAt = new Date(Date.now() - 60000).toISOString();
    const completedAt = new Date().toISOString();
    const card = taskCardOf({
      taskId: "task-done-test",
      title: "Completed Workflow",
      status: "done",
      version: 1,
      settledAt: completedAt,
      members: [],
      workflow: {
        workflowId: "wf-done",
        workflowName: "Completed WF",
        status: "done",
        startedAt,
        completedAt,
        stages: [
          {
            id: "stage-1",
            name: "Audit Stage",
            botId: "bot-mocode",
            engine: "native",
            status: "done",
            dependsOn: [],
            retries: 0,
            maxRetries: 1,
            startedAt,
            completedAt,
          },
        ],
      },
    });

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        React.createElement(TaskCardView, {
          colors: dummyColors,
          card,
        }),
      );
    });

    const texts = renderer!.root.findAllByType("Text" as any);
    const hasStalledText = texts.some((t) => t.props.children === "Stalled");
    expect(hasStalledText).toBe(false);
  });
});

describe("workflowRunsRpc single listTasks scan (P2)", () => {
  it("does not scan listTasks() twice in workflowRunsRpc", async () => {
    const listTasksMock = vi.fn(async () => [
      {
        taskId: "task-1",
        title: "T1",
        status: "running" as const,
        version: 1,
        settledAt: null,
        members: [],
        workflow: {
          workflowId: "wf-1",
          workflowName: "WF 1",
          status: "running" as const,
          stages: [],
        },
      },
    ]);

    const workflowRunsHandler = async ({ limit }: { limit?: number }) => {
      const tasks = await listTasksMock();
      const runs = tasks.filter((t) => !!t.workflow).slice(0, limit ?? 25).map((t) => taskCardOf(t));
      return { runs };
    };

    const res = await workflowRunsHandler({ limit: 5 });
    expect(res.runs).toHaveLength(1);
    expect(listTasksMock).toHaveBeenCalledTimes(1);
  });
});
