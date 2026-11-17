/**
 * Purpose: Shared Zod RPC contracts and data schemas for the Paseo Sidecar plugin.
 * Context: Imported by both server (index.server.ts / server/) and client (index.client.tsx / client/) entries.
 * Usage: Import RPC definitions and types from "./shared/contracts.js".
 * Prerequisites: @getpaseo/plugin and zod (runtime-neutral only; no Node or React imports).
 */
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const SkillSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  rootPath: z.string(),
});
export type SkillSummary = z.infer<typeof SkillSummarySchema>;

export const PluginSummarySchema = z.object({
  pluginId: z.string(),
  version: z.string().optional(),
  sourcePlatform: z.string().optional(),
  enabled: z.boolean().optional(),
  skillsCount: z.number().int(),
  mcpsCount: z.number().int(),
  hooksCount: z.number().int(),
});
export type PluginSummary = z.infer<typeof PluginSummarySchema>;

export const McpSummarySchema = z.object({
  id: z.string(),
  scope: z.string().optional(),
  transport: z.enum(["stdio", "http"]),
  commandOrUrl: z.string().optional(),
});
export type McpSummary = z.infer<typeof McpSummarySchema>;

export const WorkspaceRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  canonicalCwd: z.string(),
  enabled: z.boolean(),
  runtimes: z.array(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  priority: z.number().int().nullable().optional(),
});
export type WorkspaceRule = z.infer<typeof WorkspaceRuleSchema>;

export const SidecarStatusOutputSchema = z.object({
  sidecarHome: z.string(),
  workspacesFile: z.string(),
  adminUrl: z.string(),
  adminReachable: z.boolean(),
  skills: z.array(SkillSummarySchema),
  plugins: z.array(PluginSummarySchema),
  mcps: z.array(McpSummarySchema),
  workspaces: z.array(WorkspaceRuleSchema),
});
export type SidecarStatusOutput = z.infer<typeof SidecarStatusOutputSchema>;

export const sidecarStatusRpc = defineRpc({
  name: "sidecar.status",
  input: z.object({}),
  output: SidecarStatusOutputSchema,
});

export const ConvergedPlatformResultSchema = z.object({
  platform: z.string(),
  movedSkills: z.number().int(),
  movedMcps: z.number().int(),
  error: z.string().optional(),
});
export type ConvergedPlatformResult = z.infer<typeof ConvergedPlatformResultSchema>;

export const SidecarDiscoverOutputSchema = z.object({
  discovered: z.object({
    skills: z.number().int(),
    plugins: z.number().int(),
    mcps: z.number().int(),
  }),
  converged: z.array(ConvergedPlatformResultSchema),
  totalMovedSkills: z.number().int(),
  totalMovedMcps: z.number().int(),
});
export type SidecarDiscoverOutput = z.infer<typeof SidecarDiscoverOutputSchema>;

export const sidecarDiscoverRpc = defineRpc({
  name: "sidecar.discover",
  input: z.object({}),
  output: SidecarDiscoverOutputSchema,
});
