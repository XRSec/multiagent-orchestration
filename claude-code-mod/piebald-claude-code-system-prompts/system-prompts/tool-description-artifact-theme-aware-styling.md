<!--
name: "Tool Description: Artifact theme-aware styling"
description: "Viewer theme states and CSS token pattern for light, system-dark, explicit-dark, and dark-first artifacts"
ccVersion: "2.1.284"
-->
**Theme-aware**: Viewer themes have three states: explicit `data-theme="dark"` or `data-theme="light"` on the root element, or unset (`system`, where only `prefers-color-scheme` distinguishes light from dark).

Define every color as a token (token names and count are the design's own):
```css
:root { --bg: …; --fg: …; --accent: … }  /* every token, light values */
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: …; --fg: …; --accent: …; color-scheme: dark } }
:root[data-theme="dark"] { --bg: …; --fg: …; --accent: …; color-scheme: dark }  /* same dark values, so the toggle wins both ways */
body { background: var(--bg); color: var(--fg) }
```

- **Token rules**: Define every color token first on bare `:root`; dark blocks only redefine tokens and set `color-scheme: dark` (so form controls and scrollbars follow). Do not define any color exclusively inside `@media` or `[data-theme]`, and avoid literal colors in component rules that work in one theme only.
- **Explicit body ground**: Keep `body { background: var(--bg); color: var(--fg) }` — the viewer paints its own backdrop behind the page, so a transparent body leaks the host theme.
- **Dark-first design**: Mirror the selectors — dark values and `color-scheme: dark` on bare `:root` (the skeleton pins `light` there), light values and `color-scheme: light` under `@media (prefers-color-scheme: light)` guarded `:root:not([data-theme="dark"])` and `:root[data-theme="light"]`.
- **Single-theme design**: You may drop the alternate-theme blocks, but still set `body` background and every color explicitly, plus `color-scheme: dark` on `:root` if dark.