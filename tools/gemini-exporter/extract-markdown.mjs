import fs from "node:fs/promises";
import path from "node:path";

// 读取传参配置
const configRaw = await fs.readFile("/tmp/gemini_md_config.json", "utf-8");
const config = JSON.parse(configRaw);

const { targetUrl, targetKeyword, exportAll, outputDir, syncToDownloads, downloadsDir } = config;

console.log("\n🚀 [Gemini MD Exporter] 正在初始化自动化浏览器任务空间...");
const task = await taskSpace("gemini-md-exporter-runtime");
const page = task.page("p1");

console.log("🌐 [Gemini MD Exporter] 正在访问: " + targetUrl);
await page.goto(targetUrl);

// 1. 等待消息流与报告卡片稳定 (长会话需要 8~10 秒完成完整流式挂载)
console.log("⏳ [Gemini MD Exporter] 等待消息流与报告卡片稳定...");
let pageState = null;
for (let i = 0; i < 25; i++) {
  await page.waitForTimeout(1000);
  pageState = await page.evaluate((kw) => {
    const btns = Array.from(document.querySelectorAll('button'));
    const canvasButtons = btns.filter(b => b.getAttribute('aria-label')?.includes('Canvas') || b.getAttribute('aria-label')?.includes('打开《') || b.textContent?.includes('在 Canvas 中打开'));
    const matchedButton = kw ? btns.some(b => b.getAttribute('aria-label')?.includes(kw) || b.textContent?.includes(kw)) : false;
    const isDeepResearch = canvasButtons.length > 0;
    const messages = document.querySelectorAll('message-content').length;
    return { isDeepResearch, matchedButton, canvasButtonsCount: canvasButtons.length, messages };
  }, targetKeyword);

  if (targetKeyword && pageState.matchedButton) {
    break;
  }
  if (pageState.isDeepResearch && i >= 8) {
    break;
  }
  if (i >= 12 && pageState.messages > 0) {
    break;
  }
}

// 核心转换函数：在浏览器端执行
async function convertDomToMarkdown(selector = "") {
  return await page.evaluate((sel) => {
    const panel = document.querySelector('deep-research-immersive-panel') || document.querySelector('immersive-panel');
    const root = (sel ? document.querySelector(sel) : null) || panel?.querySelector('#extended-response-markdown-content') || panel || document.body;
    if (!root) return null;

    function parseNode(node) {
      if (node.nodeType === 3) {
        return node.textContent;
      }
      if (node.nodeType !== 1) return '';

      const tag = node.tagName.toLowerCase();

      if (tag === 'button' || tag === 'mat-icon' || tag === 'style' || tag === 'script' || node.classList.contains('hide-from-message-actions')) {
        return '';
      }

      if (tag === 'source-footnote') {
        const sup = node.querySelector('sup');
        const idx = sup ? sup.getAttribute('data-turn-source-index') : '';
        return idx ? ` [^${idx}]` : '';
      }

      if (tag === 'web-preview') {
        const title = node.querySelector('.title, header')?.textContent?.trim();
        return `\n\n> 📊 **[交互式可视化图表/组件: ${title || '系统拓扑与数据流图'}]**\n\n`;
      }

      const childMd = Array.from(node.childNodes).map(parseNode).join('');

      switch (tag) {
        case 'h1': return `\n\n# ${childMd.trim()}\n\n`;
        case 'h2': return `\n\n## ${childMd.trim()}\n\n`;
        case 'h3': return `\n\n### ${childMd.trim()}\n\n`;
        case 'h4': return `\n\n#### ${childMd.trim()}\n\n`;
        case 'p': return `\n\n${childMd.trim()}\n\n`;
        case 'strong':
        case 'b': return `**${childMd}**`;
        case 'em':
        case 'i': return `*${childMd}*`;
        case 'code': {
          if (node.closest('pre')) return childMd;
          return `\`${childMd.trim()}\``;
        }
        case 'pre': {
          const lang = node.querySelector('code')?.className?.match(/language-([a-z0-9_-]+)/i)?.[1] || '';
          return `\n\n\`\`\`${lang}\n${node.textContent.trim()}\n\`\`\`\n\n`;
        }
        case 'blockquote': return `\n\n> ${childMd.trim().replace(/\n/g, '\n> ')}\n\n`;
        case 'ul': return `\n\n${childMd.trim()}\n\n`;
        case 'ol': return `\n\n${childMd.trim()}\n\n`;
        case 'li': {
          const isOl = node.parentElement && node.parentElement.tagName.toLowerCase() === 'ol';
          if (isOl) {
            const idx = Array.from(node.parentElement.children).indexOf(node) + 1;
            return `${idx}. ${childMd.trim()}\n`;
          }
          return `- ${childMd.trim()}\n`;
        }
        case 'table': {
          const rows = Array.from(node.querySelectorAll('tr'));
          if (rows.length === 0) return '';
          let t = '\n\n';
          rows.forEach((tr, rIdx) => {
            const cells = Array.from(tr.querySelectorAll('th, td')).map(c => c.textContent.trim().replace(/\|/g, '\\|'));
            t += `| ${cells.join(' | ')} |\n`;
            if (rIdx === 0) {
              t += `| ${cells.map(() => '---').join(' | ')} |\n`;
            }
          });
          return t + '\n\n';
        }
        case 'a': {
          const href = node.getAttribute('href');
          if (href && !href.startsWith('javascript:')) {
            const text = childMd.trim() || href;
            return `[${text}](${href})`;
          }
          return childMd;
        }
        case 'hr': return '\n\n---\n\n';
        default: return childMd;
      }
    }

    let md = parseNode(root);
    md = md.replace(/\n{3,}/g, '\n\n').trim();

    // 提取并优雅格式化文末所有参考文献与引用源
    const citations = Array.from(panel ? panel.querySelectorAll('a[href]') : document.querySelectorAll('a[href]'))
      .filter(c => c.href && c.href.startsWith('http') && !c.href.includes('google.com/app'))
      .map(a => {
        let domain = a.querySelector('[data-test-id="domain-name"], .display-name')?.textContent?.trim();
        if (!domain) {
          try { domain = new URL(a.href).hostname; } catch (e) { domain = ''; }
        }
        let subTitle = a.querySelector('[data-test-id="sub-title"], .sub-title')?.textContent?.trim();

        // 清理潜在残留的无用文字
        if (subTitle) {
          subTitle = subTitle.replace(/在新窗口中打开/g, '').replace(/Opens in new window/g, '').trim();
        }

        // 格式化为 [**域名**｜文章标题](URL)
        let formattedText = "";
        if (subTitle && subTitle !== domain) {
          formattedText = `[**${domain}**｜${subTitle}](${a.href})`;
        } else if (domain) {
          formattedText = `[**${domain}**](${a.href})`;
        } else {
          formattedText = `[${a.href}](${a.href})`;
        }

        return { href: a.href, formattedText };
      });

    const seen = new Set();
    const uniqueCitations = [];
    for (const c of citations) {
      if (!seen.has(c.href)) {
        seen.add(c.href);
        uniqueCitations.push(c);
      }
    }

    if (uniqueCitations.length > 0) {
      md += '\n\n---\n\n## 📚 参考文献与引用源\n\n';
      uniqueCitations.forEach((c, idx) => {
        md += `${idx + 1}. ${c.formattedText}\n`;
      });
    }

    const titleEl = panel?.querySelector('h2.title-text') || panel?.querySelector('.title-text') || panel?.querySelector('h1') || document.querySelector('h1');
    const title = titleEl ? titleEl.textContent.trim() : document.title?.replace(" - Google Gemini", "").trim();

    return { title, markdown: md, citationsCount: uniqueCitations.length };
  }, selector);
}

// ==============================================================================
// 分支 A: Deep Research 深度研报模式
// ==============================================================================
if (pageState.isDeepResearch) {
  console.log("📑 [Gemini MD Exporter] 检测到模式: Deep Research 深度研报 (Canvas)");

  const reportsList = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const targets = btns.filter(b => b.getAttribute('aria-label')?.includes('Canvas') || b.getAttribute('aria-label')?.includes('打开《'));
    return targets.map((b, i) => {
      const label = b.getAttribute('aria-label') || "";
      const match = label.match(/《([^》]+)》/) || label.match(/打开“([^”]+)”/) || [null, label];
      return {
        index: i,
        label,
        title: match[1] || label || ("报告_" + (i + 1))
      };
    });
  });

  const uniqueReports = [];
  const seenTitles = new Set();
  for (const r of reportsList) {
    if (!seenTitles.has(r.title)) {
      seenTitles.add(r.title);
      uniqueReports.push(r);
    }
  }

  console.log("📋 [Gemini MD Exporter] 发现可用研报列表 (" + uniqueReports.length + " 份独立报告):");
  uniqueReports.forEach((r, idx) => {
    console.log(`   [${idx + 1}] ${r.title}`);
  });

  let toExport = [];
  if (exportAll) {
    toExport = uniqueReports;
  } else if (targetKeyword) {
    toExport = uniqueReports.filter(r => r.title.includes(targetKeyword) || r.label.includes(targetKeyword));
    if (toExport.length === 0) {
      console.warn(`⚠ 未匹配到关键词 "${targetKeyword}"，将导出第 1 份报告。`);
      toExport = [uniqueReports[0]];
    }
  } else {
    toExport = [uniqueReports[0]];
  }

  for (const rep of toExport) {
    console.log("\n------------------------------------------------------------");
    console.log(`⏳ [Gemini MD Exporter] 正在提取报告: 《${rep.title}》...`);

    await page.evaluate((btnIndex) => {
      const btns = Array.from(document.querySelectorAll('button'));
      const targets = btns.filter(b => b.getAttribute('aria-label')?.includes('Canvas') || b.getAttribute('aria-label')?.includes('打开《'));
      if (targets[btnIndex]) {
        targets[btnIndex].scrollIntoView({ behavior: 'instant', block: 'center' });
        targets[btnIndex].click();
      }
    }, rep.index);

    // 等待面板激活
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(1000);
      const isReady = await page.evaluate(() => {
        const p = document.querySelector('deep-research-immersive-panel') || document.querySelector('immersive-panel');
        const t = p?.querySelector('h2.title-text')?.textContent?.trim();
        return t && t !== 'Research Report';
      });
      if (isReady) break;
    }

    // 滚动到底部触发加载
    await page.evaluate(async () => {
      const sc = document.querySelector('[data-test-id="scroll-container"]') || document.querySelector('.container.cdkscrollable');
      if (sc) {
        sc.scrollTop = sc.scrollHeight;
        await new Promise(r => setTimeout(r, 600));
        sc.scrollTop = 0;
      }
    });
    await page.waitForTimeout(1500);

    const mdData = await convertDomToMarkdown();
    if (!mdData) {
      console.error("❌ 提取 Markdown 失败。");
      continue;
    }

    const finalMdContent = `# ${mdData.title}\n\n> 导出自 Google Gemini 深度研究 (Deep Research)\n> 导出时间: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}\n\n${mdData.markdown}\n`;

    const outFilename = `${mdData.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
    const targetFile = path.resolve(outputDir, outFilename);
    await fs.writeFile(targetFile, finalMdContent, "utf-8");

    if (syncToDownloads) {
      try {
        await fs.writeFile(path.resolve(downloadsDir, outFilename), finalMdContent, "utf-8");
      } catch (e) {}
    }

    console.log(`🎉 成功生成 Markdown 文档: ${targetFile}`);
    console.log(`   - 字符数: ${finalMdContent.length}`);
    console.log(`   - 参考文献条数: ${mdData.citationsCount}`);
  }

} else {
  // ==============================================================================
  // 分支 B: 普通 Gemini 会话模式
  // ==============================================================================
  console.log("💬 [Gemini MD Exporter] 检测到模式: 普通 Gemini 对话");

  await page.evaluate(async () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
  });
  await page.waitForTimeout(2000);

  const turnsData = await page.evaluate(() => {
    const title = document.title?.replace(" - Google Gemini", "").trim() || "Gemini 对话";
    const modelResponses = Array.from(document.querySelectorAll('model-response'));

    const turns = modelResponses.map((mr, i) => {
      const container = mr.closest('.conversation-container') || mr.parentElement;
      const queryEl = container?.querySelector('user-query-item, .user-query-container');
      const queryText = queryEl ? queryEl.textContent.trim().replace(/^你说\s*/, '').replace(/(\r\n|\n|\r)+/gm, " ") : `提问 ${i + 1}`;
      const contentEl = mr.querySelector('message-content') || mr;
      return {
        index: i,
        queryText,
        html: contentEl.innerHTML
      };
    });

    return { title, turns };
  });

  let fullMd = `# ${turnsData.title}\n\n> 导出自 Google Gemini 会话\n\n---\n\n`;

  for (const t of turnsData.turns) {
    fullMd += `## 👤 用户提问 ${t.index + 1}\n\n${t.queryText}\n\n`;
    const turnMd = await convertDomToMarkdown(`model-response:nth-of-type(${t.index + 1}) message-content`);
    fullMd += `## 🤖 Gemini 回答\n\n${turnMd?.markdown || t.html}\n\n---\n\n`;
  }

  const outFilename = `${turnsData.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
  const targetFile = path.resolve(outputDir, outFilename);
  await fs.writeFile(targetFile, fullMd, "utf-8");

  if (syncToDownloads) {
    try {
      await fs.writeFile(path.resolve(downloadsDir, outFilename), fullMd, "utf-8");
    } catch (e) {}
  }

  console.log(`🎉 成功生成对话 Markdown 文档: ${targetFile}`);
  console.log(`   - 文档总体积: ${Math.round(fullMd.length / 1024)} KB`);
}
