#!/usr/bin/env node
// Purpose: CLI argument parsing, status ID extraction, handle normalization, and search URL builder.
// Context: Core option parser for the x-research skill CLI runner.
// Usage: import { parseCliArgs, normalizeStatusId, normalizeHandle, buildSearchUrl, printUsage } from './args.mjs';
// Prerequisites: Node.js 18+ (ESM built-ins only); no external packages or interactive TTY.

const VALUE_FLAGS = new Set([
  '--profile',
  '--tab',
  '--limit',
  '--max-replies',
  '--sort',
  '--format',
  '--out',
  '--timeout'
]);

const VALID_TABS = new Set(['top', 'live', 'latest']);
const VALID_SORTS = new Set(['score', 'recent', 'order']);
const VALID_FORMATS = new Set(['md', 'json']);

export function normalizeStatusId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^\d{5,30}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:status|statuses)\/(\d{5,30})/i);
  return match ? match[1] : null;
}

export function normalizeHandle(input) {
  if (!input || typeof input !== 'string') return null;
  let str = input.trim().replace(/^[#@]+/, '');
  const urlMatch = str.match(/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,50})/i);
  if (urlMatch) str = urlMatch[1];
  str = str.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/.*$/, '').replace(/\?.*$/, '');
  return /^[A-Za-z0-9_]{1,50}$/.test(str) ? str : null;
}

export function buildSearchUrl(query, tab = 'top') {
  const encoded = encodeURIComponent(query.trim());
  if (tab === 'live' || tab === 'latest') {
    return `https://x.com/search?q=${encoded}&src=typed_query&f=live`;
  }
  return `https://x.com/search?q=${encoded}&src=typed_query`;
}

function normalizeArgvTokens(rawArgs) {
  const normalized = [];
  for (const token of rawArgs) {
    const eqIdx = token.indexOf('=');
    if (eqIdx > 0 && token.startsWith('--')) {
      const flag = token.slice(0, eqIdx);
      if (VALUE_FLAGS.has(flag)) {
        normalized.push(flag, token.slice(eqIdx + 1));
        continue;
      }
    }
    normalized.push(token);
  }
  return normalized;
}

function parseFlagMap(args) {
  const positional = [];
  const flags = new Map();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (VALUE_FLAGS.has(arg)) {
      if (i + 1 >= args.length) {
        return { error: `Missing value for flag "${arg}"`, exitCode: 2 };
      }
      flags.set(arg, args[i + 1]);
      i++;
    } else if (arg.startsWith('-')) {
      flags.set(arg, true);
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function parseStrictInt(raw, flagName) {
  if (!/^-?\d+$/.test(String(raw).trim())) {
    return { error: `Invalid integer value for ${flagName}: "${raw}"` };
  }
  return { value: Number.parseInt(String(raw).trim(), 10) };
}

function validateSubcommand(subcommand, target, parsed) {
  if (!subcommand) {
    return { error: 'Missing required subcommand (search, thread, user)', exitCode: 2 };
  }
  if (!['search', 'thread', 'user'].includes(subcommand)) {
    return { error: `Unknown subcommand "${subcommand}". Expected "search", "thread", or "user".`, exitCode: 2 };
  }
  if (subcommand === 'search' && (!target || !target.trim())) {
    return { error: 'Missing required <query> for search subcommand', exitCode: 2 };
  }
  if (subcommand === 'thread') {
    const id = normalizeStatusId(target);
    if (!id) return { error: `Invalid or missing status ID/URL: "${target || ''}"`, exitCode: 2 };
    parsed.statusId = id;
  }
  if (subcommand === 'user') {
    const handle = normalizeHandle(target);
    if (!handle) return { error: `Invalid or missing user handle: "${target || ''}"`, exitCode: 2 };
    parsed.handle = handle;
  }
  return null;
}

function validateOptions(parsed, flags) {
  if (!VALID_TABS.has(parsed.tab)) {
    return { error: `Invalid --tab "${parsed.tab}". Expected "top", "live", or "latest".`, exitCode: 2 };
  }
  if (!VALID_SORTS.has(parsed.sort)) {
    return { error: `Invalid --sort "${parsed.sort}". Expected "score", "recent", or "order".`, exitCode: 2 };
  }
  if (flags.has('--format') && !VALID_FORMATS.has(flags.get('--format'))) {
    return { error: `Invalid --format "${flags.get('--format')}". Expected "md" or "json".`, exitCode: 2 };
  }
  if (!Number.isInteger(parsed.limit) || parsed.limit <= 0) {
    return { error: `Invalid --limit "${parsed.limit}". Must be a positive integer (> 0).`, exitCode: 2 };
  }
  if (!Number.isInteger(parsed.maxReplies) || parsed.maxReplies < 0) {
    return { error: `Invalid --max-replies "${parsed.maxReplies}". Must be an integer (>= 0).`, exitCode: 2 };
  }
  if (!Number.isInteger(parsed.timeoutMs) || parsed.timeoutMs < 1000) {
    return { error: `Invalid --timeout "${parsed.timeoutMs}". Must be an integer (>= 1000 ms).`, exitCode: 2 };
  }
  return null;
}

export function parseCliArgs(argv) {
  const args = normalizeArgvTokens(argv.slice(2));
  if (args.includes('--help') || args.includes('-h')) {
    return { isHelp: true };
  }

  const mapped = parseFlagMap(args);
  if (mapped.error) return mapped;

  const { positional, flags } = mapped;
  const subcommand = positional[0] || null;
  const target = positional[1] || null;

  const limitRes = flags.has('--limit') ? parseStrictInt(flags.get('--limit'), '--limit') : { value: 20 };
  if (limitRes.error) return { error: limitRes.error, exitCode: 2 };
  const repliesRes = flags.has('--max-replies') ? parseStrictInt(flags.get('--max-replies'), '--max-replies') : { value: 40 };
  if (repliesRes.error) return { error: repliesRes.error, exitCode: 2 };
  const timeoutRes = flags.has('--timeout') ? parseStrictInt(flags.get('--timeout'), '--timeout') : { value: 90000 };
  if (timeoutRes.error) return { error: timeoutRes.error, exitCode: 2 };

  const isJson = flags.has('--json');
  const format = flags.has('--format') ? flags.get('--format') : (isJson ? 'json' : 'md');

  const parsed = {
    subcommand,
    target,
    profileId: flags.get('--profile') || process.env.X_RESEARCH_PROFILE || 'Profile 1',
    tab: flags.get('--tab') || 'top',
    limit: limitRes.value,
    maxReplies: repliesRes.value,
    sort: flags.get('--sort') || 'score',
    format: isJson && !flags.has('--format') ? 'json' : format,
    isJson,
    withReplies: flags.has('--replies'),
    outPath: flags.get('--out') || null,
    timeoutMs: timeoutRes.value
  };

  const optErr = validateOptions(parsed, flags);
  if (optErr) return optErr;

  const subErr = validateSubcommand(subcommand, target, parsed);
  if (subErr) return subErr;

  return { success: true, ...parsed };
}

export function printUsage() {
  console.log(`x-research - Research X.com discussions, threads, and user posts via ego-browser

Usage:
  x-research search <query> [options]
  x-research thread <url-or-id> [options]
  x-research user <handle> [options]

Subcommands:
  search <query>      Search X discussions by keyword or phrase
  thread <url-or-id>  Read full thread: parent context, main post, author continuation, and replies
  user <handle>       Inspect recent posts authored by a user handle

Global Options:
  --profile <id>      Target ego-browser profile ID (default: "Profile 1" or $X_RESEARCH_PROFILE)
  --tab <top|live>    Search tab mode: "top", "live", or "latest" (default: "top")
  --limit <n>         Maximum tweets to collect for search/user (default: 20)
  --max-replies <n>   Maximum community replies to collect for thread (default: 40)
  --sort <method>     Sorting order: "score", "recent", or "order" (default: "score")
  --format <md|json>  Output format: "md" or "json" (default: "md")
  --json              Shorthand flag for "--format json"
  --replies           Include replies when inspecting user timeline
  --out <path>        Write output to file path instead of stdout only
  --timeout <ms>      Execution watchdog deadline in ms (default: 90000, exit 124 on timeout)
  --help, -h          Show this help message

Exit Codes:
  0                   Success (TERM_OK)
  1                   General runtime error or scraper failure (GENERAL_ERROR)
  2                   Invalid command-line arguments or missing input (TERM_BLOCK)
  124                 Execution timeout exceeded (TIMEOUT)
`);
}
