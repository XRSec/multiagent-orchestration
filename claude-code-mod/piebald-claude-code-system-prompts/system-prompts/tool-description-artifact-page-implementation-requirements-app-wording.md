<!--
name: "Tool Description: Artifact page implementation requirements (app wording)"
description: "Artifact page requirements for external resources, CSP, browser storage, size, responsive layout, theming, and icons"
ccVersion: "2.1.293"
variables:
  - "ARTIFACT_CAPABILITIES_SKILL_NAME"
  - "MAX_ARTIFACT_BYTES"
-->
<external_resources_and_sandbox>
| Resource / API | Viewer Policy & Required Handling |
| :--- | :--- |
| External `<script>` | Allowed only from `https://cdnjs.cloudflare.com` (preferred), `https://cdn.jsdelivr.net/npm/`, `https://unpkg.com`, `https://cdn.tailwindcss.com` (Tailwind play-CDN script), and `https://code.jquery.com`. Load UMD builds defining globals (`https://cdnjs.cloudflare.com/ajax/libs/<lib>/<exact version>/<file>`, e.g., `react/18.3.1/umd/react.production.min.js` before `react-dom`) prior to dependent inline `<script>` tags. |
| Version pinning | Pin exact versions (`react@18.3.1` on jsDelivr/unpkg, `react/18.3.1/…` on cdnjs, `cdn.tailwindcss.com/3.4.17`); NEVER use bare names, ranges, or tags (`react`, `react@18`, `@latest`). Choose versions ≥ 2 weeks old (pre-conversation versions qualify; skip any published in the last 2 weeks when looking up). |
| External fonts & CSS | External stylesheets allowed only from `https://fonts.googleapis.com`; font files from `https://fonts.gstatic.com`. Always include a real fallback font stack. |
| Blocked network & assets | All other hosts (`esm.sh` included), non-script assets (stylesheets, images, media) on the 5 script hosts, and all outbound `fetch`/XHR/WebSocket calls (including library runtime fetches) fail silently. Inline all other CSS/JS and embed assets as `data:` URIs. |
| Downloads & app links | Page-initiated downloads (`<a download>`, `data:`/`blob:` links, script saves) are blocked—never offer files via plain links. `mailto:`, `tel:`, `sms:` are unreliable—render the address/number as text (an adjacent link is fine) and never claim a message was sent. |
| Diagrams | Mermaid renders natively from ```` ```mermaid ```` fences or `<pre class="mermaid">` blocks; load no library. |
| Dialogs, forms & frame APIs | `alert`/`confirm`/`prompt` are suppressed (`confirm()` returns `false`, `prompt()` returns `null`)—build confirmation UI in-page. Frame blocks print dialog, embedding external sites, device APIs (camera, microphone, location), and clipboard reads. Forms submit nowhere—handle `submit` in script. Only a plain `#anchor` from the URL reaches the page. |
</external_resources_and_sandbox>

<browser_storage>
- `localStorage`, `sessionStorage`, and IndexedDB are scoped per artifact origin in the viewer's browser only: data survives republishes to the same URL and NEVER reaches other viewers, other devices, or you.
- Accessors may return empty or throw (private windows, blocked site data, previews, thumbnail capture): wrap every access in `try/catch`, render properly without stored data, and use storage only for per-viewer conveniences (remembered tab, unsent draft).
- For reliable, shared, or agent-readable state, use a runtime capability if the user has one and load the `${ARTIFACT_CAPABILITIES_SKILL_NAME}` skill before writing the page.
</browser_storage>

<size_and_layout>
- **Size limit**: Rendered page MUST be ${MAX_ARTIFACT_BYTES/1024/1024}MB or smaller, including embedded `data:` URIs.
- **Responsive (`~400px` phone width)**:
  - Keep a ≥ 16px side gutter at every width, set once as side padding on `body` or one outer wrapper (use `padding-block` for vertical padding instead of a `padding` shorthand that zeroes sides).
  - Use relative units; wrap or stack flex and grid rows when narrow; set `max-width:100%` on images and `aspect-ratio` boxes; give nothing a `min-width` wider than the viewport.
  - Only tables, diagrams, and code blocks may exceed viewport width, each inside its own `overflow-x: auto` container so `body` never scrolls horizontally.
</size_and_layout>

<theming>
- Explicit viewer choice stamps `data-theme="dark"` or `data-theme="light"` on the root element; `"system"` stamps nothing, leaving `prefers-color-scheme`.
- Define the full light palette as tokens on bare `:root` (swap roles consistently for dark-first designs); redefine only those tokens under `@media (prefers-color-scheme: dark)` guarded as `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]` so toggles win in both directions.
- Set `color-scheme: dark` wherever the dark palette applies (both dark blocks, or bare `:root` for dark-first / single-dark designs) so form controls and scrollbars follow.
- Never define a color solely inside a media query or `[data-theme]` block, and always set an explicit `background` on `body` (the viewer paints its own ground behind transparent pages), even in single-look designs that skip dark blocks.
</theming>

<icon>
- **First publish**: Pass `icon` as one short generic word (e.g., `"chart"`, `"calendar"`, `"recipe"`) for the browser-tab icon—a plain signifier of page purpose, never a product/brand name, emoji, or markup.
- **Redeploys**: Keep `icon` constant for the artifact's lifetime; omit `icon` on redeploys (same file path this session or `url`), passing a new one only if the user asks.
</icon>
