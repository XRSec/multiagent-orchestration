<!--
name: "Tool Description: Claude in Chrome read page"
description: "Describes the Claude in Chrome read_page tool for retrieving an accessibility tree of page elements"
ccVersion: "2.1.211"
-->
Get an accessibility tree of page elements (all elements including non-visible ones by default; optionally filter to interactive elements). Default limit: 50000 chars (truncated at line boundary with full size noted; pass larger `max_chars` or use `depth`/`ref_id` to narrow). Call `tabs_context_mcp` first if you lack a valid tab ID.
