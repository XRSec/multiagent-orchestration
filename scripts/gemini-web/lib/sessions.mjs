#!/usr/bin/env node
// Purpose: Local session registry and URL mapping persistence for Gemini Web chats.
// Context: Manages ~/.paseo/gemini-web-sessions.json across ego and prism backends.
// Usage: import { loadSessions, saveSession, getSession, listSessions } from "./sessions.mjs";
// Prerequisites: Node.js >= 18, zero interactive TTY dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Resolve default sessions JSON file path with home directory expansion.
 * @returns {string}
 */
export function getDefaultSessionsPath() {
  if (process.env.GEMINI_WEB_SESSIONS_FILE) {
    return path.resolve(process.env.GEMINI_WEB_SESSIONS_FILE);
  }
  return path.join(os.homedir(), ".paseo", "gemini-web-sessions.json");
}

/**
 * Expand tilde and resolve absolute path.
 * @param {string} targetPath
 * @returns {string}
 */
export function resolvePath(targetPath) {
  if (!targetPath) {
    return getDefaultSessionsPath();
  }
  if (targetPath.startsWith("~")) {
    return path.join(os.homedir(), targetPath.slice(1));
  }
  return path.resolve(targetPath);
}

/**
 * Load all recorded sessions from disk.
 * @param {string} [customPath]
 * @returns {Record<string, object>}
 */
export function loadSessions(customPath) {
  const filePath = resolvePath(customPath);
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const raw = fs.readFileSync(filePath, "utf-8").trim();
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

/**
 * Write session data map atomically to disk.
 * @param {Record<string, object>} map
 * @param {string} [customPath]
 */
function writeSessionsMap(map, customPath) {
  const filePath = resolvePath(customPath);
  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  const content = JSON.stringify(map, null, 2) + "\n";
  const tmpPath = `${filePath}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpPath, content, "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Upsert a session into persistent store.
 * @param {object} session
 * @param {string} [customPath]
 * @returns {object}
 */
export function saveSession(session, customPath) {
  if (!session || typeof session !== "object") {
    throw new Error("Invalid session data provided");
  }
  const map = loadSessions(customPath);
  const now = new Date().toISOString();
  const sessionId = session.sessionId || `gem-${Date.now().toString(36)}`;
  const existing = map[sessionId] || {};

  const record = {
    sessionId,
    url: session.url || existing.url || "https://gemini.google.com/app",
    backend: session.backend || existing.backend || "ego",
    profile: session.profile || existing.profile || "default",
    model: session.model || existing.model || "default",
    title: session.title || existing.title || "Gemini Conversation",
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  map[sessionId] = record;
  writeSessionsMap(map, customPath);
  return record;
}

/**
 * Look up a session by ID or URL.
 * @param {string} idOrUrl
 * @param {string} [customPath]
 * @returns {object | null}
 */
export function getSession(idOrUrl, customPath) {
  if (!idOrUrl) {
    return null;
  }
  const map = loadSessions(customPath);
  if (map[idOrUrl]) {
    return map[idOrUrl];
  }
  const cleanTarget = idOrUrl.trim().replace(/\/+$/, "");
  for (const session of Object.values(map)) {
    if (session.url && session.url.replace(/\/+$/, "") === cleanTarget) {
      return session;
    }
  }
  return null;
}

/**
 * List all sessions sorted by updatedAt descending.
 * @param {string} [customPath]
 * @returns {Array<object>}
 */
export function listSessions(customPath) {
  const map = loadSessions(customPath);
  return Object.values(map).sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });
}
