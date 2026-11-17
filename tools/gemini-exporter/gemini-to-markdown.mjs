#!/usr/bin/env node
/**
 * Gemini 研报与会话 Markdown 提取器 CLI
 */

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

function printHelp() {
  console.log(`
Gemini 研报与会话 Markdown 纯净提取器

用法:
  node tools/gemini-exporter/gemini-to-markdown.mjs <Gemini_URL> [选项]

参数:
  <Gemini_URL>             Gemini 对话的完整 URL (如 https://gemini.google.com/app/...)

选项:
  -k, --keyword <关键词>   仅提取标题匹配关键词的报告 (如 -k "SecureToken")
  -a, --all                自动提取该对话中的全部独立报告 (各自生成独立 .md 文件)
  -o, --out <输出目录>     指定 Markdown 保存目录 (默认: ./docs/research)
  --no-downloads           禁止自动拷贝到系统的 ~/Downloads 目录
  -h, --help               显示此帮助信息

示例:
  # 提取指定深度研报为纯 Markdown
  node tools/gemini-exporter/gemini-to-markdown.mjs "https://gemini.google.com/app/67852c787bc06400" -k "获取与修复方案"

  # 一键提取该对话中的全部报告为 Markdown
  node tools/gemini-exporter/gemini-to-markdown.mjs "https://gemini.google.com/app/a8ed6483faa3c11d" --all

  # 提取普通对话会话为问答录 Markdown
  node tools/gemini-exporter/gemini-to-markdown.mjs "https://gemini.google.com/app/3232a637c69efa2a"
`);
}

const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  printHelp();
  process.exit(0);
}

let targetUrl = "";
let keyword = "";
let exportAll = false;
let outputDir = path.resolve(process.cwd(), "docs/research");
let syncToDownloads = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-k" || arg === "--keyword") {
    keyword = args[++i] || "";
  } else if (arg === "-a" || arg === "--all") {
    exportAll = true;
  } else if (arg === "-o" || arg === "--out") {
    outputDir = path.resolve(process.cwd(), args[++i] || "docs/research");
  } else if (arg === "--no-downloads") {
    syncToDownloads = false;
  } else if (!arg.startsWith("-") && !targetUrl) {
    targetUrl = arg;
  }
}

if (!targetUrl) {
  console.error("❌ 错误: 请提供 Gemini 对话的 URL！使用 --help 查看用法。");
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });

// 写入配置文件
const config = {
  targetUrl,
  targetKeyword: keyword,
  exportAll,
  outputDir,
  syncToDownloads,
  downloadsDir: path.resolve(process.env.HOME || "/tmp", "Downloads")
};

await fs.writeFile("/tmp/gemini_md_config.json", JSON.stringify(config, null, 2), "utf-8");

// 读取 extract-markdown.mjs 并通过 stdin 喂给 ego-browser nodejs
const scriptPath = path.resolve(path.dirname(import.meta.url.replace(/^file:\/\//, '')), "extract-markdown.mjs");
const scriptContent = await fs.readFile(scriptPath, "utf-8");

const child = spawn("ego-browser", ["nodejs"], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.write(scriptContent);
child.stdin.end();

child.on("exit", (code) => {
  if (code === 0) {
    console.log("\n✅ Markdown 提取任务全部完成！\n");
  }
  process.exit(code || 0);
});
