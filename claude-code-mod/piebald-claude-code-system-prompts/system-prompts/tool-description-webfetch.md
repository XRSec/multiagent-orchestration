<!--
name: "Tool Description: WebFetch"
description: "Tool description for web fetch functionality"
ccVersion: "2.1.268"
variables:
  - "WEBFETCH_CACHE_TTL_FN"
-->

Fetch a URL, convert HTML to markdown, and answer `prompt` against the content using a small, fast model. Read-only; does not modify files.

## Rules
- Prefer an MCP-provided web fetch tool when available (fewer restrictions).
- For GitHub URLs, prefer `gh` CLI via Bash (`gh pr view`, `gh issue view`, `gh api`).
- URL must be valid and fully formed; HTTP is upgraded to HTTPS automatically.
- `localhost` and dotless hostnames are unsupported — use `curl` via Bash for local servers.
- Set `prompt` to what you want extracted; very large pages may be summarized.
- Self-cleaning cache expires entries after ${WEBFETCH_CACHE_TTL_FN()}.
- Cross-host redirects return the redirect URL instead of following automatically; issue a new WebFetch call with that URL.
