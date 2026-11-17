<!--
name: "Skill: Run web server API example"
description: "Example for the Run app skill: server/API lifecycle with background launch, readiness polling, curl verification, and shutdown"
ccVersion: "2.1.246"
-->
# Example: Web server / API

Server skills center on **lifecycle**: start in the background, verify readiness, interact, and shut down cleanly. Never document a blocking foreground `npm start` as the agent run command.

## Structure

1. **Prerequisites & setup**
2. **Run** (background launch)
3. **Verify** (`curl` health/smoke check)
4. **Stop** (clean shutdown)

If launch + poll + smoke-curl exceeds a few lines, extract it into `smoke.sh` in the skill directory and have `SKILL.md` invoke it.

## Background-launch pattern

- **Anti-pattern** (blocks the shell):
  ```bash
  npm start
  ```
- **Launch and poll**:
  ```bash
  npm start &> /tmp/server.log &
  SERVER_PID=$!

  # Wait for the server to come up (adjust timeout/port as needed)
  for i in {1..30}; do
    curl -sf http://localhost:3000/health > /dev/null && break
    sleep 1
  done
  ```
- **Verify**:
  ```bash
  curl http://localhost:3000/health
  # -> {"status":"ok"}
  ```
- **Stop** (`$!` is only the npm wrapper, which does not forward `SIGTERM`, so kill the port listener; avoid broad `pkill -f "<pattern>"` like `pkill -f "next|vite|node"` which can kill your own agent session):
  ```bash
  kill $SERVER_PID
  lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
  ```

## Checklist

- **Port**: State the default port and how to override it (`PORT=4000 npm start`).
- **Ready signal**: Specify the health endpoint or log line.
- **Required env vars**: List database URLs, API keys, etc. (provide a `.env` template if long).
- **Hot reload vs production**: State when to use each if behavior differs.
- **Dependent services**: Point to `docker-compose` or provide `docker run` commands for Redis/Postgres/etc.

## Example snippet

> ## Run
>
> Start the dev server in the background:
>
> ```bash
> npm run dev &> /tmp/api.log &
> ```
>
> The server listens on port 3000. Wait for it to be ready, then verify:
>
> ```bash
> for i in {1..20}; do
>   curl -sf http://localhost:3000/health && break
>   sleep 0.5
> done
> curl http://localhost:3000/health
> # -> {"status":"ok","version":"1.2.3"}
> ```
>
> Logs are at `/tmp/api.log`. Stop by killing the port's listener (`$!`
> after `npm run dev &` is the npm wrapper, and npm doesn't forward
> SIGTERM to the server it spawned):
>
> ```bash
> lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
> ```
>
> ### Environment
>
> | Variable | Required | Default | Notes |
> |---|---|---|---|
> | `DATABASE_URL` | Yes | - | Postgres connection string |
> | `PORT` | No | `3000` | |
> | `LOG_LEVEL` | No | `info` | `debug` / `info` / `warn` / `error` |
