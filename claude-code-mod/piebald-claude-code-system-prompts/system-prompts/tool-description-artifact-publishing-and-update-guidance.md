<!--
name: "Tool Description: Artifact publishing and update guidance"
description: "Artifact library loading, sandbox limits, storage, size, responsive/theme styling, and icon rules"
ccVersion: "2.1.311"
variables:
  - "ARTIFACT_EXTERNAL_RESOURCE_ALLOWLIST"
  - "ARTIFACT_CAPABILITIES_SKILL_NAME"
  - "MAX_ARTIFACT_BYTES"
  - "ARTIFACT_RESPONSIVE_DESIGN_GUIDANCE"
  - "ARTIFACT_THEME_AWARE_STYLING_GUIDANCE"
-->
${ARTIFACT_EXTERNAL_RESOURCE_ALLOWLIST}

<library_loading>
- Load libraries via `<script src="https://cdnjs.cloudflare.com/ajax/libs/<lib>/<exact version>/<file>">` using UMD builds that define globals (e.g., `react/18.3.1/umd/react.production.min.js`, then `react-dom`), placed BEFORE any inline `<script>` that uses them.
- Pin exact versions (`react@18.3.1` on jsDelivr/unpkg, `react/18.3.1/...` on cdnjs, `cdn.tailwindcss.com/3.4.17`); NEVER use bare names, ranges, or tags (`react`, `react@18`, `@latest`).
- Use versions >= 2 weeks old (prior-knowledge versions qualify; when looking up versions, skip any published in the last 2 weeks).
- Mermaid renders natively (Markdown ```` ```mermaid ```` fences, HTML `<pre class="mermaid">` blocks); do not load a Mermaid library.
</library_loading>

<viewer_sandbox_limits>
All viewers (anonymous, signed-in, embedded, desktop, mobile) run in a locked-down frame; build around these limits instead of feature-detecting them:

| Feature / API | Support & Required Pattern |
|---|---|
| Downloads (`<a download>`, `data:`/`blob:`, script saves) | Blocked and inert. Never offer file downloads via plain links. |
| External links (`https://...`) | Supported; open in a new tab via real `<a href>`. `window.open` works only for some signed-in org viewers and returns `null` for others. |
| `mailto:`, `tel:`, `sms:`, custom schemes | Unreliable (often fail for external/public viewers) with no failure signal. Show the address/number as selectable text (optionally with a copy button), treat links as best-effort, and never claim a message/call was sent. |
| `alert()`, `confirm()`, `prompt()` | Suppressed (`confirm()` returns `false`, `prompt()` returns `null` immediately). Build confirmations into page UI. |
| `window.print()` | No-op. Never include Print or "Save as PDF" buttons. |
| `<form>` | UI, validation, and `submit` events work, but real submissions go nowhere. Handle `submit` with `preventDefault()`; never set `action` to another site or `mailto:`. |
| Clipboard | `navigator.clipboard.writeText` works inside click handlers; catch rejections (some desktop/app views refuse) and fall back to selecting text. Clipboard reads never work; user `paste` events do. |
| Device APIs (camera, mic, screen capture, location, motion, Web Share) | Refused without prompt unless the user has a matching runtime capability (see `${ARTIFACT_CAPABILITIES_SKILL_NAME}`) and the page declares it. Otherwise accept files via `<input type="file">`, drag-and-drop, and `FileReader`. |
| Screen wake lock, fullscreen, pointer lock | Optional: wake lock may grant while visible; fullscreen/pointer lock work from desktop clicks but fail on phones/some apps. Always handle rejection. |
| Audio | Unmuted playback requires user interaction (muted autoplay works). Trigger sound from a button. |
| Embedding (`<iframe>`, `<object>`, `<embed>`) | External sites (YouTube, maps, forms) cannot be embedded; link out instead. |
| Workers & relative `fetch()` | Web Workers work from your own files or `blob:` URLs; service workers and WebRTC do not. `fetch()` works for co-published files via relative URLs; images from own files, `data:`, or `blob:` URLs draw to canvas and export cleanly. |
| Hash routing (`location.hash`) | Only plain `#name` passes between the artifact link and `location.hash` (NEVER `#/path`, `#key=value`, `pushState` paths, or query strings). Address bars follow the hash on the artifact's own page and Share Copy link (sidebar/project/app bars may not). If multi-view bookmarking is needed, route on `#name` using ASCII letters, digits, and hyphens ONLY — NEVER use reserved claude.ai names (`settings`, `sidebar`, `customize`, `upgrade`, `downloads`, `comment-*`); render on load and `hashchange`. Keep other state in-page; NEVER put keys, tokens, or private data in the hash. |
</viewer_sandbox_limits>

<browser_storage>
- `localStorage`, `sessionStorage`, and IndexedDB are scoped per artifact origin in that single viewer's browser: data survives republishes to the same URL but never reaches other viewers, other devices, or you.
- Reads/writes may return empty or throw (private windows, blocked site data, previews, thumbnail capture): wrap every access in `try`/`catch` and render cleanly without it.
- Use ONLY for per-viewer conveniences (remembered tab/filter, collapsed section, unsent draft). NEVER store state that must persist reliably, be shared across viewers, or be read back by you — load `${ARTIFACT_CAPABILITIES_SKILL_NAME}` before writing the page to use a runtime capability instead.
</browser_storage>

**Size**: Rendered page MUST be ${MAX_ARTIFACT_BYTES/1024/1024}MB or smaller (embedded `data:` URIs count toward this limit).

${ARTIFACT_RESPONSIVE_DESIGN_GUIDANCE}

${ARTIFACT_THEME_AWARE_STYLING_GUIDANCE}

**Icon** (first publish only): Pass one short generic word as `icon` (e.g., `"chart"`, `"calendar"`, `"recipe"`) for the browser-tab icon — a plain signifier, NEVER a brand/product name, emoji, or markup. The icon stays fixed for the artifact's lifetime: omit `icon` on redeploys (same session file path or `url`) unless the user requests a change.