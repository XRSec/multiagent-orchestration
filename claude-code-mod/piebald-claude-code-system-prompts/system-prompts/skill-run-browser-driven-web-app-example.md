<!--
name: "Skill: Run browser-driven web app example"
description: "Example for the Run app skill: start a web dev server, drive headless Chromium via chromium-cli, capture screenshots, and document gotchas"
ccVersion: "2.1.246"
-->
# Example: Browser-driven web app

Use `chromium-cli` to drive a headless Chromium instance against the dev server and capture a screenshot proving the page rendered. Do not write a custom browser driver.

## Dev server

- Start the dev command (`package.json` `scripts.dev`, `Makefile`, or README) in the background and poll the port until ready (never `sleep 5`):
  ```bash
  npm run dev &   # or yarn dev, pnpm dev, make serve, ./dev.sh
  timeout 30 bash -c 'until curl -sf http://localhost:3000 >/dev/null; do sleep 1; done'
  ```
- Stop by killing the port listener before relaunching (`$!` after `npm run dev &` only tracks the npm wrapper, which does not forward `SIGTERM`):
  ```bash
  lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
  ```
- Avoid `pkill -f` with broad patterns; it can match and kill your own agent session.

## Drive

Pipe a `chromium-cli` script to stdin:

```bash
chromium-cli --session app <<'EOF'
nav http://localhost:3000
wait-for text=Dashboard
screenshot
click button:has-text("New item")
fill input[name="title"] Smoke test
press Enter
wait-for text=Smoke test
screenshot
console --errors
EOF
```

- **Loop**: `nav` -> `wait-for` target element -> act (`click` / `fill` / `type` / `press`) -> `screenshot` -> `console --errors`.
- **Outputs**: Screenshots save to `chromium_cli/sessions/app/screenshots/` (latest symlinked as `screenshot.png`).
- **Reference**: See the `chromium-cli` skill or run `help` at the REPL prompt. For iterative debugging, run under `tmux` and `send-keys` one command at a time.
- **Fallback (no `chromium-cli`)**: Adapt [electron.md](electron.md)'s REPL driver: import `{ chromium }`, launch with `chromium.launch({ args: ['--no-sandbox'] })`, acquire a page via `(await app.newContext()).newPage()` then `goto()`, and drop Electron-only window introspection (`.windows()`, `.firstWindow()`, `windows`).

## Skill checklist

Document only project-specific details (`chromium-cli` covers the mechanics):
- **Dev command, port, and stop**: Exact start command, required env vars, and port-kill command.
- **Auth**: Login sequence (`set-cookie`, `fill`/`click`, or API helper script emitting the cookie).
- **Representative interaction**: One end-to-end path proving the app runs, ending in a screenshot.
- **App-specific gotchas**: Only issues actually encountered.

## Recurring gotchas

- **React controlled inputs**: `eval el.value = '...'` skips React's `onChange`; use `fill` or `type` to go through Playwright's input pipeline.
- **Websockets / long-poll**: `wait-idle` never settles; use `wait-for` on the target element.
- **Slow first paint**: Vite/Next compile routes on demand (10s+ first `nav`); `wait-for` handles this, raw `sleep` does not.
- **Component crops**: Use `screenshot-element <sel>` when verifying a single component.
- **Silent 500s**: Always check `console --errors` before declaring success; a shell can render while data fetches fail.
