<!--
name: "Tool Description: Artifact preflight.js reserved file"
description: "Notes that preflight.js at the artifact root is reserved, runs against open pages on update publishes, and must be a <= 8 KiB ES module exporting a default function"
ccVersion: "2.1.323"
-->
 `preflight.js` at the artifact root is reserved: it runs against open pages when you publish updates and MUST be a ≤ 8 KiB ES module with a default-exported function, or publish is refused.
