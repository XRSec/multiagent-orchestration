#!/usr/bin/env node

/**
 * read_twitter.mjs
 * 
 * 自动化读取 Twitter (X) 内容的脚本。
 * 基于 ego-browser 操作本地浏览器 Profile，支持增量爬取、去重、自动点击“查看新帖子”、
 * 互动量（赞/转/评）解析、以及按规则/关键词/大事件过滤等功能。
 * 
 * 用法:
 *   node read_twitter.mjs [options]
 *   或通过 ego-browser 执行:
 *   ego-browser nodejs read_twitter.mjs -- [options]
 * 
 * 选项:
 *   --count <n>       抓取推文目标数量 (默认: 50，设为 1000 可深度抓取)
 *   --profile <id>    指定使用的 ego-browser Profile (默认: Profile 1，即 Cat)
 *   --out <path>      输出 JSON 路径 (默认: /tmp/twitter_feed.json)
 *   --filter-big      过滤宏观大事/大厂发布会/研报/政策，只看民间脑洞/乐子/人间真实 (默认: 关闭)
 *   --today-only      只保留当天发布的推文 (默认: 关闭)
 *   --print           控制台打印结果摘要 (默认: 开启)
 *   --help            显示帮助信息
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

// 解析命令行参数
const args = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return defaultValue;
}
const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(`
Twitter / X 自动读取与分析脚本

用法:
  ./read_twitter.mjs [选项]

选项:
  --count <n>       抓取目标推文条数 (默认: 50)
  --profile <id>    指定 ego profile (默认: 'Profile 1' / 'Cat')
  --out <path>      输出 JSON 结果文件路径 (默认: /tmp/twitter_feed.json)
  --filter-big      开启后自动过滤大厂发布会、严肃研报、宏观政治 (保留趣闻、极客项目、吐槽)
  --today-only      仅筛选并显示最新当天的推文
  --top <n>         打印前 N 条结果摘要 (默认: 15)
  --json            直接输出过滤后的 JSON 到 stdout
  --help            显示本帮助

示例:
  node read_twitter.mjs --count 100
  node read_twitter.mjs --count 500 --filter-big --today-only
`);
  process.exit(0);
}

const targetCount = parseInt(getArg('--count', '50'), 10);
const profileId = getArg('--profile', 'Profile 1');
const outPath = path.resolve(getArg('--out', '/tmp/twitter_feed.json'));
const filterBig = hasFlag('--filter-big');
const todayOnly = hasFlag('--today-only');
const printJson = hasFlag('--json');
const topN = parseInt(getArg('--top', '15'), 10);

// 用于注入到 ego-browser 执行的代码
const runnerCode = `
import fs from 'node:fs/promises';

const TARGET_COUNT = ${targetCount};
const PROFILE_ID = ${JSON.stringify(profileId)};
const OUT_PATH = ${JSON.stringify(outPath)};

const spaces = await listTaskSpaces();
const existing = spaces.find(s => s.name === "read-twitter-worker" || (s.profileId === PROFILE_ID && (s.recentTabTitles || []).some(t => t.includes("X") || t.includes("Twitter"))));
let task;
if (existing) {
  if (existing.ownership === "user") {
    task = await claimTaskSpace(existing.id);
  } else if (existing.ownership === "agentDelegatedToUser") {
    task = await takeOverTaskSpace(existing.id);
  } else {
    task = await taskSpace(existing.id);
  }
} else {
  task = await taskSpace("read-twitter-worker", { profileId: PROFILE_ID });
}
const tabs = await task.tabs();
const page = (await task.pages())[0] ?? (tabs.length > 0 ? await task.adopt(tabs[0].page) : await task.newPage({ label: "p1" }));

// 刷新页面获取最新推文流并尝试点击顶部的“查看新帖子”
try {
  await page.goto("https://x.com/home");
  await page.waitForTimeout(3500);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    const pill = buttons.find(b => b.innerText && (
      b.innerText.includes('查看') || 
      b.innerText.includes('帖子') || 
      b.innerText.includes('posts') ||
      b.innerText.includes('Show')
    ));
    if (pill && pill.offsetHeight > 0) pill.click();
  });
  await page.waitForTimeout(1500);
} catch (e) {}

const collected = new Map();
try {
  const existingRaw = await fs.readFile(OUT_PATH, 'utf8');
  const existingList = JSON.parse(existingRaw);
  if (Array.isArray(existingList) && existingList.length > 0) {
    if (existingList.length < TARGET_COUNT) {
      for (const item of existingList) {
        if (item && item.id) collected.set(item.id, item);
      }
      console.log('[Twitter Reader] 成功加载已有断点数据: ' + collected.size + ' 条，继续增量采集...');
    } else {
      console.log('[Twitter Reader] 目标文件已有完整历史数据 (' + existingList.length + ' 条)，启动全新采集...');
    }
  }
} catch (e) {}

let emptyRounds = 0;
let round = 0;

while (collected.size < TARGET_COUNT && emptyRounds < 25) {
  round++;
  const prevSize = collected.size;

  const batch = await page.evaluate(async (stepCount) => {
    const results = [];
    function harvest() {
      const articles = document.querySelectorAll('div[data-testid="tweet"], article[data-testid="tweet"]');
      for (const a of articles) {
        // 首个 time 属于主推文（引用推文的 time 在其后），其外层 a 才是本推文永久链接
        const timeEl = a.querySelector('time');
        const linkEl = timeEl?.closest('a[href*="/status/"]') || a.querySelector('a[href*="/status/"]');
        const href = linkEl ? linkEl.href.replace(/\\/(analytics|photo\\/\\d+|video\\/\\d+)$/, '') : null;
        if (!href) continue;
        const match = href.match(/status\\/(\\d+)/);
        const id = match ? match[1] : href;

        const isAd = !timeEl || a.innerText.includes('赞助') || a.innerText.includes('Promoted') || a.innerText.includes('广告');
        const userEl = a.querySelector('div[data-testid="User-Name"]');
        const userText = userEl ? userEl.innerText.replace(/\\n+/g, ' ') : '';
        const tweetTextEl = a.querySelector('div[data-testid="tweetText"]');
        const tweetText = tweetTextEl ? tweetTextEl.innerText : '';
        const reply = a.querySelector('button[data-testid="reply"]')?.innerText || '0';
        const retweet = a.querySelector('button[data-testid="retweet"]')?.innerText || '0';
        const like = a.querySelector('button[data-testid="like"]')?.innerText || '0';
        const time = timeEl?.getAttribute('datetime') || '';

        results.push({
          id,
          isAd,
          user: userText,
          text: tweetText || a.innerText.replace(/\\n+/g, ' | '),
          reply,
          retweet,
          like,
          time,
          link: href
        });
      }
    }

    for (let s = 0; s < stepCount; s++) {
      harvest();
      window.scrollBy(0, 1300);
      await new Promise(r => setTimeout(r, 550));
    }
    harvest();

    return results;
  }, 4);

  for (const item of batch) {
    if (!collected.has(item.id)) {
      collected.set(item.id, item);
    }
  }

  if (collected.size === prevSize) {
    emptyRounds++;
    // 尝试点击可能出现的“重试”或“Retry”按钮
    try {
      await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]'));
        const retry = btns.find(b => b.innerText && (b.innerText.includes('重试') || b.innerText.includes('Retry')));
        if (retry) retry.click();
      });
    } catch (e) {}
    await page.evaluate(() => window.scrollBy(0, -600));
    await page.waitForTimeout(2500);
  } else {
    emptyRounds = 0;
  }

  if (round % 2 === 0 || collected.size >= TARGET_COUNT) {
    console.log("[Scraper Progress] " + collected.size + " / " + TARGET_COUNT + " 条已捕获 (第 " + round + " 轮)...");
    try {
      await fs.writeFile(OUT_PATH, JSON.stringify(Array.from(collected.values()), null, 2));
    } catch (e) {}
  }
}

const list = Array.from(collected.values());
await fs.writeFile(OUT_PATH, JSON.stringify(list, null, 2));
await task.finish({ keep: page && page.label ? [page.label] : "all" });
console.log(JSON.stringify({ ok: true, count: list.length, path: OUT_PATH }));
`;

// 执行 ego-browser
async function runEgoScript() {
  return new Promise((resolve, reject) => {
    const cp = spawn('ego-browser', ['nodejs'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    cp.stdout.on('data', (d) => {
      const s = d.toString();
      stdout += s;
      process.stdout.write(s);
    });
    cp.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      process.stderr.write(s);
    });

    cp.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`ego-browser 运行失败 (退出码: ${code}):\n${stderr || stdout}`));
      }
    });

    cp.stdin.write(runnerCode);
    cp.stdin.end();
  });
}

function parseNum(s) {
  if (!s || s === '0') return 0;
  let str = s.trim().replace(/,/g, '');
  let multiplier = 1;
  if (str.includes('万')) {
    multiplier = 10000;
    str = str.replace('万', '');
  } else if (str.toLowerCase().includes('k')) {
    multiplier = 1000;
    str = str.toLowerCase().replace('k', '');
  } else if (str.toLowerCase().includes('m')) {
    multiplier = 1000000;
    str = str.toLowerCase().replace('m', '');
  }
  const val = parseFloat(str);
  return isNaN(val) ? 0 : val * multiplier;
}

const BIG_EVENT_KEYWORDS = [
  'iphone', 'apple', 'tim cook', 'john ternus', 'airpods', 'z fold', '可折叠',
  'openai', 'anthropic', 'claude', 'astra', 'deepseek', 'gpt-6', 'gpt-5', 'qwen', 'kimi',
  '纳维', '千禧年', '对齐', 'alignment', '特朗普', 'trump', '中美', '中期选举', '经济刺激',
  'fed', '美联储', 'cve', '安全漏洞', 'threat report', '威胁报告', '非法蒸馏'
];

async function main() {
  if (!printJson) {
    console.log(`[Twitter Reader] 正在启动 ego-browser (${profileId}) 抓取前 ${targetCount} 条推文...`);
  }

  try {
    await runEgoScript();
  } catch (err) {
    console.error('抓取出现异常:', err.message);
    process.exit(1);
  }

  let rawData = [];
  try {
    rawData = JSON.parse(await fs.readFile(outPath, 'utf-8'));
  } catch (err) {
    console.error(`解析抓取结果文件失败 (${outPath}):`, err.message);
    process.exit(1);
  }
  let processed = [];

  for (const t of rawData) {
    if (t.isAd) continue;
    const text = (t.text || '').trim();
    if (text.length < 10) continue;

    if (filterBig) {
      const lower = text.toLowerCase();
      if (BIG_EVENT_KEYWORDS.some(k => lower.includes(k))) continue;
    }

    const likes = parseNum(t.like);
    const retweets = parseNum(t.retweet);
    const replies = parseNum(t.reply);
    const score = likes + retweets * 3 + replies * 2;

    processed.push({
      ...t,
      parsed_likes: likes,
      parsed_retweets: retweets,
      parsed_replies: replies,
      score
    });
  }

  if (todayOnly && processed.length > 0) {
    // 获取最新推文的基准日期
    const dates = processed
      .map(p => p.time)
      .filter(Boolean)
      .map(d => d.slice(0, 10))
      .sort();
    if (dates.length > 0) {
      const latestDate = dates[dates.length - 1];
      processed = processed.filter(p => (p.time || '').startsWith(latestDate));
    }
  }

  // 按互动热度排序
  processed.sort((a, b) => b.score - a.score);

  if (printJson) {
    console.log(JSON.stringify(processed, null, 2));
    return;
  }

  console.log(`\n抓取完成！共捕获原始推文 ${rawData.length} 条，有效推文 ${processed.length} 条。`);
  console.log(`结果文件已保存至: ${outPath}\n`);

  console.log(`=== 热门精选摘要 (Top ${Math.min(topN, processed.length)}) ===\n`);
  for (let i = 0; i < Math.min(topN, processed.length); i++) {
    const t = processed[i];
    const user = t.user ? t.user.split('·')[0].trim() : '匿名';
    const textClean = t.text.replace(/\n+/g, ' ');
    const timeStr = t.time ? t.time.replace('.000Z', '').replace('T', ' ') : '未知时间';
    console.log(`[${i + 1}] 👍 ${t.like || 0} | 🔄 ${t.retweet || 0} | ${user} (${timeStr})`);
    console.log(`    ${textClean.slice(0, 140)}${textClean.length > 140 ? '...' : ''}`);
    console.log(`    🔗 ${t.link}\n`);
  }
}

main();
