---
name: x-research
description: Research AI agent/CLI/SDK issues, check community workarounds, read full X threads and comments/replies, and search real-time discussions via ego-browser.
---

# x-research

<!--
Purpose: Search X.com discussions, read full threads with author continuation and community comments, and inspect user posts via ego-browser.
Context: Autonomous agent research skill for investigating agent/runtime bugs, workarounds, and developer discussions.
Usage: node <skillPath>/scripts/x-research.mjs <search|thread|user> <target> [flags]
Prerequisites: Node.js 18+, ego-browser CLI installed and logged into X.com on target profile.
-->

## 1. Routing Rules & Investigation Workflow

1. **Bug & Incident Investigation**: When investigating unknown agent crashes, SDK breaking changes, CLI auto-compaction bugs, or undocumented flags, execute `search "<keyword>"` first.
2. **Deep Workaround Extraction**: Pick the top relevant status IDs from search results and execute `thread <id-or-url>` to retrieve the full post, author self-thread followups, and community replies before authoring patches.
3. **Account Timeline Reconnaissance**: When monitoring an upstream tool author or core developer, execute `user <handle>` to inspect recent status updates.

---

## 2. CLI Interface & Parameter Contract

Entrypoint: `node <skillPath>/scripts/x-research.mjs <subcommand> <target> [flags]`

### 2.1 Subcommands
- `search <query>`: Search X discussions by keyword or query string.
- `thread <url-or-id>`: Read full thread including main post, expanded text, quoted tweets, outbound links, author continuation, and community replies. Accepts canonical URLs (`https://x.com/.../status/...`) or bare numeric status IDs.
- `user <handle>`: Ingest recent posts from user timeline. Accepts handle with or without `@`, or profile URLs.

### 2.2 Global Flags & Options
| Flag | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `--profile <id>` | string | `"Profile 1"` | Target ego-browser profile ID (override via `$X_RESEARCH_PROFILE`). |
| `--tab <top\|live>` | string | `"top"` | Search timeline mode (`"top"` or `"live"`). |
| `--limit <n>` | integer | `20` | Maximum posts to collect in `search` or `user` mode. |
| `--max-replies <n>`| integer | `40` | Maximum community replies to collect in `thread` mode. |
| `--sort <method>` | string | `"score"` | Sort order: `"score"` (`likes + 3*retweets + 2*replies`), `"recent"` (timestamp), or `"order"` (chronological thread presentation). |
| `--format <md\|json>`| string | `"md"` | Output encoding (`"md"` for dense agent markdown, `"json"` for machine processing). |
| `--json` | boolean | `false` | Shorthand alias for `--format json`. |
| `--replies` | boolean | `false` | Include `/with_replies` timeline in `user` mode. |
| `--out <path>` | string | `null` | Persist output to file path. |
| `--timeout <ms>` | integer | `90000` | Hard deadline watchdog in milliseconds. Triggers `SIGTERM` and exits with code `124`. |
| `--help`, `-h` | boolean | `false` | Display parameter usage and exit code table. |

---

## 3. Exit Code Contract

| Exit Code | Symbolic State | Condition |
| :--- | :--- | :--- |
| `0` | `TERM_OK` | Scraping and formatting completed successfully. |
| `1` | `GENERAL_ERROR` | X login wall encountered, rate limit hit, or ego-browser failure. |
| `2` | `TERM_BLOCK` | Invalid subcommand, missing query/status-ID/handle, or invalid argument. |
| `124` | `TIMEOUT` | Execution exceeded watchdog deadline. |

---

## 4. Output Schemas

### 4.1 Thread Schema (`format: json`)
```json
{
  "targetId": "2121811605402825115",
  "parentContext": [],
  "mainPost": {
    "id": "2121811605402825115",
    "url": "https://x.com/MndiLysses/status/2121811605402825115",
    "authorName": "Ulysses M",
    "authorHandle": "MndiLysses",
    "time": "2026-11-15T16:44:42.000Z",
    "text": "...",
    "cardText": "",
    "likes": "0",
    "retweets": "0",
    "replies": "2",
    "views": "791",
    "score": 4,
    "links": ["https://t.co/..."],
    "quotedTweet": null
  },
  "authorContinuation": [],
  "replies": [
    {
      "id": "2121819981717581865",
      "authorName": "Magpie",
      "authorHandle": "magpie_router",
      "time": "2026-11-15T17:17:59.000Z",
      "text": "...",
      "cardText": "",
      "score": 0
    }
  ],
  "sort": "score",
  "totalRepliesCaptured": 4
}
```

### 4.2 Search Schema (`format: json`)
```json
{
  "query": "agy-cli",
  "tab": "top",
  "sort": "score",
  "tweets": [
    {
      "id": "2121631706218447086",
      "url": "https://x.com/magpie_router/status/2121631706218447086",
      "authorName": "Magpie",
      "authorHandle": "magpie_router",
      "time": "2026-11-15T04:49:51.000Z",
      "text": "...",
      "score": 667
    }
  ]
}
```

---

## 5. Operational Notes & Troubleshooting

- **Profile & Auth**: Defaults to `"Profile 1"`. Ensure profile is authenticated on X.com. If redirected to `x.com/login`, the runner aborts with `LOGIN_REQUIRED`.
- **TaskSpace Isolation**: Each run creates an isolated ephemeral `x-research-<id>` TaskSpace on the requested `--profile` (default `"Profile 1"`) and terminates it via `task.finish({ keep: [] })` on completion to prevent tab leaks and cross-run collisions.
- **Dynamic Content & Expansion**: The runner automatically clicks "Show more" / "显示更多" and "Show additional replies" / "显示更多回复" before extraction.
