#!/usr/bin/env node
// Purpose: Playwright driver for automating Gemini Web via connectOverCDP or launchPersistentContext.
// Context: Supports Gemini Web multi-backend execution with persistent user data and session control.
// Usage: import { PlaywrightDriver, resolvePlaywright, resolveProfileDir } from "./playwright-driver.mjs";
// Prerequisites: Node.js >= 18, Playwright installed (local or global), zero interactive TTY dependencies.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  GEMINI_SELECTORS,
  buildSystemDirective,
  extractPageDataInBrowser,
} from "./gemini-dom.mjs";

export const DEFAULT_PLAYWRIGHT_PROFILE_DIR = path.join(
  os.homedir(),
  ".paseo/gemini-web-profiles/playwright"
);

/**
 * Resolve target profile directory with home expansion.
 * @param {string} [customDir]
 * @param {string} [profileName]
 * @returns {string}
 */
export function resolveProfileDir(customDir, profileName) {
  let base = DEFAULT_PLAYWRIGHT_PROFILE_DIR;
  if (customDir) {
    base = customDir.startsWith("~")
      ? path.join(os.homedir(), customDir.slice(1))
      : path.resolve(customDir);
  }
  return profileName ? path.join(base, profileName) : base;
}

/**
 * Dynamically resolve Playwright instance across local and global installations.
 * @param {string} [customPath]
 * @returns {Promise<any>}
 */
export async function resolvePlaywright(customPath) {
  if (customPath) return await import(path.resolve(customPath));
  if (process.env.PLAYWRIGHT_PATH) return await import(path.resolve(process.env.PLAYWRIGHT_PATH));
  try {
    return await import("playwright");
  } catch (_) {}
  try {
    return await import("playwright-core");
  } catch (_) {}

  const home = os.homedir();
  const globalPnpmV11 = path.join(home, "Library/pnpm/global/v11");
  if (fs.existsSync(globalPnpmV11)) {
    const dirs = fs.readdirSync(globalPnpmV11);
    for (const d of dirs) {
      const cand = path.join(globalPnpmV11, d, "node_modules/playwright/index.mjs");
      if (fs.existsSync(cand)) return await import(cand);
      const candCore = path.join(globalPnpmV11, d, "node_modules/playwright-core/index.mjs");
      if (fs.existsSync(candCore)) return await import(candCore);
    }
  }

  const binShim = path.join(home, "Library/pnpm/bin/playwright");
  if (fs.existsSync(binShim)) {
    const content = fs.readFileSync(binShim, "utf-8");
    const m = content.match(/cmd-shim-target=(.+)/);
    if (m && m[1]) {
      const cand = path.join(path.dirname(m[1].trim()), "index.mjs");
      if (fs.existsSync(cand)) return await import(cand);
    }
  }

  throw new Error("Playwright not found. Install playwright locally or set PLAYWRIGHT_PATH.");
}

/**
 * Handle file upload attachment in browser page.
 * @param {any} page
 * @param {string[]} files
 */
async function uploadFiles(page, files) {
  if (!files || files.length === 0) return;
  const absFiles = files.map((f) => path.resolve(f));
  const fileInput = await page.$(GEMINI_SELECTORS.fileInput);
  if (fileInput) {
    await fileInput.setInputFiles(absFiles);
  } else {
    try {
      const chooserPromise = page.waitForEvent("filechooser", { timeout: 8000 });
      let clicked = false;
      for (const sel of GEMINI_SELECTORS.uploadButton) {
        const btn = await page.$(sel);
        if (btn) {
          await btn.click();
          clicked = true;
          break;
        }
      }
      if (clicked) {
        const chooser = await chooserPromise;
        await chooser.setFiles(absFiles);
      }
    } catch (_) {}
  }
  await page.waitForTimeout(2000);
}

/**
 * Input prompt and trigger send button.
 * @param {any} page
 * @param {string} promptText
 */
async function fillAndSendPrompt(page, promptText) {
  await page.evaluate((text) => {
    const selectors = [
      'rich-textarea .ql-editor[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea[aria-label*="prompt" i]',
      'textarea[aria-label*="提示" i]',
      'textarea',
    ];
    let el = null;
    for (const sel of selectors) {
      el = document.querySelector(sel);
      if (el) break;
    }
    if (el) {
      if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
        el.value = text;
      } else {
        el.innerText = text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }, promptText);
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    const selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="发送" i]',
      'button.send-button',
      'button[data-test-id="send-button"]',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn && !btn.disabled) {
        btn.click();
        return;
      }
    }
  });
  await page.waitForTimeout(2000);
}

/**
 * Select model via UI picker if specified.
 * @param {any} page
 * @param {string} model
 */
async function selectModel(page, model) {
  if (!model) return;
  await page.evaluate((targetModel) => {
    const pickerBtn = document.querySelector(
      'button.has-model-picker, [data-test-id="model-picker-button"], button[aria-label*="Model" i]'
    );
    if (pickerBtn) pickerBtn.click();
  }, model);
  await page.waitForTimeout(1000);
}

/**
 * Toggle Deep Research mode button if inactive.
 * @param {any} page
 */
async function toggleDeepResearch(page) {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find((b) =>
      /deep research|深度研究/i.test((b.getAttribute("aria-label") || "") + " " + (b.innerText || ""))
    );
    if (btn && btn.getAttribute("aria-pressed") !== "true") {
      btn.click();
    }
  });
  await page.waitForTimeout(1000);
}

/**
 * Click Start Research confirmation button if outline is ready.
 * @param {any} page
 * @returns {Promise<boolean>}
 */
async function handleResearchOutline(page) {
  return await page.evaluate(() => {
    const startBtns = Array.from(document.querySelectorAll("button")).filter((b) =>
      /start research|开始调研|开始研究/i.test(
        (b.getAttribute("aria-label") || "") + " " + (b.innerText || "")
      )
    );
    const visibleBtn = startBtns.find((b) => b.offsetParent !== null);
    if (visibleBtn) {
      visibleBtn.click();
      return true;
    }
    return false;
  });
}

/**
 * Poll page state until completion or timeout.
 * @param {any} page
 * @param {number} timeoutMs
 * @param {number} intervalMs
 * @returns {Promise<object>}
 */
async function pollUntilDone(page, timeoutMs = 180000, intervalMs = 4000) {
  const startTime = Date.now();
  let latestData = null;

  while (Date.now() - startTime < timeoutMs) {
    const clicked = await handleResearchOutline(page);
    if (clicked) {
      await page.waitForTimeout(3000);
    }

    latestData = await page.evaluate(extractPageDataInBrowser);
    if (!latestData.isGenerating && !latestData.hasOutlineButton && latestData.markdown) {
      return {
        status: "done",
        markdown: latestData.markdown,
        citations: latestData.citations || [],
        url: latestData.url || page.url(),
      };
    }
    await page.waitForTimeout(intervalMs);
  }

  return {
    status: latestData?.status || "generating",
    markdown: latestData?.markdown || "",
    citations: latestData?.citations || [],
    url: latestData?.url || page.url(),
  };
}

export class PlaywrightDriver {
  /**
   * @param {object} [options]
   * @param {string} [options.cdpUrl]
   * @param {number|string} [options.port]
   * @param {string} [options.userDataDir]
   * @param {string} [options.profile]
   * @param {boolean} [options.headless]
   * @param {string} [options.executablePath]
   * @param {string} [options.playwrightPath]
   */
  constructor(options = {}) {
    this.options = options;
    this.cdpUrl = options.cdpUrl || (options.port ? `http://127.0.0.1:${options.port}` : null);
    this.userDataDir = resolveProfileDir(options.userDataDir, options.profile);
    this.headless = !!options.headless;
    this.executablePath = options.executablePath || null;
  }

  /**
   * Launch or connect to browser context.
   * @returns {Promise<{ browser: any, context: any, isCDP: boolean }>}
   */
  async openContext() {
    const pw = await resolvePlaywright(this.options.playwrightPath);
    if (this.cdpUrl) {
      const browser = await pw.chromium.connectOverCDP(this.cdpUrl);
      const contexts = browser.contexts();
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
      return { browser, context, isCDP: true };
    }
    fs.mkdirSync(this.userDataDir, { recursive: true });
    const launchOpts = { headless: this.headless };
    if (this.executablePath) launchOpts.executablePath = this.executablePath;
    const context = await pw.chromium.launchPersistentContext(this.userDataDir, launchOpts);
    return { browser: null, context, isCDP: false };
  }

  /**
   * Close active browser context cleanly.
   * @param {{ browser: any, context: any, isCDP: boolean }} handle
   */
  async closeContext(handle) {
    if (!handle) return;
    if (handle.isCDP) {
      if (handle.browser) await handle.browser.close().catch(() => {});
    } else if (handle.context) {
      await handle.context.close().catch(() => {});
    }
  }

  /**
   * Send prompt to Gemini and poll until completion.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async sendMessage({
    prompt,
    files = [],
    model,
    deepResearch = false,
    sessionUrl = "https://gemini.google.com/app",
    timeoutMs = 180000,
  }) {
    const handle = await this.openContext();
    try {
      const pages = handle.context.pages();
      const page = pages.length > 0 ? pages[pages.length - 1] : await handle.context.newPage();
      await page.goto(sessionUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);

      await selectModel(page, model);
      if (deepResearch) await toggleDeepResearch(page);
      if (files.length > 0) await uploadFiles(page, files);

      const directive = buildSystemDirective(model, deepResearch);
      const fullPrompt = `${directive}${prompt || ""}`;
      await fillAndSendPrompt(page, fullPrompt);

      const result = await pollUntilDone(page, timeoutMs);
      return {
        url: result.url,
        status: result.status,
        markdown: result.markdown,
        citations: result.citations,
        backend: "playwright",
        profile: this.options.profile || "default",
      };
    } finally {
      await this.closeContext(handle);
    }
  }

  /**
   * Fetch current markdown and citation data from session.
   * @param {string} sessionUrl
   * @returns {Promise<object>}
   */
  async fetchSession(sessionUrl) {
    const handle = await this.openContext();
    try {
      const pages = handle.context.pages();
      const page = pages.length > 0 ? pages[pages.length - 1] : await handle.context.newPage();
      await page.goto(sessionUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(3000);

      const data = await page.evaluate(extractPageDataInBrowser);
      return {
        url: page.url(),
        status: data.status,
        markdown: data.markdown,
        citations: data.citations || [],
        backend: "playwright",
        profile: this.options.profile || "default",
      };
    } finally {
      await this.closeContext(handle);
    }
  }

  /**
   * Get single observation status of session.
   * @param {string} sessionUrl
   * @returns {Promise<object>}
   */
  async getStatus(sessionUrl) {
    return this.fetchSession(sessionUrl);
  }
}
