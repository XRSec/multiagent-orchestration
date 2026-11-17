import { describe, expect, it } from "vitest";
import { formatElapsedDuration } from "../shared/workflows";
import { taskCardOf } from "../shared/task-card";

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
