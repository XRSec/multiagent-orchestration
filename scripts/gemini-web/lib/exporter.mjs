#!/usr/bin/env node
// Purpose: Bridge to gemini-research-exporter for producing standalone HTML and Markdown.
// Context: Optional pipeline stage invoked via --export-dir or export subcommand.
// Usage: import { exportReport, buildExportPayload } from "./exporter.mjs";
// Prerequisites: Node.js >= 18, gemini-research-exporter.mjs available.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULT_EXPORTER_PATH =
  process.env.GEMINI_RESEARCH_EXPORTER_BIN ||
  "/Users/xr/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/config/skills/gemini-research-exporter/scripts/gemini-research-exporter.mjs";

/**
 * Format report payload for gemini-research-exporter.
 * @param {object} params
 * @param {string} params.markdown
 * @param {string} [params.title]
 * @param {Array<object>} [params.citations]
 * @returns {object}
 */
export function buildExportPayload({ markdown, title, citations }) {
  return {
    title: title || "Gemini 深度研究报告",
    content: markdown || "",
    citations: Array.isArray(citations) ? citations : [],
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Execute gemini-research-exporter CLI against a payload.
 * @param {object} params
 * @param {string} params.markdown
 * @param {string} [params.title]
 * @param {Array<object>} [params.citations]
 * @param {string} params.outDir
 * @param {string} [params.exporterPath]
 * @returns {{ ok: boolean, outDir: string, stdout: string }}
 */
export function exportReport({
  markdown,
  title,
  citations = [],
  outDir,
  exporterPath = DEFAULT_EXPORTER_PATH,
}) {
  if (!outDir) {
    throw new Error("Missing required outDir for report export");
  }
  const resolvedOutDir = path.resolve(outDir);
  if (!fs.existsSync(resolvedOutDir)) {
    fs.mkdirSync(resolvedOutDir, { recursive: true });
  }

  const payload = buildExportPayload({ markdown, title, citations });
  const tmpFile = path.join(
    os.tmpdir(),
    `gemini-export-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  try {
    fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), "utf-8");

    if (!fs.existsSync(exporterPath)) {
      throw new Error(`Exporter binary not found at ${exporterPath}`);
    }

    const args = [
      exporterPath,
      tmpFile,
      `--out=${resolvedOutDir}`,
      "--format=all",
    ];
    if (title) {
      args.push(`--title=${title}`);
    }

    const stdout = execFileSync(process.execPath, args, {
      encoding: "utf-8",
      timeout: 30000,
    });

    return { ok: true, outDir: resolvedOutDir, stdout: stdout.trim() };
  } finally {
    try {
      if (fs.existsSync(tmpFile)) {
        fs.unlinkSync(tmpFile);
      }
    } catch (_) {
      // Safe cleanup fallback
    }
  }
}
