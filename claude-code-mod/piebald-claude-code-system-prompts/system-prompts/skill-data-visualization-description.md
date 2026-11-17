<!--
name: "Skill: Data Visualization description"
description: "Trigger contract for creating charts, graphs, dashboards, KPI tiles, and palettes across all output media"
ccVersion: "2.1.251"
-->
<data_viz_trigger_protocol>
Load this skill BEFORE authoring any chart, graph, plot, dashboard, stat/KPI tile, or visualization in any medium (HTML/React artifact, inline SVG, matplotlib/plotly/d3/Recharts, PNG, or Slack).

- **First-Party Live Connectors**: Pass structured data rows (inline or cited uploaded file) rather than static PNG/SVG images when targeting host-designated live-chart connectors (preserves hover, inspection, and per-value comments).
- **Methodology**: Apply the form heuristic, runnable color-formula validator, mark specs, interaction rules, and swap-ready neutral palette in `references/palette.md`.
- **Triggers**: `chart`, `graph`, `plot`, `data viz`, `visualization`, `dashboard`, `analytics`, `visualize data`, `categorical colors`, `sequential / diverging palette`, `stat tile`, `sparkline`, `heatmap`, `legend`, `axis`, `tooltip`, `chart colors`, `color by series`.
</data_viz_trigger_protocol>
