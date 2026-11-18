---
name: read-twitter
description: Scrape and extract tweets and timeline feeds from X (Twitter) via ego-browser automation.
---

# read-twitter

<!--
Purpose: Automate timeline scraping, engagement parsing, and feed extraction from X (Twitter).
Context: Bundled Paseo skill for X timeline ingestion using local ego-browser profiles.
Usage: node <skillPath>/scripts/read_twitter.mjs [options]
Prerequisites: Node.js 18+, ego-browser CLI installed and logged into X on target profile.
-->

## Overview
Automates Twitter/X feed retrieval via `ego-browser` profile automation. Supports incremental scraping, deduplication, engagement score calculation (likes + 3*retweets + 2*replies), and keyword/event filtering.

## Command Execution
Run via Node directly:
```bash
node scripts/read_twitter.mjs [options]
```

### Options
- `--count <n>`: Target number of tweets to collect (default: `50`, recommended `2000` for comprehensive digests).
- `--profile <id>`: Target ego-browser profile ID (default: `'Profile 1'` / `'Cat'`).
- `--out <path>`: Destination path for output JSON (default: `/tmp/twitter_feed.json`).
- `--filter-big`: Filter out macro political news, big tech keynotes, and mainstream releases.
- `--today-only`: Retain only tweets posted on the latest active date.
- `--top <n>`: Number of top-ranked tweets to display in summary output (default: `15`).
- `--json`: Output structured JSON directly to stdout.
- `--help`: Display CLI parameter help.

## Output Schema
The output JSON file contains an array of normalized tweet records:
- `id`: Tweet status ID.
- `user`: Author display name and handle.
- `text`: Full text content of the post.
- `like` / `retweet` / `reply`: Raw metric strings.
- `parsed_likes` / `parsed_retweets` / `parsed_replies`: Parsed numeric counts.
- `score`: Composite engagement score (`likes + 3 * retweets + 2 * replies`).
- `time`: ISO 8601 UTC timestamp.
- `link`: Canonical status permalink URL.
- `isAd`: Promoted tweet boolean flag.
