<!--
name: "Tool Description: Easel chart"
description: "Easel chart tool: draws one chart from in-context tabular/metric data, refuses ambiguous columns, relays headline numbers"
ccVersion: "2.1.302"
variables:
  - "CHART_TIME_FORMATS_NOTE"
-->
Draw one chart from data already in context; returns what was read, drawn, and left out. The user sees the chart, not this tool response — relay the headline number and any `"note:"` lines.

- Data format: table under 64 KiB (JSON records, CSV, TSV, Markdown/SQL table, or aligned shell output). Does not read files or host-truncated/file-saved results (query less). Strip line-number prefixes when passing rows from a read file.
- Columns: specify `x` and `y`. Omit them only when unambiguous: Prometheus/Grafana/Datadog metric results (may be charted unasked), one time column beside only numeric columns (or beside one name column when times repeat), or one name column beside one numeric column (bars).
- Refusals & aggregation: nothing is guessed — ambiguous calls are refused with detected columns so you can re-call. Rows are not counted or time-bucketed; pass precomputed counts. ${CHART_TIME_FORMATS_NOTE}.