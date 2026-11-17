<!--
name: "Tool Description: Artifact assets guidance (app wording)"
description: "Protocol for uploading, listing, reading, deleting, and cross-artifact copying in an Artifact asset store"
ccVersion: "2.1.287"
variables:
  - "MAX_BATCH_ASSET_UPLOADS"
  - "ARTIFACT_CAPABILITIES_SKILL_NAME"
  - "CAN_COPY_ARTIFACT_ASSETS"
  - "CAN_COPY_PUBLISHED_ARTIFACT_FILES"
-->
**Artifact assets** (requires page `assets` capability; limits in `${ARTIFACT_CAPABILITIES_SKILL_NAME}`):
- `upload_asset`: `url` + `file_path` (image, video, PDF, font, stylesheet, script, or text) or `file_paths` (`<= ${MAX_BATCH_ASSET_UPLOADS}` non-text files under one approval; text files require individual calls). Reference each by its exact returned `url`.
- `list_assets` (`url`): Lists stored assets (including viewer-uploaded files).
- `read_asset` (`url`, `asset_id`): Downloads asset to a local file.
- `delete_asset` (`url`, `asset_id`): Permanently deletes an unreferenced asset (only when requested by user or replacing an agent-uploaded asset).${CAN_COPY_ARTIFACT_ASSETS?`
- \`copy_from\` (\`url\`, \`from_url\`, \`<= 10\` \`asset_ids\` from source \`list_assets\`): Server-copies assets between openable artifacts and returns new URLs to reference verbatim.${CAN_COPY_PUBLISHED_ARTIFACT_FILES?` To reuse another artifact's published script/style/data/font/image/SVG files during \`publish\`, map target path in \`files\` to \`{"artifact": "<source_url>", "path": "<published_path>"}\` (HTML/XML docs must be read via \`read_file\` and published directly).`:""}`:""}
