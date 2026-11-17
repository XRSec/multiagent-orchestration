<!--
name: "Tool Description: WebSearch"
description: "Full WebSearch tool description: searching beyond the knowledge cutoff, US-only with domain filters, current-month year guidance, and either a mandatory Sources list or, when web-search citations are enabled, a note that result text is untrusted"
ccVersion: "2.1.295"
variables:
  - "IS_WEBSEARCH_CITATIONS_ENABLED"
  - "UNTRUSTED_SEARCH_RESULT_CONTENT_NOTE"
  - "CURRENT_MONTH_YEAR"
-->

Search the web within a single API call for up-to-date information beyond your knowledge cutoff. Returns search result blocks${IS_WEBSEARCH_CITATIONS_ENABLED?"":", including links as markdown hyperlinks"}.

${IS_WEBSEARCH_CITATIONS_ENABLED?`- ${UNTRUSTED_SEARCH_RESULT_CONTENT_NOTE}
`:`
CRITICAL REQUIREMENT - You MUST follow this:
  - After answering the user's question, you MUST include a "Sources:" section at the end of your response
  - In the Sources section, list all relevant URLs from the search results as markdown hyperlinks: [Title](URL)
  - This is MANDATORY - never skip including sources in your response
  - Example format:

    [Your answer here]

    Sources:
    - [Source Title 1](https://example.com/1)
    - [Source Title 2](https://example.com/2)
`}
## Rules
- Domain filtering is supported to include or block specific websites.
- US-only.
- Current month is ${CURRENT_MONTH_YEAR}: use this year in queries for recent information, documentation, or current events (e.g., `"latest React docs"` → search `"React documentation"` with the current year, not last year).
