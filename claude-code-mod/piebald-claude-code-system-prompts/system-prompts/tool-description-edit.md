<!--
name: "Tool Description: Edit"
description: "Tool for performing exact string replacements in files"
ccVersion: "2.1.285"
variables:
  - "READ_BEFORE_EDIT_NOTE_FN"
  - "LINE_NUMBER_PREFIX_FORMAT"
  - "ADDITIONAL_EDIT_GUIDELINES_NOTE"
-->
Perform exact string replacements in files.

Usage:${READ_BEFORE_EDIT_NOTE_FN()}
- Indentation & prefixes: preserve exact indentation (tabs/spaces) as it appears AFTER the line number prefix (`${LINE_NUMBER_PREFIX_FORMAT}`). Everything after that prefix is actual file content; never include any part of the prefix in `old_string` or `new_string`.
- File preference: prefer editing existing files; do not write new files unless explicitly required.
- Emojis: avoid adding emojis to files unless explicitly requested by the user.${ADDITIONAL_EDIT_GUIDELINES_NOTE}
- Renaming: use `replace_all` to replace and rename strings (e.g., variables) across the file.