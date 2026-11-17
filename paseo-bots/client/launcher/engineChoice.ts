/**
 * Purpose: Local engine-choice options for the new-chat launcher (default + two subagent engines).
 * Context: Keeps the client option list decoupled from shared/chat runtime exports so tests can mock shared/chat.
 * Usage: ENGINE_CHOICES.map(...) in BotLauncherCore; toEngine(choice) at launch time.
 * Prerequisites: shared/chat must keep SubagentEngine = "native" | "paseo-bot".
 */

import type { SubagentEngine } from "../../shared/chat";

export const ENGINE_CHOICES = ["default", "native", "paseo-bot"] as const;

export type EngineChoice = (typeof ENGINE_CHOICES)[number];

/** Map a UI choice to the wire engine; "default" means "omit the key entirely". */
export function toEngine(choice: EngineChoice): SubagentEngine | null {
  switch (choice) {
    case "default":
      return null;
    case "native":
      return "native";
    case "paseo-bot":
      return "paseo-bot";
    default: {
      const unreachable: never = choice;
      throw new Error(`Unknown engine choice "${String(unreachable)}"`);
    }
  }
}

export type EngineLabelKey = "launcher.engineDefault" | "launcher.engineNative" | "launcher.enginePaseoBot";

/** i18n key for each choice, kept next to the option list to stay in sync. */
export function engineLabelKey(choice: EngineChoice): EngineLabelKey {
  switch (choice) {
    case "default":
      return "launcher.engineDefault";
    case "native":
      return "launcher.engineNative";
    case "paseo-bot":
      return "launcher.enginePaseoBot";
  }
}
