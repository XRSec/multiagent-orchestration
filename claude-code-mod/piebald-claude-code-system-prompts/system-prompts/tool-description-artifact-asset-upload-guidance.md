<!--
name: "Tool Description: Artifact asset upload guidance"
description: "Uploads single or batched local files to an Artifact asset store when the page declares the assets capability"
ccVersion: "2.1.275"
variables:
  - "MAX_BATCH_ASSET_UPLOADS"
-->
. Passing `url`, `file_path`, and `asset: true` uploads a local image, video, PDF, font, or text file to the artifact's asset store (`file_paths` batches up to ${MAX_BATCH_ASSET_UPLOADS} image, video, PDF, font, stylesheet, or script files under one approval; text files require individual calls). Requires the page to declare `assets` capability (limits in `artifact-capabilities` skill); reference each uploaded asset by the exact `url` returned.
