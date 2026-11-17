/**
 * Purpose: Paseo server plugin entry exposing Sidecar control-plane RPC endpoints.
 * Context: Registers status inspection and host asset discovery/convergence RPCs for the Paseo Sidecar UI shell.
 * Usage: Installed via `paseo plugin install <repo>/paseo-plugin` or cloned under extensions/.
 * Prerequisites: @getpaseo/plugin/server, ./server/control-plane.js, and ./shared/contracts.js.
 */
import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  getSidecarStatus,
  runSidecarDiscoverAndConverge,
} from "./server/control-plane.js";
import { sidecarDiscoverRpc, sidecarStatusRpc } from "./shared/contracts.js";

export default function contribute(server: PluginServerContext) {
  server.handle(sidecarStatusRpc, async () => getSidecarStatus());
  server.handle(sidecarDiscoverRpc, async () => runSidecarDiscoverAndConverge());

  return () => {};
}
