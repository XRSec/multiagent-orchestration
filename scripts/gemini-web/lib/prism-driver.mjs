#!/usr/bin/env node
// Purpose: Prism Browser HTTP MCP driver for automating Gemini Web via JSON-RPC tools/call.
// Context: Connects to Prism MCP runtime endpoint via mcp-connection.json or env vars.
// Usage: import { PrismDriver } from "./prism-driver.mjs";
// Prerequisites: Prism Browser running with MCP enabled, or mock MCP server for testing.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSystemDirective } from "./gemini-dom.mjs";

export const DEFAULT_PRISM_CONNECTION_FILE = path.join(
  os.homedir(),
  "Library/Application Support/prism-browser/vault/runtime/mcp-connection.json"
);

/**
 * Load Prism MCP HTTP connection details.
 * @param {string} [customPath]
 * @returns {{ endpoint: string, token: string }}
 */
export function loadPrismConnection(customPath) {
  if (process.env.PRISM_MCP_ENDPOINT && process.env.PRISM_MCP_TOKEN) {
    return {
      endpoint: process.env.PRISM_MCP_ENDPOINT,
      token: process.env.PRISM_MCP_TOKEN,
    };
  }
  const resolvedPath = customPath
    ? path.resolve(customPath)
    : DEFAULT_PRISM_CONNECTION_FILE;

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(
      `Prism MCP connection file not found at ${resolvedPath}. Ensure Prism Browser is running with MCP enabled or set PRISM_MCP_ENDPOINT and PRISM_MCP_TOKEN.`
    );
  }

  const raw = fs.readFileSync(resolvedPath, "utf-8");
  const data = JSON.parse(raw);
  const endpoint = data.endpoint || data.url || data.httpEndpoint;
  const token = data.token || data.bearerToken || data.authToken;

  if (!endpoint || !token) {
    throw new Error(`Invalid Prism MCP connection file: missing endpoint or token.`);
  }

  return { endpoint, token };
}

export class PrismDriver {
  /**
   * @param {object} [options]
   * @param {string} [options.endpoint]
   * @param {string} [options.token]
   * @param {string} [options.connectionFile]
   * @param {string} [options.profile]
   */
  constructor(options = {}) {
    this.options = options;
    this.endpoint = options.endpoint || null;
    this.token = options.token || null;
    this.connectionFile = options.connectionFile || null;
    this.requestedProfile = options.profile || null;
    this.profileId = null;
    this.taskSessionId = null;
    this.requestId = 0;
  }

  /**
   * Initialize connection parameters.
   */
  initConnection() {
    if (!this.endpoint || !this.token) {
      const conn = loadPrismConnection(this.connectionFile);
      this.endpoint = conn.endpoint;
      this.token = conn.token;
    }
  }

  /**
   * Perform a JSON-RPC tools/call request.
   * @param {string} name
   * @param {object} [args]
   * @returns {Promise<any>}
   */
  async callTool(name, args = {}) {
    this.initConnection();
    const id = ++this.requestId;
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: String(id),
      method: "tools/call",
      params: { name, arguments: args },
    });

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
    };

    let res = await fetch(this.endpoint, { method: "POST", headers, body });
    if (res.status === 404 && !this.endpoint.endsWith("/mcp")) {
      const altEndpoint = `${this.endpoint.replace(/\/+$/, "")}/mcp`;
      res = await fetch(altEndpoint, { method: "POST", headers, body });
      if (res.ok) {
        this.endpoint = altEndpoint;
      }
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Prism MCP request failed (${res.status}): ${errText}`);
    }

    const json = await res.json();
    if (json.error) {
      throw new Error(`Prism MCP tool error [${name}]: ${json.error.message || JSON.stringify(json.error)}`);
    }

    const result = json.result || {};
    if (result.isError) {
      const errDetail = result.content?.[0]?.text || "Tool execution failed";
      throw new Error(`Prism tool ${name} returned error: ${errDetail}`);
    }

    return result;
  }

  /**
   * Resolve target profile ID from name or fallback to first available.
   * @param {string} [profileNameOrId]
   * @returns {Promise<string>}
   */
  async resolveProfile(profileNameOrId) {
    const target = profileNameOrId || this.requestedProfile;
    const res = await this.callTool("prism_list_profiles", {});
    let profiles = [];
    try {
      const rawText = res.content?.[0]?.text || "[]";
      profiles = JSON.parse(rawText);
    } catch (_) {
      profiles = res.profiles || [];
    }

    if (!Array.isArray(profiles) || profiles.length === 0) {
      throw new Error("No available browser profiles found in Prism.");
    }

    if (target) {
      const match = profiles.find(
        (p) => p.id === target || (p.name && p.name.toLowerCase() === target.toLowerCase())
      );
      if (!match) {
        throw new Error(`Prism profile '${target}' not found among available profiles.`);
      }
      this.profileId = match.id;
      return match.id;
    }

    this.profileId = profiles[0].id;
    return this.profileId;
  }

  /**
   * Create task session workspace.
   * @returns {Promise<string>}
   */
  async createTaskSession() {
    if (!this.profileId) {
      await this.resolveProfile();
    }
    const res = await this.callTool("prism_create_task_session", {
      profileId: this.profileId,
    });
    let parsed = {};
    try {
      parsed = JSON.parse(res.content?.[0]?.text || "{}");
    } catch (_) {
      parsed = res;
    }
    this.taskSessionId = parsed.taskSessionId || res.taskSessionId;
    if (!this.taskSessionId) {
      throw new Error("Failed to obtain taskSessionId from prism_create_task_session");
    }
    return this.taskSessionId;
  }

  /**
   * Close active task session.
   */
  async closeTaskSession() {
    if (this.taskSessionId) {
      try {
        await this.callTool("prism_close_task_session", {
          taskSessionId: this.taskSessionId,
        });
      } finally {
        this.taskSessionId = null;
      }
    }
  }

  /**
   * Open page URL in profile.
   * @param {string} url
   */
  async openPage(url) {
    await this.callTool("prism_open_page", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      url,
    });
  }

  /**
   * Upload files to Gemini composer via prism_set_input_files.
   * @param {string[]} paths
   */
  async uploadFiles(paths) {
    if (!paths || paths.length === 0) return;
    const findRes = await this.callTool("prism_find", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      query: "upload",
    });
    let elements = [];
    try {
      elements = JSON.parse(findRes.content?.[0]?.text || "[]");
    } catch (_) {
      elements = findRes.elements || [];
    }
    const uploadRef = elements[0]?.ref;
    if (!uploadRef) {
      throw new Error("Upload element ref not found in Prism page");
    }
    const absolutePaths = paths.map((p) => path.resolve(p));
    await this.callTool("prism_set_input_files", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      ref: uploadRef,
      paths: absolutePaths,
    });
  }

  /**
   * Type message into prompt input and send.
   * @param {string} promptText
   */
  async sendPrompt(promptText) {
    const findRes = await this.callTool("prism_find", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      query: "prompt",
    });
    let elements = [];
    try {
      elements = JSON.parse(findRes.content?.[0]?.text || "[]");
    } catch (_) {
      elements = findRes.elements || [];
    }
    const inputRef = elements[0]?.ref;
    if (!inputRef) {
      throw new Error("Prompt input element ref not found in Prism page");
    }

    await this.callTool("prism_type_text", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      ref: inputRef,
      text: promptText,
      clear: true,
    });

    const sendRes = await this.callTool("prism_find", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      query: "Send",
    });
    let sendElements = [];
    try {
      sendElements = JSON.parse(sendRes.content?.[0]?.text || "[]");
    } catch (_) {
      sendElements = sendRes.elements || [];
    }
    const sendRef = sendElements[0]?.ref;
    if (sendRef) {
      await this.callTool("prism_click_element", {
        profileId: this.profileId,
        taskSessionId: this.taskSessionId,
        ref: sendRef,
      });
    }
  }

  /**
   * Handle Deep Research two-stage confirmation.
   */
  async handleDeepResearchOutline() {
    const findRes = await this.callTool("prism_find", {
      profileId: this.profileId,
      taskSessionId: this.taskSessionId,
      query: "Start research",
    });
    let elements = [];
    try {
      elements = JSON.parse(findRes.content?.[0]?.text || "[]");
    } catch (_) {
      elements = findRes.elements || [];
    }
    const startRef = elements[0]?.ref;
    if (startRef) {
      await this.callTool("prism_click_element", {
        profileId: this.profileId,
        taskSessionId: this.taskSessionId,
        ref: startRef,
      });
      return true;
    }
    return false;
  }

  /**
   * Poll conversation status until done or timeout.
   * @param {number} [timeoutMs]
   * @param {number} [intervalMs]
   * @returns {Promise<{ status: string, markdown: string }>}
   */
  async pollUntilDone(timeoutMs = 120000, intervalMs = 5000) {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      const outlineClicked = await this.handleDeepResearchOutline();
      if (outlineClicked) {
        await this.callTool("prism_wait", { milliseconds: 3000 });
      }

      const mdRes = await this.callTool("prism_get_markdown", {
        profileId: this.profileId,
        taskSessionId: this.taskSessionId,
      });
      const mdText = mdRes.content?.[0]?.text || "";

      // Check Stop button to see if generation finished
      const stopRes = await this.callTool("prism_find", {
        profileId: this.profileId,
        taskSessionId: this.taskSessionId,
        query: "Stop",
      });
      let stopEls = [];
      try {
        stopEls = JSON.parse(stopRes.content?.[0]?.text || "[]");
      } catch (_) {
        stopEls = stopRes.elements || [];
      }

      if (stopEls.length === 0 && mdText.trim().length > 0) {
        return { status: "done", markdown: mdText };
      }

      await this.callTool("prism_wait", { milliseconds: intervalMs });
    }
    return { status: "generating", markdown: "" };
  }

  /**
   * High-level run method for sending prompt and waiting.
   * @param {object} params
   * @param {string} params.prompt
   * @param {string[]} [params.files]
   * @param {string} [params.model]
   * @param {boolean} [params.deepResearch]
   * @param {string} [params.sessionUrl]
   * @param {number} [params.timeoutMs]
   * @returns {Promise<object>}
   */
  async sendMessage({
    prompt,
    files = [],
    model,
    deepResearch = false,
    sessionUrl = "https://gemini.google.com/app",
    timeoutMs = 120000,
  }) {
    await this.createTaskSession();
    try {
      await this.openPage(sessionUrl);
      await this.callTool("prism_wait", { milliseconds: 3000 });

      if (files.length > 0) {
        await this.uploadFiles(files);
      }

      const directive = buildSystemDirective(model, deepResearch);
      const fullPrompt = `${directive}${prompt}`;
      await this.sendPrompt(fullPrompt);

      const result = await this.pollUntilDone(timeoutMs);
      return {
        url: sessionUrl,
        status: result.status,
        markdown: result.markdown,
        backend: "prism",
        profile: this.profileId,
      };
    } finally {
      await this.closeTaskSession();
    }
  }

  /**
   * Fetch current page state and markdown for an existing session.
   * @param {string} sessionUrl
   * @returns {Promise<object>}
   */
  async fetchSession(sessionUrl) {
    await this.createTaskSession();
    try {
      await this.openPage(sessionUrl);
      await this.callTool("prism_wait", { milliseconds: 3000 });
      const mdRes = await this.callTool("prism_get_markdown", {
        profileId: this.profileId,
        taskSessionId: this.taskSessionId,
      });
      const markdown = mdRes.content?.[0]?.text || "";
      return {
        url: sessionUrl,
        status: markdown.length > 0 ? "done" : "idle",
        markdown,
        backend: "prism",
        profile: this.profileId,
      };
    } finally {
      await this.closeTaskSession();
    }
  }
}
