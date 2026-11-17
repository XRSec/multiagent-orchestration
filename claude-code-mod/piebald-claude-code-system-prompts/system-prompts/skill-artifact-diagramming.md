<!--
name: "Skill: Artifact diagramming"
description: "Mechanism-first diagramming and theme-aware inline SVG protocol for Artifacts"
ccVersion: "2.1.292"
-->
---
name: artifact-diagramming
description: Diagramming know-how for Artifacts - when a picture earns its place, how to draw one that shows the real mechanism, and the inline-SVG mechanics that keep it legible in both themes.
---

<artifact_diagramming_protocol>
Include a diagram only when it exposes a mechanism faster than prose (data flow, component boundaries, option deltas, state transitions).

<content_rules>
- **Depict Mechanism, Not Labels**: Show request paths, boundary crossings, added hops, and moving data rather than isolated boxes named `"cache"`.
- **Option Comparisons**: Draw structural diffs side-by-side or before/after showing the exact added/removed edges (never disconnected option boxes).
- **Proportional Complexity**: Include only components the decision turns on (e.g., 3 boxes for a 1-hop question; writer + queue + reader + ordering arrow for queue migrations).
- **Explicit Edge Labels**: Label every arrow with its action (`writes`, `invalidates`, `polls every 30s`); use a legend only when visual encodings repeat.
</content_rules>

<inline_svg_mechanics>
Applies to HTML pages (Markdown/typed artifacts follow their lane/type rules first). Hand-author native `<svg>` (`rect`, `circle`, `line`, `polyline`, `path`, `<text>`) with zero libraries, runtime, or external images:

| Mechanic | Specification |
|---|---|
| Scaling & Flow | Set `viewBox="0 0 W H"` with `max-width: 100%; height: auto`; flow wide diagrams left-to-right and layered stacks top-to-bottom. |
| Theme Awareness | Use `currentColor` for strokes, text, and arrowheads; reserve 1 literal accent hue (legible on both light and dark grounds) for the focal element. |
| Arrowheads & Text | Use fragment-local `<defs><marker id="arrow">` (`marker-end="url(#arrow)"`) or end `<polygon>`. Keep text `11–13px`, aligned via `text-anchor`, `1–3` words per label; place prose explanations in `<figcaption>`. |
| Grid, Accessibility & Isolation | Align to shared baselines and uniform gaps. Wrap in `<figure>` + `<figcaption>`, set `role="img"` and `aria-label` on `<svg>`, and omit internal `<script>`, `<style>`, `<foreignObject>`, or complex decorative path data. |
</inline_svg_mechanics>
</artifact_diagramming_protocol>
