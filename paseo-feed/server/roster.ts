/**
 * Purpose: Loads Paseo Bots roster definitions (bots and teams) from bots.json.
 * Context: Used by sync and RPC handlers to resolve channel metadata and team memberships.
 * Usage: loadRoster(), findRosterBot(), findRosterGroup(), groupsContainingBot().
 * Prerequisites: Optional PASEO_BOTS_SETTINGS_PATH env var or default ~/.paseo/plugin-settings/paseo-bots/bots.json.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChannelKind } from "../shared/protocol.ts";

export interface RosterBot {
  id: string;
  name: string;
  subtitle: string;
  pinned: boolean;
  archived: boolean;
  isGlobalAssistant: boolean;
  longSessionEnabled?: boolean;
  cwd?: string;
  model?: string;
  provider?: string;
  engine?: string;
}

export interface RosterGroup {
  id: string;
  name: string;
  subtitle: string;
  leadId: string | null;
  memberIds: string[];
  pinned: boolean;
  archived: boolean;
  cwd?: string;
}

export interface RosterSnapshot {
  bots: RosterBot[];
  groups: RosterGroup[];
}

export function resolveBotsSettingsPath(overridePath?: string): string {
  return (
    overridePath ||
    process.env.PASEO_BOTS_SETTINGS_PATH ||
    path.join(os.homedir(), ".paseo", "plugin-settings", "paseo-bots", "bots.json")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstText(candidates: unknown[], maxLen = 120): string {
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const collapsed = raw.replace(/\s+/g, " ").trim();
    if (collapsed) {
      return collapsed.length > maxLen ? `${collapsed.slice(0, maxLen - 3)}...` : collapsed;
    }
  }
  return "";
}

function optionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseBot(raw: unknown): RosterBot | null {
  const rec = asRecord(raw);
  if (!rec || typeof rec.id !== "string" || !rec.id.trim()) return null;
  const id = rec.id.trim();
  const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : id;
  const cwd = optionalText(rec.cwd);
  const model = optionalText(rec.model);
  const provider = optionalText(rec.provider);
  const engine = optionalText(rec.engine);
  return {
    id,
    name,
    subtitle: firstText([rec.title, rec.description], 160),
    pinned: rec.pinned === true,
    archived: rec.archived === true,
    isGlobalAssistant: rec.isGlobalAssistant === true || id === "bot-chief",
    ...(typeof rec.longSessionEnabled === "boolean" ? { longSessionEnabled: rec.longSessionEnabled } : {}),
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
    ...(provider ? { provider } : {}),
    ...(engine ? { engine } : {}),
  };
}

function parseGroup(raw: unknown): RosterGroup | null {
  const rec = asRecord(raw);
  if (!rec || typeof rec.id !== "string" || !rec.id.trim()) return null;
  const id = rec.id.trim();
  const name = typeof rec.name === "string" && rec.name.trim() ? rec.name.trim() : id;
  const leadId = typeof rec.leadId === "string" && rec.leadId.trim() ? rec.leadId.trim() : null;
  const rawMembers = Array.isArray(rec.memberIds) ? rec.memberIds : [];
  const memberIds = Array.from(
    new Set(rawMembers.filter((m): m is string => typeof m === "string" && m.trim().length > 0).map((m) => m.trim())),
  );
  const subtitle = firstText([rec.subtitle, rec.description, rec.instructions], 120) || `${memberIds.length} members`;
  const cwd = optionalText(rec.cwd);
  return {
    id,
    name,
    subtitle,
    leadId,
    memberIds,
    pinned: rec.pinned === true,
    archived: rec.archived === true,
    ...(cwd ? { cwd } : {}),
  };
}

export function loadRoster(overridePath?: string): RosterSnapshot {
  const filePath = resolveBotsSettingsPath(overridePath);
  try {
    if (!fs.existsSync(filePath)) return { bots: [], groups: [] };
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    const root = asRecord(parsed);
    const values = asRecord(root?.values) ?? root;
    const rawBots = Array.isArray(values?.bots) ? values.bots : [];
    const rawGroups = Array.isArray(values?.groups) ? values.groups : [];
    return {
      bots: rawBots.map(parseBot).filter((b): b is RosterBot => b !== null),
      groups: rawGroups.map(parseGroup).filter((g): g is RosterGroup => g !== null),
    };
  } catch {
    return { bots: [], groups: [] };
  }
}

export function findRosterBot(roster: RosterSnapshot, botId: string): RosterBot | null {
  return roster.bots.find((b) => b.id === botId) ?? null;
}

export function findRosterGroup(roster: RosterSnapshot, groupId: string): RosterGroup | null {
  return roster.groups.find((g) => g.id === groupId) ?? null;
}

export function groupsContainingBot(roster: RosterSnapshot, botId: string): RosterGroup[] {
  return roster.groups.filter((g) => g.leadId === botId || g.memberIds.includes(botId));
}

export function resolveGroupBotIds(group: RosterGroup): string[] {
  const ids = new Set<string>();
  if (group.leadId) ids.add(group.leadId);
  for (const memberId of group.memberIds) ids.add(memberId);
  return [...ids];
}

/** Resolves the lead or fallback member bot for a direct bot or team channel. */
export function resolveChannelLeadBot(
  roster: RosterSnapshot,
  channelKind: ChannelKind,
  channelId: string,
): { bot: RosterBot; group?: RosterGroup } | null {
  if (channelKind === "bot") {
    const bot = findRosterBot(roster, channelId);
    return bot ? { bot } : null;
  }
  const group = findRosterGroup(roster, channelId);
  if (!group) return null;
  if (group.leadId) {
    const lead = findRosterBot(roster, group.leadId);
    if (lead) return { bot: lead, group };
  }
  for (const memberId of group.memberIds) {
    const member = findRosterBot(roster, memberId);
    if (member) return { bot: member, group };
  }
  return null;
}
