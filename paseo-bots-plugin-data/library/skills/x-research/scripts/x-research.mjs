#!/usr/bin/env node
// Purpose: CLI entrypoint for searching X discussions and extracting threads/replies via ego-browser.
// Context: Operational CLI for x-research skill invoked by agents or operators.
// Usage: node x-research.mjs <search|thread|user> <target> [flags]
// Prerequisites: Node.js 18+; ego-browser installed; no interactive TTY required.

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseCliArgs, printUsage, buildSearchUrl } from './lib/args.mjs';
import { runEgoResearch } from './lib/ego-runner.mjs';
import { formatOutput } from './lib/format.mjs';

process.on('unhandledRejection', (reason) => {
  console.error('[x-research] Unhandled rejection:', reason?.message || reason);
  process.exit(1);
});

async function writeOutput(content, outPath) {
  if (!outPath) return;
  const resolved = path.resolve(process.cwd(), outPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, 'utf8');
  console.error(`[x-research] Output written to: ${resolved}`);
}

async function main() {
  const parsed = parseCliArgs(process.argv);

  if (parsed.isHelp) {
    printUsage();
    process.exit(0);
  }

  if (parsed.error) {
    console.error(`[x-research] Error: ${parsed.error}\n`);
    printUsage();
    process.exit(parsed.exitCode || 2);
  }

  const payload = {
    subcommand: parsed.subcommand,
    target: parsed.target,
    statusId: parsed.statusId,
    handle: parsed.handle,
    profileId: parsed.profileId,
    tab: parsed.tab,
    limit: parsed.limit,
    maxReplies: parsed.maxReplies,
    sort: parsed.sort,
    format: parsed.format,
    withReplies: parsed.withReplies,
    timeoutMs: parsed.timeoutMs,
    searchUrl: parsed.subcommand === 'search' ? buildSearchUrl(parsed.target, parsed.tab) : null
  };

  try {
    const data = await runEgoResearch(payload);
    const formatted = formatOutput(data, parsed.format, parsed.subcommand);

    if (parsed.outPath) {
      await writeOutput(formatted, parsed.outPath);
    }

    process.stdout.write(formatted + '\n');
    process.exit(0);
  } catch (err) {
    const code = err.exitCode || 1;
    console.error(`[x-research] Execution failed (code ${code}):`, err.message);
    process.exit(code);
  }
}

main();
