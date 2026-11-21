#!/usr/bin/env node
// Purpose: Unit test suite for x-research CLI args, status extraction, metrics parsing, and formatters.
// Context: CI/regression test runner executed via `node --test`.
// Usage: node --test scripts/x-research.test.mjs
// Prerequisites: Node.js 18+ (node:test and node:assert/strict).

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliArgs, normalizeStatusId, normalizeHandle, buildSearchUrl } from './lib/args.mjs';
import { parseLocalizedCount, computeEngagementScore, deduplicatePosts, rankPosts } from './lib/metrics.mjs';
import { formatOutput, formatThreadToMarkdown } from './lib/format.mjs';
import { processThreadItems } from './lib/ego-runner.mjs';
import { buildBrowserScript } from './lib/browser-script.mjs';

test('Status ID normalization', () => {
  assert.equal(normalizeStatusId('2121811605402825115'), '2121811605402825115');
  assert.equal(normalizeStatusId('https://x.com/MndiLysses/status/2121811605402825115'), '2121811605402825115');
  assert.equal(normalizeStatusId('https://x.com/MndiLysses/status/2121811605402825115?s=20'), '2121811605402825115');
  assert.equal(normalizeStatusId('https://twitter.com/user/status/1234567890/analytics'), '1234567890');
  assert.equal(normalizeStatusId('https://mobile.twitter.com/i/web/status/9876543210'), '9876543210');
  assert.equal(normalizeStatusId('invalid-url-or-id'), null);
  assert.equal(normalizeStatusId(''), null);
});

test('User handle normalization', () => {
  assert.equal(normalizeHandle('MndiLysses'), 'MndiLysses');
  assert.equal(normalizeHandle('@MndiLysses'), 'MndiLysses');
  assert.equal(normalizeHandle('https://x.com/MndiLysses'), 'MndiLysses');
  assert.equal(normalizeHandle('https://twitter.com/MndiLysses/status/123'), 'MndiLysses');
  assert.equal(normalizeHandle(''), null);
  assert.equal(normalizeHandle('@@@'), null);
});

test('Search URL builder', () => {
  assert.equal(
    buildSearchUrl('claude code', 'top'),
    'https://x.com/search?q=claude%20code&src=typed_query'
  );
  assert.equal(
    buildSearchUrl('claude code', 'live'),
    'https://x.com/search?q=claude%20code&src=typed_query&f=live'
  );
});

test('CLI argument parsing & validation', () => {
  // Help flag
  const helpResult = parseCliArgs(['node', 'x-research.mjs', '--help']);
  assert.equal(helpResult.isHelp, true);

  // Missing subcommand -> exitCode 2
  const noSubResult = parseCliArgs(['node', 'x-research.mjs']);
  assert.equal(noSubResult.exitCode, 2);

  // Unknown subcommand -> exitCode 2
  const unknownResult = parseCliArgs(['node', 'x-research.mjs', 'unknown-cmd']);
  assert.equal(unknownResult.exitCode, 2);

  // Search subcommand
  const searchResult = parseCliArgs(['node', 'x-research.mjs', 'search', 'langchain agent', '--limit', '10', '--tab', 'live']);
  assert.equal(searchResult.success, true);
  assert.equal(searchResult.subcommand, 'search');
  assert.equal(searchResult.target, 'langchain agent');
  assert.equal(searchResult.limit, 10);
  assert.equal(searchResult.tab, 'live');

  // Thread subcommand valid
  const threadResult = parseCliArgs(['node', 'x-research.mjs', 'thread', 'https://x.com/user/status/1122334455', '--json']);
  assert.equal(threadResult.success, true);
  assert.equal(threadResult.subcommand, 'thread');
  assert.equal(threadResult.statusId, '1122334455');
  assert.equal(threadResult.format, 'json');

  // Thread subcommand invalid status ID -> exitCode 2
  const badThreadResult = parseCliArgs(['node', 'x-research.mjs', 'thread', 'not-a-status-id']);
  assert.equal(badThreadResult.exitCode, 2);

  // User subcommand valid
  const userResult = parseCliArgs(['node', 'x-research.mjs', 'user', '@karpathy', '--limit', '30']);
  assert.equal(userResult.success, true);
  assert.equal(userResult.handle, 'karpathy');
  assert.equal(userResult.limit, 30);

  // --flag=value syntax
  const eqResult = parseCliArgs([
    'node',
    'x-research.mjs',
    'search',
    'acp',
    '--format=json',
    '--limit=5',
    '--sort=order',
    '--tab=live'
  ]);
  assert.equal(eqResult.success, true);
  assert.equal(eqResult.format, 'json');
  assert.equal(eqResult.limit, 5);
  assert.equal(eqResult.sort, 'order');
  assert.equal(eqResult.tab, 'live');

  // Invalid option values -> exitCode 2
  assert.equal(parseCliArgs(['node', 'x-research.mjs', 'search', 'acp', '--sort', 'invalid']).exitCode, 2);
  assert.equal(parseCliArgs(['node', 'x-research.mjs', 'search', 'acp', '--tab', 'bad']).exitCode, 2);
  assert.equal(parseCliArgs(['node', 'x-research.mjs', 'search', 'acp', '--format', 'xml']).exitCode, 2);
  assert.equal(parseCliArgs(['node', 'x-research.mjs', 'search', 'acp', '--limit', '0']).exitCode, 2);
  assert.equal(parseCliArgs(['node', 'x-research.mjs', 'thread', '123456', '--max-replies', '-1']).exitCode, 2);
  assert.equal(parseCliArgs(['node', 'x-research.mjs', 'search', 'acp', '--timeout', '500']).exitCode, 2);
});

test('Localized count parsing', () => {
  assert.equal(parseLocalizedCount(0), 0);
  assert.equal(parseLocalizedCount('0'), 0);
  assert.equal(parseLocalizedCount(''), 0);
  assert.equal(parseLocalizedCount('1,234'), 1234);
  assert.equal(parseLocalizedCount('1 234'), 1234);
  assert.equal(parseLocalizedCount('1.2K'), 1200);
  assert.equal(parseLocalizedCount('1.2k'), 1200);
  assert.equal(parseLocalizedCount('3.4M'), 3400000);
  assert.equal(parseLocalizedCount('2.5万'), 25000);
  assert.equal(parseLocalizedCount('1.5亿'), 150000000);
  assert.equal(parseLocalizedCount('2B'), 2000000000);
});

test('Engagement score & post ranking', () => {
  const p1 = { id: '1', likes: '10', retweets: '2', replies: '3' }; // 10 + 6 + 6 = 22
  const p2 = { id: '2', likes: '100', retweets: '10', replies: '5' }; // 100 + 30 + 10 = 140
  const p3 = { id: '3', likes: '5', retweets: '0', replies: '0' }; // 5

  assert.equal(computeEngagementScore(p1), 22);
  assert.equal(computeEngagementScore(p2), 140);
  assert.equal(computeEngagementScore(p3), 5);

  const ranked = rankPosts([p1, p2, p3], 'score');
  assert.equal(ranked[0].id, '2');
  assert.equal(ranked[1].id, '1');
  assert.equal(ranked[2].id, '3');

  const deduped = deduplicatePosts([p1, p1, p2, { id: '2', text: 'dup' }]);
  assert.equal(deduped.length, 2);
});

test('Markdown & JSON output formatting', () => {
  const mockThread = {
    targetId: '12345',
    mainPost: {
      id: '12345',
      authorName: 'Developer',
      authorHandle: 'dev',
      time: '2026-11-20T10:00:00.000Z',
      text: 'Exploring AI agents in production.',
      likes: '50',
      retweets: '10',
      replies: '5',
      views: '10K',
      score: 90,
      links: ['https://github.com/example/repo']
    },
    authorContinuation: [],
    replies: [
      {
        id: '12346',
        authorName: 'Engineer',
        authorHandle: 'eng',
        time: '2026-11-20T10:15:00.000Z',
        text: 'Great findings on agent memory.',
        likes: '10',
        retweets: '1',
        replies: '0',
        views: '500',
        score: 13
      }
    ],
    sort: 'score'
  };

  const md = formatOutput(mockThread, 'md', 'thread');
  assert.match(md, /# X Thread: 12345/);
  assert.match(md, /## Main Post/);
  assert.match(md, /Developer/);
  assert.match(md, /## Community Replies/);
  assert.match(md, /Engineer/);

  const jsonStr = formatOutput(mockThread, 'json');
  const parsedJson = JSON.parse(jsonStr);
  assert.equal(parsedJson.targetId, '12345');
  assert.equal(parsedJson.mainPost.authorHandle, 'dev');
});

test('processThreadItems splits parentContext, mainPost, authorContinuation, and replies accurately', () => {
  const domItems = [
    { id: '100', authorHandle: 'parent_user', text: 'Parent post', likes: '50', retweets: '10', replies: '2' },
    { id: '200', authorHandle: 'alice', text: 'Main target post', likes: '5', retweets: '0', replies: '3' },
    { id: '201', authorHandle: 'Alice', text: 'Self thread part 2', likes: '2', retweets: '0', replies: '0' },
    { id: '202', authorHandle: 'bob', text: 'Reply from bob', likes: '20', retweets: '1', replies: '1' },
    { id: '203', authorHandle: 'alice', text: 'Alice answering bob later', likes: '1', retweets: '0', replies: '0' }
  ];

  const thread = processThreadItems(domItems, '200', 'order', 10);
  assert.equal(thread.parentContext.length, 1);
  assert.equal(thread.parentContext[0].id, '100');
  assert.equal(thread.mainPost.id, '200');
  assert.equal(thread.authorContinuation.length, 1);
  assert.equal(thread.authorContinuation[0].id, '201');
  assert.deepEqual(
    thread.replies.map((r) => r.id),
    ['202', '203']
  );
  assert.equal(thread.totalRepliesCaptured, 2);

  const md = formatThreadToMarkdown({
    ...thread,
    mainPost: {
      ...thread.mainPost,
      cardText: 'GitHub - example/repo: Issue #1432'
    }
  });
  assert.match(md, /## Parent Context \(1 posts\)/);
  assert.match(md, /## Author Continuation \(1 posts\)/);
  assert.match(md, /\*\*Card\*\*: GitHub - example\/repo: Issue #1432/);
});

test('buildBrowserScript creates isolated ephemeral taskSpace without fixed shared name', () => {
  const script = buildBrowserScript({
    subcommand: 'thread',
    statusId: '2121811605402825115',
    profileId: 'Profile 1',
    maxReplies: 10
  });
  assert.match(script, /const SPACE_NAME = "x-research-"/);
  assert.doesNotMatch(script, /taskSpace\("x-research-worker"/);
  assert.match(script, /t === 'Ad' \|\| t === 'Promoted'/);
});
