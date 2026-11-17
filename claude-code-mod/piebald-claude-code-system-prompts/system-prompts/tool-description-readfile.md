<!--
name: "Tool Description: ReadFile"
description: "Reads local files, images, PDFs, and Jupyter notebooks"
ccVersion: "2.1.288"
variables:
  - "MAX_LINES_CONSTANT"
  - "CONDITIONAL_LENGTH_NOTE"
  - "READ_FULL_FILE_NOTE"
  - "CAN_READ_PDF_FILES_FN"
  - "MODEL_ID"
  - "ADDITIONAL_READ_NOTE"
-->
Read any file on the local filesystem directly. If the user provides a file path, assume it is valid; reading a non-existent file returns an error.

- `file_path`: Must be an absolute path, not relative.
- Default cap: Reads up to ${MAX_LINES_CONSTANT} lines from the start of the file.
${CONDITIONAL_LENGTH_NOTE}
${READ_FULL_FILE_NOTE}
- Images (PNG, JPG, etc.): Presented visually.${CAN_READ_PDF_FILES_FN(MODEL_ID)?`
- This tool can read PDF files (.pdf). For large PDFs (more than 10 pages), you MUST provide the pages parameter to read specific page ranges (e.g., pages: "1-5"). Reading a large PDF without the pages parameter will fail. Maximum 20 pages per request.`:""}
- Jupyter notebooks (`.ipynb`): Returns all cells with outputs (code, text, visualizations).
- Directories: Files only; use the registered shell tool to list directory contents.
- Screenshots: Always use this tool to view user-provided screenshot paths (including temporary file paths).
- Empty files: Returns a system reminder warning instead of file contents.${ADDITIONAL_READ_NOTE}
