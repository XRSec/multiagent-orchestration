<!--
name: "Tool Description: Artifact HTML document skeleton"
description: "Defines host-injected HTML wrapper, minimal reset, and safe-area padding/header requirements for Artifact pages"
ccVersion: "2.1.301"
variables:
  - "ARTIFACT_VIEWPORT_SIDES_PADDING_NOTE"
  - "ARTIFACT_SAFE_AREA_TOP_BAND_CSS"
-->
<artifact_html_skeleton>
Author inner page content directly (omit `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`): host injects charset, `viewport-fit=cover`, light `color-scheme`, `:root` top/bottom safe-area padding (preserve it), zero `body` margin + `14px` system font, `img{max-width:100%}`, and `[hidden]{display:none!important}` (toggle via `el.hidden`, not `style.display`).

- Place `<title>`, `<style>`, and `<meta name="claude:viewport-fit-sides" content="cover">` at top of file (promises both `max()` side gutters under Responsive; ${ARTIFACT_VIEWPORT_SIDES_PADDING_NOTE}).
- Fixed edge elements: anchor at `0` and add edge `env(safe-area-inset-*, 0px)` to padding (plus side gutters if full-width); offset floating/absolute controls by nearby insets; sticky headers use `top: env(safe-area-inset-top, 0px)` with fixed `body::before` (`${ARTIFACT_SAFE_AREA_TOP_BAND_CSS}`) painting the top band.
</artifact_html_skeleton>
