#!/usr/bin/env node
// Purpose: Generate self-contained ego-browser nodejs script for scraping X.com threads, search, and timelines.
// Context: Script builder consumed by ego-runner.mjs inside x-research CLI.
// Usage: import { buildBrowserScript } from './browser-script.mjs';
// Prerequisites: Node.js 18+; ego-browser nodejs runtime with taskSpace/page APIs.

function buildTaskHelperCode() {
  return `
const SPACE_NAME = "x-research-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);

function buildTargetUrl() {
  if (PAYLOAD.subcommand === 'thread') {
    return 'https://x.com/i/web/status/' + PAYLOAD.statusId;
  }
  if (PAYLOAD.subcommand === 'search') {
    return PAYLOAD.searchUrl;
  }
  return 'https://x.com/' + PAYLOAD.handle + (PAYLOAD.withReplies ? '/with_replies' : '');
}

async function acquireTask() {
  return await taskSpace(SPACE_NAME, { profileId: PROFILE_ID });
}

async function acquirePage(task) {
  const pages = await task.pages();
  if (pages.length > 0) return pages[0];
  return await task.newPage();
}`;
}

function buildWaitHelperCode() {
  return `
async function inspectPageState(page) {
  return await page.evaluate(() => {
    const u = window.location.href;
    if (u.includes('/login') || u.includes('/i/flow/login')) {
      return { error: 'LOGIN_REQUIRED', hasTweet: false };
    }
    const hasTweet = Boolean(document.querySelector('article[data-testid="tweet"]'));
    const body = document.body ? document.body.innerText : '';
    if (body.includes('Rate limit exceeded') || body.includes('超出速率限制')) {
      return { error: 'RATE_LIMIT', hasTweet };
    }
    if (!hasTweet && body.includes('Something went wrong')) {
      return { error: 'SOMETHING_WENT_WRONG', hasTweet: false };
    }
    if (
      !hasTweet &&
      (body.includes("This page doesn't exist") ||
        body.includes("This page doesn\\u2019t exist") ||
        body.includes('此页面不存在'))
    ) {
      return { error: 'NOT_FOUND', hasTweet: false };
    }
    return { error: null, hasTweet };
  });
}

async function waitForInitialTweets(page) {
  let state = { error: null, hasTweet: false };
  for (let i = 0; i < 16; i++) {
    state = await inspectPageState(page);
    if (state.error) {
      throw new Error(state.error);
    }
    if (state.hasTweet) {
      await page.waitForTimeout(500);
      return;
    }
    await page.waitForTimeout(500);
  }
  const finalState = await inspectPageState(page);
  if (finalState.error) {
    throw new Error(finalState.error);
  }
}`;
}

function buildDomExtractorCode() {
  return `
async function expandTimelineButtons(page) {
  return await page.evaluate(() => {
    const labels = new Set([
      'Show more',
      '显示更多',
      'Show full post',
      'Show additional replies',
      '显示更多回复',
      'Show probable spam',
      '显示可能包含垃圾信息的回复'
    ]);
    const root = document.querySelector('[data-testid="primaryColumn"]') || document;
    const buttons = Array.from(root.querySelectorAll('button, div[role="button"]'));
    let clicked = 0;
    for (const b of buttons) {
      if (b.dataset.xrClicked === '1') continue;
      const t = (b.innerText || '').trim();
      if (labels.has(t)) {
        b.dataset.xrClicked = '1';
        try {
          b.click();
          clicked++;
        } catch (_) {}
      }
    }
    return clicked;
  });
}

async function extractVisibleTweets(page) {
  return await page.evaluate(() => {
    function extractTweetArticle(a) {
      const timeEl = a.querySelector('time');
      const linkEl = timeEl?.closest('a[href*="/status/"]') || a.querySelector('a[href*="/status/"]');
      const href = linkEl ? linkEl.href.replace(/\\/(analytics|photo\\/\\d+|video\\/\\d+)$/, '') : null;
      const match = href ? href.match(/status\\/(\\d+)/) : null;
      const id = match ? match[1] : null;

      const userEl = a.querySelector('div[data-testid="User-Name"]');
      let authorName = '';
      let authorHandle = '';
      if (userEl) {
        const fullText = userEl.innerText.replace(/\\n+/g, ' ');
        const handleMatch = fullText.match(/@([A-Za-z0-9_]+)/);
        if (handleMatch) {
          authorHandle = handleMatch[1];
          authorName = fullText.split('@')[0].trim();
        } else {
          authorName = fullText;
        }
      }

      const quoteEl = Array.from(a.querySelectorAll('div[role="link"][tabindex="0"]'))
        .find((el) => Boolean(el.querySelector('time'))) || null;
      let quotedTweet = null;
      if (quoteEl) {
        const qUser = quoteEl.querySelector('div[data-testid="User-Name"]')?.innerText.replace(/\\n+/g, ' ') || '';
        const qText = quoteEl.querySelector('div[data-testid="tweetText"]')?.innerText || '';
        const qTime = quoteEl.querySelector('time')?.getAttribute('datetime') || '';
        quotedTweet = { author: qUser, text: qText, time: qTime };
      }

      const cardText =
        a.querySelector('div[data-testid="card.wrapper"]')?.innerText?.replace(/\\s+/g, ' ').trim() || '';

      const tweetTextEl =
        Array.from(a.querySelectorAll('div[data-testid="tweetText"]'))
          .find((el) => !quoteEl || !quoteEl.contains(el)) || null;
      const text = tweetTextEl
        ? tweetTextEl.innerText
        : (quoteEl || cardText ? '' : a.innerText.replace(/\\n+/g, ' | '));

      const adBadge = Array.from(a.querySelectorAll('span')).some((s) => {
        const t = (s.innerText || '').trim();
        return t === 'Ad' || t === 'Promoted' || t === '广告' || t === '赞助';
      });
      const isAd = !timeEl || adBadge;

      const reply = a.querySelector('button[data-testid="reply"]')?.innerText || '0';
      const retweet = a.querySelector('button[data-testid="retweet"], button[data-testid="unretweet"]')?.innerText || '0';
      const like = a.querySelector('button[data-testid="like"], button[data-testid="unlike"]')?.innerText || '0';
      const viewEl = a.querySelector('a[href*="/analytics"]');
      const views = viewEl ? viewEl.innerText.replace(/[\\n\\r]+/g, ' ').replace(/(查看|Views?)/gi, '').trim() : '0';

      const links = [];
      const linkEls = Array.from(a.querySelectorAll('div[data-testid="tweetText"] a, div[data-testid="card.wrapper"] a'));
      for (const l of linkEls) {
        if (quoteEl && quoteEl.contains(l)) continue;
        const h = l.href;
        if (h && !h.includes('/hashtag/') && !h.includes('/status/') && h !== href && !links.includes(h)) {
          links.push(h);
        }
      }

      return {
        id,
        url: href || (id ? 'https://x.com/i/web/status/' + id : ''),
        authorName,
        authorHandle,
        time: timeEl?.getAttribute('datetime') || '',
        text,
        cardText,
        isAd,
        likes: like,
        retweets: retweet,
        replies: reply,
        views,
        links,
        quotedTweet
      };
    }

    const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    return articles.map(extractTweetArticle);
  });
}`;
}

function buildScrapeLoopCode() {
  return `
function mergeTweetBatch(collected, batch) {
  for (const item of batch) {
    if (!item || item.isAd) continue;
    const key = item.id || item.url;
    if (!key) continue;
    const prev = collected.get(key);
    if (!prev) {
      collected.set(key, item);
      continue;
    }
    const textExpanded = (item.text || '').length > (prev.text || '').length;
    const linksExpanded = (item.links || []).length > (prev.links || []).length;
    const cardExpanded = !prev.cardText && Boolean(item.cardText);
    if (textExpanded || linksExpanded || cardExpanded) {
      collected.set(key, item);
    }
  }
}

async function runBrowserScrape() {
  const task = await acquireTask();
  try {
    const page = await acquirePage(task);
    const targetUrl = buildTargetUrl();
    console.error('[x-research] Navigating to: ' + targetUrl);
    await page.goto(targetUrl);
    await waitForInitialTweets(page);

    const collected = new Map();
    const maxRounds = PAYLOAD.subcommand === 'thread' ? 12 : 18;
    const targetCount = PAYLOAD.subcommand === 'thread' ? (PAYLOAD.maxReplies + 5) : PAYLOAD.limit;
    let rounds = 0;
    let staleRounds = 0;

    while (collected.size < targetCount && rounds < maxRounds) {
      rounds++;
      const clickedCount = await expandTimelineButtons(page);
      if (clickedCount > 0) {
        await page.waitForTimeout(600);
      }

      const prevSize = collected.size;
      const batch = await extractVisibleTweets(page);
      mergeTweetBatch(collected, batch);

      if (collected.size === prevSize && clickedCount === 0) {
        staleRounds++;
      } else {
        staleRounds = 0;
      }

      if (staleRounds >= 2 || collected.size >= targetCount || rounds >= maxRounds) {
        break;
      }

      await page.evaluate(() => window.scrollBy(0, 1200));
      await page.waitForTimeout(800);
    }

    const items = Array.from(collected.values());
    console.log('__X_RESEARCH_DATA_START__');
    console.log(JSON.stringify({ ok: true, items }));
    console.log('__X_RESEARCH_DATA_END__');
  } finally {
    try {
      await task.finish({ keep: [] });
    } catch (_) {}
  }
}

await runBrowserScrape();`;
}

export function buildBrowserScript(payload) {
  return [
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    'const PROFILE_ID = PAYLOAD.profileId || "Profile 1";',
    buildTaskHelperCode(),
    buildWaitHelperCode(),
    buildDomExtractorCode(),
    buildScrapeLoopCode()
  ].join('\n');
}
