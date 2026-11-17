<!--
name: "Tool Description: Artifact type creation guidance"
description: "How to start a private Artifact from a published Artifact type and update only its own files"
ccVersion: "2.1.260"
-->
**Artifact types**:
- **Start from type**: To create an Artifact from a published Artifact type (also called a template or starter), publish with `type_url` (the type's link) and `title` (what the user called it, or a short descriptive name):
  - Omit files if you have not yet seen the type's instructions (returned in the result).
  - Pass data files in `file_path`/`files` if you already know the type takes files and what it expects.
- **Update**: The result is an ordinary private Artifact. Update it by its `url` as usual, publishing only its own files — the type's page and files are fixed, and the result lists which are which.