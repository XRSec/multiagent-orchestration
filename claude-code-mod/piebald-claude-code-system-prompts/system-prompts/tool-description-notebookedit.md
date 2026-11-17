<!--
name: "Tool Description: NotebookEdit"
description: "Edits Jupyter notebook cells by replacing, inserting, or deleting a cell using cell IDs from the read tool"
ccVersion: "2.1.162"
variables:
  - "READ_TOOL_NAME"
-->
Replace, insert, or delete a single cell in a Jupyter notebook (`.ipynb`).

- Read the notebook with ${READ_TOOL_NAME} in this conversation before editing (fails otherwise).
- `notebook_path`: Must be an absolute path.
- `cell_id`: `id` attribute from ${READ_TOOL_NAME}'s `<cell id="...">` output; required for `replace` and `delete`.
- `edit_mode`: Defaults to `replace`. Use `insert` to add a cell after `cell_id` (or at the notebook start if `cell_id` is omitted; requires `cell_type`). Use `delete` to remove the cell.
