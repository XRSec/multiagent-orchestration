#!/usr/bin/env node
// Purpose: Format scraped X.com data into high-signal Markdown or structured JSON.
// Context: Output formatter module for x-research skill.
// Usage: import { formatOutput, formatThreadToMarkdown, formatSearchToMarkdown, formatUserToMarkdown } from './format.mjs';
// Prerequisites: Node.js 18+ (ESM built-ins only); no external packages or interactive TTY.

function formatMetricsBadge(item) {
  const l = item.likes ?? item.like ?? 0;
  const r = item.retweets ?? item.retweet ?? 0;
  const rep = item.replies ?? item.reply ?? 0;
  const v = item.views || '0';
  const s = item.score !== undefined ? item.score : 0;
  return `❤️ ${l} | 🔁 ${r} | 💬 ${rep} | 👁️ ${v} | Score: ${s}`;
}

function formatPostBlock(item, prefix = '') {
  const lines = [];
  const author = item.authorName || 'Unknown';
  const handle = item.authorHandle ? `@${item.authorHandle}` : '@unknown';
  const time = item.time ? item.time.replace('.000Z', 'Z').replace('T', ' ') : 'Unknown time';
  const url = item.url || item.href || '';

  lines.push(`${prefix}**${author}** (${handle}) · ${time}`);
  lines.push(`${prefix}**Metrics**: ${formatMetricsBadge(item)}`);
  if (url) {
    lines.push(`${prefix}**URL**: ${url}`);
  }
  lines.push('');
  lines.push(`${prefix}${item.text ? item.text.trim() : '(No text)'}`);

  if (item.quotedTweet) {
    lines.push('');
    lines.push(`${prefix}> ↳ **Quoted**: ${item.quotedTweet.author || 'User'} (${item.quotedTweet.time || ''})`);
    lines.push(`${prefix}> ${item.quotedTweet.text || ''}`);
  }

  if (item.cardText && item.cardText.trim()) {
    lines.push('');
    lines.push(`${prefix}**Card**: ${item.cardText.trim()}`);
  }

  if (Array.isArray(item.links) && item.links.length > 0) {
    lines.push('');
    lines.push(`${prefix}**Links**:`);
    for (const link of item.links) {
      lines.push(`${prefix}- ${link}`);
    }
  }

  return lines.join('\n');
}

export function formatThreadToMarkdown(data) {
  const lines = [];
  lines.push(`# X Thread: ${data.targetId || 'Discussion'}`);
  lines.push('');

  if (Array.isArray(data.parentContext) && data.parentContext.length > 0) {
    lines.push(`## Parent Context (${data.parentContext.length} posts)`);
    data.parentContext.forEach((p, idx) => {
      lines.push(`### Ancestor #${idx + 1}`);
      lines.push(formatPostBlock(p));
      lines.push('');
    });
  }

  if (data.mainPost) {
    lines.push('## Main Post');
    lines.push(formatPostBlock(data.mainPost));
    lines.push('');
  }

  if (Array.isArray(data.authorContinuation) && data.authorContinuation.length > 0) {
    lines.push(`## Author Continuation (${data.authorContinuation.length} posts)`);
    data.authorContinuation.forEach((p, idx) => {
      lines.push(`### Part ${idx + 2}`);
      lines.push(formatPostBlock(p));
      lines.push('');
    });
  }

  if (Array.isArray(data.replies) && data.replies.length > 0) {
    lines.push(`## Community Replies (${data.replies.length} replies, sorted by ${data.sort || 'score'})`);
    data.replies.forEach((p, idx) => {
      lines.push(`### Reply #${idx + 1}`);
      lines.push(formatPostBlock(p));
      lines.push('');
    });
  } else if (!data.authorContinuation || data.authorContinuation.length === 0) {
    lines.push('*(No community replies captured)*');
  }

  return lines.join('\n');
}

export function formatSearchToMarkdown(data) {
  const lines = [];
  lines.push(`# X Search: "${data.query || ''}"`);
  lines.push(`**Tab**: ${data.tab || 'top'} | **Total Captured**: ${data.tweets ? data.tweets.length : 0} | **Sorted By**: ${data.sort || 'score'}`);
  lines.push('');

  const tweets = data.tweets || [];
  if (tweets.length === 0) {
    lines.push('*(No search results found)*');
    return lines.join('\n');
  }

  tweets.forEach((p, idx) => {
    lines.push(`### [${idx + 1}] ${p.authorName || 'User'} (@${p.authorHandle || 'unknown'})`);
    lines.push(formatPostBlock(p));
    lines.push('');
  });

  return lines.join('\n');
}

export function formatUserToMarkdown(data) {
  const lines = [];
  lines.push(`# X User: @${data.handle || ''}`);
  lines.push(`**Total Captured**: ${data.tweets ? data.tweets.length : 0}`);
  lines.push('');

  const tweets = data.tweets || [];
  if (tweets.length === 0) {
    lines.push('*(No tweets found for user)*');
    return lines.join('\n');
  }

  tweets.forEach((p, idx) => {
    lines.push(`### [${idx + 1}] ${p.time || 'Post'}`);
    lines.push(formatPostBlock(p));
    lines.push('');
  });

  return lines.join('\n');
}

export function formatOutput(data, format = 'md', subcommand = 'thread') {
  if (format === 'json') {
    return JSON.stringify(data, null, 2);
  }
  if (subcommand === 'thread') {
    return formatThreadToMarkdown(data);
  }
  if (subcommand === 'search') {
    return formatSearchToMarkdown(data);
  }
  if (subcommand === 'user') {
    return formatUserToMarkdown(data);
  }
  return JSON.stringify(data, null, 2);
}
