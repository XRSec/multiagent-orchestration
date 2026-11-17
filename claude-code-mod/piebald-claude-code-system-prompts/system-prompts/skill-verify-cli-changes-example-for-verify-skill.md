<!--
name: "Skill: Verify CLI changes (example for Verify skill)"
description: "Example workflow for verifying a CLI change via direct invocation"
ccVersion: "2.1.246"
-->
# Verifying a CLI change

Handle: direct invocation. Evidence: stdout, stderr, exit code (no lifecycle or ports).

## Pattern

1. Build (if required).
2. Run with arguments exercising the changed code.
3. Capture output and exit code.
4. Compare against expected behavior.

## Worked example

- **Diff:** adds `--json` flag to `status` subcommand (`cmd/status.go` parsing + output branch).
- **Claim:** "machine-readable status output."
- **Inference:** `tool status --json` emits valid JSON with the same fields as human output; `tool status` without the flag is unchanged.
- **Plan:** Build → test `tool status` (non-regression) → test `tool status --json` (valid JSON) → verify fields match.

```bash
go build -o /tmp/tool ./cmd/tool

/tmp/tool status
# -> Status: healthy
# -> Uptime: 3h12m
# -> Connections: 47

/tmp/tool status --json
# -> {"status":"healthy","uptime_seconds":11520,"connections":47}

/tmp/tool status --json | jq -e .status
# -> "healthy"  (jq -e exits nonzero if null/false)

echo $?
# -> 0
```

- **Verdict:** PASS — flag works, JSON is valid, fields match.

## Failure signals

| Symptom | Meaning |
|---|---|
| `unknown flag: --json` | Flag not wired up, or running a stale build |
| Invalid JSON (`jq` error) | Serialization bug |
| `tool status` (no flag) changed | Regression; diff touched unintended behavior |
| JSON field names mismatch | Claim/code mismatch (note it) |

## Stdin & destructive commands

- **Reads stdin:** pipe test data directly.
- **Writes files / hits network / deletes:** target a tmp dir, mock, or dry-run flag. If no safe mode exists and the diff touches the destructive path, state that explicitly and verify around it.