<!--
name: "Tool Description: Artifact design fallback requirements"
description: "Baseline title, theme-token, CDN-version, and mobile-layout requirements when authoring a page before the Artifact design skill loads"
ccVersion: "2.1.293"
-->
<artifact_design_fallback>
Apply the page contract even before the design skill loads: `<title>` as 2–4 word name (explanations go in `description`); `:root` color tokens with dark overrides in `@media (prefers-color-scheme: dark)` (`:root:not([data-theme="light"])`) and `:root[data-theme="dark"]` plus explicit `body` background; scripts strictly from `cdnjs.cloudflare.com` (preferred), `cdn.jsdelivr.net/npm/`, `unpkg.com`, `cdn.tailwindcss.com`, or `code.jquery.com` pinned to exact versions `>= 2 weeks` old (e.g., `react@18.3.1`), Google Fonts stylesheets only, and all other assets inlined; phone-width responsive layout with `16px` side gutter and zero horizontal page scroll.
</artifact_design_fallback>
