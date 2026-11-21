/**
 * Purpose: Manage storage, retrieval, and persistence of decoupled bot soul (.md) files.
 * Context: Paseo bots plugin server runtime, decoupling soul from bots.json.
 * Usage: import { readBotSoul, writeBotSoul, resolveSoulsDir } from "./souls";
 * Prerequisites: Node.js runtime with access to plugin settings storage.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveCurrentDir } from "./bot-home";

const currentDir = resolveCurrentDir(typeof import.meta !== "undefined" ? import.meta.url : undefined);

function assertValidBotId(botId: string): string {
  const trimmed = botId.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.includes("/") || trimmed.includes("\\")) {
    throw new Error(`Invalid bot ID for soul path: "${botId}"`);
  }
  return trimmed;
}

/**
 * Resolves the directory holding decoupled bot souls (`souls/`).
 * Checks environment overrides, Paseo plugin-settings, and local repository paths.
 */
export function resolveSoulsDir(customDir?: string): string {
  if (customDir) return customDir;
  if (process.env.PASEO_BOTS_SOULS_DIR) return process.env.PASEO_BOTS_SOULS_DIR;
  if (process.env.PASEO_BOTS_SETTINGS_DIR) return join(process.env.PASEO_BOTS_SETTINGS_DIR, "souls");

  const paseoHome = process.env.PASEO_HOME || join(homedir(), ".paseo");
  const defaultPath = join(paseoHome, "plugin-settings", "paseo-bots", "souls");
  if (existsSync(defaultPath)) return defaultPath;

  const repoCandidate = resolve(currentDir, "../../paseo-bots-plugin-settings/souls");
  if (existsSync(repoCandidate)) return repoCandidate;

  const cwdParentCandidate = resolve(process.cwd(), "..", "paseo-bots-plugin-settings", "souls");
  if (existsSync(cwdParentCandidate)) return cwdParentCandidate;

  const cwdCandidate = resolve(process.cwd(), "paseo-bots-plugin-settings", "souls");
  if (existsSync(cwdCandidate)) return cwdCandidate;

  const repoCandidateParent = dirname(repoCandidate);
  if (existsSync(repoCandidateParent)) return repoCandidate;

  return defaultPath;
}

export function botSoulPath(botId: string, soulsDir?: string): string {
  const validId = assertValidBotId(botId);
  return join(resolveSoulsDir(soulsDir), `${validId}.md`);
}

/**
 * Reads a bot soul markdown file asynchronously.
 * Falls back to fallbackSoul (or empty string) if the file does not exist.
 */
export async function readBotSoul(botId: string, fallbackSoul?: string, soulsDir?: string): Promise<string> {
  const filePath = botSoulPath(botId, soulsDir);
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallbackSoul ?? "";
    }
    return fallbackSoul ?? "";
  }
}

/**
 * Reads a bot soul markdown file synchronously.
 * Falls back to fallbackSoul (or empty string) if the file does not exist.
 */
export function readBotSoulSync(botId: string, fallbackSoul?: string, soulsDir?: string): string {
  const filePath = botSoulPath(botId, soulsDir);
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return fallbackSoul ?? "";
  }
}

/**
 * Writes a bot soul to its markdown file asynchronously.
 * Ensures the target directory exists and ends with a newline.
 */
export async function writeBotSoul(botId: string, soul: string, soulsDir?: string): Promise<string> {
  const filePath = botSoulPath(botId, soulsDir);
  await mkdir(dirname(filePath), { recursive: true });
  const content = soul.endsWith("\n") ? soul : `${soul}\n`;
  await writeFile(filePath, content, "utf8");
  return filePath;
}

/**
 * Writes a bot soul to its markdown file synchronously.
 * Ensures the target directory exists and ends with a newline.
 */
export function writeBotSoulSync(botId: string, soul: string, soulsDir?: string): string {
  const filePath = botSoulPath(botId, soulsDir);
  mkdirSync(dirname(filePath), { recursive: true });
  const content = soul.endsWith("\n") ? soul : `${soul}\n`;
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * Deletes a bot soul markdown file asynchronously using Node fs.rm.
 */
export async function deleteBotSoul(botId: string, soulsDir?: string): Promise<boolean> {
  const filePath = botSoulPath(botId, soulsDir);
  try {
    await rm(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a bot soul markdown file synchronously using Node fs.rmSync.
 */
export function deleteBotSoulSync(botId: string, soulsDir?: string): boolean {
  const filePath = botSoulPath(botId, soulsDir);
  try {
    rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}
