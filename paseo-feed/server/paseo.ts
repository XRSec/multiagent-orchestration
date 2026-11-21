/**
 * Purpose: Local PaseoApi type alias derived from the plugin server context.
 * Context: Prevents direct imports of @getpaseo/client inside server modules.
 * Usage: import type { PaseoApi } from "./paseo.ts";
 * Prerequisites: @getpaseo/plugin installed.
 */

import type { PluginHandlerContext } from "@getpaseo/plugin/server";

export type PaseoApi = PluginHandlerContext["paseo"];
