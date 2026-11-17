<!--
name: "Tool Description: Artifact external resource allowlist"
description: "CSP-enforced CDN script and Google Fonts allowlist requiring all other CSS, JS, and assets to be inlined"
ccVersion: "2.1.281"
-->
**External resources — CDN allowlist (CSP-enforced)**:
- **Scripts only**: `https://cdnjs.cloudflare.com` (preferred), `https://cdn.jsdelivr.net/npm/`, `https://unpkg.com`, `https://cdn.tailwindcss.com`, `https://code.jquery.com`.
- **Stylesheets only**: `https://fonts.googleapis.com` (font files via `https://fonts.gstatic.com`; always specify fallback font stacks).
- **Everything else silently blocked**: All other hosts (including `esm.sh`) and non-script CDN assets (stylesheets, images, media, `fetch`/XHR/WebSocket, runtime library fetches). Inline all other CSS/JS and embed assets as `data:` URIs.
