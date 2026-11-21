#!/usr/bin/env node
// Purpose: DOM selectors, evaluation logic, and page state extraction for Gemini Web.
// Context: Shared by ego-driver and prism-driver across Gemini Web automation workflows.
// Usage: import { GEMINI_SELECTORS, buildSystemDirective, extractPageDataInBrowser } from "./gemini-dom.mjs";
// Prerequisites: Node.js >= 18, zero TTY dependencies.

export const GEMINI_SELECTORS = {
  chatInput: [
    'rich-textarea .ql-editor[contenteditable="true"]',
    'div[contenteditable="true"]',
    'textarea[aria-label*="prompt" i]',
    'textarea[aria-label*="提示" i]',
    'textarea',
  ],
  fileInput: 'input[type="file"]',
  uploadButton: [
    'button[aria-label*="Add" i]',
    'button[aria-label*="添加" i]',
    'button[aria-label*="Upload" i]',
    'button[aria-label*="上传" i]',
    'button[data-test-id="upload-button"]',
  ],
  sendButton: [
    'button[aria-label*="Send" i]',
    'button[aria-label*="发送" i]',
    'button.send-button',
    'button[data-test-id="send-button"]',
  ],
  stopButton: [
    'button[aria-label*="Stop" i]',
    'button[aria-label*="停止" i]',
    'button.stop-button',
    'button[data-test-id="stop-button"]',
  ],
  startResearchButton: [
    'button[aria-label*="Start research" i]',
    'button[aria-label*="开始调研" i]',
    'button[aria-label*="开始研究" i]',
  ],
  deepResearchToggle: [
    'button[aria-label*="Deep Research" i]',
    'button[aria-label*="深度研究" i]',
  ],
  modelPickerButton: [
    'button.has-model-picker',
    '[data-test-id="model-picker-button"]',
    'button[aria-label*="Model" i]',
    'button[aria-label*="模型" i]',
  ],
  immersivePanel: [
    'immersive-panel',
    '[data-test-id="immersive-panel"]',
    '.immersive-container',
  ],
  responseContainer: [
    'model-response',
    '[data-test-id="model-response"]',
    '.response-container-content',
    '.markdown',
  ],
  userQueryContainer: [
    'user-query',
    '.user-query-container',
    '[data-test-id="user-query"]',
  ],
};

/**
 * Build semantic system directive header injected into prompts as secondary assurance.
 * @param {string} [model]
 * @param {boolean} [deepResearch]
 * @returns {string}
 */
export function buildSystemDirective(model, deepResearch) {
  const parts = [];
  if (model) {
    parts.push(`Model: ${model}`);
  }
  if (deepResearch) {
    parts.push("DeepResearch: enabled");
  }
  if (parts.length === 0) {
    return "";
  }
  return `[System Directives: ${parts.join(" | ")}]\n\n`;
}

/**
 * In-browser evaluation function to extract page status, messages, citations and markdown.
 * Serialized and evaluated inside browser context.
 * @returns {object}
 */
export function extractPageDataInBrowser() {
  const currentUrl = window.location.href;
  const pageTitle = document.title || "";

  // Check Stop button presence
  const stopBtns = Array.from(document.querySelectorAll("button")).filter((b) => {
    const label = (b.getAttribute("aria-label") || "") + " " + (b.innerText || "");
    return /stop|停止/i.test(label);
  });
  const isGenerating = stopBtns.some((b) => b.offsetParent !== null);

  // Check Start research button presence
  const startBtns = Array.from(document.querySelectorAll("button")).filter((b) => {
    const label = (b.getAttribute("aria-label") || "") + " " + (b.innerText || "");
    return /start research|开始调研|开始研究/i.test(label);
  });
  const isOutlineWaiting = startBtns.some((b) => b.offsetParent !== null);

  // Check Immersive panel
  const immersiveEl = document.querySelector("immersive-panel, [data-test-id='immersive-panel'], .immersive-container");
  const hasImmersivePanel = !!immersiveEl;

  // Extract model responses
  const responseEls = Array.from(document.querySelectorAll("model-response, [data-test-id='model-response'], .response-container-content"));
  const latestResponse = responseEls[responseEls.length - 1];
  const markdown = immersiveEl
    ? (immersiveEl.innerText || "").trim()
    : latestResponse
    ? (latestResponse.innerText || "").trim()
    : "";

  // Extract citations and source links
  const citationLinks = Array.from(document.querySelectorAll("a[href]")).filter((a) => {
    const href = a.getAttribute("href") || "";
    return href.startsWith("http") && !href.includes("google.com/app");
  });
  const citations = citationLinks.slice(0, 50).map((a, i) => {
    let domain = "";
    try {
      domain = new URL(a.href).hostname;
    } catch (_) {
      domain = a.innerText || `source-${i + 1}`;
    }
    return {
      index: i + 1,
      title: (a.innerText || domain).trim(),
      url: a.href,
      domain,
    };
  });

  let status = "idle";
  if (isOutlineWaiting) {
    status = "outline_waiting";
  } else if (isGenerating) {
    status = "generating";
  } else if (markdown.length > 0) {
    status = "done";
  }

  return {
    url: currentUrl,
    title: pageTitle,
    status,
    markdown,
    citations,
    hasImmersivePanel,
    hasOutlineButton: isOutlineWaiting,
    isGenerating,
  };
}

/**
 * Pure helper function to classify status given observation flags.
 * @param {{ isGenerating: boolean, isOutlineWaiting: boolean, hasContent: boolean }} flags
 * @returns {"generating" | "outline_waiting" | "done" | "idle"}
 */
export function classifyStatus(flags) {
  if (flags.isOutlineWaiting) {
    return "outline_waiting";
  }
  if (flags.isGenerating) {
    return "generating";
  }
  if (flags.hasContent) {
    return "done";
  }
  return "idle";
}
