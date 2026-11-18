import { lstatSync, renameSync, symlinkSync } from "node:fs";
import { lstat, mkdir, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

// The plugin SDK has no data-directory API; other plugins use
// `$PASEO_HOME/plugin-data/<plugin-id>`, so this follows that convention.
function pluginDataRoot(): string {
  return join(process.env.PASEO_HOME || join(homedir(), ".paseo"), "plugin-data");
}

export function pluginDataPath(): string {
  return join(pluginDataRoot(), "paseo-bots");
}

/**
 * The plugin was called paseo-bot before. Move its data (bots' folders, the
 * skill library, the Composio key) to the new name and leave a link behind,
 * so chats started in the old folders keep their working directory. Runs
 * once, synchronously, before anything reads the data folder.
 */
export function migrateRenamedPluginData(): void {
  const legacy = join(pluginDataRoot(), "paseo-bot");
  const target = pluginDataPath();
  try {
    if (!lstatSync(legacy).isDirectory()) return;
  } catch {
    return;
  }
  try {
    lstatSync(target);
    return;
  } catch {
    // No data under the new name yet: move the old folder over.
  }
  renameSync(legacy, target);
  symlinkSync(target, legacy, "junction");
}

/**
 * One folder for every bot that uses the managed folder. Paseo files each agent
 * under the workspace of its folder, so sharing it keeps all bot chats in a
 * single workspace; Paseo names the project after the folder, hence "Bots".
 */
export function botsHomePath(): string {
  // Nested because macOS folders are case-insensitive and "bots" held per-bot folders in v0.1.
  return join(pluginDataPath(), "shared", "Bots");
}

/** Virtual project root folder holding per-team project directories. */
export function teamsHomePath(): string {
  return join(pluginDataPath(), "shared", "Teams");
}

/**
 * Sanitizes a team name for use as a directory basename, since Paseo names
 * projects after their root folder basename and exposes no project rename API.
 */
export function sanitizeTeamFolderName(name: string, fallbackId: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, "-")
    .trim()
    .replace(/[. ]+$/, "");
  if (!cleaned || cleaned === "." || cleaned === "..") return fallbackId;
  return cleaned;
}

/** Virtual project folder for a specific team, used to group its members in the sidebar. */
export function teamHomePath(groupId: string, groupName?: string): string {
  return join(teamsHomePath(), sanitizeTeamFolderName(groupName ?? groupId, groupId));
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

let migration: Promise<void> | null = null;

/**
 * Earlier versions used a folder called "home", which Paseo showed as a "home"
 * project. Move it to "Bots" and leave a link behind so existing chats keep
 * their working folder.
 */
function migrateLegacyHome(): Promise<void> {
  migration ??= (async () => {
    const legacy = join(pluginDataPath(), "home");
    const target = botsHomePath();
    const info = await lstat(legacy).catch(() => null);
    if (!info || info.isSymbolicLink() || !info.isDirectory() || (await exists(target))) return;
    await mkdir(join(target, ".."), { recursive: true });
    await rename(legacy, target);
    await symlink(target, legacy, "dir");
  })().catch((error: unknown) => console.error("paseo-bots: couldn't move the bots folder", error));
  return migration;
}

/**
 * Each bot's own folder: the working folder of its workspace, and where its
 * memory, skills and uploads live so its chats can read and update them.
 */
export function botDataPath(botId: string): string {
  if (!botId || botId === "." || botId === ".." || /[\\/\0]/.test(botId)) throw new Error("Invalid bot ID.");
  return join(botsHomePath(), botId);
}

/**
 * Paseo shows an icon.svg in a project's folder as the project icon. The Bots project gets
 * the plugin's sidebar glyph (Lucide's Bot) in white on a tile shaped and coloured like the
 * project icons Paseo draws itself (project-icon-view.tsx: 25% corners, the muted identity
 * blue), so it reads on light and dark themes alike.
 */
const PROJECT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#5179b0"/><g transform="translate(12.8 12.8) scale(1.6)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></g></svg>`;

export async function ensureBotsHome() {
  await migrateLegacyHome();
  const path = botsHomePath();
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "README.md"), "paseo-bots: one folder per bot, each the working folder of that bot's workspace.\n", { flag: "w" });
  await writeFile(join(path, "icon.svg"), PROJECT_ICON, { flag: "w" });
  return { path };
}

/** Moves data kept under `.bots/<id>` by the previous version into the bot's own folder. */
async function adoptLegacyData(botId: string, target: string): Promise<void> {
  const legacy = join(botsHomePath(), ".bots", botId);
  const names = await readdir(legacy).catch(() => null);
  if (!names) return;
  for (const name of names) {
    const destination = join(target, name);
    if (!(await exists(destination))) await rename(join(legacy, name), destination);
  }
  await rm(legacy, { recursive: true, force: true });
}

export async function ensureBotHome({ botId, groupId, groupName }: { botId: string; groupId?: string; groupName?: string }) {
  const { path: botsRoot } = await ensureBotsHome();
  let root = botsRoot;
  if (groupId) {
    root = teamHomePath(groupId, groupName);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "icon.svg"), PROJECT_ICON, { flag: "w" });
  }
  const path = botDataPath(botId);
  await mkdir(path, { recursive: true });
  await adoptLegacyData(botId, path);
  return { root, path };
}

export interface ManagedHomePaths {
  /** Paseo sidebar grouping root: Bots/ for DM, Teams/<team>/ for teamwork. */
  root: string;
  /** Process CWD: Bots/<botId> for DM, Teams/<team>/agents/<botId> (or stage override seat) for teamwork. */
  path: string;
  /** Always Bots/<botId>, holding personal MEMORY.md regardless of DM or teamwork mode. */
  botHomePath: string;
  /** Teams/<team> when groupId is present, else null. */
  teamRootPath: string | null;
  /** Bots/<botId>/sessions/<sessionId> or Teams/<team>/sessions/<sessionId>. */
  sessionBoardPath: string;
  /** Directory under sessionBoardPath/runs for <agentId>.prompt.md and <agentId>.mcp.json. */
  runsPath: string;
}

export function teamAgentSeatPath(groupId: string, botId: string, groupName?: string): string {
  if (!botId || botId === "." || botId === ".." || /[\\/\0]/.test(botId)) throw new Error("Invalid bot ID.");
  return join(teamHomePath(groupId, groupName), "agents", botId);
}

export function teamSessionBoardPath(groupId: string, teamSessionId: string, groupName?: string): string {
  if (!teamSessionId || teamSessionId === "." || teamSessionId === ".." || /[\\/\0]/.test(teamSessionId)) {
    throw new Error("Invalid session ID.");
  }
  return join(teamHomePath(groupId, groupName), "sessions", teamSessionId);
}

export function directSessionBoardPath(botId: string, sessionId: string): string {
  if (!sessionId || sessionId === "." || sessionId === ".." || /[\\/\0]/.test(sessionId)) {
    throw new Error("Invalid session ID.");
  }
  return join(botDataPath(botId), "sessions", sessionId);
}

export async function ensureManagedSessionHome(input: {
  botId: string;
  sessionId: string;
  groupId?: string;
  groupName?: string;
  stageSeatKey?: string; // "<stageId>-<botId>" when stage.skillIds overrides bot.skillIds
}): Promise<ManagedHomePaths> {
  const { botId, sessionId, groupId, groupName, stageSeatKey } = input;
  const { path: botsRoot } = await ensureBotsHome();
  const botHome = botDataPath(botId);
  await mkdir(botHome, { recursive: true });
  await adoptLegacyData(botId, botHome);

  let root = botsRoot;
  let teamRootPath: string | null = null;
  let sessionBoardPath: string;
  let path: string;

  if (groupId) {
    teamRootPath = teamHomePath(groupId, groupName);
    root = teamRootPath;
    await mkdir(teamRootPath, { recursive: true });
    await writeFile(join(teamRootPath, "icon.svg"), PROJECT_ICON, { flag: "w" });

    sessionBoardPath = teamSessionBoardPath(groupId, sessionId, groupName);
    if (stageSeatKey) {
      if (!stageSeatKey || stageSeatKey === "." || stageSeatKey === ".." || /[\\/\0]/.test(stageSeatKey)) {
        throw new Error("Invalid stage seat key.");
      }
      path = join(sessionBoardPath, "seats", stageSeatKey);
    } else {
      path = teamAgentSeatPath(groupId, botId, groupName);
    }
  } else {
    root = botsRoot;
    teamRootPath = null;
    sessionBoardPath = directSessionBoardPath(botId, sessionId);
    path = botHome;
  }

  await mkdir(path, { recursive: true });

  const runsPath = join(sessionBoardPath, "runs");
  await mkdir(join(sessionBoardPath, "handoffs"), { recursive: true });
  await mkdir(join(sessionBoardPath, "artifacts"), { recursive: true });
  await mkdir(runsPath, { recursive: true });

  return {
    root,
    path,
    botHomePath: botHome,
    teamRootPath,
    sessionBoardPath,
    runsPath,
  };
}
