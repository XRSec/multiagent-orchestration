<!--
name: "Tool Description: AskUserQuestion (preview field)"
description: "Rules for using the HTML preview field on single-select question options for visual comparisons"
ccVersion: "2.1.69"
-->

<preview_field>
- **When to use**: Optional `preview` on single-select options only (not `multiSelect`) when users must visually compare concrete artifacts: HTML UI mockups/components, formatted code snippets, or visual comparisons/diagrams. Omit when labels and descriptions suffice.
- **Format**: Self-contained HTML fragment only — no `<html>`/`<body>` wrapper, no `<script>` or `<style>` tags; use inline `style` attributes.
</preview_field>
