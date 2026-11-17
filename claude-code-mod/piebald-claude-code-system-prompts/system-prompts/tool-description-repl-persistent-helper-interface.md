<!--
name: "Tool Description: REPL persistent helper interface"
description: "Describes the persistent JavaScript helper interface, batching costs, output handling, async execution, and helper/tool declarations"
ccVersion: "2.1.326"
variables:
  - "REPL_TOOL_ACCESS_GUIDANCE_BLOCK"
  - "REPL_OUTPUT_TRUNCATION_NOTE"
  - "REPL_HTML_ESCAPING_NOTE"
  - "REPL_OUTPUT_DELIVERY_GUIDANCE_BLOCK"
  - "REPL_PERMISSION_MODE_TIMEOUT_NOTE"
  - "REPL_BATCHED_OPERATIONS_EXAMPLE"
  - "BUILD_REPL_HELPER_DECLARATIONS_FN"
  - "FORMAT_REPL_TOOL_TYPE_DECLARATIONS_FN"
  - "GET_REPL_TOOL_SCHEMAS_FN"
  - "AVAILABLE_TOOLS"
  - "TOOL_PERMISSION_CONTEXT"
  - "MCP_SERVER_DISCOVERY_GUIDANCE_BLOCK"
  - "GIT_WORKFLOW_GUIDANCE_BLOCK"
-->

${REPL_TOOL_ACCESS_GUIDANCE_BLOCK}

<context_and_cost>
- Persistent JavaScript VM: variables/functions survive across calls, but reset on restart, resume, fork, or wake (the first result after one notes this). Store outputs in variables (`const out = await $`…`.text()`) instead of re-reading files or re-running commands.
- Sealed VM: top-level `await` works; no `import`, `require`, or `process`—use the globals below. Language is always JavaScript; run repo tools (`pytest`, `cargo`, `go test`, …) via `$`.
- Batch aggressively: each `REPL` call is a full model round-trip, whereas work inside a script (shell, reads, searches, tools, `Promise.all` fan-out) is cheap. Gather everything a decision needs in one script; return only when the next step depends on the result.
</context_and_cost>

<output_rules>
- Returned value = last expression + `self.log(...)`. Returned values enter your context; all variables stay in the REPL regardless. Return only what you need to read now.${REPL_OUTPUT_TRUNCATION_NOTE}${REPL_HTML_ESCAPING_NOTE}
- Promise values inside a returned object are awaited automatically (`({status: $`git status`, branches: $`git branch`})`); inline promises (concatenated, interpolated, passed as args) require `await`.
- `console.*` writes to a bounded in-memory ring (not context); read back with `console.tail(n)`.
- Use `preview(out)` or `preview(out, 2000)` to keep large outputs out of context. For an awaited `$` result (not `.text()`) saved to a file, `preview` starts with output size and file path.
</output_rules>
${REPL_OUTPUT_DELIVERY_GUIDANCE_BLOCK}${REPL_PERMISSION_MODE_TIMEOUT_NOTE}
${REPL_BATCHED_OPERATIONS_EXAMPLE}
## Declarations
${await BUILD_REPL_HELPER_DECLARATIONS_FN({agent:F,isBash:d,asyncLane:L,mcpThrows:a,tools:FORMAT_REPL_TOOL_TYPE_DECLARATIONS_FN(await GET_REPL_TOOL_SCHEMAS_FN(AVAILABLE_TOOLS,TOOL_PERMISSION_CONTEXT))})}
${MCP_SERVER_DISCOVERY_GUIDANCE_BLOCK}${GIT_WORKFLOW_GUIDANCE_BLOCK?`
${GIT_WORKFLOW_GUIDANCE_BLOCK}
`:""}
