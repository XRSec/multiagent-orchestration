#!/usr/bin/env node
// Purpose: Native CDP driver automating Google Chrome for Gemini Web with zero external dependencies.
// Context: Connects via Node global WebSocket to Chrome remote debugging port with persistent profile.
// Usage: import { ChromeDriver, CDPConnection, resolveChromeBinary, resolveChromeProfileDir } from "./chrome-driver.mjs";
// Prerequisites: Node.js >= 22 (native WebSocket), Google Chrome installed, zero interactive TTY.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSystemDirective, extractPageDataInBrowser } from "./gemini-dom.mjs";

export const DEFAULT_CHROME_PROFILE_DIR = path.join(os.homedir(), ".paseo/gemini-web-profiles/chrome");

export const DEFAULT_CHROME_PATHS = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
].filter(Boolean);

export function resolveChromeProfileDir(customDir, profileName) {
  let base = DEFAULT_CHROME_PROFILE_DIR;
  if (customDir) {
    base = customDir.startsWith("~") ? path.join(os.homedir(), customDir.slice(1)) : path.resolve(customDir);
  }
  return profileName ? path.join(base, profileName) : base;
}

export function resolveChromeBinary(customPath) {
  if (customPath && fs.existsSync(customPath)) return customPath;
  for (const cand of DEFAULT_CHROME_PATHS) {
    if (fs.existsSync(cand)) return cand;
  }
  return "google-chrome";
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class CDPConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = (err) => reject(new Error(`CDP WebSocket error: ${err?.message || err}`));
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve: pResolve, reject: pReject } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.error) {
              pReject(new Error(`CDP error [${msg.id}]: ${msg.error.message || JSON.stringify(msg.error)}`));
            } else {
              pResolve(msg.result);
            }
          }
        } catch (_) {}
      };
    });
  }

  async send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close();
    }
  }
}

async function isPortListening(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function launchChromeProcess(bin, port, userDataDir, headless) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`, "--no-first-run", "--no-default-browser-check"];
  if (headless) args.push("--headless=new");
  const child = spawn(bin, args, { stdio: "ignore", detached: true });
  child.unref();

  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await isPortListening(port)) return child;
    await sleep(250);
  }
  throw new Error(`Timeout waiting for Chrome on port ${port}`);
}

async function getOrCreateTargetWsUrl(port, targetUrl) {
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await listRes.json();
  const existing = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (existing) return existing.webSocketDebuggerUrl;

  const newUrl = targetUrl
    ? `http://127.0.0.1:${port}/json/new?${encodeURIComponent(targetUrl)}`
    : `http://127.0.0.1:${port}/json/new`;
  let newRes = await fetch(newUrl, { method: "PUT" }).catch(() => null);
  if (!newRes || !newRes.ok) newRes = await fetch(newUrl);
  const created = await newRes.json();
  if (!created.webSocketDebuggerUrl) throw new Error("Failed to obtain webSocketDebuggerUrl from Chrome target");
  return created.webSocketDebuggerUrl;
}

export async function evaluateCDP(cdp, fnOrExpr, args = []) {
  let expression = fnOrExpr;
  if (typeof fnOrExpr === "function") {
    expression = `(${fnOrExpr.toString()})(${args.map((a) => JSON.stringify(a)).join(",")})`;
  }
  const res = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (res?.exceptionDetails) {
    const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
    throw new Error(`Chrome evaluate error: ${desc}`);
  }
  return res?.result?.value !== undefined ? res.result.value : res?.value;
}

async function uploadChromeFiles(cdp, files, waitFn) {
  if (!files || files.length === 0) return;
  const absFiles = files.map((f) => path.resolve(f));
  const hasInput = await evaluateCDP(cdp, () => !!document.querySelector('input[type="file"]'));
  if (!hasInput) {
    await evaluateCDP(cdp, () => {
      const selectors = ['button[aria-label*="Add" i]', 'button[aria-label*="添加" i]', 'button[aria-label*="Upload" i]', 'button[aria-label*="上传" i]'];
      for (const sel of selectors) {
        const btn = document.querySelector(sel);
        if (btn) { btn.click(); return true; }
      }
      return false;
    });
    await waitFn(1000);
  }
  try {
    const doc = await cdp.send("DOM.getDocument");
    const queryRes = await cdp.send("DOM.querySelector", { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
    if (queryRes && queryRes.nodeId) {
      await cdp.send("DOM.setFileInputFiles", { nodeId: queryRes.nodeId, files: absFiles });
      await waitFn(2000);
      return;
    }
  } catch (_) {}
  try {
    const objRes = await cdp.send("Runtime.evaluate", { expression: 'document.querySelector("input[type=\\"file\\"]")', returnByValue: false });
    if (objRes?.result?.objectId) {
      await cdp.send("DOM.setFileInputFiles", { objectId: objRes.result.objectId, files: absFiles });
    }
  } catch (_) {}
  await waitFn(2000);
}

async function selectChromeModel(cdp, model, waitFn) {
  if (!model) return;
  await evaluateCDP(cdp, (targetModel) => {
    const pickerBtn = document.querySelector('button.has-model-picker, [data-test-id="model-picker-button"], button[aria-label*="Model" i]');
    if (pickerBtn) pickerBtn.click();
  }, [model]);
  await waitFn(1000);
}

async function toggleChromeDeepResearch(cdp, waitFn) {
  await evaluateCDP(cdp, () => {
    const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
      /deep research|深度研究/i.test((b.getAttribute("aria-label") || "") + " " + (b.innerText || ""))
    );
    if (btn && btn.getAttribute("aria-pressed") !== "true") btn.click();
  });
  await waitFn(1000);
}

async function fillAndSendChromePrompt(cdp, promptText, waitFn) {
  await evaluateCDP(cdp, (text) => {
    const selectors = ['rich-textarea .ql-editor[contenteditable="true"]', 'div[contenteditable="true"]', 'textarea[aria-label*="prompt" i]', 'textarea[aria-label*="提示" i]', 'textarea'];
    let el = null;
    for (const sel of selectors) {
      el = document.querySelector(sel);
      if (el) break;
    }
    if (el) {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") el.value = text;
      else el.innerText = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, [promptText]);
  await waitFn(600);

  await evaluateCDP(cdp, () => {
    const selectors = ['button[aria-label*="Send" i]', 'button[aria-label*="发送" i]', 'button.send-button', 'button[data-test-id="send-button"]'];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) { btn.click(); return; }
    }
  });
  await waitFn(2000);
}

async function handleChromeResearchOutline(cdp) {
  return await evaluateCDP(cdp, () => {
    const startBtns = Array.from(document.querySelectorAll("button")).filter((b) =>
      /start research|开始调研|开始研究/i.test((b.getAttribute("aria-label") || "") + " " + (b.innerText || ""))
    );
    const visibleBtn = startBtns.find((b) => b.offsetParent !== null);
    if (visibleBtn) { visibleBtn.click(); return true; }
    return false;
  });
}

async function pollChromeUntilDone(cdp, timeoutMs = 180000, intervalMs = 4000, waitFn = sleep) {
  const startTime = Date.now();
  let latestData = null;
  while (Date.now() - startTime < timeoutMs) {
    const clicked = await handleChromeResearchOutline(cdp);
    if (clicked) await waitFn(3000);

    latestData = await evaluateCDP(cdp, extractPageDataInBrowser);
    if (latestData && !latestData.isGenerating && !latestData.hasOutlineButton && latestData.markdown) {
      return {
        status: "done",
        markdown: latestData.markdown,
        citations: latestData.citations || [],
        url: latestData.url,
      };
    }
    await waitFn(intervalMs);
  }
  return {
    status: latestData?.status || "generating",
    markdown: latestData?.markdown || "",
    citations: latestData?.citations || [],
    url: latestData?.url || "",
  };
}

export class ChromeDriver {
  constructor(options = {}) {
    this.options = options;
    this.cdpUrl = options.cdpUrl || null;
    this.port = parseInt(options.port, 10) || 9222;
    this.userDataDir = resolveChromeProfileDir(options.userDataDir, options.profile);
    this.headless = !!options.headless;
    this.executablePath = options.executablePath || null;
    this.wait = (ms) => (this.options.skipDelay ? Promise.resolve() : sleep(ms));
  }

  async connectCDP(targetUrl) {
    let wsUrl = this.cdpUrl;
    if (!wsUrl || !wsUrl.startsWith("ws://")) {
      const listening = await isPortListening(this.port);
      if (!listening) {
        const bin = resolveChromeBinary(this.executablePath);
        await launchChromeProcess(bin, this.port, this.userDataDir, this.headless);
      }
      wsUrl = await getOrCreateTargetWsUrl(this.port, targetUrl);
    }
    const cdp = new CDPConnection(wsUrl);
    await cdp.connect();
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("DOM.enable")]);
    return cdp;
  }

  async sendMessage({ prompt, files = [], model, deepResearch = false, sessionUrl = "https://gemini.google.com/app", timeoutMs = 180000 }) {
    const cdp = await this.connectCDP(sessionUrl);
    try {
      await cdp.send("Page.navigate", { url: sessionUrl });
      await this.wait(3000);
      await selectChromeModel(cdp, model, this.wait);
      if (deepResearch) await toggleChromeDeepResearch(cdp, this.wait);
      if (files.length > 0) await uploadChromeFiles(cdp, files, this.wait);

      const directive = buildSystemDirective(model, deepResearch);
      await fillAndSendChromePrompt(cdp, `${directive}${prompt || ""}`, this.wait);

      const result = await pollChromeUntilDone(cdp, timeoutMs, 4000, this.wait);
      return {
        url: result.url || sessionUrl,
        status: result.status,
        markdown: result.markdown,
        citations: result.citations,
        backend: "chrome",
        profile: this.options.profile || "default",
      };
    } finally {
      cdp.close();
    }
  }

  async fetchSession(sessionUrl) {
    const cdp = await this.connectCDP(sessionUrl);
    try {
      await cdp.send("Page.navigate", { url: sessionUrl });
      await this.wait(3000);
      const data = await evaluateCDP(cdp, extractPageDataInBrowser);
      return {
        url: data.url || sessionUrl,
        status: data.status,
        markdown: data.markdown,
        citations: data.citations || [],
        backend: "chrome",
        profile: this.options.profile || "default",
      };
    } finally {
      cdp.close();
    }
  }

  async getStatus(sessionUrl) {
    return this.fetchSession(sessionUrl);
  }
}
