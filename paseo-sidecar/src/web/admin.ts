import type { IncomingMessage, ServerResponse } from "node:http";
import { aggregateDiscoveredBundles } from "../registry/bundle.js";
import {
  discoverPlatformAssets,
  importMcpManifest,
  importPluginWithPlatform,
  importSkillDeduplicated,
} from "../registry/discover.js";
import { UnifiedRegistry } from "../registry/store.js";
import {
  deleteLibraryAssetToTrash,
  listTrashItems,
  purgeTrashItem,
  restoreTrashItem,
  type AssetKind,
} from "../registry/trash.js";
import { saveHostConfig } from "../registry/hosts-config.js";
import { convergeHostAssets, getHostPluginStatuses, installSidecarPluginToHost } from "../registry/installer.js";
import { discoverTrustedDirectories } from "../registry/trust.js";
import type { RuntimeType } from "../types.js";
import { handleWorkspacesApi } from "./workspaces-api.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += String(c);
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export function renderAdminHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SidecarMCP Studio · Unified Control Plane</title>
  <style>
    :root {
      --cds-surface-0: #fbfbf9;
      --cds-surface-1: #f4f3ef;
      --cds-surface-2: #ffffff;
      --cds-surface-3: #ecebe5;
      --cds-surface-popover: #ffffff;
      --cds-border: rgba(20, 20, 19, 0.08);
      --cds-border-strong: rgba(20, 20, 19, 0.16);
      --cds-text: #141413;
      --cds-text-secondary: #565551;
      --cds-muted: #888680;
      --brand: #c6613f;
      --cds-clay: #d97757;
      --cds-clay-hover: #c6613f;
      --cds-clay-soft: rgba(217, 119, 87, 0.12);
      --cds-accent: #184f95;
      --cds-accent-hover: #123e75;
      --cds-accent-soft: rgba(24, 79, 149, 0.08);
      --cds-focus: rgba(24, 79, 149, 0.24);
      --cds-focus-ring: 0 0 0 1px var(--cds-surface-0), 0 0 0 3px var(--cds-focus);
      --cds-ok: #1f7a4c;
      --cds-ok-soft: rgba(31, 122, 76, 0.10);
      --cds-danger: #b43c3c;
      --cds-danger-hover: #9c3333;
      --cds-danger-soft: rgba(180, 60, 60, 0.10);
      --cds-warn: #b77b1d;
      --cds-warn-soft: rgba(183, 123, 29, 0.10);
      --cds-shadow-sm: 0 1px 2px rgba(20, 20, 19, 0.04);
      --cds-shadow-md: 0 4px 14px rgba(20, 20, 19, 0.06);
      --cds-shadow-lg: 0 14px 34px rgba(20, 20, 19, 0.10);
      --ease-cds: cubic-bezier(0.16, 1, 0.3, 1);
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    html.dark {
      --cds-surface-0: #121211;
      --cds-surface-1: #181817;
      --cds-surface-2: #20201f;
      --cds-surface-3: #2a2a28;
      --cds-surface-popover: #252523;
      --cds-border: rgba(240, 239, 236, 0.08);
      --cds-border-strong: rgba(240, 239, 236, 0.16);
      --cds-text: #f0efec;
      --cds-text-secondary: #c3c2b7;
      --cds-muted: #888680;
      --brand: #c6613f;
      --cds-clay: #cc6b49;
      --cds-clay-hover: #d97757;
      --cds-clay-soft: rgba(204, 107, 73, 0.18);
      --cds-accent: #6da7ec;
      --cds-accent-hover: #8cbcf5;
      --cds-accent-soft: rgba(109, 167, 236, 0.14);
      --cds-focus: rgba(109, 167, 236, 0.32);
      --cds-focus-ring: 0 0 0 1px var(--cds-surface-0), 0 0 0 3px var(--cds-focus);
      --cds-ok: #46b57d;
      --cds-ok-soft: rgba(70, 181, 125, 0.14);
      --cds-danger: #e26a6a;
      --cds-danger-hover: #ea8282;
      --cds-danger-soft: rgba(226, 106, 106, 0.15);
      --cds-warn: #e09b3d;
      --cds-warn-soft: rgba(224, 155, 61, 0.14);
      --cds-shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.35);
      --cds-shadow-md: 0 4px 18px rgba(0, 0, 0, 0.45);
      --cds-shadow-lg: 0 14px 38px rgba(0, 0, 0, 0.60);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: var(--font-sans);
      background: var(--cds-surface-0);
      color: var(--cds-text);
      display: flex;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      transition: background 180ms var(--ease-cds), color 180ms var(--ease-cds);
    }
    aside {
      width: 256px;
      flex-shrink: 0;
      background: var(--cds-surface-1);
      border-right: 1px solid var(--cds-border);
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      user-select: none;
    }
    .brand-block {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px 14px;
      border-bottom: 1px solid var(--cds-border);
      margin-bottom: 12px;
    }
    .brand-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 650;
      font-size: 14.5px;
      letter-spacing: -0.015em;
      color: var(--cds-text);
    }
    .brand-mark {
      width: 14px;
      height: 14px;
      border-radius: 4px;
      background: var(--cds-clay);
      box-shadow: 0 0 10px var(--cds-clay-soft);
      position: relative;
      flex-shrink: 0;
    }
    .brand-mark::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 4px;
      height: 4px;
      border-radius: 1px;
      background: #ffffff;
      opacity: 0.9;
    }
    .brand-badge {
      font-size: 10px;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 2px 6px;
      border-radius: 5px;
      background: var(--cds-surface-3);
      color: var(--cds-muted);
    }
    .theme-toggle-btn {
      width: 28px;
      height: 28px;
      border-radius: 7px;
      background: var(--cds-surface-2);
      border: 1px solid var(--cds-border);
      color: var(--cds-text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 150ms var(--ease-cds);
      padding: 0;
    }
    .theme-toggle-btn:hover {
      background: var(--cds-surface-3);
      color: var(--cds-text);
      border-color: var(--cds-border-strong);
    }
    .theme-toggle-btn svg {
      width: 14px;
      height: 14px;
    }
    .nav-btn {
      background: transparent;
      border: none;
      color: var(--cds-text-secondary);
      text-align: left;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      display: flex;
      justify-content: space-between;
      align-items: center;
      transition: background 140ms var(--ease-cds), color 140ms var(--ease-cds);
      position: relative;
    }
    .nav-btn-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .nav-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      color: currentColor;
      opacity: 0.85;
      flex-shrink: 0;
    }
    .nav-icon svg {
      width: 15px;
      height: 15px;
    }
    .nav-btn:hover {
      background: var(--cds-surface-3);
      color: var(--cds-text);
    }
    .nav-btn.active {
      background: var(--cds-accent-soft);
      color: var(--cds-accent);
      font-weight: 600;
    }
    .nav-btn.active::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      border-radius: 0 2px 2px 0;
      background: var(--cds-accent);
    }
    .count-pill {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 9999px;
      background: var(--cds-surface-3);
      color: var(--cds-muted);
      border: none;
      transition: all 140ms var(--ease-cds);
    }
    .nav-btn.active .count-pill {
      background: var(--cds-surface-2);
      color: var(--cds-accent);
      box-shadow: var(--cds-shadow-sm);
    }
    .sidebar-footer {
      margin-top: auto;
      padding-top: 14px;
      border-top: 1px solid var(--cds-border);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .status-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-weight: 500;
      color: var(--cds-muted);
      padding: 6px 10px;
      border-radius: 7px;
      background: var(--cds-surface-3);
    }
    .status-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--cds-ok);
      box-shadow: 0 0 6px var(--cds-ok-soft);
      flex-shrink: 0;
    }
    .status-dot.active {
      animation: pulseDot 2.4s ease-in-out infinite;
    }
    @keyframes pulseDot {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.65; transform: scale(0.92); }
    }
    main {
      flex: 1;
      padding: 28px 36px;
      max-width: 1380px;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .topbar-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .topbar h2 {
      margin: 0;
      font-size: 21px;
      font-weight: 650;
      letter-spacing: -0.02em;
      color: var(--cds-text);
    }
    .topbar-subtitle {
      font-size: 13px;
      color: var(--cds-muted);
      line-height: 1.45;
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .home-badge {
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 500;
      padding: 5px 11px;
      border-radius: 9999px;
      background: var(--cds-surface-2);
      border: 1px solid var(--cds-border);
      color: var(--cds-muted);
      box-shadow: var(--cds-shadow-sm);
      cursor: pointer;
      user-select: none;
      transition: all 140ms var(--ease-cds);
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .home-badge:hover {
      border-color: var(--cds-border-strong);
      color: var(--cds-text);
    }
    .kpi-strip {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding: 10px 16px;
      background: var(--cds-surface-1);
      border: 1px solid var(--cds-border);
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .kpi-item {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--cds-text-secondary);
    }
    .kpi-label {
      color: var(--cds-muted);
      font-size: 11.5px;
      letter-spacing: 0.01em;
    }
    .kpi-num {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
      font-weight: 650;
      color: var(--cds-text);
      font-size: 12.5px;
    }
    .kpi-divider {
      width: 1px;
      height: 14px;
      background: var(--cds-border);
    }
    .toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .search-wrap {
      position: relative;
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 280px;
      max-width: 440px;
    }
    .search-icon {
      position: absolute;
      left: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--cds-muted);
      pointer-events: none;
    }
    .search-icon svg {
      width: 14px;
      height: 14px;
    }
    .search-input {
      width: 100%;
      background: var(--cds-surface-2);
      color: var(--cds-text);
      border: 1px solid var(--cds-border);
      border-radius: 8px;
      padding: 8px 52px 8px 32px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-shadow: var(--cds-shadow-sm);
      transition: border-color 150ms var(--ease-cds), box-shadow 150ms var(--ease-cds);
    }
    .search-input:focus {
      border-color: var(--cds-accent);
      box-shadow: var(--cds-focus-ring);
    }
    .search-shortcut-hint {
      position: absolute;
      right: 11px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 550;
      color: var(--cds-muted);
      background: var(--cds-surface-3);
      padding: 2px 5px;
      border-radius: 4px;
      border: 1px solid var(--cds-border);
      pointer-events: none;
      user-select: none;
    }
    .search-clear {
      position: absolute;
      right: 9px;
      width: 19px;
      height: 19px;
      border-radius: 50%;
      background: var(--cds-surface-3);
      border: none;
      color: var(--cds-muted);
      display: none;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      padding: 0;
      transition: all 120ms var(--ease-cds);
    }
    .search-clear:hover {
      background: rgba(20, 20, 19, 0.14);
      color: var(--cds-text);
    }
    html.dark .search-clear:hover {
      background: rgba(240, 239, 236, 0.20);
    }
    .search-clear.visible { display: flex; }
    .toolbar-controls {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .segmented-control {
      display: inline-flex;
      align-items: center;
      background: var(--cds-surface-3);
      border-radius: 9999px;
      padding: 3px;
      gap: 2px;
      user-select: none;
    }
    .seg-btn {
      background: transparent;
      border: none;
      color: var(--cds-muted);
      padding: 4px 11px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 140ms var(--ease-cds);
      font-family: inherit;
    }
    .seg-btn:hover {
      color: var(--cds-text);
    }
    .seg-btn.active {
      background: var(--cds-surface-2);
      color: var(--cds-text);
      font-weight: 600;
      box-shadow: var(--cds-shadow-sm);
    }
    .input {
      background: var(--cds-surface-2);
      color: var(--cds-text);
      border: 1px solid var(--cds-border);
      border-radius: 8px;
      padding: 7px 11px;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      box-shadow: var(--cds-shadow-sm);
      transition: border-color 150ms var(--ease-cds), box-shadow 150ms var(--ease-cds);
    }
    .input:focus {
      border-color: var(--cds-accent);
      box-shadow: var(--cds-focus-ring);
    }
    .section-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      font-weight: 650;
      color: var(--cds-muted);
      margin: 24px 0 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-variant-numeric: tabular-nums;
    }
    .section-title:first-of-type {
      margin-top: 4px;
    }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    }
    .card {
      background: var(--cds-surface-2);
      border: 1px solid var(--cds-border);
      border-radius: 12px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      box-shadow: var(--cds-shadow-sm);
      transition: border-color 160ms var(--ease-cds), box-shadow 160ms var(--ease-cds), transform 160ms var(--ease-cds);
    }
    .card:hover {
      border-color: var(--cds-border-strong);
      box-shadow: var(--cds-shadow-md);
      transform: translateY(-1px);
    }
    .card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .card-title-group {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .card-type-icon {
      width: 24px;
      height: 24px;
      border-radius: 6px;
      background: var(--cds-surface-3);
      color: var(--cds-text-secondary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .card-type-icon.skill {
      background: var(--cds-clay-soft);
      color: var(--cds-clay);
    }
    .card-type-icon.plugin {
      background: var(--cds-accent-soft);
      color: var(--cds-accent);
    }
    .card-type-icon.mcp {
      background: var(--cds-ok-soft);
      color: var(--cds-ok);
    }
    .card-title {
      font-weight: 600;
      font-size: 14px;
      letter-spacing: -0.01em;
      word-break: break-word;
      color: var(--cds-text);
      line-height: 1.35;
    }
    .muted {
      color: var(--cds-muted);
      font-size: 12px;
      line-height: 1.55;
      word-break: break-word;
    }
    .mono {
      font-family: var(--font-mono);
      font-size: 11px;
    }
    .badge {
      font-size: 11px;
      font-weight: 550;
      padding: 2px 8px;
      border-radius: 9999px;
      border: none;
      white-space: nowrap;
      background: var(--cds-surface-3);
      color: var(--cds-text-secondary);
      display: inline-flex;
      align-items: center;
      gap: 4px;
      user-select: none;
    }
    .plat-claude-code, .plat-claude-desktop, .plat-claude-desktop-3p {
      background: var(--cds-clay-soft);
      color: var(--cds-clay);
    }
    .plat-codex {
      background: var(--cds-ok-soft);
      color: var(--cds-ok);
    }
    .plat-cursor {
      background: var(--cds-accent-soft);
      color: var(--cds-accent);
    }
    .plat-gemini-cli {
      background: rgba(138, 92, 246, 0.12);
      color: #8b5cf6;
    }
    html.dark .plat-gemini-cli {
      background: rgba(138, 92, 246, 0.18);
      color: #a78bfa;
    }
    .plat-openhands {
      background: rgba(217, 119, 6, 0.12);
      color: #d97706;
    }
    html.dark .plat-openhands {
      background: rgba(217, 119, 6, 0.18);
      color: #f59e0b;
    }
    .plat-agents {
      background: var(--cds-surface-3);
      color: var(--cds-text-secondary);
    }
    .badge.ok {
      background: var(--cds-ok-soft);
      color: var(--cds-ok);
    }
    .badge.imported {
      background: var(--cds-accent-soft);
      color: var(--cds-accent);
    }
    .badge.deleted {
      background: var(--cds-danger-soft);
      color: var(--cds-danger);
    }
    .btn {
      background: var(--cds-surface-3);
      color: var(--cds-text);
      border: none;
      border-radius: 7px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 550;
      cursor: pointer;
      font-family: inherit;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 140ms var(--ease-cds);
      user-select: none;
    }
    .btn:hover {
      background: rgba(20, 20, 19, 0.10);
    }
    html.dark .btn:hover {
      background: rgba(240, 239, 236, 0.12);
    }
    .btn:active {
      transform: scale(0.98);
    }
    .btn.active {
      background: var(--cds-accent-soft);
      color: var(--cds-accent);
    }
    .btn.clay {
      background: var(--cds-clay);
      color: #ffffff;
      box-shadow: 0 1px 3px var(--cds-clay-soft);
    }
    .btn.clay:hover {
      background: var(--cds-clay-hover);
      box-shadow: 0 2px 8px var(--cds-clay-soft);
      transform: translateY(-0.5px);
    }
    .btn.danger {
      background: var(--cds-danger-soft);
      color: var(--cds-danger);
    }
    .btn.danger:hover {
      background: rgba(180, 60, 60, 0.18);
      color: var(--cds-danger-hover);
    }
    .btn.secondary {
      background: var(--cds-surface-2);
      border: 1px solid var(--cds-border);
      color: var(--cds-text-secondary);
    }
    .btn.secondary:hover {
      background: var(--cds-surface-3);
      color: var(--cds-text);
      border-color: var(--cds-border-strong);
    }
    .card .btn.secondary, .panel .btn.secondary {
      border: none;
      background: var(--cds-surface-3);
    }
    .card .btn.secondary:hover, .panel .btn.secondary:hover {
      background: rgba(20, 20, 19, 0.10);
    }
    html.dark .card .btn.secondary:hover, html.dark .panel .btn.secondary:hover {
      background: rgba(240, 239, 236, 0.12);
    }
    .btn:focus-visible {
      outline: none;
      box-shadow: var(--cds-focus-ring);
    }
    .panel {
      background: var(--cds-surface-2);
      border: 1px solid var(--cds-border);
      border-radius: 12px;
      padding: 22px;
      margin-bottom: 24px;
      box-shadow: var(--cds-shadow-sm);
    }
    .notice-box {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 13px 16px;
      border-radius: 10px;
      background: var(--cds-accent-soft);
      color: var(--cds-text);
      font-size: 13px;
      line-height: 1.55;
      margin-bottom: 20px;
      border: 1px solid rgba(24, 79, 149, 0.14);
    }
    html.dark .notice-box {
      border-color: rgba(109, 167, 236, 0.18);
    }
    .notice-icon {
      color: var(--cds-accent);
      flex-shrink: 0;
      margin-top: 1px;
      display: inline-flex;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
      margin-bottom: 16px;
    }
    .field label {
      display: block;
      font-size: 12px;
      font-weight: 550;
      color: var(--cds-text-secondary);
      margin-bottom: 6px;
    }
    .field-hint {
      font-size: 11px;
      color: var(--cds-muted);
      margin-top: 4px;
    }
    .check-group {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 6px;
    }
    .check-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: 8px;
      border: none;
      background: var(--cds-surface-3);
      color: var(--cds-text-secondary);
      font-size: 12px;
      cursor: pointer;
      user-select: none;
      transition: all 140ms var(--ease-cds);
    }
    .check-chip:hover {
      background: rgba(20, 20, 19, 0.08);
      color: var(--cds-text);
    }
    html.dark .check-chip:hover {
      background: rgba(240, 239, 236, 0.10);
    }
    .check-chip input[type="checkbox"] {
      margin: 0;
      accent-color: var(--cds-clay);
      cursor: pointer;
    }
    .row-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      margin-top: auto;
      padding-top: 4px;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      text-align: center;
      background: var(--cds-surface-1);
      border: 1px dashed var(--cds-border-strong);
      border-radius: 12px;
      gap: 10px;
    }
    .empty-icon {
      color: var(--cds-muted);
      opacity: 0.7;
      display: inline-flex;
    }
    .empty-title {
      font-weight: 600;
      font-size: 14px;
      color: var(--cds-text);
    }
    .empty-desc {
      font-size: 12px;
      color: var(--cds-muted);
      max-width: 360px;
      line-height: 1.5;
    }
    .toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      background: var(--cds-surface-2);
      border: 1px solid var(--cds-border-strong);
      color: var(--cds-text);
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      box-shadow: var(--cds-shadow-lg);
      opacity: 0;
      transform: translateY(12px) scale(0.97);
      pointer-events: none;
      transition: opacity 180ms var(--ease-cds), transform 180ms var(--ease-cds);
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .toast.show {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
    .toast-icon {
      color: var(--cds-ok);
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .spinning {
      animation: spin 700ms linear infinite;
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes fadeInTab {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #tab-body {
      animation: fadeInTab 160ms var(--ease-cds);
    }
    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation: none !important; }
    }
  </style>
</head>
<body>
  <aside>
    <div class="brand-block">
      <div class="brand-title">
        <span class="brand-mark"></span>
        SidecarMCP
        <span class="brand-badge">Studio</span>
      </div>
      <button class="theme-toggle-btn" onclick="toggleTheme()" title="切换浅色/深色主题" aria-label="切换主题">
        <span id="theme-icon">◐</span>
      </button>
    </div>
    <button class="nav-btn" data-tab="library" onclick="switchTab('library')">
      <span class="nav-btn-left">
        <span class="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></span>
        <span>Library 仓库</span>
      </span>
      <span class="count-pill" id="cnt-lib">0</span>
    </button>
    <button class="nav-btn" data-tab="discover" onclick="switchTab('discover')">
      <span class="nav-btn-left">
        <span class="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg></span>
        <span>Discover 发现</span>
      </span>
      <span class="count-pill" id="cnt-disc">0</span>
    </button>
    <button class="nav-btn" data-tab="workspaces" onclick="switchTab('workspaces')">
      <span class="nav-btn-left">
        <span class="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg></span>
        <span>Workspaces 路由</span>
      </span>
      <span class="count-pill" id="cnt-ws">0</span>
    </button>
    <button class="nav-btn" data-tab="hosts" onclick="switchTab('hosts')">
      <span class="nav-btn-left">
        <span class="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></span>
        <span>Hosts 宿主接入</span>
      </span>
      <span class="count-pill" id="cnt-hosts">0</span>
    </button>
    <button class="nav-btn" data-tab="trash" onclick="switchTab('trash')">
      <span class="nav-btn-left">
        <span class="nav-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>
        <span>Trash 回收站</span>
      </span>
      <span class="count-pill" id="cnt-trash">0</span>
    </button>
    <div class="sidebar-footer">
      <div class="status-chip" title="Daemon 守护进程状态与端口">
        <span class="status-dot active"></span>
        <span>Daemon 44880 · Active</span>
      </div>
      <div class="muted mono" style="font-size:10px;padding:0 4px;cursor:pointer;" id="sidebar-home" onclick="copyHomePath()" title="点击复制路径">~/.sidecar</div>
    </div>
  </aside>
  <main>
    <div class="topbar">
      <div class="topbar-main">
        <h2 id="page-title">Library 统一仓库</h2>
        <div class="topbar-subtitle" id="page-subtitle">全局统一管控的 Skills、Plugins 与 MCP Servers 资产库</div>
      </div>
      <div class="topbar-right">
        <button class="btn secondary" onclick="refreshData()" title="从守护进程刷新全部数据" id="btn-refresh">
          <span id="refresh-icon" style="display:inline-flex;align-items:center;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
          </span>
          <span>刷新</span>
        </button>
        <span class="home-badge" id="home-path" onclick="copyHomePath()" title="点击复制路径">~/.sidecar</span>
      </div>
    </div>
    <div id="kpi-strip" class="kpi-strip"></div>
    <div id="toolbar-area" class="toolbar">
      <div class="search-wrap" id="search-wrap">
        <span class="search-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        </span>
        <input id="q-box" class="search-input" placeholder="搜索 Skills / Plugins / MCPs (按 / 聚焦)..." autocomplete="off" spellcheck="false" />
        <kbd class="search-shortcut-hint" id="search-shortcut">/</kbd>
        <button id="search-clear-btn" class="search-clear" title="清空搜索" type="button">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="toolbar-controls" id="toolbar-controls"></div>
    </div>
    <div id="tab-body"></div>
  </main>
  <div id="toast" class="toast"></div>
  <script>
    const TABS = ['library', 'discover', 'workspaces', 'hosts', 'trash'];
    function tabFromPath(pathname) {
      const seg = pathname.replace(/^\\/admin\\/?/, '').replace(/^\\//, '').split('/')[0];
      return TABS.includes(seg) ? seg : 'library';
    }
    let currentTab = tabFromPath(location.pathname);
    let platformFilter = 'all';
    let showImported = false;
    let trashFilter = 'all';
    let searchQuery = '';
    const RUNTIMES = ['claude-code', 'claude-desktop', 'claude-desktop-3p', 'codex', 'openhands', 'cursor', 'gemini-cli'];

    // Theme initialization
    const SUN_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    const MOON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    const savedTheme = localStorage.getItem('sidecar-theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.classList.add('dark');
    }
    function updateThemeIcon() {
      const isDark = document.documentElement.classList.contains('dark');
      const el = document.getElementById('theme-icon');
      if (el) el.innerHTML = isDark ? SUN_SVG : MOON_SVG;
    }
    function toggleTheme() {
      const isDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('sidecar-theme', isDark ? 'dark' : 'light');
      updateThemeIcon();
    }
    updateThemeIcon();

    let toastTimer = null;
    function showToast(msg) {
      const el = document.getElementById('toast');
      el.innerHTML = '<span class="toast-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span>' + esc(msg) + '</span>';
      el.classList.add('show');
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
    }

    function esc(s) {
      return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function copyHomePath() {
      const path = window.__state?.overview?.paths?.home || '~/.sidecar';
      if (navigator.clipboard) {
        navigator.clipboard.writeText(path).then(() => {
          showToast('已复制主目录路径: ' + path);
        });
      } else {
        showToast('主目录: ' + path);
      }
    }

    const TAB_METAS = {
      library: {
        title: 'Library 统一仓库',
        subtitle: '全局统一管控的 Skills、Plugins 与 MCP Servers 资产库'
      },
      discover: {
        title: 'Discover 跨平台发现与备份导入',
        subtitle: '自动扫描各宿主平台未收敛资产，一键聚合导入并去重备份'
      },
      workspaces: {
        title: 'Workspaces 目录 × Runtime 矩阵',
        subtitle: '基于真实工作目录 (canonical_cwd) 的细粒度运行时与能力路由规则'
      },
      hosts: {
        title: 'Hosts 宿主平台接入与一键收敛',
        subtitle: '向 7 大宿主注入单一 SidecarMCP 插件并清理冗余 root mcpServers'
      },
      trash: {
        title: 'Trash 回收站（导入备份 / 本平台删除）',
        subtitle: '已安全隔离的外部导入副本与本地删除资产，支持双模式安全还原'
      }
    };

    function applyTabUi(tab) {
      currentTab = tab;
      searchQuery = '';
      const qBox = document.getElementById('q-box');
      if (qBox) {
        qBox.value = '';
        const clearBtn = document.getElementById('search-clear-btn');
        if (clearBtn) clearBtn.classList.remove('visible');
        const hint = document.getElementById('search-shortcut');
        if (hint) hint.style.display = '';
      }
      document.querySelectorAll('.nav-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
      const meta = TAB_METAS[tab] || TAB_METAS.library;
      document.getElementById('page-title').textContent = meta.title;
      document.getElementById('page-subtitle').textContent = meta.subtitle;
    }

    function switchTab(tab, push = true) {
      applyTabUi(tab);
      if (push) {
        const targetUrl = '/admin/' + tab;
        if (location.pathname !== targetUrl) {
          history.pushState({ tab }, '', targetUrl);
        }
      }
      render();
    }

    window.addEventListener('popstate', () => {
      applyTabUi(tabFromPath(location.pathname));
      render();
    });

    // Keyboard shortcut to focus search: '/' or 'Cmd+K' / 'Ctrl+K' with IME guard
    window.addEventListener('keydown', (e) => {
      // open-claude-ui Edge Guard: Ignore any shortcut trigger when user is in IME composition
      if (e.isComposing || e.keyCode === 229) return;

      const isInputActive = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
      if ((e.key === '/' && !isInputActive) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        const qBox = document.getElementById('q-box');
        const searchWrap = document.getElementById('search-wrap');
        if (qBox && searchWrap && searchWrap.style.display !== 'none') {
          e.preventDefault();
          qBox.focus();
          qBox.select();
        }
      } else if (e.key === 'Escape') {
        const qBox = document.getElementById('q-box');
        if (qBox && document.activeElement === qBox) {
          qBox.value = '';
          searchQuery = '';
          const clearBtn = document.getElementById('search-clear-btn');
          if (clearBtn) clearBtn.classList.remove('visible');
          const hint = document.getElementById('search-shortcut');
          if (hint) hint.style.display = '';
          renderTabBody();
          qBox.blur();
        }
      }
    });

    applyTabUi(currentTab);

    async function importAsset(payload) {
      try {
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        showToast(data.status === 'deduplicated' ? '已存在同名资产，已直接移入备份目录' : '已导入并备份至 ~/.sidecar');
        render();
      } catch (err) {
        showToast('导入失败: ' + err.message);
      }
    }

    async function importBundle(canonicalId) {
      const b = (window.__state?.disc?.bundles || []).find(x => x.canonicalId === canonicalId);
      if (!b) return;
      try {
        showToast('正在聚合导入: ' + canonicalId + '...');
        for (const s of b.skills) {
          await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'skill', id: s.id, platform: s.platform, sourcePath: s.sourcePath }) });
        }
        for (const p of b.plugins) {
          await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'plugin', id: p.id, platform: p.platform, version: p.version, sourcePath: p.sourcePath }) });
        }
        for (const m of b.mcps) {
          await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'mcp', id: m.id, platform: m.platform, sourceConfigFile: m.sourceConfigFile, config: m.config }) });
        }
        showToast('已聚合导入并去重归档: ' + canonicalId);
        render();
      } catch (err) {
        showToast('导入失败: ' + err.message);
      }
    }

    async function deleteToTrash(kind, id) {
      try {
        await fetch('/api/admin/library/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind, id })
        });
        showToast('已移入回收站: ' + id);
        render();
      } catch (err) {
        showToast('删除失败: ' + err.message);
      }
    }

    async function restoreFromTrash(path, mode = 'sidecar') {
      try {
        const res = await fetch('/api/admin/trash/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, mode })
        });
        const data = await res.json();
        showToast('已还原至: ' + data.restoredTo);
        render();
      } catch (err) {
        showToast('还原失败: ' + err.message);
      }
    }

    async function purgeFromTrash(path) {
      try {
        await fetch('/api/admin/trash/purge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path })
        });
        showToast('已彻底清理');
        render();
      } catch (err) {
        showToast('清理失败: ' + err.message);
      }
    }

    function isGlobalCwd(cwd) {
      const trimmed = String(cwd || '').trim();
      return trimmed === '*' || trimmed === '/' || trimmed.toLowerCase() === 'global' || trimmed === '全局';
    }

    function selectWorkspaceCwd(cwd, defaultName) {
      const input = document.getElementById('cwd-input');
      if (input) input.value = cwd;
      const nameInput = document.querySelector('#workspace-form input[name=name]');
      if (nameInput && !nameInput.value && defaultName) {
        nameInput.value = defaultName;
      }
    }

    async function saveWorkspace(e) {
      e.preventDefault();
      const form = e.target;
      const checked = (name) => Array.from(form.querySelectorAll('input[name="' + name + '"]:checked')).map(i => i.value);
      const rawCwd = form.canonical_cwd.value.trim();
      const cwd = isGlobalCwd(rawCwd) ? '*' : rawCwd;
      const defaultName = cwd === '*' ? 'Global' : (cwd.split('/').filter(Boolean).pop() || 'workspace');
      const name = form.name.value.trim() || defaultName;
      const id = form.ws_id.value.trim() || name.toLowerCase().replace(/[^a-z0-9-_]+/g, '-') || 'workspace';
      const existing = ((window.__state && window.__state.wsData && window.__state.wsData.workspaces) || []).find(w => w.id === id);
      const rawInjectionMode = form.skill_injection_mode ? form.skill_injection_mode.value : 'inline';
      const skillInjectionMode = rawInjectionMode === 'manifest' ? 'manifest' : 'inline';
      const payload = {
        ...(existing || {}),
        id,
        name,
        canonical_cwd: cwd,
        runtimes: checked('runtimes'),
        plugins: checked('plugins'),
        enabled: existing ? existing.enabled : true,
        metadata: {
          ...(existing && existing.metadata ? existing.metadata : {}),
          skills: checked('skills'),
          skill_injection_mode: skillInjectionMode,
          mcp_servers: checked('mcps')
        }
      };
      try {
        const res = await fetch('/api/admin/workspaces', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        showToast('已保存工作区路由: ' + name);
        render();
      } catch (err) {
        showToast('保存失败: ' + err.message);
      }
    }

    function editWorkspace(id) {
      const workspaces = (window.__state && window.__state.wsData && window.__state.wsData.workspaces) || [];
      const w = workspaces.find(item => item.id === id);
      if (!w) {
        showToast('未找到工作区: ' + id);
        return;
      }
      const form = document.getElementById('workspace-form');
      if (!form) return;
      form.ws_id.value = w.id || '';
      form.name.value = w.name || '';
      form.canonical_cwd.value = isGlobalCwd(w.canonical_cwd) ? '*' : (w.canonical_cwd || '');

      const setChecked = (fieldName, values) => {
        const set = new Set(Array.isArray(values) ? values : []);
        form.querySelectorAll('input[name="' + fieldName + '"]').forEach(el => {
          el.checked = set.has(el.value);
        });
      };
      setChecked('runtimes', w.runtimes);
      setChecked('skills', w.metadata && w.metadata.skills);
      if (form.skill_injection_mode) {
        form.skill_injection_mode.value = (w.metadata && w.metadata.skill_injection_mode === 'manifest') ? 'manifest' : 'inline';
      }
      setChecked('plugins', w.plugins);
      setChecked('mcps', w.metadata && w.metadata.mcp_servers);

      const titleEl = document.getElementById('ws-form-title');
      if (titleEl) titleEl.textContent = '编辑工作区路由规则: ' + (w.name || w.id);
      const submitBtn = document.getElementById('ws-submit-btn');
      if (submitBtn) submitBtn.textContent = '更新工作区配置';
      const cancelBtn = document.getElementById('ws-cancel-btn');
      if (cancelBtn) cancelBtn.style.display = 'inline-flex';

      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('已加载工作区「' + (w.name || w.id) + '」到表单');
    }

    function resetWorkspaceForm() {
      const form = document.getElementById('workspace-form');
      if (!form) return;
      form.reset();
      if (form.skill_injection_mode) form.skill_injection_mode.value = 'inline';
      const titleEl = document.getElementById('ws-form-title');
      if (titleEl) titleEl.textContent = '新建 / 更新工作区路由规则';
      const submitBtn = document.getElementById('ws-submit-btn');
      if (submitBtn) submitBtn.textContent = '保存工作区配置';
      const cancelBtn = document.getElementById('ws-cancel-btn');
      if (cancelBtn) cancelBtn.style.display = 'none';
    }

    async function deleteWorkspace(id) {
      try {
        await fetch('/api/admin/workspaces/' + encodeURIComponent(id), { method: 'DELETE' });
        showToast('已删除工作区: ' + id);
        render();
      } catch (err) {
        showToast('删除失败: ' + err.message);
      }
    }

    // Stable IME composition and Search binding with focus preservation
    let isComposing = false;
    let searchDebounceTimer = null;
    function setupSearchInput(inputEl) {
      if (!inputEl || inputEl.dataset.bound === 'true') return;
      inputEl.dataset.bound = 'true';
      const clearBtn = document.getElementById('search-clear-btn');
      const hint = document.getElementById('search-shortcut');
      const updateClearVisibility = () => {
        const hasVal = Boolean(inputEl.value);
        if (clearBtn) clearBtn.classList.toggle('visible', hasVal);
        if (hint) hint.style.display = hasVal ? 'none' : '';
      };

      inputEl.addEventListener('compositionstart', () => {
        isComposing = true;
      });
      inputEl.addEventListener('compositionupdate', () => {
        isComposing = true;
      });
      inputEl.addEventListener('compositionend', (e) => {
        isComposing = false;
        searchQuery = e.target.value;
        updateClearVisibility();
        renderTabBody();
      });
      inputEl.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        updateClearVisibility();
        if (!isComposing && !e.isComposing) {
          clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(() => {
            renderTabBody();
          }, 40);
        }
      });
      if (clearBtn) {
        clearBtn.onclick = () => {
          inputEl.value = '';
          searchQuery = '';
          updateClearVisibility();
          inputEl.focus();
          renderTabBody();
        };
      }
      updateClearVisibility();
    }

    async function installHost(platform) {
      try {
        showToast('正在安装 SidecarMCP Plugin 到 ' + platform + '...');
        await fetch('/api/admin/hosts/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
        showToast('已安装 SidecarMCP Plugin 到 ' + platform);
        render();
      } catch (err) {
        showToast('安装失败: ' + err.message);
      }
    }

    async function convergeHost(platform) {
      try {
        showToast('正在收敛 ' + platform + ' 资产...');
        const res = await fetch('/api/admin/hosts/converge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform })
        });
        const data = await res.json();
        showToast('已收敛 ' + platform + '：迁移 ' + (data.movedSkills || 0) + ' Skills, ' + (data.movedMcps || 0) + ' MCPs');
        render();
      } catch (err) {
        showToast('收敛失败: ' + err.message);
      }
    }

    async function saveHostPath(e, platform) {
      e.preventDefault();
      const f = e.target;
      try {
        await fetch('/api/admin/hosts/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            platform,
            pluginTargetPath: f.pluginTargetPath.value.trim(),
            mcpConfigPath: f.mcpConfigPath.value.trim(),
            skillsDir: f.skillsDir.value.trim()
          })
        });
        showToast('已保存 ' + platform + ' 目录配置');
        render();
      } catch (err) {
        showToast('保存失败: ' + err.message);
      }
    }

    async function refreshData() {
      const icon = document.getElementById('refresh-icon');
      if (icon) icon.classList.add('spinning');
      try {
        await render();
        showToast('数据已刷新');
      } catch (err) {
        showToast('刷新失败: ' + err.message);
      } finally {
        if (icon) icon.classList.remove('spinning');
      }
    }

    async function render() {
      const [overview, disc, wsData, trashData, trustedData, hostsData] = await Promise.all([
        fetch('/api/admin/overview').then(r => r.json()),
        fetch('/api/admin/discover').then(r => r.json()),
        fetch('/api/admin/workspaces').then(r => r.json()),
        fetch('/api/admin/trash').then(r => r.json()),
        fetch('/api/admin/trusted-dirs').then(r => r.json()),
        fetch('/api/admin/hosts').then(r => r.json())
      ]);
      window.__state = { overview, disc, wsData, trashData, trustedData, hostsData };

      // Update counters & Home indicator
      document.getElementById('home-path').textContent = overview.paths.home;
      document.getElementById('sidebar-home').textContent = overview.paths.home;
      document.getElementById('cnt-lib').textContent = overview.skills.length + overview.plugins.length + overview.mcps.length;
      document.getElementById('cnt-disc').textContent = (disc.bundles || []).filter(b => !isBundleConverged(b)).length;
      document.getElementById('cnt-ws').textContent = (wsData.workspaces || []).length;
      document.getElementById('cnt-hosts').textContent = (hostsData.hosts || []).filter(h => h.installed).length + '/' + (hostsData.hosts || []).length;
      document.getElementById('cnt-trash').textContent = (trashData.items || []).length;

      renderKpiStrip();
      renderToolbar();
      renderTabBody();
    }

    function isBundleConverged(b) {
      const hasUnmovedFiles =
        (b.skills && b.skills.length > 0) ||
        (b.plugins && b.plugins.length > 0) ||
        (b.mcps && b.mcps.length > 0);
      return Boolean(b.allImported && !hasUnmovedFiles);
    }

    function renderKpiStrip() {
      const kpi = document.getElementById('kpi-strip');
      const { overview, disc, wsData, trashData, hostsData } = window.__state;

      if (currentTab === 'library') {
        kpi.innerHTML =
          '<div class="kpi-item"><span class="kpi-label">Skills 技能</span><span class="kpi-num">' + overview.skills.length + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">Plugins 插件</span><span class="kpi-num">' + overview.plugins.length + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">MCP 服务</span><span class="kpi-num">' + overview.mcps.length + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">Prompt Cache</span><span class="badge ok">Byte-0 冻结保护</span></div>';
      } else if (currentTab === 'discover') {
        const bundles = disc.bundles || [];
        const unconverged = bundles.filter(b => !isBundleConverged(b)).length;
        const converged = bundles.length - unconverged;
        kpi.innerHTML =
          '<div class="kpi-item"><span class="kpi-label">聚合能力组</span><span class="kpi-num">' + bundles.length + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">外部待收敛</span><span class="kpi-num" style="color:var(--cds-clay)">' + unconverged + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">已收敛去重</span><span class="kpi-num">' + converged + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">扫描平台</span><span class="badge">7 大 AI 宿主</span></div>';
      } else if (currentTab === 'workspaces') {
        const wsCount = (wsData.workspaces || []).length;
        const trustedCount = (window.__state.trustedData.directories || []).length;
        kpi.innerHTML =
          '<div class="kpi-item"><span class="kpi-label">配置路由数</span><span class="kpi-num">' + wsCount + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">已发现信任目录</span><span class="kpi-num">' + trustedCount + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">路由隔离模式</span><span class="badge ok">CWD 动态匹配</span></div>';
      } else if (currentTab === 'hosts') {
        const hosts = hostsData.hosts || [];
        const installed = hosts.filter(h => h.installed).length;
        kpi.innerHTML =
          '<div class="kpi-item"><span class="kpi-label">已接入宿主</span><span class="kpi-num">' + installed + ' / ' + hosts.length + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">架构规范</span><span class="badge ok">Single Plugin Convergence</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">集成内容</span><span class="kpi-num">MCP + Hooks + 统一存储</span></div>';
      } else {
        const items = trashData.items || [];
        const imported = items.filter(i => i.origin === 'imported').length;
        const deleted = items.filter(i => i.origin === 'deleted').length;
        kpi.innerHTML =
          '<div class="kpi-item"><span class="kpi-label">隔离项目总计</span><span class="kpi-num">' + items.length + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">外部导入备份</span><span class="kpi-num">' + imported + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">本平台删除</span><span class="kpi-num">' + deleted + '</span></div>' +
          '<div class="kpi-divider"></div>' +
          '<div class="kpi-item"><span class="kpi-label">安全机制</span><span class="badge">保留原路径，支持双模式还原</span></div>';
      }
    }

    function setPlatformFilter(p) {
      platformFilter = p;
      document.querySelectorAll('#platform-seg .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.platform === p);
      });
      renderTabBody();
    }

    function setTrashFilter(f) {
      trashFilter = f;
      document.querySelectorAll('#trash-seg .seg-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === f);
      });
      renderTabBody();
    }

    function renderToolbar() {
      const searchWrap = document.getElementById('search-wrap');
      const qBox = document.getElementById('q-box');
      const controls = document.getElementById('toolbar-controls');

      // Bind search input listeners once
      setupSearchInput(qBox);

      if (['library', 'discover', 'trash'].includes(currentTab)) {
        searchWrap.style.display = 'flex';
        if (currentTab === 'library') {
          qBox.placeholder = '搜索 Skills / Plugins / MCPs (按 / 聚焦)...';
        } else if (currentTab === 'discover') {
          qBox.placeholder = '过滤发现的资产与平台 (按 / 聚焦)...';
        } else {
          qBox.placeholder = '搜索回收站隔离资产 (按 / 聚焦)...';
        }
      } else {
        searchWrap.style.display = 'none';
      }

      if (currentTab === 'discover') {
        const platforms = ['all', 'claude-code', 'claude-desktop', 'claude-desktop-3p', 'codex', 'cursor', 'gemini-cli', 'openhands', 'agents'];
        controls.innerHTML =
          '<div class="segmented-control" id="platform-seg">' +
            platforms.map(p =>
              '<button type="button" class="seg-btn ' + (platformFilter === p ? 'active' : '') + '" data-platform="' + p + '" onclick="setPlatformFilter(\\'' + p + '\\')">' +
                (p === 'all' ? '全部平台' : p) +
              '</button>'
            ).join('') +
          '</div>' +
          '<label class="check-chip">' +
            '<input type="checkbox" ' + (showImported ? 'checked' : '') + ' onchange="showImported=this.checked;renderTabBody()">' +
            '<span>显示已收敛资产</span>' +
          '</label>';
      } else if (currentTab === 'trash') {
        const filters = [
          { id: 'all', label: '全部项目' },
          { id: 'imported', label: '导入备份 / 去重归档' },
          { id: 'deleted', label: '本平台删除' }
        ];
        controls.innerHTML =
          '<div class="segmented-control" id="trash-seg">' +
            filters.map(f =>
              '<button type="button" class="seg-btn ' + (trashFilter === f.id ? 'active' : '') + '" data-filter="' + f.id + '" onclick="setTrashFilter(\\'' + f.id + '\\')">' +
                f.label +
              '</button>'
            ).join('') +
          '</div>';
      } else {
        controls.innerHTML = '';
      }
    }

    function renderTabBody() {
      const root = document.getElementById('tab-body');
      const { overview, disc, wsData, trashData, trustedData, hostsData } = window.__state;
      const q = searchQuery.toLowerCase().trim();
      const matchText = (t) => !q || String(t).toLowerCase().includes(q);

      if (currentTab === 'library') {
        const skills = overview.skills.filter(s => matchText(s.id + ' ' + (s.name || '') + ' ' + (s.description || '')));
        const plugins = overview.plugins.filter(p => matchText(p.plugin_id + ' ' + (p.name || '') + ' ' + p.source_runtime));
        const mcps = overview.mcps.filter(m => matchText(m.id + ' ' + (m.command || '') + ' ' + (m.url || '')));

        const skillsHtml = skills.map(s =>
          '<div class="card">' +
            '<div class="card-head">' +
              '<div class="card-title-group">' +
                '<span class="card-type-icon skill"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span>' +
                '<span class="card-title">' + esc(s.name || s.id) + '</span>' +
              '</div>' +
              '<span class="badge">skill</span>' +
            '</div>' +
            '<div class="muted">' + esc(s.description || s.skillMdPath) + '</div>' +
            '<div class="row-actions">' +
              '<span class="muted mono" style="font-size:10px;">ID: ' + esc(s.id) + '</span>' +
              '<button class="btn danger" style="margin-left:auto;" onclick=\\'deleteToTrash("skill",' + JSON.stringify(s.id) + ')\\'>移至回收站</button>' +
            '</div>' +
          '</div>'
        ).join('') || '<div class="empty-state"><span class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg></span><div class="empty-title">暂无 Skill</div><div class="empty-desc">未找到匹配的独立技能或插件导出技能。</div></div>';

        const pluginsHtml = plugins.map(p =>
          '<div class="card">' +
            '<div class="card-head">' +
              '<div class="card-title-group">' +
                '<span class="card-type-icon plugin"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c0-1.57.802-2.54 2.14-2.54 1.35 0 2.421 1.07 2.421 2.42 0 1.34-1.071 2.42-2.421 2.42-1.338 0-2.14-.97-2.14-2.3zM4 11h3a2 2 0 0 1 2 2v1a2 2 0 0 0 4 0v-1a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1a2 2 0 0 0 0 4h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1a2 2 0 0 0 0-4H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z"></path></svg></span>' +
                '<span class="card-title">' + esc(p.name || p.plugin_id) + '</span>' +
              '</div>' +
              '<span class="badge plat-' + esc(p.source_runtime) + '">' + esc(p.source_runtime) + '</span>' +
            '</div>' +
            '<div class="muted">版本: <span class="mono">v' + esc(p.version) + '</span> · Hooks: <span class="mono">' + (p.hooks?.length || 0) + '</span> · Skills: <span class="mono">' + (p.skills?.length || 0) + '</span></div>' +
            '<div class="row-actions">' +
              '<span class="muted mono" style="font-size:10px;">ID: ' + esc(p.plugin_id) + '</span>' +
              '<button class="btn danger" style="margin-left:auto;" onclick=\\'deleteToTrash("plugin",' + JSON.stringify(p.plugin_id) + ')\\'>移至回收站</button>' +
            '</div>' +
          '</div>'
        ).join('') || '<div class="empty-state"><span class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19.439 7.85c0-1.57.802-2.54 2.14-2.54 1.35 0 2.421 1.07 2.421 2.42 0 1.34-1.071 2.42-2.421 2.42-1.338 0-2.14-.97-2.14-2.3zM4 11h3a2 2 0 0 1 2 2v1a2 2 0 0 0 4 0v-1a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1a2 2 0 0 0 0 4h1a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h1a2 2 0 0 0 0-4H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2z"></path></svg></span><div class="empty-title">暂无 Plugin</div><div class="empty-desc">统一仓库目前未归档任何跨平台 Plugin。</div></div>';

        const mcpsHtml = mcps.map(m =>
          '<div class="card">' +
            '<div class="card-head">' +
              '<div class="card-title-group">' +
                '<span class="card-type-icon mcp"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"></path></svg></span>' +
                '<span class="card-title">' + esc(m.id) + '</span>' +
              '</div>' +
              '<span class="badge">' + esc(m.scope) + '</span>' +
            '</div>' +
            '<div class="muted mono">' + esc(m.url || [m.command, ...(m.args || [])].join(' ')) + '</div>' +
            '<div class="row-actions">' +
              '<button class="btn danger" style="margin-left:auto;" onclick=\\'deleteToTrash("mcp",' + JSON.stringify(m.id) + ')\\'>移至回收站</button>' +
            '</div>' +
          '</div>'
        ).join('') || '<div class="empty-state"><span class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6m0 8v6M4.93 4.93l4.24 4.24m5.66 5.66l4.24 4.24M2 12h6m8 0h6M4.93 19.07l4.24-4.24m5.66-5.66l4.24-4.24"></path></svg></span><div class="empty-title">暂无 MCP Server</div><div class="empty-desc">目前未注册独立的 MCP Manifest。</div></div>';

        root.innerHTML =
          '<div class="section-title">Skills 技能 (' + skills.length + ')</div><div class="grid">' + skillsHtml + '</div>' +
          '<div class="section-title">Plugins 插件 (' + plugins.length + ')</div><div class="grid">' + pluginsHtml + '</div>' +
          '<div class="section-title">MCP Servers (' + mcps.length + ')</div><div class="grid">' + mcpsHtml + '</div>';
      } else if (currentTab === 'discover') {
        const bundles = (disc.bundles || []).filter(b =>
          (showImported || !isBundleConverged(b)) &&
          (platformFilter === 'all' || b.platforms.includes(platformFilter)) &&
          matchText(b.canonicalId + ' ' + b.platforms.join(' ') + ' ' + b.kinds.join(' '))
        );

        const bundlesHtml = bundles.map(b => {
          const itemsLines = [
            ...b.skills.map(s => 'Skill: ' + s.id + ' [' + s.platform + ']'),
            ...b.plugins.map(p => 'Plugin: ' + p.id + ' [' + p.platform + ']'),
            ...b.mcps.map(m => 'MCP: ' + m.id + ' [' + m.platform + ']')
          ];
          const fullyDone = isBundleConverged(b);

          return '<div class="card">' +
            '<div class="card-head">' +
              '<div class="card-title-group">' +
                '<span class="card-type-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg></span>' +
                '<span class="card-title">' + esc(b.canonicalId) + '</span>' +
              '</div>' +
              '<div class="check-group" style="margin:0;">' +
                b.kinds.map(k => '<span class="badge">' + esc(k) + '</span>').join('') +
              '</div>' +
            '</div>' +
            '<div class="check-group" style="margin:0;">' +
              b.platforms.map(p => '<span class="badge plat-' + esc(p) + '">' + esc(p) + '</span>').join('') +
            '</div>' +
            '<div class="muted mono" style="font-size:11px;">' + itemsLines.map(esc).join('<br/>') + '</div>' +
            '<div class="row-actions">' +
              (fullyDone
                ? '<span class="badge ok">✓ 已全部收敛去重</span>'
                : '<button class="btn clay" onclick=\\'importBundle(' + JSON.stringify(b.canonicalId) + ')\\'>' +
                    (b.allImported ? '去重并移走外部副本 (' + itemsLines.length + ' 项)' : '一键聚合导入 (' + itemsLines.length + ' 项)') +
                  '</button>') +
            '</div>' +
          '</div>';
        }).join('') || '<div class="empty-state"><span class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></svg></span><div class="empty-title">未发现外部未收敛资产</div><div class="empty-desc">所有检测到的宿主平台资产均已完成收敛，或当前筛选条件无匹配项。</div></div>';

        root.innerHTML =
          '<div class="section-title">聚合能力视图 (' + bundles.length + ' · 同名/同源 Skill + Plugin + MCP 已合并)</div>' +
          '<div class="grid">' + bundlesHtml + '</div>';
      } else if (currentTab === 'hosts') {
        const hosts = hostsData.hosts || [];
        root.innerHTML =
          '<div class="notice-box">' +
            '<span class="notice-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>' +
            '<div>' +
              '<strong>Single Plugin Convergence (单插件收敛准则)</strong><br/>' +
              '宿主平台（Claude Desktop, Claude Code, Cursor, Codex, Gemini CLI 等）应当仅通过单一 SidecarMCP 插件桥接。系统会在插件内承载 MCP 规范与生命周期 Hooks，点击「一键收敛」可自动将散落的外部 Skills 和冗余 root mcpServers 导入并去重备份。' +
            '</div>' +
          '</div>' +
          '<div class="grid">' +
          hosts.map(h =>
            '<div class="card">' +
              '<div class="card-head">' +
                '<div class="card-title-group">' +
                  '<span class="card-type-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg></span>' +
                  '<span class="card-title">' + esc(h.label) + '</span>' +
                '</div>' +
                '<span class="badge plat-' + esc(h.platform) + '">' + esc(h.platform) + '</span>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:7px;font-size:12px;">' +
                '<span class="status-dot ' + (h.installed ? 'active' : '') + '" style="background:' + (h.installed ? 'var(--cds-ok)' : 'var(--cds-muted)') + '"></span>' +
                '<span style="font-weight:550;color:' + (h.installed ? 'var(--cds-ok)' : 'var(--cds-muted)') + '">' +
                  (h.installed ? '已接入 SidecarMCP 插件' : '未安装插件') +
                '</span>' +
              '</div>' +
              '<form onsubmit=\\'saveHostPath(event,' + JSON.stringify(h.platform) + ')\\' style="display:flex;flex-direction:column;gap:8px;">' +
                '<div>' +
                  '<label class="muted" style="display:block;margin-bottom:3px;font-size:11px;">Plugin 目标目录</label>' +
                  '<input class="input mono" style="width:100%;font-size:11px;padding:5px 8px;" name="pluginTargetPath" value="' + esc(h.targetPath) + '" placeholder="~/.claude/plugins/paseo-sidecar" />' +
                '</div>' +
                '<div>' +
                  '<label class="muted" style="display:block;margin-bottom:3px;font-size:11px;">MCP 配置文件</label>' +
                  '<input class="input mono" style="width:100%;font-size:11px;padding:5px 8px;" name="mcpConfigPath" value="' + esc(h.mcpConfigPath) + '" placeholder="~/.claude.json" />' +
                '</div>' +
                '<div>' +
                  '<label class="muted" style="display:block;margin-bottom:3px;font-size:11px;">Skills 扫描目录</label>' +
                  '<input class="input mono" style="width:100%;font-size:11px;padding:5px 8px;" name="skillsDir" value="' + esc(h.skillsDir) + '" placeholder="~/.claude/skills" />' +
                '</div>' +
                '<div class="row-actions" style="margin-top:6px;">' +
                  '<button class="btn secondary" type="submit">保存路径</button>' +
                  (h.installed
                    ? '<button type="button" class="btn secondary" onclick=\\'installHost(' + JSON.stringify(h.platform) + ')\\'>重新安装覆盖</button>'
                    : '<button type="button" class="btn clay" onclick=\\'installHost(' + JSON.stringify(h.platform) + ')\\'>安装 Plugin</button>') +
                  '<button type="button" class="btn clay" style="margin-left:auto;" onclick=\\'convergeHost(' + JSON.stringify(h.platform) + ')\\'>一键收敛</button>' +
                '</div>' +
              '</form>' +
            '</div>'
          ).join('') +
          '</div>';
      } else if (currentTab === 'workspaces') {
        const workspaces = wsData.workspaces || [];
        const trustedDirs = trustedData.directories || [];
        const chips = (name, items, getLabel) => items.map(it => {
          const val = typeof it === 'string' ? it : (it.id || it.plugin_id);
          const lbl = getLabel ? getLabel(it) : val;
          return '<label class="check-chip"><input type="checkbox" name="' + name + '" value="' + esc(val) + '"> <span>' + esc(lbl) + '</span></label>';
        }).join('') || '<span class="muted">暂无可选项</span>';

        root.innerHTML =
          '<form id="workspace-form" class="panel" onsubmit="saveWorkspace(event)">' +
            '<h3 id="ws-form-title" style="margin:0 0 6px;font-size:16px;font-weight:650;letter-spacing:-0.015em;">新建 / 更新工作区路由规则</h3>' +
            '<div class="muted" style="margin-bottom:18px;">根据会话发起的当前工作目录 (canonical_cwd)，动态分配启用的 Runtime 集合、特定 Skills、Plugins 及 MCP 服务。</div>' +
            '<div class="form-grid">' +
              '<div class="field">' +
                '<label>工作区 ID</label>' +
                '<input class="input mono" style="width:100%" name="ws_id" placeholder="payment-service" />' +
                '<div class="field-hint">唯一标识符，留空则自动从名称生成</div>' +
              '</div>' +
              '<div class="field">' +
                '<label>名称</label>' +
                '<input class="input" style="width:100%" name="name" placeholder="支付系统核心后端" />' +
                '<div class="field-hint">人类可读的工作区别名</div>' +
              '</div>' +
              '<div class="field" style="grid-column: 1 / -1;">' +
                '<label>目标目录 (canonical_cwd · 支持 * 表示 Global / 全局，或信任目录自动补全) *</label>' +
                '<input id="cwd-input" list="trusted-cwd-list" class="input mono" style="width:100%" name="canonical_cwd" required placeholder="*（Global / 全局）或 /Users/username/work/project" />' +
                '<datalist id="trusted-cwd-list">' +
                  '<option value="*">Global / 全局（匹配所有目录）</option>' +
                  trustedDirs.map(d => '<option value="' + esc(d.path) + '">' + esc(d.platform) + '</option>').join('') +
                '</datalist>' +
              '</div>' +
            '</div>' +
            '<div class="field" style="margin-bottom:14px;">' +
              '<label>快速选择目标范围：</label>' +
              '<div class="check-group">' +
                '<button type="button" class="btn secondary" style="font-size:11px;" onclick="selectWorkspaceCwd(\\'*\\', \\'Global\\')">Global / 全局 (*)</button>' +
                trustedDirs.slice(0, 12).map(d => {
                  const dirName = d.path.split('/').filter(Boolean).pop() || 'project';
                  return '<button type="button" class="btn secondary mono" style="font-size:11px;" onclick=\\'selectWorkspaceCwd(' + JSON.stringify(d.path) + ', ' + JSON.stringify(dirName) + ')\\'>' +
                    esc(d.path.split('/').slice(-2).join('/')) + ' (' + esc(d.platform) + ')' +
                  '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="field" style="margin-bottom:14px;"><label>适用 Runtimes：</label><div class="check-group">' + chips('runtimes', RUNTIMES) + '</div></div>' +
            '<div class="field" style="margin-bottom:14px;"><label>默认注入 Skills 技能 <span class="muted" style="font-weight:400;">（勾选即在 SessionStart / PreInvocation 自动注入，省去 2 轮查找对话；不勾选则按需加载）</span>：</label><div class="check-group">' + chips('skills', overview.skills) + '</div></div>' +
            '<div class="field" style="margin-bottom:14px;">' +
              '<label for="ws-skill-injection-mode">Skills 注入模式 (skill_injection_mode)：</label>' +
              '<select id="ws-skill-injection-mode" class="input" name="skill_injection_mode" style="width:100%;max-width:420px;">' +
                '<option value="inline">inline · 全文直注（省轮次，推荐）</option>' +
                '<option value="manifest">manifest · 路径索引（省上下文）</option>' +
              '</select>' +
              '<div class="field-hint">控制默认注入 Skills 在 SessionStart / PreInvocation 自动注入中的内容格式</div>' +
            '</div>' +
            '<div class="field" style="margin-bottom:14px;"><label>可用 Plugins (区分平台来源) <span class="muted" style="font-weight:400;">（不勾选则不限制，全部可用）</span>：</label><div class="check-group">' + chips('plugins', overview.plugins, p => p.plugin_id + ' [' + p.source_runtime + ']') + '</div></div>' +
            '<div class="field" style="margin-bottom:20px;"><label>可用 MCP Servers <span class="muted" style="font-weight:400;">（不勾选则不限制，全部可用）</span>：</label><div class="check-group">' + chips('mcps', overview.mcps) + '</div></div>' +
            '<div style="display:flex;gap:10px;align-items:center;">' +
              '<button id="ws-submit-btn" class="btn clay" type="submit" style="padding:8px 18px;font-size:13px;">保存工作区配置</button>' +
              '<button id="ws-cancel-btn" class="btn secondary" type="button" style="display:none;padding:8px 14px;font-size:13px;" onclick="resetWorkspaceForm()">取消编辑</button>' +
            '</div>' +
          '</form>' +
          '<div class="section-title">已配置工作区规则 (' + workspaces.length + ')</div>' +
          '<div class="grid">' +
          (workspaces.map(w => {
            const injectionMode = (w.metadata && w.metadata.skill_injection_mode === 'manifest') ? 'manifest' : 'inline';
            return '<div class="card">' +
              '<div class="card-head">' +
                '<div class="card-title-group">' +
                  '<span class="card-type-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg></span>' +
                  '<span class="card-title">' + esc(w.name) + '</span>' +
                '</div>' +
                '<span class="badge ok">✓ active</span>' +
              '</div>' +
              (isGlobalCwd(w.canonical_cwd)
                ? '<div style="display:flex;align-items:center;gap:6px;"><span class="badge" style="background:rgba(217,119,87,0.12);color:#c25938;">Global / 全局</span><span class="muted mono">*</span></div>'
                : '<div class="muted mono">' + esc(w.canonical_cwd) + '</div>') +
              '<div class="check-group">' +
                (w.runtimes || []).map(r => '<span class="badge plat-' + esc(r) + '">' + esc(r) + '</span>').join('') +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                '<span class="badge mono" style="background:var(--cds-accent-soft);color:var(--cds-accent);">注入模式: ' + esc(injectionMode) + '</span>' +
                '<span class="muted">Skills: ' + esc((w.metadata?.skills || []).join(', ') || '按需加载') + ' · Plugins: ' + esc((w.plugins || []).join(', ') || '未限制 (全部)') + ' · MCPs: ' + esc((w.metadata?.mcp_servers || []).join(', ') || '未限制 (全部)') + '</span>' +
              '</div>' +
              '<div class="row-actions">' +
                '<span class="muted mono" style="font-size:10px;">ID: ' + esc(w.id) + '</span>' +
                '<button class="btn secondary" style="margin-left:auto;" onclick=\\'editWorkspace(' + JSON.stringify(w.id) + ')\\'>编辑</button>' +
                '<button class="btn danger" onclick=\\'deleteWorkspace(' + JSON.stringify(w.id) + ')\\'>删除规则</button>' +
              '</div>' +
            '</div>';
          }).join('') || '<div class="empty-state"><span class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg></span><div class="empty-title">暂无工作区规则</div><div class="empty-desc">在上方表单中配置按目录路由规则，实现不同项目的能力隔离。</div></div>') +
          '</div>';
      } else {
        const items = (trashData.items || []).filter(i => (trashFilter === 'all' || i.origin === trashFilter) && matchText(i.id + ' ' + i.platform));
        const itemsHtml = items.map(i =>
          '<div class="card">' +
            '<div class="card-head">' +
              '<div class="card-title-group">' +
                '<span class="card-type-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span>' +
                '<span class="card-title">' + esc(i.id) + '</span>' +
              '</div>' +
              '<span class="badge ' + esc(i.origin) + '">' + (i.origin === 'imported' ? '导入备份' : '本平台删除') + '</span>' +
            '</div>' +
            '<div class="check-group">' +
              '<span class="badge">' + esc(i.kind) + '</span>' +
              '<span class="badge plat-' + esc(i.platform) + '">' + esc(i.platform) + '</span>' +
              (i.scope ? '<span class="badge">' + (i.scope === 'global' ? 'Global' : '项目目录') + '</span>' : '') +
            '</div>' +
            '<div class="muted mono" style="font-size:11px;">' + esc(i.originalPath ? ('原路径: ' + i.originalPath) : i.path) + '</div>' +
            '<div class="row-actions">' +
              '<button class="btn clay" onclick=\\'restoreFromTrash(' + JSON.stringify(i.path) + ',"sidecar")\\'>还原到 Sidecar</button>' +
              (i.originalPath ? '<button class="btn secondary" onclick=\\'restoreFromTrash(' + JSON.stringify(i.path) + ',"original")\\'>还原回原目录</button>' : '') +
              '<button class="btn danger" style="margin-left:auto;" onclick=\\'purgeFromTrash(' + JSON.stringify(i.path) + ')\\'>彻底清理</button>' +
            '</div>' +
          '</div>'
        ).join('') || '<div class="empty-state"><span class="empty-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></span><div class="empty-title">回收站为空</div><div class="empty-desc">没有匹配的隔离或删除记录。</div></div>';

        root.innerHTML =
          '<div class="section-title">已隔离资产列表 (' + items.length + ')</div>' +
          '<div class="grid">' + itemsHtml + '</div>';
      }
    }

    render();
  </script>
</body>
</html>`;
}

export async function handleAdminRequest(
  req: IncomingMessage,
  res: ServerResponse,
  registry: UnifiedRegistry,
): Promise<boolean> {
  if (await handleWorkspacesApi(req, res, registry)) {
    return true;
  }
  const url = (req.url ?? "/").split("?")[0];
  if (req.method === "GET" && (url === "/" || url === "/admin" || url.startsWith("/admin/"))) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(renderAdminHtml());
    return true;
  }
  if (req.method === "GET" && url === "/api/admin/overview") {
    const assets = await registry.resolveWorkspaceAssets();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        paths: registry.paths,
        skills: assets.skills,
        plugins: assets.plugins,
        mcps: assets.mcps,
      }),
    );
    return true;
  }
  if (req.method === "GET" && url === "/api/admin/discover") {
    const discovered = discoverPlatformAssets(registry);
    const bundles = aggregateDiscoveredBundles(discovered);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ...discovered, bundles }));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/import") {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as {
      kind: "skill" | "plugin" | "mcp";
      id: string;
      sourcePath?: string;
      sourceConfigFile?: string;
      platform?: RuntimeType | "agents";
      version?: string;
      config?: Record<string, unknown>;
    };
    let result: unknown;
    if (body.kind === "skill" && body.sourcePath) {
      result = importSkillDeduplicated(body.sourcePath, body.id, registry, body.platform ?? "unknown");
    } else if (body.kind === "plugin" && body.sourcePath && body.platform && body.platform !== "agents") {
      result = importPluginWithPlatform(body.sourcePath, body.id, body.platform, body.version ?? "1.0.0", registry);
    } else if (body.kind === "mcp" && body.config) {
      result = importMcpManifest(body.id, body.config, registry, body.sourceConfigFile, body.platform ?? "unknown");
    } else {
      res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Invalid import payload" }));
      return true;
    }
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
    return true;
  }
  if (req.method === "GET" && url === "/api/admin/trash") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ items: listTrashItems(registry) }));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/library/delete") {
    const body = JSON.parse(await readBody(req)) as { kind: AssetKind; id: string };
    const item = deleteLibraryAssetToTrash(registry, body.kind, body.id);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ deleted: item }));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/trash/restore") {
    const body = JSON.parse(await readBody(req)) as { path: string; mode?: "sidecar" | "original" };
    const result = restoreTrashItem(registry, body.path, body.mode ?? "sidecar");
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/trash/purge") {
    const body = JSON.parse(await readBody(req)) as { path: string };
    purgeTrashItem(body.path);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ purged: true }));
    return true;
  }
  if (req.method === "GET" && url === "/api/admin/trusted-dirs") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ directories: discoverTrustedDirectories() }));
    return true;
  }
  if (req.method === "GET" && url === "/api/admin/hosts") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ hosts: getHostPluginStatuses(registry) }));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/hosts/config") {
    const body = JSON.parse(await readBody(req)) as {
      platform: RuntimeType;
      pluginTargetPath?: string;
      mcpConfigPath?: string;
      skillsDir?: string;
    };
    const hosts = saveHostConfig(registry, body.platform, {
      ...(body.pluginTargetPath ? { pluginTargetPath: body.pluginTargetPath } : {}),
      ...(body.mcpConfigPath ? { mcpConfigPath: body.mcpConfigPath } : {}),
      ...(body.skillsDir ? { skillsDir: body.skillsDir } : {}),
    });
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ hosts }));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/hosts/install") {
    const body = JSON.parse(await readBody(req)) as { platform: RuntimeType; port?: number };
    const installed = installSidecarPluginToHost(registry, body.platform, body.port ?? 44880);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(installed));
    return true;
  }
  if (req.method === "POST" && url === "/api/admin/hosts/converge") {
    const body = JSON.parse(await readBody(req)) as { platform: RuntimeType; port?: number };
    const converged = convergeHostAssets(registry, body.platform, body.port ?? 44880);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(converged));
    return true;
  }
  return false;
}
