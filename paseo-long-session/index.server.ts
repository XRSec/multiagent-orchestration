import type { PluginServerContext } from "@getpaseo/plugin/server";
import { handleTurnAfter } from "./server/compaction.ts";
import {
  DEFAULT_LONG_SESSION_SETTINGS,
  longSessionSettings,
  type LongSessionSettings,
} from "./shared/protocol.ts";

export default function contribute(server: PluginServerContext) {
  const settingsHandle = server.registerSettings(longSessionSettings);

  return server.addHook("agent.turn.after", async (event, context) => {
    let settings: LongSessionSettings = DEFAULT_LONG_SESSION_SETTINGS;
    try {
      const state = await settingsHandle.read();
      if (state.status === "ready") {
        settings = state.values;
      }
    } catch {
      settings = DEFAULT_LONG_SESSION_SETTINGS;
    }

    await handleTurnAfter(event, context, settings);
  });
}
