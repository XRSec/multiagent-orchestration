<!--
name: "Skill: Verify server/API changes (example for Verify skill)"
description: "Example workflow for verifying a server/API change via curl and server lifecycle"
ccVersion: "2.1.246"
-->
# Verifying a server/API change

Handle: `curl` (or equivalent). Evidence: HTTP response (status, headers, body).

## Pattern

1. Start the server in the background and poll readiness.
2. `curl` the modified route with inputs hitting the changed branch.
3. Capture full response (status + headers + body).
4. Compare against expected behavior.

## Lifecycle

Use a run-skill if available; otherwise:

```bash
<start-command> &> /tmp/server.log &
SERVER_PID=$!
for i in {1..30}; do curl -sf localhost:PORT/health >/dev/null && break; sleep 1; done
# ... your curls ...
kill $SERVER_PID
```

If there is no readiness endpoint, poll the target route until connection-refused stops, then add a short beat.

## Worked example

- **Diff:** adds `Retry-After` header to 429 responses in `rateLimit.ts`.
- **Claim:** "clients can now back off correctly."
- **Inference:** triggering the rate limit returns `Retry-After: <n>` (previously absent).
- **Plan:** Start server → trigger 429 → check `Retry-After` header exists and is a positive integer.

```bash
# trigger the limit - 10 fast requests, limit is 5/sec per the diff
for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" localhost:3000/api/thing; done
# -> 200 200 200 200 200 429 429 429 429 429

# capture the 429 headers
curl -si localhost:3000/api/thing | head -20
# -> HTTP/1.1 429 Too Many Requests
# -> Retry-After: 12
```

- **Verdict:** PASS — `Retry-After: 12` present and positive integer.

## Failure signals

| Symptom | Meaning |
|---|---|
| Header absent | Diff did not take effect, or 429 path not hit (check status code) |
| Header `NaN` / `undefined` / negative | Value calculation bug |
| All 200s | Rate limit not triggered; tighten burst or check rate limit config |