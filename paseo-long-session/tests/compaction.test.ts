import { test } from "node:test";
import assert from "node:assert/strict";
import { handleTurnAfter, isCompactionTurn, isLongSessionEligible, resolveEffectiveThreshold } from "../server/compaction.ts";
import {
  DEFAULT_COMPACT_THRESHOLD_TOKENS,
  DEFAULT_LONG_SESSION_SETTINGS,
  GLOBAL_ASSISTANT_LABEL,
  LONG_SESSION_ENABLED_LABEL,
  LONG_SESSION_SYNC_METADATA,
  LONG_SESSION_THRESHOLD_LABEL,
  MAX_COMPACT_THRESHOLD_TOKENS,
  MIN_COMPACT_THRESHOLD_TOKENS,
} from "../shared/protocol.ts";

test("resolveEffectiveThreshold handles default 250K, label overrides, settings overrides, and clamping", () => {
  assert.equal(resolveEffectiveThreshold(undefined, DEFAULT_LONG_SESSION_SETTINGS), 250_000);
  assert.equal(
    resolveEffectiveThreshold(undefined, { defaultThresholdTokens: 280_000 }),
    280_000,
  );
  assert.equal(
    resolveEffectiveThreshold({ [LONG_SESSION_THRESHOLD_LABEL]: "300000" }, { defaultThresholdTokens: 250_000 }),
    300_000,
  );
  // Clamping below min or above max
  assert.equal(
    resolveEffectiveThreshold({ [LONG_SESSION_THRESHOLD_LABEL]: "1000" }, { defaultThresholdTokens: 250_000 }),
    MIN_COMPACT_THRESHOLD_TOKENS,
  );
  assert.equal(
    resolveEffectiveThreshold({ [LONG_SESSION_THRESHOLD_LABEL]: "5000000" }, { defaultThresholdTokens: 250_000 }),
    MAX_COMPACT_THRESHOLD_TOKENS,
  );
  // Invalid label falls back cleanly to settings/default
  assert.equal(
    resolveEffectiveThreshold({ [LONG_SESSION_THRESHOLD_LABEL]: "abc" }, { defaultThresholdTokens: 260_000 }),
    260_000,
  );
  assert.equal(
    resolveEffectiveThreshold({ [LONG_SESSION_THRESHOLD_LABEL]: "-50" }, {}),
    DEFAULT_COMPACT_THRESHOLD_TOKENS,
  );
});

test("isLongSessionEligible gates strictly on labels unless enabledForAllAntigravity is true", () => {
  assert.equal(isLongSessionEligible({ provider: "antigravity", labels: {} }), false);
  assert.equal(isLongSessionEligible({ provider: "claude", labels: { [GLOBAL_ASSISTANT_LABEL]: "true" } }), true);
  assert.equal(isLongSessionEligible({ provider: "agy", labels: { [LONG_SESSION_ENABLED_LABEL]: "true" } }), true);
  assert.equal(
    isLongSessionEligible({ provider: "antigravity", labels: {} }, { enabledForAllAntigravity: true }),
    true,
  );
  assert.equal(
    isLongSessionEligible({ provider: "agy", labels: {} }, { enabledForAllAntigravity: true }),
    true,
  );
  assert.equal(
    isLongSessionEligible({ provider: "claude", labels: {} }, { enabledForAllAntigravity: true }),
    false,
  );
});

test("isCompactionTurn detects both native compaction items and /compact user commands", () => {
  assert.equal(
    isCompactionTurn([{ turnId: "t1", item: { type: "compaction" } }], "t1"),
    true,
  );
  assert.equal(
    isCompactionTurn([{ turnId: "t1", item: { type: "user_message", text: "/compact focus on blockers" } }], "t1"),
    true,
  );
  assert.equal(
    isCompactionTurn([{ turnId: "t1", item: { type: "user_message", text: "/compact" } }], "t2"),
    false,
  );
  assert.equal(
    isCompactionTurn([{ turnId: "t1", item: { type: "user_message", text: "regular prompt" } }], "t1"),
    false,
  );
});

function mockHarness(opts: {
  provider?: string;
  labels?: Record<string, string>;
  metadata?: Record<string, unknown>;
  usedTokens?: number;
  commands?: Array<{ name: string; kind: string }>;
  entries?: Array<{ turnId: string; item: Record<string, unknown> }>;
  archivedAt?: string | null;
  activeTurn?: string | null;
}) {
  const sent: Array<{ text: string; options: unknown }> = [];
  const metadataPatches: Array<Record<string, unknown>> = [];
  const sessionObj = {
    lastUsage: opts.usedTokens !== undefined ? { contextWindowUsedTokens: opts.usedTokens } : null,
    archivedAt: opts.archivedAt ?? null,
    activeTurn: opts.activeTurn ?? null,
    metadata: opts.metadata ?? {},
    async refresh() {
      return {};
    },
    timeline: {
      async refetch() {
        return { entries: opts.entries ?? [{ turnId: "t1", item: { type: "user_message", text: "hi" } }] };
      },
    },
    async commands() {
      return { commands: opts.commands ?? [{ name: "compact", kind: "command" }] };
    },
    async setMetadata(patch: Record<string, unknown>) {
      metadataPatches.push(patch);
      sessionObj.metadata = { ...sessionObj.metadata, ...patch };
    },
    async send(text: string, options: unknown) {
      sent.push({ text, options });
    },
  };

  const event = {
    agent: {
      id: "agent-1",
      provider: opts.provider ?? "antigravity",
      purpose: "interactive" as const,
      title: "Chief",
      background: false,
      labels: opts.labels ?? { [GLOBAL_ASSISTANT_LABEL]: "true" },
      metadata: opts.metadata ?? {},
      tools: [],
      env: {},
      mcpServers: {},
    },
    outcome: { kind: "completed" as const },
    turnId: "t1",
  };

  const context = {
    paseo: {
      agents: {
        ref() {
          return sessionObj;
        },
      },
    },
  };

  return { sent, metadataPatches, event, context };
}

test("handleTurnAfter triggers /compact at >= 250K across providers supporting compact command", async () => {
  for (const provider of ["antigravity", "agy", "claude"]) {
    const h = mockHarness({ provider, usedTokens: 250_000 });
    await handleTurnAfter(h.event as any, h.context as any, DEFAULT_LONG_SESSION_SETTINGS);
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0]!.text, "/compact");
    assert.deepEqual(h.sent[0]!.options, {
      activeTurnBehavior: "steer",
      messageId: "long-session-compact:t1",
    });
  }
});

test("handleTurnAfter skips when provider lacks compact command, below threshold, or inactive", async () => {
  const noCmd = mockHarness({ commands: [{ name: "help", kind: "command" }], usedTokens: 290_000 });
  await handleTurnAfter(noCmd.event as any, noCmd.context as any, DEFAULT_LONG_SESSION_SETTINGS);
  assert.equal(noCmd.sent.length, 0);

  const below = mockHarness({ usedTokens: 249_999 });
  await handleTurnAfter(below.event as any, below.context as any, DEFAULT_LONG_SESSION_SETTINGS);
  assert.equal(below.sent.length, 0);

  const archived = mockHarness({ usedTokens: 290_000, archivedAt: "2026-11-20T00:00:00Z" });
  await handleTurnAfter(archived.event as any, archived.context as any, DEFAULT_LONG_SESSION_SETTINGS);
  assert.equal(archived.sent.length, 0);

  const unmarked = mockHarness({ labels: {}, usedTokens: 290_000 });
  await handleTurnAfter(unmarked.event as any, unmarked.context as any, DEFAULT_LONG_SESSION_SETTINGS);
  assert.equal(unmarked.sent.length, 0);
});

test("handleTurnAfter records pendingMemorySync on compaction turn without looping", async () => {
  const h = mockHarness({
    usedTokens: 260_000,
    metadata: {
      [LONG_SESSION_SYNC_METADATA]: {
        pendingMemorySync: false,
        lastSyncedMemoryHash: "abc123",
        compactionCount: 2,
      },
    },
    entries: [{ turnId: "t1", item: { type: "user_message", text: "/compact" } }],
  });

  await handleTurnAfter(h.event as any, h.context as any, DEFAULT_LONG_SESSION_SETTINGS);
  assert.equal(h.sent.length, 0);
  assert.equal(h.metadataPatches.length, 1);
  const patch = h.metadataPatches[0]![LONG_SESSION_SYNC_METADATA] as Record<string, unknown>;
  assert.equal(patch.pendingMemorySync, true);
  assert.equal(patch.lastSyncedMemoryHash, "abc123");
  assert.equal(patch.compactionCount, 3);
  assert.equal(patch.compactedAtTurnId, "t1");
});
