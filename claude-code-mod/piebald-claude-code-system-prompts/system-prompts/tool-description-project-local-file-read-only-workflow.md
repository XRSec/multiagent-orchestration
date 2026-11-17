<!--
name: "Tool Description: Project local_file read-only workflow"
description: "Reading and searching a project document local_file, copying to a working file for edits, and saving via project_write"
ccVersion: "2.1.319"
variables:
  - "READ_TOOL_NAME"
  - "CONTENT_SEARCH_TOOL_OR_COMMAND"
-->
`local_file` is read-only: read needed parts with ${READ_TOOL_NAME} (`offset`/`limit`) or search with ${CONTENT_SEARCH_TOOL_OR_COMMAND}. Edits to `local_file` never reach the project, and `project_write` rejects it as `local_path`.

- **To edit or derive a file**: Run `cat /path/of/local_file > new-name` in the working directory (using an unused `new-name`) and edit that file.
- **To save changes**: Call `project_write` with the document's path and that file as `local_path`. For uploads such as PDFs, this saves a new text document and leaves the upload unchanged.
