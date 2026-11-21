#!/usr/bin/env node
// Purpose: Ego Browser driver for automating Gemini Web via ego-browser nodejs runtime.
// Context: Generates and executes zero-token browser automation scripts using ego-browser CLI.
// Usage: import { EgoDriver, generateEgoScript } from "./ego-driver.mjs";
// Prerequisites: ego-browser installed, zero interactive TTY dependencies.

import { spawn } from "node:child_process";
import path from "node:path";
import { buildSystemDirective } from "./gemini-dom.mjs";

/**
 * Generate standalone ESM code executed by ego-browser nodejs.
 * @param {"ask" | "fetch" | "status" | "wait"} action
 * @param {object} options
 * @returns {string}
 */
export function generateEgoScript(action, options = {}) {
  const targetUrl = options.sessionUrl || "https://gemini.google.com/app";
  const files = (options.files || []).map((f) => path.resolve(f));
  const directive = buildSystemDirective(options.model, options.deepResearch);
  const prompt = options.prompt ? `${directive}${options.prompt}` : "";
  const timeoutMs = options.timeoutMs || 180000;
  const pollIntervalMs = options.intervalMs || 4000;
  const deepResearch = !!options.deepResearch;
  const spaceName = `gemini-web-${action}-${Date.now().toString(36)}`;

  return `
const task = await taskSpace(${JSON.stringify(spaceName)});
const page = task.page("p1");

try {
  await page.goto(${JSON.stringify(targetUrl)});
  await page.waitForTimeout(3000);

  ${action === "ask" || action === "new" ? `
  // Model selection if specified
  ${options.model ? `
  await page.evaluate((targetModel) => {
    const pickerBtn = document.querySelector('button.has-model-picker, [data-test-id="model-picker-button"]');
    if (pickerBtn) pickerBtn.click();
  }, ${JSON.stringify(options.model)});
  await page.waitForTimeout(1000);
  ` : ""}

  // Deep research toggle
  ${deepResearch ? `
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, [role="button"]')).find(b =>
      /deep research|深度研究/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))
    );
    if (btn && btn.getAttribute('aria-pressed') !== 'true') {
      btn.click();
    }
  });
  await page.waitForTimeout(1000);
  ` : ""}

  // File attachments
  ${files.length > 0 ? `
  const fileList = ${JSON.stringify(files)};
  const hasInput = await page.evaluate(() => !!document.querySelector('input[type="file"]'));
  if (hasInput) {
    await page.setInputFiles('input[type="file"]', fileList);
  } else {
    try {
      const chooserPromise = page.waitForFileChooser({ timeout: 8000 });
      const uploadBtn = await page.waitForSelector('button[aria-label*="Add" i], button[aria-label*="添加" i], button[aria-label*="Upload" i]', { timeout: 8000 });
      await uploadBtn.click();
      const chooser = await chooserPromise;
      await chooser.setFiles(fileList);
    } catch (_) {}
  }
  await page.waitForTimeout(2000);
  ` : ""}

  // Fill prompt and send
  const promptInput = await page.waitForSelector('rich-textarea .ql-editor, div[contenteditable="true"], textarea', { timeout: 15000 });
  await page.evaluate((text) => {
    const el = document.querySelector('rich-textarea .ql-editor, div[contenteditable="true"], textarea');
    if (el) {
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        el.value = text;
      } else {
        el.innerText = text;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, ${JSON.stringify(prompt)});
  await page.waitForTimeout(500);

  const sendBtn = await page.waitForSelector('button[aria-label*="Send" i], button[aria-label*="发送" i], button.send-button', { timeout: 10000 });
  await sendBtn.click();
  await page.waitForTimeout(3000);
  ` : ""}

  // Polling loop for completion and Deep Research outline handling
  const startTime = Date.now();
  let finalStatus = "generating";
  let extractedMarkdown = "";
  let finalUrl = page.url();

  while (Date.now() - startTime < ${timeoutMs}) {
    finalUrl = page.url();

    // Check and click Start research button if present
    const outlineInfo = await page.evaluate(() => {
      const startBtn = Array.from(document.querySelectorAll('button')).find(b =>
        /start research|开始调研|开始研究/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))
      );
      if (startBtn && startBtn.offsetParent !== null) {
        startBtn.click();
        return { clicked: true };
      }
      return { clicked: false };
    });

    if (outlineInfo.clicked) {
      await page.waitForTimeout(3000);
    }

    // Check page state
    const pageState = await page.evaluate(() => {
      const stopBtns = Array.from(document.querySelectorAll('button')).filter(b =>
        /stop|停止/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))
      );
      const isGenerating = stopBtns.some(b => b.offsetParent !== null);

      const startBtns = Array.from(document.querySelectorAll('button')).filter(b =>
        /start research|开始调研|开始研究/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || ''))
      );
      const isOutline = startBtns.some(b => b.offsetParent !== null);

      const immersiveEl = document.querySelector('immersive-panel, [data-test-id="immersive-panel"], .immersive-container');
      const responseEls = Array.from(document.querySelectorAll('model-response, [data-test-id="model-response"], .response-container-content'));
      const lastResp = responseEls[responseEls.length - 1];
      const text = immersiveEl ? immersiveEl.innerText : (lastResp ? lastResp.innerText : '');

      return {
        isGenerating,
        isOutline,
        hasText: text.trim().length > 0,
        text: text.trim(),
      };
    });

    extractedMarkdown = pageState.text;

    ${action === "status" ? `
    finalStatus = pageState.isOutline ? "outline_waiting" : (pageState.isGenerating ? "generating" : (pageState.hasText ? "done" : "idle"));
    break;
    ` : `
    if (!pageState.isGenerating && !pageState.isOutline && pageState.hasText) {
      finalStatus = "done";
      break;
    }
    await page.waitForTimeout(${pollIntervalMs});
    `}
  }

  const result = {
    url: finalUrl,
    status: finalStatus,
    markdown: extractedMarkdown,
    backend: "ego",
  };
  console.log(JSON.stringify(result));
} finally {
  await task.finish({ keep: [] });
}
`.trim();
}

/**
 * Execute script via ego-browser nodejs subprocess.
 * @param {string} scriptContent
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function executeEgoScript(scriptContent, options = {}) {
  const binary = options.egoBinary || "ego-browser";
  return new Promise((resolve, reject) => {
    const child = spawn(binary, ["nodejs"], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout.trim()) {
        return reject(
          new Error(`ego-browser exited with code ${code}: ${stderr.trim() || "Unknown error"}`)
        );
      }
      try {
        const jsonLine = stdout
          .trim()
          .split("\n")
          .map((l) => l.trim())
          .reverse()
          .find((l) => l.startsWith("{") && l.endsWith("}"));
        if (!jsonLine) {
          return resolve({ rawOutput: stdout.trim(), status: "done" });
        }
        resolve(JSON.parse(jsonLine));
      } catch (err) {
        resolve({ rawOutput: stdout.trim(), parseError: err.message, status: "done" });
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start ego-browser: ${err.message}`));
    });

    child.stdin.write(scriptContent);
    child.stdin.end();
  });
}

export class EgoDriver {
  /**
   * @param {object} [options]
   * @param {string} [options.egoBinary]
   */
  constructor(options = {}) {
    this.options = options;
  }

  /**
   * Send prompt to Gemini and wait for output.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async sendMessage(params) {
    const script = generateEgoScript("ask", params);
    return executeEgoScript(script, this.options);
  }

  /**
   * Fetch state of an existing session.
   * @param {string} sessionUrl
   * @returns {Promise<object>}
   */
  async fetchSession(sessionUrl) {
    const script = generateEgoScript("fetch", { sessionUrl });
    return executeEgoScript(script, this.options);
  }

  /**
   * Check status of a session.
   * @param {string} sessionUrl
   * @returns {Promise<object>}
   */
  async getStatus(sessionUrl) {
    const script = generateEgoScript("status", { sessionUrl });
    return executeEgoScript(script, this.options);
  }
}
