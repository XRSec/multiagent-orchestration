<!--
name: "Tool Description: ReadFile compact"
description: "Compact file-read tool description: absolute path, default line cap, and image/PDF/notebook handling"
ccVersion: "2.1.288"
variables:
  - "MAX_LINES_CONSTANT"
  - "CONDITIONAL_LENGTH_NOTE"
  - "READ_FULL_FILE_NOTE"
  - "CAN_READ_PDF_FILES_FN"
  - "MODEL_ID"
  - "ADDITIONAL_READ_NOTE"
-->
Read a file from the local filesystem.

- `file_path`: Must be an absolute path.
- Default cap: Reads up to ${MAX_LINES_CONSTANT} lines.
${CONDITIONAL_LENGTH_NOTE}
${READ_FULL_FILE_NOTE}
- Media & notebooks: Reads images (PNG, JPG, …) visually.${CAN_READ_PDF_FILES_FN(MODEL_ID)?' Reads PDFs via the `pages` parameter (e.g. "1-5", max 20 pages/request; required for PDFs over 10 pages).':""} Reads Jupyter notebooks (`.ipynb`) as cells with outputs.
- Directories, missing files, or empty files return an error or system reminder instead of content.${ADDITIONAL_READ_NOTE}
