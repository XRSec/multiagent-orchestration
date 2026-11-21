#!/usr/bin/env node
// Purpose: Parse localized engagement metrics, calculate scores, deduplicate and rank X posts.
// Context: Engagement analytics module for x-research skill.
// Usage: import { parseLocalizedCount, computeEngagementScore, deduplicatePosts, rankPosts } from './metrics.mjs';
// Prerequisites: Node.js 18+ (ESM built-ins only); no external packages or interactive TTY.

export function parseLocalizedCount(raw) {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'number') return isNaN(raw) ? 0 : Math.round(raw);
  const str = String(raw).trim().replace(/,/g, '').replace(/\s+/g, '');
  if (!str || str === '0') return 0;

  let multiplier = 1;
  let numPart = str;

  if (/[万萬]/.test(str)) {
    multiplier = 10000;
    numPart = str.replace(/[万萬]/g, '');
  } else if (/[亿億]/.test(str)) {
    multiplier = 100000000;
    numPart = str.replace(/[亿億]/g, '');
  } else if (/k/i.test(str)) {
    multiplier = 1000;
    numPart = str.replace(/k/i, '');
  } else if (/m/i.test(str)) {
    multiplier = 1000000;
    numPart = str.replace(/m/i, '');
  } else if (/b/i.test(str)) {
    multiplier = 1000000000;
    numPart = str.replace(/b/i, '');
  }

  const val = parseFloat(numPart);
  return isNaN(val) ? 0 : Math.round(val * multiplier);
}

export function computeEngagementScore(post = {}) {
  const likes = parseLocalizedCount(post.likes ?? post.like ?? 0);
  const retweets = parseLocalizedCount(post.retweets ?? post.retweet ?? 0);
  const replies = parseLocalizedCount(post.replies ?? post.reply ?? 0);
  return likes + (3 * retweets) + (2 * replies);
}

export function deduplicatePosts(posts) {
  if (!Array.isArray(posts)) return [];
  const seen = new Set();
  const deduped = [];
  for (const p of posts) {
    if (!p) continue;
    const key = p.id || p.url || p.href;
    if (key && !seen.has(key)) {
      seen.add(key);
      deduped.push(p);
    }
  }
  return deduped;
}

export function rankPosts(posts, sortMethod = 'score') {
  if (!Array.isArray(posts)) return [];
  const items = [...posts];

  if (sortMethod === 'recent') {
    return items.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return tb - ta;
    });
  }

  if (sortMethod === 'order') {
    return items;
  }

  return items.sort((a, b) => {
    const sa = a.score !== undefined ? a.score : computeEngagementScore(a);
    const sb = b.score !== undefined ? b.score : computeEngagementScore(b);
    return sb - sa;
  });
}
