<!--
name: "Tool Description: Artifact responsive page contract"
description: "Mobile-first responsive layout contract: safe-area gutters, wrapping flex/grid, bounded media, and scoped horizontal scroll"
ccVersion: "2.1.299"
-->
**Responsive**: Must render at phone width (`~400px`) with zero horizontal body scroll:
- **Safe-Area Gutters**: Set `padding-left: max(16px, env(safe-area-inset-left, 0px))` and `padding-right: max(16px, env(safe-area-inset-right, 0px))` on `body` or outer/band wrappers using `padding-block` for vertical spacing (never `padding` shorthand zeroing sides).
- **Wrapping & Overflow**: Use relative units; wrap/stack flex and grid rows on narrow viewports with `min-width: 0` on text/code/table children. Constrain images and `aspect-ratio` boxes to `max-width: 100%` (no `min-width` exceeding viewport); wrap wide tables, diagrams, and code blocks individually in `overflow-x: auto`.
