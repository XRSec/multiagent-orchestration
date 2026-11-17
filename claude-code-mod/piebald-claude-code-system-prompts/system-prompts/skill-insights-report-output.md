<!--
name: "Skill: /insights report output"
description: "Formats and displays /insights usage report results verbatim"
ccVersion: "2.1.326"
variables:
  - "INSIGHTS_DATA"
  - "REPORT_URL"
  - "HTML_FILE_PATH"
  - "FACETS_DIRECTORY"
  - "REPORT_HEADER"
  - "AT_A_GLANCE_SUMMARY"
  - "LEFT_OUT_LINE"
  - "RECOMMENDATION_TIP_LINE"
-->
The user ran `/insights` to generate a session usage report.

<insights_data>
${INSIGHTS_DATA}
</insights_data>

<report_artifacts>
Report URL: ${REPORT_URL}
HTML file: ${HTML_FILE_PATH}${FACETS_DIRECTORY===void 0?"":`
Facets directory: ${FACETS_DIRECTORY}`}
</report_artifacts>

<at_a_glance_context note="for agent context only; user has not seen any output yet">
${REPORT_HEADER}${AT_A_GLANCE_SUMMARY}
</at_a_glance_context>

Respond with the exact template below and nothing else (MUST NOT add, omit, or reword any line):

Your shareable insights report is ready:
${REPORT_URL}
${LEFT_OUT_LINE?`
${LEFT_OUT_LINE}
`:""}${RECOMMENDATION_TIP_LINE?`
${RECOMMENDATION_TIP_LINE}
`:""}
Want to dig into any section or try one of the suggestions?