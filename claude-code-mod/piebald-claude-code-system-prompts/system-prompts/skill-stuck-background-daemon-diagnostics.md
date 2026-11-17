<!--
name: "Skill: /stuck (background-daemon diagnostics)"
description: "Background-daemon troubleshooting section of the /stuck skill"
ccVersion: "2.1.235"
variables:
  - "DAEMON_LOCK_CONTENT"
  - "DAEMON_STATUS_CONTENT"
  - "DAEMON_LOG_PATH"
  - "DAEMON_LOG_SNIPPET"
  - "WORKER_ROSTER_PATH_FN"
  - "DAEMON_STATE_DIR_FN"
-->
## Daemon

Check here if the issue involves `& <prompt>` background jobs or `claude agents` managed by the background daemon.

### daemon.lock
```json
${DAEMON_LOCK_CONTENT??"(missing)"}
```

### daemon.status.json
```json
${DAEMON_STATUS_CONTENT??"(missing)"}
```

### Daemon log (`${DAEMON_LOG_PATH}`)
${DAEMON_LOG_SNIPPET}

### Other daemon state on disk (Read if relevant; roster contains user prompts and env vars)
- `${WORKER_ROSTER_PATH_FN()}` — live worker roster
- `${DAEMON_STATE_DIR_FN()}/<short>/state.json` — per-job state