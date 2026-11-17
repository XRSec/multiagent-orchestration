<!--
name: "Tool Description: Artifact nested runtime cleanup error"
description: "Remediation directive for stripping nested runtime comment blocks, base tags, and repeated HTML skeletons before republishing"
ccVersion: "2.1.251"
-->
Nested runtime artifacts detected (`<!-- frame-runtime -->…<!-- /frame-runtime -->`, `<!-- chart-runtime -->…<!-- /chart-runtime -->`, `<!--claude-mermaid-runtime-begin…`, `<!--claude-hljs-runtime-begin…`, `data-frame-runtime` attributes, `<base href="/_f/…">`, or repeated outer `<!doctype html><html><head>…` wrappers). Strip all runtime comment blocks, attributes, `<base>` tags, and outer skeleton wrappers, retain only the innermost clean document, and republish.
